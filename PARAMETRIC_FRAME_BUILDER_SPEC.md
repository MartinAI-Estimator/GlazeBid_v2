# Master Specification: Parametric Fenestration Frame Builder Engine

**Target Architecture:** Modern Web Stack (TypeScript / React / Three.js or SVG Canvas / PostgreSQL or SQLite)
**Objective:** Replace legacy PartnerPak Studio with an updated, high-performance parametric frame builder, glass calculator, takeoff engine, and material estimator.

> Source of truth for the TakeoffEngine build. Companion docs:
> `PARTNERPAK_FRAME_BUILD_MODEL.md` (workbook interpretation), `WINDOW_SCHEDULE_IMPORT.md` (Path C import).
> Implementation home: `packages/frame-engine/src/takeoff/` (additive — does not modify resolveFrameBOM).

## 1. Domain Overview & System Hierarchy

The software represents commercial glazing elevations (storefronts, curtain walls, window walls, and entrance systems) through a strict hierarchical structure:

```
[Project]
  ├── Project Metadata (Client, Location, Saw Cut Width, Tax, Markup, Tolerances)
  └── [Frameset] (Group of frames sharing common defaults)
       ├── Metal System Catalog (Profiles, Depths, Face Widths, Glass Bite, Joints)
       ├── Default Glazing Types (Annealed, Tempered, Spandrel, Panel, Mirror)
       ├── Perimeter Sealants & Shims (Top/Bottom/Left/Right Shim gaps)
       └── [Frame Elevation] (Individual 2D/3D visual assembly)
            ├── Rough Opening (RO) vs. Out-to-Out Frame Dimensions (O.A.FR)
            ├── Parametric Grid (Panels/Bays [Columns] x Rows)
            ├── [Sticks] (Extrusions: Head, Sill, Jambs, Verticals, Horizontals)
            ├── [Openings / Lites] (Daylight Openings - DLOs)
            └── [Entrances / Doors] (Single/Pair doors with hardware prep)
```

## 2. Core Parametric Math & Geometry Rules

### 2.1 Dimensional Datums

1. **Rough Opening (RO) vs. Out-to-Out Frame Size (OAFR):**
   - Frame Width (OAFR) = RO Width − (Left Shim + Right Shim)
   - Frame Height (OAFR) = RO Height − (Top Shim + Bottom Shim)
2. **Bottom of Horizontal (BOH):** Datum elevation measured from finished floor/bottom frame line to the bottom edge of any horizontal extrusion.
3. **Centerline (CL):** X-coordinate measured from the left outer edge of the frame to the vertical axis of an intermediate mullion.
4. **Daylight Opening (DLO):** The clear visual opening dimensions (Width & Height) between aluminum framing stops.
   - Glass Width = DLO Width + (2 × Glass Bite)
   - Glass Height = DLO Height + (2 × Glass Bite)

### 2.2 Global Fabrication Constants & Defaults

