# 🏗️ GlazeBid v2 — Master System Architecture (v1.0)
*Updated: March 2026 — reflects the combined Legacy-Builder + New-Studio monorepo migration*

---

## 1. SYSTEM OVERVIEW

GlazeBid v2 is the production desktop application for the Commercial Glazing industry. It delivers the complete estimating workflow: PDF blueprint intake → architectural takeoff → parametric frame engineering → material BOM → labor calculation → final bid proposal.

**What makes v2:**
| Concern | Source |
|---------|--------|
| **Builder UI** (bid sheets, project management, pricing) | Legacy GlazeBid AIQ — 155 JSX source files, preserved intact |
| **Studio takeoff engine** (PDF canvas, parametric frames, AI scan, ghost detector) | New clean-slate TypeScript — 56 `.ts/.tsx` source files |
| **Electron shell** | Combined `electron/main.ts` — manages both windows on the same IPC bus |
| **Data format** | `.gbid` JSON project files — written locally, no cloud required |

The legacy Builder is the user-facing hub; Studio spawns as a child window and sends all takeoff data back to Builder in real time.

---

## 2. PROJECT LAYOUT

```
C:\Users\mjaym\GlazeBid v2\
├── package.json              ← npm workspaces root (workspaces: apps/*)
├── electron/
│   └── main.ts               ← Combined Electron main process
├── scripts/
│   └── build-preloads.mjs    ← esbuild: compiles main.ts + both preloads
├── apps/
│   ├── builder/              ← Legacy JSX Builder (port 5173 in dev)
│   │   ├── src/              ← 155 source files (React JSX)
│   │   ├── electron/
│   │   │   ├── main.js       ← Legacy standalone main (reference only)
│   │   │   └── preload.js    ← Builder preload — exposes window.electronAPI
│   │   ├── vite.config.js
│   │   └── package.json
│   └── studio/               ← New TypeScript Studio (port 5174 in dev)
│       ├── src/              ← 56 source files (React + TypeScript)
│       │   ├── engine/       ← PDF, camera, snap, render, parametric
│       │   ├── hooks/        ← Canvas engine, AI, tools
│       │   ├── store/        ← useStudioStore, useProjectStore
│       │   ├── components/   ← Toolbar, canvas, panels, overlays
│       │   └── preload/
│       │       └── index.ts  ← Studio preload — exposes window.electron
│       ├── vite.config.ts
│       └── package.json
├── assets/                   ← Icons, branding
└── shared/
    └── types/                ← Future shared type packages
```

---

## 3. APP RESPONSIBILITIES

### App 1 — GlazeBid Builder (The Estimating Hub)
The central project management and pricing application. Runs at `localhost:5173` in dev.

**Workflow:**
1. **Project Intake** — Drop architectural PDF + specification PDF. Metadata captured (client, address, bid date). Saved to local `.gbid` file.
2. **Project Dashboard** — Shows project overview, sheets, and the "Open GlazeBid Studio" gateway button.
3. **Takeoff Inbox** — `useInboxStore` receives `RawTakeoff[]` from Studio in real time. Estimator groups items and engineers them into `EngineeredFrame[]` via `FrameEngineerModal`.
4. **Bid Sheet** — `BidSheet/` components (~25 files) render the parametric pricing grid: aluminum LF, glass SF, labor phases (shop/dist/field), cut lists.
5. **BidCart / Pricing** — `useBidStore` aggregates all frames into `projectTotals`. Glass RFQ export. Labor engine at configurable shop/field velocities.
6. **Proposal Generator** — Final bid output rolled up from all systems.

**Key stores (Zustand):**
- `useBidStore.js` — frames, labor rates, project totals, glass RFQ
- `useInboxStore.js` — live `RawTakeoff[]` mirror from Studio

**Key hooks:**
- `useEstimatorSync.js` — `BroadcastChannel('glazebid-estimator')` receiver (legacy path)
- `useInboxSync.js` — IPC `inbox-update` + localStorage `storage` event receiver (new path)

### App 2 — GlazeBid Studio (The Takeoff Engine)
High-performance PDF canvas and parametric engineering tool. Runs at `localhost:5174` in dev. Spawned by Builder on demand.

**Key capabilities:**
- PDF ingestion at 72–1152 DPI (tile manager, quality buckets ×1→×16)
- Multi-page continuous scroll with full shape anchoring
- Drawing tools: Select, Pan, Line, Rect, Polygon, Calibrate, Parametric Frame, Rake, Count, Wand, Ghost AI
- Snap engine: endpoint/midpoint/intersection from shapes + PDF vector paths
- Parametric BOM engine: per-frame extrusion cut list, glass schedule, hardware summary
- AI Auto-Scan (Phase 6.2): canvas BFS pixel scan → auto-classify glazing regions
- Ghost Detector (Phase 6.3): ML-ready feature embedding + sliding-window detection

