// Agent Village: a pixel village where each coding agent is a villager walking to work.
// Map engine ported from the "Dört Mevsim Vadisi" artifact; actors, map list and menu are new.
import { clearLine, findPath, nearestWalkable, walkable } from "./path.js";

const ALL_SEASONS = ["spring", "summer", "autumn", "winter"];
const SEASON_LABELS = { spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter" };
const SIZES = [{ label: "Small", scale: 0.5 }, { label: "Medium", scale: 0.75 }, { label: "Large", scale: 1 },
  { label: "XL", scale: 1.25 }, { label: "XXL", scale: 1.5 }];
const DAY_SECONDS = 120, DAYS_PER_SEASON = 2;
// Right-click "Time of day": cycle, or hold one of these hours.
const TIMES = [["auto", "Cycle automatically"], [7, "Morning"], [12, "Noon"], [19, "Evening"], [0, "Night"]];
const cv = document.getElementById("view"), ctx = cv.getContext("2d");
const rnd = (a, b) => a + Math.random() * (b - a);
// The canvas has RES device pixels per map pixel, so the map and its 16px sprites are drawn at
// exactly 2x: every pixel the same size.
const RES = 2;
const snap = (v) => Math.round(v * RES) / RES;
// The pack's pixel font, for every bubble, card and counter.
const FONT = '"NinjaAdventure", monospace';
new FontFace("NinjaAdventure", "url(art/ui/font.ttf)").load().then((f) => document.fonts.add(f)).catch(() => {});
// Its own space is under a pixel wide, so text is drawn and measured with en spaces instead.
const spaced = (t) => String(t).replace(/ /g, "\u2002");
const fillText0 = ctx.fillText.bind(ctx), measureText0 = ctx.measureText.bind(ctx);
ctx.fillText = (t, ...rest) => fillText0(spaced(t), ...rest);
ctx.measureText = (t) => measureText0(spaced(t));
const TAURI = window.__TAURI__;

let maps = [], grids = {}, map = null, W = 640, H = 576;
let grid = null, tile = 16; // collision grid of the current map (null: walk in straight lines)
let baseGrid = null, baseWater = null, iceBy = {}, glowPts = {}, gridSeason = null;
let waters = {}, water = null, swimGrid = null; // water tiles (water.json) and land+water for swimmers
let imgs = {}, spark = {}, fall = {}, glow = {}, swayL = {}, effects = {};
let time = 9, seasonPos = 1, anim = 0, last = 0;

// ---------- settings (per-device, so localStorage is enough) ----------
const settings = { mapId: "village", season: "auto", hour: "auto", onTop: true, scale: 0.5, music: false, sounds: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem("agent-village") || "{}")); } catch {}
function saveSettings() { try { localStorage.setItem("agent-village", JSON.stringify(settings)); } catch {} }

