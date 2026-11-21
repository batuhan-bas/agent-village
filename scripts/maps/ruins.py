"""Old Ruins: an abandoned village. A mossy temple behind a plaza of stone statues, a ruined
library with toppled bookshelves, an old forge with its furnace, a half-collapsed workshop and
a rubble field among the graves, all reached through a broken stone arch in the south. Mossy
trees go bare in autumn and carry snow in winter, when the tombstones and the dry well stand in the snow.

Tile coordinates are (x, y) in 16px tiles; art rects are (tx, ty, w, h) in tiles of the named
tileset (Backgrounds/Tilesets/<name>.png)."""
import random

NAME = "Old Ruins"
SEASONS = ["spring", "summer", "autumn", "winter"]
FLOOR = {"spring": "dark_green", "summer": "green", "autumn": "mud", "winter": "snow"}
TYPES = ["rock"]
GUARDIAN = "GiantRedSamurai"
MUSIC = "30 - Ruins.ogg"

VA = "TilesetVillageAbandoned"
NAT = "TilesetNature"
HOUSE = "TilesetHouse"

# 4x3 trees: mossy, bare in autumn, snowy in winter
BIG_TREE = {"spring": (VA, 0, 6), "summer": (VA, 0, 9), "autumn": (NAT, 0, 5), "winter": (NAT, 4, 5)}
AUTUMN_TREE = (9, 18, 3, 3)      # TilesetNature, orange; every other big tree in autumn
# 2x2 trees
SMALL_TREE = {"spring": (VA, 4, 6), "summer": (VA, 4, 9), "autumn": (NAT, 4, 0), "winter": (NAT, 12, 0)}
DEAD_TREE = (4, 0, 2, 2)         # TilesetNature, all year
DEAD_CLUSTER = (0, 5, 4, 3)      # TilesetNature
ROCKS = (16, 5, 4, 3)            # TilesetNature, grey rock pile
ROCK = (16, 8, 2, 2)
PEBBLES = [(18, 9, 1, 1), (17, 17, 1, 1), (18, 17, 1, 1), (19, 17, 1, 1)]
BOULDER = (17, 14, 4, 3)
BOULDER_SMALL = (15, 14, 2, 2)
BOULDER_TALL = (21, 14, 2, 3)
STUMP = (0, 8, 2, 2)
FLAGSTONES = [(6, 3), (7, 3), (8, 3), (9, 3), (10, 3), (6, 4), (7, 4), (8, 4), (9, 4), (10, 4)]  # VA decals
BUSHES = [(4, 5), (5, 5)]        # VA mossy bushes


def big_tree(m, x, y):
    s, tx, ty = BIG_TREE[m.season]
    src = (tx, ty, 4, 3)
    if m.season == "autumn" and (x + y) % 8 < 4:
        s, src = NAT, AUTUMN_TREE
    m.stamp(s, src, x, y, block=[(1, 1), (2, 1), (0, 2), (1, 2), (2, 2), (3, 2)])


def small_tree(m, x, y):
    s, tx, ty = SMALL_TREE[m.season]
    m.stamp(s, (tx, ty, 2, 2), x, y, block="bottom")


def dead_tree(m, x, y):
    m.stamp(NAT, DEAD_TREE, x, y, block="bottom")


def dead_cluster(m, x, y):
    m.stamp(NAT, DEAD_CLUSTER, x, y, block=[(1, 1), (2, 1), (0, 2), (1, 2), (2, 2), (3, 2)])


# The builder's random ground tufts only exist in the green block; paint the others ourselves.
GROUND = {"dark_green": (11, 12), "mud": (11, 19)}


def ground(m):
    """Plain ground with a few tufts over every cell that isn't path (after all m.path calls)."""
    if FLOOR[m.season] not in GROUND:
        return
    bx, by = GROUND[FLOOR[m.season]]
    tiles = [(bx, by)] * 14 + [(bx + i, by) for i in (1, 2, 3) for _ in range(2)]
    for y in range(m.rows):
        for x in range(m.cols):
            if (x, y) not in m.paths and (x, y) not in m.fills:
                m.fill(x, y, x, y, "TilesetFloor", tiles)


