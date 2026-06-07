import Phaser from 'phaser';
import { LZ_CHARS } from './BootScene';
import { GameUI } from '../ui/GameUI';
import { buildModel, firstName } from '../data/Dashboard';

const PANEL_W = 340;

// LimeZu Modern Interiors (free) office. Static room + event-driven life:
// each domain event (order/client/debt) animates the office + updates the HUD.
const TILE = 16;
const COLS = 28;
const ROWS = 18;
const ROOM_W = COLS * TILE;
const ROOM_H = ROWS * TILE;

// направления ходьбы (право/лево по факту на экране): 0-5 — вправо, 12-17 — влево
const DIR = { right: [0, 5], up: [6, 11], left: [12, 17], down: [18, 23] } as const;
const MGR_X = [88, 150, 212, 274]; // 4 стола менеджеров-продавцов (сдвинуты правее/ниже, угол свободен)
const MGR_FEET_Y = 150;
const ADMIN_POS = { x: 300, y: 250 };   // администратор-розница у входа
const PACK_POS = { x: 250, y: 214 };     // стол сборки заказов (курьер забирает отсюда)
const ENTRANCE = { x: 224, y: 270 };     // вход (низ по центру)
// точки сбора — ПЕРЕД стеллажами (слева, ноги ниже основания шкафа → персонаж не прячется за ним)
const SHELF_PICK = [{ x: 376, y: 158 }, { x: 376, y: 212 }, { x: 376, y: 252 }];

// ИИ-агенты-собачки: роль + лежанка (отдыхают тут) + «рабочая зона» (трусят сюда работать)
const AGENTS = [
  { key: 'debt', name: 'Аналитик менеджеров', dog: 'Геннадий', emoji: '👔', bed: { x: 100, y: 240 }, zone: { x: 100, y: 128 } },  // к столам менеджеров
  { key: 'stock', name: 'Ключевые клиенты', dog: 'Алёша', emoji: '🏆', bed: { x: 196, y: 240 }, zone: { x: 290, y: 244 } },     // к администратору/клиентам
  { key: 'analytics', name: 'Аналитик продаж', dog: 'Жорик', emoji: '📈', bed: { x: 100, y: 268 }, zone: { x: 344, y: 116 } },  // к Боссу Ирине
  { key: 'wake', name: 'Возврат клиентов', dog: 'Степаныч', emoji: '📞', bed: { x: 196, y: 268 }, zone: { x: 128, y: 170 } },
] as const;
const DOG_SCALE = 1.6;

export class OfficeScene extends Phaser.Scene {
  private ui!: GameUI;
  private recentOrders: { number: string; date: string; sum: number; client: string }[] = []; // реальные заказы из 1С для ленты
  private orderIdx = 0;
  private lifeTimer?: Phaser.Time.TimerEvent;
  private statObjs: Phaser.GameObjects.GameObject[] = [];
  private statTweens: Phaser.Tweens.Tween[] = [];
  private moodTint?: Phaser.GameObjects.Rectangle; // настроение офиса по прогрессу плана
  private celebratedAsOf = '';      // чтобы «План взят» не спамил при поллинге
  private deskOf: Record<number, { x: number; y: number }> = {}; // model-index → позиция стола
  private mgrSeats: Phaser.GameObjects.Image[] = [];             // сидящие менеджеры (для анимации сборки)
  private seatChars: string[] = [];                              // спрайт-ключи менеджеров
  private parcels: Phaser.GameObjects.GameObject[] = [];         // посылки на столе сборки
  private picking = new Set<number>();                            // менеджеры, что сейчас собирают заказ
  private courierBusy = false;
  private deskNameObjs: Record<number, Phaser.GameObjects.Text> = {}; // имя-табличка над столом (слот)
  private mgrNames: Record<number, string> = {};                      // имя менеджера по слоту
  private followers: { s: Phaser.GameObjects.Sprite; t: Phaser.GameObjects.Text }[] = []; // имена, что идут за персонажем
  private dogs: { cfg: typeof AGENTS[number]; s: Phaser.GameObjects.Sprite; t: Phaser.GameObjects.Text; resting: boolean }[] = [];
  private danceSeats: Phaser.GameObjects.Image[] = [];           // все сидящие персонажи — пляшут при продаже

  constructor() {
    super('Office');
  }

