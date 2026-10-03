"""
page_scope_reader.py — read EVERY glazing item on a sheet, the way Martin marks a set.

Why this exists (auto-takeoff interview, 2026-10-03)
────────────────────────────────────────────────────
The earlier pipeline read legend / elevations / exterior schedules as one
low-resolution image each and dropped floor plans, interior schedules and
details entirely.  Martin's read order is specs → schedules → floor plans →
elevations (compare) → details, he marks EVERY instance, and the floor-plan
count is the truth.  This module is that reader:

  1. The sheet is cut into overlapping tiles sized so each tile reaches the
     model at full resolution (no server-side downscale) — the "zoom in" an
     estimator does on a plan.
  2. Each tile is read with the job's classification key (legend + schedule
     registries from Steps 2–4) and Martin's trade knowledge
     (knowledge/system_knowledge_base.json, series_classes.json,
     scope_taxonomy.json) in the system prompt.
  3. The model returns every glazing item it sees — openings, doors, glazed
     partitions, exclusions, implied items — with a box, a scope class from
     Martin's tool chest, the mark, a count label, and a review flag + reason
     when unsure.
  4. Tile results are mapped to page space and de-duplicated across overlaps.

Output detections use the same shape as geometry_anchoring (bbox + page_index
+ harness_class) so the overlay, the markup writer and qaqc/eval_v2.py read
them unchanged.  harness_class here is a scope_taxonomy.json class key.
"""
from __future__ import annotations

import json
import logging
import math
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import fitz

from glazierai.model_config import VISION_MODEL, EXTRACTION_OPTS
from glazierai.modules.drawing_intelligence.vision_helper import (
    pdf_region_to_vision_block, strip_metadata,
)

_SIDECAR = Path(__file__).resolve().parents[3]
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))
from knowledge.prompt_context import trade_knowledge_block, scope_class_block, match_series  # noqa: E402
from knowledge.taxonomy import classes as taxonomy_classes  # noqa: E402

logger = logging.getLogger(__name__)

# ── Tiling ────────────────────────────────────────────────────────────────────
# Claude downsizes images whose long edge exceeds ~1568 px.  Render each tile
# at exactly that, and size tiles so the effective resolution on paper is
# TARGET_DPI — enough to read a 3/32" tag on a 1/8" plan.
TILE_LONG_EDGE_PX = int(os.environ.get("GLAZEBID_TILE_PX", "1568"))
TARGET_DPI = int(os.environ.get("GLAZEBID_TILE_DPI", "140"))
TILE_OVERLAP = 0.12          # fraction of tile size shared with the neighbour
MAX_WORKERS = int(os.environ.get("GLAZEBID_TILE_WORKERS", "6"))
MAX_TILES_PER_PAGE = 30

# Sheet kinds this reader handles, and what to emphasise on each
SHEET_FOCUS = {
    "step_3_elevation": (
        "EXTERIOR / INTERIOR ELEVATIONS. Box EVERY glazed frame (one box per frame "
        "opening, tight to the outer frame line), every glass door, every window. "
        "Give bays across × rows high and overall W×H when dimensioned. Note glass "
        "type tags on lites. Spandrel lites count as part of the frame."
    ),
    "step_4_ext_schedule": (
        "DOOR / FRAME / WINDOW SCHEDULE or TYPE ELEVATIONS. Box each frame TYPE "
        "drawing or schedule row that is our scope (role 'schedule_row'), and each "
        "excluded type (overhead doors, HM without glass, vinyl windows). Read mark, "
        "size, system/series, glass type, hardware set."
    ),
    "step_5_int_schedule": (
        "INTERIOR DOOR / FRAME SCHEDULE or TYPE ELEVATIONS. Box each frame/door TYPE "
        "or row that carries glass (role 'schedule_row'): storefront, aluminum "
        "frames, HM frames with lites (glazing only), wood doors with lites "
        "(glazing only), fire-rated lites. Read mark, size, glass type."
    ),
    "step_6_floor_plan": (
        "FLOOR PLAN. This is where the COUNT comes from. Box EVERY glazed opening "
        "in plan: storefront / curtain wall / window runs (glass line in the wall), "
        "every door whose type has glass (box the door leaf + swing, role 'door', "
        "give single/pair and swing direction), sidelites and borrowed lites, "
        "glazed partitions, all-glass walls, mirrors, shower doors. Use window "
        "tags, door tags, wall-type tags. Vinyl/wood windows look the same — use "
        "the job key to decide; if unsure, include with a flag."
    ),
    "step_7_detail": (
        "DETAILS / SECTIONS. Box the TITLE of each detail that shows our system "
        "(role 'detail_title'). Box break metal / flashing / closures that touch "
        "our frame (break_metal), windload/deadload clips (wl_dl_clip), floor-line "
        "fire safing (floor_line_fire_caulk). Note pressure plates / stack joints "
        "(curtain wall evidence) vs. screw-spline storefront in the description."
    ),
}
DEFAULT_FOCUS = "Box every glazing item on this sheet."