function load(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

// ---------- ambient effects (from the artifact) ----------
const sparkles = [], snow = [], leaves = [], petals = [], flies = [], bflies = [];
const LEAFC = ["#e88838", "#cc5038", "#f4c450", "#b06030"];
function seed() {
  for (let i = 0; i < 110; i++) sparkles.push({ x: 0, y: 0, t: rnd(0, 1), d: rnd(.5, 1.4), s: null });
  for (let i = 0; i < 170; i++) snow.push({ x: rnd(0, W), y: rnd(0, H), vy: rnd(14, 34), sw: rnd(4, 12), ph: rnd(0, 6.3), sz: Math.random() < .3 ? 2 : 1 });
  for (let i = 0; i < 48; i++) leaves.push({ x: rnd(0, W), y: rnd(0, H), vx: rnd(8, 22), vy: rnd(10, 22), ph: rnd(0, 6.3), c: LEAFC[i % 4] });
  for (let i = 0; i < 34; i++) petals.push({ x: rnd(0, W), y: rnd(0, H), vx: rnd(5, 14), vy: rnd(7, 15), ph: rnd(0, 6.3) });
  for (let i = 0; i < 46; i++) flies.push({ x: rnd(10, W - 10), y: rnd(H * .37, H - 10), ph: rnd(0, 6.3), sp: rnd(.4, 1.1), r: rnd(6, 18) });
  for (let i = 0; i < 7; i++) bflies.push({ x: rnd(40, W - 40), y: rnd(H * .4, H - 30), ph: rnd(0, 6.3), sp: rnd(.3, .7), c: i % 2 ? "#ffffff" : "#ffe066" });
}

const KEYS = [[0, 58, 74, 152], [4.5, 58, 74, 152], [6, 214, 150, 162], [7.5, 255, 226, 200], [9, 255, 255, 255], [16.5, 255, 255, 255],
  [18, 255, 198, 142], [19.5, 198, 122, 152], [21, 86, 92, 172], [22.5, 58, 74, 152], [24, 58, 74, 152]];
function tint(t) {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i], b = KEYS[i + 1];
    if (t >= a[0] && t <= b[0]) { const f = (t - a[0]) / (b[0] - a[0] || 1); return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f]; }
  }
  return [255, 255, 255];
}
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function rgba(c, a) { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a.toFixed(2)})`; }
function px(x, y, w, h) { ctx.fillRect(Math.round(x), Math.round(y), w, h); }

// ---------- maps ----------
// A map lists its season images in maps.json; each <season>.png may have a <season>-mask.png
// (red channel = water glints, green = flowing water, blue = glow that pulses, e.g. lava or
// glowing mushrooms). effects.json may give each map its glint/flow/glow colours and an ambient
// particle kind (foam, dust, embers, spores, steam), optionally a different one for winter.
// A <season>-ice.png marks frozen water in white: on those tiles everyone walks and nobody swims.
// A map with one entry simply never changes.
async function loadMap(id) {
  const m = maps.find((x) => x.id === id) || maps[0];
  const nextImgs = {}, nextSpark = {}, nextFall = {}, nextGlow = {}, nextSway = {}, nextIce = {}, nextGlowPts = {};
  const glowRGB = hex(effects[m.id]?.glow || "#ffb050");
  for (const s of m.seasons) {
    nextImgs[s] = await load(`maps/${m.id}/${s}.png`);
    nextSway[s] = windLayers(nextImgs[s], m);
    const pts = [], f = [], gp = [];
    let gl = null;
    try {
      const mask = await load(`maps/${m.id}/${s}-mask.png`);
      const oc = document.createElement("canvas"); oc.width = m.width; oc.height = m.height;
      const o = oc.getContext("2d"); o.drawImage(mask, 0, 0);
      const d = o.getImageData(0, 0, m.width, m.height).data;
      for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
        const k = (y * m.width + x) * 4;
        if (d[k] > 128 && x < m.width - 3) pts.push(x, y);
        if (d[k + 1] > 128) f.push(x, y);
      }
      // Glow layer: the blue channel as an alpha mask in the glow colour, drawn additively.
      const img = o.createImageData(m.width, m.height);
      let any = false;
      for (let k = 0; k < d.length; k += 4) {
        if (d[k + 2] <= 128) continue;
        any = true;
        if (Math.random() < .05) gp.push((k / 4) % m.width, Math.floor(k / 4 / m.width)); // a sample, for steam
        img.data[k] = glowRGB[0]; img.data[k + 1] = glowRGB[1]; img.data[k + 2] = glowRGB[2]; img.data[k + 3] = d[k + 2];
      }
      if (any) { gl = document.createElement("canvas"); gl.width = m.width; gl.height = m.height; gl.getContext("2d").putImageData(img, 0, 0); }
    } catch { /* no mask: no glints for this season */ }
    nextSpark[s] = pts; nextFall[s] = f; nextGlow[s] = gl; nextGlowPts[s] = gp;
    nextIce[s] = s === "winter" ? await iceGrid(`maps/${m.id}/${s}-ice.png`, m) : null; // only winter freezes
  }
  map = m; W = m.width; H = m.height; imgs = nextImgs; spark = nextSpark; fall = nextFall; glow = nextGlow; swayL = nextSway;
  iceBy = nextIce; glowPts = nextGlowPts;
  motes.length = 0;
  baseGrid = grids[m.id] || null; tile = baseGrid ? W / baseGrid[0].length : 16;
  baseWater = waters[m.id] || null;
  applySeasonGrids(currentSeason());
  playMusic();
  setLoop(loops.bed, (effects[m.id] || {}).sound);
  cv.width = W * RES; cv.height = H * RES; ctx.imageSmoothingEnabled = false;
  settings.mapId = m.id; saveSettings();
  // New map: agents start at home; residents and legends are replaced by ones that live here.
  for (const a of [...actors]) { if (a.kind === "agent") placeAtHome(a); else actors.delete(a); }
  for (const e of [...enemies]) enemySpot(e, true);
  if (ready) populate(true);
}

// ---------- wind ----------
// Gusts are wide bands that sweep diagonally across the map; trees and grass both answer to them,
// so a gust can be seen travelling.
//   Trees: every canopy (a leafy region closed off by the art's dark outline, so not the open
//   grass around it) is found once per season image. Each row of a canopy is shifted sideways by
//   a whole number of pixels that grows towards the treetop, so a tree leans and sways as one
//   piece instead of jittering; the pixel a row uncovers takes the colour just outside it.
//   Grass: a soft bright sheen rides on the open meadow inside each gust.
const GUST_SPEED = 55, GUST_GAP = 520, GUST_W = 110;
function gustAt(x, y, t) {
  const u = x + y * .35, span = W + H * .35 + GUST_GAP;
  let g = 0;
  for (let k = 0; k < 2; k++) {
    const c = ((t * GUST_SPEED + k * span / 2) % span) - GUST_GAP / 2;
    g = Math.max(g, Math.exp(-(((u - c) / GUST_W) ** 2)));
  }
  return g;
}
function windLayers(img, m) {
  const w = m.width, h = m.height, n = w * h;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const o = c.getContext("2d"); o.drawImage(img, 0, 0);
  const src = o.getImageData(0, 0, w, h), d = src.data;
  const leafy = !m.types?.includes("rock"); // orange autumn leaves count, except on rocky maps
  const dark = new Uint8Array(n), leaf = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    dark[i] = r * .3 + g * .59 + b * .11 < 92 ? 1 : 0;
    leaf[i] = (g > r + 6 && g >= b - 24 && g > 60) || (leafy && r > 150 && r > g + 30 && b < 110) ? 1 : 0;
  }
  // "outside": everything reachable from open ground (walkable tiles, map border) without
  // crossing an outline. Leafy pixels that are not outside are canopy.
  const gr = grids[m.id], T = gr ? w / gr[0].length : 16;
  const open = (x, y) => !gr || gr[Math.floor(y / T)][Math.floor(x / T)] === 1;
  const out = new Uint8Array(n), q = new Int32Array(n);
  let qt = 0;
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0;
    if (!dark[i] && (open(x, y) || x === 0 || y === 0 || x === w - 1 || y === h - 1)) { out[i] = 1; q[qt++] = i; }
  }
  for (let qh = 0; qh < qt; qh++) {
    const i = q[qh], x = i % w;
    for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
      if (j >= 0 && j < n && !out[j] && !dark[j]) { out[j] = 1; q[qt++] = j; }
    }
  }
  // label canopies (4-connected), drop specks, then give each its adjacent outline pixels
  const lab = new Int32Array(n), sizes = [0];
  for (let i = 0; i < n; i++) {
    if (lab[i] || out[i] || dark[i] || !leaf[i]) continue;
    const id = sizes.length; let size = 0; qt = 0; q[qt++] = i; lab[i] = id;
    for (let qh = 0; qh < qt; qh++) {
      const k = q[qh], x = k % w; size++;
      for (const j of [k - w, k + w, x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1]) {
        if (j >= 0 && j < n && !lab[j] && !out[j] && !dark[j] && leaf[j]) { lab[j] = id; q[qt++] = j; }
      }
    }
    sizes.push(size);
  }
  const own = Int32Array.from(lab, (v) => (sizes[v] >= 40 ? v : 0));
  for (let i = 0; i < n; i++) {
    if (!dark[i] || own[i]) continue;
    const x = i % w;
    for (const j of [i - w, i + w, i - 1, i + 1, i - w - 1, i - w + 1, i + w - 1, i + w + 1]) {
      if (j < 0 || j >= n || Math.abs((j % w) - x) > 1) continue;
      if (lab[j] && sizes[lab[j]] >= 40) { own[i] = lab[j]; break; }
    }
  }
  // per canopy: bounding rows and the row segments to shift
  const trees = new Map();
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const id = own[y * w + x];
      if (!id) { x++; continue; }
      let x1 = x;
      while (x1 + 1 < w && own[y * w + x1 + 1] === id) x1++;
      let t = trees.get(id);
      if (!t) trees.set(id, t = { top: y, bot: y, sx: 0, cnt: 0, rows: [], ph: rnd(0, 6.3) });
      t.bot = y; t.sx += (x + x1) / 2; t.cnt++; t.rows.push(y, x, x1);
      x = x1 + 1;
    }
  }
  const list = [...trees.values()].filter((t) => t.bot - t.top >= 6).map((t) => ({ ...t, cx: t.sx / t.cnt }));
  // open meadow: leafy pixels on walkable ground
  const grass = document.createElement("canvas"); grass.width = w; grass.height = h;
  const gimg = new ImageData(w, h);
  for (let i = 0; i < n; i++) {
    if (!out[i] || !leaf[i] || !open(i % w, (i / w) | 0)) continue;
    gimg.data.set(d.subarray(i * 4, i * 4 + 4), i * 4);
  }
  grass.getContext("2d").putImageData(gimg, 0, 0);
  const dst = new ImageData(w, h);
  dst.data.set(d);
  return { c, o, trees: list, grass, src32: new Uint32Array(d.buffer), dst, dst32: new Uint32Array(dst.data.buffer), at: -1 };
}
// Draws a season image with its trees bent by the wind (recomputed ~24 times a second).
function drawWindMap(L, img) {
  if (!L || !L.trees.length) { ctx.drawImage(img, 0, 0); return; }
  if (Math.abs(anim - L.at) > 1 / 24) { L.at = anim; bendTrees(L); }
  ctx.drawImage(L.c, 0, 0);
}
function bendTrees(L) {
  const src = L.src32, dst = L.dst32;
  dst.set(src);
  for (const t of L.trees) {
    const g = gustAt(t.cx, t.bot, anim);
    // a little lean downwind, more in a gust, plus a slow sway of its own
    const lean = .25 + 1.15 * g + Math.sin(anim * 1.9 + t.ph) * (.35 + .45 * g);
    const h = t.bot - t.top + 1, r = t.rows;
    for (let k = 0; k < r.length; k += 3) {
      const y = r[k], s = Math.round(lean * Math.pow((t.bot - y) / h, 1.3));
      if (!s) continue;
      const row = y * W, x0 = r[k + 1], x1 = r[k + 2];
      if (s > 0) {
        for (let x = x1; x >= x0; x--) if (x + s < W) dst[row + x + s] = src[row + x];
        const fill = src[row + Math.max(0, x0 - 1)];
        for (let x = x0; x < x0 + s && x <= x1; x++) dst[row + x] = fill;
      } else {
        for (let x = x0; x <= x1; x++) if (x + s >= 0) dst[row + x + s] = src[row + x];
        const fill = src[row + Math.min(W - 1, x1 + 1)];
        for (let x = x1; x > x1 + s && x >= x0; x--) dst[row + x] = fill;
      }
    }
  }
  L.o.putImageData(L.dst, 0, 0);
}
const sheen = document.createElement("canvas"), bands = document.createElement("canvas");
function grassWind(L) {
  if (!L) return;
  for (const c of [sheen, bands]) if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const m = bands.getContext("2d");
  m.clearRect(0, 0, W, H);
  const span = W + H * .35 + GUST_GAP, dl = 1 + .35 * .35; // u = x + .35y; points at u along (1, .35)
  for (let k = 0; k < 2; k++) {
    const c = ((anim * GUST_SPEED + k * span / 2) % span) - GUST_GAP / 2, a = GUST_W * 1.4;
    const gr = m.createLinearGradient((c - a) / dl, (c - a) * .35 / dl, (c + a) / dl, (c + a) * .35 / dl);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(.5, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    m.fillStyle = gr; m.fillRect(0, 0, W, H);
  }
  const s = sheen.getContext("2d");
  s.globalCompositeOperation = "source-over"; s.clearRect(0, 0, W, H); s.drawImage(L.grass, 0, 0);
  s.globalCompositeOperation = "destination-in"; s.drawImage(bands, 0, 0);
  ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = .16;
  ctx.drawImage(sheen, 0, 0);
  ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
}

// A season's ice image as tiles: a tile is ice when most of its pixels are white. null if none.
async function iceGrid(src, m) {
  let img;
  try { img = await load(src); } catch { return null; }
  const g = grids[m.id], T = g ? m.width / g[0].length : 16, cols = Math.round(m.width / T), rows = Math.round(m.height / T);
  const c = document.createElement("canvas"); c.width = m.width; c.height = m.height;
  const o = c.getContext("2d"); o.drawImage(img, 0, 0);
  const d = o.getImageData(0, 0, m.width, m.height).data, out = [];
  let any = false;
  for (let ty = 0; ty < rows; ty++) {
    const row = [];
    for (let tx = 0; tx < cols; tx++) {
      let n = 0;
      for (let y = ty * T; y < (ty + 1) * T; y++) for (let x = tx * T; x < (tx + 1) * T; x++) if (d[(y * m.width + x) * 4] > 128) n++;
      row.push(n > T * T / 2 ? 1 : 0); any ||= n > T * T / 2;
    }
    out.push(row);
  }
  return any ? out : null;
}
function currentSeason() {
  const n = map.seasons.length;
  if (settings.season !== "auto" && map.seasons.includes(settings.season)) return settings.season;
  return map.seasons[Math.floor(seasonPos * n / 4) % n];
}
// Rebuilds the grids for a season: ice tiles become ground for everyone and stop being water.
// Fish caught under new ice slip away until the thaw; anyone left standing where they no
// longer can (ice melted under them) walks to the nearest spot they can stand on.
function applySeasonGrids(s) {
  gridSeason = s;
  const ice = iceBy[s];
  grid = baseGrid && ice ? baseGrid.map((r, y) => r.map((v, x) => (v || ice[y]?.[x] ? 1 : 0))) : baseGrid;
  water = baseWater && ice ? baseWater.map((r, y) => r.map((v, x) => (v && !ice[y]?.[x] ? 1 : 0))) : baseWater;
  if (water && water.flat().filter(Boolean).length < 4) water = null; // no open water left
  swimGrid = grid && water ? grid.map((row, y) => row.map((v, x) => (v || water[y][x] ? 1 : 0))) : grid;
  for (const a of actors) {
    if (a.fly || a.leaving || a.held) continue;
    if (a.fish && !inWater(a.x, a.y)) { if (a.kind !== "agent") a.leaving = true; continue; }
    const g = gridFor(a);
    if (g && !canStand(a, a.x, a.y)) {
      const c = nearestWalkable(g, Math.floor(a.x / tile), Math.floor(a.y / tile));
      if (c) walkTo(a, (c[0] + .5) * tile, (c[1] + .5) * tile);
    }
  }
}

// The season index (0..3) that decides weather effects: a one-image map counts as summer.
function seasonIndex(name) { const i = ALL_SEASONS.indexOf(name); return i < 0 ? 1 : i; }

// ---------- actors ----------
const TOOL_STATION = {
  Read: "read", NotebookRead: "read",
  Bash: "bash", BashOutput: "bash",
  Edit: "edit", Write: "edit", MultiEdit: "edit", NotebookEdit: "edit", apply_patch: "edit", // apply_patch: Codex
  web_search: "web",
  Grep: "search", Glob: "search", LS: "search",
  WebFetch: "web", WebSearch: "web",
  Task: "agent", Agent: "agent",
};
// ---------- art ----------
// Ninja Adventure actors (pixel-boy, CC0), listed in creatures.json: art/actors/<id>.png is the
// walk sheet and <id>-face.png the portrait. Characters and monsters face four ways (one column
// per facing: down, up, left, right; one row per walk frame). Animals are side-on strips facing
// right, mirrored to face left.
const sheets = new Map(), faces = new Map(); // id -> image, null while loading, false if missing
function art(cache, src, id) {
  if (!cache.has(id)) { cache.set(id, null); load(src).then((img) => cache.set(id, img)).catch(() => cache.set(id, false)); }
  return cache.get(id) || null;
}
function sheet(id) { return art(sheets, `art/actors/${id}.png`, id); }
function portrait(id) { return art(faces, `art/actors/${id}-face.png`, id); }
// Facing for a heading (y grows downward): 0 down, 1 up, 2 left, 3 right.
function dirFrom(dx, dy) { return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : dy < 0 ? 1 : 0; }

// ---------- population ----------
// Every creature on the map is an actor of one kind:
//   resident  a monster or animal living in the village; RESIDENTS of them are kept around
//   agent     a villager (a character) who walks in through the gate for a coding agent, works at
//             the station for each tool it uses and leaves when the agent is done
//   legend    the map's guardian (maps.json "guardian"): stands in one spot and never changes
// No two actors on the map are the same creature.
const RESIDENTS = 4, IDLE_NINJAS = 3; // animals living on the map, and ninjas waiting for work
let creatures = []; // { dex (= id), name, kind, frames, w?, h?, fly?, swim?, fish? } from creatures.json
let ready = false, pending = []; // hook events that arrive before the map and creatures load wait here
const actors = new Set();
const agentActors = new Map(); // agent key (agent_id or session_id) -> actor

function inUse(dex) { for (const a of actors) if (a.dex === dex) return true; return false; }
// A random creature not on the map yet: a ninja (agents, and the ninjas waiting for work) or an
// animal (the locals; fish only where there is open water). Monsters only turn up as enemies.
function pickCreature(type) {
  const pool = creatures.filter((p) => (type === "ninja" ? p.ninja : p.kind === "animal") && !inUse(p.dex) && (!!water || !p.fish));
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
// The map's guardian (maps.json "guardian", a boss name): it stands in one spot playing its idle loop.
function chooseLegends() { const g = creatures.find((p) => p.kind === "boss" && p.key === map.guardian); return g ? [g] : []; }

function onGround(x, y) { return !grid || walkable(grid, Math.floor(x / tile), Math.floor(y / tile)); }
// Swimmers move on land and water alike (swimGrid) and prefer the water.
function inWater(x, y) { return !!water && walkable(water, Math.floor(x / tile), Math.floor(y / tile)); }
// Fish never leave the water.
function gridFor(a) { return a.fish && water ? water : a.swim ? swimGrid : grid; }
function canStand(a, x, y) { const g = gridFor(a); return !g || walkable(g, Math.floor(x / tile), Math.floor(y / tile)); }
// A random water point, preferably within `near` px of (x, y); null if the map has no water.
function randomWater(x, y, near = Infinity) {
  if (!water) return null;
  for (let i = 0; i < 80; i++) {
    const tx = Math.floor(rnd(0, water[0].length)), ty = Math.floor(rnd(0, water.length));
    const px2 = (tx + rnd(.25, .75)) * tile, py2 = (ty + rnd(.25, .75)) * tile;
    if (water[ty][tx] && Math.hypot(px2 - x, py2 - y) <= near) return [px2, py2];
  }
  return near === Infinity ? null : randomWater(x, y);
}
// A point near a station; the random offset keeps actors from stacking, but never lands on water or rock.
// With an actor, the point is also one it can stand on and nobody else is using.
function stationPoint(station, a) {
  const [x, y] = (map && map.stations[station]) || (map && map.stations.home) || [W / 2, H / 2];
  for (let i = 0; i < 30; i++) {
    const s = 14 + i * 2, jx = x + rnd(-s, s), jy = y + rnd(-s * .5, s * .5);
    if (a ? canStand(a, jx, jy) && isFree(jx, jy, radius(a), a) : onGround(jx, jy)) return [jx, jy];
  }
  return [x, y];
}
// Open ground, away from everyone (r: the newcomer's radius).
function randomGround(r = 14) {
  for (let i = 0; i < 80; i++) { const x = rnd(16, W - 16), y = rnd(16, H - 16); if (onGround(x, y) && isFree(x, y, r, null)) return [x, y]; }
  return stationPoint("home");
}
function placeAtHome(a) { [a.x, a.y] = stationPoint("home", a); a.path = []; a.v = 0; }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// The nearest point just outside the map: where flyers come from and fly off to.
function edgePoint(x, y) {
  const options = [[x, -40], [x, H + 40], [-40, y], [W + 40, y]];
  return options.sort((p, q) => Math.hypot(p[0] - x, p[1] - y) - Math.hypot(q[0] - x, q[1] - y))[0];
}
// Sets a path to (x, y); false when the grid has no route there (the actor then stays put).
// Flyers go in a straight line over anything.
function walkTo(a, x, y) {
  const g = gridFor(a);
  if (a.fly || !g) { a.path = [[x, y]]; return true; }
  const p = findPath(g, tile, a.x, a.y, x, y);
  if (!p) return false;
  a.path = p;
  return true;
}
function goTo(a, station) { return walkTo(a, ...stationPoint(station, a)); }
// A short stroll to somewhere nearby; flyers glide about and now and then fly off the map.
function wander(a) {
  if (a.fly) {
    if (a.kind === "resident" && Math.random() < 0.12) return leave(a);
    a.path = [[clamp(a.x + rnd(-160, 160), 24, W - 24), clamp(a.y + rnd(-110, 110), 48, H - 16)]];
    return;
  }
  if (a.swim && water && (a.fish || Math.random() < 0.8)) { // swimmers mostly head for (or stay in) the water
    for (let k = 0; k < 6; k++) {
      const spot = randomWater(a.x, a.y, 160);
      if (spot && isFree(...spot, radius(a), a) && walkTo(a, ...spot)) return;
    }
  }
  for (let i = 0; i < 30; i++) {
    const x = a.x + rnd(-130, 130), y = a.y + rnd(-90, 90);
    if (x > 8 && x < W - 8 && y > 8 && y < H - 8 && canStand(a, x, y) && isFree(x, y, radius(a), a) && walkTo(a, x, y)) return;
  }
  if (!walkTo(a, ...randomGround())) goTo(a, "home");
}
function say(a, text) { a.bubble = text; a.bubbleT = 3; if (text && text.length > 1) voice(a); }

function addActor(kind, p, x, y) {
  const fly = !!p.fly;
  const a = { id: nextId++, kind, dex: p.dex, name: p.name, x, y, path: [], anchor: [x, y], flip: Math.random() < .5, flipT: 0,
              ph: rnd(0, 6.3), v: 0, sp: rnd(.85, 1.15), fly, alt: fly ? rnd(16, 26) : 0, perched: false,
              swim: !fly && !!(p.swim || p.fish), fish: !fly && !!p.fish,
              frames: p.frames || 4, side: p.kind === "animal", boss: p.kind === "boss", fw: p.w || 16, fh: p.h || 16,
              poses: p.poses, hit: p.hit, ninja: !!p.ninja,
              dir: Math.floor(rnd(0, 4)), dirT: 0, tick: rnd(0, 600), drawH: 16,
              bubble: "", bubbleT: 0, alpha: 0, leaving: false, exiting: false, idleT: rnd(1, 4) };
  actors.add(a);
  sheet(a.dex); portrait(a.dex); // start loading early
  return a;
}
// A newcomer walks in from the map's entrance (the web station), or flies in from the nearest
// edge, and says its name.
// A walker only comes in when the entrance is clear (residents wait for the next try; an agent
// that's needed now may start a little further in).
function entrance(far) {
  const [x, y] = map.stations.web;
  for (let i = 0; i < 40; i++) {
    const s = 6 + i * (far ? 2 : .6), jx = x + rnd(-s, s), jy = y + rnd(-s * .6, s * .6);
    if (onGround(jx, jy) && isFree(jx, jy, 16, null)) return [jx, jy];
  }
  return null;
}
function freeWater() {
  for (let i = 0; i < 20; i++) { const w = randomWater(rnd(0, W), rnd(0, H)); if (w && isFree(...w, 16, null)) return w; }
  return null;
}
function arrive(kind, type = kind === "agent" ? "ninja" : "animal") {
  const p = pickCreature(type);
  if (!p) return null;
  const at = !!p.fly ? edgePoint(rnd(40, W - 40), rnd(40, H - 40))
    : p.fish ? freeWater() // fish surface somewhere in the water instead of walking in
    : entrance(kind === "agent") || (kind === "agent" && randomGround());
  if (!at) return null;
  const a = addActor(kind, p, ...at);
  say(a, p.name);
  if (!a.fly && !a.fish) playFx("smoke", at[0], at[1] + 6); // appears in a puff at the gate
  if (kind === "agent") sfx("arrive");
  if (kind === "resident") {
    if (a.fly) a.path = [[rnd(60, W - 60), rnd(60, H - 60)]];
    else wander(a);
  }
  return a;
}
// Walks out through the entrance (flyers fly off the nearest edge), then fades away.
function leave(a, text) {
  if (a.exiting || a.leaving) return;
  a.exiting = true;
  if (text) say(a, text);
  if (a.fly) a.path = [edgePoint(a.x, a.y)];
  else if (!goTo(a, "web")) a.leaving = true;
}
function residentCount(ninja) { let n = 0; for (const a of actors) if (a.kind === "resident" && !!a.ninja === ninja && !a.exiting && !a.leaving) n++; return n; }
// Keeps RESIDENTS animals and IDLE_NINJAS ninjas around; on a fresh map they start in place
// instead of walking in.
function topUp(inPlace) {
  for (const [type, want] of [["animal", RESIDENTS], ["ninja", IDLE_NINJAS]]) for (let n = residentCount(type === "ninja"); n < want; n++) {
    if (!inPlace) { if (!arrive("resident", type)) break; continue; }
    const p = pickCreature(type);
    if (!p) break;
    const a = addActor("resident", p, ...randomGround());
    let wet = false;
    for (let k = 0; a.swim && k < 8; k++) { // swimmers start out in the water
      const spot = randomWater(a.x, a.y);
      if (spot && isFree(...spot, 14, a)) { [a.x, a.y] = spot; wet = true; break; }
    }
    if (a.fish && !wet) actors.delete(a); // no room in the water: a fish can't start on land
  }
}
// The most open walkable spot (most room around it, away from the stations, near the middle):
// where a guardian stands on a map that doesn't name one.
function openSpot() {
  if (!grid) return [W / 2, H / 2];
  const rows = grid.length, cols = grid[0].length, stations = Object.values(map.stations);
  let best = null, score = -Infinity;
  for (let y = 2; y < rows - 2; y++) for (let x = 2; x < cols - 2; x++) {
    let room = 0;
    while (room < 4 && [...Array(2 * room + 3)].every((_, i) => [...Array(2 * room + 3)].every((_, j) => walkable(grid, x - room - 1 + i, y - room - 1 + j)))) room++;
    const px = (x + .5) * tile, py = (y + 1) * tile;
    if (stations.some(([sx, sy]) => Math.hypot(sx - px, sy - py) < 3 * tile)) continue;
    const s = room * 10 - Math.hypot(px - W / 2, py - H / 2) / tile;
    if (s > score) { score = s; best = [px, py]; }
  }
  return best || randomGround(28);
}
// Brings the residents and legends in line with the current map; agents are untouched.
function populate(inPlace) {
  const legends = chooseLegends();
  for (const a of actors) if (a.kind === "legend" && !legends.some((q) => q.dex === a.dex)) a.leaving = true;
  legends.forEach((p, i) => {
    if (inUse(p.dex)) return;
    // guardians stand on the map's guardian spot (or somewhere open) and never move
    const a = addActor("legend", p, ...(map.perches?.[i] || openSpot()));
    a.perched = true; a.fly = false; a.alt = 0; a.dir = 0;
  });
  topUp(inPlace);
}
// An agent's ninja: the waiting ninja nearest home takes the job (another walks in to wait),
// or a new one walks in through the gate.
function agentFor(key) {
  let a = agentActors.get(key);
  if (a) return a;
  const [hx, hy] = map.stations.home;
  const free = [...actors].filter((r) => r.kind === "resident" && r.ninja && !r.exiting && !r.leaving && !r.held)
    .sort((p, q) => Math.hypot(p.x - hx, p.y - hy) - Math.hypot(q.x - hx, q.y - hy));
  a = free[0] || arrive("agent");
  if (!a) return null;
  a.kind = "agent"; a.tools = 0; a.tool = ""; a.since = performance.now(); a.stage = 0; a.role = "";
  agentActors.set(key, a);
  topUp(false);
  return a;
}

// Claude Code hook payloads: { hook_event_name, session_id, agent_id?, agent_type?, tool_name? }
function onEvent(e) {
  if (!ready) { pending.push(e); return; }
  const name = e.hook_event_name;
  const key = e.agent_id || e.session_id || "main";
  if (name === "SubagentStop" || name === "SessionEnd") {
    const a = agentActors.get(key);
    if (a) {
      agentActors.delete(key); sfx("done"); emote(a, "done", 2); dropChest();
      a.kind = "resident"; a.busy = false; a.workT = 0; a.idleT = rnd(1, 3); // back to waiting for work
      if (residentCount(true) > IDLE_NINJAS + 1) leave(a, "done"); // too many waiting: this one heads home
      settings.done = (settings.done || 0) + 1; saveSettings();
      if (!a.fly && !inWater(a.x, a.y)) plantFlower(a.x, a.y); // a finished agent leaves a flower behind
    }
    return;
  }
  const a = agentFor(key);
  if (!a) return;
  if (!a.role) a.role = e.agent_type || (e.agent_id ? "subagent" : "main");
  if (!a.client) a.client = e.turn_id !== undefined ? "Codex" : "Claude"; // turn_id only comes from Codex
  a.lastEvent = performance.now();
  if (a.emote === EMOTE.wait || a.emote === EMOTE.sleep) a.emoteT = 0; // back at work
  if (name === "PreToolUse") {
    goTo(a, TOOL_STATION[e.tool_name] || "agent");
    a.tools++; a.tool = e.tool_name || "?";
    a.workKind = TOOL_STATION[e.tool_name] || (e.tool_name?.startsWith("mcp__") ? "other" : "agent");
    a.workT = 7; a.busy = true; // the tool's icon over the head, then typing dots until the next one
    spawnEnemy(a); // and something to fight while it works
    maybeEvolve(a);
  } else if (name === "PostToolUseFailure") {
    storm(a.x, a.y);
    a.faintT = 2.2; emote(a, "dizzy", 2.6); // the enemy lands a blow: knocked flat, then back up
    if (a.enemy) playFx("claw", a.x, a.y + 8);
    for (const g of actors) if (g.kind === "legend" && g.hit) g.hitT = g.hit.frames / 8; // the guardian flinches
  } else if (name === "SubagentStart") {
    say(a, e.agent_type || "agent");
    const parent = e.agent_id && agentActors.get(e.session_id);
    throwShuriken(parent && parent !== a ? [parent.x, parent.y - 10] : map.stations.agent, a);
  } else if (name === "Stop") {
    goTo(a, "home");
    a.busy = false; a.workT = 0;
    if (!e.agent_id) { sunT = 2.5; sfx("sun", .35); emote(a, "wait", Infinity); } // the main session's turn is over: the sun comes out and it waits for you
  }
}

function updateActors(dt) {
  for (const a of actors) {
    a.alpha = a.leaving ? a.alpha - dt * 0.8 : Math.min(1, a.alpha + dt * 2);
    if (a.leaving && a.alpha <= 0) { actors.delete(a); continue; }
    if (a.hop > 0) a.hop -= dt;
    if (a.evoT > 0) a.evoT -= dt;
    if (a.workT > 0) a.workT -= dt;
    if (a.jumpT > 0) a.jumpT -= dt;
    if (a.hitT > 0) a.hitT -= dt;
    if (a.attackT > 0) a.attackT -= dt;
    if (a.kind === "agent" && !(a.emoteT > 0) && performance.now() - (a.lastEvent || performance.now()) > 60000) emote(a, "sleep", Infinity); // dozing off
    if (a.held) { if (a.bubbleT > 0) a.bubbleT -= dt; continue; } // in the user's hand
    if (a.faintT > 0) { a.faintT -= dt; a.v = 0; if (a.faintT <= 0) a.hop = .6; if (a.bubbleT > 0) a.bubbleT -= dt; continue; } // lying flat
    if (a.exiting && !a.leaving && !a.path.length) { a.leaving = true; if (!a.fly) playFx("smoke", a.x, a.y + 6); } // reached the entrance: a puff, then gone
    yieldTick(a, dt);
    avoid(a, dt);
    move(a, dt);
    if (!a.path.length && !a.exiting && !a.perched && !(a.yieldT > 0) && (a.idleT -= dt) <= 0) {
      if (a.kind === "resident") { wander(a); a.idleT = rnd(3, 8); }
      else if (a.fly) { a.path = [[clamp(a.x + rnd(-30, 30), 24, W - 24), clamp(a.y + rnd(-16, 16), 48, H - 16)]]; a.idleT = rnd(3, 6); }
      else {
        // agents shuffle where they stand; legends drift around their own spot
        const [cx, cy] = a.kind === "legend" ? a.anchor : [a.x, a.y], r = a.kind === "legend" ? 24 : 10;
        const wx = cx + rnd(-r, r), wy = cy + rnd(-r / 2.5, r / 2.5);
        const g = gridFor(a);
        if (canStand(a, wx, wy) && isFree(wx, wy, radius(a), a) && (!g || clearLine(g, tile, a.x, a.y, wx, wy))) a.path = [[wx, wy]];
        a.idleT = rnd(3, 7);
      }
      if (!a.path.length && Math.random() < .3) { a.flip = !a.flip; a.dir = Math.floor(rnd(0, 4)); } // stayed put: look around
    }
    if (a.bubbleT > 0) a.bubbleT -= dt;
  }
  feed();
  updateEnemies(dt);
  if (ready && (refill -= dt) <= 0) { refill = 1.5; topUp(false); } // newcomers held at a busy entrance try again
  separate(dt);
}

// Keeps creatures from standing or hovering on top of each other: pairs that are too close are
// nudged apart. Flyers keep a wide berth from other flyers and from perched legends; walkers only
// move onto open ground; perched guardians and creatures on their way out stay put.
function separate(dt) {
  const list = [...actors].filter((a) => !a.leaving && !a.held);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const air = a.fly || b.fly, both = a.fly && b.fly;
    if (air && !both && !a.perched && !b.perched) continue; // a flyer passing over a walker is fine
    const need = air ? Math.max(48, (a.drawH + b.drawH) * 0.55) : radius(a) + radius(b) + 2;
    let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d >= need) continue;
    if (d < 0.01) { dx = rnd(-1, 1); dy = rnd(-1, 1); d = Math.hypot(dx, dy); }
    if (air) {
      const push = Math.min(need - d, 60 * dt) / d;
      nudge(a, -dx * push, -dy * push);
      nudge(b, dx * push, dy * push);
      continue;
    }
    // last line of defence on the ground: the one with less right of way gives most of the room
    let wa = rank(a) > rank(b) ? .25 : rank(a) < rank(b) ? .75 : .5;
    if (a.perched || a.exiting) wa = 0; else if (b.perched || b.exiting) wa = 1;
    const push = Math.min(need - d, 120 * dt) / d;
    // if one of them is against a wall or the shore, the other takes the whole step
    const movedA = nudge(a, -dx * push * wa, -dy * push * wa), movedB = nudge(b, dx * push * (1 - wa), dy * push * (1 - wa));
    if (!movedA && wa > 0) nudge(b, dx * push * wa, dy * push * wa);
    if (!movedB && wa < 1) nudge(a, -dx * push * (1 - wa), -dy * push * (1 - wa));
  }
}
function nudge(a, dx, dy) {
  if (a.perched || a.exiting) return false;
  const x = clamp(a.x + dx, 8, W - 8), y = clamp(a.y + dy, 8, H - 8);
  if (!a.fly && !canStand(a, x, y)) return false;
  a.x = x; a.y = y;
  return true;
}

// ---------- personal space ----------
// Creatures on the ground (walkers, swimmers, perched guardians) never overlap. Each has a radius
// from its sprite. Goals are only picked where nobody stands or is headed. A walker that finds
// someone in its lane ahead either asks them to step aside (if they're idle), waits for them to
// pass (right of way: creatures leaving the map, then agents, guardians, residents; ties by age),
// or, meeting someone head-on that has right of way, steps aside or backs off itself. Stuck for a
// while, it plans a way around everyone standing still.
let nextId = 1, refill = 0;
function radius(a) { return clamp((a.drawW || 24) * .42, 9, 20); }
function onFoot(a) { return !a.fly && !a.leaving && !a.held; }
function rank(a) { return a.exiting ? 4 : a.kind === "agent" ? 3 : a.kind === "legend" ? 2 : 1; }
function goalOf(a) { return a.path.length ? a.path[a.path.length - 1] : [a.x, a.y]; }
// True when a creature of radius r could stand at (x, y) without touching anyone on the ground,
// counting both where they are and where they're headed.
function isFree(x, y, r, self) {
  for (const b of actors) {
    if (b === self || !onFoot(b)) continue;
    const need = r + radius(b) + 3, [gx, gy] = goalOf(b);
    if (Math.hypot(b.x - x, b.y - y) < need || Math.hypot(gx - x, gy - y) < need) return false;
  }
  return true;
}
// Moves b out of the lane of someone heading (hx, hy) from (a.x, a.y): a free spot to either
// side (a little forward or back if needed). It goes back to what it was doing afterwards.
function stepAside(b, a, hx, hy) {
  if (b.yieldT > 0) return true;
  if (b.perched || b.held) return false;
  const need = radius(a) + radius(b) + 6, g = gridFor(b), opts = [];
  for (const dist of [need, need + 10, need + 22]) for (const fwd of [0, 12, -12]) for (const side of [1, -1]) {
    opts.push([b.x - hy * side * dist + hx * fwd, b.y + hx * side * dist + hy * fwd]);
  }
  for (const [x, y] of opts) {
    if (Math.abs((x - a.x) * hy - (y - a.y) * hx) < need) continue; // still in the lane
    if (x < 8 || x > W - 8 || y < 8 || y > H - 8 || !canStand(b, x, y)) continue;
    if ((g && !clearLine(g, tile, b.x, b.y, x, y)) || !isFree(x, y, radius(b), b)) continue;
    if (b.path.length && !b.resume) b.resume = goalOf(b);
    b.path = [[x, y]]; b.yieldT = 2.2; b.idleT = Math.max(b.idleT, 3);
    return true;
  }
  return false;
}
// Backs a few steps away from someone coming head-on when there's no room to the side.
function backOff(a, hx, hy) {
  if (a.yieldT > 0) return true;
  const g = gridFor(a), d = radius(a) * 2 + 14;
  for (const k of [1, 1.6]) {
    const x = a.x - hx * d * k, y = a.y - hy * d * k;
    if (!canStand(a, x, y) || (g && !clearLine(g, tile, a.x, a.y, x, y)) || !isFree(x, y, radius(a), a)) continue;
    if (!a.resume) a.resume = goalOf(a);
    a.path = [[x, y]]; a.yieldT = 2.6;
    return true;
  }
  return false;
}
// A path that goes around every other creature on the ground, treating them as rocks.
function detour(a) {
  const g = gridFor(a);
  if (!g || !a.path.length) return false;
  const tmp = g.map((row) => row.slice()), [gx, gy] = goalOf(a);
  for (const b of actors) {
    if (b === a || !onFoot(b)) continue;
    const r = radius(a) + radius(b) + 2;
    for (let ty = Math.floor((b.y - r) / tile); ty <= Math.floor((b.y + r) / tile); ty++)
      for (let tx = Math.floor((b.x - r) / tile); tx <= Math.floor((b.x + r) / tile); tx++)
        if (tmp[ty]?.[tx] !== undefined) tmp[ty][tx] = 0;
  }
  for (const [x, y] of [[a.x, a.y], [gx, gy]]) { const tx = Math.floor(x / tile), ty = Math.floor(y / tile); if (tmp[ty]?.[tx] !== undefined) tmp[ty][tx] = g[ty][tx]; }
  const p = findPath(tmp, tile, a.x, a.y, gx, gy);
  if (!p) return false;
  a.path = p;
  return true;
}
// Runs before each move: decides whether `a` may keep walking this frame.
function avoid(a, dt) {
  a.blocked = false;
  if (!onFoot(a) || !a.path.length) { a.waitT = 0; return; }
  if (a.pushT > 0) { a.pushT -= dt; return; } // squeezing past a jam: only separate() keeps them apart
  const [tx, ty] = a.path[0], hl = Math.hypot(tx - a.x, ty - a.y);
  if (hl < .5) return;
  const hx = (tx - a.x) / hl, hy = (ty - a.y) / hl, ra = radius(a);
  let hard = false; // blocked by someone who can't make room
  for (const b of actors) {
    if (b === a || !onFoot(b)) continue;
    const dx = b.x - a.x, dy = b.y - a.y, need = ra + radius(b) + 3;
    const ahead = dx * hx + dy * hy, side = Math.abs(dx * hy - dy * hx);
    if (ahead <= 0 || ahead > need + 26 || side >= need) continue; // not in my lane
    const moving = b.path.length > 0 && !b.blocked && !(b.yieldT > 0);
    if (!moving) {
      if (b.yieldT > 0 || stepAside(b, a, hx, hy)) { if (ahead < need + 10) a.blocked = true; continue; }
      if (ahead < need + 10) { a.blocked = true; hard = true; }
      continue;
    }
    const [btx, bty] = b.path[0], bl = Math.hypot(btx - b.x, bty - b.y) || 1;
    const headOn = hx * (btx - b.x) / bl + hy * (bty - b.y) / bl < -.2;
    const theirs = rank(b) > rank(a) || (rank(b) === rank(a) && b.id < a.id);
    if (headOn) {
      if (theirs) { a.blocked = true; if (!stepAside(a, b, -hx, -hy) && !backOff(a, hx, hy)) hard = true; }
      else if (ahead < need + 6) a.blocked = true; // let them get out of the way first
    } else if (ahead < need + 8) a.blocked = true; // following a slower one: keep a gap
  }
  if (!a.blocked) { a.waitT = 0; return; }
  if (remaining(a) < 26 && !a.exiting) { a.path = []; a.blocked = false; return; } // close enough: stop here
  a.waitT = (a.waitT || 0) + dt * (hard ? 2 : 1);
  if (a.waitT < 1.6) return;
  // waited long enough: give up a side-step, else go around, else (residents) go elsewhere,
  // else squeeze through slowly while separate() keeps everyone apart
  a.waitT = 0;
  if (a.yieldT > 0) { a.path = []; a.blocked = false; }
  else if (detour(a)) a.blocked = false;
  else if (a.kind === "resident" && !a.exiting) { a.path = []; a.idleT = 0; }
  else { a.pushT = 1.2; a.blocked = false; }
}
// Called each frame for every actor: ends a side-step and resumes the old errand.
function yieldTick(a, dt) {
  if (!(a.yieldT > 0)) return;
  a.yieldT -= dt;
  if (a.path.length && a.yieldT > 0) return;
  a.yieldT = 0;
  if (a.resume) { const [x, y] = a.resume; a.resume = null; walkTo(a, x, y); }
}

// Speeds in map px/s: residents amble, agents walk with purpose, legends barely move.
const BASE_SPEED = { resident: 30, agent: 54, legend: 18 };
const ACCEL = 90, DECEL = 110;
function remaining(a) {
  let d = 0, x = a.x, y = a.y;
  for (const [px2, py2] of a.path) { d += Math.hypot(px2 - x, py2 - y); x = px2; y = py2; }
  return d;
}
// Eases into and out of each walk, turns around only after heading the other way for a moment,
// and advances the gait phase with distance so steps match speed.
function move(a, dt) {
  const top = BASE_SPEED[a.kind] * a.sp * (a.fly ? 1.5 : 1) * (a.exiting ? 1.2 : 1) * (a.pushT > 0 ? .3 : 1);
  const want = a.path.length && !a.blocked ? Math.min(top, Math.sqrt(2 * DECEL * remaining(a)) + 3) : 0;
  a.v = clamp(want, a.v - DECEL * dt, a.v + ACCEL * dt);
  if (a.path.length) {
    const dx = a.path[0][0] - a.x, dy = a.path[0][1] - a.y;
    if (Math.abs(dx) > 3 && (dx > 0) !== a.flip) { if ((a.flipT += dt) > 0.18) { a.flip = dx > 0; a.flipT = 0; } }
    else a.flipT = 0; // flipped means facing right (side-on animals are mirrored when not)
    const dir = dirFrom(dx, dy); // sprites turn to one of 4 directions, after a beat
    if (Math.hypot(dx, dy) > 2 && dir !== a.dir) { if ((a.dirT += dt) > 0.1) { a.dir = dir; a.dirT = 0; } }
    else a.dirT = 0;
  }
  // animation clock: steps speed up and slow down with the walk
  a.tick += dt * 60 * (a.v > 3 ? clamp(a.v / BASE_SPEED.resident, 0.6, 1.8) : 1);
  let budget = a.v * dt;
  while (budget > 0 && a.path.length) {
    const [px2, py2] = a.path[0], dx = px2 - a.x, dy = py2 - a.y, dist = Math.hypot(dx, dy);
    if (dist <= budget) { a.x = px2; a.y = py2; budget -= dist; a.path.shift(); }
    else { a.x += dx / dist * budget; a.y += dy / dist * budget; budget = 0; }
  }
  if (!a.path.length && a.v < 4) a.v = 0;
  a.ph += a.v * dt * 0.22;
}

// Draws every actor from its sheet (skipped while the sheet loads). Walk frames advance with the
// steps; standing still shows the first frame.
function drawActors() {
  const list = [...actors, ...enemies].sort((p, q) => p.y - q.y);
  for (const a of list) {
    if (a.owner) { drawEnemy(a); continue; }
    const img = sheet(a.dex);
    if (!img) continue;
    const moving = a.v > 3 || a.fly || a.held || a.boss; // flyers flap while they hover, held ones kick, guardians idle
    const f = moving ? Math.floor(a.tick / (a.boss ? 8 : 9)) % a.frames : 0;
    let src = img, sx = a.side || a.boss ? f * a.fw : a.dir * a.fw, sy = a.side || a.boss ? 0 : f * a.fh;
    let w = a.fw, h = a.fh;
    const pf = !a.side && !a.boss && poseFrame(a);
    if (pf) [src, sx, sy] = pf;
    if (a.boss && a.hitT > 0) { // the guardian's hit strip, played once
      const hit = art(poseImgs, `art/actors/${a.dex}-hit.png`, `${a.dex}-hit`);
      if (hit) { src = hit; w = a.hit.w; h = a.hit.h; sx = Math.min(a.hit.frames - 1, Math.floor((1 - a.hitT * 8 / a.hit.frames) * a.hit.frames)) * w; sy = 0; }
    }
    const lift = (a.fly ? a.alt + Math.sin(anim * 2.2 + a.ph) * 2 : 0) + extraLift(a);
    a.drawH = h; a.drawW = w;
    ctx.globalAlpha = a.alpha;
    const sink = submerge(a);
    if (!sink) {
      ctx.fillStyle = a.fly ? "rgba(0,0,0,.16)" : "rgba(0,0,0,.22)";
      const shadow = w * 0.36 * (a.fly ? 1 - Math.min(lift, 40) / 80 : 1);
      ctx.beginPath(); ctx.ellipse(a.x, a.y, shadow, a.fly ? 2 : 2.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    const top = snap(a.y - lift + sink - h + (a.boss && a.hitT > 0 ? a.fh - h : 0));
    if (a.side && !a.flip) { // animals face right; mirrored when heading left
      ctx.translate(snap(a.x), 0); ctx.scale(-1, 1);
      ctx.drawImage(src, sx, sy, w, h, -w / 2, top, w, h);
    } else ctx.drawImage(src, sx, sy, w, h, snap(a.x - w / 2), top, w, h);
    ctx.restore();
    if (sink) ripple(a, w * 0.45);
    ctx.globalAlpha = 1;
  }
}
// In water an actor sits lower, cut off at the waterline (a.y). Returns how far it sinks; always
// leaves a saved canvas state (clipped when in water) for the caller to restore.
function submerge(a) {
  ctx.save();
  if (a.fly || a.held || !inWater(a.x, a.y)) return 0;
  ctx.beginPath(); ctx.rect(0, 0, W, a.y); ctx.clip();
  return Math.min(12, a.drawH * 0.4);
}
function ripple(a, size) {
  const rx = clamp(size, 8, 18), t = (anim * 0.8 + a.ph) % 1;
  ctx.strokeStyle = "rgba(235,248,255,.65)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(a.x, a.y, rx * (1 + Math.sin(anim * 3 + a.ph) * 0.06), 3, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = `rgba(235,248,255,${(0.45 * (1 - t)).toFixed(2)})`; // a ring spreading outward
  ctx.beginPath(); ctx.ellipse(a.x, a.y, rx * (1 + t * 0.8), 3 + t * 2, 0, 0, Math.PI * 2); ctx.stroke();
}
// The pack's dialog box stretched to any size: 8px corners kept, edges and middle stretched.
function box(x, y, w, h) {
  const img = ui("ui/box");
  if (!img) { ctx.fillStyle = "#f2eaf1"; ctx.fillRect(x, y, w, h); return; }
  const c = 8, iw = img.width, ih = img.height, X = [0, c, iw - c, iw], Y = [0, c, ih - c, ih];
  const DX = [x, x + c, x + w - c, x + w], DY = [y, y + c, y + h - c, y + h];
  for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) {
    ctx.drawImage(img, X[q], Y[r], X[q + 1] - X[q], Y[r + 1] - Y[r], DX[q], DY[r], DX[q + 1] - DX[q], DY[r + 1] - DY[r]);
  }
}
function drawBubbles() {
  ctx.font = `8px ${FONT}`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const a of actors) {
    if (a.bubbleT <= 0 || !a.bubble) continue;
    const h = a.drawH || 16, up = a.emoteT > 0 || a.workT > 0 ? 16 : 0; // above any emote or icon
    const tw = Math.ceil(ctx.measureText(a.bubble).width) + 16, bx = Math.round(a.x - tw / 2), by = Math.round(a.y - a.alt - h - 26 - up);
    ctx.globalAlpha = Math.min(1, a.bubbleT) * a.alpha;
    box(bx, by, tw, 20);
    ctx.fillStyle = "#3a2a2a"; ctx.fillText(a.bubble, a.x, by + 10);
  }
  ctx.globalAlpha = 1;
}

// ---------- frame ----------
function render(dt) {
  const seasons = map.seasons, n = seasons.length;
  const auto = settings.season === "auto" || n === 1;
  const pos = auto ? seasonPos * n / 4 : Math.max(0, seasons.indexOf(settings.season));
  const i = Math.floor(pos) % n, j = (i + 1) % n, f = pos - Math.floor(pos);
  let b = auto && n > 1 ? Math.max(0, (f - .7) / .3) : 0; b = b * b * (3 - 2 * b);
  const w = [0, 0, 0, 0]; w[seasonIndex(seasons[i])] += 1 - b; w[seasonIndex(seasons[j])] += b;
  const dom = seasons[b < .5 ? i : j];
  if (dom !== gridSeason) applySeasonGrids(dom);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  ctx.setTransform(RES, 0, 0, RES, shake > 0 ? Math.round(rnd(-2, 2)) * RES : 0, shake > 0 ? Math.round(rnd(-2, 2)) * RES : 0);
  drawWindMap(swayL[seasons[i]], imgs[seasons[i]]);
  if (b > 0) { ctx.globalAlpha = b; ctx.drawImage(imgs[seasons[j]], 0, 0); ctx.globalAlpha = 1; }
  grassWind(swayL[dom]);
  drawMapAnims(dt, dom);

  const fx = effects[map.id] || {}, glint = fx.glint || "#e8f6ff", flow = fx.flow || "#ffffff";
  const pts = spark[dom];
  if (pts.length) for (const s of sparkles) {
    s.t += dt / s.d;
    if (s.t >= 1 || s.s !== dom) { const k = (Math.random() * pts.length / 2 | 0) * 2; s.x = pts[k]; s.y = pts[k + 1]; s.t = s.s === dom ? 0 : Math.random(); s.d = rnd(.5, 1.4); s.s = dom; }
    const a = Math.sin(s.t * Math.PI);
    ctx.fillStyle = rgba(glint, a * .9); px(s.x, s.y, 3, 1);
    if (a > .7) { ctx.fillStyle = "rgba(255,255,255," + a.toFixed(2) + ")"; px(s.x + 1, s.y - 1, 1, 1); }
  }
  ctx.fillStyle = rgba(flow, .6);
  const off = anim * 46, fl = fall[dom];
  for (let k = 0; k < fl.length; k += 2) {
    const x = fl[k], y = fl[k + 1], hx = (x * 7919) % 5;
    if (hx < 3) { const p = ((y - off + x * 13 + hx * 3) % 9 + 9) % 9; if (p < 3) ctx.fillRect(x, y, 1, 1); }
  }

  const tc = tint(time), night = Math.min(1, Math.max(0, (205 - (tc[0] + tc[1] + tc[2]) / 3) / 100));

  drawGround(dt);
  drawChests(dt);
  drawActors();
  drawEvolutions();
  drawShuriken(dt);

  const bw = fx.indoor ? 0 : (w[0] + w[1]) * (1 - night);
  if (bw > .05) {
    for (const q of bflies) {
      q.ph += dt * q.sp;
      const x = q.x + Math.sin(q.ph * 1.3) * 26 + Math.sin(q.ph * 3.1) * 6, y = q.y + Math.cos(q.ph * 1.7) * 18;
      ctx.fillStyle = q.c; ctx.globalAlpha = bw;
      if (Math.sin(anim * 18 + q.ph * 9) > 0) { px(x - 1, y, 1, 1); px(x + 1, y, 1, 1); } else { px(x - 2, y - 1, 2, 2); px(x + 1, y - 1, 2, 2); }
      ctx.fillStyle = "#3a2c2c"; px(x, y, 1, 2);
    }
    ctx.globalAlpha = 1;
  }

  // falling petals (spring), leaves (autumn) and snow, drawn with the pack's particle strips
  let c = fx.indoor ? 0 : Math.round(petals.length * w[0] * .6);
  for (let k = 0; k < c; k++) {
    const q = petals[k]; q.ph += dt * 2; q.x += (q.vx + Math.sin(q.ph) * 8) * dt; q.y += q.vy * dt;
    if (q.x > W + 12) q.x = -12; if (q.y > H + 8) { q.y = -8; q.x = rnd(0, W); }
    drawPart("petal", 12, 6, q.x, q.y, q.ph * 2);
  }
  c = fx.indoor ? 0 : Math.round(leaves.length * w[2] * .6);
  for (let k = 0; k < c; k++) {
    const q = leaves[k]; q.ph += dt * 2.4; q.x += (q.vx + Math.sin(q.ph) * 12) * dt; q.y += (q.vy + Math.cos(q.ph) * 5) * dt;
    if (q.x > W + 12) q.x = -12; if (q.y > H + 8) { q.y = -8; q.x = rnd(0, W); }
    drawPart("leaf", 12, 6, q.x, q.y, q.ph * 2);
  }
  c = fx.indoor ? 0 : Math.round(snow.length * w[3] * .5);
  for (let k = 0; k < c; k++) {
    const q = snow[k]; q.ph += dt * 1.5; q.y += q.vy * dt; const x = q.x + Math.sin(q.ph) * q.sw;
    if (q.y > H + 8) { q.y = -8; q.x = rnd(0, W); }
    drawPart("snow", 8, 7, x, q.y, q.ph * 1.5 + k);
  }

  const amb = (dom === "winter" && fx.winter?.ambient) || fx.ambient;
  ambient(amb, amb === "steam" ? glowPts[dom] : pts, dt); // steam rises from the glowing cracks
  if (!fx.indoor) { drawDragon(dt); drawClouds(dt, w, night); } // no sky underground
  else drawFog(dt);
  setLoop(loops.rain, storms.length ? "rain" : null);
  drawStorms(dt);

  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "rgb(" + (tc[0] | 0) + "," + (tc[1] | 0) + "," + (tc[2] | 0) + ")"; ctx.fillRect(0, 0, W, H);

  // Glow sits on top of the night tint so lava and glowing caps light up after dark.
  if (glow[dom]) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = (.25 + .55 * night) * (.75 + .25 * Math.sin(anim * 1.8));
    ctx.drawImage(glow[dom], 0, 0);
    ctx.globalAlpha = 1;
  }

  const fw = night * (1 - w[3]);
  if (fw > .03) {
    ctx.globalCompositeOperation = "lighter";
    for (const q of flies) {
      q.ph += dt * q.sp;
      const x = Math.round(q.x + Math.sin(q.ph * 1.1) * q.r), y = Math.round(q.y + Math.cos(q.ph * 1.6) * q.r * .6);
      const g = (Math.sin(q.ph * 4.2) * .5 + .5) * fw;
      ctx.fillStyle = "rgba(255,232,120," + (g * .28).toFixed(3) + ")"; ctx.fillRect(x - 2, y - 2, 5, 5);
      ctx.fillStyle = "rgba(255,240,150," + (g * .5).toFixed(3) + ")"; ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = "rgba(255,252,210," + g.toFixed(3) + ")"; ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.globalCompositeOperation = "source-over";

  drawSky(dt);
  if (!fx.indoor) drawRays(clamp(1 - Math.abs(time - 7.5) / 1.6, 0, 1)); // sun shafts around 6-9 am
  drawFx(dt);
  drawDropOverlay();
  drawHearts(dt);
  drawHeads(dt);
  drawBubbles(); // after the night tint so labels stay readable
  drawCard();
  drawHud();
  drawMenu();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Map-specific ambient particles from effects.json. Foam spawns on water glints; the rest anywhere.
const motes = [];
const AMBIENT = {
  foam: { n: 40, life: [.6, 1.4], v: [[-4, 4], [-2, 2]], c: "#ffffff", onWater: true },
  steam: { n: 36, life: [2, 3.5], v: [[-3, 3], [-14, -7]], c: "#e8e4e0", onWater: true, size: 2 },
  dust: { n: 26, life: [3, 6], v: [[14, 30], [-3, 3]], c: "#e8c890" },
  embers: { n: 34, life: [2, 4], v: [[-6, 6], [-26, -12]], c: "#ff9a3a" },
  spores: { n: 30, life: [4, 7], v: [[-4, 4], [-8, -3]], c: "#a8f8e8" },
};
function ambient(kind, water, dt) {
  const k = AMBIENT[kind];
  if (!k) return;
  while (motes.length < k.n) motes.push({ t: 1, d: 1, x: 0, y: 0, vx: 0, vy: 0, ph: 0 });
  for (const q of motes) {
    q.t += dt / q.d;
    if (q.t >= 1) {
      if (k.onWater && water.length) { const i = (Math.random() * water.length / 2 | 0) * 2; q.x = water[i]; q.y = water[i + 1]; }
      else { q.x = rnd(0, W); q.y = rnd(0, H); }
      q.t = 0; q.d = rnd(...k.life); q.vx = rnd(...k.v[0]); q.vy = rnd(...k.v[1]); q.ph = rnd(0, 6.3);
    }
    q.ph += dt * 2; q.x += (q.vx + Math.sin(q.ph) * 3) * dt; q.y += q.vy * dt;
    ctx.fillStyle = rgba(k.c, Math.sin(q.t * Math.PI) * .85);
    px(q.x, q.y, k.size || (kind === "foam" ? 2 : 1), k.size || 1);
  }
}

function frame(ts) {
  const dt = Math.min(.05, (ts - last) / 1000 || 0); last = ts;
  if (settings.hour === "auto") time += dt * 24 / DAY_SECONDS;
  else { // run the clock forward quickly to the chosen hour, then hold it
    const ahead = (settings.hour - time + 24) % 24;
    time += Math.min(ahead, dt * 8);
  }
  if (time >= 24) time -= 24;
  seasonPos = (seasonPos + dt / (DAY_SECONDS * DAYS_PER_SEASON)) % 4;
  anim += dt;
  if (shake > 0) shake -= dt;
  updateActors(dt);
  render(dt);
  requestAnimationFrame(frame);
}

// ---------- sound ----------
// Effects (audio/sfx/<name>.wav) play through Web Audio, decoded once; each map has a music track
// (maps.json "music", in audio/music/) that loops while music is on. Both can be switched off from
// the right-click menu. Music starts off, so the window stays quiet until asked.
let audioCtx = null;
const sounds = new Map(); // name -> AudioBuffer, or a promise while it loads
function sfx(name, volume = .5, rate = 1) {
  if (!settings.sounds) return;
  try {
    audioCtx ||= new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const play = (buf) => {
      const src = audioCtx.createBufferSource(), gain = audioCtx.createGain();
      src.buffer = buf; gain.gain.value = volume; src.playbackRate.value = rate;
      src.connect(gain).connect(audioCtx.destination); src.start();
    };
    const got = sounds.get(name);
    if (got instanceof AudioBuffer) return play(got);
    if (got) return;
    sounds.set(name, fetch(`audio/sfx/${name}.wav`).then((r) => r.arrayBuffer()).then((b) => audioCtx.decodeAudioData(b))
      .then((buf) => { sounds.set(name, buf); play(buf); }).catch(() => sounds.delete(name)));
  } catch { /* no audio device */ }
}
const music = new Audio();
music.loop = true; music.volume = .3;
function playMusic() {
  if (!settings.music || !map?.music) { music.pause(); return; }
  const src = `audio/music/${encodeURIComponent(map.music.replace(/\.\w+$/, ".m4a"))}`; // shipped as AAC
  if (!music.src.endsWith(src)) music.src = src;
  music.play().catch(() => {}); // may wait for the first click if the webview blocks autoplay
}
cv.addEventListener("pointerdown", () => { if (audioCtx?.state === "suspended") audioCtx.resume(); if (settings.music && music.paused) playMusic(); });

// ---------- enemies ----------
// While an agent's ninja is working, a monster from the pack stands in front of it and they fight
// until the work is done: the ninja swings (attack pose, a cut on the enemy, which reels back and
// flashes), now and then the enemy claws back, a failed tool call is the enemy landing a real
// blow, and when the turn or the subagent ends the enemy goes up in smoke. If the ninja walks to
// another station, the enemy follows it there.
const enemies = [], SLASHES = ["cut", "cutx", "slash", "spin"];
const SIDES = [[18, 2], [-18, 2], [0, 16], [0, -14]];
function spawnEnemy(a) {
  if (a.enemy || !a.ninja) return;
  const pool = creatures.filter((p) => p.kind === "monster" && !p.fish);
  if (!pool.length) return;
  const p = pool[Math.floor(Math.random() * pool.length)];
  const e = { owner: a, dex: p.dex, fly: !!p.fly, frames: p.frames || 4, side: Math.floor(rnd(0, 2)), x: a.x, y: a.y,
              dir: 2, tick: rnd(0, 60), hitT: 0, alpha: 0 };
  enemySpot(e, true);
  a.enemy = e; enemies.push(e); sheet(p.dex);
  playFx("smoke", e.x, e.y + 6); emote(a, "alert", 1.2);
}
// Moves the enemy towards its place beside the ninja (keeping the same side while there's ground).
function enemySpot(e, jump) {
  const a = e.owner;
  for (let k = 0; k < SIDES.length; k++) {
    const [dx, dy] = SIDES[(e.side + k) % SIDES.length];
    if (!onGround(a.x + dx, a.y + dy)) continue;
    e.side = (e.side + k) % SIDES.length;
    if (jump) { e.x = a.x + dx; e.y = a.y + dy; }
    return [a.x + dx, a.y + dy];
  }
  return [a.x + 18, a.y];
}
function defeat(e) {
  playFx("smoke", e.x, e.y + 6); sfx("poof", .18);
  enemies.splice(enemies.indexOf(e), 1);
  if (e.owner.enemy === e) e.owner.enemy = null;
}
function updateEnemies(dt) {
  for (const e of [...enemies]) {
    const a = e.owner;
    e.tick += dt * 60; e.alpha = Math.min(1, e.alpha + dt * 3);
    if (e.hitT > 0) e.hitT -= dt;
    if (!actors.has(a) || a.leaving || a.exiting || a.kind !== "agent" || !a.busy) { defeat(e); continue; }
    const [tx, ty] = enemySpot(e, false), k = Math.min(1, dt * 5);
    e.x += (tx - e.x) * k; e.y += (ty - e.y) * k;
    e.dir = dirFrom(a.x - e.x, a.y - e.y);
    if (a.path.length || a.v > 3 || a.faintT > 0 || a.held || Math.hypot(tx - e.x, ty - e.y) > 6) continue; // fight only once both stand
    a.dir = dirFrom(e.x - a.x, e.y - a.y);
    if ((a.swingT = (a.swingT ?? .3) - dt) > 0) continue;
    a.swingT = rnd(.5, .95); a.attackT = .22; e.hitT = .2;
    playFx(SLASHES[Math.floor(rnd(0, SLASHES.length))], e.x, e.y + 8);
    if (Math.random() < .35) sfx("slash", .1, rnd(.9, 1.15));
    if (Math.random() < .2) playFx("claw", a.x, a.y + 8); // the enemy strikes back
  }
}
function drawEnemy(e) {
  const img = sheet(e.dex);
  if (!img) return;
  const f = Math.floor(e.tick / 9) % e.frames, lift = e.fly ? 10 + Math.sin(anim * 3 + e.side) * 2 : 0;
  const kx = e.hitT > 0 ? Math.sign(e.x - e.owner.x || 1) * 3 : 0; // knocked back by the blow
  ctx.globalAlpha = e.alpha;
  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.beginPath(); ctx.ellipse(e.x, e.y, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  const draw = () => ctx.drawImage(img, e.dir * 16, f * 16, 16, 16, snap(e.x - 8 + kx), snap(e.y - 16 - lift), 16, 16);
  draw();
  if (e.hitT > 0) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = .55 * e.alpha; draw(); ctx.globalCompositeOperation = "source-over"; }
  ctx.globalAlpha = 1;
}

// ---------- life: poses, tool icons, emotes ----------
// Villagers act out their work: at the blacksmith, workshop and garden they swing (attack pose,
// facing the building), at the library, gate and dojo they hold something up (item pose). A
// failed tool call knocks them flat for a moment (dead pose), a new belt makes them jump. While
// working, the tool's icon floats over their head; between tools a typing bubble shows they are
// thinking. Emote bubbles from the pack say how they feel.
const poseImgs = new Map(), uiImgs = new Map();
function pose(a, name) { return a.poses?.includes(name) ? art(poseImgs, `art/actors/${a.dex}-${name}.png`, `${a.dex}-${name}`) : null; }
function ui(name) { return art(uiImgs, `art/${name}.png`, name); }
const SWING = new Set(["bash", "edit", "search"]);
const EMOTE = { happy: 11, dizzy: 15, star: 29, heart: 27, done: 6, wait: 23, sleep: 28, alert: 21 };
function emote(a, name, seconds = 2) { a.emote = EMOTE[name]; a.emoteT = seconds; }
// The pose image and source rect for an actor right now, or null for its normal walk frame.
function poseFrame(a) {
  if (a.faintT > 0) { const img = pose(a, "dead"); return img && [img, 0, 0]; }
  if (a.jumpT > 0) { const img = pose(a, "jump"); return img && [img, a.dir * 16, 0]; }
  if (a.attackT > 0) { const img = pose(a, "attack"); return img && [img, a.dir * 16, 0]; } // a sword stroke
  if (a.workT > 0 && !a.enemy && !a.path.length && a.v < 3) { // no enemy (not a ninja): act out the work
    if (SWING.has(a.workKind)) {
      const img = pose(a, "attack");
      return img && Math.floor(anim * 3.2 + a.ph) % 2 === 0 ? [img, 16, 0] : null; // facing the building
    }
    const img = pose(a, "item"); return img && [img, 0, 0];
  }
  return null;
}
// Over the head: an emote if there is one, else the tool icon while working, else typing dots
// while the agent is between tools.
function drawHeads(dt) {
  const emotes = ui("ui/emotes"), typing = ui("ui/typing");
  for (const a of actors) {
    if (a.emoteT > 0) a.emoteT -= dt;
    if (a.leaving || a.alpha < .3) continue;
    const top = a.y - (a.fly ? a.alt : 0) - (a.drawH || 16) - 4 + extraLift(a) * -1;
    const bob = Math.round(Math.sin(anim * 3 + a.ph));
    ctx.globalAlpha = a.alpha;
    if (a.emote && a.emoteT > 0 && emotes) {
      ctx.drawImage(emotes, (a.emote - 1) * 14, 0, 14, 13, snap(a.x - 7), snap(top - 13 + bob), 14, 13);
    } else if (a.kind === "agent" && a.workT > 0) {
      const icon = ui(`items/${a.workKind || "other"}`);
      if (icon) ctx.drawImage(icon, snap(a.x - icon.width / 2), snap(top - icon.height + bob), icon.width, icon.height);
    } else if (a.kind === "agent" && a.busy && typing) {
      const f = Math.floor(anim * 4) % 4;
      ctx.drawImage(typing, f * 20, 0, 20, 16, snap(a.x - 10), snap(top - 16), 20, 16);
    }
    ctx.globalAlpha = 1;
  }
}

// ---------- treasure and cups ----------
// A finished subagent leaves a small chest near home (it opens after a moment and fades after a
// few minutes); the done counter earns a silver cup at 10 and a gold one at 50.
const chests = [];
function dropChest() {
  const [hx, hy] = map.stations.home;
  for (let i = 0; i < 30; i++) {
    const x = hx + rnd(-48, 48), y = hy + rnd(-20, 28);
    if (onGround(x, y) && isFree(x, y, 10, null) && !chests.some((c) => Math.hypot(c.x - x, c.y - y) < 14)) {
      chests.push({ x, y, t: 0 }); if (chests.length > 8) chests.shift(); sfx("chest", .3); return;
    }
  }
}
function drawChests(dt) {
  const img = ui("items/chest");
  for (const c of [...chests]) {
    c.t += dt;
    if (c.t > 240) { chests.splice(chests.indexOf(c), 1); continue; }
    if (!img) continue;
    ctx.globalAlpha = Math.min(1, (240 - c.t) / 10, c.t * 3);
    const f = c.t > 1.2 ? 1 : 0; // opens
    ctx.drawImage(img, f * 16, 0, 16, 16, snap(c.x - 8), snap(c.y - 14), 16, 16);
    ctx.globalAlpha = 1;
  }
}

// ---------- animated map pieces ----------
// maps.json "anims": [{ name, x, y, seasons? }] placed by the map builder (flags, mills, plants),
// plus ripples that come and go on open water by themselves.
const ANIM = { "flag-red": [16, 16, 4, 6], "flag-blue": [16, 16, 4, 6], "flag-yellow": [16, 16, 4, 6], "flag-white": [16, 16, 4, 6],
  plant: [16, 16, 4, 3], watermill: [34, 36, 3, 6], mill: [64, 64, 4, 5], ripple: [16, 16, 4, 5], "ripple-purple": [16, 16, 4, 5],
  "waterfall-top": [16, 16, 5, 8], "waterfall-middle": [16, 16, 5, 8], "waterfall-bottom": [16, 16, 3, 8] }; // w, h, frames, fps
const animImgs = new Map(), ripples = [];
function drawAnim(name, x, y, t) {
  const spec = ANIM[name], img = art(animImgs, `art/anim/${name}.png`, name);
  if (!spec || !img) return;
  const [w, h, n, fps] = spec, f = Math.floor(t * fps) % n;
  ctx.drawImage(img, f * w, 0, w, h, snap(x), snap(y), w, h);
}
function drawMapAnims(dt, season) {
  for (const p of map.anims || []) if (!p.seasons || p.seasons.includes(season)) drawAnim(p.name, p.x, p.y, anim + (p.x % 7) * .13);
  if (!water) return;
  const name = (effects[map.id] || {}).ripples === "purple" ? "ripple-purple" : "ripple";
  while (ripples.length < 4) ripples.push({ t: rnd(-3, 0), x: 0, y: 0 });
  for (const r of ripples) {
    r.t += dt;
    if (r.t > .8 || r.x === 0) { // one ripple lasts 4 frames at 5 fps, then pops up elsewhere
      if (r.t > .8) r.t = rnd(-2.5, 0);
      const spot = randomWater(rnd(0, W), rnd(0, H)), tx = spot && Math.floor(spot[0] / tile), ty = spot && Math.floor(spot[1] / tile);
      const inside = spot && [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => walkable(water, tx + dx, ty + dy))); // away from the shore
      if (inside) { r.x = tx * tile; r.y = ty * tile; }
    }
    if (r.t >= 0 && r.x) drawAnim(name, r.x, r.y, r.t);
  }
}

// ---------- dragon ----------
// Now and then (and whenever a villager earns a black belt) the blue dragon from the pack flies
// across the sky: a head and a chain of body segments following it, wings flapping, a shadow
// sliding over the ground below.
const dragonImgs = new Map();
let dragon = null, nextDragon = rnd(240, 480);
function summonDragon() {
  if (dragon || map && (effects[map.id] || {}).indoor) return;
  const y = rnd(H * .2, H * .6), dir = Math.random() < .5 ? 1 : -1;
  dragon = { x: dir > 0 ? -60 : W + 60, y0: y, dir, t: 0, trail: [] };
  sfx("roar", .3);
}
function drawDragon(dt) {
  if ((nextDragon -= dt) <= 0) { nextDragon = rnd(300, 600); summonDragon(); }
  if (!dragon) return;
  // Seen from above, as in the pack: the head faces the viewer, round body segments trail behind
  // it along its path, two wings beat on the first segment, and the tail spike points backwards.
  const d = dragon, img = (n) => art(dragonImgs, `art/dragon/${n}.png`, n);
  d.t += dt; d.x += d.dir * 70 * dt;
  const y = d.y0 + Math.sin(d.t * 1.6) * 22;
  const last = d.trail[0];
  if (!last || Math.hypot(d.x - last[0], y - last[1]) >= 2) { d.trail.unshift([d.x, y]); if (d.trail.length > 80) d.trail.pop(); }
  if ((d.dir > 0 && d.x > W + 200) || (d.dir < 0 && d.x < -200)) { dragon = null; return; }
  const at = (k) => d.trail[Math.min(d.trail.length - 1, k)] || [d.x, y]; // trail points are 2px apart
  const segs = [at(9), at(18), at(27), at(36)], tail = at(46), base = at(40);
  ctx.fillStyle = "rgba(0,0,0,.12)"; // its shadow on the ground, far below
  ctx.beginPath(); ctx.ellipse(d.x - d.dir * 30, y + 90, 50, 7, 0, 0, Math.PI * 2); ctx.fill();
  const put = (im, x, yy) => im && ctx.drawImage(im, snap(x - im.width / 2), snap(yy - im.height / 2));
  const end = img("bodyend");
  if (end) { // the spike's tip is at the bottom of its image: turn it to point away from the body
    ctx.save(); ctx.translate(snap(tail[0]), snap(tail[1]));
    ctx.rotate(Math.atan2(tail[1] - base[1], tail[0] - base[0]) - Math.PI / 2);
    ctx.drawImage(end, -end.width / 2, -end.height / 2 - 6); ctx.restore();
  }
  for (let i = segs.length - 1; i >= 0; i--) put(img(i % 2 ? "body2" : "body1"), ...segs[i]);
  const wing = img("wing"), flap = .55 + .45 * Math.sin(d.t * 7);
  if (wing) for (const side of [1, -1]) { // the image is the right wing, its root at the bottom left
    ctx.save(); ctx.translate(snap(segs[0][0] + side * 6), snap(segs[0][1] - 4)); ctx.scale(side, flap);
    ctx.drawImage(wing, -4, -wing.height + 6); ctx.restore();
  }
  put(img("head"), d.x, y - 4);
}

// ---------- shuriken ----------
// When an agent starts a subagent, a shuriken flies from the agent (or the dojo) to the newcomer.
const shuriken = [];
function throwShuriken(from, to) { shuriken.push({ x0: from[0], y0: from[1], to, t: 0 }); sfx("whoosh", .35); }
function drawShuriken(dt) {
  const img = ui("items/shuriken");
  for (const s of [...shuriken]) {
    s.t += dt / .7;
    const tx = s.to.x, ty = s.to.y - 10;
    if (s.t >= 1 || !actors.has(s.to)) { shuriken.splice(shuriken.indexOf(s), 1); if (actors.has(s.to)) emote(s.to, "alert", 1.5); continue; }
    const x = s.x0 + (tx - s.x0) * s.t, y = s.y0 + (ty - s.y0) * s.t - Math.sin(s.t * Math.PI) * 30;
    if (!img) continue;
    ctx.save(); ctx.translate(snap(x), snap(y)); ctx.rotate(anim * 18);
    ctx.drawImage(img, (Math.floor(anim * 12) % 2) * 16, 0, 16, 16, -8, -8, 16, 16);
    ctx.restore();
  }
}

// ---------- pack particles, fog, sun rays ----------
const partImgs = new Map();
function part(name) { return art(partImgs, `art/particles/${name}.png`, name); }
// One frame of a particle strip at (x, y): frames are w px wide.
function drawPart(name, w, n, x, y, f) {
  const img = part(name);
  if (img) ctx.drawImage(img, (Math.floor(f) % n) * w, 0, w, img.height, snap(x), snap(y), w, img.height);
}
function drawFog(dt) { // drifting mist, tiled, for underground maps
  const img = part("fog");
  if (!img) return;
  const off = (anim * 6) % img.width;
  ctx.globalAlpha = .18;
  for (let x = -off; x < W; x += img.width) for (let y = 0; y < H; y += img.height) ctx.drawImage(img, x, y);
  ctx.globalAlpha = 1;
}
function drawRays(morning) { // shafts of light in the early morning
  const img = part("rays");
  if (!img || morning <= 0) return;
  ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = .22 * morning;
  ctx.drawImage(img, W * .15, 0, img.width * 2, img.height * 2);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
}

// ---------- ambient sound ----------
// A quiet loop under each map (effects.json "sound": river or wind) and rain while a storm lasts.
const loops = { bed: new Audio(), rain: new Audio() };
for (const l of Object.values(loops)) { l.loop = true; l.volume = .12; }
function setLoop(l, name) {
  if (!settings.sounds || !name) { l.pause(); return; }
  const src = `audio/loops/${name}.m4a`;
  if (!l.src.endsWith(src)) l.src = src;
  if (l.paused) l.play().catch(() => {});
}
let voiceAt = 0;
function voice(a) { // a short murmur when a villager says something, pitched by who it is
  if (performance.now() - voiceAt < 600) return;
  voiceAt = performance.now();
  sfx(`voice${(a.dex % 10) + 1}`, .14, .85 + (a.dex % 7) * .06);
}

// ---------- effects and food ----------
// One-shot animations from the pack (art/fx/<name>.png, frames in a row), drawn after the night
// tint so they stay bright: a lightning strike for a failed tool call, a puff of smoke when someone
// leaves, sparks for a new belt. Dropped food is one of the pack's food items (art/food/).
const FX = { thunder: { w: 20, h: 28, n: 8, fps: 16 }, smoke: { w: 32, h: 32, n: 6, fps: 12 }, spark: { w: 10, h: 8, n: 7, fps: 14 },
  cut: { w: 32, h: 32, n: 4, fps: 16 }, cutx: { w: 32, h: 32, n: 4, fps: 16 }, slash: { w: 32, h: 32, n: 4, fps: 16 },
  spin: { w: 32, h: 32, n: 4, fps: 16 }, claw: { w: 32, h: 32, n: 4, fps: 16 } };
const FOOD = ["Onigiri", "Sushi", "Fish", "Noodle", "Yakitori", "FortuneCookie", "Honey", "Nut"];
const fxImgs = new Map(), foodImgs = new Map(), fxOn = [];
function foodImg(name) { return art(foodImgs, `art/food/${name}.png`, name); }
function playFx(name, x, y, scale = 1, delay = 0) { art(fxImgs, `art/fx/${name}.png`, name); fxOn.push({ name, x, y, scale, t: -delay }); }
function drawFx(dt) {
  for (const e of [...fxOn]) {
    const spec = FX[e.name];
    if (!spec) { fxOn.splice(fxOn.indexOf(e), 1); continue; }
    const f = Math.floor((e.t += dt) * spec.fps);
    if (f >= spec.n) { fxOn.splice(fxOn.indexOf(e), 1); continue; }
    const img = fxImgs.get(e.name);
    if (f < 0 || !img) continue;
    const w = spec.w * e.scale, h = spec.h * e.scale; // anchored at the bottom centre
    ctx.drawImage(img, f * spec.w, 0, spec.w, spec.h, snap(e.x - w / 2), snap(e.y - h), w, h);
  }
}

// ---------- weather: cloud shadows, storms, sunshine ----------
// Cloud shadows: blocky dark blobs (built at 1/4 size, drawn 4x without smoothing) drifting with
// the wind. A bit thicker in autumn and winter, faint at night.
const clouds = [];
let flash = 0, sunT = 0, shake = 0;
function seedClouds() {
  for (let i = 0; i < 5; i++) {
    const w = Math.round(rnd(30, 52)), h = Math.round(w * rnd(.45, .6));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const o = c.getContext("2d"); o.fillStyle = "#000";
    for (let k = 0; k < 7; k++) {
      const rx = rnd(w * .15, w * .3), ry = rnd(h * .25, h * .45);
      o.beginPath(); o.ellipse(rnd(rx, w - rx), rnd(ry, h - ry), rx, ry, 0, 0, Math.PI * 2); o.fill();
    }
    clouds.push({ c, x: rnd(-w * 4, W), y: rnd(-h * 2, H), v: rnd(7, 12) });
  }
}
function drawClouds(dt, w, night) {
  const k = (.2 + .06 * w[3] + .04 * w[2]) * (1 - night * .6);
  for (const q of clouds) {
    q.x += q.v * dt; q.y += q.v * .25 * dt;
    const cw = q.c.width * 4, ch = q.c.height * 4;
    if (q.x > W + 40 || q.y > H + 40) { q.x = -cw - rnd(0, 120); q.y = rnd(-ch, H - ch / 2); }
    // a lighter fringe a little wider than the core reads as a soft edge
    ctx.globalAlpha = k * .45; ctx.drawImage(q.c, Math.round(q.x - cw * .06), Math.round(q.y - ch * .06), Math.round(cw * 1.12), Math.round(ch * 1.12));
    ctx.globalAlpha = k * .75; ctx.drawImage(q.c, Math.round(q.x), Math.round(q.y), cw, ch);
  }
  ctx.globalAlpha = 1;
}
// A failed tool call: a short local downpour around the agent, with one lightning strike.
const storms = [];
function storm(x, y) {
  storms.push({ x, y, t: 4, drops: Array.from({ length: 70 }, () => ({ x: rnd(-80, 80), y: rnd(-150, 10), v: rnd(230, 300) })) });
  flash = 1; playFx("thunder", x, y, 2); sfx("storm", .4);
}
function drawStorms(dt) {
  for (const s of [...storms]) {
    s.t -= dt;
    if (s.t <= 0) { storms.splice(storms.indexOf(s), 1); continue; }
    const f = Math.min(1, s.t);
    ctx.fillStyle = `rgba(20,30,60,${(.22 * f).toFixed(2)})`;
    ctx.beginPath(); ctx.ellipse(s.x, s.y, 95, 60, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = f;
    for (const d of s.drops) {
      d.y += d.v * dt;
      if (d.y > 20) { d.splash = .3; d.sx = s.x + d.x; d.y = rnd(-150, -110); d.x = rnd(-80, 80); }
      if (d.splash > 0) { d.splash -= dt; drawPart("splash", 6, 4, d.sx - 3, s.y + 16, (.3 - d.splash) * 13); }
      drawPart("rain", 8, 3, s.x + d.x - d.y * .08, s.y + d.y, anim * 10 + d.x);
    }
    ctx.globalAlpha = 1;
  }
}
// After the night tint: the lightning flash, and the warm light when the main session finishes.
function drawSky(dt) {
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${(flash * .5).toFixed(2)})`; ctx.fillRect(0, 0, W, H); flash -= dt * 4; }
  if (sunT > 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(255,214,140,${(.16 * Math.min(1, sunT)).toFixed(3)})`; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    sunT -= dt;
  }
}

// ---------- things on the ground: berries and flowers ----------
const berries = [], flowers = [];
const FLOWER_C = ["#ff8fb0", "#ffd84a", "#b9a2ff", "#ffffff", "#ff9a5a"];
function dropBerry(x, y) {
  if (!onGround(x, y) && grid) {
    const c = nearestWalkable(grid, Math.floor(x / tile), Math.floor(y / tile));
    if (!c) return;
    [x, y] = [(c[0] + .5) * tile, (c[1] + .5) * tile];
  }
  berries.push({ x, y, t: 0, eater: null, food: FOOD[Math.floor(Math.random() * FOOD.length)] });
}
// Idle residents nearby notice a berry, walk over and eat it.
function feed() {
  for (const b of [...berries]) {
    b.t += 1 / 60;
    if (b.eater && (!actors.has(b.eater) || b.eater.kind !== "resident" || b.eater.exiting)) b.eater = null;
    if (!b.eater) {
      let best = null, bd = 240;
      for (const a of actors) {
        if (a.kind !== "resident" || a.exiting || a.held || a.fly || berries.some((o) => o.eater === a)) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < bd && canStand(a, b.x, b.y)) { best = a; bd = d; }
      }
      if (best && walkTo(best, b.x, b.y + 2)) { b.eater = best; best.idleT = 99; say(best, "!"); }
    } else if (Math.hypot(b.eater.x - b.x, b.eater.y - b.y) < 7) {
      emote(b.eater, "heart", 1.6); sfx("eat", .35); b.eater.hop = .7; b.eater.idleT = rnd(2, 4);
      addHearts(b.x, b.y - (b.eater.drawH || 30));
      berries.splice(berries.indexOf(b), 1);
    } else if (!b.eater.path.length) b.eater = null;
    if (b.t > 90 && !b.eater) berries.splice(berries.indexOf(b), 1);
  }
}
function plantFlower(x, y) { flowers.push({ x: Math.round(x), y: Math.round(y), t: 0, c: FLOWER_C[Math.floor(rnd(0, FLOWER_C.length))] }); }
function drawGround(dt) {
  for (const f of [...flowers]) {
    f.t += dt;
    if (f.t > 120) { flowers.splice(flowers.indexOf(f), 1); continue; }
    ctx.globalAlpha = Math.min(1, (120 - f.t) / 10);
    const g = Math.min(1, f.t); // sprouts in a second
    ctx.fillStyle = "#3f8f3a"; px(f.x, f.y - 3 * g, 1, 3 * g);
    if (g >= 1) {
      ctx.fillStyle = f.c; px(f.x - 1, f.y - 5, 1, 1); px(f.x + 1, f.y - 5, 1, 1); px(f.x, f.y - 6, 1, 1); px(f.x, f.y - 4, 1, 1);
      ctx.fillStyle = "#ffe25a"; px(f.x, f.y - 5, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
  for (const b of berries) {
    const img = foodImg(b.food), bob = Math.round(Math.sin(anim * 3 + b.x) * .6);
    ctx.fillStyle = "rgba(0,0,0,.25)"; px(b.x - 4, b.y + 1, 8, 1);
    if (img) ctx.drawImage(img, snap(b.x - 8), snap(b.y - 14 + bob), 16, 16);
  }
}
const heartList = [];
function addHearts(x, y) { for (let i = 0; i < 3; i++) heartList.push({ x: x + rnd(-8, 8), y: y + rnd(-4, 4), t: -i * .15 }); }
const HEART = [".X.X.", "XXXXX", ".XXX.", "..X.."];
function drawHearts(dt) {
  ctx.fillStyle = "#ff6f9a";
  for (const h of [...heartList]) {
    h.t += dt;
    if (h.t > 1.4) { heartList.splice(heartList.indexOf(h), 1); continue; }
    if (h.t < 0) continue;
    ctx.globalAlpha = Math.min(1, (1.4 - h.t) * 2);
    const hx = Math.round(h.x + Math.sin(h.t * 6) * 2), hy = Math.round(h.y - h.t * 22);
    HEART.forEach((row, r) => { for (let c = 0; c < 5; c++) if (row[c] === "X") ctx.fillRect(hx + c - 2, hy + r, 1, 1); });
  }
  ctx.globalAlpha = 1;
}

// ---------- belts ----------
// An agent's villager earns a green belt after BELT_AT[0] tool calls and a black one after BELT_AT[1].
const BELTS = ["White", "Green", "Black"], BELT_AT = [15, 40];
const BELT_C = { White: "#f2f2ea", Green: "#58b858", Black: "#2a2a2e" };
function maybeEvolve(a) {
  const stage = a.stage || 0;
  if (stage >= BELT_AT.length || a.tools < BELT_AT[stage]) return;
  a.stage = stage + 1; a.evoT = 2; a.jumpT = .8; sfx("belt"); // sparkles, a jump and a jingle
  if (a.stage === BELT_AT.length) summonDragon(); // a black belt brings the dragon
  for (let k = 0; k < 5; k++) playFx("spark", a.x + rnd(-12, 12), a.y - rnd(4, 22), 1, k * .12);
  say(a, `${BELTS[a.stage]} belt!`); a.bubbleT = 4;
}
function drawEvolutions() {
  for (const a of actors) {
    if (!(a.evoT > 0)) continue;
    const cy = a.y - (a.drawH || 30) / 2 - (a.fly ? a.alt : 0), r = 18 + (2 - a.evoT) * 6;
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, a.evoT).toFixed(2)})`;
    for (let k = 0; k < 8; k++) {
      const ang = anim * 3 + k * Math.PI / 4;
      px(a.x + Math.cos(ang) * r, cy + Math.sin(ang) * r * .7, 2, 2);
    }
  }
}