def decal(m, x, y, rnd):
    m.stamp(VA, (*rnd.choice(FLAGSTONES), 1, 1), x, y, layer=-1)


def layout(m):
    rnd = random.Random(11)

    # -- roads --------------------------------------------------------------------------------
    m.path(19, 9, 20, 35)     # the old high street, from the arch up to the temple plaza
    m.path(5, 20, 20, 21)     # cross street, its two halves no longer quite lined up
    m.path(19, 21, 34, 22)
    m.path(16, 9, 23, 12)     # statue plaza
    m.path(7, 10, 8, 19)      # library lane
    m.path(30, 10, 31, 21)    # to the hut
    m.path(5, 22, 6, 27)      # forge
    m.path(31, 23, 32, 27)    # workshop
    m.path(12, 22, 13, 25)    # rubble field
    m.path(11, 25, 15, 27)
    m.path(21, 15, 26, 16)    # the dry well's yard
    ground(m)

    # -- the temple and its statue plaza (agent) ----------------------------------------------
    m.stamp(VA, (12, 6, 4, 5), 18, 3, block="all")
    m.station("agent", 19 * 16 + 8, 8 * 16 + 8)                      # door is the left of centre
    m.stamp(HOUSE, (1, 19, 2, 3), 14, 7, block="base")                # one-eyed giant statue
    m.stamp(HOUSE, (3, 19, 2, 2), 16, 13, block="bottom")             # orb statue
    m.stamp(HOUSE, (5, 19, 2, 2), 22, 13, block="bottom")             # monk statue
    m.stamp(HOUSE, (0, 19, 1, 3), 16, 6, block="bottom")              # pillars
    m.stamp(HOUSE, (0, 19, 1, 3), 23, 6, block="bottom")
    m.stamp(HOUSE, (7, 19, 1, 2), 24, 10, block="bottom")             # small statue
    m.stamp(VA, (0, 3, 2, 2), 25, 7, block="bottom")                  # mossy seated statue
    m.stamp(VA, (2, 3, 1, 3), 13, 11, block="bottom")                 # broken column
    for x, y in [(17, 10), (21, 11), (18, 12), (22, 9), (16, 11)]:
        decal(m, x, y, rnd)

    # -- library (read): a mossy house, its shelves spilled outside ---------------------------
    m.building("read", VA, (11, 3, 3, 3), 6, 7)
    m.stamp(VA, (18, 10, 2, 2), 9, 8, block="bottom")                 # toppled bookshelves
    m.stamp(VA, (11, 6, 1, 2), 4, 8, block="bottom")                  # overgrowth

    # -- the hut (home) ------------------------------------------------------------------------
    m.building("home", VA, (16, 5, 4, 5), 29, 4)
    m.stamp(VA, (17, 3, 3, 2), 33, 8, block="bottom")                 # crumbled wall

    # -- old forge (bash) -----------------------------------------------------------------------
    m.stamp(VA, (4, 0, 4, 3), 4, 25, block="all")
    m.station("bash", 5 * 16 + 8, 28 * 16 + 8)
    m.stamp(HOUSE, (29, 13, 2, 2), 8, 26, block="all")               # stone furnace
    m.stamp(HOUSE, (29, 15, 1, 1), 7, 28, block="all")               # anvil

    # -- half-collapsed workshop (edit) ---------------------------------------------------------
    m.building("edit", VA, (11, 0, 3, 3), 31, 25)
    m.stamp(VA, (17, 0, 3, 3), 34, 25, block="bottom")               # fallen roof
    m.stamp(HOUSE, (31, 17, 1, 2), 30, 26, block="bottom")           # stacked planks
    m.stamp(HOUSE, (31, 16, 2, 1), 34, 28, block="all")

    # -- rubble field among the graves (search) -------------------------------------------------
    m.station("search", 13 * 16, 27 * 16)
    m.stamp(VA, (8, 0, 3, 3), 10, 28, block="base")                  # grave wall with a cross
    m.stamp(VA, (14, 5, 2, 1), 15, 28, block="all")                  # broken wall
    m.stamp(VA, (9, 5, 2, 2), 16, 24, block="bottom")                # frog statue
    m.stamp(VA, (7, 5, 2, 2), 9, 23, layer=-1)                       # big flagstone
    for x, y in [(11, 24), (14, 24), (10, 26), (16, 26), (14, 23), (12, 28), (15, 27)]:
        decal(m, x, y, rnd)
    for (tx, ty, w, h), (x, y) in zip(PEBBLES, [(10, 25), (16, 23), (14, 29), (17, 27)]):
        m.stamp(NAT, (tx, ty, w, h), x, y, block="all")

    for (tx, ty), (x, y) in zip([(4, 2), (5, 2), (3, 2), (4, 2), (5, 2)],
                                [(14, 30), (16, 30), (18, 31), (15, 32), (17, 32)]):
        m.stamp("TilesetElement", (tx, ty, 1, 1), x, y, block="all")   # tombstones

    # -- the dry well -------------------------------------------------------------------------------
    m.stamp("TilesetElement", (6, 1, 1, 1), 25, 14, block="all")
    m.stamp(VA, (14, 5, 2, 1), 27, 14, block="all")                  # broken wall
    for x, y in [(24, 14), (27, 16), (23, 17), (26, 17)]:
        decal(m, x, y, rnd)

    # -- south gate (web): a broken stone arch over the road -----------------------------------
    m.stamp(HOUSE, (29, 20, 3, 3), 19, 32, block=[(0, 1), (0, 2), (2, 1), (2, 2)])
    m.station("web", 20 * 16 + 8, 34 * 16 + 8)

    # -- the edge: trees, dead trees and rocks, open at the gate --------------------------------
    for i, x in enumerate(range(-1, 40, 4)):
        (big_tree if i % 3 != 1 else dead_cluster)(m, x, -1)
    for i, x in enumerate([-1, 3, 7, 11, 23, 27, 31, 35]):
        (big_tree if i % 3 != 2 else dead_cluster)(m, x, 33)
    m.stamp(NAT, BOULDER_SMALL, 15, 33, block="all")
    m.stamp(NAT, ROCK, 23, 34, block="all")
    for i, y in enumerate(range(2, 33, 3)):
        (big_tree if i % 4 != 2 else dead_cluster)(m, -2, y)
        (big_tree if i % 4 != 0 else dead_cluster)(m, 38, y)

    # -- scattered scenery ----------------------------------------------------------------------
    m.stamp(NAT, ROCKS, 33, 14, block=[(0, 2), (1, 2), (2, 2), (3, 2), (1, 1), (2, 1)])
    m.stamp(NAT, BOULDER, 24, 28, block="base")
    m.stamp(NAT, BOULDER_TALL, 3, 15, block="base")
    m.stamp(NAT, STUMP, 27, 11, block="bottom")
    m.stamp(VA, (7, 8, 2, 4), 12, 2, block=[(0, 2), (1, 2), (0, 3), (1, 3)])  # hollow stump
    m.stamp(VA, (9, 9, 3, 2), 25, 25, block="bottom")                # log fence
    m.stamp(VA, (17, 3, 3, 2), 9, 13, block="bottom")                # crumbled walls
    m.stamp(VA, (14, 5, 2, 1), 34, 12, block="all")
    m.stamp(VA, (14, 5, 2, 1), 2, 18, block="all")
    for x, y in [(3, 4), (26, 19), (21, 29)]:
        dead_tree(m, x, y)
    for x, y in [(11, 15), (35, 2), (2, 30), (27, 30)]:
        small_tree(m, x, y)
    for x, y in [(13, 17), (35, 18)]:
        big_tree(m, x, y)
    for x, y in [(4, 11), (24, 19), (17, 16), (9, 18), (28, 24), (3, 22), (22, 25), (36, 23), (10, 2)]:
        art = rnd.choice(BUSHES)
        if m.season == "winter":
            m.stamp(NAT, (13, 12, 1, 1), x, y)                       # a snow-covered bush
        else:
            m.stamp(VA, (*art, 1, 1), x, y)
    for x, y in [(4, 18), (28, 19), (22, 23), (34, 30), (6, 31), (26, 7)]:
        decal(m, x, y, rnd)
