import { buildModel, firstName, type DashModel } from '../data/Dashboard';

const rub = (n: number | null | undefined) =>
  n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(2).replace('.', ',') + ' млн ₽' : Math.round(n).toLocaleString('ru-RU') + ' ₽';
const B = import.meta.env.BASE_URL + 'assets/agent/gennady/';
const API = location.origin + import.meta.env.BASE_URL + 'api/agent-chat';

const DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'] as const;
const DIR_RU: Record<string, string> = {
  'south': 'на нас', 'south-east': 'юго-восток', 'east': 'вправо', 'north-east': 'северо-восток',
  'north': 'от нас', 'north-west': 'северо-запад', 'west': 'влево', 'south-west': 'юго-запад',
};
const IDLE_FRAMES = 8;
const PRESETS = ['Кто лидер?', 'Кого подтянуть?', 'Заказы без менеджера?', 'Как команда в этом месяце?'];

let dirIdx = 0, auto = true, idleFrame = 0, busy = false;
let model: DashModel | null = null;

const app = document.getElementById('app')!;

function shell() {
  app.innerHTML = `
  <style>
    *{box-sizing:border-box} body{margin:0}
    #app{min-height:100dvh;display:flex;justify-content:center;
      background:radial-gradient(120% 80% at 50% 0%,#201a24,#120d16 70%,#0a070d);
      font-family:'Segoe UI',system-ui,sans-serif;color:#f4efe6}
    .wrap{width:100%;max-width:460px;min-height:100dvh;display:flex;flex-direction:column;
      padding:14px 14px calc(14px + env(safe-area-inset-bottom))}
    .top{display:flex;justify-content:space-between;font-size:12px;color:#a98fd0}
    .top a{color:#a98fd0;text-decoration:none}
    h1{font-size:22px;margin:8px 0 2px}
    .role{color:#c9a0ff;font-size:13px;font-weight:600;margin-bottom:4px}
    .tag{display:inline-block;font-size:11px;color:#cdbfe6;background:#241c2e;border:1px solid #45375a;border-radius:20px;padding:3px 10px}
    .stage{position:relative;margin:10px 0 6px;height:280px;border-radius:16px;overflow:hidden;
      background:radial-gradient(60% 55% at 50% 42%,#33264a,#150f1d 75%);border:1px solid #352a48;
      display:flex;align-items:center;justify-content:center}
    .pedestal{position:absolute;bottom:34px;left:50%;transform:translateX(-50%);width:200px;height:38px;
      background:radial-gradient(closest-side,#b388ff55,transparent);border-radius:50%}
    .glow{position:absolute;top:50%;left:50%;width:280px;height:280px;transform:translate(-50%,-55%);
      background:radial-gradient(circle,#b388ff22,transparent 65%);animation:pulse 3s ease-in-out infinite}
    @keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}
    #sprite{position:relative;width:210px;height:210px;image-rendering:pixelated;
      filter:drop-shadow(0 14px 16px #0008);transform:translateY(-12px)}
    .stage.think #sprite{animation:nod .5s ease-in-out infinite}
    @keyframes nod{0%,100%{transform:translateY(-12px)}50%{transform:translateY(-20px)}}
    .dirlbl{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);font-size:11px;color:#9c8ab2;background:#0006;border-radius:20px;padding:3px 10px}
    .think-b{position:absolute;top:14px;left:50%;transform:translateX(-50%);background:#fbf3e2;color:#241a10;
      border-radius:14px;padding:8px 12px;font-size:13px;display:none;max-width:88%}
    .stage.think .think-b{display:block}
    .ctrl{display:flex;justify-content:center;gap:10px;margin:2px 0 6px}
    .ctrl button{cursor:pointer;border:1px solid #5a4a72;background:#241c2e;color:#efe6f5;border-radius:12px;padding:8px 13px;font:inherit;font-weight:700}
    .ctrl .auto.on{background:linear-gradient(180deg,#b388ff,#7a52d6);color:#12091f;border-color:#5a3aa0;font-size:13px}
    .card{background:#1b1424;border:1px solid #352a48;border-radius:14px;padding:14px;margin-top:8px}
    .card h2{font-size:13px;margin:0 0 10px;color:#a98fd0;text-transform:uppercase;letter-spacing:.5px}
    .kv{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #ffffff10;font-size:14px}
    .kv:last-child{border-bottom:none}.kv .k{color:#b3a3c8}.kv .v{font-weight:700;text-align:right}
    .kv .v.good{color:#8fe6a8}.kv .v.warn{color:#ffb27a}
    .skills{display:flex;flex-wrap:wrap;gap:6px}
    .skills span{font-size:12px;background:#241c2e;border:1px solid #45375a;border-radius:8px;padding:5px 9px}
    /* чат */
    .msgs{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}
    .msg{max-width:90%;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.35;white-space:pre-wrap}
    .msg.u{align-self:flex-end;background:#3a2e52;color:#efe6f5}
    .msg.a{align-self:flex-start;background:#fbf3e2;color:#241a10}
    .msg.a b{color:#5a3aa0}
    .wmg{align-self:flex-start;width:100%;background:#241c2e;border:1px solid #45375a;border-radius:10px;padding:10px}
    .wmg .row{display:flex;align-items:center;gap:8px;font-size:12.5px;margin:4px 0}
    .wmg .row .n{flex:1;color:#efe6f5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .wmg .row .bar{flex:0 0 90px;height:7px;background:#150f1d;border-radius:5px;overflow:hidden}
    .wmg .row .bar i{display:block;height:100%;background:linear-gradient(90deg,#b388ff,#8fe6a8)}
    .wmg .row .a{flex:0 0 64px;text-align:right;color:#cdbfe6;font-weight:700}
    .qchips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
    .qchips button{cursor:pointer;border:1px solid #45375a;background:#241c2e;color:#cdbfe6;border-radius:16px;padding:6px 10px;font:inherit;font-size:12px}
    .inrow{display:flex;gap:8px}
    .inrow input{flex:1;background:#150f1d;border:1px solid #45375a;border-radius:10px;color:#efe6f5;padding:10px 12px;font:inherit;font-size:14px}
    .inrow button{cursor:pointer;border:none;background:linear-gradient(180deg,#b388ff,#7a52d6);color:#12091f;border-radius:10px;padding:10px 14px;font:inherit;font-weight:800}
    .inrow button:disabled{opacity:.5}
  </style>
  <div class="wrap">
    <div class="top"><a href="./index.html">← офис</a><a href="./agent-stepanych.html">Степаныч →</a></div>
    <h1>🐕 Геннадий</h1>
    <div class="role">ИИ-агент · аналитик менеджеров</div>
    <span class="tag">пиксельный персонаж · 8 направлений</span>

    <div class="stage" id="stage">
      <div class="glow"></div><div class="pedestal"></div>
      <div class="think-b" id="thinkb">🔍 смотрю в данных…</div>
      <img id="sprite" alt="Геннадий" />
      <div class="dirlbl" id="dirlbl"></div>
    </div>
    <div class="ctrl"><button id="prev">◀</button><button class="auto on" id="auto">⟳ авто</button><button id="next">▶</button></div>

    <div class="card">
      <h2>💬 Спросить Геннадия</h2>
      <div class="msgs" id="msgs"></div>
      <div class="qchips" id="qchips"></div>
      <div class="inrow"><input id="inp" placeholder="Спроси про команду…" /><button id="send">➤</button></div>
    </div>

    <div class="card">
      <h2>Характеристики</h2>
      <div class="kv"><span class="k">Специализация</span><span class="v">Разбор работы менеджеров</span></div>
      <div class="kv"><span class="k">Команда</span><span class="v" id="team">—</span></div>
      <div class="kv"><span class="k">Лидер месяца</span><span class="v good" id="lead">—</span></div>
      <div class="kv"><span class="k">На разбор</span><span class="v warn" id="lag">—</span></div>
    </div>
    <div class="card">
      <h2>Что умеет</h2>
      <div class="skills"><span>📊 рейтинг по выручке</span><span>📉 ловит просадки</span><span>👻 «заказы без хозяина»</span><span>⚖️ сравнивает с лидером</span></div>
    </div>
  </div>`;
}

