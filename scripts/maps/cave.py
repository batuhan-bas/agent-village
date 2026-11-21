"""Deep Cave: an underground cavern reached by a mine tunnel in the north wall. A miners' camp,
an ancient rune hall, a brazier forge, a mining workshop with ore carts, a crystal field and a
dark pool with a scrying orb, ringed by rock and darkness.

Art rects are (tx, ty, w, h) in tiles of the named tileset, as in village.py."""

import random

NAME = "Deep Cave"
SEASONS = ["day"]
FLOOR = {"day": "mud"}
WATER = {"day": "swamp"}
TYPES = ["rock"]
GUARDIAN = "GiantSlime"
MUSIC = "2 - The Cave.ogg"

COLS, ROWS = 40, 36
DARK = ("TilesetHole", (1, 1))                       # the unlit rock beyond the walls
COBBLE = [(12, 13), (12, 13), (12, 13), (17, 14)]    # dark flagstones, Interior/TilesetInteriorFloor
GROUND = [(11, 19)] * 12 + [(12, 19), (13, 19), (14, 19)]  # TilesetFloor, the mud block's plain earth
COBBLE_SHEET = "Backgrounds/Tilesets/Interior/TilesetInteriorFloor.png"
BOULDERS = [(15, 14, 2, 2), (15, 16, 2, 2), (16, 8, 2, 2)]   # TilesetNature grey rocks
BIG_ROCK, TALL_ROCK, ROCK_PILE = (17, 14, 4, 3), (21, 14, 2, 3), (16, 5, 4, 3)
STALAGMITE = (6, 12, 1, 1)
PEBBLES = [(17, 17, 1, 1), (18, 17, 1, 1), (19, 17, 1, 1), (18, 9, 1, 1)]
CRYSTALS = [(0, 14), (1, 14), (2, 14), (3, 14)]      # TilesetNature, 1x1
GEMS = [(0, 15), (1, 15), (2, 15), (3, 15)]
ORE = [(4, 14), (5, 14), (6, 14), (4, 16), (5, 16), (6, 16)]


def dark(m, x0, y0, x1, y1):
    m.fill(x0, y0, x1, y1, DARK[0], DARK[1])
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            m.block(x, y)


def rock(m, art, x, y):
    m.stamp("TilesetNature", art, x, y, block="all")


def torch(m, x, y):
    """A lit brazier on a stone pedestal (TilesetDungeon)."""
    m.stamp("TilesetDungeon", (2, 2, 1, 1), x, y, block="all")


def lantern(m, x, y):
    """A lantern on a post, two tiles tall (tileset_camp)."""
    m.stamp("tileset_camp", (6, 5, 1, 2), x, y, block="bottom")