SYSTEM_PROMPT = """You are a senior commercial glazing estimator with 15 years of experience \
doing quantity takeoffs in Bluebeam for Binswanger Glass. You are looking at ONE TILE \
(a zoomed-in piece) of one drawing sheet. Find and box every item a glazing \
subcontractor would bid, every item that is explicitly NOT ours but looks like it \
could be (so the estimator sees it was considered), and every implied item.

{trade_knowledge}

{scope_classes}

ROLES (how the item is marked):
  region        a glazed frame / opening / panel / glass area
  door          a single door leaf or pair (circle-type marker on plans)
  schedule_row  a row or type drawing in a schedule that defines our scope
  detail_title  the title of a detail that shows our system
  linear        a run measured in length (break metal, fire caulk, handrail)
  count         a counted accessory (clips, SSG joints, polished edges)

RULES FOR THIS JOB:
- Use the JOB KEY below (legend + schedules already read from this set) to classify \
by mark / tag. The job key outranks how a frame looks.
- Read only what is drawn. Do not invent marks. If you can see glazing but cannot \
read its tag, still box it, mark null, and flag it.
- Excluded items use scope_class "excluded" and must give the reason.
- Anything uncertain: still include it, with "flag" = short reason (e.g. \
"vinyl or aluminum? window schedule not found").
- Items cut off at the tile edge: box the visible part; set "cut_off": true.
- Boxes are FRACTIONS of this tile image: [x0, y0, x1, y1], 0..1, top-left origin.
Return ONLY JSON."""

USER_PROMPT = """Project: {project}
Sheet: {sheet_number} — {sheet_title}
Sheet kind: {sheet_kind}
Tile {tile_no} of {tile_total} (row {row}, column {col}); covers {pct_w}% × {pct_h}% of the sheet.

FOCUS FOR THIS SHEET KIND:
{focus}

JOB KEY (from this set's legend and schedules):
{job_key}

Return:
{{"items": [
  {{"scope_class": "ext_sf", "role": "region", "bbox": [0.1,0.2,0.3,0.4],
    "mark": "SF-1", "label": "SF-1", "system_code": "SF-1",
    "manufacturer_series": null, "glass_type": null,
    "width": null, "height": null, "bays": null, "rows": null,
    "door": {{"leaves": null, "swing": null, "hardware_set": null, "stile": null}},
    "alternate": null, "phase": null, "existing": false,
    "confidence": 0.0, "flag": null, "cut_off": false,
    "evidence": "what on the drawing tells you this"}}
]}}
Omit keys you have no value for. If the tile has nothing relevant return {{"items": []}}."""


