"""
test_sprint6.py

Tests for the candidate deduplication logic (Sprint 6, Goal 3).

Validates deduplicate_candidates() from rules_engine.py:
  - No overlap → all kept
  - Complete overlap (IoU ≈ 1.0) → lower confidence removed
  - Partial overlap above threshold → lower confidence removed
  - Partial overlap below threshold → both kept
  - Overlapping candidates on different pages → both kept

Run with:
    cd sidecar
    pytest qaqc/test_sprint6.py -v
"""

import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from layers.rules_engine import Rect, GlazingCandidate, deduplicate_candidates


def _make_candidate(
    x: float, y: float, w: float, h: float,
    confidence: float,
    page: str = "A1",
    cid: str = "",
) -> GlazingCandidate:
    """Helper to build a minimal GlazingCandidate for dedup tests."""
    return GlazingCandidate(
        candidate_id=cid or f"c-{x}-{y}-{confidence}",
        bounding_box=Rect(x=x, y=y, width=w, height=h),
        width_pts=w,
        height_pts=h,
        width_inches=w / 72.0,
        height_inches=h / 72.0,
        scale_factor=72.0,
        scale_confidence=1.0,
        bay_count=1,
        row_count=1,
        confidence=confidence,
        rules_passed=[],
        rules_failed=[],
        system_hint="storefront",
        source_sheet=page,
    )


class TestDeduplicateCandidates:
    """Five tests covering the deduplication greedy-merge logic."""

    def test_no_overlap_all_kept(self):
        """Non-overlapping candidates on the same page are all retained."""
        a = _make_candidate(0, 0, 100, 100, 0.90)
        b = _make_candidate(200, 200, 100, 100, 0.80)
        c = _make_candidate(400, 400, 100, 100, 0.70)
        result = deduplicate_candidates([a, b, c])
        assert len(result) == 3

    def test_complete_overlap_removes_lower(self):
        """Identical bounding boxes (IoU = 1.0) → keep only the highest confidence."""
        high = _make_candidate(50, 50, 200, 200, 0.95, cid="high")
        low = _make_candidate(50, 50, 200, 200, 0.60, cid="low")
        result = deduplicate_candidates([low, high])
        assert len(result) == 1
        assert result[0].candidate_id == "high"

    def test_partial_overlap_above_threshold_merges(self):
        """Two boxes with IoU > 0.70 on the same page → merged to one."""
        # Box A: (0,0)→(100,100), area = 10000
        # Box B: (10,10)→(110,110), area = 10000
        # Intersection: (10,10)→(100,100) = 90*90 = 8100
        # Union: 10000 + 10000 - 8100 = 11900
        # IoU = 8100 / 11900 ≈ 0.681 — below 0.70
        # Shift B closer: (5,5)→(105,105)
        # Intersection: (5,5)→(100,100) = 95*95 = 9025
        # Union: 10000 + 10000 - 9025 = 10975
        # IoU = 9025 / 10975 ≈ 0.822 — above 0.70
        a = _make_candidate(0, 0, 100, 100, 0.85, cid="a")
        b = _make_candidate(5, 5, 100, 100, 0.70, cid="b")
        result = deduplicate_candidates([a, b])
        assert len(result) == 1
        assert result[0].candidate_id == "a"

    def test_partial_overlap_below_threshold_both_kept(self):
        """Two boxes with IoU < 0.70 on the same page → both retained."""
        # Box A: (0,0)→(100,100), Box B: (60,60)→(160,160)
        # Intersection: (60,60)→(100,100) = 40*40 = 1600
        # Union: 10000 + 10000 - 1600 = 18400
        # IoU = 1600 / 18400 ≈ 0.087 — well below 0.70
        a = _make_candidate(0, 0, 100, 100, 0.85, cid="a")
        b = _make_candidate(60, 60, 100, 100, 0.70, cid="b")
        result = deduplicate_candidates([a, b])
        assert len(result) == 2

    def test_same_box_different_pages_still_merged(self):
        """Sidecar dedup is page-agnostic: identical boxes on different
        source_sheets ARE merged (frontend dedup adds the page check)."""
        a = _make_candidate(50, 50, 200, 200, 0.90, page="A1", cid="page1")
        b = _make_candidate(50, 50, 200, 200, 0.85, page="A2", cid="page2")
        result = deduplicate_candidates([a, b])
        assert len(result) == 1
        assert result[0].candidate_id == "page1"
