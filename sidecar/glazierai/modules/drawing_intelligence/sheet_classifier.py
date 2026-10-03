"""
GlazierAI Drawing Intelligence — Step 1: Sheet Classifier
Routes every page in a drawing set to the correct extraction step.
Fast, cheap, no measurement — pure routing.

Input:  All pages of MASTER_ARCH_SET.pdf at 100 DPI
Output: {page_index: ClassifiedSheet} for every page
"""

from __future__ import annotations
import json
import logging
from dataclasses import dataclass, field
from typing import Literal

import anthropic

from .vision_helper import (
    pdf_pages_to_vision_blocks,
    strip_metadata,
    DPI_CLASSIFIER,
)
from glazierai.model_config import VISION_MODEL, EXTRACTION_OPTS

logger = logging.getLogger(__name__)

# ─── Output Schema ────────────────────────────────────────────────────────────

SheetType = Literal[
    "elevation",    # Exterior or interior elevation drawing
    "floor_plan",   # Plan view showing room layouts and mark locations
    "schedule",     # Door, window, glazing, or finish schedule
    "legend",       # Materials legend, system legend, keynote legend
    "detail",       # Large-scale construction detail
    "section",      # Building or wall section
    "cover",        # Cover sheet, project directory, drawing index
    "other",        # Does not fit above categories
]

ProcessStep = Literal[
    "step_2_legend",        # Materials/system legend → feeds Step 3+
    "step_3_elevation",     # Exterior/interior elevation → mark locations + counts
    "step_4_ext_schedule",  # Exterior door/frame schedule → mark details
    "step_5_int_schedule",  # Interior door/frame schedule → mark details
    "step_6_floor_plan",    # Floor plan → spatial layout + interior mark locations
    "step_7_detail",        # Glazing-relevant detail → condition reference
    "skip",                 # Not glazing-relevant, do not process
]


@dataclass
class ClassifiedSheet:
    page_index: int
    sheet_number: str           # e.g. "A2.0"
    sheet_title: str            # e.g. "Exterior Elevations"
    sheet_type: SheetType
    is_glazing_relevant: bool
    glazing_relevance_reason: str
    process_in_step: ProcessStep
    confidence: float = 1.0
    notes: str = ""


@dataclass
class ClassificationResult:
    pdf_path: str
    total_pages: int
    sheets: list[ClassifiedSheet] = field(default_factory=list)
    glazing_relevant_count: int = 0
    tokens_used: int = 0
    error: str | None = None

    def sheets_for_step(self, step: ProcessStep) -> list[ClassifiedSheet]:
        return [s for s in self.sheets if s.process_in_step == step]

    def page_indices_for_step(self, step: ProcessStep) -> list[int]:
        return [s.page_index for s in self.sheets_for_step(step)]


# ─── Prompts ──────────────────────────────────────────────────────────────────

