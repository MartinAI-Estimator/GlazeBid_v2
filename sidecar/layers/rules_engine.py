"""
rules_engine.py

Rules-Based Glazing Detection Engine

Applies a battery of physical glazing constraints to the vector graph
produced by Layer 2 and returns GlazingCandidate objects.

Architecture:
    Tier 1 — Necessary conditions. Any failure eliminates the candidate.
    Tier 2 — Strong indicators. Each pass adds to the confidence score.
    Tier 3 — System classification. Applied after candidate is confirmed.

Confidence scoring:
    Candidates pass Tier 1 (or are rejected).
    Each Tier 2 rule that passes adds its weight to the score.
    auto_accepted:  confidence >= 0.70
    needs_review:   confidence 0.50 - 0.69
    rejected:       confidence < 0.50

Physical constants used:
    Glass width:  6" minimum, 120" maximum (manufactured glass limits)
    Glass height: 6" minimum, 216" maximum
    Parallelism:  opposing edges within 2 degrees (dot product >= 0.9994)
    Rectangularity: interior angles within 5 degrees of 90°
    Periodicity:  bay spacing consistent within 5%

All functions are deterministic. No randomness. No model inference.
This module never raises exceptions — errors returned in candidate fields.
"""

import math
import logging
from dataclasses import dataclass, field
from typing import List, Tuple, Optional, Dict, Any

logger = logging.getLogger(__name__)

# ── Physical Constants ────────────────────────────────────────────────────────

GLASS_MIN_WIDTH_IN   = 6.0    # inches — minimum manufacturable glass width
GLASS_MAX_WIDTH_IN   = 120.0  # inches — maximum standard glass width
GLASS_MIN_HEIGHT_IN  = 6.0    # inches
GLASS_MAX_HEIGHT_IN  = 216.0  # inches — 18 feet max for structural glazing

PARALLELISM_DOT_MIN  = 0.9994 # cos(2°) — opposing edges must be this parallel
RECTANGULARITY_DEG   = 5.0    # interior angles must be within 5° of 90°
PERIODICITY_VARIANCE = 0.05   # bay spacing must be consistent within 5%

# Tier 2 confidence weights
WEIGHT_PARALLELISM   = 0.20
WEIGHT_PERIODICITY   = 0.15
WEIGHT_SYMMETRY      = 0.10
WEIGHT_CONTINUITY    = 0.15

AUTO_ACCEPT_THRESHOLD = 0.70
NEEDS_REVIEW_THRESHOLD = 0.50

# System classification thresholds (in feet)
CW_MIN_WIDTH_FT  = 20.0  # curtain wall: wider than 20ft
CW_MIN_HEIGHT_FT = 8.0   # curtain wall: taller than 8ft
SF_MIN_WIDTH_FT  = 0.5   # storefront: wider than 0.5ft
SF_MAX_WIDTH_FT  = 20.0  # storefront: narrower than 20ft


# ── Data Structures ───────────────────────────────────────────────────────────

@dataclass
class Rect:
    """Axis-aligned bounding rectangle in drawing units (PDF points)."""
    x: float       # left edge
    y: float       # top edge
    width: float   # horizontal extent
    height: float  # vertical extent

    @property
    def x_max(self) -> float:
        return self.x + self.width

    @property
    def y_max(self) -> float:
        return self.y + self.height

    @property
    def center(self) -> Tuple[float, float]:
        return (self.x + self.width / 2, self.y + self.height / 2)

    @property
    def area(self) -> float:
        return self.width * self.height


