"""Bamboo Marsh: a bamboo grove around a purple swamp. A mossy temple (agent) to the north,
a moss-grown reading hut (read) and homes either side of it, a kiln and fire pit (bash) to the
east, a stilt workshop (edit) to the south-east and a plank pier with lily pads (search) out
into the swamp. Newcomers walk in under a torii on the south edge (web).

Art comes from TilesetNature (bamboo, rocks, reeds, trees), TilesetVillageAbandoned (the mossy
buildings, statues and trees), TilesetHouse (kiln, torii, statues), tileset_camp (fire pit,
logs, scroll post) and TilesetWater (pier planks)."""
import random

NAME = "Bamboo Marsh"
SEASONS = ["spring", "summer", "autumn", "winter"]
FLOOR = {"spring": "green", "summer": "green", "autumn": "green", "winter": "snow"}
WATER = {"spring": "swamp", "summer": "swamp", "autumn": "swamp", "winter": "ice"}
GUARDIAN = "GiantFrog"
MUSIC = "13 - Mystical.ogg"

N, VA, H, C = "TilesetNature", "TilesetVillageAbandoned", "TilesetHouse", "tileset_camp"
BAMBOO = (11, 8, 1, 3)                  # a tall stalk
SHOOTS = [(12, 9, 1, 1), (12, 10, 1, 1)]  # short stalks
BIG_TREE = {"spring": (0, 18), "summer": (3, 18), "autumn": (9, 18), "winter": (6, 18)}    # 3x3
SMALL_TREE = {"spring": (14, 0), "summer": (16, 0), "autumn": (18, 0), "winter": (12, 0)}  # 2x2
REED = {"spring": (4, 10), "summer": (5, 10), "autumn": (8, 10), "winter": (9, 13)}
PLANTS = {"spring": [(0, 2), (1, 2), (5, 2), (6, 2)], "summer": [(0, 2), (2, 2), (3, 2), (7, 2)],
          "autumn": [(4, 0), (5, 0), (1, 0), (6, 0)], "winter": [(0, 3), (1, 3), (3, 3), (6, 3)]}
SMALL_ROCK = {"spring": [(17, 17), (18, 17), (19, 17)], "summer": [(17, 17), (18, 17), (19, 17)],
              "autumn": [(17, 17), (18, 17), (19, 17)], "winter": [(4, 12), (5, 12)]}
LILY = (13, 11)
PIER = [(12, 19, 17, 20)]


def bamboo(m, x, y, block="bottom"):
    m.stamp(N, BAMBOO, x, y, block=block)


