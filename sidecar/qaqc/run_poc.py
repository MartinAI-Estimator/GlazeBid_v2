"""
run_poc.py

Sprint 1 Proof of Concept Runner

Drop a real architectural elevation PDF into:
    sidecar/qaqc/test_data/test_elevation.pdf

Then run:
    cd sidecar
    python qaqc/run_poc.py

This script:
1. Runs the vector graph extractor on the test PDF
2. Generates the SVG overlay
3. Runs T05 and T06 against the real PDF
4. Prints a clear pass/fail checklist for human review

Sprint 1 is complete when a human looks at the SVG and confirms
the graph visually corresponds to the architectural geometry.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from layers.layer2_extractor import extract_vector_graph, MIN_NODE_COUNT, MIN_EDGE_COUNT
from qaqc.visualize_graph import visualize_graph

TEST_PDF = os.path.join(os.path.dirname(__file__), "test_data", "test_elevation.pdf")


def print_graph_diagnostics(graph):
    """
    Print diagnostic statistics about the extracted graph.
    Helps identify whether high node counts are from geometry or text artifacts.
    """
    if not graph.edge_attr or not graph.edge_index:
        print("  No edge data available for diagnostics.")
        return

    import numpy as np

    edge_lengths = [attr[0] for attr in graph.edge_attr]
    stroke_widths = [attr[1] for attr in graph.edge_attr]

    # Compute node degrees
    from collections import Counter
    degree_counter = Counter()
    for u, v in zip(graph.edge_index[0], graph.edge_index[1]):
        degree_counter[u] += 1
        degree_counter[v] += 1

    degrees = list(degree_counter.values())
    isolated = graph.node_count - len(degree_counter)

    print(f"\n--- Graph Diagnostics ---")
    print(f"  Edge length:    min={min(edge_lengths):.1f}  "
          f"median={sorted(edge_lengths)[len(edge_lengths)//2]:.1f}  "
          f"max={max(edge_lengths):.1f} pts")
    print(f"  Stroke widths:  min={min(stroke_widths):.2f}  "
          f"max={max(stroke_widths):.2f}")
    print(f"  Node degrees:   min={min(degrees)}  "
          f"median={sorted(degrees)[len(degrees)//2]}  "
          f"max={max(degrees)}")
    print(f"  Isolated nodes: {isolated}  "
          f"(nodes with no edges — likely noise)")
    print(f"  Degree-2 nodes: {sum(1 for d in degrees if d == 2)}  (corners)")
    print(f"  Degree-3 nodes: {sum(1 for d in degrees if d == 3)}  (T-junctions)")
    print(f"  Degree-4+ nodes:{sum(1 for d in degrees if d >= 4)}  (X-junctions)")

    # Flag if isolated node ratio is high
    if graph.node_count > 0:
        isolated_ratio = isolated / graph.node_count
        if isolated_ratio > 0.3:
            print(f"  ⚠ High isolated node ratio ({isolated_ratio:.0%}) — "
                  f"possible text artifact contamination")
        else:
            print(f"  ✓ Isolated node ratio OK ({isolated_ratio:.0%})")


def run():
    print("=" * 60)
    print("GlazeBid AiQ — Sprint 1 Proof of Concept")
    print("=" * 60)

    # Check for PDF
    if not os.path.exists(TEST_PDF):
        print(f"\n❌  No test PDF found at:")
        print(f"    {TEST_PDF}")
        print(f"\n    Drop a real architectural elevation PDF there and re-run.")
        print(f"    Rename it to: test_elevation.pdf")
        sys.exit(1)

    print(f"\n✓  PDF found: {TEST_PDF}")
    print(f"\nRunning Layer 0 + Layer 2 extraction...")

    # Extract graph
    graph = extract_vector_graph(TEST_PDF, page_num=0, sheet_type="elevation")

    print(f"\n--- Extraction Results ---")
    print(f"  Nodes:          {graph.node_count}")
    print(f"  Edges:          {graph.edge_count}")
    print(f"  Page size:      {graph.page_width_pts:.1f} x {graph.page_height_pts:.1f} pts")
    print(f"  Scale factor:   {graph.scale.scale_factor:.4f} pts/inch")
    print(f"  Scale confidence: {graph.scale.scale_confidence:.0%}")
    print(f"  Scale source:   {graph.scale.source}")
    print(f"  Valid:          {graph.is_valid}")

    if graph.validation_errors:
        print(f"\n  ERRORS:")
        for e in graph.validation_errors:
            print(f"    ✗ {e}")

    if graph.validation_warnings:
        print(f"\n  WARNINGS:")
        for w in graph.validation_warnings:
            print(f"    ⚠ {w}")

    print_graph_diagnostics(graph)

    # ── Sheet Router ──
    print(f"\n--- Layer 1: Sheet Router ---")
    from layers.layer1_router import classify_sheet_from_path
    classification = classify_sheet_from_path(TEST_PDF, page_num=0)
    print(f"  Sheet type:   {classification.sheet_type}")
    print(f"  Confidence:   {classification.confidence:.0%}")
    print(f"  Method:       {classification.method}")
    print(f"  Matched text: {classification.matched_text}")
    print(f"  Sheet number: {classification.sheet_number}")
    if classification.errors:
        for e in classification.errors:
            print(f"  ERROR: {e}")

    # Validate normalization path decision
    normalization_path = {
        "elevation": "FULL normalization (uniform stroke, text filter)",
        "floor_plan": "PARTIAL normalization (preserve weight ratios)",
        "detail": "NO normalization (preserve all attributes)",
        "schedule": "NO normalization (text-dominant)",
        "site_plan": "SKIP (no glazing scope)",
        "structural": "SKIP (substrate reference only)",
        "unknown": "NO normalization (flag for review)",
    }
    path = normalization_path.get(classification.sheet_type, "UNKNOWN")
    print(f"  Normalization: {path}")

    # ── Rules Engine ──
    print(f"\n--- Rules Engine: Glazing Detection ---")
    from layers.rules_engine import run_rules_engine
    candidates = run_rules_engine(
        graph.x,
        graph.edge_index,
        graph.edge_attr,
        scale_factor=graph.scale.scale_factor,
        scale_confidence=graph.scale.scale_confidence,
        source_sheet="test_elevation"
    )

    accepted  = [c for c in candidates if c.status == "auto_accepted"]
    review    = [c for c in candidates if c.status == "needs_review"]
    rejected  = [c for c in candidates if c.status == "rejected"]

    print(f"  Total candidates:   {len(candidates)}")
    print(f"  Auto-accepted:      {len(accepted)}")
    print(f"  Needs review:       {len(review)}")
    print(f"  Rejected:           {len(rejected)}")

    if accepted:
        print(f"\n  Top 3 accepted candidates:")
        for c in accepted[:3]:
            print(f"    {c.candidate_id}: confidence={c.confidence:.2f} "
                  f"system={c.system_hint} "
                  f"bays={c.bay_count} "
                  f"w={c.width_inches:.1f}\" h={c.height_inches:.1f}\"")
            print(f"      rules_passed: {c.rules_passed}")
    elif review:
        print(f"\n  No auto-accepted candidates. Top review candidate:")
        c = review[0]
        print(f"    {c.candidate_id}: confidence={c.confidence:.2f} "
              f"rules_passed={c.rules_passed}")
    else:
        print(f"  No candidates passed rules engine on this sheet.")
        print(f"  (Expected if sheet is 'PRESENTATION PLANS' with no elevation geometry)")

    # ── Grid Label Detection (Layer 9 preview) ──
    print(f"\n--- Layer 9: Grid Label Detection ---")
    from layers.layer9_homography import detect_grid_labels
    import fitz as _fitz
    _doc = _fitz.open(TEST_PDF)
    _page = _doc[0]
    grid_labels = detect_grid_labels(_page, sheet_id="test_elevation")
    _doc.close()

    if grid_labels:
        label_texts = [l.label for l in grid_labels]
        print(f"  Detected {len(grid_labels)} grid labels: {label_texts[:15]}"
              f"{'...' if len(grid_labels) > 15 else ''}")
        print(f"  Note: Grid-line homography requires 2 sheets with matching labels.")
        print(f"        Cross-sheet sync runs when both elevation + floor plan are available.")
    else:
        print(f"  No grid labels detected on this sheet.")
        print(f"  (Expected if sheet is 'PRESENTATION PLANS' with no grid bubbles)")

    # Automated checks (T05, T06)
    print(f"\n--- Automated Gate Checks ---")

    t05 = graph.node_count > MIN_NODE_COUNT
    t06 = graph.edge_count > MIN_EDGE_COUNT
    print(f"  T05 Node count > {MIN_NODE_COUNT}:   {'✓ PASS' if t05 else '✗ FAIL'} ({graph.node_count})")
    print(f"  T06 Edge count > {MIN_EDGE_COUNT}:   {'✓ PASS' if t06 else '✗ FAIL'} ({graph.edge_count})")

    # Generate SVG
    print(f"\nGenerating SVG overlay...")
    svg_path = visualize_graph(TEST_PDF, 0, graph)
    print(f"  SVG saved to: {svg_path}")

    # Human review checklist
    print(f"\n{'=' * 60}")
    print(f"HUMAN REVIEW REQUIRED — Open the SVG file above")
    print(f"{'=' * 60}")
    print(f"\nConfirm the following visually:")
    print(f"  [ ] Graph nodes (dots) align with line intersections on the drawing")
    print(f"  [ ] Graph edges (lines) follow the drawing geometry")
    print(f"  [ ] Orange/red nodes appear at mullion intersections (T/X junctions)")
    print(f"  [ ] Blue edges correspond to glazing profile lines")
    print(f"  [ ] The graph is NOT random noise or scattered points")
    print(f"\nIf ALL boxes checked: Sprint 1 PASSED → proceed to Sprint 2")
    print(f"If ANY box fails:     Diagnose before Sprint 2")

    # Final status
    automated_pass = t05 and t06 and graph.is_valid
    print(f"\n--- Automated Status ---")
    if automated_pass:
        print(f"  ✓ Automated checks PASSED")
        print(f"  → Awaiting human visual confirmation of SVG")
    else:
        print(f"  ✗ Automated checks FAILED — fix before visual review")

    return 0 if automated_pass else 1


if __name__ == "__main__":
    sys.exit(run())
