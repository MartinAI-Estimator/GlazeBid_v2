"""
taxonomy.py — read-side of scope_taxonomy.json.

    from knowledge.taxonomy import classify_markup, classes

    cls, role = classify_markup(subject, annot_type, fill_rgb, author)

cls is a key of classes() ("ext_sf", "glazing_only_door", "excluded", "ignore", ...)
role is "region" | "area" | "linear" | "door" | "count" | "label"
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_PATH = Path(__file__).resolve().parent / "scope_taxonomy.json"


@lru_cache(maxsize=1)
def _tax() -> dict:
    return json.loads(_PATH.read_text(encoding="utf-8"))


def norm(s: str | None) -> str:
    return " ".join((s or "").replace(".", "").lower().split())


def _hex(rgb) -> str | None:
    if not rgb:
        return None
    if isinstance(rgb, str):
        return rgb.upper()
    try:
        return "#" + "".join(f"{round(float(v) * 255):02X}" for v in list(rgb)[:3])
    except Exception:
        return None


def classify_markup(subject: str | None, annot_type: str | None = None,
                    fill=None, author: str | None = None) -> tuple[str, str]:
    t = _tax()
    if author and author in t["ignored_authors"]:
        return "ignore", "region"
    k = norm(subject)
    entry = t["subjects"].get(k)
    if entry is None:
        return "ignore", "region"
    cls = entry["class"]
    if cls == "color_classed":
        cls = t["color_to_door_class"].get(_hex(fill) or "", "ignore")
    role = entry["role"]
    # Corpus annotation types can refine the role (PyMuPDF reports counts as Polygon)
    if annot_type == "Circle" and role == "region":
        role = "door"
    return cls, role


def classes() -> dict:
    return _tax()["classes"]


def is_scope(cls: str) -> bool:
    c = _tax()["classes"].get(cls)
    return bool(c) and c["kind"] in ("scope", "pass_thru", "implied")


def draw_style(cls: str) -> dict | None:
    return _tax()["draw_style"].get(cls)
