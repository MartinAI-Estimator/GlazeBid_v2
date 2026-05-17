"""
GlazierAI Spec Reader — FastAPI Router
Mount this router in your main GlazierAI FastAPI app.

Usage in main.py:
    from spec_reader.router import spec_reader_router
    app.include_router(spec_reader_router, prefix="/spec-reader", tags=["Spec Reader"])
"""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from .extractor import SpecExtractor
from .ingestor import GLAZING_SCOPE_PREFIXES, ingest_pdf
from .schema import (
    AnalyzeSectionRequest,
    DetectedSection,
    DetectionResult,
    SectionExtraction,
    SpecAnalysisResult,
)

logger = logging.getLogger(__name__)

spec_reader_router = APIRouter()

# Shared extractor instance — reuses the Anthropic client across requests
_extractor: SpecExtractor | None = None


def get_extractor() -> SpecExtractor:
    global _extractor
    if _extractor is None:
        api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("GLAZIERAI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY environment variable not set. "
                "Set it in your .env file or environment."
            )
        _extractor = SpecExtractor(api_key=api_key)
    return _extractor


# ─── Endpoints ────────────────────────────────────────────────────────────────

@spec_reader_router.get("/health")
async def health_check():
    """Spec Reader module health check"""
    api_key_set = bool(os.getenv("ANTHROPIC_API_KEY") or os.getenv("GLAZIERAI_API_KEY"))
    return {
        "module": "spec_reader",
        "status": "ok" if api_key_set else "degraded",
        "anthropic_api_key_configured": api_key_set,
        "model": "claude-sonnet-4-20250514",
    }


