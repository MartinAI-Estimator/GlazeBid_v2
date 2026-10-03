# GlazeBid v2 — Audit Revision (Local Working Tree)

**Date:** 2026-09-17
**Supersedes:** `GlazeBid_Codebase_Audit_2026-09-17.md` (which audited GitHub `master@f8454c4`, 2026-05-13)
**Source:** `C:\Users\mjaym\GlazeBid v2` on `martin-dell`, live working tree

### Method limitation — read this

The isolated Linux workspace on this machine **failed to start**, so `device_bash` was unavailable. I could only list directories and stage individual files. That means this revision is based on **directory listings plus ~30 staged files**, not a full-tree grep. Specifically I could **not** redo: the module-reachability walk (the "95 orphaned files" figure), the repo-wide broken-import scan, or any test run. Those findings from the first audit are marked **UNVERIFIED** below rather than restated as fact.

**Headline: the first audit was materially wrong about the current state, because four months of your best work was never pushed.** The corrections below are almost all in your favor.

---

## 1. What the first audit got wrong

### 1.1 The takeoff engine — I audited a dead end you had already abandoned

I reported a rules/geometry pipeline with F1 0.211 and called it "the" takeoff engine. That assessment of *that code* still holds. But your local tree contains an **entire second subsystem that never reached GitHub**:

```
sidecar/glazierai/modules/drawing_intelligence/     (~127 KB Python, uncommitted)
  sheet_classifier.py        18.9 KB   Step 1 — vision sheet routing
  legend_extractor.py        23.5 KB   Step 2 — legend → SystemRegistry
  elevation_reader.py        29.4 KB   Step 3 — elevations → System + Mark registries
  schedule_reader.py         22.0 KB   Step 4 — schedules → ScheduleRegistry
  takeoff_assembler.py       20.0 KB   join registries → TakeoffResult
  vision_helper.py            5.1 KB   PyMuPDF page → Claude Vision blocks
  drawing_intelligence_router.py 7.8 KB  POST /drawing-intelligence/run
sidecar/spec_reader/          ~85 KB   LLM spec reader (router/extractor/prompts/schema/alerts)
sidecar/corpus/markup_corpus.json  7.1 MB  33 jobs · 11,146 real Bluebeam annotations
sidecar/qaqc/eval_harness.py + baseline/  eval harness + recorded baseline, 4 jobs
sidecar/knowledge/system_knowledge_base.json
sidecar/experiments/universal_takeoff_test/  4-job universal-logic test + RESULTS.md
```

This is a **vision-led (VLM) takeoff pipeline** using `claude-sonnet-4-20250514`, mounted at `sidecar/main.py:527-529` under `/drawing-intelligence`, reachable from Electron via `ipcMain.handle('glazierai:runTakeoff')` (`electron/main.ts:913`). It is wired end to end.

More importantly: **you had already diagnosed the precision problem I "discovered," measured it on four jobs, and pivoted.** `sidecar/experiments/universal_takeoff_test/RESULTS.md` (2026-07-15) states it plainly — geometry precision 0.010–0.036 across McLarty, Curtis, Hope, Olathe, with the conclusion *"vector rectangle geometry is a weak proposer… geometry-first discovery is the wrong driver universally."* And `qaqc/baseline/BASELINE.md` records the starting line honestly: det-P **0.016**, det-R **0.165**, e2e-R **0.025**, with a merge gate forbidding any pipeline change that regresses on those four jobs.

So the correct statement is not "your detector is bad." It is: **you retired the geometry-first detector on evidence, built the replacement, and never pushed it.**

### 1.2 The blind-test results are the most valuable asset in the repo

From `RESULTS.md`, on **unmarked** sheets scored against your actual Bluebeam markups:

- **Hope A3.1** (the job where every text rule scored zero): vision layer reached **9/9 agreement** on frame types — all Kawneer storefront in, all HM out — and independently identified the door schedule as the quantity source.
- **McLarty A3.2**: scope in/out matched "on effectively every assembly"; HM vision lites correctly called glazing-only; caught the GF-1 glass film note and anodized closure trim → break metal.
- **Full-workflow tests** (floor plan A1.2, elevations A2.0, details A4.2): 6/6 on SF details; correct CW/SF band identification on elevations.

