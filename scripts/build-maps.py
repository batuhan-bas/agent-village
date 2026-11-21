#!/usr/bin/env python3
"""Builds the Agent Village maps from the Ninja Adventure tilesets (pixel-boy, CC0).

    python3 scripts/build-maps.py <path to "Ninja Adventure - Asset Pack"> [map id ...]

Each map is described by scripts/maps/<id>.py (see village.py for a full example). For every
season it lists, this writes src/maps/<id>/<season>.png and <season>-mask.png (red = open water,
for glints), winter-ice.png when the water freezes, and src/maps/<id>/meta.json (name, seasons,
stations, guardian, walk and water grids). With no ids given it builds every map. Then run
scripts/index-maps.py to gather the meta files into src/maps.json, collision.json and water.json.
Needs Pillow.

A map module defines:
  NAME, SEASONS (["spring", "summer", "autumn", "winter"] or e.g. ["day"]), and optionally
  COLS / ROWS (default 40 x 36 tiles of 16px), TYPES (["rock"] stops orange pixels counting as
  leaves for the wind), GUARDIAN (a boss folder name), MUSIC (a file name in Audio/Musics),
  FLOOR  {season: floor block}    one of FLOOR_BLOCKS below; the ground and the paths
  WATER  {season: water set}      one of WATER_SETS below, or None for no water that season
  def layout(m): ...              draws the map onto m (a Builder), see its methods.
"""
import importlib.util
import json
import random
import sys
from pathlib import Path

from PIL import Image

T = 16
ROOT = Path(__file__).resolve().parent.parent
BITS = ["top_left_corner", "top_side", "top_right_corner", "left_side", "right_side",
        "bottom_left_corner", "bottom_side", "bottom_right_corner"]
NEIGHBOURS = [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)]

# TilesetFloor holds several ground palettes with the same 11 x 7 layout. The matching rules
# (scripts/floor-terrain.json) are written for the green one at column 0, row 7; each block is
# that layout moved to another origin. "plain" is the plain fill tile inside a block.
FLOOR_BLOCKS = {
    "sand": (0, 0), "pink_sand": (11, 0), "green": (0, 7), "dark_green": (11, 7),
    "snow": (0, 14), "mud": (11, 14),
}
# TilesetWater: the same layout again, one row higher than the floor, around different shores.
WATER_SETS = {"grass": (0, -1), "sand": (0, -7), "ice": (13, -7), "swamp": (13, -1)}


