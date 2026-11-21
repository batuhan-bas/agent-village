#!/usr/bin/env python3
"""Copies the Ninja Adventure actors (pixel-boy, CC0) the app uses into src/art/ and writes
src/creatures.json; also copies the effect strips (art/fx/) and the food you can drop (art/food/).

    python3 scripts/import-actors.py <path to "Ninja Adventure - Asset Pack">

Characters and monsters are 16px sheets with one column per facing (down, up, left, right) and
one row per walk frame; animals are side-on strips of 2 frames facing right. Each gets an id,
a readable name, its kind and how it moves:
  fly   floats over everything (bats, butterflies, owls, spirits, lanterns, the parrot)
  swim  walks and swims (axolotls, kappas, frogs)
  fish  never leaves the water
Needs Pillow.
"""
import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FLY = re.compile(r"Bat|Butterfly|Owl|Eye|Spirit|Lantern|Parrot")
SWIM = re.compile(r"Axolot|Kappa|Frog")
FISH = re.compile(r"Fish|Octopus")
SKIP = re.compile(r"Pig|Boar")  # left out of the village on purpose
# Names of our own instead of the pack's numbered ones: every ninja gets a name that fits its look,
# and the "2"s and "3"s among the others become a word.
NAMES = {
    "Ninja Blue": "Aoi", "Ninja Blue2": "Sora", "Ninja Bomb": "Bakuro", "Ninja Dark": "Kuro",
    "Ninja Eskimo": "Yuki", "Ninja Fire": "Homura", "Ninja Gray": "Haiiro", "Ninja Green": "Midori",
    "Ninja Leaf": "Konoha", "Ninja Mage Black": "Yami", "Ninja Mage Orange": "Taiyo", "Ninja Masked": "Kage",
    "Ninja Red": "Akane", "Ninja Red2": "Kurenai", "Ninja Thunder": "Raiden", "Ninja Water": "Mizuki",
    "Ninja Yellow": "Hikari", "Red Ninja3": "Kenji",
    "Dog2": "Pup", "Lion Cub 2": "Little Lion",
    "Demon Cyclop": "Red Cyclops", "Demon Cyclop2": "Green Cyclops", "Giant Bamboo2": "Fire Bamboo",
    "Giant Frog2": "Giant Red Frog", "Giant Slime2": "Giant Green Slime",
}
FOOD = ["Onigiri", "Sushi", "Fish", "Noodle", "Yakitori", "FortuneCookie", "Honey", "Nut"]


def strip_frames(path):
    """(frames, width, height) of a one-row animation strip. Frames are separated by empty
    columns, so count the runs of drawn ones (some frames are twice as wide as they are tall);
    if that doesn't divide the width, guess square frames."""
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    alpha = img.getchannel("A")
    cols = [alpha.crop((x, 0, x + 1, h)).getbbox() is not None for x in range(w)]
    runs = sum(1 for x in range(w) if cols[x] and (x == 0 or not cols[x - 1]))
    frames = runs if runs and w % runs == 0 else min((n for n in range(1, 20) if w % n == 0), key=lambda n: abs(w / n - h))
    return frames, w, h


def pretty(name: str) -> str:
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", name).replace("_", " ").strip().title()


