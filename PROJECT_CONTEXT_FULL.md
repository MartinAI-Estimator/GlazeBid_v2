# GlazeBid v2 — Full Project Context Summary

**Date:** April 17, 2026  
**Repo:** MartinAI-Estimator/GlazeBid_v2, master branch  
**Marketing site:** glazebid.netlify.app (site ID: `bb1cc294-0e10-47b3-b27c-b66df8caf78f`)

---

## What GlazeBid Is

GlazeBid v2 is a first-of-its-kind autonomous commercial glazing estimation desktop application built by Martin, a glazing estimator with 15 years of field and estimating experience. It is an Electron desktop app with two main components:

- **Builder** (React/JSX, port 5173) — estimating and pricing hub
- **Studio** (React/TypeScript, port 5174) — drawing takeoff engine

---

## What Has Been Built

### Builder App
- Complete bid workflow shell with 6-tab linear workflow
- Bid sheet with GPM formula and burdened labor rate model
- SOW Material Tracker with 10-code cost taxonomy
- Glass Pricing and Misc Labor workspaces
- Admin Settings panel for company-wide rate defaults
- Project Settings panel for project-level parameters
- BidSummaryDashboard
- Shop Drawing Generator (`shopDrawingGenerator.js`, `ShopDrawingPanel.jsx`, `computeBOM.js`)
- Citation store and shadowHeuristic
- GPM thresholds: 30% minimum under $250k, 27% minimum for $250k–$1M

### Studio App
- Production-grade PDF canvas with multi-tier tile rendering (72–1152 DPI)
- Camera system with coordinate transforms (screen ↔ page ↔ inches)
- 60fps RAF render loop
- Frame drawing tool, calibration tool, snap points
- Overlay system (`FrameOverlay`, `GhostOverlay`, `CitationCaptureLayer`)
- Drawing Intelligence panel wired to AiQ sidecar
- NavigationBar with tool buttons (broken ones removed in cleanup)
- Bays/rows popup (`GridEditor`) — partially working
- Right-click context menu — implemented, not confirmed working
- Keyboard shortcuts for copy/paste/duplicate

### AiQ Drawing Intelligence Engine (Python FastAPI sidecar, localhost:8100)
- **Layer 0:** PDF normalization with isoperimetric quotient text filter
- **Layer 1:** Sheet router (OCR title block classification)
- **Layer 2:** Vector graph extraction + scale detection (Unicode fraction fix)
- **Layer 9:** Grid-line homography (cross-sheet sync)
- Pre-scanner: filters 35-page sets to ~17 relevant pages
- Rules-based glazing engine: Tier 1/2/3 rules with physics constraints
- Candidate deduplication via IoU merge (17→8 candidates on real elevation)
- `/detect-glazing` FastAPI endpoint
- 61 tests passing, 0 failing
- Electron auto-spawn: sidecar starts and stops with the app
- **Real-world result:** Correctly identifies glazing region on elevation sheet A5.6 (Brighton Distribution) — 8 candidates in the drawing field at x=57%, y=19–25% of page

---

## Current Studio Issues

### Resolved
- Broken toolbar buttons removed (Smart Scan, Count Marker, Magic Wand, Ghost Detect, AI Auto-Scan)
- Citation Diagnostic no longer covers bottom toolbar
- Calibration accepts feet/inches input (`3'6"`, `42"`, `3ft`), hides reference line after confirm, shift-lock for straight lines
- Dimension labels only show on selected shapes
- Spec files now visible in Project Documents with correct filenames
- SpecViewer loads PDFs from disk via Electron IPC
- Division grouping in SpecViewer sidebar (Division 08 sorts first)