const sprite = () => document.getElementById('sprite') as HTMLImageElement;
const stage = () => document.getElementById('stage')!;
let idleTimer: number | undefined;
function showDir() {
  const d = DIRS[dirIdx];
  (document.getElementById('dirlbl') as HTMLElement).textContent = `вид: ${DIR_RU[d]}`;
  clearInterval(idleTimer);
  if (d === 'south') { const t = () => { sprite().src = `${B}idle/${idleFrame % IDLE_FRAMES}.png`; idleFrame++; }; t(); idleTimer = window.setInterval(t, 130); }
  else sprite().src = `${B}${d}.png`;
}
let autoTimer: number | undefined;
function setAuto(on: boolean) {
  auto = on; document.getElementById('auto')!.classList.toggle('on', on);
  clearInterval(autoTimer);
  if (on) autoTimer = window.setInterval(() => { dirIdx = (dirIdx + 1) % DIRS.length; showDir(); }, 900);
}
function faceUs() { setAuto(false); dirIdx = 0; showDir(); }

function fillStats() {
  if (!model) return;
  const h = (model.managers?.list || []).filter((x) => !/админ|систем/i.test(x.name));
  if (!h.length) return;
  const s = [...h].sort((a, b) => b.revenue - a.revenue);
  (document.getElementById('team') as HTMLElement).textContent = `${h.length} менеджеров`;
  (document.getElementById('lead') as HTMLElement).textContent = `${firstName(s[0].name)} · ${rub(s[0].revenue)}`;
  (document.getElementById('lag') as HTMLElement).textContent = `${firstName(s[s.length - 1].name)} · ${rub(s[s.length - 1].revenue)}`;
}

