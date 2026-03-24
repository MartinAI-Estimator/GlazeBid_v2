# GlazeBid v2 — Complete Codebase Breakdown

## Who I Am & What This Is

I'm a glazing estimator with 15 years in the commercial glass and aluminum industry. I've worked on everything from small storefront tenant improvements to multi-million-dollar curtainwall high-rises. I built GlazeBid because the industry's estimation tools are stuck in the 1990s — spreadsheets, manual takeoffs with colored pencils, and pricing that lives in someone's head.

GlazeBid v2 is a **desktop Electron application** for commercial glazing estimation. It has two integrated apps:

1. **Builder** — The estimation/bidding side. Project intake, frame configuration, BOM generation, pricing, labor, and proposal output.
2. **Studio** — The PDF takeoff engine. Load construction drawings, calibrate scale, draw/highlight frames on the plans, auto-detect geometry, and push captured scope back to Builder for pricing.

They run as two Electron windows that communicate via IPC. The idea is: you open your drawings in Studio, do your takeoff, and the captured frames flow into Builder where the money math happens.

---

## Architecture Overview

### Monorepo Structure
```
GlazeBid v2/
├── apps/
│   ├── builder/          # React/JSX, Vite, port 5173
│   │   ├── src/
│   │   │   ├── components/    # ~40+ React components
│   │   │   ├── context/       # ProjectContext.jsx — the central brain
│   │   │   ├── hooks/         # useBidMath, useEstimatorSync, useInboxSync, etc.
│   │   │   ├── store/         # useBidStore (zustand)
│   │   │   ├── utils/         # pricingLogic.js (THE pricing engine), parsers, sync
│   │   │   └── data/          # systemPackages.js, systemColumns.js
│   │   └── electron/
│   │       └── preload.js     # Exposes window.electronAPI
│   │
│   └── studio/           # React/TSX, Vite, port 5174
│       └── src/
│           ├── components/    # ~20+ React/TSX components
│           ├── engine/        # renderEngine, Camera, pdfEngine, snapEngine, structuralEngine
│           │   └── parametric/  # systemEngine (BOM), gridMath, rakeMath, doorMath, etc.
│           ├── hooks/         # useCanvasEngine (~1000 lines), useParametricTool, etc.
│           ├── store/         # useStudioStore, useProjectStore (both zustand)
│           ├── types/         # shapes.ts (DrawnShape union type)
│           └── preload/
│               └── index.ts   # Exposes window.electron
│
├── electron/
│   └── main.ts           # Electron main process — creates both windows, routes all IPC
│
├── scripts/
│   └── build-preloads.mjs  # esbuild: compiles main.ts + both preloads
│
├── shared/types/          # (minimal, most types are co-located)
└── package.json           # npm workspaces: apps/*
```

### Tech Stack
- **Runtime**: Electron (two BrowserWindow instances)
- **UI Framework**: React 18 (Builder=JSX, Studio=TSX)
- **Build**: Vite (both apps), esbuild (Electron main + preloads)
- **State**: Zustand (3 stores: useBidStore, useStudioStore, useProjectStore)
- **Styling**: Tailwind CSS + custom dark theme
- **PDF**: pdf.js (rendering + text extraction)
- **Canvas**: Raw HTML5 Canvas 2D (no fabric.js, no konva — hand-rolled)
- **Animation**: Framer Motion (UI transitions)
- **Drag/Drop**: @hello-pangea/dnd
- **Fonts**: Geist Sans + Inter
- **Database**: Supabase (planned, partially integrated)

### Dev Commands
```bash
npm run dev:builder    # Starts both Vite servers + Electron (concurrently)
npm run build:preloads # Compiles electron/main.ts + preloads via esbuild
```

---

## The Two Apps in Detail

---

# BUILDER APP (apps/builder/)

Builder is the estimation and bidding engine. This is where the money math happens.

## Builder Data Flow
```
PDF Upload (Intake) 
  → Smart Scan (AI parse annotations) 
  → Frame Builder (parametric frame config) 
  → BidSheet (per-system cost breakdown) 
  → Bid Cart (executive summary, GPM, grand total) 
  → Glass RFQ / Proposal Generation
```

## Builder Components (~40+)

### Core Workflow
| Component | Purpose |
|---|---|
| `App.jsx` | Root. Manages navigation, wraps in ProjectProvider, wires useEstimatorSync + useInboxSync |
| `ProjectHome.jsx` | Dashboard landing — recent projects, quick actions |
| `ProjectIntake.jsx` | PDF upload + categorization (Architectural/Structural/Specs/Other). Smart Scan trigger |
| `ParametricFrameBuilder.jsx` | 3-panel frame input: visual preview, dimension entry, grid config, BOM generation |
| `BidSheet.jsx` | Multi-system cost breakdown. Per-frame line items with material/labor/pricing columns |
| `BidCart.jsx` | Executive dashboard: labor groups, vendor quotes, GPM tiers, grand total |
| `ExecutiveDashboard.jsx` | Bid aggregation view with scope alternates |
| `ProposalGenerator.jsx` | Output proposal (partially implemented) |
| `AdminDashboard.jsx` | System templates, labor library, financial defaults, GPM tier config |

### PDF & Takeoff (Builder-side)
| Component | Purpose |
|---|---|
| `PDFWorkspace.jsx` | PDF viewer + annotation overlay (uses pdf.js) |
| `ToolPalette.jsx` | Drawing tools for markup on plans |
| `CalibrationTool.jsx` | Scale calibration for Builder's PDF viewer |
| `MarkupLayer.jsx` | Canvas overlay for drawing on PDFs |

### Supporting UI
| Component | Purpose |
|---|---|
| `GlassRFQModal.jsx` | Glass vendor quote request form |
| `CustomTitleBar.jsx` | Electron frameless window title bar |
| `MenuBar.jsx` | Navigation menu |
| `Header.jsx` | Top bar with project name, actions |
| `ProjectSideNav.jsx` | Left sidebar navigation |

## Builder Context — ProjectContext.jsx (The Brain)

This is the **central configuration hub** for the entire Builder app. Everything flows through here.

### What It Provides (27 values via React Context):

