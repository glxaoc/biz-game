// Tycoon-style tabbed dashboard overlay (right side). Tabs: Обзор / Выручка /
// Долги / Менеджеры / Задания. Reads a DashModel; "1С" vs "демо" tags mark data
// provenance. onShow(i) highlights manager i in the office scene.
import { gsap } from 'gsap';
import type { DashModel } from '../data/Dashboard';
import { firstName } from '../data/Dashboard';
import type { OwnerTask } from '../data/Briefing';

const PRIO: Record<string, string> = { high: '#ff6b6b', med: '#ffb454', low: '#7fd18a' };
const PRIOL: Record<string, string> = { high: 'Срочно', med: 'Важно', low: 'Можно' };
const rub = (n: number | null) => (n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(2) + ' млн ₽' : Math.round(n).toLocaleString('ru-RU') + ' ₽');
const ksum = (n: number | null) => (n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'м' : Math.round(n / 1000) + 'к');
// русское склонение: plural(1,'клиент','клиента','клиентов')
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
const num = (n: number | null) => (n == null ? '—' : n.toLocaleString('ru-RU'));
// какой агент-собачка берёт задачу в работу (по id задачи)
const agentForTask = (id: string): string | null => {
  if (id === 'i-avg' || id === 'i-sys' || id === 'm-low') return 'Аналитик менеджеров';
  if (id === 'dormant') return 'Возврат клиентов';
  if (id === 'big') return 'Ключевые клиенты';
  if (id === 'brand') return 'Аналитик продаж';
  return null;
};
const tag = (real: boolean) =>
  `<span class="src ${real ? 'r' : 'd'}">${real ? '1С' : 'демо'}</span>`;
// «ранг дня» по доле закрытых заданий
const DAY_RANK = (done: number, total: number) => {
  if (total === 0) return '—';
  const p = done / total;
  if (done === 0) return '😴 Прокрастинатор';
  if (p >= 1) return '👑 День под контролем';
  if (p >= 0.6) return '💪 Собранный';
  if (p >= 0.3) return '🙂 В тонусе';
  return '🐣 Только начал';
};
// игровой «класс» менеджера по поведению данных
function rpgClass(orders: number, revenue: number, teamMaxOrders: number, teamTopAvg: number): string {
  const avg = revenue / Math.max(1, orders);
  if (orders >= teamMaxOrders * 0.75 && avg < teamTopAvg * 0.7) return '🔥 Берсерк мелких сделок';
  if (avg >= teamTopAvg * 0.95) return '🎯 Снайпер крупных сделок';
  if (orders >= teamMaxOrders * 0.75) return '⚡ Пулемётчик заказов';
  return '🛡️ Стабильный боец';
}

const TABS: { id: string; icon: string; label: string }[] = [
  { id: 'Обзор', icon: '📊', label: 'Обзор' },
  { id: 'Выручка', icon: '💵', label: 'Выручка' },
  { id: 'Менеджеры', icon: '👔', label: 'Люди' },
  { id: 'Задания', icon: '✅', label: 'Задания' },
  { id: 'Агенты', icon: '🐕', label: 'Агенты' },
];

export class GameUI {
  private root: HTMLDivElement;
  private saleBtn?: HTMLButtonElement;
  private dbBtn?: HTMLButtonElement;
  private content: HTMLDivElement;
  private ticker: HTMLDivElement;
  private model?: DashModel;
  private prevModel?: DashModel; // для count-up / дельт KPI
  private justUpdated = false;   // модель реально изменилась (поллинг) → можно анимировать
  private tab = 'Обзор';
  private revRange: 'today' | 'week' | 'month' = 'week';

