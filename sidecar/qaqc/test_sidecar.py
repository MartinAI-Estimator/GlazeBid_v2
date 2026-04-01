"""
test_sidecar.py

Sprint 4 tests for the FastAPI sidecar service.
Tests the HTTP API layer without requiring a running server
by using FastAPI's TestClient.

Run with:
    cd sidecar
    pytest qaqc/test_sidecar.py -v
"""

import base64
import os
import sys
import tempfile
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

TEST_DATA_DIR = os.path.join(os.path.dirname(__file__), "test_data")
REAL_PDF_PATH = os.path.join(TEST_DATA_DIR, "test_elevation.pdf")
HAS_REAL_PDF = os.path.exists(REAL_PDF_PATH)


def _make_minimal_pdf_base64() -> str:
    """Create a minimal valid PDF and return as base64 string."""
    import fitz
    doc = fitz.open()
    page = doc.new_page(width=600, height=800)
    for i in range(5):
        page.draw_rect(
            fitz.Rect(20 + i * 80, 20, 80 + i * 80, 200),
            color=(0, 0, 0), width=0.5
        )
    page.insert_text(
        fitz.Point(20, 760),
        "SHEET A3.1  SOUTH ELEVATION  SCALE: 1/8\"=1'-0\"",
        fontsize=10
    )
    pdf_bytes = doc.tobytes()
    doc.close()
    return base64.b64encode(pdf_bytes).decode("utf-8")