CLASSIFIER_SYSTEM = """You are an expert architectural drawing reader with deep knowledge \
of commercial construction drawing sets.

Your task is to classify each drawing sheet by type and determine whether it is relevant \
to a glazing subcontractor performing a takeoff.

SHEET TYPES:
- elevation:   Exterior or interior elevation showing vertical face of building
- floor_plan:  Plan view of a building level showing room layouts and partition locations
- schedule:    Tabular or pictorial schedule — door schedule, window schedule, finish schedule
- legend:      Materials legend, system legend, keynote legend, symbol legend
- detail:      Large-scale construction detail showing specific construction conditions
- section:     Building or wall section showing vertical cut through structure
- cover:       Cover sheet, project directory, drawing index, code summary
- other:       Does not fit any above category

GLAZING RELEVANCE — mark is_glazing_relevant = true if the sheet:
- Shows curtain wall, storefront, window, entrance, or other glazing systems
- Contains a schedule or legend that defines glazing systems or glass specifications
- Shows construction details that apply to glazing installation conditions
- Shows floor plan locations of glazing marks or interior glass partitions
- Is referenced by glazing scope items (e.g., "see detail A4.2")

PROCESS STEP ROUTING:
- step_2_legend:       Materials/system legend that defines glazing system types
- step_3_elevation:    Elevation showing glazing marks and openings
- step_4_ext_schedule: Exterior door or frame schedule showing glazing mark details
- step_5_int_schedule: Interior door or frame schedule showing interior glazing details
- step_6_floor_plan:   Floor plan showing spatial layout and interior mark locations
- step_7_detail:       Detail or section with glazing-relevant conditions
- skip:                Not glazing-relevant — do not process further

ROUTING EDGE CASES — read carefully before routing:
1. FINISH SCHEDULE vs. SYSTEM LEGEND: A "Room Finish Schedule" is a tabular list of surface
   finishes (paint, tile, floor, ceiling) keyed to individual room names or numbers — it is
   NOT a glazing system legend. Key visual tell: many rows (10+) listing named rooms with
   finish material codes for walls/floors/ceiling; route to "skip".
   A true glazing system legend has a small number of entries (2–15), each with a glazing
   system code (CW-1, SF-2, etc.), manufacturer name, glass spec, and finish description.
2. ALL-GLASS / FRAMELESS ELEVATIONS: A sheet showing DRAWN ELEVATION VIEWS (pictorial side
   views) of frameless glass partitions, all-glass walls, butt-glazed systems, or interior
   storefront — route to "step_3_elevation", even if the views are grid-arranged or the
   sheet also contains a schedule table alongside the drawings.
3. MIXED SHEETS: When a sheet contains both schedule tables and elevation drawings, route by
   the dominant glazing-relevant content. Elevation drawings take priority over schedule rows.

TITLE BLOCK: The sheet number and title are typically in the bottom-right corner of the sheet.
Look there first. The sheet number format is usually letter + digits (e.g., A2.0, A3.2, G1.0).

Return ONLY valid JSON — no markdown, no explanation, no preamble."""


def _build_classifier_user_prompt(page_count: int) -> str:
    return f"""Classify each of the {page_count} architectural drawing sheets shown below.

The sheets are presented in order, starting with page index 0.

Return a JSON array with exactly {page_count} objects, one per sheet, in the order received:

[
  {{
    "page_index": 0,
    "sheet_number": "A2.0",
    "sheet_title": "Exterior Elevations",
    "sheet_type": "elevation",
    "is_glazing_relevant": true,
    "glazing_relevance_reason": "Shows 4 exterior elevations with curtain wall and storefront systems identified",
    "process_in_step": "step_3_elevation",
    "confidence": 0.95,
    "notes": ""
  }}
]

Classify all {page_count} sheets. Return nothing but the JSON array."""


# ─── Classifier ───────────────────────────────────────────────────────────────