  // «спокойный режим»: уважаем prefers-reduced-motion + ручной тумблер (localStorage)
  private get calm(): boolean {
    try {
      if (localStorage.getItem('bizgame.calm') === '1') return true;
      if (localStorage.getItem('bizgame.calm') === '0') return false;
    } catch { /* ignore */ }
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  constructor(private onShow: (i: number) => void, private onSale?: () => void) {
    document.getElementById('game-ui')?.remove();
    document.getElementById('gu-sale')?.remove();
    const root = document.createElement('div');
    root.id = 'game-ui';
    root.innerHTML = `
      <style>
        #game-ui{position:absolute;right:0;top:0;height:100%;width:340px;z-index:60;display:flex;
          flex-direction:column;font-family:'Segoe UI',system-ui,sans-serif;color:#f4efe6;
          background:linear-gradient(180deg,#221a12f5,#15100af5);border-left:1px solid #6b513a;
          box-shadow:-8px 0 28px #0009}
        #game-ui .hd{padding:12px 14px 8px;border-bottom:1px solid #3a2c1d}
        #game-ui .hd .co{font-size:13px;font-weight:700;letter-spacing:.2px}
        #game-ui .hd .row{display:flex;justify-content:space-between;align-items:center;margin-top:6px}
        #game-ui .hd .day{font-size:11px;color:#c9a06a;background:#2a2014;border:1px solid #4a3a26;
          border-radius:20px;padding:3px 10px}
        #game-ui .hd .live{display:flex;align-items:center;gap:6px;font-size:10px;color:#a9c5a0}
        #game-ui .hd .live .dot{width:7px;height:7px;border-radius:50%;background:#5fd06a;box-shadow:0 0 7px #5fd06a;animation:gp 1.6s infinite}
        #game-ui .hd .live.stale{color:#e6bd7a}
        #game-ui .hd .live.stale .dot{background:#ffb454;box-shadow:0 0 7px #ffb454}
        #game-ui .hd .live.off{color:#e6a08a}
        #game-ui .hd .live.off .dot{background:#ff6b6b;box-shadow:0 0 7px #ff6b6b;animation:none}
        @keyframes gp{0%,100%{opacity:1}50%{opacity:.35}}
        #game-ui .tabs{display:flex;padding:8px 8px 0;gap:4px}
        #game-ui .tabs button{flex:1;cursor:pointer;border:none;background:#241c14;color:#c9b8a4;
          border:1px solid #3a2c1d;border-bottom:none;border-radius:9px 9px 0 0;padding:7px 2px 8px;
          font:inherit;font-size:10px;display:flex;flex-direction:column;align-items:center;gap:2px}
        #game-ui .tabs button .i{font-size:15px}
        #game-ui .tabs button.on{background:#33271a;color:#ffe6bf;box-shadow:inset 0 2px 0 #caa15a}
        #game-ui .body{flex:1;overflow-y:auto;padding:12px;border-top:1px solid #caa15a55}
        #game-ui .pills{display:flex;gap:6px;margin-bottom:10px}
        #game-ui .pills button{cursor:pointer;border:1px solid #4a3a26;background:#241c14;color:#c9b8a4;
          border-radius:20px;padding:5px 12px;font:inherit;font-size:11px}
        #game-ui .pills button.on{background:#caa15a;color:#1c140a;border-color:#caa15a;font-weight:700}
        #game-ui .big{font-size:30px;font-weight:800;line-height:1.05;font-variant-numeric:tabular-nums}
        #game-ui .sub{color:#c9a06a;font-size:11px;margin-top:2px}
        #game-ui .chips{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
        #game-ui .chip{background:#2a2014;border:1px solid #4a3a26;border-radius:10px;padding:8px 10px}
        #game-ui .chip .l{font-size:10px;color:#c9a06a;text-transform:uppercase;letter-spacing:.4px}
        #game-ui .chip .v{font-size:17px;font-weight:700;font-variant-numeric:tabular-nums}
        #game-ui .bars{display:flex;align-items:flex-end;gap:6px;height:96px;margin:6px 0 4px}
        #game-ui .bars .b{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;height:100%;justify-content:flex-end}
        #game-ui .bars .b i{width:100%;background:linear-gradient(180deg,#e0b56a,#a8743a);border-radius:4px 4px 0 0;display:block}
        #game-ui .bars .b.on i{background:linear-gradient(180deg,#7fd18a,#3f8a52)}
        #game-ui .bars .b span{font-size:9px;color:#9a8a72}
        #game-ui .rows{display:flex;flex-direction:column;gap:7px}
        #game-ui .r{background:#2a2014;border:1px solid #4a3a26;border-radius:10px;padding:8px 10px;display:flex;align-items:center;gap:9px}
        #game-ui .r .rk{font-size:13px;font-weight:800;color:#caa15a;width:18px;text-align:center}
        #game-ui .r .nm{flex:1;font-size:12px;font-weight:600}
        #game-ui .r .nm small{display:block;color:#a99478;font-weight:400;font-size:10px;margin-top:1px}
        #game-ui .r .amt{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}
        #game-ui .ov{font-size:9px;color:#1c140a;background:#ff8a5a;border-radius:5px;padding:1px 5px;margin-left:6px}
        #game-ui .src{font-size:9px;border-radius:5px;padding:1px 5px;margin-left:6px}
        #game-ui .src.r{background:#3f5a36;color:#dff0d6}
        #game-ui .src.d{background:#4a3a26;color:#d9c4a3}
        #game-ui .card{background:#2a2014;border:1px solid #4a3a26;border-left-width:4px;border-radius:11px;padding:9px 11px}
        #game-ui .card.done{opacity:.45}
        #game-ui .card .t{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;margin-bottom:3px}
        #game-ui .card .t .ic{font-size:14px}
        #game-ui .card .pr{font-size:9px;text-transform:uppercase;padding:1px 6px;border-radius:6px;color:#15100a;font-weight:700;margin-left:auto}
        #game-ui .card .d{font-size:11px;color:#d9cdba;line-height:1.35;margin-bottom:6px}
        #game-ui .card .a{font-size:10.5px;color:#9fd6a0;margin-bottom:7px}
        #game-ui .card .agtask{font-size:10px;color:#1c140a;background:#caa15a;border-radius:6px;padding:2px 7px;display:inline-block;margin-bottom:7px;font-weight:700}
        #game-ui .card .bt{display:flex;gap:6px}
        #game-ui .btn{cursor:pointer;border:none;border-radius:7px;padding:5px 10px;font:inherit;font-size:11px;font-weight:600}
        #game-ui .btn.s{background:#3a5a86;color:#eaf2ff}
        #game-ui .btn.k{background:#3a4a30;color:#cfe6c4}
        #game-ui .tick{border-top:1px solid #3a2c1d;padding:6px 10px;min-height:48px;display:flex;flex-direction:column-reverse;gap:3px;justify-content:flex-end}
        #game-ui .tick .e{font-size:10.5px;color:#c9b8a4;display:flex;align-items:center;gap:6px;border-left:3px solid #4a3a26;padding-left:7px;line-height:1.3}
        #game-ui .tick .e b{color:#e9d6b6;font-weight:700}
        #game-ui .tick .e.gold{border-left-color:#e0b56a;color:#e7d3a8}
        #game-ui .tick .e.dmg{border-left-color:#ff6b6b;color:#e6a89a}
        #game-ui .tick .e.cool{border-left-color:#6aa0e0;color:#a9c0e0}
        #game-ui .tick .combo{margin-left:auto;font-weight:800;color:#ffb454}
        /* KPI: иконки-валюты + провенанс */
        #game-ui .chip .l .ki{margin-right:3px}
        #game-ui .chip.real{border-color:#caa15a99;box-shadow:inset 0 0 0 1px #caa15a33}
        #game-ui .chip.demo{filter:saturate(.55) brightness(.95)}
        #game-ui .chip.debt{animation:breathe 2.4s ease-in-out infinite}
        @keyframes breathe{0%,100%{box-shadow:inset 0 0 0 1px #ff8a5a22}50%{box-shadow:inset 0 0 0 1px #ff8a5a66,0 0 8px #ff8a5a33}}
        .gu-delta{position:absolute;top:-4px;right:6px;font-size:10px;font-weight:800;pointer-events:none;animation:fadeUp 2s ease-out forwards}
        .gu-delta.up{color:#7fd18a}.gu-delta.down{color:#ff8a7a}
        @keyframes fadeUp{0%{opacity:0;transform:translateY(6px)}18%{opacity:1}100%{opacity:0;transform:translateY(-12px)}}
        #game-ui .chip{position:relative}
        /* Долги: полоска терпения */
        #game-ui .pat{height:5px;border-radius:4px;background:#1c140a;overflow:hidden;margin-top:5px}
        #game-ui .pat i{display:block;height:100%;border-radius:4px}
        #game-ui .r .risk{font-size:8.5px;color:#1c140a;background:#ff6b6b;border-radius:5px;padding:1px 5px;margin-left:6px;font-weight:800;animation:riskblink 1.4s ease-in-out infinite}
        @keyframes riskblink{0%,100%{opacity:1}50%{opacity:.45}}
        /* Люди: score-bar, лидер, призрак */
        #game-ui .r .sb{height:5px;border-radius:4px;background:#1c140a;overflow:hidden;margin-top:4px}
        #game-ui .r .sb i{display:block;height:100%;background:linear-gradient(90deg,#e0b56a,#a8743a);border-radius:4px}
        #game-ui .r.lead{background:linear-gradient(90deg,#caa15a26,#2a2014);animation:halo 2.6s ease-in-out infinite}
        @keyframes halo{0%,100%{box-shadow:0 0 0 #caa15a00}50%{box-shadow:0 0 12px #caa15a55}}
        #game-ui .r.ghost{opacity:.62;filter:grayscale(.7)}
        /* Задания: прогресс дня + quest-complete */
        #game-ui .qhdr{display:flex;align-items:center;gap:8px;margin:2px 0 9px}
        #game-ui .qbar{flex:1;height:8px;border-radius:6px;background:#1c140a;overflow:hidden}
        #game-ui .qbar i{display:block;height:100%;background:linear-gradient(90deg,#7fd18a,#3f8a52);transition:width .5s ease}
        #game-ui .qrank{font-size:11px;color:#e6c98a;font-weight:700;white-space:nowrap}
        #game-ui .card{position:relative;transition:transform .15s ease}
        #game-ui .card:hover{transform:translateY(-2px)}
        #game-ui .card.collapsing{max-height:0;opacity:0;padding-top:0;padding-bottom:0;margin:0;overflow:hidden;transition:all .4s ease}
        #game-ui .stamp{position:absolute;top:8px;right:10px;font-size:13px;font-weight:900;color:#7fd18a;border:2px solid #7fd18a;border-radius:6px;padding:1px 6px;transform:rotate(-9deg)}
        .gu-particle{position:absolute;pointer-events:none;font-size:13px;will-change:transform,opacity;z-index:80}
        /* XP-бар плана месяца */
        #game-ui .xp{position:relative;height:14px;border-radius:8px;background:#1c140a;overflow:hidden;margin:8px 0 4px}
        #game-ui .xp .fact{position:absolute;left:0;top:0;height:100%;border-radius:8px;background:linear-gradient(90deg,#e0b56a,#a8743a)}
        #game-ui .xp .fc{position:absolute;left:0;top:0;height:100%;border-radius:8px;background:#e0b56a33;border-right:2px dashed #ffe6bf99}
        #game-ui .xp.win .fact{background:linear-gradient(90deg,#ffe6a0,#e0b56a)}
        #game-ui .xp.win::after{content:'';position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,#fff8 50%,transparent 70%);background-size:200% 100%;animation:sheen 1.6s linear infinite}
        @keyframes sheen{0%{background-position:120% 0}100%{background-position:-40% 0}}
        #game-ui .twk{position:absolute;font-size:11px;animation:twk 1.4s ease-in-out infinite}
        @keyframes twk{0%,100%{opacity:.2;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}
        /* баннер-салют */
        #game-ui .banner{position:absolute;left:12px;right:12px;top:54px;z-index:90;text-align:center;
          background:linear-gradient(180deg,#3a5a30,#2a4420);border:1px solid #7fd18a;border-radius:12px;
          padding:12px;color:#dff0d6;font-weight:800;box-shadow:0 8px 24px #0008;animation:bnr .4s ease-out}
        @keyframes bnr{0%{opacity:0;transform:translateY(-10px) scale(.96)}100%{opacity:1;transform:none}}
        /* появление блоков контента при открытии вкладки (CSS, не зависит от нагрузки JS) */
        #game-ui .gu-rv{animation:guRv .32s ease-out both}
        @keyframes guRv{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        /* терминал базы клиентов (Степаныч) — синтетические данные, заблюрены */
        #gu-db-ov{position:absolute;z-index:78;left:0;top:0;bottom:0;right:340px;display:flex;flex-direction:column;
          background-color:#06121a;background-image:radial-gradient(120% 100% at 50% 0%,#0e2630,#06121a);color:#bfeaff;
          font-family:ui-monospace,Menlo,Consolas,monospace;overflow:hidden;cursor:pointer;animation:guRv .25s ease-out both}
        #gu-db-ov .dbh{padding:14px 18px 10px;border-bottom:1px solid #1d4658;flex:0 0 auto}
        #gu-db-ov .dbh .t{font-size:17px;font-weight:800;color:#7fe6ff;letter-spacing:.4px;text-shadow:0 0 12px #2bd4ff66}
        #gu-db-ov .dbh .s{font-size:12px;color:#8fb6c8;margin-top:4px}
        #gu-db-ov .dbh .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#39e08a;box-shadow:0 0 8px #39e08a;margin-right:6px;animation:gp 1.4s infinite}
        #gu-db-ov .x{position:absolute;top:10px;right:14px;font-size:18px;color:#8fb6c8;cursor:pointer;z-index:3}
        #gu-db-ov .dbwrap{position:relative;flex:1;overflow:hidden}
        #gu-db-ov .dbrows{position:absolute;left:0;right:0;top:0;padding:0 18px;filter:blur(3.2px);animation:gudbScroll 24s linear infinite;will-change:transform}
        #gu-db-ov .dbrow{display:flex;gap:14px;font-size:12.5px;line-height:2.05;white-space:nowrap;border-bottom:1px solid #ffffff10}
        #gu-db-ov .dbrow span{overflow:hidden;text-overflow:clip}
        #gu-db-ov .c-nm{flex:0 0 200px;color:#e3f4ff;font-weight:700}
        #gu-db-ov .c-ci{flex:0 0 80px;color:#7fb0c4}
        #gu-db-ov .c-ph{flex:0 0 150px;color:#9fd8ef}
        #gu-db-ov .c-or{flex:0 0 66px}
        #gu-db-ov .c-av{flex:0 0 92px;color:#ffd98a}
        #gu-db-ov .c-lt{flex:0 0 120px;color:#8fe6a8}
        #gu-db-ov .c-br{flex:0 0 86px;color:#c9a0ff}
        #gu-db-ov .c-ls{flex:0 0 140px;color:#7fb0c4}
        #gu-db-ov .c-st{flex:0 0 72px;color:#7fe6ff}
        #gu-db-ov .scan{position:absolute;left:0;right:0;height:96px;pointer-events:none;
          background:linear-gradient(180deg,#39e08a00,#39e08a18 50%,#39e08a00);animation:gudbScan 4.5s ease-in-out infinite}
        #gu-db-ov .gfade{position:absolute;inset:0;pointer-events:none;
          background:linear-gradient(180deg,#0a1f28 0%,#0a1f2800 14%,#0a1f2800 78%,#06121af2 100%)}
        #gu-db-ov .hint{position:absolute;bottom:10px;left:0;right:0;text-align:center;font-size:11px;color:#5f8294}
        @keyframes gudbScroll{from{transform:translateY(0)}to{transform:translateY(-50%)}}
        @keyframes gudbScan{0%{top:-96px}100%{top:100%}}
        @media (max-width:760px){#gu-db-ov{right:0;bottom:0}}
        /* спокойный режим */
        #game-ui.calm *{animation:none!important}
        #game-ui .calmbtn{cursor:pointer;background:none;border:none;color:#8a7a64;font-size:13px;padding:0 2px;line-height:1}
        #game-ui .calmbtn:hover{color:#e6c98a}
        /* телефон/узкий экран: панель снизу на всю ширину, офис сверху */
        @media (max-width:760px){
          #game-ui{left:0;right:0;top:auto;bottom:0;width:100%;height:58%;
            border-left:none;border-top:1px solid #6b513a;box-shadow:0 -8px 28px #0009}
          #game-ui .hd .co{font-size:14px}
          #game-ui .tabs button{font-size:11px;padding:8px 2px 9px}
          #game-ui .tabs button .i{font-size:17px}
          #game-ui .body{font-size:13px}
          #game-ui .big{font-size:34px}
        }
      </style>
      <div class="hd">
        <div class="co" id="gu-co">…</div>
        <div class="row"><span class="day" id="gu-day">День —</span>
          <span style="display:flex;align-items:center;gap:8px">
            <span class="live" id="gu-live"><span class="dot"></span><span id="gu-src">подключение…</span></span>
            <button class="calmbtn" id="gu-calm" title="Спокойный режим (меньше анимаций)">🎬</button>
          </span></div>
      </div>
      <div class="tabs" id="gu-tabs"></div>
      <div class="body" id="gu-body"></div>
      <div class="tick" id="gu-tick">—</div>`;
    document.body.appendChild(root);

    // плавающая кнопка «Продажа» — вручную запустить показ (заказ + конфетти + пляска), удобно для записи
    const sale = document.createElement('button');
    sale.id = 'gu-sale';
    sale.type = 'button';
    sale.textContent = '💰 Продажа';
    sale.title = 'Запустить анимацию продажи';
    sale.style.cssText = 'position:absolute;left:12px;bottom:12px;z-index:80;cursor:pointer;border:1px solid #b9863f;'
      + "background:linear-gradient(180deg,#e7ad53,#c9852f);color:#241405;font:700 13px 'Segoe UI',system-ui,sans-serif;"
      + 'border-radius:10px;padding:9px 15px;box-shadow:0 4px 14px #0008;letter-spacing:.3px;transition:filter .12s,transform .06s';
    sale.onmouseenter = () => (sale.style.filter = 'brightness(1.08)');
    sale.onmouseleave = () => (sale.style.filter = 'none');
    sale.onmousedown = () => (sale.style.transform = 'translateY(1px)');
    sale.onmouseup = () => (sale.style.transform = 'none');
    sale.onclick = () => this.onSale?.();
    // плавающая кнопка «База клиентов» — терминал Степаныча со скроллом (заблюренных) данных
    const db = document.createElement('button');
    db.id = 'gu-db';
    db.type = 'button';
    db.textContent = '🗄 База клиентов';
    db.title = 'Показать терминал данных клиентов (Степаныч)';
    db.style.cssText = 'position:absolute;left:12px;z-index:80;cursor:pointer;border:1px solid #3a6a8a;'
      + "background:linear-gradient(180deg,#3f7fa0,#2b5d78);color:#eaf6ff;font:700 13px 'Segoe UI',system-ui,sans-serif;"
      + 'border-radius:10px;padding:9px 15px;box-shadow:0 4px 14px #0008;letter-spacing:.3px;transition:filter .12s,transform .06s';
    db.onmouseenter = () => (db.style.filter = 'brightness(1.1)');
    db.onmouseleave = () => (db.style.filter = 'none');
    db.onmousedown = () => (db.style.transform = 'translateY(1px)');
    db.onmouseup = () => (db.style.transform = 'none');
    db.onclick = () => this.showClientData();

    const place = () => {
      const mob = window.matchMedia('(max-width:760px)').matches;
      if (mob) {
        sale.style.top = '8px'; sale.style.bottom = 'auto'; sale.style.left = '8px'; sale.style.padding = '7px 11px';
        db.style.top = '46px'; db.style.bottom = 'auto'; db.style.left = '8px'; db.style.padding = '7px 11px';
      } else {
        sale.style.bottom = '12px'; sale.style.top = 'auto'; sale.style.left = '12px'; sale.style.padding = '9px 15px';
        db.style.bottom = '54px'; db.style.top = 'auto'; db.style.left = '12px'; db.style.padding = '9px 15px';
      }
    };
    place();
    window.addEventListener('resize', place);
    document.body.appendChild(sale);
    document.body.appendChild(db);
    this.saleBtn = sale;
    this.dbBtn = db;

    this.root = root;
    this.content = root.querySelector('#gu-body')!;
    this.ticker = root.querySelector('#gu-tick')!;
    const tabsEl = root.querySelector('#gu-tabs')!;
    for (const t of TABS) {
      const b = document.createElement('button');
      b.innerHTML = `<span class="i">${t.icon}</span>${t.label}`;
      b.onclick = () => { this.tab = t.id; this.syncTabs(); this.render(); };
      b.dataset.tab = t.id;
      tabsEl.appendChild(b);
    }
    // спокойный режим
    root.classList.toggle('calm', this.calm);
    const calmBtn = root.querySelector('#gu-calm') as HTMLButtonElement;
    const syncCalm = () => { calmBtn.textContent = this.calm ? '💤' : '🎬'; root.classList.toggle('calm', this.calm); };
    calmBtn.onclick = () => { try { localStorage.setItem('bizgame.calm', this.calm ? '0' : '1'); } catch { /* ignore */ } syncCalm(); };
    syncCalm();
    this.syncTabs();
  }

  setModel(m: DashModel) {
    this.model = m;
    (this.root.querySelector('#gu-co') as HTMLElement).textContent = m.company;
    (this.root.querySelector('#gu-day') as HTMLElement).textContent = `День ${m.day}`;
    const live = this.root.querySelector('#gu-live') as HTMLElement;
    const src = this.root.querySelector('#gu-src') as HTMLElement;
    live.classList.remove('stale', 'off');
    if (!m.live) {
      live.classList.add('off');
      src.textContent = 'нет связи с 1С · демо-режим';
    } else if (!m.fresh) {
      live.classList.add('stale');
      src.textContent = `${m.source}${m.asOf ? ' · данные за ' + m.asOf : ''}`;
    } else {
      src.textContent = `${m.source}${m.asOf ? ' · на ' + m.asOf : ''}`;
    }
    // модель реально изменилась? (другой снапшот) → разрешаем count-up на Обзоре
    this.justUpdated = !!this.prevModel && (
      this.prevModel.asOf !== m.asOf ||
      this.prevModel.revenue.month !== m.revenue.month ||
      this.prevModel.orders.month !== m.orders.month
    );
    this.render();
    this.prevModel = m;
  }

  private syncTabs() {
    this.root.querySelectorAll('#gu-tabs button').forEach((b) =>
      b.classList.toggle('on', (b as HTMLElement).dataset.tab === this.tab));
  }

  private render() {
    if (!this.model) return;
    const m = this.model;
    // innerHTML пересобирается — убиваем твины на старых узлах, чтобы не падали
    gsap.killTweensOf(this.content.querySelectorAll('*'));
    if (this.tab === 'Обзор') this.content.innerHTML = this.pOverview(m);
    else if (this.tab === 'Выручка') this.content.innerHTML = this.pRevenue(m);
    else if (this.tab === 'Менеджеры') this.content.innerHTML = this.pManagers(m);
    else if (this.tab === 'Задания') this.content.innerHTML = this.pTasks(m);
    else if (this.tab === 'Агенты') this.content.innerHTML = this.pAgents(m);
    this.bind();
    this.revealContent(); // единое «появление» блоков для ЛЮБОЙ вкладки
    if (this.tab === 'Обзор') this.animateOverview(m);
    if (this.tab === 'Менеджеры') this.animateScoreBars();
    if (this.tab === 'Выручка') this.animateBars();
  }

  // плавное появление блоков контента при открытии вкладки — через CSS-анимацию
  // (идёт на компоновщике, не зависит от загрузки JS/gsap-тикера → блоки никогда не «застревают» невидимыми).
  // В calm-режиме CSS-правило #game-ui.calm * отключает анимацию автоматически.
  private revealContent() {
    const items = this.content.querySelectorAll<HTMLElement>('.chip, .pills, .big, .bars, .sub, .qhdr, .r, .card');
    items.forEach((el, i) => {
      el.style.animationDelay = Math.min(i * 0.035, 0.45) + 's';
      el.classList.add('gu-rv');
    });
  }

  // count-up KPI-чипов от прошлого значения к новому + тихий дельта-бейдж.
  // анимируем ТОЛЬКО при реальном изменении модели (поллинг), не на каждое переключение вкладки.
  private animateOverview(m: DashModel) {
    if (this.calm || !this.justUpdated || !this.prevModel) return;
    const p = this.prevModel;
    const chips = this.content.querySelectorAll('.chips .chip');
    const specs: { i: number; old: number | null; cur: number | null; fmt: (n: number) => string }[] = [
      { i: 0, old: p.revenue.month, cur: m.revenue.month, fmt: (n) => ksum(n) + ' ₽' },
      { i: 1, old: p.orders.month, cur: m.orders.month, fmt: (n) => num(n) },
      { i: 2, old: p.clients.total, cur: m.clients.total, fmt: (n) => num(n) },
      { i: 3, old: p.orders.avgCheck, cur: m.orders.avgCheck, fmt: (n) => ksum(n) + ' ₽' },
      { i: 4, old: p.revenue.forecast, cur: m.revenue.forecast, fmt: (n) => ksum(n) + ' ₽' },
      { i: 5, old: p.orders.today, cur: m.orders.today, fmt: (n) => num(n) },
    ];
    for (const s of specs) {
      const chip = chips[s.i] as HTMLElement;
      if (!chip || s.cur == null || s.old == null || s.cur === s.old) continue;
      const v = chip.querySelector('.v') as HTMLElement;
      this.animateChip(v, s.old, s.cur, s.fmt);
      const d = s.cur - s.old;
      const badge = document.createElement('span');
      badge.className = 'gu-delta ' + (d > 0 ? 'up' : 'down');
      badge.textContent = (d > 0 ? '▲ +' : '▼ ') + s.fmt(Math.abs(d));
      chip.appendChild(badge);
      setTimeout(() => badge.remove(), 2100);
    }
  }

  private animateChip(el: HTMLElement, from: number, to: number, fmt: (n: number) => string) {
    const o = { v: from };
    gsap.to(o, { v: to, duration: 0.8, ease: 'power2.out', onUpdate: () => { el.textContent = fmt(o.v); } });
  }

  private animateScoreBars() {
    if (this.calm) return;
    const bars = this.content.querySelectorAll('.r .sb i');
    bars.forEach((b, i) => {
      const w = (b as HTMLElement).style.width;
      gsap.fromTo(b, { width: '0%' }, { width: w, duration: 0.7, delay: i * 0.05, ease: 'power2.out' });
    });
  }

  private animateBars() {
    if (this.calm) return;
    const bars = this.content.querySelectorAll('.bars .b i');
    bars.forEach((b, i) => {
      const h = (b as HTMLElement).style.height;
      gsap.fromTo(b, { height: 0 }, { height: h, duration: 0.5, delay: i * 0.05, ease: 'back.out(1.4)' });
    });
  }

  // фонтанчик DOM-частиц с авто-удалением (не Phaser-объекты в HTML-слое)
  private burst(host: HTMLElement, glyph: string, count = 6) {
    if (this.calm) return;
    const rect = host.getBoundingClientRect();
    const parentRect = this.root.getBoundingClientRect();
    const cx = rect.left - parentRect.left + rect.width / 2;
    const cy = rect.top - parentRect.top + rect.height / 2;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'gu-particle';
      p.textContent = glyph;
      p.style.left = cx + 'px';
      p.style.top = cy + 'px';
      this.root.appendChild(p);
      gsap.to(p, {
        x: (Math.random() - 0.5) * 70,
        y: -30 - Math.random() * 40,
        opacity: 0,
        rotation: (Math.random() - 0.5) * 90,
        duration: 0.9 + Math.random() * 0.4,
        ease: 'power2.out',
        onComplete: () => p.remove(),
      });
    }
  }

