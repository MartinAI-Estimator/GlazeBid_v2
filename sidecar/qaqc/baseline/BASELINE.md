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