class SheetClassifier:
    """
    Classifies all pages in a drawing set in a single Claude API call.
    Routes each page to the correct Drawing Intelligence extraction step.
    """

    def __init__(self, api_key: str | None = None):
        self.client = anthropic.Anthropic(api_key=api_key)

    def classify(
        self,
        pdf_path: str,
        batch_size: int = 12,
        routing_overrides: dict[str, ProcessStep] | None = None,
    ) -> ClassificationResult:
        """
        Classify all pages in a PDF drawing set.

        Args:
            pdf_path:          Path to the architectural drawing PDF
            batch_size:        Max pages per API call (12 is safe).
            routing_overrides: {sheet_number: ProcessStep} map applied after LLM
                               classification. Use for project-specific corrections.

        Returns:
            ClassificationResult with every page classified and routed.
        """
        import fitz
        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        doc.close()

        logger.info(f"Classifying {total_pages} pages: {pdf_path}")

        result = ClassificationResult(
            pdf_path=pdf_path,
            total_pages=total_pages,
        )

        # Process in batches
        all_sheets: list[ClassifiedSheet] = []
        total_tokens = 0

        for batch_start in range(0, total_pages, batch_size):
            batch_indices = list(range(
                batch_start,
                min(batch_start + batch_size, total_pages)
            ))

            logger.info(f"  Batch pages {batch_indices[0]}–{batch_indices[-1]}")

            # Render pages at classifier DPI
            blocks = pdf_pages_to_vision_blocks(
                pdf_path,
                dpi=DPI_CLASSIFIER,
                page_indices=batch_indices,
            )

            # Build content: images first, then the instruction
            content = [strip_metadata(b) for b in blocks]
            content.append({
                "type": "text",
                "text": _build_classifier_user_prompt(len(batch_indices)),
            })

            try:
                response = self.client.messages.create(
                    model=VISION_MODEL,
                    **EXTRACTION_OPTS,
                    max_tokens=2048,
                    system=CLASSIFIER_SYSTEM,
                    messages=[{"role": "user", "content": content}],
                )
            except anthropic.APIError as e:
                logger.error(f"Classifier API error: {e}")
                result.error = str(e)
                return result

            total_tokens += response.usage.input_tokens + response.usage.output_tokens

            # Parse response
            raw = "".join(
                b.text for b in response.content if b.type == "text"
            ).strip()

            if raw.startswith("```"):
                lines = raw.split("\n")
                raw = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])

            try:
                raw_list: list[dict] = json.loads(raw)
            except json.JSONDecodeError as e:
                logger.error(f"JSON parse error in classifier response: {e}")
                logger.debug(f"Raw: {raw[:500]}")
                result.error = f"JSON parse error: {e}"
                return result

            for item in raw_list:
                sheet = ClassifiedSheet(
                    page_index=item.get("page_index", batch_start),
                    sheet_number=item.get("sheet_number", "?"),
                    sheet_title=item.get("sheet_title", "Unknown"),
                    sheet_type=item.get("sheet_type", "other"),
                    is_glazing_relevant=item.get("is_glazing_relevant", False),
                    glazing_relevance_reason=item.get("glazing_relevance_reason", ""),
                    process_in_step=item.get("process_in_step", "skip"),
                    confidence=float(item.get("confidence", 1.0)),
                    notes=item.get("notes", ""),
                )
                all_sheets.append(sheet)

        # Sort by page index, populate result
        all_sheets.sort(key=lambda s: s.page_index)

        # Apply project-specific routing overrides (post-LLM correction layer)
        if routing_overrides:
            for sheet in all_sheets:
                if sheet.sheet_number in routing_overrides:
                    new_step = routing_overrides[sheet.sheet_number]
                    if new_step != sheet.process_in_step:
                        logger.info(
                            f"  Override: {sheet.sheet_number} "
                            f"{sheet.process_in_step} → {new_step}"
                        )
                        sheet.process_in_step = new_step
                        # Mark glazing-relevant if routed to an active step
                        if new_step != "skip":
                            sheet.is_glazing_relevant = True

        result.sheets = all_sheets
        result.glazing_relevant_count = sum(
            1 for s in all_sheets if s.is_glazing_relevant
        )
        result.tokens_used = total_tokens

        logger.info(
            f"Classification complete: {result.glazing_relevant_count}/"
            f"{total_pages} glazing-relevant, {total_tokens} tokens"
        )

        self._log_routing_table(result)
        return result

    async def classify_async(self, pdf_path: str, batch_size: int = 12) -> ClassificationResult:
        """Async version for FastAPI endpoints."""
        import fitz
        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        doc.close()

        async_client = anthropic.AsyncAnthropic()
        result = ClassificationResult(pdf_path=pdf_path, total_pages=total_pages)
        all_sheets: list[ClassifiedSheet] = []
        total_tokens = 0

        for batch_start in range(0, total_pages, batch_size):
            batch_indices = list(range(
                batch_start,
                min(batch_start + batch_size, total_pages)
            ))

            blocks = pdf_pages_to_vision_blocks(
                pdf_path, dpi=DPI_CLASSIFIER, page_indices=batch_indices
            )
            content = [strip_metadata(b) for b in blocks]
            content.append({
                "type": "text",
                "text": _build_classifier_user_prompt(len(batch_indices)),
            })

            try:
                response = await async_client.messages.create(
                    model=VISION_MODEL,
                    **EXTRACTION_OPTS,
                    max_tokens=2048,
                    system=CLASSIFIER_SYSTEM,
                    messages=[{"role": "user", "content": content}],
                )
            except anthropic.APIError as e:
                result.error = str(e)
                return result

            total_tokens += response.usage.input_tokens + response.usage.output_tokens
            raw = "".join(
                b.text for b in response.content if b.type == "text"
            ).strip()
            if raw.startswith("```"):
                lines = raw.split("\n")
                raw = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])

            try:
                for item in json.loads(raw):
                    all_sheets.append(ClassifiedSheet(
                        page_index=item.get("page_index", batch_start),
                        sheet_number=item.get("sheet_number", "?"),
                        sheet_title=item.get("sheet_title", "Unknown"),
                        sheet_type=item.get("sheet_type", "other"),
                        is_glazing_relevant=item.get("is_glazing_relevant", False),
                        glazing_relevance_reason=item.get("glazing_relevance_reason", ""),
                        process_in_step=item.get("process_in_step", "skip"),
                        confidence=float(item.get("confidence", 1.0)),
                        notes=item.get("notes", ""),
                    ))
            except (json.JSONDecodeError, Exception) as e:
                result.error = str(e)
                return result

        all_sheets.sort(key=lambda s: s.page_index)
        result.sheets = all_sheets
        result.glazing_relevant_count = sum(1 for s in all_sheets if s.is_glazing_relevant)
        result.tokens_used = total_tokens
        return result

    def _log_routing_table(self, result: ClassificationResult) -> None:
        logger.info("\n  Sheet Routing Table:")
        logger.info(f"  {'Page':<5} {'Sheet':<8} {'Type':<14} {'Step':<22} {'Relevant'}")
        logger.info(f"  {'-'*5} {'-'*8} {'-'*14} {'-'*22} {'-'*8}")
        for s in result.sheets:
            rel = "+" if s.is_glazing_relevant else "-"
            logger.info(
                f"  {s.page_index:<5} {s.sheet_number:<8} {s.sheet_type:<14} "
                f"{s.process_in_step:<22} {rel}"
            )


