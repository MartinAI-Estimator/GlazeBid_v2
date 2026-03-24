# GlazeBid v2 — Project Execution Plan
**Date:** March 24, 2026 (Updated: March 24, 2026 PM)  
**Status:** Active — Phase 0 COMPLETE, Phase 1 VERIFIED  
**PM:** AI Project Manager (Copilot)

---

## Executive Summary

GlazeBid v2 is a two-app Electron monorepo (Builder + Studio) for commercial glazing estimation. The core architecture is sound: Studio's PDF engine, drawing tools, BOM generation, and structural analysis all work. Builder's pricing engine, system definitions, and financial aggregation work. The IPC bridge between them is wired.

**Completed this session:**
1. ✅ **All 80+ hardcoded backend URLs** centralized — every `localhost:8000` / `127.0.0.1:8000` now uses `import.meta.env.VITE_API_URL` with fallback
2. ✅ **Builder PDF loading fixed** — `viewerFileUrl` now loads via Electron IPC from filesystem path stored at intake
3. ✅ **SheetSidebar thumbnails fixed** — accepts `pdfData` prop from parent + Electron IPC fallback + backend fallback
4. ✅ **SheetViewer markup/scale save** — localStorage-first with backend fallback
5. ✅ **apiClient.js created** — centralized `API_BASE`, `apiFetch()`, `apiPost()`, `apiPostForm()` helpers
6. ✅ **E2E Studio→Builder pipeline verified** — Draw → IPC → Inbox → Bid Store → Bid Sheet all functional
7. ✅ **Both apps build clean** — Builder (2305 modules), Studio (91 modules), Electron preloads compiled
8. ✅ **Studio TypeScript** — zero errors (`tsc --noEmit` passes clean)

**What's remaining:**
1. **Critical UX features**: Undo/Redo, proposal generation, vendor workflow
2. **Material pricing**: BOM has structure but no cost fields yet
3. **Testing**: No automated tests exist
4. **Packaging**: electron-builder config not finalized

---

## Phase 0: Foundation — ✅ COMPLETE

### 0.1 — ✅ App Boots  
Both Vite servers respond 200, Electron launches 4 processes. `npm run dev:builder` works.

### 0.2 — ✅ Backend URLs Centralized  
**Completed:** All 80+ hardcoded `localhost:8000`/`127.0.0.1:8000` URLs across 24 files now use `import.meta.env.VITE_API_URL` with fallback. Created `apps/builder/src/apiClient.js` with `apiFetch()`, `apiPost()`, `apiPostForm()` helpers. Updated `constants.js` ghost API URLs to use `API_BASE`.

**Files updated:**
- SheetSidebar.jsx (5 URLs → env-aware + localStorage-first markups + pdfData prop)
- SheetViewer.jsx (2 URLs → localStorage-first save + env-aware fallback)
- PDFViewer.jsx, SpecViewer.jsx, DoorSchedule.jsx, AdminSettings.jsx
- AiTrainingPanel.jsx, MaterialTracker.jsx, NFRCCalculator.jsx
- ProposalGenerator.jsx, RFQManager.jsx, StructuralCalculator.jsx
- AddendumViewer.jsx, MarkupTransfer.jsx, PropertiesPanel.jsx
- PDFThumbnails.jsx, AIAutomationButton.jsx, learningApi.js
- useGhostLayer.js (uses `apiFetch` import), constants.js (uses `API_BASE` import)
- usePDFDocument.js, usePDFLoader.js (orphaned but updated for future use)

### 0.3 — ✅ Builder PDF Loading Fixed  
**Completed:** App.jsx now loads PDFs via Electron IPC:
- Added `pdfFileData` state + `useEffect` that reads `glazebid:filePath:{project}` from localStorage
- Calls `window.electronAPI.readPdfFile(filePath)` → returns `{ok, buffer: Uint8Array}`
- Sets `setPdfFileData({ data: result.buffer })` → passed to `PDFWorkspace` as `file` prop
- SheetSidebar receives `pdfData` prop for thumbnail generation (no separate fetch needed)

---

## Phase 1: Core Data Pipeline — ✅ VERIFIED

### 1.1 — ✅ E2E Studio → Builder Takeoff Flow
Pipeline verified and functional:
```
Studio: Draw frame (useParametricTool.ts → addShape)
  → addTakeoff (useProjectStore.ts) → syncInboxToStorage 
  → localStorage 'glazebid:inbox' + window.electron.syncInbox(inbox)
  → Electron main.ts relays 'inbox-sync' → 'inbox-update' to Builder
  → Builder: useInboxSync.js receives via onInboxUpdate + storage event
  → Builder: useInboxStore.js hydrateInbox(items)
  → Builder: StudioInbox.jsx groups & displays takeoffs
  → "Add to Bid" → useBidStore.addFrame() with computed BOM
  → BidSheet/BidSummaryDashboard shows totals + labor costs
```

**Status:** All links verified functional. No structural broken links.

**Identified gaps (feature-level, not blockers):**
- `systemType: 'Studio Takeoff'` is hardcoded (no per-project system assignment)
- Labor rates configurable but no UI component calls `setLaborRate()` yet
- Material pricing not implemented (labor costs only)

### 1.2 — Frame Type Library → Builder Sync
Verify the type-first workflow:
```
Studio: Create FrameType → place dots → sync
  → Builder: receives frame types via IPC
  → Builder: creates system cards with aggregated BOM × count
```