**Key stores (Zustand):**
- `useStudioStore.ts` — canvas state, shapes, calibrations, tools, PDF
- `useProjectStore.ts` — `RawTakeoff[]` inbox, `EngineeredFrame[]`, systems, counts

---

## 4. CROSS-APP COMMUNICATION

### 4.1 Window Preload APIs

#### Builder — `window.electronAPI` (capital A, legacy namespace)
Exposed by `apps/builder/electron/preload.js`:
```js
window.electronAPI = {
  platform,           // process.platform
  isDesktop,          // true when running in Electron
  getVersion,         // Electron version string
  readPdfFile(path),  // IPC: glazebid:read-pdf → { ok, buffer, name }
  getPathForFile(f),  // webUtils.getPathForFile
  openStudioProject(data),     // IPC send: open-studio-project
  studioReady(),               // IPC send: studio-ready
  onLoadProjectData(cb),       // IPC on:   load-project-data
  studioTakeoffComplete(data), // IPC send: studio-takeoff-complete
  onTakeoffUpdate(cb),         // IPC on:   takeoff-update (returns cleanup fn)
  onInboxUpdate(cb),           // IPC on:   inbox-update   (returns cleanup fn)
}
```

#### Studio — `window.electron` (lowercase, new app namespace)
Exposed by `apps/studio/src/preload/index.ts`:
```ts
window.electron = {
  studioReady(),              // IPC send: studio-ready
  onLoadProjectData(cb),      // IPC on:   load-project-data  (returns cleanup fn)
  syncInbox(inbox),           // IPC send: inbox-sync (live RawTakeoff[] push)
  openStudio(),               // IPC send: open-studio
  saveProject(json),          // IPC invoke: gbid:save
  openProject(),              // IPC invoke: gbid:open
  openPdf(),                  // IPC invoke: pdf:open → { success, buffer, fileName }
  savePdf(buffer, name),      // IPC invoke: pdf:save
  onPdfInject(cb),            // IPC on:   pdf:inject (drawings auto-load)
}
```

### 4.2 IPC Channels (electron/main.ts)

| Channel | Direction | Description |
|---------|-----------|-------------|
| `open-studio-project` | Builder → Main | Open Studio with `{ projectId, filePath, calibrationData?, sheetId? }` |
| `open-studio` | Builder → Main | Simple Studio open (no data, back-compat) |
| `studio-ready` | Studio → Main | Studio fully mounted; Main flushes `pendingProject` |
| `load-project-data` | Main → Studio | Delivers project data after `studio-ready` |
| `studio-takeoff-complete` | Studio → Main → Builder | Completed takeoff bundle relay |
| `takeoff-update` | Main → Builder | Relayed from `studio-takeoff-complete` |
| `inbox-sync` | Studio → Main | Live `RawTakeoff[]` push on every store mutation |
| `inbox-update` | Main → Builder | Relayed from `inbox-sync` |
| `glazebid:read-pdf` | Builder → Main | Read PDF bytes from disk |
| `gbid:save` | Either → Main | Native save dialog → write `.gbid` |
| `gbid:open` | Either → Main | Native open dialog → read `.gbid` |
| `pdf:open` | Studio → Main | Native open dialog → PDF `Uint8Array` |
| `pdf:save` | Studio → Main | Save PDF buffer to disk |
| `studio:open-with-pdf` | Builder → Main | Open Studio then inject PDF by role |
| `pdf:inject` | Main → Studio | PDF buffer delivery (drawings/specs) |

### 4.3 Data Contracts

#### `RawTakeoff` — immutable Studio measurement record
```ts
type RawTakeoff = {
  id: string; shapeId: string; pageId: string;
  x: number; y: number; widthPx: number; heightPx: number;
  widthInches: number; heightInches: number;
  type: 'Area' | 'LF' | 'Count';
  label?: string; systemId?: string;
}
```

#### `FrameBridgeData` — legacy BroadcastChannel payload (for useEstimatorSync)
```ts
type FrameBridgeData = {
  shapeId: string; pageId: string;
  width: number; height: number;   // inches
  quantity: number; label?: string;
}
```

#### Builder `BidFrame` (useBidStore)
```ts
type BidFrame = {
  frameId: string; elevationTag: string; systemType: SystemType;
  inputs: { width, height, bays, rows, glassBite, sightline };
  bom:    { totalAluminumLF, totalGlassSqFt, glassLitesCount, cutList, glassSizes }
}
```