// ---------- pointer: pick up, drop, click for a card, double-click to hop ----------
// Press on a creature to pick it up; while held, the tiles it can't be dropped on are shaded and the
// tile under it is outlined green or red. Walkers need open ground, swimmers ground or water,
// flyers (and perched guardians) go anywhere. A bad drop puts it back where it was.
// Pressing anywhere else drags the window, as before.
let drag = null, card = null;
function toMap(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; }
function hitActor(x, y) {
  const list = [...actors].filter((a) => !a.leaving && !a.exiting && a.alpha > .5).sort((p, q) => q.y - p.y);
  for (const a of list) {
    const lift = a.fly ? a.alt : 0, hw = Math.max(10, (a.drawW || 24) / 2), top = a.y - lift - (a.drawH || 30);
    if (x >= a.x - hw && x <= a.x + hw && y >= top - 4 && y <= a.y - lift + 4) return a;
  }
  return null;
}
function canDrop(a, x, y) {
  return x > 8 && x < W - 8 && y > 8 && y < H - 8 && (a.fly || ((a.perched || canStand(a, x, y)) && isFree(x, y, radius(a), a)));
}
function extraLift(a) {
  if (a.jumpT > 0) return Math.sin((1 - a.jumpT / .8) * Math.PI) * 14; // belt jump
  let l = 0;
  if (a.held) l += 10 + Math.sin(anim * 9) * 1.5;
  if (a.hop > 0) l += Math.abs(Math.sin((1 - a.hop / .7) * Math.PI * 2)) * 12; // two little hops
  return l;
}
cv.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  if (menu) { menuClick(...toMap(e)); return; }
  const [x, y] = toMap(e), a = hitActor(x, y);
  if (!a) { card = null; TAURI?.window.getCurrentWindow().startDragging(); return; }
  try { cv.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  drag = { a, x0: a.x, y0: a.y, ox: a.x - x, oy: a.y - y, sx: x, sy: y, moving: false };
});
cv.addEventListener("pointermove", (e) => {
  const [x, y] = toMap(e);
  if (menu) { menuHover(x, y); return; }
  if (!drag) { cv.style.cursor = hitActor(x, y) ? "pointer" : "grab"; return; }
  const a = drag.a;
  if (!drag.moving) {
    if (Math.hypot(x - drag.sx, y - drag.sy) < 4) return;
    drag.moving = true; a.held = true; a.v = 0; card = null; sfx("pick", .35);
  }
  a.x = clamp(x + drag.ox, 8, W - 8); a.y = clamp(y + drag.oy, 8, H - 8);
  cv.style.cursor = "grabbing";
});
cv.addEventListener("pointerup", () => {
  if (!drag) return;
  const { a, moving } = drag;
  if (!moving) card = card === a ? null : a;
  else {
    a.held = false; a.path = []; a.v = 0;
    if (canDrop(a, a.x, a.y)) { a.anchor = [a.x, a.y]; a.idleT = rnd(2, 4); a.hop = .7; sfx("drop", .35); }
    else { a.x = drag.x0; a.y = drag.y0; say(a, "×"); sfx("nope", .35); }
  }
  drag = null; cv.style.cursor = "grab";
});
cv.addEventListener("dblclick", (e) => {
  const a = hitActor(...toMap(e));
  if (!a) return;
  a.hop = .7;
  if (a.kind === "legend") { shake = .45; say(a, a.name.toUpperCase() + "!"); sfx("roar"); }
  else { say(a, a.name + "!"); addHearts(a.x, a.y - (a.drawH || 30)); sfx("hop", .35); }
});
function drawDropOverlay() {
  if (!drag?.moving) return;
  const a = drag.a, g = a.fly || a.perched ? null : gridFor(a);
  if (g) {
    ctx.fillStyle = "rgba(20,0,10,.35)";
    for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) if (!g[y][x]) ctx.fillRect(x * tile, y * tile, tile, tile);
  }
  const ok = canDrop(a, a.x, a.y), tx = Math.floor(a.x / tile) * tile, ty = Math.floor(a.y / tile) * tile;
  ctx.strokeStyle = ok ? "#7dff8a" : "#ff5a5a"; ctx.lineWidth = 2; ctx.strokeRect(tx + 1, ty + 1, tile - 2, tile - 2);
}

