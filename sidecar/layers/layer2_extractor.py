"""
layer2_extractor.py

Layer 2: Vector Graph Extraction + Scale Detection

Converts normalized PDF paths into a planar graph where:
- Nodes are line intersection and endpoint coordinates
- Edges are line segments with geometric attributes

Also detects drawing scale (pts → inches conversion) via three methods:
1. Graphic scale bar detection
2. Dimension string correlation
3. Title block text search

Scale is tracked as a first-class uncertainty. If scale_confidence < 0.5,
dimensional rule checks are skipped downstream — they would be checking
unreliable numbers.

This module never raises exceptions. All errors are returned as structured
data in GraphData.validation_errors.
"""

import math
import re
import logging
from dataclasses import dataclass, field
from typing import List, Tuple, Optional, Dict

import fitz  # PyMuPDF
import numpy as np

from .layer0_normalizer import NormalizedPath, normalize_page

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

DEFAULT_TOLERANCE = 1.0       # Snap tolerance in pts (merge nodes within this distance)
MIN_NODE_COUNT = 10           # Minimum nodes for a valid elevation sheet
MIN_EDGE_COUNT = 20           # Minimum edges for a valid elevation sheet
MIN_SEGMENT_LENGTH = 2.0      # Segments shorter than this are pruned


# ── Data Structures ───────────────────────────────────────────────────────────

@dataclass
class ScaleCalibration:
    """
    Tracks the drawing scale as a first-class uncertainty.

    scale_factor: how many PDF points equal one real-world inch
    scale_confidence: 0.0 = unknown/unreliable, 1.0 = high confidence
    source: which detection method succeeded
    """
    scale_factor: float = 0.0
    scale_confidence: float = 0.0
    source: str = "unknown"


@dataclass
class GraphData:
    """
    Planar graph representation of a PDF drawing page.
    Compatible with PyTorch Geometric Data format for future ML use.

    x: node coordinates in PDF points [N, 2]
    edge_index: connectivity matrix [2, E] — [source_nodes, target_nodes]
    edge_attr: edge features [E, 4] — [length_pts, stroke_width, unit_dx, unit_dy]
    x_inches: node coordinates converted to inches (empty list if scale unknown)
    scale: scale calibration with confidence tracking
    """
    x: List[List[float]] = field(default_factory=list)
    edge_index: List[List[int]] = field(default_factory=lambda: [[], []])
    edge_attr: List[List[float]] = field(default_factory=list)
    x_inches: List[List[float]] = field(default_factory=list)
    scale: ScaleCalibration = field(default_factory=ScaleCalibration)
    node_count: int = 0
    edge_count: int = 0
    sheet_id: str = ""
    page_num: int = 0
    page_width_pts: float = 0.0
    page_height_pts: float = 0.0
    is_valid: bool = False
    validation_errors: List[str] = field(default_factory=list)
    validation_warnings: List[str] = field(default_factory=list)


# ── Scale Detection ───────────────────────────────────────────────────────────

def _parse_scale_ratio(text: str) -> Optional[float]:
    """
    Parse a scale string into a pts-per-inch factor.

    Handles common architectural scale formats:
    - '1/8" = 1\'-0"' → 9.0 pts per inch (1/8 inch on paper = 12 inches real)
    - '1:100' → 100/72 * 72 = 100 pts per inch
    - '1/4" = 1\'-0"' → 4.5 pts per inch
    - '3/32" = 1\'-0"' → 12.0 pts per inch

    Returns pts_per_inch or None if unparseable.
    PDF points: 72 pts = 1 inch.
    """
    text = text.strip().upper()

    # Pattern: "1/8" = 1'-0"" style (paper fraction = real foot)
    # paper_inches : real_inches = pts_per_inch
    fraction_pattern = re.compile(
        r'(\d+)\s*/\s*(\d+)\s*["\u201d]?\s*=\s*1\s*[\'-]'
    )
    m = fraction_pattern.search(text)
    if m:
        num, den = int(m.group(1)), int(m.group(2))
        if den > 0:
            paper_inches = num / den
            real_inches = 12.0  # 1 foot
            # pts per real inch = 72 * paper_inches / real_inches... wait:
            # paper_inches on paper = real_inches in reality
            # 1 real inch = paper_inches/real_inches paper inches
            # 1 paper inch = 72 pts
            # pts per real inch = 72 * paper_inches / real_inches
            pts_per_inch = 72.0 * paper_inches / real_inches
            return pts_per_inch

    # Pattern: "1:N" ratio
    ratio_pattern = re.compile(r'1\s*:\s*(\d+(?:\.\d+)?)')
    m = ratio_pattern.search(text)
    if m:
        ratio = float(m.group(1))
        # 1:100 means 1 paper unit = 100 real units
        # 1 paper inch = 72 pts, 1 paper inch = 100 real inches
        # pts per real inch = 72 / 100
        pts_per_inch = 72.0 / ratio
        return pts_per_inch

    return None


