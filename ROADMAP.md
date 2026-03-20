# GlazeBid v2 — Master Development Roadmap

**Project Goal:** Production Electron + React desktop app for commercial glazing estimation.
Merges the legacy Builder UI (155 JSX files) with the new TypeScript Studio takeoff engine (56 files) into a single monorepo. Both windows run in the same Electron process and share a live IPC bus.

**Core Rule:** All project data saved locally via `.gbid` files. Builder spawns Studio. Math and DPI scaling must be flawless.

---

## ✅ Phase 1: Foundation & Monorepo Setup (Complete)

- [x] **1.1 — Scaffolding:** `apps/builder` + `apps/studio` workspaces. Root `package.json` with `workspaces: ["apps/*"]`. `.gitignore`.
- [x] **1.2 — Tooling:** Vite + React in both apps. Builder on port 5173 (JSX), Studio on port 5174 (TypeScript).
- [x] **1.3 — Electron Shell:** `electron/main.ts` entry point with dev/prod load logic.
- [x] **1.4 — Multi-Window Management:** Electron spawns Studio as a child `BrowserWindow` sharing the same main process and IPC bus.

---

## ✅ Phase 2: Local Data & State Management (Complete)

- [x] **2.1 — IPC Bridge:** `apps/builder/electron/preload.js` exposes `window.electronAPI`; `apps/studio/src/preload/index.ts` exposes `window.electron`.
- [x] **2.2 — `.gbid` File Handler:** `electron/main.ts` handles `gbid:save` / `gbid:open` with native file dialogs.
- [x] **2.3 — Global State (Builder):** `useBidStore.js` — frames, labor rates, project totals, glass RFQ. `useInboxStore.js` — `RawTakeoff[]` mirror from Studio.
- [x] **2.4 — PDF I/O:** `pdf:open` (open dialog → `Uint8Array`), `pdf:save`, `glazebid:read-pdf` (path-based read). Preload bridges on both windows.

---

## ✅ Phase 3: GlazeBid Builder — Data & Pricing (Complete)

- [x] **3.1 — Builder UI Shell:** React layout (Sidebar, Header, Navigation, Global Theme, CustomTitleBar).
- [x] **3.2 — Project Dashboard:** `ProjectHome.jsx` — project intake, sheet selector, "Open Studio" button gateway.
- [x] **3.3 — Document Management:** `DocumentSelector`, `SheetSidebar`, `PDFWorkspace`, `SheetViewer` — architectural/spec PDF management.
- [x] **3.4 — Estimation Grid (BidSheet):** `BidSheet/` (~25 components) — parametric pricing grid: aluminum LF, glass SF, labor phases (shop/dist/field), cut lists, DLOs. Inline-editable cells. Real-time recalculation.
- [x] **3.5 — Pricing Engine:** `utils/pricingLogic.js` (legacy) + `pricingEngine.ts` (new). Pure math: `calculateFrameGeometry`, `calculateAluminumMaterial`, `calculateHrFunctions`, `combineLabor`, `calculateSystemTotals`. 27/27 smoke tests against Excel reference.
- [x] **3.6 — Per-System HR Overrides:** `DEFAULT_HR_FUNCTION_RATES_BY_SYSTEM`; per-group `hrFunctionRateOverrides`; door rate override UI.
- [x] **3.7 — Admin Settings:** `AdminDashboard` — markupRate, taxRate, baseLaborRate controls.
- [x] **3.8 — Phase-Split Labor:** `SystemTotals` carries `shopMhs/distMhs/fieldMhs/shopCost/distCost/fieldCost`.
- [x] **3.9 — SOW Generator:** `sowGenerator.ts` — 5-section Project SOW: Material Tracker (by cost code), SF/CW labor (phase split), ManualLaborEntry misc, custom materials. `getProjectSOW` selector.
- [x] **3.10 — Bid Summary View:** Full 5-section SOW output. Hero stats (Grand Total, GPM badge). GPM color-coded ≥25%/≥15%/<15%.
- [x] **3.11 — Cost Codes on MaterialLineItem:** `costCode?` field — displayed in item rows, SOW Section 1 and custom material sections.
- [x] **3.12 — Cap CW / SSG CW Geometry:** CW-specific `stoolTrim/ft/wlDl` input fields and calculation layer; `FrameGrid` columns switch dynamically based on system type.
- [x] **3.13 — Equipment & Staging (Gen. Conditions):** `EquipmentEntry` per project; boom lifts, scaffolding, crane days with tax+markup; `GeneralConditionsView` CRUD; Section 4c in BidSummaryView.
- [x] **3.14 — Cross-Bid Analytics:** $/SF, MH/SF, $/MH KPI bar; per-system breakdown table; phase MH split (Shop/Dist/Field) in BidSummaryView.
- [x] **3.15 — Alternates / Scope Tags:** `ScopeTag = 'BASE_BID' | 'ALT_1' | 'ALT_2' | 'ALT_3' | 'ALLOWANCE'`. Color-coded dropdown per system card. Section 6 alternates summary (only visible when multiple tags in use).