@dataclass
class PageDetection:
    page_index: int
    sheet_number: str
    bbox: list[float]
    harness_class: str
    role: str
    mark: Optional[str] = None
    label: Optional[str] = None
    system_code: Optional[str] = None
    manufacturer_series: Optional[str] = None
    series_match: Optional[dict] = None
    glass_type: Optional[str] = None
    width: Optional[str] = None
    height: Optional[str] = None
    bay_count: Optional[int] = None
    row_count: Optional[int] = None
    door: dict = field(default_factory=dict)
    alternate: Optional[str] = None
    phase: Optional[str] = None
    existing: bool = False
    confidence: float = 0.5
    flag: Optional[str] = None
    cut_off: bool = False
    evidence: str = ""
    tiles: int = 1
    source: str = "page-scope-reader-v1"

    def to_dict(self) -> dict:
        d = {k: v for k, v in self.__dict__.items()}
        d["bbox"] = [round(v, 2) for v in self.bbox]
        d["confidence"] = round(self.confidence, 3)
        d["anchor_method"] = "page_scope_reader"
        d["scope_type"] = self.harness_class
        d["system_type"] = _system_type_for(self.harness_class)
        d["needs_review"] = bool(self.flag)
        return d


_CLASS_TO_SYSTEM_TYPE = {
    "ext_sf": "Ext SF", "int_sf": "Int SF", "int_alum_partition": "Int SF",
    "ext_cw": "Cap CW", "int_cw": "Cap CW", "fire_rated_sf": "Ext SF",
    "ext_sf_door": "Ext SF", "int_sf_door": "Int SF", "ext_cw_door": "Cap CW",
}


def _system_type_for(cls: str) -> str:
    return _CLASS_TO_SYSTEM_TYPE.get(cls, cls)


# ── tiling ────────────────────────────────────────────────────────────────────

def plan_tiles(page_rect: fitz.Rect, target_dpi: int = TARGET_DPI,
               long_edge_px: int = TILE_LONG_EDGE_PX, overlap: float = TILE_OVERLAP,
               max_tiles: int = MAX_TILES_PER_PAGE) -> list[tuple[int, int, fitz.Rect]]:
    """Overlapping tiles covering the page; each tile's long edge ≈ long_edge_px at target_dpi."""
    tile_pts = long_edge_px / target_dpi * 72.0          # tile long edge on paper, points
    W, H = page_rect.width, page_rect.height
    # aspect of a tile follows the page aspect so short edges stay large
    aspect = min(W, H) / max(W, H)
    tw, th = (tile_pts, tile_pts * aspect) if W >= H else (tile_pts * aspect, tile_pts)

    def n_for(total, size):
        if total <= size:
            return 1
        step = size * (1 - overlap)
        return max(1, math.ceil((total - size) / step) + 1)

    nx, ny = n_for(W, tw), n_for(H, th)
    while nx * ny > max_tiles:                          # very large sheet: accept less zoom
        tw, th = tw * 1.15, th * 1.15
        nx, ny = n_for(W, tw), n_for(H, th)
    tw, th = min(tw, W), min(th, H)
    xs = [page_rect.x0 + (W - tw) * (i / (nx - 1) if nx > 1 else 0) for i in range(nx)]
    ys = [page_rect.y0 + (H - th) * (j / (ny - 1) if ny > 1 else 0) for j in range(ny)]
    return [(r, c, fitz.Rect(x, y, x + tw, y + th)) for r, y in enumerate(ys) for c, x in enumerate(xs)]


# ── merging ───────────────────────────────────────────────────────────────────

