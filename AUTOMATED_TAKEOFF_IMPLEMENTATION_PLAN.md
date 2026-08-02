# GlazeBid AiQ — Automated Takeoff Implementation Plan

**Date:** July 15, 2026
**Status:** PLAN — no code changes until reviewed with Martin
**Supersedes:** extends AIQ_CONSTRAINT_SESSION.md and STRATEGY_SESSION_SUMMARY.md
**Companion asset:** `sidecar/corpus/markup_corpus.json` — 33 jobs, 11,146 labeled annotations extracted from Martin's Bluebeam markups (built July 15, 2026)

---

## 1. End Goal — What Done Looks Like

An estimator drops a bid set PDF into GlazeBid and, within minutes, sees:

1. **A marked-up drawing set** — glazing scope highlighted per system type using Martin's exact Bluebeam tool-chest conventions (same subjects, same colors), written back into the PDF as real annotations that round-trip with Bluebeam.
2. **A scope inventory** — every glazing assembly identified, classified (Ext SF, Ext CW, Int SF, All Glass Wall, etc.), measured, and counted, with schedule/elevation cross-references resolved.
3. **A citation for everything** — every quantity is clickable and jumps to the exact page and location it came from. Nothing is asserted without evidence.
4. **A review queue, not a black box** — items the system is confident about are pre-confirmed; ambiguous items are flagged for the estimator's judgment. The estimator's Confirm/Reject decisions are captured as training data.
5. **Flow-through to bid** — confirmed scope populates Studio takeoffs → Builder system cards → BidSheet pricing → proposal, using the existing pipeline.

**The measure of success:** a takeoff that today takes 8–40 hours produces a reviewable draft in under 30 minutes, at ≥85% recall and ≥70% precision on scope identification, with zero unexplained quantities.

