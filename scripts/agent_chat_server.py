#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Маленький чат-сервис для карточек агентов biz-game.
Агент отвечает на ВОПРОС по РЕАЛЬНЫМ данным 1С (из real.json) через Claude.
Ключ Claude берётся из /opt/1c-odata-bridge/.env (ANTHROPIC_API_KEY) — в браузер не уходит.
Слушает 127.0.0.1:8092; наружу проксируется nginx под /office/api/.
Только stdlib. Простой rate-limit. Запуск: python3 agent_chat_server.py
"""
import json, os, sys, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get('AGENT_CHAT_PORT', '8092'))
REAL = os.environ.get('REAL_JSON', '/opt/biz-game/app/dist/assets/data/real.json')
MODEL = 'claude-sonnet-4-6'

# --- ключ из .env моста ---
def load_env():
    for p in ('/opt/1c-odata-bridge/.env', '/opt/biz-game/scripts/.env'):
        if os.path.exists(p):
            for line in open(p, encoding='utf-8'):
                if '=' in line and not line.strip().startswith('#'):
                    k, v = line.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
load_env()
KEY = os.environ.get('ANTHROPIC_API_KEY', '')
BASE = os.environ.get('ANTHROPIC_BASE_URL', 'https://api.anthropic.com').rstrip('/')

# --- персоны агентов ---
PERSONAS = {
    'gennady': {
        'name': 'Геннадий',
        'system': ('Ты — Геннадий, ИИ-агент-аналитик менеджеров в дистрибуции косметики. '
                   'Тон: дотошный, спокойный, по делу, с лёгким характером зануды-аналитика. '
                   'Отвечай КОРОТКО (2-4 предложения), ТОЛЬКО на основе данных ниже, цифры не выдумывай. '
                   'Тема — работа менеджеров: рейтинги, просадки, заказы без ответственного, сравнение с лидером. '
                   'Людей называй ТОЛЬКО по имени (без фамилии и отчества).'),
        'show': 'managers',
    },
    'stepanych': {
        'name': 'Степаныч',
        'system': ('Ты — Степаныч, ИИ-агент по возврату «спящих» клиентов. '
                   'Тон: упорный, дружелюбный, мотивирующий, с лёгким юмором. '
                   'Отвечай КОРОТКО (2-4 предложения), ТОЛЬКО на основе данных ниже, цифры не выдумывай. '
                   'Тема — спящие клиенты и реактивация: сколько вернул, кто молчит, что делать. '
                   'Людей называй ТОЛЬКО по имени (без фамилии и отчества).'),
        'show': 'reactivation',
    },
}

def load_real():
    try:
        return json.load(open(REAL, encoding='utf-8'))
    except Exception:
        return {}

def data_context(agent, real):
    """Компактный срез реальных данных под тему агента."""
    kpi = real.get('kpi', {}) or {}
    out = {
        'asOf': real.get('asOf'),
        'выручка_месяц': kpi.get('revenueMonth'),
        'заказов_месяц': kpi.get('ordersMonth'),
        'контрагентов': kpi.get('clients'),
    }
    if agent == 'gennady':
        out['менеджеры'] = [
            {'имя': m.get('name'), 'выручка': m.get('revenue'), 'заказов': m.get('orders')}
            for m in (real.get('managers') or [])
        ]
    else:
        out['реактивация'] = real.get('reactivation')
        out['спящих'] = (real.get('dormant') or {}).get('count')
        out['топ_клиенты'] = (real.get('topClients') or [])[:5]
        out['долги'] = real.get('debts')
    return out

def widget_data(show, real):
    if show == 'managers':
        rows = sorted((real.get('managers') or []), key=lambda m: -(m.get('revenue') or 0))[:6]
        return {'type': 'managers', 'rows': [{'name': m.get('name'), 'revenue': m.get('revenue'), 'orders': m.get('orders')} for m in rows]}
    if show == 'reactivation':
        r = real.get('reactivation') or {}
        return {'type': 'reactivation', 'lastMonth': r.get('lastMonth'), 'thisMonth': r.get('thisMonth'), 'dormant': (real.get('dormant') or {}).get('count')}
    return None

def call_claude(system, user):
    body = json.dumps({
        'model': MODEL, 'max_tokens': 500,
        'system': system,
        'messages': [{'role': 'user', 'content': user}],
    }).encode('utf-8')
    req = urllib.request.Request(f'{BASE}/v1/messages', data=body, method='POST', headers={
        'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json',
    })
    r = urllib.request.urlopen(req, timeout=40)
    data = json.loads(r.read())
    return ''.join(b.get('text', '') for b in data.get('content', []))

# --- простой rate-limit (глобально) ---
_hits = []
def allowed(max_per_min=20):
    now = time.time()
    _hits[:] = [t for t in _hits if now - t < 60]
    if len(_hits) >= max_per_min:
        return False
    _hits.append(now)
    return True

class H(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path.rstrip('/').endswith('/health'):
            return self._send(200, {'ok': True, 'hasKey': bool(KEY)})
        self._send(404, {'error': 'not found'})

    def do_POST(self):
        if not self.path.rstrip('/').endswith('/agent-chat'):
            return self._send(404, {'error': 'not found'})
        if not KEY:
            return self._send(500, {'error': 'no ANTHROPIC_API_KEY on server'})
        if not allowed():
            return self._send(429, {'answer': 'Слишком много запросов, дай мне передохнуть пару секунд 🐾'})
        try:
            n = int(self.headers.get('Content-Length', 0))
            req = json.loads(self.rfile.read(n) or b'{}')
        except Exception:
            return self._send(400, {'error': 'bad json'})
        agent = (req.get('agent') or 'gennady').lower()
        message = (req.get('message') or '').strip()[:500]
        p = PERSONAS.get(agent, PERSONAS['gennady'])
        if not message:
            return self._send(400, {'error': 'empty message'})
        real = load_real()
        ctx = data_context(agent, real)
        prompt = (f'ВОПРОС ВЛАДЕЛЬЦА: {message}\n\n'
                  f'ДАННЫЕ (реальные, из 1С на {ctx.get("asOf")}):\n{json.dumps(ctx, ensure_ascii=False)}\n\n'
                  'Ответь от лица агента, коротко и по делу, опираясь только на эти данные.')
        try:
            answer = call_claude(p['system'], prompt) or '…'
        except urllib.error.HTTPError as e:
            return self._send(502, {'error': f'claude {e.code}', 'answer': 'Не дотянулся до мозга, попробуй ещё раз 🐾'})
        except Exception as e:
            return self._send(502, {'error': str(e), 'answer': 'Что-то сбойнуло, повтори вопрос 🐾'})
        self._send(200, {'answer': answer.strip(), 'widget': widget_data(p['show'], real)})

    def log_message(self, *a):
        pass

if __name__ == '__main__':
    print(f'agent_chat_server on 127.0.0.1:{PORT} (key={"yes" if KEY else "NO"})', file=sys.stderr)
    ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
