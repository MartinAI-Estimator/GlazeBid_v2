"""
subjects.py — Martin's Estimating ToolBox subjects for each scope class and
markup role, with the exact subject spelling and colour from the toolbox.

    subject_for("ext_sf", "region")  -> ("Ext SF Highlight", "#FF8000", "#FF8000", None)
    subject_for("ext_sf", "area")    -> ("Ext. SF Area", ...)
    subject_for("ext_sf", "linear")  -> ("Ext SF Polylength", ...)
    subject_for("ext_sf_door", "door")-> ("Ext SF Door", ...)

Classes are classified by subject, never by colour (window wall and break
metal share #008080).  Sources: knowledge/scope_taxonomy.json (class ↔ subject
↔ role) and reference/bluebeam/estimating_toolbox.json (exact names, colours).
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_HERE = Path(__file__).resolve().parent


def _find(rel: str) -> Path | None:
    for base in (_HERE.parent.parent.parent.parent, _HERE.parent.parent.parent.parent.parent, _HERE.parent):
        p = base / rel
        if p.exists():
            return p
    return None


@lru_cache(maxsize=1)
def _toolbox() -> dict[str, dict]:
    p = _find("reference/bluebeam/estimating_toolbox.json") or _find("../reference/bluebeam/estimating_toolbox.json")
    out: dict[str, dict] = {}
    if p:
        for it in json.loads(p.read_text(encoding="utf-8")):
            key = " ".join(it["subject"].replace(".", "").lower().split())
            out.setdefault(key, it)
    return out


@lru_cache(maxsize=1)
def _taxonomy() -> dict:
    p = _find("knowledge/scope_taxonomy.json")
    return json.loads(p.read_text(encoding="utf-8")) if p else {"subjects": {}, "draw_style": {}}


_PREF = {   # when a class has several subjects for a role, prefer these (Martin's usage)
    "linear": ("polylength",),
    "door": ("door",),
}

FLAG = ("Needs Review", "#FFFF00", "#FFFF00")   # yellow flag; not in the toolbox — GlazeBid's own
EXCLUDED = "Excluded by Binswanger"


def subject_for(cls: str, role: str) -> tuple[str, str, str, float | None] | None:
    """(subject, stroke_hex, fill_hex, opacity) or None when the toolbox has no such tool."""
    tax = _taxonomy()
    cands = [s for s, v in tax["subjects"].items() if v["class"] == cls and v["role"] == role]
    if not cands:
        return None
    prefs = _PREF.get(role, ())
    cands.sort(key=lambda s: (not any(p in s for p in prefs), len(s)))
    key = cands[0]
    tb = _toolbox().get(key)
    if tb:
        return tb["subject"], tb.get("stroke_hex") or "", tb.get("fill_hex") or "", tb.get("opacity")
    ds = tax.get("draw_style", {}).get(cls)
    if ds and role == "region":
        return ds["subject"], ds["stroke"], ds["fill"], None
    return key.title(), "", "", None


def style(cls: str) -> dict:
    ds = _taxonomy().get("draw_style", {}).get(cls)
    if ds:
        return ds
    s = subject_for(cls, "region")
    return {"subject": s[0], "stroke": s[1], "fill": s[2]} if s else {"subject": "Needs Review", "stroke": "#FFFF00", "fill": "#FFFF00"}
