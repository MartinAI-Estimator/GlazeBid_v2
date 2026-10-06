"""
bluebeam_io.py — round-trip markups between Studio and PDF annotations that
Bluebeam Revu opens as its own.

write_studio_markups(pdf_in, markups, pdf_out)
    Studio markups → PDF annotations.  Areas become Polygon annotations with
    /IT /PolygonDimension and a /Measure (RL) dictionary at the sheet scale,
    polylengths PolyLine /PolyLineDimension — Bluebeam reads those as Area /
    Polylength measurements.  Counts are circles, highlights filled polygons,
    flags dashed yellow boxes.  Subject = Tool Chest subject, title = author,
    /NM = "gb:<shape id>", and Studio's own fields (item, review state, typed
    quantity, role) ride along in /GBMeta so the next open restores them.
    Earlier GlazeBid annotations are replaced; everyone else's are untouched.

read_annotations(pdf)
    Every annotation on every page in Studio page space (rotation applied):
    type, subject, author, contents, colours, rect, vertices, and the GBMeta
    of our own.  Studio shows ours as editable markups, others' locked.

    markup = {id, page, type: rect|polygon|polyline|line|marker, role:
              area|polylength|count|highlight|line|flag, subject, author,
              rect: [x0,y0,x1,y1], points: [[x,y],...], stroke, fill, opacity,
              label, ppf, meta: {...}}
"""
from __future__ import annotations

import json
import math

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

GB_PREFIX = "gb:"


def _rgb(hexs: str | None, default=(1.0, 1.0, 0.0)):
    if not hexs:
        return default
    h = hexs.lstrip("#")
    if len(h) != 6:
        return default
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def _hex(c) -> str | None:
    if not c:
        return None
    return "#" + "".join(f"{max(0, min(255, round(v * 255))):02X}" for v in c[:3])


def _pdf_str(s: str) -> str:
    return fitz.get_pdf_str(s)


def _fmt_ft_in(inches: float) -> str:
    t = round(abs(inches) * 16)
    ft, t = divmod(t, 192)
    inch, frac = divmod(t, 16)
    fs = ""
    if frac:
        den = 16
        while frac % 2 == 0:
            frac //= 2
            den //= 2
        fs = f" {frac}/{den}"
    return f"{ft}'-{inch}{fs}\""


def _scale_label(ppf: float) -> str:
    """'1 in = 10\\'-8"' style ratio for the /Measure /R entry (paper inch → real feet)."""
    real_in = 72.0 / ppf * 12.0
    return f"1 in = {_fmt_ft_in(real_in)}"


def _measure_dict(ppf: float, area: bool) -> str:
    """PDF 1.7 rectilinear measure: page points → feet (and square feet)."""
    c = 1.0 / ppf                         # feet per point
    x = f"[<</Type/NumberFormat/U(ft)/C {c:.10f}/D 16/F/F/SS( )>>]"
    d = "[<</Type/NumberFormat/U(ft)/C 1/D 16/F/F/SS( )>>]"
    a = "/A[<</Type/NumberFormat/U(sf)/C 1/D 100>>]" if area else ""
    return f"<</Type/Measure/Subtype/RL/R{_pdf_str(_scale_label(ppf))}/X{x}/D{d}{a}>>"


def _poly_area(pts) -> float:
    s = 0.0
    for i in range(len(pts)):
        x0, y0 = pts[i - 1]
        x1, y1 = pts[i]
        s += x0 * y1 - x1 * y0
    return abs(s) / 2


def _poly_len(pts) -> float:
    return sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts)))


