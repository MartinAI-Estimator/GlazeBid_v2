"""
links.py — sheet index + hyperlinked callouts for Studio navigation
(Bluebeam's auto-hyperlinks).

    sheets_and_links(pdf_path) -> {"sheets": [...], "links": [...]}

  sheets: page, sheet number, title, categories, drawing scale (ppf)
  links:  every detail / section bubble "6 over A3.8" and every plain sheet
          reference ("RE: A4.4", "SEE A3.1") → the target page, and for a
          numbered bubble the detail's title on that sheet:
          {page, rect, label, target_page, target_rect | null}
"""
from __future__ import annotations

import re

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

from .sheet_index import build_index
from .pdfgeom import text_lines
from .details import find_details
from .units import page_ppf
from .classify import detail_keywords

_NUM = re.compile(r"^[A-Z]?\d{1,3}[A-Z]?$")
_SHEETREF = re.compile(r"(?<![A-Z0-9.])([A-Z]{1,2}-?\d{1,2}\.\d{1,2}[A-Z]?\d?)(?![A-Z0-9])")


def _norm(s: str) -> str:
    return s.replace("-", "").upper()


def sheets_and_links(pdf_path: str) -> dict:
    doc = fitz.open(pdf_path)
    index = build_index(doc)
    sheets = [dict(s.to_dict(), ppf=page_ppf(doc[s.page], None)) for s in index]
    by_sheet = {_norm(s.sheet): s.page for s in index if s.sheet}
    detail_cache: dict[int, dict[str, list]] = {}

    def detail_rect(page: int, num: str):
        if page not in detail_cache:
            try:
                ds = find_details(doc[page], "", detail_keywords())
            except Exception:
                ds = []
            m: dict[str, list] = {}
            for d in ds:
                if d.num and d.num != "?":
                    r = d.num_rect or d.title_rect
                    m.setdefault(d.num.upper(), [round(v, 1) for v in (r if r else d.region)])
            detail_cache[page] = m
        return detail_cache[page].get(num.upper())

    links: list[dict] = []
    for pg in doc:
        tl = text_lines(pg)
        nums = [t for t in tl if _NUM.match(t.text.strip())]
        own = None
        for s in index:
            if s.page == pg.number:
                own = _norm(s.sheet)
        for t in tl:
            txt = t.text.strip()
            for m in _SHEETREF.finditer(txt):
                ref = _norm(m.group(1))
                tgt = by_sheet.get(ref)
                if tgt is None:
                    continue
                c = t.center
                bubble = txt == m.group(1)
                num = None
                if bubble:
                    above = [u for u in nums if abs(u.center.x - c.x) < 8 and 0 < c.y - u.center.y < 18]
                    if above:
                        num = min(above, key=lambda u: c.y - u.center.y)
                if num is None and ref == own:
                    continue                      # the sheet's own number (title block) is not a link
                if num is not None:
                    r = fitz.Rect(t.rect) | fitz.Rect(num.rect)
                    links.append({"page": pg.number, "rect": [round(v, 1) for v in r],
                                  "label": f"{num.text.strip()}/{m.group(1)}", "target_page": tgt,
                                  "target_rect": detail_rect(tgt, num.text.strip())})
                else:
                    # inline "2/A3.8" (schedule cells) → that detail; otherwise a plain sheet reference
                    w = (t.rect[2] - t.rect[0]) / max(1, len(txt))
                    pre = re.search(r"(\d{1,3}[A-Z]?)\s*/\s*$", txt[:m.start(1)])
                    start = pre.start(1) if pre else m.start(1)
                    x0 = t.rect[0] + w * start
                    x1 = t.rect[0] + w * m.end(1)
                    links.append({"page": pg.number, "rect": [round(x0, 1), round(t.rect[1], 1), round(x1, 1), round(t.rect[3], 1)],
                                  "label": f"{pre.group(1)}/{m.group(1)}" if pre else m.group(1), "target_page": tgt,
                                  "target_rect": detail_rect(tgt, pre.group(1)) if pre else None})
    doc.close()
    return {"sheets": sheets, "links": links}


def search_text(pdf_path: str, query: str, max_hits: int = 500) -> list[dict]:
    """Case-insensitive text search across the set, in Studio page space (rotation applied)."""
    q = (query or "").strip()
    if not q:
        return []
    doc = fitz.open(pdf_path)
    hits: list[dict] = []
    try:
        for pg in doc:
            M = pg.rotation_matrix
            found = pg.search_for(q)
            if not found:
                continue
            lines = [(fitz.Rect(l["bbox"]), "".join(sp["text"] for sp in l["spans"]).strip())
                     for b in pg.get_text("dict")["blocks"] for l in b.get("lines", [])]
            for r in found:
                R = fitz.Rect(r) * M
                R.normalize()
                cands = [t for bb, t in lines if bb.intersects(r) and q.lower() in t.lower()] or \
                        [t for bb, t in lines if bb.intersects(r)]
                line = max(cands, key=len) if cands else q
                hits.append({"page": pg.number, "rect": [round(v, 1) for v in R], "context": line[:120]})
                if len(hits) >= max_hits:
                    return hits
    finally:
        doc.close()
    return hits
