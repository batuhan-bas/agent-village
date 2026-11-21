// Grid pathfinding for actors. A grid is rows of 0/1 (1 = walkable), one cell per `tile` map pixels.

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function walkable(grid, tx, ty) {
  return ty >= 0 && ty < grid.length && tx >= 0 && tx < grid[0].length && grid[ty][tx] === 1;
}

// Nearest walkable cell to (tx, ty), searching outward ring by ring; null if the grid has none.
export function nearestWalkable(grid, tx, ty) {
  const rows = grid.length, cols = grid[0].length;
  for (let r = 0; r < Math.max(rows, cols); r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (walkable(grid, tx + dx, ty + dy)) return [tx + dx, ty + dy];
    }
  }
  return null;
}

// True when a straight walk from (x0,y0) to (x1,y1) in map pixels stays on walkable cells.
// Visits every cell the segment touches (grid traversal, not sampling), so it can't clip a
// corner; passing exactly through a corner counts as touching both side cells.
export function clearLine(grid, tile, x0, y0, x1, y1) {
  let cx = Math.floor(x0 / tile), cy = Math.floor(y0 / tile);
  const ex = Math.floor(x1 / tile), ey = Math.floor(y1 / tile);
  const dx = x1 - x0, dy = y1 - y0, sx = Math.sign(dx), sy = Math.sign(dy);
  const tdx = dx ? tile / Math.abs(dx) : Infinity, tdy = dy ? tile / Math.abs(dy) : Infinity;
  let tmx = dx ? (sx > 0 ? (cx + 1) * tile - x0 : x0 - cx * tile) / Math.abs(dx) : Infinity;
  let tmy = dy ? (sy > 0 ? (cy + 1) * tile - y0 : y0 - cy * tile) / Math.abs(dy) : Infinity;
  for (let n = 0; n < 4 * (grid.length + grid[0].length); n++) {
    if (!walkable(grid, cx, cy)) return false;
    if (cx === ex && cy === ey) return true;
    if (Math.abs(tmx - tmy) < 1e-9) {
      if (!walkable(grid, cx + sx, cy) || !walkable(grid, cx, cy + sy)) return false;
      tmx += tdx; tmy += tdy; cx += sx; cy += sy;
    } else if (tmx < tmy) { tmx += tdx; cx += sx; }
    else { tmy += tdy; cy += sy; }
  }
  return true;
}

// A* from pixel (sx,sy) to pixel (gx,gy). Returns pixel waypoints ending at the goal,
// smoothed so the actor walks straight wherever the line is clear. Diagonal moves may not
// cut a blocked corner. Returns null if the goal can't be reached.
export function findPath(grid, tile, sx, sy, gx, gy) {
  const cols = grid[0].length;
  const start = nearestWalkable(grid, Math.floor(sx / tile), Math.floor(sy / tile));
  const goal = nearestWalkable(grid, Math.floor(gx / tile), Math.floor(gy / tile));
  if (!start || !goal) return null;
  const key = (x, y) => y * cols + x;
  const h = (x, y) => Math.hypot(x - goal[0], y - goal[1]);
  const g = new Map([[key(...start), 0]]), from = new Map();
  const open = [[h(...start), start[0], start[1]]];
  const closed = new Set();
  let found = false;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [, x, y] = open.splice(bi, 1)[0];
    const k = key(x, y);
    if (closed.has(k)) continue;
    closed.add(k);
    if (x === goal[0] && y === goal[1]) { found = true; break; }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!walkable(grid, nx, ny)) continue;
      if (dx && dy && (!walkable(grid, x + dx, y) || !walkable(grid, x, y + dy))) continue;
      const nk = key(nx, ny), ng = g.get(k) + (dx && dy ? Math.SQRT2 : 1);
      if (ng < (g.get(nk) ?? Infinity)) { g.set(nk, ng); from.set(nk, k); open.push([ng + h(nx, ny), nx, ny]); }
    }
  }
  if (!found) return null;

  const cells = [];
  for (let k = key(...goal); k !== undefined; k = from.get(k)) cells.unshift([(k % cols + 0.5) * tile, (Math.floor(k / cols) + 0.5) * tile]);
  // Finish on the exact goal pixel when it can be reached in a clear line from its cell centre
  // (a goal on a cell corner may not be).
  const last = cells[cells.length - 1];
  if (clearLine(grid, tile, last[0], last[1], gx, gy)) cells.push([gx, gy]);

  // String-pull: from each kept point, jump to the farthest later point still in clear sight.
  const out = [];
  let cur = [sx, sy];
  let i = 0;
  while (i < cells.length) {
    let j = cells.length - 1;
    while (j > i && !clearLine(grid, tile, cur[0], cur[1], cells[j][0], cells[j][1])) j--;
    out.push(cells[j]);
    cur = cells[j];
    i = j + 1;
  }
  return out;
}