@spec_reader_router.post(
    "/detect",
    summary="Detect glazing sections in a PDF",
    description=(
        "Upload a project manual PDF. Returns a list of all CSI sections found "
        "and which ones are glazing contractor scope. Fast — no AI calls."
    ),
    response_model=DetectionResult,
)
async def detect_sections(
    file: Annotated[UploadFile, File(description="Project manual PDF")],
    project_name: Annotated[str, Form(description="Project name")] = "Unknown Project",
):
    """
    Detect all glazing-relevant CSI sections in a project manual PDF.
    No AI extraction — just section detection. Use to preview what will be analyzed.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File must be a PDF",
        )

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        ingest_result = ingest_pdf(tmp_path)
    except Exception as e:
        logger.error(f"Ingestor error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF processing error: {e}",
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    glazing = [
        DetectedSection(
            csi_number=s.csi_number,
            csi_title=s.csi_title_clean,
            start_char=s.start_char,
            end_char=s.end_char,
            char_count=len(s.text),
            is_glazing_scope=True,
            scope_reason=s.scope_reason,
        )
        for s in ingest_result.glazing_sections
    ]

    non_glazing = [
        DetectedSection(
            csi_number=s.csi_number,
            csi_title=s.csi_title_clean,
            start_char=s.start_char,
            end_char=s.end_char,
            char_count=len(s.text),
            is_glazing_scope=False,
            scope_reason=s.scope_reason,
        )
        for s in ingest_result.non_glazing_sections
    ]

    return DetectionResult(
        project_name=project_name,
        pdf_pages=ingest_result.page_count,
        total_sections_found=len(ingest_result.all_sections),
        glazing_sections=glazing,
        non_glazing_sections=non_glazing,
        full_text_length=ingest_result.full_text_length,
    )


@spec_reader_router.post(
    "/analyze",
    summary="Full spec reader analysis",
    description=(
        "Upload a project manual PDF. Detects all glazing sections, extracts structured "
        "data from each via Claude API, and returns a complete spec summary with estimator "
        "alerts. One API call per glazing section found."
    ),
    response_model=SpecAnalysisResult,
)
async def analyze_spec(
    file: Annotated[UploadFile, File(description="Project manual PDF")],
    project_name: Annotated[str, Form(description="Project name")] = "Unknown Project",
    project_address: Annotated[str | None, Form()] = None,
    job_number: Annotated[str | None, Form()] = None,
):
    """
    Full pipeline: PDF → section detection → Claude extraction → alerts → structured result.

    Processes glazing sections concurrently (up to 3 at a time) to keep latency reasonable.
    A project with 4 glazing sections typically completes in 15–30 seconds.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File must be a PDF",
        )

    t_start = time.perf_counter()

    try:
        extractor = get_extractor()
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        ingest_result = ingest_pdf(tmp_path)
    except Exception as e:
        logger.error(f"Ingestor error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF processing error: {e}",
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    glazing_sections = ingest_result.glazing_sections

    if not glazing_sections:
        return SpecAnalysisResult(
            project_name=project_name,
            project_address=project_address,
            job_number=job_number,
            pdf_pages=ingest_result.page_count,
            sections_detected=0,
            sections_extracted=0,
            total_alerts=0,
            critical_alerts=0,
            sections=[],
            processing_time_seconds=round(time.perf_counter() - t_start, 2),
        )

    # Extract sections concurrently (semaphore limits to 3 parallel API calls)
    semaphore = asyncio.Semaphore(3)

    async def extract_with_semaphore(section) -> SectionExtraction:
        async with semaphore:
            return await extractor.extract_section_async(
                project_name=project_name,
                csi_number=section.csi_number,
                csi_title=section.csi_title_clean,
                section_text=section.text,
            )

    tasks = [extract_with_semaphore(s) for s in glazing_sections]
    extractions: list[SectionExtraction] = await asyncio.gather(*tasks)

    total_alerts = sum(len(e.estimator_alerts) for e in extractions)
    critical_alerts = sum(
        sum(1 for a in e.estimator_alerts if a.severity == "critical")
        for e in extractions
    )
    total_tokens = sum(e.extraction_tokens_used or 0 for e in extractions)
    sections_extracted = sum(1 for e in extractions if not e.extraction_error)

    elapsed = round(time.perf_counter() - t_start, 2)
    logger.info(
        f"Analysis complete: {sections_extracted}/{len(glazing_sections)} sections, "
        f"{total_alerts} alerts ({critical_alerts} critical), "
        f"{total_tokens} tokens, {elapsed}s"
    )

    return SpecAnalysisResult(
        project_name=project_name,
        project_address=project_address,
        job_number=job_number,
        pdf_pages=ingest_result.page_count,
        sections_detected=len(glazing_sections),
        sections_extracted=sections_extracted,
        total_alerts=total_alerts,
        critical_alerts=critical_alerts,
        sections=extractions,
        total_tokens_used=total_tokens,
        processing_time_seconds=elapsed,
    )


@spec_reader_router.post(
    "/analyze-section",
    summary="Analyze a single spec section by text",
    description=(
        "Submit raw spec section text directly (no PDF required). "
        "Useful for testing the extraction prompt against specific spec language."
    ),
    response_model=SectionExtraction,
)
async def analyze_section(body: AnalyzeSectionRequest):
    """
    Analyze a single CSI section provided as raw text.
    Primary use: prompt testing and development. Also useful for re-extracting
    a single section without re-processing the full PDF.
    """
    if not body.section_text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="section_text cannot be empty",
        )

    try:
        extractor = get_extractor()
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )

    try:
        result = await extractor.extract_section_async(
            project_name=body.project_name,
            csi_number=body.csi_number,
            csi_title=body.csi_title,
            section_text=body.section_text,
        )
    except Exception as e:
        logger.error(f"Extraction error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Extraction error: {e}",
        )

    return result


@spec_reader_router.get(
    "/sections",
    summary="List all known glazing CSI sections",
    description="Returns the complete list of CSI sections GlazierAI recognizes as glazing scope.",
)
async def list_glazing_sections():
    """Reference endpoint — returns the glazing scope classification table"""
    sections = []
    for key, reason in GLAZING_SCOPE_PREFIXES.items():
        formatted = f"{key[0:2]} {key[2:4]} {key[4:6]}"
        sections.append({"csi_number": formatted, "scope": reason})

    return {"glazing_sections": sections, "count": len(sections)}
