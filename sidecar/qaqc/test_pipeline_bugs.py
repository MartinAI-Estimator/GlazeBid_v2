"""
test_pipeline_bugs.py

Regression tests for two pipeline bugs fixed on 2026-04-12:

Bug 1: Out-of-bounds nodes in layer2_extractor.py were treated as hard
        validation errors, causing detect-glazing to return 0 candidates
        for any page with paths extending beyond the page mediabox.
        FIX: Demoted bounds check from error to warning.

Bug 2: None values in edge_attr crashed math.isfinite() in the NaN/Inf
        validator, causing TypeError on several pages.
        FIX: Added None-guard to the isfinite check.

Run with:
    cd sidecar
    pytest qaqc/test_pipeline_bugs.py -v
"""

import math
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from layers.layer2_extractor import (
    validate_graph,
    GraphData,
    ScaleCalibration,
)


def _make_graph(
    nodes, edges_src, edges_dst, edge_attr,
    page_w=612.0, page_h=792.0
):
    """Helper to build a minimal GraphData for testing validation."""
    g = GraphData(
        x=nodes,
        edge_index=[edges_src, edges_dst],
        edge_attr=edge_attr,
        node_count=len(nodes),
        edge_count=len(edges_src),
        page_width_pts=page_w,
        page_height_pts=page_h,
        scale=ScaleCalibration(scale_factor=0.75, scale_confidence=0.90, source="test"),
    )
    return g


def _make_valid_graph_with_oob(oob_nodes, page_w=612.0, page_h=792.0):
    """Build a graph with enough nodes/edges to pass min-count checks,
    plus extra OOB nodes for bounds testing."""
    # 25 in-bounds nodes in a grid, connected as a chain (25 edges)
    base_nodes = [[float(50 + i * 20), float(50 + i * 20)] for i in range(25)]
    base_src = list(range(24))
    base_dst = list(range(1, 25))
    base_attr = [[30.0, 0.5, 1.0, 0.0] for _ in range(24)]

    all_nodes = base_nodes + oob_nodes
    extra_src = [24 + i for i in range(len(oob_nodes) - 1)] if len(oob_nodes) > 1 else [0]
    extra_dst = [25 + i for i in range(len(oob_nodes) - 1)] if len(oob_nodes) > 1 else [len(all_nodes) - 1]
    extra_attr = [[30.0, 0.5, 1.0, 0.0] for _ in extra_src]

    return _make_graph(
        nodes=all_nodes,
        edges_src=base_src + extra_src,
        edges_dst=base_dst + extra_dst,
        edge_attr=base_attr + extra_attr,
        page_w=page_w,
        page_h=page_h,
    )


# ── Bug 1: Out-of-bounds nodes → warning, not error ─────────────────────────

class TestBug1_OutOfBoundsNodes:
    """Nodes exceeding page bounds should produce warnings, not errors."""

    def test_oob_nodes_still_valid(self):
        """Graph with OOB nodes should remain is_valid=True."""
        g = _make_valid_graph_with_oob([[700.0, 900.0]])
        result = validate_graph(g)
        assert result.is_valid is True, \
            f"Expected is_valid=True, got errors: {result.validation_errors}"

    def test_oob_nodes_produce_warnings(self):
        """Graph with OOB nodes should have appropriate warnings."""
        g = _make_valid_graph_with_oob([[700.0, 10.0], [10.0, 900.0]])
        result = validate_graph(g)
        assert any("exceeds page width" in w for w in result.validation_warnings)
        assert any("exceeds page height" in w for w in result.validation_warnings)

    def test_oob_x_only(self):
        """Only X exceeds — warning about width, not height."""
        g = _make_valid_graph_with_oob([[700.0, 500.0]])
        result = validate_graph(g)
        assert result.is_valid is True
        assert any("exceeds page width" in w for w in result.validation_warnings)
        assert not any("exceeds page height" in w for w in result.validation_warnings)

    def test_within_bounds_no_warnings(self):
        """Nodes within bounds should not produce bounds warnings."""
        g = _make_valid_graph_with_oob([])  # no OOB nodes
        result = validate_graph(g)
        assert result.is_valid is True
        assert not any("exceeds" in w for w in result.validation_warnings)

    def test_oob_does_not_mask_real_errors(self):
        """OOB nodes (warning) + too few nodes (error) = is_valid=False."""
        # Only 2 nodes — below MIN_NODE_COUNT (10)
        nodes = [[10.0, 10.0], [700.0, 900.0]]
        g = _make_graph(
            nodes=nodes,
            edges_src=[0],
            edges_dst=[1],
            edge_attr=[[50.0, 0.5, 1.0, 0.0]],
        )
        result = validate_graph(g)
        assert result.is_valid is False  # too few nodes is a real error
        assert any("exceeds" in w for w in result.validation_warnings)
        assert any("Node count" in e for e in result.validation_errors)


