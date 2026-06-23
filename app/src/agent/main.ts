import { buildModel, firstName, type DashModel } from '../data/Dashboard';

// ── helpers ───────────────────────────────────────────────────────────────
const rub = (n: number | null | undefined) =>
  n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(2).replace('.', ',') + ' млн ₽' : Math.round(n).toLocaleString('ru-RU') + ' ₽';
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
const SCENE = import.meta.env.BASE_URL + 'assets/agent/desk.png';

// ── вопросы → ответы из реальных данных 1С ──────────────────────────────────
type Q = { q: string; a: (m: DashModel) => string };
const QUESTIONS: Q[] = [
  {
    q: 'Сколько вернул за прошлый месяц?',
    a: (m) => { const r = m.reactivation?.lastMonth; return r && r.revenue > 0
      ? `За ${r.label} я вернул ${r.clients} ${plural(r.clients, 'клиента', 'клиента', 'клиентов')} → +${rub(r.revenue)} (${r.orders} зак.). 🐾`
      : 'По возврату за прошлый месяц данных пока нет.'; },
  },
  {
    q: 'Сколько сейчас спящих?',
    a: (m) => m.dormant ? `Сейчас молчат ${m.dormant} ${plural(m.dormant, 'клиент', 'клиента', 'клиентов')} — это деньги рядом. Могу поставить обзвон по крупным.` : 'Спящих почти нет — красота!',
  },
  {
    q: 'Что уже в этом месяце?',
    a: (m) => { const r = m.reactivation?.thisMonth; return r && r.revenue > 0
      ? `В ${r.label} уже вернул ${r.clients} ${plural(r.clients, 'клиента', 'клиента', 'клиентов')} на +${rub(r.revenue)}. Идём по плану 💪`
      : 'Месяц только начался — раскачиваюсь.'; },
  },
  {
    q: 'Какой долг по базе?',
    a: (m) => m.debts?.real && m.debts.total ? `Дебиторка: ${rub(m.debts.total)}${m.debts.count ? ` у ${m.debts.count} ${plural(m.debts.count, 'клиента', 'клиентов', 'клиентов')}` : ''}. При обзвоне заодно напомню про оплату.` : 'Долги сейчас в данных не вижу.',
  },
  {
    q: 'Сколько всего клиентов?',
    a: (m) => m.clients?.total != null ? `В базе ${m.clients.total.toLocaleString('ru-RU')} контрагентов. По каждому знаю ритм заказов.` : 'База ещё подгружается.',
  },
  {
    q: 'Кто лучший менеджер?',
    a: (m) => { const h = (m.managers?.list || []).filter((x) => !/админ|систем/i.test(x.name)); if (!h.length) return 'Данных по менеджерам нет.'; const lead = [...h].sort((a, b) => b.revenue - a.revenue)[0]; return `Лидер по выручке — ${firstName(lead.name)} (${rub(lead.revenue)}). Достойно!`; },
  },
  {
    q: 'Что мне сделать сегодня?',
    a: (m) => { const t = m.tasks?.today?.[0]; return t ? `${t.title}. ${t.action || ''}`.trim() : 'На сегодня всё под контролем 👍'; },
  },
];

let model: DashModel | null = null;
let busy = false;
let streak = Number(localStorage.getItem('stepanych.asks') || 0);

const app = document.getElementById('app')!;