And the misses are correctly characterized as **knowledge**, not perception: SF vs CW inverted because the truth was in manufacturer series codes (PITCO TMW 450 = CW, TMS 114 = SF); overhead sectional door lites; hardware-set scope implications. Your own conclusion — *"vision solves detection and geometry; trade knowledge solves classification; rules solve scope boundaries"* — is the right architecture, and `sidecar/knowledge/system_knowledge_base.json` is the start of the fix.

The single most important finding in this revision: **the key insight in RESULTS.md is that you bind the legend first.** *"Martin color-codes the EXTERIOR MATERIALS LEGEND rows first… he builds the job's classification key from the legend, then applies it set-wide. Pipeline must do the same: bind legend facts BEFORE classifying openings."* That is the one thing that makes the classification layer universal rather than per-job.

**But the pipeline does not yet do it** — see §3.1.

### 1.3 The AI wrapper — rebuilt, and the blocker is already fixed

My "🔴 B1 invalid model id" finding is **void**. `electron/main.ts:1012` now carries an explicit comment recording the same bug and its fix:

> `// NOTE: 'claude-haiku-3-5-20241022' (the old hardcoded string) is not a valid Anthropic model ID and 404s.`

What replaced the 28-line handler is a real orchestration layer:

| Capability | Status |
|---|---|
| Model routing | `'haiku'｜'sonnet'` from the renderer → `claude-haiku-4-5-20251001` / `claude-sonnet-5`. Renderer never passes a raw model string. |
| Vision | `messages[].content` accepts Anthropic content-block arrays (text + image) |
| Token budget | `maxTokens` clamped 256–32768; defaults 4096 haiku / 16384 sonnet |
| Determinism | `deterministic` flag toggles `thinking: disabled` vs `adaptive` + `effort: medium` |
| Retry | backoff loop for 429/529 — added because parallel calls "silently lose whole elevations" |
| Token accounting | DI pipeline sums `tokens_used` across routing + system + mark + schedule registries |
| API-version traps | documented in code: `temperature` deprecated on sonnet-5 (400s); fixed `budget_tokens` rejected |

**This section of my first audit should be discarded entirely.**

### 1.4 The phantom `:8000` backend — shimmed, deliberately

`apps/builder/src/apiClient.js` now reads `API_BASE = import.meta.env.VITE_API_URL || null` and returns an instant offline `Response` with **no network attempt**, under an explicit "RULE 3 (dead backends)" comment. Finding **D1 is closed.**

### 1.5 Schema fragmentation — largely resolved

`apps/builder/src/utils/systemTypes.js` (new) establishes an owner-approved canonical enum — **`'Ext SF' | 'Int SF' | 'Cap CW' | 'SSG CW'`** — with `toCanonicalSystemType()`, `tryCanonicalSystemType()` (returns `null` rather than silently defaulting), and `toColumnId()` mapping back to the frozen kebab contract ids. `CLAUDE.md §6` freezes it and bans `'Studio Takeoff'` as a systemType.

Per `DEVELOPMENT_BACKLOG.md`, also done 2026-08-02: three frame models unified onto `useBidStore.workspaceSystems`; labor consolidated into `laborCalcEngine.js` with `computeBOM`/`ParametricFrameBuilder`/`useBidMath`/`calcTotals` delegating to it; Supabase reduced to a local no-op stub; `.aiq` payload v3; `BidWorkflowShell.jsx` and `SystemsSidebar.jsx` deleted (confirmed absent from the local tree).

My §6.2 findings A, B and the triple-BOM finding in §2 are **superseded**.

---

## 2. What still stands, verified locally

| # | Finding | Evidence |
|---|---|---|
| **B5** | **Packaged sidecar path is still wrong.** `getSidecarDir()` (`electron/main.ts:125`) returns `path.join(__dirname, '../sidecar')` → `resources/app.asar/sidecar`, while `build.extraResources` still writes to `resources/sidecar`. No Python is bundled; `getSidecarPythonPath()` falls back to bare `python`. **AiQ + spec reader + drawing intelligence will all fail to start in any installed build.** Unchanged from the first audit. |
| — | `components/sidebar/GlazingToolbar.jsx` still present, still importing `./constants` which does not exist at that path. |
| — | `components/Tools/QuickQuote/` still present (broken `../supabaseClient` import; `react-router-dom` still undeclared). |
| — | Legacy duplicates still present: `ContextMenu`, `Header`, `LaborSummaryPanel`, `StructuralCalculator`, `ToolPalette`, `citationStore`, `constants`, `shadowHeuristic`, `systemColumns`, `useGhostLayer`. |
| — | No CI. `.github/` contains only `copilot-instructions.md`. |
| — | `Warren Bid Sheet.xlsm` (4 MB), `temp_parse.cjs` still at repo root. |

