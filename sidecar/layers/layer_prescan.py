"""
layer_prescan.py

PDF Drawing Set Pre-Scanner

Runs a fast lightweight scan on every page of a PDF drawing set and
returns a relevance score for each page. Only pages above the relevance
threshold are passed to the full Layer 0 → Layer 2 → Rules Engine pipeline.

Pre-scan uses four signals, each fast (< 50ms per page total):
    1. Sheet type classification (Layer 1 — already fast)
    2. Glazing keyword presence in page text
    3. Vector path count in the drawing field
    4. Drawing field occupancy ratio

Skip conditions (any one is sufficient to skip a page):
    - Sheet type is site_plan, structural, schedule, or unknown with no keywords
    - Zero glazing keywords found AND path count < MIN_PATHS_FOR_GLAZING
    - Path count < ABSOLUTE_MIN_PATHS (cover sheets, notes pages)

Relevance scores:
    1.0 — Elevation sheet with glazing keywords and high path density
    0.8 — Elevation sheet, no keywords but high path density
    0.7 — Unknown type but strong glazing keywords
    0.5 — Floor plan (useful for Layer 9 cross-reference)
    0.3 — Detail sheet (useful for system identification)
    0.0 — Skip (no glazing relevance)

This module never raises exceptions.
"""

import logging
from dataclasses import dataclass, field
from typing import List, Optional

import fitz  # PyMuPDF

from .layer1_router import classify_sheet, SheetClassification

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

# Minimum vector paths for a page to be worth analyzing
ABSOLUTE_MIN_PATHS = 20       # Below this = notes/cover/blank page
MIN_PATHS_FOR_GLAZING = 200   # Below this without keywords = probably not glazing

# Glazing-relevant keywords for text scan
GLAZING_KEYWORDS = [
    "STOREFRONT", "CURTAIN WALL", "CURTAINWALL", "CURTAIN-WALL",
    "GLAZING", "GLAZED", "ALUMINUM FRAMING", "ALUMINUM FRAME",
    "WINDOW WALL", "WINDOWWALL", "GLASS", "FRAMING SYSTEM",
    "STOREFRONT SYSTEM", "CURTAIN WALL SYSTEM", "ENTRANCE",
    "KAWNEER", "YKK", "TUBELITE", "EFCO", "OLDCASTLE",
    "THERMALLY BROKEN", "THERMAL BREAK", "CENTER SET", "FACE SET",
    "STOREFRONT ELEVATION", "CURTAIN WALL ELEVATION",
]

# Sheet types that always get scanned (have relevant geometry)
ALWAYS_SCAN_TYPES = {"elevation", "floor_plan", "detail"}

# Sheet types that are always skipped
ALWAYS_SKIP_TYPES = {"site_plan"}


# ── Data Structures ───────────────────────────────────────────────────────────

@dataclass
class PagePrescanResult:
    """
    Result of pre-scanning a single PDF page.

    page_num:        Zero-indexed page number
    relevance_score: 0.0 = skip, 1.0 = highest priority
    should_scan:     True if this page should get full pipeline treatment
    sheet_type:      Classification from Layer 1
    sheet_number:    Detected sheet number (e.g. 'A5.6')
    path_count:      Number of vector paths on the page
    keywords_found:  Which glazing keywords were detected
    skip_reason:     Why the page was skipped (if should_scan=False)
    processing_role: 'glazing_detection' | 'cross_reference' | 'skip'
    """
    page_num: int
    relevance_score: float = 0.0
    should_scan: bool = False
    sheet_type: str = "unknown"
    sheet_number: str = ""
    path_count: int = 0
    keywords_found: List[str] = field(default_factory=list)
    skip_reason: str = ""
    processing_role: str = "skip"
    classification_confidence: float = 0.0


