"""
test_sprint4.py

Sprint 4 automated test suite.
Tests three goals:
    Goal 1: Periodicity fix — modal bay spacing instead of mean-all
    Goal 2: Schedule cross-reference — soft match on GlazingCandidate
    Goal 3: Scope filter — layer6_scope_filter.py with JSON profile

Run with:
    cd sidecar
    pytest qaqc/test_sprint4.py -v

Sprint 4 pass condition:
    - At least 3 McLarty A2.0 candidates pass T2.2 periodicity after fix
    - Schedule cross-ref populates schedule_match on matching candidates
    - Scope filter correctly classifies storefront/curtain_wall/hollow_metal
"""

import math
import os
import sys
import json
import tempfile
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from layers.rules_engine import (
    Rect,
    check_periodicity,
    GlazingCandidate,
    PERIODICITY_VARIANCE,
    WEIGHT_PERIODICITY,
    run_rules_engine,
    merge_overlapping_regions,
)
from layers.layer2_extractor import extract_vector_graph

# ── Test Data Path ────────────────────────────────────────────────────────────

TEST_DATA_DIR = os.path.join(os.path.dirname(__file__), "test_data")
REAL_PDF_PATH = os.path.join(TEST_DATA_DIR, "test_elevation.pdf")
HAS_REAL_PDF = os.path.exists(REAL_PDF_PATH)


# ═══════════════════════════════════════════════════════════════════════════════
# GOAL 1 — Periodicity Modal Fix
# ═══════════════════════════════════════════════════════════════════════════════

class TestPeriodicityModalFix:
    """check_periodicity should use modal bay spacing, not mean of all spacings."""

    def test_P01_uniform_spacing_still_passes(self):
        """Evenly spaced bays with identical spacing should pass periodicity.
        5 rects at x = 0, 100, 200, 300, 400 → all spacings = 100."""
        rects = [Rect(x=i * 100, y=100, width=40, height=80) for i in range(5)]
        ok, rule, delta = check_periodicity(rects, rects[2])
        assert ok, f"Uniform spacing should pass: {rule}"
        assert delta == WEIGHT_PERIODICITY

    def test_P02_uniform_spacing_slight_jitter_passes(self):
        """Spacings with <5% jitter should pass.
        Spacings: 100, 98, 102, 100 → max deviation ~2% from mode."""
        xs = [0, 100, 198, 300, 400]
        rects = [Rect(x=x, y=100, width=40, height=80) for x in xs]
        ok, rule, delta = check_periodicity(rects, rects[2])
        assert ok, f"Slight jitter should pass: {rule}"
        assert delta == WEIGHT_PERIODICITY

    def test_P03_merged_assembly_with_gap_now_passes(self):
        """After merge, two sub-assemblies at different gap produce mixed spacings.
        Sub-assembly 1: bays at x=0, 100, 200 (spacing=100)
        Sub-assembly 2: bays at x=350, 450, 550 (spacing=100)
        All spacings: [100, 100, 150, 100, 100]
        Mean-all: 110, max deviation = 150-110 = 40/110 = 36% → FAIL with old code
        Modal: 100 (appears 4 times), only 150 is outlier → 4/5 = 80% → PASS with new code
        """
        xs = [0, 100, 200, 350, 450, 550]
        rects = [Rect(x=x, y=100, width=40, height=80) for x in xs]
        ok, rule, delta = check_periodicity(rects, rects[0])
        assert ok, f"Merged assembly with gap should pass modal check: {rule}"
        assert delta == WEIGHT_PERIODICITY

    def test_P04_truly_random_spacing_still_fails(self):
        """Spacings with no dominant mode should fail.
        xs: 0, 50, 180, 210, 500 → spacings: 50, 130, 30, 290 — no mode."""
        xs = [0, 50, 180, 210, 500]
        rects = [Rect(x=x, y=100, width=20, height=80) for x in xs]
        ok, rule, delta = check_periodicity(rects, rects[0])
        assert not ok, f"Random spacing should fail: {rule}"
        assert delta == 0.0

    def test_P05_two_siblings_insufficient(self):
        """With only 2 other siblings (total 3 including current), treat as
        insufficient and award 0.0 delta but still return True."""
        rects = [Rect(x=i * 100, y=100, width=40, height=80) for i in range(2)]
        target = Rect(x=200, y=100, width=40, height=80)
        ok, rule, delta = check_periodicity(rects + [target], target)
        # With only 2 row mates → insufficient siblings
        # The function should return True with 0 delta
        assert ok, f"Insufficient siblings should not fail: {rule}"

    def test_P06_single_outlier_in_many_bays_passes(self):
        """10 bays at spacing=100, plus 1 gap at 170.
        Modal spacing=100 (9 of 10 spacings). Should pass."""
        xs = [i * 100 for i in range(10)] + [10 * 100 + 70]  # last gap = 170 instead of 100
        rects = [Rect(x=x, y=100, width=30, height=80) for x in xs]
        ok, rule, delta = check_periodicity(rects, rects[0])
        assert ok, f"One outlier in 10 bays should pass modal: {rule}"
        assert delta == WEIGHT_PERIODICITY


