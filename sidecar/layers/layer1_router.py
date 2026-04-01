"""
layer1_router.py

Layer 1: Sheet Router

Classifies PDF drawing sheets by type using title block OCR.
Sheet type is determined before any geometry analysis runs.
The result sets the normalization path in Layer 0.

Sheet types and their downstream handling:
    elevation   → Full normalization. Primary glazing detection target.
    floor_plan  → Partial normalization. Opening symbol detection.
    detail      → No normalization. System identification.
    schedule    → No normalization. Table parsing.
    site_plan   → Skip. No glazing scope.
    structural  → Skip. Substrate reference only.
    unknown     → No normalization. Flag for human review.

Classification uses keyword matching against text extracted from:
1. The title block region (bottom strip of the sheet)
2. The full page text as fallback

Confidence scoring:
    1.0 — exact match on primary keyword (e.g. "ELEVATION" in title block)
    0.8 — match on secondary keyword
    0.6 — match on page text outside title block
    0.4 — weak match / inference
    0.0 — no match found → returns 'unknown'

This module never raises exceptions.
All errors are logged and returned as SheetClassification with type='unknown'.
"""

import re
import logging
from dataclasses import dataclass, field
from typing import List, Tuple, Optional, Dict

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)


# ── Sheet Type Definitions ────────────────────────────────────────────────────

SHEET_TYPES = [
    "elevation",
    "floor_plan",
    "detail",
    "schedule",
    "site_plan",
    "structural",
    "unknown",
]

# Primary keywords — strong signal for sheet type
# Each entry: (sheet_type, keyword, confidence_if_matched)
PRIMARY_KEYWORDS: List[Tuple[str, str, float]] = [
    ("elevation",   "ELEVATION",          1.0),
    ("elevation",   "EXTERIOR ELEVATION", 1.0),
    ("elevation",   "BUILDING ELEVATION", 1.0),
    ("elevation",   "FACADE",             0.9),
    ("elevation",   "GLAZING ELEVATION",  1.0),
    ("floor_plan",  "FLOOR PLAN",         1.0),
    ("floor_plan",  "PLAN VIEW",          1.0),
    ("floor_plan",  "REFLECTED CEILING",  0.8),
    ("floor_plan",  "ROOF PLAN",          0.8),
    ("detail",      "DETAIL",             1.0),
    ("detail",      "ENLARGED DETAIL",    1.0),
    ("detail",      "SECTION DETAIL",     1.0),
    ("detail",      "TYP. DETAIL",        1.0),
    ("schedule",    "SCHEDULE",           1.0),
    ("schedule",    "DOOR SCHEDULE",      1.0),
    ("schedule",    "WINDOW SCHEDULE",    1.0),
    ("schedule",    "HARDWARE SCHEDULE",  1.0),
    ("schedule",    "GLAZING SCHEDULE",   1.0),
    ("schedule",    "FINISH SCHEDULE",    1.0),
    ("site_plan",   "SITE PLAN",          1.0),
    ("site_plan",   "CIVIL",              0.8),
    ("site_plan",   "LANDSCAPE",          0.8),
    ("structural",  "STRUCTURAL",         1.0),
    ("structural",  "FRAMING PLAN",       1.0),
    ("structural",  "FOUNDATION",         0.9),
]

# Sheet number prefix → sheet type inference (fallback)
# e.g. "A2.1" starts with A → architectural → check further
# e.g. "S1.0" starts with S → structural
SHEET_PREFIX_MAP: Dict[str, str] = {
    "S": "structural",
    "C": "site_plan",
    "L": "site_plan",
    "M": "unknown",   # Mechanical — skip
    "E": "unknown",   # Electrical — skip
    "P": "unknown",   # Plumbing — skip
}


# ── Data Structures ───────────────────────────────────────────────────────────

@dataclass
class SheetClassification:
    """
    Result of sheet type classification.

    sheet_type:  One of the SHEET_TYPES values
    confidence:  0.0 to 1.0
    method:      How the classification was determined
    matched_text: The text that triggered the classification
    sheet_number: Detected sheet number from title block (e.g. 'A2.1')
    sheet_title:  Detected sheet title text
    raw_titleblock_text: All text found in the title block region
    """
    sheet_type: str = "unknown"
    confidence: float = 0.0
    method: str = "none"
    matched_text: str = ""
    sheet_number: str = ""
    sheet_title: str = ""
    raw_titleblock_text: str = ""
    errors: List[str] = field(default_factory=list)


# ── Title Block Extraction ────────────────────────────────────────────────────

def _extract_titleblock_text(page: fitz.Page) -> str:
    """
    Extract text from the title block region of the sheet.

    The title block is typically in the bottom 15% or right 20% of the page.
    We sample both regions and combine.

    Args:
        page: fitz.Page object

    Returns:
        Uppercase string of all text found in the title block region.
        Empty string on failure.
    """
    try:
        rect = page.rect
        w, h = rect.width, rect.height

        # Bottom strip (bottom 15% of page height)
        bottom_strip = fitz.Rect(0, h * 0.85, w, h)
        # Right strip (right 20% of page width)
        right_strip = fitz.Rect(w * 0.80, 0, w, h)

        bottom_text = page.get_text("text", clip=bottom_strip)
        right_text = page.get_text("text", clip=right_strip)

        combined = (bottom_text + " " + right_text).upper().strip()
        return combined
    except Exception as e:
        logger.warning(f"_extract_titleblock_text failed: {e}")
        return ""


def _extract_full_page_text(page: fitz.Page) -> str:
    """
    Extract all text from the page as uppercase string.
    Used as fallback when title block extraction is insufficient.
    """
    try:
        return page.get_text("text").upper().strip()
    except Exception as e:
        logger.warning(f"_extract_full_page_text failed: {e}")
        return ""