- Saw Cut Blade Width: 0.1875" (3/16") — deducted from stock length calculations.
- Framing Tolerance: 0.03125" (1/32") or 0.0625" (1/16").
- Glazing Tolerance: 0.0625" (1/16") or 0.125" (1/8").
- Standard Stock Lengths: 24.0' (288") or 21.0' (252") aluminum extrusions.

## 3. PartnerPak Engineering Rules of Thumb & Execution Logic

When building or modifying a frame programmatically, the math engine MUST obey PartnerPak's strict order of operations:

1. **System First Selection:** Initialize the frame with the exact `MetalGroup` first (Head, Sill, Jambs, Intermediate Verticals/Horizontals, Pressure Plates, Face Caps, Glass Bites). Changing system types mid-build triggers a full grid recalculation.
2. **No Bottom Shim with Doors:** If an elevation contains a door, setting a bottom rough opening shim is prohibited. Instead, the sill profile is omitted or raised at the door bay, allowing jambs to run down to the finished floor (Y = 0).
3. **Door Insertion Priority:** Insert doors BEFORE setting manual DLO or Centerline overrides. Doors possess fixed geometric constraints (e.g., 36"×84", 72"×84", or custom height 96"). Neighboring bays automatically absorb the remaining width distribution.
4. **Door Header Crippling & Joinery Reversal:** Inserting a door into a multi-row grid breaks the intermediate vertical mullions. The vertical jambs surrounding the door run continuous to the door header or head, while intermediate horizontals butt into the door jamb.
5. **Perimeter Integrity Rule:** NEVER delete perimeter members (Sill, Head, or Jambs). To create a bulkhead or soffit condition, raise intermediate horizontals or assign a `NULL` profile property — never strip the perimeter boundary.
6. **Curtain Wall Layering:** Curtain wall frames must process in 3 independent Z-layers:
   - Layer 1: Back Member (Structural Tube)
   - Layer 2: Pressure Plate
   - Layer 3: Snap-On Face Cap
   Splices and Anchors must be calculated per layer (e.g., Face Cap offsets −6", Pressure Plate offsets −3", Splice Gap 1/2").
7. **Ghost / NULL Parts:** Use `NULL` prefix profiles (e.g., `NULL 162118`) for shared corner conditions or multi-frame connections where geometry & glass pocket calculations must occur without duplicating hardware/metal costs in the Bill of Materials.

## 4. Fundamental Data Schemas (TypeScript Interfaces)

```typescript
// --- Framing System Catalog ---
export interface MetalProfile {
  productCode: string;
  description: string;
  profileWidth: number;   // e.g. 2.0 or 2.5 inches
  profileDepth: number;   // e.g. 4.5 or 6.0 inches
  glassBite: number;      // e.g. 0.5 or 0.75 inches
  weightPerFoot?: number;
  stockLength: number;    // In inches (e.g. 288.0)
}

export interface MetalGroup {
  id: string;
  name: string;           // e.g., "M451T CG/SS/OG STOPS UP"
  systemType: 'STOREFRONT' | 'CURTAIN_WALL' | 'WINDOW_WALL';
  thermal: boolean;
  head: MetalProfile;
  sill: MetalProfile;
  jambLeft: MetalProfile;
  jambRight: MetalProfile;
  verticalIntermediate: MetalProfile;
  horizontalIntermediate: MetalProfile;
  doorJambCompanion?: MetalProfile;
  pressurePlate?: MetalProfile;
  faceCap?: MetalProfile;
}

// --- Door & Entrance Configurations ---
export interface DoorConfig {
  id: string;
  name: string;
  type: 'SINGLE' | 'PAIR';
  handing: 'HLSO' | 'HRSO' | 'SO'; // Hinge Left/Right Swing Out, Pair Swing Out
  doorWidth: number;               // e.g. 36.0, 72.0
  doorHeight: number;              // e.g. 84.0, 96.0
  stileType: 'NARROW_190' | 'MEDIUM_350' | 'WIDE_500';
  frameType: string;               // e.g., "TF451-A1"
  hardware: {
    lockCode?: string;
    closerCode?: string;
    hingeCode?: string;
    pushPullCode?: string;
    thresholdCode?: string;
  };
}

// --- Parametric Frame Structure ---
export interface FrameBay {
  bayIndex: number;
  width: number;          // Centerline to Centerline or Clear Opening
  isDoorBay: boolean;
  doorId?: string;
}

export interface FrameRow {
  rowIndex: number;
  bohHeight: number;      // Bottom of Horizontal elevation from frame base
}

export interface GlassLite {
  id: string;
  bayIndex: number;
  rowIndex: number;
  dloWidth: number;
  dloHeight: number;
  glassWidth: number;     // DLO Width + (2 * GlassBite)
  glassHeight: number;    // DLO Height + (2 * GlassBite)
  glassType: 'ANNEALED' | 'TEMPERED' | 'SPANDREL' | 'PANEL' | 'MIRROR';
  areaSqFt: number;
}

export interface CutListItem {
  partNumber: string;
  description: string;
  memberType: 'HEAD' | 'SILL' | 'JAMB' | 'VERTICAL' | 'HORIZONTAL' | 'STOP' | 'PRESSURE_PLATE' | 'FACE_CAP';
  cutLength: number;     // Decimal inches
  fractionDisplay: string; // e.g. "95 7/8\""
  quantity: number;
  finishCode: string;
}

export interface ElevationFrame {
  id: string;
  frameName: string;      // e.g. "Frame 1"
  quantityThus: number;   // Number of identical frames to fabricate
  overallWidth: number;   // Total OAFR Width
  overallHeight: number;  // Total OAFR Height
  metalGroup: MetalGroup;
  bays: FrameBay[];
  rows: FrameRow[];
  glassSchedule: GlassLite[];
  metalCutList: CutListItem[];
}
```

## 5. Development Roadmap

### Phase 1: Core Geometry & Takeoff Math Engine (`TakeoffEngine.ts`)
- Implement pure TypeScript functions with zero UI dependencies.
- Compute perimeter cut lengths (Head, Sill, Jambs).
- Compute bay widths, mullion centerlines, and intermediate vertical cut lengths.
- Compute horizontal BOH elevations and intermediate horizontal cut lengths.
- Calculate exact DLOs and resulting Glass Order dimensions (including glass bites).
- Implement decimal-to-fraction utility functions (accurate to 1/32" or 1/64").

### Phase 2: Door Configurator & Header Crippling Logic
- Implement door opening insertion rules (Single & Pair).
- Auto-calculate frame opening adjustments when a door is dropped into Row 1.
- Implement joinery reversal math for continuous door jamb mullions and header connections.

### Phase 3: PartnerPak `.dat` Legacy Parser (`PartnerPakParser.ts`)
- Build a reader to parse legacy compressed/delimited `.dat` export files (such as `McLarty Mazda-20260528074446.dat`).
- Map parsed data directly into the modern `ElevationFrame` state.
- Validate that `TakeoffEngine.ts` produces identical cut dimensions to legacy `.dat` files.

### Phase 4: Interactive 2D SVG/Canvas Parametric Builder
- Render dynamic 2D elevations displaying dimensions, glass lites, and framing members.
- Enable interactive drag/click editing of bay widths, BOH heights, and DLOs.
- Add toggle views for solid extrusions, glass tags, and section detail cuts.

### Phase 5: Linear Cut & Glass Bin-Packing Optimization
- Implement a 1D bin-packing algorithm for aluminum stock lengths (24-foot stock, 3/16" saw kerf).
- Implement a 2D glass sheet optimization layout algorithm to minimize waste.

### Phase 6: Export Drivers (Reports, DXF, CNC Machine Code)
- Generate Bid Recap / BOM reports (JSON, CSV, PDF).
- Build DXF export drivers for shop drawings.
- Export NCX/CSV machine code for CNC equipment (e.g., RhinoFab).

## 6. Prompting Template

"Claude, we are building the Parametric Frame Builder for our fenestration software. Refer to `PARAMETRIC_FRAME_BUILDER_SPEC.md` as our source of truth. Let's begin by implementing Phase 1: Create the TakeoffEngine with pure functions to calculate aluminum cut lengths and glass sizes for a multi-bay storefront frame with custom BOH heights and Glass Bites. Include unit tests."

---

## Appendix A0 — SCOPE (owner decision, 2026-07-24 — overrides anything conflicting)

**The Parametric Frame Builder is a TAKEOFF tool, not a pricing tool.**

- In scope: building frames, glass sizes (DLO → glass order dims), metal takeoffs
  (cut lists / stock lengths). Later: fabrication + installation labor derived from
  the frame geometry.
- OUT of scope: pricing, markups, taxes, bid totals — that lives in GlazeBid's
  **Bid Builder**, which consumes Frame Builder takeoffs. Do not add pricing UI or
  pricing math to the Frame Builder.
- **Required output: `.dat` EXPORT.** Takeoffs must export as a `.dat` file that
  uploads into PartnerPak Studio / Glazier Studio (same company, same program, same
  file format). Import (Phase 3 parser) is done; a WRITER is a new phase. Likely
  approach: donor-template patching (clone a valid .dat, rewrite Frames/FrameSets/
  AddGlass/AddMetal rows) since generating SQLCE pages from scratch is high-risk.
- Multi-vendor is core: metal groups + parts catalogs come after frame building
  works, so one takeoff can be quoted across many vendors (Kawneer, Tubelite, YKK,
  EFCO, Oldcastle, custom).
- Priority order: (1) frames building correctly end-to-end → (2) metal groups /
  parts catalogs, vendor-neutral → (3) .dat export writer → (4) labor.

## Appendix A — Implementation Decisions (GlazeBid, 2026-07-24)

- Engine lives at `packages/frame-engine/src/takeoff/TakeoffEngine.ts` — additive; `resolveFrameBOM` untouched; UI migrates via adapter.
- Test runner is **vitest** (repo standard), tests in `apps/builder/src/__tests__/engine/` (builder resolves the workspace package; test files are plain JS per Builder JSX-only rule).
- Ground truth: workbook Exercise 8 (TF451 Frame 1, 84.5×102): jamb/vertical cut 101 7/8" (1/16" framing tolerance each end), bay DLO 39 1/4", row DLOs 70" and 25 7/8" (sill face 2 1/8", head/horiz face 2").
- Joinery model v1: `VERTICALS_RUN` (screw-spline storefront) — all verticals full height minus 2× framing tolerance; head/sill/horizontals butt between verticals.
- Bay semantics: `FrameBay.width` = centerline-to-centerline span (edge bays measured from frame outer edge). DLO width = span − adjacent member encroachments (full face at jambs, half face at intermediate mullions).
- Glass = DLO + 2×bite − glazing tolerance (tolerance default 0 to match spec formula; configurable).
