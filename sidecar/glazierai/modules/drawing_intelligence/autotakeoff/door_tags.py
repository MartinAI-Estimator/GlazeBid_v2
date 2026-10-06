"""
door_tags.py — compound door tags on plans: the door number on top and a row
of cells underneath (Hope A2.1A: "A103 / A | 11 | 15" = door type A, frame
type 11, hardware set 15).  The cells are how some architects tie a door to a
glazed frame type when the door schedule itself only lists details.

    tag_cells(pg, tag) -> ["A", "11", "15"]        # tag = Tag.to_dict()
    cell_roles(cells_by_mark, frame_marks, door_marks, hw_marks) -> {index: role}

Cells are split at the vertical divider lines inside the symbol; when the
divider lines can't be found the words' own spacing is used.
"""
from __future__ import annotations

import re
from collections import Counter

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

from .pdfgeom import segments, _key

_CHARS: dict = {}
_VSEG: dict = {}


def _chars(pg: fitz.Page) -> list[tuple[fitz.Rect, str]]:
    k = _key(pg)
    if k in _CHARS:
        return _CHARS[k]
    M = pg.rotation_matrix
    out = []
    for b in pg.get_text("rawdict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                if s["size"] > 12:
                    continue
                for c in s["chars"]:
                    if c["c"].strip():
                        r = fitz.Rect(c["bbox"]) * M
                        r.normalize()
                        out.append((r, c["c"]))
    _CHARS[k] = out
    return out


def _vsegs(pg: fitz.Page) -> list[tuple[float, float, float]]:
    """Short vertical segments (x, y0, y1) — candidate cell dividers."""
    k = _key(pg)
    if k not in _VSEG:
        v = []
        for a, b in segments(pg):
            if abs(a.x - b.x) < 0.6 and 2 < abs(a.y - b.y) < 30:
                v.append(((a.x + b.x) / 2, min(a.y, b.y), max(a.y, b.y)))
        _VSEG[k] = v
    return _VSEG[k]


def _hsegs(pg: fitz.Page) -> list[tuple[float, float, float]]:
    """Short horizontal segments (y, x0, x1) — the line under the door number."""
    k = ("h",) + _key(pg)
    if k not in _VSEG:
        h = []
        for a, b in segments(pg):
            if abs(a.y - b.y) < 0.6 and 8 < abs(a.x - b.x) < 60:
                h.append(((a.y + b.y) / 2, min(a.x, b.x), max(a.x, b.x)))
        _VSEG[k] = h
    return _VSEG[k]


def tag_cells(pg: fitz.Page, tag: dict) -> list[str]:
    S = fitz.Rect(tag["shape"])
    T = fitz.Rect(tag["rect"])
    # a compound tag has a horizontal divider just under the number, across most of the number's width
    hd = [y for y, x0, x1 in _hsegs(pg) if T.y1 - 2.5 <= y <= T.y1 + 3 and x0 <= T.x0 + 2 and x1 >= T.x1 - 2]
    if not hd:
        return []
    y_top = min(hd)
    h = T.height
    row = fitz.Rect(min(S.x0, T.x0 - h), y_top, max(S.x1, T.x1 + h), y_top + h * 1.6)
    ch = [(r, c) for r, c in _chars(pg) if row.contains(fitz.Point((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2))]
    if not ch:
        return []
    ch.sort(key=lambda rc: rc[0].x0)
    cx0, cx1 = min(r.x0 for r, _ in ch), max(r.x1 for r, _ in ch)
    # dividers stay inside the row (wall / frame lines behind the tag run through it)
    divs = sorted({round(x, 1) for x, y0, y1 in _vsegs(pg)
                   if cx0 < x < cx1 and y0 >= row.y0 - 1.5 and y1 <= row.y1 + 1.5 and (y1 - y0) > 0.5 * h})
    cells: list[str] = []
    if divs:
        edges = [cx0 - 1] + divs + [cx1 + 1]
        for a, b in zip(edges, edges[1:]):
            t = "".join(c for r, c in ch if a <= (r.x0 + r.x1) / 2 < b)
            if t:
                cells.append(t)
    else:
        cur, last = "", None
        for r, c in ch:
            if last is not None and r.x0 - last > max(1.5, 0.35 * r.height):
                cells.append(cur)
                cur = ""
            cur += c
            last = r.x1
        if cur:
            cells.append(cur)
    return cells


def cell_roles(cells_by_mark: dict[str, list[str]], frame_marks: set, door_marks: set, hw_marks: set) -> dict[int, str]:
    """
    Which cell position is the frame type, door type, hardware set — by which
    known list its values fall in most often.  No legend needed; a position
    counts only when most of its values match.
    """
    cols: dict[int, Counter] = {}
    n: Counter = Counter()
    for cells in cells_by_mark.values():
        for i, v in enumerate(cells):
            n[i] += 1
            c = cols.setdefault(i, Counter())
            if v in frame_marks:
                c["frame"] += 1
            if v in door_marks:
                c["door"] += 1
            if v in hw_marks:
                c["hardware"] += 1
    roles: dict[int, str] = {}
    taken = set()
    # strongest evidence first
    cand = sorted(((cnt / n[i], i, role) for i, c in cols.items() for role, cnt in c.items()), reverse=True)
    for frac, i, role in cand:
        if frac < 0.5 or i in roles or role in taken:
            continue
        roles[i] = role
        taken.add(role)
    return roles


_NUM = re.compile(r"^\d{1,3}[A-Z]?$")