**System Definitions** — The DNA of each glazing system:
```javascript
systemDefinitions: [
  {
    id, name, type: 'STOREFRONT' | 'CURTAIN_WALL',
    profileWidth, profileDepth,
    
    // Framing DNA
    scopeTag: 'BASE_BID' | 'ALT_1' | 'ALT_2' | 'ALT_3' | 'ALLOWANCE',
    profileSize: '2x4.5' | '2x6',
    connectionType: 'SCREW_SPLINE' | 'SHEAR_BLOCK',
    finish: 'CLEAR_ANOD' | 'DARK_BRONZE' | 'BLACK_ANOD' | 'PAINT_2_COAT' | 'PAINT_3_COAT',
    
    // Assembly
    anchorSpacing, caulkJoints, steelReinforcement,
    
    // Labor Triad (Layer 23) — hours per SF
    laborRates: { shopHours, distHours, fieldHours },
    
    // Production Rates (Layer 35) — hrs/unit for each task
    productionRates: {
      bays: { assemble, clips, set },
      addBays: { assemble, clips, set },
      dlos: { prep, set },
      addDlos: { prep, set },
      doors: { distribution, install }
    },
    
    // Hr Function Rates (Layer 35+)
    hrFunctionRates: {
      joints, dist, subsills, bays, addBays, dlos, addDlos,
      pairs, singles, caulk, ssg, steel, vents, brakeMetal, open
    },
    
    // Formulas (Layer 23)
    formulas: [{ target, baseVar, factor, constant, unit, enabled }],
    
    // Materials
    glassType, gasketType,
    
    // Features
    shearBlocks, thermalBreak, structuralSilicone,
    
    // Door Intel
    doorType, hardwareSet,
    
    color
  }
]
```

**Labor Crew:**
```javascript
[
  { role: 'Foreman',    count: 1, baseRate: 65, burdenPct: 40 },
  { role: 'Glazier',    count: 2, baseRate: 55, burdenPct: 42 },
  { role: 'Apprentice', count: 1, baseRate: 35, burdenPct: 38 }
]
```

**Equipment Library:**
```javascript
[
  { name: "60' Boom Lift",      dailyRate: 450,  weeklyRate: 1800, monthlyRate: 5500, mobilization: 350 },
  { name: "40' Scissor Lift",   dailyRate: 250,  weeklyRate: 900,  monthlyRate: 2800, mobilization: 200 },
  { name: "Telehandler 10K",    dailyRate: 350,  weeklyRate: 1400, monthlyRate: 4200, mobilization: 300 },
  { name: "Crane Service (Day)", dailyRate: 1200, weeklyRate: 0,    monthlyRate: 0,    mobilization: 800 }
]
```

**Glass Types:**
```javascript
[
  { code: 'GL-1', description: '1" Insulated Clear/Clear',      costPerSF: 12.00 },
  { code: 'GL-2', description: '1" Insulated Spandrel (Black)', costPerSF: 18.50 }
]
```

**Admin Defaults (ADMIN_DEFAULTS):**
- `financialDefaults`: markupPct: 35, laborRate: 45, taxRate: 7.25, contingencyPct: 10, caulkBeads: 2, glassWastePct: 5, metalPerLb: 4.50, glassPerSF: 12, caulkPerLF: 2.50, anchorPerEA: 8, steelPerLb: 2.75
- `gpmTiers`: Small Job ≤$250K → 30%, Mid Job ≤$1M → 27%, Large Job >$1M → 25%
- `laborLibrary`: 8 tasks (frame_assembly, glass_setting, caulking, anchor_install, glazing_bead, hardware_install, panel_erection, cleanup) each with hoursPerUnit + unit
- `systemTemplates`: ext_storefront / int_storefront / curtain_wall — each lists applicable labor tasks
- `costGroups`: 02-Metal, 02-Glass, 02-Finish, 02-Labor, 02-Sundries, 02-Equipment
- `breakoutCategories`: Exterior Storefront, Curtain Wall, Interior Storefront, All Glass Entrances, Mirrors
- `materialCategories`: 7 categories (aluminum, glass, doors, hardware, equipment, caulking, subcontractor)

## Builder Pricing Engine — pricingLogic.js

This is the **single most important file** in the entire codebase. Every dollar amount in a bid flows through here.

