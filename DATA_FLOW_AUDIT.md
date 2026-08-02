# GlazeBid v2 — Data Flow Audit

**Date:** 2026-07-21 · Traced from code, not docs. Every claim below has a file/line reference.
**Purpose:** map every data flow, and catalog the bugs and gaps found along each one. Input for the finish path.

---

## Flow 1 — Project persistence

### What actually happens

```
Builder save:  App.jsx (autosave + manual)
  → syncProject.js saveProjectToCloud()        [name is legacy — saves to DISK]
  → IPC project:save (electron/main.ts:918)
  → <ProjectsRoot>/<ProjectName>/project.aiq

Builder load:  App.jsx safeLoadFromCloud()
  → IPC project:load → payload
  → useBidStore.rehydrateBid({ frames, financials, vendorQuotes })
  → financials/vendorQuotes parked in pendingRehydration
  → useBidMath reads them in useState lazy initializers (useBidMath.js:67-96)

Studio save:   preload saveProject() → IPC gbid:save → *.gbid (file dialog)
Studio load:   preload openProject() → IPC gbid:open
```

### What the .aiq payload contains (syncProject.js)
metadata + adminSnapshot, takeoff.frames (from useBidStore), financials
(rates, GPM, vendorQuotes from useBidMath), executive summary.

### Bugs & gaps

| # | Severity | Finding |
|---|----------|---------|
| 1.1 | **HIGH** | **Two unlinked project formats.** Builder saves `.aiq`, Studio saves `.gbid`. Neither app reads the other's file. CLAUDE.md rule 9 (".gbid is the single source of truth") is not true in the code. A "project" is actually 2 files + ~10 localStorage keys. |
| 1.2 | **HIGH** | **Most bid data is NOT in the .aiq file.** Not persisted to the project file: BidSheetContext frames, GlazeBidWorkspace `workspaceSystems`, custom system cards, labor systems, spec sorter analysis, Studio inbox, hrFunctionRates, doors, RFQ data, scope data. All live only in localStorage — invisible to backup, project export, or opening the project on another machine. |
| 1.3 | **HIGH** | **Legacy Supabase persistence is still live.** `hooks/useProjectPersistence.js` is 100% Supabase and is still imported by `Project/ProjectManager.jsx` and `PDFViewer/PDFWorkspace.jsx`. Any user hitting those save/load paths gets "Supabase not configured" errors. `Tools/QuickQuote/context/QuoteContext.jsx` has its own supabaseClient too. |
| 1.4 | MED | **hrFunctionRates saved but never restored.** BidSheetContext `updateHrRate` writes `glazebid:bidsheet:<proj>:hrrates` (line 244-250), but the boot effect (line 91-107) never reads that key. Custom HR rates silently revert to defaults every reload. |
| 1.5 | MED | **pendingRehydration is timing-fragile.** Financials only restore if useBidMath mounts *after* rehydrateBid runs. If a BidSheet view is already mounted when the project loads, the seed is missed and defaults win. Works today by luck of mount order. |
| 1.6 | LOW | Roadmap 8.3 (Studio re-loads project data from .gbid on reopen) still open — Studio takeoffs are one-way, fire-and-forget. |

---

## Flow 2 — Studio → Builder takeoff hand-off

### What actually happens

```
Studio useProjectStore.ts syncInboxToStorage() (line 455)
  ├─ localStorage 'glazebid:inbox'  → storage event  (same-origin path)
  └─ window.electron.syncInbox()    → IPC inbox-sync → main relays 'inbox-update'
       → Builder useInboxSync.js → useInboxStore.hydrateInbox()
       → StudioInbox.jsx renders groups → "+ Add to Bid" → useBidStore.addFrame()

Parallel channels: custom-cards-sync → GlazeBidWorkspace.onCustomCardsUpdate (line 201)
                   studio-takeoff-complete → ProjectHome.onTakeoffUpdate (line 117)
                   frame-builder-send → GlazeBidWorkspace.onFrameBuilderReceive (line 210)
```

### Bugs & gaps