def _scallops(P: list, r: float = 9.0) -> list:
    """Cloud outline: a row of half-circle bumps along each edge, bulging away from the centre."""
    out = []
    n = len(P)
    gx, gy = sum(p.x for p in P) / n, sum(p.y for p in P) / n
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]
        L = math.hypot(b.x - a.x, b.y - a.y)
        if L < 1e-6:
            continue
        k = max(1, round(L / (2 * r)))
        ang = math.atan2(b.y - a.y, b.x - a.x)
        rr = L / k / 2
        # which way is "out" for this edge: the normal pointing away from the centre
        mx, my = (a.x + b.x) / 2, (a.y + b.y) / 2
        nx, ny = math.cos(ang + math.pi / 2), math.sin(ang + math.pi / 2)
        sgn = 1 if (mx + nx - gx) ** 2 + (my + ny - gy) ** 2 > (mx - nx - gx) ** 2 + (my - ny - gy) ** 2 else -1
        for j in range(k):
            cx = a.x + (b.x - a.x) * (j + 0.5) / k
            cy = a.y + (b.y - a.y) * (j + 0.5) / k
            for t in range(9):
                th = ang + math.pi + sgn * math.pi * t / 8
                out.append(fitz.Point(cx + rr * math.cos(th), cy + rr * math.sin(th)))
    out.append(out[0])
    return out


def _is_ours(doc: fitz.Document, a) -> bool:
    try:
        nm = doc.xref_get_key(a.xref, "NM")[1].strip("()")
    except Exception:
        nm = ""
    return nm.startswith(GB_PREFIX)


