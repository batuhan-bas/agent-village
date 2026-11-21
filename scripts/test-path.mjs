// Checks that, on every map with a collision grid, an actor can walk from every station to every
// other station and that every leg of the resulting path stays on walkable cells.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clearLine, findPath } from "../src/path.js";

const src = join(import.meta.dirname, "..", "src");
const maps = JSON.parse(readFileSync(join(src, "maps.json"), "utf8"));
const grids = JSON.parse(readFileSync(join(src, "collision.json"), "utf8"));

let failures = 0, legs = 0;
for (const m of maps) {
  const grid = grids[m.id];
  if (!grid) { console.log(`${m.id}: no collision grid, straight-line walking`); continue; }
  const tile = m.width / grid[0].length;
  const names = Object.keys(m.stations);
  for (const a of names) for (const b of names) {
    if (a === b) continue;
    const [sx, sy] = m.stations[a], [gx, gy] = m.stations[b];
    const path = findPath(grid, tile, sx, sy, gx, gy);
    if (!path) { console.error(`FAIL ${m.id}: no path ${a} -> ${b}`); failures++; continue; }
    let prev = [sx, sy];
    for (const p of path) {
      legs++;
      if (!clearLine(grid, tile, prev[0], prev[1], p[0], p[1])) { console.error(`FAIL ${m.id}: ${a} -> ${b} crosses a blocked cell near ${p}`); failures++; break; }
      prev = p;
    }
    const end = path[path.length - 1];
    if (Math.hypot(end[0] - gx, end[1] - gy) > tile) { console.error(`FAIL ${m.id}: ${a} -> ${b} ends at ${end}, not ${[gx, gy]}`); failures++; }
  }
  console.log(`${m.id}: ${names.length * (names.length - 1)} station pairs checked`);
}
console.log(failures ? `${failures} failure(s)` : `all paths ok (${legs} legs)`);
process.exit(failures ? 1 : 0);
