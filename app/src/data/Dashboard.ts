// Dashboard model — assembles a tycoon-style data model from the real 1C
// snapshot (where available, tagged "1С") + plausible demo fill (tagged "демо").
// Swap demo fill for real queries as the 1C/CRM seam fills in.
import { type OwnerTask, type Priority } from './Briefing';

export interface ManagerStat { name: string; orders: number; revenue: number }
export interface ReactPeriod { label: string; revenue: number; orders: number; clients: number }
export interface DebtItem { name: string; amount: number; overdue: number }
export interface DashModel {
  company: string;
  day: number;
  asOf: string;
  source: string;
  live: boolean;  // real.json loaded with real 1C KPIs (vs. no connection → demo)
  fresh: boolean; // snapshot asOf is today (else data is stale)
  generatedAt: string; // точное время сборки снапшота (UTC ISO) — для маячка «1С»
  bitrix: { lastSync: string | null; errors: number; totalSynced: number } | null; // статус моста 1С→Битрикс
  revenue: { today: number | null; week: number | null; month: number | null; forecast: number | null; plan: number | null; daysElapsed: number | null; daysInMonth: number | null; real: boolean; series7: { d: string; v: number }[] };
  orders: { today: number | null; month: number | null; avgCheck: number | null; real: boolean };
  clients: { total: number | null; active: number | null; real: boolean };
  dormant: number | null; // спящих клиентов (из правил моста), для терминала Степаныча
  debts: { total: number | null; count: number | null; prevTotal: number | null; real: boolean };
  managers: { list: ManagerStat[]; real: boolean };
  topClients: { name: string; orders: number; revenue: number }[];
  recentOrders: { number: string; date: string; sum: number; client: string }[];
  reactivation: { lastMonth: ReactPeriod | null; thisMonth: ReactPeriod | null } | null;
  tasks: { today: OwnerTask[]; yesterday: OwnerTask[] };
}

export interface Snapshot {
  asOf?: string;
  generatedAt?: string;
  bitrix?: { lastSync?: string; updated?: number; errors?: number; totalSynced?: number };
  source?: string;
  kpi?: {
    ordersMonth?: number; clients?: number; ordersToday?: number; revenueMonth?: number | null;
    avgCheck?: number; forecastMonth?: number; daysElapsed?: number; daysInMonth?: number;
    activeClientsMonth?: number; planMonth?: number | null;
  };
  managers?: { name: string; orders: number; revenue: number }[];
  topClients?: { name: string; orders: number; revenue: number }[];
  recentOrders?: { number: string; date: string; sum: number; client: string }[];
  debts?: { total: number; count?: number; prevTotal?: number | null; asOf?: string };
  dormant?: { count: number };
  reactivation?: { lastMonth?: ReactPeriod; thisMonth?: ReactPeriod; matchedCompanies?: number };
  brandTrend?: { brand: string; dropPct: number; proj: number; prev: number };
  revenue7?: { d: string; v: number }[];
  tasks?: OwnerTask[];
}

// Имя без фамилии. В 1С пользователи хранятся как «Фамилия Имя Отчество»,
// поэтому имя — второй токен. Для односложных («Администратор») и демо
// («Менеджер 1») возвращаем как есть.
export function firstName(full: string): string {
  const t = (full || '').trim().split(/\s+/);
  if (t.length < 2) return t[0] || '';
  if (/^\d+$/.test(t[1])) return full; // «Менеджер 1» → не резать
  return t[1];
}

const rnd = (a: number, b: number) => Math.floor(a + Math.random() * (b - a));
const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// Actionable insights computed from real per-manager numbers.
function managerInsights(list: ManagerStat[]): OwnerTask[] {
  const out: OwnerTask[] = [];
  const rub = (n: number) => Math.round(n).toLocaleString('ru-RU') + ' ₽';
  const withAvg = list.map((m, i) => ({ ...m, i, avg: m.revenue / Math.max(1, m.orders) }));
  const humans = withAvg.filter((m) => !/админ|систем/i.test(m.name));
  if (humans.length >= 2) {
    const maxOrders = Math.max(...humans.map((m) => m.orders));
    const topAvg = Math.max(...humans.map((m) => m.avg));
    const low = [...humans].sort((a, b) => a.avg - b.avg)[0];
    // many orders but the lowest average check → small-deal pattern
    if (low.orders >= maxOrders * 0.75 && low.avg < topAvg * 0.7) {
      out.push({
        id: 'i-avg', priority: 'med', icon: '🧮',
        title: `Мелкие чеки: ${firstName(low.name)}`,
        detail: `${low.orders} заказов, но средний чек ${rub(low.avg)} (у лидера ~${rub(topAvg)}). Много мелких сделок — теряем маржу.`,
        action: 'Разобрать ассортимент, поднять средний чек/допродажи',
        managerIndex: low.i, source: '1С',
      });
    }
  }
  const sys = withAvg.find((m) => /админ|систем/i.test(m.name));
  if (sys && sys.orders > 0) {
    out.push({
      id: 'i-sys', priority: 'high', icon: '🕵️',
      title: `${sys.orders} заказов без менеджера`,
      detail: `${sys.orders} заказов на ${rub(sys.revenue)} оформлены под системным аккаунтом «${sys.name}» — не закреплены за людьми, выпадают из мотивации и аналитики.`,
      action: 'Назначить ответственных менеджеров на эти заказы',
      managerIndex: sys.i, source: '1С',
    });
  }
  return out;
}

