"""
markup_writer.py — write the auto-takeoff markups into a copy of the drawing
set as PDF annotations in Martin's Estimating ToolBox conventions.

    write_markups(pdf_in, result, pdf_out, author="GlazeBid")

  region  → Polygon (the toolbox "Highlight" tools are AnnotationPolygon) with
            the class colour, 30 % fill, subject = toolbox subject;
            dashed border when the snap is unsure
  area    → Square with the Area text in its contents (W / H / sf)
  label   → FreeText ("3 Thus") — Qty Text Box
  linear  → PolyLine — Polylength
  flag    → yellow Square, subject "Needs Review", contents = the reasons
  door    → Circle

Every annotation gets /NM = "gb:<item id>#<n>" so GlazeBid can find its own
markups again after the file has been through Bluebeam, and the author so
other people's markups are ignored on re-import (Martin: ignore others' marks).
Rects are page space (rotated) — exactly what the readers produce.
"""
from __future__ import annotations

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz


def _rgb(hexs: str, default=(1, 1, 0)):
    h = (hexs or "").lstrip("#")
    if len(h) != 6:
        return default
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def write_markups(pdf_in: str, result: dict, pdf_out: str, author: str = "GlazeBid",
                  fill_opacity: float = 0.3) -> int:
    doc = fitz.open(pdf_in)
    n = 0
    counter: dict[str, int] = {}
    for m in result.get("markups", []):
        page = m.get("page")
        if page is None or page >= len(doc) or not (m.get("rect") or m.get("points")):
            continue
        pg = doc[page]
        role = m.get("role", "region")
        stroke = _rgb(m.get("stroke") or "#FFFF00")
        fill = _rgb(m.get("fill") or m.get("stroke") or "#FFFF00")
        subject = m.get("subject", "")
        content = m.get("text") or m.get("note") or ""
        annot = None
        if role in ("region", "flag", "area"):
            r = fitz.Rect(*m["rect"])
            if r.is_empty or r.width < 1 or r.height < 1:
                r = fitz.Rect(r.x0 - 2, r.y0 - 2, r.x0 + max(4, r.width), r.y0 + max(4, r.height))
            if role == "region":
                pts = [fitz.Point(r.x0, r.y0), fitz.Point(r.x1, r.y0), fitz.Point(r.x1, r.y1), fitz.Point(r.x0, r.y1), fitz.Point(r.x0, r.y0)]
                annot = pg.add_polygon_annot(pts)
                annot.set_colors(stroke=stroke, fill=fill)
                annot.set_opacity(fill_opacity)
                annot.set_border(width=1.5, dashes=[6, 4] if m.get("dashed") else None)
            elif role == "area":
                annot = pg.add_rect_annot(r)
                annot.set_colors(stroke=stroke, fill=None)
                annot.set_border(width=1.2)
                annot.set_opacity(0.9)
            else:
                annot = pg.add_rect_annot(fitz.Rect(r.x0 - 4, r.y0 - 4, r.x1 + 4, r.y1 + 4))
                annot.set_colors(stroke=(1, 0.85, 0), fill=(1, 1, 0))
                annot.set_opacity(0.35)
                annot.set_border(width=2, dashes=[3, 3])
        elif role == "label":
            r = fitz.Rect(*m["rect"])
            annot = pg.add_freetext_annot(r, content, fontsize=9, text_color=(0, 0, 0), fill_color=(1, 1, 1))
            content = m.get("text", "")
        elif role == "linear":
            pts = [fitz.Point(*p) for p in (m.get("points") or [])]
            if len(pts) < 2:
                continue
            annot = pg.add_polyline_annot(pts)
            annot.set_colors(stroke=stroke)
            annot.set_border(width=2)
        elif role in ("door", "count"):
            r = fitz.Rect(*m["rect"])
            annot = pg.add_circle_annot(r)
            annot.set_colors(stroke=stroke, fill=fill)
            annot.set_opacity(0.5)
        if annot is None:
            continue
        item = m.get("item", "")
        counter[item] = counter.get(item, 0) + 1
        annot.set_info(title=author, subject=subject, content=content)
        annot.update()
        try:
            doc.xref_set_key(annot.xref, "NM", fitz.get_pdf_str(f"gb:{item}#{counter[item]}"))
        except Exception:
            pass
        n += 1
    doc.save(pdf_out, garbage=1, deflate=True)
    doc.close()
    return n


def read_back(pdf_path: str, author: str = "GlazeBid") -> list[dict]:
    """GlazeBid's own annotations (by /NM prefix and author) with any edits made in Bluebeam."""
    doc = fitz.open(pdf_path)
    out = []
    for pg in doc:
        for a in pg.annots():
            info = a.info
            nm = ""
            try:
                nm = doc.xref_get_key(a.xref, "NM")[1].strip("()")
            except Exception:
                pass
            if not nm.startswith("gb:") and info.get("title") != author:
                continue
            out.append({"page": pg.number, "nm": nm, "subject": info.get("subject"), "content": info.get("content"),
                        "rect": [round(v, 1) for v in a.rect], "type": a.type[1], "author": info.get("title")})
    return out
