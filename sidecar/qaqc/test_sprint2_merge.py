"""
test_sprint2_merge.py

Sprint 2 addendum — Region Merge Tests.
Tests the merge_overlapping_regions function that combines fragment bounding
boxes into full glazing assemblies.

Run with:
    cd sidecar
    pytest qaqc/test_sprint2_merge.py -v

Pass condition:
    At least one merged candidate on McLarty A2.0 has
    width >= 8ft AND height >= 7ft (minimum plausible storefront assembly).

Root cause:
    find_rectangular_regions pairs adjacent horizontal edge rows
    (head↔transom, transom↔sill) producing 3'×1.5' fragments instead of
    one 10'×9' assembly. Post-detection merge combines vertically stacked
    fragments with >50% horizontal overlap and <24" real-world vertical gap.
"""

import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from layers.rules_engine import (
    Rect,
    merge_overlapping_regions,
    run_rules_engine,
)
from layers.layer2_extractor import extract_vector_graph

# ── Test Data Path ────────────────────────────────────────────────────────────

TEST_DATA_DIR = os.path.join(os.path.dirname(__file__), "test_data")
REAL_PDF_PATH = os.path.join(TEST_DATA_DIR, "test_elevation.pdf")
HAS_REAL_PDF = os.path.exists(REAL_PDF_PATH)
HOPE_PDF_PATH = os.path.join(TEST_DATA_DIR, "Hope Aquatic & Rec Center - Bid Drawings - Non Marked.pdf")
HAS_HOPE_PDF = os.path.exists(HOPE_PDF_PATH)


# ═══════════════════════════════════════════════════════════════════════════════
# UNIT TESTS — merge_overlapping_regions
# ═══════════════════════════════════════════════════════════════════════════════

class TestMergeOverlappingRegions:
    """Unit tests for the merge function with synthetic rectangles."""

    def test_M01_no_rects_returns_empty(self):
        """Empty input returns empty output."""
        result = merge_overlapping_regions([], max_gap_pts=72.0)
        assert result == []

    def test_M02_single_rect_unchanged(self):
        """A single rect passes through unchanged."""
        r = Rect(x=100, y=100, width=300, height=270)
        result = merge_overlapping_regions([r], max_gap_pts=72.0)
        assert len(result) == 1
        assert result[0].x == 100
        assert result[0].width == 300

    def test_M03_two_vertically_stacked_merge(self):
        """Two fragments stacked vertically with small gap should merge.

        Fragment 1: x=100, y=100, w=300, h=50  (top strip)
        Fragment 2: x=100, y=160, w=300, h=50  (bottom strip, gap=10pt)

        Merged: x=100, y=100, w=300, h=110
        """
        r1 = Rect(x=100, y=100, width=300, height=50)
        r2 = Rect(x=100, y=160, width=300, height=50)
        result = merge_overlapping_regions([r1, r2], max_gap_pts=72.0)
        assert len(result) == 1
        merged = result[0]
        assert merged.x == 100
        assert merged.y == 100
        assert merged.width == 300
        assert merged.height == 110  # spans y=100 to y=210

    def test_M04_three_vertically_stacked_merge(self):
        """Three fragments (head↔transom↔sill pattern) should merge into one.

        This simulates the exact storefront pattern:
        head   at y=100, h=30
        transom at y=140, h=30
        sill   at y=180, h=30
        All same x=200, w=360
        """
        r1 = Rect(x=200, y=100, width=360, height=30)
        r2 = Rect(x=200, y=140, width=360, height=30)
        r3 = Rect(x=200, y=180, width=360, height=30)
        result = merge_overlapping_regions([r1, r2, r3], max_gap_pts=72.0)
        assert len(result) == 1
        merged = result[0]
        assert merged.x == 200
        assert merged.y == 100
        assert merged.width == 360
        assert merged.height == 110  # y=100 to y=210

    def test_M05_horizontal_overlap_threshold(self):
        """Two rects with <50% horizontal overlap should NOT merge.

        r1: x=100, w=100  → covers 100-200
        r2: x=160, w=100  → covers 160-260
        Overlap = 40pt / min(100,100) = 40% < 50%
        """
        r1 = Rect(x=100, y=100, width=100, height=30)
        r2 = Rect(x=160, y=140, width=100, height=30)
        result = merge_overlapping_regions([r1, r2], max_gap_pts=72.0)
        assert len(result) == 2, "Low horizontal overlap should prevent merge"

    def test_M06_horizontal_overlap_just_above_threshold(self):
        """Two rects with >50% horizontal overlap and matching widths SHOULD merge.

        r1: x=100, w=100  → covers 100-200
        r2: x=110, w=100  → covers 110-210
        Overlap = 90pt / min(100,100) = 90% > 50%
        Union width = 110pt ≤ 100 * 1.20 = 120pt (passes width growth check)
        """
        r1 = Rect(x=100, y=100, width=100, height=30)
        r2 = Rect(x=110, y=140, width=100, height=30)
        result = merge_overlapping_regions([r1, r2], max_gap_pts=72.0)
        assert len(result) == 1, "90% horizontal overlap with matching widths should merge"

    def test_M07_vertical_gap_too_large(self):
        """Two aligned rects with gap > max_gap_pts should NOT merge."""
        r1 = Rect(x=100, y=100, width=300, height=30)
        r2 = Rect(x=100, y=250, width=300, height=30)  # gap = 120pt > 72pt
        result = merge_overlapping_regions([r1, r2], max_gap_pts=72.0)
        assert len(result) == 2, "Large vertical gap should prevent merge"

    def test_M08_two_separate_assemblies_stay_separate(self):
        """Two assemblies at different X positions should not merge.

        Assembly A: x=100 (left side of sheet)
        Assembly B: x=1000 (right side of sheet)
        """
        a1 = Rect(x=100, y=100, width=300, height=30)
        a2 = Rect(x=100, y=140, width=300, height=30)
        b1 = Rect(x=1000, y=100, width=200, height=30)
        b2 = Rect(x=1000, y=140, width=200, height=30)
        result = merge_overlapping_regions([a1, a2, b1, b2], max_gap_pts=72.0)
        assert len(result) == 2, "Separate assemblies should not merge"
        # Each assembly merged internally
        widths = sorted([r.width for r in result])
        assert widths == [200, 300]

    def test_M09_iterative_merge(self):
        """Four stacked fragments should merge in multiple passes.

        If only adjacent pairs merge in pass 1, the result needs
        a second pass to merge those merged rects together.
        """
        # Four strips stacked with 10pt gaps
        rects = [
            Rect(x=100, y=100, width=300, height=20),
            Rect(x=100, y=130, width=300, height=20),  # gap=10
            Rect(x=100, y=160, width=300, height=20),  # gap=10
            Rect(x=100, y=190, width=300, height=20),  # gap=10
        ]
        result = merge_overlapping_regions(rects, max_gap_pts=72.0)
        assert len(result) == 1
        assert result[0].height == 110  # y=100 to y=210

    def test_M10_overlapping_rects_not_merged(self):
        """Two rects that overlap vertically should NOT be merged here.
        Overlapping rects are handled by deduplicate_candidates downstream."""
        r1 = Rect(x=100, y=100, width=300, height=80)
        r2 = Rect(x=100, y=150, width=300, height=80)  # overlap 30pt
        result = merge_overlapping_regions([r1, r2], max_gap_pts=72.0)
        assert len(result) == 2, "Overlapping rects should not merge (dedup handles them)"