  private chip(icon: string, label: string, real: boolean, value: string, extra = '', vstyle = '') {
    return `<div class="chip ${real ? 'real' : 'demo'} ${extra}"><div class="l"><span class="ki">${icon}</span>${label} ${tag(real)}</div>` +
      `<div class="v"${vstyle ? ` style="${vstyle}"` : ''}>${value}</div></div>`;
  }

  private pOverview(m: DashModel) {
    const money = (n: number | null) => (n == null ? '—' : ksum(n) + ' ₽');
    return `<div class="chips">
      ${this.chip('💰', 'Выручка / мес', m.revenue.real, money(m.revenue.month))}
      ${this.chip('📦', 'Заказы / мес', m.orders.real, num(m.orders.month))}
      ${this.chip('👥', 'Контрагенты', m.clients.real, num(m.clients.total))}
      ${this.chip('🎯', 'Средний чек', m.orders.real, money(m.orders.avgCheck))}
      ${this.chip('🔮', 'Прогноз / мес', m.revenue.real, money(m.revenue.forecast))}
      ${this.chip('⚡', 'Заказы сегодня', m.orders.real, num(m.orders.today))}
    </div>
    ${m.debts.real ? this.chip('💰', `Долги клиентов${m.debts.count != null ? ` · ${m.debts.count}` : ''}`, true, rub(m.debts.total), 'debt', 'color:#ff9a7a') : ''}
    <div class="sub" style="margin-top:10px">Открой вкладки сверху — выручка по периодам, разбор по людям, задания на день и агенты.</div>`;
  }

