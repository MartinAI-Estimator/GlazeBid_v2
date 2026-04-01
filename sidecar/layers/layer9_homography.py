"""
layer9_homography.py

Layer 9: Grid-Line Homography — Multi-View Consistency Filter

Uses architectural grid labels (A, B, C, 1, 2, 3) as fiducial markers
to compute a spatial correspondence between drawing sheets.

In architectural drawings, grid lines are a shared coordinate system
across all sheets in the set. A glazing opening at grid intersection A-3
on the elevation must also appear as a void at grid intersection A-3
on the floor plan. This layer exploits that redundancy.

Pipeline:
    1. Detect grid labels on each sheet via OCR (letters/numbers in circles)
    2. Match grid labels that appear on multiple sheets
    3. Compute a homography (affine transform) mapping sheet A coords → sheet B
    4. For each glazing candidate on the elevation, project to floor plan space
    5. Check if an opening void exists at the projected location
    6. Boost confidence for candidates confirmed in multiple views
    7. Flag candidates that only appear in one view for human review

Confidence adjustments:
    Confirmed in 2+ views:  +0.20 confidence boost
    Only in 1 view:         -0.10 confidence penalty, flagged

This module never raises exceptions.
Requires minimum 3 matching grid labels for a reliable homography.
"""

import re
import math
import logging
from dataclasses import dataclass, field
from typing import List, Tuple, Optional, Dict

import fitz  # PyMuPDF
import numpy as np

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

MIN_GRID_LABELS_FOR_HOMOGRAPHY = 3   # Minimum matches needed for reliable transform
GRID_MATCH_TOLERANCE_PTS = 20.0      # Spatial tolerance for cross-sheet confirmation
MULTI_VIEW_CONFIDENCE_BOOST = 0.20   # Added when confirmed in 2+ views
SINGLE_VIEW_CONFIDENCE_PENALTY = 0.10 # Subtracted when only in 1 view


# ── Data Structures ───────────────────────────────────────────────────────────

@dataclass
class GridLabel:
    """
    A detected architectural grid label on a drawing sheet.

    label:    The text content (e.g. 'A', 'B', '1', '2', 'A.1')
    x:        X coordinate in PDF points
    y:        Y coordinate in PDF points
    sheet_id: Which sheet this label was found on
    confidence: How confident we are this is a grid label (0.0-1.0)
    """
    label: str
    x: float
    y: float
    sheet_id: str
    confidence: float = 1.0


@dataclass
class GridMatch:
    """
    A matched grid label appearing on two sheets.
    Used to compute the homography between sheets.
    """
    label: str
    point_a: Tuple[float, float]   # (x, y) on sheet A
    point_b: Tuple[float, float]   # (x, y) on sheet B


@dataclass
class HomographyResult:
    """
    Result of computing a homography between two sheets.

    transform_matrix: 3x3 numpy array (None if homography failed)
    matched_labels: Grid labels that were matched between sheets
    reprojection_error_pts: Average reprojection error in PDF points
    is_reliable: True if enough matches and error is acceptable
    sheet_a_id: Source sheet identifier
    sheet_b_id: Target sheet identifier
    """
    transform_matrix: Optional[np.ndarray]
    matched_labels: List[GridMatch]
    reprojection_error_pts: float
    is_reliable: bool
    sheet_a_id: str
    sheet_b_id: str
    errors: List[str] = field(default_factory=list)


@dataclass
class CrossSheetCandidate:
    """
    A glazing candidate after cross-sheet consistency checking.
    Wraps the original candidate with multi-view confirmation data.
    """
    candidate_id: str
    original_confidence: float
    adjusted_confidence: float
    confirmed_on_sheets: List[str]    # Sheet IDs where this candidate was confirmed
    projected_locations: Dict[str, Tuple[float, float]]  # sheet_id → (x, y) in that sheet
    status: str                        # 'confirmed' | 'single_view' | 'unverified'
    confidence_delta: float            # How much confidence changed


# ── Grid Label Detection ──────────────────────────────────────────────────────

def _is_grid_label(text: str) -> bool:
    """
    Determine if a text string looks like an architectural grid label.

    Grid labels are typically:
    - Single uppercase letters: A, B, C, D, E, F, G, H, J, K (skip I and O)
    - Single or double digits: 1, 2, 3, 10, 12
    - Letter-number combos: A.1, B.2, AA, A1

    Not grid labels: long strings, lowercase words, dimensions, scales.

    Args:
        text: Stripped text string to evaluate

    Returns:
        True if this looks like a grid label
    """
    text = text.strip()
    if not text or len(text) > 4:
        return False

    # Single letter (excluding I and O which are ambiguous)
    if re.match(r'^[A-HJ-NP-Z]$', text):
        return True

    # Single or double digit
    if re.match(r'^\d{1,2}$', text):
        return True

    # Letter-dot-number or letter-number combo
    if re.match(r'^[A-Z]\.\d$', text):
        return True

    # Double letter (AA, BB etc)
    if re.match(r'^[A-Z]{2}$', text):
        return True

    return False