class TestPeriodicityGateMcLarty:
    """Gate test: at least 3 McLarty A2.0 candidates pass periodicity after fix."""

    @pytest.mark.skipif(not HAS_REAL_PDF, reason="McLarty PDF not available")
    def test_P07_mclarty_periodicity_pass_rate(self):
        """Run full pipeline on McLarty A2.0 (page 6), count periodicity passes."""
        graph = extract_vector_graph(REAL_PDF_PATH, page_num=6, sheet_type="elevation")
        candidates = run_rules_engine(
            x=graph.x,
            edge_index=graph.edge_index,
            edge_attr=graph.edge_attr,
            source_sheet="A2.0",
            scale_factor=graph.scale.scale_factor,
            scale_confidence=graph.scale.scale_confidence,
        )

        periodicity_passes = sum(
            1 for c in candidates
            if any("T2.2_periodicity" == r for r in c.rules_passed)
        )
        assert periodicity_passes >= 3, (
            f"Only {periodicity_passes} candidates passed periodicity, need >= 3. "
            f"Candidates: {[(c.candidate_id, c.rules_passed, c.rules_failed) for c in candidates[:5]]}"
        )


# ═══════════════════════════════════════════════════════════════════════════════
# GOAL 2 — Schedule Cross-Reference
# ═══════════════════════════════════════════════════════════════════════════════

class TestScheduleCrossReference:
    """Schedule inventory should be soft-matched onto candidates."""

    def test_SCH01_candidate_has_schedule_match_field(self):
        """GlazingCandidate must have a schedule_match field."""
        c = GlazingCandidate(
            candidate_id="test",
            bounding_box=Rect(0, 0, 100, 100),
            width_pts=100, height_pts=100,
            width_inches=60, height_inches=84,
            scale_factor=3.0, scale_confidence=1.0,
            bay_count=1, row_count=1,
            confidence=0.5, rules_passed=[], rules_failed=[],
            system_hint="storefront", source_sheet="A2.0",
        )
        assert hasattr(c, "schedule_match"), "GlazingCandidate must have schedule_match field"

    def test_SCH02_match_schedule_by_dimensions(self):
        """match_schedule_to_candidates should match when dims are within tolerance."""
        from layers.rules_engine import match_schedule_to_candidates
        from layers.layer3_schedule_parser import ScheduleEntry

        candidate = GlazingCandidate(
            candidate_id="test-1",
            bounding_box=Rect(0, 0, 180, 252),
            width_pts=180, height_pts=252,
            width_inches=60.0, height_inches=84.0,  # 5' × 7'
            scale_factor=3.0, scale_confidence=1.0,
            bay_count=1, row_count=1,
            confidence=0.65, rules_passed=[], rules_failed=[],
            system_hint="storefront", source_sheet="A2.0",
        )

        inventory = {
            "A1": ScheduleEntry(mark="A1", width_in=60.0, height_in=84.0, qty=5,
                                system_type="storefront", description="5x7 SF"),
        }

        results = match_schedule_to_candidates([candidate], inventory)
        assert results[0].schedule_match is not None, "Should match exact dimensions"
        assert results[0].schedule_match["mark"] == "A1"

    def test_SCH03_no_match_when_dimensions_differ(self):
        """No match when dimensions differ by more than 20%."""
        from layers.rules_engine import match_schedule_to_candidates
        from layers.layer3_schedule_parser import ScheduleEntry

        candidate = GlazingCandidate(
            candidate_id="test-2",
            bounding_box=Rect(0, 0, 180, 252),
            width_pts=180, height_pts=252,
            width_inches=60.0, height_inches=84.0,
            scale_factor=3.0, scale_confidence=1.0,
            bay_count=1, row_count=1,
            confidence=0.65, rules_passed=[], rules_failed=[],
            system_hint="storefront", source_sheet="A2.0",
        )

        inventory = {
            "B1": ScheduleEntry(mark="B1", width_in=36.0, height_in=36.0, qty=2,
                                system_type="window", description="3x3 window"),
        }

        results = match_schedule_to_candidates([candidate], inventory)
        assert results[0].schedule_match is None, "Should not match different dimensions"

    def test_SCH04_no_crash_on_zero_dimensions(self):
        """Candidates with zero dimensions (no scale) should not crash."""
        from layers.rules_engine import match_schedule_to_candidates
        from layers.layer3_schedule_parser import ScheduleEntry

        candidate = GlazingCandidate(
            candidate_id="test-3",
            bounding_box=Rect(0, 0, 180, 252),
            width_pts=180, height_pts=252,
            width_inches=0.0, height_inches=0.0,  # No scale
            scale_factor=0.0, scale_confidence=0.0,
            bay_count=1, row_count=1,
            confidence=0.45, rules_passed=[], rules_failed=[],
            system_hint="unknown", source_sheet="A2.0",
        )

        inventory = {
            "A1": ScheduleEntry(mark="A1", width_in=60.0, height_in=84.0),
        }

        results = match_schedule_to_candidates([candidate], inventory)
        assert results[0].schedule_match is None, "No match when candidate has no scale"


