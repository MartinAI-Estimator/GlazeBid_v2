"""
legend.py — legend / keynote / finish-schedule rows and numbered notes that
talk about glazing, on EVERY legend, schedule and elevation sheet.

McLarty's only real misses were legend rows (A3.1 SF-3, D-8) and a finish
note (A3.0 note 13) because the legend parser ran on one sheet.  This runs on
all of them.

A row = a code token at the left ("SF-1", "D-8", "GF-1", "W2", "SS-1") with a
description to its right, plus continuation lines under the description
until the next code.  A note = "13." / "13" at the left of a sentence.

    rows = legend_rows(pg, sheet) -> list[LegendRow]   (only glazing-related rows)
    LegendRow(code, text, rect, sheet, page, kind="legend"|"note")
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

from .pdfgeom import text_lines, TextLine
from .classify import is_glazing_text

CODE_RE = re.compile(r"^(?P<code>[A-Z]{1,3}-?\d{1,3}[A-Za-z]?|[A-Z]{2,3}-[A-Z]{1,2}\d?)\s*[:.\-–]?$")
NOTE_RE = re.compile(r"^(?P<num>\d{1,2})\s*[.):]?$")
NOTE_INLINE = re.compile(r"^(?P<num>\d{1,2})\s*[.)]\s+(?P<text>[A-Z].{8,})$")
CODE_INLINE = re.compile(r"^(?P<code>[A-Z]{1,3}-\d{1,3}[A-Za-z]?)\s*[:\-–]\s+(?P<text>.{6,})$")


@dataclass
class LegendRow:
    code: str
    text: str
    rect: list
    sheet: str
    page: int
    kind: str = "legend"
    keyword: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def legend_rows(pg: fitz.Page, sheet: str, max_size: float = 12.0) -> list[LegendRow]:
    L = [t for t in text_lines(pg) if not t.vertical and t.size <= max_size]
    L.sort(key=lambda t: (round(t.rect[1]), t.rect[0]))
    out: list[LegendRow] = []
    used: set[int] = set()
    # codes / note numbers standing alone at the left of a row
    heads = []
    for t in L:
        s = t.text.strip()
        m = CODE_RE.match(s)
        if m:
            heads.append((t, m.group("code"), "legend"))
            continue
        m = NOTE_RE.match(s)
        if m:
            heads.append((t, m.group("num"), "note"))
    for t, code, kind in heads:
        h = t.rect[3] - t.rect[1]
        right = [u for u in L if u is not t and abs(u.rect[1] - t.rect[1]) < h * 0.9 and 0 <= u.rect[0] - t.rect[2] < 60
                 and len(u.text) > 3 and not CODE_RE.match(u.text.strip())]
        if not right:
            continue
        right.sort(key=lambda u: u.rect[0])
        first = right[0]
        x0 = first.rect[0]
        # next head below in this column bounds the continuation
        below_heads = [u for u, _, _ in heads if u is not t and u.rect[1] > t.rect[1] + 2 and abs(u.rect[0] - t.rect[0]) < 30]
        y_stop = min(u.rect[1] for u in below_heads) - 1 if below_heads else t.rect[3] + 6 * h
        y_stop = min(y_stop, t.rect[3] + 14 * h)
        body = [u for u in L if t.rect[1] - 1 <= u.rect[1] < y_stop and x0 - 6 <= u.rect[0] < x0 + 40
                and u.size <= first.size + 0.6 and u is not t]
        body.sort(key=lambda u: (round(u.rect[1]), u.rect[0]))
        # stop at a vertical gap larger than 1.8 line heights
        kept: list[TextLine] = []
        prev = None
        for u in body:
            if prev is not None and u.rect[1] - prev.rect[3] > 1.8 * h:
                break
            kept.append(u)
            prev = u
        # pull in the rest of each kept line's row (cells to the right, same y)
        row_lines = list(kept)
        for u in kept:
            for v in L:
                if v is not u and v not in row_lines and abs(v.rect[1] - u.rect[1]) < h * 0.6 and v.rect[0] > u.rect[2] and v.rect[0] - u.rect[2] < 400 and v.size <= first.size + 0.6:
                    row_lines.append(v)
        text = " ".join(u.text.strip() for u in sorted(row_lines, key=lambda u: (round(u.rect[1]), u.rect[0])))
        m = is_glazing_text(text)
        if not m:
            continue
        xs0 = min([t.rect[0]] + [u.rect[0] for u in row_lines])
        xs1 = max([t.rect[2]] + [u.rect[2] for u in row_lines])
        ys0 = min([t.rect[1]] + [u.rect[1] for u in row_lines])
        ys1 = max([t.rect[3]] + [u.rect[3] for u in row_lines])
        out.append(LegendRow(code, text, [round(xs0 - 3), round(ys0 - 2), round(xs1 + 3), round(ys1 + 2)], sheet, pg.number, kind, m.group(0).upper()))
    # inline "13. ALL FRAMELESS…" and "SF-1 - …" lines
    for t in L:
        s = t.text.strip()
        m = NOTE_INLINE.match(s) or CODE_INLINE.match(s)
        if not m:
            continue
        g = is_glazing_text(m.group("text"))
        if not g:
            continue
        code = m.groupdict().get("code") or m.group("num")
        if any(r.code == code and abs(r.rect[1] - t.rect[1]) < 6 for r in out):
            continue
        out.append(LegendRow(code, s, [round(v) for v in t.rect], sheet, pg.number,
                             "legend" if "code" in m.groupdict() and m.groupdict().get("code") else "note", g.group(0).upper()))
    return out


def legend_classes(rows: list[LegendRow]) -> dict[str, dict]:
    """
    {code: {"cls": ..., "text": ...}} for legend codes that name a system
    (SF-1 = curtain wall …).  Built with the classifier so the legend's own
    words decide; the caller applies legend precedence.
    """
    from .classify import classify
    out: dict[str, dict] = {}
    for r in rows:
        if r.kind != "legend":
            continue
        c = classify(r.text)
        if c.cls == "glazing_only" and any(i["cls"] == "glass_film" for i in c.implied):
            c.cls = "glass_film"
        if c.kind in ("scope", "pass_thru") and c.cls not in ("unclassified",):
            out[r.code] = {"cls": c.cls, "text": r.text, "sheet": r.sheet, "series": c.series, "flags": c.flags}
    return out