def write_studio_markups(pdf_in: str, markups: list[dict], pdf_out: str) -> dict:
    doc = fitz.open(pdf_in)
    removed = 0
    for pg in doc:
        for a in list(pg.annots() or []):
            if _is_ours(doc, a):
                pg.delete_annot(a)
                removed += 1
    n = 0
    for m in markups:
        page = m.get("page")
        if page is None or page < 0 or page >= len(doc):
            continue
        pg = doc[page]
        D = pg.derotation_matrix
        role = m.get("role") or "highlight"
        typ = m.get("type")
        stroke = _rgb(m.get("stroke"))
        fill = _rgb(m.get("fill") or m.get("stroke"))
        pts = [tuple(p) for p in (m.get("points") or [])]
        if not pts and m.get("rect"):
            x0, y0, x1, y1 = m["rect"]
            if typ == "marker":
                pts = [((x0 + x1) / 2, (y0 + y1) / 2)]
            else:
                pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
        if not pts:
            continue
        P = [fitz.Point(x, y) * D for x, y in pts]
        ppf = float(m.get("ppf") or 0) or None
        contents = m.get("label") or m.get("subject") or ""
        annot = None
        measure = None
        style = m.get("style")
        if typ == "text":
            # text box / callout (FreeText); a leader point makes it a callout (/CL)
            x0, y0, x1, y1 = m["rect"]
            box = fitz.Rect(fitz.Point(x0, y0) * D, fitz.Point(x1, y1) * D)
            box.normalize()
            fs = float(m.get("font_size") or 10)
            kw = dict(fontsize=fs, text_color=stroke, fill_color=(1, 1, 1), border_width=1, rotate=pg.rotation)
            ld = m.get("leader")
            if ld:
                tip = fitz.Point(*ld) * D
                # the leader leaves the side of the box facing the point
                if tip.x < box.x0 or tip.x > box.x1:
                    knee = fitz.Point(box.x0 if tip.x < box.x0 else box.x1, (box.y0 + box.y1) / 2)
                else:
                    knee = fitz.Point((box.x0 + box.x1) / 2, box.y0 if tip.y < box.y0 else box.y1)
                try:
                    annot = pg.add_freetext_annot(box, contents or "", callout=(tip, knee), line_end=fitz.PDF_ANNOT_LE_OPEN_ARROW, **kw)
                except TypeError:          # older PyMuPDF: no callout support → plain text box
                    annot = pg.add_freetext_annot(box, contents or "", **kw)
            else:
                annot = pg.add_freetext_annot(box, contents or "", **kw)
        elif style == "cloud":
            # scallops written into the outline so every viewer shows a cloud; Studio keeps the
            # original corners in GBMeta and edits it as a simple polygon
            annot = pg.add_polygon_annot(_scallops(P))
            annot.set_colors(stroke=stroke)
            annot.set_border(width=1.5)
            m.setdefault("meta", {})["points"] = [list(p) for p in pts]
        elif style == "arrow" and len(P) >= 2:
            annot = pg.add_line_annot(P[0], P[-1])
            annot.set_colors(stroke=stroke, fill=stroke)
            annot.set_border(width=1.5)
            annot.set_line_ends(fitz.PDF_ANNOT_LE_NONE, fitz.PDF_ANNOT_LE_CLOSED_ARROW)
        elif role == "flag":
            xs, ys = [p.x for p in P], [p.y for p in P]
            r = fitz.Rect(min(xs) - 8, min(ys) - 8, max(xs) + 8, max(ys) + 8)
            annot = pg.add_rect_annot(r)
            annot.set_colors(stroke=(1, 0.85, 0), fill=(1, 1, 0))
            annot.set_opacity(0.35)
            annot.set_border(width=2, dashes=[3, 3])
        elif role == "count" or typ == "marker":
            c = P[0]
            r = 6.0
            annot = pg.add_circle_annot(fitz.Rect(c.x - r, c.y - r, c.x + r, c.y + r))
            annot.set_colors(stroke=stroke, fill=fill)
            annot.set_opacity(0.6)
        elif role in ("polylength", "line") or typ in ("polyline", "line"):
            annot = pg.add_polyline_annot(P)
            annot.set_colors(stroke=stroke)
            annot.set_border(width=2)
            if ppf:
                L_ft = _poly_len(pts) / ppf
                contents = contents or _fmt_ft_in(L_ft * 12)
                measure = ("PolyLineDimension", _measure_dict(ppf, False))
        else:
            annot = pg.add_polygon_annot(P + [P[0]])
            annot.set_colors(stroke=stroke, fill=fill)
            op = m.get("opacity")
            annot.set_opacity(float(op) if op not in (None, "") else (0.35 if role == "highlight" else 0.3))
            annot.set_border(width=1.5)
            if role == "area" and ppf:
                measure = ("PolygonDimension", _measure_dict(ppf, True))
        if annot is None:
            continue
        annot.set_info(title=m.get("author") or "GlazeBid", subject=m.get("subject") or "", content=contents)
        annot.update()
        x = annot.xref
        doc.xref_set_key(x, "NM", _pdf_str(f"{GB_PREFIX}{m.get('id', n)}"))
        if style == "cloud" and typ != "text":
            doc.xref_set_key(x, "BE", "<</S/C/I 1>>")      # Bluebeam / Acrobat cloud border
        if measure:
            doc.xref_set_key(x, "IT", f"/{measure[0]}")
            doc.xref_set_key(x, "Measure", measure[1])
        meta = m.get("meta") or {}
        meta = {k: v for k, v in dict(meta, role=role, type=typ, style=style).items() if v is not None}
        doc.xref_set_key(x, "GBMeta", _pdf_str(json.dumps(meta, separators=(",", ":"))))
        n += 1
    doc.save(pdf_out, garbage=1, deflate=True)
    doc.close()
    return {"written": n, "replaced": removed}


_TYPE_ROLE = {
    "Polygon": "area", "Square": "area", "PolyLine": "polylength", "Line": "line", "Circle": "count",
}