### Constants & Enums
| Constant | Values |
|---|---|
| `SYSTEM_TYPES` | STOREFRONT, CURTAIN_WALL, SSG, WINDOW_WALL |
| `PROFILE_SIZES` | 1.75x4.5 (1.8 lb/ft), 2x4.5 (2.2 lb/ft), 2x6 (3.1 lb/ft), 2.5x7.5 (4.5 lb/ft) |
| `CONNECTION_TYPES` | SCREW_SPLINE (1.0× labor), SHEAR_BLOCK (1.15× labor + 0.15 hrs/ft adder) |
| `FINISH_TYPES` | CLEAR_ANOD (1.0×), DARK_BRONZE (1.08×), BLACK_ANOD (1.12×), PAINT_2_COAT (1.15×), PAINT_3_COAT (1.25×) |
| `DOOR_TYPES` | NARROW_STILE (2"), MEDIUM_STILE (3.5"), WIDE_STILE (5") |
| `HARDWARE_SETS` | PIVOT_DEADBOLT ($1200/2.5h), PIVOT_PANIC ($1800/3h), HINGE_DEADBOLT ($900/1.5h), HINGE_PANIC ($1500/2h), EL_PANIC ($2500/4h) |
| `SCOPE_TAGS` | BASE_BID, ALT_1, ALT_2, ALT_3, ALLOWANCE |
| `DEFAULT_BASE_PRICES` | metalPerLb: 4.50, glassPerSF: 12, caulkPerLF: 2.50, anchorPerEA: 8, steelPerLb: 2.75, laborPerHour: 65 |

### Material Cost Functions
- **`calculateMetalWeight(item, system)`** → lbs = perimeterFt × lbsPerFt × qty
- **`calculateMetalCost(weight, system, basePrice)`** → $ = weight × $/lb × finishMultiplier
- **`calculateGlassCost(item, glassType, wastePct)`** → $ = totalSF × costPerSF × (1 + waste%)
- **`calculateCaulkCost(item, system, basePrice)`** → $ = perimeterFt × caulkJoints × qty × $/LF
- **`calculateAnchorCost(item, system, basePrice)`** → $ = ceil(perimeterInches / anchorSpacing) × $/ea × qty
- **`calculateSteelCost(item, system, basePrice)`** → $ = perimeterFt × 0.5 lb/ft × qty × $/lb
- **`calculateDoorHardware(system, doorCount)`** → {materialCost, laborHours}

### Labor Functions
- **`calculateAssemblyLabor(item, system)`** → hours with connection type multiplier + shear block adder
- **`calculateLaborTriad(item, system)`** → {shopHours, distHours, fieldHours, totalHours, costs} using laborRates (hrs/SF)

### Frame Geometry Calculator (Layer 35)
```javascript
calculateFrameGeometry(width, height, quantity) → {
  perFrame: { perimeter, perimeterLF, bays, dlos, joints, dist, subsills, caulk },
  total: { ... }
}
// bays = ceil(width / 36")
// DLOs = bays × (3 if height > 100" else 2)
// joints = ceil(perimeter / 28")
```

### Production-Based Labor (Layer 35 — Full Excel Logic)
```javascript
calculateProductionBasedLabor(item, system) → {
  // Geometry-based tasks:
  joints, dist, caulk, subsills, bays, dlos
  // User-override tasks:
  addBays, addDlos, pairs, singles, ssg, steel, vents, brakeMetal, open
  // Each: { qty, hoursPerUnit, totalHours, cost, source }
}
```

### Master Calculator
```javascript
calculateSystemCost(item, system, basePrices, glassType, wastePct) → {
  metalWeight, metalCost,
  glassCost, caulkCost, anchorCost, steelCost,
  hardwareCost,
  shopHours, distHours, fieldHours,
  shopCost, distCost, fieldCost,
  derivativeCosts[],
  totalMaterialCost, totalLaborCost,
  grandTotal, factors
}
```

### BOM Engine (Layer 29)
- **`calculatePartnerPakSummary(items)`** → {area, perimeter, joints, dlos, mullionLF}
- **`calculateSystemMaterials(system, summary, unitCosts)`** → Material line items (11 types: Steel, Caulk, Screws, Setting Blocks, Brake Metal, Subsills, Mockups, End Dams, Shim Tape, Glazing Tape, Engineering)

## Builder Stores

### useBidStore (Zustand)
- `frames[]` — Configured frames with BOMs, system assignments, dimensions
- `laborRates` — Per-system labor configuration
- `projectTotals` — Running totals
- `pendingRehydration` — Saved state for restore
- Actions: `addFrame`, `removeFrame`, `updateFrame`, `setProjectTotals`

### useBidMath Hook (Financial Aggregation)
```
frames (BOM shopHours/fieldHours) 
  → laborGroups (grouped by systemType, summed hours) 
  → summary.totalLaborCost

vendorQuotes (editable lump-sum material lines)
  → summary.totalMaterialCost + tax

Hard Cost = labor + materials + tax
Grand Total = Hard Cost ÷ (1 − GPM%)
```

GPM Tiers (auto mode): $0-250k → 30%, $251k-1M → 27%, >$1M → 25%

## Builder Hooks
| Hook | Purpose |
|---|---|
| `useBidMath` | Financial aggregation, GPM tiers, vendor quotes, executive summary |
| `useEstimatorSync` | BroadcastChannel listener — receives frames from Studio |
| `useInboxSync` | Dual-path IPC — receives inbox/customCards/frameTypes from Studio via Electron |
| `useDrawingTool` | Canvas drawing tools for Builder's PDF markup |
| `useGhostLayer` | Ghost overlay rendering |
| `useMarkups` | Markup annotation management |
| `useProjectPersistence` | Save/load project state |
| `useCalibration` | Scale calibration for Builder's PDF viewer |
| `useHardwareCapture` | Hardware specification capture |

## Builder Utilities
| Utility | Purpose |
|---|---|
| `pricingLogic.js` | **THE pricing brain** — all cost calculations (see above) |
| `bluebeamParser.js` | Parse Bluebeam Studio XML exports |
| `pdfAnnotationParser.js` | Extract annotations from PDF files |
| `syncProject.js` | Project serialization/deserialization |
| `partnerPakGenerator.js` | Generate PartnerPak-compatible output |
| `parseArchitecturalDim.js` | Parse architectural dimension strings (e.g. "3'-4 1/2\"") |

## Builder Config Files
| File | Purpose |
|---|---|
| `systemRegistry.js` | 5 system types (Ext SF 1, Ext SF 2, Int SF, Captured CW, SSG CW) |
| `systemColumns.js` | Column definitions for BidSheet tables |
| `data/systemPackages.js` | Parametric profile packages (SF-250, SF-450, SF-600, WW-600, CW profiles) |

---

# STUDIO APP (apps/studio/)

Studio is the PDF takeoff engine. Load plans, calibrate, draw frames, auto-detect, and push scope to Builder.

## Studio Architecture Pattern

Studio uses a **hook-based plugin system** with performance-critical mutable refs instead of React state for the hot render path:

```
useCanvasEngine (master hook)
  ├── Camera (mutable ref — pan/zoom/transform)
  ├── PdfTileManager (mutable ref — LRU tile cache)
  ├── renderEngine (pure functions — stateless canvas drawing)
  ├── snapEngine (geometry snaps — endpoint, midpoint, intersection)
  └── Plugin hooks (useParametricTool, useRakeTool, useCountTool, useWandTool, etc.)
       └── Each hook reads Camera/store refs, writes shapes to Zustand
```

## Studio Engines

### renderEngine.ts — Pure Canvas Renderer
Stateless pure-function drawing. All coordinates are page-space pixels; Camera transform is pre-applied.

**Render layers (in order):**
1. Background fill (#3a3a3a)
2. Camera transform
3. Page background — PDF tile or white placeholder with drop-shadow
4. Grid overlay — minor/major lines, visible above 2× zoom
5. Calibration reference — dashed gold line with dimension label
6. Committed shapes — lines, rects (with dimension labels + handles), polygons
7. TypeCountDots — colored circular pins with instance numbers and frame-mark labels
8. In-progress shape — dashed preview
9. Snap indicator — magenta (endpoint), yellow (intersection), cyan (midpoint)

Two modes: **Single-page** (default) and **Continuous-scroll** (vertical strip, culls off-screen pages).

### Camera.ts
Immutable-style transform management. Stores `x, y, scale`. Methods: `applyToContext`, `screenToPage`, `pageToScreen`, `fitToPage`, `zoomAt`, `pan`.

### pdfEngine.ts — PDF Rendering (4 Tiers)
1. Thumbnail (low-res, for sidebar)
2. Viewport tile (visible area only, fast)
3. Full-page (high-quality, background)
4. Region (for snap parsing)

### pdfTileManager.ts (~500 lines)
LRU cache for rendered PDF tiles. Manages per-page render queue, cancels stale requests, garbage-collects old tiles.

### pdfLoader.ts
Wraps pdf.js. Loads PDF → returns page proxies with dimensions.

### snapEngine.ts
Geometric snap detection: endpoint snap, midpoint snap, intersection snap, grid snap. Returns snap type + world coordinate.

### pdfSnapParser.ts (~400 lines)
Extracts snap-worthy geometry from PDF content streams (lines, rects, paths). Parses PDF operator sequences to find drawable elements that shapes can snap to.

### coordinateSystem.ts
Coordinate pipeline: **SCREEN ↔ PAGE ↔ INCHES**. Handles DPR scaling, camera transform, and calibration-based inch conversion.

### structuralEngine.ts (~600 lines) — ASCE 7-22 Structural Analysis
Pure TypeScript, offline, no network. Computes:
- **Wind pressure**: ASCE 7-22 velocity pressure formula with Kz, Kzt, Kd tables
- **Deflection**: Simply-supported beam (5wL⁴/384EI), checks L/175, L/240, 0.75" cap
- **Bending stress**: σ = M/S where M = wL²/8
- **Steel reinforcement**: Transformed section method with HSS catalog (17 AISC sections)
- **Splice requirements**: Span-based rules (storefront vs curtainwall thresholds)
- **Wind clips**: Capacity selection + spacing

Status ladder: PASS → PASS_WITH_STEEL → UPGRADE_TO_CW → FAIL_CRITICAL

Data: Kz table (Exposure B/C/D, 0-200ft), HSS catalog, 7 aluminum mullion profiles

### parametric/systemEngine.ts (~1000 lines) — Fabrication BOM Engine
The core BOM calculator. Ported from legacy Python.

```typescript
computeFabricationBOM(widthInch, heightInch, profile, grid, bayTypes?, rake?) → FabricationBOM
```

Computes:
1. **Rake geometry** — All frames treated as rakes (slope=0 is rectangular). Head hypotenuse.
2. **Head cut** — Single piece, mitered if raked
3. **Jambs** — Raked: separate L/R with different heights. Standard: qty 2, same.
4. **Vertical mullions** — Standard: one line qty=cols-1. Raked: unique heights per position, grouped by like-length.
5. **Sills** — Per bay, omitted for door bays
6. **Transoms** — Horizontal, same deduction as sill, grouped by like-length
7. **Glass list** — Trapezoidal for raked top row, rectangular otherwise. Size = DLO + 2×glassBite.
8. **Hardware summary** — joint count, perimeter LF, door counts, production labor rates

Output types: `FabricationBOM`, `CutListItem` (mark, role, qty, cutLength, mitered), `GlassPane` (mark, dims, shape, type)

### parametric/gridMath.ts
Computes grid assemblies: given frame dimensions + bay/row counts, produces column widths, row heights, DLO rectangles.

### parametric/rakeMath.ts
4-point raked polygon math. Head slope computation, per-mullion heights along slope.

### parametric/countMath.ts
Count tool grouping: manages point markers grouped by type for quantity takeoff.

### parametric/doorMath.ts
Door assembly computation: door frame members, sidelites, transoms above doors.

### parametric/archetypes.ts
Frame archetype detection: classifies a frame's grid as "Fixed", "Operable", "Entrance", etc.

### parametric/bomGenerator.ts
Higher-level BOM aggregation across multiple frames.

### parametric/edgeDetect.ts
Edge detection for wand tool: finds frame boundaries in the PDF raster.

### parametric/featureExtract.ts
Feature extraction from detected regions.

### parametric/pageScan.ts + pageRegionDetector.ts
AI-assisted page scanning: detects frame-like regions across an entire page.

## Studio Hooks

### useCanvasEngine.ts (~1000 lines) — The Master Hook
Owns Camera, render loop, PDF loading, all canvas input events.

**Pattern:** Zustand state → `stateRef` (bypasses React lifecycle). Camera → `cameraRef`. Draw loop → dirty-flag + single RAF per dirty cycle.

**Input events:**
- Wheel: Ctrl+wheel = trackpad pinch, else discrete zoom
- Mouse: Middle/space+left = pan; Select = hit-test; Tools = start in-progress shape
- Keyboard: Space = temp pan, Escape = cancel, Delete = remove, tool shortcuts (v/h/l/b/p/a/f/r/c/w), +/-/0 = zoom

**PDF loading:** Registers pages with PdfTileManager, opens PDF tab, fits camera, pre-warms page 0, generates thumbnails, kicks off snap point parsing.

**Public API:** `fitToPage`, `zoomIn`, `zoomOut`, `openPdf`, `loadPdfBuffer`, `screenToPage`, `pageToScreen`, `getSnap`

### useParametricTool.ts
Handles the 'frame' tool. When user draws a rect, captures dimensions, opens QuickAssignMenu for system assignment, then optionally opens GridEditor.

### useRakeTool.ts
4-point raked polygon tool. User clicks 4 corners, hook computes head slope and creates a PolygonShape with `isRaked: true, headSlopeDeg`.

### useCountTool.ts
Point marker placement tool. Click to place a MarkerShape associated with a CountGroup.

### useWandTool.ts
Magic wand auto-detect. Click inside a frame region, edge detection finds boundaries, creates shape automatically.

### useAIAutoScan.ts
Full-page AI scanning. Processes the entire page to find all frame-like regions, returns candidates for bulk classification.

### useGhostTool.ts + useGhostDetector.ts (~500+ lines)
ML-based ghost highlighting. Detects faint/repeated frame patterns across the page.

## Studio Stores

### useStudioStore.ts (~700 lines) — Canvas State

**Tool Types:** `'select' | 'pan' | 'line' | 'rect' | 'polygon' | 'calibrate' | 'frame' | 'rake' | 'count' | 'wand' | 'ghost'`

**State:**
| Property | Type | Purpose |
|---|---|---|
| `activeTool` | ToolType | Current drawing tool |
| `objectSnap` | boolean | Snap-to-object toggle |
| `showGrid` | boolean | Grid overlay toggle |
| `cameraScale` | number | Mirror of Camera.scale for UI display |
| `pdfFileName` | string \| null | Loaded PDF filename |
| `continuousScroll` | boolean | Vertical multi-page mode |
| `pdfTabs` | PdfTab[] | Multi-doc tabs (drawings/specs/manual) |
| `activePdfTabId` | string \| null | Active tab |
| `pages` | PageState[] | PDF page list (id, label, dimensions, thumbnailUrl) |
| `activePageId` | string | Current page |
| `calibrations` | Record<string, PageCalibration> | Per-page pixel→inch mapping |
| `pendingCalibrationLine` | object \| null | Triggers CalibrationModal |
| `pendingFrameBounds` | object \| null | Triggers QuickAssignMenu |
| `pendingGridEdit` | object \| null | Triggers GridEditor |
| `shapes` | DrawnShape[] | All committed takeoff shapes |
| `selectedShapeId` | string \| null | Selection |
| `activeFrameTypeId` | string \| null | For Type Library dot placement |
| `bookmarkedPageIds` | Set<string> | Bookmarked pages |

**PDF Tab Roles:** `'drawings' | 'specs' | 'manual'`

**Actions:** Tool switching, PDF loading, tab management, page navigation, calibration, shape CRUD, selection, bookmarks, page labels.

### useProjectStore.ts (~1000 lines) — Project/Takeoff State

**Architecture: "Dual-Screen Inbox"**
- Studio captures `RawTakeoff[]` — pure geometry, no engineering
- Builder groups takeoffs into `EngineeredFrame[]` with archetypes, grids, BOMs

**Profile System (8 profiles):**
| Key | Face Width | Depth | Description |
|---|---|---|---|
| sf-250 | 1.75" | 2.5" | Small storefront |
| sf-450 | 2" | 4.5" | Standard storefront |
| sf-600 | 2" | 6" | Heavy storefront |
| ww-600 | 2" | 6" | Window wall |
| cw-shallow | 2.5" | 6" | Curtainwall shallow |
| cw-medium | 2.5" | 7.5" | Curtainwall medium |
| cw-deep | 2.5" | 10" | Curtainwall deep |
| int-sf | 1.75" | 2.5" | Interior storefront |

**System Types:** `'ext-sf-1' | 'ext-sf-2' | 'int-sf' | 'cap-cw' | 'ssg-cw'`

**Domain Types:**
- **`RawTakeoff`**: {id, shapeId, pageId, position, dimensions (px + inches), type (Area/LF/Count), label?, systemId?} — immutable Studio output
- **`EngineeredFrame`**: {id, label, takeoffIds[], archetype?, grid?, bom?} — Builder's engineering output
- **`CustomSystemCard`**: {id, name, description, highlights[], totals} — for misc scope items (transaction windows, sunshades, etc.)
- **`FrameType`**: {id, mark, name, color, dimensions, bays, rows, systemLabel, glassType, bom, timestamps} — "Type-First" paradigm: define once, count N times via dots
- **`TypeCountDot`**: {id, frameTypeId, pageId, position, instanceNum, note?} — placed on canvas; BOM × count at sync

**State:**
| Property | Type |
|---|---|
| `systems` | ProjectSystem[] |
| `inbox` | RawTakeoff[] |
| `engineeredFrames` | EngineeredFrame[] |
| `countGroups` | CountGroup[] |
| `counts` | CountEntry[] |
| `customSystemCards` | CustomSystemCard[] |
| `frameTypes` | FrameType[] |
| `typeDots` | TypeCountDot[] |

**Cross-Tab Sync:** All data syncs via both `localStorage` AND Electron IPC:
- `glazebid:inbox` → `window.electron.syncInbox()`
- `glazebid:customSystemCards` → `window.electron.syncCustomCards()`
- `glazebid:frameTypes` → `window.electron.syncFrameTypes()`

## Studio Shape Types (shapes.ts)

**In-progress (not stored — lives in canvas hook ref):**
```typescript
InProgressShape =
  | { type: 'line';      start, cursor }
  | { type: 'rect';      start, cursor }
  | { type: 'polygon';   points[], cursor }
  | { type: 'calibrate'; start, cursor }
  | { type: 'rake';      points[], cursor }
```

**Committed (stored in useStudioStore.shapes[]):**
- **`LineShape`**: start, end, lengthPx, lengthInches
- **`RectShape`**: origin, widthPx/heightPx, widthInches/heightInches, frameSystemId?, grid?
- **`PolygonShape`**: points[], bounding box dimensions, frameSystemId?, isRaked?, headSlopeDeg?
- **`MarkerShape`**: position, countGroupId

**`DrawnShape`** = LineShape | RectShape | PolygonShape | MarkerShape

**Bridge to Builder:** `shapeToFrameBridge(shape)` converts to `FrameBridgeData` {shapeId, pageId, width, height, quantity: 1}

## Studio Components

### Layout
| Component | Purpose |
|---|---|
| `StudioLayout.tsx` | Full-screen shell. Orchestrates all panels, modals, IPC |
| `StudioTitleBar.tsx` | Custom dark title bar with File/Edit/View menus, Save/Open project |
| `StudioCanvas.tsx` | Canvas element + useCanvasEngine mount point |
| `NavigationBar.tsx` | Bottom bar: Select/Pan, zoom controls, page nav+labels, Type Library toggle, AI Scan |
| `Toolbar.tsx` | Right vertical rail: drawing tools (line, rect, polygon, frame, rake, count, wand, ghost, calibrate) |
| `ThumbnailSidebar.tsx` | Resizable left sidebar (80-320px), tabbed: Pages (with bookmarks + editable labels) and Bookmarks |
| `PdfTabBar` | Tab bar for multi-document (drawings/specs/manual) |

### Parametric
| Component | Purpose |
|---|---|
| `FrameEditorPanel.tsx` | Properties panel for selected frame (dimensions, system, grid) |
| `GridEditor.tsx` | Visual grid layout editor (bays × rows, door placement) |
| `QuickAssignMenu.tsx` | System assignment popup after drawing a frame |

### Type Library
| Component | Purpose |
|---|---|
| `TypeLibrary.tsx` | Frame Type Library sidebar — define types with mark/name/system/glass |
| `BulkClassifyDialog.tsx` | After AI scan: assign detected regions to systems in bulk |

### Modals
| Component | Purpose |
|---|---|
| `CalibrationModal.tsx` | Standard scale dropdown (21 scales: 13 architectural + 8 engineering) + Custom mode |
| `StructuralPanel.tsx` | ASCE 7-22 structural analysis sidebar |
| `CustomSystemModal.tsx` | Create/edit custom system cards for misc scope |
| `ShapeContextMenu.tsx` | Right-click menu on shapes |
| `GhostOverlay.tsx` | Ghost detection overlay |

### Current Layout Structure
```
┌────────────────────────────────────────────────────────┐
│ StudioTitleBar (40px, dark, File/Edit/View menus)      │
├────────────────────────────────────────────────────────┤
│ PdfTabBar (drawings/specs/manual tabs)                 │
├──────────┬───────────────────────────────┬─────────────┤
│ Thumbnail│        StudioCanvas           │ Toolbar     │
│ Sidebar  │                               │ (vertical   │
│ (resize- │                               │  rail)      │
│  able,   ├───────────────────────────────┤             │
│  tabbed) │ NavigationBar (bottom)        │             │
├──────────┴───────────────────────────────┴─────────────┤
│ [Slide-out panels: Properties | Structural | TypeLib]  │
└────────────────────────────────────────────────────────┘
```

---

# ELECTRON SHELL & IPC BRIDGE

## electron/main.ts — The Router

Manages two BrowserWindow instances. All communication between Builder and Studio goes through the main process.

### Window Creation
- **Builder**: 1400×900, port 5173 (dev), frameless with custom title bar, preload at `apps/builder/dist-electron/preload.js`
- **Studio**: 1600×1000, port 5174 (dev), frameless with custom title bar, hidden native menu, preload at `apps/studio/dist-electron/preload.js`

Studio gets COOP/COEP headers injected for SharedArrayBuffer (pdf.js threading).

### Startup Flow
```
app.whenReady()
  → createBuilderWindow()
  → User clicks "Open Studio" or loads project
  → createStudioWindow(projectData?)
  → Studio loads, mounts React, calls window.electron.studioReady()
  → Main receives 'studio-ready', sends pending project data + auto-injects PDF
```

### IPC Channels

**Builder → Studio (via Main relay):**
| Channel | Payload | Purpose |
|---|---|---|
| `open-studio-project` | {projectId, filePath, calibrationData?} | Open Studio with project context |
| `load-project-data` | project data object | Send project data to Studio after ready |
| `pdf:inject` | (role, Uint8Array, fileName) | Auto-load a PDF into Studio |

**Studio → Builder (via Main relay):**
| Channel | Payload | Purpose |
|---|---|---|
| `studio-takeoff-complete` → `takeoff-update` | full takeoff bundle | Completed takeoff sent to Builder |
| `inbox-sync` → `inbox-update` | RawTakeoff[] | Live inbox updates |
| `custom-cards-sync` → `custom-cards-update` | CustomSystemCard[] | Custom system cards |
| `frame-builder-send` → `frame-builder-receive` | shape payload | "Open in Frame Builder" context menu |

**File I/O (invoke/handle — async):**
| Channel | Dialog | Returns |
|---|---|---|
| `glazebid:read-pdf` | None (direct path) | Uint8Array |
| `gbid:save` | Save dialog (.gbid) | {success, filePath} |
| `gbid:open` | Open dialog (.gbid) | {success, data, filePath} |
| `pdf:open` | Open dialog (.pdf) | {success, buffer, fileName} |
| `pdf:save` | Save dialog (.pdf) | {success, filePath} |

**Window Controls:**
- Builder: `window-minimize`, `window-maximize`, `window-close`
- Studio: `studio-window-minimize`, `studio-window-maximize`, `studio-window-close`

### Preload Bridges

**Builder Preload** (`apps/builder/electron/preload.js`):
- Exposes `window.electronAPI`
- Vanilla JavaScript, no type declarations
- IPC: readPdfFile, openStudioProject, studioReady, onLoadProjectData, studioTakeoffComplete, onTakeoffUpdate, onInboxUpdate, onCustomCardsUpdate, onFrameBuilderReceive, window controls

**Studio Preload** (`apps/studio/src/preload/index.ts`):
- Exposes `window.electron`
- TypeScript with type declarations in `vite-env.d.ts`
- IPC: studioReady, onLoadProjectData, syncInbox, syncCustomCards, sendToFrameBuilder, syncFrameTypes, openStudio, saveProject, openProject, openPdf, savePdf, onPdfInject, window controls

### Additional Sync Paths
- **BroadcastChannel** `'glazebid-estimator'`: Studio pushes `{type: 'BATCH_READY', payload}` → Builder's `useEstimatorSync` listens
- **localStorage**: `glazebid:inbox`, `glazebid:customSystemCards`, `glazebid:frameTypes` — fallback sync for when Electron IPC isn't available (useful for dev/testing in browser)

---

# THE DOMAIN MODEL

## How Commercial Glazing Estimation Works

In the glazing trade, a bid is structured around **systems** (types of aluminum framing that hold glass). The main system types:

1. **Storefront** — Screw-spline aluminum framing, typically 2"×4.5" or 2"×6" profiles. Used for ground-floor retail, lobbies, entrances.
2. **Curtainwall** — Unitized or stick-built aluminum framing, larger profiles (2.5"×6" to 2.5"×10"). Used for multi-story facades.
3. **SSG (Structural Silicone Glazing)** — Glass bonded to frame with silicone instead of mechanical pressure plates.
4. **Interior Storefront** — Lighter framing for interior partitions and office fronts.

### The Estimation Pipeline

1. **Takeoff** — Measure every frame on the drawings. Capture width × height × quantity for each opening.
2. **System Assignment** — Assign each frame to a system type based on specs and conditions.
3. **BOM Generation** — For each frame: compute cut list (heads, jambs, mullions, sills, transoms), glass sizes, hardware.
4. **Material Pricing** — Metal weight × $/lb × finish factor. Glass SF × $/SF × waste. Caulk, anchors, steel.
5. **Labor Pricing** — Two approaches:
   - **Layer 23 (Triad)**: Shop hours + Distribution hours + Field hours per SF of glass
   - **Layer 35 (Production)**: Unit-based rates per task (joints, bays, DLOs, caulk, etc.)
6. **Aggregation** — Sum all systems. Apply equipment, general conditions.
7. **Margin** — Apply GPM (Gross Profit Margin) tiered by project size.
8. **Alternates** — Tag scope as BASE_BID, ALT_1, ALT_2, etc. for bid form compliance.

### Key Formulas

**Metal weight:** `perimeter_ft × lbs_per_ft × qty`
- Profile weights: 1.75×4.5 = 1.8 lb/ft, 2×4.5 = 2.2, 2×6 = 3.1, 2.5×7.5 = 4.5

**Glass size:** `DLO + 2 × glassBite` per dimension (DLO = Daylight Opening = opening minus frame overlap)

**Frame geometry:**
- Bays = ceil(width / 36")
- DLOs per bay = 3 if height > 100", else 2
- Joints = ceil(perimeter / 28")

**Finish multipliers:** Clear Anod = 1.0×, Dark Bronze = 1.08×, Black Anod = 1.12×, 2-Coat Paint = 1.15×, 3-Coat Paint = 1.25×

**Connection multipliers:** Screw Spline = 1.0× labor, Shear Block = 1.15× labor + 0.15 hrs/ft adder

**GPM tiers:** ≤$250K = 30%, ≤$1M = 27%, >$1M = 25%

**Grand Total:** `Hard Cost ÷ (1 − GPM%)`

---

# WHAT'S WORKING vs WHAT'S INCOMPLETE

## Working (Functional)
- ✅ PDF loading and multi-page rendering in Studio (pdf.js with tile caching)
- ✅ Scale calibration (21 standard architectural/engineering scales + custom measurement)
- ✅ Drawing tools: line, rect, polygon, calibrate (with object snapping)
- ✅ Parametric frame tool with QuickAssignMenu and GridEditor
- ✅ Raked frame tool (4-point polygon with head slope)
- ✅ Count tool (point markers with groups)
- ✅ Frame Type Library (define once, count N times via dots)
- ✅ Fabrication BOM generation (cut lists, glass lists, hardware)
- ✅ Structural analysis (ASCE 7-22 wind loads, deflection, stress)
- ✅ Multi-document tabs (drawings/specs/manual PDFs)
- ✅ Page labels and bookmarks
- ✅ Thumbnail sidebar with resize/collapse
- ✅ Custom system cards (misc scope items)
- ✅ Builder ↔ Studio IPC communication (inbox sync, custom cards, frame builder)
- ✅ Project save/load (.gbid files)
- ✅ Builder project intake with PDF upload
- ✅ Pricing engine with full material + labor calculations
- ✅ BidSheet with per-system cost breakdown
- ✅ GPM tier calculations
- ✅ Bluebeam XML parsing

## Partially Working / Needs Finishing
- ⚠️ AI Auto-Scan (page region detection exists but needs refinement)
- ⚠️ Wand tool (edge detection exists but accuracy is inconsistent)
- ⚠️ Ghost detection (hooks exist but ML pipeline not fully connected)
- ⚠️ Continuous scroll mode (renders but some edge cases with shape filtering)
- ⚠️ BidCart / Executive Dashboard (renders but vendor quote workflow incomplete)
- ⚠️ Snap-to-PDF geometry (parser exists but coverage of PDF path operators is partial)
- ⚠️ Type Library → Builder sync (syncFrameTypesToBuilder exists but Builder-side consumer may not be fully wired)

## Not Yet Implemented / Stubbed
- ❌ Proposal PDF generation (component exists, no PDF output)
- ❌ Glass RFQ email generation
- ❌ Admin authentication / user management
- ❌ PDF page manipulation (rotate, reorder, delete)
- ❌ Calendar/scheduling integration
- ❌ Smart Guide AI backend (the Smart Scan button in Builder intake)
- ❌ Hardware Capture API endpoint
- ❌ Supabase cloud sync (partially integrated, not active)
- ❌ Multi-user collaboration
- ❌ Print/PDF export of markup annotations
- ❌ Undo/redo system (no history stack)
- ❌ Copy/paste shapes
- ❌ Shape grouping/layers

---

# FILE REFERENCE

## Critical Files (Read These First)
| File | Lines (approx) | What It Is |
|---|---|---|
| `electron/main.ts` | ~450 | Electron main process, ALL IPC routing |
| `apps/builder/src/utils/pricingLogic.js` | ~600 | THE pricing engine — every dollar flows through here |
| `apps/builder/src/context/ProjectContext.jsx` | ~400 | Builder's central brain — system definitions, labor, equipment, admin defaults |
| `apps/studio/src/hooks/useCanvasEngine.ts` | ~1000 | Studio's master canvas hook — RAF loop, events, PDF loading |
| `apps/studio/src/engine/renderEngine.ts` | ~600 | Pure canvas renderer — all visual output |
| `apps/studio/src/store/useStudioStore.ts` | ~700 | Studio canvas state — tools, pages, shapes, calibration |
| `apps/studio/src/store/useProjectStore.ts` | ~1000 | Studio project state — inbox, systems, frame types, BOMs |
| `apps/studio/src/engine/parametric/systemEngine.ts` | ~1000 | Fabrication BOM engine — cut lists, glass, hardware |
| `apps/studio/src/engine/structuralEngine.ts` | ~600 | ASCE 7-22 structural analysis |
| `apps/builder/src/hooks/useBidMath.js` | ~200 | Financial aggregation — labor groups, vendor quotes, grand total |

## All Builder Source Files
```
apps/builder/src/
├── App.jsx                          # Root component, navigation, IPC wiring
├── context/
│   └── ProjectContext.jsx           # Central brain
├── store/
│   └── useBidStore.js               # Zustand: frames, labor, totals
├── hooks/
│   ├── useBidMath.js                # Financial aggregation
│   ├── useEstimatorSync.js          # BroadcastChannel bridge
│   ├── useInboxSync.js              # Electron IPC bridge
│   ├── useDrawingTool.js            # Canvas drawing
│   ├── useGhostLayer.js             # Ghost overlay
│   ├── useMarkups.js                # Annotations
│   ├── useProjectPersistence.js     # Save/load
│   ├── useCalibration.js            # Scale calibration
│   └── useHardwareCapture.js        # Hardware specs
├── utils/
│   ├── pricingLogic.js              # THE pricing engine
│   ├── bluebeamParser.js            # Bluebeam XML parser
│   ├── pdfAnnotationParser.js       # PDF annotation extractor
│   ├── syncProject.js               # Project serialization
│   ├── partnerPakGenerator.js       # PartnerPak output
│   └── parseArchitecturalDim.js     # Dimension string parser
├── data/
│   ├── systemRegistry.js            # 5 system types
│   ├── systemColumns.js             # BidSheet columns
│   └── systemPackages.js            # Profile packages
├── components/
│   ├── ProjectHome.jsx
│   ├── ProjectIntake.jsx
│   ├── ParametricFrameBuilder.jsx
│   ├── BidSheet.jsx
│   ├── BidCart.jsx
│   ├── ExecutiveDashboard.jsx
│   ├── ProposalGenerator.jsx
│   ├── AdminDashboard.jsx
│   ├── PDFWorkspace.jsx
│   ├── ToolPalette.jsx
│   ├── CalibrationTool.jsx
│   ├── MarkupLayer.jsx
│   ├── GlassRFQModal.jsx
│   ├── CustomTitleBar.jsx
│   ├── MenuBar.jsx
│   ├── Header.jsx
│   └── ProjectSideNav.jsx
└── electron/
    └── preload.js                   # window.electronAPI bridge
```

## All Studio Source Files
```
apps/studio/src/
├── App.tsx                          # Root (minimal, mounts StudioLayout)
├── store/
│   ├── useStudioStore.ts            # Canvas state
│   └── useProjectStore.ts           # Project/takeoff state
├── types/
│   └── shapes.ts                    # Shape type definitions + bridge
├── engine/
│   ├── renderEngine.ts              # Pure canvas renderer
│   ├── Camera.ts                    # Transform management
│   ├── pdfEngine.ts                 # PDF rendering (4 tiers)
│   ├── pdfLoader.ts                 # pdf.js wrapper
│   ├── pdfTileManager.ts            # LRU tile cache
│   ├── snapEngine.ts                # Geometry snap detection
│   ├── pdfSnapParser.ts             # PDF content stream parsing
│   ├── coordinateSystem.ts          # SCREEN↔PAGE↔INCHES
│   ├── structuralEngine.ts          # ASCE 7-22 analysis
│   └── parametric/
│       ├── systemEngine.ts          # Fabrication BOM engine
│       ├── gridMath.ts              # Grid assembly computation
│       ├── rakeMath.ts              # Raked polygon math
│       ├── countMath.ts             # Count grouping
│       ├── doorMath.ts              # Door assembly
│       ├── archetypes.ts            # Frame classification
│       ├── bomGenerator.ts          # Multi-frame BOM aggregation
│       ├── edgeDetect.ts            # Wand tool edge detection
│       ├── featureExtract.ts        # Region feature extraction
│       ├── pageScan.ts              # AI page scanning
│       └── pageRegionDetector.ts    # Region detection
├── hooks/
│   ├── useCanvasEngine.ts           # Master canvas hook
│   ├── useParametricTool.ts         # Frame tool
│   ├── useRakeTool.ts               # Raked polygon tool
│   ├── useCountTool.ts              # Count marker tool
│   ├── useWandTool.ts               # Magic wand tool
│   ├── useAIAutoScan.ts             # AI page scan
│   ├── useGhostTool.ts              # Ghost highlighter
│   └── useGhostDetector.ts          # Ghost detection logic
├── components/
│   ├── layout/
│   │   ├── StudioLayout.tsx         # App shell
│   │   └── StudioTitleBar.tsx       # Custom title bar
│   ├── canvas/
│   │   └── StudioCanvas.tsx         # Canvas mount
│   ├── toolbar/
│   │   ├── Toolbar.tsx              # Right vertical rail
│   │   └── NavigationBar.tsx        # Bottom bar
│   ├── sidebar/
│   │   └── ThumbnailSidebar.tsx     # Left sidebar (pages + bookmarks)
│   ├── panels/
│   │   ├── PropertiesPanel.tsx      # Shape properties
│   │   ├── FrameEditorPanel.tsx     # Frame detail editor
│   │   ├── StructuralPanel.tsx      # Structural analysis
│   │   └── GridEditor.tsx           # Bay/row grid editor
│   ├── modals/
│   │   ├── CalibrationModal.tsx     # Scale calibration
│   │   ├── CustomSystemModal.tsx    # Custom system cards
│   │   ├── BulkClassifyDialog.tsx   # AI scan results
│   │   └── ShapeContextMenu.tsx     # Right-click menu
│   └── library/
│       ├── TypeLibrary.tsx          # Frame Type Library
│       └── GhostOverlay.tsx         # Ghost detection overlay
└── preload/
    └── index.ts                     # window.electron bridge
```

---

# ASKING FOR HELP

If you're an AI reading this: I need help finishing GlazeBid. The core architecture is solid — the PDF engine works, the takeoff tools work, the pricing engine works, the IPC bridge works. What I need is:

1. **Polish the Builder ↔ Studio data flow** — Make sure frames captured in Studio flow cleanly into Builder's BidSheet and pricing pipeline. The inbox sync works but the full round-trip (Studio takeoff → Builder BOM → Builder pricing → bid total) needs to be verified and any gaps filled.

2. **Finish the AI/auto-detection features** — The wand tool, ghost detection, and AI page scan have the hooks and engine code but need accuracy improvements and proper UX flow.

3. **Implement undo/redo** — There's no history stack. Shapes can be deleted but nothing can be undone.

4. **Proposal generation** — The ProposalGenerator component exists but doesn't produce actual PDF output.

5. **Glass RFQ workflow** — The modal exists but the email generation and vendor management isn't connected.

6. **General stability and bug fixes** — Edge cases in multi-page rendering, shape persistence across sessions, calibration accuracy.

The code is well-structured and the domain model is correct (I know the glazing trade). It just needs a skilled programmer to help me wire everything together and finish the incomplete pieces.
