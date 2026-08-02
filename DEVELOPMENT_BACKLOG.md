# GlazeBid — Consolidated Development Backlog

**Date:** 2026-07-21 · Compiled from all four Cowork sessions + DATA_FLOW_AUDIT.md.
This is the single task list. Items marked **[AUDIT n.n]** have full detail in DATA_FLOW_AUDIT.md.
Sources: 🅐 = this session's audit · 🅑 = Bid Builder revamp session (VS Code log) · 🅒 = Spec Splitter session · 🅓 = Automated Takeoff session

---

## 0. Housekeeping (do first, ~an hour)

- [x] 🅐 Commit + push the working tree — DONE 2026-08-02 (committed; push needs owner credentials)
- [x] 🅐 Delete dead code: `BidWorkflowShell.jsx`, `SystemsSidebar.jsx` [AUDIT 8.3] — DONE
- [x] 🅐 Fix Studio tsc error: `TrainingDataPanel.tsx:188` missing `Upload` import — DONE
- [x] 🅐 Re-encode `BidSheetContext.jsx` (mojibake) [AUDIT 3.6] — DONE
- [x] 🅐 Update CLAUDE.md (SystemType canonical, persistence v3 reality, laborCalcEngine) — DONE

## 1. Data integrity — the bug cluster behind "numbers don't match" (Builder)

- [x] 🅐 **Unify the 3 frame models** — useBidStore owns workspaceSystems; ReviewBidPage reads store [AUDIT 3.1] — DONE 2026-08-02
- [x] 🅐 Fix `setFrames` crash in GlazeBidWorkspace [AUDIT 3.2] — DONE
- [x] 🅐 Fix frame-sync dedupe (sourceFrameId) [AUDIT 3.3] — DONE
- [x] 🅐 **Unify systemType naming** — utils/systemTypes.js canonical + shim [AUDIT 8.1] — DONE (owner-approved)
- [x] 🅐 **Consolidate labor calc to laborCalcEngine.js** — computeFrameMetrics delegates; computeBOM + ParametricFrameBuilder + useBidMath + useBidStore.calcTotals delegate/aggregate [AUDIT 8.2] — DONE
- [ ] 🅑 Restore a home for bid settings (labor rate, markup, tax, crew) — UI was removed with the Job Setup tab but ReviewBidPage still consumes `glazebid:bidSettings` [AUDIT 8.3]
- [x] 🅐 Expand .aiq payload — v3: workspaceSystems + bidSettings + localState snapshot [AUDIT 1.1/1.2] — DONE (Studio .gbid unification still open)
- [x] 🅐 Remove Supabase paths — supabaseClient is a local no-op stub; dependency removed [AUDIT 1.3] — DONE
- [x] 🅐 Shim/remove localhost:8000 callers + relative `/api` fetches — apiFetch shim, zero network [AUDIT Flow 6] — DONE
- [ ] 🅐 Quick wins: hrrates boot-load [1.4] DONE · StudioInbox lastAdded [2.2] DONE · inbox per-project scoping [2.4] OPEN · pendingRehydration timing [1.5] OPEN

## 2. Labor calc engine hardening (Builder) — from the revamp session

- [ ] 🅑 **CW parity tests** — pin Excel-verified MH values for a real Cap CW frame (DLO 50/50 split, caulk ÷12, verticals/horizontals) [AUDIT 8.4]
- [ ] 🅑 "Rates not configured" warning on cost panels + Admin-tab badge when a type's rates are zero [AUDIT 8.5]
- [ ] 🅑 `useMemo` for calcSystemMH (recomputes on every render across 4 surfaces)
- [ ] 🅑 Verify `bid.projectName` seeds from the project prop (top bar showed "Untitled Bid" risk after Job Setup removal)
- [ ] 🅑 Verify `partnerpak-import` type survives persist/rehydrate (gates the Import Calculations panel) [AUDIT 8.6]
- [ ] 🅑 Empty states for Breakdown tab system cards (no items yet ≠ broken-looking)
- [ ] 🅑 Visual check: scope card grid layout after Glass Pricing card removal

## 3. Studio → Bid pipeline (both apps)