# ── Bug 2: None in edge_attr crashing math.isfinite() ─────────────────────────

class TestBug2_NoneEdgeAttr:
    """None values in edge_attr should not crash validation."""

    def test_none_in_attr_no_crash(self):
        """Edge attr with None values should not raise TypeError."""
        nodes = [[float(i * 10), float(i * 10)] for i in range(15)]
        edges_src = list(range(14))
        edges_dst = list(range(1, 15))
        edge_attr = [[50.0, 0.5, 1.0, None] for _ in range(14)]

        g = _make_graph(nodes=nodes, edges_src=edges_src, edges_dst=edges_dst, edge_attr=edge_attr)
        # Should not raise
        result = validate_graph(g)
        assert isinstance(result, GraphData)

    def test_none_attr_still_passes_if_no_nan(self):
        """None in attr (not NaN) should not produce NaN/Inf errors."""
        nodes = [[float(i * 10), float(i * 10)] for i in range(15)]
        edges_src = list(range(14))
        edges_dst = list(range(1, 15))
        edge_attr = [[50.0, None, 1.0, 0.0] for _ in range(14)]

        g = _make_graph(nodes=nodes, edges_src=edges_src, edges_dst=edges_dst, edge_attr=edge_attr)
        result = validate_graph(g)
        # None is not NaN/Inf, so no NaN error should appear
        assert not any("NaN" in e or "Inf" in e for e in result.validation_errors)

    def test_nan_still_detected(self):
        """Actual NaN values should still be caught."""
        nodes = [[float(i * 10), float(i * 10)] for i in range(15)]
        edges_src = list(range(14))
        edges_dst = list(range(1, 15))
        edge_attr = [[50.0, 0.5, float('nan'), 0.0]] + [[50.0, 0.5, 1.0, 0.0]] * 13

        g = _make_graph(nodes=nodes, edges_src=edges_src, edges_dst=edges_dst, edge_attr=edge_attr)
        result = validate_graph(g)
        assert result.is_valid is False
        assert any("NaN" in e or "Inf" in e for e in result.validation_errors)

    def test_inf_still_detected(self):
        """Actual Inf values should still be caught."""
        nodes = [[float(i * 10), float(i * 10)] for i in range(15)]
        edges_src = list(range(14))
        edges_dst = list(range(1, 15))
        edge_attr = [[50.0, float('inf'), 1.0, 0.0]] + [[50.0, 0.5, 1.0, 0.0]] * 13

        g = _make_graph(nodes=nodes, edges_src=edges_src, edges_dst=edges_dst, edge_attr=edge_attr)
        result = validate_graph(g)
        assert result.is_valid is False
        assert any("NaN" in e or "Inf" in e for e in result.validation_errors)

    def test_all_none_attr(self):
        """Completely None attr lists should not crash."""
        nodes = [[float(i * 10), float(i * 10)] for i in range(15)]
        edges_src = list(range(14))
        edges_dst = list(range(1, 15))
        edge_attr = [[None, None, None, None] for _ in range(14)]

        g = _make_graph(nodes=nodes, edges_src=edges_src, edges_dst=edges_dst, edge_attr=edge_attr)
        result = validate_graph(g)
        # All None = no NaN/Inf → should be valid (if enough nodes/edges)
        assert not any("NaN" in e or "Inf" in e for e in result.validation_errors)
