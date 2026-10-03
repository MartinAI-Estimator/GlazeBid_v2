"""
geometry_anchoring.py — give every vision-identified mark a place on the page.

The vision pipeline (Steps 1–4) answers WHAT and HOW MUCH: MarkEntry has a
mark_id, a scope_type, a source sheet and a description — but no coordinates.
The Builder overlay, the eval harness and any Bluebeam-style export all need
WHERE: a bbox in fitz page space.

This module is the "geometry assists" half of the architecture recorded in
sidecar/experiments/universal_takeoff_test/RESULTS.md:

    vision solves detection … geometry assists with localization.

Strategy, per MarkEntry:
  1. Resolve source_sheet ("A2.0") → page_index via the classifier routing.
  2. Find every instance of the callout tag on that page with PyMuPDF text
     extraction.  Whole-word match, not substring.  For SHORT / NUMERIC tags
     ("2", "107", "A") additionally require the word to sit inside a small
     closed drawing (the hexagon / circle / diamond that architects draw
     around a callout) — otherwise every dimension string and grid bubble on
     the sheet becomes a hit.
  3. Snap each hit to a glazing rectangle from the rules engine
     (layers.rules_engine) on the same page: the candidate whose bbox contains
     the tag, else the nearest candidate within MAX_SNAP_DISTANCE_PTS.
  4. No candidate in range → fixed fallback box around the tag, flagged
     anchor_method="tag_fallback" with reduced confidence, so downstream can
     filter or show it differently.

Output is a list of plain dicts in the FRONTEND CONTRACT:
    { "system_type": "Ext SF", "bbox": [x0, y0, x1, y1], "page_index": 4,
      "bay_count": 3, "row_count": 1, "grid_source": "geometry", … }

bbox is fitz page space — top-left origin, 72 pt/in, unrotated — the same
convention as pdfCoordinates.mjs, /run-region and the eval harness.

── Grid counts (Money Bridge intake, 2026-09-18) ────────────────────────────
bay_count / row_count are what the parametric engine in Builder needs to
build a multi-lite frame instead of a 1×1 perimeter box.  They come from,
in priority order:
  1. geometry  — vertical / horizontal lines inside the box that span most
                 of its height / width (the rules engine's own bay test,
                 plus the transposed test for rows), read off the vector
                 graph of the page;
  2. vision    — the model's explicit bay_count / row_count (region mode),
                 or a "3 bays × 2 rows" / "4 equal panels" phrase in the
                 mark description;
  3. default   — 1 × 1, flagged grid_source="default" so downstream can
                 show it as unverified.
`annotate_grid_counts()` applies the same rule to /run-region detections.

No LLM calls.  Pure PyMuPDF + the existing rules engine.  Safe to run on
every /drawing-intelligence/run.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Iterable, Optional

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)

# ── Tunables ──────────────────────────────────────────────────────────────────

MAX_SNAP_DISTANCE_PTS = 150.0     # ~2" at 1/8" scale; leader lines are short
CALLOUT_SYMBOL_MAX_PTS = 48.0     # a callout hexagon/circle is well under this
TAG_FALLBACK_BOX_PTS = 96.0       # ~1.3" square when no geometry candidate exists
MIN_CANDIDATE_CONFIDENCE = 0.40   # ignore rules-engine rejects when snapping

# Grid counting (mirrors layers.rules_engine._detect_bays so the two agree)
GRID_SPAN_FRACTION = 0.5          # a mullion must span ≥ half the box to count
GRID_BUCKET_PTS = 5.0             # lines within 5 pt collapse to one mullion
GRID_EDGE_TOLERANCE_PTS = 2.0     # lines this close to the box edge are its jambs/head/sill
MAX_GRID_COUNT = 40               # anything larger is hatch / dimension noise, not a frame

# Tags this short are ambiguous as bare text; require a callout symbol.
_SHORT_TAG = re.compile(r"^[A-Z]?\d{0,3}[A-Z]?$", re.IGNORECASE)

# "3 bays × 2 rows", "4 bay x 1 row", "3x2 grid", "5 equal panels", "3 lites wide"
_GRID_PAIR = re.compile(
    r"(\d{1,2})\s*(?:bays?|lites?|panels?|wide)?\s*[x×by]+\s*(\d{1,2})\s*(?:rows?|lites?|panels?|high)?",
    re.I,
)
_GRID_BAYS = re.compile(r"(\d{1,2})\s*(?:equal\s+)?(?:bays?|lites?\s+wide|panels?\s+wide|(?:equal\s+)?panels?)\b", re.I)
_GRID_ROWS = re.compile(r"(\d{1,2})\s*(?:rows?|lites?\s+high|panels?\s+high|tiers?)\b", re.I)

# ── Vocabulary bridges ───────────────────────────────────────────────────────

# legend_extractor scope_type  →  Builder canonical SystemType (systemTypes.js)
# Anything not listed keeps its scope_type as system_type; the overlay draws it
# in the fallback style and the frontend can still show the label.
_SCOPE_TO_SYSTEM = {
    "storefront":   "Ext SF",     # → "Int SF" when the mark reads as interior
    "curtain_wall": "Cap CW",     # → "SSG CW" when the text says SSG / structural
    "fire_rated":   "Ext SF",
}

# legend_extractor scope_type  →  eval_harness scope_class (SUBJECT_MAP values)
_SCOPE_TO_HARNESS = {
    "storefront":        "ext_sf",       # → "int_sf" when interior
    "curtain_wall":      "ext_cw",
    "all_glass_wall":    "all_glass_wall",
    "glazing_only":      "glazing_only",
    "fire_rated":        "glazing_only",
    "window":            "window",
    "mirror":            "mirror",
    "translucent_panel": "translucent_panel",
    "sun_control":       "sun_control",
    "glass_handrail":    "glass_handrail",
}

_INTERIOR_HINT = re.compile(r"\binterior\b|\bint\.?\b|\bpartition|\boffice|\bcorridor|\bconference", re.I)
_SSG_HINT = re.compile(r"\bssg\b|structural(ly)?[\s-]*glaz|silicone[\s-]*glaz", re.I)


def _looks_interior(mark) -> bool:
    text = " ".join(filter(None, [getattr(mark, "location", ""), getattr(mark, "description", ""), getattr(mark, "key_specs", "")]))
    return bool(_INTERIOR_HINT.search(text))


def _looks_ssg(mark, system_entry) -> bool:
    text = " ".join(filter(None, [
        getattr(mark, "description", ""), getattr(mark, "key_specs", ""),
        getattr(system_entry, "series", None) or "", getattr(system_entry, "description", None) or "",
    ]))
    return bool(_SSG_HINT.search(text))


def system_type_for(mark, system_entry=None) -> str:
    """scope_type (+ context) → canonical Builder system type, or the raw scope_type."""
    scope = (getattr(mark, "scope_type", "") or "").strip().lower()
    base = _SCOPE_TO_SYSTEM.get(scope)
    if base is None:
        return scope or "unknown"
    if base == "Ext SF" and _looks_interior(mark):
        return "Int SF"
    if base == "Cap CW" and _looks_ssg(mark, system_entry):
        return "SSG CW"
    return base


def harness_class_for(mark) -> Optional[str]:
    scope = (getattr(mark, "scope_type", "") or "").strip().lower()
    cls = _SCOPE_TO_HARNESS.get(scope)
    if cls == "ext_sf" and _looks_interior(mark):
        return "int_sf"
    return cls


# ── Grid counts ───────────────────────────────────────────────────────────────

def _clean_count(value) -> Optional[int]:
    """Coerce a vision / text count to a sane int, or None if unusable."""
    try:
        n = int(round(float(value)))
    except (TypeError, ValueError):
        return None
    if n < 1 or n > MAX_GRID_COUNT:
        return None
    return n


def grid_hint_from_text(text: str) -> tuple[Optional[int], Optional[int]]:
    """
    Pull (bays, rows) out of free text such as a mark description.

    "3 bays × 2 rows"     → (3, 2)      "4 equal panels"   → (4, None)
    "3x1 storefront"      → (3, 1)      "2 rows high"      → (None, 2)
    Anything unparseable  → (None, None).  Never raises.
    """
    if not text:
        return None, None
    m = _GRID_PAIR.search(text)
    if m:
        return _clean_count(m.group(1)), _clean_count(m.group(2))
    bays = rows = None
    m = _GRID_BAYS.search(text)
    if m:
        bays = _clean_count(m.group(1))
    m = _GRID_ROWS.search(text)
    if m:
        rows = _clean_count(m.group(1))
    return bays, rows


def resolve_grid(
    geom_bays: Optional[int], geom_rows: Optional[int],
    hint_bays: Optional[int], hint_rows: Optional[int],
) -> tuple[int, int, str]:
    """
    Combine geometry-measured and vision/text-hinted counts into
    (bay_count, row_count, grid_source).

    Geometry wins when it actually found divisions (> 1).  A geometry count
    of exactly 1 means "no interior mullion seen", which is also what an
    unreadable drawing looks like — so a hint of > 1 overrides it.  Each
    axis resolves independently; nothing found → 1 with source "default".
    """
    def pick(g, h):
        if g is not None and g > 1:
            return g, "geometry"
        if h is not None and h > 1:
            return h, "vision"
        if g is not None:
            return g, "geometry"
        if h is not None:
            return h, "vision"
        return 1, "default"

    bays, bsrc = pick(_clean_count(geom_bays), _clean_count(hint_bays))
    rows, rsrc = pick(_clean_count(geom_rows), _clean_count(hint_rows))
    if bsrc == rsrc:
        source = bsrc
    elif "geometry" in (bsrc, rsrc):
        source = "geometry+vision" if "vision" in (bsrc, rsrc) else "geometry"
    else:
        source = "vision"
    return bays, rows, source


def count_grid_lines(
    rect: fitz.Rect,
    x: list, edge_index: list, edge_attr: list,
) -> tuple[int, int]:
    """
    (bay_count, row_count) for one box, from the page's vector graph.

    Same test the rules engine applies in _detect_bays — a vertical edge
    inside the box's x-range that spans ≥ GRID_SPAN_FRACTION of its height
    is a mullion — plus the transposed test for horizontals.  Lines are
    bucketed to GRID_BUCKET_PTS so a double-stroked mullion counts once, and
    the box's own jambs/head/sill are excluded by GRID_EDGE_TOLERANCE_PTS
    so the answer is interior divisions + 1, never "3 lines → 2 bays"
    when two of the lines were the frame itself.
    """
    if not x or not edge_index or len(edge_index) < 2:
        return 1, 1
    src, dst = edge_index[0], edge_index[1]
    w, h = rect.width, rect.height
    if w <= 0 or h <= 0:
        return 1, 1

    # Pass 1 — every long line that lies inside the box, by orientation.
    #   verts: (x, y_min, y_max)     horzs: (y, x_min, x_max)
    verts: list[tuple[float, float, float]] = []
    horzs: list[tuple[float, float, float]] = []
    for i, (u, v) in enumerate(zip(src, dst)):
        if u >= len(x) or v >= len(x):
            continue
        pu, pv = x[u], x[v]
        dx, dy = abs(pv[0] - pu[0]), abs(pv[1] - pu[1])
        mid_x, mid_y = (pu[0] + pv[0]) / 2.0, (pu[1] + pv[1]) / 2.0
        if dy >= dx:                                   # vertical-ish
            if not (rect.x0 <= mid_x <= rect.x1):
                continue
            # The part of the line that actually lies inside THIS box must
            # span most of it — a mullion of the frame next door that merely
            # shares the y-band is not one of ours.
            lo, hi = max(min(pu[1], pv[1]), rect.y0), min(max(pu[1], pv[1]), rect.y1)
            if hi - lo < h * GRID_SPAN_FRACTION:
                continue
            verts.append((mid_x, lo, hi))
        else:                                          # horizontal-ish
            if not (rect.y0 <= mid_y <= rect.y1):
                continue
            lo, hi = max(min(pu[0], pv[0]), rect.x0), min(max(pu[0], pv[0]), rect.x1)
            if hi - lo < w * GRID_SPAN_FRACTION:
                continue
            horzs.append((mid_y, lo, hi))

    # Pass 2 — an INTERIOR mullion has glass on both sides, so some
    # perpendicular member must run straight across it.  The box's own jambs
    # / head / sill fail this (the perpendiculars END at them, not through
    # them) and so does the edge of a callout symbol the rules engine merged
    # into the candidate box — which would otherwise read as one extra row.
    tol = GRID_EDGE_TOLERANCE_PTS

    def crossed_by(pos: float, perps) -> bool:
        return any(lo < pos - tol and hi > pos + tol for _, lo, hi in perps)

    vert_x: set[int] = set()
    for vx, _, _ in verts:
        if vx - rect.x0 <= tol or rect.x1 - vx <= tol:
            continue                                   # jamb
        if not crossed_by(vx, horzs):
            continue
        vert_x.add(int(round(vx / GRID_BUCKET_PTS)))
    horz_y: set[int] = set()
    for hy, _, _ in horzs:
        if hy - rect.y0 <= tol or rect.y1 - hy <= tol:
            continue                                   # head / sill
        if not crossed_by(hy, verts):
            continue
        horz_y.add(int(round(hy / GRID_BUCKET_PTS)))

    bays = min(len(vert_x) + 1, MAX_GRID_COUNT)
    rows = min(len(horz_y) + 1, MAX_GRID_COUNT)
    return bays, rows


# ── Data ──────────────────────────────────────────────────────────────────────

@dataclass
class AnchoredDetection:
    system_type: str
    bbox: list[float]                 # [x0, y0, x1, y1] fitz page space
    page_index: int
    sheet_number: str
    mark: str
    scope_type: str
    confidence: float
    anchor_method: str                # "candidate_contains" | "candidate_nearest" | "tag_fallback"
    tag_bbox: list[float]             # where the callout text itself was found
    description: str = ""
    harness_class: Optional[str] = None
    source: str = "vision+geometry-v1"
    # Grid — what the parametric engine consumes (see module docstring)
    bay_count: int = 1
    row_count: int = 1
    grid_source: str = "default"      # "geometry" | "vision" | "geometry+vision" | "default"

    def to_dict(self) -> dict:
        return {
            "system_type":   self.system_type,
            "bbox":          [round(v, 2) for v in self.bbox],
            "page_index":    self.page_index,
            "sheet_number":  self.sheet_number,
            "mark":          self.mark,
            "scope_type":    self.scope_type,
            "confidence":    round(self.confidence, 3),
            "anchor_method": self.anchor_method,
            "tag_bbox":      [round(v, 2) for v in self.tag_bbox],
            "description":   self.description,
            "harness_class": self.harness_class,
            "source":        self.source,
            "bay_count":     int(self.bay_count),
            "row_count":     int(self.row_count),
            "grid_source":   self.grid_source,
        }


@dataclass
class AnchoringReport:
    detections: list[AnchoredDetection] = field(default_factory=list)
    marks_total: int = 0
    marks_anchored: int = 0
    marks_no_page: list[str] = field(default_factory=list)
    marks_no_text_hit: list[str] = field(default_factory=list)
    by_method: dict = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "marks_total":       self.marks_total,
            "marks_anchored":    self.marks_anchored,
            "detections":        len(self.detections),
            "by_method":         dict(self.by_method),
            "marks_no_page":     self.marks_no_page,
            "marks_no_text_hit": self.marks_no_text_hit,
            "errors":            self.errors,
        }


# ── Page-level helpers (computed once per page, cached) ──────────────────────

class _PageIndex:
    """Words, small closed symbols, and rules-engine candidates for one page."""

    def __init__(self, doc: fitz.Document, pdf_path: str, page_index: int):
        self.page_index = page_index
        page = doc[page_index]
        self.page_rect = page.rect

        # words: (x0, y0, x1, y1, text, block, line, word)
        self.words = page.get_text("words")

        # Small closed shapes = callout symbols (hexagon / circle / diamond).
        self.symbols: list[fitz.Rect] = []
        try:
            for d in page.get_drawings():
                r = d.get("rect")
                if r is None:
                    continue
                r = fitz.Rect(r)
                if 4 <= r.width <= CALLOUT_SYMBOL_MAX_PTS and 4 <= r.height <= CALLOUT_SYMBOL_MAX_PTS:
                    # roughly square/round, and closed or filled
                    if 0.5 <= r.width / max(r.height, 1e-6) <= 2.0 and (d.get("closePath") or d.get("fill") is not None or len(d.get("items", [])) >= 3):
                        self.symbols.append(r)
        except Exception as e:  # get_drawings can choke on exotic content
            logger.debug(f"page {page_index}: get_drawings failed: {e}")

        # Rules-engine candidates (geometry). Optional dependency: degrade to
        # tag_fallback if the AiQ layers are unavailable.
        self.candidates: list[fitz.Rect] = []
        self.candidate_conf: list[float] = []
        self.candidate_bays: list[int] = []      # rules engine's own _detect_bays result
        # Vector graph kept for grid counting on ANY box (candidate or vision).
        self.graph_x: list = []
        self.graph_edge_index: list = []
        self.graph_edge_attr: list = []
        try:
            from layers.layer2_extractor import extract_vector_graph
            from layers.rules_engine import run_rules_engine
            graph = extract_vector_graph(pdf_path, page_num=page_index, sheet_type="elevation")
            if graph.node_count >= 10:
                self.graph_x = graph.x
                self.graph_edge_index = graph.edge_index
                self.graph_edge_attr = graph.edge_attr
                cands = run_rules_engine(
                    graph.x, graph.edge_index, graph.edge_attr,
                    scale_factor=graph.scale.scale_factor,
                    scale_confidence=graph.scale.scale_confidence,
                    source_sheet=f"page_{page_index}",
                )
                for c in cands:
                    if c.status == "rejected" or c.confidence < MIN_CANDIDATE_CONFIDENCE:
                        continue
                    b = c.bounding_box
                    self.candidates.append(fitz.Rect(b.x, b.y, b.x + b.width, b.y + b.height))
                    self.candidate_conf.append(float(c.confidence))
                    self.candidate_bays.append(int(getattr(c, "bay_count", 1) or 1))
        except Exception as e:
            logger.warning(f"page {page_index}: rules engine unavailable for snapping ({type(e).__name__}: {e}) — tag_fallback only")

    @property
    def has_graph(self) -> bool:
        return bool(self.graph_x) and bool(self.graph_edge_index)

    # ── grid ──

    def grid_for(self, rect: fitz.Rect) -> tuple[Optional[int], Optional[int]]:
        """
        Geometry-measured (bays, rows) for a box, or (None, None) when the
        page has no usable vector graph (raster scan, extractor failure).
        """
        if not self.has_graph:
            return None, None
        try:
            return count_grid_lines(rect, self.graph_x, self.graph_edge_index, self.graph_edge_attr)
        except Exception as e:
            logger.debug(f"page {self.page_index}: grid count failed: {e}")
            return None, None

    # ── tag search ──

    def find_tag(self, mark_id: str) -> list[fitz.Rect]:
        """
        Whole-word occurrences of mark_id on this page.

        Callout tags sit inside a small closed symbol (hexagon / circle /
        diamond).  Notes, dimension strings and detail references do not.
        Rule: if ANY whole-word hit is symbol-enclosed, return only the
        enclosed hits (the bare ones are references to the tag, not the tag).
        If none are enclosed, short/numeric tags are rejected outright (too
        ambiguous) and alphanumeric tags fall back to bare whole-word hits.
        """
        target = mark_id.strip().upper()
        if not target:
            return []
        enclosed: list[fitz.Rect] = []
        bare: list[fitz.Rect] = []
        for w in self.words:
            text = w[4].strip().strip("()[]{}.,:;").upper()
            if text != target:
                continue
            r = fitz.Rect(w[0], w[1], w[2], w[3])
            c = fitz.Point((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)
            (enclosed if any(s.contains(c) for s in self.symbols) else bare).append(r)
        if enclosed:
            return enclosed
        if _SHORT_TAG.match(target):
            return []            # "2" with no callout symbol = dimension noise
        return bare

    # ── snapping ──

    def snap(self, tag: fitz.Rect) -> tuple[Optional[fitz.Rect], float, str]:
        """Return (candidate_rect, candidate_conf, method) or (None, 0, 'tag_fallback')."""
        rect, conf, method, _ = self.snap_index(tag)
        return rect, conf, method

    def snap_index(self, tag: fitz.Rect) -> tuple[Optional[fitz.Rect], float, str, int]:
        """As snap(), plus the index of the chosen candidate (-1 for fallback)."""
        if not self.candidates:
            return None, 0.0, "tag_fallback", -1
        center = fitz.Point((tag.x0 + tag.x1) / 2, (tag.y0 + tag.y1) / 2)

        # 1. containing candidates — prefer the SMALLEST that contains the tag
        #    (the frame itself, not the whole facade band).
        containing = [(i, r) for i, r in enumerate(self.candidates) if r.contains(center)]
        if containing:
            i, r = min(containing, key=lambda ir: ir[1].get_area())
            return r, self.candidate_conf[i], "candidate_contains", i

        # 2. nearest by edge distance, within range
        best_i, best_d = -1, MAX_SNAP_DISTANCE_PTS
        for i, r in enumerate(self.candidates):
            dx = max(r.x0 - center.x, 0.0, center.x - r.x1)
            dy = max(r.y0 - center.y, 0.0, center.y - r.y1)
            d = (dx * dx + dy * dy) ** 0.5
            if d < best_d:
                best_i, best_d = i, d
        if best_i >= 0:
            return self.candidates[best_i], self.candidate_conf[best_i], "candidate_nearest", best_i
        return None, 0.0, "tag_fallback", -1

    def fallback_box(self, tag: fitz.Rect) -> fitz.Rect:
        cx, cy = (tag.x0 + tag.x1) / 2, (tag.y0 + tag.y1) / 2
        h = TAG_FALLBACK_BOX_PTS / 2
        return fitz.Rect(cx - h, cy - h, cx + h, cy + h) & self.page_rect


# ── Public API ────────────────────────────────────────────────────────────────

def build_sheet_page_map(routing) -> dict[str, int]:
    """ClassificationResult → {sheet_number: page_index}; tolerant of case/whitespace."""
    out: dict[str, int] = {}
    for s in getattr(routing, "sheets", []) or []:
        key = (s.sheet_number or "").strip().upper()
        if key and key not in out:
            out[key] = s.page_index
    return out


def anchor_marks(
    pdf_path: str,
    marks: Iterable,                       # MarkEntry objects
    routing,                               # ClassificationResult
    system_registry=None,                  # SystemRegistry (for SSG hint / series)
    only_glazing_scope: bool = True,
) -> AnchoringReport:
    """
    Anchor every MarkEntry to page geometry.  Returns an AnchoringReport whose
    .detections is the frontend-contract list.  Never raises for a single bad
    mark — problems are recorded in the report.
    """
    report = AnchoringReport()
    sheet_to_page = build_sheet_page_map(routing)
    marks = list(marks)
    report.marks_total = len(marks)

    doc = fitz.open(pdf_path)
    page_cache: dict[int, _PageIndex] = {}
    try:
        for mark in marks:
            if only_glazing_scope and not getattr(mark, "is_glazing_scope", True):
                continue
            mark_id = (getattr(mark, "mark_id", "") or "").strip()
            sheet = (getattr(mark, "source_sheet", "") or "").strip().upper()
            page_index = sheet_to_page.get(sheet)
            if page_index is None or page_index < 0 or page_index >= len(doc):
                report.marks_no_page.append(f"{mark_id}@{sheet or '?'}")
                continue

            try:
                pi = page_cache.get(page_index)
                if pi is None:
                    pi = _PageIndex(doc, pdf_path, page_index)
                    page_cache[page_index] = pi

                tags = pi.find_tag(mark_id)
                if not tags:
                    report.marks_no_text_hit.append(f"{mark_id}@{sheet}")
                    continue

                sys_entry = None
                if system_registry is not None and getattr(mark, "system_code", None):
                    sys_entry = system_registry.get(mark.system_code)
                system_type = system_type_for(mark, sys_entry)
                harness_cls = harness_class_for(mark)
                mark_conf = float(getattr(mark, "confidence", 1.0) or 1.0)

                # Vision-side grid hint: explicit fields if the mark carries
                # them, else whatever the description / specs say.
                hint_bays = _clean_count(getattr(mark, "bay_count", None))
                hint_rows = _clean_count(getattr(mark, "row_count", None))
                if hint_bays is None or hint_rows is None:
                    tb, tr = grid_hint_from_text(" ".join(filter(None, [
                        getattr(mark, "description", ""), getattr(mark, "key_specs", ""),
                        getattr(mark, "location", ""),
                    ])))
                    hint_bays = hint_bays if hint_bays is not None else tb
                    hint_rows = hint_rows if hint_rows is not None else tr

                for tag in tags:
                    rect, cand_conf, method, cand_i = pi.snap_index(tag)
                    if rect is None:
                        rect = pi.fallback_box(tag)
                        conf = mark_conf * 0.35
                        geom_bays = geom_rows = None       # a tag box has no grid
                    else:
                        conf = mark_conf * (0.9 if method == "candidate_contains" else 0.7) * max(cand_conf, 0.5)
                        geom_bays, geom_rows = pi.grid_for(rect)
                        # The rules engine already counted this candidate's bays
                        # with the same test; trust it when our count found nothing.
                        if (geom_bays is None or geom_bays <= 1) and 0 <= cand_i < len(pi.candidate_bays):
                            geom_bays = max(geom_bays or 1, pi.candidate_bays[cand_i])
                    bay_count, row_count, grid_source = resolve_grid(geom_bays, geom_rows, hint_bays, hint_rows)
                    det = AnchoredDetection(
                        system_type=system_type,
                        bbox=[rect.x0, rect.y0, rect.x1, rect.y1],
                        page_index=page_index,
                        sheet_number=sheet,
                        mark=mark_id,
                        scope_type=getattr(mark, "scope_type", "") or "",
                        confidence=min(conf, 1.0),
                        anchor_method=method,
                        tag_bbox=[tag.x0, tag.y0, tag.x1, tag.y1],
                        description=getattr(mark, "description", "") or "",
                        harness_class=harness_cls,
                        bay_count=bay_count,
                        row_count=row_count,
                        grid_source=grid_source,
                    )
                    report.detections.append(det)
                    report.by_method[method] = report.by_method.get(method, 0) + 1
                report.marks_anchored += 1
            except Exception as e:
                logger.exception(f"anchoring {mark_id}@{sheet} failed")
                report.errors.append(f"{mark_id}@{sheet}: {type(e).__name__}: {e}")
    finally:
        doc.close()

    logger.info(
        f"[anchor] {report.marks_anchored}/{report.marks_total} marks anchored → "
        f"{len(report.detections)} detections {report.by_method}; "
        f"no page: {len(report.marks_no_page)}, no text hit: {len(report.marks_no_text_hit)}"
    )
    return report


def dedupe_detections(dets: list[AnchoredDetection], iou_threshold: float = 0.85) -> list[AnchoredDetection]:
    """Two tags snapping to the same frame produce the same box twice; keep the more confident."""
    kept: list[AnchoredDetection] = []
    for d in sorted(dets, key=lambda x: -x.confidence):
        dup = False
        for k in kept:
            if k.page_index != d.page_index:
                continue
            a, b = fitz.Rect(*k.bbox), fitz.Rect(*d.bbox)
            inter = (a & b).get_area()
            union = a.get_area() + b.get_area() - inter
            if union > 0 and inter / union >= iou_threshold:
                dup = True
                break
        if not dup:
            kept.append(d)
    return kept


def annotate_grid_counts(pdf_path: str, page_index: int, detections: list[dict]) -> list[dict]:
    """
    Fill bay_count / row_count / grid_source on plain detection dicts that
    already have a page-space bbox — the /run-region (Box & Snap) path.

    Per detection: geometry from the page's vector graph inside the bbox,
    vision hint from the model's own bay_count / row_count fields or its
    description, resolved by resolve_grid().  Mutates and returns the list.
    Never raises: with no readable geometry every box still leaves with
    counts (vision or 1×1) and an honest grid_source.
    """
    if not detections:
        return detections

    pi: Optional[_PageIndex] = None
    try:
        doc = fitz.open(pdf_path)
        try:
            if 0 <= page_index < len(doc):
                pi = _PageIndex(doc, pdf_path, page_index)
        finally:
            doc.close()
    except Exception as e:
        logger.warning(f"[grid] page {page_index}: could not index page ({type(e).__name__}: {e}) — vision/default counts only")

    for d in detections:
        hint_bays = _clean_count(d.get("bay_count"))
        hint_rows = _clean_count(d.get("row_count"))
        if hint_bays is None or hint_rows is None:
            tb, tr = grid_hint_from_text(str(d.get("description") or ""))
            hint_bays = hint_bays if hint_bays is not None else tb
            hint_rows = hint_rows if hint_rows is not None else tr

        geom_bays = geom_rows = None
        b = d.get("bbox")
        if pi is not None and isinstance(b, (list, tuple)) and len(b) == 4:
            try:
                geom_bays, geom_rows = pi.grid_for(fitz.Rect(*[float(v) for v in b]))
            except Exception:
                geom_bays = geom_rows = None

        bays, rows, src = resolve_grid(geom_bays, geom_rows, hint_bays, hint_rows)
        d["bay_count"] = bays
        d["row_count"] = rows
        d["grid_source"] = src
    return detections
