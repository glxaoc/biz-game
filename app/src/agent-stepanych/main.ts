import { AgentCard, rub, num } from '../agent/shell';

AgentCard({
  id: 'stepanych',
  name: 'Степаныч',
  role: 'возврат клиентов',
  iconName: 'phone',
  assets: 'assets/agent/stepanych/',
  idleFrames: 8,
  presets: ['Сколько вернул за месяц?', 'Сколько спящих?', 'Что в этом месяце?', 'Кто из спящих крупный?'],
  stats: (m) => {
    const r = m.reactivation?.lastMonth;
    return [
      { k: 'Специализация', v: 'Возврат «спящих» клиентов' },
      { k: 'Вернул за месяц', v: r && r.revenue > 0 ? `${r.clients} кл · ${rub(r.revenue)}` : '—', tone: 'good' },
      { k: 'Спящих в работе', v: m.dormant != null ? num(m.dormant) : '—', tone: 'warn' },
      { k: 'Клиентов в базе', v: m.clients?.total != null ? num(m.clients.total) : '—' },
    ];
  },
  skills: [
    { icon: 'search', label: 'находит спящих' },
    { icon: 'phone', label: 'ставит обзвон' },
    { icon: 'coin', label: 'считает возврат' },
    { icon: 'users', label: 'видит историю клиента' },
  ],
  next: { href: './agent-gennady.html', label: 'Геннадий' },
});