class Builder:
    """What a map's layout() draws with. Coordinates are in tiles; (0, 0) is the top left."""

    def __init__(self, cols, rows, season, sheets):
        self.cols, self.rows, self.season, self.sheets = cols, rows, season, sheets
        self.paths, self.water = set(), set()
        self.objects = []      # (sort row, sheet, src rect, x, y)
        self.fills = {}        # (x, y) -> (sheet, tx, ty): ground tiles that replace the floor
        self.blocked = set()
        self.stations = {}
        self.perches = []
        self.flowing = set()   # cells whose water runs (waterfalls, streams): green in the mask
        self.anims = []        # animated pieces the app draws on top: {name, x, y (px), seasons?}

    def rect(self, cells, x0, y0, x1, y1):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                cells.add((x, y))

    def path(self, x0, y0, x1, y1):
        """A dirt (or sand, snow...) path rectangle, inclusive; overlapping rectangles join up."""
        self.rect(self.paths, x0, y0, x1, y1)

    def pond(self, x0, y0, x1, y1):
        """Water, inclusive. Blocked for walkers; swimmers and fish use it."""
        self.rect(self.water, x0, y0, x1, y1)

    def fill(self, x0, y0, x1, y1, sheet, tiles):
        """Paints ground tiles over the floor. tiles: one (tx, ty) or a list to pick from at random."""
        tiles = tiles if isinstance(tiles, list) else [tiles]
        rnd = random.Random(x0 * 131 + y0)
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.fills[(x, y)] = (sheet, *rnd.choice(tiles))

    def stamp(self, sheet, src, x, y, block=None, layer=None):
        """Draws src = (tx, ty, w, h) tiles from a sheet with its top left at (x, y).
        block: "all", "bottom" (the lowest row), "base" (lowest two rows), a list of (dx, dy)
        cells, or None. Objects are drawn back to front by their bottom row (or `layer`)."""
        tx, ty, w, h = src
        self.objects.append((layer if layer is not None else y + h, sheet, src, x, y))
        cells = []
        if block == "all":
            cells = [(dx, dy) for dy in range(h) for dx in range(w)]
        elif block == "bottom":
            cells = [(dx, h - 1) for dx in range(w)]
        elif block == "base":
            cells = [(dx, dy) for dy in range(max(0, h - 2), h) for dx in range(w)]
        elif block:
            cells = block
        for dx, dy in cells:
            self.block(x + dx, y + dy)

    def building(self, role, sheet, src, x, y):
        """A building: blocked, and if role is set the station sits just outside its door."""
        self.stamp(sheet, src, x, y, block="all")
        if role:
            self.station(role, (x + src[2] / 2) * T, (y + src[3]) * T + 8)

    def block(self, x, y):
        self.blocked.add((x, y))

    def station(self, role, px, py):
        """A station in map pixels: home, read, bash, edit, search, web (the entrance) or agent."""
        self.stations[role] = [round(px), round(py)]

    def anim(self, name, x, y, seasons=None):
        """An animated piece at tile (x, y), drawn by the app: flag-red / flag-blue / flag-yellow /
        flag-white (16px), plant (16px), watermill (34x36), mill (a 64px windmill propeller),
        waterfall-top / -middle / -bottom (16px). seasons: only in these seasons."""
        self.anims.append({"name": name, "x": x * T, "y": y * T, **({"seasons": seasons} if seasons else {})})

    def perch(self, px, py):
        """Where a flying guardian sits, in map pixels."""
        self.perches.append([round(px), round(py)])