def detect_grid_labels(
    page: fitz.Page,
    sheet_id: str = ""
) -> List[GridLabel]:
    """
    Detect architectural grid labels on a drawing sheet.

    Strategy:
    1. Extract all text blocks from the page
    2. Filter for text that matches grid label patterns
    3. Focus on text near the page edges (grid bubbles are typically
       along the margins) and in the drawing field

    Args:
        page: fitz.Page to scan
        sheet_id: Identifier for this sheet (for logging)

    Returns:
        List of GridLabel objects. Empty list on failure.
    """
    labels = []

    try:
        rect = page.rect
        w, h = rect.width, rect.height

        # Grid bubbles typically appear in margin zones
        # Top and bottom margins (top/bottom 8% of height)
        # Left and right margins (left/right 8% of width)
        margin_zones = [
            fitz.Rect(0, 0, w, h * 0.08),           # top margin
            fitz.Rect(0, h * 0.92, w, h),            # bottom margin
            fitz.Rect(0, 0, w * 0.08, h),            # left margin
            fitz.Rect(w * 0.92, 0, w, h),            # right margin
        ]

        seen_labels = set()  # Avoid duplicates

        for zone in margin_zones:
            blocks = page.get_text("blocks", clip=zone)
            for block in blocks:
                if len(block) <= 4:
                    continue
                raw_text = block[4].strip().upper()

                # Each block may contain multiple lines
                for line in raw_text.split('\n'):
                    line = line.strip()
                    if _is_grid_label(line):
                        # Get center of block bounding box
                        bx0, by0, bx1, by1 = block[0], block[1], block[2], block[3]
                        cx = (bx0 + bx1) / 2
                        cy = (by0 + by1) / 2

                        # Deduplicate by label + approximate position
                        key = (line, int(cx / 10), int(cy / 10))
                        if key not in seen_labels:
                            seen_labels.add(key)
                            labels.append(GridLabel(
                                label=line,
                                x=cx,
                                y=cy,
                                sheet_id=sheet_id,
                                confidence=0.9
                            ))

        # Also scan the full drawing field at lower confidence
        # (some drawings have grid labels within the drawing area)
        all_blocks = page.get_text("blocks")
        for block in all_blocks:
            if len(block) <= 4:
                continue
            raw_text = block[4].strip().upper()
            for line in raw_text.split('\n'):
                line = line.strip()
                if _is_grid_label(line):
                    bx0, by0, bx1, by1 = block[0], block[1], block[2], block[3]
                    cx = (bx0 + bx1) / 2
                    cy = (by0 + by1) / 2
                    key = (line, int(cx / 10), int(cy / 10))
                    if key not in seen_labels:
                        seen_labels.add(key)
                        labels.append(GridLabel(
                            label=line,
                            x=cx,
                            y=cy,
                            sheet_id=sheet_id,
                            confidence=0.6
                        ))

    except Exception as e:
        logger.warning(f"detect_grid_labels failed for sheet={sheet_id}: {e}")

    return labels


# ── Homography Computation ────────────────────────────────────────────────────

def match_grid_labels(
    labels_a: List[GridLabel],
    labels_b: List[GridLabel]
) -> List[GridMatch]:
    """
    Find grid labels that appear on both sheets.

    Args:
        labels_a: Grid labels from sheet A
        labels_b: Grid labels from sheet B

    Returns:
        List of GridMatch objects for labels found on both sheets
    """
    # Build lookup: label text → GridLabel for sheet B
    b_lookup: Dict[str, GridLabel] = {}
    for label in labels_b:
        # Keep highest-confidence label for each text value
        if label.label not in b_lookup or label.confidence > b_lookup[label.label].confidence:
            b_lookup[label.label] = label

    matches = []
    for label_a in labels_a:
        if label_a.label in b_lookup:
            label_b = b_lookup[label_a.label]
            matches.append(GridMatch(
                label=label_a.label,
                point_a=(label_a.x, label_a.y),
                point_b=(label_b.x, label_b.y)
            ))

    return matches


