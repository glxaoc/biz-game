import { buildModel, type DashModel } from '../data/Dashboard';

// ── данные ──────────────────────────────────────────────────────────────────
const rub = (n: number | null | undefined) =>
  n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(2).replace('.', ',') + ' млн ₽' : Math.round(n).toLocaleString('ru-RU') + ' ₽';
const num = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('ru-RU'));
const B = import.meta.env.BASE_URL + 'assets/agent/stepanych/';

// порядок направлений по часовой стрелке (для «прокрутить» персонажа)
const DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'] as const;
const DIR_RU: Record<string, string> = {
  'south': 'на нас', 'south-east': 'юго-восток', 'east': 'вправо', 'north-east': 'северо-восток',
  'north': 'от нас', 'north-west': 'северо-запад', 'west': 'влево', 'south-west': 'юго-запад',
};
const IDLE_FRAMES = 8; // кадров idle (только south)

let dirIdx = 0;
let auto = true;
let idleFrame = 0;
let model: DashModel | null = null;

const app = document.getElementById('app')!;

function shell() {
  app.innerHTML = `
  <style>
    *{box-sizing:border-box} body{margin:0}
    #app{min-height:100dvh;display:flex;justify-content:center;
      background:radial-gradient(120% 80% at 50% 0%,#241a10,#140d07 70%,#0c0805);
      font-family:'Segoe UI',system-ui,sans-serif;color:#f4efe6}
    .wrap{width:100%;max-width:460px;min-height:100dvh;display:flex;flex-direction:column;
      padding:14px 14px calc(14px + env(safe-area-inset-bottom))}
    .top{display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#c9a06a}
    .top a{color:#c9a06a;text-decoration:none}
    h1{font-size:22px;margin:8px 0 2px;letter-spacing:.3px}
    .role{color:#7fe0a0;font-size:13px;font-weight:600;margin-bottom:4px}
    .tag{display:inline-block;font-size:11px;color:#cdbfa6;background:#2a2014;border:1px solid #4a3a26;border-radius:20px;padding:3px 10px}
    /* сцена-постамент */
    .stage{position:relative;margin:10px 0 6px;height:300px;border-radius:16px;overflow:hidden;
      background:radial-gradient(60% 55% at 50% 42%,#3a2b18,#1a120a 75%);border:1px solid #3a2c1d;
      display:flex;align-items:center;justify-content:center}
    .pedestal{position:absolute;bottom:38px;left:50%;transform:translateX(-50%);width:200px;height:40px;
      background:radial-gradient(closest-side,#ffcf6a55,transparent);border-radius:50%}
    .glow{position:absolute;top:50%;left:50%;width:280px;height:280px;transform:translate(-50%,-55%);
      background:radial-gradient(circle,#ffd98a22,transparent 65%);animation:pulse 3s ease-in-out infinite}
    @keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}
    #sprite{position:relative;width:230px;height:230px;image-rendering:pixelated;
      filter:drop-shadow(0 14px 16px #0008);transform:translateY(-14px)}
    .dirlbl{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);font-size:11px;color:#9c8a72;
      background:#0006;border-radius:20px;padding:3px 10px}
    .ctrl{display:flex;align-items:center;justify-content:center;gap:10px;margin:2px 0 6px}
    .ctrl button{cursor:pointer;border:1px solid #6b513a;background:#2a2014;color:#f0e2cc;border-radius:12px;
      padding:9px 14px;font:inherit;font-weight:700;font-size:15px}
    .ctrl .auto{font-size:13px}
    .ctrl .auto.on{background:linear-gradient(180deg,#7fe0a0,#46b673);color:#10240f;border-color:#3a8a58}
    /* характеристики */
    .card{background:#1d160d;border:1px solid #3a2c1d;border-radius:14px;padding:14px;margin-top:8px}
    .card h2{font-size:13px;margin:0 0 10px;color:#c9a06a;text-transform:uppercase;letter-spacing:.5px}
    .kv{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #ffffff10;font-size:14px}
    .kv:last-child{border-bottom:none}
    .kv .k{color:#b9a98a} .kv .v{font-weight:700;text-align:right}
    .kv .v.good{color:#8fe6a8}
    .skills{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
    .skills span{font-size:12px;background:#2a2014;border:1px solid #4a3a26;border-radius:8px;padding:5px 9px}
    .bars{margin-top:10px}
    .bar{display:flex;align-items:center;gap:8px;font-size:12px;margin:5px 0}
    .bar .nm{width:90px;color:#cdbfa6} .bar .tr{flex:1;height:8px;background:#2a2014;border:1px solid #4a3a26;border-radius:6px;overflow:hidden}
    .bar .tr i{display:block;height:100%;background:linear-gradient(90deg,#e7ad53,#7fe0a0)}
  </style>
  <div class="wrap">
    <div class="top"><a href="./agent.html">← к Степанычу</a><a href="./index.html">офис</a></div>
    <h1>🐶 Степаныч</h1>
    <div class="role">ИИ-агент · возврат клиентов</div>
    <span class="tag">пиксельный персонаж · 8 направлений</span>

    <div class="stage">
      <div class="glow"></div><div class="pedestal"></div>
      <img id="sprite" alt="Степаныч" />
      <div class="dirlbl" id="dirlbl"></div>
    </div>
    <div class="ctrl">
      <button id="prev">◀</button>
      <button class="auto on" id="auto">⟳ авто-вращение</button>
      <button id="next">▶</button>
    </div>

    <div class="card">
      <h2>Характеристики</h2>
      <div class="kv"><span class="k">Специализация</span><span class="v">Возврат «спящих» клиентов</span></div>
      <div class="kv"><span class="k">Анализирует</span><span class="v" id="base">ритм заказов по базе</span></div>
      <div class="kv"><span class="k">Вернул за месяц</span><span class="v good" id="ret">—</span></div>
      <div class="kv"><span class="k">Спящих в работе</span><span class="v" id="dorm">—</span></div>
      <div class="bars">
        <div class="bar"><span class="nm">Упорство</span><span class="tr"><i style="width:92%"></i></span></div>
        <div class="bar"><span class="nm">Точность</span><span class="tr"><i style="width:84%"></i></span></div>
        <div class="bar"><span class="nm">Скорость</span><span class="tr"><i style="width:78%"></i></span></div>
      </div>
    </div>

    <div class="card">
      <h2>Что умеет</h2>
      <div class="skills">
        <span>🔍 находит спящих по ритму</span>
        <span>📞 ставит задачи менеджерам</span>
        <span>💰 считает возвращённую выручку</span>
        <span>📊 видит историю каждого клиента</span>
      </div>
    </div>
  </div>`;
}

