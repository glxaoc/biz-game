#!/usr/bin/env python3
"""Build app/public/assets/data/real.json from 1C OData (read-only).

Credentials are read from environment (ODATA_URL / ODATA_USER / ODATA_PASS) or
from a `.env` file next to this script. Secrets are never written to output.
Designed to run on a schedule (cron / systemd timer) so the dashboard stays live.
Stdlib only — no pip dependencies, easy to deploy on a bare Ubuntu box.
"""
import os, sys, json, base64, datetime, calendar, urllib.request, urllib.parse
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('SNAPSHOT_OUT') or os.path.join(HERE, '..', 'app', 'public', 'assets', 'data', 'real.json')

def load_env():
    for name in ('.env', 'snapshot.env'):
        p = os.path.join(HERE, name)
        if os.path.exists(p):
            for line in open(p, encoding='utf-8'):
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

load_env()
for req in ('ODATA_URL', 'ODATA_USER', 'ODATA_PASS'):
    if not os.environ.get(req):
        sys.exit(f"missing env {req} (set it or put it in scripts/.env)")

BASE = os.environ['ODATA_URL'].rstrip('/') + '/'
AUTH = base64.b64encode(f"{os.environ['ODATA_USER']}:{os.environ['ODATA_PASS']}".encode()).decode()

