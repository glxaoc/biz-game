// Minimal 4-directional A* over a boolean walkable grid (tile coordinates).
export interface Pt {
  x: number;
  y: number;
}

export class NavGrid {
  walkable: boolean[][];
  constructor(public cols: number, public rows: number, isWalkable: (x: number, y: number) => boolean) {
    this.walkable = [];
    for (let y = 0; y < rows; y++) {
      this.walkable[y] = [];
      for (let x = 0; x < cols; x++) this.walkable[y][x] = isWalkable(x, y);
    }
  }
  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }
  isWalkable(x: number, y: number) {
    return this.inBounds(x, y) && this.walkable[y][x];
  }
  // nearest walkable tile to a target (for goals that sit on furniture)
  nearestWalkable(x: number, y: number): Pt {
    if (this.isWalkable(x, y)) return { x, y };
    for (let r = 1; r < Math.max(this.cols, this.rows); r++) {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          if (this.isWalkable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
        }
    }
    return { x, y };
  }
}

const key = (x: number, y: number) => y * 100000 + x;

export function findPath(grid: NavGrid, start: Pt, goal: Pt): Pt[] {
  const g = grid.nearestWalkable(goal.x, goal.y);
  if (start.x === g.x && start.y === g.y) return [];

  const open: Pt[] = [start];
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[key(start.x, start.y), 0]]);
  const fScore = new Map<number, number>([[key(start.x, start.y), heur(start, g)]]);
  const inOpen = new Set<number>([key(start.x, start.y)]);

  while (open.length) {
    // node in open with lowest fScore
    let bi = 0;
    for (let i = 1; i < open.length; i++)
      if ((fScore.get(key(open[i].x, open[i].y)) ?? Infinity) < (fScore.get(key(open[bi].x, open[bi].y)) ?? Infinity)) bi = i;
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.x, cur.y);
    inOpen.delete(ck);

    if (cur.x === g.x && cur.y === g.y) return reconstruct(cameFrom, cur);

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!grid.isWalkable(nx, ny)) continue;
      const nk = key(nx, ny);
      const tentative = (gScore.get(ck) ?? Infinity) + 1;
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, ck);
        gScore.set(nk, tentative);
        fScore.set(nk, tentative + heur({ x: nx, y: ny }, g));
        if (!inOpen.has(nk)) {
          open.push({ x: nx, y: ny });
          inOpen.add(nk);
        }
      }
    }
  }
  return []; // no path
}

function heur(a: Pt, b: Pt) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function reconstruct(cameFrom: Map<number, number>, cur: Pt): Pt[] {
  const path: Pt[] = [cur];
  let ck = key(cur.x, cur.y);
  while (cameFrom.has(ck)) {
    const pk = cameFrom.get(ck)!;
    const x = pk % 100000, y = Math.floor(pk / 100000);
    path.unshift({ x, y });
    ck = pk;
  }
  path.shift(); // drop start tile
  return path;
}
