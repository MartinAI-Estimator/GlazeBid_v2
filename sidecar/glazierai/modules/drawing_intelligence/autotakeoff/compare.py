"""
compare.py — revisions / addenda: what changed between two drawing sets.

    match_sheets(old_pdf, new_pdf)              → pairs by sheet number + added / removed sheets
    sheet_changes(old_pdf, new_pdf, pairs)      → per pair: share of the drawing that changed
    overlay(old_pdf, new_pdf, p_old, p_new)     → transparent PNG over the OLD page:
                                                   red = only in the old set (removed),
                                                   green = only in the new set (added),
                                                   plus boxes around the changed areas
    diff_takeoffs(old_result, new_result)       → items added / removed / changed (count, size, class)

All in Studio page space (rotation applied).  The new page is scaled to the old
page's size when they differ.
"""
from __future__ import annotations

import base64
import io

import numpy as np
from PIL import Image

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

from .sheet_index import build_index


def _norm(s: str) -> str:
    return (s or "").replace("-", "").replace(" ", "").upper()


def match_sheets(old_pdf: str, new_pdf: str) -> dict:
    a, b = fitz.open(old_pdf), fitz.open(new_pdf)
    try:
        ia, ib = build_index(a), build_index(b)
    finally:
        a.close(); b.close()
    ma = {_norm(s.sheet): s for s in ia if s.sheet}
    mb = {_norm(s.sheet): s for s in ib if s.sheet}
    pairs = [{"sheet": ma[k].sheet, "old_page": ma[k].page, "new_page": mb[k].page, "title": mb[k].title or ma[k].title}
             for k in ma if k in mb]
    pairs.sort(key=lambda p: p["old_page"])
    return {
        "pairs": pairs,
        "added": [{"sheet": mb[k].sheet, "new_page": mb[k].page, "title": mb[k].title} for k in mb if k not in ma],
        "removed": [{"sheet": ma[k].sheet, "old_page": ma[k].page, "title": ma[k].title} for k in ma if k not in mb],
    }


def _ink(pg: fitz.Page, size: tuple[int, int]) -> np.ndarray:
    """Dark-pixel mask of a page rendered (rotation applied) to exactly `size` (w, h)."""
    zx = size[0] / pg.rect.width
    zy = size[1] / pg.rect.height
    pix = pg.get_pixmap(matrix=fitz.Matrix(zx, zy), colorspace=fitz.csGRAY, annots=False, alpha=False)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
    if img.shape != (size[1], size[0]):
        img = np.array(Image.fromarray(img).resize(size))
    return img < 160


def _dilate(m: np.ndarray, r: int) -> np.ndarray:
    """Cheap square dilation (tolerates a pixel of re-plot jitter between revisions)."""
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx or dy:
                out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out


def _diff(old_pg: fitz.Page, new_pg: fitz.Page, dpi: float):
    w = max(1, int(old_pg.rect.width * dpi / 72))
    h = max(1, int(old_pg.rect.height * dpi / 72))
    a, b = _ink(old_pg, (w, h)), _ink(new_pg, (w, h))
    tol = 1 if dpi <= 40 else 2
    removed = a & ~_dilate(b, tol)
    added = b & ~_dilate(a, tol)
    return a, b, removed, added, (w, h)