# ═══════════════════════════════════════════════════════════════════════════════
# GOAL 3 — Scope Filter
# ═══════════════════════════════════════════════════════════════════════════════

class TestScopeFilter:
    """layer6_scope_filter.py tests."""

    def test_SF01_storefront_in_scope(self):
        """Storefront candidates should be in_scope by default."""
        from layers.layer6_scope_filter import filter_by_scope

        candidate = GlazingCandidate(
            candidate_id="sf-1",
            bounding_box=Rect(0, 0, 300, 270),
            width_pts=300, height_pts=270,
            width_inches=100.0, height_inches=90.0,
            scale_factor=3.0, scale_confidence=1.0,
            bay_count=3, row_count=1,
            confidence=0.75, rules_passed=[], rules_failed=[],
            system_hint="storefront", source_sheet="A2.0",
        )

        results = filter_by_scope([candidate])
        assert results[0]["scope"] == "in_scope"

    def test_SF02_curtain_wall_in_scope(self):
        """Curtain wall candidates should be in_scope by default."""
        from layers.layer6_scope_filter import filter_by_scope

        candidate = GlazingCandidate(
            candidate_id="cw-1",
            bounding_box=Rect(0, 0, 600, 300),
            width_pts=600, height_pts=300,
            width_inches=200.0, height_inches=100.0,
            scale_factor=3.0, scale_confidence=1.0,
            bay_count=5, row_count=1,
            confidence=0.80, rules_passed=[], rules_failed=[],
            system_hint="curtain_wall", source_sheet="A2.0",
        )

        results = filter_by_scope([candidate])
        assert results[0]["scope"] == "in_scope"

    def test_SF03_unknown_goes_to_review(self):
        """Unknown system type should be scope_review."""
        from layers.layer6_scope_filter import filter_by_scope

        candidate = GlazingCandidate(
            candidate_id="unk-1",
            bounding_box=Rect(0, 0, 100, 100),
            width_pts=100, height_pts=100,
            width_inches=30.0, height_inches=30.0,
            scale_factor=3.0, scale_confidence=1.0,
            bay_count=1, row_count=1,
            confidence=0.55, rules_passed=[], rules_failed=[],
            system_hint="unknown", source_sheet="A2.0",
        )

        results = filter_by_scope([candidate])
        assert results[0]["scope"] == "scope_review"

    def test_SF04_custom_profile_excludes(self):
        """Custom profile can exclude specific system types."""
        from layers.layer6_scope_filter import filter_by_scope

        candidate = GlazingCandidate(
            candidate_id="sf-excluded",
            bounding_box=Rect(0, 0, 300, 270),
            width_pts=300, height_pts=270,
            width_inches=100.0, height_inches=90.0,
            scale_factor=3.0, scale_confidence=1.0,
            bay_count=3, row_count=1,
            confidence=0.75, rules_passed=[], rules_failed=[],
            system_hint="storefront", source_sheet="A2.0",
        )

        profile = {"excluded_systems": ["storefront"]}
        results = filter_by_scope([candidate], profile=profile)
        assert results[0]["scope"] == "out_of_scope"

    def test_SF05_schedule_match_hollow_metal_excluded(self):
        """Candidates with schedule_match to hollow_metal should be out_of_scope."""
        from layers.layer6_scope_filter import filter_by_scope

        candidate = GlazingCandidate(
            candidate_id="hm-1",
            bounding_box=Rect(0, 0, 120, 252),
            width_pts=120, height_pts=252,
            width_inches=40.0, height_inches=84.0,
            scale_factor=3.0, scale_confidence=1.0,
            bay_count=1, row_count=1,
            confidence=0.60, rules_passed=[], rules_failed=[],
            system_hint="unknown", source_sheet="A2.0",
            schedule_match={"mark": "D1", "system_type": "hollow_metal"},
        )

        results = filter_by_scope([candidate])
        assert results[0]["scope"] == "out_of_scope"

    def test_SF06_load_profile_from_json(self):
        """Scope profile should load from a JSON file."""
        from layers.layer6_scope_filter import load_scope_profile

        profile = load_scope_profile()
        assert "excluded_systems" in profile
        assert "included_systems" in profile
        assert isinstance(profile["excluded_systems"], list)
        assert isinstance(profile["included_systems"], list)

    def test_SF07_empty_candidates_returns_empty(self):
        """Empty input returns empty output."""
        from layers.layer6_scope_filter import filter_by_scope
        results = filter_by_scope([])
        assert results == []