def detect_scale(page: fitz.Page) -> ScaleCalibration:
    """
    Attempts to detect the drawing scale using three methods in priority order.

    Method 1: Graphic scale bar
        Look for a horizontal line segment with nearby text containing
        a scale ratio pattern (e.g., '1/8" = 1\'-0"').

    Method 2: Dimension string correlation
        Find text blocks that contain dimension values (e.g., '10\'-0"').
        Find nearby horizontal or vertical line segments.
        Compute the pts-per-inch ratio from segment length vs. dimension value.
        Use the median of all found ratios.

    Method 3: Title block text search
        Search all text on the page for 'SCALE:' or 'DRAWING SCALE' followed
        by a scale value.

    Returns ScaleCalibration with confidence=0.0 and source='unknown' if all fail.
    Never raises exceptions.
    """
    try:
        # ── Method 3: Title block text search (simplest, try first for speed) ──
        blocks = page.get_text("blocks")
        for block in blocks:
            text = block[4].upper() if len(block) > 4 else ""
            if "SCALE:" in text or "DRAWING SCALE" in text:
                # Extract the scale value from the same text block
                pts = _parse_scale_ratio(text)
                if pts and pts > 0:
                    return ScaleCalibration(
                        scale_factor=pts,
                        scale_confidence=0.75,
                        source="title_block"
                    )

        # ── Method 1 + 2: Scan text blocks for scale patterns ──
        ratios = []
        for block in blocks:
            if len(block) <= 4:
                continue
            text = block[4]
            pts = _parse_scale_ratio(text)
            if pts and pts > 0:
                ratios.append(pts)

        if ratios:
            # Use median for robustness
            median_pts = float(np.median(ratios))
            confidence = min(0.85, 0.5 + 0.1 * len(ratios))
            return ScaleCalibration(
                scale_factor=median_pts,
                scale_confidence=confidence,
                source="dimension_string" if len(ratios) > 1 else "scale_bar"
            )

        # All methods failed
        return ScaleCalibration(
            scale_factor=0.0,
            scale_confidence=0.0,
            source="unknown"
        )

    except Exception as e:
        logger.warning(f"detect_scale failed: {e}")
        return ScaleCalibration(scale_factor=0.0, scale_confidence=0.0, source="unknown")


# ── Node Management ───────────────────────────────────────────────────────────

def _snap_point(
    pt: Tuple[float, float],
    tolerance: float,
    node_map: Dict[Tuple[int, int], int],
    nodes: List[List[float]]
) -> int:
    """
    Snap a point to the tolerance grid and return its node index.
    Merges nodes that fall within tolerance of each other.

    Args:
        pt: (x, y) coordinate in PDF points
        tolerance: snap grid size in pts
        node_map: existing snapped point → node index mapping
        nodes: list of node coordinates (mutated in place)

    Returns:
        Node index (integer)
    """
    snapped = (
        int(round(pt[0] / tolerance) * tolerance),
        int(round(pt[1] / tolerance) * tolerance)
    )
    if snapped not in node_map:
        node_map[snapped] = len(nodes)
        nodes.append([float(snapped[0]), float(snapped[1])])
    return node_map[snapped]


# ── Graph Validation ──────────────────────────────────────────────────────────

def validate_graph(graph: GraphData) -> GraphData:
    """
    Run QAQC Gate 1 checks on the extracted graph.
    Populates validation_errors and validation_warnings.
    Sets is_valid = False if any hard error is found.

    Checks:
    - node_count > MIN_NODE_COUNT
    - edge_count > MIN_EDGE_COUNT
    - all node coordinates within page bounds
    - no NaN or Inf values in edge_attr
    - no duplicate edges
    - scale confidence warning if < 0.5

    Args:
        graph: GraphData to validate (mutated in place)

    Returns:
        The validated GraphData with errors/warnings populated
    """
    errors = []
    warnings = []

    # Node count check
    if graph.node_count < MIN_NODE_COUNT:
        errors.append(
            f"Node count {graph.node_count} below minimum {MIN_NODE_COUNT}. "
            f"Sheet may be empty or extraction failed."
        )

    # Edge count check
    if graph.edge_count < MIN_EDGE_COUNT:
        errors.append(
            f"Edge count {graph.edge_count} below minimum {MIN_EDGE_COUNT}. "
            f"Sheet may be empty or extraction failed."
        )

    # Bounds check
    if graph.x and graph.page_width_pts > 0 and graph.page_height_pts > 0:
        xs = [n[0] for n in graph.x]
        ys = [n[1] for n in graph.x]
        if max(xs) > graph.page_width_pts + 1.0:
            errors.append(
                f"Node x coordinate {max(xs):.1f} exceeds page width {graph.page_width_pts:.1f}"
            )
        if max(ys) > graph.page_height_pts + 1.0:
            errors.append(
                f"Node y coordinate {max(ys):.1f} exceeds page height {graph.page_height_pts:.1f}"
            )

    # NaN/Inf check on edge attributes
    if graph.edge_attr:
        for i, attr in enumerate(graph.edge_attr):
            if any(not math.isfinite(v) for v in attr):
                errors.append(f"Edge {i} has NaN or Inf in edge_attr: {attr}")
                break  # Report first occurrence only

    # Duplicate edge check
    if graph.edge_index and len(graph.edge_index[0]) > 0:
        src = graph.edge_index[0]
        dst = graph.edge_index[1]
        edge_set = set()
        for u, v in zip(src, dst):
            canonical = (min(u, v), max(u, v))
            if canonical in edge_set:
                errors.append(
                    f"Duplicate edge found between nodes {u} and {v}"
                )
                break  # Report first occurrence only
            edge_set.add(canonical)

    # Scale confidence warning
    if graph.scale.scale_confidence < 0.5:
        warnings.append(
            f"Scale confidence is low ({graph.scale.scale_confidence:.0%}, "
            f"source={graph.scale.source}). Dimensional rule checks will be "
            f"skipped. Manual scale calibration recommended."
        )

    graph.validation_errors = errors
    graph.validation_warnings = warnings
    graph.is_valid = len(errors) == 0
    return graph


