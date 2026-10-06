"""
tags.py — callout tags: a short text token sitting inside a small closed
vector symbol (hexagon, circle, diamond, rectangle, triangle).

The symbol kind is what separates door/frame marks (hexagons on McLarty,
circles elsewhere) from room numbers (rectangles), revision clouds
(triangles) and grid bubbles (large circles).  Text alone cannot: "102" is a
door, a room and a dimension on the same sheet.

    find_tags(pg, pattern, kinds=("hexagon","circle","diamond")) -> list[Tag]
    Tag(text, rect, shape, kind, nlines, ncurves)
"""
from __future__ import annotations

import re
from dataclasses import dataclass, asdict

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

from .pdfgeom import text_lines, small_shapes, drawings

MARK_PATTERN = r"[A-Z]{0,2}-?\d{1,4}[A-Za-z]?(?:\.\d{1,2})?|[A-Z]{1,3}-?\d{0,3}[a-z]?"   # 1, 6a, 101, A, SF-1, D2, W3


@dataclass
class Tag:
    text: str
    rect: list          # text bbox
    shape: list         # symbol bbox
    kind: str           # hexagon | circle | diamond | rect | triangle | other
    nlines: int
    ncurves: int

    @property
    def center(self) -> fitz.Point:
        return fitz.Point((self.shape[0] + self.shape[2]) / 2, (self.shape[1] + self.shape[3]) / 2)

    def to_dict(self) -> dict:
        return asdict(self)


def _kind(nlines: int, ncurves: int, nre: int, items=None) -> str:
    if ncurves >= 2 and nlines <= 1:
        return "circle"
    if nlines in (5, 6, 7, 8) and ncurves == 0:
        return "hexagon"
    if nlines == 3 and ncurves == 0:
        return "triangle"
    if nre >= 1 and nlines == 0:
        return "rect"
    if nlines == 4 and ncurves == 0:
        # axis-aligned → rect, else diamond
        if items:
            axis = sum(1 for it in items if it[0] == "l" and (abs(it[1].x - it[2].x) < 0.5 or abs(it[1].y - it[2].y) < 0.5))
            return "rect" if axis >= 3 else "diamond"
        return "rect"
    return "other"


def _shapes_with_items(pg: fitz.Page, maxsz: float):
    M = pg.rotation_matrix
    out = []
    for p in drawings(pg):
        r = fitz.Rect(p["rect"]) * M
        r.normalize()
        if 6 < r.width <= maxsz and 6 < r.height <= maxsz:
            n = sum(1 for it in p["items"] if it[0] == "l")
            c = sum(1 for it in p["items"] if it[0] == "c")
            re_ = sum(1 for it in p["items"] if it[0] == "re")
            fill_only = p.get("type") == "f" and p.get("color") is None
            out.append((r, n, c, re_, p["items"], fill_only))
    return out


_ITEM_CACHE: dict = {}


_GRID = 64.0