# ─── Quick test ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import os, sys
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s"
    )

    if len(sys.argv) < 2:
        print("Usage: python -m glazierai.modules.drawing_intelligence.sheet_classifier <path/to/drawings.pdf>")
        sys.exit(1)

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY not set")
        sys.exit(1)

    classifier = SheetClassifier(api_key=api_key)

    # Project-specific routing corrections (LLM post-processing overrides).
    # Add entries here when the classifier consistently misroutes a sheet type.
    # Key = sheet_number as read from title block; value = correct ProcessStep.
    overrides: dict[str, ProcessStep] = {
        # McLarty Mazda corrections:
        # A3.0  Interior floor plan — classifier sometimes skips it
        "A3.0": "step_6_floor_plan",
        # A3.1  Room Finish Schedule + informational glazing callouts only
        #       → not a system legend; skip
        "A3.1": "skip",
        # A3.2  Exterior door & frame schedule → classifier sometimes calls it elevation
        "A3.2": "step_4_ext_schedule",
        # A3.3  All-glass elevations + interior storefront drawings
        #       → elevation content dominates, use Step 3
        "A3.3": "step_3_elevation",
    }

    result = classifier.classify(sys.argv[1], routing_overrides=overrides)

    if result.error:
        print(f"Error: {result.error}")
        sys.exit(1)

    print(f"\nResults: {result.glazing_relevant_count}/{result.total_pages} glazing-relevant")
    print(f"Tokens:  {result.tokens_used}")
    print(f"\nBy step:")
    for step in ["step_2_legend", "step_3_elevation", "step_4_ext_schedule",
                 "step_5_int_schedule", "step_6_floor_plan", "step_7_detail", "skip"]:
        sheets = result.sheets_for_step(step)
        if sheets:
            nums = ", ".join(s.sheet_number for s in sheets)
            print(f"  {step:<25} {nums}")
