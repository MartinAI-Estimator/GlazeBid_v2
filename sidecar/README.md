# GlazeBid AiQ — Drawing Intelligence Sidecar

Rules-based PDF drawing analysis engine that detects glazing scope from architectural drawings. Runs as a local Python FastAPI service on `localhost:8100` alongside the GlazeBid v2 Electron app. No cloud required. No ML training required.

## Layer Pipeline

| Layer | Name | Phase | Status |
|-------|------|-------|--------|
| 0 | PDF Normalization | 1 | ✅ Sprint 1 |
| 1 | Sheet Router | 1 | Sprint 2 |
| 2 | Vector Graph Extraction + Scale Detection | 1 | ✅ Sprint 1 |
| 9 | Grid-Line Homography | 1 | Sprint 3 |
| RE | Rules-Based Glazing Engine | 2 | Sprint 5 |
| 7 | Persistent Homology | 3 | Sprint 7 |

## Setup

```bash
cd sidecar
pip install -r requirements.txt
```

## Sprint 1 — Proof of Concept

Sprint 1 is complete when a human looks at the SVG overlay and confirms the graph visually corresponds to the architectural geometry on the drawing sheet.

**Step 1: Drop a real architectural elevation PDF into the test data folder**
```
sidecar/qaqc/test_data/test_elevation.pdf
```

**Step 2: Run the proof of concept script**
```bash
cd sidecar
python qaqc/run_poc.py
```

This extracts the vector graph, runs automated gate checks, generates the SVG overlay, and prints a human review checklist.

**Step 3: Open the SVG file and confirm visually**

The SVG is saved alongside the test PDF. Open it in any browser. Confirm:
- Graph nodes (dots) align with line intersections on the drawing
- Graph edges (lines) follow the drawing geometry
- Orange/red nodes appear at mullion intersections
- Blue edges correspond to glazing profile lines
- The graph is NOT random noise

## Running Tests

```bash
cd sidecar
pytest qaqc/test_sprint1.py -v
```

13 tests run on synthetic data (no PDF required).
T05 and T06 run automatically when a real PDF is present.

## Architecture

The sidecar is a child process spawned by the Electron main process at app startup. Studio sends PDF buffers to the sidecar via IPC → localhost:8100. Results return as GlazingCandidate JSON arrays. Candidates render as overlays on the Studio PDF canvas. Confirmed candidates flow into the existing RawTakeoff → useInboxStore pipeline.