@dataclass
class GlazingCandidate:
    """
    A detected glazing assembly candidate.

    Every field has a job. rules_passed and rules_failed make the
    confidence score explainable to a skeptical estimator.
    """
    candidate_id: str
    bounding_box: Rect

    # Dimensions
    width_pts: float           # in PDF points
    height_pts: float
    width_inches: float        # after scale calibration (0 if unknown)
    height_inches: float

    # Scale tracking
    scale_factor: float        # pts per inch used for conversion
    scale_confidence: float    # 0.0 = unknown

    # Structure
    bay_count: int             # detected vertical divisions
    row_count: int             # detected horizontal divisions

    # Scoring
    confidence: float          # 0.0 - 1.0
    rules_passed: List[str]    # which rules contributed positively
    rules_failed: List[str]    # which rules rejected or warned

    # Classification
    system_hint: str           # storefront|curtain_wall|window_wall|unknown
    source_sheet: str

    # Cross-sheet (populated by Layer 9 if available)
    cross_references: List[str] = field(default_factory=list)
    cross_sheet_status: str = "unverified"

    # Status
    status: str = "needs_review"   # auto_accepted|needs_review|rejected

    # Debug
    debug_info: Dict[str, Any] = field(default_factory=dict)


# ── Geometry Helpers ──────────────────────────────────────────────────────────

def _angle_between_vectors(
    v1: Tuple[float, float],
    v2: Tuple[float, float]
) -> float:
    """
    Compute the angle in degrees between two 2D vectors.
    Returns 0-180 degrees.
    """
    dot = v1[0] * v2[0] + v1[1] * v2[1]
    mag1 = math.sqrt(v1[0] ** 2 + v1[1] ** 2)
    mag2 = math.sqrt(v2[0] ** 2 + v2[1] ** 2)
    if mag1 < 1e-9 or mag2 < 1e-9:
        return 0.0
    cos_angle = max(-1.0, min(1.0, dot / (mag1 * mag2)))
    return math.degrees(math.acos(cos_angle))


def _unit_vector(v: Tuple[float, float]) -> Tuple[float, float]:
    """Normalize a 2D vector to unit length."""
    mag = math.sqrt(v[0] ** 2 + v[1] ** 2)
    if mag < 1e-9:
        return (0.0, 0.0)
    return (v[0] / mag, v[1] / mag)


def _dot_product(
    v1: Tuple[float, float],
    v2: Tuple[float, float]
) -> float:
    """Dot product of two 2D vectors."""
    return v1[0] * v2[0] + v1[1] * v2[1]


# ── Candidate Extraction from Graph ──────────────────────────────────────────

