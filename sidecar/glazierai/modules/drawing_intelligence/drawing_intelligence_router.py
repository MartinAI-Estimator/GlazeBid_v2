"""
drawing_intelligence_router.py — FastAPI router for Drawing Intelligence pipeline.

POST /drawing-intelligence/run
    Full pipeline:
        Step 1 (classify)
        → Step 2 (legend → SystemRegistry)          ← bound BEFORE any opening is classified
        → Step 3 (elevations → System + Mark registries, seeded from Step 2)
        → Step 4 (ALL schedule sheets → ScheduleRegistry)
        → Assembler
    Returns TakeoffResult dict.

GET /drawing-intelligence/health
    Quick status check.

Ordering rule (from the McLarty / Hope blind tests, RESULTS.md 2026-07-15):
    "Bind legend facts BEFORE classifying openings."  The estimator builds the
    job's classification key from the EXTERIOR MATERIALS LEGEND first, then
    applies it set-wide.  Step 2 is that key.  Step 3 receives it as
    `system_registry` and classifies marks against it; it never starts cold
    when a dedicated legend sheet exists.
"""

import logging
import os
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from glazierai.model_config import VISION_MODEL, EXTRACTION_OPTS

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Request model ─────────────────────────────────────────────────────────────

class DrawingIntelligenceRequest(BaseModel):
    pdf_path: str
    project_name: str

    # Sheet routing overrides: key = sheet_number (e.g. "A3.2"),
    # value = ProcessStep string (e.g. "step_4_ext_schedule", "skip").
    # Applied after LLM classification to correct known misroutes.
    routing_overrides: Optional[dict[str, str]] = None

    # Sheet mode overrides for step_3_elevation sheets.
    # Key = sheet_number, value = "exterior_with_legend" | "interior_schedule".
    # Default heuristic: first step_3_elevation sheet → exterior_with_legend,
    # subsequent sheets → interior_schedule.
    sheet_modes: Optional[dict[str, str]] = None

    # Anthropic API key passed from Electron's safeStorage.
    # Used instead of the ANTHROPIC_API_KEY env var if provided.
    anthropic_api_key: Optional[str] = None


# ── Legend precedence guard ───────────────────────────────────────────────────

def _rebind_legend_facts(system_registry, legend_bound: dict, sheet_number: str) -> int:
    """
    Re-assert Step 2 (dedicated legend) facts over anything a Step 3 embedded
    legend read may have overwritten for the same system code.

    SystemRegistry.add() is a plain dict overwrite.  A dedicated legend sheet
    (A3.1 "Finish Materials Legend") carries manufacturer + series — the fields
    that decide SF vs CW (PITCO TMW 450 = CW, TMS 114 = SF).  An embedded
    legend on an elevation sheet is usually abbreviated and can flip that
    classification.  The dedicated legend wins; the embedded read may only
    FILL fields the dedicated entry left empty.

    Returns the number of conflicts resolved (for logging / QA).
    """
    conflicts = 0
    for code, bound in legend_bound.items():
        current = system_registry.get(code)
        if current is None:
            # Step 3 dropped it entirely (shouldn't happen — add() never deletes) — restore.
            system_registry.add(bound)
            continue
        if current is bound:
            continue  # untouched

        changed = (
            current.scope_type != bound.scope_type
            or current.is_glazing_scope != bound.is_glazing_scope
        )
        if changed:
            conflicts += 1
            logger.warning(
                f"[DI] legend conflict on {code}: "
                f"{bound.source_sheet} says {bound.scope_type!r} "
                f"(glazing={bound.is_glazing_scope}) but {sheet_number} embedded legend "
                f"says {current.scope_type!r} (glazing={current.is_glazing_scope}) "
                f"— keeping {bound.source_sheet}"
            )

        # Merge: dedicated legend fields win; embedded read fills blanks only.
        for field_name in ("manufacturer", "series", "finish", "glazing", "hardware", "description"):
            if not getattr(bound, field_name) and getattr(current, field_name):
                setattr(bound, field_name, getattr(current, field_name))
        if not bound.raw_notes and current.raw_notes:
            bound.raw_notes = current.raw_notes

        system_registry.add(bound)
    return conflicts


# ── Pipeline (runs synchronously in a threadpool) ─────────────────────────────