def layout(m):
    rnd = random.Random(11)

    # --- the rock ring: unlit rock at the edges, boulders piled along its inner side
    dark(m, 0, 0, 39, 2)
    dark(m, 0, 0, 2, 35)
    dark(m, 37, 0, 39, 35)
    dark(m, 0, 33, 39, 35)
    for x in range(0, 39, 2):
        if not 18 <= x <= 22:      # the tunnel mouth
            rock(m, rnd.choice(BOULDERS), x, 2)
        rock(m, rnd.choice(BOULDERS), x, 33)
    for y in range(3, 33, 2):
        rock(m, rnd.choice(BOULDERS), 1, y)
        rock(m, rnd.choice(BOULDERS), 37, y)
    # outcrops: bigger rocks jutting out of the walls
    rock(m, TALL_ROCK, 3, 11)
    rock(m, TALL_ROCK, 35, 26)
    rock(m, BIG_ROCK, 15, 30)
    rock(m, BIG_ROCK, 24, 3)
    rock(m, ROCK_PILE, 33, 12)
    rock(m, TALL_ROCK, 3, 24)
    for x, y in [(3, 4), (35, 4), (3, 31), (35, 31), (12, 4), (29, 4), (3, 15), (36, 20), (24, 32),
                 (3, 27), (36, 16), (19, 32)]:
        rock(m, rnd.choice(PEBBLES), x, y)

    # --- paths
    m.path(20, 4, 22, 6)      # under the tunnel mouth
    m.path(20, 4, 21, 30)     # north-south road
    m.path(4, 17, 35, 18)     # east-west road
    m.path(16, 15, 25, 20)    # the central cavern
    m.path(7, 9, 8, 17)       # camp
    m.path(30, 10, 31, 17)    # rune hall
    m.path(7, 18, 8, 23)      # forge
    m.path(31, 18, 32, 23)    # workshop
    m.path(8, 18, 9, 29)      # crystal field
    m.path(21, 27, 22, 30)    # pool altar
    m.path(9, 28, 20, 29)

    # --- web: the mine tunnel, the way in from the surface
    m.stamp("TilesetReliefDetail", (0, 7, 3, 3), 20, 1, block="all")
    m.station("web", 21 * 16 + 8, 4 * 16 + 8)
    torch(m, 19, 4)
    torch(m, 23, 4)

    # --- home: the miners' camp, a tent, bedrolls and a fire ring
    m.stamp("tileset_camp", (7, 0, 3, 3), 6, 6, block="all")
    m.station("home", 7 * 16 + 8, 9 * 16 + 8)
    m.stamp("tileset_camp", (8, 5, 2, 2), 10, 7, block="all")
    m.stamp("tileset_camp", (12, 5, 2, 2), 10, 9, block="all")
    m.stamp("tileset_camp", (4, 5, 1, 1), 5, 7, block="all")
    m.stamp("tileset_camp", (4, 8, 1, 1), 5, 8, block="all")
    lantern(m, 9, 9)

    # --- read: the rune hall, ancient tablets on old flagstones
    m.fill(26, 5, 35, 11, COBBLE_SHEET, COBBLE)
    for x, art in [(27, (4, 2, 1, 1)), (29, (0, 5, 1, 2)), (32, (1, 5, 1, 2)), (34, (4, 2, 1, 1))]:
        m.stamp("TilesetElement", art, x, 7 - (art[3] - 1), block=[(0, art[3] - 1)])
    m.stamp("TilesetElement", (2, 6, 1, 1), 30, 7, block="all")
    m.stamp("TilesetElement", (2, 6, 1, 1), 31, 7, block="all")
    m.station("read", 31 * 16, 9 * 16)
    torch(m, 26, 9)
    torch(m, 35, 9)

    # --- bash: the forge, a fire ring between braziers and the kiln
    m.stamp("tileset_camp", (10, 3, 2, 2), 7, 20, block="all")
    m.stamp("TilesetElement", (12, 0, 1, 1), 5, 20, block="all")
    torch(m, 5, 21)
    torch(m, 10, 21)
    m.stamp("TilesetElement", (4, 1, 1, 1), 10, 20, block="all")   # cauldron
    m.station("bash", 8 * 16, 22 * 16 + 8)

    # --- edit: the mining workshop, a workbench, ore carts and ore
    m.stamp("TilesetElement", (2, 10, 3, 1), 30, 21, block="all")
    m.stamp("TilesetElement", (2, 3, 2, 2), 34, 20, block="all")
    m.stamp("TilesetElement", (0, 3, 2, 2), 27, 20, block="all")
    m.stamp("TilesetElement", (3, 1, 1, 1), 33, 22, block="all")
    rock(m, (7, 14, 2, 2), 34, 23)
    m.station("edit", 31 * 16 + 8, 22 * 16 + 8)

    # --- search: the crystal field
    for y in range(25, 32):
        for x in range(4, 16):
            if (x, y) in m.paths or (x, y) in m.blocked:
                continue
            r = rnd.random()
            if r < 0.22:
                m.stamp("TilesetNature", (*rnd.choice(CRYSTALS), 1, 1), x, y, block="all")
            elif r < 0.27:
                m.stamp("TilesetNature", (*rnd.choice(GEMS), 1, 1), x, y, block="all")
            elif r < 0.31:
                m.stamp("TilesetNature", (*rnd.choice(ORE), 1, 1), x, y, block="all")
    m.station("search", 9 * 16, 28 * 16 + 8)

    # --- agent: the dark pool and its scrying orb
    m.pond(25, 26, 34, 31)
    m.pond(27, 24, 32, 27)
    m.fill(21, 24, 24, 26, COBBLE_SHEET, COBBLE)
    m.stamp("TilesetDungeon", (3, 2, 1, 1), 23, 25, block="all")
    torch(m, 21, 24)
    torch(m, 24, 24)
    m.station("agent", 22 * 16 + 8, 26 * 16 + 8)

    # --- a chasm, rocks, bones and pebbles to make it a cave
    for dx in range(5):            # TilesetHole: left edge, middle, right edge columns
        for dy in range(3):
            m.stamp("TilesetHole", (0 if dx == 0 else 2 if dx == 4 else 1, dy, 1, 1), 11 + dx, 11 + dy, block="all")
    m.stamp("TilesetNature", ROCK_PILE, 13, 5, block="base")
    rock(m, BIG_ROCK, 26, 13)
    rock(m, TALL_ROCK, 13, 21)
    rock(m, (16, 8, 2, 2), 25, 8)
    for x, y in [(4, 5), (15, 9), (24, 11), (35, 14), (18, 23), (27, 18), (4, 13), (12, 16)]:
        if (x, y) not in m.blocked and (x, y) not in m.paths:
            rock(m, rnd.choice(PEBBLES), x, y)
    for x, y, art in [(16, 22, (13, 0)), (11, 14, (14, 0)), (25, 21, (14, 0)), (33, 15, (13, 0)),
                      (5, 15, (14, 0)), (17, 8, (15, 0)), (23, 9, (0, 1))]:
        if (x, y) not in m.blocked:
            m.stamp("TilesetFloorDetail", (*art, 1, 1), x, y)
    for x, y in [(4, 9), (10, 15), (14, 15), (24, 7), (18, 7), (27, 16), (12, 24), (17, 25),
                 (26, 22), (35, 23), (23, 31), (5, 18 + 2), (35, 19)]:
        if (x, y) not in m.blocked and (x, y) not in m.paths:
            rock(m, STALAGMITE, x, y)
    for x, y in [(4, 33 - 1), (10, 4), (31, 4), (36, 9), (16, 26), (25, 32)]:
        if (x, y) not in m.blocked and (x, y) not in m.paths:
            rock(m, (*rnd.choice(CRYSTALS), 1, 1), x, y)
    for x, y in [(17, 14), (24, 14), (15, 20), (26, 20)]:
        lantern(m, x, y - 1)
    m.perch(14 * 16, 6 * 16)
    m.perch(28 * 16, 13 * 16 + 8)

    # the earth floor everywhere else (the builder's own tufts for the mud block include an empty tile)
    for y in range(ROWS):
        for x in range(COLS):
            if (x, y) not in m.fills and (x, y) not in m.paths and (x, y) not in m.water:
                m.fill(x, y, x, y, "TilesetFloor", GROUND)