### Still Broken / Unconfirmed
- Right-click context menu — code written but not confirmed working in live app
- Zoom blocked when hovering over green frame overlay boxes
- Bays/rows (`GridEditor`) popup not appearing after drawing a frame — suspected z-index issue fixed in code but not confirmed
- Clicking a drawn green frame box does not select it or trigger any action
- Snap points inconsistent across full drawing
- Mullion width visual representation (should show 2" band, not single line)

### Root Cause Suspicion
Green frame boxes are drawn ON the canvas by the render engine, not as separate DOM elements. The interaction chain (`draw frame → setPendingFrameBounds → QuickAssignMenu → setPendingGridEdit → GridEditor`) may be breaking because:
1. Native event listeners registered in `useEffect` don't re-register on HMR — requires a full hard refresh
2. `GridEditor` z-index (fixed to 30) may still be below other stacking contexts

Console trace logs added to `useParametricTool.ts`, `QuickAssignMenu.tsx`, `GridEditor.tsx`, and `useCanvasEngine.ts` — awaiting Martin's console report.

---

## Strategic Pivot — Proposal-Quality Shop Drawings

**The core insight:** Every other glazing contractor sends a proposal with a number. Martin sends a proposal with a number AND shop drawings showing exactly what gets built. This closes more work, eliminates scope disputes, and repositions away from price competition.

### Key Design Decisions
- **Do NOT** build per-system drawing templates — too narrow
- **Build** a parameter-driven drawing engine that works for any system
- **System library:** data records with geometric parameters (frame depth, glass bite, pocket width, thermal break, etc.) — add a new system by adding a record, not a new template
- **Condition library:** head/sill/jamb condition types (~15–20 conditions covers 95% of commercial work)
- These are **proposal drawings**, not fabrication documents — scope-defining, not construction-complete
- When AiQ automated takeoff works, the shop drawing output becomes dramatically more powerful

### What Needs to Be Built

1. **System library** — database of glazing systems with geometric parameters, seeded from manufacturer technical data sheets
2. **Condition library** — head, sill, jamb condition types with geometric parameters
3. **Drawing engine expansion** — takes system profile + conditions + dimensions + bay layout, generates SVG/PDF elevation + head/sill/jamb details + system schedule
4. **Estimator-facing input form** — system selector, condition dropdowns, dimension inputs, generates in one click

### What Already Exists to Build On
- Assembly Object Model defines frame geometry
- BOM computation knows system parameters
- Shop drawing generator has PDF output infrastructure
- **The gap:** the UI form, the condition library, and expanded drawing engine geometry

### Next Step
Get manufacturer technical data sheets for the most-used systems (Kawneer, YKK, EFCO, Tubelite, etc.) showing frame cross-sections with dimensions. Those become the seed data for the system library and define the parameter schema for the drawing engine.

---

## Tech Stack

| Concern | Technology |
|---|---|
| Desktop shell | Electron (Windows-first) |
| Builder | React/JSX, Vite, port 5173 |
| Studio | React/TypeScript, Vite, port 5174 |
| Local storage | SQLite |
| State management | Zustand |
| IPC | Custom Electron IPC bus, dual preload APIs |
| Drawing intelligence | Python FastAPI sidecar, localhost:8100 |
| PDF processing | PyMuPDF |
| Marketing site | glazebid.netlify.app |

---

## Martin's Workflow Context

- Bids multiple jobs per week
- 15 years experience: field work → project engineering → coordination → project management → estimating
- Primary architect and product owner of GlazeBid v2
- **Three-way build workflow:**
  - Cowork Claude — architecture decisions, session continuity, sprint review
  - Claude in VS Code — implementation
  - Martin — domain expert, PM, visual gate on any output requiring human judgment
- **End goal:** Estimators open drawings → AiQ identifies glazing scope → they confirm candidates → quantities flow to Builder for pricing → proposal goes out with shop drawings attached

---

## Critical Rules (All Agents)

1. Builder is JSX only — never introduce TypeScript into `apps/builder/src/`
2. Studio is TypeScript strict — all files must pass `tsc --noEmit`
3. IPC channel names are frozen
4. `window.electronAPI` (capital A) = Builder preload namespace
5. `window.electron` (lowercase) = Studio preload namespace
6. `RawTakeoff` type must stay compatible between both apps
7. Never call `localhost:8000` — all backend calls must have local fallbacks
8. Navigation must always complete — cloud/network failures must never block UI
9. `.gbid` format is the single source of truth for project persistence
10. The snap system (`engine/snapEngine.ts` + `engine/pdfSnapParser.ts`) is stable — do not modify