### New blockers found in the local tree

| # | Issue | Detail |
|---|---|---|
| **N1** | **Everything above is uncommitted and unpushed.** `DEVELOPMENT_BACKLOG.md` item 0: *"Commit + push the working tree — DONE 2026-08-02 (committed; **push needs owner credentials**)"*, and item 6: *"Commit the uncommitted drawing_intelligence modules + corpus + baseline."* GitHub `master` is four months behind. **The single highest-risk item in this report is not a bug — it is that the drawing-intelligence pipeline, the 11,146-annotation corpus, and the eval baseline exist on exactly one hard drive.** |
| **N2** | **Two FastAPI apps compete for port 8100.** `sidecar/main.py` (AiQ + spec_reader + drawing_intelligence — the one Electron and `npm run sidecar` actually launch) and `sidecar/glazierai_main.py` (GlazierAI, mounts *only* spec_reader, carries `# TODO: import and mount existing AiQ routes here`). `glazierai_main.py` is aspirational and currently a trap: anyone who starts it gets a service missing drawing intelligence. Pick one. |
| **N3** | **`shared/types/` is empty.** A shared-types directory exists at the repo root with nothing in it — the intended fix for Studio/Builder/frame-engine type drift was started and abandoned. |
| **N4** | **Dev port mismatch.** Root `dev:builder` runs `wait-on tcp:5175` and sets `VITE_DEV_SERVER_URL=http://localhost:5175`, while `CLAUDE.md` and `dev:studio` still document Builder on 5173. Worth confirming `apps/builder/vite.config.js` agrees, or the launch races. |
| **N5** | **Monolith growth.** `SpecSorterPage.jsx` 148 KB, `SpecViewer.jsx` 118 KB, `ProjectIntake.jsx` 96 KB, `electron/main.ts` 54 KB, `lib/scheduleParser.js` 46 KB, `lib/specScanner.js` 41 KB, `utils/pricingLogic.js` 42 KB. Several of these tripled since May. They are past the point where a single change can be reasoned about safely. |

### Marked UNVERIFIED (could not re-test without a shell)

- The "95 of 247 Builder modules orphaned" figure. Two named orphans (`BidWorkflowShell`, `SystemsSidebar`) are confirmed deleted; the rest is unretested against the local tree.
- The repo-wide broken-import scan (beyond the two spot-confirmed above).
- Whether the Vitest and pytest suites pass. Test files have grown (`lib/glazingScope.test.js`, `scheduleParser.test.js`, `specSorterV2.test.js` are new), but `sidecar/.pytest_cache/v/cache/lastfailed` is non-empty, which suggests at least some pytest failures at last run.
- pdf.js / Electron / Vite version split-brain — `apps/*/package.json` were staged but not diffed in detail.

---

## 3. Reassessed: where the takeoff engine actually stands

**Revised executive summary:** you have two takeoff engines. The geometry one is measured, understood, and correctly demoted to an assist. The vision one is built, wired, blind-tested with strong agreement against your own markups — and **not yet governed by the eval harness**. The gap between "it worked on the sheets I looked at" and "it scores better than baseline on four jobs" is the entire remaining risk.

### 3.1 The concrete gap in the vision pipeline

`drawing_intelligence_router._run_pipeline()` runs: **Step 1 classify → Step 3 elevations → Step 4 schedule → assemble.**

**Step 2 (legend) is not in it.** `LegendExtractor` (`legend_extractor.py:225`) is instantiated nowhere but its own `__main__` CLI block; the router imports only the `SystemRegistry`/`SystemEntry` *dataclasses* from that module. `elevation_reader` builds the registry itself as a side effect of reading elevation sheets.

