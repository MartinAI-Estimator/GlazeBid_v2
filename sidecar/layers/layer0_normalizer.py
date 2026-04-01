"""
layer0_normalizer.py

Layer 0: PDF Normalization Pipeline

Runs before all other layers. Strips architectural drawing style noise so the
rule engine sees consistent geometry regardless of firm drafting conventions.

Normalization is sheet-type conditional:
- elevation:   Full normalization. Uniform stroke weight. Text paths filtered.
- floor_plan:  Partial normalization. Relative weights preserved.
- detail:      No normalization. All attributes preserved.
- schedule:    No normalization. Text-dominant sheets.
- unknown:     No normalization. Pass through unchanged.

The Sheet Router (Layer 1) determines sheet type before this layer runs.
This layer never raises exceptions — errors are logged and empty list returned.
"""

import math
import logging
from dataclasses import dataclass, field
from typing import List, Tuple, Optional

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

UNIFORM_STROKE_WIDTH = 0.5      # All elevation edges normalized to this weight
MIN_STROKE_WIDTH = 0.25         # Floor plan normalization lower bound
MAX_STROKE_WIDTH = 2.0          # Floor plan normalization upper bound
IQ_TEXT_THRESHOLD = 0.30        # Isoperimetric quotient below this = likely text
MAX_SEGMENT_COUNT_TEXT = 8      # More segments than this = likely text character
MIN_SEGMENT_LENGTH = 2.0        # Segments shorter than this are noise (points)


# ── Data Structures ───────────────────────────────────────────────────────────

@dataclass
class NormalizedPath:
    """
    A single drawing path after normalization.
    All style attributes stripped. Only geometry and normalized weight remain.
    """
    segments: List[Tuple[Tuple[float, float], Tuple[float, float]]]
    stroke_width: float
    sheet_type: str


# ── Text Path Detection ───────────────────────────────────────────────────────

def _shoelace_area(points: List[Tuple[float, float]]) -> float:
    """
    Compute signed area of a polygon using the shoelace formula.
    Returns absolute value (unsigned area).
    """
    n = len(points)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += points[i][0] * points[j][1]
        area -= points[j][0] * points[i][1]
    return abs(area) / 2.0


def _perimeter(points: List[Tuple[float, float]]) -> float:
    """Compute perimeter of a polygon."""
    n = len(points)
    if n < 2:
        return 0.0
    total = 0.0
    for i in range(n):
        j = (i + 1) % n
        dx = points[j][0] - points[i][0]
        dy = points[j][1] - points[i][1]
        total += math.sqrt(dx * dx + dy * dy)
    return total


def _isoperimetric_quotient(points: List[Tuple[float, float]]) -> float:
    """
    Compute the isoperimetric quotient: IQ = (4 * pi * area) / (perimeter^2)
    
    Perfect circle = 1.0
    Square = 0.785
    Glass lite (rectangle) = 0.5 to 0.785
    Letter forms (I, L, T, H) = 0.05 to 0.25
    
    Returns 0.0 if perimeter is zero (degenerate shape).
    """
    area = _shoelace_area(points)
    perim = _perimeter(points)
    if perim < 1e-9:
        return 0.0
    return (4.0 * math.pi * area) / (perim * perim)


def is_text_path(path: dict) -> bool:
    """
    Returns True if this drawing path is likely a text character.

    Uses three conditions — any one being True classifies as text:

    1. Segment count > MAX_SEGMENT_COUNT_TEXT (complex = likely ornate letter)
    2. Bounding box aspect ratio: width/height < 0.2 or > 5.0
       (extremely narrow or wide shapes that are not glazing geometry)
    3. Isoperimetric quotient < IQ_TEXT_THRESHOLD
       This is the primary filter for simple letter forms I, L, T, H which
       have very low enclosed area relative to their perimeter.

    Args:
        path: A drawing path dict from fitz page.get_drawings()

    Returns:
        True if the path should be discarded as a text artifact
    """
    items = path.get("items", [])

    # Count line segments only
    segment_count = sum(1 for item in items if item[0] == "l")

    # Condition 1: Too many segments
    if segment_count > MAX_SEGMENT_COUNT_TEXT:
        return True

    # Extract all line endpoints for geometry analysis
    points = []
    for item in items:
        if item[0] == "l":
            p1, p2 = item[1], item[2]
            points.append((p1.x, p1.y))
            points.append((p2.x, p2.y))

    if len(points) < 4:
        return False  # Too few points to analyze — keep it

    # Compute bounding box
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    width = max(xs) - min(xs)
    height = max(ys) - min(ys)

    # Condition 2: Extreme aspect ratio
    if height > 1e-6:
        ratio = width / height
        if ratio < 0.2 or ratio > 5.0:
            return True

    # Condition 3: Isoperimetric quotient (primary filter for I, L, T, H)
    # Use unique points for a cleaner polygon approximation
    unique_points = list(dict.fromkeys(points))  # preserve order, remove dups
    if len(unique_points) >= 3:
        iq = _isoperimetric_quotient(unique_points)
        if iq < IQ_TEXT_THRESHOLD:
            return True

    return False


