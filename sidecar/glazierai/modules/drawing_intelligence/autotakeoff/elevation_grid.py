"""
elevation_grid.py — read the member grid of one frame elevation from the PDF's vector lines.

    g = read_grid(page, rect, W, H)
      → { "mullionsX": [in from left edge, CL],
          "columns": [ { "width": CL span (in), "kind": "glass"|"door",
                         "rows": [CL spans bottom→top (in)], "doorHeight": in|None,
                         "why": str } ],
          "rowsShared": [CL spans] | None,      # when every glass column has the same horizontals
          "confidence": 0..1, "notes": [...] }

How it reads (page space, rotation applied):
  * only thin, axis-aligned lines inside the frame rectangle count (the frame is
    drawn with the thinnest pen; tags, callouts and hatching are heavier);
  * a member is drawn as two face lines 1–3-1/2" apart → one centerline;
  * mullions = vertical members covering ≥ 35% of the frame height;
  * per column, horizontals = members spanning ≥ 70% of the column's clear width;
  * a column with no sill face near the bottom while other columns have one, or
    with a door swing / hardware mark, is a door bay; the lowest horizontal over
    it is the door header.
Deterministic; no model calls.
"""
from __future__ import annotations

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

from .pdfgeom import drawings

FACE_GAP_IN = 3.5      # the two faces of one member are closer than this
MIN_LITE_IN = 6.0
EDGE_IN = 3.5          # a member this close to a frame edge is the perimeter member's inner face


def _segments(pg: fitz.Page, R: fitz.Rect):
    M = pg.rotation_matrix
    out = []
    pad = R + (-1.5, -1.5, 1.5, 1.5)
    clip = pad * pg.derotation_matrix
    for d in drawings(pg):
        r = d["rect"]          # (degenerate for a straight line — test the bounds, not Rect.intersects)
        if r.x1 < clip.x0 or r.x0 > clip.x1 or r.y1 < clip.y0 or r.y0 > clip.y1:
            continue
        if d.get("type") == "f":
            # a fill is a line only when it is a thin bar (some CAD exports draw every line that way);
            # filled boxes (tag backgrounds, hatching, solid poché) are not lines
            rr = fitz.Rect(r) * M
            rr.normalize()
            th = min(rr.width, rr.height)
            if th > 1.2:
                continue
            col = tuple(round(v, 2) for v in (d.get("fill") or (0, 0, 0)))
            if rr.width >= rr.height:
                out.append((rr.x0, (rr.y0 + rr.y1) / 2, rr.x1, (rr.y0 + rr.y1) / 2, th, False, col))
            else:
                out.append(((rr.x0 + rr.x1) / 2, rr.y0, (rr.x0 + rr.x1) / 2, rr.y1, th, False, col))
            continue
        w = d.get("width") or 0
        dashed = bool(d.get("dashes") and d.get("dashes") not in ("[] 0", "[] 0.0"))
        col = tuple(round(v, 2) for v in (d.get("color") or (0, 0, 0)))
        for it in d["items"]:
            if it[0] == "l":
                a, b = it[1] * M, it[2] * M
                out.append((a.x, a.y, b.x, b.y, w, dashed, col))
            elif it[0] == "re":
                r = it[1] * M
                out += [(r.x0, r.y0, r.x1, r.y0, w, dashed, col), (r.x1, r.y0, r.x1, r.y1, w, dashed, col),
                        (r.x0, r.y1, r.x1, r.y1, w, dashed, col), (r.x0, r.y0, r.x0, r.y1, w, dashed, col)]
            elif it[0] == "qu":
                q = it[1]
                pts = [q.ul * M, q.ur * M, q.lr * M, q.ll * M]
                for p0, p1 in zip(pts, pts[1:] + pts[:1]):
                    out.append((p0.x, p0.y, p1.x, p1.y, w, dashed, col))
    return [s for s in out if pad.contains(fitz.Point(s[0], s[1])) and pad.contains(fitz.Point(s[2], s[3]))]