def get(entity, params, retries=2):
    qs = '&'.join(f"{k}={urllib.parse.quote(v)}" for k, v in params.items())
    url = BASE + urllib.parse.quote(entity) + '?' + qs  # entity has Cyrillic → percent-encode the path
    last = None
    for _ in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={'Authorization': 'Basic ' + AUTH, 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.load(r)
        except Exception as e:
            last = e
    raise last

def count(entity, flt=None):
    p = {'$format': 'json', '$top': '0', '$inlinecount': 'allpages'}
    if flt:
        p['$filter'] = flt
    d = get(entity, p)
    return int(d.get('odata.count') or d.get('@odata.count') or 0)

def fetch_all(entity, select, flt):
    rows, skip = [], 0
    while True:
        d = get(entity, {'$format': 'json', '$select': select, '$filter': flt, '$top': '1000', '$skip': str(skip)})
        b = d.get('value', [])
        rows += b
        if len(b) < 1000:
            return rows
        skip += 1000

today = datetime.date.today()
mstart = today.replace(day=1).isoformat()
ORD = 'Document_ЗаказКлиента'

snap = {
    'asOf': today.strftime('%d.%m.%Y'),
    'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),  # точное время сборки (для маячка «1С»)
    'source': '1С: Управление торговлей',
    'kpi': {}, 'managers': [], 'tasks': [],
}

# --- статус интеграции 1С→Битрикс (мост на этом же сервере) ---
try:
    bstate = os.environ.get('BRIDGE_STATE', '/opt/1c-odata-bridge/state.json')
    if os.path.exists(bstate):
        b = json.load(open(bstate, encoding='utf-8'))
        snap['bitrix'] = {
            'lastSync': b.get('last_sync_date'),
            'updated': b.get('last_sync_updated'),
            'errors': b.get('last_sync_errors'),
            'totalSynced': b.get('total_synced'),
        }
except Exception as e:
    print('bitrix status skipped:', e, file=sys.stderr)

# --- month orders: per-manager revenue + totals + distinct active clients ---
orders = fetch_all(ORD, 'Менеджер_Key,Партнер_Key,СуммаДокумента', f"Date ge datetime'{mstart}T00:00:00'")
total = sum((o.get('СуммаДокумента') or 0) for o in orders)
agg = defaultdict(lambda: [0, 0.0])
for o in orders:
    k = o.get('Менеджер_Key')
    agg[k][0] += 1
    agg[k][1] += (o.get('СуммаДокумента') or 0)
EMPTY = '00000000-0000-0000-0000-000000000000'
active_clients = len({o.get('Партнер_Key') for o in orders if o.get('Партнер_Key') and o.get('Партнер_Key') != EMPTY})
top = sorted(((k, v) for k, v in agg.items() if k and k != EMPTY), key=lambda kv: kv[1][1], reverse=True)
names = {}
for k, _ in top[:8]:
    try:
        u = get('Catalog_Пользователи', {'$format': 'json', '$filter': f"Ref_Key eq guid'{k}'", '$select': 'Description'})
        v = u.get('value', [])
        names[k] = (v[0].get('Description') or 'Менеджер').strip() if v else 'Менеджер'
    except Exception:
        names[k] = 'Менеджер'
snap['managers'] = [{'name': names.get(k, 'Менеджер'), 'orders': agg[k][0], 'revenue': round(agg[k][1])} for k, _ in top[:5]]

# --- топ-клиенты месяца по выручке (из тех же заказов; имена — Catalog_Партнеры) ---
cagg = defaultdict(lambda: [0, 0.0])
for o in orders:
    k = o.get('Партнер_Key')
    if k and k != EMPTY:
        cagg[k][0] += 1
        cagg[k][1] += (o.get('СуммаДокумента') or 0)
ctop = sorted(cagg.items(), key=lambda kv: kv[1][1], reverse=True)[:5]
cnames = {}
for k, _ in ctop:
    try:
        u = get('Catalog_Партнеры', {'$format': 'json', '$filter': f"Ref_Key eq guid'{k}'", '$select': 'Description'})
        v = u.get('value', [])
        cnames[k] = (v[0].get('Description') or 'Клиент').strip() if v else 'Клиент'
    except Exception:
        cnames[k] = 'Клиент'
snap['topClients'] = [{'name': cnames.get(k, 'Клиент'), 'orders': cagg[k][0], 'revenue': round(cagg[k][1])} for k, _ in ctop]

clients = count('Catalog_Контрагенты')
omonth = count(ORD, f"Date ge datetime'{mstart}T00:00:00'")
otoday = count(ORD, f"Date ge datetime'{today.isoformat()}T00:00:00'")

# derived analytics (safe — computed from data already fetched, no extra risky queries)
avg_check = round(total / omonth) if omonth else 0
days_in_month = calendar.monthrange(today.year, today.month)[1]
days_elapsed = today.day
forecast_month = round(total / days_elapsed * days_in_month) if days_elapsed else round(total)
plan_month = int(os.environ.get('MONTHLY_PLAN') or 0)  # optional: set in .env to enable план/факт

snap['kpi'] = {
    'ordersMonth': omonth, 'clients': clients, 'ordersToday': otoday, 'revenueMonth': round(total),
    'avgCheck': avg_check, 'forecastMonth': forecast_month,
    'daysElapsed': days_elapsed, 'daysInMonth': days_in_month,
    'activeClientsMonth': active_clients,
    'planMonth': plan_month or None,
}

# --- real 7-day revenue series (defensive: skip if it fails) ---
try:
    wk_from = (today - datetime.timedelta(days=6)).isoformat()
    wk = fetch_all(ORD, 'Date,СуммаДокумента', f"Date ge datetime'{wk_from}T00:00:00'")
    by_day = defaultdict(float)
    for o in wk:
        d = (o.get('Date') or '')[:10]
        by_day[d] += (o.get('СуммаДокумента') or 0)
    dow = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
    series = []
    for i in range(7):
        dt = today - datetime.timedelta(days=6 - i)
        series.append({'d': dow[dt.weekday()], 'v': round(by_day.get(dt.isoformat(), 0))})
    snap['revenue7'] = series
except Exception as e:
    print('series7 skipped:', e, file=sys.stderr)

# --- последние заказы из 1С (для ленты событий/тикера) ---
try:
    ro = get(ORD, {'$format': 'json', '$orderby': 'Date desc', '$top': '12', '$select': 'Number,Date,СуммаДокумента,Партнер_Key'})
    namecache = {}
    recent = []
    for o in ro.get('value', []):
        pk = o.get('Партнер_Key')
        nm = 'Клиент'
        if pk and pk != EMPTY:
            if pk in namecache:
                nm = namecache[pk]
            else:
                try:
                    u = get('Catalog_Партнеры', {'$format': 'json', '$filter': f"Ref_Key eq guid'{pk}'", '$select': 'Description'})
                    v = u.get('value', [])
                    nm = (v[0].get('Description') or 'Клиент').strip() if v else 'Клиент'
                except Exception:
                    nm = 'Клиент'
                namecache[pk] = nm
        recent.append({'number': str(o.get('Number') or '').strip(), 'date': (o.get('Date') or '')[:10],
                       'sum': round(o.get('СуммаДокумента') or 0), 'client': nm})
    snap['recentOrders'] = recent
except Exception as e:
    print('recentOrders skipped:', e, file=sys.stderr)

# --- данные моста 1С→Битрикс (тот же сервер): реальная дебиторка, спящие, тренд брендов ---
BRIDGE = os.environ.get('BRIDGE_DIR', '/opt/1c-odata-bridge')
def bload(rel):
    p = os.path.join(BRIDGE, rel)
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else None

try:  # дебиторка (сумма + число должников + предыдущее значение для тренда)
    dh = bload('state/debt-history.json')
    if dh:
        last = dh[-1]
        prev = dh[-2] if len(dh) > 1 else None
        snap['debts'] = {'total': round(last.get('total') or 0), 'count': last.get('n'),
                         'prevTotal': round(prev.get('total') or 0) if prev else None, 'asOf': last.get('date')}
except Exception as e:
    print('debts skipped:', e, file=sys.stderr)

try:  # спящие клиенты (по правилам моста)
    dr = bload('state/dormant-recent.json')
    if isinstance(dr, dict):
        snap['dormant'] = {'count': len(dr)}
except Exception as e:
    print('dormant skipped:', e, file=sys.stderr)

try:  # результативность реактивации (выполненные задачи возврата → выручка), считает reactivation_snapshot.py
    rj = bload('state/reactivation.json')
    if rj:
        snap['reactivation'] = rj
except Exception as e:
    print('reactivation skipped:', e, file=sys.stderr)

try:  # бренд, который сильнее всего проседает (run-rate тек.месяца vs прошлый полный)
    rh = bload('state/revenue-history.json')
    bm = bload('config/brand-managers.json')
    if rh and bm:
        names = bm.get('_brand_value_ids', {})
        months = sorted(rh.keys())
        if len(months) >= 2:
            cur, prv = months[-1], months[-2]
            def brand_tot(m):
                t = defaultdict(float)
                for mgr in rh[m].get('byManager', {}).values():
                    for bid, bv in (mgr.get('brands') or {}).items():
                        t[bid] += (bv.get('revenue') or 0)
                return t
            ct, pt = brand_tot(cur), brand_tot(prv)
            de = today.day
            dim = calendar.monthrange(today.year, today.month)[1]
            worst = None
            for bid, pv in pt.items():
                if pv < 50000:
                    continue
                proj = (ct.get(bid, 0) / de * dim) if de else ct.get(bid, 0)
                drop = (pv - proj) / pv
                if drop > 0.25 and (worst is None or drop > worst[1]):
                    worst = (bid, drop, proj, pv)
            if worst and de >= 3:  # не показываем в первые дни месяца (run-rate шумит)
                bid, drop, proj, pv = worst
                snap['brandTrend'] = {'brand': names.get(bid, 'бренд ' + bid), 'dropPct': round(drop * 100),
                                      'proj': round(proj), 'prev': round(pv)}
except Exception as e:
    print('brandTrend skipped:', e, file=sys.stderr)

# задачи собственника генерируются на клиенте (Dashboard.ts) из этих реальных данных

os.makedirs(os.path.dirname(OUT), exist_ok=True)
tmp = OUT + '.tmp'
with open(tmp, 'w', encoding='utf-8') as f:
    json.dump(snap, f, ensure_ascii=False, indent=2)
os.replace(tmp, OUT)

print('OK', datetime.datetime.now().isoformat(timespec='seconds'),
      f"| orders={omonth} clients={clients} today={otoday} revenue={round(total)} managers={len(snap['managers'])}")
