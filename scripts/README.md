# Live-связь дашборда с 1С

Пайплайн (без MCP, работает на проде сам):

```
1С OData ──(cron / systemd timer, каждые 30 мин)──> build_snapshot.py
        ──> real.json  ──(nginx отдаёт статикой)──>  игра опрашивает каждые 5 мин (no-store)
```

`build_snapshot.py` ходит в 1С **только на чтение**, агрегирует и атомарно перезаписывает
`real.json`. Никаких секретов в коде/репозитории — логин в `scripts/.env`.
Зависимостей нет (чистый Python 3 stdlib).

## Что попадает в real.json (реальное из 1С)
- `kpi.revenueMonth` — выручка за месяц (сумма `СуммаДокумента` по `Document_ЗаказКлиента`)
- `kpi.ordersMonth`, `kpi.ordersToday`, `kpi.clients`
- `managers[]` — топ-5 менеджеров (имя из `Catalog_Пользователи`, заказы, выручка)
- `revenue7[]` — выручка по дням за 7 дней (график «Выручка»)
- `tasks[]` — задачи, посчитанные от реальных цифр

> Дебиторка пока демо: баланс долга по клиентам тянется из регистра расчётов
> (`AccumulationRegister_РасчётыСКлиентами…`) — добавим, когда выверим запрос остатков.

## Деплой на сервер (Ubuntu)

```bash
# 1) код на сервер
sudo mkdir -p /opt/biz-game && sudo chown $USER /opt/biz-game
rsync -a ./ /opt/biz-game/        # или git clone

# 2) сборка фронта
cd /opt/biz-game/app && npm ci && npm run build      # -> app/dist

# 3) креды 1С (НЕ в git)
cd /opt/biz-game/scripts
cp .env.example .env && nano .env                    # вписать ODATA_PASS
chmod 600 .env

# 4) первый прогон вручную (проверка)
SNAPSHOT_OUT=/opt/biz-game/app/dist/assets/data/real.json python3 build_snapshot.py

# 5) расписание — вариант A: systemd timer
sudo cp deploy/biz-snapshot.service deploy/biz-snapshot.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now biz-snapshot.timer
systemctl list-timers | grep biz-snapshot

#    вариант B: cron (вместо systemd)
# crontab -e:
# */30 * * * * cd /opt/biz-game/scripts && /usr/bin/python3 build_snapshot.py >> /var/log/biz-snapshot.log 2>&1
```

nginx отдаёт `root /opt/biz-game/app/dist;`. Игра грузит `assets/data/real.json`
(который cron перезаписывает) и сама опрашивает его раз в 5 минут — данные обновляются
без перезагрузки страницы.

## Безопасность
- `scripts/.env` — `chmod 600`, в `.gitignore`. Пароль 1С не коммитить.
- Заведите для интеграции **отдельного пользователя 1С только на чтение** OData; периодически меняйте пароль.
