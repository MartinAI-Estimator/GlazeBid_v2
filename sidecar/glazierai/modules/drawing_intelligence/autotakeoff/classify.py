"""
classify.py — Martin's in / out / pass-thru / implied rules applied to text.

    c = classify(text, location=None, legend_class=None, is_door=False)
    c.cls        scope_taxonomy class key ("ext_sf", "glazing_only", "excluded", …)
    c.kind       scope | pass_thru | excluded | implied
    c.flags      reasons the estimator must look (yellow flag)
    c.notes      why it was classed this way (the rule ids that fired)
    c.implied    [{cls, note}] line items attached to this one (film, break metal, hardware…)
    c.series     matched manufacturer series (knowledge/series_classes.json or other-maker hints)
    c.location   "exterior" | "interior" | None

Precedence (Martin, 2026-10-05):
    exclusions → pass-thru → legend class (flag if the series disagrees) →
    series class → keyword class → generic glass (flagged).
Rules live in rules.json next to this file.  No model calls.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field, asdict
from functools import lru_cache
from pathlib import Path

_HERE = Path(__file__).resolve().parent


@lru_cache(maxsize=1)
def rules() -> dict:
    return json.loads((_HERE / "rules.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _taxonomy() -> dict:
    for p in (_HERE.parent.parent.parent.parent / "knowledge" / "scope_taxonomy.json",
              _HERE.parent / "knowledge" / "scope_taxonomy.json"):
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    return {"classes": {}}


def class_kind(cls: str) -> str:
    c = _taxonomy().get("classes", {}).get(cls)
    if c:
        return c["kind"]
    return {"excluded": "excluded", "hardware": "implied", "glass_film": "implied"}.get(cls, "scope")


def _match_series(text: str) -> list[dict]:
    try:
        from knowledge.prompt_context import match_series   # sidecar layout
        hits = match_series(text)
    except Exception:
        hits = []
    # other-maker hints (PITCO TMW 450 → ext_cw …) from the knowledge base
    try:
        kb_path = next(p for p in (_HERE.parent.parent.parent.parent / "knowledge" / "system_knowledge_base.json",
                                   _HERE.parent / "knowledge" / "system_knowledge_base.json") if p.exists())
        kb = json.loads(kb_path.read_text(encoding="utf-8"))
    except Exception:
        kb = {}
    up = re.sub(r"\s+", " ", text.upper())
    for mfr, m in kb.get("other_manufacturer_hints", {}).items():
        for series, cls in m.items():
            if series.startswith("_"):
                continue
            if re.search(r"(?<![A-Z0-9])" + re.escape(series.upper()).replace(r"\ ", r"\s*") + r"(?![0-9])", up):
                hits.append({"id": f"{mfr.lower()}-{series.lower().replace(' ', '')}", "manufacturer": mfr,
                             "series": series, "scope_class": cls, "other_maker": True, "matched": series})
    return hits


@lru_cache(maxsize=512)
def _rx(p: str) -> re.Pattern:
    return re.compile(p, re.I)


def _hit(rule: dict, text: str) -> bool:
    if rule.get("all") and not all(_rx(p).search(text) for p in rule["all"]):
        return False
    if rule.get("all_any") and not any(_rx(p).search(text) for p in rule["all_any"]):
        return False
    if rule.get("none") and any(_rx(p).search(text) for p in rule["none"]):
        return False
    if rule.get("any"):
        return any(_rx(p).search(text) for p in rule["any"])
    return bool(rule.get("all") or rule.get("all_any"))


@dataclass
class Classification:
    cls: str
    kind: str
    location: str | None = None
    flags: list = field(default_factory=list)
    notes: list = field(default_factory=list)
    implied: list = field(default_factory=list)
    series: list = field(default_factory=list)
    is_door: bool = False
    pair: bool = False
    stile: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def location_of(text: str, hint: str | None = None) -> str | None:
    R = rules()["location"]
    if hint in ("exterior", "interior"):
        return hint
    if any(_rx(p).search(text) for p in R.get("interior_strong", [])):
        return "interior"
    if any(_rx(p).search(text) for p in R["exterior_any"]):
        return "exterior"
    if any(_rx(p).search(text) for p in R["interior_any"]):
        return "interior"
    return None


def _localize(cls: str, loc: str | None) -> str:
    if loc == "interior":
        return {"ext_sf": "int_sf", "ext_cw": "int_cw", "ext_sf_door": "int_sf_door", "ext_cw_door": "int_cw_door"}.get(cls, cls)
    return cls


def _doorify(cls: str, is_door: bool) -> str:
    if not is_door:
        return cls
    return {"ext_sf": "ext_sf_door", "int_sf": "int_sf_door", "ext_cw": "ext_cw_door", "int_cw": "int_cw_door",
            "all_glass_wall": "all_glass_door", "glazing_only": "glazing_only_door",
            "fire_rated_glazing": "fire_rated_door"}.get(cls, cls)


def classify(text: str, location: str | None = None, legend_class: str | None = None,
             is_door: bool = False, legend_code: str | None = None) -> Classification:
    R = rules()
    t = re.sub(r"\s+", " ", (text or "")).strip()
    loc = location_of(t, location)
    series = _match_series(t)
    c = Classification("unclassified", "scope", loc, series=series, is_door=is_door)
    D = R["door_in_frame"]
    c.pair = any(_rx(p).search(t) for p in D["pair_any"])
    m = next((_rx(p).search(t) for p in D["stile_any"] if _rx(p).search(t)), None)
    c.stile = m.group(0).upper() if m else None

    for r in R["exclusions"]:
        if _hit(r, t):
            c.cls, c.kind = r["class"], "excluded"
            c.notes.append(f"{r['id']}: {r['note']}")
            _implied(c, t, R)
            return c
    kw_cls, kw_rule = None, None
    for r in R["scope"]:
        if _hit(r, t):
            kw_cls, kw_rule = r["class"], r
            break
    series_cls = series[0]["scope_class"] if series else None
    framed = bool(series) or (kw_cls in ("ext_sf", "ext_cw", "window_wall", "window", "all_glass_wall"))

    for r in R["pass_thru"]:
        if _hit(r, t):
            if framed:
                # the frame is ours; the door inside it is the pass-thru item
                c.implied.append({"cls": r["class"], "note": r["note"], "rule": r["id"], "kind": "pass_thru"})
                c.flags.append(f"{r['note']} — carried as a sub-item of this frame")
                break
            c.cls, c.kind = r["class"], "pass_thru"
            c.notes.append(f"{r['id']}: {r['note']}")
            _implied(c, t, R)
            return c

    if legend_class:
        c.cls = legend_class
        c.notes.append(f"legend: {legend_code or ''} = {legend_class}")
        if series_cls and series_cls != legend_class and _family(series_cls) != _family(legend_class):
            c.flags.append(f"{R['legend_precedence']['flag_text']}: legend says {legend_class}, series {series[0]['series']} reads as {series_cls} — legend used")
    elif series_cls and series_cls not in ("unknown", None):
        c.cls = series_cls
        c.notes.append(f"series {series[0].get('manufacturer','')} {series[0]['series']} → {series_cls}")
        if kw_cls and kw_cls not in (series_cls, "glazing_only") and _family(kw_cls) != _family(series_cls) and kw_cls not in ("ext_sf", "ext_cw"):
            c.notes.append(f"keyword rule {kw_rule['id']} would say {kw_cls}; series wins")
    elif kw_cls and not (kw_rule.get("flag") and _rx(R["manufacturers"]).search(t)):
        c.cls = kw_cls
        c.notes.append(f"{kw_rule['id']}: {kw_rule['note']}")
        if kw_rule.get("flag"):
            c.flags.append(kw_rule["note"])
    elif _rx(R["manufacturers"]).search(t):
        md = R["manufacturer_default"]
        c.cls = md["class"]
        c.notes.append(f"manufacturer named ({_rx(R['manufacturers']).search(t).group(0)}), no series match → {md['class']}")
        c.flags.append(md["flag"])
    else:
        c.cls = "unclassified"
        c.flags.append("no classification rule matched — review")

    if series and series[0].get("other_maker"):
        c.flags.append(f"{R['other_manufacturer_flag']} ({series[0]['manufacturer']} {series[0]['series']})")
    elif series and series[0].get("manufacturer", "").upper() not in ("KAWNEER", "TUBELITE"):
        c.flags.append(f"{R['other_manufacturer_flag']} ({series[0].get('manufacturer','')} {series[0]['series']})")

    c.cls = _doorify(_localize(c.cls, loc), is_door)
    c.kind = class_kind(c.cls)
    if c.cls in ("ext_sf", "ext_cw", "window", "window_wall") and loc is None:
        c.flags.append("exterior / interior not stated — assumed exterior")
    _implied(c, t, R)
    if c.cls == "glass_handrail" and re.search(r"WELDED|STEEL RAIL", t, re.I):
        c.flags.append("welded steel rail — glass infill only, steel by others")
    if c.cls == "mirror":
        c.flags.append("mirror: glazier vs toilet-accessory package — confirm")
    return c


def _family(cls: str) -> str:
    c = _taxonomy().get("classes", {}).get(cls)
    return c["family"] if c else cls


def _implied(c: Classification, t: str, R: dict) -> None:
    for r in R["implied"]:
        if _hit(r, t):
            if r["class"] == "hardware" and c.kind == "excluded":
                continue
            item = {"cls": r["class"], "note": r["note"], "rule": r["id"]}
            c.implied.append(item)
            if r.get("flag"):
                c.flags.append(r["note"])


def is_glazing_text(text: str) -> re.Match | None:
    return _rx(rules()["glazing_keywords"]).search(text or "")


def detail_keywords() -> re.Pattern:
    return _rx(rules()["detail_keywords"])