@dataclass
class DrawingSetPrescan:
    """
    Result of pre-scanning an entire PDF drawing set.

    total_pages:   Total pages in the PDF
    scan_pages:    Pages that should get full glazing detection
    reference_pages: Pages useful for cross-referencing (floor plans, details)
    skip_pages:    Pages with no glazing relevance
    results:       Per-page results sorted by relevance
    """
    total_pages: int = 0
    scan_pages: List[int] = field(default_factory=list)
    reference_pages: List[int] = field(default_factory=list)
    skip_pages: List[int] = field(default_factory=list)
    results: List[PagePrescanResult] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


# ── Per-Page Signals ──────────────────────────────────────────────────────────

def _count_vector_paths(page: fitz.Page) -> int:
    """
    Count the number of vector drawing paths on the page.
    Excludes text paths (already handled by Layer 0).
    Fast — uses raw path count without geometry analysis.
    """
    try:
        drawings = page.get_drawings()
        return len(drawings)
    except Exception:
        return 0


def _find_glazing_keywords(page: fitz.Page) -> List[str]:
    """
    Scan page text for glazing-relevant keywords.
    Returns list of matched keywords (uppercase).
    Fast — text extraction only, no geometry.
    """
    found = []
    try:
        text = page.get_text("text").upper()
        for keyword in GLAZING_KEYWORDS:
            if keyword in text:
                found.append(keyword)
    except Exception:
        pass
    return found


def _compute_relevance(
    sheet_type: str,
    classification_confidence: float,
    path_count: int,
    keywords_found: List[str]
) -> tuple:
    """
    Compute relevance score and processing role.

    Returns (relevance_score, should_scan, processing_role, skip_reason)
    """
    has_keywords = len(keywords_found) > 0

    # ── Always skip ──
    if sheet_type in ALWAYS_SKIP_TYPES:
        return 0.0, False, "skip", f"sheet_type={sheet_type} always skipped"

    if path_count < ABSOLUTE_MIN_PATHS:
        return 0.0, False, "skip", f"path_count={path_count} below minimum {ABSOLUTE_MIN_PATHS}"

    # ── Skip: non-elevation with no keywords and low path count ──
    if sheet_type not in ALWAYS_SCAN_TYPES and not has_keywords:
        if path_count < MIN_PATHS_FOR_GLAZING:
            return 0.0, False, "skip", (
                f"no glazing keywords and path_count={path_count} < {MIN_PATHS_FOR_GLAZING}"
            )

    # ── Elevation: primary glazing detection target ──
    if sheet_type == "elevation":
        if has_keywords and path_count >= MIN_PATHS_FOR_GLAZING:
            return 1.0, True, "glazing_detection", ""
        elif has_keywords:
            return 0.8, True, "glazing_detection", ""
        elif path_count >= MIN_PATHS_FOR_GLAZING:
            return 0.8, True, "glazing_detection", ""
        else:
            # Low path elevation — still scan but lower priority
            return 0.6, True, "glazing_detection", ""

    # ── Floor plan: useful for Layer 9 cross-referencing ──
    if sheet_type == "floor_plan":
        return 0.5, False, "cross_reference", ""

    # ── Detail: useful for system identification ──
    if sheet_type == "detail":
        return 0.3, False, "cross_reference", ""

    # ── Unknown with strong keyword signal ──
    if has_keywords and path_count >= MIN_PATHS_FOR_GLAZING:
        return 0.7, True, "glazing_detection", ""

    # ── Unknown with weak signal ──
    if has_keywords:
        return 0.4, False, "cross_reference", ""

    return 0.0, False, "skip", "no glazing relevance detected"


# ── Per-Page Prescan ──────────────────────────────────────────────────────────

