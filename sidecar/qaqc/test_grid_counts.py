"""
tests/test_grid_counts.py — bay_count / row_count extraction (Money Bridge intake).

Draws real vector storefront grids into a PDF, runs the page through the same
layer2 extractor the pipeline uses, and checks that geometry_anchoring reports
the grid the estimator would count by eye.  Also pins the text-hint parser and
the geometry-vs-vision resolution rule.

Run from sidecar/:   python -m pytest qaqc/test_grid_counts.py -q
"""
from __future__ import annotations

import os
import sys
import tempfile

import fitz
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))          # sidecar/ on path → layers, glazierai

from glazierai.modules.drawing_intelligence.geometry_anchoring import (  # noqa: E402
    annotate_grid_counts, count_grid_lines, grid_hint_from_text, resolve_grid,
)


# ── helpers ───────────────────────────────────────────────────────────────────

def _draw_grid(page: fitz.Page, x0: float, y0: float, w: float, h: float, bays: int, rows: int, stroke=1.2):
    """Outer frame + interior mullions, as an architect's elevation draws them."""
    shape = page.new_shape()
    shape.draw_rect(fitz.Rect(x0, y0, x0 + w, y0 + h))
    for i in range(1, bays):
        x = x0 + w * i / bays
        shape.draw_line(fitz.Point(x, y0), fitz.Point(x, y0 + h))
    for j in range(1, rows):
        y = y0 + h * j / rows
        shape.draw_line(fitz.Point(x0, y), fitz.Point(x0 + w, y))
    shape.finish(width=stroke, color=(0, 0, 0))
    shape.commit()


def _make_pdf(frames):
    """frames: list of (x0, y0, w, h, bays, rows).  Returns a temp PDF path."""
    doc = fitz.open()
    page = doc.new_page(width=1224, height=792)         # 17×11 landscape
    # Enough stray geometry that layer2 accepts the page (node_count ≥ 10)
    sh = page.new_shape()
    for k in range(12):
        sh.draw_line(fitz.Point(40 + k * 8, 740), fitz.Point(40 + k * 8, 760))
    sh.finish(width=0.5, color=(0, 0, 0))
    sh.commit()
    for f in frames:
        _draw_grid(page, *f)
    fd, path = tempfile.mkstemp(suffix=".pdf")
    os.close(fd)
    doc.save(path)
    doc.close()
    return path


# ── text hints ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("text,expected", [
    ("3 bays × 2 rows storefront", (3, 2)),
    ("4 bay x 1 row, Kawneer 451T", (4, 1)),
    ("Storefront 3x2 grid, SF-1", (3, 2)),
    ("Frameless partition, 5 equal panels, butt jointed", (5, None)),
    ("6 lites wide, 2 lites high", (6, 2)),
    ("2 rows high transom", (None, 2)),
    ("Aluminum entrance with sidelite", (None, None)),
    ("", (None, None)),
    ("99 bays", (None, None)),          # > MAX_GRID_COUNT → unusable
])
def test_grid_hint_from_text(text, expected):
    assert grid_hint_from_text(text) == expected


# ── resolution rule ───────────────────────────────────────────────────────────

def test_resolve_grid_geometry_wins_when_it_saw_divisions():
    assert resolve_grid(3, 2, 5, 4) == (3, 2, "geometry")


def test_resolve_grid_vision_overrides_a_blank_geometry_read():
    # geometry saw no mullions (1) — a raster page or a faint drawing — vision said 4
    assert resolve_grid(1, 1, 4, 2) == (4, 2, "vision")


def test_resolve_grid_mixed_axes():
    assert resolve_grid(3, 1, None, 2) == (3, 2, "geometry+vision")


def test_resolve_grid_defaults_to_1x1():
    assert resolve_grid(None, None, None, None) == (1, 1, "default")


def test_resolve_grid_rejects_garbage():
    assert resolve_grid("x", -2, 0, 500) == (1, 1, "default")


# ── geometry on a real vector page ───────────────────────────────────────────