def compute_homography(
    matches: List[GridMatch],
    sheet_a_id: str = "A",
    sheet_b_id: str = "B"
) -> HomographyResult:
    """
    Compute an affine homography matrix from matched grid label pairs.

    Uses a least-squares affine transform (6 degrees of freedom):
    translation, rotation, scale, shear.

    Requires minimum MIN_GRID_LABELS_FOR_HOMOGRAPHY (3) matches.

    Args:
        matches: List of GridMatch objects with corresponding point pairs
        sheet_a_id: Label for source sheet
        sheet_b_id: Label for target sheet

    Returns:
        HomographyResult — never raises
    """
    result = HomographyResult(
        transform_matrix=None,
        matched_labels=matches,
        reprojection_error_pts=float('inf'),
        is_reliable=False,
        sheet_a_id=sheet_a_id,
        sheet_b_id=sheet_b_id
    )

    if len(matches) < MIN_GRID_LABELS_FOR_HOMOGRAPHY:
        result.errors.append(
            f"Insufficient grid label matches: {len(matches)} found, "
            f"{MIN_GRID_LABELS_FOR_HOMOGRAPHY} required for reliable homography."
        )
        return result

    try:
        # Build the least-squares system for affine transform
        # [x'] = [a b c] [x]
        # [y']   [d e f] [y]
        #                [1]
        # Rearranged: for each point pair (x,y) → (x',y'):
        # [x y 1 0 0 0] [a b c d e f]^T = [x']
        # [0 0 0 x y 1]                   [y']

        n = len(matches)
        A = np.zeros((2 * n, 6))
        b_vec = np.zeros(2 * n)

        for i, match in enumerate(matches):
            x, y = match.point_a
            xp, yp = match.point_b

            A[2 * i]     = [x, y, 1, 0, 0, 0]
            A[2 * i + 1] = [0, 0, 0, x, y, 1]
            b_vec[2 * i]     = xp
            b_vec[2 * i + 1] = yp

        # Solve via least squares
        params, residuals, rank, sv = np.linalg.lstsq(A, b_vec, rcond=None)
        a, b, c, d, e, f = params

        # Build 3x3 homogeneous transform matrix
        M = np.array([
            [a, b, c],
            [d, e, f],
            [0, 0, 1]
        ])

        # Compute reprojection error
        errors = []
        for match in matches:
            x, y = match.point_a
            xp_pred = a * x + b * y + c
            yp_pred = d * x + e * y + f
            xp_true, yp_true = match.point_b
            err = math.sqrt((xp_pred - xp_true) ** 2 + (yp_pred - yp_true) ** 2)
            errors.append(err)

        avg_error = sum(errors) / len(errors)
        result.transform_matrix = M
        result.reprojection_error_pts = avg_error
        # Reliable if error < 5px and we have enough matches
        result.is_reliable = avg_error < 5.0 and len(matches) >= MIN_GRID_LABELS_FOR_HOMOGRAPHY

        if not result.is_reliable and avg_error >= 5.0:
            result.errors.append(
                f"Reprojection error {avg_error:.1f}pts exceeds 5pt threshold. "
                f"Homography may be unreliable."
            )

    except Exception as e:
        result.errors.append(f"Homography computation failed: {type(e).__name__}: {e}")
        logger.warning(f"compute_homography failed: {e}")

    return result


def project_point(
    point: Tuple[float, float],
    homography: HomographyResult
) -> Optional[Tuple[float, float]]:
    """
    Project a point from sheet A coordinates to sheet B coordinates
    using the computed homography.

    Args:
        point: (x, y) in sheet A coordinate space
        homography: HomographyResult with a valid transform_matrix

    Returns:
        (x, y) in sheet B coordinate space, or None if projection failed
    """
    if homography.transform_matrix is None:
        return None

    try:
        M = homography.transform_matrix
        x, y = point
        xp = M[0, 0] * x + M[0, 1] * y + M[0, 2]
        yp = M[1, 0] * x + M[1, 1] * y + M[1, 2]
        return (xp, yp)
    except Exception as e:
        logger.warning(f"project_point failed: {e}")
        return None


# ── Cross-Sheet Confirmation ──────────────────────────────────────────────────

def check_opening_at_location(
    x: float,
    y: float,
    labels: List[GridLabel],
    tolerance: float = GRID_MATCH_TOLERANCE_PTS
) -> bool:
    """
    Check if a grid label or opening indicator exists near a projected location.

    This is a simplified check: we look for any detected grid label
    within tolerance of the projected point. A full implementation would
    check for void/opening geometry in the floor plan graph, but that
    requires Layer 2 output from the floor plan sheet.

    Args:
        x, y: Projected coordinates on target sheet
        labels: Detected grid labels on the target sheet
        tolerance: Search radius in PDF points

    Returns:
        True if a label or opening indicator is found near (x, y)
    """
    for label in labels:
        dist = math.sqrt((label.x - x) ** 2 + (label.y - y) ** 2)
        if dist <= tolerance:
            return True
    return False


