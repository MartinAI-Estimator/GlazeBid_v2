"""
details.py — detail / section titles and the glazing keywords inside each one.

Detail titles are generic ("PLAN DETAIL", "WALL SECTION"); what matters is the
text inside the detail's region.  Titles are the page's title-size tier of
text (≈2× body size); the detail number is the bigger number just left of the
title or the bubble above it.  The region is the column above the title, cut
by the previous title in the same column (McLarty bug 2: only titles that
overlap this column count as "above").

    find_details(pg, sheet, keywords) -> list[Detail]
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field, asdict

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

from .pdfgeom import text_lines, TextLine

_TITLE_WORDS = re.compile(r"DETAIL|SECTION|ELEVATION|PLAN|JAMB|HEAD|SILL|THRESHOLD|MULLION|TRANSOM|CORNER|TYP\.?|TYPICAL|ENLARGED|CONNECTION|FLASHING|ANCHOR", re.I)
_SCALE_LINE = re.compile(r"SCALE", re.I)


@dataclass
class Detail:
    sheet: str
    page: int
    num: str
    title: str
    title_rect: list
    region: list
    hits: list = field(default_factory=list)
    num_rect: list | None = None   # [{"text":..., "rect":[...], "kw": "STOREFRONT"}]

    def to_dict(self) -> dict:
        return asdict(self)


def title_tier(lines: list[TextLine]) -> tuple[float, float]:
    """(min, max) font size of the title tier on this page."""
    sizes = [round(t.size, 1) for t in lines if len(t.text) > 2]
    if not sizes:
        return (14.0, 30.0)
    body = Counter(sizes).most_common(1)[0][0]
    big = sorted({s for s in sizes if s >= 1.5 * body and s <= 4.5 * body})
    if not big:
        return (1.6 * body, 3.0 * body)
    return (big[0] - 0.1, big[-1] + 0.1)


def find_details(pg: fitz.Page, sheet: str, keywords: re.Pattern, exclude_x: float | None = None) -> list[Detail]:
    L = [t for t in text_lines(pg) if not t.vertical]
    W = pg.rect.width
    xlim = exclude_x if exclude_x is not None else W * 0.93     # keep out of the title block
    lo, hi = title_tier(L)
    body = Counter(round(t.size, 1) for t in L if len(t.text) > 2).most_common(1)[0][0] if L else 9.0
    titles = [t for t in L if lo <= t.size <= hi and t.rect[0] < xlim and len(t.text) >= 4
              and (_TITLE_WORDS.search(t.text) or (t.text.isupper() and len(t.text.split()) >= 2))
              and not _SCALE_LINE.search(t.text)]
    nums = [t for t in L if t.rect[0] < xlim and re.fullmatch(r"[A-Z]?\d{1,2}[A-Z]?", t.text.strip()) and t.size >= body * 1.2]
    scale_nums = [t for t in L if t.rect[0] < xlim and re.match(r"^(\d{1,2}[A-Z]?)\s+SCALE", t.text.strip(), re.I)]
    out: list[Detail] = []
    for t in titles:
        r = t.r
        # number: same row, just left
        th = r.y1 - r.y0
        n = [u for u in nums if abs(u.center.y - r.y0 - th / 2) < 1.5 * th and u.rect[2] <= r.x0 + 2 and r.x0 - u.rect[2] < 90]
        n.sort(key=lambda u: r.x0 - u.rect[2])
        num_rect = None
        if n:
            num = n[0].text.strip()
            num_rect = [round(v) for v in n[0].rect]
        else:
            # "11 SCALE: 1/4" = 1'-0"" on the line under the title, or "6 PLAN DETAIL" in the title itself
            sn = [u for u in scale_nums if abs(u.center.y - (r.y0 + r.y1) / 2) < 2.0 * th and r.x0 - 120 <= u.rect[0] <= r.x0 + 4]
            m = re.match(r"^(\d{1,2}[A-Z]?)\s+(.*)$", t.text.strip())
            num = re.match(r"^(\d{1,2}[A-Z]?)", sn[0].text.strip()).group(1) if sn else (m.group(1) if m else "?")
        same = [u.r for u in titles if abs(u.rect[1] - r.y0) < 40 and u.rect[0] > r.x0 + 10]
        x1 = min(q.x0 for q in same) - 30 if same else min(r.x0 + 900, xlim)
        above = [u.r for u in titles if u.rect[3] < r.y0 - 5 and u.rect[0] < r.x0 + 250 and u.rect[2] > r.x0 - 60]
        y0 = max(q.y1 for q in above) + 5 if above else 30
        region = fitz.Rect(r.x0 - 60, y0, x1, r.y1)
        hits = []
        for u in L:
            if u.size < body * 1.3 and region.contains(u.r):
                m = keywords.search(u.text)
                if m:
                    hits.append({"text": u.text.strip(), "rect": [round(v) for v in u.rect], "kw": m.group(0).upper()})
        out.append(Detail(sheet, pg.number, num, t.text.strip(), [round(v) for v in t.rect],
                          [round(v) for v in region], hits, num_rect))
    return out
