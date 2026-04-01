"""
main.py

GlazeBid AiQ Sidecar Service — FastAPI Application

Runs on localhost:8100. Launched by the GlazeBid Electron main process
at app startup. Killed when the Electron app closes.

Endpoints:
    GET  /health              — Health check for Electron startup verification
    POST /classify-sheet      — Layer 1: Classify sheet type from PDF buffer
    POST /extract-graph       — Layer 2: Extract vector graph from PDF buffer
    POST /detect-grid-labels  — Layer 9: Detect grid labels from PDF buffer
    POST /sync-sheets         — Layer 9: Compute homography between two PDF pages

All endpoints accept PDF data as base64-encoded strings in JSON bodies.
All endpoints return structured JSON. Never return 500 errors to the client —
all errors are returned as structured error responses with status='error'.
"""

import base64
import logging
import math
import tempfile
import os
from typing import Optional

import fitz  # PyMuPDF
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import layer modules
from layers.layer1_router import classify_sheet, SheetClassification
from layers.layer2_extractor import extract_vector_graph, GraphData
from layers.layer9_homography import detect_grid_labels, sync_sheets

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("glazebid_aiq")

# ── FastAPI App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="GlazeBid AiQ",
    description="Drawing intelligence sidecar for GlazeBid v2",
    version="0.1.0"
)

# Allow requests from the Electron renderer processes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "file://"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response Models ─────────────────────────────────────────────────

class PDFPageRequest(BaseModel):
    """Single PDF page request — PDF as base64 string."""
    pdf_base64: str
    page_num: int = 0
    sheet_id: Optional[str] = ""


class SheetTypeRequest(PDFPageRequest):
    pass


class GraphRequest(PDFPageRequest):
    sheet_type: str = "elevation"
    tolerance: float = 1.0


class GridLabelRequest(PDFPageRequest):
    pass


class SyncSheetsRequest(BaseModel):
    """Two PDF pages for cross-sheet homography."""
    pdf_base64_a: str
    page_num_a: int = 0
    sheet_id_a: str = "elevation"
    pdf_base64_b: str
    page_num_b: int = 0
    sheet_id_b: str = "floor_plan"


class HealthResponse(BaseModel):
    status: str
    version: str
    layers: list


class ErrorResponse(BaseModel):
    status: str
    error: str
    detail: str = ""


# ── Helper: Decode PDF buffer ─────────────────────────────────────────────────

def _decode_pdf_to_page(pdf_base64: str, page_num: int) -> tuple:
    """
    Decode a base64 PDF string and return (doc, page).
    Raises ValueError with clear message on failure.
    """
    try:
        pdf_bytes = base64.b64decode(pdf_base64)
    except Exception as e:
        raise ValueError(f"Invalid base64 PDF data: {e}")

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        raise ValueError(f"Failed to open PDF: {e}")

    if page_num >= len(doc):
        raise ValueError(
            f"Page {page_num} does not exist. PDF has {len(doc)} pages."
        )

    return doc, doc[page_num]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
async def health():
    """
    Health check endpoint. Called by Electron at startup to verify
    the sidecar is running before exposing Drawing Intelligence features.
    """
    return HealthResponse(
        status="ok",
        version="0.1.0",
        layers=["layer0_normalizer", "layer1_router", "layer2_extractor", "layer9_homography"]
    )


@app.post("/classify-sheet")
async def classify_sheet_endpoint(request: SheetTypeRequest):
    """
    Layer 1: Classify a PDF sheet by type using title block OCR.

    Returns sheet_type, confidence, method, sheet_number, and matched_text.
    """
    try:
        doc, page = _decode_pdf_to_page(request.pdf_base64, request.page_num)
        result: SheetClassification = classify_sheet(
            page,
            sheet_id=request.sheet_id or f"page_{request.page_num}"
        )
        doc.close()

        return {
            "status": "ok",
            "sheet_type": result.sheet_type,
            "confidence": result.confidence,
            "method": result.method,
            "matched_text": result.matched_text,
            "sheet_number": result.sheet_number,
            "errors": result.errors
        }

    except ValueError as e:
        return {"status": "error", "error": str(e), "sheet_type": "unknown", "confidence": 0.0}
    except Exception as e:
        logger.exception(f"/classify-sheet failed: {e}")
        return {"status": "error", "error": str(e), "sheet_type": "unknown", "confidence": 0.0}