def apply_cross_sheet_confidence(
    candidates: List[dict],
    confirmed_ids: List[str],
    flagged_ids: List[str]
) -> List[dict]:
    """
    Apply confidence adjustments to glazing candidates based on
    cross-sheet confirmation results.

    Args:
        candidates: List of candidate dicts with 'candidate_id' and 'confidence'
        confirmed_ids: Candidate IDs confirmed in 2+ views (boost)
        flagged_ids: Candidate IDs only seen in 1 view (penalty)

    Returns:
        Updated list of candidates with adjusted confidence values
    """
    confirmed_set = set(confirmed_ids)
    flagged_set = set(flagged_ids)

    updated = []
    for candidate in candidates:
        cid = candidate.get('candidate_id', '')
        conf = candidate.get('confidence', 0.0)

        if cid in confirmed_set:
            candidate['confidence'] = min(1.0, conf + MULTI_VIEW_CONFIDENCE_BOOST)
            candidate['cross_sheet_status'] = 'confirmed'
        elif cid in flagged_set:
            candidate['confidence'] = max(0.0, conf - SINGLE_VIEW_CONFIDENCE_PENALTY)
            candidate['cross_sheet_status'] = 'single_view'
        else:
            candidate['cross_sheet_status'] = 'unverified'

        updated.append(candidate)

    return updated


# ── Main Entry Points ─────────────────────────────────────────────────────────

def sync_sheets(
    page_a: fitz.Page,
    page_b: fitz.Page,
    sheet_a_id: str = "elevation",
    sheet_b_id: str = "floor_plan"
) -> HomographyResult:
    """
    Compute the spatial correspondence between two drawing sheets
    using grid label matching.

    Args:
        page_a: Primary sheet (typically elevation)
        page_b: Secondary sheet (typically floor plan)
        sheet_a_id: Label for sheet A
        sheet_b_id: Label for sheet B

    Returns:
        HomographyResult — never raises
    """
    try:
        labels_a = detect_grid_labels(page_a, sheet_id=sheet_a_id)
        labels_b = detect_grid_labels(page_b, sheet_id=sheet_b_id)

        if not labels_a:
            result = HomographyResult(
                transform_matrix=None,
                matched_labels=[],
                reprojection_error_pts=float('inf'),
                is_reliable=False,
                sheet_a_id=sheet_a_id,
                sheet_b_id=sheet_b_id
            )
            result.errors.append(f"No grid labels detected on sheet {sheet_a_id}")
            return result

        if not labels_b:
            result = HomographyResult(
                transform_matrix=None,
                matched_labels=[],
                reprojection_error_pts=float('inf'),
                is_reliable=False,
                sheet_a_id=sheet_a_id,
                sheet_b_id=sheet_b_id
            )
            result.errors.append(f"No grid labels detected on sheet {sheet_b_id}")
            return result

        matches = match_grid_labels(labels_a, labels_b)
        return compute_homography(matches, sheet_a_id, sheet_b_id)

    except Exception as e:
        result = HomographyResult(
            transform_matrix=None,
            matched_labels=[],
            reprojection_error_pts=float('inf'),
            is_reliable=False,
            sheet_a_id=sheet_a_id,
            sheet_b_id=sheet_b_id
        )
        result.errors.append(f"sync_sheets failed: {type(e).__name__}: {e}")
        return result


def sync_sheets_from_paths(
    pdf_path_a: str,
    page_num_a: int,
    pdf_path_b: str,
    page_num_b: int,
    sheet_a_id: str = "elevation",
    sheet_b_id: str = "floor_plan"
) -> HomographyResult:
    """
    Convenience wrapper: sync two sheets directly from PDF file paths.

    Args:
        pdf_path_a: Path to first PDF
        page_num_a: Page number in first PDF
        pdf_path_b: Path to second PDF (can be same PDF)
        page_num_b: Page number in second PDF
        sheet_a_id: Label for sheet A
        sheet_b_id: Label for sheet B

    Returns:
        HomographyResult — never raises
    """
    try:
        doc_a = fitz.open(pdf_path_a)
        doc_b = fitz.open(pdf_path_b)

        if page_num_a >= len(doc_a):
            result = HomographyResult(None, [], float('inf'), False, sheet_a_id, sheet_b_id)
            result.errors.append(f"Page {page_num_a} not in {pdf_path_a}")
            return result

        if page_num_b >= len(doc_b):
            result = HomographyResult(None, [], float('inf'), False, sheet_a_id, sheet_b_id)
            result.errors.append(f"Page {page_num_b} not in {pdf_path_b}")
            return result

        result = sync_sheets(
            doc_a[page_num_a], doc_b[page_num_b],
            sheet_a_id, sheet_b_id
        )
        doc_a.close()
        doc_b.close()
        return result

    except FileNotFoundError as e:
        result = HomographyResult(None, [], float('inf'), False, sheet_a_id, sheet_b_id)
        result.errors.append(f"File not found: {e}")
        return result
    except Exception as e:
        result = HomographyResult(None, [], float('inf'), False, sheet_a_id, sheet_b_id)
        result.errors.append(f"sync_sheets_from_paths failed: {e}")
        return result