// ── чат ──────────────────────────────────────────────────────────────────────
function addMsg(cls: string, html: string) {
  const m = document.getElementById('msgs')!;
  const d = document.createElement('div'); d.className = 'msg ' + cls; d.innerHTML = html;
  m.appendChild(d); m.scrollTop = m.scrollHeight; return d;
}
function renderWidget(w: any) {
  if (!w || w.type !== 'managers' || !w.rows?.length) return;
  const max = Math.max(1, ...w.rows.map((r: any) => r.revenue || 0));
  const rows = w.rows.map((r: any) => `<div class="row"><span class="n">${firstName(r.name)}</span><span class="bar"><i style="width:${Math.round((r.revenue / max) * 100)}%"></i></span><span class="a">${rub(r.revenue)}</span></div>`).join('');
  const d = document.createElement('div'); d.className = 'wmg'; d.innerHTML = rows;
  const m = document.getElementById('msgs')!; m.appendChild(d); m.scrollTop = m.scrollHeight;
}
async function ask(q: string) {
  if (busy || !q.trim()) return;
  busy = true;
  (document.getElementById('send') as HTMLButtonElement).disabled = true;
  addMsg('u', q);
  faceUs(); stage().classList.add('think');
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent: 'gennady', message: q }) });
    const data = await r.json();
    stage().classList.remove('think');
    addMsg('a', (data.answer || 'Хм, не нашёл ответа.').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'));
    renderWidget(data.widget);
  } catch {
    stage().classList.remove('think');
    addMsg('a', 'Связь с данными прервалась, попробуй ещё раз 🐾');
  }
  busy = false;
  (document.getElementById('send') as HTMLButtonElement).disabled = false;
}

async function boot() {
  shell();
  showDir(); setAuto(true);
  document.getElementById('prev')!.onclick = () => { setAuto(false); dirIdx = (dirIdx - 1 + DIRS.length) % DIRS.length; showDir(); };
  document.getElementById('next')!.onclick = () => { setAuto(false); dirIdx = (dirIdx + 1) % DIRS.length; showDir(); };
  document.getElementById('auto')!.onclick = () => setAuto(!auto);
  const qc = document.getElementById('qchips')!;
  PRESETS.forEach((q) => { const b = document.createElement('button'); b.textContent = q; b.onclick = () => ask(q); qc.appendChild(b); });
  const inp = document.getElementById('inp') as HTMLInputElement;
  const send = () => { const v = inp.value; inp.value = ''; ask(v); };
  (document.getElementById('send') as HTMLButtonElement).onclick = send;
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  try { const res = await fetch(location.origin + import.meta.env.BASE_URL + 'assets/data/real.json', { cache: 'no-store' }); model = buildModel(await res.json()); } catch { model = buildModel({}); }
  fillStats();
}
boot();
