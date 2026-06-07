import Phaser from 'phaser';
import { TILE } from '../main';
import type { CharDef } from '../config/characters';
import { buildPlaceholderSheet } from './placeholder';
import { NavGrid, findPath, type Pt } from '../ai/Pathfinding';

type Facing = 'down' | 'up' | 'side';

export function tileToWorld(tx: number, ty: number) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 + 4 };
}

// Registers walk/idle anims for a preloaded HD sheet (128x144 layout:
// down 0-3, up 4-7, side 8-11). Mirrors the placeholder anim keys so the
// Character movement code is identical for both art paths.
function registerSheetAnims(scene: Phaser.Scene, key: string) {
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

export class Character {
  sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private carry?: Phaser.GameObjects.Rectangle;
  private facing: Facing = 'down';
  private flip = false;
  private path: Pt[] = [];
  private target?: { x: number; y: number };
  private onArrive?: () => void;
  private moving = false;
  private seat?: { x: number; y: number };
  readonly key: string;
  speed = 34; // px/sec

  constructor(public scene: Phaser.Scene, public def: CharDef, tx: number, ty: number) {
    this.key = `char_${def.id}`;
    // Staff have a real HD sheet (preloaded in BootScene); register its anims.
    // Everyone else (clients) uses the procedural placeholder builder.
    const hd = def.sheet && scene.textures.exists(this.key);
    if (hd) registerSheetAnims(scene, this.key);
    else buildPlaceholderSheet(scene, this.key, def.palette, def.crown);
    const w = tileToWorld(tx, ty);

    this.shadow = scene.add.image(w.x, w.y + 1, 'shadow').setDepth(w.y - 1);
    // Origin at the feet (0.5,1.0) so characters stand ON the floor, not floating.
    this.sprite = scene.add.sprite(w.x, w.y, this.key).setOrigin(0.5, 1.0);
    // Placeholder clients are 16x24; scale them up to sit near the HD cast.
    if (!hd) this.sprite.setScale(1.7);
    this.sprite.play(`${this.key}-idle-down`);

    this.label = scene.add
      .text(w.x, w.y - this.sprite.displayHeight - 2, def.role === 'client' ? '' : def.name, {
        fontFamily: 'monospace',
        fontSize: '7px',
        color: def.role === 'client' ? '#9fd6ff' : '#e7edf6',
        backgroundColor: '#0a0d12cc',
        padding: { x: 2, y: 1 },
      })
      .setOrigin(0.5)
      .setResolution(3);

    this.refreshDepth();
  }

  get x() {
    return this.sprite.x;
  }
  get y() {
    return this.sprite.y;
  }
  get tileX() {
    return Math.floor(this.sprite.x / TILE);
  }
  get tileY() {
    return Math.floor((this.sprite.y - 4) / TILE);
  }

  // Enable a desk seat: registers the sit/type anim and remembers where to sit.
  enableSit(x: number, y: number, sitTexture: string) {
    this.seat = { x, y };
    const animKey = `${this.key}-sit`;
    if (!this.scene.anims.exists(animKey)) {
      this.scene.anims.create({
        key: animKey,
        frames: [
          { key: sitTexture, frame: 0 },
          { key: sitTexture, frame: 1 },
        ],
        frameRate: 3,
        repeat: -1,
      });
    }
  }

  // Sit down at the desk seat (typing). No-op if this character has no seat.
  sit() {
    if (!this.seat) return;
    this.moving = false;
    this.path = [];
    this.target = undefined;
    this.facing = 'side';
    this.flip = false;
    this.sprite.setFlipX(false);
    this.sprite.setPosition(this.seat.x, this.seat.y);
    this.sprite.play(`${this.key}-sit`);
    this.refreshDepth();
  }

  goTo(grid: NavGrid, tile: Pt, onArrive?: () => void) {
    const path = findPath(grid, { x: this.tileX, y: this.tileY }, tile);
    this.path = path;
    this.onArrive = onArrive;
    if (path.length === 0) {
      this.moving = false;
      onArrive?.();
    } else {
      this.nextNode();
      this.moving = true;
    }
  }

  private nextNode() {
    const n = this.path.shift();
    if (!n) {
      this.target = undefined;
      return;
    }
    this.target = tileToWorld(n.x, n.y);
  }

  setCarry(color: number | null) {
    if (color === null) {
      this.carry?.destroy();
      this.carry = undefined;
      return;
    }
    if (!this.carry) {
      this.carry = this.scene.add.rectangle(this.x + 6, this.y - 6, 6, 6, color).setStrokeStyle(1, 0x3c2b18);
    }
    this.carry.setFillStyle(color);
  }

  private setFacingFromDelta(dx: number, dy: number) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      this.facing = 'side';
      this.flip = dx > 0; // side art faces left; flip when moving right
    } else {
      this.facing = dy > 0 ? 'down' : 'up';
    }
  }

  private playWalk() {
    this.sprite.setFlipX(this.facing === 'side' && this.flip);
    const a = `${this.key}-walk-${this.facing}`;
    if (this.sprite.anims.currentAnim?.key !== a) this.sprite.play(a);
  }

  private playIdle() {
    this.sprite.setFlipX(this.facing === 'side' && this.flip);
    const a = `${this.key}-idle-${this.facing}`;
    if (this.sprite.anims.currentAnim?.key !== a) this.sprite.play(a);
  }

  private refreshDepth() {
    const d = this.sprite.y;
    this.sprite.setDepth(d);
    this.shadow.setDepth(d - 1);
    this.label.setDepth(d + 1000);
    this.carry?.setDepth(d + 1);
  }

  update(dt: number) {
    if (this.moving && this.target) {
      const dx = this.target.x - this.sprite.x;
      const dy = this.target.y - this.sprite.y;
      const dist = Math.hypot(dx, dy);
      const step = (this.speed * dt) / 1000;
      if (dist <= step) {
        this.sprite.x = this.target.x;
        this.sprite.y = this.target.y;
        if (this.path.length) this.nextNode();
        else {
          this.moving = false;
          this.target = undefined;
          this.playIdle();
          const cb = this.onArrive;
          this.onArrive = undefined;
          cb?.();
        }
      } else {
        this.setFacingFromDelta(dx, dy);
        this.sprite.x += (dx / dist) * step;
        this.sprite.y += (dy / dist) * step;
        this.playWalk();
      }
    }
    // follow -ups
    this.shadow.x = this.sprite.x;
    this.shadow.y = this.sprite.y + 1;
    this.label.x = this.sprite.x;
    this.label.y = this.sprite.y - this.sprite.displayHeight - 2;
    if (this.carry) {
      this.carry.x = this.sprite.x + 6;
      this.carry.y = this.sprite.y - this.sprite.displayHeight * 0.5;
    }
    this.refreshDepth();
  }

  faceDir(f: Facing, flip = false) {
    this.facing = f;
    this.flip = flip;
    this.playIdle();
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
    this.label.destroy();
    this.carry?.destroy();
  }
}