@app.post("/extract-graph")
async def extract_graph_endpoint(request: GraphRequest):
    """
    Layer 2: Extract the vector graph from a PDF page.

    Returns nodes, edges, scale calibration, and validation results.
    The graph is in PyTorch Geometric compatible format.
    """
    try:
        # Write to temp file — Layer 2 currently reads from file path
        pdf_bytes = base64.b64decode(request.pdf_base64)
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(pdf_bytes)
            tmp_path = f.name

        try:
            graph: GraphData = extract_vector_graph(
                tmp_path,
                page_num=request.page_num,
                sheet_type=request.sheet_type,
                tolerance=request.tolerance
            )
        finally:
            os.unlink(tmp_path)

        return {
            "status": "ok",
            "node_count": graph.node_count,
            "edge_count": graph.edge_count,
            "x": graph.x,
            "edge_index": graph.edge_index,
            "edge_attr": graph.edge_attr,
            "x_inches": graph.x_inches,
            "scale": {
                "scale_factor": graph.scale.scale_factor,
                "scale_confidence": graph.scale.scale_confidence,
                "source": graph.scale.source
            },
            "page_width_pts": graph.page_width_pts,
            "page_height_pts": graph.page_height_pts,
            "is_valid": graph.is_valid,
            "validation_errors": graph.validation_errors,
            "validation_warnings": graph.validation_warnings
        }

    except ValueError as e:
        return {"status": "error", "error": str(e), "is_valid": False,
                "node_count": 0, "edge_count": 0}
    except Exception as e:
        logger.exception(f"/extract-graph failed: {e}")
        return {"status": "error", "error": str(e), "is_valid": False,
                "node_count": 0, "edge_count": 0}


@app.post("/detect-grid-labels")
async def detect_grid_labels_endpoint(request: GridLabelRequest):
    """
    Layer 9: Detect architectural grid labels on a PDF sheet.

    Returns list of detected labels with positions and confidence scores.
    """
    try:
        doc, page = _decode_pdf_to_page(request.pdf_base64, request.page_num)
        labels = detect_grid_labels(
            page,
            sheet_id=request.sheet_id or f"page_{request.page_num}"
        )
        doc.close()

        return {
            "status": "ok",
            "label_count": len(labels),
            "labels": [
                {
                    "label": l.label,
                    "x": l.x,
                    "y": l.y,
                    "sheet_id": l.sheet_id,
                    "confidence": l.confidence
                }
                for l in labels
            ]
        }

    except ValueError as e:
        return {"status": "error", "error": str(e), "label_count": 0, "labels": []}
    except Exception as e:
        logger.exception(f"/detect-grid-labels failed: {e}")
        return {"status": "error", "error": str(e), "label_count": 0, "labels": []}


@app.post("/sync-sheets")
async def sync_sheets_endpoint(request: SyncSheetsRequest):
    """
    Layer 9: Compute homography between two PDF sheets using grid label matching.

    Returns transform matrix, matched labels, reprojection error, and reliability flag.
    """
    try:
        doc_a, page_a = _decode_pdf_to_page(request.pdf_base64_a, request.page_num_a)
        doc_b, page_b = _decode_pdf_to_page(request.pdf_base64_b, request.page_num_b)

        result = sync_sheets(
            page_a, page_b,
            sheet_a_id=request.sheet_id_a,
            sheet_b_id=request.sheet_id_b
        )

        doc_a.close()
        doc_b.close()

        # Handle float('inf') which is not JSON serializable
        reproj_error = result.reprojection_error_pts
        if not math.isfinite(reproj_error):
            reproj_error = -1.0

        return {
            "status": "ok",
            "is_reliable": result.is_reliable,
            "matched_label_count": len(result.matched_labels),
            "matched_labels": [m.label for m in result.matched_labels],
            "reprojection_error_pts": reproj_error,
            "transform_matrix": result.transform_matrix.tolist()
                if result.transform_matrix is not None else None,
            "sheet_a_id": result.sheet_a_id,
            "sheet_b_id": result.sheet_b_id,
            "errors": result.errors
        }

    except ValueError as e:
        return {"status": "error", "error": str(e), "is_reliable": False}
    except Exception as e:
        logger.exception(f"/sync-sheets failed: {e}")
        return {"status": "error", "error": str(e), "is_reliable": False}


# ── Detect Glazing Endpoint ───────────────────────────────────────────────────

class DetectGlazingRequest(BaseModel):
    """Request to run full glazing detection on a single PDF page."""
    pdf_base64: str
    page_num: int = 0
    sheet_type: str = "elevation"
    scale_factor: float = 0.0
    scale_confidence: float = 0.0