| # | Severity | Finding |
|---|----------|---------|
| 2.1 | **HIGH** | **Contract violation: `systemType: 'Studio Takeoff'`.** StudioInbox.jsx:35,76 writes a systemType that is not in the frozen `SystemType` enum. Everything downstream keyed on system type (computeBOM deducts/profiles, system cards, pricing) falls through to defaults. |
| 2.2 | MED | **"✓ Added" feedback never shows on rows.** `addGroupToBid` sets `lastAdded = frameId` (line 45) but the button compares `lastAdded === g.key` (line 165) — never equal. Toast works; per-row state doesn't. |
| 2.3 | MED | **Inbox → bid conversion is lossy.** BOM is naive perimeter math with `cutList: []`; LF and Count takeoffs convert to 0-area frames if added. RawTakeoff `systemId` (the Studio FrameType link) is dropped entirely — the type-first workflow's type assignment doesn't survive the hand-off. |
| 2.4 | LOW | Inbox has no per-project scoping — `glazebid-inbox-store` persists globally, so Project B can show Project A's takeoffs. |

---

## Flow 3 — Pricing (BidSheet → Review Bid → Proposal)

### The core problem: THREE parallel frame models that don't reconcile

| Model | Storage | Written by | Read by |
|-------|---------|-----------|---------|
| `useBidStore.frames` | zustand persist + .aiq file | StudioInbox, FrameBuilder, rehydrateBid | **ProposalGenerator**, RFQ export, .aiq save |
| `BidSheetContext.frames` | localStorage `glazebid:bidsheet:<proj>:frames:<system>` | Classic BidSheet grid, PartnerPak import | Classic grid, totals |
| `GlazeBidWorkspace.importedSystems` | localStorage `glazebid:workspaceSystems:<proj>` | Visual Workspace (default mode) | **ReviewBidPage** |

**Consequence:** a frame added in the Visual Workspace reaches ReviewBidPage but
NOT the ProposalGenerator or the .aiq file. A frame added in the classic grid
reaches neither. Only Studio/FrameBuilder frames flow everywhere. This is the
single biggest source of "numbers don't match between pages."

### Bugs & gaps

| # | Severity | Finding |
|---|----------|---------|
| 3.1 | **HIGH** | **Frame model fragmentation** (table above). Needs one owner store with adapters, or explicit one-way sync rules. |
| 3.2 | **HIGH** | **Runtime crash path:** GlazeBidWorkspace.jsx:30 destructures `setFrames` from `useBidSheet()`, but BidSheetContext does NOT export `setFrames` (see its `value` object, line 314-334). When the modifier-update path at line 811 runs, it throws `TypeError: setFrames is not a function`. |
| 3.3 | **HIGH** | **Broken dedupe → duplicate frames.** BidSheet.jsx:111-114 detects "new" frames by comparing context `f.id` (self-generated `f-...`) against bidStore `f.frameId` (`studio-...`). They can never match, so: the "N frames ready to add" banner never clears after syncing, and clicking sync twice imports every frame twice. |
| 3.4 | MED | **Dead backend call in live path.** GlazeBidWorkspace.jsx:824 `fetch('/api/bidsheet/projects/...')` — no such backend exists in the Electron app. Caught+logged, but it's a rule-7 violation and masks the fact that modifier edits are never durably saved. |
| 3.5 | MED | **ReviewBidPage reads only localStorage** (`bidSettings`, `workspaceSystems` keys, lines 45/210) — its numbers are invisible to .aiq save/load and to the proposal. |
| 3.6 | LOW | **Encoding corruption (mojibake) in BidSheetContext.jsx** — user-facing `confirm()`/`alert()` strings contain `âš ï¸`-style garbage (line 195, 283-285). File was re-saved in the wrong encoding at some point; other files may be affected. |

---

## Flow 4 — Intake & Spec Sorter

### What actually happens

```
ProjectIntake.jsx: file drop → categorize (drawings/specs/other) → save to project folder
   (no hand-off to spec engine — flows are disconnected)

SpecSorterPage.jsx: PDF → parseSpecSectionsV2 → sections (+confidence/method)
   → specScanner scan → findings (+storedRects highlights)
   → results persisted to localStorage only (line 844-853, 1975)
   → saveSections IPC writes section PDFs to a chosen folder
```

