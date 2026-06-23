import { buildModel, type DashModel } from '../data/Dashboard';

// ── helpers ───────────────────────────────────────────────────────────────
const rub = (n: number | null | undefined) =>
  n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(2).replace('.', ',') + ' млн ₽' : Math.round(n).toLocaleString('ru-RU') + ' ₽';
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
const today = () => new Date().toISOString().slice(0, 10);
const ls = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem('stepanych.' + k); return v == null ? d : JSON.parse(v) as T; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem('stepanych.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

const SPRITE = import.meta.env.BASE_URL + 'assets/tilesets/lz_dog_wake.png';

type Sugg = { id: string; type: 'win' | 'task'; text: string; detail: string; action: string };

// ── данные → предложения Степаныча (тема: возврат «спящих» клиентов) ───────
function suggestions(m: DashModel): Sugg[] {
  const out: Sugg[] = [];
  const r = m.reactivation;
  if (r?.lastMonth && r.lastMonth.revenue > 0) {
    const x = r.lastMonth;
    out.push({
      id: 'win-last', type: 'win',
      text: `За ${x.label} я вернул ${x.clients} ${plural(x.clients, 'клиента', 'клиента', 'клиентов')} → +${rub(x.revenue)}! 🎉 Погнали возвращать дальше?`,
      detail: `${x.orders} заказов от вернувшихся. Считаю по закрытым задачам реактивации в CRM — цифра честная.`,
      action: 'Погнали! 🐾',
    });
  }
  if (m.dormant && m.dormant > 0) {
    out.push({
      id: 'dormant', type: 'task',
      text: `Сейчас «спящих» клиентов: ${m.dormant}. Запустить обзвон по самым крупным — это деньги, что лежат рядом.`,
      detail: 'Спящие — те, кто раньше заказывал регулярно, но замолчал. Возврат старого клиента дешевле привлечения нового в разы.',
      action: 'Беру в работу',
    });
  }
  if (r?.thisMonth && r.thisMonth.revenue > 0) {
    const x = r.thisMonth;
    out.push({
      id: 'win-this', type: 'win',
      text: `В этом месяце (${x.label}) уже вернул ${x.clients} ${plural(x.clients, 'клиента', 'клиента', 'клиентов')} на +${rub(x.revenue)}. Добьём ещё?`,
      detail: 'Это нарастающим итогом с начала месяца. Каждый возвращённый клиент — плюс к этой сумме.',
      action: 'Добьём! 💪',
    });
  }
  if (m.debts?.real && m.debts.total) {
    out.push({
      id: 'debt-soft', type: 'task',
      text: `Кстати, по базе висит долг ${rub(m.debts.total)}${m.debts.count ? ` у ${m.debts.count} клиентов` : ''}. Часть из них — мои «спящие». Напомнить им сразу при возврате?`,
      detail: 'При обзвоне на возврат заодно мягко напомнить про оплату — два дела за один звонок.',
      action: 'Хорошая мысль',
    });
  }
  return out;
}

// ── состояние ───────────────────────────────────────────────────────────────
let model: DashModel | null = null;
let queue: Sugg[] = [];
let idx = 0;
let mood = ls.get<number>('mood', 58);

function bumpStreak() {
  const last = ls.get<string>('lastActive', '');
  const t = today();
  if (last === t) return ls.get<number>('streak', 1);
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let s = ls.get<number>('streak', 0);
  s = last === y ? s + 1 : 1;
  ls.set('streak', s);
  ls.set('lastActive', t);
  return s;
}
const doneToday = (): string[] => {
  const d = ls.get<{ date: string; ids: string[] }>('done', { date: '', ids: [] });
  return d.date === today() ? d.ids : [];
};
const markDone = (id: string) => {
  const ids = new Set(doneToday()); ids.add(id);
  ls.set('done', { date: today(), ids: [...ids] });
};

// ── рендер ────────────────────────────────────────────────────────────────
const app = document.getElementById('app')!;

function shell() {
  app.innerHTML = `
  <style>
    :root{color-scheme:dark}
    *{box-sizing:border-box}
    body{margin:0}
    #app{min-height:100dvh;display:flex;justify-content:center;
      background:radial-gradient(120% 80% at 50% 0%,#2a2014,#171009 70%,#0e0a06);
      font-family:'Segoe UI',system-ui,sans-serif;color:#f4efe6}
    .wrap{width:100%;max-width:440px;min-height:100dvh;display:flex;flex-direction:column;
      padding:14px 14px calc(14px + env(safe-area-inset-bottom));position:relative}
    .hd{display:flex;align-items:center;justify-content:space-between;gap:10px}
    .who{display:flex;align-items:center;gap:8px}
    .who .em{font-size:22px}
    .who b{font-size:15px;letter-spacing:.2px}
    .who small{display:block;color:#c9a06a;font-size:11px}
    .streak{font-size:13px;background:#2a2014;border:1px solid #4a3a26;border-radius:20px;padding:4px 10px;color:#ffce8a}
    .mood{height:9px;border-radius:6px;background:#2a2014;border:1px solid #4a3a26;margin-top:10px;overflow:hidden}
    .mood i{display:block;height:100%;background:linear-gradient(90deg,#e7ad53,#5ec46a);transition:width .5s ease}
    .moodlbl{font-size:10px;color:#9c8a72;margin-top:4px}
    .stage{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px;padding:14px 0}
    .bubble{position:relative;background:#fbf3e2;color:#241a10;border-radius:16px;padding:14px 16px;
      font-size:15px;line-height:1.35;max-width:380px;box-shadow:0 10px 26px #0007;animation:pop .35s ease both}
    .bubble:after{content:'';position:absolute;bottom:-12px;left:50%;transform:translateX(-50%);
      border:8px solid transparent;border-top-color:#fbf3e2;border-bottom:0}
    .bubble .det{margin-top:8px;font-size:12.5px;color:#5a4733;display:none}
    .bubble.show .det{display:block}
    @keyframes pop{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:none}}
    .dogwrap{position:relative;height:230px;display:flex;align-items:flex-end;justify-content:center}
    .dog{width:220px;height:220px;background-image:var(--spr);background-repeat:no-repeat;
      background-size:880px 220px;image-rendering:pixelated;background-position:-440px 0;
      animation:wag .7s steps(1) infinite}
    .dog.happy{animation:trot .16s steps(1) infinite}
    .dogwrap.hop{animation:hop .4s ease}
    @keyframes wag{0%,49%{background-position:-440px 0}50%,100%{background-position:-660px 0}}
    @keyframes trot{0%,49%{background-position:0 0}50%,100%{background-position:-220px 0}}
    @keyframes hop{0%,100%{transform:translateY(0)}30%{transform:translateY(-26px)}60%{transform:translateY(-6px)}}
    .shadow{position:absolute;bottom:6px;left:50%;transform:translateX(-50%);width:150px;height:18px;
      background:radial-gradient(closest-side,#0008,transparent);border-radius:50%}
    .acts{display:flex;flex-direction:column;gap:8px;margin-top:6px}
    .acts .row{display:flex;gap:8px}
    button{cursor:pointer;border:1px solid #6b513a;border-radius:12px;padding:13px 12px;font:inherit;font-weight:700;
      font-size:14px;color:#241405;flex:1;transition:filter .12s,transform .06s}
    button:active{transform:translateY(1px)}
    .b-do{background:linear-gradient(180deg,#7fe0a0,#46b673);border-color:#3a8a58}
    .b-det{background:#2a2014;color:#e7d3a8;border-color:#4a3a26}
    .b-later{background:#2a2014;color:#c9b8a4;border-color:#4a3a26}
    .ft{display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:12px;color:#8a7a64}
    .ft a{color:#c9a06a;text-decoration:none}
    .heart{position:absolute;font-size:24px;pointer-events:none;animation:fly 1.1s ease-out forwards}
    @keyframes fly{from{opacity:1;transform:translateY(0) scale(.6)}to{opacity:0;transform:translateY(-120px) scale(1.3)}}
  </style>
  <div class="wrap">
    <div class="hd">
      <div class="who"><span class="em">🐶</span><div><b>Степаныч</b><small>ИИ-агент · возврат клиентов</small></div></div>
      <div class="streak" id="streak">🔥 0</div>
    </div>
    <div class="mood"><i id="moodbar" style="width:${mood}%"></i></div>
    <div class="moodlbl" id="moodlbl">настроение</div>
    <div class="stage">
      <div class="bubble" id="bubble"><span id="btext">…</span><div class="det" id="bdet"></div></div>
      <div class="dogwrap" id="dogwrap"><div class="dog" id="dog" style="--spr:url('${SPRITE}')"></div><div class="shadow"></div></div>
    </div>
    <div class="acts" id="acts"></div>
    <div class="ft"><span id="hint">Степаныч готовит подсказки…</span><a href="./index.html">← в офис</a></div>
  </div>`;
  document.getElementById('streak')!.textContent = '🔥 ' + ls.get<number>('streak', 0);
}

function setMood(v: number) {
  mood = Math.max(0, Math.min(100, v));
  ls.set('mood', mood);
  (document.getElementById('moodbar') as HTMLElement).style.width = mood + '%';
  const lbl = document.getElementById('moodlbl')!;
  lbl.textContent = mood > 75 ? 'счастлив 🐾' : mood > 45 ? 'в тонусе' : mood > 20 ? 'скучает' : 'засыпает 😴';
}

function happy() {
  const dog = document.getElementById('dog')!, wrap = document.getElementById('dogwrap')!;
  dog.classList.add('happy'); wrap.classList.add('hop');
  for (let i = 0; i < 6; i++) {
    const h = document.createElement('div');
    h.className = 'heart'; h.textContent = ['💛', '🪙', '✨'][i % 3];
    h.style.left = 40 + Math.random() * 60 + '%'; h.style.bottom = '120px';
    h.style.animationDelay = Math.random() * 0.2 + 's';
    document.getElementById('dogwrap')!.appendChild(h);
    setTimeout(() => h.remove(), 1300);
  }
  setTimeout(() => { dog.classList.remove('happy'); wrap.classList.remove('hop'); }, 1100);
}

function render() {
  const bubble = document.getElementById('bubble')!;
  const btext = document.getElementById('btext')!;
  const bdet = document.getElementById('bdet')!;
  const acts = document.getElementById('acts')!;
  const hint = document.getElementById('hint')!;
  bubble.classList.remove('show');

  const left = queue.filter((s) => !doneToday().includes(s.id));
  if (idx >= left.length) {
    btext.textContent = left.length === 0 && queue.length > 0
      ? 'На сегодня всё разобрали — ты ⭐. Возвращайся завтра, принесу новые подсказки! 🐾'
      : 'Пока всё спокойно. Загляну попозже с новыми идеями 🐾';
    acts.innerHTML = '';
    hint.textContent = 'Подсказки на сегодня закрыты';
    return;
  }
  const s = left[idx];
  btext.textContent = s.text;
  bdet.textContent = s.detail;
  bubble.classList.add('pop');
  hint.textContent = `Подсказка ${idx + 1} из ${left.length}`;
  acts.innerHTML = `
    <div class="row"><button class="b-do" id="do">${s.action}</button></div>
    <div class="row"><button class="b-det" id="det">👀 Детали</button><button class="b-later" id="later">😴 Позже</button></div>`;
  document.getElementById('do')!.onclick = () => {
    markDone(s.id);
    setMood(mood + 13);
    const st = bumpStreak();
    document.getElementById('streak')!.textContent = '🔥 ' + st;
    happy();
    btext.textContent = s.type === 'win' ? 'Гав! Так держать 🐾' : 'Принял! Уже ставлю задачи менеджерам 🐾';
    acts.innerHTML = '';
    setTimeout(() => { idx = 0; render(); }, 1300);
  };
  document.getElementById('det')!.onclick = () => bubble.classList.toggle('show');
  document.getElementById('later')!.onclick = () => {
    setMood(mood - 6);
    idx++;
    render();
  };
}

// ── загрузка данных ─────────────────────────────────────────────────────────
async function boot() {
  shell();
  setMood(mood);
  try {
    const r = await fetch(location.origin + import.meta.env.BASE_URL + 'assets/data/real.json', { cache: 'no-store' });
    model = buildModel(await r.json());
  } catch {
    model = buildModel({});
  }
  queue = model ? suggestions(model) : [];
  if (!queue.length) {
    queue = [{ id: 'idle', type: 'win', text: 'Привет! Я Степаныч, возвращаю клиентов. Данные подтянул — пока новых спящих нет, красота. Загляни позже 🐾', detail: '', action: 'Понял!' }];
  }
  render();
}

boot();