  private pRevenue(m: DashModel) {
    const r = m.revenue;
    const val = this.revRange === 'today' ? r.today : this.revRange === 'week' ? r.week : r.month;
    const lbl = this.revRange === 'today' ? 'сегодня' : this.revRange === 'week' ? 'за 7 дней' : 'за месяц';
    const max = Math.max(1, ...r.series7.map((s) => s.v));
    const bestIdx = r.series7.reduce((bi, s, i, a) => (s.v > a[bi].v ? i : bi), 0);
    const bars = r.series7.map((s, i) =>
      `<div class="b ${i === 6 ? 'on' : ''}" title="${rub(s.v)}">${i === bestIdx && s.v > 0 ? '<span style="font-size:10px;line-height:1">👑</span>' : ''}<i style="height:${Math.round((s.v / max) * 80)}px"></i><span>${s.d}</span></div>`).join('');
    return `<div class="pills">
      <button data-rr="today" class="${this.revRange === 'today' ? 'on' : ''}">Сегодня</button>
      <button data-rr="week" class="${this.revRange === 'week' ? 'on' : ''}">7 дней</button>
      <button data-rr="month" class="${this.revRange === 'month' ? 'on' : ''}">Месяц</button>
    </div>
    <div class="big">${rub(val)}</div><div class="sub">выручка ${lbl} ${tag(r.real)}</div>
    <div class="bars">${bars}</div>
    <div class="sub">Динамика по дням недели (последний столбец — сегодня).</div>
    ${this.revRange === 'month' && r.forecast != null ? this.forecastBlock(r) : ''}`;
  }