def _detect_sheet_number(text: str) -> str:
    """
    Attempt to extract a sheet number from text.
    Common patterns: A2.1, S1.0, E-101, C3, G001

    Returns the first match found, or empty string.
    """
    pattern = re.compile(
        r'\b([A-Z]{1,2}[-.]?\d{1,3}(?:\.\d{1,2})?)\b'
    )
    matches = pattern.findall(text)
    # Return the shortest plausible match (avoid capturing long strings)
    for m in matches:
        if 2 <= len(m) <= 8:
            return m
    return ""


# ── Classification Logic ──────────────────────────────────────────────────────

def _classify_from_text(
    text: str,
    method: str,
    confidence_multiplier: float = 1.0
) -> Optional[SheetClassification]:
    """
    Attempt to classify sheet type from a text string.
    Returns SheetClassification if a match is found, None otherwise.

    Args:
        text: Uppercase text to search
        method: Label for how this text was obtained
        confidence_multiplier: Scale factor applied to base confidence
    """
    best_type = None
    best_conf = 0.0
    best_match = ""

    for sheet_type, keyword, base_conf in PRIMARY_KEYWORDS:
        if keyword in text:
            conf = base_conf * confidence_multiplier
            if conf > best_conf:
                best_conf = conf
                best_type = sheet_type
                best_match = keyword

    if best_type:
        return SheetClassification(
            sheet_type=best_type,
            confidence=best_conf,
            method=method,
            matched_text=best_match
        )
    return None


def _classify_from_sheet_number(sheet_number: str) -> Optional[SheetClassification]:
    """
    Infer sheet type from sheet number prefix as a last resort.
    Returns SheetClassification with low confidence, or None.
    """
    if not sheet_number:
        return None

    prefix = sheet_number[0].upper()
    inferred_type = SHEET_PREFIX_MAP.get(prefix)

    if inferred_type:
        return SheetClassification(
            sheet_type=inferred_type,
            confidence=0.4,
            method="sheet_number_prefix",
            matched_text=sheet_number
        )

    # 'A' prefix = architectural — need more context, return unknown
    return None


# ── Main Entry Point ──────────────────────────────────────────────────────────

def classify_sheet(
    page: fitz.Page,
    sheet_id: str = ""
) -> SheetClassification:
    """
    Classify a PDF sheet by type using title block OCR.

    Classification pipeline (in order of confidence):
    1. Title block text → primary keyword match (highest confidence)
    2. Full page text → primary keyword match (medium confidence)
    3. Sheet number prefix → type inference (low confidence)
    4. Return 'unknown' with confidence 0.0

    Args:
        page:     fitz.Page to classify
        sheet_id: Optional identifier for logging

    Returns:
        SheetClassification — never raises, returns unknown on any error
    """
    result = SheetClassification()

    try:
        # ── Step 1: Extract title block text ──
        titleblock_text = _extract_titleblock_text(page)
        result.raw_titleblock_text = titleblock_text[:500]  # Store first 500 chars

        # Try to find sheet number for additional context
        result.sheet_number = _detect_sheet_number(titleblock_text)
        if not result.sheet_number:
            full_text = _extract_full_page_text(page)
            result.sheet_number = _detect_sheet_number(full_text)

        # ── Step 2: Classify from title block (full confidence) ──
        classification = _classify_from_text(
            titleblock_text,
            method="titleblock_ocr",
            confidence_multiplier=1.0
        )
        if classification and classification.confidence >= 0.6:
            classification.sheet_number = result.sheet_number
            classification.raw_titleblock_text = result.raw_titleblock_text
            return classification

        # ── Step 3: Classify from full page text (reduced confidence) ──
        full_text = _extract_full_page_text(page)
        classification = _classify_from_text(
            full_text,
            method="fullpage_ocr",
            confidence_multiplier=0.7
        )
        if classification and classification.confidence >= 0.4:
            classification.sheet_number = result.sheet_number
            classification.raw_titleblock_text = result.raw_titleblock_text
            return classification

        # ── Step 4: Infer from sheet number prefix ──
        classification = _classify_from_sheet_number(result.sheet_number)
        if classification:
            classification.raw_titleblock_text = result.raw_titleblock_text
            return classification

        # ── Step 5: Unknown ──
        result.sheet_type = "unknown"
        result.confidence = 0.0
        result.method = "no_match"
        return result

    except Exception as e:
        logger.exception(f"classify_sheet failed for sheet_id={sheet_id}: {e}")
        result.errors.append(f"classify_sheet failed: {type(e).__name__}: {e}")
        return result


def classify_sheet_from_path(
    pdf_path: str,
    page_num: int = 0
) -> SheetClassification:
    """
    Convenience wrapper: classify a sheet directly from a PDF file path.

    Args:
        pdf_path: Path to PDF file
        page_num: Zero-indexed page number

    Returns:
        SheetClassification — never raises
    """
    try:
        doc = fitz.open(pdf_path)
        if page_num >= len(doc):
            result = SheetClassification()
            result.errors.append(
                f"Page {page_num} does not exist. PDF has {len(doc)} pages."
            )
            return result
        page = doc[page_num]
        result = classify_sheet(page, sheet_id=f"{pdf_path}:page{page_num}")
        doc.close()
        return result
    except FileNotFoundError:
        result = SheetClassification()
        result.errors.append(f"PDF file not found: {pdf_path}")
        return result
    except Exception as e:
        result = SheetClassification()
        result.errors.append(f"classify_sheet_from_path failed: {e}")
        return result
