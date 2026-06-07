#!/usr/bin/env python3
"""Тяжёлая агрегация 1С → data_heavy.json (дебиторка + остатки склада).
Считается суммированием движений регистров (готового остатка OData не отдаёт).
Запускается РЕЖЕ обычного снапшота (напр. раз в час), чтобы не грузить боевую 1С.
Креды из .env (как build_snapshot.py), в вывод не попадают. Stdlib only.
"""
import os, sys, json, base64, datetime, urllib.request, urllib.parse
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('HEAVY_OUT') or os.path.join(HERE, 'data_heavy.json')

for name in ('.env', 'snapshot.env'):
    p = os.path.join(HERE, name)
    if os.path.exists(p):
        for line in open(p, encoding='utf-8'):
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

BASE = os.environ['ODATA_URL'].rstrip('/') + '/'
AUTH = base64.b64encode(f"{os.environ['ODATA_USER']}:{os.environ['ODATA_PASS']}".encode()).decode()
EMPTY = '00000000-0000-0000-0000-000000000000'

def get(entity, params, retries=2):
    qs = '&'.join(f"{k}={urllib.parse.quote(v)}" for k, v in params.items())
    url = BASE + urllib.parse.quote(entity) + '?' + qs
    last = None
    for _ in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={'Authorization': 'Basic ' + AUTH, 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:
            last = e
    raise last

def pages(entity, top=1000, cap=120):
    skip = 0
    while skip < cap * top:
        d = get(entity, {'$format': 'json', '$top': str(top), '$skip': str(skip)})
        b = d.get('value', [])
        yield from b
        if len(b) < top:
            return
        skip += top

snap = {'generatedAt': datetime.datetime.now().isoformat(timespec='seconds')}
t0 = datetime.datetime.now()

# --- дебиторка: сумма КОплате по знаку движения в разрезе партнёров ---
try:
    bal = defaultdict(float)
    n = 0
    for rec in pages('AccumulationRegister_РасчетыСКлиентами'):
        for ln in rec.get('RecordSet', []):
            k = ln.get('АналитикаУчетаПоПартнерам_Key')
            amt = ln.get('КОплате') or 0
            bal[k] += amt if ln.get('RecordType') == 'Receipt' else -amt
        n += 1
    debtors = [(k, v) for k, v in bal.items() if v > 1 and k and k != EMPTY]
    debtors.sort(key=lambda kv: kv[1], reverse=True)
    total = round(sum(v for _, v in debtors))
    items = []
    for k, v in debtors[:8]:
        name = 'Клиент'
        try:
            a = get('Catalog_КлючиАналитикиУчетаПоПартнерам', {'$format': 'json', '$filter': f"Ref_Key eq guid'{k}'", '$select': 'Партнер_Key'})
            av = a.get('value', [])
            pk = av[0].get('Партнер_Key') if av else None
            if pk and pk != EMPTY:
                pr = get('Catalog_Партнеры', {'$format': 'json', '$filter': f"Ref_Key eq guid'{pk}'", '$select': 'Description'})
                pv = pr.get('value', [])
                if pv:
                    name = (pv[0].get('Description') or 'Клиент').strip()
        except Exception:
            pass
        items.append({'name': name, 'amount': round(v)})
    snap['debts'] = {'total': total, 'count': len(debtors), 'items': items}
    print(f"debts: docs={n} debtors={len(debtors)} total={total}", file=sys.stderr)
except Exception as e:
    print('debts skipped:', e, file=sys.stderr)

# --- остатки склада: сумма ВНаличии по знаку движения в разрезе номенклатуры ---
try:
    stock = defaultdict(float)
    for rec in pages('AccumulationRegister_ТоварыНаСкладах'):
        for ln in rec.get('RecordSet', []):
            k = ln.get('Номенклатура_Key')
            q = ln.get('ВНаличии') or 0
            stock[k] += q if ln.get('RecordType') == 'Receipt' else -q
    skus = [k for k, v in stock.items() if v > 0.0001]
    snap['stock'] = {'skus': len(skus), 'units': round(sum(v for v in stock.values() if v > 0))}
    print(f"stock: skus={len(skus)}", file=sys.stderr)
except Exception as e:
    print('stock skipped:', e, file=sys.stderr)

snap['tookSec'] = (datetime.datetime.now() - t0).seconds
tmp = OUT + '.tmp'
with open(tmp, 'w', encoding='utf-8') as f:
    json.dump(snap, f, ensure_ascii=False, indent=2)
os.replace(tmp, OUT)
print('OK heavy in', snap['tookSec'], 's |', json.dumps({k: (v if not isinstance(v, dict) else {x: y for x, y in v.items() if x != 'items'}) for k, v in snap.items()}, ensure_ascii=False))
