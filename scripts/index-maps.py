#!/usr/bin/env python3
"""Gathers src/maps/<id>/meta.json (written by build-maps.py) into the files the app loads:
src/maps.json (map list, village first), src/collision.json and src/water.json."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
metas = [json.loads(p.read_text()) for p in sorted((ROOT / "src" / "maps").glob("*/meta.json"))]
metas.sort(key=lambda m: (m["id"] != "village", m["name"]))
(ROOT / "src/maps.json").write_text(json.dumps([{k: v for k, v in m.items() if k not in ("walk", "water")} for m in metas], indent=2) + "\n")
(ROOT / "src/collision.json").write_text(json.dumps({m["id"]: m["walk"] for m in metas}))
(ROOT / "src/water.json").write_text(json.dumps({m["id"]: m["water"] for m in metas}))
print("maps:", ", ".join(m["id"] for m in metas))
