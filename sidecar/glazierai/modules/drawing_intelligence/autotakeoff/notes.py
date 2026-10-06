"""
notes.py — every leader-arrow note on the elevations (Martin's standing rule:
the architect's pointer note is sometimes the only thing saying what a
material is).

  1. note blocks: small text lines stacked into a note (same left or right edge)
  2. leaders: a shoulder off the block's side, or a leader starting right at
     it; every branch is followed to its tip
  3. the note text is classified with the scope rules (ours / not ours / unknown)
  4. each tip is resolved:
       inside a frame the engine already has   → "confirms" that item (or flags
                                                 a disagreement: note says curtain
                                                 wall, schedule says storefront)
       inside a translucent bay already found  → nothing to add
       anywhere else                           → untagged scope: the smallest
                                                 closed outline around the tip is
                                                 measured; none → yellow flag

    read_notes(pg, ppf) -> [Note]
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field, asdict

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

from .pdfgeom import text_lines, segments, rect_candidates


@dataclass
class Note:
    sheet: str
    page: int
    text: str
    rect: list
    tips: list = field(default_factory=list)          # [[x, y]]
    block: str = ""                                   # the whole stacked text block it came from

    def to_dict(self) -> dict:
        return asdict(self)


def _d(a, b) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


def note_blocks(pg: fitz.Page, max_size: float = 10.0) -> list[tuple[str, fitz.Rect]]:
    """Small text lines stacked into notes (shared left or right edge, tight leading)."""
    lines = sorted((t for t in text_lines(pg) if t.size < max_size and not t.vertical and len(t.text.strip()) >= 3),
                   key=lambda t: (t.rect[1], t.rect[0]))
    blocks: list[list] = []
    for t in lines:
        r = fitz.Rect(t.rect)
        h = r.height
        for b in blocks:
            last = b[-1][1]
            if 0 <= r.y0 - last.y1 <= 0.9 * h and (abs(r.x0 - last.x0) <= 3 or abs(r.x1 - last.x1) <= 3):
                b.append((t.text.strip(), r))
                break
        else:
            blocks.append([(t.text.strip(), r)])
    out = []
    for b in blocks:
        R = fitz.Rect(b[0][1])
        for _, r in b[1:]:
            R |= r
        out.append((" ".join(x for x, _ in b), R, [r for _, r in b]))
    return out


_EP: dict = {}
_G = 24.0


def _endpoints(pg: fitz.Page):
    """Segments bucketed by each endpoint's 24-pt cell: {cell: [(p, q)]} with p the endpoint in that cell."""
    from .pdfgeom import _key
    k = _key(pg)
    if k not in _EP:
        g: dict = {}
        for a, b in segments(pg):
            for p, q in ((a, b), (b, a)):
                g.setdefault((int(p.x // _G), int(p.y // _G)), []).append((p, q))
        _EP[k] = g
    return _EP[k]


def _near_ends(pg, P: fitz.Point, r: float):
    g = _endpoints(pg)
    out = []
    for cx in range(int((P.x - r) // _G), int((P.x + r) // _G) + 1):
        for cy in range(int((P.y - r) // _G), int((P.y + r) // _G) + 1):
            out += g.get((cx, cy), ())
    return out


def leader_tips(pg: fitz.Page, R: fitz.Rect, line_rects: list) -> list[fitz.Point]:
    E = fitz.Rect(R.x0 - 16, R.y0 - 4, R.x1 + 16, R.y1 + 4)
    tips: list[fitz.Point] = []

    def add(t):
        if not E.contains(t) and all(_d(t, u) > 3 for u in tips):
            tips.append(t)

    g = _endpoints(pg)
    cand = []
    for cx in range(int(E.x0 // _G), int(E.x1 // _G) + 1):
        for cy in range(int(E.y0 // _G), int(E.y1 // _G) + 1):
            cand += g.get((cx, cy), ())
    for p, q in cand:
        if not E.contains(p) or (R.contains(p) and R.contains(q)):
            continue
        # starts off a line's side, at that line's height
        if not any(abs(p.y - (lr.y0 + lr.y1) / 2) <= max(4, lr.height) and
                   (0 <= lr.x0 - p.x <= 16 or 0 <= p.x - lr.x1 <= 16) for lr in line_rects):
            continue
        L = _d(p, q)
        if L < 3 or (E.contains(q) and L < 20 and abs(q.y - p.y) > 2):
            continue
        away = (q.x < R.x0 and p.x <= R.x0 + 1) or (q.x > R.x1 and p.x >= R.x1 - 1) or not E.contains(q)
        if not away:
            continue
        if abs(q.y - p.y) <= 2 and L <= 80:
            # shoulder: branches leave its far end
            for s_, t in _near_ends(pg, q, 2):
                if _d(s_, q) <= 1.5 and _d(s_, t) > 20 and abs(t.y - q.y) > 2:
                    add(t)
        elif L > 20:
            add(q)
    return tips


def read_notes(pg: fitz.Page, sheet: str) -> list[Note]:
    """
    Notes with arrows.  Stacked notes share a column with the same leading as a
    note's own lines, so the arrows decide: each line an arrow leaves from starts
    a note, and lines without an arrow join the nearest such line (above first).
    """
    out = []
    for text, R, lrs in note_blocks(pg):
        if not re.search(r"[A-Z]{3}", text):
            continue
        words = text  # whole block text, for single-line blocks
        own = []
        for i, lr in enumerate(lrs):
            t_ = leader_tips(pg, R, [lr])
            if t_:
                own.append((i, t_))
        if not own:
            continue
        if len(own) == 1:
            i, t_ = own[0]
            out.append(Note(sheet, pg.number, words, [round(v, 1) for v in R], [[round(t.x, 1), round(t.y, 1)] for t in t_], words))
            continue
        lines_txt = _block_lines(pg, lrs)
        groups: dict[int, list[int]] = {i: [i] for i, _ in own}
        owners = [i for i, _ in own]
        for j in range(len(lrs)):
            if j in groups:
                continue
            above = [i for i in owners if i < j]
            k = max(above) if above else min(owners, key=lambda i: abs(i - j))
            groups[k].append(j)
        for i, t_ in own:
            js = sorted(groups[i])
            G = fitz.Rect(lrs[js[0]])
            for j in js[1:]:
                G |= lrs[j]
            out.append(Note(sheet, pg.number, " ".join(lines_txt[j] for j in js), [round(v, 1) for v in G],
                            [[round(t.x, 1), round(t.y, 1)] for t in t_], text))
    return out


def _block_lines(pg: fitz.Page, lrs: list) -> list[str]:
    tl = text_lines(pg)
    out = []
    for lr in lrs:
        m = next((t.text.strip() for t in tl if abs(t.rect[0] - lr.x0) < 0.5 and abs(t.rect[1] - lr.y0) < 0.5), "")
        out.append(m)
    return out


def outlines_at(pg: fitz.Page, tip, ppf: float) -> list[fitz.Rect]:
    """Closed outlines (≥ 1'-6" each way, ≤ 80' x 40') around an arrow tip, smallest first."""
    P = fitz.Point(*tip)
    span = 60 * ppf
    win = fitz.Rect(P.x - span, P.y - span / 2, P.x + span, P.y + span / 2)
    try:
        rs = rect_candidates(pg, win, minlen=1.5 * ppf)
    except Exception:
        return []
    rs = [r for r in rs if r.contains(P) and r.width <= 80 * ppf and r.height <= 40 * ppf]
    return sorted(rs, key=lambda r: r.width * r.height)


def outline_at(pg: fitz.Page, tip, ppf: float) -> fitz.Rect | None:
    """Smallest closed outline (≥ 1'-6" each way) around an arrow tip."""
    P = fitz.Point(*tip)
    span = 60 * ppf
    win = fitz.Rect(P.x - span, P.y - span / 2, P.x + span, P.y + span / 2)
    try:
        rs = rect_candidates(pg, win, minlen=1.5 * ppf)
    except Exception:
        return None
    rs = [r for r in rs if r.contains(P) and r.width < 120 * ppf and r.height < 60 * ppf]
    if not rs:
        return None
    return min(rs, key=lambda r: r.width * r.height)


def follow_line(pg, tip, tol=1.2, maxang=100):
    """The drawn line an arrow tip touches, followed both ways through corners (guardrail runs, trims) → points."""
    S=[(a,b) for a,b in segments(pg) if math.hypot(b.x-a.x,b.y-a.y)>2]
    def dist(p,a,b):
        L=math.hypot(b.x-a.x,b.y-a.y); t=max(0,min(1,((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/L**2))
        return math.hypot(a.x+t*(b.x-a.x)-p.x,a.y+t*(b.y-a.y)-p.y)
    # start: longest segment passing within 1.5pt of the tip (not the arrow)
    cand=[(a,b) for a,b in S if dist(tip,a,b)<=1.5 and math.hypot(b.x-a.x,b.y-a.y)>15]
    if not cand: return None
    a,b=max(cand,key=lambda s: math.hypot(s[1].x-s[0].x,s[1].y-s[0].y))
    # skip the leader itself: the leader ends AT the tip
    path=[a,b]; used={(round(a.x,1),round(a.y,1),round(b.x,1),round(b.y,1))}
    def ext(end, prev):
        pts=[]
        while True:
            dx,dy=end.x-prev.x,end.y-prev.y; d0=math.atan2(dy,dx)
            best=None
            for p,q in S:
                for s_,t_ in ((p,q),(q,p)):
                    if math.hypot(s_.x-end.x,s_.y-end.y)<=tol:
                        k=(round(p.x,1),round(p.y,1),round(q.x,1),round(q.y,1))
                        if k in used or (round(q.x,1),round(q.y,1),round(p.x,1),round(p.y,1)) in used: continue
                        ang=abs((math.degrees(math.atan2(t_.y-s_.y,t_.x-s_.x)-d0)+180)%360-180)
                        if ang<=maxang and (best is None or ang<best[0]): best=(ang,s_,t_,k)
            if not best or len(pts)>400: return pts
            used.add(best[3]); pts.append(best[2]); prev,end=end,best[2]
    fwd=ext(b,a); back=ext(a,b)
    pts=list(reversed(back))+[a,b]+fwd
    return pts
