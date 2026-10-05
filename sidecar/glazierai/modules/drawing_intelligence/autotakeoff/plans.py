"""
plans.py — the count.  Door / frame / window tags on floor plans, counted by
mark, using the job's callout symbol kind so room numbers, grid bubbles and
keynotes are not counted.

    census = plan_census(pg, sheet, sched_marks, alias) -> PlanCensus
    PlanCensus.counts: {mark: n}, .tags: {mark: [Tag]}, .kind, .unmatched

A plan tag that is not in any schedule is reported in `unmatched` (with its
symbol kind) so the reviewer can see marks the schedule reader missed.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

from .tags import find_tags, Tag
from .elevations import mark_kind


@dataclass
class PlanCensus:
    sheet: str
    page: int
    kind: str | None
    counts: dict = field(default_factory=dict)
    tags: dict = field(default_factory=dict)       # mark -> [Tag.to_dict()]
    unmatched: dict = field(default_factory=dict)  # tag text -> count (same symbol kind, not in schedule)

    def to_dict(self) -> dict:
        return asdict(self)


def plan_census(pg: fitz.Page, sheet: str, sched_marks, alias: dict | None = None,
                kind: str | None = None) -> PlanCensus:
    alias = alias or {}
    marks = set(sched_marks)
    k = kind or mark_kind(pg, marks, alias)
    pc = PlanCensus(sheet, pg.number, k)
    if not k:
        return pc
    for t in find_tags(pg, kinds=(k,)):
        key = alias.get(t.text, t.text)
        if key in marks:
            pc.counts[key] = pc.counts.get(key, 0) + 1
            pc.tags.setdefault(key, []).append(t.to_dict())
        else:
            pc.unmatched[t.text] = pc.unmatched.get(t.text, 0) + 1
    return pc


_LEVEL = re.compile(r"(LOWER|UPPER|FIRST|SECOND|THIRD|FOURTH|FIFTH|GROUND|BASEMENT|MEZZ(ANINE)?|ROOF|LEVEL\s*\d+|\d+(ST|ND|RD|TH)\s+(FLOOR|LEVEL)|FLOOR\s*\d+|L\d+|AREA\s+[A-Z])", re.I)


def level_key(title: str) -> str:
    m = _LEVEL.search(title or "")
    return m.group(0).upper() if m else ""


def merge_counts(censuses: list[PlanCensus], titles: dict[str, str] | None = None) -> dict[str, int]:
    """
    Counts across plan sheets.  Sheets of the SAME level (reference plan,
    dimension plan, finish plan…) show the same doors — take the max, not the
    sum.  Different levels (lower / upper) add up.
    """
    titles = titles or {}
    by_level: dict[str, dict[str, int]] = {}
    for pc in censuses:
        lv = level_key(titles.get(pc.sheet, ""))
        d = by_level.setdefault(lv, {})
        for m, n in pc.counts.items():
            d[m] = max(d.get(m, 0), n)
    out: dict[str, int] = {}
    for d in by_level.values():
        for m, n in d.items():
            out[m] = out.get(m, 0) + n
    return out


def opening_runs(pg: fitz.Page, tag_center, w_in: float, ppf: float, tol: float = 0.05, reach: float | None = None):
    """
    The opening's extent on the plan: a horizontal or vertical vector run whose
    length equals the schedule width at the plan scale, near the tag.  Returns
    [(p0, p1, length_in, dist)] closest first, or [] when nothing matches.
    """
    from .pdfgeom import long_lines
    import math
    L = w_in / 12 * ppf
    if L < 6:
        return []
    r = reach or max(80.0, L * 1.5 + 40)
    c = fitz.Point(*tag_center)
    win = fitz.Rect(c.x - r, c.y - r, c.x + r, c.y + r)
    vs, hs = long_lines(pg, win, minlen=L * (1 - tol) - 1)
    out = []
    for x, y0, y1 in vs:
        ln = y1 - y0
        if abs(ln - L) <= tol * L + 1:
            d = math.hypot(x - c.x, (y0 + y1) / 2 - c.y)
            out.append(((x, y0), (x, y1), round(ln / ppf * 12, 2), round(d, 1)))
    for y, x0, x1 in hs:
        ln = x1 - x0
        if abs(ln - L) <= tol * L + 1:
            d = math.hypot((x0 + x1) / 2 - c.x, y - c.y)
            out.append(((x0, y), (x1, y), round(ln / ppf * 12, 2), round(d, 1)))
    out.sort(key=lambda t: t[3])
    return out