### Bugs & gaps

| # | Severity | Finding |
|---|----------|---------|
| 4.1 | MED | **Spec analysis is not part of the project.** Results live in localStorage keyed by project name — not in .aiq, not surfaced on ProjectHome (the planned "Spec Summary" card doesn't exist yet). Re-open project elsewhere → analysis gone. |
| 4.2 | MED | ProjectIntake and SpecSorter are disconnected — dropping specs at intake doesn't queue them for the sorter. |
| 4.3 | MED | From the July punch list, still open: false-positive engine fixes (A1), split-view UI (C1), scope-sorter left panel (F — `lib/glazingScope.js` does not exist), viewer height fix (B1). |
| 4.4 | MED | Task 7 remainder: no "Save my scope", no division subfolders, no `_sections.json` manifest (plain `saveSections` exists at main.ts:726). |
| 4.5 | MED | Task 9 (company playbook): prompt support exists in `ai/specIntelligence.js` but there is no playbook file loader, no Settings editor, no compile flow. |

---

## Flow 5 — AiQ Sidecar (drawing intelligence)

### What actually happens

```
electron/main.ts: spawns Python sidecar on port 8100 at app start; aiq:health, aiq:restart-sidecar
Builder: glazierai:runTakeoff IPC (main.ts:780) → POST localhost:8100/drawing-intelligence/run
         (BYO Anthropic key injected from safeStorage — main.ts:792)
Studio:  useSidecarClient.ts → port 8100; DrawingIntelligencePanel + useDrawingIntelligence
Sidecar: layers/ (router, extractor, schedule parser, scope filter, homography, rules engine)
         + NEW uncommitted glazierai/modules/drawing_intelligence/* (elevation_reader,
         schedule_reader, legend_extractor, takeoff_assembler, vision_helper, router)
```

Design is consistent with the July takeoff plan. Main risks are process ones:
the entire drawing_intelligence module is **uncommitted**, and results flow into
Studio's citation store (better-sqlite3 via IPC) but confirmed takeoffs still ride
the lossy Flow-2 path into the bid.

---

## Flow 6 — Dead endpoints & cloud remnants (full census)

### localhost:8000 callers (rule 7 says: zero) — 20 files, not the 5 in the roadmap

```
apiClient.js                    AIAutomationButton.jsx        AddendumViewer.jsx (2)
AiTrainingPanel.jsx (4)         DoorSchedule.jsx (4)          MarkupTransfer.jsx (2)
MaterialTracker.jsx (4)         NFRCCalculator.jsx (2)        PDFViewer.jsx
PDFViewer/hooks/usePDFDocument.js (3)   PDFViewer/hooks/usePDFLoader.js (2)
PDFViewer/ui/PDFThumbnails.jsx (3)      PropertiesPanel.jsx   ProposalGenerator.jsx
RFQManager.jsx (5)              SheetSidebar.jsx (5)          SheetViewer.jsx (3)
SpecViewer.jsx (3)              StructuralCalculator.jsx (2)  utils/learningApi.js
```

### Relative `/api` fetches (also dead in Electron)
- GlazeBidWorkspace.jsx (1 — see 3.4)
- hooks/useMarkups.js (4)

### Supabase remnants
- hooks/useProjectPersistence.js (live imports — see 1.3)
- Tools/QuickQuote/context/QuoteContext.jsx + its own supabaseClient.js

---

## Flow 7 — Project-rule compliance check

| Rule | Status |
|------|--------|
| 1. Builder JSX-only | **VIOLATED**: `db/citationStore.ts`, `db/implicationSeed.ts`, `store/citationSchema.ts`, `utils/PricingEngine.ts` |
| 2. Studio passes `tsc --noEmit` | **FAILS (1 error)**: `TrainingDataPanel.tsx:188` — `Upload` icon not imported |
| 7. Never call localhost:8000 | **VIOLATED** in 20 files (census above) |
| 9. .gbid single source of truth | **NOT TRUE** — .aiq + .gbid + localStorage (see 1.1/1.2) |
| Dead code deletion (roadmap §9) | ✅ Done — the 4 listed files are gone |

Housekeeping: **442 uncommitted files** (424 modified, 18 untracked incl. all spec-V2
and drawing-intelligence work); branch is 2 commits ahead of origin. Nothing new is safe.

---

## Flow 8 — Additions from cross-session review (2026-07-21)

Findings that surfaced after reading the other three Cowork sessions (Bid Builder
revamp log, Spec Splitter session, Automated Takeoff session) and verifying in code.

| # | Severity | Finding |
|---|----------|---------|
| 8.1 | **HIGH** | **THREE systemType naming schemes now coexist.** (a) frozen contract kebab-case `'ext-sf-1'`… (CLAUDE.md, computeBOM, BidSheetContext systemInstances); (b) new canonical display names `'Ext SF' / 'Int SF' / 'Cap CW' / 'SSG CW'` (`utils/systemTypeConfig.js`, laborCalcEngine, ProductionRatesAdmin, PartnerPak default); (c) `'Studio Takeoff'` (StudioInbox). Nothing translates between them — a Studio or legacy frame passed to `laborCalcEngine` silently defaults to Ext SF formulas. Needs one enum + a mapping layer, and CLAUDE.md §6 updated to match reality. |
| 8.2 | **HIGH** | **FOUR labor-calc implementations.** `utils/laborCalcEngine.js` (new, Excel-parity SF/CW formulas — the intended engine), `context/BidSheetContext.jsx` `computeFrameMetrics` (MHs/SF flat rates), `engine/computeBOM.js` (shop/field MHs in hardware output), `hooks/useBidMath.js` (bid-level totals). Same bid can produce different labor numbers depending on which page computes it. laborCalcEngine should become the single engine; the others delegate or die. |
| 8.3 | MED | **Dead code from the Bid Builder revamp:** `BidSheet/BidWorkflowShell.jsx` and `BidSheet/SystemsSidebar.jsx` are no longer imported anywhere (verified). Delete, or intentionally archive. Note: the Job Setup removal orphaned the `bidSettings` rate UI (labor rate/markup/tax/crew) — ReviewBidPage still reads `glazebid:bidSettings:<proj>` from localStorage, but no UI writes it anymore. **The rate-entry surface is gone while its consumer remains.** |
| 8.4 | MED | **CW formula parity is untested.** laborCalcEngine's 6 parity tests cover SF only. The CW-specific rules (DLO prep 50/50 shop-field split, caulk ÷12 vs ÷20, verticals/horizontals vs bays) have no pinned Excel-verified test values. A silent CW regression = wrong curtain wall bids. |
| 8.5 | LOW | Rates-unconfigured state shows $0 with no warning when a system's type rates are empty (flagged in session, not yet built). `calcSystemMH` also recalculates on every render across 4 surfaces — needs `useMemo`. |
| 8.6 | INFO | `partnerpak-import` type string gates the Import Calculations panel — must survive persist/rehydrate exactly, or the panel silently disappears. |

## Priority shortlist (what actually bites users, in order)

1. **3.1/3.2/3.3** — frame model fragmentation + setFrames crash + duplicate-import bug. This is "numbers don't match / things disappear" territory.
2. **1.2/1.1** — project file doesn't actually contain the project. Decide the canonical store (recommend: one project payload owned by useBidStore + serializers per feature) before building more features on top.
3. **1.3 + Flow 6** — rip out Supabase paths and the 20 localhost:8000 callers (shim pattern per rule 7). Every one is a latent error toast or hang.
4. **2.1/2.3** — preserve systemId/systemType through the Studio→Bid hand-off so type-first takeoff survives end-to-end.
5. **4.x** — spec sorter: finish punch list A1 (trust), F (scope sorter), Task 7/9 remainders; persist analysis into the project payload.
6. Quick wins: 1.4 hrrates load, 2.2 lastAdded compare, 3.6 mojibake re-encode, Studio tsc `Upload` import, commit + push everything.