- [ ] 🅐 Preserve `systemId`/FrameType through the inbox hand-off (type-first takeoff currently dies at StudioInbox) [AUDIT 2.1/2.3]
- [ ] 🅐 Replace naive perimeter BOM in StudioInbox with real computeBOM/laborCalcEngine call
- [ ] Roadmap 8.1–8.3: port FrameEngineerModal; EngineeredFrame → BidStore; Studio re-loads from .gbid

## 4. Spec Analyzer — desktop app (this repo)

- [ ] 🅒 Punch list A1: false-positive regex fix (bare `proprietary` etc.), Div 00/01 findings demoted, product-risk categories restricted to Div 08 → **top of list, kills every demo**
- [ ] 🅒 Punch list A2: one source of truth for grade/verdict/pill severity
- [ ] 🅒 Punch list B1+B2: viewer rewrite (full-height, fit-width, continuous scroll)
- [ ] 🅒 Punch list C1: split view (findings left / PDF right)
- [ ] 🅒 Punch list F: glazing scope sorter — two stacked lists, `lib/glazingScope.js` with GLAZING_SCOPE_DEFAULTS, 4-digit family matching (validated on Brighton: auto-moves exactly 08 41 13, 08 56 80, 08 80 00, 08 83 00, 08 88 13)
- [ ] 🅒 Punch list B3, D1+D2, C3 (stored-rect highlights on page, excerpt trimming, calm severity, entry flow)
- [ ] 🅐 Task 7 remainder: "Save my scope", division subfolders, `_sections.json` manifest [AUDIT 4.4]
- [ ] 🅐 Task 9: company playbook (settings editor, compile flow, "Your playbook" tags) [AUDIT 4.5]
- [ ] 🅐 Persist spec analysis into the project payload; surface "Spec Summary" card on ProjectHome [AUDIT 4.1]
- [ ] 🅐 Connect ProjectIntake → Spec Sorter (dropped specs queue for analysis) [AUDIT 4.2]

## 5. OUT OF SCOPE — vendor-portal (separate program)

The vendor-portal (`C:\Users\mjaym\vendor-portal`) is a completely separate product.
Its Spec Analyzer punch list work is tracked in that repo, not here. Only note for
THIS repo: `SITE_SPEC_ANALYZER_PUNCHLIST.md` at our root describes the portal's UI —
the parts of it that also apply to the desktop Spec Sorter are already captured as
items in section 4. Consider moving/renaming that file so the two products don't blur.

## 6. Automated Takeoff / AiQ (sidecar)

- [x] 🅓 Phase A — eval harness + baseline done (33 jobs, 5,377 GT regions; geometry-only baseline: **1.6% precision / 16.5% recall / 2.5% e2e**; gate rule in BASELINE.md)
- [ ] 🅓 **Phase B — constraint verification**: feed schedule/legend/elevation marks into verification; first ledger row must beat baseline
- [ ] 🅓 Encode the blind-test rules in the pipeline: bind legend facts BEFORE classifying; required page coverage = plan (location) + elevation (measure) + details (substrate); detail titles as scope markers
- [ ] 🅓 Commit the uncommitted drawing_intelligence modules + corpus + baseline (part of item 0)
- [ ] Later phases per AUTOMATED_TAKEOFF_IMPLEMENTATION_PLAN.md (auto-markup writer with snapped geometry was the runner-up next step)

## 7. Ship it (Phase 9, unchanged from roadmap)

- [ ] Electron Builder .exe installer · desktop shortcut · auto-updater (config exists in package.json, untested)
- [ ] Full TypeScript strict compliance sweep in apps/studio
- [ ] E2E verify: intake → spec → takeoff → bid → proposal on a real job

---

## Suggested order

**0 → 1 → 2** (make the numbers trustworthy — this is the "bugs and gaps" cluster) →
**4-A1** (spec trust) → **3** (pipeline) → **6 Phase B** (moat) → **7** (ship).

## Resolved since last sessions (verified in code today)

- useProductionRatesStore persist middleware ✓ (has persist + migrate, `glazebid-production-rates`)
- Roadmap dead-code list (ProjectIntake.new/.old, PDFViewer.jsx.broken, SheetSidebar.new) ✓ deleted
- Spec V2 wired into SpecSorterPage + extractor ✓ · BYO key via safeStorage ✓ · SCOPE/REVIEW divisions ✓