// ---------- info card and done counter ----------
function mmss(ms) { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
// A villager's card: wooden frame, a parchment panel with the portrait on the left, then the
// number, name and kind, and for agents what they are doing and their belt.
const KIND_C = { character: "#c0503c", monster: "#7a5ab8", animal: "#5a9a48" };
// Cuts text to a width with an ellipsis (in the current font).
function fit(text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 1 && ctx.measureText(text + "…").width > maxW) text = text.slice(0, -1);
  return text + "…";
}
// MCP tools arrive as mcp__<server>__<tool>: show "tool (server)" instead.
function toolLabel(name) {
  if (!name) return "-";
  const m = name.match(/^mcp__(.+?)__(.+)$/);
  return m ? `${m[2]} (${m[1].replace(/^claude_?/i, "").replace(/_/g, " ")})` : name;
}
function drawCard() {
  if (card && (!actors.has(card) || card.leaving)) card = null;
  if (!card) return;
  const a = card, p = creatures.find((q) => q.dex === a.dex) || { kind: "monster" };
  const lines = [];
  let bar = null, belt = null;
  if (a.kind === "agent") {
    belt = BELTS[a.stage || 0];
    lines.push(`AGENT  ${a.role || "main"} · ${a.client || "Claude"}`, `TOOL   ${toolLabel(a.tool)}`, `CALLS  ${a.tools || 0}`, `TIME   ${mmss(performance.now() - a.since)}`);
    const st = a.stage || 0;
    if (st < BELT_AT.length) {
      const from = st ? BELT_AT[st - 1] : 0;
      bar = clamp((a.tools - from) / (BELT_AT[st] - from), 0, 1);
      lines.push(`${BELTS[st + 1].toUpperCase()} BELT IN ${BELT_AT[st] - a.tools}`);
    } else lines.push("BLACK BELT");
  } else if (a.kind === "legend") lines.push("GUARDIAN", `Watches over ${map.name}`);
  else if (a.ninja) lines.push("NINJA", "Waiting for an agent to need them");
  else lines.push("VILLAGE LOCAL", a.fly ? "Flies over the rooftops" : a.fish ? "Lives in the pond" : a.swim ? "Swims and walks" : "Wanders the village");

  const cw = 236, ch = 8 + 62 + lines.length * 12 + (bar !== null ? 10 : 0) + 14;
  const bx = Math.round(clamp(a.x - cw / 2, 4, W - cw - 4));
  let by = Math.round(a.y - (a.fly ? a.alt : 0) - (a.drawH || 16) - ch - 10);
  if (by < 4) by = Math.round(Math.min(a.y + 12, H - ch - 4));

  // the pack's dialog box, with the portrait in its faceset frame
  box(bx, by, cw, ch);
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  const sx = 8, sy = 8, sw = cw - 16;
  const frame = ui("ui/facebox"), face = portrait(a.dex);
  if (frame) ctx.drawImage(frame, bx + sx + 4, by + sy + 4);
  if (face) ctx.drawImage(face, bx + sx + 9, by + sy + 9); // 38px portrait inside the 48px frame
  // number, name, badges
  ctx.font = `8px ${FONT}`; ctx.fillStyle = "#7a6248";
  ctx.fillText(`No.${String(a.dex).padStart(3, "0")}`, bx + sx + 62, by + sy + 6);
  ctx.font = `16px ${FONT}`; ctx.fillStyle = "#2a1c12";
  ctx.fillText(fit(a.name, sw - 66), bx + sx + 62, by + sy + 16);
  let tx = bx + sx + 62;
  ctx.font = `8px ${FONT}`;
  const badges = [[a.ninja ? "NINJA" : p.kind === "boss" ? "GUARDIAN" : p.kind.toUpperCase(), KIND_C[p.kind] || "#c89a2a", "#ffffff"]];
  if (belt) badges.push([`${belt.toUpperCase()} BELT`, BELT_C[belt], belt === "White" ? "#2a1c12" : "#ffffff"]);
  for (const [label, bg, fg] of badges) {
    const w = ctx.measureText(label).width + 8;
    ctx.fillStyle = "#2a1c12"; ctx.fillRect(tx, by + sy + 39, w + 2, 13);
    ctx.fillStyle = bg; ctx.fillRect(tx + 1, by + sy + 40, w, 11);
    ctx.fillStyle = fg; ctx.textBaseline = "middle"; ctx.fillText(label, tx + 5, by + sy + 46); ctx.textBaseline = "top"; // centred in the badge
    tx += w + 5;
  }
  // details
  ctx.font = `8px ${FONT}`; ctx.fillStyle = "#3e2c1c";
  lines.forEach((l, i) => ctx.fillText(fit(l, sw - 12), bx + sx + 6, by + sy + 62 + i * 12));
  if (bar !== null) {
    const y = by + sy + 64 + lines.length * 12, w = sw - 12;
    ctx.fillStyle = "#3e2c1c"; ctx.fillRect(bx + sx + 6, y, w, 6);
    ctx.fillStyle = "#e2d0aa"; ctx.fillRect(bx + sx + 7, y + 1, w - 2, 4);
    ctx.fillStyle = BELT_C[BELTS[(a.stage || 0) + 1]] || "#58b858"; ctx.fillRect(bx + sx + 7, y + 1, Math.round((w - 2) * bar), 4);
  }
}
function drawHud() {
  const n = settings.done || 0;
  if (!n) return;
  ctx.font = `8px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  const cup = n >= 50 ? ui("items/goldcup") : n >= 10 ? ui("items/silvercup") : null; // trophies at 10 and 50
  const text = `${n} done`, tw = Math.ceil(ctx.measureText(text).width) + 20 + (cup ? 12 : 0);
  box(4, 4, tw, 22);
  if (cup) ctx.drawImage(cup, 12, 9);
  ctx.fillStyle = "#3a2a2a"; ctx.fillText(text, cup ? 24 : 12, 15);
}

// ---------- window size and right-click menu ----------
// Scaling the canvas by a whole number keeps pixels square and even; any other ratio is drawn
// smoothed when shrinking (dropping pixels looks worse) and nearest-neighbour when growing.
function renderingFor(scale) {
  const r = (window.devicePixelRatio || 1) * scale / RES;
  cv.style.imageRendering = r < 1 ? "auto" : "pixelated";
}
async function applySize() {
  renderingFor(settings.scale);
  if (!TAURI) return;
  await TAURI.window.getCurrentWindow().setSize(new TAURI.dpi.LogicalSize(Math.round(W * settings.scale), Math.round(H * settings.scale)));
}

// The right-click menu is drawn on the canvas with the pack's wood theme (panel, highlighted row,
// check boxes, radio buttons, arrow) and its pixel font, so it looks like part of the game rather
// than the system's menu. Sizes are in theme pixels; `u` map pixels each, so the menu stays about
// the same size on screen whatever the window size.
let menu = null;
const ROW = 16, SEP = 6, PAD = 6;
function themed(name) { return ui(`theme/${name}`); }
["nine_path_panel", "button_hover", "checked", "unchecked", "radio_checked", "radio_unchecked", "arrow_right"].forEach(themed); // loaded before the first menu
// A 9-slice of a theme piece: corners of c px kept, the rest stretched.
function slice(img, c, x, y, w, h) {
  if (!img) return;
  const X = [0, c, img.width - c, img.width], Y = [0, c, img.height - c, img.height];
  const DX = [x, x + c, x + w - c, x + w], DY = [y, y + c, y + h - c, y + h];
  for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) {
    ctx.drawImage(img, X[q], Y[r], X[q + 1] - X[q], Y[r + 1] - Y[r], DX[q], DY[r], DX[q + 1] - DX[q], DY[r + 1] - DY[r]);
  }
}
// ---------- connecting the agents ----------
// The app adds its hooks to ~/.claude/settings.json and ~/.codex/hooks.json itself (src-tauri
// hooks.rs): on the first run it asks, and the right-click menu's Agents entry switches each on
// or off. hookState: { claude: { installed, connected }, codex: {...} } from the Rust side.
const CLIENTS = { claude: "Claude Code", codex: "Codex" };
let hookState = {};
async function refreshHooks() { try { hookState = await TAURI.core.invoke("hook_status"); } catch { hookState = {}; } return hookState; }
async function setHooks(names, on) {
  const done = [];
  for (const n of names) {
    try { await TAURI.core.invoke("set_hooks", { clientName: n, on }); done.push(n); }
    catch (e) { dialog([{ title: `${CLIENTS[n]}: could not change its settings` }, { title: String(e).slice(0, 60) }, "-", { label: "OK", act: () => {} }]); return; }
  }
  await refreshHooks();
  if (on && done.length) {
    sfx("done", .3);
    dialog([{ title: `Connected: ${done.map((n) => CLIENTS[n]).join(" and ")}` }, { title: "New sessions will show up as ninjas." },
      ...(done.includes("codex") ? [{ title: "In Codex, open /hooks once to trust them." }] : []), "-", { label: "OK", act: () => {} }]);
  }
}
// A panel in the middle of the window (title rows are plain text).
function dialog(rows) {
  const u = Math.max(1, Math.round(1.5 / settings.scale)), p = panel(rows, 0, 0, u);
  p.x = Math.round((W - p.w * u) / 2); p.y = Math.round((H - p.h * u) / 2);
  card = null; menu = { u, main: p, sub: null };
}
// First run: offer to connect the agents that are installed and not connected yet.
async function offerHooks() {
  if (!TAURI || settings.hooksAsked) return;
  await refreshHooks();
  const open = Object.keys(CLIENTS).filter((n) => hookState[n]?.installed && !hookState[n].connected);
  settings.hooksAsked = true; saveSettings();
  if (!open.length) return;
  const files = open.map((n) => n === "claude" ? "~/.claude/settings.json" : "~/.codex/hooks.json");
  dialog([{ title: "Connect your coding agents?" }, { title: "Agent Village adds its hooks to" }, ...files.map((f) => ({ title: f })),
    { title: "(a backup is kept next to it)" }, "-",
    ...(open.length > 1 ? [{ label: "Connect both", act: () => setHooks(open, true) }] : []),
    ...open.map((n) => ({ label: `Connect ${CLIENTS[n]}`, act: () => setHooks([n], true) })),
    { label: "Not now (right-click > Agents)", act: () => {} }]);
}

// Rows: { label, radio | check: on?, sub: [rows], act() }, { title } for plain text, or "-" for a line.
function menuRows(at) {
  const radio = (label, on, act) => ({ label, radio: on, act });
  const rows = [{ label: "Map", sub: maps.map((m) => radio(m.name, m.id === map.id, async () => { await loadMap(m.id); await applySize(); })) }];
  rows.push({ label: "Drop food here", act: () => dropBerry(...at) });
  if (map.seasons.length > 1) rows.push({ label: "Season", sub: ["auto", ...map.seasons].map((s) =>
    radio(s === "auto" ? "Cycle automatically" : SEASON_LABELS[s] || s, settings.season === s, () => { settings.season = s; saveSettings(); })) });
  rows.push({ label: "Time of day", sub: TIMES.map(([h, label]) => radio(label, settings.hour === h, () => { settings.hour = h; saveSettings(); })) });
  rows.push({ label: "Size", sub: SIZES.map((z) => radio(`${z.label} (${Math.round(W * z.scale)}x${Math.round(H * z.scale)})`, settings.scale === z.scale,
    async () => { settings.scale = z.scale; saveSettings(); await applySize(); })) });
  rows.push({ label: "Sound", sub: [
    { label: "Music", check: settings.music, act: () => { settings.music = !settings.music; saveSettings(); playMusic(); } },
    { label: "Sound effects", check: settings.sounds, act: () => { settings.sounds = !settings.sounds; saveSettings(); setLoop(loops.bed, (effects[map.id] || {}).sound); } },
  ] });
  const clients = Object.keys(CLIENTS).filter((n) => hookState[n]?.installed);
  if (clients.length) rows.push({ label: "Agents", sub: clients.map((n) => ({ label: CLIENTS[n], check: hookState[n].connected,
    act: () => setHooks([n], !hookState[n].connected) })) });
  rows.push({ label: "Always on top", check: settings.onTop,
    act: async () => { settings.onTop = !settings.onTop; saveSettings(); await TAURI?.window.getCurrentWindow().setAlwaysOnTop(settings.onTop); } });
  rows.push({ label: "Minimize", act: () => TAURI?.window.getCurrentWindow().minimize() });
  rows.push("-", { label: "Quit Agent Village", act: () => TAURI?.window.getCurrentWindow().close() }); // last window closing ends the app
  return rows;
}
// Lays a list of rows out as a panel near (x, y) (map pixels), kept inside the window.
function panel(rows, x, y, u, flipFrom) {
  ctx.font = `8px ${FONT}`;
  const tw = Math.max(...rows.map((r) => r === "-" ? 0 : Math.ceil(ctx.measureText(r.label ?? r.title).width) - (r.title ? 18 : 0)));
  const w = PAD * 2 + 18 + tw + 4 + (rows.some((r) => r.sub) ? 14 : 0);
  const h = PAD * 2 + rows.reduce((n, r) => n + (r === "-" ? SEP : ROW), 0);
  if (x + w * u > W - 2) x = flipFrom != null ? flipFrom - w * u : W - 2 - w * u; // submenus open to the left near the edge
  return { rows, w, h, x: Math.round(Math.max(2, x)), y: Math.round(clamp(y, 2, Math.max(2, H - 2 - h * u))), hover: -1 };
}
// The row index under map point (x, y) in panel p, or -1.
function rowAt(p, x, y) {
  const lx = (x - p.x) / menu.u, ly = (y - p.y) / menu.u;
  if (lx < 0 || lx > p.w || ly < 0 || ly > p.h) return -1;
  let top = PAD;
  for (let i = 0; i < p.rows.length; i++) {
    const r = p.rows[i], rh = r === "-" ? SEP : ROW;
    if (ly >= top && ly < top + rh) return r === "-" || r.title ? -1 : i;
    top += rh;
  }
  return -1;
}
function rowTop(p, i) { return PAD + p.rows.slice(0, i).reduce((n, r) => n + (r === "-" ? SEP : ROW), 0); }
async function openMenu(ev) {
  ev.preventDefault();
  if (!maps.length || !map) return;
  if (TAURI) await refreshHooks();
  const at = toMap(ev), u = Math.max(1, Math.round(1.5 / settings.scale));
  card = null;
  menu = { u, main: null, sub: null };
  menu.main = panel(menuRows(at), at[0], at[1], u);
  sfx("pick", .2);
}
function closeMenu() { menu = null; cv.style.cursor = "grab"; }
function menuHover(x, y) {
  const { main, sub } = menu;
  if (sub) { sub.hover = rowAt(sub, x, y); if (sub.hover >= 0 || rowAt(main, x, y) === main.subOf) { cv.style.cursor = "pointer"; return; } }
  const i = rowAt(main, x, y);
  main.hover = i;
  cv.style.cursor = i >= 0 ? "pointer" : "default";
  if (i < 0) return;
  if (main.rows[i].sub && main.subOf !== i) { // open the submenu beside its row
    main.subOf = i;
    menu.sub = panel(main.rows[i].sub, main.x + (main.w - 3) * menu.u, main.y + (rowTop(main, i) - PAD) * menu.u, menu.u, main.x + 3 * menu.u);
  } else if (!main.rows[i].sub) { main.subOf = -1; menu.sub = null; }
}
function menuClick(x, y) {
  const { main, sub } = menu;
  const si = sub ? rowAt(sub, x, y) : -1, mi = rowAt(main, x, y);
  const row = si >= 0 ? sub.rows[si] : mi >= 0 ? main.rows[mi] : null;
  if (!row) { closeMenu(); return; } // a click outside closes it
  if (row.sub) { menuHover(x, y); return; }
  closeMenu(); sfx("drop", .25);
  row.act();
}
function drawPanel(p) {
  const u = menu.u;
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(u, u);
  slice(themed("nine_path_panel"), 6, 0, 0, p.w, p.h);
  ctx.font = `8px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  let top = PAD;
  p.rows.forEach((r, i) => {
    if (r === "-") { ctx.fillStyle = "#9b513c"; ctx.fillRect(PAD + 2, top + 2, p.w - PAD * 2 - 4, 1); ctx.fillStyle = "#ffad55"; ctx.fillRect(PAD + 2, top + 3, p.w - PAD * 2 - 4, 1); top += SEP; return; }
    if (r.title) { ctx.fillStyle = "#3a1f12"; ctx.fillText(r.title, PAD + 2, top + ROW / 2 + 1); top += ROW; return; }
    const lit = i === p.hover || i === p.subOf;
    if (lit) slice(themed("button_hover"), 3, PAD - 2, top, p.w - PAD * 2 + 4, ROW);
    const icon = r.radio != null ? (r.radio ? "radio_checked" : "radio_unchecked") : r.check != null ? (r.check ? "checked" : "unchecked") : null;
    if (icon && themed(icon)) ctx.drawImage(themed(icon), PAD, top);
    ctx.fillStyle = lit ? "#131b1b" : "#3a1f12";
    ctx.fillText(r.label, PAD + 18, top + ROW / 2 + 1);
    if (r.sub && themed("arrow_right")) ctx.drawImage(themed("arrow_right"), p.w - PAD - 15, top);
    top += ROW;
  });
  ctx.restore();
}
function drawMenu() {
  if (!menu) return;
  drawPanel(menu.main);
  if (menu.sub) drawPanel(menu.sub);
}
cv.addEventListener("contextmenu", openMenu);
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && menu) closeMenu(); });
window.addEventListener("blur", () => { if (menu) closeMenu(); });

// Subscribe before the map loads: hooks can fire while the PNGs are still decoding,
// and Tauri drops events nobody is listening for. onEvent only touches actor state.
TAURI?.event.listen("agent-event", (e) => onEvent(e.payload));
window.agentVillage = { onEvent, loadMap, populate, settings, actors, dropBerry, summonDragon }; // handy for poking from devtools

(async function () {
  maps = await (await fetch("maps.json")).json();
  grids = await (await fetch("collision.json")).json();
  try { waters = await (await fetch("water.json")).json(); } catch { waters = {}; }
  try { effects = await (await fetch("effects.json")).json(); } catch { effects = {}; }
  creatures = (await (await fetch("creatures.json")).json()).map((c) => ({ ...c, dex: c.id }));
  await loadMap(settings.mapId);
  ready = true;
  populate(true);
  for (const e of pending.splice(0)) onEvent(e);
  await applySize();
  if (TAURI && !settings.onTop) await TAURI.window.getCurrentWindow().setAlwaysOnTop(false); // tauri.conf.json starts it on top
  seed(); seedClouds();
  requestAnimationFrame(frame);
  offerHooks();
})();