def _cover(spans: list[tuple[float, float]]) -> float:
    tot, cur = 0.0, None
    for a, b in sorted(spans):
        if cur is None or a > cur[1]:
            if cur:
                tot += cur[1] - cur[0]
            cur = [a, b]
        else:
            cur[1] = max(cur[1], b)
    if cur:
        tot += cur[1] - cur[0]
    return tot


def _group_faces(pos: list[float], gap: float) -> list[float]:
    """Face lines → member centerlines.  A group never spans more than one member width."""
    groups: list[list[float]] = []
    for a in sorted(pos):
        if groups and a - groups[-1][0] <= gap:
            groups[-1].append(a)
        else:
            groups.append([a])
    return [(g[0] + g[-1]) / 2 if len(g) <= 2 else (g[0] + g[1]) / 2 for g in groups]


def _drop_slivers(cl: list[float], lo: float, hi: float, min_w: float) -> list[float]:
    out = sorted(cl)
    while True:
        edges = [lo] + out + [hi]
        spans = [b - a for a, b in zip(edges, edges[1:])]
        i = next((k for k, w in enumerate(spans) if w < min_w), None)
        if i is None or not out:
            return out
        if i == 0:
            out.pop(0)
        elif i == len(spans) - 1:
            out.pop()
        else:
            out[i - 1] = (out[i - 1] + out[i]) / 2
            out.pop(i)