# ═══════════════════════════════════════════════════════════════════════════════
# INTEGRATION TEST — McLarty Mazda A2.0
# ═══════════════════════════════════════════════════════════════════════════════

class TestMcLartyMergedCandidates:
    """End-to-end test: merged candidates on McLarty Mazda must include
    at least one plausible storefront assembly (≥8ft wide, ≥7ft tall)."""

    @pytest.mark.skipif(not HAS_REAL_PDF, reason="McLarty PDF not available")
    def test_M11_gate_merged_assembly_dimensions(self):
        """GATE TEST: At least one merged candidate ≥ 8ft wide and ≥ 7ft tall."""
        graph = extract_vector_graph(REAL_PDF_PATH, page_num=6, sheet_type="elevation")

        scale_factor = graph.scale.scale_factor if graph.scale else 0.0
        scale_conf = graph.scale.scale_confidence if graph.scale else 0.0
        assert scale_factor > 0, "Scale detection must succeed"

        candidates = run_rules_engine(
            x=graph.x,
            edge_index=graph.edge_index,
            edge_attr=graph.edge_attr,
            scale_factor=scale_factor,
            scale_confidence=scale_conf,
            source_sheet="A2.0"
        )

        # Find candidates that are assembly-sized
        assembly_sized = []
        for c in candidates:
            w_ft = c.width_pts / scale_factor / 12
            h_ft = c.height_pts / scale_factor / 12
            if w_ft >= 8.0 and h_ft >= 7.0:
                assembly_sized.append((c, w_ft, h_ft))

        assert len(assembly_sized) > 0, (
            f"No merged candidate with width ≥ 8ft and height ≥ 7ft. "
            f"Total candidates: {len(candidates)}. "
            f"Largest: {max(c.width_pts / scale_factor / 12 for c in candidates):.1f}ft × "
            f"{max(c.height_pts / scale_factor / 12 for c in candidates):.1f}ft"
        )

        best = max(assembly_sized, key=lambda x: x[0].confidence)
        print(f"\nGATE PASSED: Best assembly {best[1]:.1f}ft × {best[2]:.1f}ft "
              f"conf={best[0].confidence:.2f} system={best[0].system_hint}")


# ═══════════════════════════════════════════════════════════════════════════════
# HOPE AQUATIC — Scale Detection Validation
# ═══════════════════════════════════════════════════════════════════════════════

class TestHopeAquaticScale:
    """Validate scale detection on the Hope Aquatic PDF."""

    @pytest.mark.skipif(not HAS_HOPE_PDF, reason="Hope Aquatic PDF not available")
    def test_M12_hope_scale_detected(self):
        """Scale detection returns a non-zero scale with confidence > 50%
        on at least one elevation page of the Hope Aquatic drawing set."""
        import fitz
        doc = fitz.open(HOPE_PDF_PATH)
        n_pages = len(doc)
        doc.close()

        best_scale = None
        best_conf = 0.0
        best_page = -1

        # Test first 20 pages (or all if fewer)
        for pg in range(min(n_pages, 20)):
            try:
                graph = extract_vector_graph(HOPE_PDF_PATH, page_num=pg)
                if graph.scale and graph.scale.scale_confidence > best_conf:
                    best_scale = graph.scale
                    best_conf = graph.scale.scale_confidence
                    best_page = pg
            except Exception:
                continue

        assert best_scale is not None, "No scale detected on any page"
        assert best_conf >= 0.50, (
            f"Best scale confidence {best_conf:.0%} < 50% on page {best_page}"
        )
        print(f"\nHope Aquatic: Best scale on page {best_page + 1}: "
              f"{best_scale.scale_factor:.4f} pts/inch, "
              f"confidence {best_conf:.0%}, source: {best_scale.source}")
