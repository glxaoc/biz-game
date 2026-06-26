import { AgentCard, rub } from '../agent/shell';
import { firstName } from '../data/Dashboard';

AgentCard({
  id: 'gennady',
  name: 'Геннадий',
  role: 'аналитик менеджеров',
  iconName: 'users',
  assets: 'assets/agent/gennady/',
  idleFrames: 8,
  presets: ['Кто лидер?', 'Кого подтянуть?', 'Заказы без менеджера?', 'Как команда в этом месяце?'],
  stats: (m) => {
    const h = (m.managers?.list || []).filter((x) => !/админ|систем/i.test(x.name));
    const s = [...h].sort((a, b) => b.revenue - a.revenue);
    const lead = s[0], lag = s[s.length - 1];
    return [
      { k: 'Специализация', v: 'Разбор работы менеджеров' },
      { k: 'Команда', v: h.length ? `${h.length} менеджеров` : '—' },
      { k: 'Лидер месяца', v: lead ? `${firstName(lead.name)} · ${rub(lead.revenue)}` : '—', tone: 'good' },
      { k: 'На разбор', v: lag ? `${firstName(lag.name)} · ${rub(lag.revenue)}` : '—', tone: 'warn' },
    ];
  },
  skills: [
    { icon: 'chart', label: 'рейтинг по выручке' },
    { icon: 'users', label: 'разбор команды' },
    { icon: 'ghost', label: 'заказы без хозяина' },
    { icon: 'scale', label: 'сравнение с лидером' },
  ],
  next: { href: './agent-stepanych.html', label: 'Степаныч' },
});