  private forecastBlock(r: DashModel['revenue']) {
    const fc = r.forecast!;
    // План задан → XP-бар «босс ПЛАН»: факт (solid) + прогноз run-rate (фантомная засечка)
    if (r.plan != null && r.plan > 0 && r.month != null) {
      const factPct = Math.min(100, Math.round((r.month / r.plan) * 100));
      const fcPct = Math.min(100, Math.round((fc / r.plan) * 100));
      const win = fc >= r.plan;
      const left = Math.max(0, r.plan - fc);
      const daysLeft = r.daysInMonth != null && r.daysElapsed != null ? r.daysInMonth - r.daysElapsed : null;
      const twinkles = win ? [20, 50, 80].map((p) => `<span class="twk" style="left:${p}%;top:0">✨</span>`).join('') : '';
      return `<div class="chip" style="margin-top:10px">
        <div class="l">🎯 План месяца ${win ? '· 🎉 будет взят!' : ''}</div>
        <div class="xp ${win ? 'win' : ''}"><i class="fc" style="width:${fcPct}%"></i><i class="fact" style="width:${factPct}%"></i>${twinkles}</div>
        <div class="sub">факт ${rub(r.month)} (${factPct}%) · прогноз ${rub(fc)} (${fcPct}%) · план ${rub(r.plan)}</div>
        ${!win ? `<div class="sub" style="color:#ffce8a;margin-top:3px">⚔️ осталось добрать <b>${rub(left)}</b>${daysLeft != null ? ` за ${daysLeft} дн.` : ''}</div>` : ''}</div>`;
    }
    // Плана нет → просто прогноз run-rate (план можно задать через MONTHLY_PLAN на сервере)
    return `<div class="chip" style="margin-top:10px">
      <div class="l">📈 Прогноз к концу месяца</div>
      <div class="v" style="color:#e0b56a">${rub(fc)}</div>
      <div class="sub">по текущему темпу продаж (run-rate). Задай план — увидишь полосу «сколько добрать».</div></div>`;
  }