function shell() {
  app.innerHTML = `
  <style>
    *{box-sizing:border-box} body{margin:0}
    #app{min-height:100dvh;display:flex;justify-content:center;background:#0d0a06;
      font-family:'Segoe UI',system-ui,sans-serif;color:#f4efe6}
    .wrap{width:100%;max-width:480px;min-height:100dvh;display:flex;flex-direction:column;
      padding:10px 10px calc(10px + env(safe-area-inset-bottom))}
    .hd{display:flex;align-items:center;justify-content:space-between;padding:4px 4px 8px}
    .hd b{font-size:15px}.hd small{display:block;color:#c9a06a;font-size:11px}
    .hd .who{display:flex;align-items:center;gap:8px}.hd .em{font-size:20px}
    .hd .ask{font-size:13px;background:#1d160d;border:1px solid #4a3a26;border-radius:20px;padding:4px 10px;color:#ffce8a}
    .stage{position:relative;width:100%;aspect-ratio:1122/1402;border-radius:14px;overflow:hidden;
      background:#1a1208 center/cover no-repeat;box-shadow:0 12px 30px #000a;
      animation:breathe 5s ease-in-out infinite}
    @keyframes breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
    /* экран ноутбука «работает» */
    .screen{position:absolute;left:5%;top:64.5%;width:27%;height:18%;transform:rotate(-5deg);
      mix-blend-mode:screen;pointer-events:none;overflow:hidden;border-radius:4px}
    .screen .glow{position:absolute;inset:-20%;background:radial-gradient(circle,rgba(255,224,140,.55),rgba(255,200,90,0) 70%);
      animation:flick 2.4s ease-in-out infinite}
    .screen .ln{position:absolute;left:0;right:0;height:14%;background:linear-gradient(90deg,#ffe88c00,#ffe88c88,#ffe88c00);
      animation:scan 2.2s linear infinite}
    .stage.search .screen .glow{animation:flick .25s steps(2) infinite;opacity:1}
    .stage.search .screen .ln{animation:scan .5s linear infinite}
    @keyframes flick{0%,100%{opacity:.5}50%{opacity:.9}}
    @keyframes scan{from{top:-15%}to{top:100%}}
    /* бумаги — вспышка при поиске */
    .papers{position:absolute;left:69%;top:72%;width:28%;height:18%;pointer-events:none;
      background:rgba(255,255,255,.5);opacity:0;mix-blend-mode:screen;border-radius:4px}
    .stage.search .papers{animation:flash .6s ease-in-out infinite}
    @keyframes flash{0%,100%{opacity:0}50%{opacity:.5}}
    /* облачко-реплика */
    .bubble{position:absolute;left:50%;top:6%;transform:translateX(-50%);width:88%;
      background:#fbf3e2;color:#241a10;border-radius:14px;padding:12px 14px;font-size:15px;line-height:1.34;
      box-shadow:0 8px 22px #0008;animation:pop .3s ease both;text-align:center;min-height:54px;
      display:flex;align-items:center;justify-content:center}
    .bubble:after{content:'';position:absolute;bottom:-11px;left:50%;transform:translateX(-50%);
      border:8px solid transparent;border-top-color:#fbf3e2;border-bottom:0}
    @keyframes pop{from{opacity:0;transform:translateX(-50%) translateY(8px) scale(.97)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}
    .spark{position:absolute;font-size:22px;pointer-events:none;animation:fly 1s ease-out forwards}
    @keyframes fly{from{opacity:1;transform:translateY(0) scale(.6)}to{opacity:0;transform:translateY(-70px) scale(1.2)}}
    .chips{display:flex;flex-wrap:wrap;gap:8px;padding:12px 4px 4px}
    .chips button{cursor:pointer;border:1px solid #6b513a;background:#2a2014;color:#f0e2cc;
      border-radius:20px;padding:9px 13px;font:inherit;font-size:13px;font-weight:600;transition:filter .12s,transform .06s}
    .chips button:hover{filter:brightness(1.12)} .chips button:active{transform:translateY(1px)}
    .chips button:disabled{opacity:.45;cursor:default}
    .ft{display:flex;justify-content:space-between;margin-top:auto;padding-top:10px;font-size:12px;color:#8a7a64}
    .ft a{color:#c9a06a;text-decoration:none}
  </style>
  <div class="wrap">
    <div class="hd">
      <div class="who"><span class="em">🐶</span><div><b>Степаныч</b><small>ИИ-агент · возврат клиентов</small></div></div>
      <div class="ask" id="ask">💬 ${streak}</div>
    </div>
    <div class="stage" id="stage" style="background-image:url('${SCENE}')">
      <div class="bubble" id="bubble">Загружаю данные…</div>
      <div class="screen"><div class="glow"></div><div class="ln"></div></div>
      <div class="papers"></div>
    </div>
    <div class="chips" id="chips"></div>
    <div class="ft"><span>Спроси — посмотрю в данных 🐾</span><a href="./index.html">← в офис</a></div>
  </div>`;
}

const stage = () => document.getElementById('stage')!;
const bubble = () => document.getElementById('bubble')!;

function setBubble(text: string) {
  const b = bubble();
  b.textContent = text;
  b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
}

function sparkle() {
  const s = stage();
  for (let i = 0; i < 6; i++) {
    const el = document.createElement('div');
    el.className = 'spark'; el.textContent = ['✨', '💛', '🪙'][i % 3];
    el.style.left = 10 + Math.random() * 35 + '%'; el.style.top = 62 + Math.random() * 10 + '%';
    el.style.animationDelay = Math.random() * 0.2 + 's';
    s.appendChild(el); setTimeout(() => el.remove(), 1100);
  }
}

let dotsTimer: number | undefined;
function ask(item: Q) {
  if (busy || !model) return;
  busy = true;
  stage().classList.add('search');
  document.querySelectorAll<HTMLButtonElement>('#chips button').forEach((b) => (b.disabled = true));
  // «копаюсь в данных…»
  let n = 0;
  setBubble('🔍 Секунду, посмотрю в данных');
  dotsTimer = window.setInterval(() => { n = (n + 1) % 4; setBubble('🔍 Секунду, посмотрю в данных' + '.'.repeat(n)); }, 350);
  const wait = 1500 + Math.random() * 700;
  window.setTimeout(() => {
    clearInterval(dotsTimer);
    stage().classList.remove('search');
    setBubble(item.a(model!));
    sparkle();
    streak += 1; localStorage.setItem('stepanych.asks', String(streak));
    document.getElementById('ask')!.textContent = '💬 ' + streak;
    document.querySelectorAll<HTMLButtonElement>('#chips button').forEach((b) => (b.disabled = false));
    busy = false;
  }, wait);
}

function renderChips() {
  const c = document.getElementById('chips')!;
  c.innerHTML = '';
  QUESTIONS.forEach((item) => {
    const b = document.createElement('button');
    b.textContent = item.q;
    b.onclick = () => ask(item);
    c.appendChild(b);
  });
}

async function boot() {
  shell();
  try {
    const r = await fetch(location.origin + import.meta.env.BASE_URL + 'assets/data/real.json', { cache: 'no-store' });
    model = buildModel(await r.json());
  } catch { model = buildModel({}); }
  renderChips();
  setBubble('Привет! Я Степаныч 🐾 Спроси меня про клиентов и возврат — посмотрю в данных. 👇');
}

boot();
