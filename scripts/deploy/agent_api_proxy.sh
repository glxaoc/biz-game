#!/bin/bash
# Проброс /office/api/ → локальный чат-сервис агентов (127.0.0.1:8092), под basic-auth.
BOT=/etc/nginx/sites-enabled/beauty-bot.conf
python3 - "$BOT" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
if '/office/api/' in s:
    print('already has /office/api/'); raise SystemExit
anchor = 'location /office/ {'
block = ('location /office/api/ {\n'
         '        auth_basic "Biz Office";\n'
         '        auth_basic_user_file /opt/biz-game/.htpasswd;\n'
         '        proxy_pass http://127.0.0.1:8092/;\n'
         '        proxy_set_header Host $host;\n'
         '        proxy_read_timeout 60s;\n'
         '    }\n    ')
i = s.find(anchor)
if i < 0:
    print('anchor /office/ not found'); sys.exit(2)
open(p + '.bak-apiproxy', 'w', encoding='utf-8').write(s)
s = s[:i] + block + s[i:]
open(p, 'w', encoding='utf-8').write(s)
print('inserted /office/api/ proxy')
PY
if nginx -t 2>&1; then
  systemctl reload nginx && echo "RELOADED OK"
else
  echo "TEST FAILED — restoring"; cp "$BOT.bak-apiproxy" "$BOT" 2>/dev/null; exit 1
fi
