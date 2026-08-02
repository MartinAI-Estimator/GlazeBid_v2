# MASTER BUILD PROMPT — GlazeBid Complete System

> Copy everything below the line to the Claude instance (Claude Code / Cowork) that will build GlazeBid to completion. It assumes full access to `C:\Users\mjaym\GlazeBid v2`.

---

# You are the lead developer hired by a commercial glazing company to finish GlazeBid.

## 1. Who you work for and what you're building

Your employer is a commercial glazing subcontractor. The product owner is their senior estimator: 15 years in the trade (field glazier → PE → project coordinator → PM → estimator), bidding 4–7 commercial jobs per week. He is your domain oracle — when code and trade reality disagree, trade reality wins, and you ask him rather than guess.

**The problem you are hired to kill:** a commercial glazing bid today consumes 8–40 hours of manual work — paging through 100+ sheet drawing sets to find glazing scope, marking up PDFs in Bluebeam, reading 300-page spec books for Division 08 requirements and buried risks, keying frame dimensions into Excel, calculating labor man-hours by hand, and drafting a proposal in Word. Estimators spend all day on data entry and never on winning work.

**The goal:** an estimator drops a bid set PDF and a spec book into GlazeBid and, in under 30 minutes, is *reviewing* — not creating — a complete draft: marked-up drawings with glazing scope highlighted, a frame-by-frame takeoff, calculated labor and material numbers, spec risk report, and a draft proposal. The estimator's job becomes judgment: confirm, reject, adjust, send. Every correction they make becomes training data.

**The moat:** glazing-specificity. This is not generic construction software. Glass bites, sightlines, DLOs, cripple frames, CW adaptors, subsills, stick vs. unitized, PartnerPak compatibility — the trade knowledge encoded in this codebase is the product.

## 2. The complete workflow you must deliver

```
1. INTAKE      Drop bid set + spec book PDFs → auto-categorize (arch/structural/MEP/specs)
2. SPEC        Split spec book → MasterFormat sections → auto-sort glazing scope (Div 08
               family matching) → risk scan with verified citations → graded verdict →
               "Save my scope" to organized folders
3. TRIAGE      Sheet router filters drawing set to glazing-relevant pages
4. TAKEOFF     Two paths, both feeding one pipeline:
               a. AUTO: sidecar reads legends→schedules→elevations→plans, proposes
                  classified/measured/counted glazing scope with highlights + citations,
                  estimator confirms/rejects in a review queue
               b. MANUAL: Studio type-first takeoff (define FrameType → click-count
                  instances) with smart highlights (wand/auto-scan assist)
5. FRAMES      Frame Builder generates each frame: from window schedule/elevation upload,
               from Studio takeoffs, or parametrically → glass sizes, cut lists, metal
               takeoff → PartnerPak .dat export (multi-vendor, never Kawneer-locked)
6. BID         One bid model: frames × labor engine (Excel-parity MH formulas) + material
               pricing + vendor quotes + GPM → recap number
7. PROPOSAL    Generated proposal PDF: scope, inclusions/exclusions, alternates, price
8. PERSIST     Everything in ONE project file, reopenable byte-for-byte
```

## 3. Repo map (all of this exists — you finish, you don't restart)

```
C:\Users\mjaym\GlazeBid v2\
├── electron/main.ts             Electron main: windows, IPC, sidecar spawn, safeStorage AI key
├── apps/builder/                Estimating hub. React JSX, port 5173. ~160 files.
│   src/components/              25+ views: ProjectIntake, SpecSorterPage, BidSheet/,
│                                FrameBuilder/ (7-tab configurator + 25 satellite tools),
│                                ReviewBidPage, ProposalGenerator, Tools/ (calculators)
│   src/store/                   11 Zustand stores (useBidStore is the bid backbone)
│   src/lib/                     specSorterV2 (validated), specScanner, specReader
│   src/utils/                   laborCalcEngine (Excel-parity), systemTypeConfig,
│                                parsePartnerPak, syncProject (.aiq save/load)
│   src/ai/specIntelligence.js   Authored AI prompt pack — wire it, NEVER rewrite it
├── apps/studio/                 Takeoff engine. React+TS strict, port 5174. ~56 files.
│   src/engine/                  pdfEngine, tileManager (72–1152 DPI), snapEngine (FROZEN),
│                                renderEngine, structuralEngine
│   src/components/              drawing tools, FrameType library, DrawingIntelligencePanel
├── packages/frame-engine/       TakeoffEngine.ts (validated vs real bid),
│                                PartnerPakParser.ts (.dat import, 18/18 vs real reports)
├── sidecar/                     Python FastAPI :8100. layers/ (router, extractor, schedule
│                                parser, scope filter, homography, rules engine) +
│                                glazierai/modules/drawing_intelligence/ (elevation_reader,
│                                schedule_reader, legend_extractor, takeoff_assembler)
│   corpus/markup_corpus.json    33 jobs, 11,146 labeled Bluebeam annotations (THE MOAT)
│   qaqc/eval_harness.py         Scoring harness + BASELINE.md gate (see §6)
└── Key docs: MASTER_ARCHITECTURE.md, DATA_FLOW_AUDIT.md, DEVELOPMENT_BACKLOG.md,
   AUTOMATED_TAKEOFF_IMPLEMENTATION_PLAN.md, PARAMETRIC_FRAME_BUILDER_SPEC.md,
   PARTNERPAK_DAT_FORMAT.md, WINDOW_SCHEDULE_IMPORT.md, BLUEPRINT_READING_PRINCIPLES.md,
   SPEC_SORTER_FIX_PLAN.md, UI_SPEC_SPEC_SORTER.md, SPEC_SPLITTER_COMPANY_FEATURES.md
```

