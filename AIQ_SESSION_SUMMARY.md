# GlazeBid AiQ — Full Session Summary

**Date:** April 17, 2026  
**Status:** Active development — next experiment spec ready, not yet started  
**Repo:** MartinAI-Estimator/GlazeBid_v2, master branch  
**Marketing site:** glazebid.netlify.app (site ID: `bb1cc294-0e10-47b3-b27c-b66df8caf78f`)

---

## What AiQ Is

AiQ is GlazeBid's automated drawing intelligence engine — a Python FastAPI sidecar (`localhost:8100`) that reads architectural PDFs and identifies glazing scope automatically, replacing 8–40 hours of manual takeoff per job.

---

## Architecture

**Stack:** Electron desktop, Builder (React/JSX, port 5173), Studio (React/TS, port 5174), SQLite, Zustand stores, Python FastAPI sidecar.

### Sidecar Pipeline Layers

| Layer | Name | Description |
|---|---|---|
| L0 | PDF Normalizer | Strips hatch, normalizes stroke weights |
| L1 | Sheet Router | Classifies pages: elevation / floor plan / detail / schedule |
| L2 | Vector Graph Extractor | + scale detection |
| L3 | Schedule Parser | Parses glazing schedules |
| L4 | Rules Engine | Tier 1 hard rejection, Tier 2 confidence scoring, Tier 3 classification |
| L5 | Cross-Reference / Homography | Built, deferred — grid label false positives |
| L6 | Scope Filter | JSON config (include / exclude / review) |
| — | Prescan | Fast page relevance check before full pipeline |

### FastAPI Endpoints (7 total)

`/health`, `/classify-sheet`, `/extract-graph`, `/detect-grid-labels`, `/sync-sheets`, `/detect-glazing`, `/prescan-drawing-set`

---

## Current Pipeline Performance

**Test set:** McLarty Mazda (commercial auto dealership)

| Metric | Value |
|---|---|
| Recall | 91% (on pages actually scanned) |
| Precision | 12.8% |
| F1 | 0.21 |

**Root cause of low precision:** Geometry engine finds real glazing but cannot discriminate it from other rectangular features without cross-referential context. Size filtering alone cannot close the gap without destroying recall.

---

## What's Been Built (All Merged to Master)

### Sidecar (Python)
- All 7 layers complete, 105+ tests passing
- Scale detection handles Unicode smart quotes, extended title block regions
- Hatch fill filtering removes 45° crosshatch noise from graph
- Candidate merge step combines fragments into full assemblies
- Modal bay spacing periodicity fix
- Scope profile JSON (configurable include/exclude/review)
- Two pipeline bugs fixed:
  - Out-of-bounds nodes treated as hard error
  - `None` edge attributes crashing `math.isfinite()`
- Prescan improved: detail pages with `CURTAINWALL` keyword + ≥2000 paths promoted to scan

### Studio UI (TypeScript/React)
- `DrawingIntelligencePanel`: scan button, progress bar, candidate list with Confirm/Reject
- `DrawingIntelligenceOverlay`: SVG bounding box overlay on canvas, color-coded by confidence
- Filter UI: confidence slider, page pills, system type pills, sort, bulk confirm/reject
- Frontend deduplication: IoU >60% overlap suppressed before display
- ArrayBuffer detach bug fixed (base64 conversion before async boundary)
- Scale passthrough: Studio calibration data sent to sidecar
- Confirm → canvas shape: creates green `RectShape` + `RawTakeoff`, flows to Builder inbox via IPC
- Off-by-one page number bug fixed in `confirmCandidate`

---

## Known Issues / Deferred

- **Homography cross-reference deferred** — grid label false positives (reads title block text as column grid)
- **Confirm → canvas shape** — verified in code, not yet visually confirmed by Martin

---

## Ground Truth Validation Methodology

**Test PDFs** (in `sidecar/qaqc/test_data/`):
- `McLarty Mazda - Bid Plans - Non Marked.pdf` — clean set
- `McLarty Mazda - Bid Plans.pdf` — Bluebeam markup = Martin's actual scope decisions

**Matching method:** Annotation center-point containment inside candidate bounding box (not IoU — Bluebeam marks individual bays, AiQ finds full assemblies).

**Ground truth script:** `sidecar/qaqc/ground_truth_mclarty.py`  
**Report:** `sidecar/qaqc/ground_truth_report_mclarty_v2.txt`

---

## Next Experiment — Constraint-First Verification (Not Yet Started)

**Core hypothesis:** The pipeline needs to stop *discovering* glazing and start *verifying* it. Cross-referential reading (schedule-first or elevation-marks-first) will collapse the false positive space and push precision into usable range.

### Experiment 1 — Hope Aquatic (Schedule Constraint)
- Run schedule parser on Hope, extract marks + dimensions
- Use as constraints for geometry engine verification
- **Target:** Precision ≥60%, Recall ≥85%

### Experiment 2 — McLarty (Elevation Mark Extraction)
- No schedule exists — extract glazing marks (`SF-`, `CW-`, `W-`, `GL-` prefixes) and dimensions from elevation sheets via vector text + OCR
- Feed as constraints to geometry engine
- **Target:** Precision ≥50%, Recall ≥80%

### Shared Architecture

```python
@dataclass
class MarkConstraint:
    mark_id: str           # "SF-1", "W-01", "CW-3"
    width_ft: float
    height_ft: float
    expected_count: int | None = None
    tolerance: float = 0.20

@dataclass
class ConstraintSet:
    source: Literal["schedule", "elevation", "none"]
    marks: list[MarkConstraint]
    confidence: Literal["constrained", "partial", "unconstrained"]
```

**Verification layer:** Runs after geometry engine, matches candidates by dimensions ±20%, rejects no-match candidates. Falls back gracefully with explicit warning when zero marks extracted.

### Guardrails
- No master changes — experiment branches only
- No network calls, no cloud VLM
- No UI changes during experiment
- Restart dev servers after any shared-code changes

---

## Workflow / Team Roles

| Role | Scope |
|---|---|
| This chat (Cowork) | Engineering lead — architecture decisions, sprint review |
| VS Code Claude | Developer — implementation |
| Martin | PM + domain expert + visual gate on any output requiring human judgment |

---

## Key Files Reference

| File | Purpose |
|---|---|
| `sidecar/qaqc/ground_truth_mclarty.py` | Ground truth validation script |
| `sidecar/qaqc/ground_truth_report_mclarty_v2.txt` | Latest precision/recall report |
| `sidecar/qaqc/test_data/` | McLarty test PDFs |
| `apps/studio/src/` | DrawingIntelligencePanel, Overlay, filter UI |
