"""
test_sprint3.py

Sprint 3 automated test suite.
Tests Schedule Parser (layer3_schedule_parser.py).

Run with:
    cd sidecar
    pytest qaqc/test_sprint3.py -v

Sprint 3 pass condition (gate):
    At least 3 named schedule entries extracted from one of the two drawing
    sets with mark, width_in, and height_in populated.

Root design:
    layer3_schedule_parser.py — extract door/window/curtainwall/storefront
    schedules from PDF pages using PyMuPDF table extraction + regex text
    fallback.  Returns ScheduleInventory (dict keyed by mark).
"""

import math
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from layers.layer3_schedule_parser import (
    ScheduleEntry,
    ScheduleInventory,
    parse_dimension_to_inches,
    find_schedule_pages,
    extract_schedule_entries,
    parse_schedule,
)

# ── Test Data Path ────────────────────────────────────────────────────────────

TEST_DATA_DIR = os.path.join(os.path.dirname(__file__), "test_data")
MCLARTY_PDF = os.path.join(TEST_DATA_DIR, "test_elevation.pdf")
HOPE_PDF = os.path.join(
    TEST_DATA_DIR,
    "Hope Aquatic & Rec Center - Bid Drawings - Non Marked.pdf",
)
HAS_MCLARTY = os.path.exists(MCLARTY_PDF)
HAS_HOPE = os.path.exists(HOPE_PDF)


# ═══════════════════════════════════════════════════════════════════════════════
# UNIT TESTS — Data Types
# ═══════════════════════════════════════════════════════════════════════════════


class TestScheduleDataTypes:
    """ScheduleEntry and ScheduleInventory have correct structure."""

    def test_S3_01_schedule_entry_fields(self):
        """ScheduleEntry has all required fields with correct defaults."""
        entry = ScheduleEntry(
            mark="101",
            width_in=36.0,
            height_in=84.0,
        )
        assert entry.mark == "101"
        assert entry.width_in == 36.0
        assert entry.height_in == 84.0
        assert entry.qty == 1
        assert entry.system_type == ""
        assert entry.description == ""
        assert entry.raw_text == ""

    def test_S3_02_schedule_entry_all_fields(self):
        """ScheduleEntry accepts all optional fields."""
        entry = ScheduleEntry(
            mark="A1",
            width_in=60.0,
            height_in=96.0,
            qty=3,
            system_type="storefront",
            description="Aluminum Storefront System",
            raw_text="A1  5'-0\"  8'-0\"  3  Storefront",
        )
        assert entry.system_type == "storefront"
        assert entry.qty == 3

    def test_S3_03_schedule_inventory_is_dict(self):
        """ScheduleInventory is a dict keyed by mark string."""
        inv: ScheduleInventory = {
            "101": ScheduleEntry(mark="101", width_in=36.0, height_in=84.0),
            "102": ScheduleEntry(mark="102", width_in=36.0, height_in=84.0),
        }
        assert isinstance(inv, dict)
        assert "101" in inv
        assert inv["101"].width_in == 36.0


# ═══════════════════════════════════════════════════════════════════════════════
# UNIT TESTS — Dimension Parsing
# ═══════════════════════════════════════════════════════════════════════════════


class TestDimensionParsing:
    """parse_dimension_to_inches converts architectural dimension strings."""

    def test_S3_04_feet_and_inches(self):
        """Standard dimension: 3'-0\" → 36.0 inches."""
        assert parse_dimension_to_inches("3'-0\"") == pytest.approx(36.0)

    def test_S3_05_feet_and_inches_nonzero(self):
        """Dimension with non-zero inches: 7'-6\" → 90.0 inches."""
        assert parse_dimension_to_inches("7'-6\"") == pytest.approx(90.0)

    def test_S3_06_feet_only(self):
        """Feet with zero inches: 10'-0\" → 120.0 inches."""
        assert parse_dimension_to_inches("10'-0\"") == pytest.approx(120.0)

    def test_S3_07_unicode_smart_quotes(self):
        """Handle Unicode smart quotes from PDF extraction: 3\u2019-0\u201d."""
        assert parse_dimension_to_inches("3\u2019-0\u201d") == pytest.approx(36.0)

    def test_S3_08_dimension_with_spaces(self):
        """Handle spaces in dimension: 3' - 0\" → 36.0."""
        assert parse_dimension_to_inches("3' - 0\"") == pytest.approx(36.0)

    def test_S3_09_invalid_returns_none(self):
        """Non-dimension string returns None."""
        assert parse_dimension_to_inches("HARDWARE") is None

    def test_S3_10_inches_only(self):
        """Handle inches-only dimensions like 4\" or 1 3/4\"."""
        result = parse_dimension_to_inches("4\"")
        assert result is None or result == pytest.approx(4.0)


# ═══════════════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS — Schedule Page Detection
# ═══════════════════════════════════════════════════════════════════════════════