def read_grid(pg: fitz.Page, rect, W: float, H: float) -> dict | None:
    R = fitz.Rect(rect)
    if R.width < 4 or R.height < 4 or not W or not H:
        return None
    ppi_x, ppi_y = R.width / W, R.height / H            # page points per inch
    segs = _segments(pg, R)
    if not segs:
        return None
    # the frame pen: the width used along the outline
    out_segs = [s for s in segs if (abs(s[0] - R.x0) < 1.0 and abs(s[2] - R.x0) < 1.0) or (abs(s[1] - R.y1) < 1.0 and abs(s[3] - R.y1) < 1.0)]
    pen = min(s[4] for s in out_segs) if out_segs else min(s[4] for s in segs)
    # the frame's pen colour (tags, callouts and glass marks are usually another colour)
    cols_seen: dict = {}
    for s in out_segs:
        cols_seen[s[6]] = cols_seen.get(s[6], 0) + abs(s[2] - s[0]) + abs(s[3] - s[1])
    ink = max(cols_seen, key=cols_seen.get) if cols_seen else None
    # members may be drawn lighter than the outline; zero-width strokes (tag boxes) only count
    # when the whole frame is drawn that way
    lo = 0.0 if pen <= 0 else min(pen * 0.4, 0.25)
    thin = [s for s in segs if s[4] >= lo and s[4] <= pen * 1.6 + 0.15 and (ink is None or _close(s[6], ink))]
    V = [(s[0], min(s[1], s[3]), max(s[1], s[3]), s[5]) for s in thin if abs(s[0] - s[2]) < 0.3 and abs(s[1] - s[3]) > 0.5]
    Hs = [(s[1], min(s[0], s[2]), max(s[0], s[2]), s[5]) for s in thin if abs(s[1] - s[3]) < 0.3 and abs(s[0] - s[2]) > 0.5]
    notes: list[str] = []

    # ── mullions ──
    byx: dict[float, list] = {}
    for x, a, b, dsh in V:
        byx.setdefault(round(x, 1), []).append((a, b))
    vx = [x for x, sp in byx.items() if _cover(sp) >= 0.35 * R.height and R.x0 + EDGE_IN * ppi_x < x < R.x1 - EDGE_IN * ppi_x]
    mull_pts = _group_faces(vx, FACE_GAP_IN * ppi_x)
    mull_in = _drop_slivers([(x - R.x0) / ppi_x for x in mull_pts], 0.0, W, MIN_LITE_IN)
    edges_in = [0.0] + mull_in + [W]

    # ── per column: horizontals, sill, door ──
    sill_band = 4.5 * ppi_y
    head_band = 4.5 * ppi_y
    # x positions a real horizontal may end at: frame edges and vertical members (± a face)
    stops = [R.x0, R.x1] + [R.x0 + v * ppi_x for v in mull_in]
    tol_x = FACE_GAP_IN * ppi_x

    def ends_ok(a: float, b: float) -> bool:
        return any(abs(a - x) <= tol_x for x in stops) and any(abs(b - x) <= tol_x for x in stops)

    cols = []
    for c in range(len(edges_in) - 1):
        xa = R.x0 + edges_in[c] * ppi_x
        xb = R.x0 + edges_in[c + 1] * ppi_x
        clear = xb - xa
        lines = [y for y, a, b, dsh in Hs if _overlap(a, b, xa, xb) >= 0.7 * clear and ends_ok(a, b)]
        # the sill: how many distinct horizontal lines run across the bottom 6" of this bay
        band = [y for y, a, b, dsh in Hs if not dsh and R.y1 - 6 * ppi_y <= y <= R.y1 + 1.5 and _overlap(a, b, xa, xb) >= 0.5 * clear]
        n_bottom = len(_group_faces(band, 0.6))
        inner = [y for y in lines if R.y0 + head_band < y < R.y1 - sill_band]
        hz = _group_faces(inner, FACE_GAP_IN * ppi_y)
        hz_in = _drop_slivers([(R.y1 - y) / ppi_y for y in hz], 0.0, H, MIN_LITE_IN)
        diag = [s_ for s_ in thin if xa < min(s_[0], s_[2]) and max(s_[0], s_[2]) < xb and abs(s_[0] - s_[2]) > 0.3 * clear and abs(s_[1] - s_[3]) > 0.15 * R.height]
        cols.append({"xa": xa, "xb": xb, "width": round(edges_in[c + 1] - edges_in[c], 2), "rows_cl": hz_in,
                     "nb": n_bottom, "swing": bool(diag)})

    nb_max = max((c["nb"] for c in cols), default=0)
    low_rail = lambda c: min(c["rows_cl"]) if c["rows_cl"] else None
    for c in cols:
        lr = low_rail(c)
        clear_below = lr is None or lr >= 78                 # nothing across the bay below door-head height (6'-6"+)
        no_sill = nb_max > 0 and c["nb"] < nb_max           # fewer lines at the bottom than the other bays
        others_low = any(o is not c and low_rail(o) is not None and low_rail(o) < 48 for o in cols)
        head_only = lr is not None and lr >= 78 and others_low   # a header at door height while the other bays have a low rail
        # a drawn leaf: its bottom rail (6–12" up), then nothing until the header at door height
        hs = sorted(c["rows_cl"])
        leaf = (28 <= c["width"] <= 42 and len(hs) >= 2 and 6 <= hs[0] <= 12 and hs[1] >= 78
                and (others_low or no_sill))
        if leaf:
            c["rows_cl"] = hs[1:]
        c["door"] = 28 <= c["width"] <= 84 and ((clear_below and (no_sill or c["swing"] or head_only)) or leaf)
        c["why"] = ", ".join(w for w, ok in (("no sill (other bays have one)", no_sill), ("door swing drawn", c["swing"]),
                                             ("header at door height, no low rail (other bays have one)", head_only),
                                             ("door leaf drawn", leaf)) if ok)
        # the door header: the lowest horizontal at door height (≥ 6'-0"); lines below it are the leaf
        hdr = [h for h in c["rows_cl"] if 78 <= h <= H - 3]
        c["doorHeight"] = round(min(hdr), 2) if c["door"] and hdr else None
        if c["door"] and c["doorHeight"]:
            c["rows_cl"] = [h for h in c["rows_cl"] if h >= c["doorHeight"] - 0.5]

    for i, c in enumerate(cols):
        if not c["door"] or c["width"] > 42 or not c["doorHeight"]:
            continue
        for j in (i - 1, i + 1):
            if 0 <= j < len(cols):
                o = cols[j]
                below = [h for h in o["rows_cl"] if h < c["doorHeight"] - 4]
                leafish = all(6 <= h <= 12 for h in below)          # nothing below the header but a bottom rail
                no_sill_o = nb_max > 0 and o["nb"] < nb_max
                if (not o["door"] and 28 <= o["width"] <= 42 and any(abs(h - c["doorHeight"]) <= 4 for h in o["rows_cl"])
                        and leafish and (no_sill_o or below)):
                    o["door"] = True
                    o["doorHeight"] = c["doorHeight"]
                    o["rows_cl"] = [h for h in o["rows_cl"] if h >= c["doorHeight"] - 4]
                    o["why"] = "second leaf of a pair (same header)"

    # a pair of doors: two door bays whose divider stops at the header (meeting stiles, not a mullion)
    merged = []
    for c in cols:
        if merged and c["door"] and merged[-1]["door"] and c["width"] <= 42 and merged[-1]["width"] <= 42 \
                and c["width"] + merged[-1]["width"] <= 84:
            if True:   # two side-by-side single doors with a mullion between them are rare; a pair is the norm
                if c["doorHeight"] and merged[-1]["doorHeight"]:
                    merged[-1]["doorHeight"] = max(c["doorHeight"], merged[-1]["doorHeight"])
                    merged[-1]["rows_cl"] = [h for h in merged[-1]["rows_cl"] if h >= merged[-1]["doorHeight"] - 0.5]
                p_ = merged[-1]
                p_["width"] = round(p_["width"] + c["width"], 2)
                p_["xb"] = c["xb"]
                p_["pair"] = True
                notes.append(f"two door bays at {round((p_['xa'] - R.x0) / ppi_x, 1)}\" read as one pair — confirm")
                continue
        merged.append(c)
    cols = merged
    mull_in = [round((c["xa"] - R.x0) / ppi_x, 2) for c in cols[1:]]

    out_cols = []
    for c in cols:
        why = c["why"] if c["door"] else ""
        out_cols.append({"width": c["width"], "kind": "door" if c["door"] else "glass",
                         "leaves": (2 if c.get("pair") or c["width"] >= 60 else 1) if c["door"] else None,
                         "rows": _spans(c["rows_cl"], H) if not (c["door"] and c["doorHeight"]) else _spans(c["rows_cl"], H),
                         "horizontalsAt": [round(v, 2) for v in c["rows_cl"]], "doorHeight": c["doorHeight"],
                         "why": why.strip() or None})

    glass_rows = [tuple(c["horizontalsAt"]) for c in out_cols if c["kind"] == "glass"]
    shared = None
    if glass_rows and all(_same(r, glass_rows[0]) for r in glass_rows):
        shared = _spans(list(glass_rows[0]), H)
    if nb_max == 0:
        notes.append("no sill lines drawn — door bays can't be told from glass bays")
    conf = 0.85 if len(V) > 4 and len(Hs) > 4 else 0.5
    return {"mullionsX": [round(v, 2) for v in mull_in], "columns": out_cols, "rowsShared": shared,
            "confidence": conf, "notes": notes}


def _close(a, b, tol: float = 0.08) -> bool:
    return len(a) == len(b) and all(abs(x - y) <= tol for x, y in zip(a, b))


def _overlap(a: float, b: float, xa: float, xb: float) -> float:
    return max(0.0, min(b, xb) - max(a, xa))


def _spans(pos: list[float], total: float) -> list[float]:
    edges = [0.0] + sorted(pos) + [total]
    return [round(b - a, 2) for a, b in zip(edges, edges[1:])]


def _same(a, b, tol: float = 1.5) -> bool:
    return len(a) == len(b) and all(abs(x - y) <= tol for x, y in zip(a, b))
