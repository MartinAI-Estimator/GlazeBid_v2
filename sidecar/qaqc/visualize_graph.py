"""
visualize_graph.py

Sprint 1 Proof of Concept Tool

Generates an SVG overlay showing the extracted vector graph on top of
the PDF drawing geometry. This is the primary validation tool for Sprint 1.

Sprint 1 is NOT complete until a human reviews this SVG output and confirms
that the graph visually corresponds to the architectural geometry on the sheet.

Usage:
    cd sidecar
    python qaqc/visualize_graph.py path/to/elevation.pdf 0

Output:
    {pdf_name}_page{N}_graph.svg saved alongside the input PDF

SVG shows:
    - Nodes colored by graph degree:
        Blue circles  = degree 2 (corners)
        Orange circles = degree 3 (T-junctions, mullion meets rail)
        Red circles   = degree 4+ (X-junctions, mullion intersections)
    - Edges colored by stroke weight:
        Blue lines  = thin (stroke_width <= 0.5) — glazing profiles
        Red lines   = thick (stroke_width > 0.5) — wall/structural lines
    - Scale info box (factor, confidence, source)
    - Node and edge count
    - Validation errors in red if graph is invalid
"""

import os
import sys
import math
import logging
from collections import defaultdict
from typing import List, Dict

# Ensure sidecar package is importable when run directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from layers.layer2_extractor import extract_vector_graph, GraphData

logger = logging.getLogger(__name__)

# ── SVG Colors ────────────────────────────────────────────────────────────────

COLOR_NODE_CORNER    = "#3B82F6"   # Blue — degree 2
COLOR_NODE_T_JUNC    = "#F97316"   # Orange — degree 3
COLOR_NODE_X_JUNC    = "#EF4444"   # Red — degree 4+
COLOR_EDGE_THIN      = "#3B82F6"   # Blue — thin edges (glazing profiles)
COLOR_EDGE_THICK     = "#EF4444"   # Red — thick edges (walls/structural)
COLOR_PAGE_BORDER    = "#D1D5DB"   # Light gray
COLOR_SCALE_BG       = "#1E3A5F"   # Dark blue background for info box
COLOR_ERROR_TEXT     = "#EF4444"   # Red for errors
COLOR_INFO_TEXT      = "#FFFFFF"   # White for info box text
COLOR_WARNING_TEXT   = "#F97316"   # Orange for warnings

NODE_RADIUS          = 2.5
THIN_EDGE_WIDTH      = 0.8
THICK_EDGE_WIDTH     = 1.5
STROKE_WEIGHT_THRESHOLD = 0.5


def _compute_node_degrees(graph: GraphData) -> Dict[int, int]:
    """Count the number of edges connected to each node."""
    degrees = defaultdict(int)
    if graph.edge_index and len(graph.edge_index[0]) > 0:
        for u, v in zip(graph.edge_index[0], graph.edge_index[1]):
            degrees[u] += 1
            degrees[v] += 1
    return degrees


def _node_color(degree: int) -> str:
    """Return SVG color string based on node degree."""
    if degree <= 2:
        return COLOR_NODE_CORNER
    elif degree == 3:
        return COLOR_NODE_T_JUNC
    else:
        return COLOR_NODE_X_JUNC


def _edge_color(stroke_width: float) -> str:
    """Return SVG color string based on edge stroke weight."""
    if stroke_width <= STROKE_WEIGHT_THRESHOLD:
        return COLOR_EDGE_THIN
    else:
        return COLOR_EDGE_THICK


