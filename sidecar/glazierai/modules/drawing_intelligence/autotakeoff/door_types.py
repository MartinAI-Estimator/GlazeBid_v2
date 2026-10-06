"""
door_types.py — what a door / frame TYPE code means, read from the type
elevation drawings and the code tables, so a schedule row that is only codes
("C | 2 | 1 | 45 MIN") can be classified.

Curtis (VLK, 2026-10-05) is the case: the door schedule never says "glass".
The glass is in the door type drawing (a lite rectangle inside the leaf), the
panel material is a number looked up in PANEL MATERIAL NOTES, fire glass is a
keyed note, and storefront / sliding / coiling doors are told apart by which
titled section their type drawing sits in.

    types  = read_type_drawings(pg)      {code: TypeInfo}
    tables = read_code_tables(pg)        {"PANEL MATERIAL": {"2": "Painted Wood", …}, "KEYED": {...}}
    words  = describe_row(cells, types, tables)  -> extra text for the classifier
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field, asdict

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

from .pdfgeom import text_lines, rect_candidates, dedupe, long_lines, TextLine
from .tags import find_tags
from .units import norm_text

_SECTION = re.compile(r"\bTYPES?\b", re.I)
TYPE_CODE = r"[A-Z]{1,3}(?:-[A-Z0-9]{1,2})?|[A-Z]?\d{1,2}[A-Z]?"


@dataclass
class TypeInfo:
    code: str
    sheet: str
    page: int
    section: str                 # "DOOR TYPES", "STOREFRONT DOOR TYPES", …
    rect: list | None = None     # outer drawing
    label_rect: list | None = None
    has_lite: bool = False       # a closed rectangle inside the leaf
    lite_count: int = 0
    coiling: bool = False        # many full-width horizontal lines (slats)
    frame_only: bool = False     # no drawing / open frame
    words: str = ""              # what this means, in words the classifier understands

    def to_dict(self) -> dict:
        return asdict(self)


def _sections(L: list[TextLine]) -> list[TextLine]:
    body = Counter(round(t.size, 1) for t in L if len(t.text) > 2).most_common(1)[0][0] if L else 9.0
    return [t for t in L if t.size >= body * 1.4 and _SECTION.search(t.text) and len(t.text) < 80]


def read_type_drawings(pg: fitz.Page, sheet: str = "") -> dict[str, TypeInfo]:
    L = [t for t in text_lines(pg) if not t.vertical]
    secs = _sections(L)
    if not secs:
        return {}
    labels = [t for t in find_tags(pg, pattern=TYPE_CODE, kinds=()) if t.kind not in ("triangle",)]
    out: dict[str, TypeInfo] = {}
    for t in labels:
        sh = t.shape
        cx = (sh[0] + sh[2]) / 2
        # its section: the nearest section title below the label (titles sit under their drawings)
        below = [s for s in secs if s.rect[1] > sh[3] and s.rect[1] - sh[3] < 260 and s.rect[0] < sh[2] + 200]
        if not below:
            continue
        below.sort(key=lambda s: s.rect[1])
        section = norm_text(below[0].text).upper()
        win = fitz.Rect(cx - 140, sh[1] - 320, cx + 140, sh[1] - 2)
        rc = dedupe(rect_candidates(pg, win, minlen=8))
        big = sorted([r for r in rc if r.height > 50], key=lambda r: -(r.width * r.height))
        outer = big[0] if big else None
        info = TypeInfo(t.text, sheet, pg.number, section, label_rect=t.shape)
        if outer is None:
            info.frame_only = True
        else:
            info.rect = [round(v, 1) for v in outer]
            inner = [r for r in rc if outer.contains(r) and r != outer and r.width < outer.width * 0.6
                     and r.height < outer.height * 0.6 and r.width > 6 and r.height > 10]
            info.lite_count = len(dedupe(inner, tol=3))
            info.has_lite = info.lite_count > 0
            _, hs = long_lines(pg, outer, minlen=outer.width * 0.6)
            info.coiling = len(hs) >= 15
        info.words = _words(info)
        if t.text not in out or (out[t.text].frame_only and not info.frame_only):
            out[t.text] = info
    return out


def _words(i: TypeInfo) -> str:
    sec = i.section
    w = [f"DOOR TYPE {i.code}"]
    if i.coiling:
        w.append("OVERHEAD COILING DOOR (slats in type drawing)")
    elif "SLIDING" in sec and "STOREFRONT" in sec:
        w.append("SLIDING STOREFRONT DOOR")
    elif "STOREFRONT" in sec:
        w.append("ALUMINUM STOREFRONT DOOR")
    elif "FRAME" in sec and "DOOR" not in sec:
        w.append("HOLLOW METAL FRAME" if "HOLLOW METAL" in sec else "FRAME TYPE")
        return "; ".join(w)
    if i.has_lite and not i.coiling:
        w.append(f"VISION LITE GLASS IN DOOR ({i.lite_count} lite{'s' if i.lite_count > 1 else ''})")
    elif not i.coiling and "STOREFRONT" not in sec and not i.frame_only:
        w.append("FLUSH DOOR - SOLID PANEL")
    if i.frame_only:
        w.append("NO DOOR LEAF DRAWN (opening / frame only)")
    return "; ".join(w)


# ── code tables ("PANEL MATERIAL NOTES", "DOOR KEYED NOTES", "GLAZING TYPE LEGEND") ──

_TABLE_TITLE = re.compile(r"(NOTES|LEGEND|SCHEDULE|MATERIALS?)\s*$", re.I)
_CODE = re.compile(r"^([A-Z]{0,4}\d{0,3}[A-Z]?|\d{1,3})\.?$")


def read_code_tables(pg: fitz.Page) -> dict[str, dict[str, str]]:
    """
    {TITLE: {code: text}} for small two-column tables under a title: a short
    code at the left, its meaning to the right.  Titles are the big text that
    ends in NOTES / LEGEND.
    """
    L = [t for t in text_lines(pg) if not t.vertical]
    if not L:
        return {}
    body = Counter(round(t.size, 1) for t in L if len(t.text) > 2).most_common(1)[0][0]
    titles = [t for t in L if t.size >= body * 1.3 and _TABLE_TITLE.search(t.text.strip()) and len(t.text) < 60]
    out: dict[str, dict[str, str]] = {}
    for ti in titles:
        x0, x1 = ti.rect[0] - 80, ti.rect[2] + 120
        nxt = [u.rect[1] for u in titles if u is not ti and u.rect[1] > ti.rect[3] and abs(u.rect[0] - ti.rect[0]) < 200]
        y1 = min(nxt) if nxt else ti.rect[3] + 900
        rows = [u for u in L if ti.rect[3] < u.rect[1] < y1 and x0 <= u.rect[0] <= x1 and u.size < ti.size]
        codes = [u for u in rows if _CODE.match(u.text.strip()) and len(u.text.strip()) <= 6]
        if len(codes) < 2:
            continue
        # the code column: most common left x among code-like tokens
        colx = Counter(round(u.rect[0] / 6) for u in codes).most_common(1)[0][0] * 6
        codes = [u for u in codes if abs(u.rect[0] - colx) < 14]
        tab: dict[str, str] = {}
        for c in codes:
            h = c.rect[3] - c.rect[1]
            txt = [u for u in rows if u is not c and abs(u.rect[1] - c.rect[1]) < h * 0.7 and u.rect[0] > c.rect[2]
                   and u.rect[0] - c.rect[2] < 400]
            txt.sort(key=lambda u: u.rect[0])
            if txt:
                tab[c.text.strip().rstrip(".")] = " ".join(u.text.strip() for u in txt)
        if len(tab) >= 2:
            out[norm_text(ti.text).upper()] = tab
    return out


def _table_for(column: str, tables: dict[str, dict[str, str]]) -> dict[str, str] | None:
    """PANEL MATERIAL column → 'PANEL MATERIAL NOTES'; KEYED NOTES → 'DOOR KEYED NOTES'; GLAZING → 'GLAZING TYPE LEGEND'."""
    col = column.upper()
    words = [w for w in re.split(r"\W+", col) if len(w) > 2 and w not in ("NOTES", "TYPE", "DOOR", "SET")]
    best = None
    for title, tab in tables.items():
        score = sum(1 for w in words if w in title)
        if score and (best is None or score > best[0]):
            best = (score, tab)
    return best[1] if best else None


def describe_row(cells: dict[str, str], types: dict[str, TypeInfo], tables: dict[str, dict[str, str]],
                 hm_frame_codes: bool = False) -> str:
    """Words for a code-only schedule row: type drawing meaning + looked-up codes."""
    parts: list[str] = []
    for col, val in cells.items():
        cu = col.upper()
        v = (val or "").strip()
        if not v or v in ("--", "-", "N/A"):
            continue
        codes = [c for c in re.split(r"[,\s]+", v) if c]
        if "DOOR TYPE" in cu or cu in ("TYPE",):
            for c in codes[:1]:
                if c.upper() in ("EX", "EXIST", "EXISTING"):
                    parts.append("EXISTING DOOR TO REMAIN")
                elif c in types:
                    parts.append(types[c].words)
            continue
        if "FRAME" in cu and "TYPE" in cu:
            c = codes[0]
            if c.upper() in ("EX", "EXIST", "EXISTING"):
                parts.append("EXISTING FRAME")
            elif c in types and "FRAME" in types[c].section:
                parts.append(types[c].words)
            elif re.fullmatch(r"\d{1,2}[A-Z]?", c) and hm_frame_codes:
                parts.append(f"HOLLOW METAL FRAME TYPE {c}")
            continue
        tab = _table_for(cu, tables) if any(k in cu for k in ("MATERIAL", "KEYED", "NOTE", "GLAZING", "GLASS", "FINISH")) else None
        if tab:
            for c in codes:
                c2 = c.rstrip(".,")
                if c2 in tab:
                    parts.append(f"{col} {c2}: {tab[c2]}")
    return " | ".join(parts)
