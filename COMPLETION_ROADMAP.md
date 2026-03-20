# GlazeBid v2 — Completion Roadmap
**Target:** Demo-ready desktop app showing the complete Type-First Takeoff workflow  
**Updated:** March 2026

> See `ROADMAP.md` for the full technical phase history (Phases 1–10).  
> This document focuses on what remains to reach a working, presentable product.

---

## Current State Summary

### ✅ What Works Right Now

| Feature | Status |
|---------|--------|
| `npm run dev:builder` → both Vite servers + Electron launch | ✅ Working |
| Studio: PDF load, pan/zoom, high-res tiles | ✅ Working |
| Studio: All drawing tools (Line, Rect, Polygon, Parametric Frame, Rake, Count, Wand) | ✅ Working |
| Studio: AI Auto-Scan + Ghost Detector | ✅ Working |
| Studio: Frame calibration | ✅ Working |
| Studio: FrameType Library (create, color, BOM preview) | ✅ Working (new) |
| Studio: Click-to-count dots on PDF per type | ✅ Working (new) |
| Studio: BOM aggregation (type.bom × dot count) | ✅ Working (new) |
| Studio → Builder IPC: frame types + counts | ✅ Wired (new) |
| Builder: System cards created from Studio types | ✅ Wired (needs E2E verify) |
| Builder: BidSheet pricing grid | ✅ Working |
| Builder: SOW / Bid Summary | ✅ Working |
| Builder: Project save/open (.gbid) | ✅ Working |

### ❌ Broken (Demo Blockers)

| Issue | Files | Severity |
|-------|-------|----------|
| ProjectIntake.jsx makes 4 calls to `localhost:8000` | `ProjectIntake.jsx` | P0 — blocks project creation flow |
| ProjectList.jsx fails silently → blank dashboard | `ProjectList.jsx` | P0 |
| StatsRibbon shows errors or zero state | `StatsRibbon.jsx` | P1 |
| App.jsx line 382 fetch fails silently | `App.jsx` | P1 |
| DocumentViewer / SpecViewer can't load PDFs | `DocumentViewer.jsx`, `SpecViewer.jsx` | P2 |

### ⚠️ Not Yet Connected (Quick Wins)

| Gap | Description | Effort |
|-----|-------------|--------|
| No nav link to Studio Takeoffs | `/inbox` route exists, no sidebar link | 30 min |
| No "Add to Bid" button on Studio takeoffs | `StudioInbox.jsx` has no bridge to `useBidStore` | 1 hr |
| Studio FrameType Library not discoverable | No onboarding hint for new users | 30 min |

---

## Phase D: Demo-Ready (Priority Order)

### D1 — Fix ProjectIntake.jsx (P0) 🔴
**Agent:** `demo-fix-agent`  
**Files:** `apps/builder/src/components/ProjectIntake.jsx`

Tasks:
- [ ] D1.1 — Remove health check (line 230) → `const isOnline = false`
- [ ] D1.2 — Wrap project list fetch (lines 112, 129) → try/catch returning `[]`
- [ ] D1.3 — Replace form POST (line 382) → save to local state + navigate forward
- [ ] D1.4 — Verify project creation flow works end-to-end

---

### D2 — Fix ProjectList.jsx + StatsRibbon.jsx (P0) 🔴
**Agent:** `demo-fix-agent`  
**Files:** `apps/builder/src/components/ProjectList.jsx`, `StatsRibbon.jsx`

Tasks:
- [ ] D2.1 — ProjectList: try/catch the fetch, return `[]` on failure
- [ ] D2.2 — StatsRibbon: remove health check, show local stats or zeros
- [ ] D2.3 — Verify home screen loads without console errors

---

### D3 — Fix App.jsx backend call (P1) 🟡
**Agent:** `demo-fix-agent`  
**Files:** `apps/builder/src/App.jsx` ~line 382

Tasks:
- [ ] D3.1 — Wrap fetch in try/catch, gracefully continue

---

### D4 — Wire Studio Takeoffs Nav Link (Quick Win) 🟢
**Agent:** `builder-agent`  
**Files:** `apps/builder/src/components/SidebarNav.jsx` (or `Header.jsx`)

Tasks:
- [ ] D4.1 — Add "Studio Takeoffs" link to nav → `/inbox`
- [ ] D4.2 — Verify StudioInbox renders with live IPC data

---

### D5 — E2E Verify Type-First Takeoff Flow 🟡
**Agent:** Manual test + `ipc-agent` if issues found

Steps:
- [ ] D5.1 — Launch `npm run dev:builder`
- [ ] D5.2 — Open Studio from Builder
- [ ] D5.3 — Load a glazing PDF + calibrate
- [ ] D5.4 — Create FrameType "A1 - 250 SF 5×8"
- [ ] D5.5 — Place 3 dots on PDF
- [ ] D5.6 — Click "Send to Builder"
- [ ] D5.7 — Builder Studio Takeoffs tab shows the type card
- [ ] D5.8 — Verify aluminum LF and glass SF values are correct (3 × BOM values)

---

### D6 — Add "Add to Bid" Button on Studio Takeoffs (Quick Win) 🟢
**Agent:** `builder-agent`  
**Files:** `apps/builder/src/components/StudioInbox.jsx`

Tasks:
- [ ] D6.1 — Add "→ Add to Bid" button per takeoff row
- [ ] D6.2 — Button calls `useBidStore.addFrame()` with derived BidFrame
- [ ] D6.3 — Navigate to `/bid-sheet` after adding

---

## Phase 7: Builder Enhancements (Post-D Fixes)

### 7.1 — Wire StudioInbox into Builder UI 🟡
**Status:** Route exists (`/inbox`), needs nav access  
**Agent:** `builder-agent`
- [ ] Add sidebar nav link (done in D4 if completed)
- [ ] Ensure `StudioInbox` shows live updates from IPC sync

