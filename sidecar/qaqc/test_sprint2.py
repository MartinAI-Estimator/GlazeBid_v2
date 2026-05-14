"""
test_sprint2.py

Sprint 2 automated test suite.
Tests Scale Detection fixes and Hatch Fill Filtering.

Run with:
    cd sidecar
    pytest qaqc/test_sprint2.py -v

Sprint 2 pass condition:
    At least one candidate on McLarty A2.0 reaches confidence >= 0.70
    with a classified system type (not "unclassified").

Root causes addressed:
    Fix 1: Scale regex fails on Unicode smart quotes (U+2019 right single quote
            used as foot mark, U+201D right double quote used as inch mark)
    Fix 2: Glass fill crosshatch lines (short, diagonal, densely packed)
            pollute the graph and cause 300-1400% periodicity variance
"""

import math
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from layers.layer2_extractor import (
    _parse_scale_ratio,
    detect_scale,
    extract_vector_graph,
    ScaleCalibration,
)
from layers.layer0_normalizer import (
    is_hatch_segment,
    filter_hatch_segments,
    normalize_elevation,
    HATCH_MAX_LENGTH,
    HATCH_ANGLE_TOLERANCE,
)
from layers.rules_engine import run_rules_engine

# ── Test Data Path ────────────────────────────────────────────────────────────

TEST_DATA_DIR = os.path.join(os.path.dirname(__file__), "test_data")
REAL_PDF_PATH = os.path.join(TEST_DATA_DIR, "test_elevation.pdf")
HAS_REAL_PDF = os.path.exists(REAL_PDF_PATH)


# ═══════════════════════════════════════════════════════════════════════════════
# FIX 1 TESTS — Scale Detection with Unicode Smart Quotes
# ═══════════════════════════════════════════════════════════════════════════════

class TestScaleUnicodeQuotes:
    """Scale parser must handle smart/curly quotes from PDF text extraction."""

    def test_S2_01_unicode_fraction_smart_quotes(self):
        """The exact string from McLarty Mazda: ⅛\u201d = 1\u2019-0\u201d"""
        result = _parse_scale_ratio('SCALE: \u215b\u201d = 1\u2019-0\u201d')
        assert result is not None, "Failed to parse McLarty Mazda scale string"
        assert abs(result - 0.75) < 0.01, f"Expected 0.75 pts/inch, got {result}"

    def test_S2_02_three_quarter_smart_quotes(self):
        """The detail scale from McLarty: ¾\u201d = 1\u2019-0\u201d"""
        result = _parse_scale_ratio('SCALE: \u00be\u201d = 1\u2019-0\u201d')
        assert result is not None, "Failed to parse ¾ inch scale with smart quotes"
        assert abs(result - 4.5) < 0.01, f"Expected 4.5 pts/inch, got {result}"

    def test_S2_03_ascii_fraction_still_works(self):
        """Ensure existing ASCII patterns are not broken."""
        result = _parse_scale_ratio('SCALE: 1/8" = 1\'-0"')
        assert result is not None
        assert abs(result - 0.75) < 0.01

    def test_S2_04_ascii_fraction_no_spaces(self):
        """Compact format: 1/8"=1'-0" """
        result = _parse_scale_ratio('1/8"=1\'-0"')
        assert result is not None
        assert abs(result - 0.75) < 0.01

    def test_S2_05_mixed_quotes_foot_mark(self):
        """Right single quote as foot mark with straight double quote."""
        result = _parse_scale_ratio('1/8" = 1\u2019-0"')
        assert result is not None
        assert abs(result - 0.75) < 0.01

    def test_S2_06_metric_ratio_unchanged(self):
        """1:96 ratio parsing still works."""
        result = _parse_scale_ratio('1:96')
        assert result is not None
        assert abs(result - 0.75) < 0.01

    @pytest.mark.skipif(not HAS_REAL_PDF, reason="No test_elevation.pdf")
    def test_S2_07_mclarty_page7_scale_detected(self):
        """Scale detection on McLarty A2.0 must return confidence >= 0.70."""
        import fitz
        doc = fitz.open(REAL_PDF_PATH)
        page = doc[7]
        scale = detect_scale(page)
        doc.close()
        assert scale.scale_confidence >= 0.70, (
            f"Scale confidence {scale.scale_confidence:.2f} < 0.70 "
            f"(factor={scale.scale_factor}, source={scale.source})"
        )
        assert abs(scale.scale_factor - 0.75) < 0.1, (
            f"Expected ~0.75 pts/inch (1/8\"=1'-0\"), got {scale.scale_factor}"
        )

    @pytest.mark.skipif(not HAS_REAL_PDF, reason="No test_elevation.pdf")
    def test_S2_08_mclarty_page0_scale_detected(self):
        """Scale detection on McLarty A1.0 cover page also works."""
        import fitz
        doc = fitz.open(REAL_PDF_PATH)
        page = doc[0]
        scale = detect_scale(page)
        doc.close()
        assert scale.scale_confidence >= 0.50, (
            f"Scale confidence {scale.scale_confidence:.2f} < 0.50"
        )


# ═══════════════════════════════════════════════════════════════════════════════
# FIX 2 TESTS — Hatch Fill Filtering
# ═══════════════════════════════════════════════════════════════════════════════