**What this is NOT:** a fully autonomous estimator. The estimator stays in the loop as reviewer and final authority. The system does the data entry and document management; the human does judgment and relationships. (Long term, precision targets rise and the review burden shrinks — that's the flywheel working.)

---

## 2. Guiding Principles

1. **Geometry proposes, vision verifies, constraints confirm.** Three independent signals multiply. No single method (vector rules, VLM, OCR) is trusted alone.
2. **Verify, don't discover.** Drawings are read cross-referentially — schedules, elevations, legends, and specs constrain what the geometry engine finds. (Established in the April constraint session; McLarty proved discovery alone gives 13% precision.)
3. **Citations or it didn't happen.** Every output item carries source page + coordinates.
4. **The flywheel is the moat.** Every manual markup, every Confirm/Reject click, every completed bid becomes labeled training data. The corpus only grows.
5. **Additive architecture.** The existing sidecar layers, Studio tools, and Builder pipeline stay put. New capability is layered downstream or alongside — no rewrites.
6. **Human conventions are the interface.** The system speaks Bluebeam: it reads Martin's markups as input and writes markups in his style as output. No new markup language to learn.

---

## 3. System Architecture

```
                        ┌──────────────────────────────────────┐
                        │  ORCHESTRATOR ("Estimator Brain")     │
                        │  reasoning model + tools; resolves    │
                        │  conflicts, decides what to re-examine│
                        └──────┬───────────────────────┬───────┘
                               │                       │
   PDF Bid Set ──► SHEET ROUTER (exists, L1)           │
                     │                                 │
        ┌────────────┼──────────────┐                  │
        ▼            ▼              ▼                  ▼
   ELEVATIONS    SCHEDULES      FLOOR PLANS      SPEC READER (exists)
   reader        parser (L3)    geometry              │
   (exists)      (exists)       engine (L2/L4)        │
        │            │              │                 │
        └────────────┴──────┬───────┘                 │
                            ▼                         │
              CONSTRAINT SET (marks + dims)           │
                            │                         │
                            ▼                         │
              VERIFICATION LAYER                      │
              1. dimension match ±20%   (Phase B)     │
              2. VLM crop verification  (Phase C)     │
                            │                         │
                            ▼                         ▼
              ASSEMBLY RECORDS ◄──── implication engine (rules)
                            │
              ┌─────────────┼─────────────────┐
              ▼             ▼                 ▼
        AUTO-MARKUP    STUDIO REVIEW     EVAL HARNESS
        (Bluebeam      (Confirm/Reject   (scores vs
        annotations    → flywheel)       markup corpus)
        into PDF)
```

---

## 4. What Gets Implemented — Component by Component

### Phase A — Eval Harness (measurement foundation) — FIRST
**What:** `sidecar/qaqc/eval_harness.py` — scores any pipeline run against the ground-truth markup corpus, per job and aggregate.
**How it works:** Loads `markup_corpus.json`. For each job, matches pipeline candidates to Martin's markups by page + IoU overlap + scope class. Emits precision / recall / F1 per scope class per job, plus a diff view (missed, false positive, misclassified).
**Why first:** Every other phase gets judged by this. Right now the pipeline is scored on one job (McLarty) with hand-coded ground truth. This gives 33 jobs instantly, and re-running it is free.
**What we want to see:** A single command that prints the scoreboard across all 33 jobs. Baseline recorded before any changes.

### Phase B — Constraint Verification (already spec'd, run it)
**What:** The two experiments from `AIQ_CONSTRAINT_EXPERIMENTS_SPEC.md`: schedule-constrained (Hope Aquatic) and elevation-mark-constrained (McLarty).
**How it works:** Schedule parser / elevation reader extract `MarkConstraint` sets (mark id, width, height, count). Verification layer keeps only geometry candidates matching a constraint ±20%. Unconstrained jobs are flagged, never silently passed.
**Target:** Precision 13% → ≥50–60% at recall ≥80–85%.

### Phase C — VLM Crop Verification (new layer)
**What:** `sidecar/layers/layer10_vlm_verify.py` — a vision pass over each surviving candidate.
**How it works:** For each candidate, render its bounding box + context margin at high DPI (300+; small crops, so cheap). Send to Claude vision with a structured question: *"Is this a glazed opening? What system type? What mark tag is adjacent? What dimensions are annotated?"* Response is structured JSON. Candidates failing verification are dropped; verified ones gain the VLM's classification + any mark/dimension read as additional evidence.
**Why it works:** Attacks exactly what the geometry engine lacks — semantic context — at the resolution VLMs are actually good at (small crops, not E-size sheets).
**Design decisions:** Cloud-VLM-optional. Runs when API key present; without it, pipeline falls back to Phase B output with a confidence penalty. Batched calls, cached by content hash so re-runs are free.
**Target (stacked on B):** Precision ≥70% at recall ≥80%.

### Phase D — Agentic Zoom Loop (foveated vision)
**What:** Upgrade the drawing intelligence module from one-static-image-per-page to an iterative look-closer loop.
**How it works:** Pass 1: full sheet at low DPI → model returns regions of interest with purposes ("schedule table here", "elevation marks here", "storefront run along gridline 3"). Pass 2+: the model requests high-DPI crops of those regions and reads them at full fidelity, maintaining a running findings log per sheet. Implemented as a tool-use loop (`render_region(page, bbox, dpi)` exposed as a tool to the model).
**Why:** This is how a human reads a sheet — scan, then lean in. It sidesteps the resolution ceiling that makes whole-sheet VLM reading unreliable.
**Applies to:** elevation reader, schedule reader, legend extractor — all currently single-shot.

### Phase E — Auto-Markup Output (the visible product)
**What:** `sidecar/layers/layer11_markup_writer.py` — writes verified Assembly Records back into the bid set PDF as Bluebeam-compatible annotations.
**How it works:** PyMuPDF creates Polygon/PolyLine/Count annotations with Martin's exact subject names ("Ext SF Highlight", "Ext. SF Area", ...), colors (from `glazebid_scope_colors.py`), and measurement text in the content field. Author = "GlazeBid AiQ" so machine markups are distinguishable from human ones. Output opens in Bluebeam looking like Martin did the takeoff.
**Why it matters:** This IS the scope-identification step of the takeoff, automated. It's also the demo that sells the product — before/after on a real bid set.

### Phase F — Bluebeam Import → Studio (close the flywheel)
**What:** Studio feature: open any Bluebeam-marked PDF → markups become reviewable takeoff objects.
**How it works:** Extractor logic from `bluebeam_markup_extractor.py` ported into the sidecar as an endpoint (`/import-markups`). Studio maps subjects → SystemTypes (config-driven mapping table), vertices → shapes, measurements → RawTakeoffs. Estimator reviews and confirms; confirmed items flow to Builder as today.
**Why:** Migration path for every Bluebeam-using estimator (zero switching cost), and every imported markup enriches the corpus.

### Phase G — Fine-Tuned Detectors (when zero-shot isn't enough)
**What:** Small specialized models for the highest-volume detection tasks: mark bubbles/callout tags, door swings, window symbols, schedule table cells.
**How it works:** Training data generated from the corpus — crop around each labeled annotation, label = scope class. Start with an open detector (YOLO-class or Florence-2 fine-tune; precedent: 400 examples beat GPT-4o on drawing symbols). Runs locally via ONNX (see ONNX_INTEGRATION_GUIDE.md) — keeps the no-cloud path strong.
**Trigger condition:** Only build this where Phases C–D leave a measurable gap. Don't train models for problems the VLM already solves.

### Phase H — Orchestrator ("Estimator Brain")
**What:** The reasoning layer that runs the whole pipeline like an estimator runs a takeoff.
**How it works:** A reasoning model with tools (run router, read schedule, request crops, query constraint sets, compare evidence). It reads the assembler output, spots gaps ("elevation shows SF-4 but no schedule entry — re-examine A3.2"), resolves conflicts by evidence priority (Spec → Schedule → Elevation → Plan tag), and generates Conflict Nodes for human review rather than guessing. The implication engine (span rules, sill conditions, structural steel flags) runs here too — flagging scope that's implied but not drawn.
**This is the last phase, not the first** — it needs reliable tools underneath it to orchestrate.

### Beyond — Shop Drawing Automation
Same pipeline, reversed: Assembly Records → parametric frame engineering (exists) → dimensioned elevation drawings + install tracking layers (FEATURE_SHOP_DRAWING_DIGITIZATION.md). Not planned in detail here; the takeoff pipeline's Assembly Records are deliberately structured to make this possible later.

---

## 5. Success Metrics

| Phase | Metric | Baseline | Target |
|---|---|---|---|
| A | Jobs with automated eval | 1 (McLarty) | 33 |
| B | Precision @ recall ≥80% | 13% | ≥50% |
| C | Precision @ recall ≥80% | — | ≥70% |
| D | Marks/dims correctly read per sheet | unmeasured | ≥90% vs corpus |
| E | Estimator accepts auto-markup as starting point | n/a | yes, on 3 real bids |
| F | Bluebeam set → Studio takeoffs round trip | n/a | works on 5 corpus jobs |
| G | Detector F1 on held-out corpus jobs | — | > VLM zero-shot |
| H | End-to-end draft takeoff time | 8–40 hrs manual | <30 min + review |

Every phase gate: run Phase A harness, compare to recorded baseline, Martin visually reviews a sample. No merge without both.

---

## 6. Constraints Carried Forward

- Builder = JSX only; Studio = TS strict; IPC names and preload namespaces frozen
- `RawTakeoff` contract unchanged — new pipeline feeds it, doesn't alter it
- Snap engine untouched
- No `localhost:8000`; sidecar stays at 8100 with local fallbacks
- Cloud VLM optional everywhere; rules+constraints path always works offline
- Experiment branches only; Martin reviews before master

---

## 7. Open Questions (for brainstorm)

1. **Scale trust:** vector dimension strings vs. drawn-length × scale — which wins when they disagree, and how is scale verified per viewport?
2. **Corpus licensing/privacy:** drawings belong to architects/GCs. Fine for internal training/eval — but define the policy before any customer-facing model training.
3. **Subject-name normalization:** corpus has variants ("Ext. SF Area" vs "Ext SF Area"). Need a canonical scope-class table (maps to SystemType) with alias handling.
4. **Negative labels:** "Excluded by Binswanger" markups are gold for teaching what's NOT in scope. How do exclusions flow through the pipeline — a scope-exclusion constraint type?
5. **Which VLM tasks justify fine-tuning vs. prompting** — decide from Phase C/D error analysis, not upfront.
6. **Multi-estimator conventions:** other estimators' tool chests won't match Martin's subjects. The mapping table (Phase F) is the answer — but needs a UI eventually.
7. **When drawings are scans** (no vector layer): raster-only path = Phase D zoom loop + Phase G detectors carry the whole load. Acceptable degradation or blocker?

---

*Next session: brainstorm against Section 7 + anything this plan leaves out.*
