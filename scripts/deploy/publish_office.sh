#!/bin/bash
# Публикация дашборда по пути /office на домене бота (HTTPS) + basic-auth.
# Идемпотентно, с бэкапом и проверкой nginx -t (откат при ошибке). НЕ ломает бота.
BG=/opt/biz-game
HT=$BG/.htpasswd
BOT=/etc/nginx/sites-enabled/beauty-bot.conf

# 1) логин/пароль (генерируем один раз)
if [ ! -f "$HT" ]; then
  PASS=$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | cut -c1-14)
  printf 'office:%s\n' "$(openssl passwd -apr1 "$PASS")" > "$HT"
  echo "NEWCRED office / $PASS"
else
  echo "htpasswd: уже есть, оставляю"
fi

# 2) в конфиг бота — локация /office (один раз)
[ -f "$BOT.bak-office" ] || cp "$BOT" "$BOT.bak-office"
python3 - "$BOT" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
if '/office/' in s:
    print('bot: /office уже есть'); raise SystemExit
block = '''    location /office/ {
        alias /opt/biz-game/app/dist/;
        try_files $uri $uri/ /office/index.html;
        auth_basic "Biz Office";
        auth_basic_user_file /opt/biz-game/.htpasswd;
    }
    location = /office { return 301 /office/; }
'''
i = s.find('listen 443 ssl')
ls = s.rfind('\n', 0, i) + 1
open(p, 'w', encoding='utf-8').write(s[:ls] + block + s[ls:])
print('bot: /office добавлен')
PY

# 3) локальный конфиг (8088) — тоже под /office (для SSH-туннеля)
cat > /etc/nginx/sites-enabled/biz-game <<'CONF'
server {
    listen 127.0.0.1:8088;
    server_name _;
    location = / { return 302 /office/; }
    location /office/ {
        alias /opt/biz-game/app/dist/;
        try_files $uri $uri/ /office/index.html;
    }
}
CONF

# 4) проверка и перезагрузка (откат при ошибке)
if nginx -t 2>&1; then
  systemctl reload nginx && echo "RELOADED OK"
else
  echo "NGINX TEST FAILED — восстанавливаю конфиг бота"
  cp "$BOT.bak-office" "$BOT"
  exit 1
fi
