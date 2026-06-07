import type { Character } from '../entities/Character';
import type { NavGrid, Pt } from './Pathfinding';

export const PRODUCT_COLORS = [0xff7a7a, 0x5cdb95, 0xffcd5c, 0x5cb8ff, 0xb89bff, 0xff9f5c];
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// Manager: idle at desk → fetch from a shelf → return → done. One task at a time.
export class ManagerAgent {
  busy = false;
  constructor(
    public char: Character,
    public deskTile: Pt,
    public shelves: readonly Pt[],
    public nav: NavGrid,
  ) {}

  get id() {
    return this.char.def.id;
  }

  fetchOrder(onDone: () => void): boolean {
    if (this.busy) return false;
    this.busy = true;
    const shelf = pick(this.shelves as Pt[]);
    const color = pick(PRODUCT_COLORS);

    this.char.goTo(this.nav, { x: shelf.x, y: shelf.y + 1 }, () => {
      this.char.faceDir('up');
      this.char.setCarry(color);
      this.char.scene.time.delayedCall(450, () => {
        this.char.goTo(this.nav, { x: this.deskTile.x, y: this.deskTile.y }, () => {
          this.char.setCarry(null);
          this.char.sit();
          this.busy = false;
          onDone();
        });
      });
    });
    return true;
  }
}

// Founder: periodically strolls to a random manager and back to the corner desk.
export class FounderAgent {
  private cooldown = 8000;
  constructor(public char: Character, public homeTile: Pt, public nav: NavGrid) {}

  update(dt: number, managerDesks: Pt[]) {
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    this.cooldown = 16000 + Math.random() * 12000;
    const target = pick(managerDesks);
    this.char.goTo(this.nav, { x: target.x, y: target.y + 2 }, () => {
      this.char.faceDir('side');
      this.char.scene.time.delayedCall(1500, () => {
        this.char.goTo(this.nav, { x: this.homeTile.x, y: this.homeTile.y }, () => this.char.sit());
      });
    });
  }
}
