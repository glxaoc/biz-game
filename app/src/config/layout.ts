// Office layout — reference-style: a row of hi-detail manager cubicles on a
// warm wood floor, warm brick walls, soft vignette. TILE = 16. 28x18 tiles.

export const ROOM = { cols: 28, rows: 18 } as const;
export const ROOM_PX = { w: ROOM.cols * 16, h: ROOM.rows * 16 } as const;

// Baked hi-detail cubicles (manager + desk + monitor + plant + mug), 64x74 each.
export const CUB = { w: 64, h: 74 } as const;
export interface Cubicle { key: string; label: string; x: number; y: number }
export const CUBICLES: Cubicle[] = [
  { key: 'cubicle_1', label: 'Менеджер 1', x: 14, y: 66 },
  { key: 'cubicle_2', label: 'Менеджер 2', x: 94, y: 66 },
  { key: 'cubicle_3', label: 'Менеджер 3', x: 174, y: 66 },
  { key: 'cubicle_4', label: 'Менеджер 4', x: 254, y: 66 },
  { key: 'cubicle_5', label: 'Менеджер 5', x: 334, y: 66 },
];

// Wall decor on the back wall (pixel positions, drawn at low depth on the wall).
export const WAINSCOT_ROW = 3; // tile row for the wood paneling band
export const SIGN = { x: 168, y: 20 } as const;
export const POSTER = { x: 20, y: 22 } as const;
export const HANGING = [{ x: 130, y: 16 }, { x: 300, y: 16 }] as const;

export interface Prop { key: string; x: number; y: number; w: number; h: number }
export const PROPS: Prop[] = [
  { key: 'plant_big', x: 10, y: 232, w: 22, h: 34 },
  { key: 'plant_big', x: 414, y: 232, w: 22, h: 34 },
  { key: 'plant_big', x: 414, y: 150, w: 22, h: 34 },
];
export const RUG = { key: 'rug_big', x: 28, y: 196, w: 64, h: 48 } as const;
export const WINDOWS = [
  { x: 56, y: 2 },
  { x: 360, y: 2 },
] as const;

export const DOOR = { x: 13, y: 16 } as const;

export function buildSolidGrid(): boolean[][] {
  const solid: boolean[][] = Array.from({ length: ROOM.rows }, () =>
    Array.from({ length: ROOM.cols }, () => false),
  );
  const mark = (px: number, py: number, pw: number, ph: number) => {
    const tx0 = Math.floor(px / 16), ty0 = Math.floor(py / 16);
    const tx1 = Math.floor((px + pw - 1) / 16), ty1 = Math.floor((py + ph - 1) / 16);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++)
        if (ty >= 0 && ty < ROOM.rows && tx >= 0 && tx < ROOM.cols) solid[ty][tx] = true;
  };
  for (let x = 0; x < ROOM.cols; x++) { solid[0][x] = true; solid[ROOM.rows - 1][x] = true; }
  for (let y = 0; y < ROOM.rows; y++) { solid[y][0] = true; solid[y][ROOM.cols - 1] = true; }
  solid[ROOM.rows - 1][13] = false;
  solid[ROOM.rows - 1][14] = false;
  // cubicle desk footprint (lower ~30px of each cubicle = the desk) is solid
  for (const c of CUBICLES) mark(c.x + 2, c.y + 50, CUB.w - 4, 22);
  for (const p of PROPS) mark(p.x, p.y, p.w, p.h);
  return solid;
}

// Front tile of a cubicle (where a courier walks up to it).
export const cubicleFrontTile = (c: Cubicle) => ({ x: Math.floor((c.x + CUB.w / 2) / 16), y: Math.floor((c.y + CUB.h + 22) / 16) });