// Брифинг собственника: «на что обратить внимание сегодня» — из реальных данных
// (дебиторка/спящие/тренд брендов из моста, крупная сделка и менеджеры из заказов).
const rubT = (n: number) => Math.round(n).toLocaleString('ru-RU') + ' ₽';
function ownerBrief(snap: Snapshot, managers: ManagerStat[]): OwnerTask[] {
  const out: OwnerTask[] = [];

  // 💰 дебиторка (реальная, с трендом)
  const d = snap.debts;
  if (d && d.total > 0) {
    const grew = d.prevTotal != null && d.total > d.prevTotal;
    const delta = d.prevTotal != null ? d.total - d.prevTotal : 0;
    out.push({
      id: 'debt', priority: 'high', icon: '💰',
      title: `Дебиторка: ${rubT(d.total)}`,
      detail: `${d.count ?? '—'} контрагентов должны.${grew ? ` Долг вырос на ${rubT(delta)} — деньги зависают.` : ''}`,
      action: 'Назначить обзвон по крупнейшим должникам',
      source: '1С',
    });
  }

  // 📉 менеджер проседает (живые люди, без системного аккаунта)
  const humans = managers.filter((m) => !/админ|систем/i.test(m.name));
  if (humans.length >= 2) {
    const sorted = [...humans].sort((a, b) => b.revenue - a.revenue);
    const lead = sorted[0], low = sorted[sorted.length - 1];
    if (low.revenue > 0 && low.revenue < lead.revenue * 0.4) {
      const x = Math.max(2, Math.round(lead.revenue / Math.max(1, low.revenue)));
      out.push({
        id: 'm-low', priority: 'high', icon: '📉',
        title: `Проседает: ${firstName(low.name)}`,
        detail: `${low.orders} зак / ${rubT(low.revenue)} за месяц — в ${x}× ниже лидера (${firstName(lead.name)}). Разобрать загрузку и мотивацию.`,
        action: 'Послушать звонки, поставить план',
        managerIndex: managers.indexOf(low), source: '1С',
      });
    }
  }

  // ⚡ крупная сделка (самый большой из последних заказов)
  const ro = snap.recentOrders ?? [];
  if (ro.length) {
    const big = [...ro].sort((a, b) => b.sum - a.sum)[0];
    const avg = snap.kpi?.avgCheck ?? 0;
    if (big && big.sum > Math.max(40000, avg * 3)) {
      out.push({
        id: 'big', priority: 'med', icon: '⚡',
        title: `Крупная сделка: ${rubT(big.sum)}`,
        detail: `Заказ №${big.number} от «${big.client}». Проконтролируйте отгрузку и оплату — такие сделки нельзя потерять.`,
        action: 'Проверить статус заказа лично',
        source: '1С',
      });
    }
  }

  // 😴 спящие клиенты (реальный счётчик из моста)
  if (snap.dormant && snap.dormant.count > 0) {
    out.push({
      id: 'dormant', priority: 'med', icon: '😴',
      title: `Спящих клиентов: ${snap.dormant.count}`,
      detail: `${snap.dormant.count} клиентов раньше заказывали регулярно, но молчат 14+ дней. Реактивация — самый дешёвый рост.`,
      action: 'Запустить обзвон/рассылку по спящим',
      source: '1С',
    });
  }

  // 📊 бренд проседает (run-rate месяца vs прошлый)
  const b = snap.brandTrend;
  if (b) {
    out.push({
      id: 'brand', priority: 'med', icon: '📊',
      title: `Бренд проседает: ${b.brand}`,
      detail: `${b.brand}: по текущему темпу ${rubT(b.proj)} против ${rubT(b.prev)} в прошлом месяце (−${b.dropPct}%). Понять причину спада.`,
      action: 'Разобрать ассортимент и активность по бренду',
      source: '1С',
    });
  }

  return out;
}