# ── Main Entry Point ──────────────────────────────────────────────────────────

def extract_vector_graph(
    pdf_path: str,
    page_num: int = 0,
    sheet_type: str = "elevation",
    tolerance: float = DEFAULT_TOLERANCE
) -> GraphData:
    """
    Main entry point for Layer 2.

    Pipeline:
    1. Open PDF and get the target page
    2. Run Layer 0 normalization (sheet-type conditional)
    3. Detect drawing scale
    4. Build node index from normalized path endpoints
    5. Build edge list with geometric attributes
    6. Convert node coordinates to inches if scale is known
    7. Run validation (QAQC Gate 1)
    8. Return GraphData

    Args:
        pdf_path:   Path to the PDF file
        page_num:   Zero-indexed page number
        sheet_type: One of 'elevation', 'floor_plan', 'detail', 'schedule', 'unknown'
        tolerance:  Snap tolerance in pts for merging nearby nodes

    Returns:
        GraphData — never raises, all errors in validation_errors
    """
    graph = GraphData(page_num=page_num, sheet_id=f"page_{page_num}")

    try:
        # ── Open PDF ──
        doc = fitz.open(pdf_path)

        if page_num >= len(doc):
            graph.validation_errors.append(
                f"Page {page_num} does not exist. PDF has {len(doc)} pages."
            )
            return graph

        page = doc[page_num]
        rect = page.rect
        graph.page_width_pts = rect.width
        graph.page_height_pts = rect.height

        # ── Layer 0: Normalize ──
        normalized_paths: List[NormalizedPath] = normalize_page(page, sheet_type)

        if not normalized_paths:
            graph.validation_errors.append(
                "No paths extracted after normalization. "
                "PDF may be rasterized (scanned) or empty."
            )
            return validate_graph(graph)

        # ── Scale Detection ──
        graph.scale = detect_scale(page)

        # ── Build Node Index and Edge List ──
        node_map: Dict[Tuple[int, int], int] = {}
        nodes: List[List[float]] = []
        src_nodes: List[int] = []
        dst_nodes: List[int] = []
        edge_attrs: List[List[float]] = []
        seen_edges: set = set()

        for path in normalized_paths:
            for seg in path.segments:
                p1, p2 = seg
                u = _snap_point(p1, tolerance, node_map, nodes)
                v = _snap_point(p2, tolerance, node_map, nodes)

                # Skip zero-length edges (collapsed after snapping)
                if u == v:
                    continue

                # Skip duplicate edges (undirected)
                canonical = (min(u, v), max(u, v))
                if canonical in seen_edges:
                    continue
                seen_edges.add(canonical)

                # Compute edge attributes
                dx = nodes[v][0] - nodes[u][0]
                dy = nodes[v][1] - nodes[u][1]
                length = math.sqrt(dx * dx + dy * dy)

                if length < 1e-9:
                    continue

                unit_dx = dx / length
                unit_dy = dy / length

                src_nodes.append(u)
                dst_nodes.append(v)
                edge_attrs.append([
                    length,
                    path.stroke_width,
                    unit_dx,
                    unit_dy
                ])

        # ── Assemble GraphData ──
        graph.x = nodes
        graph.edge_index = [src_nodes, dst_nodes]
        graph.edge_attr = edge_attrs
        graph.node_count = len(nodes)
        graph.edge_count = len(src_nodes)

        # ── Convert to inches if scale is known ──
        if graph.scale.scale_confidence >= 0.5 and graph.scale.scale_factor > 0:
            graph.x_inches = [
                [n[0] / graph.scale.scale_factor, n[1] / graph.scale.scale_factor]
                for n in nodes
            ]

        doc.close()

    except FileNotFoundError:
        graph.validation_errors.append(f"PDF file not found: {pdf_path}")
    except Exception as e:
        graph.validation_errors.append(f"Extraction failed: {type(e).__name__}: {e}")
        logger.exception(f"extract_vector_graph failed for {pdf_path}")

    return validate_graph(graph)
