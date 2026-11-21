"""Agent Village: the home map. A dojo, library, blacksmith, workshop, two homes and a shop
around a square, a torii gate at the west entrance, a pond and a flower garden, ringed by trees
that blossom in spring, turn orange in autumn and carry snow in winter.

A worked example for scripts/build-maps.py: tile coordinates are (x, y) in 16px tiles, art
rects are (tx, ty, w, h) in tiles of the named tileset (Backgrounds/Tilesets/<name>.png)."""

NAME = "Agent Village"
SEASONS = ["spring", "summer", "autumn", "winter"]
FLOOR = {"spring": "green", "summer": "green", "autumn": "green", "winter": "snow"}
WATER = {"spring": "grass", "summer": "grass", "autumn": "grass", "winter": "ice"}
GUARDIAN = "GiantSpirit"
MUSIC = "33 - Calm Village.ogg"

# TilesetNature art for each season
BIG_TREE = {"spring": (0, 18), "summer": (3, 18), "autumn": (9, 18), "winter": (6, 18)}    # 3x3
SMALL_TREE = {"spring": (14, 0), "summer": (16, 0), "autumn": (18, 0), "winter": (12, 0)}  # 2x2
PINE = {"spring": (2, 0), "summer": (2, 0), "autumn": (2, 0), "winter": (8, 0)}            # 2x2
FLOWERS = [(0, 11), (1, 11), (3, 11), (6, 11)]
BUSH = {"spring": (0, 10), "summer": (0, 10), "autumn": (0, 10), "winter": (13, 12)}


def big_tree(m, x, y):
    m.stamp("TilesetNature", (*BIG_TREE[m.season], 3, 3), x, y, block=[(0, 1), (1, 1), (2, 1), (1, 2)])


def small_tree(m, x, y, art):
    m.stamp("TilesetNature", (*art[m.season], 2, 2), x, y, block="bottom")


def layout(m):
    m.path(0, 17, 39, 18)    # main road, west (torii) to east
    m.path(19, 6, 20, 33)    # north-south road from the dojo
    m.path(16, 15, 23, 20)   # village square
    m.path(7, 11, 8, 16)     # library
    m.path(30, 11, 31, 16)   # blacksmith
    m.path(29, 19, 30, 21)   # workshop
    m.path(9, 19, 10, 21)    # homes
    m.path(14, 19, 15, 21)
    m.path(4, 19, 5, 24)     # garden
    m.pond(25, 27, 34, 32)

    m.building("agent", "TilesetHouse", (12, 0, 4, 3), 18, 3)   # dojo
    m.building("read", "TilesetHouse", (4, 0, 4, 3), 6, 8)      # library
    m.building("bash", "TilesetHouse", (23, 0, 3, 3), 29, 8)    # blacksmith
    m.building("edit", "TilesetHouse", (29, 0, 4, 3), 28, 22)   # workshop
    m.building(None, "TilesetHouse", (0, 0, 4, 3), 8, 22)       # homes
    m.building(None, "TilesetHouse", (8, 0, 4, 3), 13, 22)
    m.building(None, "TilesetHouse", (16, 0, 3, 3), 24, 8)      # shop
    m.stamp("TilesetHouse", (0, 5, 3, 2), 1, 17, block=[(0, 1), (2, 1)])  # torii over the road
    m.station("home", 12 * 16, 20 * 16 + 8)
    m.station("search", 5 * 16 + 8, 25 * 16 + 8)
    m.station("web", 2 * 16 + 8, 18 * 16 + 8)                   # between the torii legs
    # flags over the dojo and the shop, a watermill on the pond, plants by the homes
    m.anim("flag-red", 18, 2); m.anim("flag-red", 21, 2); m.anim("flag-blue", 25, 7)
    m.anim("watermill", 34, 26)
    green = ["spring", "summer", "autumn"]
    for x, y in [(7, 25), (12, 25), (17, 23), (26, 20), (33, 20), (3, 14), (36, 9)]:
        m.anim("plant", x, y, green)
    m.perch(14 * 16, 14 * 16)                                    # the guardian's spot, by the library road

    for x in range(0, 40, 3):  # a ring of big trees, with gaps for the road
        if not 16 <= x <= 22:
            big_tree(m, x, -1)
        big_tree(m, x, 33)
    for y in range(2, 33, 3):
        if not 13 <= y <= 19:
            big_tree(m, -1, y)
            big_tree(m, 37, y)
    for x, y in [(12, 4), (2, 8), (34, 22), (22, 25), (2, 29)]:
        big_tree(m, x, y)
    for x, y in [(15, 9), (11, 13), (26, 13), (35, 14), (24, 22), (17, 25), (11, 28), (36, 26), (8, 31)]:
        small_tree(m, x, y, SMALL_TREE)
    for x, y in [(3, 4), (26, 4), (34, 4), (16, 29), (22, 30)]:
        small_tree(m, x, y, PINE)

    # the flower garden (search station): bushes and flowers, just bushes under the snow
    import random
    rnd = random.Random(3)
    for y in range(26, 32):
        for x in range(2, 8):
            if (x + y) % 2 == 0:
                art = BUSH[m.season] if (x * 3 + y) % 4 == 0 or m.season == "winter" else rnd.choice(FLOWERS)
                m.stamp("TilesetNature", (*art, 1, 1), x, y)