def visualize_graph(
    pdf_path: str,
    page_num: int,
    graph: GraphData,
    output_path: str = None
) -> str:
    """
    Generate an SVG overlay of the extracted vector graph.

    Args:
        pdf_path:    Path to the source PDF
        page_num:    Page number that was extracted
        graph:       GraphData from extract_vector_graph()
        output_path: Where to save the SVG. Defaults to {pdf_name}_page{N}_graph.svg

    Returns:
        Path to the saved SVG file. Never raises.
    """
    try:
        # ── Determine output path ──
        if output_path is None:
            base = os.path.splitext(pdf_path)[0]
            output_path = f"{base}_page{page_num}_graph.svg"

        # ── SVG dimensions match PDF page ──
        w = graph.page_width_pts if graph.page_width_pts > 0 else 612
        h = graph.page_height_pts if graph.page_height_pts > 0 else 792

        # Compute node degrees for coloring
        degrees = _compute_node_degrees(graph)

        lines = []
        lines.append(f'<svg xmlns="http://www.w3.org/2000/svg" '
                     f'width="{w:.1f}" height="{h:.1f}" '
                     f'viewBox="0 0 {w:.1f} {h:.1f}">')

        # White background
        lines.append(f'<rect width="{w:.1f}" height="{h:.1f}" fill="white"/>')

        # Page border
        lines.append(
            f'<rect x="1" y="1" width="{w - 2:.1f}" height="{h - 2:.1f}" '
            f'fill="none" stroke="{COLOR_PAGE_BORDER}" stroke-width="1"/>'
        )

        # ── Draw edges ──
        if graph.edge_index and len(graph.edge_index[0]) > 0:
            for i, (u, v) in enumerate(zip(graph.edge_index[0], graph.edge_index[1])):
                if u >= len(graph.x) or v >= len(graph.x):
                    continue
                x1, y1 = graph.x[u]
                x2, y2 = graph.x[v]

                stroke_width = THIN_EDGE_WIDTH
                color = COLOR_EDGE_THIN
                if graph.edge_attr and i < len(graph.edge_attr):
                    raw_width = graph.edge_attr[i][1]  # index 1 = stroke_width
                    color = _edge_color(raw_width)
                    stroke_width = THICK_EDGE_WIDTH if raw_width > STROKE_WEIGHT_THRESHOLD else THIN_EDGE_WIDTH

                lines.append(
                    f'<line x1="{x1:.2f}" y1="{y1:.2f}" '
                    f'x2="{x2:.2f}" y2="{y2:.2f}" '
                    f'stroke="{color}" stroke-width="{stroke_width}" opacity="0.7"/>'
                )

        # ── Draw nodes ──
        for i, (x, y) in enumerate(graph.x):
            degree = degrees.get(i, 0)
            color = _node_color(degree)
            lines.append(
                f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{NODE_RADIUS}" '
                f'fill="{color}" opacity="0.85"/>'
            )

        # ── Info box (top-left) ──
        info_x, info_y = 10, 10
        info_w, info_h = 280, 90
        lines.append(
            f'<rect x="{info_x}" y="{info_y}" '
            f'width="{info_w}" height="{info_h}" '
            f'fill="{COLOR_SCALE_BG}" rx="4" opacity="0.9"/>'
        )

        def info_text(text, x, y, color=COLOR_INFO_TEXT, size=10, bold=False):
            weight = 'font-weight="bold"' if bold else ''
            return (f'<text x="{x}" y="{y}" font-family="monospace" '
                    f'font-size="{size}" fill="{color}" {weight}>{text}</text>')

        lines.append(info_text("GlazeBid AiQ — Vector Graph", info_x + 8, info_y + 16, bold=True, size=11))
        lines.append(info_text(
            f"Nodes: {graph.node_count}   Edges: {graph.edge_count}",
            info_x + 8, info_y + 32
        ))
        lines.append(info_text(
            f"Scale: {graph.scale.scale_factor:.4f} pts/inch",
            info_x + 8, info_y + 47
        ))
        lines.append(info_text(
            f"Confidence: {graph.scale.scale_confidence:.0%}  Source: {graph.scale.source}",
            info_x + 8, info_y + 62
        ))
        status_color = COLOR_INFO_TEXT if graph.is_valid else COLOR_ERROR_TEXT
        status_text = "VALID" if graph.is_valid else "INVALID"
        lines.append(info_text(f"Status: {status_text}", info_x + 8, info_y + 77,
                               color=status_color, bold=True))

        # ── Validation errors (below info box) ──
        if graph.validation_errors:
            err_y = info_y + info_h + 20
            lines.append(info_text("ERRORS:", info_x + 8, err_y,
                                   color=COLOR_ERROR_TEXT, bold=True, size=10))
            for i, err in enumerate(graph.validation_errors[:3]):  # max 3 shown
                truncated = err[:60] + "..." if len(err) > 60 else err
                lines.append(info_text(f"  {truncated}", info_x + 8, err_y + 14 + i * 14,
                                       color=COLOR_ERROR_TEXT, size=9))

        # ── Warnings ──
        if graph.validation_warnings:
            warn_y = info_y + info_h + 20 + (len(graph.validation_errors[:3]) + 1) * 14
            if not graph.validation_errors:
                warn_y = info_y + info_h + 20
            for i, warn in enumerate(graph.validation_warnings[:2]):
                truncated = warn[:70] + "..." if len(warn) > 70 else warn
                lines.append(info_text(f"⚠ {truncated}", info_x + 8, warn_y + i * 14,
                                       color=COLOR_WARNING_TEXT, size=9))

        # ── Legend (bottom-right) ──
        leg_x = w - 200
        leg_y = h - 100
        lines.append(
            f'<rect x="{leg_x - 8}" y="{leg_y - 14}" '
            f'width="200" height="95" '
            f'fill="{COLOR_SCALE_BG}" rx="4" opacity="0.85"/>'
        )
        lines.append(info_text("Legend", leg_x, leg_y, bold=True, size=10))
        lines.append(f'<circle cx="{leg_x + 6}" cy="{leg_y + 14}" r="4" fill="{COLOR_NODE_CORNER}"/>')
        lines.append(info_text("Corner node (deg 2)", leg_x + 16, leg_y + 18, size=9))
        lines.append(f'<circle cx="{leg_x + 6}" cy="{leg_y + 30}" r="4" fill="{COLOR_NODE_T_JUNC}"/>')
        lines.append(info_text("T-junction (deg 3)", leg_x + 16, leg_y + 34, size=9))
        lines.append(f'<circle cx="{leg_x + 6}" cy="{leg_y + 46}" r="4" fill="{COLOR_NODE_X_JUNC}"/>')
        lines.append(info_text("X-junction (deg 4+)", leg_x + 16, leg_y + 50, size=9))
        lines.append(f'<line x1="{leg_x}" y1="{leg_y + 64}" x2="{leg_x + 20}" y2="{leg_y + 64}" '
                     f'stroke="{COLOR_EDGE_THIN}" stroke-width="1.5"/>')
        lines.append(info_text("Thin edge (glazing)", leg_x + 26, leg_y + 68, size=9))
        lines.append(f'<line x1="{leg_x}" y1="{leg_y + 78}" x2="{leg_x + 20}" y2="{leg_y + 78}" '
                     f'stroke="{COLOR_EDGE_THICK}" stroke-width="2.5"/>')
        lines.append(info_text("Thick edge (wall)", leg_x + 26, leg_y + 82, size=9))

        lines.append('</svg>')

        # ── Write SVG ──
        svg_content = "\n".join(lines)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(svg_content)

        return output_path

    except Exception as e:
        logger.exception(f"visualize_graph failed: {e}")
        # Generate minimal error SVG
        error_svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100">'
            f'<rect width="400" height="100" fill="#1E3A5F"/>'
            f'<text x="20" y="50" font-family="monospace" font-size="12" fill="#EF4444">'
            f'Visualization failed: {str(e)[:50]}</text></svg>'
        )
        fallback_path = output_path or "error_graph.svg"
        with open(fallback_path, "w") as f:
            f.write(error_svg)
        return fallback_path