def main():
    pack = Path(sys.argv[1]) / "Actor"
    out = ROOT / "src" / "art"
    if out.exists():
        shutil.rmtree(out)
    (out / "actors").mkdir(parents=True)
    shutil.copy(pack.parent / "LICENSE.txt", out / "LICENSE.txt")
    creatures = []
    for kind, folder in [("character", "Character"), ("monster", "Monster"), ("animal", "Animal")]:
        for d in sorted(p for p in (pack / folder).iterdir() if p.is_dir()):
            if SKIP.search(d.name):
                continue
            sheets = sorted(d.glob("SpriteSheet*.png")) or [p for p in d.glob("*.png") if "Faceset" not in p.name]
            for sheet in sheets:
                variant = sheet.stem.replace("SpriteSheet", "") if sheet.stem.startswith("SpriteSheet") else ""
                face = d / f"Faceset{variant}.png"
                if not face.exists():
                    face = d / "Faceset.png"
                if not face.exists():
                    continue
                w, h = Image.open(sheet).size
                if kind != "animal" and (w != 64 or h < 32):
                    continue  # not a 4-direction sheet
                cid = len(creatures) + 1
                name = pretty(d.name + (" " + variant if variant else ""))
                name = NAMES.get(name, name)
                shutil.copy(sheet, out / "actors" / f"{cid}.png")
                shutil.copy(face, out / "actors" / f"{cid}-face.png")
                c = {"id": cid, "name": name, "kind": kind}
                if kind == "animal":
                    c["frames"] = 2
                    c["w"], c["h"] = w // 2, h
                else:
                    c["frames"] = min(4, h // 16)
                    # extra poses: attack and jump face 4 ways (one 16px frame each), item and dead face the viewer
                    sep = d / "SeparateAnim"
                    poses = [n for n in ("Attack", "Jump", "Item", "Dead") if (sep / f"{n}.png").exists()]
                    for n in poses:
                        shutil.copy(sep / f"{n}.png", out / "actors" / f"{cid}-{n.lower()}.png")
                    if poses:
                        c["poses"] = [n.lower() for n in poses]
                key = d.name
                if kind == "character" and "Ninja" in key:
                    c["ninja"] = True  # agents are always ninjas
                if FLY.search(key):
                    c["fly"] = True
                elif FISH.search(key):
                    c["fish"] = True
                elif SWIM.search(key):
                    c["swim"] = True
                creatures.append(c)
    # Bosses become map guardians: they stand still and play their idle strip (square-ish frames
    # in one row). The dragons are drawn in separate parts, so they're left out.
    for d in sorted(p for p in (pack / "Boss").iterdir() if p.is_dir()):
        idle = next((p for p in sorted(d.glob("Idle*.png"))), None)
        face = d / "Faceset.png"
        if not idle or not face.exists():
            continue
        frames, w, h = strip_frames(idle)
        cid = len(creatures) + 1
        shutil.copy(idle, out / "actors" / f"{cid}.png")
        shutil.copy(face, out / "actors" / f"{cid}-face.png")
        c = {"id": cid, "name": NAMES.get(pretty(d.name), pretty(d.name)), "kind": "boss", "key": d.name, "frames": frames, "w": w // frames, "h": h}
        hit = d / "Hit.png"
        if hit.exists():  # played once when something goes wrong nearby
            hn, hw, hh = strip_frames(hit)
            shutil.copy(hit, out / "actors" / f"{cid}-hit.png")
            c["hit"] = {"frames": hn, "w": hw // hn, "h": hh}
        creatures.append(c)
    (ROOT / "src" / "creatures.json").write_text(json.dumps(creatures, indent=0))
    # effects (horizontal strips) and the food you can drop
    (out / "fx").mkdir()
    (out / "food").mkdir()
    for name, src in {"thunder": "FX/Elemental/Thunder/SpriteSheet.png", "smoke": "FX/Smoke/Smoke/SpriteSheet.png",
                      "spark": "FX/Particle/Spark.png", "cut": "FX/Attack/Cut/SpriteSheet.png", "cutx": "FX/Attack/CutX/SpriteSheet.png",
                      "slash": "FX/Attack/SlashCurved/SpriteSheet.png", "spin": "FX/Attack/CircularSlash/SpriteSheet.png",
                      "claw": "FX/Attack/Claw/SpriteSheet.png"}.items():
        shutil.copy(pack.parent / src, out / "fx" / f"{name}.png")
    for name in FOOD:
        shutil.copy(pack.parent / "Items" / "Food" / f"{name}.png", out / "food" / f"{name}.png")
    copy_extras(pack.parent, out)
    by = {}
    for c in creatures:
        by[c["kind"]] = by.get(c["kind"], 0) + 1
    print(len(creatures), by, sum(1 for c in creatures if c.get("fly")), "fly",
          sum(1 for c in creatures if c.get("fish")), "fish", sum(1 for c in creatures if c.get("swim")), "swim")


# Everything else the app draws, as {folder under src/art: {file name: path in the pack}}.
EXTRAS = {
    "ui": {"font.ttf": "Ui/Font/NormalFont.ttf", "box.png": "Ui/Dialog/DialogueBoxSimple.png",
           "facebox.png": "Ui/Dialog/FacesetBox.png", "typing.png": "Ui/Dialog/DialogInfo.png"},
    "items": {"read.png": "Items/Scroll/Scroll.png", "bash.png": "Items/Tool/Anvil.png", "edit.png": "Items/Tool/Hammer.png",
              "search.png": "Items/Tool/Shovel.png", "web.png": "Items/Tool/Pickaxe.png", "agent.png": "Items/Tool/Sickle.png",
              "other.png": "Items/Tool/WateringCan.png", "chest.png": "Items/Treasure/LittleTreasureChest.png",
              "silvercup.png": "Items/Treasure/SilverCup.png", "goldcup.png": "Items/Treasure/GoldCup.png",
              "shuriken.png": "FX/Projectile/Shuriken.png"},
    "anim": {"flag-red.png": "Backgrounds/Animated/Flag/FlagRed16x16.png", "flag-blue.png": "Backgrounds/Animated/Flag/FlagBlue16x16.png",
             "flag-yellow.png": "Backgrounds/Animated/Flag/FlagYellow16x16.png", "flag-white.png": "Backgrounds/Animated/Flag/FlagWhite16x16.png",
             "ripple.png": "Backgrounds/Animated/Water Ripples/SpriteSheet16x16.png",
             "ripple-purple.png": "Backgrounds/Animated/Water Ripples/SpriteSheetPurple.png",
             "plant.png": "Backgrounds/Animated/Plant/SpriteSheet16x16.png", "flower.png": "Backgrounds/Animated/Flower/SpriteSheet16x16.png",
             "watermill.png": "Backgrounds/Animated/WaterMill/Watermill_A_34x36.png",
             "mill.png": "Backgrounds/Animated/MillPropeller/MillPropeller_A_64x64.png",
             "waterfall-top.png": "Backgrounds/Animated/Waterfall/TopSheet16x16.png",
             "waterfall-middle.png": "Backgrounds/Animated/Waterfall/MiddleSheet16x16.png",
             "waterfall-bottom.png": "Backgrounds/Animated/Waterfall/BottomSheet16x16.png"},
    "particles": {"leaf.png": "FX/Particle/Leaf.png", "petal.png": "FX/Particle/LeafPink.png", "snow.png": "FX/Particle/Snow.png",
                  "rain.png": "FX/Particle/Rain.png", "splash.png": "FX/Particle/RainOnFloor.png",
                  "fog.png": "FX/Environment/Fog.png", "rays.png": "FX/Environment/Raylight.png"},
    # the wood theme's pieces for the right-click menu: panel, highlighted row, check boxes, radio buttons, arrow
    "theme": {f"{n}.png": f"Ui/Theme/Theme Wood/{n}.png" for n in ("nine_path_panel", "button_hover", "checked", "unchecked",
                                                                    "radio_checked", "radio_unchecked", "arrow_right")},
    "dragon": {f"{n.lower()}.png": f"Actor/Boss/DragonBlue/{n}.png" for n in ("Head", "Body1", "Body2", "BodyEnd", "Wing")},
}


def copy_extras(pack: Path, out: Path):
    for folder, files in EXTRAS.items():
        (out / folder).mkdir(exist_ok=True)
        for name, src in files.items():
            shutil.copy(pack / src, out / folder / name)
    # the 30 emote bubbles as one strip, in the pack's order (emote1 .. emote30)
    emotes = [Image.open(pack / "Ui" / "Emote" / f"emote{i}.png").convert("RGBA") for i in range(1, 31)]
    w, h = emotes[0].size
    strip = Image.new("RGBA", (w * len(emotes), h))
    for i, e in enumerate(emotes):
        strip.paste(e, (i * w, 0))
    strip.save(out / "ui" / "emotes.png")


if __name__ == "__main__":
    main()
