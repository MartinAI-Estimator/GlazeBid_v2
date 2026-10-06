"""
members.py — repeated linear members called out by a note: aluminum tube
louvers, fins, sun shades (Hope A4.4: "4" x 2" ANODIZED ALUMINUM TUBE LOUVERS,
RE: ALUMINUM STOREFRONT SPECS").  Martin measures each one (Sun Control
Device Polylength).

Only runs on a sheet whose text names such members.  A member = exactly two
parallel long lines 2–14 pt apart (a tube in elevation); clusters of three or
more lines at one spot are columns / mullions and are skipped.

    find_members(pg, sheet, ppf) -> {"callout": text, "members": [{p0, p1, len_in}]}
"""
from __future__ import annotations

import re

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

from .pdfgeom import long_lines, text_lines

CALLOUT = re.compile(r"TUBE LOUVERS?|SUN ?SHADES?|SUNSHADES?|SUN CONTROL|ALUMINUM FINS?|VERTICAL FINS?|HORIZONTAL FINS?|BRISE", re.I)


def find_members(pg: fitz.Page, sheet: str, ppf: float, minlen_ft: float = 4.0) -> dict | None:
    calls = [t for t in text_lines(pg) if CALLOUT.search(t.text)]
    if not calls:
        return None
    W = fitz.Rect(0, 0, pg.rect.width * 0.92, pg.rect.height)
    minlen = minlen_ft * ppf
    out = {"callout": calls[0].text.strip(), "callout_rect": [round(v) for v in calls[0].rect], "members": []}
    for orient in ("v", "h"):
        vs, hs = long_lines(pg, W, minlen=minlen)
        lines = vs if orient == "v" else hs
        # merge duplicates at the same coordinate
        lines = sorted(lines)
        cols: list[list] = []
        for ln in lines:
            if cols and abs(ln[0] - cols[-1][-1][0]) < 1.2 and abs(ln[1] - cols[-1][-1][1]) < 4:
                continue
            cols.append([ln])
        flat = [c[0] for c in cols]
        used = set()
        for i, a in enumerate(flat):
            if i in used:
                continue
            # neighbours within 14 pt with overlapping span
            near = [j for j in range(i + 1, len(flat)) if flat[j][0] - a[0] <= 14
                    and min(a[2], flat[j][2]) - max(a[1], flat[j][1]) > 0.8 * max(a[2] - a[1], flat[j][2] - flat[j][1])]
            if len(near) != 1:
                used.update(near)
                continue
            b = flat[near[0]]
            gap = b[0] - a[0]
            if not (2.0 <= gap <= 14.0):
                continue
            # the pair must stand alone: nothing else within the gap on either side
            if any(abs(c[0] - a[0]) < gap * 1.2 and c is not a and c is not b
                   and min(a[2], c[2]) - max(a[1], c[1]) > 0.8 * max(a[2] - a[1], c[2] - c[1]) for c in flat if abs(c[0] - a[0]) < 2 * gap + 2):
                continue
            used.update({i, near[0]})
            mid = (a[0] + b[0]) / 2
            lo, hi = max(a[1], b[1]), min(a[2], b[2])
            p0, p1 = ((mid, lo), (mid, hi)) if orient == "v" else ((lo, mid), (hi, mid))
            out["members"].append({"p0": [round(p0[0], 1), round(p0[1], 1)], "p1": [round(p1[0], 1), round(p1[1], 1)],
                                   "len_in": round((hi - lo) / ppf * 12, 2), "orient": orient})
    # keep the dominant orientation family (louvers are all one way)
    if out["members"]:
        from collections import Counter
        o = Counter(m["orient"] for m in out["members"]).most_common(1)[0][0]
        out["members"] = [m for m in out["members"] if m["orient"] == o]
    return out if out["members"] else None