# ── CLI Entry Point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python visualize_graph.py path/to/drawing.pdf [page_num]")
        print("       page_num defaults to 0")
        sys.exit(1)

    pdf_path = sys.argv[1]
    page_num = int(sys.argv[2]) if len(sys.argv) > 2 else 0

    print(f"Extracting vector graph from: {pdf_path} (page {page_num})")
    graph = extract_vector_graph(pdf_path, page_num, sheet_type="elevation")

    print(f"  Nodes: {graph.node_count}")
    print(f"  Edges: {graph.edge_count}")
    print(f"  Scale: {graph.scale.scale_factor:.4f} pts/inch "
          f"({graph.scale.scale_confidence:.0%} confidence, source={graph.scale.source})")
    print(f"  Valid: {graph.is_valid}")

    if graph.validation_errors:
        print(f"  ERRORS:")
        for e in graph.validation_errors:
            print(f"    - {e}")

    if graph.validation_warnings:
        print(f"  WARNINGS:")
        for w in graph.validation_warnings:
            print(f"    - {w}")

    out_path = visualize_graph(pdf_path, page_num, graph)
    print(f"\nSVG saved to: {out_path}")
    print("\n--- SPRINT 1 PROOF OF CONCEPT ---")
    print("Open the SVG file and confirm:")
    print("  [ ] The graph nodes (dots) align with line intersections on the drawing")
    print("  [ ] The graph edges (lines) follow the drawing geometry")
    print("  [ ] Orange/red nodes appear at mullion intersections")
    print("  [ ] Blue edges correspond to glazing profile lines")
    print("  [ ] The graph is NOT just noise or random points")
    print("")
    print("If the above is true: Sprint 1 PASSED. Proceed to Sprint 2.")
    print("If the graph looks like noise: diagnose before Sprint 2.")