def load_module(path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def build(pack: Path, mid: str):
    mod = load_module(ROOT / "scripts" / "maps" / f"{mid}.py")
    cols, rows = getattr(mod, "COLS", 40), getattr(mod, "ROWS", 36)
    tiles = pack / "Backgrounds" / "Tilesets"
    sheets = {}

    def sheet(name):
        if name not in sheets:
            p = tiles / f"{name}.png"
            if not p.exists():
                p = pack / name  # a path inside the pack, e.g. "Backgrounds/Tilesets/Interior/..."
            sheets[name] = Image.open(p).convert("RGBA")
        return sheets[name]

    rules = {tuple(map(int, k.split(","))): v for k, v in json.loads((ROOT / "scripts/floor-terrain.json").read_text()).items()}

    def cut(img, tx, ty, w=1, h=1):
        return img.crop((tx * T, ty * T, (tx + w) * T, (ty + h) * T))

    def opaque(img, tx, ty):
        if tx < 0 or ty < 0 or (tx + 1) * T > img.width or (ty + 1) * T > img.height:
            return False
        return img.crop((tx * T, ty * T, tx * T + T, ty * T + T)).getbbox() is not None

    def pick(cells, x, y, rnd, ok=lambda k: True):
        """The tile (in green-block coordinates) for cell (x, y), matched on its eight neighbours."""
        want = [1 if (x + dx, y + dy) in cells else 0 for dx, dy in NEIGHBOURS]
        for i, (a, b) in {0: (1, 3), 2: (1, 4), 5: (3, 6), 7: (4, 6)}.items():  # a corner counts only
            if not (want[a] and want[b]):                                        # when both sides do
                want[i] = 0
        best, score = [], 99
        for k, r in rules.items():
            if r["t"] != 1 or not ok(k):
                continue
            s = sum(r.get(b, 0) != v for b, v in zip(BITS, want))
            if s < score:
                best, score = [k], s
            elif s == score:
                best.append(k)
        return rnd.choice(best)

    out = ROOT / "src" / "maps" / mid
    out.mkdir(parents=True, exist_ok=True)
    meta = None
    for season in mod.SEASONS:
        m = Builder(cols, rows, season, sheet)
        mod.layout(m)
        rnd = random.Random(7)
        img = Image.new("RGBA", (cols * T, rows * T))
        mask = Image.new("RGB", img.size)
        floor = sheet("TilesetFloor")
        bx, by = FLOOR_BLOCKS[mod.FLOOR[season]]
        plain = mod.FLOOR[season] != "green"  # only the green block has its tufts where the rules expect them
        for y in range(rows):
            for x in range(cols):
                if (x, y) in m.fills:
                    s, tx, ty = m.fills[(x, y)]
                    img.alpha_composite(cut(sheet(s), tx, ty), (x * T, y * T))
                    continue
                if (x, y) in m.paths:
                    fx, fy = pick(m.paths, x, y, rnd)
                else:  # mostly plain with a few tufts (snow has no matching tufts)
                    fx, fy = rnd.choices([(0, 12), (1, 12), (2, 12), (3, 12), (2, 11), (3, 11)], [14, 2, 2, 2, 1, 1])[0]
                    if plain:
                        fx, fy = 0, 12
                img.alpha_composite(cut(floor, fx + bx, fy - 7 + by), (x * T, y * T))
        wset = getattr(mod, "WATER", {}).get(season)
        if m.water and wset:
            water_img = sheet("TilesetWater")
            ox, oy = WATER_SETS[wset]
            for x, y in sorted(m.water):
                fx, fy = pick(m.water, x, y, rnd, lambda k: opaque(water_img, k[0] + ox, k[1] + oy))
                img.alpha_composite(cut(water_img, fx + ox, fy + oy), (x * T, y * T))
                if wset != "ice":
                    mask.paste((255, 0, 0), (x * T, y * T, x * T + T, y * T + T))
        for x, y in m.flowing:
            mask.paste((0, 255, 0), (x * T, y * T, x * T + T, y * T + T))
        for _, s, (tx, ty, w, h), x, y in sorted(m.objects, key=lambda o: o[0]):
            img.alpha_composite(cut(sheet(s), tx, ty, w, h), (x * T, y * T))
        img.save(out / f"{season}.png")
        mask.save(out / f"{season}-mask.png")
        if wset == "ice":
            ice = Image.new("L", img.size)
            for x, y in m.water:
                ice.paste(255, (x * T, y * T, x * T + T, y * T + T))
            ice.save(out / f"{season}-ice.png")
        if meta is None:  # grids and stations come from the first season; layouts don't move
            walk = [[0 if (x, y) in m.blocked or (x, y) in m.water else 1 for x in range(cols)] for y in range(rows)]
            water = [[1 if (x, y) in m.water else 0 for x in range(cols)] for y in range(rows)]
            missing = {"home", "read", "bash", "edit", "search", "web", "agent"} - set(m.stations)
            if missing:
                raise SystemExit(f"{mid}: no station for {sorted(missing)}")
            meta = {"id": mid, "name": mod.NAME, "width": cols * T, "height": rows * T, "seasons": mod.SEASONS,
                    "types": getattr(mod, "TYPES", []), "guardian": getattr(mod, "GUARDIAN", None),
                    "music": getattr(mod, "MUSIC", None), "perches": m.perches, "stations": m.stations, "anims": m.anims,
                    "walk": walk, "water": water}
    (out / "meta.json").write_text(json.dumps(meta))
    print(f"{mid}: {', '.join(mod.SEASONS)}; stations {meta['stations']}")


def main():
    pack = Path(sys.argv[1])
    ids = sys.argv[2:] or sorted(p.stem for p in (ROOT / "scripts" / "maps").glob("*.py"))
    for mid in ids:
        build(pack, mid)


if __name__ == "__main__":
    main()
