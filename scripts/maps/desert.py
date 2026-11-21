"""Sand Camp: a desert camp around an oasis. A chieftain's hall (agent) looks over a plaza with a
well; a scribe's tent (read), a domed home, a cooking fire (bash), a crafting tent (edit) and a
bazaar (search) sit along two sandy roads; the camp is entered through a gate in the south.
Ringed by sandstone boulders, dead trees and palms. Autumn turns the sand pink and the palms
dark; winter brings snow and freezes the oasis."""

import random

NAME = "Sand Camp"
SEASONS = ["spring", "summer", "autumn", "winter"]
FLOOR = {"spring": "sand", "summer": "sand", "autumn": "pink_sand", "winter": "snow"}
WATER = {"spring": "sand", "summer": "sand", "autumn": "sand", "winter": "ice"}
TYPES = ["rock"]
GUARDIAN = "GiantRacoonGold"
MUSIC = "23 - Road.ogg"

D, C, N, FD = "TilesetDesert", "tileset_camp", "TilesetNature", "TilesetFloorDetail"

PALM = {"spring": (10, 10), "summer": (10, 10), "autumn": (12, 10), "winter": (12, 10)}  # 2x2
BIG_ROCK = (17, 10, 4, 3)
TALL_ROCK = (21, 10, 2, 3)
ROCK_A = (15, 10, 2, 2)
ROCK_B = (15, 12, 2, 2)
PEBBLES = [(17, 13), (18, 13), (19, 13)]   # 1x1 sandstone rocks (Nature)
CACTUS = [(12, 9), (12, 10)]                # 1x1 round cacti (Nature)
SPROUT = [(14, 10), (14, 11)]               # 1x1 desert shrubs (Desert)
DEAD_TREE = (4, 0, 2, 2)                    # Nature
GROUND = {"spring": (0, 0), "summer": (0, 0), "autumn": (11, 0), "winter": (0, 14)}  # FLOOR block origins
# ground details (FloorDetail), drawn under everything, never blocking
DETAIL = {
    "spring": [(0, 2), (1, 2), (2, 2), (5, 2), (5, 2), (3, 0), (14, 0), (6, 0)],
    "summer": [(3, 0), (6, 0), (7, 0), (14, 0), (13, 0), (2, 2), (0, 0)],
    "autumn": [(3, 0), (6, 0), (7, 0), (14, 0), (13, 0), (1, 0), (0, 0)],
    "winter": [(0, 3), (1, 3), (2, 3), (3, 3), (14, 0)],
}


def palm(m, x, y):
    m.stamp(D, (*PALM[m.season], 2, 2), x, y, block="bottom")


def one(m, sheet, art, x, y, block="all"):
    m.stamp(sheet, (*art, 1, 1), x, y, block=block)