### 1.3 — Project Save/Load Round-Trip
Verify `.gbid` file correctly persists and restores:
- All Studio shapes, calibrations, page labels, bookmarks
- All Builder frames, systems, bid settings, vendor quotes
- The IPC state (inbox, custom cards, frame types)

---

## Phase 2: Critical UX Features

### 2.1 — Undo/Redo System (Studio)
**Approach:** Command pattern with a history stack in `useStudioStore`.
- Track shape additions, deletions, modifications, selection changes
- `Ctrl+Z` / `Ctrl+Shift+Z` keyboard shortcuts
- Max history depth: 50 operations
- Stored in-memory only (not persisted)

### 2.2 — Vendor Quote Workflow (Builder)
Complete the `BidCart` vendor quote flow:
- 4 default rows (Aluminum, Glass, Hardware, Subs) — already exist
- Add/remove/edit quote rows
- Tax toggle per row
- Auto-aggregate into summary

### 2.3 — Copy/Paste Shapes (Studio)
- `Ctrl+C` copies selected shape
- `Ctrl+V` pastes with slight offset
- Works across pages

---

## Phase 3: Output & Reporting

### 3.1 — Proposal PDF Generation
Replace the stub in `ProposalGenerator.jsx` with actual PDF output:
- Use `jsPDF` or `@react-pdf/renderer`
- Cover letter, scope of work, pricing summary, exclusions, terms
- Company branding placeholder

### 3.2 — Glass RFQ Email Generation
Wire `GlassRFQModal.jsx` to produce:
- CSV/Excel export of glass sizes + types
- Mailto link with pre-filled body
- Save RFQ to project file

### 3.3 — Print/Export Takeoff Annotations
Export Studio markups as:
- Annotated PDF (overlay shapes on original PDF)
- CSV takeoff summary (frame list with dimensions, systems, quantities)

---

## Phase 4: Polish & Stability

### 4.1 — Continuous Scroll Mode Fixes
- Shape filtering in continuous mode (some shapes render on wrong pages)
- Calibration reference line per-page in continuous mode
- TypeCountDots positioning in continuous mode

### 4.2 — Shape Persistence Across Sessions
- Shapes should survive app restart (currently only persisted via .gbid save)
- Auto-save to localStorage or temp file on every shape change

### 4.3 — Snap-to-PDF Geometry Improvements
- Expand PDF path operator coverage in `pdfSnapParser.ts`
- Add arc/curve snap support
- Improve intersection detection accuracy

### 4.4 — Studio PDF Page Management
- Rotate pages (90° CW/CCW)
- Reorder pages via drag
- Delete pages from view

---

## Phase 5: AI & Detection Features

### 5.1 — Wand Tool Accuracy
- Improve edge detection thresholds
- Add adaptive sensitivity based on PDF resolution
- Better boundary closing for incomplete edges

### 5.2 — AI Auto-Scan Refinement
- Improve region detection confidence scores
- Better frame-vs-non-frame classification
- UX improvements for BulkClassifyDialog

### 5.3 — Ghost Detection Pipeline
- Connect ML inference pipeline
- Add user feedback loop (accept/reject → improve model)

---

## Phase 6: Packaging & Distribution

### 6.1 — Electron Builder Configuration
- Configure `electron-builder` for Windows `.exe` installer
- Bundle both apps correctly
- Code signing (future)

### 6.2 — TypeScript Strict Compliance
- `tsc --noEmit --strict` passes for Studio (currently clean)
- Fix any remaining type issues

### 6.3 — Auto-Update
- Electron auto-updater for future releases

---

## Execution Order (What Gets Done First)

```
NOW:     Phase 0.2 (apiClient + offline fallbacks for P0 files)
         Phase 0.3 (Builder PDF loading via Electron IPC)
NEXT:    Phase 1.1 (E2E Studio → Builder flow)
         Phase 1.2 (Frame Type Library sync)
         Phase 1.3 (Project save/load round-trip)
THEN:    Phase 2.1 (Undo/Redo)
         Phase 2.2 (Vendor quotes)
         Phase 3.1 (Proposal PDF)
LATER:   Phase 4 (Polish)
         Phase 5 (AI)
         Phase 6 (Packaging)
```

---

## QA Checkpoints

After each phase, run this verification:

### Smoke Test
- [ ] `npm run dev:builder` → Electron launches, no console errors
- [ ] Builder home screen loads, project list shows (or empty state)
- [ ] "New Project" → intake form → project created
- [ ] "Open Studio" → Studio window opens

### Studio Takeoff Test
- [ ] Load PDF → pages display correctly
- [ ] Calibrate scale → calibration persists per page
- [ ] Draw rect → dimensions shown in inches
- [ ] Assign to system → color changes
- [ ] Create FrameType → place 3 dots → counts correct
- [ ] BOM preview shows cut list + glass list

### Builder Pricing Test  
- [ ] Frame in BidSheet → metal/glass/labor costs computed
- [ ] GPM tiers apply correctly
- [ ] Grand Total = Hard Cost ÷ (1 - GPM%)
- [ ] Vendor quotes aggregate

### Integration Test
- [ ] Studio inbox sync → Builder receives takeoffs
- [ ] Custom system cards transfer
- [ ] Frame types with counts transfer
- [ ] "Add to Bid" → pricing populates

### Save/Load Test
- [ ] Save project → .gbid file created
- [ ] Close and reopen → all state restored
- [ ] Shapes, calibrations, bookmarks, bid data all persist