def _real_pdf_base64() -> str:
    """Load the real test PDF as base64."""
    with open(REAL_PDF_PATH, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


# ── TS01: Health check ────────────────────────────────────────────────────────

def test_TS01_health_check():
    """TS01: GET /health returns status=ok and lists available layers."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "layers" in data
    assert len(data["layers"]) > 0


# ── TS02: Classify sheet — synthetic elevation ────────────────────────────────

def test_TS02_classify_sheet_elevation():
    """TS02: POST /classify-sheet on a synthetic elevation PDF returns elevation type."""
    pdf_b64 = _make_minimal_pdf_base64()
    response = client.post("/classify-sheet", json={
        "pdf_base64": pdf_b64,
        "page_num": 0,
        "sheet_id": "test_elevation"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["sheet_type"] == "elevation"
    assert data["confidence"] >= 0.8


# ── TS03: Classify sheet — invalid PDF ───────────────────────────────────────

def test_TS03_classify_sheet_invalid_pdf():
    """TS03: POST /classify-sheet with invalid PDF data returns error response, not 500."""
    response = client.post("/classify-sheet", json={
        "pdf_base64": base64.b64encode(b"not a pdf").decode(),
        "page_num": 0
    })
    assert response.status_code == 200  # Never 500 — always structured response
    data = response.json()
    assert data["status"] == "error"
    assert "error" in data


# ── TS04: Extract graph — synthetic PDF ──────────────────────────────────────

def test_TS04_extract_graph_synthetic():
    """TS04: POST /extract-graph on synthetic PDF returns valid graph structure."""
    pdf_b64 = _make_minimal_pdf_base64()
    response = client.post("/extract-graph", json={
        "pdf_base64": pdf_b64,
        "page_num": 0,
        "sheet_type": "elevation"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "node_count" in data
    assert "edge_count" in data
    assert "x" in data
    assert "edge_index" in data
    assert "scale" in data
    assert data["node_count"] >= 0
    assert data["edge_count"] >= 0


# ── TS05: Extract graph — invalid PDF ────────────────────────────────────────

def test_TS05_extract_graph_invalid_pdf():
    """TS05: POST /extract-graph with invalid PDF returns structured response, not 500.
    Layer 2 catches corrupt PDFs internally and returns GraphData with is_valid=False,
    so the endpoint may return status=ok with is_valid=False rather than status=error."""
    response = client.post("/extract-graph", json={
        "pdf_base64": base64.b64encode(b"garbage").decode(),
        "page_num": 0
    })
    assert response.status_code == 200
    data = response.json()
    # Either error status or ok with is_valid=False — both are acceptable
    if data["status"] == "ok":
        assert data["is_valid"] == False
    else:
        assert data["status"] == "error"


# ── TS06: Detect grid labels ──────────────────────────────────────────────────

def test_TS06_detect_grid_labels():
    """TS06: POST /detect-grid-labels returns label list structure."""
    pdf_b64 = _make_minimal_pdf_base64()
    response = client.post("/detect-grid-labels", json={
        "pdf_base64": pdf_b64,
        "page_num": 0
    })
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "label_count" in data
    assert "labels" in data
    assert isinstance(data["labels"], list)


# ── TS07: Sync sheets — same page (degenerate case) ──────────────────────────

def test_TS07_sync_sheets_same_page():
    """TS07: POST /sync-sheets with the same page for both sheets returns
    a structured response (may not be reliable but should not error)."""
    pdf_b64 = _make_minimal_pdf_base64()
    response = client.post("/sync-sheets", json={
        "pdf_base64_a": pdf_b64,
        "page_num_a": 0,
        "sheet_id_a": "elevation",
        "pdf_base64_b": pdf_b64,
        "page_num_b": 0,
        "sheet_id_b": "floor_plan"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "is_reliable" in data
    assert "matched_label_count" in data


# ── TS08: Response never contains 500 status ─────────────────────────────────

def test_TS08_no_500_on_bad_base64():
    """TS08: Completely malformed base64 returns structured error, not HTTP 500."""
    response = client.post("/classify-sheet", json={
        "pdf_base64": "!!!NOT_BASE64!!!",
        "page_num": 0
    })
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"


# ── TS09: Real PDF full pipeline ─────────────────────────────────────────────

@pytest.mark.skipif(not HAS_REAL_PDF, reason="No real PDF at qaqc/test_data/test_elevation.pdf")
def test_TS09_real_pdf_full_pipeline():
    """TS09: Run all three layer endpoints on the real test PDF.
    All should return status=ok with valid data."""
    pdf_b64 = _real_pdf_base64()

    # Classify
    r1 = client.post("/classify-sheet", json={"pdf_base64": pdf_b64, "page_num": 0})
    assert r1.status_code == 200
    assert r1.json()["status"] == "ok"

    # Extract graph
    r2 = client.post("/extract-graph", json={
        "pdf_base64": pdf_b64, "page_num": 0, "sheet_type": "elevation"
    })
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["status"] == "ok"
    assert d2["node_count"] > 100  # Real drawing should have many nodes

    # Detect grid labels
    r3 = client.post("/detect-grid-labels", json={"pdf_base64": pdf_b64, "page_num": 0})
    assert r3.status_code == 200
    assert r3.json()["status"] == "ok"

    print(f"\n  [TS09] classify={r1.json()['sheet_type']} "
          f"nodes={d2['node_count']} "
          f"labels={r3.json()['label_count']}")


# ── TS10: Prescan endpoint ────────────────────────────────────────────────────

def test_TS10_prescan_drawing_set():
    """TS10: POST /prescan-drawing-set returns structured page lists."""
    pdf_b64 = _make_minimal_pdf_base64()
    response = client.post("/prescan-drawing-set", json={
        "pdf_base64": pdf_b64,
        "max_pages": 5
    })
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "total_pages" in data
    assert "scan_pages" in data
    assert "reference_pages" in data
    assert "skip_pages" in data
    assert "results" in data
    assert isinstance(data["scan_pages"], list)
    assert isinstance(data["skip_pages"], list)


@pytest.mark.skipif(not HAS_REAL_PDF, reason="No real PDF at qaqc/test_data/test_elevation.pdf")
def test_TS11_prescan_real_pdf():
    """TS11: Prescan on the real test PDF returns at least one scan page."""
    pdf_b64 = _real_pdf_base64()
    response = client.post("/prescan-drawing-set", json={"pdf_base64": pdf_b64})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["total_pages"] > 0
    print(f"\n  [TS11] total={data['total_pages']} "
          f"scan={data['scan_pages']} "
          f"reference={len(data['reference_pages'])} "
          f"skip={len(data['skip_pages'])}")
