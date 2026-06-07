// Declarative character manifest. Each character either uses procedural
// placeholder colors (now) OR a real spritesheet (drop-in later — set `sheet`).
// When the user sends sprites, we only edit this file; scene code is untouched.

export type Role = 'manager' | 'founder' | 'client';

export interface Palette {
  shirt: number;
  hair: number;
  skin: number;
}

export interface SheetSpec {
  url: string; // path under public/assets/characters/
  frameW: number;
  frameH: number;
  // frame index ranges per animation, e.g. walk_down: [8, 11]
  anims: Record<string, [number, number]>;
}

export interface CharDef {
  id: string;
  name: string;
  role: Role;
  palette: Palette; // used for placeholder; ignored if `sheet` present
  sheet?: SheetSpec; // optional real spritesheet (future)
  crown?: boolean; // founder marker on placeholder
}

// HD walk sheet shared layout: 128x144, 4 frames per row,
// row 0 = down (0-3), row 1 = up (4-7), row 2 = side/left (8-11).
const hdSheet = (id: string): SheetSpec => ({
  url: `assets/characters/sheet_${id}.png`,
  frameW: 32,
  frameH: 48,
  anims: {
    'walk-down': [0, 3],
    'walk-up': [4, 7],
    'walk-side': [8, 11],
    'idle-down': [0, 0],
    'idle-up': [4, 4],
    'idle-side': [8, 8],
  },
});

export const STAFF: CharDef[] = [
  { id: 'anna', name: 'Анна', role: 'manager', palette: { shirt: 0x5cb8ff, hair: 0x3a2a1a, skin: 0xe7b48f }, sheet: hdSheet('anna') },
  { id: 'dmitry', name: 'Дмитрий', role: 'manager', palette: { shirt: 0x5cdb95, hair: 0x1a1a1a, skin: 0xd9a988 }, sheet: hdSheet('dmitry') },
  { id: 'sveta', name: 'Света', role: 'manager', palette: { shirt: 0xb89bff, hair: 0x6b3a1a, skin: 0xe7b48f }, sheet: hdSheet('sveta') },
  { id: 'ivan', name: 'Иван', role: 'founder', palette: { shirt: 0xffcd5c, hair: 0x2a1a0a, skin: 0xd9a988 }, crown: true, sheet: hdSheet('ivan') },
];

// Palettes used for randomly-spawned clients.
export const CLIENT_PALETTES: Palette[] = [
  { shirt: 0xff7a7a, hair: 0x2a2a2a, skin: 0xe7b48f },
  { shirt: 0xff9f5c, hair: 0x4a2a1a, skin: 0xd9a988 },
  { shirt: 0x7d8aa0, hair: 0x3a3a3a, skin: 0xe7b48f },
  { shirt: 0x9fd6a0, hair: 0x5a3a1a, skin: 0xcaa07c },
];
