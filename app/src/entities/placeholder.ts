import Phaser from 'phaser';
import type { Palette } from '../config/characters';

// Builds a procedural placeholder spritesheet for one character and registers
// its walk/idle animations. Replaced transparently once real sheets are wired
// via characters.ts `sheet`. Layout: 3 rows (down, up, side-left) x 4 frames.
export const FW = 16;
export const FH = 24;
const COLS = 4;
const ROWS = 3; // 0 down, 1 up, 2 side(left)

export function buildPlaceholderSheet(
  scene: Phaser.Scene,
  key: string,
  pal: Palette,
  crown = false,
) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  for (let dir = 0; dir < ROWS; dir++) {
    for (let f = 0; f < COLS; f++) {
      drawFrame(g, f * FW, dir * FH, dir, f, pal, crown);
    }
  }
  g.generateTexture(key, COLS * FW, ROWS * FH);
  g.destroy();

  // slice into numbered frames
  const tex = scene.textures.get(key);
  let i = 0;
  for (let dir = 0; dir < ROWS; dir++)
    for (let f = 0; f < COLS; f++) tex.add(i++, 0, f * FW, dir * FH, FW, FH);

  registerAnims(scene, key);
}

function px(g: Phaser.GameObjects.Graphics, c: number, a: number, x: number, y: number, w: number, h: number) {
  g.fillStyle(c, a).fillRect(Math.round(x), Math.round(y), w, h);
}

function shade(hex: number, amt: number): number {
  let r = ((hex >> 16) & 255) + amt, gg = ((hex >> 8) & 255) + amt, b = (hex & 255) + amt;
  r = Math.max(0, Math.min(255, r)); gg = Math.max(0, Math.min(255, gg)); b = Math.max(0, Math.min(255, b));
  return (r << 16) | (gg << 8) | b;
}

function drawFrame(
  g: Phaser.GameObjects.Graphics,
  ox: number,
  oy: number,
  dir: number,
  f: number,
  pal: Palette,
  crown: boolean,
) {
  const legPhase = f === 1 ? 1 : f === 3 ? -1 : 0;
  const armBob = f === 1 || f === 3 ? 1 : 0;

  // legs
  px(g, 0x22282f, 1, ox + 5, oy + 19 + (legPhase > 0 ? -1 : 0), 3, 4);
  px(g, 0x22282f, 1, ox + 8, oy + 19 + (legPhase < 0 ? -1 : 0), 3, 4);
  // body / shirt
  px(g, pal.shirt, 1, ox + 3, oy + 11, 10, 9);
  px(g, shade(pal.shirt, -22), 1, ox + 3, oy + 18, 10, 2);
  // arms
  px(g, pal.shirt, 1, ox + 2, oy + 12 + armBob, 2, 5);
  px(g, pal.shirt, 1, ox + 12, oy + 12 + armBob, 2, 5);
  // head
  px(g, pal.skin, 1, ox + 4, oy + 4, 8, 8);
  px(g, shade(pal.skin, -25), 1, ox + 4, oy + 11, 8, 1);

  if (dir === 1) {
    // up: back of head — hair covers face
    px(g, pal.hair, 1, ox + 4, oy + 3, 8, 8);
  } else {
    // hair cap
    px(g, pal.hair, 1, ox + 4, oy + 3, 8, 4);
    px(g, pal.hair, 1, ox + 4, oy + 6, 1, 3);
    px(g, pal.hair, 1, ox + 11, oy + 6, 1, 3);
    if (dir === 0) {
      // eyes facing down
      px(g, 0x1a1a1a, 1, ox + 6, oy + 8, 1, 2);
      px(g, 0x1a1a1a, 1, ox + 9, oy + 8, 1, 2);
    } else {
      // side (left-facing) single eye
      px(g, 0x1a1a1a, 1, ox + 5, oy + 8, 1, 2);
    }
  }

  if (crown) {
    px(g, 0xffd84d, 1, ox + 4, oy + 1, 8, 2);
    px(g, 0xffd84d, 1, ox + 4, oy, 1, 1);
    px(g, 0xffd84d, 1, ox + 7, oy, 1, 1);
    px(g, 0xffd84d, 1, ox + 11, oy, 1, 1);
  }
}

function registerAnims(scene: Phaser.Scene, key: string) {
  const mk = (suffix: string, frames: number[], rate: number, repeat: number) => {
    const animKey = `${key}-${suffix}`;
    if (scene.anims.exists(animKey)) return;
    scene.anims.create({
      key: animKey,
      frames: frames.map((fr) => ({ key, frame: fr })),
      frameRate: rate,
      repeat,
    });
  };
  mk('walk-down', [0, 1, 2, 3], 8, -1);
  mk('walk-up', [4, 5, 6, 7], 8, -1);
  mk('walk-side', [8, 9, 10, 11], 8, -1);
  mk('idle-down', [0], 1, -1);
  mk('idle-up', [4], 1, -1);
  mk('idle-side', [8], 1, -1);
}
