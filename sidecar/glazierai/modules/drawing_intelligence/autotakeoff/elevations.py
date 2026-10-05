"""
elevations.py — snap each tagged opening on an elevation (or wall elevation)
to the vector rectangle that matches its schedule size.

For every callout tag on the sheet whose mark is in the schedule:
  1. candidate rectangles within ±400 pt of the tag (closed rects from long
     line pairs, plus unions of side-by-side rects for frames split by a column);
  2. score each against the schedule W×H at the sheet scale:
         err = |w-W|/W + 2*|h-H|/H  (+0.5 if the tag centre is outside)
     height is weighted double — widths get cut by adjoining walls, heights do not;
  3. the best rect is the opening; rects stacked directly above it are the
     transom / upper frame when the schedule has more than one frame;
  4. err > 0.2 → "unsure": drawn dashed, flagged, no Area.

Scale = region scale string → page scale → default (⅛" = 9 pt/ft).
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

from .pdfgeom import rect_candidates, dedupe, union_adjacent, mullion_positions
from .tags import find_tags, Tag
from .units import region_ppf, page_ppf

UNSURE = 0.2


@dataclass
class ElevSnap:
    mark: str
    sheet: str
    page: int
    tag_rect: list
    tag_kind: str
    frames: list = field(default_factory=list)   # [{rect, w_in, h_in, err, bays, rows}]
    ppf: float | None = None
    unsure: bool = False
    note: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def mark_kind(pg: fitz.Page, marks, alias: dict | None = None,
              kinds=("hexagon", "circle", "pill", "diamond", "rect")) -> str | None:
    """
    The callout-symbol kind the job uses for door/frame marks on this page: the
    kind under which the most DISTINCT schedule marks appear.  Grid bubbles and
    keynotes reuse the same numbers in another symbol and must not count.
    """
    alias = alias or {}
    marks = set(marks)
    per: dict[str, set] = {}
    for t in find_tags(pg, kinds=kinds):
        key = alias.get(t.text, t.text)
        if key in marks:
            per.setdefault(t.kind, set()).add(key)
    if not per:
        return None
    return max(per.items(), key=lambda kv: len(kv[1]))[0]


def snap_elevation(pg: fitz.Page, sheet: str, sched: dict[str, list[tuple[float, float]]],
                   alias: dict[str, str] | None = None, default_ppf: float = 9.0,
                   kinds=None, reach: float = 400) -> list[ElevSnap]:
    """
    sched: {mark: [(W_in, H_in), ...]} — one tuple per stacked frame, bottom first.
    alias: tag text → schedule key ("17" → "17-19").
    kinds: callout symbol kinds to accept; None = the dominant kind on this page.
    """
    alias = alias or {}
    if kinds is None:
        k = mark_kind(pg, sched.keys(), alias)
        kinds = (k,) if k else ()
    tags = [t for t in find_tags(pg, kinds=kinds) if alias.get(t.text, t.text) in sched]
    out: list[ElevSnap] = []
    page_scale = page_ppf(pg, default_ppf)
    for t in tags:
        c = t.center
        key = alias.get(t.text, t.text)
        want = sched[key]
        snap = ElevSnap(key, sheet, pg.number, t.shape, t.kind)
        if not want or not want[0][0] or not want[0][1]:
            snap.note = "no schedule size to match"
            out.append(snap)
            continue
        W0, H0 = want[0]
        ppf0 = page_scale or default_ppf
        exp = (W0 / 12 * ppf0, H0 / 12 * ppf0)
        htot = sum(h for _, h in want) / 12 * ppf0
        reach_x = max(120.0, exp[0] * 1.3)
        reach_y = max(120.0, htot * 1.3)
        win = fitz.Rect(c.x - reach_x, c.y - reach_y, c.x + reach_x, c.y + reach_y * 0.8)
        # pieces may be a fraction of the frame (split by a column), so search down to 1/4 of it
        rc = dedupe(rect_candidates(pg, win, minlen=12, expect=exp, span=4.0))
        rc = [q for q in rc if q.width >= 12 and q.height >= 12]
        rc = union_adjacent(rc, gap=5, ytol=3)
        scored = []
        for q in rc:
            if not (q.x0 - 30 <= c.x <= q.x1 + 30 and q.y0 - 60 <= c.y <= q.y1 + 60):
                continue
            ppf = region_ppf(pg, q, page_scale) or default_ppf
            w = q.width / ppf * 12
            h = q.height / ppf * 12
            err = abs(w - W0) / W0 + 2 * abs(h - H0) / H0
            if not q.contains(c):
                err += 0.5
            scored.append((err, q, ppf, w, h))
        scored.sort(key=lambda s: s[0])
        if not scored:
            snap.note = "no rectangle near the tag"
            out.append(snap)
            continue
        err, q, ppf, w, h = scored[0]
        snap.ppf = ppf
        xs, ys = mullion_positions(pg, q)
        snap.frames.append({"rect": [round(v, 1) for v in q], "w_in": round(w, 2), "h_in": round(h, 2),
                            "err": round(err, 3), "bays": len(xs) + 1, "rows": len(ys) + 1})
        cur = q
        for Wi, Hi in want[1:]:
            above = [a for a in rc if abs(a.x0 - cur.x0) < 8 and abs(a.x1 - cur.x1) < 8 and 0 <= cur.y0 - a.y1 <= 40]
            if not above:
                break
            above.sort(key=lambda a: -a.height)
            a = above[0]
            wa, ha = a.width / ppf * 12, a.height / ppf * 12
            xs, ys = mullion_positions(pg, a)
            snap.frames.append({"rect": [round(v, 1) for v in a], "w_in": round(wa, 2), "h_in": round(ha, 2),
                                "err": round(abs(wa - Wi) / Wi + abs(ha - Hi) / Hi, 3),
                                "bays": len(xs) + 1, "rows": len(ys) + 1})
            cur = a
        snap.unsure = err > UNSURE
        if snap.unsure:
            snap.note = f"elevation rectangle disagrees with schedule (err {err:.2f}) — review"
        out.append(snap)
    return out


def sched_sizes(entries) -> tuple[dict, dict]:
    """
    Build the {mark: [(W,H),...]} table and the alias map from ScheduleEntry
    objects (pictorial frames bottom-first; tabular W×H as one frame).
    """
    sched: dict = {}
    alias: dict = {}
    for e in entries:
        if e.frames:
            sizes = [(f["w_in"], f["h_in"]) for f in e.frames]
        elif e.w_in and e.h_in:
            sizes = [(e.w_in, e.h_in)]
        else:
            continue
        sched[e.mark] = sizes
        for m in (e.marks or [e.mark]):
            if m != e.mark:
                alias[m] = e.mark
    return sched, alias


def size_search(pg: fitz.Page, sheet: str, sched: dict[str, list[tuple[float, float]]],
                skip_marks=(), default_ppf: float = 9.0, tol: float = 0.03, max_hits: int = 6) -> list[ElevSnap]:
    """
    Elevations without callout tags (Valvoline): find each scope mark's frame by
    its schedule size alone — closed rectangles within `tol` of W×H at the sheet
    scale.  Flagged "matched by size": the estimator confirms the location.
    Marks that share a size are reported on the same rectangles and flagged.
    """
    ppf = page_ppf(pg, default_ppf) or default_ppf
    out: list[ElevSnap] = []
    page = pg.rect
    taken: list[fitz.Rect] = []
    for mark, want in sched.items():
        if mark in skip_marks or not want or not want[0][0] or not want[0][1]:
            continue
        W0, H0 = want[0]
        exp = (W0 / 12 * ppf, H0 / 12 * ppf)
        if exp[0] < 10 or exp[1] < 10:
            continue
        rc = rect_candidates(pg, page, minlen=10, expect=exp, span=1.0 + tol)
        hits = []
        for q in dedupe(rc):
            if abs(q.width - exp[0]) <= tol * exp[0] + 1 and abs(q.height - exp[1]) <= tol * exp[1] + 1:
                if any(q.intersects(t) for t in taken):
                    continue
                hits.append(q)
        if not hits or len(hits) > max_hits:
            continue
        for q in hits:
            xs, ys = mullion_positions(pg, q)
            sn = ElevSnap(mark, sheet, pg.number, [round(v, 1) for v in q], "size")
            sn.ppf = ppf
            w, h = q.width / ppf * 12, q.height / ppf * 12
            sn.frames.append({"rect": [round(v, 1) for v in q], "w_in": round(w, 2), "h_in": round(h, 2),
                              "err": round(abs(w - W0) / W0 + 2 * abs(h - H0) / H0, 3), "bays": len(xs) + 1, "rows": len(ys) + 1})
            sn.note = "matched by size only (no tag on this elevation) — confirm location"
            out.append(sn)
        taken += hits
    return out
