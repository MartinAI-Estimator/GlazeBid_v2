"""
drawing_intelligence_router.py — FastAPI router for Drawing Intelligence pipeline.

POST /drawing-intelligence/run
    Full pipeline: Step 1 (classify) → Step 3 (elevations) → Step 4 (schedule) → Assembler
    Returns TakeoffResult dict.

GET /drawing-intelligence/health
    Quick status check.
"""

import logging
import os
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

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


# ── Pipeline (runs synchronously in a threadpool) ─────────────────────────────

def _run_pipeline(req: DrawingIntelligenceRequest) -> dict:
    """Full drawing intelligence pipeline — synchronous, safe to call in threadpool."""

    # Lazy imports so the router loads fast even before the package is ready.
    from glazierai.modules.drawing_intelligence.sheet_classifier import (
        SheetClassifier, ClassificationResult,
    )
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

    # ── Step 3: Elevation sheets → SystemRegistry + MarkRegistry ────────────
    elevation_sheets = routing.sheets_for_step("step_3_elevation")
    sheet_modes = req.sheet_modes or {}
    system_registry = None
    mark_registry = None

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
                system_registry=system_registry,
                mark_registry=mark_registry,
                elevation_names=elev_names,
            )

    # ── Step 4: Schedule sheet → ScheduleRegistry ────────────────────────────
    schedule_sheets = routing.sheets_for_step("step_4_ext_schedule")
    schedule_registry = None

    if schedule_sheets:
        sched_reader = ScheduleReader()
        # Process only the first schedule sheet found
        sheet = schedule_sheets[0]
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
        )

    # ── Assembler: join registries → TakeoffResult ───────────────────────────
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
    return result.to_dict()


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


@router.get("/health")
async def drawing_intelligence_health():
    """Quick status check — verifies the Anthropic key is configured."""
    return {
        "status": "ok",
        "anthropic_configured": bool(os.environ.get("ANTHROPIC_API_KEY")),
    }