def _grid_index(pieces):
    """Bucket small pieces by 64-pt cells so the composite test is local."""
    g: dict[tuple[int, int], list] = {}
    for p in pieces:
        r = p[0]
        for gx in range(int(r.x0 // _GRID), int(r.x1 // _GRID) + 1):
            for gy in range(int(r.y0 // _GRID), int(r.y1 // _GRID) + 1):
                g.setdefault((gx, gy), []).append(p)
    return g


def _near(grid, W: fitz.Rect):
    seen = set()
    out = []
    for gx in range(int(W.x0 // _GRID), int(W.x1 // _GRID) + 1):
        for gy in range(int(W.y0 // _GRID), int(W.y1 // _GRID) + 1):
            for p in grid.get((gx, gy), ()):
                if id(p) not in seen:
                    seen.add(id(p))
                    out.append(p)
    return out


def _items(pg: fitz.Page, maxsz: float):
    """Every small line/curve item on the page as (rect, is_line, is_curve)."""
    k = (id(pg.parent), pg.number)
    if k in _ITEM_CACHE:
        return _ITEM_CACHE[k]
    M = pg.rotation_matrix
    out = []
    for p in drawings(pg):
        for it in p["items"]:
            if it[0] == "l":
                a, b = it[1] * M, it[2] * M
                r = fitz.Rect(min(a.x, b.x), min(a.y, b.y), max(a.x, b.x), max(a.y, b.y))
                if r.width <= maxsz and r.height <= maxsz:
                    out.append((r, 1, 0))
            elif it[0] == "c":
                pts = [q * M for q in it[1:5]]
                r = fitz.Rect(min(q.x for q in pts), min(q.y for q in pts), max(q.x for q in pts), max(q.y for q in pts))
                if r.width <= maxsz and r.height <= maxsz:
                    out.append((r, 0, 1))
    _ITEM_CACHE[k] = (out, _grid_index(out))
    return _ITEM_CACHE[k]


def _composite(tl, pieces, max_shape: float):
    """
    Symbol drawn as several small paths (Valvoline: a pill = two half-circle
    paths + two line paths).  Pieces must surround the text on all four sides.
    """
    r = tl.r
    W = fitz.Rect(r.x0 - 16, r.y0 - 12, r.x1 + 16, r.y1 + 12)
    c = tl.center
    _, grid = pieces
    near = [p for p in _near(grid, W) if W.contains(p[0]) and not p[0].contains(r)]
    # a hexagon drawn as loose diagonal strokes: four diagonals around the text,
    # whatever else (walls, door swings) happens to be nearby
    diag = [p for p in near if p[1] and p[0].width > 2 and p[0].height > 2]
    if 4 <= len(diag) <= 8:
        u = fitz.Rect(diag[0][0])
        for p in diag[1:]:
            u |= p[0]
        if u.contains(c) and u.width <= max_shape and u.height <= max_shape and u.width >= r.width \
                and sum(1 for p in diag if (p[0].y0 + p[0].y1) / 2 < c.y) >= 2 and sum(1 for p in diag if (p[0].y0 + p[0].y1) / 2 > c.y) >= 2:
            return u, len(diag) + 2, 0, "hexagon"
    # an ellipse / circle drawn as a ring of short straight segments (Curtis door tags)
    short = [p for p in near if p[1] and max(p[0].width, p[0].height) <= max(6.0, 0.4 * max(r.width, r.height))]
    if len(short) >= 10:
        ring = [p for p in short if not fitz.Rect(r.x0 + 1, r.y0 + 1, r.x1 - 1, r.y1 - 1).intersects(p[0])]
        if len(ring) >= 10:
            u = fitz.Rect(ring[0][0])
            for p in ring[1:]:
                u |= p[0]
            def _cxy(q):
                return (q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2
            sides = (any(_cxy(p[0])[0] < c.x - r.width * 0.3 for p in ring), any(_cxy(p[0])[0] > c.x + r.width * 0.3 for p in ring),
                     any(_cxy(p[0])[1] < c.y - r.height * 0.3 for p in ring), any(_cxy(p[0])[1] > c.y + r.height * 0.3 for p in ring))
            if all(sides) and u.contains(c) and u.width <= max_shape * 1.3 and u.height <= max_shape * 1.3:
                return u, len(ring), 0, "ellipse"
    if len(near) < 3 or len(near) > 40:
        return None
    qx, qy = r.width * 0.25, r.height * 0.25
    def cxy(q):
        return (q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2
    left = any(cxy(p[0])[0] <= c.x - qx for p in near)
    right = any(cxy(p[0])[0] >= c.x + qx for p in near)
    above = any(cxy(p[0])[1] <= c.y - qy for p in near)
    below = any(cxy(p[0])[1] >= c.y + qy for p in near)
    if not (left and right and above and below):
        return None
    u = fitz.Rect(near[0][0])
    for p in near[1:]:
        u |= p[0]
    if u.width > max_shape or u.height > max_shape or u.height < 6 or u.width < 6:
        return None
    n = sum(p[1] for p in near)
    cv = sum(p[2] for p in near)
    if cv >= 2:
        kind = "pill"
    else:
        diag = sum(1 for p in near if p[1] and p[0].width > 2 and p[0].height > 2)
        kind = "hexagon" if 4 <= diag <= 8 and n <= 8 and u.width > u.height * 1.2 else "composite"
    return u, n, cv, kind


def find_tags(pg: fitz.Page, pattern: str = MARK_PATTERN, kinds=("hexagon", "circle", "diamond", "pill", "ellipse"),
              max_size: float = 10.0, max_shape: float = 40.0) -> list[Tag]:
    pat = re.compile(pattern)
    shapes = _shapes_with_items(pg, max_shape)
    sgrid = _grid_index(shapes)
    pieces = _items(pg, max_shape)
    res: list[Tag] = []
    seen: set[tuple] = set()
    for tl in text_lines(pg):
        t = tl.text.strip()
        if tl.size >= max_size or not pat.fullmatch(t):
            continue
        c = tl.center
        tw, th = tl.rect[2] - tl.rect[0], tl.rect[3] - tl.rect[1]
        enc = [s for s in _near(sgrid, fitz.Rect(c.x - 1, c.y - 1, c.x + 1, c.y + 1)) if s[0].contains(c) and s[0].width <= max_shape
               # a fill-only box that hugs the text is a mask behind it, not the symbol
               and not (s[5] and s[0].width <= tw + 4 and s[0].height <= th + 4)
               and s[0].contains(fitz.Rect(tl.rect).irect if False else fitz.Rect(c.x - 0.3 * (tl.rect[2] - tl.rect[0]), c.y - 0.3 * (tl.rect[3] - tl.rect[1]), c.x + 0.3 * (tl.rect[2] - tl.rect[0]), c.y + 0.3 * (tl.rect[3] - tl.rect[1])))]
        if enc:
            enc.sort(key=lambda s: s[0].width * s[0].height)
            r, n, cv, nre, items, _fo = enc[0]
            kind = _kind(n, cv, nre, items)
        else:
            comp = _composite(tl, pieces, max_shape)
            if comp is None:
                continue
            r, n, cv, kind = comp
        if kinds and kind not in kinds:
            continue
        key = (t, round(r.x0), round(r.y0))
        if key in seen:
            continue
        seen.add(key)
        res.append(Tag(t, [round(v, 1) for v in tl.rect], [round(v, 1) for v in r], kind, n, cv))
    return res


def tag_census(pg: fitz.Page, pattern: str = MARK_PATTERN, kinds=("hexagon", "circle", "diamond", "pill", "ellipse")) -> dict[str, list[Tag]]:
    """Tags grouped by text — the plan count."""
    out: dict[str, list[Tag]] = {}
    for t in find_tags(pg, pattern, kinds):
        out.setdefault(t.text, []).append(t)
    return out


def dominant_kind(tags: list[Tag]) -> str | None:
    from collections import Counter
    if not tags:
        return None
    return Counter(t.kind for t in tags).most_common(1)[0][0]
