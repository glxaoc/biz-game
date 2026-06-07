// Генератор пиксель-ассетов офиса (PNG, RGBA) — без зависимостей, только zlib.
// Запуск: node tools/gen_office_tiles.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('app/public/assets/tilesets');

// ---------- мини-canvas ----------
function canvas(w, h) {
  return { w, h, d: new Uint8Array(w * h * 4) };
}
function px(c, x, y, [r, g, b, a = 255]) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  if (a === 255) { c.d[i] = r; c.d[i + 1] = g; c.d[i + 2] = b; c.d[i + 3] = 255; return; }
  if (a === 0) return;
  const af = a / 255, ia = 1 - af;
  c.d[i] = Math.round(r * af + c.d[i] * ia);
  c.d[i + 1] = Math.round(g * af + c.d[i + 1] * ia);
  c.d[i + 2] = Math.round(b * af + c.d[i + 2] * ia);
  c.d[i + 3] = Math.max(c.d[i + 3], a);
}
function rect(c, x, y, w, h, col) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(c, x + i, y + j, col); }
function frame(c, x, y, w, h, col) {
  for (let i = 0; i < w; i++) { px(c, x + i, y, col); px(c, x + i, y + h - 1, col); }
  for (let j = 0; j < h; j++) { px(c, x, y + j, col); px(c, x + w - 1, y + j, col); }
}

// ---------- 5x7 шрифт (заглавные латинские, нужные буквы) ----------
const FONT = {
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};
function textW(s) { return s.length * 6 - 1; }
// рисуем «выгравированный» текст: тёмные буквы + светлый блик на 1px ниже-правее
function drawText(c, x, y, s, dark, hi) {
  for (let k = 0; k < s.length; k++) {
    const g = FONT[s[k]]; if (!g) continue;
    const ox = x + k * 6;
    for (let r = 0; r < 7; r++) for (let i = 0; i < 5; i++) {
      if (g[r][i] === '1') { if (hi) px(c, ox + i + 1, y + r + 1, hi); }
    }
    for (let r = 0; r < 7; r++) for (let i = 0; i < 5; i++) {
      if (g[r][i] === '1') px(c, ox + i, y + r, dark);
    }
  }
}