def layout(m):
    # roads: main road from the south gate up to the hall, an east-west road, a southern lane
    m.path(17, 6, 18, 35)
    m.path(4, 18, 37, 19)
    m.path(5, 27, 34, 28)
    m.path(13, 15, 24, 21)    # plaza
    m.path(6, 14, 7, 17)      # scribe's tent
    m.path(10, 8, 11, 17)     # home
    m.path(29, 16, 30, 17)    # cooking fire
    m.path(36, 17, 37, 18)    # watchtower door
    m.pond(24, 5, 32, 9)      # the oasis, rounded off with a second rectangle
    m.pond(26, 3, 31, 10)

    # buildings
    m.stamp(D, (10, 0, 6, 4), 16, 3, block=[(dx, dy) for dy in range(3) for dx in range(6)] + [(3, 3), (4, 3), (5, 3)])
    m.station("agent", 17.5 * 16, 6.5 * 16)                  # chieftain's hall, door in the notch
    m.building("home", D, (0, 0, 3, 3), 9, 5)                # domed house
    m.building("read", C, (4, 0, 3, 3), 5, 11)               # scribe's tent
    m.building("edit", C, (7, 0, 3, 3), 7, 24)               # crafting tent
    m.building(None, D, (16, 0, 4, 4), 12, 23)               # houses on the lane
    m.building(None, D, (6, 3, 4, 4), 29, 23)
    m.building(None, D, (6, 0, 4, 3), 3, 4)
    m.building(None, D, (14, 4, 3, 6), 35, 12)               # watchtower
    m.building(None, C, (10, 0, 3, 3), 32, 29)               # an old torn tent

    # bash: the cooking fire with a spit, a fire ring and log seats
    m.stamp(C, (8, 3, 2, 2), 29, 14, block="all")
    m.station("bash", 30 * 16, 16 * 16 + 8)
    m.stamp(C, (12, 5, 2, 2), 32, 14, block="all")
    m.stamp(C, (0, 0, 2, 1), 26, 15, block="all")
    m.stamp(C, (0, 7, 3, 1), 28, 12, block="all")
    for x, y, art in [(33, 16, (6, 7)), (34, 16, (7, 7)), (26, 13, (4, 4)), (32, 12, (6, 3))]:
        one(m, C, art, x, y)

    # search: the bazaar, two stalls with baskets and crates
    m.stamp(D, (2, 10, 2, 2), 22, 25, block="all")
    m.stamp(D, (4, 10, 2, 2), 25, 25, block="all")
    m.station("search", 24 * 16 + 8, 27 * 16 + 8)
    for x, y, sheet, art in [(21, 26, D, (6, 11)), (27, 26, D, (7, 11)), (20, 25, C, (4, 5)),
                             (27, 24, C, (5, 5)), (21, 24, C, (7, 7))]:
        one(m, sheet, art, x, y)

    # read: scrolls and books by the scribe's tent, a rug to read on
    m.stamp(C, (0, 3, 1, 2), 4, 12, block="all")
    m.stamp(C, (1, 3, 2, 2), 8, 12, block="base")
    one(m, C, (7, 8), 8, 14, block=None)
    m.stamp(C, (10, 5, 2, 2), 3, 15, layer=0)

    # edit: the crafting tent's workbench, tub, planks and crates
    m.stamp(C, (1, 5, 2, 2), 4, 24, block="all")
    m.stamp(C, (4, 6, 2, 2), 10, 24, block="all")
    m.stamp(C, (0, 5, 1, 2), 6, 24, block="all")
    for x, y, art in [(4, 26, (4, 5)), (5, 26, (4, 8)), (10, 26, (3, 7))]:
        one(m, C, art, x, y)

    # plaza: the well, the lion fountain by the hall, lanterns
    m.stamp(D, (0, 3, 2, 2), 21, 16, block="all")
    m.stamp(D, (0, 6, 2, 2), 14, 4, block="all")
    m.stamp(C, (6, 5, 1, 2), 15, 14, block="bottom")
    m.stamp(C, (6, 5, 1, 2), 20, 14, block="bottom")
    m.stamp(D, (0, 9, 2, 3), 22, 20, block="all")             # sphinx

    # the south gate: two pillars over the road and a sign
    m.stamp(D, (2, 3, 1, 2), 16, 32, block="bottom")
    m.stamp(D, (2, 3, 1, 2), 19, 32, block="bottom")
    m.stamp(C, (7, 5, 1, 2), 21, 31, block="bottom")
    m.station("web", 18 * 16, 34 * 16 + 8)

    # around the oasis
    for x, y in [(22, 7), (33, 3), (33, 8), (24, 10), (32, 10), (23, 3)]:
        palm(m, x, y)
    one(m, D, SPROUT[0], 34, 6)
    one(m, D, SPROUT[1], 23, 10)
    one(m, N, CACTUS[0], 32, 2)

    # inside the camp: a few palms, cacti, rocks and dead trees
    for x, y in [(25, 19), (2, 21), (14, 9), (34, 21), (8, 20)]:
        palm(m, x, y)
    for i, (x, y) in enumerate([(5, 9), (15, 12), (27, 21), (12, 30), (25, 32), (3, 29), (36, 25), (23, 12)]):
        one(m, N, CACTUS[i % 2], x, y)
    for i, (x, y) in enumerate([(13, 20), (31, 21), (9, 21), (6, 31), (28, 31), (36, 10)]):
        one(m, D, SPROUT[i % 2], x, y)
    for i, (x, y) in enumerate([(13, 11), (24, 23), (35, 20), (5, 22), (14, 33), (22, 33)]):
        one(m, N, PEBBLES[i % 3], x, y)
    m.stamp(N, ROCK_A, 6, 30, block="all")
    m.stamp(N, DEAD_TREE, 20, 10, block="bottom")
    m.stamp(N, DEAD_TREE, 2, 25, block="bottom")

    # the ring: boulders, dead trees and palms round the edge, open at the south gate
    ring(m)

    # the open ground. The builder's random tufts include two cells that are empty in the sand
    # blocks, so paint the ground here: mostly plain with a few tufts.
    bx, by = GROUND[m.season]
    tiles = [(bx, by + 5)] * 16 + [(bx + 1, by + 5), (bx + 2, by + 5), (bx + 3, by + 5)]
    for y in range(m.rows):
        for x in range(m.cols):
            if (x, y) not in m.paths and (x, y) not in m.water:
                m.fill(x, y, x, y, "TilesetFloor", tiles)

    # ground details on open sand
    rnd = random.Random(11)
    taken = m.blocked | m.paths | m.water
    for _ in range(70):
        x, y = rnd.randrange(3, 37), rnd.randrange(3, 33)
        if all((x + dx, y + dy) not in taken for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
            m.stamp(FD, (*rnd.choice(DETAIL[m.season]), 1, 1), x, y, layer=0)
            taken.add((x, y))


def ring(m):
    big = lambda x, y: m.stamp(N, BIG_ROCK, x, y, block="all")
    tall = lambda x, y: m.stamp(N, TALL_ROCK, x, y, block="all")
    rock_a = lambda x, y: m.stamp(N, ROCK_A, x, y, block="all")
    rock_b = lambda x, y: m.stamp(N, ROCK_B, x, y, block="all")
    dead = lambda x, y: m.stamp(N, DEAD_TREE, x, y, block="bottom")
    p = lambda x, y: palm(m, x, y)
    # top edge
    for f, x, y in [(big, 0, -1), (dead, 4, 0), (tall, 6, -1), (rock_a, 8, 0), (p, 10, 0), (big, 12, -1),
                    (dead, 16, 0), (rock_b, 18, 0), (p, 20, 0), (tall, 22, -1), (rock_a, 24, 0),
                    (p, 26, 0), (big, 28, -1), (dead, 32, 0), (tall, 34, -1), (big, 36, -1)]:
        f(x, y)
    # left edge
    for f, x, y in [(rock_b, 0, 2), (p, 0, 4), (tall, -1, 6), (dead, 0, 9), (rock_a, 0, 11), (big, -2, 13),
                    (p, 0, 16), (rock_b, 0, 18), (tall, -1, 20), (dead, 0, 23), (big, -2, 25),
                    (p, 0, 28), (rock_a, 0, 30)]:
        f(x, y)
    # right edge
    for f, x, y in [(rock_a, 38, 2), (p, 38, 4), (tall, 38, 6), (dead, 38, 9), (rock_b, 38, 11),
                    (p, 38, 13), (tall, 38, 15), (rock_a, 38, 18), (big, 37, 20), (p, 38, 23),
                    (dead, 38, 25), (tall, 38, 27), (rock_b, 38, 30)]:
        f(x, y)
    # bottom edge, open between x 15 and 20
    for f, x, y in [(big, -1, 33), (dead, 3, 34), (rock_a, 5, 34), (tall, 7, 34), (p, 9, 34),
                    (big, 11, 33), (rock_b, 21, 34), (p, 23, 34), (tall, 25, 33), (big, 27, 33),
                    (dead, 31, 34), (rock_a, 33, 34), (big, 35, 33)]:
        f(x, y)
