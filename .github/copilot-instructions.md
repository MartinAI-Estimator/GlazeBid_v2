# GlazeBid v2 — GitHub Copilot Workspace Instructions

> Auto-loaded into every Copilot Chat session. Gives all agents full architectural context.

---

## Project Overview

**GlazeBid v2** is a production Electron desktop app for commercial glazing estimation.  
Two React apps share a single Electron process and live IPC bus:

| App | Port | Language | Purpose |
|-----|------|----------|---------|
| `apps/builder` | 5173 | React JSX | Estimation grid, BOM, pricing, bid summary |
| `apps/studio` | 5174 | TypeScript + React | PDF takeoff, canvas tools, frame type library |
| `electron/` | — | TypeScript | Main process, multi-window, IPC relay |

**Start command:** `npm run dev:builder` (from repo root)  
**Predev hook:** `node scripts/build-preloads.mjs` (compiles TS preloads → CJS)

---

## Monorepo Layout

```
GlazeBid v2/
├── apps/
│   ├── builder/src/          # React JSX — 155 source files
│   │   ├── components/       # All UI components flat (legacy structure)
│   │   │   ├── BidSheet/     # Core estimation grid ~25 components
│   │   │   ├── BidSummary/   # SOW + hero stats
│   │   │   ├── SystemArchitect/ # System card editor
│   │   │   └── ...
│   │   ├── hooks/            # useBidStore, useInboxSync, useProjectPersistence
│   │   ├── store/            # useBidStore.js, useInboxStore.js
│   │   └── utils/            # pricingLogic.js, systemColumns.js
│   └── studio/src/
│       ├── components/
│       │   ├── toolbar/      # Toolbar.tsx
│       │   ├── layout/       # StudioLayout.tsx
│       │   ├── typeLibrary/  # FrameTypeCreator.tsx, FrameTypeLibrary.tsx ← NEW
│       │   ├── calibration/  # CalibrationModal
│       │   ├── canvas/       # CountOverlay, GhostOverlay, etc.
│       │   ├── structural/   # StructuralPanel
│       │   └── properties/   # PropertiesPanel, FrameEditorPanel
│       ├── engine/           # renderEngine.ts, snapEngine.ts, pdfEngine.ts
│       ├── hooks/            # useCanvasEngine.ts, useCountTool.ts, usePdfLoader.ts
│       ├── store/            # useProjectStore.ts, useStudioStore.ts
│       ├── preload/          # index.ts → compiled to dist-electron/studio/preload.js
│       └── utils/            # systemEngine.ts, gridMath.ts, bomGenerator.ts
├── electron/
│   └── main.ts               # THE source of truth for Electron main process
├── dist-electron/
│   ├── main.js               # Compiled from electron/main.ts — DO NOT HAND-EDIT
│   ├── builder/preload.js    # Compiled from apps/builder/electron/preload.js
│   └── studio/preload.js     # Compiled from apps/studio/src/preload/index.ts
├── scripts/
│   └── build-preloads.mjs    # esbuild: compiles main.ts + both preloads → CJS
├── shared/                   # Shared types (minimal use currently)
└── assets/                   # App icons (icon.ico, icon.png, etc.)
```

---

## IPC Architecture

### Pattern: Studio → main.js → Builder
```
Studio renderer:   window.electron.syncXXX(payload)
    ↓ ipcRenderer.send('xxx-sync', payload)
electron/main.ts:  ipcMain.on('xxx-sync', (_e, p) => builderWindow.webContents.send('xxx-update', p))
    ↓ webContents.send
Builder renderer:  window.electronAPI.onXXXUpdate(callback)
    ↓ ipcRenderer.on('xxx-update', handler)
```

### Active IPC Channels
| Channel (send) | Channel (receive) | Purpose |
|---------------|-------------------|---------|
| `inbox-sync` | `inbox-update` | RawTakeoff[] from Studio → Builder inbox |
| `frame-types-sync` | `frame-types-update` | FrameType[] with counts → Builder system cards |
| `studio-takeoff-complete` | `takeoff-update` | Completed takeoff bundle |
| `open-studio-project` | — | Builder opens Studio with project data |
| `studio-ready` | `load-project-data` | Handshake for project load |
| `pdf:open` | — | Open PDF file dialog |
| `gbid:save` / `gbid:open` | — | Project file I/O |

### Preload Namespaces
- **Studio window:** `window.electron` (from `apps/studio/src/preload/index.ts`)
- **Builder window:** `window.electronAPI` (from `apps/builder/dist-electron/preload.js`)

---

## State Management

### Studio (Zustand — TypeScript)
- `useStudioStore.ts` — Camera, active tool, UI panels, `activeFrameTypeId`
- `useProjectStore.ts` — Shapes, PDF pages, calibration, FrameTypes, TypeCountDots, inbox

### Builder (Zustand — JavaScript)
- `useBidStore.js` — Systems (BidFrame[]), labor rates, project totals, markups
- `useInboxStore.js` — `RawTakeoff[]` from Studio
- `useProjectStore.js` — Project metadata (client, address, bid date)