def sheet_changes(old_pdf: str, new_pdf: str, pairs: list[dict], dpi: float = 24) -> list[dict]:
    a, b = fitz.open(old_pdf), fitz.open(new_pdf)
    out = []
    try:
        for p in pairs:
            A, B, rem, add, _ = _diff(a[p["old_page"]], b[p["new_page"]], dpi)
            ink = max(1, int(A.sum() + B.sum()) // 2)
            out.append(dict(p, changed=round(float((rem.sum() + add.sum()) / ink), 4),
                            removed_px=int(rem.sum()), added_px=int(add.sum())))
    finally:
        a.close(); b.close()
    return out


def _boxes(mask: np.ndarray, cell: int, scale: float, min_cells: int = 2) -> list[list[float]]:
    """Group changed pixels into boxes (coarse grid + flood fill) in page points."""
    h, w = mask.shape
    gh, gw = (h + cell - 1) // cell, (w + cell - 1) // cell
    pad = np.zeros((gh * cell, gw * cell), dtype=bool)
    pad[:h, :w] = mask
    grid = pad.reshape(gh, cell, gw, cell).sum(axis=(1, 3)) >= 3
    seen = np.zeros_like(grid)
    boxes = []
    for y in range(gh):
        for x in range(gw):
            if grid[y, x] and not seen[y, x]:
                stack = [(y, x)]
                seen[y, x] = True
                y0 = y1 = y
                x0 = x1 = x
                n = 0
                while stack:
                    cy, cx = stack.pop()
                    n += 1
                    y0, y1, x0, x1 = min(y0, cy), max(y1, cy), min(x0, cx), max(x1, cx)
                    for ny in range(cy - 1, cy + 2):
                        for nx in range(cx - 1, cx + 2):
                            if 0 <= ny < gh and 0 <= nx < gw and grid[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True
                                stack.append((ny, nx))
                if n >= min_cells:
                    boxes.append([round(x0 * cell / scale, 1), round(y0 * cell / scale, 1),
                                  round((x1 + 1) * cell / scale, 1), round((y1 + 1) * cell / scale, 1)])
    return boxes


def overlay(old_pdf: str, new_pdf: str, old_page: int, new_page: int, dpi: float = 72) -> dict:
    a, b = fitz.open(old_pdf), fitz.open(new_pdf)
    try:
        A, B, rem, add, (w, h) = _diff(a[old_page], b[new_page], dpi)
        page_w, page_h = a[old_page].rect.width, a[old_page].rect.height
    finally:
        a.close(); b.close()
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[rem] = (220, 38, 38, 235)        # removed — red
    rgba[add] = (22, 163, 74, 235)        # added — green
    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, format="PNG", optimize=True)
    scale = dpi / 72
    both = _dilate(rem | add, 2)
    return {
        "png_base64": base64.b64encode(buf.getvalue()).decode(),
        "page_size": [round(page_w, 1), round(page_h, 1)],
        "boxes": _boxes(both, max(6, int(10 * scale)), scale),
        "removed_px": int(rem.sum()), "added_px": int(add.sum()),
    }


def diff_takeoffs(old: dict, new: dict) -> list[dict]:
    """Items added / removed / changed between two auto-takeoff results."""
    oi = {i["id"]: i for i in old.get("items", []) if i.get("kind") == "scope"}
    ni = {i["id"]: i for i in new.get("items", []) if i.get("kind") == "scope"}
    out = []
    for k, n in ni.items():
        o = oi.get(k)
        if o is None:
            out.append({"item": k, "change": "added", "cls": n.get("cls"), "qty": n.get("qty"),
                        "size": [n.get("w_in"), n.get("h_in")], "label": n.get("label")})
            continue
        what = []
        if (o.get("qty") or 0) != (n.get("qty") or 0):
            what.append(f"count {o.get('qty')} → {n.get('qty')}")
        for key, nm in (("w_in", "width"), ("h_in", "height")):
            ov, nv = o.get(key), n.get(key)
            if ov and nv and abs(float(ov) - float(nv)) >= 0.5:
                what.append(f"{nm} {ov:.1f}\" → {nv:.1f}\"")
        if o.get("cls") != n.get("cls"):
            what.append(f"class {o.get('cls')} → {n.get('cls')}")
        if what:
            out.append({"item": k, "change": "changed", "cls": n.get("cls"), "detail": "; ".join(what), "label": n.get("label")})
    for k, o in oi.items():
        if k not in ni:
            out.append({"item": k, "change": "removed", "cls": o.get("cls"), "qty": o.get("qty"), "label": o.get("label")})
    order = {"added": 0, "changed": 1, "removed": 2}
    return sorted(out, key=lambda d: (order[d["change"]], d["item"]))