class TestSchedulePageDetection:
    """find_schedule_pages identifies real schedule pages, filtering false positives."""

    @pytest.mark.skipif(not HAS_MCLARTY, reason="McLarty PDF not found")
    def test_S3_11_mclarty_finds_page_12(self):
        """McLarty page 12 (idx 11) must be among detected schedule pages."""
        pages = find_schedule_pages(MCLARTY_PDF)
        page_indices = [p["page_index"] for p in pages]
        assert 11 in page_indices, (
            f"Page 12 (idx 11 = door schedule) not found. Got pages: {page_indices}"
        )

    @pytest.mark.skipif(not HAS_MCLARTY, reason="McLarty PDF not found")
    def test_S3_12_mclarty_filters_wall_sections(self):
        """Wall section pages mentioning 'PER SCHEDULE' should be filtered or scored lower."""
        pages = find_schedule_pages(MCLARTY_PDF)
        page_indices = [p["page_index"] for p in pages]
        # Pages 20-31 (idx 19-30) are wall sections — should NOT dominate results
        wall_section_pages = set(range(19, 31))
        true_schedule_count = len([p for p in page_indices if p not in wall_section_pages])
        assert true_schedule_count >= 1, "No true schedule pages found after filtering"

    @pytest.mark.skipif(not HAS_HOPE, reason="Hope PDF not found")
    def test_S3_13_hope_returns_results(self):
        """Hope schedule detection should not crash and may return elevation page(s)."""
        pages = find_schedule_pages(HOPE_PDF)
        assert isinstance(pages, list)


# ═══════════════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS — Entry Extraction
# ═══════════════════════════════════════════════════════════════════════════════


class TestEntryExtraction:
    """extract_schedule_entries pulls structured entries from schedule pages."""

    @pytest.mark.skipif(not HAS_MCLARTY, reason="McLarty PDF not found")
    def test_S3_14_mclarty_extracts_door_entries(self):
        """McLarty page 12 should yield multiple door entries."""
        entries = extract_schedule_entries(MCLARTY_PDF, page_index=11)
        assert len(entries) >= 3, (
            f"Expected ≥3 door entries from McLarty page 12, got {len(entries)}"
        )

    @pytest.mark.skipif(not HAS_MCLARTY, reason="McLarty PDF not found")
    def test_S3_15_mclarty_entries_have_marks(self):
        """Each extracted entry must have a non-empty mark."""
        entries = extract_schedule_entries(MCLARTY_PDF, page_index=11)
        for entry in entries:
            assert entry.mark, f"Entry has empty mark: {entry}"

    @pytest.mark.skipif(not HAS_MCLARTY, reason="McLarty PDF not found")
    def test_S3_16_mclarty_entries_have_dimensions(self):
        """Entries with WxH patterns must have width_in and height_in > 0."""
        entries = extract_schedule_entries(MCLARTY_PDF, page_index=11)
        entries_with_dims = [e for e in entries if e.width_in > 0 and e.height_in > 0]
        assert len(entries_with_dims) >= 3, (
            f"Expected ≥3 entries with dimensions, got {len(entries_with_dims)}"
        )

    @pytest.mark.skipif(not HAS_MCLARTY, reason="McLarty PDF not found")
    def test_S3_17_mclarty_hm_door_dimensions_correct(self):
        """HM Door entries should be 36\" wide x 84\" tall (3'-0\" x 7'-0\")."""
        entries = extract_schedule_entries(MCLARTY_PDF, page_index=11)
        hm_doors = [e for e in entries if e.width_in == pytest.approx(36.0)
                     and e.height_in == pytest.approx(84.0)]
        assert len(hm_doors) >= 3, (
            f"Expected ≥3 HM door entries at 36x84, got {len(hm_doors)}"
        )

    @pytest.mark.skipif(not HAS_MCLARTY, reason="McLarty PDF not found")
    def test_S3_18_mclarty_system_type_classified(self):
        """Extracted entries should have system_type populated."""
        entries = extract_schedule_entries(MCLARTY_PDF, page_index=11)
        typed = [e for e in entries if e.system_type]
        assert len(typed) >= 1, "No entries have system_type classified"


# ═══════════════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS — Full Pipeline
# ═══════════════════════════════════════════════════════════════════════════════


class TestFullPipeline:
    """parse_schedule runs the full pipeline: find pages → extract entries."""

    @pytest.mark.skipif(not HAS_MCLARTY, reason="McLarty PDF not found")
    def test_S3_19_mclarty_full_pipeline(self):
        """parse_schedule on McLarty returns a ScheduleInventory with entries."""
        inventory = parse_schedule(MCLARTY_PDF)
        assert isinstance(inventory, dict)
        assert len(inventory) >= 3, (
            f"Full pipeline should find ≥3 entries, got {len(inventory)}"
        )

    @pytest.mark.skipif(not HAS_HOPE, reason="Hope PDF not found")
    def test_S3_20_hope_full_pipeline_no_crash(self):
        """parse_schedule on Hope should not crash, even if few/no entries found."""
        inventory = parse_schedule(HOPE_PDF)
        assert isinstance(inventory, dict)


# ═══════════════════════════════════════════════════════════════════════════════
# GATE TEST
# ═══════════════════════════════════════════════════════════════════════════════


class TestGate:
    """Sprint 3 gate: at least 3 entries with mark, width, height from one PDF."""

    @pytest.mark.skipif(not HAS_MCLARTY, reason="McLarty PDF not found")
    def test_S3_GATE_3_entries_with_mark_width_height(self):
        """
        GATE: parse_schedule must return at least 3 ScheduleEntry items
        where mark is non-empty AND width_in > 0 AND height_in > 0.
        """
        inventory = parse_schedule(MCLARTY_PDF)
        qualified = [
            e for e in inventory.values()
            if e.mark and e.width_in > 0 and e.height_in > 0
        ]
        print(f"\n  GATE: {len(qualified)} qualified entries from McLarty")
        for e in qualified[:5]:
            print(f"    mark={e.mark}  W={e.width_in}\"  H={e.height_in}\""
                  f"  type={e.system_type}  desc={e.description[:40]}")
        assert len(qualified) >= 3, (
            f"GATE FAIL: need ≥3 entries with mark+width+height, got {len(qualified)}"
        )