### 7.2 — Inbox → BidSheet Bridge
**Status:** Not started  
**Agent:** `builder-agent`
- [ ] "Send to BidSheet" button on `StudioInbox` rows
- [ ] Convert `RawTakeoff` → `BidFrame` → `useBidStore.addFrame()`

### 7.3 — Project File Load/Save in Builder
**Status:** IPC handlers exist, need UI wiring  
**Agent:** `builder-agent` + `ipc-agent`
- [ ] Wire `window.electronAPI.saveProject(json)` into `useProjectPersistence.js`
- [ ] Wire `openProject()` into File menu / keyboard shortcut

### 7.4 — Remove/shim remaining localhost:8000 calls
**Status:** P2/P3 items after demo blockers are fixed  
**Agent:** `demo-fix-agent`
- [ ] `DocumentViewer.jsx` → use Electron file dialog
- [ ] `SpecViewer.jsx` → disable backend features, local PDF only
- [ ] `AddendumViewer.jsx` → disable visual diff (not in core workflow)
- [ ] `DoorSchedule.jsx` → disable classification API, keep local logic
- [ ] `MarkupTransfer.jsx` → disable (not in demo path)

---

## Phase 8: Studio → Builder Engineering Workflow

### 8.1 — FrameEngineer Modal in Builder
- Port `FrameEngineerModal.tsx` from `GlazeBid AiQ Suite` into legacy Builder
- Allows engineers to open a TakeoffGroup → full grid + BOM without leaving Builder

### 8.2 — EngineeredFrame → BidStore
- Output of `FrameEngineerModal` → converts to legacy `BidFrame` format
- Sources: `computeFabricationBOM()` output converted to `alumLF`, `glassSF`, `shopMH`, `fieldMH`

### 8.3 — Load Project Data in Studio
- When Builder calls `openStudioProject(), Studio restores saved state from `.gbid`
- IPC: `load-project-data` event → `useProjectStore.loadProjectFromGbid()`

---

## Phase 9: Packaging & Distribution

### 9.1 — Builder PDF Intake
- Drop zone for Architectural PDF + Spec PDF at project creation
- Division 8 spec filtering
- Saves to local desktop directory

### 9.2 — TypeScript Strict Compliance
- `apps/studio/` passes `tsc --noEmit` with `strict: true`
- Fix `window.electron` typing, `usePdfLoader.ts` import, vite.config.ts
- **Agent:** `ts-fix-agent`

### 9.3 — Electron Builder Packaging
- Configure `electron-builder` for Windows `.exe` installer
- Both apps bundle correctly as single distributable
- Remove `webSecurity: false` if possible (or document why it's needed for PDF.js)

### 9.4 — Desktop Shortcut & Auto-Update
- Production shortcut (Start Menu + Desktop)
- Electron auto-updater configured

---

## Phase 10: AI Extensions (Non-Demo Priority)

### 10.1 — ONNX Model Integration
- Swap feature extraction stub in `featureExtract.ts` for real onnxruntime-web inference
- Requires trained MobileNetV3 → 512D ONNX export

### 10.2 — Session Learner Persistence
- Serialize `SessionLearnerState` (anchor, hard negatives, threshold) to `.gbid`
- Learned AI preferences survive app restarts

### 10.3 — Cloud Training Pipeline
- `exportTrainingData()` JSON format + Python retraining script
- PyTorch fine-tune → ONNX re-export, triggered at ≥50 user interactions

---

## Dead Code Audit

### Files Safe to Delete

| File | Reason |
|------|--------|
| `apps/builder/src/components/ProjectIntake.new.jsx` | Unreferenced draft — not imported anywhere |
| `apps/builder/src/components/ProjectIntake.old.jsx` | Superseded old version |
| `apps/builder/src/components/PDFViewer.jsx.broken` | Broken, not imported, not parseable |
| `apps/builder/src/components/SheetSidebar.new.jsx` | Unreferenced draft |

**Verify before deleting:** `grep -r "ProjectIntake.new\|ProjectIntake.old\|PDFViewer.jsx.broken\|SheetSidebar.new" apps/builder/src/`

### Files That Call Dead APIs (Not Delete — Fix)

See Phase D + 7.4 above. Files that call `localhost:8000` need `try/catch` fixes, not deletion — they contain real UI that's worth keeping.

---

## Quick-Win Demo Prep Checklist

Run through this before any demo:

- [ ] `npm run dev:builder` launches without errors
- [ ] Builder home screen loads (no console errors from localhost:8000)
- [ ] "New Project" → project intake form works → reaches BidSheet
- [ ] "Open Studio" button → Studio window opens on same screen
- [ ] Studio: Load a glazing PDF (have a sample `.pdf` ready at a known path)
- [ ] Studio: Calibrate scale (have known dimension ready)
- [ ] Studio: Types panel → create one FrameType
- [ ] Studio: Count dots on 3 instances
- [ ] Studio: "Send to Builder" → Builder shows system card
- [ ] Builder: BidSheet shows aluminum LF + glass SF + pricing
- [ ] Builder: Bid Summary shows SOW

---

## Agent Team Quick Reference

| Task Type | Which Agent |
|-----------|------------|
| Plan, decompose, prioritize | `glazebid-pm` |
| Studio canvas / PDF / types | `studio-agent` |
| Builder UI / pricing / BOM | `builder-agent` |
| IPC / Electron / preloads | `ipc-agent` |
| localhost:8000 dead API fixes | `demo-fix-agent` |
| TypeScript strict compliance | `ts-fix-agent` |

To invoke: In Copilot Chat, type `/glazebid-pm`, `/studio-agent`, `/builder-agent`, etc.
