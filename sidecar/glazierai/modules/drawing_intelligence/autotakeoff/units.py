"""
units.py — dimension strings, inches, and drawing scale.

Sizes are carried as INCHES (float) everywhere in the auto-takeoff.  They are
only formatted to feet-inches for display.  (McLarty bug 1: a formatter wrote
13'-12.0", which parsed back as 12'-0" and sent the elevation matcher to the
wrong rectangle.  Never round-trip a size through a string.)

    parse_dim("14'-0\"") -> 168.0          inches, or None
    fmt_in(168.0)        -> "14'-0\""
    fmt_in(172.5)        -> "14'-4 1/2\""
    scale_strings(pg)    -> [(ppf, text, rect), ...]   pt per foot from "SCALE: 1/8" = 1'-0""
    STANDARD_PPF         -> the usual architectural scales in pt/ft
"""
from __future__ import annotations

import re
from fractions import Fraction

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

_UNI = {"⅛": " 1/8", "¼": " 1/4", "⅜": " 3/8", "½": " 1/2", "⅝": " 5/8", "¾": " 3/4", "⅞": " 7/8",
        "⅓": " 1/3", "⅔": " 2/3", "⅙": " 1/6", "⅐": " 1/7", "⅑": " 1/9", "⅒": " 1/10", "⅕": " 1/5",
        "”": '"', "“": '"', "″": '"', "’": "'", "‘": "'", "′": "'", " ": " ", " ": " "}


def norm_text(t: str) -> str:
    for k, v in _UNI.items():
        t = t.replace(k, v)
    return re.sub(r"\s+", " ", t).strip()


_FT = re.compile(r"""^(?P<ft>\d+)\s*'\s*-?\s*(?:(?P<in>\d+)?\s*(?:-?\s*(?P<n>\d+)\s*/\s*(?P<d>\d+))?\s*"?)?$""")
_IN = re.compile(r"""^(?:(?P<in>\d+)\s*)?(?:-?\s*(?P<n>\d+)\s*/\s*(?P<d>\d+))?\s*"$""")


def parse_dim(t: str) -> float | None:
    """Inches from a feet-inch or inch string; None if the text is not a dimension."""
    t = norm_text(t)
    t = t.replace(" - ", "-")
    m = _FT.match(t)
    if m:
        v = int(m.group("ft")) * 12 + int(m.group("in") or 0)
        if m.group("n"):
            v += int(m.group("n")) / int(m.group("d"))
        return float(v)
    m = _IN.match(t)
    if m and (m.group("in") or m.group("n")):
        v = int(m.group("in") or 0)
        if m.group("n"):
            v += int(m.group("n")) / int(m.group("d"))
        return float(v)
    return None


def fmt_in(v: float | None, denom: int = 16) -> str:
    """Feet-inches string, fraction to the nearest 1/denom.  Carries 12" to the next foot."""
    if v is None:
        return ""
    total = round(v * denom) / denom
    ft = int(total // 12)
    inch = total - ft * 12
    if inch >= 12:
        ft += 1
        inch -= 12
    whole = int(inch)
    fr = Fraction(inch - whole).limit_denominator(denom)
    s = f"{ft}'-{whole}"
    if fr:
        s += f" {fr.numerator}/{fr.denominator}"
    return s + '"'


def sf(w_in: float, h_in: float) -> float:
    return round(w_in * h_in / 144.0, 2)


# ── Scale ─────────────────────────────────────────────────────────────────────

# pt per foot for "x" = 1'-0"" at 72 pt/in: ppf = 72 * x
STANDARD_PPF = [72 * x for x in (
    1 / 32, 1 / 16, 3 / 32, 1 / 8, 3 / 16, 1 / 4, 3 / 8, 1 / 2, 3 / 4, 1, 1.5, 2, 3, 6, 12)]

_SCALE = re.compile(r"""(?P<n>\d+(?:\s+\d+/\d+)?|\d+/\d+)\s*"\s*=\s*1\s*'\s*-?\s*0\s*"?""")
_SCALE_RATIO = re.compile(r"""1\s*:\s*(?P<r>\d+)""")


def parse_scale(t: str) -> float | None:
    """pt/ft from '1/8" = 1'-0"' or '1:100'; None if not a scale string."""
    t = norm_text(t)
    m = _SCALE.search(t)
    if m:
        n = m.group("n").strip()
        v = 0.0
        for part in n.split():
            v += float(Fraction(part))
        return 72.0 * v
    m = _SCALE_RATIO.search(t)
    if m and "SCALE" in t.upper():
        return 72.0 * 12.0 / int(m.group("r"))
    return None


def scale_strings(pg: fitz.Page):
    """All scale strings on the page: [(ppf, text, rect)]."""
    from .pdfgeom import text_lines
    out = []
    for tl in text_lines(pg):
        if '"' not in norm_text(tl.text) and "SCALE" not in tl.text.upper():
            continue
        ppf = parse_scale(tl.text)
        if ppf:
            out.append((ppf, tl.text, tl.r))
    return out


def nearest_ppf(value: float) -> float:
    return min(STANDARD_PPF, key=lambda s: abs(s - value))


def page_ppf(pg: fitz.Page, default: float | None = None) -> float | None:
    """Dominant scale on the page (most frequent scale string), else default."""
    from collections import Counter
    ss = scale_strings(pg)
    if not ss:
        return default
    c = Counter(round(s[0], 3) for s in ss)
    return c.most_common(1)[0][0]


def region_ppf(pg: fitz.Page, rect: fitz.Rect, default: float | None = None) -> float | None:
    """Scale string nearest below/inside a drawing region, else page scale, else default."""
    ss = scale_strings(pg)
    best = None
    for ppf, text, r in ss:
        if r.x1 < rect.x0 - 40 or r.x0 > rect.x1 + 40 or r.y0 < rect.y1 - 10:
            continue
        d = r.y0 - rect.y1
        if best is None or d < best[0]:
            best = (d, ppf)
    if best is not None and best[0] < 200:
        return best[1]
    return page_ppf(pg, default)


def ppf_from_dims(rect_pts: float, dims_in: list[float], lo: float = 4.5, hi: float = 72.0) -> float | None:
    """
    Given a drawn length in pt and dimension strings that might describe it,
    return the standard scale that makes one of them match (within 2%).
    Larger dimensions are tried first — the overall width is the biggest number
    on a type drawing; a 2" mullion string must never set the scale.
    """
    for d in sorted({v for v in dims_in if v and v > 0}, reverse=True):
        ppf = rect_pts / (d / 12.0)
        if not (lo <= ppf <= hi):
            continue
        s = nearest_ppf(ppf)
        if abs(s - ppf) / s < 0.02:
            return s
    return None