---

## ✅ Phase 4: GlazeBid Studio — Rendering Engine (Complete)

- [x] **4.1 — Canvas Engine & UI Shell:** Coordinate system (SCREEN ↔ PAGE ↔ INCHES), `Camera.ts` (pan/zoom 2%–10,000%), snap engine, render engine (dirty-flag + rAF, page shadow, shape primitives + labels), Toolbar, PropertiesPanel, CalibrationModal, StudioLayout.
- [x] **4.2 — PDF Ingestion:** PDF.js worker, `loadPdfFromBuffer()`, `PdfTileManager` (72–1152 DPI quality buckets), IPC bridge `pdf:open`, thumbnail sidebar (140px JPEG previews), continuous-scroll multi-page rendering, high-res zoom (×16 tile at 10,000%).
- [x] **4.3 — DPI & Tile Math:** All tile dimensions use `Math.round(viewport.width/height)`. Tile render scale = integer bucket multiplier, no sub-pixel mismatch.

---

## ✅ Phase 5: Studio Tools & Parametric Engine (Complete)

- [x] **5.1 — Canvas Init:** 2D canvas + DPR-aware pipeline (Task 4.1).
- [x] **5.2 — Camera System:** `Camera.ts` pan, zoom, `fitToPage()`, `zoomAt()`, `zoomBy()` (smooth trackpad), DPR-aware transforms (Task 4.1).
- [x] **5.3 — Drawing Tools:** Select, Pan, Line, Rect, Polygon, Calibrate, Parametric Frame, Rake, Count, Wand — all in `hooks/useCanvasEngine.ts`. Snap engine.
- [x] **5.4 — Studio → Builder Inbox Sync:**
  - `useProjectStore.ts` `syncInboxToStorage()` — writes `localStorage['glazebid:inbox']` AND sends `window.electron.syncInbox(inbox)` IPC on every mutation
  - `useInboxStore.js` (Builder) — `RawTakeoff[]` state with `hydrateInbox` / `addTakeoff` / `resetInbox`
  - `useInboxSync.js` (Builder) — dual-path listener: IPC `inbox-update` + `storage` event fallback
  - `StudioInbox.jsx` (Builder) — live table of Studio takeoffs with dimension grouping, SF totals, LF totals