# ── Normalization Functions ───────────────────────────────────────────────────

def _extract_line_segments(
    path: dict
) -> List[Tuple[Tuple[float, float], Tuple[float, float]]]:
    """
    Extract (p1, p2) line segment tuples from a fitz drawing path.
    Filters out segments shorter than MIN_SEGMENT_LENGTH (noise).
    """
    segments = []
    for item in path.get("items", []):
        if item[0] == "l":
            p1, p2 = item[1], item[2]
            x1, y1 = p1.x, p1.y
            x2, y2 = p2.x, p2.y
            length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if length >= MIN_SEGMENT_LENGTH:
                segments.append(((x1, y1), (x2, y2)))
    return segments


def normalize_elevation(page: fitz.Page) -> List[NormalizedPath]:
    """
    Full normalization for elevation sheets.

    - Extracts all vector drawing paths
    - Filters out text paths using is_text_path()
    - Sets all stroke widths to UNIFORM_STROKE_WIDTH (0.5pt)
    - Discards fill colors, dash patterns, and all style attributes
    - Returns only geometry as NormalizedPath objects

    Args:
        page: A fitz.Page object

    Returns:
        List of NormalizedPath objects. Empty list on any error.
    """
    try:
        drawings = page.get_drawings()
        result = []
        for d in drawings:
            # Skip text-like paths
            if is_text_path(d):
                continue
            segments = _extract_line_segments(d)
            if not segments:
                continue
            result.append(NormalizedPath(
                segments=segments,
                stroke_width=UNIFORM_STROKE_WIDTH,
                sheet_type="elevation"
            ))
        return result
    except Exception as e:
        logger.warning(f"normalize_elevation failed: {e}")
        return []


def normalize_floorplan(page: fitz.Page) -> List[NormalizedPath]:
    """
    Partial normalization for floor plan sheets.

    - Preserves all paths including text areas (needed for room label OCR)
    - Normalizes stroke widths to [MIN_STROKE_WIDTH, MAX_STROKE_WIDTH] range
      using min-max scaling to preserve relative weight ratios
    - Discards fill colors and dash patterns only

    Args:
        page: A fitz.Page object

    Returns:
        List of NormalizedPath objects. Empty list on any error.
    """
    try:
        drawings = page.get_drawings()
        if not drawings:
            return []

        # Collect all stroke widths for normalization
        widths = [d.get("width", 1.0) for d in drawings if d.get("width", 0) > 0]
        if not widths:
            return []

        w_min = min(widths)
        w_max = max(widths)
        w_range = w_max - w_min if w_max > w_min else 1.0

        result = []
        for d in drawings:
            segments = _extract_line_segments(d)
            if not segments:
                continue

            raw_width = d.get("width", 1.0)
            # Min-max normalize to [MIN_STROKE_WIDTH, MAX_STROKE_WIDTH]
            normalized_width = MIN_STROKE_WIDTH + (
                (raw_width - w_min) / w_range
            ) * (MAX_STROKE_WIDTH - MIN_STROKE_WIDTH)

            result.append(NormalizedPath(
                segments=segments,
                stroke_width=normalized_width,
                sheet_type="floor_plan"
            ))
        return result
    except Exception as e:
        logger.warning(f"normalize_floorplan failed: {e}")
        return []


def normalize_page(page: fitz.Page, sheet_type: str) -> List[NormalizedPath]:
    """
    Router function. Applies the correct normalization based on sheet type.

    Sheet type routing:
        elevation  → normalize_elevation() — full normalization
        floor_plan → normalize_floorplan() — partial normalization
        all others → raw paths as NormalizedPath, no modification

    Args:
        page: A fitz.Page object
        sheet_type: One of 'elevation', 'floor_plan', 'detail', 'schedule', 'unknown'

    Returns:
        List of NormalizedPath objects. Never raises — returns empty list on error.
    """
    try:
        if sheet_type == "elevation":
            return normalize_elevation(page)
        elif sheet_type == "floor_plan":
            return normalize_floorplan(page)
        else:
            # Pass-through: extract segments without modification
            drawings = page.get_drawings()
            result = []
            for d in drawings:
                segments = _extract_line_segments(d)
                if segments:
                    result.append(NormalizedPath(
                        segments=segments,
                        stroke_width=d.get("width", 1.0),
                        sheet_type=sheet_type
                    ))
            return result
    except Exception as e:
        logger.warning(f"normalize_page failed for sheet_type={sheet_type}: {e}")
        return []