  create() {
    this.registerAnims();
    this.buildRoom();
    this.spawnPeople();
    this.spawnAgents();
    this.spawnIntegrations();
    this.add.image(0, 0, 'vignette').setOrigin(0).setDepth(900000);
    this.setupCamera();

    this.ui = new GameUI((i) => this.highlightManager(i), () => this.triggerSale());
    // live data: load the 1C snapshot now and re-poll it (a server cron keeps
    // assets/data/real.json fresh from 1C). The dashboard auto-updates без перезагрузки.
    this.loadSnapshot();
    const poll = this.time.addEvent({ delay: 300000, loop: true, callback: () => this.loadSnapshot() });
    this.startLife();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      poll.remove();
      this.lifeTimer?.remove();
      this.ui?.destroy();
    });
  }

  update() {
    // имя-таблички, что идут за ходящим персонажем
    for (const f of this.followers) f.t.setPosition(f.s.x, f.s.y - 34).setDepth(f.s.y + 1000);
    // таблички ролей над собачками-агентами
    for (const d of this.dogs) d.t.setPosition(d.s.x, d.s.y - 26);
  }

  private loadSnapshot() {
    fetch(location.origin + import.meta.env.BASE_URL + 'assets/data/real.json', { cache: 'no-store' })
      .then((r) => r.json())
      .catch(() => ({}))
      .then((snap) => {
        const model = buildModel(snap || {});
        this.ui.setModel(model);
        this.recentOrders = model.recentOrders; // лента событий — реальные заказы из 1С
        this.statTweens.forEach((t) => t.remove());
        this.statTweens = [];
        this.statObjs.forEach((o) => o.destroy());
        this.statObjs = [];
        this.renderManagerStats(model.managers.list);
        this.updateMood(model);
      });
  }

  // Owner clicked a task → point at the relevant manager in the office.
  private highlightManager(idx: number) {
    const pos = this.deskOf[idx] ?? { x: MGR_X[Math.min(idx, MGR_X.length - 1)], y: MGR_FEET_Y };
    const x = pos.x;
    const y = pos.y - 44;
    const arrow = this.add.text(x, y, '▼', { fontFamily: 'monospace', fontSize: '18px', color: '#ffd84d' })
      .setOrigin(0.5, 1).setDepth(999999).setResolution(4);
    this.tweens.add({ targets: arrow, y: y - 6, duration: 320, yoyo: true, repeat: 9, ease: 'Sine.inOut' });
    this.time.delayedCall(3800, () => arrow.destroy());
    this.cameras.main.flash(220, 255, 244, 180, false);
  }

  // Раскладка имён/статов: живые менеджеры → столы продаж, системный аккаунт → стол администратора.
  private renderManagerStats(managers: { name: string; orders: number; revenue: number }[]) {
    const short = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'м' : Math.round(n / 1000) + 'к');
    const statLabel = (x: number, y: number, m: { orders: number; revenue: number }) =>
      this.statObjs.push(this.add.text(x, y, `${m.orders} зак · ${short(m.revenue)}₽`, {
        fontFamily: 'monospace', fontSize: '6px', color: '#e7edf6', backgroundColor: '#5a4733e0', padding: { x: 2, y: 1 },
      }).setOrigin(0.5, 0).setResolution(4).setDepth(MGR_FEET_Y + 600));
    this.deskOf = {};
    const humans: { m: typeof managers[number]; idx: number }[] = [];
    managers.forEach((m, idx) => {
      if (/админ|систем/i.test(m.name)) {
        this.deskOf[idx] = ADMIN_POS;
        statLabel(ADMIN_POS.x, ADMIN_POS.y + 12, m); // статы у стола администратора
      } else humans.push({ m, idx });
    });
    const byRev = [...humans].sort((a, b) => b.m.revenue - a.m.revenue);
    const top = byRev[0]?.m, low = byRev[byRev.length - 1]?.m;
    humans.slice(0, MGR_X.length).forEach(({ m, idx }, i) => {
      const x = MGR_X[i];
      this.deskOf[idx] = { x, y: MGR_FEET_Y };
      const nm = firstName(m.name);
      this.mgrNames[i] = nm;
      const nameObj = this.add.text(x, MGR_FEET_Y - 34, nm, {
        fontFamily: 'monospace', fontSize: '7px', color: '#fff', backgroundColor: '#5a4733e0', padding: { x: 2, y: 1 },
      }).setOrigin(0.5, 1).setResolution(4).setDepth(MGR_FEET_Y + 1000);
      if (this.picking.has(i)) nameObj.setVisible(false); // ушёл собирать — над пустым столом не висим
      this.deskNameObjs[i] = nameObj;
      this.statObjs.push(nameObj);
      statLabel(x, MGR_FEET_Y + 16, m);
      if (m === top && m !== low) {
        const crown = this.add.text(x, MGR_FEET_Y - 46, '👑', { fontFamily: 'sans-serif', fontSize: '13px' }).setOrigin(0.5, 1).setResolution(4).setDepth(999990);
        this.statObjs.push(crown);
        this.statTweens.push(this.tweens.add({ targets: crown, y: crown.y - 4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' }));
      } else if (m === low && m !== top) {
        this.statObjs.push(this.add.text(x, MGR_FEET_Y - 46, '💤', { fontFamily: 'sans-serif', fontSize: '10px' }).setOrigin(0.5, 1).setResolution(4).setDepth(999990));
      }
    });
  }

  // настроение офиса по прогрессу плана: ≥100% — теплее, отставание — прохладнее
  private updateMood(model: { revenue: { forecast: number | null; plan: number | null; asOf?: string }; asOf: string }) {
    const { forecast, plan } = model.revenue;
    if (!this.moodTint) {
      this.moodTint = this.add.rectangle(0, 0, ROOM_W, ROOM_H, 0xffffff, 0).setOrigin(0).setDepth(1);
    }
    if (forecast == null || plan == null || plan <= 0) { this.moodTint.setAlpha(0); return; }
    const pct = forecast / plan;
    if (pct >= 1) { this.moodTint.setFillStyle(0xffd86a); this.moodTint.setAlpha(0.07); this.celebratePlan(model.asOf); }
    else if (pct < 0.9) { this.moodTint.setFillStyle(0x4a78c0); this.moodTint.setAlpha(0.06); }
    else { this.moodTint.setAlpha(0); }
  }

  // «План взят» — салют частиц над офисом + лёгкий подскок руководителя (один раз за снапшот)
  private celebratePlan(asOf: string) {
    if (this.celebratedAsOf === asOf) return;
    this.celebratedAsOf = asOf;
    this.cameras.main.flash(260, 255, 230, 150, false);
    const toast = this.add.text(ROOM_W / 2, 60, '🎉 ПЛАН ВЗЯТ!', { fontFamily: 'monospace', fontSize: '14px', color: '#ffe6a0', backgroundColor: '#5a4733e0', padding: { x: 4, y: 2 } }).setOrigin(0.5).setResolution(4).setDepth(999999);
    this.tweens.add({ targets: toast, y: 44, alpha: 0, duration: 2200, ease: 'Quad.out', onComplete: () => toast.destroy() });
    for (let i = 0; i < 14; i++) {
      const c = this.add.text(ROOM_W / 2 + (Math.random() - 0.5) * 120, 50, '✨', { fontSize: '10px' }).setOrigin(0.5).setDepth(999998);
      this.tweens.add({ targets: c, y: c.y + 40 + Math.random() * 40, x: c.x + (Math.random() - 0.5) * 60, alpha: 0, duration: 1200 + Math.random() * 600, ease: 'Quad.out', onComplete: () => c.destroy() });
    }
  }


  // 🎉 Праздник новой продажи: крупный баннер по центру + конфетти + все пляшут (×2 длительность).
  private celebrateSale() {
    this.ui?.saleBanner('НОВАЯ ПРОДАЖА'); // большие ретро-буквы по центру экрана
    const COLORS = [0xff5a8a, 0xffd84d, 0x5ec46a, 0x49c5e0, 0xa06ae0, 0xff8a3d, 0xffffff, 0xff4d4d];
    // много конфетти, падает до самого пола и НЕ гаснет в полёте (фейд только при приземлении)
    for (let i = 0; i < 100; i++) {
      const x = 8 + Math.random() * (ROOM_W - 16);
      const c = this.add.rectangle(x, -8 - Math.random() * 70, 3 + Math.random() * 4, 5 + Math.random() * 5, COLORS[i % COLORS.length])
        .setDepth(999997).setAngle(Math.random() * 360);
      const fall = 3400 + Math.random() * 2400;
      this.tweens.add({
        targets: c, y: ROOM_H * (0.97 + Math.random() * 0.06), x: x + (Math.random() - 0.5) * 100,
        angle: c.angle + (Math.random() - 0.5) * 900,
        delay: Math.random() * 1800, duration: fall, ease: 'Sine.in',
        onComplete: () => this.tweens.add({ targets: c, alpha: 0, duration: 400, onComplete: () => c.destroy() }),
      });
    }
    // эмодзи-салют — гуще и дольше, разлетается вверх по всей ширине
    for (let i = 0; i < 16; i++) {
      const e = this.add.text(ROOM_W / 2 + (Math.random() - 0.5) * 280, 60, ['🎉', '🎊', '💸', '✨', '🪙'][i % 5], { fontSize: '14px' })
        .setOrigin(0.5).setDepth(999998);
      this.tweens.add({ targets: e, y: e.y - 24 - Math.random() * 40, x: e.x + (Math.random() - 0.5) * 70, alpha: 0, scale: 1.7, delay: Math.random() * 1500, duration: 3000 + Math.random() * 1500, ease: 'Quad.out', onComplete: () => e.destroy() });
    }
    // люди пляшут (кроме того, кто пошёл собирать заказ — его кресло скрыто); repeat ×2 → дольше
    for (const s of this.danceSeats) {
      if (!s.visible || this.tweens.isTweening(s)) continue;
      const baseY = s.y, baseA = s.angle;
      s.angle = baseA - 6;
      this.tweens.add({
        targets: s, angle: baseA + 6, y: baseY - 5, duration: 165, yoyo: true, repeat: 11, ease: 'Sine.inOut',
        onComplete: () => { s.angle = baseA; s.y = baseY; },
      });
    }
    // собаки-агенты подпрыгивают
    for (const d of this.dogs) {
      if (!d.resting || this.tweens.isTweening(d.s)) continue;
      const s = d.s, baseY = s.y, baseA = s.angle;
      s.angle = baseA - 8;
      this.tweens.add({
        targets: s, angle: baseA + 8, y: baseY - 7 * DOG_SCALE, duration: 150, yoyo: true, repeat: 13, ease: 'Sine.inOut',
        onComplete: () => { s.angle = baseA; s.y = baseY; },
      });
    }
    this.cameras.main.flash(220, 255, 220, 160, false);
  }

  private registerAnims() {
    for (const n of LZ_CHARS)
      for (const [dir, [a, b]] of Object.entries(DIR)) {
        const key = `lz_${n}-walk-${dir}`;
        if (this.anims.exists(key)) continue;
        this.anims.create({ key, frames: this.anims.generateFrameNumbers(`lz_${n}_run`, { start: a, end: b }), frameRate: 8, repeat: -1 });
      }
  }

  private buildRoom() {
    for (let ty = 0; ty < ROWS; ty++)
      for (let tx = 0; tx < COLS; tx++)
        this.add.image(tx * TILE, ty * TILE, 'lz_floor').setOrigin(0).setDepth(0);

    for (let tx = 0; tx < COLS; tx++) {
      this.add.image(tx * TILE, 0, 'lz_wall_cap').setOrigin(0).setDepth(2);
      this.add.image(tx * TILE, TILE, 'lz_wall').setOrigin(0).setDepth(2);
      if (tx !== 13 && tx !== 14) this.add.image(tx * TILE, (ROWS - 1) * TILE, 'lz_wall').setOrigin(0).setDepth(2);
    }
    for (let ty = 2; ty < ROWS - 1; ty++) {
      this.add.image(0, ty * TILE, 'lz_wall').setOrigin(0).setDepth(2);
      this.add.image((COLS - 1) * TILE, ty * TILE, 'lz_wall').setOrigin(0).setDepth(2);
    }

    // top-wall decor
    this.add.image(40, 0, 'lz_window').setOrigin(0).setDepth(3);
    this.add.image(360, 0, 'lz_window').setOrigin(0).setDepth(3);
    this.add.image(185, 6, 'sign_board').setOrigin(0).setDepth(5); // «BEAUTY GROUP» впечатан в текстуру
    this.add.image(96, 6, 'poster_pink').setOrigin(0).setDepth(5);
    this.add.text(118, 22, 'КРАСОТА\nВ ДЕТАЛЯХ', { fontFamily: 'monospace', fontSize: '6px', color: '#fbe8ef', align: 'center', lineSpacing: 1 }).setOrigin(0.5).setResolution(4).setDepth(6);
    this.add.image(140, 4, 'hanging_plant').setOrigin(0).setDepth(6);
    this.add.image(300, 4, 'hanging_plant').setOrigin(0).setDepth(6);

    // lounge + storage
    this.add.image(10, 198, 'rug_big').setOrigin(0).setDepth(1);
    this.add.image(18, 196, 'lz_sofa').setOrigin(0).setDepth(196 + 32);
    this.add.image(74, 192, 'lz_palm').setOrigin(0).setDepth(192 + 32);
    this.add.image(36, 236, 'lz_plant').setOrigin(0).setDepth(236 + 16);
    // косметический склад — стеллажи с флаконами вдоль правой стены (менеджеры набирают тут заказы)
    for (const sy of [56, 104, 152, 200]) this.add.image(394, sy, 'lz_shelf_cosmetics').setOrigin(0).setDepth(sy + 48);
    // стол сборки заказов — пустой стол (без компьютера); на него кладут посылки, курьер увозит
    this.add.image(PACK_POS.x, PACK_POS.y, 'lz_table_plain').setOrigin(0.5, 1).setDepth(PACK_POS.y);
    this.add.text(PACK_POS.x, PACK_POS.y - 22, 'СБОРКА', { fontFamily: 'monospace', fontSize: '6px', color: '#e7d3a8', backgroundColor: '#5a4733e0', padding: { x: 2, y: 1 } }).setOrigin(0.5, 1).setResolution(4).setDepth(PACK_POS.y + 1000);
  }

  private workstation(name: string, x: number, y: number, label: string, extra?: () => void): Phaser.GameObjects.Image {
    const seat = this.add.image(x, y, `lz_${name}_idle`, 3).setOrigin(0.5, 1).setDepth(y);
    this.add.image(x, y + 12, 'lz_desk').setOrigin(0.5, 1).setDepth(y + 12);
    extra?.();
    if (label) this.add.text(x, y - 34, label, { fontFamily: 'monospace', fontSize: '7px', color: '#fff', backgroundColor: '#5a4733e0', padding: { x: 2, y: 1 } }).setOrigin(0.5, 1).setResolution(4).setDepth(y + 1000);
    return seat;
  }

  private spawnPeople() {
    // 4 менеджера-продавца (доставка) — сидят за столами; имена подставляются из 1С
    this.seatChars = ['Amelia', 'Alex', 'Adam', 'Bob'];
    this.mgrSeats = MGR_X.map((x, i) => this.workstation(this.seatChars[i], x, MGR_FEET_Y, ''));
    // администратор-розница у входа — лицом к двери, к ней идут клиенты с улицы
    const admin = this.workstation('Amelia', ADMIN_POS.x, ADMIN_POS.y, 'Администратор · розница');
    const boss = this.workstation('Adam', 372, 96, 'Директор', () => {
      this.add.image(388, 92, 'lz_globe').setOrigin(0.5, 1).setDepth(109);
    });
    // тех-специалист — в левом верхнем углу (под ядрами интеграций)
    const tech = this.workstation('Alex', 60, 120, 'Тех. специалист', () => {
      this.add.image(36, 120, 'lz_server').setOrigin(0.5, 1).setDepth(120);
    });
    this.danceSeats = [...this.mgrSeats, admin, boss, tech]; // все, кто пляшет при продаже
  }

  // ИИ-агенты-собачки: по умолчанию лежат на лежанках (виляют хвостом, отряхиваются),
  // изредка выбегают «работать» и возвращаются
  private spawnAgents() {
    for (const cfg of AGENTS) {
      const walk = `dog-${cfg.key}`, rest = `dogrest-${cfg.key}`;
      if (!this.anims.exists(walk)) this.anims.create({ key: walk, frames: this.anims.generateFrameNumbers(`lz_dog_${cfg.key}`, { start: 0, end: 1 }), frameRate: 6, repeat: -1 });
      if (!this.anims.exists(rest)) this.anims.create({ key: rest, frames: this.anims.generateFrameNumbers(`lz_dog_${cfg.key}`, { start: 2, end: 3 }), frameRate: 2.5, repeat: -1 });
      this.add.image(cfg.bed.x, cfg.bed.y, 'lz_dog_bed').setOrigin(0.5, 1).setDepth(cfg.bed.y - 1); // лежанка
      const s = this.add.sprite(cfg.bed.x, cfg.bed.y, `lz_dog_${cfg.key}`, 2).setOrigin(0.5, 1).setScale(DOG_SCALE).setDepth(cfg.bed.y);
      const t = this.add.text(cfg.bed.x, cfg.bed.y - 26, cfg.dog, {
        fontFamily: 'monospace', fontSize: '6px', color: '#e7d3a8', backgroundColor: '#5a4733e0', padding: { x: 2, y: 1 },
      }).setOrigin(0.5, 1).setResolution(4).setDepth(999990);
      const dog = { cfg, s, t, resting: true };
      this.dogs.push(dog);
      this.enterRest(dog);
      this.scheduleAgentTrip(dog);
      this.scheduleIdle(dog);
    }
  }

  private enterRest(dog: OfficeScene['dogs'][number]) {
    dog.resting = true;
    dog.s.setAngle(0);
    dog.s.play(`dogrest-${dog.cfg.key}`, true); // виляет хвостом
  }

  private scheduleAgentTrip(dog: OfficeScene['dogs'][number]) {
    this.time.delayedCall(9000 + Math.random() * 16000, () => this.agentTrip(dog));
  }

  // мелкие idle-движения на лежанке: отряхнуться (поворот) или подпрыгнуть
  private scheduleIdle(dog: OfficeScene['dogs'][number]) {
    this.time.delayedCall(3500 + Math.random() * 6000, () => {
      if (dog.s.active && dog.resting && !this.tweens.isTweening(dog.s)) {
        if (Math.random() < 0.5) this.tweens.add({ targets: dog.s, angle: -10, duration: 70, yoyo: true, repeat: 3, onComplete: () => dog.s.setAngle(0) }); // отряхивается
        else this.tweens.add({ targets: dog.s, y: dog.cfg.bed.y - 4, duration: 130, yoyo: true, repeat: 1, ease: 'Quad.out' }); // подпрыгивает
      }
      if (dog.s.active) this.scheduleIdle(dog);
    });
  }

  // собака бежит к рабочей зоне, «работает» (облачко), возвращается на лежанку
  private agentTrip(dog: OfficeScene['dogs'][number]) {
    if (!dog.s.active) return;
    dog.resting = false;
    dog.s.setAngle(0);
    const go = (tx: number, ty: number, after: () => void) => {
      dog.s.setFlipX(tx < dog.s.x); // спрайт «вправо» по умолчанию, влево — зеркалим
      dog.s.play(`dog-${dog.cfg.key}`, true);
      const dur = Math.max(500, (Math.hypot(tx - dog.s.x, ty - dog.s.y) / 42) * 1000);
      this.tweens.add({ targets: dog.s, x: tx, y: ty, duration: dur, onUpdate: () => dog.s.setDepth(dog.s.y), onComplete: after });
    };
    go(dog.cfg.zone.x, dog.cfg.zone.y, () => {
      dog.s.anims.stop(); dog.s.setFrame(0);
      this.dogBubble(dog);
      this.time.delayedCall(1800, () => go(dog.cfg.bed.x, dog.cfg.bed.y, () => {
        this.enterRest(dog);
        this.scheduleAgentTrip(dog);
      }));
    });
  }

  private dogBubble(dog: OfficeScene['dogs'][number]) {
    const b = this.add.text(dog.s.x, dog.s.y - 24, dog.cfg.emoji, { fontSize: '12px' }).setOrigin(0.5, 1).setDepth(999995);
    this.tweens.add({ targets: b, y: b.y - 8, alpha: { from: 1, to: 0 }, duration: 1700, ease: 'Quad.out', onComplete: () => b.destroy() });
  }

  // Светящиеся «энергоядра» интеграций — декоративная часть игры (всегда активны).
  // ADD-свечение + пульс + искры-поток вверх. Реальные данные тут не нужны.
  private spawnIntegrations() {
    // маленькая мягкая текстура-искра для частиц
    if (!this.textures.exists('spark')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1); g.fillCircle(4, 4, 4); g.generateTexture('spark', 8, 8); g.destroy();
    }
    const y = 52;  // левый верхний угол, над тех-специалистом (приподняты)
    const defs = [
      { label: '1С', x: 40, color: 0x5fd06a },        // зелёное ядро
      { label: 'Битрикс', x: 88, color: 0x49c5e0 },   // бирюзовое ядро
    ];
    for (const d of defs) {
      // подпись НАД шаром (зелёная точка = online), светлая подложка
      this.add.text(d.x, y - 13, `🟢 ${d.label}`, { fontFamily: 'monospace', fontSize: '7px', color: '#fff', backgroundColor: '#5a4733e0', padding: { x: 3, y: 1 } }).setOrigin(0.5, 1).setResolution(4).setDepth(999973);
      this.add.ellipse(d.x, y + 10, 20, 6, 0x141a20, 0.5).setDepth(999967);              // тень-пьедестал
      this.add.particles(d.x, y + 2, 'spark', {                                          // искры-поток вверх
        speedY: { min: -26, max: -12 }, speedX: { min: -7, max: 7 }, lifespan: 850,
        scale: { start: 0.5, end: 0 }, alpha: { start: 0.85, end: 0 }, frequency: 260,
        tint: d.color, blendMode: 'ADD',
      }).setDepth(999969);
      const halo = this.add.circle(d.x, y, 12, d.color, 0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(999970);
      const mid = this.add.circle(d.x, y, 7, d.color, 0.55).setBlendMode(Phaser.BlendModes.ADD).setDepth(999971);
      this.add.circle(d.x, y, 3.5, 0xffffff, 0.95).setBlendMode(Phaser.BlendModes.ADD).setDepth(999972); // яркое ядро
      this.tweens.add({ targets: halo, scale: { from: 1, to: 1.5 }, alpha: { from: 0.34, to: 0.08 }, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.tweens.add({ targets: mid, scale: { from: 0.9, to: 1.15 }, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
  }

  // Лента событий и анимация офиса = ПРОИГРЫВАНИЕ реальных последних заказов из 1С
  // (snap.recentOrders). Никакой симуляции: каждый «приходящий» заказ — настоящий.
  private startLife() {
    this.time.delayedCall(3500, () => this.emitRealOrder());
    this.lifeTimer = this.time.addEvent({ delay: 13000, loop: true, callback: () => this.emitRealOrder() });
  }

  // ручной запуск показа продажи (кнопка «💰 Продажа») — для записи видео
  private triggerSale() {
    if (this.recentOrders.length) this.emitRealOrder();
    else this.celebrateSale();
  }

  private emitRealOrder() {
    const list = this.recentOrders;
    if (!list.length) return;
    const o = list[this.orderIdx % list.length];
    this.orderIdx++;
    const num = o.number ? `№${o.number}` : '';
    this.ui.pushEvent(`🪙 Заказ ${num} · ${o.client} · ${o.sum.toLocaleString('ru-RU')} ₽`, 'order');
    this.formOrder(o.sum); // менеджер встаёт, собирает на стеллаже, несёт на сборку
    this.celebrateSale(); // 🎉 конфетти + все пляшут
  }

  // helper: проиграть анимацию ходьбы по направлению к цели
  private walkAnim(s: Phaser.GameObjects.Sprite, char: string, dx: number, dy: number) {
    const dir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    s.play(`lz_${char}-walk-${dir}`, true);
  }

  // универсальный проход по точкам (с паузами): depth по y, анимация ходьбы по направлению.
  // маршруты ведём по чистым «коридорам», чтобы не лезть сквозь мебель.
  private walkPath(
    s: Phaser.GameObjects.Sprite,
    char: string,
    steps: ({ to: { x: number; y: number } } | { pause: number; onStart?: () => void })[],
    onComplete: () => void,
  ) {
    const dep = () => s.setDepth(s.y);
    dep();
    let cx = s.x, cy = s.y;
    const tweens: Phaser.Types.Tweens.TweenBuilderConfig[] = [];
    for (const st of steps) {
      if ('pause' in st) {
        tweens.push({ targets: s, x: cx, y: cy, duration: st.pause, onStart: st.onStart });
      } else {
        const { x, y } = st.to;
        const dx = x - cx, dy = y - cy;
        const d = Math.max(200, (Math.hypot(dx, dy) / 46) * 1000);
        tweens.push({ targets: s, x, y, duration: d, onStart: () => this.walkAnim(s, char, dx, dy), onUpdate: dep });
        cx = x; cy = y;
      }
    }
    this.tweens.chain({ targets: s, tweens, onComplete });
  }

  private readonly AISLE = 168;        // центральный коридор (ниже столов менеджеров)
  private packFrontY() { return PACK_POS.y + 8; }

  // менеджер собирает заказ: стол → (вбок в проход) → коридор → стеллаж (спереди) → сборка → обратно
  private formOrder(amount: number) {
    const free = this.mgrSeats.map((_, i) => i).filter((i) => !this.picking.has(i));
    if (!free.length) return; // все заняты — анимацию пропускаем (заказ всё равно учтён в KPI)
    const i = free[Math.abs(Math.floor(amount / 100)) % free.length];
    this.picking.add(i);
    const mx = MGR_X[i], seat = this.mgrSeats[i], char = this.seatChars[i];
    const pick = SHELF_PICK[Math.floor(amount / 1000) % SHELF_PICK.length];
    const gx = mx < 200 ? mx + 28 : mx - 28; // проход между столами (там стола нет — персонаж виден целиком)
    const sideY = MGR_FEET_Y + 18;            // встаёт сбоку, в проходе, ПЕРЕД линией столов
    seat.setVisible(false);
    this.deskNameObjs[i]?.setVisible(false);  // имя не висит над пустым столом
    // персонаж появляется сбоку от стола (в проходе) и идёт лицом вперёд
    const p = this.add.sprite(gx, sideY, `lz_${char}_run`, 18).setOrigin(0.5, 1).setDepth(sideY);
    // имя-табличка летит вместе с ним
    const tag = this.add.text(gx, sideY - 34, this.mgrNames[i] || '', {
      fontFamily: 'monospace', fontSize: '7px', color: '#fff', backgroundColor: '#5a4733e0', padding: { x: 2, y: 1 },
    }).setOrigin(0.5, 1).setResolution(4).setDepth(sideY + 1000);
    const follower = { s: p, t: tag };
    this.followers.push(follower);
    this.walkPath(p, char, [
      { to: { x: gx, y: this.AISLE } },
      { to: { x: pick.x, y: this.AISLE } },
      { to: { x: pick.x, y: pick.y } },
      { pause: 700, onStart: () => { p.anims.stop(); p.setFrame(2); this.toast(pick.x, pick.y - 22, '🧺', '#cfe6c4'); } }, // лицом к полке (вправо = 0-5)
      { to: { x: pick.x, y: this.AISLE } },
      { to: { x: PACK_POS.x, y: this.AISLE } },
      { to: { x: PACK_POS.x, y: this.packFrontY() } },
      { pause: 500, onStart: () => { p.setFrame(18); this.dropParcel(); } },
      { to: { x: PACK_POS.x, y: this.AISLE } },
      { to: { x: gx, y: this.AISLE } },
      { to: { x: gx, y: sideY } },
    ], () => {
      p.destroy(); tag.destroy();
      this.followers = this.followers.filter((f) => f !== follower);
      seat.setVisible(true);
      this.deskNameObjs[i]?.setVisible(true);
      this.picking.delete(i);
    });
  }

  // посылка появляется на столе сборки; при накоплении вызываем курьера
  private dropParcel() {
    const n = this.parcels.length;
    const px = PACK_POS.x - 10 + (n % 3) * 9;
    const py = PACK_POS.y - 16 - Math.floor(n / 3) * 7;
    const box = this.add.rectangle(px, py, 8, 7, 0xcaa15a).setStrokeStyle(1, 0x6b4a2b).setDepth(PACK_POS.y + 2);
    this.parcels.push(box);
    this.tweens.add({ targets: box, scale: { from: 0, to: 1 }, duration: 250, ease: 'Back.out' });
    if (this.parcels.length >= 3 && !this.courierBusy) this.sendCourier();
  }

  // курьер: вход → стол сборки (спереди) → грузит посылки → уезжает
  private sendCourier() {
    this.courierBusy = true;
    const taken = this.parcels.length;
    const fy = this.packFrontY();
    const c = this.add.sprite(ENTRANCE.x, ENTRANCE.y, 'lz_Bob_run', 18).setOrigin(0.5, 1);
    this.walkPath(c, 'Bob', [
      { to: { x: ENTRANCE.x, y: fy } },
      { to: { x: PACK_POS.x, y: fy } },
      {
        pause: 600, onStart: () => {
          c.anims.stop(); c.setFrame(8); // лицом к столу (вверх)
          this.parcels.forEach((b, k) => this.tweens.add({ targets: b, x: PACK_POS.x, y: fy, alpha: 0, scale: 0, delay: k * 60, duration: 300, onComplete: () => b.destroy() }));
          this.parcels = [];
          this.ui.pushEvent(`🚚 Курьер увёз <b>${taken}</b> заказ(ов)`, 'courier');
        },
      },
      { to: { x: ENTRANCE.x, y: fy } },
      { to: { x: ENTRANCE.x, y: ROOM_H - 8 } },
    ], () => { c.destroy(); this.courierBusy = false; });
  }

  // клиент с улицы заходит к администратору (розница), ждёт, уходит
  private toast(x: number, y: number, text: string, color: string, big = false) {
    const t = this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: big ? '14px' : '11px', color, backgroundColor: '#5a4733e0', padding: { x: 3, y: 1 } }).setOrigin(0.5).setResolution(4).setDepth(99999);
    if (big) this.tweens.add({ targets: t, scale: { from: 1.4, to: 1 }, duration: 400, ease: 'Back.out' });
    this.tweens.add({ targets: t, y: y - (big ? 26 : 18), alpha: 0, duration: big ? 2000 : 1500, ease: 'Quad.out', onComplete: () => t.destroy() });
  }

  private setupCamera() {
    const cam = this.cameras.main;
    const fit = () => {
      const W = this.scale.width, H = this.scale.height;
      let vw: number, vh: number;
      if (W < 760) {
        // телефон/узкий экран: офис сверху, панель снизу (58% высоты)
        vw = W;
        vh = Math.max(120, H - Math.round(H * 0.58));
      } else {
        // десктоп: панель справа
        vw = Math.max(120, W - PANEL_W);
        vh = H;
      }
      cam.setViewport(0, 0, vw, vh);
      cam.setZoom(Math.min((vw / ROOM_W) * 0.98, (vh / ROOM_H) * 0.98));
      cam.centerOn(ROOM_W / 2, ROOM_H / 2);
    };
    fit();
    this.scale.on('resize', fit);
  }
}
