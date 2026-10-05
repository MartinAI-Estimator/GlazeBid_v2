"""
pdfgeom.py — rotation-safe text and vector geometry from a PyMuPDF page.

Everything here returns coordinates in ROTATED page space (what the viewer
shows, what annotation rects use, what get_pixmap(clip=) uses).  PyMuPDF's
get_text("dict") and get_drawings() return UNROTATED coordinates, so every
bbox and point is multiplied by page.rotation_matrix exactly once, here.
(Valvoline finding, 2026-10-05: 18 of 19 A-sheets stored rotated 90°; the
July pipeline never applied the matrix and every snap landed off the page.)

Primitives (all pure PyMuPDF, no model calls):

    TextLine        one text line: rect, text, font size, direction
    text_lines(pg)  every text line on the page (cached per page)
    segments(pg)    every straight vector segment as (p0, p1) (cached)
    long_lines(pg, win, minlen, tol)   vertical / horizontal runs clipped to win
    rect_candidates(pg, win, minlen)   closed rectangles formed by two vertical
                                       and two horizontal runs
    dedupe(rects)                      drop near-duplicate rects
    type_frames(pg, head_xy, xmax, ...) the frame rectangle(s) of a schedule
                                        type drawing sitting on its floor line
    mullion_positions(pg, rect)        bays / rows from vertical and horizontal
                                       lines spanning most of the rect
    small_shapes(pg, maxsz)            closed callout symbols (hexagons, circles)
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache
from typing import Iterable

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz


# ── Text ──────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class TextLine:
    rect: tuple[float, float, float, float]
    text: str
    size: float
    vertical: bool   # line direction is vertical (rotated text)

    @property
    def r(self) -> fitz.Rect:
        return fitz.Rect(*self.rect)

    @property
    def center(self) -> fitz.Point:
        return fitz.Point((self.rect[0] + self.rect[2]) / 2, (self.rect[1] + self.rect[3]) / 2)


_TEXT_CACHE: dict[tuple[int, int], list[TextLine]] = {}
_SEG_CACHE: dict[tuple[int, int], list] = {}
_DRAW_CACHE: dict[tuple[int, int], list] = {}


def _key(pg: fitz.Page) -> tuple[int, int]:
    return (id(pg.parent), pg.number)


def clear_cache() -> None:
    _TEXT_CACHE.clear()
    _SEG_CACHE.clear()
    _DRAW_CACHE.clear()


def text_lines(pg: fitz.Page) -> list[TextLine]:
    """Every text line on the page, rotated into page space."""
    k = _key(pg)
    if k in _TEXT_CACHE:
        return _TEXT_CACHE[k]
    M = pg.rotation_matrix
    rot = pg.rotation
    out: list[TextLine] = []
    for b in pg.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            t = "".join(s["text"] for s in l["spans"]).strip()
            if not t:
                continue
            r = fitz.Rect(l["bbox"]) * M
            r.normalize()
            d = l.get("dir", (1, 0))
            vert = abs(d[0]) < 0.5
            if rot in (90, 270):
                vert = not vert
            out.append(TextLine((r.x0, r.y0, r.x1, r.y1), t, float(l["spans"][0]["size"]), vert))
    _TEXT_CACHE[k] = out
    return out


def text_in(pg: fitz.Page, win, max_size: float | None = None) -> list[TextLine]:
    W = fitz.Rect(*win) if not isinstance(win, fitz.Rect) else win
    return [t for t in text_lines(pg) if W.intersects(t.r) and (max_size is None or t.size <= max_size)]


# ── Vector segments ───────────────────────────────────────────────────────────

def drawings(pg: fitz.Page) -> list:
    k = _key(pg)
    if k not in _DRAW_CACHE:
        _DRAW_CACHE[k] = pg.get_drawings()
    return _DRAW_CACHE[k]


def segments(pg: fitz.Page) -> list[tuple[fitz.Point, fitz.Point]]:
    """Every straight segment on the page (lines + rectangle edges), rotated."""
    k = _key(pg)
    if k in _SEG_CACHE:
        return _SEG_CACHE[k]
    M = pg.rotation_matrix
    segs: list[tuple[fitz.Point, fitz.Point]] = []
    for p in drawings(pg):
        for it in p["items"]:
            if it[0] == "l":
                segs.append((it[1] * M, it[2] * M))
            elif it[0] == "re":
                rc = fitz.Rect(it[1]) * M
                rc.normalize()
                a, b, c, d = (fitz.Point(rc.x0, rc.y0), fitz.Point(rc.x1, rc.y0),
                              fitz.Point(rc.x1, rc.y1), fitz.Point(rc.x0, rc.y1))
                segs += [(a, b), (b, c), (d, c), (a, d)]
    _SEG_CACHE[k] = segs
    return segs


def long_lines(pg: fitz.Page, win, minlen: float = 60, tol: float = 1.0):
    """
    Vertical runs as (x, y0, y1) and horizontal runs as (y, x0, x1), each
    CLIPPED to the window (not required to be inside it — a 200' ground line
    still closes a 10' frame).  McLarty bug 3.
    """
    R = fitz.Rect(*win) if not isinstance(win, fitz.Rect) else win
    vs, hs = [], []
    for a, b in segments(pg):
        if abs(a.x - b.x) < tol and abs(a.y - b.y) >= minlen:
            if not (R.x0 <= a.x <= R.x1):
                continue
            y0 = max(min(a.y, b.y), R.y0)
            y1 = min(max(a.y, b.y), R.y1)
            if y1 - y0 >= minlen:
                vs.append((round(a.x, 1), round(y0, 1), round(y1, 1)))
        elif abs(a.y - b.y) < tol and abs(a.x - b.x) >= minlen:
            if not (R.y0 <= a.y <= R.y1):
                continue
            x0 = max(min(a.x, b.x), R.x0)
            x1 = min(max(a.x, b.x), R.x1)
            if x1 - x0 >= minlen:
                hs.append((round(a.y, 1), round(x0, 1), round(x1, 1)))
    return sorted(set(vs)), sorted(set(hs))


def _merge_runs(runs, tol: float = 0.6):
    """Merge collinear runs at the same coordinate (hatch and double lines) into one span."""
    out = []
    for c, a0, a1 in sorted(runs):
        if out and abs(out[-1][0] - c) <= tol and a0 <= out[-1][2] + 2:
            out[-1] = (out[-1][0], min(out[-1][1], a0), max(out[-1][2], a1))
        else:
            out.append((c, a0, a1))
    return out


def rect_candidates(pg: fitz.Page, win, minlen: float = 50, tol: float = 2.0,
                    expect: tuple[float, float] | None = None, span: float = 1.6) -> list[fitz.Rect]:
    """
    Closed rectangles formed by two vertical and two horizontal runs, largest first.
    expect=(w_pt, h_pt) limits the search to rectangles within 1/span … span of
    that size (the schedule size at the sheet scale) — elevations with brick
    hatch have thousands of lines and the full pair search is quadratic.
    """
    vs, hs = long_lines(pg, win, minlen)
    # (runs are NOT merged: a frame's edge is often the endpoint of a shorter run
    #  that shares x with a longer line — merging would lose the lower frame)
    # index horizontals by rounded y for O(1) top/bottom lookups
    hidx: dict[int, list] = {}
    for h in hs:
        for yy in (int(h[0] // tol) - 1, int(h[0] // tol), int(h[0] // tol) + 1):
            hidx.setdefault(yy, []).append(h)
    wlo, whi, hlo, hhi = (minlen, 1e9, minlen, 1e9)
    if expect:
        wlo, whi = max(minlen, expect[0] / span), expect[0] * span
        hlo, hhi = max(minlen, expect[1] / span), expect[1] * span

    def closed(y, xa, xb):
        return any(abs(h[0] - y) < tol and h[1] <= xa + tol and h[2] >= xb - tol for h in hidx.get(int(y // tol), ()))

    rects: list[fitz.Rect] = []
    for i in range(len(vs)):
        xa, ya0, ya1 = vs[i]
        for j in range(i + 1, len(vs)):
            xb, yb0, yb1 = vs[j]
            w = xb - xa
            if w < wlo:
                continue
            if w > whi:
                break
            y0 = max(ya0, yb0)
            y1 = min(ya1, yb1)
            if y1 - y0 < hlo or y1 - y0 > hhi * 2:
                continue
            if closed(y0, xa, xb) and closed(y1, xa, xb):
                rects.append(fitz.Rect(xa, y0, xb, y1))
    rects.sort(key=lambda r: -(r.width * r.height))
    return rects


def dedupe(rects: Iterable[fitz.Rect], tol: float = 4) -> list[fitz.Rect]:
    out: list[fitz.Rect] = []
    for r in rects:
        if any(abs(r.x0 - s.x0) < tol and abs(r.y0 - s.y0) < tol and
               abs(r.x1 - s.x1) < tol and abs(r.y1 - s.y1) < tol for s in out):
            continue
        out.append(r)
    return out


def is_dim_box(pg: fitz.Page, r: fitz.Rect) -> bool:
    """
    A narrow 'rectangle' closed by a dimension string's extension lines: under
    80 pt wide with a rotated dimension text centred inside it.
    """
    from .units import parse_dim
    if r.width > 80:
        return False
    cx = (r.x0 + r.x1) / 2
    if not any(t.vertical and r.contains(t.center) and abs(t.center.x - cx) < 0.3 * r.width
               and parse_dim(t.text) is not None for t in text_lines(pg)):
        return False
    # a real frame has content inside (door leaf, glass lines); a dimension box has only ticks
    inner = fitz.Rect(r.x0 + 3, r.y0 + 3, r.x1 - 3, r.y1 - 3)
    n = 0
    for a, b in segments(pg):
        if inner.contains(a) and inner.contains(b) and max(abs(a.x - b.x), abs(a.y - b.y)) >= 10:
            n += 1
            if n >= 4:
                return False
    return True


def type_frames(pg: fitz.Page, head_xy, xmax: float, floor_tol: float = 70,
                up: float = 620, minlen: float = 24, gap: float = 6) -> list[fitz.Rect]:
    """
    Frames of a pictorial-schedule type drawing: the widest closed rectangle
    (or run of side-by-side rectangles — all-glass panels, frames split by a
    column) whose bottom sits on the floor line just above the mark/description
    label, plus any rectangles stacked directly above it (transoms, upper frames).
    """
    x, y = head_xy
    rc = dedupe(rect_candidates(pg, (x - 40, y - up, xmax, y - 8), minlen=minlen))
    rc = [r for r in rc if not is_dim_box(pg, r)]
    rc = union_adjacent(rc, gap=gap, ytol=4)
    base = [r for r in rc if y - floor_tol <= r.y1 <= y - 8]
    if not base:   # windows sit above the floor line
        base = [r for r in rc if y - 2 * floor_tol <= r.y1 <= y - 8 and r.width >= 2 * minlen]
    if not base:
        return []
    base.sort(key=lambda r: -r.width)
    b = base[0]
    frames = [b]
    cur = b
    for _ in range(6):
        above = [r for r in rc if abs(r.x0 - cur.x0) < 6 and abs(r.x1 - cur.x1) < 6 and 0 <= cur.y0 - r.y1 <= 30]
        if not above:
            break
        above.sort(key=lambda r: -r.height)
        cur = above[0]
        frames.append(cur)
    return frames


def union_adjacent(rects: list[fitz.Rect], gap: float = 5, ytol: float = 3) -> list[fitz.Rect]:
    """Unions of horizontally adjacent rects sharing their y extents (frames split by a column)."""
    extra: list[fitz.Rect] = []
    for a in rects:
        cur = fitz.Rect(a)
        for _ in range(6):
            nxt = [b for b in rects if abs(b.y0 - cur.y0) < ytol and abs(b.y1 - cur.y1) < ytol and 0 <= b.x0 - cur.x1 <= gap]
            if not nxt:
                break
            nxt.sort(key=lambda b: b.x0)
            cur = cur | nxt[0]
            extra.append(fitz.Rect(cur))
    return dedupe(list(rects) + extra)


def mullion_positions(pg: fitz.Page, rect: fitz.Rect, span_frac: float = 0.6,
                      bucket: float = 3.0, edge_tol: float = 3.0, tol: float = 1.0):
    """
    Interior vertical and horizontal lines spanning ≥ span_frac of the rect:
    returns (xs, ys) of mullion centrelines, excluding the jambs/head/sill.
    Bays = len(xs)+1, rows = len(ys)+1.
    """
    R = fitz.Rect(rect)
    vs, hs = long_lines(pg, R, minlen=min(R.height, R.width) * 0.2, tol=tol)
    xs: list[float] = []
    for x, y0, y1 in vs:
        if x - R.x0 <= edge_tol or R.x1 - x <= edge_tol:
            continue
        if (y1 - y0) >= span_frac * R.height:
            xs.append(x)
    ys: list[float] = []
    for y, x0, x1 in hs:
        if y - R.y0 <= edge_tol or R.y1 - y <= edge_tol:
            continue
        if (x1 - x0) >= span_frac * R.width:
            ys.append(y)
    return _bucket(xs, bucket), _bucket(ys, bucket)


def _bucket(vals: list[float], width: float) -> list[float]:
    out: list[float] = []
    for v in sorted(vals):
        if out and v - out[-1] <= width:
            continue
        out.append(v)
    return out


def small_shapes(pg: fitz.Page, maxsz: float = 40, minsz: float = 6):
    """
    Small closed drawings — callout symbols.  Returns (rect, n_lines, n_curves).
    A hexagon is 6 (sometimes 5) line items; a circle is 4 curve items;
    a revision triangle is 3 lines; a room-number box is a 're' or 4 lines.
    """
    M = pg.rotation_matrix
    out = []
    for p in drawings(pg):
        r = fitz.Rect(p["rect"]) * M
        r.normalize()
        if minsz < r.width <= maxsz and minsz < r.height <= maxsz:
            n = sum(1 for it in p["items"] if it[0] == "l")
            c = sum(1 for it in p["items"] if it[0] == "c")
            re_ = sum(1 for it in p["items"] if it[0] == "re")
            out.append((r, n, c, re_))
    return out


def pt_len(pts: list[fitz.Point]) -> float:
    return sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