- [x] **5.x.1 — Measurement Parser:** `parseArchitecturalString()` / `formatArchitecturalInches()`. `10'2"`, `10'-2 1/2"`, plain decimal. 1/16" precision.
- [x] **5.x.2 — MeasurementInput Component:** Drop-in `<input>` replacement; fractional display; parse on blur/Enter; revert on Escape.
- [x] **5.x.3 — Door Bay Integration:** `doorMath.ts` — `DoorSpec`, `DoorAssembly`, none→single→pair cycle. 8.5 hr/door labor. Door toggle per bay-column in GridEditor.
- [x] **5.x.4 — Frame Profile Depths:** 8 profiles (`sf-250` → `cw-deep`). Profile dropdown in QuickAssignMenu. Profile info in PropertiesPanel. `ProfileKey` persisted to `.gbid`.
- [x] **5.x.5 — Fabrication BOM Engine:** `systemEngine.ts` `computeFabricationBOM()` → `FabricationBOM` with extrusion cut lengths, glass knife sizes (DLO + 2×glassBite), `HardwareSummary`.
- [x] **5.x.6 — FrameEditorPanel:** 3-tab BOM viewer in PropertiesPanel: Summary (hardware + labor MHs), Cut List (mark/role/qty/length), Glass (knife sizes + V/S toggle).
- [x] **5.x.7 — Glass Type per Bay:** `GridSpec.bayTypes?: Record<string, GlassType>` (Vision/Spandrel). V/S pill per DLO cell in GridEditor. Persists in `.gbid`.
- [x] **5.x.8 — Rosetta Stone BOM:** `ProfileParams` interface decouples geometry from vendor. `archetypes.ts` (8 system archetypes + 9 vendors: Kawneer/Tubelite/YKK/EFCO). `bomGenerator.ts` `bomGenerator(frame, vendor)` → `VendorBOM` + `compareVendors()`.
- [x] **5.y.1 — Rake / Sloped Frame:** `rakeMath.ts` + `useRakeTool.ts` + `RakeOverlay.tsx`.
- [x] **5.y.2 — Count Tool:** `countMath.ts` + `useCountTool.ts` + `CountOverlay.tsx`.
- [x] **5.y.3 — Wand / Auto-Detect:** `useWandTool.ts` + `pdfSnapParser.ts` + `edgeDetect.ts`.
- [x] **5.y.4 — PDF Engine Extended:** `pdfEngine.ts` higher-level abstraction; `usePdfLoader.ts` async lifecycle hook.
- [x] **5.z.1–5.z.7 — Builder UX & Routing Audit:** Duplicate portal removed; routing fixed (Step 2 → `/inbox`; New Project → `/home`; Review → `/bid-summary`); `crewSize`/`laborContingency` persisted to `.gbid`; orphaned files deleted.

---

## ✅ Phase 6: AI Intelligence Layer (Complete)

### 6.1 — Pure Logic AI (Complete ✅)
- [x] **6.1.1 — Fallback Intelligence:** Geometric clustering + sill-height + aspect-ratio + size validation + agreement boost. Confidence tree: auto_apply / suggest / flag / ask.
- [x] **6.1.2 — Learning Loop Logger:** correction/validation/rejection to `localStorage`. `trainingReady` at 50+ interactions. `exportTrainingData()`.
- [x] **6.1.3 — Confidence Badge UI:** Green/yellow/orange/red badge in PropertiesPanel for unassigned shapes.

### 6.2 — Canvas Auto-Scan (Complete ✅)
- [x] **6.2.1 — Page Region Scanner:** `pageScan.ts` single-pass BFS on light pixels → `ScanRegion[]`. No WASM.
- [x] **6.2.2 — AI Auto-Scan Hook:** `useAIAutoScan.ts` — scan → convert → gate → cluster → classify → `onScanComplete`.
- [x] **6.2.3 — Bulk Classify Dialog:** Per-cluster rows; default accept ≥50%; "Apply N Frames" commits.
- [x] **6.2.4 — Toolbar AI Scan Button:** Violet button; disables + "Scanning…" during scan.

### 6.3 — Ghost Detector / ML (Complete ✅)
- [x] **6.3.1 — Feature Encoder:** `featureExtract.ts` — 128D Float32Array, 8×8 grid, L2-normalised. ONNX slot-ready.
- [x] **6.3.2 — Session Learner:** `useSessionLearner.ts` — anchor embedding, adaptive threshold, `rankCandidates<T>()`.
- [x] **6.3.3 — Ghost Detector Pipeline:** `useGhostDetector.ts` — multi-scale window, NMS, re-rank, `commitDetection` / `rejectDetection`.
- [x] **6.3.4 — Ghost UI:** `useGhostTool.ts` (G shortcut) + `GhostOverlay.tsx` (Accept All, Clear, live threshold).

---

## ✅ Phase V2: Legacy + Studio Migration (Complete — March 2026)