def _run_pipeline(req: DrawingIntelligenceRequest) -> dict:
    """Full drawing intelligence pipeline — synchronous, safe to call in threadpool."""

    # Lazy imports so the router loads fast even before the package is ready.
    from glazierai.modules.drawing_intelligence.sheet_classifier import (
        SheetClassifier, ClassificationResult,
    )
    from glazierai.modules.drawing_intelligence.legend_extractor import LegendExtractor
    from glazierai.modules.drawing_intelligence.elevation_reader import ElevationReader
    from glazierai.modules.drawing_intelligence.schedule_reader import ScheduleReader
    from glazierai.modules.drawing_intelligence.takeoff_assembler import assemble

    # Inject API key if provided (takes precedence over env var for this call)
    if req.anthropic_api_key:
        os.environ["ANTHROPIC_API_KEY"] = req.anthropic_api_key

    # ── Step 1: Classify all sheets ──────────────────────────────────────────
    logger.info(f"[DI] classify: {req.pdf_path!r}")
    classifier = SheetClassifier()
    routing = classifier.classify(
        req.pdf_path,
        routing_overrides=req.routing_overrides or None,  # None = LLM-only
    )
    logger.info(
        f"[DI] Classification done: {routing.total_pages} pages, "
        f"{routing.glazing_relevant_count} glazing-relevant"
    )

    # ── Step 2: Dedicated legend sheets → SystemRegistry (the classification key)
    # Runs BEFORE Step 3.  extract_from_classification() returns an empty
    # registry (never None) when the set has no dedicated legend sheet; in that
    # case Step 3's embedded-legend pass populates it, as before.
    legend_sheets = routing.sheets_for_step("step_2_legend")
    logger.info(
        f"[DI] legend: {len(legend_sheets)} dedicated legend sheet(s) "
        f"{[s.sheet_number for s in legend_sheets]}"
    )
    legend_extractor = LegendExtractor()
    system_registry = legend_extractor.extract_from_classification(
        pdf_path=req.pdf_path,
        classification=routing,
        project_name=req.project_name,
    )
    # Snapshot of what the dedicated legend bound — used to re-assert precedence
    # after each Step 3 sheet.  Empty when no dedicated legend exists.
    legend_bound = dict(system_registry.entries)
    if legend_bound:
        logger.info(
            f"[DI] legend bound {len(legend_bound)} codes, "
            f"{len(system_registry.glazing_scope_entries())} glazing scope — "
            f"Step 3 will classify against this key"
        )

    # ── Step 3: Elevation sheets → SystemRegistry (seeded) + MarkRegistry ────
    elevation_sheets = routing.sheets_for_step("step_3_elevation")
    sheet_modes = req.sheet_modes or {}
    mark_registry = None
    legend_conflicts = 0

    if elevation_sheets:
        elev_reader = ElevationReader()
        first_elev_sheet = True

        for sheet in elevation_sheets:
            mode = sheet_modes.get(sheet.sheet_number)
            if mode is None:
                # Default: first elevation sheet usually carries the system legend
                mode = "exterior_with_legend" if first_elev_sheet else "interior_schedule"
            first_elev_sheet = False

            # Standard elevation name list for exterior sheets; None = auto
            elev_names: list[str] | None = (
                ["West", "East", "South", "North"]
                if mode == "exterior_with_legend"
                else None
            )

            logger.info(
                f"[DI] elevation {sheet.sheet_number!r} (page {sheet.page_index}) "
                f"mode={mode!r}"
            )
            system_registry, mark_registry = elev_reader.process_elevation_sheet(
                pdf_path=req.pdf_path,
                page_index=sheet.page_index,
                sheet_number=sheet.sheet_number,
                sheet_title=sheet.sheet_title,
                sheet_mode=mode,
                project_name=req.project_name,
                system_registry=system_registry,   # ← Step 2 key, never None
                mark_registry=mark_registry,
                elevation_names=elev_names,
            )

            # Dedicated legend outranks embedded legend for the same code.
            if legend_bound and mode == "exterior_with_legend":
                legend_conflicts += _rebind_legend_facts(
                    system_registry, legend_bound, sheet.sheet_number
                )

    if legend_conflicts:
        logger.warning(
            f"[DI] {legend_conflicts} legend conflict(s) resolved in favor of the "
            f"dedicated legend sheet — review these codes in QA"
        )

    # ── Step 4: ALL schedule sheets → ScheduleRegistry ───────────────────────
    schedule_sheets = routing.sheets_for_step("step_4_ext_schedule")
    schedule_registry = None

    if schedule_sheets:
        sched_reader = ScheduleReader()
        logger.info(
            f"[DI] schedule: {len(schedule_sheets)} sheet(s) "
            f"{[s.sheet_number for s in schedule_sheets]}"
        )
        for sheet in schedule_sheets:
            logger.info(
                f"[DI] schedule {sheet.sheet_number!r} (page {sheet.page_index})"
            )
            schedule_registry = sched_reader.process_schedule_sheet(
                pdf_path=req.pdf_path,
                page_index=sheet.page_index,
                sheet_number=sheet.sheet_number,
                sheet_title=sheet.sheet_title,
                project_name=req.project_name,
                system_registry=system_registry,
                schedule_registry=schedule_registry,   # accumulate across sheets
            )

    # ── Assembler: join registries → TakeoffResult ───────────────────────────
    # Step 2 and Step 3 share one SystemRegistry object, so its tokens_used
    # already covers both.
    total_tokens = (
        routing.tokens_used
        + (system_registry.tokens_used if system_registry else 0)
        + (mark_registry.tokens_used if mark_registry else 0)
        + (schedule_registry.tokens_used if schedule_registry else 0)
    )

    logger.info(f"[DI] assembling — total_tokens={total_tokens:,}")
    result = assemble(
        system_registry=system_registry,
        mark_registry=mark_registry,
        schedule_registry=schedule_registry,
        project_name=req.project_name,
        total_tokens=total_tokens,
    )
    out = result.to_dict()
    # Surface the legend binding in the result so the UI / QA can see it.
    out["legend"] = {
        "dedicated_sheets": [s.sheet_number for s in legend_sheets],
        "codes_bound": sorted(legend_bound.keys()),
        "conflicts_resolved": legend_conflicts,
    }

    # ── Step 5: Geometry anchoring → detections with bbox (FRONTEND CONTRACT) ─
    # Vision said WHAT (marks + scope types).  This step says WHERE: PyMuPDF
    # finds each callout tag on its sheet and snaps it to a rules-engine
    # glazing rectangle.  Pure geometry, no LLM.  Output feeds the Builder
    # overlay (CanvasOverlay.jsx) and the eval harness (qaqc/eval_harness.py).
    from glazierai.modules.drawing_intelligence.geometry_anchoring import (
        anchor_marks, dedupe_detections,
    )
    out["routing"] = [
        {"sheet_number": s.sheet_number, "page_index": s.page_index,
         "step": s.process_in_step, "sheet_title": s.sheet_title}
        for s in routing.sheets
    ]
    out["detections"] = []
    out["anchoring"] = {}
    if mark_registry is not None and mark_registry.marks:
        try:
            report = anchor_marks(
                pdf_path=req.pdf_path,
                marks=mark_registry.marks.values(),
                routing=routing,
                system_registry=system_registry,
            )
            dets = dedupe_detections(report.detections)
            out["detections"] = [d.to_dict() for d in dets]
            out["anchoring"] = report.to_dict()
            out["anchoring"]["detections_after_dedupe"] = len(dets)
        except Exception as exc:
            # Anchoring must never sink a takeoff that vision already produced.
            logger.exception(f"[DI] anchoring failed: {exc}")
            out["anchoring"] = {"error": f"{type(exc).__name__}: {exc}"}
    return out


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/run")
async def run_drawing_intelligence(req: DrawingIntelligenceRequest):
    """
    Run the full drawing intelligence pipeline and return a TakeoffResult.

    The pipeline runs synchronously in a background thread so it doesn't
    block the FastAPI event loop.  Expect ~2–4 minutes on a 12-page set.
    """
    # Use key from request body, fall back to environment variable
    api_key = req.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="No API key available")
    try:
        result = await run_in_threadpool(_run_pipeline, req)
        return result
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception(f"[DI] pipeline error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


# ── Box & Snap: vision detection on ONE region of ONE page ───────────────────
#
# This is the geometry-returning counterpart to /run.  /run reads a whole set
# and returns a semantic BOM with no coordinates; /run-region reads a crop the
# estimator drew and returns bounding boxes in fitz page space, which the
# Builder overlay (CanvasOverlay.jsx) draws and the eval harness can score.

import base64 as _b64
import json as _json
import tempfile as _tempfile

_CANONICAL_SYSTEMS = ("Ext SF", "Int SF", "Cap CW", "SSG CW")

_REGION_SYSTEM = (
    "You are a senior commercial glazing estimator reading a crop of an "
    "architectural drawing (elevation, plan, section or schedule).  Identify "
    "every aluminum-framed glazing assembly that a glazing subcontractor would "
    "furnish and install: storefront, curtain wall, window wall, aluminum "
    "entrances, all-glass walls.  EXCLUDE hollow-metal doors and frames, wood "
    "doors, overhead/coiling/sectional doors, louvers, and vision lites glazed "
    "by the door supplier.  Return ONLY JSON."
)

_REGION_USER = """Project: {project_name}
This image is a crop of one sheet.  Report each glazing assembly you can see.

For each assembly give:
  "system_type"  one of {systems} — Ext SF = exterior storefront, Int SF = interior
                 storefront/partition, Cap CW = captured (pressure-plate) curtain wall,
                 SSG CW = structurally glazed curtain wall.  If the drawing names a
                 manufacturer series, use it to decide (e.g. Kawneer 1600 = Cap CW,
                 Trifab/451 = Ext SF).  If unsure between SF and CW, prefer Ext SF and
                 lower the confidence.
  "bbox"         [x0, y0, x1, y1] as FRACTIONS of this image (0.0 = left/top, 1.0 =
                 right/bottom).  Tight to the outer frame line.
  "confidence"   0.0–1.0
  "description"  one short line: what it is, mark/tag if visible, bays × rows if visible
  "mark"         the callout tag if visible (e.g. "SF-1", "A", "CW-3") else null
  "bay_count"    number of glass lites ACROSS (vertical mullions + 1).  Count the
                 divisions you can see inside the outer frame; a plain single
                 lite is 1.  null if the crop is too small / unclear to count.
  "row_count"    number of glass lites HIGH (horizontal mullions + 1); a transom
                 over a door counts as a row.  null if unclear.

Return exactly:
{{"detections": [{{"system_type": "...", "bbox": [x0,y0,x1,y1], "confidence": 0.0, "description": "...", "mark": null, "bay_count": null, "row_count": null}}]}}
If there is no glazing in the crop return {{"detections": []}}."""


class RegionTakeoffRequest(BaseModel):
    """One region of one page.  Provide pdf_path OR pdf_base64."""
    pdf_path: Optional[str] = None
    pdf_base64: Optional[str] = None
    page_index: int
    region: list[float]                 # [x0, y0, x1, y1] fitz page space (pts, top-left)
    project_name: str = ""
    anthropic_api_key: Optional[str] = None


def _run_region(req: RegionTakeoffRequest) -> dict:
    import anthropic
    from glazierai.modules.drawing_intelligence.vision_helper import (
        pdf_region_to_vision_block, strip_metadata, DPI_REGION,
    )

    if req.anthropic_api_key:
        os.environ["ANTHROPIC_API_KEY"] = req.anthropic_api_key
    if len(req.region) != 4:
        raise ValueError("region must be [x0, y0, x1, y1]")

    # Source: path, or bytes written to a temp file (same pattern as main.py)
    tmp_path = None
    if req.pdf_path:
        pdf_path = req.pdf_path
    elif req.pdf_base64:
        with _tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(_b64.b64decode(req.pdf_base64))
            tmp_path = pdf_path = f.name
    else:
        raise ValueError("Provide pdf_path or pdf_base64")

    # The temp file must outlive the vision call: grid counting (Step 5b
    # below) re-opens the PDF to read the vector graph under each box.
    try:
        return _run_region_on_pdf(req, pdf_path)
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def _run_region_on_pdf(req: RegionTakeoffRequest, pdf_path: str) -> dict:
    import anthropic
    from glazierai.modules.drawing_intelligence.vision_helper import (
        pdf_region_to_vision_block, strip_metadata, DPI_REGION,
    )
    from glazierai.modules.drawing_intelligence.geometry_anchoring import annotate_grid_counts

    block = pdf_region_to_vision_block(pdf_path, req.page_index, tuple(req.region), dpi=DPI_REGION)

    rx0, ry0, rx1, ry1 = block["_region"]
    rw, rh = rx1 - rx0, ry1 - ry0
    logger.info(
        f"[DI] run-region page={req.page_index} region={[round(v,1) for v in block['_region']]} "
        f"render={block['_width_px']}x{block['_height_px']}@{block['_dpi']}dpi"
    )

    client = anthropic.Anthropic()
    response = client.messages.create(
        model=VISION_MODEL,
        **EXTRACTION_OPTS,
        max_tokens=4096,
        system=_REGION_SYSTEM,
        messages=[{
            "role": "user",
            "content": [
                strip_metadata(block),
                {"type": "text", "text": _REGION_USER.format(
                    project_name=req.project_name or "(unnamed)",
                    systems=_json.dumps(list(_CANONICAL_SYSTEMS)),
                )},
            ],
        }],
    )
    tokens = response.usage.input_tokens + response.usage.output_tokens
    raw = "".join(b.text for b in response.content if getattr(b, "type", "") == "text").strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw[4:] if raw.lower().startswith("json") else raw
    data = _json.loads(raw)

    detections = []
    for i, d in enumerate(data.get("detections", [])):
        try:
            nx0, ny0, nx1, ny1 = [float(v) for v in d["bbox"]]
        except Exception:
            logger.warning(f"[DI] run-region: detection {i} has no usable bbox — skipped")
            continue
        # clamp to [0,1] and order
        nx0, nx1 = sorted((min(max(nx0, 0.0), 1.0), min(max(nx1, 0.0), 1.0)))
        ny0, ny1 = sorted((min(max(ny0, 0.0), 1.0), min(max(ny1, 0.0), 1.0)))
        if nx1 - nx0 < 0.005 or ny1 - ny0 < 0.005:
            continue
        system_type = d.get("system_type")
        if system_type not in _CANONICAL_SYSTEMS:
            system_type = "Ext SF"          # canonical default, matches systemTypes.js
        detections.append({
            "system_type": system_type,
            "bbox": [rx0 + nx0 * rw, ry0 + ny0 * rh, rx0 + nx1 * rw, ry0 + ny1 * rh],
            "confidence": float(d.get("confidence", 0.5)),
            "description": d.get("description", ""),
            "mark": d.get("mark"),
            # Vision's own grid read — annotate_grid_counts() reconciles it
            # with the page geometry and always leaves ints behind.
            "bay_count": d.get("bay_count"),
            "row_count": d.get("row_count"),
            "page_index": req.page_index,
            "source": "vision-region-v1",
        })

    # ── Step 5b: grid counts (bays × rows) per box — geometry ⊕ vision ─────
    try:
        annotate_grid_counts(pdf_path, req.page_index, detections)
    except Exception as exc:                      # never lose the detections over a count
        logger.exception(f"[DI] run-region grid counting failed: {exc}")
        def _as_count(v):
            try:
                return max(1, int(round(float(v))))
            except (TypeError, ValueError):
                return 1
        for d in detections:
            d["bay_count"] = _as_count(d.get("bay_count"))
            d["row_count"] = _as_count(d.get("row_count"))
            d.setdefault("grid_source", "default")

    return {
        "status": "ok",
        "page_index": req.page_index,
        "region": block["_region"],
        "detections": detections,
        "tokens_used": tokens,
    }


@router.post("/run-region")
async def run_region_takeoff(req: RegionTakeoffRequest):
    """
    Box & Snap.  Render one region of one page at high DPI, ask the vision
    model for glazing assemblies, return their boxes in fitz page space.
    Expect 5–15 s per region.
    """
    api_key = req.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="No API key available")
    try:
        return await run_in_threadpool(_run_region, req)
    except (ValueError, IndexError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception(f"[DI] run-region error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/health")
async def drawing_intelligence_health():
    """Quick status check — verifies the Anthropic key is configured."""
    return {
        "status": "ok",
        "anthropic_configured": bool(os.environ.get("ANTHROPIC_API_KEY")),
    }