---

## Key Data Types

```typescript
// Studio — from useProjectStore.ts
interface FrameType {
  id: string;
  mark: string;           // e.g. "A1"
  name: string;           // e.g. "Storefront 250"
  widthInches: number;
  heightInches: number;
  bays: number;
  rows: number;
  systemLabel: string;    // used for BOM archetype selection
  glassType: 'Vision' | 'Spandrel';
  color: string;          // hex for dot rendering
  bom: FabricationBOM;    // computed by computeFabricationBOM()
}

interface TypeCountDot {
  id: string;
  frameTypeId: string;
  pageId: string;
  position: { x: number; y: number }; // page-space coordinates
  instanceNumber: number; // per-type sequential count
}

// Builder — RawTakeoff (legacy inbox format)
interface RawTakeoff {
  id: string;
  widthInches: number;
  heightInches: number;
  type: 'window' | 'door' | 'curtainwall';
  label?: string;
}
```

---

## Critical Files — Always Read Before Editing

| File | Why it matters |
|------|---------------|
| `electron/main.ts` | All IPC handlers — changes here must be reflected in `dist-electron/main.js` via `npm run predev:builder` |
| `apps/studio/src/preload/index.ts` | Studio IPC surface — must match `dist-electron/studio/preload.js` |
| `apps/builder/dist-electron/preload.js` | Builder IPC surface — hand-edited CJS (no TS source) |
| `apps/studio/src/store/useProjectStore.ts` | FrameType + TypeCountDot source of truth |
| `apps/builder/src/components/BidSheet/GlazeBidWorkspace.jsx` | Core Builder estimation grid |

---

## Build Rules

1. **Never hand-edit `dist-electron/main.js`** — always edit `electron/main.ts` then run `node scripts/build-preloads.mjs`
2. **Exception:** `apps/builder/dist-electron/preload.js` has no TypeScript source — hand-edit is acceptable
3. When adding a new IPC channel: add to `electron/main.ts` + matching preload entry in both Studio and Builder
4. Run `node scripts/build-preloads.mjs` after any change to `electron/main.ts` or `apps/studio/src/preload/index.ts`

---

## Known Issues & Dead Code

### Dead Files (safe to delete)
- `apps/builder/src/components/ProjectIntake.new.jsx` — unreferenced draft
- `apps/builder/src/components/ProjectIntake.old.jsx` — superseded
- `apps/builder/src/components/PDFViewer.jsx.broken` — broken, not imported
- `apps/builder/src/components/SheetSidebar.new.jsx` — unreferenced draft

### Legacy Backend Calls (SILENT FAILURE — demo blocker)
These files call `http://localhost:8000/api/*` (a dead FastAPI server):
- `ProjectIntake.jsx` — health check + project list (CRITICAL: breaks project screen)
- `ProjectList.jsx` — project list on dashboard
- `StatsRibbon.jsx` — health check + stats
- `App.jsx` — project data fetch
- `DocumentViewer.jsx` / `SpecViewer.jsx` — PDF URL building
- `AddendumViewer.jsx` / `DoorSchedule.jsx` / `MarkupTransfer.jsx` / `PropertiesPanel.jsx`

**Fix strategy:** Wrap each call in try/catch, gracefully degrade to local data.

### Pre-existing TypeScript Errors (non-blocking)
- `window.electron` not typed (`TS2551`) — in StudioLayout, Toolbar, useCanvasEngine
- `usePdfLoader.ts` missing `../../../../types/global` module
- `vite.config.ts` plugin type incompatibility (vite version mismatch)

---

## Type-First Takeoff Flow (Phase V3 — Just Completed)

The core demo workflow:
1. User opens Studio → loads PDF
2. Opens Frame Type Library (right panel or "Types" toolbar button)
3. Creates FrameTypes (mark, size, system, BOM auto-computed)
4. Selects a FrameType → clicks dots on PDF to count instances
5. Dots appear colored with sequential numbers + mark labels
6. "Send to Builder" → IPC → Builder creates system cards with aggregated BOM
7. Builder shows aluminum LF × count, glass SF × count, shop/field MH × count

---

## Demo Script (Minimum Viable Demo)

1. `npm run dev:builder` (from repo root)
2. Builder opens → click "Open Studio" on project home
3. Studio opens → load a glazing PDF
4. Calibrate scale → draw a frame or use AI Scan
5. Types panel → create Frame Type "A1 - 250 SF 5'×8'"
6. Click count tool → place dots on all A1 instances
7. "Send to Builder" → Builder Studio Takeoffs tab shows system cards
8. Builder BidSheet shows live pricing

---

## Conventions

- **All new Studio code:** TypeScript strict, no `any`, Tailwind CSS utility classes
- **All new Builder code:** JSX, inline styles acceptable (legacy pattern), no Tailwind dependency
- **IPC payloads:** Plain JSON-serializable objects only
- **Math:** All dimensions in **inches** internally, convert to feet only for display
- **Canvas coordinates:** Three spaces — SCREEN (px), PAGE (PDF points), INCHES — always use Camera transforms
