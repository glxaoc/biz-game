// HTML HUD over the canvas: KPI chips seeded from a real 1C snapshot + a live
// event ticker (demo stream). Numbers come from data/real.json via setSnapshot.
export interface ManagerStat { name: string; orders: number; revenue: number }
export interface Snapshot {
  asOf: string;
  source: string;
  kpi: { ordersMonth: number; clients: number; ordersToday: number; revenueMonth?: number | null };
  managers?: ManagerStat[];
}

export class Hud {
  private root: HTMLDivElement;
  private ticker: HTMLDivElement;

  constructor() {
    document.getElementById('hud')?.remove();
    const root = document.createElement('div');
    root.id = 'hud';
    root.innerHTML = `
      <style>
        #hud{position:absolute;left:0;top:0;width:100%;pointer-events:none;
          font-family:'Segoe UI',system-ui,sans-serif;color:#f4efe6;z-index:50}
        #hud .bar{display:flex;gap:10px;padding:10px 12px;align-items:center}
        #hud .kpi{background:#241c14e6;border:1px solid #6b513a;border-radius:10px;
          padding:7px 13px;min-width:92px;box-shadow:0 2px 10px #0007}
        #hud .kpi .l{font-size:10px;letter-spacing:.4px;color:#c9a06a;text-transform:uppercase}
        #hud .kpi .v{font-size:19px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}
        #hud .live{display:flex;align-items:center;gap:6px;font-size:11px;color:#a9c5a0;
          background:#1c2417cc;border:1px solid #3f5a36;border-radius:20px;padding:5px 11px}
        #hud .live .dot{width:8px;height:8px;border-radius:50%;background:#5fd06a;
          box-shadow:0 0 8px #5fd06a;animation:hudpulse 1.6s infinite}
        @keyframes hudpulse{0%,100%{opacity:1}50%{opacity:.35}}
        #hud .tick{position:absolute;left:12px;bottom:12px;width:250px;display:flex;
          flex-direction:column-reverse;gap:4px}
        #hud .tick .e{background:#241c14d8;border:1px solid #6b513a;border-radius:8px;
          padding:4px 9px;font-size:11px;opacity:0;transform:translateY(4px);
          transition:opacity .3s,transform .3s}
        #hud .tick .e.show{opacity:1;transform:none}
      </style>
      <div class="bar">
        <div class="kpi"><div class="l">Выручка за май</div><div class="v" id="hud-rev">—</div></div>
        <div class="kpi"><div class="l">Заказы за май</div><div class="v" id="hud-ord">—</div></div>
        <div class="kpi"><div class="l">Контрагенты</div><div class="v" id="hud-cli">—</div></div>
        <div class="kpi"><div class="l">Заказы сегодня</div><div class="v" id="hud-tod">—</div></div>
        <div class="live"><span class="dot"></span><span id="hud-live">подключение…</span></div>
      </div>
      <div class="tick" id="hud-tick"></div>`;
    document.body.appendChild(root);
    this.root = root;
    this.ticker = root.querySelector('#hud-tick')!;
  }

  setSnapshot(s: Snapshot) {
    const rev = s.kpi.revenueMonth;
    (this.root.querySelector('#hud-rev') as HTMLElement).textContent =
      rev == null ? '—' : rev >= 1e6 ? (rev / 1e6).toFixed(1) + ' млн ₽' : rev.toLocaleString('ru-RU') + ' ₽';
    (this.root.querySelector('#hud-ord') as HTMLElement).textContent = s.kpi.ordersMonth.toLocaleString('ru-RU');
    (this.root.querySelector('#hud-cli') as HTMLElement).textContent = s.kpi.clients.toLocaleString('ru-RU');
    (this.root.querySelector('#hud-tod') as HTMLElement).textContent = String(s.kpi.ordersToday);
    (this.root.querySelector('#hud-live') as HTMLElement).textContent = `${s.source} · на ${s.asOf}`;
  }

  // event ticker (demo live stream on top of the real snapshot)
  addOrder(amount: number) { this.event(`🧾 Заказ +${amount.toLocaleString('ru-RU')} ₽`); }
  addClient() { this.event('🚚 Курьер за заказом'); }
  flagDebt(amount: number) { this.event(`⚠️ Долг ${amount.toLocaleString('ru-RU')} ₽`); }

  private event(text: string) {
    const e = document.createElement('div');
    e.className = 'e';
    e.textContent = text;
    this.ticker.appendChild(e);
    requestAnimationFrame(() => e.classList.add('show'));
    while (this.ticker.children.length > 5) this.ticker.firstChild!.remove();
    setTimeout(() => { e.classList.remove('show'); setTimeout(() => e.remove(), 400); }, 5000);
  }

  destroy() { this.root.remove(); }
}
