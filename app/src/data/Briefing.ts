// Owner's daily briefing — the actionable "what to pay attention to today" list.
// Now generated from plausible simulated business data; later produced from real
// 1C / Bitrix data + AI call analysis (same OwnerTask shape, swap the source).

export type Priority = 'high' | 'med' | 'low';

export interface OwnerTask {
  id: string;
  priority: Priority;
  icon: string;
  title: string;
  detail: string;
  action: string; // suggested next step for the owner
  managerIndex?: number; // 0..4 → highlight Менеджер N+1 in the office
  source?: string; // e.g. "1С" when grounded in real data
  done?: boolean;
}

const MGR = (i: number) => `Менеджер ${i + 1}`;
const CLIENTS = ['ООО «Ромашка»', 'ООО «Лазурит»', 'ИП Соколов', 'ООО «СеверТорг»', 'ООО «Аврора»', 'ТД «Весна»'];
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const rub = (n: number) => n.toLocaleString('ru-RU') + ' ₽';
const rnd = (a: number, b: number) => Math.floor(a + Math.random() * (b - a));

// A pool of task generators; the briefing picks a prioritized subset each day.
type Gen = () => OwnerTask;
const POOL: Gen[] = [
  () => {
    const total = rnd(6, 14) * 100000;
    const top = pick(CLIENTS);
    const days = rnd(7, 45);
    return {
      id: 'debt', priority: 'high', icon: '💰',
      title: `Дебиторка: ${rub(total)}`,
      detail: `${rnd(4, 9)} клиентов должны. Крупнейший — ${top}, ${rub(rnd(2, 5) * 100000)}, просрочка ${days} дн.`,
      action: 'Поставить менеджеру задачу напомнить об оплате',
    };
  },
  () => {
    const i = rnd(0, 5);
    const mins = rnd(35, 70);
    return {
      id: 'slow', priority: 'high', icon: '⏱️',
      title: `Медленный отклик: ${MGR(i)}`,
      detail: `Среднее время ответа на заявку — ${mins} мин (норма 15). Горячие лиды остывают.`,
      action: 'Разобрать причину, поставить SLA',
      managerIndex: i,
    };
  },
  () => {
    const i = rnd(0, 5);
    const c = pick(CLIENTS);
    return {
      id: 'call', priority: 'high', icon: '🎧',
      title: `Разбор звонка: ${MGR(i)}`,
      detail: `AI-анализ: в разговоре с ${c} менеджер был резок и не отработал возражение. Клиент недоволен.`,
      action: 'Прослушать звонок, дать обратную связь',
      managerIndex: i,
    };
  },
  () => {
    const i = rnd(0, 5);
    return {
      id: 'best', priority: 'low', icon: '🏆',
      title: `Лидер недели: ${MGR(i)}`,
      detail: `${rnd(12, 22)} заказов, выручка ${rub(rnd(4, 8) * 100000)}, конверсия ${rnd(30, 45)}%.`,
      action: 'Отметить, дать премию',
      managerIndex: i,
    };
  },
  () => {
    const i = rnd(0, 5);
    return {
      id: 'conv', priority: 'med', icon: '📉',
      title: `Низкая конверсия: ${MGR(i)}`,
      detail: `Конверсия ${rnd(8, 16)}% против ${rnd(26, 34)}% по команде. Много слитых заявок.`,
      action: 'Послушать звонки, обучить скрипту',
      managerIndex: i,
    };
  },
  () => {
    const c = pick(CLIENTS);
    return {
      id: 'stuck', priority: 'med', icon: '🧊',
      title: `Завис заказ ${rub(rnd(15, 30) * 10000)}`,
      detail: `Заказ №${rnd(4500, 4600)} (${c}) в статусе «счёт выставлен» уже ${rnd(5, 11)} дн.`,
      action: 'Уточнить у клиента, не потерять сделку',
    };
  },
  () => {
    const c = pick(CLIENTS);
    return {
      id: 'upsell', priority: 'low', icon: '✨',
      title: `Возможность допродажи`,
      detail: `${c} берёт регулярно один товар — есть основание предложить смежный ассортимент.`,
      action: 'Дать менеджеру задачу на допродажу',
    };
  },
];

export function generateBriefing(): OwnerTask[] {
  // POOL — демонстрационные задачи (пока нет связи с 1С). Помечаем source='демо',
  // чтобы в UI они визуально отличались от реальных и не вводили собственника в заблуждение.
  const gens = [...POOL].sort(() => Math.random() - 0.5).slice(0, 6).map((g) => {
    const t = g();
    return { ...t, source: t.source ?? 'демо' };
  });
  const rank: Record<Priority, number> = { high: 0, med: 1, low: 2 };
  return gens.sort((a, b) => rank[a.priority] - rank[b.priority]);
}
