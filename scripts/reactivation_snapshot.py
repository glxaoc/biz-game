#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Считает результативность реактивации за прошлый полный месяц и текущий месяц
и пишет /opt/1c-odata-bridge/state/reactivation.json для дашборда biz-game.
Переиспользует логику reactivation_calc.py (Битрикс: выполненные задачи «Реактивация»
→ выручка их сделок в воронке реактивации после закрытия задачи).
"""
import sys, json, datetime, calendar
sys.path.insert(0, '/opt/1c-odata-bridge/scripts')
import reactivation_calc as rc

OUT = '/opt/1c-odata-bridge/state/reactivation.json'
RU_MONTHS = ['', 'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
             'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']


def build_matched():
    """Все ВЫПОЛНЕННЫЕ задачи реактивации → {company_id: earliest_closed_ts}."""
    companies = rc.fetch_all_companies()
    tasks = rc.fetch_reactivation_tasks()
    matched = {}
    for t in tasks:
        if str(t.get('status')) != '5':
            continue
        cd = t.get('closedDate')
        if not cd:
            continue
        ts = datetime.datetime.fromisoformat(cd).timestamp() * 1000
        cid = rc.match_company(rc.extract_company_name(t['title']), companies)
        if cid and (cid not in matched or ts < matched[cid]):
            matched[cid] = ts
    return matched


def period(matched, y, m, day_to=None):
    start = datetime.date(y, m, 1)
    last = calendar.monthrange(y, m)[1]
    end = datetime.date(y, m, day_to if day_to else last)
    rev, orders, clients = rc.calc_revenue_after(matched, start.isoformat(), end.isoformat())
    return {
        'label': f'{RU_MONTHS[m]} {y}',
        'revenue': round(rev), 'orders': orders, 'clients': clients,
        'from': start.isoformat(), 'to': end.isoformat(),
    }


if __name__ == '__main__':
    today = datetime.date.today()
    matched = build_matched()

    # прошлый полный месяц
    py, pm = (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)
    last_month = period(matched, py, pm)
    # текущий месяц (по сегодня)
    this_month = period(matched, today.year, today.month, day_to=today.day)

    out = {
        'generatedAt': datetime.datetime.utcnow().isoformat() + 'Z',
        'matchedCompanies': len(matched),
        'lastMonth': last_month,
        'thisMonth': this_month,
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('wrote', OUT)
    print(json.dumps(out, ensure_ascii=False))