def find_rectangular_regions(
    x: List[List[float]],
    edge_index: List[List[int]],
    edge_attr: List[List[float]],
    min_area_pts: float = 100.0,
    max_area_pts: float = 5_000_000.0
) -> List[Rect]:
    """
    Find rectangular bounding regions in the vector graph.

    Strategy: Cluster nodes into rectangular groups using axis-aligned
    bounding boxes. Groups of 4+ nodes forming approximate rectangles
    with consistent edge lengths are candidate glazing regions.

    This is a simplified approach that finds rectangular clusters.
    A full implementation would trace closed polygon cycles in the graph.

    Args:
        x: Node coordinates [N, 2]
        edge_index: Edge connectivity [2, E]
        edge_attr: Edge attributes [E, 4]: [length, width, dx, dy]
        min_area_pts: Minimum candidate area in pts²
        max_area_pts: Maximum candidate area in pts²

    Returns:
        List of Rect objects representing candidate regions.
    """
    if not x or not edge_index or not edge_index[0]:
        return []

    candidates = []

    try:
        # Find predominantly horizontal and vertical edges
        h_edges = []  # horizontal edges (|dy| < |dx|)
        v_edges = []  # vertical edges (|dy| >= |dx|)

        src_nodes = edge_index[0]
        dst_nodes = edge_index[1]

        for i, (u, v) in enumerate(zip(src_nodes, dst_nodes)):
            if u >= len(x) or v >= len(x):
                continue

            attr = edge_attr[i] if i < len(edge_attr) else [0, 0, 0, 0]
            dx = attr[2]  # unit_dx
            dy = attr[3]  # unit_dy
            length = attr[0]

            if length < 10.0:  # Skip very short edges
                continue

            if abs(dx) > abs(dy):
                h_edges.append((u, v, length, x[u], x[v]))
            else:
                v_edges.append((u, v, length, x[u], x[v]))

        # Group nodes by proximity into clusters
        # Each cluster is a potential glazing bay
        if not h_edges and not v_edges:
            return []

        # Build axis-aligned bounding boxes from connected horizontal edge groups
        # Group horizontal edges by similar Y coordinates (within 5pt tolerance)
        y_tolerance = 5.0
        h_groups: Dict[int, List] = {}

        for u, v, length, pu, pv in h_edges:
            y_key = int(pu[1] / y_tolerance)
            if y_key not in h_groups:
                h_groups[y_key] = []
            h_groups[y_key].append((u, v, length, pu, pv))

        # For each pair of horizontal edge rows, look for a rectangle
        y_keys = sorted(h_groups.keys())
        for i in range(len(y_keys)):
            for j in range(i + 1, min(i + 10, len(y_keys))):
                top_group = h_groups[y_keys[i]]
                bot_group = h_groups[y_keys[j]]

                # Find X overlap between top and bottom edge groups
                top_xs = []
                for _, _, _, pu, pv in top_group:
                    top_xs.extend([pu[0], pv[0]])
                bot_xs = []
                for _, _, _, pu, pv in bot_group:
                    bot_xs.extend([pu[0], pv[0]])

                if not top_xs or not bot_xs:
                    continue

                x_min = max(min(top_xs), min(bot_xs))
                x_max = min(max(top_xs), max(bot_xs))

                if x_max <= x_min:
                    continue

                top_y = sum(pu[1] for _, _, _, pu, _ in top_group) / len(top_group)
                bot_y = sum(pu[1] for _, _, _, pu, _ in bot_group) / len(bot_group)

                if bot_y <= top_y:
                    continue

                rect = Rect(
                    x=x_min,
                    y=top_y,
                    width=x_max - x_min,
                    height=bot_y - top_y
                )

                area = rect.area
                if min_area_pts <= area <= max_area_pts:
                    candidates.append(rect)

    except Exception as e:
        logger.warning(f"find_rectangular_regions failed: {e}")

    return candidates


def _detect_bays(
    rect: Rect,
    x: List[List[float]],
    edge_index: List[List[int]],
    edge_attr: List[List[float]]
) -> int:
    """
    Count vertical divisions (bays) within a rectangular region.

    Looks for vertical edges that span the full height of the rect
    and fall within its horizontal bounds.
    """
    try:
        src_nodes = edge_index[0]
        dst_nodes = edge_index[1]
        bay_lines = set()

        for i, (u, v) in enumerate(zip(src_nodes, dst_nodes)):
            if u >= len(x) or v >= len(x):
                continue
            attr = edge_attr[i] if i < len(edge_attr) else [0, 0, 0, 0]
            dx = attr[2]
            dy = attr[3]

            # Must be predominantly vertical
            if abs(dy) < abs(dx):
                continue

            pu = x[u]
            pv = x[v]

            # Must be within horizontal bounds of rect
            mid_x = (pu[0] + pv[0]) / 2
            if not (rect.x <= mid_x <= rect.x_max):
                continue

            # Must span significant portion of rect height
            span_y = abs(pv[1] - pu[1])
            if span_y < rect.height * 0.5:
                continue

            # Bucket by X position to count unique vertical lines
            bay_lines.add(int(mid_x / 5))

        return max(1, len(bay_lines) - 1) if len(bay_lines) > 1 else 1

    except Exception as e:
        logger.warning(f"_detect_bays failed: {e}")
        return 1


# ── Tier 1: Necessary Conditions ─────────────────────────────────────────────

def check_closure(rect: Rect) -> Tuple[bool, str]:
    """
    T1.1 Closure: Candidate must have positive width and height.
    A degenerate or zero-area rect fails closure.
    """
    if rect.width < 1.0 or rect.height < 1.0:
        return False, "T1.1_closure: degenerate rectangle (width or height < 1pt)"
    return True, "T1.1_closure"