def _iou(a, b) -> float:
    ix0, iy0, ix1, iy1 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    return inter / ((a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - inter)


def _overlap_min(a, b) -> float:
    """intersection / smaller area — catches a cut-off half inside the full box."""
    ix0, iy0, ix1, iy1 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    return inter / max(1e-6, min((a[2]-a[0])*(a[3]-a[1]), (b[2]-b[0])*(b[3]-b[1])))


def merge_detections(dets: list[PageDetection]) -> list[PageDetection]:
    """De-duplicate across tile overlaps: same page, same class family, overlapping boxes."""
    fam = {k: v["family"] for k, v in taxonomy_classes().items()}
    out: list[PageDetection] = []
    for d in sorted(dets, key=lambda x: (x.cut_off, -x.confidence)):
        hit = None
        for k in out:
            if k.page_index != d.page_index or k.role != d.role:
                continue
            if fam.get(k.harness_class) != fam.get(d.harness_class) and k.harness_class != d.harness_class:
                continue
            if _iou(k.bbox, d.bbox) >= 0.5 or ((k.cut_off or d.cut_off) and _overlap_min(k.bbox, d.bbox) >= 0.6):
                hit = k
                break
        if hit is None:
            out.append(d)
            continue
        # union the boxes when one side was cut off at a tile edge
        if d.cut_off or hit.cut_off:
            hit.bbox = [min(hit.bbox[0], d.bbox[0]), min(hit.bbox[1], d.bbox[1]),
                        max(hit.bbox[2], d.bbox[2]), max(hit.bbox[3], d.bbox[3])]
            hit.cut_off = hit.cut_off and d.cut_off
        hit.tiles += 1
        for f in ("mark", "label", "system_code", "manufacturer_series", "glass_type",
                  "width", "height", "bay_count", "row_count", "alternate", "phase"):
            if getattr(hit, f) in (None, "") and getattr(d, f) not in (None, ""):
                setattr(hit, f, getattr(d, f))
        if not hit.flag and d.flag and d.harness_class != hit.harness_class:
            hit.flag = f"tiles disagree: {hit.harness_class} vs {d.harness_class}"
    return out


# ── the reader ────────────────────────────────────────────────────────────────

def build_job_key(system_registry=None, schedule_registry=None, mark_registry=None,
                  max_chars: int = 12000) -> str:
    parts = []
    if system_registry is not None:
        try:
            parts.append(system_registry.to_context_string())
        except Exception:
            pass
    if schedule_registry is not None:
        try:
            parts.append(schedule_registry.to_summary_string())
        except Exception:
            pass
    if mark_registry is not None:
        try:
            parts.append(mark_registry.to_summary_string())
        except Exception:
            pass
    key = "\n\n".join(p for p in parts if p) or "(no legend or schedule found yet in this set — classify from the drawing and the trade knowledge, and flag)"
    return key[:max_chars]


class PageScopeReader:
    def __init__(self, client=None):
        if client is None:
            import anthropic
            client = anthropic.Anthropic()
        self.client = client
        self.tokens_used = 0
        self._system = SYSTEM_PROMPT.format(trade_knowledge=trade_knowledge_block(),
                                            scope_classes=scope_class_block())
        self._valid = set(taxonomy_classes())

    # one tile → raw items
    def _read_tile(self, pdf_path: str, page_index: int, rect: fitz.Rect, ctx: dict) -> tuple[list[dict], fitz.Rect, int]:
        long_pts = max(rect.width, rect.height)
        dpi = max(36, int(TILE_LONG_EDGE_PX / (long_pts / 72.0)))
        block = pdf_region_to_vision_block(pdf_path, page_index, (rect.x0, rect.y0, rect.x1, rect.y1), dpi=dpi)
        clip = fitz.Rect(*block["_region"])
        user = USER_PROMPT.format(**ctx)
        last_err = None
        for attempt in range(3):
            try:
                resp = self.client.messages.create(
                    model=VISION_MODEL, **EXTRACTION_OPTS, max_tokens=8000,
                    system=[{"type": "text", "text": self._system, "cache_control": {"type": "ephemeral"}}],
                    messages=[{"role": "user", "content": [strip_metadata(block), {"type": "text", "text": user}]}],
                )
                tok = resp.usage.input_tokens + resp.usage.output_tokens
                raw = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
                return _parse_items(raw), clip, tok
            except Exception as exc:          # rate limits / transient errors
                last_err = exc
                time.sleep(2 * (attempt + 1))
        logger.error(f"[PSR] tile failed p{page_index} {list(rect)}: {last_err}")
        return [], clip, 0

    def read_page(self, pdf_path: str, page_index: int, sheet_number: str, sheet_title: str,
                  sheet_kind: str, project_name: str, job_key: str) -> list[PageDetection]:
        with fitz.open(pdf_path) as doc:
            page_rect = doc[page_index].rect
        tiles = plan_tiles(page_rect)
        total = len(tiles)
        logger.info(f"[PSR] {sheet_number} p{page_index} {sheet_kind}: {total} tiles")

        def run(job):
            idx, (r, c, rect) = job
            ctx = dict(project=project_name or "(unnamed)", sheet_number=sheet_number or "?",
                       sheet_title=sheet_title or "", sheet_kind=sheet_kind,
                       tile_no=idx + 1, tile_total=total, row=r + 1, col=c + 1,
                       pct_w=round(100 * rect.width / page_rect.width),
                       pct_h=round(100 * rect.height / page_rect.height),
                       focus=SHEET_FOCUS.get(sheet_kind, DEFAULT_FOCUS), job_key=job_key)
            return self._read_tile(pdf_path, page_index, rect, ctx)

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
            results = list(ex.map(run, enumerate(tiles)))

        dets: list[PageDetection] = []
        for items, clip, tok in results:
            self.tokens_used += tok
            for it in items:
                d = self._to_detection(it, clip, page_index, sheet_number)
                if d is not None:
                    dets.append(d)
        merged = merge_detections(dets)
        logger.info(f"[PSR] {sheet_number}: {len(dets)} raw → {len(merged)} items")
        return merged

    def _to_detection(self, it: dict, clip: fitz.Rect, page_index: int, sheet_number: str) -> PageDetection | None:
        try:
            nx0, ny0, nx1, ny1 = [min(max(float(v), 0.0), 1.0) for v in it["bbox"]]
        except Exception:
            return None
        nx0, nx1 = sorted((nx0, nx1))
        ny0, ny1 = sorted((ny0, ny1))
        if nx1 - nx0 < 0.002 or ny1 - ny0 < 0.002:
            return None
        cls = (it.get("scope_class") or "").strip()
        flag = it.get("flag")
        if cls not in self._valid:
            flag = f"unknown class {cls!r}" + (f"; {flag}" if flag else "")
            cls = "ext_sf" if "sf" in cls.lower() else "glazing_only"
        role = it.get("role") or "region"
        series_text = it.get("manufacturer_series") or ""
        sm = match_series(series_text) if series_text else []
        if series_text and not sm and not flag:
            flag = f"non-Kawneer/Tubelite basis: {series_text}"
        if it.get("existing") and not flag:
            flag = "existing glazing — review"
        door = it.get("door") or {}
        return PageDetection(
            page_index=page_index, sheet_number=sheet_number,
            bbox=[clip.x0 + nx0 * clip.width, clip.y0 + ny0 * clip.height,
                  clip.x0 + nx1 * clip.width, clip.y0 + ny1 * clip.height],
            harness_class=cls, role=role, mark=it.get("mark"), label=it.get("label") or it.get("mark"),
            system_code=it.get("system_code"), manufacturer_series=series_text or None,
            series_match=sm[0] if sm else None, glass_type=it.get("glass_type"),
            width=_s(it.get("width")), height=_s(it.get("height")),
            bay_count=_int(it.get("bays")), row_count=_int(it.get("rows")),
            door={k: v for k, v in door.items() if v not in (None, "")} if isinstance(door, dict) else {},
            alternate=_s(it.get("alternate")), phase=_s(it.get("phase")), existing=bool(it.get("existing")),
            confidence=_float(it.get("confidence"), 0.5), flag=flag, cut_off=bool(it.get("cut_off")),
            evidence=(it.get("evidence") or "")[:300],
        )


def _parse_items(raw: str) -> list[dict]:
    raw = (raw or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.M).strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.S)
        if not m:
            return []
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            return []
    items = data.get("items", []) if isinstance(data, dict) else data
    return [i for i in items if isinstance(i, dict)]


def _s(v):
    return None if v in (None, "") else str(v)


def _int(v):
    try:
        return max(1, int(round(float(v))))
    except (TypeError, ValueError):
        return None


def _float(v, default):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


# Sheets this reader runs on, in Martin's read order (schedules → plans → elevations → details)
READ_ORDER = ["step_4_ext_schedule", "step_5_int_schedule", "step_6_floor_plan",
              "step_3_elevation", "step_7_detail"]