  private pManagers(m: DashModel) {
    const list = m.managers.list;
    const sorted = list.map((x, i) => ({ ...x, i })).sort((a, b) => b.revenue - a.revenue);
    const top = sorted[0]?.revenue || 1;
    const humans = list.filter((x) => !/админ|систем/i.test(x.name));
    const teamMaxOrders = Math.max(1, ...humans.map((x) => x.orders));
    const teamTopAvg = Math.max(1, ...humans.map((x) => x.revenue / Math.max(1, x.orders)));
    const medal = ['🏆', '🥈', '🥉'];
    const rows = sorted.map((x, rk) => {
      const ghost = /админ|систем/i.test(x.name);
      const cls = ghost ? 'ghost' : rk === 0 ? 'lead' : '';
      const sub = ghost
        ? '👻 заказы без хозяина'
        : `${rpgClass(x.orders, x.revenue, teamMaxOrders, teamTopAvg)} · ср.чек ${ksum(x.revenue / Math.max(1, x.orders))}₽`;
      return `<div class="r ${cls}" data-mgr="${x.i}" style="flex-wrap:wrap">
        <div class="rk">${ghost ? '👻' : medal[rk] || rk + 1}</div>
        <div class="nm" style="flex:1">${firstName(x.name)}<small>${sub}</small>
          <div class="sb"><i style="width:${Math.round((x.revenue / top) * 100)}%"></i></div></div>
        <div class="amt">${ksum(x.revenue)}₽<br><small style="color:#a99478;font-weight:400">${x.orders} зак.</small></div>
        <button class="btn s" data-show="${x.i}">Показать</button></div>`;
    }).join('');
    return `<div class="sub" style="margin-bottom:8px">Рейтинг по выручке за месяц ${tag(m.managers.real)}</div>
      <div class="rows">${rows}</div>`;
  }

  private pAgents(m: DashModel) {
    const sleeping = (m.clients.total != null && m.clients.active != null) ? Math.max(0, m.clients.total - m.clients.active) : null;
    const humans = m.managers.list.filter((x) => !/админ|систем/i.test(x.name));
    const byRev = [...humans].sort((a, b) => b.revenue - a.revenue);
    const lead = byRev[0], lag = byRev[byRev.length - 1];
    const tc = m.topClients;
    const rl = m.reactivation?.lastMonth ?? null;   // прошлый полный месяц (напр. май)
    const rt = m.reactivation?.thisMonth ?? null;   // текущий месяц (по сегодня)
    const stepResult = rl
      ? `🏆 ${rl.label}: вернул ${rl.clients} ${plural(rl.clients, 'клиент', 'клиента', 'клиентов')} → +${rub(rl.revenue)} (${rl.orders} зак.)`
      : null;
    const stepSub = rt && rt.revenue > 0 ? `${rt.label}: уже +${rub(rt.revenue)} · ${rt.clients} верн.` : null;
    const agents: { dot: string; emoji: string; dog: string; role: string; real: boolean; status: string; result?: string | null; sub?: string | null }[] = [
      { dot: '#e05a5a', emoji: '👔', dog: 'Геннадий', role: 'Аналитик менеджеров', real: m.managers.real && humans.length > 0,
        status: humans.length > 0 ? `${humans.length} менеджеров · лидер ${firstName(lead.name)} (${ksum(lead.revenue)}₽), разобрать ${firstName(lag.name)}` : 'ждёт данных по менеджерам' },
      { dot: '#5a8ae0', emoji: '🏆', dog: 'Алёша', role: 'Ключевые клиенты', real: tc.length > 0,
        status: tc.length > 0 ? `топ: ${tc.slice(0, 3).map((c) => c.name).join(', ')} · #1 ${rub(tc[0].revenue)}` : 'считает топ клиентов месяца' },
      { dot: '#a06ae0', emoji: '📈', dog: 'Жорик', role: 'Аналитик продаж', real: m.revenue.real,
        status: m.revenue.forecast != null ? `прогноз выручки ${rub(m.revenue.forecast)} · следит за темпом` : 'ждёт данных выручки' },
      { dot: '#5ec46a', emoji: '📞', dog: 'Степаныч', role: 'Возврат клиентов', real: (rl != null) || m.clients.active != null,
        status: sleeping != null ? `${sleeping.toLocaleString('ru-RU')} клиентов давно не заказывали · готовит обзвон` : 'ищет «спящих» клиентов',
        result: stepResult, sub: stepSub },
    ];
    const rows = agents.map((a) => {
      const badge = a.real ? tag(true) : '<span class="src d">нет данных</span>';
      const res = a.result
        ? `<div style="margin-top:5px;padding:5px 8px;border-radius:7px;background:#1f3a28;border:1px solid #3a6a48;color:#8fe6a8;font-weight:700;font-size:11px">${a.result}${a.sub ? `<br><span style="color:#bfe9cc;font-weight:600;opacity:.85">${a.sub}</span>` : ''}</div>`
        : '';
      return `<div class="r"><div class="rk" style="color:${a.dot}">🐕</div>
        <div class="nm">${a.emoji} ${a.dog} <span style="color:#c9a06a">· ${a.role}</span> ${badge}<small>${a.status}</small>${res}</div></div>`;
    }).join('');
    const clientList = tc.length ? `<div class="rows" style="margin-top:10px">` + tc.map((c, i) =>
      `<div class="r"><div class="rk">${i === 0 ? '🏆' : i + 1}</div><div class="nm" style="flex:1">${c.name}<small>${c.orders} зак.</small></div><div class="amt">${ksum(c.revenue)}₽</div></div>`).join('') + `</div>` : '';
    return `<div class="sub" style="margin-bottom:8px">ИИ-агенты на ваших реальных данных 1С 🐕</div>
      <div class="rows">${rows}</div>
      ${clientList ? `<div class="sub" style="margin:12px 0 4px">🏆 Ключевые клиенты месяца</div>${clientList}` : ''}`;
  }