def check_rectangularity(rect: Rect) -> Tuple[bool, str]:
    """
    T1.2 Rectangularity: Bounding box is inherently rectangular.
    For future: check that actual polygon corners are near 90°.
    Currently validates that aspect ratio is within glazing norms.

    Extreme aspect ratios (> 50:1) suggest a dimension line, not a frame.
    """
    aspect = rect.width / rect.height if rect.height > 0 else 0
    if aspect > 50.0 or aspect < 0.02:
        return False, f"T1.2_rectangularity: extreme aspect ratio {aspect:.1f}"
    return True, "T1.2_rectangularity"


def check_dimensional_feasibility(
    rect: Rect,
    scale_factor: float,
    scale_confidence: float
) -> Tuple[bool, str]:
    """
    T1.3 Dimensional Feasibility: Width and height must be within
    physically manufacturable glass ranges.

    ONLY applied when scale_confidence >= 0.5.
    If scale is unknown, this check is skipped (returns pass with warning).
    """
    if scale_confidence < 0.5:
        return True, "T1.3_dimension_skipped_low_scale_confidence"

    if scale_factor <= 0:
        return True, "T1.3_dimension_skipped_zero_scale"

    width_in = rect.width / scale_factor
    height_in = rect.height / scale_factor

    if width_in < GLASS_MIN_WIDTH_IN:
        return False, f"T1.3_dimension: width {width_in:.1f}\" below minimum {GLASS_MIN_WIDTH_IN}\""
    if width_in > GLASS_MAX_WIDTH_IN:
        return False, f"T1.3_dimension: width {width_in:.1f}\" above maximum {GLASS_MAX_WIDTH_IN}\""
    if height_in < GLASS_MIN_HEIGHT_IN:
        return False, f"T1.3_dimension: height {height_in:.1f}\" below minimum {GLASS_MIN_HEIGHT_IN}\""
    if height_in > GLASS_MAX_HEIGHT_IN:
        return False, f"T1.3_dimension: height {height_in:.1f}\" above maximum {GLASS_MAX_HEIGHT_IN}\""

    return True, "T1.3_dimensional_feasibility"


def check_orientation(rect: Rect) -> Tuple[bool, str]:
    """
    T1.4 Enclosure Orientation: Candidate must have discernible
    head (top), sill (bottom), and jamb (sides).
    Degenerate squares are flagged — most glazing is taller than wide
    OR in a clear run of similar elements.
    """
    if rect.width < 1.0 or rect.height < 1.0:
        return False, "T1.4_orientation: degenerate dimensions"
    return True, "T1.4_orientation"


# ── Tier 2: Strong Indicators ─────────────────────────────────────────────────

def check_parallelism(
    rect: Rect,
    x: List[List[float]],
    edge_index: List[List[int]],
    edge_attr: List[List[float]]
) -> Tuple[bool, str, float]:
    """
    T2.1 Parallelism: Edges within the candidate region should be
    predominantly horizontal or vertical (parallel to the frame axes).

    Returns (passed, rule_name, confidence_delta)
    """
    try:
        src_nodes = edge_index[0]
        dst_nodes = edge_index[1]
        total = 0
        aligned = 0

        for i, (u, v) in enumerate(zip(src_nodes, dst_nodes)):
            if u >= len(x) or v >= len(x):
                continue
            pu = x[u]
            pv = x[v]

            # Only look at edges within or near this rect
            mid_x = (pu[0] + pv[0]) / 2
            mid_y = (pu[1] + pv[1]) / 2
            if not (rect.x - 5 <= mid_x <= rect.x_max + 5 and
                    rect.y - 5 <= mid_y <= rect.y_max + 5):
                continue

            attr = edge_attr[i] if i < len(edge_attr) else [0, 0, 0, 0]
            dx = attr[2]
            dy = attr[3]
            total += 1

            # Aligned if predominantly horizontal or vertical
            if abs(dx) > 0.9 or abs(dy) > 0.9:  # within ~26° of axis
                aligned += 1

        if total == 0:
            return True, "T2.1_parallelism_no_edges", 0.0

        ratio = aligned / total
        if ratio >= 0.80:
            return True, "T2.1_parallelism", WEIGHT_PARALLELISM
        else:
            return False, f"T2.1_parallelism_failed ({ratio:.0%} aligned)", 0.0

    except Exception as e:
        logger.warning(f"check_parallelism failed: {e}")
        return False, "T2.1_parallelism_error", 0.0


