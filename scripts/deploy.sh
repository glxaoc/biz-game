#!/usr/bin/env bash
# One-shot deploy for the biz-game dashboard + 1C live snapshot.
# Run ON the server, from the repo root:  sudo bash scripts/deploy.sh
# Prereqs: scripts/.env filled (ODATA_PASS), node+npm, python3, systemd.
# Safe by design: does NOT modify existing nginx/sites — only adds a systemd
# timer and builds the static app. nginx is left for you (snippet printed).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/app/dist/assets/data/real.json"

[ -f "$ROOT/scripts/.env" ] || { echo "!! создайте $ROOT/scripts/.env из .env.example (с паролем 1С)"; exit 1; }

echo "==> сборка фронта"
( cd "$ROOT/app" && npm ci && npm run build )

echo "==> первый снапшот из 1С"
mkdir -p "$(dirname "$OUT")"
( cd "$ROOT/scripts" && SNAPSHOT_OUT="$OUT" python3 build_snapshot.py )

echo "==> systemd timer (каждые 30 мин)"
sudo cp "$ROOT/scripts/deploy/biz-snapshot.service" /etc/systemd/system/biz-snapshot.service
sudo cp "$ROOT/scripts/deploy/biz-snapshot.timer"   /etc/systemd/system/biz-snapshot.timer
sudo sed -i "s#/opt/biz-game#${ROOT}#g" /etc/systemd/system/biz-snapshot.service
sudo systemctl daemon-reload
sudo systemctl enable --now biz-snapshot.timer
systemctl --no-pager list-timers | grep biz-snapshot || true

echo
echo "==> ГОТОВО. Статика: $ROOT/app/dist"
echo "    Добавь сайт в nginx ОТДЕЛЬНЫМ конфигом (не трогая бота):"
echo "    см. $ROOT/scripts/deploy/nginx-biz-game.conf  (поправь server_name/порт и root=$ROOT/app/dist)"