class TestHatchFiltering:
    """Crosshatch fill patterns must be detected and removed from elevation paths."""

    def test_S2_09_short_45deg_is_hatch(self):
        """A 5pt segment at 45° should be classified as hatch."""
        seg = ((100.0, 100.0), (103.54, 103.54))  # ~5pt at 45°
        assert is_hatch_segment(seg) is True

    def test_S2_10_short_135deg_is_hatch(self):
        """A 5pt segment at 135° should be classified as hatch."""
        seg = ((100.0, 100.0), (96.46, 103.54))  # ~5pt at 135°
        assert is_hatch_segment(seg) is True

    def test_S2_11_horizontal_not_hatch(self):
        """A horizontal segment is NOT hatch regardless of length."""
        seg = ((100.0, 100.0), (105.0, 100.0))  # 5pt horizontal
        assert is_hatch_segment(seg) is False

    def test_S2_12_vertical_not_hatch(self):
        """A vertical segment is NOT hatch regardless of length."""
        seg = ((100.0, 100.0), (100.0, 105.0))  # 5pt vertical
        assert is_hatch_segment(seg) is False

    def test_S2_13_long_diagonal_not_hatch(self):
        """A long diagonal (structural brace, dimension line) should NOT be hatch."""
        # 100pt segment at 45° — too long for hatch
        seg = ((100.0, 100.0), (170.71, 170.71))
        assert is_hatch_segment(seg) is False

    def test_S2_14_near_orthogonal_not_hatch(self):
        """Segments within HATCH_ANGLE_TOLERANCE of orthogonal are preserved."""
        # 5pt segment at 3° — nearly horizontal
        seg = ((100.0, 100.0), (105.0, 100.26))  # ~3°
        assert is_hatch_segment(seg) is False

    def test_S2_15_filter_removes_hatch_keeps_frame(self):
        """filter_hatch_segments removes diagonal short lines but keeps orthogonal."""
        segments = [
            ((0, 0), (100, 0)),        # horizontal frame line — keep
            ((0, 0), (0, 100)),        # vertical mullion — keep
            ((10, 10), (13.54, 13.54)),  # short 45° hatch — remove
            ((20, 20), (16.46, 23.54)),  # short 135° hatch — remove
            ((50, 0), (50, 100)),      # vertical mullion — keep
        ]
        filtered = filter_hatch_segments(segments)
        assert len(filtered) == 3, f"Expected 3 segments after filter, got {len(filtered)}"

    @pytest.mark.skipif(not HAS_REAL_PDF, reason="No test_elevation.pdf")
    def test_S2_16_real_pdf_hatch_reduction(self):
        """Elevation normalization with hatch filter should reduce segment count significantly."""
        import fitz
        doc = fitz.open(REAL_PDF_PATH)
        page = doc[7]
        paths = normalize_elevation(page)
        doc.close()

        total_segments = sum(len(p.segments) for p in paths)
        # Before hatch filter: ~16,000 segments. After: should be substantially fewer.
        # We don't know the exact number, but it should drop by at least 30%.
        assert total_segments < 12000, (
            f"Expected <12,000 segments after hatch filter, got {total_segments}. "
            f"Hatch filter may not be working."
        )
        # But not TOO few — we need the real geometry
        assert total_segments > 2000, (
            f"Only {total_segments} segments — filter may be too aggressive"
        )


# ═══════════════════════════════════════════════════════════════════════════════
# INTEGRATION TEST — Full Pipeline Sprint 2 Gate
# ═══════════════════════════════════════════════════════════════════════════════

class TestSprint2Gate:
    """Sprint 2 pass condition: confidence >= 0.70 with classified system type."""

    @pytest.mark.skipif(not HAS_REAL_PDF, reason="No test_elevation.pdf")
    def test_S2_17_pipeline_produces_accepted_candidate(self):
        """
        Full pipeline on McLarty page 7 must produce at least one candidate
        with confidence >= 0.70 and a system type that is not 'unclassified'
        or 'unknown'.
        """
        graph = extract_vector_graph(REAL_PDF_PATH, 6, sheet_type="elevation")
        assert graph.is_valid, f"Graph invalid: {graph.validation_errors}"
        assert graph.scale.scale_confidence >= 0.70, (
            f"Scale confidence too low: {graph.scale.scale_confidence}"
        )

        candidates = run_rules_engine(
            x=graph.x,
            edge_index=graph.edge_index,
            edge_attr=graph.edge_attr,
            scale_factor=graph.scale.scale_factor,
            scale_confidence=graph.scale.scale_confidence,
            source_sheet="McLartyMazda_p7"
        )

        accepted = [c for c in candidates if c.confidence >= 0.70]
        classified = [
            c for c in accepted
            if c.system_hint not in ("unknown", "unclassified", "")
        ]

        assert len(accepted) > 0, (
            f"No candidates with confidence >= 0.70. "
            f"Best: {max(c.confidence for c in candidates) if candidates else 'N/A'}"
        )
        assert len(classified) > 0, (
            f"Got {len(accepted)} high-confidence candidates but none classified. "
            f"System hints: {set(c.system_hint for c in accepted)}"
        )