def check_periodicity(
    candidates: List[Rect],
    current_rect: Rect
) -> Tuple[bool, str, float]:
    """
    T2.2 Periodicity: If multiple similar-sized candidates exist on the
    same row, their center-to-center spacing should be consistent
    within PERIODICITY_VARIANCE (5%).

    Args:
        candidates: All candidates found on this sheet (for comparison)
        current_rect: The candidate being evaluated
    """
    try:
        # Find candidates on the same row (similar Y center)
        cy = current_rect.center[1]
        row_mates = [
            r for r in candidates
            if abs(r.center[1] - cy) < current_rect.height * 0.3
            and r is not current_rect
        ]

        if len(row_mates) < 2:
            # Not enough siblings to evaluate periodicity
            return True, "T2.2_periodicity_insufficient_siblings", 0.0

        # Compute center-to-center spacings
        all_centers = sorted(
            [r.center[0] for r in row_mates] + [current_rect.center[0]]
        )
        spacings = [all_centers[i + 1] - all_centers[i]
                    for i in range(len(all_centers) - 1)]

        if not spacings:
            return True, "T2.2_periodicity_no_spacings", 0.0

        mean_spacing = sum(spacings) / len(spacings)
        if mean_spacing < 1.0:
            return True, "T2.2_periodicity_zero_spacing", 0.0

        variance = max(abs(s - mean_spacing) / mean_spacing for s in spacings)

        if variance <= PERIODICITY_VARIANCE:
            return True, "T2.2_periodicity", WEIGHT_PERIODICITY
        else:
            return False, (
                f"T2.2_periodicity_failed (variance={variance:.0%}, "
                f"threshold={PERIODICITY_VARIANCE:.0%})"
            ), 0.0

    except Exception as e:
        logger.warning(f"check_periodicity failed: {e}")
        return False, "T2.2_periodicity_error", 0.0