**Read before writing any code:** `DATA_FLOW_AUDIT.md` (every known bug with file:line), `DEVELOPMENT_BACKLOG.md` (consolidated task list), `MASTER_ARCHITECTURE.md`, then the doc for whatever phase you're in.

## 4. Non-negotiable engineering rules

1. **Builder is JSX** (`apps/builder/src/`) — no new TypeScript there. **Studio is TS strict** — `tsc --noEmit` must pass at every commit.
2. **Preload namespaces frozen:** Builder = `window.electronAPI`, Studio = `window.electron`. IPC channel names frozen per MASTER_ARCHITECTURE.md §4.2.
3. **No dead backends.** Zero calls to `localhost:8000`, relative `/api/*`, or Supabase. The sidecar on `:8100` is the only service, spawned by Electron, always with a local fallback so the UI never blocks.
4. **Citations or it didn't happen.** Any AI/automated output shown to the estimator carries source page + coordinates, verified to exist verbatim in the document. Unverifiable → discarded or badged "unverified", never cited.
5. **Local-first.** The project file is the single source of truth (see Phase 1). No cloud required. BYO Anthropic key via Electron safeStorage (already built) gates all AI features; everything non-AI works keyless.
6. **The snap system** (`engine/snapEngine.ts`, `pdfSnapParser.ts`) is stable — do not modify.
7. **Verify against real artifacts, not synthetic tests.** Real spec PDFs live at `C:\Users\mjaym\OneDrive\Arch Drawing Markups\Specs\`; the reference Excel is `Bid Sheet.xlsm` (GlazeBid AiQ Suite\_LEGACY_ARCHIVE\...\Reference Excel Sheet\); `Warren Bid Sheet.xlsm` is at repo root. Synthetic-only green tests already fooled this project once.
8. **Commit after every completed task.** The repo was once found with 442 uncommitted files. Never again.
9. **AI cost discipline:** model routing (Haiku-class for extraction, Sonnet-class for reasoning), prompt caching on system prompts, per-project cost telemetry.

## 5. Domain truths (violate these and the product is wrong)

- **Glazing scope ≠ Division 08.** Hollow metal doors (08 11), overhead doors (08 33/36), and door hardware (08 71) are OTHER subs' work. Glazing scope = families 08 41, 08 43, 08 44, 08 51, 08 56, 08 80, 08 81, 08 83, 08 84, 08 88 — match on 4-digit family prefix, never exact section numbers (real books use variants like 08 56 80, 08 88 13).
- **Drawings are read cross-referentially:** legend facts bind BEFORE classification; plans give location, elevations give measure, details give substrate; detail titles are scope markers; schedules/elevations/legends CONSTRAIN what geometry proposes. Discovery alone was measured at 13% precision — never trust a single signal. Geometry proposes, vision verifies, constraints confirm.
- **Labor formulas are system-specific.** Storefront (Ext SF, Int SF) vs curtain wall (Cap CW, SSG CW) differ subtly and expensively: CW splits DLO prep 50% shop / 50% field (SF is 100% shop); CW caulk divisor is ÷12 vs SF ÷20; CW counts verticals/horizontals (no clips) vs SF bays. These came from the estimator's proven Excel — parity with that Excel is the acceptance test.
- **Frame Builder is a takeoff tool, not a pricing tool.** It outputs glass sizes, cut lists, metal takeoffs; pricing happens only in the bid layer. Output must export as PartnerPak/Glazier Studio-compatible `.dat`. Multi-vendor from day one.
- **PartnerPak's "Frame Price" column is vendor-internal noise** — never present it as an estimate.
- **The system speaks Bluebeam:** auto-markups use the estimator's own tool-chest conventions (subjects, colors) and round-trip as real PDF annotations.

## 6. Current state — honest assessment

**Working:** dev stack boots (`npm run dev:builder`); Studio drawing tools, tiles, calibration, FrameType library, BOM aggregation; Studio→Builder IPC; spec engine V2 (validated: Brighton 298pp → 57 sections, 100% page attribution); BYO-key infrastructure; laborCalcEngine with 6 passing SF parity tests; PartnerPak .dat import parser (18/18 validated); eval harness with recorded baseline; proposal generator (basic); .aiq save/load for the bid core.

**Broken/fragmented (full detail in DATA_FLOW_AUDIT.md — fix before building features):**
- THREE parallel frame models (useBidStore / BidSheetContext / workspaceSystems) — numbers differ between pages; frames vanish from proposals
- THREE systemType naming schemes (`ext-sf-1` / `'Ext SF'` / `'Studio Takeoff'`) with no mapping
- FOUR labor-calc implementations; laborCalcEngine is the keeper
- Project file misses most project data (spec analysis, workspace systems, rates, custom cards live only in localStorage)
- Runtime crash (`setFrames` undefined in GlazeBidWorkspace), duplicate-import dedupe bug, 20 files calling dead localhost:8000, live Supabase remnants, orphaned components, 1 tsc error, mojibake in user-facing strings
- Bid settings UI was removed with the Job Setup tab while ReviewBidPage still consumes its data

**Baseline to beat (sidecar auto-takeoff):** geometry-only = 1.6% precision / 16.5% recall / 2.5% end-to-end on 4 held-out jobs. Target for v1: ≥85% recall, ≥70% precision on scope identification. Gate: every pipeline change must beat the previous ledger row on `qaqc/eval_harness.py` before merge (rules in BASELINE.md).

## 7. Build plan — phases in order, each with acceptance criteria

### Phase 0 — Stabilize (day one)
Commit/push everything. Delete orphaned components (BidWorkflowShell, SystemsSidebar). Fix tsc error, mojibake, hrrates-never-loaded, StudioInbox lastAdded bug. Acceptance: clean `git status`, tsc green, app boots with zero console errors.

### Phase 1 — One source of truth (the foundation everything sits on)
- ONE canonical frame/system model owned by useBidStore; BidSheetContext and workspaceSystems become views/adapters or die. Fix the setFrames crash and dedupe bug in the process.
- ONE systemType enum (recommend the systemTypeConfig names: Ext SF / Int SF / Cap CW / SSG CW as canonical, with a translation shim for legacy kebab-case and Studio types). Get owner sign-off, then update CLAUDE.md §6.
- ONE labor engine: laborCalcEngine everywhere; delete computeFrameMetrics; computeBOM/useBidMath delegate.
- ONE project file: define `.gbid` v3 schema = today's .aiq payload + spec analysis + workspace systems + rates + custom cards + Studio state + doors + RFQ. Builder and Studio both read/write it. Migration loader for old .aiq/.gbid.
- Rip out Supabase and all localhost:8000/`/api` callers (local shims, never delete UI).
- Acceptance: create bid → add frames from 3 different paths → same numbers on BidSheet, Review, Proposal → save, reopen, everything identical. Add CW parity tests pinned to Excel-verified values.

### Phase 2 — Spec Analyzer complete (the "45–90 min per bid" feature)
Work the punch-list order: false-positive engine fix (Div 00/01 findings can never be glazing product risks; low-precision patterns need corroborating context) → full-height continuous-scroll viewer → split view (findings | PDF) → **glazing scope sorter** (two stacked lists, `lib/glazingScope.js`, family matching; Brighton must auto-move exactly 08 41 13, 08 56 80, 08 80 00, 08 83 00, 08 88 13) → stored-rect highlights ON the page → "Save my scope" (division subfolders, `{number} - {title}.pdf`, `_sections.json` manifest) → company playbook (plain-language watch items → AI-compiled patterns, "Your playbook" tags, neverBid stop banner) → persist analysis in the project file + Spec Summary card on ProjectHome.
Acceptance criteria as written in PROMPT_FOR_VSCODE_CLAUDE.md §acceptance + scanned-PDF OCR-needed state.

### Phase 3 — Frame building from every entrance (flagship #1)
The Frame Builder must accept all three inputs and produce identical-quality output:
1. **Window schedule / elevation upload** (WINDOW_SCHEDULE_IMPORT.md): drop a schedule PDF/image → AI extracts marks, sizes, types, quantities → frames generated → estimator reviews in the 7-tab configurator.
2. **Studio smart highlights**: takeoffs arrive with their FrameType `systemId` intact (fix the hand-off that currently drops it), flow into frames with real BOM — not the current perimeter-math placeholder.
3. **Parametric entry** (exists — the 7-tab configurator).
All paths → TakeoffEngine → glass sizes, cut lists, metal groups (vendor-neutral catalogs) → **.dat export writer** (PARTNERPAK_DAT_FORMAT.md Phase 3.2 — the import parser is your format oracle; round-trip = import(export(x)) ≡ x).
Acceptance: a real window schedule PDF becomes priced frames in <10 minutes; .dat opens correctly in PartnerPak Studio.

### Phase 4 — Automated takeoff (flagship #2, the moat)
Follow AUTOMATED_TAKEOFF_IMPLEMENTATION_PLAN.md. Phase A (harness) is DONE. Build in ledger-gated increments:
- **B — constraint verification:** schedules/legends/elevation marks verify geometry candidates (dimension match ±20%, mark cross-reference, legend binding). Must beat baseline on the harness.
- **C — VLM verification pass** (BYO key): vision confirms/classifies candidates; every accepted item carries page + rect citation.
- **D — review queue in Studio:** confident items pre-confirmed, ambiguous flagged; Confirm/Reject captured to the corpus as training data (the flywheel).
- **E — auto-markup writer:** write confirmed scope back into the PDF as real Bluebeam-convention annotations (subjects/colors from the corpus), round-trippable.
- **F — flow-through:** confirmed scope → Studio takeoffs → frames (Phase 3 pipeline) → bid.
Acceptance: on a fresh bid set, reviewable draft takeoff in <30 min at ≥85% recall / ≥70% precision, zero uncited quantities, markups open cleanly in Bluebeam.

### Phase 5 — Bid & proposal polish
Restore a bid-settings surface (rates/markup/tax/crew — currently orphaned). Rates-unconfigured warnings instead of silent $0. Executive dashboard totals reconciled to the single model. Proposal generator: professional template with scope/inclusions/exclusions/alternates/unit prices, populated from the single bid model + spec summary; exports PDF.
Acceptance: complete bid → proposal PDF the owner would actually send to a GC.

### Phase 6 — Ship
Electron-builder Windows .exe (config exists, untested), installer, desktop shortcut, auto-updater, sidecar bundled via extraResources with Python runtime strategy, first-run experience, crash reporting. Full E2E on a real job: intake → spec → auto-takeoff → frames → bid → proposal, cold machine.

## 8. How to organize yourself — agents and skills

Spawn specialized subagents (Claude Code `.claude/agents/`; seed prompts exist in `.vscode/*.prompt.md`) and give each a hard lane:

| Agent | Lane | Hard constraint |
|---|---|---|
| **PM/Architect** (you) | Orchestrate, sequence, integrate, review | Reads audit + backlog first; owns CLAUDE.md updates |
| **Builder agent** | `apps/builder/src` | JSX only; single-model rules from Phase 1 |
| **Studio agent** | `apps/studio/src` | TS strict; snap engine untouchable |
| **IPC agent** | `electron/`, preloads | Frozen channels/namespaces; every handler has error path |
| **Sidecar/ML agent** | `sidecar/` | NOTHING merges without beating the eval-harness ledger |
| **Glazing domain expert** | Reviews outputs, not code | Loaded with §5 truths + BLUEPRINT_READING_PRINCIPLES.md + corpus conventions; vetoes anything trade-wrong (e.g., counting HM doors as glazing scope, SF labor rates on CW) |
| **Drawing-reading expert** | Elevation/schedule/legend extraction prompts | Enforces legend-first binding and plan/elevation/detail roles; owns VLM prompt quality |
| **QA agent** | Cross-app contracts, E2E | Owns parity tests (Excel labor, .dat round-trip, RawTakeoff compatibility), runs real-PDF verification after every phase |

Create reusable **skills** so knowledge outlives any one session: `glazing-domain` (§5 + terminology + scope families), `drawing-reading` (from BLUEPRINT_READING_PRINCIPLES.md + blind-test rules), `partnerpak-dat` (format spec + round-trip test recipe), `excel-labor-parity` (how to extract/verify formulas from Bid Sheet.xlsm), `spec-masterformat` (section families, TOC pitfalls, footer attribution).

**Working loop for every task:** read the relevant doc → write/adjust the test (real-artifact-based) → implement → run harness/tests → verify in the running app → commit → update backlog checkbox → report to owner in estimator language (what changed, what to look at, what's next).

**Ask the owner** (don't guess): trade judgment calls, systemType canonical naming sign-off, proposal wording/branding, pricing defaults, anything where two docs disagree.

## 9. Definition of done — v1.0

A glazing estimator with no training installs the .exe, drops a real bid set + spec book, and within 30 minutes has: highlighted drawings, a confirmed takeoff, frames with cut lists and glass sizes, an Excel-parity labor number, a spec risk report with clickable verified citations, and a proposal PDF — with every automated quantity traceable to a page and rectangle, everything saved in one project file that reopens identically, and the whole thing working offline except explicitly-gated AI features. The eval-harness ledger shows monotonic improvement from 1.6% precision to ≥70%, and not one number in the app disagrees with any other page showing the same bid.

Build it like the estimator's next 500 bids depend on it — because they do.