That directly contradicts the strongest finding in your own RESULTS.md — *bind legend facts BEFORE classifying openings* — and it is the same failure mode you recorded there (*"My two elevation misses were failures to apply legend facts I had already read"*). Making the legend a first-class, ordered step rather than a by-product of elevation reading is the highest-value change available, and it is a ~40-line routing change, not new capability.

Two further structural notes:

- `schedule_sheets[0]` — only the **first** schedule sheet is processed (`drawing_intelligence_router.py`). Multi-sheet schedules silently truncate.
- Sheet-mode defaulting is a heuristic ("first elevation sheet → `exterior_with_legend`, rest → `interior_schedule`") with manual `routing_overrides` / `sheet_modes` escape hatches. Those overrides are per-job tuning — exactly what the universal-logic rule in `RESULTS.md` forbids. Fine as a debugging tool; dangerous if it becomes the way jobs get made to work.

### 3.2 Revised status table — takeoff only

| Component | Status | Note |
|---|---|---|
| `glazierai/.../sheet_classifier.py` | ✅ wired | Step 1, vision @ 100 DPI |
| `glazierai/.../legend_extractor.py` | 🟠 **built, not in pipeline** | highest-value reconnection |
| `glazierai/.../elevation_reader.py` | ✅ wired | Steps 3; builds both registries |
| `glazierai/.../schedule_reader.py` | 🟡 wired, first sheet only | |
| `glazierai/.../takeoff_assembler.py` | ✅ wired | joins registries, sums tokens |
| `glazierai/.../vision_helper.py` | ✅ | DPI clamp to 7800 px for Claude's 8000 px limit — correct and non-obvious |
| `drawing_intelligence_router.py` | ✅ mounted in `main.py` | ~2–4 min per 12-page set |
| `electron/main.ts :: glazierai:runTakeoff` | ✅ | passes local `pdf_path` + safeStorage key |
| `qaqc/eval_harness.py` + `baseline/` | ✅ | harness self-tests 100% on 33 jobs / 5,377 GT regions |
| **Vision pipeline scored by the harness** | ⬜ **not done** | the ledger in BASELINE.md has one row: the geometry baseline |
| `corpus/markup_corpus.json` | ✅ | 33 jobs, 11,146 annots — the moat |
| `layers/rules_engine.py` (geometry) | 🟡 correctly demoted | keep as measurement/localization assist |
| `layers/layer3_schedule_parser.py` | 🟠 still orphaned | superseded by vision `schedule_reader.py`; **decide and delete** |
| `layer5_cross_reference.py` | ⬜ still missing | vision cross-referencing partly covers the intent |

---

## 4. Revised priorities

1. **Push. Today.** `git push` needs owner credentials (backlog item 0). Until that runs, a drive failure costs you the drawing-intelligence pipeline, the 11,146-annotation corpus, the eval baseline, and four months of Builder fixes. Nothing else on this list matters by comparison.
2. **Score the vision pipeline with `eval_harness.py`** and write the second row of the BASELINE.md ledger. You built the gate; the new engine has never passed through it. Until it does, "9/9 agreement" is anecdote, not a number you can defend to yourself in three months.
3. **Make the legend a first-class Step 2** in `_run_pipeline()`, before elevation classification. Your own blind tests say this is where the accuracy is.
4. **Fix B5** (packaged sidecar path + bundled Python). Right now the product cannot ship with any AI feature.
5. **Resolve N2** — delete or complete `glazierai_main.py`; one service, one entry point.
6. **Then** the backlog's own order (§0→1→2→4-A1→3→6-Phase B→7), which is sound.

---

## 5. Correction to the record

The first audit's Executive Summary, §3 (Auto-Takeoff), §5 (AI Wrapper), §6.2 A/B (system vocabularies), and finding D1 (phantom backend) describe code you had already superseded. Its §2 (architecture map), §4 (viewers), B5, and the hygiene/duplication findings still apply. The eval numbers it quoted (F1 0.211, precision 0.128) are real and remain the honest measure of the *geometry* engine — which is exactly why you replaced it.

I audited a snapshot and called it the state of the work. The state of the work was on your desk.

---

*Revision performed read-only against the live working tree via directory listing and file staging; `device_bash` unavailable on this machine, so full-tree analysis was not possible. No files were modified.*