def prescan_page(page: fitz.Page, page_num: int) -> PagePrescanResult:
    """
    Run the pre-scan on a single PDF page.

    Args:
        page: fitz.Page object
        page_num: Zero-indexed page number

    Returns:
        PagePrescanResult — never raises
    """
    result = PagePrescanResult(page_num=page_num)

    try:
        # Signal 1: Sheet classification (Layer 1)
        cls: SheetClassification = classify_sheet(page, sheet_id=f"page_{page_num}")
        result.sheet_type = cls.sheet_type
        result.sheet_number = cls.sheet_number
        result.classification_confidence = cls.confidence

        # Signal 2: Glazing keyword presence
        result.keywords_found = _find_glazing_keywords(page)

        # Signal 3: Vector path count
        result.path_count = _count_vector_paths(page)

        # Compute relevance
        score, should_scan, role, skip_reason = _compute_relevance(
            result.sheet_type,
            result.classification_confidence,
            result.path_count,
            result.keywords_found
        )
        result.relevance_score = score
        result.should_scan = should_scan
        result.processing_role = role
        result.skip_reason = skip_reason

    except Exception as e:
        logger.warning(f"prescan_page failed for page {page_num}: {e}")
        result.skip_reason = f"prescan error: {e}"

    return result


# ── Full Drawing Set Prescan ──────────────────────────────────────────────────

def prescan_drawing_set(
    pdf_path: str,
    max_pages: Optional[int] = None
) -> DrawingSetPrescan:
    """
    Pre-scan an entire PDF drawing set to identify which pages
    are worth running full glazing detection on.

    Args:
        pdf_path:  Path to the PDF file
        max_pages: Optional limit on pages to scan (for testing)

    Returns:
        DrawingSetPrescan — never raises
    """
    result = DrawingSetPrescan()

    try:
        doc = fitz.open(pdf_path)
        total = len(doc)
        result.total_pages = total

        pages_to_scan = range(min(total, max_pages) if max_pages else total)

        for page_num in pages_to_scan:
            try:
                page = doc[page_num]
                page_result = prescan_page(page, page_num)
                result.results.append(page_result)

                if page_result.should_scan:
                    result.scan_pages.append(page_num)
                elif page_result.processing_role == "cross_reference":
                    result.reference_pages.append(page_num)
                else:
                    result.skip_pages.append(page_num)

            except Exception as e:
                logger.warning(f"Failed to prescan page {page_num}: {e}")
                result.errors.append(f"page_{page_num}: {e}")

        # Sort results by relevance score descending
        result.results.sort(key=lambda r: r.relevance_score, reverse=True)

        doc.close()

        logger.info(
            f"Prescan complete: {total} pages — "
            f"{len(result.scan_pages)} to scan, "
            f"{len(result.reference_pages)} for reference, "
            f"{len(result.skip_pages)} skipped"
        )

    except FileNotFoundError:
        result.errors.append(f"PDF file not found: {pdf_path}")
    except Exception as e:
        result.errors.append(f"prescan_drawing_set failed: {e}")
        logger.exception(f"prescan_drawing_set failed: {e}")

    return result


def prescan_summary(prescan: DrawingSetPrescan) -> str:
    """
    Generate a human-readable summary of prescan results.
    Useful for logging and the run_poc.py output.
    """
    lines = [
        f"Drawing Set Prescan: {prescan.total_pages} total pages",
        f"  Scan for glazing:  {len(prescan.scan_pages)} pages "
        f"{prescan.scan_pages}",
        f"  Cross-reference:   {len(prescan.reference_pages)} pages",
        f"  Skip:              {len(prescan.skip_pages)} pages",
    ]

    if prescan.scan_pages:
        lines.append(f"\n  Priority elevation sheets:")
        scan_results = [
            r for r in prescan.results
            if r.page_num in prescan.scan_pages
        ]
        for r in sorted(scan_results, key=lambda x: x.relevance_score, reverse=True)[:10]:
            kw_str = f" [{', '.join(r.keywords_found[:3])}]" if r.keywords_found else ""
            lines.append(
                f"    Page {r.page_num:3d} ({r.sheet_number or 'unknown':8s}) "
                f"score={r.relevance_score:.1f} "
                f"type={r.sheet_type:12s} "
                f"paths={r.path_count:5d}{kw_str}"
            )

    if prescan.errors:
        lines.append(f"\n  Errors: {prescan.errors}")

    return "\n".join(lines)