*Combined the legacy Builder app with the new Studio engine into a unified monorepo at `C:\Users\mjaym\GlazeBid v2\`.*

### V2.1 — Codebase Audit & Mapping (Complete ✅)
- [x] Deep audit of Legacy Builder (`_LEGACY_ARCHIVE/GlazeBid_AIQ/frontend/` — 155 JSX files)
- [x] Deep audit of New Studio (`apps/studio/` — 56 TypeScript files)
- [x] All cross-app connections documented: IPC channels, shared types, localStorage keys, BroadcastChannel names
- [x] Port mismatches identified: legacy main.js hard-coded Studio at 5177 → confirmed correct port is 5174
- [x] API name mismatch identified: legacy Builder expects `window.electronAPI.openStudioProject()` (capital A, different name) vs. new preload's `window.electron.openStudio()`

### V2.2 — File Migration (Complete ✅)
- [x] `robocopy` legacy Builder `frontend/src` → `GlazeBid v2/apps/builder/src` (155 files)
- [x] `robocopy` new Studio `apps/studio` → `GlazeBid v2/apps/studio` (excluding node_modules, dist)
- [x] Builder configs: `vite.config.js`, `index.html`, `package.json` copied
- [x] Studio configs: already in place from robocopy
- [x] `assets/` branding copied

### V2.3 — Wiring & IPC Bridge (Complete ✅)
- [x] **Root `package.json`** — npm workspaces monorepo with `dev:builder` / `dev:studio` / `build:*` scripts
- [x] **`scripts/build-preloads.mjs`** — esbuild compiles `electron/main.ts` + both preloads → CJS bundles
- [x] **`electron/main.ts`** — Combined Electron main (replaces both legacy and new main files):
  - `createBuilderWindow()` / `createStudioWindow()` with titlebar overlay, icon search, COOP/COEP headers
  - `open-studio-project` IPC handler (legacy Builder protocol: `{ projectId, filePath, calibrationData?, sheetId? }`)
  - `studio-ready` / `load-project-data` handshake (prevents flash-load before Studio is mounted)
  - `inbox-sync` → `inbox-update` relay for live `RawTakeoff[]` push
  - `studio-takeoff-complete` → `takeoff-update` relay for completed takeoff bundles
  - All file I/O handlers: `glazebid:read-pdf`, `gbid:save`, `gbid:open`, `pdf:open`, `pdf:save`, `studio:open-with-pdf`
- [x] **`apps/builder/electron/preload.js`** — Added `onInboxUpdate(cb)` (IPC `inbox-update` listener with cleanup)
- [x] **`apps/studio/src/preload/index.ts`** — Added `studioReady()`, `onLoadProjectData(cb)`, `syncInbox(inbox)` to existing `window.electron` namespace
- [x] **`apps/studio/src/store/useProjectStore.ts`** — `syncInboxToStorage()` now also calls `window.electron.syncInbox()` for IPC push; `resetProject()` sends `syncInbox([])` on clear
- [x] **STUDIO_URL fix** — `apps/builder/src/components/ProjectHome.jsx` line 113: `5177` → `5174`

### V2.4 — Builder Inbox Infrastructure (Complete ✅)
- [x] **`apps/builder/src/store/useInboxStore.js`** — Zustand store: `inbox: RawTakeoff[]`, `hydrateInbox`, `addTakeoff`, `resetInbox`
- [x] **`apps/builder/src/hooks/useInboxSync.js`** — Dual-path sync: IPC `onInboxUpdate` (Electron) + `storage` event fallback (browser/production)
- [x] **`apps/builder/src/components/StudioInbox.jsx`** — Live takeoff table grouped by unique dimensions; shows SF, LF, count totals; pure inline styles (no Tailwind dependency)
- [x] **`apps/builder/src/App.jsx`** — `useInboxSync()` mounted at app root alongside existing `useEstimatorSync()`

### V2.5 — Verification (Complete ✅)
- [x] `node scripts/build-preloads.mjs` → `✔ Electron main + preloads compiled` (zero errors)
- [x] Builder Vite server starts clean on port 5173
- [x] Studio Vite server starts clean on port 5174

---

## 🔴 Phase 7: Builder Enhancements for V2 UI

- [ ] **7.1 — Wire StudioInbox into the Builder UI:** Add a "Studio Takeoffs" tab or panel in the Builder navigation that renders `<StudioInbox />`. Recommended placement: alongside BidSheet or as a step in the ProjectHome workflow.
- [ ] **7.2 — Inbox → BidSheet Bridge:** Button on each `StudioInbox` row to "Send to BidSheet" — converts a `RawTakeoff` (widthInches, heightInches, type, label) into a `BidFrame` payload for `useBidStore.addFrame()`.
- [ ] **7.3 — Project File Load/Save wired into Legacy Builder:** Expose `window.electronAPI.saveProject(json)` and `openProject()` IPC calls in the legacy builder preload, wire into existing `useProjectPersistence.js` hook.
- [ ] **7.4 — Replace hard-coded API backend calls:** Legacy Builder has several calls to `http://localhost:8000/api/*` (the legacy FastAPI backend). These need either a shim or removal depending on which features are being kept.