  private pTasks(m: DashModel) {
    const list = m.tasks.today; // только реальные задачи на сегодня (демо-POOL убран)
    const set = this.doneSet();
    const done = list.filter((t) => t.done || set.has(t.id)).length;
    const pct = list.length ? Math.round((done / list.length) * 100) : 0;
    if (!list.length) return `<div class="sub">На сегодня задач из 1С нет — всё под контролем 👍</div>`;
    const cards = list.map((t) => this.taskCard(t)).join('');
    return `<div class="qhdr"><div class="qbar"><i style="width:${pct}%"></i></div>
      <span class="qrank">${done}/${list.length} · ${DAY_RANK(done, list.length)}</span></div>
    <div class="rows">${cards}</div>`;
  }

  private taskCard(t: OwnerTask) {
    const show = t.managerIndex !== undefined ? `<button class="btn s" data-show="${t.managerIndex}">Показать</button>` : '';
    const done = t.done || this.doneSet().has(t.id);
    const isReal = !!t.source && t.source !== 'демо';
    const badge = t.source ? `<span class="src ${isReal ? 'r' : 'd'}">${t.source}</span>` : '';
    return `<div class="card${done ? ' done' : ''}" style="border-left-color:${PRIO[t.priority]}">
      <div class="t"><span class="ic">${t.icon}</span>${t.title}
        ${badge}
        <span class="pr" style="background:${PRIO[t.priority]}">${PRIOL[t.priority]}</span></div>
      <div class="d">${t.detail}</div><div class="a">→ ${t.action}</div>
      ${agentForTask(t.id) ? `<div class="agtask">🐕 ${agentForTask(t.id)} взял в работу</div>` : ''}
      <div class="bt">${show}<button class="btn k" data-done data-id="${t.id}">${done ? 'Вернуть' : 'Готово'}</button></div></div>`;
  }

  // persisted "Готово" — date- and tab-scoped so it resets when the snapshot rolls over
  private doneKey() { return `bizgame.done.${this.model?.asOf || 'x'}`; }
  private doneSet(): Set<string> {
    try { return new Set(JSON.parse(localStorage.getItem(this.doneKey()) || '[]')); }
    catch { return new Set(); }
  }
  private saveDone(s: Set<string>) {
    try { localStorage.setItem(this.doneKey(), JSON.stringify([...s])); } catch { /* ignore */ }
  }

