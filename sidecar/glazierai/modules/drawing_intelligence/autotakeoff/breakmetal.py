"""
breakmetal.py — break metal flashing & trim, driven purely off details
(Martin: "if details show it and it touches our system, we pick it up").

1. Every detail whose callouts name break metal / prefinished metal flashing /
   metal trim or wrap, and whose title or callouts name one of our systems
   (storefront, curtain wall, translucent panel).  Flashing by others,
   cavity-wall / thru-wall flashing and roofing are not ours.
2. Which edge the detail covers comes from its title: HEAD, SILL, JAMB
   (WRAP / BETWEEN / CORNER details are jamb conditions).
3. On the exterior elevations, every frame of that system gets a polylength on
   those edges; runs on the same pier or head line are merged.

    scan_details(pg, sheet, details) -> [BMDetail]
    edges_for(bm_details) -> {system: {"head","sill","jamb"}}
    runs(frames, edges, ppf) -> [{"p0","p1","len_in"}]
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

from .pdfgeom import text_lines

BM = re.compile(r"BRA?KE\s*METAL|BREAK\s*METAL|METAL\s+(SILL\s+)?FLASHING|METAL\s+TRIM|METAL\s+WRAP|BRAKE\s+SHAPE|ALUMINUM\s+(SILL\s+|HEAD\s+)?(FLASHING|TRIM|CLOSURE|WRAP)", re.I)
NOT_OURS = re.compile(r"CAVITY|THRU|THROUGH|BY\s+OTHERS|\bBY\s*$|RE-?\s*ROOF|ROOFING|RE-?\s*CIVIL|GUTTER|DOWNSPOUT|COPING|RE-?\s*STRUCT", re.I)
SYSTEMS = (("translucent", re.compile(r"TRANSLUCENT", re.I)),
           ("cw", re.compile(r"CURTAIN\s*WALL|\bCW\b", re.I)),
           ("sf", re.compile(r"STOREFRONT|STORE FRONT|\bSF\b", re.I)))


_TITLE = re.compile(r"^(\d+\s+)?((HEAD|JAMB|SILL|PLAN|SECTION|WALL|ENLARGED)\s+)?(DETAIL|SECTION)\b", re.I)


@dataclass
class BMDetail:
    sheet: str
    page: int
    num: str
    title: str
    edges: list = field(default_factory=list)
    systems: list = field(default_factory=list)
    callouts: list = field(default_factory=list)   # [{"text", "rect"}]

    def to_dict(self) -> dict:
        return asdict(self)


def _edges(title: str) -> list[str]:
    t = title.upper()
    e = []
    if "HEAD" in t:
        e.append("head")
    if "SILL" in t:
        e.append("sill")
    if re.search(r"JAMB|WRAP|BETWEEN|CORNER|MULLION|PIER|COLUMN", t):
        e.append("jamb")
    return e


def scan_details(pg: fitz.Page, sheet: str, details) -> list[BMDetail]:
    out = []
    tl = text_lines(pg)
    for d in details:
        if not d.num or d.num == "?":
            continue
        R = fitz.Rect(d.region)
        # other details' titles bleed into a neighbour's region — never callouts or system evidence
        inside = [t for t in tl if R.contains(t.center) and not _TITLE.match(t.text.strip())]
        title_r = fitz.Rect(d.title_rect) if getattr(d, "title_rect", None) else None
        calls = []
        for t in inside:
            if title_r and title_r.intersects(t.r):
                continue
            if BM.search(t.text) and not NOT_OURS.search(t.text):
                calls.append({"text": t.text.strip(), "rect": [round(v, 1) for v in t.rect]})
        if not calls and not BM.search(d.title):
            continue
        sys_ = [k for k, rx in SYSTEMS if rx.search(d.title)]
        if not sys_:
            sys_ = [k for k, rx in SYSTEMS if any(rx.search(t.text) for t in inside)]
        if not sys_:
            continue
        out.append(BMDetail(sheet, pg.number, d.num, d.title, _edges(d.title), sys_, calls))
    return out


def edges_for(bms: list[BMDetail]) -> dict[str, set]:
    m: dict[str, set] = {}
    for b in bms:
        for s in b.systems:
            m.setdefault(s, set()).update(b.edges)
    return m


def _merge(segs: list[tuple], tol: float = 10.0, gap: float = 6.0) -> list[tuple]:
    """segs: (orient, coord, a, b).  Parallel runs within tol on overlapping/touching spans → one run."""
    out: list[list] = []
    for o, c, a, b in sorted(segs, key=lambda s: (s[0], s[1], s[2])):
        for r in out:
            if r[0] == o and abs(r[1] - c) <= tol and a <= r[3] + gap and b >= r[2] - gap:
                r[1] = (r[1] + c) / 2
                r[2], r[3] = min(r[2], a), max(r[3], b)
                break
        else:
            out.append([o, c, a, b])
    # a second pass joins runs that became neighbours
    changed = True
    while changed:
        changed = False
        for i in range(len(out)):
            for j in range(i + 1, len(out)):
                p, q = out[i], out[j]
                if p[0] == q[0] and abs(p[1] - q[1]) <= tol and p[2] <= q[3] + gap and p[3] >= q[2] - gap:
                    p[1] = (p[1] + q[1]) / 2
                    p[2], p[3] = min(p[2], q[2]), max(p[3], q[3])
                    out.pop(j)
                    changed = True
                    break
            if changed:
                break
    return [tuple(r) for r in out]


def runs(frames: list[tuple[list, str]], edge_map: dict[str, set], ppf: float) -> list[dict]:
    """frames: [(rect, system)].  Returns merged runs with lengths."""
    segs = []
    for rect, sysk in frames:
        e = edge_map.get(sysk, set())
        x0, y0, x1, y1 = rect
        if "head" in e:
            segs.append(("h", y0, x0, x1))
        if "sill" in e:
            segs.append(("h", y1, x0, x1))
        if "jamb" in e:
            segs.append(("v", x0, y0, y1))
            segs.append(("v", x1, y0, y1))
    out = []
    for o, c, a, b in _merge(segs):
        p0, p1 = ((a, c), (b, c)) if o == "h" else ((c, a), (c, b))
        out.append({"p0": [round(p0[0], 1), round(p0[1], 1)], "p1": [round(p1[0], 1), round(p1[1], 1)],
                    "len_in": round((b - a) / ppf * 12, 1), "orient": o})
    return out