---

## 🔴 Phase 8: Studio → Builder Engineering Workflow

- [ ] **8.1 — FrameEngineerModal in Builder:** Port or adapt `FrameEngineerModal.tsx` from the new Builder app (`GlazeBid AiQ Suite`) into the legacy Builder. Allows estimators to open a `TakeoffGroup` from `StudioInbox` and engineer it into a full `EngineeredFrame` (grid layout, archetype, BOM) without leaving Builder.
- [ ] **8.2 — EngineeredFrame → BidStore:** Output of `FrameEngineerModal` converts `EngineeredFrame` (BOM with extrusion cut list + glass schedule) into the legacy `BidFrame` format that `useBidStore` understands.
- [ ] **8.3 — Load Project Data in Studio:** When Builder calls `openStudioProject({ projectId, filePath })`, Studio's `App.tsx` should receive the `load-project-data` IPC event and restore the saved Studio state (shapes, calibrations, PDF) from the passed file path or `.gbid` metadata.

---

## 🔴 Phase 9: Packaging & Distribution

- [ ] **9.1 — Builder PDF Intake (Architecture §3 Step 1):** Explicit "Upload Project Documents" step — drop zone for Architectural PDF + Specification PDF. Division 8 spec filtering. Save to local directory (Desktop, Z-Drive, Egnyte). Project metadata (client, address, bid date) → `.gbid`.
- [ ] **9.2 — QA & TypeScript Strict:** Studio must pass `tsc --noEmit` with `strict: true`. Fix all `any`s and race conditions. Builder JSX must pass `eslint`.
- [ ] **9.3 — Electron Builder Packaging:** Configure `electron-builder` for a standalone Windows `.exe` installer. Both Builder and Studio bundle correctly as a single distributable. Sign with code certificate.
- [ ] **9.4 — Desktop Shortcut & Auto-Update:** Production shortcut (Start Menu + Desktop). Electron auto-updater channel pointing to the v2 release server.

---

## 🔴 Phase 10: AI Phase 6.3+ Extensions

- [ ] **10.1 — ONNX Model Integration:** Swap `extractFeaturesFromBuffer()` stub in `featureExtract.ts` for a real `onnxruntime-web` inference call. Requires a trained MobileNetV3 → 512D ONNX export.
- [ ] **10.2 — Session Learner Persistence:** Serialize `SessionLearnerState` (anchor + hard negatives + threshold) to `.gbid` file so learned preferences survive app restarts.
- [ ] **10.3 — Cloud Training Pipeline:** `exportTrainingData()` JSON format + Python retraining script (`SessionLearner` → PyTorch fine-tune → ONNX re-export). Triggered at ≥50 user interactions.

---

## File Count Snapshot (March 2026)

| App | Language | Source Files |
|-----|----------|-------------|
| `apps/builder/src` | React JSX | 155 files |
| `apps/studio/src` | TypeScript/TSX | 56 files |
| `electron/` | TypeScript | 1 file |
| `scripts/` | ESM JavaScript | 1 file |
| **Total** | | **213 files** |
