"""
translucent.py — translucent wall panels on elevations.  They are not tagged
like storefront: a note ("TRANSLUCENT PANEL SYSTEM") with leader arrows points
into a ribbed panel.  Martin takes each bay off as an Area, pier to pier, with
the sloped top.

  1. note → shoulder → leaders → arrow tips          (leader_tips)
  2. at a tip, vertical elements across that height: ribs are single / tight
     pairs (≈0.5 pt), the panel frame is a pair ≈1–2 pt apart
  3. walk the ribs both ways to the frame pairs → one bay; hop across each
     pier/mullion to the next frame pair while ribs resume behind it → the
     row of bays
  4. bay polygon from the outer frame lines' tops/bottoms (sloped top kept)

    find_panels(pg, ppf) -> [{"poly": [[x,y]...], "rect", "w_in", "h_in", "sf", "note"}]
"""
from __future__ import annotations

import math
import re

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

from .pdfgeom import text_lines, segments, _key

NOTE = re.compile(r"TRANSLUCENT\s+(WALL\s+)?PANEL", re.I)
_VC: dict = {}
_DEBUG: list = []


def _d(a, b) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


def leader_tips(pg: fitz.Page, R: fitz.Rect) -> list[fitz.Point]:
    """Arrow tips of the leaders leaving a note (shoulder off the left/right side, then one or more leaders)."""
    segs = segments(pg)
    cy = (R.y0 + R.y1) / 2
    tips: list[fitz.Point] = []
    for a, b in segs:
        for p, q in ((a, b), (b, a)):
            if abs(p.y - cy) <= 4 and abs(q.y - p.y) <= 2 and 4 <= _d(p, q) <= 80 and (
                    (0 <= R.x0 - p.x <= 16 and q.x < p.x) or (0 <= p.x - R.x1 <= 16 and q.x > p.x)):
                for c, e in segs:
                    for s, t in ((c, e), (e, c)):
                        if _d(s, q) <= 1.5 and _d(s, t) > 20 and abs(t.y - q.y) > 2:
                            if all(_d(t, u) > 3 for u in tips):
                                tips.append(t)
    return tips


def _verticals(pg: fitz.Page):
    """Vertical segments, collinear pieces stitched (ribs are broken at every horizontal line)."""
    k = _key(pg)
    if k not in _VC:
        raw = sorted(((round((a.x + b.x) / 2, 1), min(a.y, b.y), max(a.y, b.y)) for a, b in segments(pg)
                      if abs(a.x - b.x) < 0.5 and abs(a.y - b.y) > 1.0), key=lambda v: v[0])
        groups: list[list] = []
        for v in raw:
            if groups and v[0] - groups[-1][-1][0] <= 0.15:
                groups[-1].append(v)
            else:
                groups.append([v])
        out: list[list] = []
        for g in groups:
            x = sum(v[0] for v in g) / len(g)
            run = None
            for _x, y0, y1 in sorted(g, key=lambda v: v[1]):
                if run and y0 <= run[2] + 2.5:
                    run[2] = max(run[2], y1)
                else:
                    run = [x, y0, y1]
                    out.append(run)
        _VC[k] = [tuple(v) for v in out if v[2] - v[1] > 6]
    return _VC[k]


def _elements(pg: fitz.Page, y: float, minh: float):
    """Vertical lines crossing height y, clustered (≤0.8 pt) → (x, top, bottom)."""
    cross = sorted((v for v in _verticals(pg) if v[1] - 2 <= y <= v[2] + 2 and v[2] - v[1] >= minh), key=lambda v: v[0])
    el: list[list] = []
    for x, y0, y1 in cross:
        if el and x - el[-1][3] <= 1.0:
            e = el[-1]
            e[1], e[2], e[3] = min(e[1], y0), max(e[2], y1), x
        else:
            el.append([x, y0, y1, x])           # x0, top, bottom, x1
    return el