#### `SystemType`
```ts
type SystemType = 'ext-sf-1' | 'ext-sf-2' | 'int-sf' | 'cap-cw' | 'ssg-cw'
```

### 4.4 Dual Sync Architecture (Studio → Builder)

Studio writes `RawTakeoff[]` through two parallel paths; Builder listens on both:

```
Studio mutation (addTakeoff / removeTakeoff)
    │
    ├─→ localStorage.setItem('glazebid:inbox', JSON.stringify(inbox))
    │       ↓
    │   [same-origin storage event] ──→ Builder useInboxSync → hydrateInbox()
    │
    └─→ window.electron.syncInbox(inbox)
            ↓ IPC: inbox-sync
        Electron main
            ↓ IPC: inbox-update
        Builder window ──→ useInboxSync → hydrateInbox()
```

The IPC path works across different dev origins (5173 vs 5174). The localStorage path works as a fallback in production builds where both windows share `file://`.

---

## 5. DATA PERSISTENCE — THE `.gbid` FILE

GlazeBid stores all project data locally. No cloud required.

- **Format:** Single UTF-8 JSON file with `.gbid` extension
- **Written by:** Builder (`gbid:save` IPC handler → `fs.writeFileSync`)
- **Read by:** Builder on project open; can also be loaded into Studio for project context
- **Contents:** Project metadata, bid frames, labor rates, Studio shapes & calibrations, inbox snapshot

---

## 6. STUDIO ENGINE ARCHITECTURE

### Coordinate System (3 spaces)
```
SCREEN space (CSS px, DPR-scaled)
    ↕  camera.applyToContext() / camera.screenToPage()
PAGE space (72 DPI baseline, matches PDF viewport)
    ↕  calibration.pixelsPerInch
INCHES space (real-world dimensions)
```

### Core Engine Files
| File | Purpose |
|------|---------|
| `engine/coordinateSystem.ts` | Space conversions, `calibrateFromLine()` |
| `engine/Camera.ts` | Pan/zoom state, 2%–10,000% range, DPR-aware |
| `engine/snapEngine.ts` | Endpoint/midpoint/intersection snap candidates |
| `engine/pdfSnapParser.ts` | Extracts snap points from PDF.js OPS=91 path operators |
| `engine/renderEngine.ts` | Dirty-flag + rAF loop, page shadow, shape primitives, labels |
| `engine/pdfEngine.ts` | Higher-level PDF abstraction (useCanvasEngine entry point) |
| `engine/pdfLoader.ts` | PDF.js worker, `loadPdfFromBuffer()` |
| `engine/pdfTileManager.ts` | ImageBitmap quality buckets (72–1152 DPI) |

### Parametric Engine Files
| File | Purpose |
|------|---------|
| `engine/parametric/gridMath.ts` | `GridSpec`, bay/transom layout math |
| `engine/parametric/doorMath.ts` | Door bay geometry (singles/pairs/labor hrs) |
| `engine/parametric/rakeMath.ts` | Sloped/raked curtain wall geometry |
| `engine/parametric/countMath.ts` | Point-count geometry (doors, hardware, etc.) |
| `engine/parametric/systemEngine.ts` | `computeFabricationBOM()` → extrusions + glass |
| `engine/parametric/archetypes.ts` | 8 system archetypes + 9 vendor definitions |
| `engine/parametric/bomGenerator.ts` | `bomGenerator(frame, vendor)` → `VendorBOM` |
| `engine/parametric/edgeDetect.ts` | Edge detection for glazing boundary identification |
| `engine/parametric/featureExtract.ts` | 128D canvas feature embedding (Phase 6.3) |
| `engine/parametric/pageScan.ts` | BFS pixel scan → `ScanRegion[]` (Phase 6.2) |

---

## 7. AI INTELLIGENCE LAYER

### Phase 6.1 — Pure Logic (Complete ✅)
**Fallback Intelligence** (`hooks/useFallbackIntelligence.ts`)
- Geometric clustering: bbox similarity ≥ 0.92 → same cluster
- Sill-height heuristic: floor proximity → entrance/window/clerestory
- Aspect-ratio heuristic: W/H → door/window/storefront
- Size validation: boost (+0.10) / penalty (−0.25) per real-world constraints
- Agreement boost: 2+ heuristics agree → ×1.10 (capped 0.95)
- Decision tree: ≥0.85 auto_apply | 0.70–0.85 suggest | 0.50–0.70 flag | <0.50 ask

**Learning Loop** (`hooks/useLearningLoop.ts`)
- Logs correction/validation/rejection events to `localStorage['glazebid-learning-log']`
- `trainingReady` flag at ≥50 interactions
- `exportTrainingData()` → JSON for Phase 6.3 retraining

