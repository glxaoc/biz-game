// Общий «shell» карточки агента: дизайн-токены + заземлённая сцена + чат на данных + виджеты.
// Все карточки агентов строятся из ОДНОГО этого модуля → единый мир (Этап 1 редизайна).
import { buildModel, firstName, type DashModel } from '../data/Dashboard';

export const rub = (n: number | null | undefined) =>
  n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(2).replace('.', ',') + ' млн ₽' : Math.round(n).toLocaleString('ru-RU') + ' ₽';
export const num = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('ru-RU'));

// ── мини-набор SVG-иконок (вместо эмодзи) ───────────────────────────────────
const ICONS: Record<string, string> = {
  paw: '<circle cx="6" cy="11" r="2.2"/><circle cx="11" cy="8" r="2.2"/><circle cx="17" cy="9" r="2.2"/><circle cx="20" cy="14" r="1.8"/><path d="M7 19c0-3 3-5 6-5s6 2 6 5c0 2-2 3-4 3h-4c-2 0-4-1-4-3z"/>',
  chat: '<path d="M4 5h16v11H9l-4 3v-3H4z"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/>',
  send: '<path d="M4 12l16-7-7 16-2-7z"/>',
  chart: '<path d="M5 19V9M10 19V5M15 19v-6M20 19v-9"/>',
  users: '<circle cx="9" cy="9" r="3"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5"/><path d="M16 7a3 3 0 010 6M22 19c0-2-2-4-4-4"/>',
  moon: '<path d="M19 14a7 7 0 11-9-9 6 6 0 009 9z"/>',
  coin: '<circle cx="12" cy="12" r="7"/><path d="M12 8v8M9 10h4a2 2 0 010 4H9"/>',
  phone: '<path d="M6 4l3 1 1 4-2 1a9 9 0 005 5l1-2 4 1 1 3a2 2 0 01-2 2A14 14 0 014 6a2 2 0 012-2z"/>',
  ghost: '<path d="M6 20V11a6 6 0 1112 0v9l-2-1.5L14 20l-2-1.5L10 20l-2-1.5z"/><circle cx="9.5" cy="10.5" r=".9" fill="currentColor"/><circle cx="14.5" cy="10.5" r=".9" fill="currentColor"/>',
  scale: '<path d="M12 4v16M6 8h12M6 8l-2 5h4zM18 8l-2 5h4z"/>',
  arrowL: '<path d="M14 6l-6 6 6 6"/>', arrowR: '<path d="M10 6l6 6-6 6"/>',
};
export const icon = (name: string, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

const DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'] as const;
const DIR_RU: Record<string, string> = {
  'south': 'на нас', 'south-east': '↘', 'east': 'вправо', 'north-east': '↗',
  'north': 'от нас', 'north-west': '↖', 'west': 'влево', 'south-west': '↙',
};

export type Stat = { k: string; v: string; tone?: 'good' | 'warn' };
export type AgentConfig = {
  id: string;           // gennady | stepanych
  name: string;
  role: string;
  iconName: string;     // иконка-аватар
  assets: string;       // 'assets/agent/gennady/'
  idleFrames: number;
  presets: string[];
  stats: (m: DashModel) => Stat[];
  skills: { icon: string; label: string }[];
  next: { href: string; label: string };
};

const API = location.origin + import.meta.env.BASE_URL + 'api/agent-chat';
const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function AgentCard(cfg: AgentConfig) {
  const B = import.meta.env.BASE_URL + cfg.assets;
  const TILE = import.meta.env.BASE_URL + 'assets/tilesets/';
  let dirIdx = 0, auto = true, idleFrame = 0, busy = false;
  let model: DashModel | null = null;

  const app = document.getElementById('app')!;
  app.innerHTML = `
  <style>
    :root{
      --bg-0:#0c0805;--bg-1:#140d07;--panel:#1d160d;--panel-line:#3a2c1d;
      --ink:#f4efe6;--ink-dim:#b9a98a;--ink-mut:#8a7a64;
      --good:#8fe6a8;--warn:#ffb27a;--bad:#e0805a;--paper:#fbf3e2;--paper-ink:#241a10;
      --accent:#e7ad53;--accent-2:#7fe0a0;--accent-ink:#10240f;
      --r-lg:16px;--r-md:13px;--r-sm:10px;--tap:44px;--sp:8px;
    }
    [data-agent="gennady"]{--accent:#b388ff;--accent-2:#8fe6a8;--accent-ink:#12091f;
      --bg-0:#0a070d;--bg-1:#120d16;--panel:#1b1424;--panel-line:#352a48;}
    *{box-sizing:border-box} body{margin:0}
    .ic{width:18px;height:18px;flex:0 0 auto;vertical-align:-3px}
    #app{min-height:100dvh;display:flex;justify-content:center;color:var(--ink);
      background:radial-gradient(120% 80% at 50% 0%,var(--bg-1),var(--bg-0) 72%);
      font-family:ui-rounded,'Segoe UI Rounded',system-ui,sans-serif;
      font-variant-numeric:tabular-nums}
    .wrap{width:100%;max-width:460px;min-height:100dvh;display:flex;flex-direction:column;
      padding:14px 14px calc(14px + env(safe-area-inset-bottom));gap:var(--sp)}
    .nav{display:flex;justify-content:space-between;align-items:center}
    .nav a{display:inline-flex;align-items:center;gap:5px;min-height:36px;padding:6px 10px;
      color:var(--accent);text-decoration:none;font-size:13px;font-weight:700;border-radius:var(--r-sm)}
    .nav a:hover{background:#ffffff0c}
    .hd{display:flex;align-items:center;gap:10px}
    .hd .av{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:11px;
      background:color-mix(in srgb,var(--accent) 22%,transparent);color:var(--accent);border:1px solid var(--panel-line)}
    .hd .av .ic{width:24px;height:24px}
    .hd h1{font-size:21px;margin:0;line-height:1.1}
    .hd .role{font-size:12.5px;color:var(--accent);font-weight:600;display:flex;align-items:center;gap:5px}
    /* сцена-комната */
    .stage{position:relative;height:280px;border-radius:var(--r-lg);overflow:hidden;border:1px solid var(--panel-line);background:var(--bg-0)}
    .stage .wall{position:absolute;left:0;right:0;top:0;height:62%;background:url('${TILE}lz_wall.png') repeat;background-size:56px auto;image-rendering:pixelated}
    .stage .floor{position:absolute;left:0;right:0;top:62%;bottom:0;background:url('${TILE}lz_floor.png') repeat;background-size:56px auto;image-rendering:pixelated}
    .stage .vin{position:absolute;inset:0;box-shadow:inset 0 0 90px 28px #00000055;pointer-events:none}
    .shadow{position:absolute;left:50%;top:77%;width:128px;height:20px;transform:translateX(-50%);
      background:radial-gradient(closest-side,#000a,transparent);border-radius:50%;filter:blur(1px)}
    #sprite{position:absolute;left:50%;top:50%;width:196px;height:196px;transform:translate(-50%,-57%);
      image-rendering:pixelated;transform-origin:bottom center}
    .stage.live #sprite{animation:breathe 3.6s ease-in-out infinite}
    .stage.think #sprite{animation:nod .5s ease-in-out infinite}
    @keyframes breathe{0%,100%{transform:translate(-50%,-57%) scaleY(1)}50%{transform:translate(-50%,-57%) scaleY(.985)}}
    @keyframes nod{0%,100%{transform:translate(-50%,-57%)}50%{transform:translate(-50%,-61%)}}
    .think-b{position:absolute;top:12px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:6px;
      background:var(--paper);color:var(--paper-ink);border-radius:12px;padding:7px 12px;font-size:13px;max-width:88%}
    .stage.think .think-b{display:inline-flex}
    .dirlbl{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);font-size:11px;color:var(--ink-mut);background:#0006;border-radius:20px;padding:3px 10px}
    .ctrl{display:flex;justify-content:center;gap:8px}
    .btn{min-height:var(--tap);cursor:pointer;border:1px solid var(--panel-line);background:var(--panel);color:var(--ink);
      border-radius:var(--r-sm);font:inherit;font-weight:700;font-size:14px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 14px;
      transition:transform .08s cubic-bezier(.34,1.56,.64,1),filter .12s}
    .btn:hover{filter:brightness(1.12)} .btn:active{transform:scale(.94)} .btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
    .btn .ic{width:18px;height:18px}
    .btn.acc{background:var(--accent);color:var(--accent-ink);border-color:transparent}
    .btn.on{background:var(--accent);color:var(--accent-ink);border-color:transparent;font-size:13px}
    .panel{background:var(--panel);border:1px solid var(--panel-line);border-radius:var(--r-md);padding:14px}
    .panel h2{font-size:12px;margin:0 0 10px;color:var(--accent);text-transform:uppercase;letter-spacing:.6px;display:flex;align-items:center;gap:6px}
    .kv{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #ffffff10;font-size:14px}
    .kv:last-child{border-bottom:none} .kv .k{color:var(--ink-dim)} .kv .v{font-weight:700;text-align:right}
    .kv .v.good{color:var(--good)} .kv .v.warn{color:var(--warn)}
    .skills{display:flex;flex-wrap:wrap;gap:7px}
    .skills .s{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ink);background:#ffffff08;border:1px solid var(--panel-line);border-radius:9px;padding:7px 10px}
    .skills .s .ic{width:15px;height:15px;color:var(--accent)}
    /* чат */
    .msgs{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}
    .msg{max-width:90%;padding:10px 12px;border-radius:12px;font-size:14px;line-height:1.36;white-space:pre-wrap}
    .msg.u{align-self:flex-end;background:color-mix(in srgb,var(--accent) 28%,var(--panel));color:var(--ink)}
    .msg.a{align-self:flex-start;background:var(--paper);color:var(--paper-ink)}
    .msg.a b{color:#7a52d6}
    .wmg{align-self:stretch;background:#ffffff08;border:1px solid var(--panel-line);border-radius:10px;padding:10px}
    .wmg .wr{display:flex;align-items:center;gap:8px;font-size:12.5px;margin:5px 0}
    .wmg .wr .n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .wmg .wr .bar{flex:0 0 88px;height:7px;background:var(--bg-0);border-radius:5px;overflow:hidden}
    .wmg .wr .bar i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-2))}
    .wmg .wr .a{flex:0 0 70px;text-align:right;color:var(--ink-dim);font-weight:700}
    .qchips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:9px}
    .qchips .q{min-height:38px;cursor:pointer;border:1px solid var(--panel-line);background:#ffffff08;color:var(--ink-dim);border-radius:18px;padding:0 13px;font:inherit;font-size:12.5px;transition:transform .08s,filter .12s}
    .qchips .q:hover{filter:brightness(1.15)} .qchips .q:active{transform:scale(.94)}
    .inrow{display:flex;gap:8px}
    .inrow input{flex:1;min-height:var(--tap);background:var(--bg-0);border:1px solid var(--panel-line);border-radius:var(--r-sm);color:var(--ink);padding:0 12px;font:inherit;font-size:15px}
    .inrow input:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
    .inrow .send{min-width:var(--tap)}
    @media(prefers-reduced-motion:reduce){#sprite{animation:none!important}.btn,.qchips .q{transition:none}}
  </style>
  <div class="wrap" data-agent="${cfg.id}">
    <div class="nav">
      <a href="./index.html">${icon('arrowL')} офис</a>
      <a href="${cfg.next.href}">${cfg.next.label} ${icon('arrowR')}</a>
    </div>
    <div class="hd">
      <div class="av">${icon(cfg.iconName)}</div>
      <div><h1>${cfg.name}</h1><div class="role">${icon('paw')} ИИ-агент · ${cfg.role}</div></div>
    </div>

    <div class="stage live" id="stage">
      <div class="wall"></div><div class="floor"></div>
      <div class="shadow"></div>
      <img id="sprite" alt="${cfg.name}" />
      <div class="vin"></div>
      <div class="think-b">${icon('search')} смотрю в данных…</div>
      <div class="dirlbl" id="dirlbl"></div>
    </div>
    <div class="ctrl">
      <button class="btn" id="prev" aria-label="повернуть влево">${icon('arrowL')}</button>
      <button class="btn on" id="auto">↻ авто</button>
      <button class="btn" id="next" aria-label="повернуть вправо">${icon('arrowR')}</button>
    </div>

    <div class="panel">
      <h2>${icon('chat')} чат · ${cfg.name}</h2>
      <div class="msgs" id="msgs"></div>
      <div class="qchips" id="qchips"></div>
      <div class="inrow"><input id="inp" placeholder="Спроси по делу…" aria-label="вопрос агенту" /><button class="btn acc send" id="send" aria-label="отправить">${icon('send')}</button></div>
    </div>

    <div class="panel"><h2>${icon('chart')} характеристики</h2><div id="stats"></div></div>
    <div class="panel"><h2>${icon('paw')} что умеет</h2><div class="skills" id="skills"></div></div>
  </div>`;

  const $ = (id: string) => document.getElementById(id)!;
  const sprite = () => $('sprite') as HTMLImageElement;
  const stage = () => $('stage');

  // ── сцена: ракурсы + idle ───────────────────────────────────────────────
  let idleTimer: number | undefined;
  function showDir() {
    const d = DIRS[dirIdx];
    $('dirlbl').textContent = `вид: ${DIR_RU[d]}`;
    clearInterval(idleTimer);
    if (d === 'south' && !reduce) {
      const t = () => { sprite().src = `${B}idle/${idleFrame % cfg.idleFrames}.png`; idleFrame++; };
      t(); idleTimer = window.setInterval(t, 130);
    } else { sprite().src = `${B}${d === 'south' ? 'idle/0' : d}.png`; }
  }
  let autoTimer: number | undefined;
  function setAuto(on: boolean) {
    auto = on; $('auto').classList.toggle('on', on);
    clearInterval(autoTimer);
    if (on && !reduce) autoTimer = window.setInterval(() => { dirIdx = (dirIdx + 1) % DIRS.length; showDir(); }, 1000);
  }
  function faceUs() { setAuto(false); dirIdx = 0; showDir(); }

  // ── чат ──────────────────────────────────────────────────────────────────
  function addMsg(cls: string, html: string) {
    const m = $('msgs'); const d = document.createElement('div'); d.className = 'msg ' + cls; d.innerHTML = html;
    m.appendChild(d); m.scrollTop = m.scrollHeight; return d;
  }
  function renderWidget(w: any) {
    if (!w) return;
    if (w.type === 'managers' && w.rows?.length) {
      const max = Math.max(1, ...w.rows.map((r: any) => r.revenue || 0));
      const rows = w.rows.map((r: any) => `<div class="wr"><span class="n">${firstName(r.name)}</span><span class="bar"><i style="width:${Math.round((r.revenue / max) * 100)}%"></i></span><span class="a">${rub(r.revenue)}</span></div>`).join('');
      const d = document.createElement('div'); d.className = 'wmg'; d.innerHTML = rows; $('msgs').appendChild(d);
    } else if (w.type === 'reactivation') {
      const lm = w.lastMonth, tm = w.thisMonth;
      const rows = [
        lm && lm.revenue > 0 ? `<div class="wr"><span class="n">${lm.label}</span><span class="a" style="flex:1;text-align:left;color:var(--good)">${lm.clients} кл · ${rub(lm.revenue)}</span></div>` : '',
        tm && tm.revenue > 0 ? `<div class="wr"><span class="n">${tm.label}</span><span class="a" style="flex:1;text-align:left">${tm.clients} кл · ${rub(tm.revenue)}</span></div>` : '',
        w.dormant != null ? `<div class="wr"><span class="n">спящих сейчас</span><span class="a" style="flex:1;text-align:left;color:var(--warn)">${num(w.dormant)}</span></div>` : '',
      ].filter(Boolean).join('');
      if (rows) { const d = document.createElement('div'); d.className = 'wmg'; d.innerHTML = rows; $('msgs').appendChild(d); }
    }
    $('msgs').scrollTop = $('msgs').scrollHeight;
  }
  async function ask(q: string) {
    if (busy || !q.trim()) return;
    busy = true; ($('send') as HTMLButtonElement).disabled = true;
    addMsg('u', q.replace(/</g, '&lt;'));
    faceUs(); stage().classList.add('think');
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent: cfg.id, message: q }) });
      const data = await r.json();
      stage().classList.remove('think');
      addMsg('a', (data.answer || 'Хм, не нашёл ответа.').replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'));
      renderWidget(data.widget);
    } catch {
      stage().classList.remove('think');
      addMsg('a', 'Связь с данными прервалась, попробуй ещё раз.');
    }
    busy = false; ($('send') as HTMLButtonElement).disabled = false;
  }

  // ── статика ────────────────────────────────────────────────────────────
  function fillStats() {
    if (!model) return;
    $('stats').innerHTML = cfg.stats(model).map((s) =>
      `<div class="kv"><span class="k">${s.k}</span><span class="v ${s.tone || ''}">${s.v}</span></div>`).join('');
  }

  // ── init ─────────────────────────────────────────────────────────────────
  showDir(); setAuto(true);
  $('prev').onclick = () => { setAuto(false); dirIdx = (dirIdx - 1 + DIRS.length) % DIRS.length; showDir(); };
  $('next').onclick = () => { setAuto(false); dirIdx = (dirIdx + 1) % DIRS.length; showDir(); };
  $('auto').onclick = () => setAuto(!auto);
  const qc = $('qchips');
  cfg.presets.forEach((q) => { const b = document.createElement('button'); b.className = 'q'; b.textContent = q; b.onclick = () => ask(q); qc.appendChild(b); });
  $('skills').innerHTML = cfg.skills.map((s) => `<span class="s">${icon(s.icon)}${s.label}</span>`).join('');
  const inp = $('inp') as HTMLInputElement;
  const send = () => { const v = inp.value; inp.value = ''; ask(v); };
  ($('send') as HTMLButtonElement).onclick = send;
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });

  fetch(location.origin + import.meta.env.BASE_URL + 'assets/data/real.json', { cache: 'no-store' })
    .then((r) => r.json()).catch(() => ({})).then((snap) => { model = buildModel(snap || {}); fillStats(); });
}