  private bind() {
    this.content.querySelectorAll('[data-rr]').forEach((b) =>
      ((b as HTMLElement).onclick = () => { this.revRange = (b as HTMLElement).dataset.rr as any; this.render(); }));
    this.content.querySelectorAll('[data-show]').forEach((b) =>
      ((b as HTMLElement).onclick = () => {
        const i = Number((b as HTMLElement).dataset.show);
        this.onShow(i);
        this.pingRow(i); // синхронная подсветка строки в панели ↔ подсветка стола в офисе
      }));
    this.content.querySelectorAll('[data-done]').forEach((b) =>
      ((b as HTMLElement).onclick = () => {
        const id = (b as HTMLElement).dataset.id!;
        const s = this.doneSet();
        const wasDone = s.has(id);
        if (wasDone) s.delete(id); else s.add(id);
        this.saveDone(s);
        if (wasDone || this.calm) { this.render(); this.checkAllHighDone(); return; }
        // quest-complete: штамп ✓ + зелёная вспышка + конфетти + сворачивание, затем re-render
        const card = (b as HTMLElement).closest('.card') as HTMLElement;
        const stamp = document.createElement('span');
        stamp.className = 'stamp'; stamp.textContent = '✓';
        card.appendChild(stamp);
        gsap.fromTo(stamp, { scale: 1.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2)' });
        gsap.fromTo(card, { backgroundColor: '#3a5a30' }, { backgroundColor: '#2a2014', duration: 0.6 });
        this.burst(card, '✨', 8);
        gsap.delayedCall(0.55, () => { card.classList.add('collapsing'); });
        gsap.delayedCall(0.95, () => { this.render(); this.checkAllHighDone(); });
      }));
  }

  // подсветить строку менеджера в панели (вызывается из onShow и кнопки «Показать»)
  private pingRow(i: number) {
    if (this.calm) return;
    const row = this.content.querySelector(`.r[data-mgr="${i}"]`) as HTMLElement;
    if (row) gsap.fromTo(row, { backgroundColor: '#caa15a55' }, { backgroundColor: 'rgba(0,0,0,0)', duration: 1.1, ease: 'power2.out' });
  }

  // все срочные (high) задания дня закрыты → баннер-салют (один раз за «закрытие»)
  private checkAllHighDone() {
    if (!this.model) return;
    const set = this.doneSet();
    const high = this.model.tasks.today.filter((t) => t.priority === 'high');
    if (high.length < 2 || !high.every((t) => t.done || set.has(t.id))) return;
    this.showBanner('🎉 Все срочные задачи закрыты — день под контролем!');
  }

  private showBanner(text: string) {
    this.root.querySelector('.banner')?.remove();
    const b = document.createElement('div');
    b.className = 'banner'; b.textContent = text;
    this.root.appendChild(b);
    if (!this.calm) this.burst(b, '🎉', 14);
    setTimeout(() => { gsap.to(b, { opacity: 0, y: -10, duration: 0.4, onComplete: () => b.remove() }); }, 2600);
  }

  // живой тикер: лента последних РЕАЛЬНЫХ заказов из 1С (стопка из 4), цвет/иконка по типу
  private tickFeed: { html: string; kind: string }[] = [];
  pushEvent(text: string, kind: 'order' | 'courier' | 'debt' | 'info' = 'info') {
    const cls = kind === 'order' ? 'gold' : kind === 'debt' ? 'dmg' : kind === 'courier' ? 'cool' : '';
    this.tickFeed.unshift({ html: `<span class="e ${cls}">${text}</span>`, kind });
    this.tickFeed = this.tickFeed.slice(0, 4);
    this.ticker.innerHTML = this.tickFeed.map((e) => e.html).join('');
    const first = this.ticker.querySelector('.e') as HTMLElement;
    if (first && !this.calm) gsap.fromTo(first, { x: -12, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: 'power2.out' });
  }

  // большой ретро-баннер по центру экрана офиса («LEVEL CLEAR»-стиль)
  saleBanner(text: string) {
    document.getElementById('gu-bigbanner')?.remove();
    const mob = window.matchMedia('(max-width:760px)').matches;
    const wrap = document.createElement('div');
    wrap.id = 'gu-bigbanner';
    wrap.style.cssText = 'position:absolute;z-index:75;pointer-events:none;display:flex;align-items:center;justify-content:center;'
      + (mob ? 'left:0;right:0;top:0;height:42%;' : 'left:0;top:0;bottom:0;right:340px;');
    const t = document.createElement('div');
    t.textContent = text;
    t.style.cssText = "font-family:'Arial Black',Impact,system-ui,sans-serif;font-weight:900;text-transform:uppercase;text-align:center;line-height:1.05;"
      + `font-size:${mob ? '9vw' : '58px'};letter-spacing:3px;`
      + 'background:linear-gradient(180deg,#fff3b0,#ffce4a 48%,#e8902a);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:#ffce4a;'
      + '-webkit-text-stroke:2px #3a2408;'
      + 'filter:drop-shadow(0 5px 0 #7a4a10) drop-shadow(0 0 22px #ffb43caa);';
    wrap.appendChild(t);
    document.body.appendChild(wrap);
    // удар появления → лёгкое «дыхание» → исчезновение (≈2.7с, под ×2 длительность праздника)
    const tl = gsap.timeline({ onComplete: () => wrap.remove() });
    tl.fromTo(t, { scale: 0.2, rotation: -8 }, { scale: 1, rotation: 0, duration: 0.5, ease: 'back.out(2.4)' })
      .to(t, { scale: 1.07, duration: 1.7, ease: 'sine.inOut' })
      .to(wrap, { opacity: 0, duration: 0.5, ease: 'power2.in' });
  }

  // 🗄 Терминал «база клиентов» Степаныча: быстрый скролл СИНТЕТИЧЕСКИХ (не реальных!) данных,
  // заблюренных — визуально показывает «ИИ видит всю базу», без показа настоящих клиентов.
  showClientData() {
    document.getElementById('gu-db-ov')?.remove();
    const m = this.model;
    const total = m?.clients.total ?? 3092;
    const dormant = m?.dormant ?? 117;

    const ri = (n: number) => Math.floor(Math.random() * n);
    const pad = (n: number, l: number) => String(n).padStart(l, '0');
    const types = ['Студия', 'Салон', 'Барбершоп', 'Бьюти-бар', 'СПА', 'ИП', 'Студия красоты'];
    const names = ['Аврора', 'Шарм', 'Лотос', 'Глянец', 'Грация', 'Нимфа', 'Мираж', 'Эстетика', 'Каприз',
      'Багира', 'Жемчуг', 'Орхидея', 'Камелия', 'Вуаль', 'Локон', 'Блеск', 'Фея', 'Магнолия', 'Сапфир', 'Ренессанс'];
    const cities = ['Москва', 'СПб', 'Краснодар', 'Казань', 'Сочи', 'Ростов', 'Самара', 'Уфа', 'Тюмень', 'Пермь', 'Воронеж', 'Анапа'];
    const brands = ['Estel', 'Kapous', 'Ollin', 'CONCEPT', 'Bouticle', 'Lebel', 'Selective', 'Dewal'];
    const stats = ['активен', 'активен', 'спящий', 'новый', 'VIP'];

    const row = () => {
      const orders = 3 + ri(220);
      const avg = 4000 + ri(15000);
      const ltv = orders * avg;
      const phone = `+7 9${pad(ri(100), 2)} ${pad(ri(1000), 3)}-${pad(ri(100), 2)}-${pad(ri(100), 2)}`;
      const last = `${pad(1 + ri(28), 2)}.${pad(1 + ri(12), 2)}.202${4 + ri(2)}`;
      return `<div class="dbrow">
        <span class="c-nm">${types[ri(types.length)]} «${names[ri(names.length)]}»</span>
        <span class="c-ci">${cities[ri(cities.length)]}</span>
        <span class="c-ph">${phone}</span>
        <span class="c-or">${orders} зак.</span>
        <span class="c-av">${ksum(avg)}₽ ср.</span>
        <span class="c-lt">LTV ${ksum(ltv)}₽</span>
        <span class="c-br">${brands[ri(brands.length)]}</span>
        <span class="c-ls">посл. ${last}</span>
        <span class="c-st">${stats[ri(stats.length)]}</span>
      </div>`;
    };
    const block = Array.from({ length: 28 }, row).join('');

    const ov = document.createElement('div');
    ov.id = 'gu-db-ov';
    ov.innerHTML = `
      <div class="x">✕</div>
      <div class="dbh">
        <div class="t">🐶 СТЕПАНЫЧ · доступ к базе клиентов</div>
        <div class="s"><span class="dot"></span>подключено к 1С · ${total.toLocaleString('ru-RU')} контрагентов · ${dormant} спящих · знает по каждому: заказы, чек, LTV, бренды, контакты, историю</div>
      </div>
      <div class="dbwrap">
        <div class="dbrows">${block}${block}</div>
        <div class="scan"></div>
        <div class="gfade"></div>
        <div class="hint">данные обезличены · нажмите, чтобы закрыть</div>
      </div>`;
    ov.onclick = () => ov.remove();
    document.body.appendChild(ov);
  }

  destroy() {
    this.root.remove();
    this.saleBtn?.remove();
    this.dbBtn?.remove();
    document.getElementById('gu-bigbanner')?.remove();
    document.getElementById('gu-db-ov')?.remove();
  }
}