@app.post("/detect-glazing")
async def detect_glazing_endpoint(request: DetectGlazingRequest):
    """
    Run the complete glazing detection pipeline on a single PDF page:
    Layer 0 (normalize) → Layer 2 (extract graph) → Rules Engine (detect candidates)

    Returns GlazingCandidate list ready for Studio UI display.
    This is the primary endpoint called by the Studio DrawingIntelligence panel.
    """
    from layers.rules_engine import run_rules_engine, GlazingCandidate

    try:
        pdf_bytes = base64.b64decode(request.pdf_base64)
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(pdf_bytes)
            tmp_path = f.name

        try:
            graph: GraphData = extract_vector_graph(
                tmp_path,
                page_num=request.page_num,
                sheet_type=request.sheet_type,
            )
        finally:
            os.unlink(tmp_path)

        if not graph.is_valid:
            return {
                "status": "error",
                "error": "; ".join(graph.validation_errors),
                "candidates": [],
                "page_num": request.page_num,
            }

        candidates = run_rules_engine(
            graph.x,
            graph.edge_index,
            graph.edge_attr,
            scale_factor=graph.scale.scale_factor,
            scale_confidence=graph.scale.scale_confidence,
            source_sheet=f"page_{request.page_num}",
        )

        # Filter to non-rejected candidates for the UI
        ui_candidates = [c for c in candidates if c.status != "rejected"]

        def candidate_to_dict(c: GlazingCandidate) -> dict:
            return {
                "candidate_id": c.candidate_id,
                "bounding_box": {
                    "x": c.bounding_box.x,
                    "y": c.bounding_box.y,
                    "width": c.bounding_box.width,
                    "height": c.bounding_box.height,
                },
                "width_pts": c.width_pts,
                "height_pts": c.height_pts,
                "width_inches": c.width_inches,
                "height_inches": c.height_inches,
                "scale_factor": c.scale_factor,
                "scale_confidence": c.scale_confidence,
                "bay_count": c.bay_count,
                "confidence": c.confidence,
                "rules_passed": c.rules_passed,
                "rules_failed": c.rules_failed,
                "system_hint": c.system_hint,
                "source_sheet": c.source_sheet,
                "status": c.status,
            }

        return {
            "status": "ok",
            "page_num": request.page_num,
            "candidate_count": len(ui_candidates),
            "candidates": [candidate_to_dict(c) for c in ui_candidates],
            "scale": {
                "scale_factor": graph.scale.scale_factor,
                "scale_confidence": graph.scale.scale_confidence,
                "source": graph.scale.source,
            },
            "graph_meta": {
                "node_count": graph.node_count,
                "edge_count": graph.edge_count,
            },
            "warnings": graph.validation_warnings,
        }

    except ValueError as e:
        return {"status": "error", "error": str(e), "candidates": [], "page_num": request.page_num}
    except Exception as e:
        logger.exception(f"/detect-glazing failed: {e}")
        return {"status": "error", "error": str(e), "candidates": [], "page_num": request.page_num}


# ── Prescan Endpoint ──────────────────────────────────────────────────────────

class PrescanRequest(BaseModel):
    """Request to pre-scan an entire PDF drawing set."""
    pdf_base64: str
    max_pages: Optional[int] = None


@app.post("/prescan-drawing-set")
async def prescan_drawing_set_endpoint(request: PrescanRequest):
    """
    Pre-scan a PDF drawing set to identify which pages are worth
    running full glazing detection on.

    Returns per-page relevance scores and three lists:
    - scan_pages: pages to run full glazing detection on
    - reference_pages: floor plans and details for cross-referencing
    - skip_pages: pages with no glazing relevance

    This is the first call to make when processing a new drawing set.
    Use the scan_pages list to drive subsequent /extract-graph and
    /detect-glazing calls — skip everything else.
    """
    from layers.layer_prescan import prescan_drawing_set

    try:
        pdf_bytes = base64.b64decode(request.pdf_base64)
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(pdf_bytes)
            tmp_path = f.name

        try:
            prescan = prescan_drawing_set(tmp_path, max_pages=request.max_pages)
        finally:
            os.unlink(tmp_path)

        return {
            "status": "ok",
            "total_pages": prescan.total_pages,
            "scan_pages": prescan.scan_pages,
            "reference_pages": prescan.reference_pages,
            "skip_pages": prescan.skip_pages,
            "results": [
                {
                    "page_num": r.page_num,
                    "relevance_score": r.relevance_score,
                    "should_scan": r.should_scan,
                    "sheet_type": r.sheet_type,
                    "sheet_number": r.sheet_number,
                    "path_count": r.path_count,
                    "keywords_found": r.keywords_found,
                    "processing_role": r.processing_role,
                    "skip_reason": r.skip_reason,
                }
                for r in sorted(prescan.results, key=lambda x: x.page_num)
            ],
            "errors": prescan.errors,
        }

    except ValueError as e:
        return {"status": "error", "error": str(e)}
    except Exception as e:
        logger.exception(f"/prescan-drawing-set failed: {e}")
        return {"status": "error", "error": str(e)}


# ── Entry Point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting GlazeBid AiQ sidecar on localhost:8100")
    uvicorn.run(app, host="127.0.0.1", port=8100, log_level="info")
