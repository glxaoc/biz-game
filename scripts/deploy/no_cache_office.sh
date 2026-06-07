#!/bin/bash
# Добавляет Cache-Control: no-store для /office (чтобы браузер не залипал на старой версии).
BOT=/etc/nginx/sites-enabled/beauty-bot.conf
python3 - "$BOT" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
if 'no-store' in s:
    print('already has no-store'); raise SystemExit
anchor = 'auth_basic_user_file /opt/biz-game/.htpasswd;'
add = anchor + '\n        add_header Cache-Control "no-store" always;'
if anchor in s:
    s = s.replace(anchor, add, 1)
    open(p + '.bak-nocache', 'w', encoding='utf-8').write(open(p, encoding='utf-8').read())
    open(p, 'w', encoding='utf-8').write(s)
    print('added no-store')
else:
    print('anchor not found'); sys.exit(2)
PY
if nginx -t 2>&1; then
  systemctl reload nginx && echo "RELOADED OK"
else
  echo "TEST FAILED — restoring"; cp "$BOT.bak-nocache" "$BOT" 2>/dev/null; exit 1
fi