def check_profile_symmetry(
    rect: Rect,
    x: List[List[float]],
    edge_index: List[List[int]],
    edge_attr: List[List[float]]
) -> Tuple[bool, str, float]:
    """
    T2.3 Profile Symmetry: Head and sill (horizontal boundaries) should
    be mirror images. Jambs (vertical boundaries) should be mirror images.

    Simplified check: count horizontal edges near the top and bottom
    of the candidate. Similar counts suggest symmetric framing.
    """
    try:
        src_nodes = edge_index[0]
        dst_nodes = edge_index[1]

        top_zone = rect.height * 0.15
        bot_zone = rect.height * 0.15

        top_edges = 0
        bot_edges = 0
        left_edges = 0
        right_edges = 0
        width_zone = rect.width * 0.15

        for i, (u, v) in enumerate(zip(src_nodes, dst_nodes)):
            if u >= len(x) or v >= len(x):
                continue
            pu = x[u]
            pv = x[v]
            mid_x = (pu[0] + pv[0]) / 2
            mid_y = (pu[1] + pv[1]) / 2

            if not (rect.x <= mid_x <= rect.x_max and
                    rect.y <= mid_y <= rect.y_max):
                continue

            attr = edge_attr[i] if i < len(edge_attr) else [0, 0, 0, 0]
            dx = abs(attr[2])
            dy = abs(attr[3])

            if dx > dy:  # horizontal edge
                if mid_y - rect.y < top_zone:
                    top_edges += 1
                elif rect.y_max - mid_y < bot_zone:
                    bot_edges += 1
            else:  # vertical edge
                if mid_x - rect.x < width_zone:
                    left_edges += 1
                elif rect.x_max - mid_x < width_zone:
                    right_edges += 1

        # Check symmetry: counts should be roughly similar
        h_symmetric = (
            top_edges > 0 and bot_edges > 0 and
            abs(top_edges - bot_edges) <= max(2, (top_edges + bot_edges) // 3)
        )
        v_symmetric = (
            left_edges > 0 and right_edges > 0 and
            abs(left_edges - right_edges) <= max(2, (left_edges + right_edges) // 3)
        )

        if h_symmetric and v_symmetric:
            return True, "T2.3_profile_symmetry", WEIGHT_SYMMETRY
        elif h_symmetric or v_symmetric:
            return True, "T2.3_profile_symmetry_partial", WEIGHT_SYMMETRY / 2
        else:
            return False, "T2.3_profile_symmetry_failed", 0.0

    except Exception as e:
        logger.warning(f"check_profile_symmetry failed: {e}")
        return False, "T2.3_profile_symmetry_error", 0.0


def check_mullion_continuity(
    rect: Rect,
    x: List[List[float]],
    edge_index: List[List[int]],
    edge_attr: List[List[float]]
) -> Tuple[bool, str, float]:
    """
    T2.4 Mullion Continuity: Interior vertical lines should be continuous
    from head to sill without breaks.

    Check: for each detected vertical line position, verify that
    edges at that X position span at least 60% of the rect height.
    """
    try:
        src_nodes = edge_index[0]
        dst_nodes = edge_index[1]

        # Collect vertical edges within the rect
        v_edge_groups: Dict[int, List[float]] = {}  # x_bucket → list of Y spans

        for i, (u, v) in enumerate(zip(src_nodes, dst_nodes)):
            if u >= len(x) or v >= len(x):
                continue
            pu = x[u]
            pv = x[v]

            mid_x = (pu[0] + pv[0]) / 2
            mid_y = (pu[1] + pv[1]) / 2

            if not (rect.x < mid_x < rect.x_max and
                    rect.y <= mid_y <= rect.y_max):
                continue

            attr = edge_attr[i] if i < len(edge_attr) else [0, 0, 0, 0]
            dx = abs(attr[2])
            dy = abs(attr[3])

            if dy <= dx:  # Not vertical enough
                continue

            span = abs(pv[1] - pu[1])
            x_bucket = int(mid_x / 5)

            if x_bucket not in v_edge_groups:
                v_edge_groups[x_bucket] = []
            v_edge_groups[x_bucket].append(span)

        if not v_edge_groups:
            return True, "T2.4_mullion_continuity_no_interior", 0.0

        # Check that most vertical line positions have substantial spans
        min_span = rect.height * 0.60
        continuous = sum(
            1 for spans in v_edge_groups.values()
            if max(spans) >= min_span or sum(spans) >= min_span
        )
        total = len(v_edge_groups)

        if total > 0 and continuous / total >= 0.70:
            return True, "T2.4_mullion_continuity", WEIGHT_CONTINUITY
        else:
            return False, (
                f"T2.4_mullion_continuity_failed "
                f"({continuous}/{total} continuous)"
            ), 0.0

    except Exception as e:
        logger.warning(f"check_mullion_continuity failed: {e}")
        return False, "T2.4_mullion_continuity_error", 0.0


# ── Tier 3: System Classification ────────────────────────────────────────────

def classify_system(
    rect: Rect,
    scale_factor: float,
    scale_confidence: float,
    bay_count: int
) -> str:
    """
    T3.1 / T3.2 System Classification based on dimensions and bay density.

    Returns one of: curtain_wall, storefront, window_wall, unknown
    """
    if scale_confidence < 0.5 or scale_factor <= 0:
        return "unknown"

    width_ft = (rect.width / scale_factor) / 12.0
    height_ft = (rect.height / scale_factor) / 12.0

    # T3.1: Span classification
    if width_ft >= CW_MIN_WIDTH_FT and height_ft >= CW_MIN_HEIGHT_FT:
        return "curtain_wall"

    if SF_MIN_WIDTH_FT <= width_ft <= SF_MAX_WIDTH_FT:
        if height_ft >= 2.0:
            return "storefront"

    if width_ft >= CW_MIN_WIDTH_FT and height_ft < CW_MIN_HEIGHT_FT:
        return "window_wall"

    return "unknown"


# ── Main Engine ───────────────────────────────────────────────────────────────

def run_rules_engine(
    x: List[List[float]],
    edge_index: List[List[int]],
    edge_attr: List[List[float]],
    scale_factor: float = 0.0,
    scale_confidence: float = 0.0,
    source_sheet: str = "",
    min_candidate_area_pts: float = 100.0
) -> List[GlazingCandidate]:
    """
    Main entry point for the Rules-Based Glazing Engine.

    Runs the complete Tier 1 → Tier 2 → Tier 3 pipeline on the
    vector graph from Layer 2.

    Args:
        x: Node coordinates [N, 2] from GraphData
        edge_index: Edge connectivity [2, E] from GraphData
        edge_attr: Edge features [E, 4] from GraphData
        scale_factor: pts per inch (0 = unknown)
        scale_confidence: 0.0-1.0
        source_sheet: Identifier for the source sheet
        min_candidate_area_pts: Minimum bounding box area in pts²

    Returns:
        List of GlazingCandidate objects, sorted by confidence descending.
        Empty list if no candidates found. Never raises.
    """
    candidates_out: List[GlazingCandidate] = []

    try:
        # ── Step 1: Find rectangular regions ──
        rects = find_rectangular_regions(
            x, edge_index, edge_attr,
            min_area_pts=min_candidate_area_pts
        )

        if not rects:
            logger.info(f"No rectangular regions found on sheet '{source_sheet}'")
            return []

        logger.info(f"Found {len(rects)} rectangular regions on '{source_sheet}'")

        # ── Step 2: Apply rules to each candidate ──
        for idx, rect in enumerate(rects):
            candidate_id = f"{source_sheet}_C{idx:04d}"
            rules_passed = []
            rules_failed = []
            confidence = 0.0

            # ── Tier 1: Necessary conditions ──
            ok, rule = check_closure(rect)
            if not ok:
                rules_failed.append(rule)
                # Hard reject — skip to next candidate
                candidates_out.append(GlazingCandidate(
                    candidate_id=candidate_id,
                    bounding_box=rect,
                    width_pts=rect.width,
                    height_pts=rect.height,
                    width_inches=0.0,
                    height_inches=0.0,
                    scale_factor=scale_factor,
                    scale_confidence=scale_confidence,
                    bay_count=1,
                    row_count=1,
                    confidence=0.0,
                    rules_passed=rules_passed,
                    rules_failed=rules_failed,
                    system_hint="unknown",
                    source_sheet=source_sheet,
                    status="rejected"
                ))
                continue
            rules_passed.append(rule)

            ok, rule = check_rectangularity(rect)
            if not ok:
                rules_failed.append(rule)
                candidates_out.append(GlazingCandidate(
                    candidate_id=candidate_id,
                    bounding_box=rect,
                    width_pts=rect.width,
                    height_pts=rect.height,
                    width_inches=0.0,
                    height_inches=0.0,
                    scale_factor=scale_factor,
                    scale_confidence=scale_confidence,
                    bay_count=1,
                    row_count=1,
                    confidence=0.0,
                    rules_passed=rules_passed,
                    rules_failed=rules_failed,
                    system_hint="unknown",
                    source_sheet=source_sheet,
                    status="rejected"
                ))
                continue
            rules_passed.append(rule)

            ok, rule = check_dimensional_feasibility(rect, scale_factor, scale_confidence)
            if not ok:
                rules_failed.append(rule)
                candidates_out.append(GlazingCandidate(
                    candidate_id=candidate_id,
                    bounding_box=rect,
                    width_pts=rect.width,
                    height_pts=rect.height,
                    width_inches=0.0,
                    height_inches=0.0,
                    scale_factor=scale_factor,
                    scale_confidence=scale_confidence,
                    bay_count=1,
                    row_count=1,
                    confidence=0.0,
                    rules_passed=rules_passed,
                    rules_failed=rules_failed,
                    system_hint="unknown",
                    source_sheet=source_sheet,
                    status="rejected"
                ))
                continue
            rules_passed.append(rule)

            ok, rule = check_orientation(rect)
            if not ok:
                rules_failed.append(rule)
                candidates_out.append(GlazingCandidate(
                    candidate_id=candidate_id,
                    bounding_box=rect,
                    width_pts=rect.width,
                    height_pts=rect.height,
                    width_inches=0.0,
                    height_inches=0.0,
                    scale_factor=scale_factor,
                    scale_confidence=scale_confidence,
                    bay_count=1,
                    row_count=1,
                    confidence=0.0,
                    rules_passed=rules_passed,
                    rules_failed=rules_failed,
                    system_hint="unknown",
                    source_sheet=source_sheet,
                    status="rejected"
                ))
                continue
            rules_passed.append(rule)

            # ── Tier 2: Confidence scoring ──
            ok, rule, delta = check_parallelism(rect, x, edge_index, edge_attr)
            if ok:
                confidence += delta
                rules_passed.append(rule)
            else:
                rules_failed.append(rule)

            # Collect all rects for periodicity check
            ok, rule, delta = check_periodicity(rects, rect)
            if ok:
                confidence += delta
                rules_passed.append(rule)
            else:
                rules_failed.append(rule)

            ok, rule, delta = check_profile_symmetry(rect, x, edge_index, edge_attr)
            if ok:
                confidence += delta
                rules_passed.append(rule)
            else:
                rules_failed.append(rule)

            ok, rule, delta = check_mullion_continuity(rect, x, edge_index, edge_attr)
            if ok:
                confidence += delta
                rules_passed.append(rule)
            else:
                rules_failed.append(rule)

            # ── Tier 3: System classification ──
            bay_count = _detect_bays(rect, x, edge_index, edge_attr)
            system_hint = classify_system(rect, scale_factor, scale_confidence, bay_count)

            # ── Compute dimensions in inches ──
            width_inches = 0.0
            height_inches = 0.0
            if scale_factor > 0 and scale_confidence >= 0.5:
                width_inches = rect.width / scale_factor
                height_inches = rect.height / scale_factor

            # ── Determine status ──
            if confidence >= AUTO_ACCEPT_THRESHOLD:
                status = "auto_accepted"
            elif confidence >= NEEDS_REVIEW_THRESHOLD:
                status = "needs_review"
            else:
                status = "rejected"

            candidates_out.append(GlazingCandidate(
                candidate_id=candidate_id,
                bounding_box=rect,
                width_pts=rect.width,
                height_pts=rect.height,
                width_inches=width_inches,
                height_inches=height_inches,
                scale_factor=scale_factor,
                scale_confidence=scale_confidence,
                bay_count=bay_count,
                row_count=1,
                confidence=confidence,
                rules_passed=rules_passed,
                rules_failed=rules_failed,
                system_hint=system_hint,
                source_sheet=source_sheet,
                status=status
            ))

        # Sort by confidence descending
        candidates_out.sort(key=lambda c: c.confidence, reverse=True)
        accepted = sum(1 for c in candidates_out if c.status == "auto_accepted")
        review = sum(1 for c in candidates_out if c.status == "needs_review")
        rejected = sum(1 for c in candidates_out if c.status == "rejected")
        logger.info(
            f"Rules engine: {len(candidates_out)} candidates — "
            f"{accepted} accepted, {review} review, {rejected} rejected"
        )

    except Exception as e:
        logger.exception(f"run_rules_engine failed: {e}")

    return candidates_out