// ---------- PNG-энкодер (truecolor+alpha, filter 0) ----------
function encodePNG(c) {
  const { w, h, d } = c;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter none
    d.subarray(y * w * 4, (y + 1) * w * 4).forEach((v, i) => { raw[y * (w * 4 + 1) + 1 + i] = v; });
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function save(name, c) { fs.writeFileSync(path.join(OUT, name), encodePNG(c)); console.log('wrote', name, c.w + 'x' + c.h); }

// ============ 1) ВЫВЕСКА: короче + «BEAUTY GROUP» выгравировано ============
function genSign() {
  const W = 58, H = 30;
  const c = canvas(W, H);
  const woodDark = [90, 62, 36], woodMid = [122, 86, 50], woodHi = [158, 118, 70];
  const panel = [232, 221, 192], panelSh = [205, 190, 158];
  // рама (дерево)
  rect(c, 0, 0, W, H, woodMid);
  frame(c, 0, 0, W, H, woodDark);
  frame(c, 1, 1, W - 2, H - 2, woodHi);
  // внутренняя панель
  rect(c, 4, 4, W - 8, H - 8, panel);
  frame(c, 4, 4, W - 8, H - 8, panelSh);
  // две петли-гвоздика сверху
  px(c, 12, 1, [60, 42, 26]); px(c, W - 13, 1, [60, 42, 26]);
  // текст BEAUTY / GROUP по центру, выгравирован
  const dark = [91, 58, 30], hi = [255, 246, 224, 150];
  const l1 = 'BEAUTY', l2 = 'GROUP';
  drawText(c, Math.round((W - textW(l1)) / 2), 6, l1, dark, hi);
  drawText(c, Math.round((W - textW(l2)) / 2), 16, l2, dark, hi);
  save('sign_board.png', c);
}

// ============ 2) СТЕЛЛАЖ С КОСМЕТИКОЙ (баночки/флаконы) ============
function genShelf() {
  const W = 38, H = 48;
  const c = canvas(W, H);
  const wood = [126, 92, 54], woodDark = [82, 58, 34], woodHi = [160, 120, 74], back = [110, 84, 58];
  // корпус
  rect(c, 0, 0, W, H, wood);
  frame(c, 0, 0, W, H, woodDark);
  frame(c, 1, 1, W - 2, H - 2, woodHi);
  rect(c, 3, 3, W - 6, H - 6, back); // задняя стенка (ниша)
  // палитра баночек/флаконов
  const jars = [
    [[244, 180, 200], [255, 220, 232]], // розовый
    [[180, 226, 210], [214, 245, 234]], // мятный
    [[206, 196, 240], [230, 224, 250]], // лавандовый
    [[250, 214, 178], [255, 234, 210]], // персиковый
    [[235, 235, 240], [255, 255, 255]], // белый
    [[176, 214, 244], [212, 234, 252]], // голубой
  ];
  const shelfY = [6, 19, 32]; // 3 полки
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (const sy of shelfY) {
    // доска полки
    rect(c, 3, sy + 9, W - 6, 2, woodDark);
    rect(c, 3, sy + 8, W - 6, 1, woodHi);
    // баночки на полке
    let x = 5;
    while (x < W - 7) {
      const w = 3 + Math.floor(rnd() * 2); // 3-4px
      const h = 5 + Math.floor(rnd() * 3); // 5-7px
      const [body, lid] = jars[Math.floor(rnd() * jars.length)];
      const top = sy + 8 - h;
      rect(c, x, top, w, h, body);          // тело флакона
      px(c, x, top, [255, 255, 255, 90]);    // блик
      rect(c, x, top - 1, w, 1, [70, 70, 78]); // крышка
      x += w + 2;
    }
  }
  save('lz_shelf_cosmetics.png', c);
}

// ============ 3) ПУСТОЙ СТОЛ (для зоны сборки — без компьютера) ============
function genTable() {
  const W = 32, H = 20;
  const c = canvas(W, H);
  const wood = [176, 122, 68], woodDark = [107, 74, 43], woodHi = [200, 154, 94], leg = [90, 62, 36];
  // ножки (выглядывают снизу по углам)
  rect(c, 3, H - 5, 3, 5, leg); rect(c, W - 6, H - 5, 3, 5, leg);
  // столешница
  rect(c, 1, 2, W - 2, H - 8, wood);
  frame(c, 1, 2, W - 2, H - 8, woodDark);
  rect(c, 2, 3, W - 4, 2, woodHi); // блик сверху
  // лёгкая текстура дерева
  for (let x = 4; x < W - 4; x += 5) rect(c, x, 6, 1, H - 13, [160, 110, 62]);
  save('lz_table_plain.png', c);
}

// ============ 4) СОБАЧКИ-АГЕНТЫ (вид сбоку, свой цвет+ошейник) ============
// 4 кадра: 0,1 — трусца (лапы двигаются); 2,3 — покой (лапы на месте, хвост виляет вниз/вверх)
function dogFrame(c, ox, fur, furDark, collar, legs, tailTipY) {
  const D = furDark, F = fur;
  // хвост (слева): база + кончик на высоте tailTipY (виляет)
  px(c, ox + 2, 6, F); px(c, ox + 1, 6, F); px(c, ox + 1, tailTipY, F); px(c, ox, tailTipY, D);
  // тело
  rect(c, ox + 2, 6, 9, 4, F);
  rect(c, ox + 2, 9, 9, 1, D);        // нижняя кромка/тень
  // голова справа
  rect(c, ox + 10, 4, 4, 5, F);
  rect(c, ox + 13, 6, 2, 2, F);       // морда
  px(c, ox + 14, 7, D);               // нос
  rect(c, ox + 10, 2, 2, 2, D);       // ухо
  px(c, ox + 12, 5, [20, 18, 16]);    // глаз
  // ошейник (цвет агента)
  rect(c, ox + 9, 5, 1, 4, collar);
  // лапы
  const ly = 10;
  for (const lx of legs) rect(c, ox + lx, ly, 1, 2, D);
}
function genDog(file, fur, furDark, collar) {
  const c = canvas(64, 16);
  dogFrame(c, 0, fur, furDark, collar, [3, 6, 9, 11], 5);  // 0 трусца A
  dogFrame(c, 16, fur, furDark, collar, [4, 7, 8, 10], 4); // 1 трусца B
  dogFrame(c, 32, fur, furDark, collar, [3, 6, 9, 11], 7); // 2 покой, хвост вниз
  dogFrame(c, 48, fur, furDark, collar, [3, 6, 9, 11], 3); // 3 покой, хвост вверх (виляет)
  save(file, c);
}
function genDogs() {
  genDog('lz_dog_debt.png', [196, 142, 84], [120, 84, 46], [224, 90, 90]);       // инкассатор — рыжий, красный ошейник
  genDog('lz_dog_stock.png', [170, 174, 182], [104, 108, 116], [90, 138, 224]);  // кладовщик — серый, синий ошейник
  genDog('lz_dog_analytics.png', [232, 222, 196], [150, 140, 116], [160, 106, 224]); // аналитик — кремовый, фиолет
  genDog('lz_dog_wake.png', [226, 182, 96], [150, 116, 52], [94, 196, 106]);     // будильник — золотистый, зелёный
}

// ============ 5) ЛЕЖАНКА ДЛЯ СОБАЧКИ ============
function genBed() {
  const W = 22, H = 12;
  const c = canvas(W, H);
  const rim = [120, 84, 46], rimHi = [150, 110, 64], cush = [210, 152, 92], cushHi = [234, 188, 132];
  // бортик (овал)
  rect(c, 3, 1, W - 6, H - 2, rim);
  rect(c, 1, 3, W - 2, H - 5, rim);
  frame(c, 1, 3, W - 2, H - 5, rimHi);
  // подушка
  rect(c, 4, 4, W - 8, H - 7, cush);
  rect(c, 5, 4, W - 10, 1, cushHi);
  save('lz_dog_bed.png', c);
}

// ============ 6) ГОРШЕЧНОЕ РАСТЕНИЕ (замена мутного lz_plant) ============
function genPlant() {
  const W = 16, H = 18;
  const c = canvas(W, H);
  const gD = [54, 112, 52], gM = [108, 176, 80], gL = [162, 216, 128];
  const potD = [110, 58, 34], pot = [181, 98, 60], potHi = [207, 124, 76], soil = [70, 46, 28];
  const flower = [233, 128, 175], flowerC = [255, 214, 122];
  // крона — овал mid-зелени
  for (let y = 1; y <= 12; y++) {
    const t = (y - 6.5) / 6;
    const half = Math.round(5 * Math.sqrt(Math.max(0, 1 - t * t)));
    for (let x = 8 - half; x <= 7 + half; x++) px(c, x, y, gM);
  }
  // тени снизу, блики сверху — объём
  for (let x = 3; x <= 12; x++) { px(c, x, 11, gD); px(c, x, 12, gD); }
  for (const [x, y] of [[6, 2], [8, 1], [9, 3], [5, 4], [10, 5], [7, 3]]) px(c, x, y, gL);
  for (const [x, y] of [[4, 8], [11, 8], [7, 10], [10, 10], [5, 6]]) px(c, x, y, gD);
  // цветочки (бьюти-акцент)
  for (const [x, y] of [[5, 5], [11, 4], [8, 8]]) { rect(c, x, y, 2, 2, flower); px(c, x, y, flowerC); }
  // горшок
  rect(c, 5, 12, 6, 1, soil);
  rect(c, 4, 13, 8, 1, potHi);
  rect(c, 4, 14, 8, 2, pot);
  rect(c, 5, 16, 6, 2, pot);
  frame(c, 4, 13, 8, 5, potD);
  save('lz_plant.png', c);
}

// ============ 7) ПОЛ — спокойный, приглушённый (низкий контраст, минимум деталей) ============
function genFloor() {
  const W = 16, H = 16;
  const c = canvas(W, H);
  const base = [192, 178, 152];  // мягкий тёплый беж
  const seam = [178, 164, 138];  // чуть темнее — едва заметный шов
  const hi = [201, 188, 163];    // лёгкий блик
  rect(c, 0, 0, W, H, base);
  // горизонтальные доски 8px, низкий контраст
  rect(c, 0, 0, W, 1, seam); rect(c, 0, 8, W, 1, seam);
  rect(c, 0, 1, W, 1, hi); rect(c, 0, 9, W, 1, hi);
  // вертикальные стыки со смещением (кирпичная раскладка), едва заметные
  for (let y = 1; y < 8; y++) px(c, 0, y, seam);
  for (let y = 9; y < 16; y++) px(c, 8, y, seam);
  save('lz_floor.png', c);
}

genSign();
genShelf();
genTable();
genDogs();
genBed();
genPlant();
genFloor();
console.log('done');