def read_annotations(pdf_path: str) -> list[dict]:
    doc = fitz.open(pdf_path)
    out = []
    for pg in doc:
        M = pg.rotation_matrix
        for a in pg.annots() or []:
            t = a.type[1]
            if t in ("Popup", "Link", "Widget"):
                continue
            info = a.info or {}
            try:
                nm = doc.xref_get_key(a.xref, "NM")[1].strip("()")
            except Exception:
                nm = ""
            meta = {}
            try:
                k = doc.xref_get_key(a.xref, "GBMeta")
                if k[0] == "string":
                    meta = json.loads(k[1])
            except Exception:
                meta = {}
            R = fitz.Rect(a.rect) * M
            R.normalize()
            verts = None
            if t in ("Polygon", "PolyLine", "Line", "Ink"):
                v = a.vertices or []
                if v and isinstance(v[0], (list, tuple)) and v and isinstance(v[0][0], (list, tuple)):
                    v = [q for stroke in v for q in stroke]          # ink: list of strokes
                verts = [[round((fitz.Point(q) * M).x, 2), round((fitz.Point(q) * M).y, 2)] for q in v]
                if t == "Polygon" and len(verts) > 3 and verts[0] == verts[-1]:
                    verts = verts[:-1]                                # closing vertex
            colors = a.colors or {}
            ours = nm.startswith(GB_PREFIX)
            style = None
            leader = None
            text_rect = None
            font_size = None
            try:
                be = doc.xref_get_key(a.xref, "BE")[1]
                if "/S/C" in be.replace(" ", ""):
                    style = "cloud"
            except Exception:
                pass
            if t == "Line":
                try:
                    if any(e not in (0, None) for e in (a.line_ends or ())):
                        style = "arrow"
                except Exception:
                    pass
            if t == "FreeText":
                try:
                    cl = doc.xref_get_key(a.xref, "CL")
                    if cl[0] == "array":
                        nums = [float(v) for v in cl[1].strip("[]").split()]
                        if len(nums) >= 2:
                            q = fitz.Point(nums[0], nums[1])
                            # /CL is in PDF (bottom-up) space; convert to MuPDF's top-down
                            q = fitz.Point(q.x, pg.mediabox.height - q.y) if pg.mediabox else q
                            q = q * M
                            inside_page = 0 <= q.x <= pg.rect.width + 1 and 0 <= q.y <= pg.rect.height + 1 if pg.rotation % 180 == 0 \
                                else 0 <= q.x <= pg.rect.height + 1 and 0 <= q.y <= pg.rect.width + 1
                            if inside_page:
                                leader = [round(q.x, 2), round(q.y, 2)]
                except Exception:
                    pass
                box = fitz.Rect(a.rect)
                try:
                    rd = doc.xref_get_key(a.xref, "RD")
                    if rd[0] == "array":
                        l_, t_, r_, b_ = [float(v) for v in rd[1].strip("[]").split()]
                        box = fitz.Rect(box.x0 + l_, box.y0 + t_, box.x1 - r_, box.y1 - b_)
                except Exception:
                    pass
                B = box * M
                B.normalize()
                text_rect = [round(v, 2) for v in B]
                try:
                    import re as _re
                    da = doc.xref_get_key(a.xref, "DA")[1]
                    mm = _re.search(r"([\d.]+)\s+Tf", da)
                    font_size = float(mm.group(1)) if mm else None
                except Exception:
                    pass
            role = meta.get("role") or _TYPE_ROLE.get(t, "highlight")
            out.append({
                "id": nm[len(GB_PREFIX):] if ours else (nm or f"x{pg.number}-{a.xref}"),
                "page": pg.number,
                "annot_type": t,
                "type": meta.get("type") or {"Polygon": "polygon", "PolyLine": "polyline", "Line": "line",
                                             "Circle": "marker", "FreeText": "text"}.get(t, "rect"),
                "style": meta.get("style") or style,
                "leader": leader,
                "text_rect": text_rect,
                "font_size": font_size,
                "role": role,
                "subject": info.get("subject") or "",
                "author": info.get("title") or "",
                "label": info.get("content") or "",
                "stroke": _hex(colors.get("stroke")),
                "fill": _hex(colors.get("fill")),
                "opacity": a.opacity if a.opacity is not None and a.opacity >= 0 else None,
                "rect": [round(v, 2) for v in R],
                "points": meta.get("points") or verts,
                "ours": ours,
                "meta": meta,
            })
    doc.close()
    return out
