# Phase A Baseline — Recorded July 15, 2026

**Harness:** `sidecar/qaqc/eval_harness.py` (self-test: 100% on all 33 jobs, 5,377 GT regions — verified sound)
**Ground truth:** `sidecar/corpus/markup_corpus.json`
**Candidates:** `baseline-geometry-v0` — universal vector rectangles, text triage, no vision, no constraints, no knowledge base. All classes naively labeled ext_sf.

## The Starting Line (4 test jobs, 1,415 GT regions)

| Metric | Value |
|---|---|
| Detection precision | **0.016** |
| Detection recall | **0.165** |
| Classification accuracy (of detected) | 0.150 |
| End-to-end recall | **0.025** |

Per job: Curtis det-R 0.257 / McLarty 0.130 / Olathe 0.125 / Hope 0.104.

## Gate Rule

No pipeline change merges unless:
1. This harness shows scores ≥ current best on these 4 jobs (and no regression on any job), AND
2. Martin visually reviews a sample of the diffs.

## Improvement Ledger

| Date | Pipeline version | det-P | det-R | cls-acc | e2e-R | Notes |
|---|---|---|---|---|---|---|
| 2026-07-15 | baseline-geometry-v0 | 0.016 | 0.165 | 0.150 | 0.025 | starting line |
| | | | | | | Phase B: + constraints |
| | | | | | | Phase C: + VLM crop verify |
| | | | | | | Phase D: + zoom loop |

Run to reproduce:
```bash
cd sidecar/qaqc
python eval_harness.py baseline/cand_*.json --corpus ../corpus/markup_corpus.json -o baseline
```

## Vision pipeline — how to produce the next ledger row (added 2026-09-17)

The vision pipeline now returns `detections[]` with `bbox` + `page_index`
(geometry_anchoring.py: PyMuPDF finds each callout tag, snaps it to a
rules-engine frame).  Score it with the same harness, same four jobs:

```bash
cd sidecar            # ANTHROPIC_API_KEY must be set; ~2–4 min and real API spend per set
python qaqc/takeoff_to_candidates.py --list-jobs --corpus corpus/markup_corpus.json
python qaqc/takeoff_to_candidates.py --run "qaqc/test_data/McLarty Mazda - Bid Plans - Non Marked.pdf" \
    --job "McLarty Mazda - Bid Plans" --save-result qaqc/baseline/result_vision_McLarty.json \
    -o qaqc/baseline/cand_vision_McLarty_Mazda.json
# repeat for Hope Aquatic, Curtis MS, Olathe (PDFs for the last two are not in test_data/)
python qaqc/eval_harness.py qaqc/baseline/cand_vision_*.json --corpus corpus/markup_corpus.json -o qaqc/baseline/vision-v1
```

Record the AGGREGATE row here as `vision+geometry-v1`.  Rerun with
`--no-fallback` to see how much of the score comes from tag_fallback boxes
(tags with no geometry candidate within 150 pt) — if that gap is large, the
rules engine is the bottleneck, not vision.
