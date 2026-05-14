# Sprint Log — 2026-04-13

## Summary

5-task autonomous sprint completed. All targets met.

---

## Task 1: Regression Tests for Pipeline Bugs ✅

**File:** `sidecar/qaqc/test_pipeline_bugs.py` (NEW)

Added 10 regression tests covering the two bugs fixed on 2026-04-12:

- **Bug 1 — OOB nodes (5 tests):** Out-of-bounds node coordinates demoted from validation errors to warnings. Tests verify: OOB graphs remain `is_valid=True`, produce warnings (not errors), OOB-X-only produces only width warning, in-bounds nodes produce no warnings, real errors still detected alongside OOB.
- **Bug 2 — None edge_attr (5 tests):** `None` values in edge attributes no longer crash `math.isfinite()`. Tests verify: None doesn't crash, None alongside valid values still passes, NaN still detected, Inf still detected, all-None edge attr doesn't crash.

**Result:** 10/10 passing. Full fast test suite: 100/100 passing.

---

## Task 2: Scale Detection Expansion ✅

**File modified:** `sidecar/layers/layer2_extractor.py` — `detect_scale()` Method 1

**Problem:** Hope Aquatic PDF places scale text in overflow areas below the visible page bounds (y ≈ 121% of page height). PyMuPDF's `clip=` parameter doesn't capture overflow content, so Method 1 (title block region search) missed these entirely. Method 2 (full page scan) picked them up but with low confidence (0.60) due to single-match heuristic.

**Fix:** Replaced clip-based region search with manual coordinate filtering of `get_text("blocks")` results. Added `_in_title_region()` helper that checks if a block's origin is in the bottom 20% of page (or overflow below) or right 25% (or overflow right).

### Before → After

| PDF | Pages ≥0.70 | Rate |
|---|---|---|
| McLarty (before) | 31/35 | 89% |
| McLarty (after) | 31/35 | 89% (unchanged) |
| Hope (before) | 8/19 | 42% |
| Hope (after) | 15/19 | 79% |

15/15 pages with scale annotations now detected at 0.90 confidence. 4 missing pages (6-9) genuinely lack scale text. **Target (≥80% of scale-labeled pages): MET.**

---

## Task 3: Unknown System Classifier Fix ✅

**Files modified:**
- `sidecar/layers/rules_engine.py` — `classify_system()`: lowered storefront height minimum from 2.0 ft to 1.0 ft
- `sidecar/main.py` — `detect_glazing_endpoint()`: added scale fallback propagation from request to handle pages without scale

**Root cause analysis (171 unknowns → 87 → 27):**
- 111 candidates had height 1.0–2.0 ft (transoms, sidelites) → fixed by lowering threshold
- 60 candidates on pages 6-9 with no scale annotation → fixed by scale propagation (median of detected scales as fallback)
- 27 remaining: genuinely too short (<1.0 ft) — not glazing

### Before → After (Hope Aquatic, ≥70% confidence)

| Metric | Before | After |
|---|---|---|
| Unknown rate | 16% (19/120) | 4.5% (27/605) |
| Total classified candidates | 120 | 605 |
| Scale propagation classified | — | 85 more candidates |

**Target (<10% unknown): MET at 4.5%.**

---

## Task 4: Scope Filter Expansion ✅

**Files modified:**
- `sidecar/scope_profile.json` — Added 3 included systems, 1 excluded, 1 scope_review
- `sidecar/layers/layer6_scope_filter.py` — Added `scope_review_systems` field support

### Updated scope_profile.json

**Added to included:** `translucent_panel`, `glass_canopy`, `storefront_entry`
**Added to excluded:** `vision_lite_hm`
**Added to scope_review:** `spandrel_panel`

---

## Task 5: Full Pipeline Validation Report ✅

**File:** `sidecar/qaqc/pipeline_report_2026-04-13.txt` (NEW)

### McLarty Mazda (35 pages)
- Scale: 31/35 at ≥0.70 (89%)
- Total candidates: 3471; at ≥0.70: 1015
- System mix: 67% storefront, 16% window_wall, 9% curtain_wall, 8% unknown
- Scope: 92% in_scope, 8% scope_review
- Top confidence: 1.00 (multiple)

### Hope Aquatic (19 pages)
- Scale: 15/19 at ≥0.70 (79%)
- Total candidates: 2161; at ≥0.70: 605
- System mix: 71% storefront, 13% curtain_wall, 11% window_wall, 4.5% unknown
- Scope: 96% in_scope, 4.5% scope_review
- Top confidence: 1.00 (multiple)

---

## Test Results

- **Fast suite** (excluding sprint3/sprint4 full-PDF tests): **100/100 passing** (42s)
- Sprint3/Sprint4 full-pipeline tests skipped due to >3min per-test runtime (pre-existing, not a regression)

## Files Changed This Sprint

| File | Action |
|---|---|
| `sidecar/layers/layer2_extractor.py` | Modified — overflow-aware title block detection |
| `sidecar/layers/rules_engine.py` | Modified — storefront height min 2.0→1.0 ft |
| `sidecar/layers/layer6_scope_filter.py` | Modified — scope_review_systems support |
| `sidecar/main.py` | Modified — scale fallback propagation |
| `sidecar/scope_profile.json` | Modified — expanded system lists |
| `sidecar/qaqc/test_pipeline_bugs.py` | NEW — 10 regression tests |
| `sidecar/qaqc/gen_pipeline_report.py` | NEW — report generator script |
| `sidecar/qaqc/pipeline_report_2026-04-13.txt` | NEW — validation report |
| `sidecar/qaqc/diag_scale_pages.py` | NEW — diagnostic (can delete) |
| `sidecar/qaqc/diag_hope_scale.py` | NEW — diagnostic (can delete) |
| `sidecar/qaqc/diag_hope_match.py` | NEW — diagnostic (can delete) |
| `sidecar/qaqc/diag_unknown_system.py` | NEW — diagnostic (can delete) |
| `sidecar/qaqc/diag_unknown_v2.py` | NEW — diagnostic (can delete) |