def test_count_grid_lines_direct():
    # 3 interior verticals + 1 interior horizontal inside a 400×200 box
    rect = fitz.Rect(100, 100, 500, 300)
    x = [[100, 100], [100, 300], [500, 100], [500, 300],   # jambs (excluded)
         [200, 100], [200, 300], [300, 100], [300, 300], [400, 100], [400, 300],
         [100, 200], [500, 200],                             # one horizontal
         [250, 150], [250, 170]]                             # short tick — ignored
    edge_index = [[0, 2, 4, 6, 8, 10, 12], [1, 3, 5, 7, 9, 11, 13]]
    edge_attr = [[0, 0, 0, 0]] * 7
    assert count_grid_lines(rect, x, edge_index, edge_attr) == (4, 2)


def test_count_grid_lines_ignores_frame_head_inside_an_inflated_box():
    # The rules engine sometimes merges the callout hexagon above a frame into
    # the candidate box.  The frame's real head line is then INSIDE the box,
    # but nothing crosses it — it must not count as a row division.
    box = fitz.Rect(100, 60, 500, 300)                  # frame is 100..500 × 100..300
    x = [[100, 100], [100, 300], [500, 100], [500, 300],  # jambs
         [100, 100], [500, 100],                            # head (now interior to box)
         [100, 300], [500, 300],                            # sill
         [100, 200], [500, 200],                            # real interior horizontal
         [300, 100], [300, 300]]                            # real interior vertical
    edge_index = [[0, 2, 4, 6, 8, 10], [1, 3, 5, 7, 9, 11]]
    edge_attr = [[0, 0, 0, 0]] * 6
    assert count_grid_lines(box, x, edge_index, edge_attr) == (2, 2)


def test_annotate_grid_counts_reads_a_3x2_storefront():
    path = _make_pdf([(150, 150, 480, 240, 3, 2)])
    try:
        dets = [{"bbox": [150, 150, 630, 390], "description": "", "bay_count": None, "row_count": None}]
        annotate_grid_counts(path, 0, dets)
    finally:
        os.unlink(path)
    d = dets[0]
    assert (d["bay_count"], d["row_count"]) == (3, 2), d
    assert d["grid_source"] == "geometry"


def test_annotate_grid_counts_two_frames_independent():
    path = _make_pdf([(100, 100, 300, 200, 4, 1), (600, 100, 400, 300, 2, 3)])
    try:
        dets = [
            {"bbox": [100, 100, 400, 300], "description": "4 bays"},
            {"bbox": [600, 100, 1000, 400], "description": ""},
        ]
        annotate_grid_counts(path, 0, dets)
    finally:
        os.unlink(path)
    assert (dets[0]["bay_count"], dets[0]["row_count"]) == (4, 1)
    assert (dets[1]["bay_count"], dets[1]["row_count"]) == (2, 3)
    assert dets[0]["grid_source"] == "geometry"


def test_annotate_grid_counts_single_lite_falls_back_to_vision_then_default():
    path = _make_pdf([(150, 150, 200, 200, 1, 1)])
    try:
        dets = [
            {"bbox": [150, 150, 350, 350], "description": "3 bays × 1 row"},   # vision says 3
            {"bbox": [150, 150, 350, 350], "description": "single lite"},       # nothing → 1×1
        ]
        annotate_grid_counts(path, 0, dets)
    finally:
        os.unlink(path)
    assert (dets[0]["bay_count"], dets[0]["row_count"]) == (3, 1)
    assert dets[0]["grid_source"] == "vision"
    assert (dets[1]["bay_count"], dets[1]["row_count"]) == (1, 1)
    assert dets[1]["grid_source"] == "default"


def test_annotate_grid_counts_survives_a_bad_page():
    dets = [{"bbox": [0, 0, 10, 10], "bay_count": "2", "row_count": 1.0}]
    annotate_grid_counts("/nonexistent/file.pdf", 0, dets)
    assert (dets[0]["bay_count"], dets[0]["row_count"], dets[0]["grid_source"]) == (2, 1, "vision")


def test_annotate_grid_counts_empty_list_noop():
    assert annotate_grid_counts("/nonexistent/file.pdf", 0, []) == []