**Confidence Badge UI** (`components/ui/ConfidenceBadge.tsx`)
- Green/yellow/orange/red badge in PropertiesPanel for unassigned shapes
- Accept → `applyBulkClassification` + log validation; Skip → log rejection

### Phase 6.2 — Canvas Auto-Scan (Complete ✅)
**Page Scanner** (`engine/parametric/pageScan.ts`)
- Single-pass connected-component BFS on light pixels (luminance > 200)
- 30px grid stride; `Uint8Array` visited mask → O(N) total
- Filters: minRegionPx 400, maxRegionRatio 40%, aspect 0.04–25, borderDarkRatio ≥18%

**AI Auto-Scan Hook** (`hooks/useAIAutoScan.ts`)
- `runScan()`: requires calibration → BFS scan → CSS-px→page-space→inches → dimension gate (6–960" × 6–720") → cluster → classify → `onScanComplete(results)`
- `commitScanResults(accepted)`: `store.addShape()` + auto-apply for `auto_apply` confidence

**Bulk Classify Dialog** (`components/ui/BulkClassifyDialog.tsx`)
- Per-cluster rows: count badge, ConfidenceBadge, type, dimensions
- Default: accept all ≥50% confidence; "Apply N Frames" commits to store

### Phase 6.3 — Ghost Detector / ML (Complete ✅)
**Feature Extractor** (`engine/parametric/featureExtract.ts`)
- 128D Float32Array: 8×8 spatial grid × luminance + edge channels, L2-normalised
- ONNX slot-ready (swap `extractFeaturesFromBuffer` for model inference)

**Session Learner** (`hooks/useSessionLearner.ts`)
- Anchor embedding, `hard_negatives[]`, adaptive threshold (raises on rejection by +0.02, capped 0.99)
- `rankCandidates<T>()` with hard-negative proximity guard (0.92)

**Ghost Detector** (`hooks/useGhostDetector.ts`)
- Multi-scale sliding window (×0.8/×1.0/×1.2), 50% stride, blank-region skip
- NMS (IoU > 0.5), Session Learner re-rank → max 200 raw → 50 final detections
- `commitDetection` → CSS-px → page-space → inches → store
- `rejectDetection` → raises threshold + reactive cascade re-filter

**Ghost UI** — `hooks/useGhostTool.ts` (G shortcut) + `components/canvas/GhostOverlay.tsx`
- Emerald ≥85%, sky 70–85%, amber <70%; ✓/✗ per ghost; Accept All, Clear, live threshold %

---

## 8. SNAP SYSTEM (Stable — Do Not Modify)
`engine/snapEngine.ts` + `engine/pdfSnapParser.ts`

Collects endpoint/midpoint/intersection candidates from:
- All drawn shapes on the active page
- PDF vector path points (OPS=91 `constructPath` with full CTM matrix stack)

Caches up to 25,000 snap-candidate points per page. Coordinate chain: local → CTM → viewport flip → page-pixel space. De-duplicates on a 1px integer grid.

---

## 9. DEVELOPMENT COMMANDS

```powershell
# Start full stack (Builder + Studio + Electron)
cd "C:\Users\mjaym\GlazeBid v2"
npm start           # alias for npm run dev:builder

# Start individual app (no Electron)
npm run dev --workspace apps/builder  # http://localhost:5173
npm run dev --workspace apps/studio   # http://localhost:5174

# Rebuild Electron main + preloads
node scripts/build-preloads.mjs

# Build for production
npm run build:builder
npm run build:studio
```

---

## 10. AI ORCHESTRATION PROTOCOL

| Role | Responsibility |
|------|---------------|
| **Project Executive (Human)** | Vision, architectural approvals, business validation |
| **Agent 1 — Project Manager** | Orchestrates workflows, assigns tasks, reviews PRs |
| **Agent 2/3 — Core Coders** | New feature development in Studio (TypeScript); Builder integrations |
| **Agent 4 — Builder Legacy Manager** | Guards and maintains the 155-file legacy Builder codebase |
| **Agent 5 — Studio Lead** | Owns Studio takeoff engine, AI layers, canvas runtimes |
| **Agent 6 — QA Controller** | TypeScript strict checking, IPC contract validation, cross-app tests |

**Key constraints:**
- Builder codebase is **JSX only** — do not introduce TypeScript into `apps/builder/src/`
- Studio codebase is **TypeScript strict** — all files must pass `tsc --noEmit`
- The IPC channel names and `window.electronAPI` / `window.electron` namespaces are **frozen** — changes require dual-preload coordination
- `RawTakeoff` type must stay compatible between `apps/studio/src/store/useProjectStore.ts` and `apps/builder/src/store/useInboxStore.js`