export function buildModel(snap: Snapshot): DashModel {
  // "live" = real.json actually delivered real 1C KPIs. When the snapshot is
  // missing/empty we DO NOT silently substitute plausible-looking numbers —
  // KPI chips show "—" and the header flags "нет связи с 1С".
  const hasKpi = snap.kpi?.ordersMonth != null;
  const ordersMonth = hasKpi ? (snap.kpi!.ordersMonth as number) : null;
  const clients = snap.kpi?.clients ?? null;
  const ordersToday = snap.kpi?.ordersToday ?? null;
  const realRevenue = snap.kpi?.revenueMonth != null;
  const monthRev = realRevenue ? (snap.kpi!.revenueMonth as number) : null;

  // 7-day revenue series — real from snapshot when present, else demo (clearly tagged)
  const realSeries = snap.revenue7?.length === 7;
  const demoBase = Math.round((monthRev ?? 4_000_000) / 30);
  const series7 = realSeries
    ? snap.revenue7!.map((s) => ({ d: s.d, v: Math.round(s.v) }))
    : Array.from({ length: 7 }, (_, i) => ({
        d: DOW[(new Date().getDay() + 6 - (6 - i)) % 7],
        v: Math.max(0, Math.round(demoBase * (0.6 + Math.random() * 0.9))),
      }));
  const week = realSeries ? series7.reduce((s, x) => s + x.v, 0) : null;
  const today = realSeries ? series7[6].v : null;

  // managers: real if snapshot has them, else demo
  let managers: ManagerStat[];
  let mReal = false;
  if (snap.managers?.length) {
    mReal = true;
    managers = snap.managers.map((m) => ({ name: m.name, orders: m.orders, revenue: m.revenue }));
  } else {
    managers = Array.from({ length: 5 }, (_, i) => {
      const orders = rnd(40, 130);
      return { name: `Менеджер ${i + 1}`, orders, revenue: orders * rnd(36000, 52000) };
    });
  }

  // Дебиторка — реальная из моста 1С→Битрикс (сумма + число должников + тренд)
  const dbt = snap.debts;

  // Брифинг собственника: всё на реальных данных, сортировка по приоритету (high→low)
  const rank: Record<Priority, number> = { high: 0, med: 1, low: 2 };
  const insights = mReal ? managerInsights(managers) : [];
  const todayTasks = [...ownerBrief(snap, managers), ...insights]
    .sort((a, b) => rank[a.priority] - rank[b.priority]);

  const start = new Date(2025, 8, 1); // условная дата запуска "игры"
  const day = Math.max(1, Math.round((Date.now() - start.getTime()) / 86400000));

  const todayStr = new Date().toLocaleDateString('ru-RU'); // dd.mm.yyyy — matches snapshot asOf
  const asOf = snap.asOf ?? '';
  const fresh = !!asOf && asOf === todayStr;

  return {
    company: 'ООО «Бьютистиль» · Дистрибуция косметики',
    day,
    asOf,
    source: snap.source ?? '1С',
    live: hasKpi,
    fresh,
    generatedAt: snap.generatedAt ?? '',
    bitrix: snap.bitrix ? { lastSync: snap.bitrix.lastSync ?? null, errors: snap.bitrix.errors ?? 0, totalSynced: snap.bitrix.totalSynced ?? 0 } : null,
    revenue: {
      today, week, month: monthRev,
      forecast: snap.kpi?.forecastMonth ?? null,
      plan: snap.kpi?.planMonth ?? null,
      daysElapsed: snap.kpi?.daysElapsed ?? null,
      daysInMonth: snap.kpi?.daysInMonth ?? null,
      real: realRevenue, series7,
    },
    orders: { today: ordersToday, month: ordersMonth, avgCheck: snap.kpi?.avgCheck ?? null, real: hasKpi },
    clients: { total: clients, active: snap.kpi?.activeClientsMonth ?? null, real: snap.kpi?.clients != null },
    dormant: snap.dormant?.count ?? null,
    debts: { total: dbt?.total ?? null, count: dbt?.count ?? null, prevTotal: dbt?.prevTotal ?? null, real: !!dbt },
    managers: { list: managers, real: mReal },
    topClients: snap.topClients ?? [],
    recentOrders: snap.recentOrders ?? [],
    reactivation: snap.reactivation
      ? { lastMonth: snap.reactivation.lastMonth ?? null, thisMonth: snap.reactivation.thisMonth ?? null }
      : null,
    tasks: { today: todayTasks, yesterday: [] },
  };
}