const sprite = () => document.getElementById('sprite') as HTMLImageElement;

let idleTimer: number | undefined;
function showDir() {
  const d = DIRS[dirIdx];
  (document.getElementById('dirlbl') as HTMLElement).textContent = `вид: ${DIR_RU[d]}`;
  clearInterval(idleTimer);
  if (d === 'south') {
    // анимированный idle
    const tick = () => { sprite().src = `${B}idle/${idleFrame % IDLE_FRAMES}.png`; idleFrame++; };
    tick();
    idleTimer = window.setInterval(tick, 130);
  } else {
    sprite().src = `${B}${d}.png`;
  }
}

let autoTimer: number | undefined;
function setAuto(on: boolean) {
  auto = on;
  document.getElementById('auto')!.classList.toggle('on', on);
  clearInterval(autoTimer);
  if (on) autoTimer = window.setInterval(() => { dirIdx = (dirIdx + 1) % DIRS.length; showDir(); }, 900);
}

function fillStats() {
  if (!model) return;
  const total = model.clients?.total;
  if (total != null) (document.getElementById('base') as HTMLElement).textContent = `ритм заказов по ${num(total)} клиентам`;
  const r = model.reactivation?.lastMonth;
  (document.getElementById('ret') as HTMLElement).textContent = r && r.revenue > 0 ? `${r.clients} кл · +${rub(r.revenue)}` : '—';
  (document.getElementById('dorm') as HTMLElement).textContent = model.dormant != null ? num(model.dormant) : '—';
}

async function boot() {
  shell();
  showDir();
  setAuto(true);
  document.getElementById('prev')!.onclick = () => { setAuto(false); dirIdx = (dirIdx - 1 + DIRS.length) % DIRS.length; showDir(); };
  document.getElementById('next')!.onclick = () => { setAuto(false); dirIdx = (dirIdx + 1) % DIRS.length; showDir(); };
  document.getElementById('auto')!.onclick = () => setAuto(!auto);
  try {
    const res = await fetch(location.origin + import.meta.env.BASE_URL + 'assets/data/real.json', { cache: 'no-store' });
    model = buildModel(await res.json());
  } catch { model = buildModel({}); }
  fillStats();
}

boot();