def _bays_from(pg: fitz.Page, tip: fitz.Point, ppf: float) -> list[tuple]:
    el = _elements(pg, tip.y, 2.0 * ppf)
    if len(el) < 6:
        return []
    xs = [(e[0] + e[3]) / 2 for e in el]
    gaps = [xs[i + 1] - xs[i] for i in range(len(xs) - 1)]
    frame = set()
    for i, g in enumerate(gaps):
        p, q = el[i], el[i + 1]
        # double frame line: both lines run the same full height (a dashed grid line crossing a rib doesn't)
        if 1.0 <= q[0] - p[3] <= 2.2 and abs(p[1] - q[1]) <= 3 and abs(p[2] - q[2]) <= 3:
            frame.update({i, i + 1})
    # a line that runs on past the ribs beside it (top or bottom) is a frame / pier line, not a rib
    def _sim(p, q):
        return abs(p[1] - q[1]) <= 3 and abs(p[2] - q[2]) <= 3
    for i in range(len(el)):
        b = el[i]
        for n, nn in ((i - 1, i - 2), (i + 1, i + 2)):
            if 0 <= n < len(el) and 0 <= nn < len(el) and _sim(el[n], el[nn]) and abs(xs[n] - xs[i]) <= 8:
                covers = b[1] <= el[n][1] + 2.0 and b[2] >= el[n][2] - 2.0
                if covers and (b[1] < el[n][1] - 2.0 or b[2] > el[n][2] + 2.0):
                    frame.add(i)
    i0 = min(range(len(xs)), key=lambda k: abs(xs[k] - tip.x))
    near = [g for g in gaps[max(0, i0 - 6):i0 + 6] if g > 2.2]
    if not near:
        return []
    s = sorted(near)[len(near) // 2]                      # rib spacing

    def bay(i):
        """bay containing element i (a rib) → (left outer frame idx, right outer frame idx) or None"""
        lo = i
        while lo > 0 and lo not in frame:
            if xs[lo] - xs[lo - 1] > 1.6 * s:
                return None
            lo -= 1
        hi = i
        while hi < len(xs) - 1 and hi not in frame:
            if xs[hi + 1] - xs[hi] > 1.6 * s:
                return None
            hi += 1
        if lo not in frame or hi not in frame:
            return None
        while lo - 1 in frame and xs[lo] - xs[lo - 1] <= 2.2:
            lo -= 1
        while hi + 1 in frame and xs[hi + 1] - xs[hi] <= 2.2:
            hi += 1
        if hi - lo < 6:
            return None
        return lo, hi

    if i0 in frame:
        i0 = i0 + 1 if i0 + 1 < len(xs) and i0 + 1 not in frame else i0 - 1
    first = bay(i0)
    if not first:
        return []
    fr = [el[i] for i in range(first[0], first[1] + 1) if i not in frame]
    hmin = 0.5 * min(r[2] - r[1] for r in fr)
    # the seed bay's bottom line (it may slope); every rib run in the row with the same
    # spacing standing on that line is a bay
    fa, fb = fr[0], fr[-1]
    xa_, xb_ = (fa[0] + fa[3]) / 2, (fb[0] + fb[3]) / 2
    slope = (fb[2] - fa[2]) / (xb_ - xa_) if xb_ > xa_ else 0.0
    def bline(x):
        return fa[2] + slope * (x - xa_)
    bottom = bline(xa_)
    ribish = [i not in frame and abs(el[i][2] - bline(xs[i])) <= 3 and el[i][2] - el[i][1] >= hmin for i in range(len(el))]
    out = []
    i = 0
    while i < len(el):
        if not ribish[i]:
            i += 1
            continue
        j = i
        while True:
            # next rib, bridging tags / leaders that interrupt the ribs (but never a frame line)
            k = j + 1
            while k < len(el) and not ribish[k] and k not in frame and xs[k] - xs[j] <= 5 * s:
                k += 1
            if k < len(el) and ribish[k] and 0.6 * s <= xs[k] - xs[j] <= 5 * s and \
                    (xs[k] - xs[j] <= 1.4 * s or all(m not in frame for m in range(j + 1, k))):
                j = k
            else:
                break
        if j - i + 1 >= 6:
            lo, hi = i, j
            # out to the frame on each side (first line within 1.6 spacings, then its double)
            if lo > 0 and xs[lo] - xs[lo - 1] <= 1.6 * s and not ribish[lo - 1]:
                lo -= 1
                if lo > 0 and 1.0 <= xs[lo] - xs[lo - 1] <= 2.2 and not ribish[lo - 1]:
                    lo -= 1                                  # the frame's second line
            if hi < len(el) - 1 and xs[hi + 1] - xs[hi] <= 1.6 * s and not ribish[hi + 1]:
                hi += 1
                if hi < len(el) - 1 and 1.0 <= xs[hi + 1] - xs[hi] <= 2.2 and not ribish[hi + 1]:
                    hi += 1
            if lo < i and hi > j:
                out.append((lo, hi))
        i = j + 1
    res = []
    for a, b in sorted(out):
        ribs = [el[i] for i in range(a + 1, b) if ribish[i]]
        if len(ribs) < 4:
            continue
        res.append((el[a], el[b], ribs))
    return res


def find_panels(pg: fitz.Page, ppf: float, misses: list | None = None) -> list[dict]:
    res: list[dict] = []
    seen = []
    for t in text_lines(pg):
        if not NOTE.search(t.text):
            continue
        n_before = len(res)
        for tip in leader_tips(pg, fitz.Rect(t.rect)):
            for L, Rt, ribs in _bays_from(pg, tip, ppf):
                x0, x1 = L[0], Rt[3]
                # heights from the ribs (outer frame lines often run on down the pier), top line extended to the frame
                ra, rb = ribs[0], ribs[-1]
                xa, xb = (ra[0] + ra[3]) / 2, (rb[0] + rb[3]) / 2
                def at(x, ya, yb):
                    return ya + (yb - ya) * (x - xa) / (xb - xa) if xb > xa else ya
                tl, tr = at(x0, ra[1], rb[1]), at(x1, ra[1], rb[1])
                bl, br = at(x0, ra[2], rb[2]), at(x1, ra[2], rb[2])
                # ribs must agree with each other: a straight top and bottom
                if any(abs(at((r[0] + r[3]) / 2, ra[1], rb[1]) - r[1]) > 3 or abs(at((r[0] + r[3]) / 2, ra[2], rb[2]) - r[2]) > 3 for r in ribs):
                    continue
                # Martin measures to the outside of the panel frame: the head / sill lines just
                # outside the rib ends (within 4 pt, following the slope)
                def _shift(ya, yb, up):
                    best = 0.0
                    for a, b in segments(pg):
                        if abs(a.x - b.x) < 2:
                            continue
                        lo_, hi_ = min(a.x, b.x), max(a.x, b.x)
                        if min(hi_, x1) - max(lo_, x0) < 0.5 * (x1 - x0):
                            continue
                        xm = (max(lo_, x0) + min(hi_, x1)) / 2
                        ym = a.y + (b.y - a.y) * (xm - a.x) / (b.x - a.x)
                        yr = ya + (yb - ya) * (xm - x0) / (x1 - x0)
                        d = (yr - ym) if up else (ym - yr)
                        if 0.3 <= d <= 4.0:
                            best = max(best, d)
                    return best
                dt, db = _shift(tl, tr, True), _shift(bl, br, False)
                tl, tr, bl, br = tl - dt, tr - dt, bl + db, br + db
                key = (round(x0), round(x1), round(bl))
                if any(abs(key[0] - k[0]) < 3 and abs(key[1] - k[1]) < 3 and abs(key[2] - k[2]) < 3 for k in seen):
                    continue
                seen.append(key)
                w_in = (x1 - x0) / ppf * 12
                if w_in < 72:                       # slivers between louvers / mullions are not bays
                    continue
                hl, hr = (bl - tl) / ppf * 12, (br - tr) / ppf * 12
                sf = round(w_in * (hl + hr) / 2 / 144, 1)
                res.append({"poly": [[round(x0, 1), round(tl, 1)], [round(x1, 1), round(tr, 1)], [round(x1, 1), round(br, 1)], [round(x0, 1), round(bl, 1)]],
                            "rect": [round(x0, 1), round(min(tl, tr), 1), round(x1, 1), round(max(bl, br), 1)],
                            "w_in": round(w_in, 1), "h_in": round(max(hl, hr), 1), "sf": sf, "note": t.text.strip(),
                            "note_rect": [round(v, 1) for v in t.rect]})
        if misses is not None and len(res) == n_before:
            misses.append({"note": t.text.strip(), "rect": [round(v, 1) for v in t.rect]})
    # overlapping bays from different arrows: keep the larger
    res.sort(key=lambda p: -p["sf"])
    keep: list[dict] = []
    for p in res:
        P = fitz.Rect(p["rect"])
        if any((P & fitz.Rect(q["rect"])).get_area() > 0.5 * P.get_area() for q in keep):
            continue
        keep.append(p)
    return keep
