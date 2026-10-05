"""
allglass.py — the frameless / all-glass measures Martin takes on every opening
(McLarty A3.3: Area per opening, film band Area, SSG Caulk Count, Polished
Edge Count, All Glass Doors).

From the type drawing's vector geometry and description text:
    panels        bays from the full-height panel joint lines
    ssg_joints    panel-to-panel joints (panels - 1) + 2 end joints to the walls
    polished_edges  exposed vertical edges (2 per opening) + 2 per door leaf
    doors         door leaves named in the description ("PANELS AND DOORS",
                  "PAIR", "(2) DOORS") — 1 per opening unless a pair is named
    film_h_in     frost / film band height ("FROST GLASS UP TO 36" H", "36" AFF")
    film_sf       W x film_h  (per opening)

These are DERIVED counts: the estimator confirms them (the learning log will
calibrate the end-joint and edge rules per job type).
"""
from __future__ import annotations

import re

from .units import parse_dim, sf

_DOORS = re.compile(r"PANELS? AND DOORS?|GLASS DOORS?|\bDOORS?\b", re.I)
_PAIR = re.compile(r"\bPAIR\b|\(2\)\s*DOORS|DOUBLE DOOR|TWO DOORS", re.I)
_FILM_H = re.compile(r"""(?:FROST|FILM|FASARA|BAND|PRIVACY)[^\d]{0,30}(\d+(?:'-?\d*)?\s*"?)\s*(?:H\b|HIGH|AFF|A\.F\.F)""", re.I)
_FILM_H2 = re.compile(r"""UP TO\s+(\d+(?:'-?\d*)?\s*"?)""", re.I)


def all_glass_measures(desc: str, w_in: float | None, h_in: float | None, bays: int | None, rows: int | None,
                       has_film: bool = False) -> dict:
    t = re.sub(r"\s+", " ", desc or "")
    panels = max(1, bays or 1)
    doors = 0
    if _DOORS.search(t):
        doors = 2 if _PAIR.search(t) else 1
    m = _FILM_H.search(t) or _FILM_H2.search(t)
    film_h = None
    if m:
        v = m.group(1).strip()
        film_h = parse_dim(v if ('"' in v or "'" in v) else v + '"')
    if film_h is None and has_film:
        film_h = 36.0
    out = {
        "panels": panels,
        "ssg_joints": max(0, panels - 1) + 2,
        "ssg_joints_rule": "(panels - 1) panel joints + 2 end joints",
        "polished_edges": 2 + 2 * doors,
        "polished_edges_rule": "2 exposed verticals + 2 per door leaf",
        "doors": doors,
        "film_h_in": film_h,
        "film_sf": sf(w_in, film_h) if (w_in and film_h) else None,
        "area_sf": sf(w_in, h_in) if (w_in and h_in) else None,
        "verify": True,
    }
    return out
