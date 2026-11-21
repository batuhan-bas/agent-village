#!/usr/bin/env python3
"""Copies the sounds the app plays from the Ninja Adventure pack (pixel-boy, CC0) into src/audio/.

    python3 scripts/import-audio.py <path to "Ninja Adventure - Asset Pack">

Sound effects go to src/audio/sfx/<event>.wav (see SFX below), ambient loops to src/audio/loops/
and music to src/audio/music/ (both as .m4a, converted with ffmpeg): only the tracks some map
asks for (MUSIC in scripts/maps/<id>.py, recorded in its meta.json), so run it after build-maps.py.
"""
import array
import json
import shutil
import subprocess
import wave
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SFX = {
    "arrive": "Sounds/Menu/Accept3.wav",       # a villager walks in through the gate
    "belt": "Jingles/LevelUp1.wav",             # green or black belt
    "done": "Jingles/Success1.wav",             # a subagent finished
    "storm": "Sounds/Ambient/Storm.wav",        # a tool call failed (cut short in the app)
    "sun": "Sounds/Magic & Skill/Heal.wav",     # the main session finished its turn
    "eat": "Sounds/Bonus/Coin.wav",             # someone ate the food you dropped
    "hop": "Sounds/Jump & Bounce/Jump.wav",     # double-click
    "roar": "Sounds/Magic & Skill/Spirit.wav",  # double-click on a guardian
    "pick": "Sounds/Menu/Move2.wav",            # picked up
    "drop": "Sounds/Jump & Bounce/Bounce.wav",  # put down
    "nope": "Sounds/Menu/Cancel.wav",           # can't go there
    "whoosh": "Sounds/Whoosh & Slash/Whoosh.wav",  # a shuriken from the dojo
    "slash": "Sounds/Whoosh & Slash/Slash.wav",  # a ninja's sword stroke
    "poof": "Sounds/Hit & Impact/Impact.wav",    # an enemy is beaten
    "hit": "Sounds/Hit & Impact/Hit1.wav",      # a guardian flinches
    "chest": "Sounds/Bonus/Bonus.wav",          # a treasure chest appears
    **{f"voice{i}": f"Sounds/Voice/Voice{i}.wav" for i in range(1, 11)},  # villagers murmur when they talk
}
# looped quietly under each map (effects.json "sound"), and rain while a storm lasts
LOOPS = {"river": "Sounds/Ambient/River.wav", "wind": "Sounds/Ambient/Wind.wav", "rain": "Sounds/Ambient/Rain.wav"}


def aac(src, dst):
    """Music and loops ship as AAC (.m4a): every webview plays it (not all play Ogg), and it is
    far smaller than wav. Needs ffmpeg."""
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-c:a", "aac", "-b:a", "96k", str(dst)], check=True)


def trim(path, seconds, fade):
    """Keeps the first `seconds` of a 16-bit wav, fading out over the last `fade` seconds."""
    with wave.open(str(path)) as w:
        params, rate, ch = w.getparams(), w.getframerate(), w.getnchannels()
        if w.getsampwidth() != 2:
            return
        frames = w.readframes(int(rate * seconds))
    samples = array.array("h", frames)
    n, fade_n = len(samples) // ch, int(rate * fade)
    for i in range(max(0, n - fade_n), n):
        k = (n - i) / fade_n
        for c in range(ch):
            samples[i * ch + c] = int(samples[i * ch + c] * k)
    with wave.open(str(path), "wb") as w:
        w.setparams(params)
        w.writeframes(samples.tobytes())


def main():
    audio = Path(sys.argv[1]) / "Audio"
    out = ROOT / "src" / "audio"
    if out.exists():
        shutil.rmtree(out)
    (out / "sfx").mkdir(parents=True)
    (out / "music").mkdir()
    for name, src in SFX.items():
        shutil.copy(audio / src, out / "sfx" / f"{name}.wav")
    trim(out / "sfx" / "storm.wav", 3.5, 1.0)
    (out / "loops").mkdir()
    for name, src in LOOPS.items():
        aac(audio / src, out / "loops" / f"{name}.m4a")
    tracks = {json.loads(p.read_text()).get("music") for p in (ROOT / "src" / "maps").glob("*/meta.json")} - {None}
    for t in sorted(tracks):
        aac(audio / "Musics" / t, out / "music" / (Path(t).stem + ".m4a"))
    shutil.copy(audio.parent / "LICENSE.txt", out / "LICENSE.txt")
    print(f"{len(SFX)} sounds, music: {', '.join(sorted(tracks))}")


if __name__ == "__main__":
    main()