def clump(m, x, y, rnd, n=5):
    """A bamboo clump: tall stalks staggered over a few cells with shoots at the foot."""
    spots = [(0, 0), (1, 1), (2, 0), (1, -1), (3, 1), (0, 2), (2, 2), (4, 0)][:n]
    for dx, dy in spots:
        bamboo(m, x + dx, y + dy)
    for dx in (-1, n // 2 + 1):
        if rnd.random() < 0.7:
            m.stamp(N, rnd.choice(SHOOTS), x + dx, y + 2, block="all")


def layout(m):
    rnd = random.Random(11)
    s = m.season

    # --- paths --------------------------------------------------------------------------
    m.path(19, 7, 20, 35)    # the south road from the torii up to the temple
    m.path(7, 8, 32, 9)      # the north lane: reading hut, temple, home
    m.path(7, 7, 8, 7)
    m.path(30, 7, 32, 7)
    m.path(19, 17, 33, 18)   # east to the kiln
    m.path(17, 19, 20, 20)   # onto the pier
    m.path(19, 28, 31, 29)   # south-east to the workshop

    # --- the swamp ----------------------------------------------------------------------
    for r in [(6, 12, 15, 25), (4, 15, 6, 23), (9, 11, 13, 12), (15, 14, 17, 22),
              (8, 26, 14, 27), (3, 18, 4, 21), (16, 16, 17, 18)]:
        m.pond(*r)
    pier = set()
    for x0, y0, x1, y1 in PIER:
        m.rect(pier, x0, y0, x1, y1)
    m.water -= pier
    for x in range(12, 18):
        m.fill(x, 19, x, 19, "TilesetWater", (0, 12) if x == 12 else (1, 12))
        m.fill(x, 20, x, 20, "TilesetWater", (0, 14) if x == 12 else (1, 14))
    m.station("search", 13 * 16 + 8, 19 * 16 + 8)
    if s != "winter":
        for x, y in [(8, 14), (10, 13), (13, 15), (7, 18), (9, 21), (14, 23), (11, 24),
                     (5, 20), (16, 15), (12, 22), (10, 26), (8, 16)]:
            m.stamp(N, (*LILY, 1, 1), x, y)
    for x, y in [(5, 13), (3, 16), (2, 19), (5, 24), (7, 28), (15, 26), (18, 22), (18, 14),
                 (14, 11), (8, 10), (16, 25), (3, 22)]:   # reeds along the shore
        m.stamp(N, (*REED[s], 1, 1), x, y, block="all")

    # --- buildings and stations -----------------------------------------------------------
    m.building("agent", VA, (12, 6, 4, 5), 18, 2)        # the mossy temple
    m.stamp(H, (3, 19, 2, 2), 15, 5, block="bottom")     # buddha statues flank it
    m.stamp(H, (3, 19, 2, 2), 23, 5, block="bottom")
    m.building("read", VA, (11, 0, 3, 3), 6, 4)          # the reading hut
    m.stamp(C, (7, 5, 1, 2), 9, 5, block="bottom")       # its scroll post
    m.building("home", VA, (11, 3, 3, 3), 30, 4)         # home, and the big mossy hut beside it
    m.stamp(VA, (16, 5, 4, 5), 33, 2, block=[(dx, dy) for dy in range(2, 5) for dx in range(4)])
    m.stamp(H, (29, 4, 3, 4), 31, 13, block="base")      # the kiln
    m.station("bash", 32 * 16 + 8, 17 * 16 + 8)
    m.stamp(C, (10, 3, 2, 2), 28, 14, block="all")       # fire pit and spit
    m.stamp(C, (8, 3, 2, 2), 25, 14, block="all")
    m.stamp(C, (0, 7, 3, 1), 27, 20, block="all")        # log bench
    m.stamp(VA, (14, 0, 3, 5), 29, 23, block=[(0, 3), (1, 3), (2, 3), (0, 4), (2, 4)])  # stilt workshop
    m.station("edit", 30 * 16 + 8, 28 * 16 + 8)
    m.stamp(C, (0, 1, 1, 2), 33, 26, block="all")        # timber stacked by the workshop
    m.stamp(C, (3, 7, 1, 1), 27, 26, block="all")
    m.stamp(VA, (17, 0, 3, 3), 24, 22, block="bottom")   # an open stilt pavilion
    m.stamp(H, (0, 5, 3, 2), 18, 32, block=[(0, 1), (2, 1)])  # the torii on the south edge
    m.station("web", 19 * 16 + 8, 33 * 16 + 8)
    m.stamp(VA, (9, 5, 2, 2), 23, 10, block="bottom")    # frog shrine in the clearing
    m.stamp(VA, (9, 7, 2, 2), 21, 21, block="bottom")    # a small moss shrine by the water
    m.stamp(VA, (2, 3, 1, 2), 17, 32, block="bottom")    # mossy pillars by the torii
    m.stamp(VA, (3, 3, 1, 2), 21, 32, block="bottom")
    m.perch(20 * 16, 3 * 16)
    m.perch(35 * 16, 2 * 16)

    # --- rocks, trees and plants ---------------------------------------------------------
    m.stamp(N, (17, 14, 4, 3), 34, 20, block="base")
    m.stamp(N, (15, 14, 2, 2), 3, 27, block="bottom")
    m.stamp(N, (21, 14, 2, 3), 35, 30, block="bottom")
    m.stamp(VA, (7, 5, 2, 2), 24, 32, block="bottom")
    m.stamp(VA, (0, 3, 2, 2), 2, 9, block="bottom")
    m.stamp(VA, (7, 8, 2, 3), 11, 30, block="base")      # an old stump
    for x, y in [(26, 11), (16, 29), (3, 13), (36, 16), (23, 26), (9, 31), (28, 31)]:
        m.stamp(N, (*rnd.choice(SMALL_ROCK[s]), 1, 1), x, y, block="all")
    for x, y in [(25, 3), (2, 30), (16, 10)]:
        m.stamp(N, (*BIG_TREE[s], 3, 3), x, y, block=[(0, 1), (1, 1), (2, 1), (1, 2)])
    for x, y in [(36, 24), (26, 5), (4, 4), (14, 31), (31, 32)]:
        m.stamp(N, (*SMALL_TREE[s], 2, 2), x, y, block="bottom")
    for _ in range(60):
        x, y = rnd.randrange(2, 38), rnd.randrange(2, 33)
        if all(not (x + dx, y + dy) in m.paths | m.water | m.blocked | pier
               for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
            m.stamp("TilesetFloorDetail", (*rnd.choice(PLANTS[s]), 1, 1), x, y)

    # bamboo clumps inside the grove
    for x, y in [(2, 5), (11, 3), (22, 15), (34, 9), (3, 31), (26, 30), (35, 27), (12, 28),
                 (27, 24)]:
        clump(m, x, y, rnd, n=rnd.choice([3, 4, 5]))

    # --- the bamboo ring -------------------------------------------------------------------
    for x in range(40):
        bamboo(m, x, -1, block="all")
        if rnd.random() < 0.6:
            bamboo(m, x, 0, block="all")
        if not 17 <= x <= 21:
            bamboo(m, x, 33, block="all")
            if rnd.random() < 0.6:
                bamboo(m, x, 32, block="all")
    for y in range(0, 34, 1):
        for x in (0, 39):
            bamboo(m, x, y - 1, block="all")
        if rnd.random() < 0.5:
            bamboo(m, 1, y - 1, block="bottom")
        if rnd.random() < 0.5:
            bamboo(m, 38, y - 1, block="bottom")
