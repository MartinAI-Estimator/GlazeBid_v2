Save the below for your context reference:

GlazeBid v2 — Project Context for AI Agents
Generated from founding chat session — load this at the start of every Cowork session
1. WHO BUILT THIS AND WHY
The project owner is a commercial glazing estimator with 15 years of field and office experience — field worker, PE, project coordinator, project manager, and now estimator. He bids 4-7 jobs per week and identified that the entire subcontractor estimating space is severely behind on technology.
The core problem: estimators spend all day on data entry and document management, never having time to build GC relationships or sell work. There is no glazing-specific estimating software that automates the workflow end to end.
GlazeBid v2 is built to solve this. It is not a general construction tool — it is glazing-specific, which is its primary competitive moat.
2. WHAT THE APP IS
GlazeBid v2 is a Windows desktop application (Electron) for commercial glazing estimating. It covers the complete workflow:

```
PDF Blueprint Intake
      ↓
Architectural Drawing Triage (filter non-glazing sheets)
      ↓
Studio Takeoff (draw on PDF, measure glazing areas)
      ↓
Parametric Frame Engineering (BOM generation)
      ↓
Bid Sheet & Pricing (labor + material)
      ↓
Proposal Generation

```

3. TECH STACK
Concern Technology Desktop shell Electron (Windows-first, .exe installer target) Builder app React JSX — 155 source files — port 5173 Studio app React + TypeScript — 56 source files — port 5174 State management Zustand (both apps) Build tool Vite (both apps) IPC Custom Electron IPC bus with dual preload APIs Data format Local `.gbid` JSON files — no cloud required AI layers 3 phases: fallback intelligence, canvas auto-scan, ghost detector
4. PROJECT STRUCTURE

```
C:\Users\mjaym\GlazeBid v2\
├── package.json              ← npm workspaces root
├── electron/main.ts          ← Combined Electron main process
├── scripts/build-preloads.mjs
├── apps/
│   ├── builder/              ← Legacy JSX Builder (port 5173)
│   │   └── src/              ← 155 source files
│   └── studio/               ← TypeScript Studio (port 5174)
│       └── src/              ← 56 source files
├── MASTER_ARCHITECTURE.md    ← Full technical architecture (read this)
├── COMPLETION_ROADMAP.md     ← Phased completion plan (read this)
└── CLAUDE_CONTEXT.md         ← This file

```

5. TWO-APP ARCHITECTURE
App 1 — GlazeBid Builder (The Estimating Hub)
* Central project management and pricing application
* Runs at localhost:5173 in dev
* 155 JSX source files — do not introduce TypeScript here
* Key stores: `useBidStore.js`, `useInboxStore.js`
* Key hooks: `useEstimatorSync.js`, `useInboxSync.js`
App 2 — GlazeBid Studio (The Takeoff Engine)
* High-performance PDF canvas and parametric engineering tool
* Runs at localhost:5174 in dev
* TypeScript strict — all files must pass `tsc --noEmit`
* Spawned by Builder on demand as a child window
* Key stores: `useStudioStore.ts`, `useProjectStore.ts`
Cross-App Communication
* Studio → Builder via two parallel paths:
   1. `localStorage.setItem('glazebid:inbox', ...)` → storage event
   2. `window.electron.syncInbox(inbox)` → IPC: inbox-sync → inbox-update
* Builder preload namespace: `window.electronAPI` (capital A)
* Studio preload namespace: `window.electron` (lowercase)
* These namespaces are frozen — do not change them
6. DATA CONTRACTS (FROZEN — DO NOT CHANGE)
RawTakeoff — immutable Studio measurement record

```typescript
type RawTakeoff = {
  id: string; shapeId: string; pageId: string;
  x: number; y: number; widthPx: number; heightPx: number;
  widthInches: number; heightInches: number;
  type: 'Area' | 'LF' | 'Count';
  label?: string; systemId?: string;
}

```

SystemType

```typescript
type SystemType = 'ext-sf-1' | 'ext-sf-2' | 'int-sf' | 'cap-cw' | 'ssg-cw'

```

BidFrame (useBidStore)

```javascript
{
  frameId, elevationTag, systemType,
  inputs: { width, height, bays, rows, glassBite, sightline },
  bom: { totalAluminumLF, totalGlassSqFt, glassLitesCount, cutList, glassSizes }
}

```

7. WHAT IS COMPLETE AND WORKING ✅
* `npm run dev:builder` → both Vite servers + Electron launch
* Studio: PDF load, pan/zoom, high-res tiles (72–1152 DPI)
* Studio: All drawing tools (Line, Rect, Polygon, Parametric Frame, Rake, Count, Wand)
* Studio: AI Auto-Scan (Phase 6.2) — BFS pixel scan → auto-classify glazing regions
* Studio: Ghost Detector (Phase 6.3) — ML-ready sliding window detection
* Studio: Frame calibration
* Studio: FrameType Library (create, color, BOM preview)
* Studio: Click-to-count dots on PDF per type
* Studio: BOM aggregation (type.bom × dot count)
* Studio → Builder IPC: frame types + counts
* Builder: System cards created from Studio types
* Builder: BidSheet pricing grid
* Builder: SOW / Bid Summary
* Builder: Project save/open (.gbid)
* Builder: ProjectSideNav with all nav links including Studio Takeoffs
* Builder: StudioInbox with "+ Bid" button wired to useBidStore
* Builder: Proposal Generator
8. WHAT WAS FIXED IN FOUNDING SESSION
Root Cause of Blank Dashboard
The `App.jsx` had a static top-level import of `loadProjectFromCloud` from `./utils/syncProject`. If this module threw on import (dead API endpoint), it crashed the entire React module before any component mounted — resulting in a blank screen with no visible error.
Fix Applied
* Converted to a safe dynamic import wrapped in try/catch
* Created `safeLoadFromCloud()` wrapper that never throws
* Navigation (`setCurrentView('projectHome')`) is now unconditional — always runs regardless of cloud rehydration result
* File: `apps/builder/src/App.jsx` — use the fixed version, not the original
Other Minor Fixes
* `ProjectIntake.jsx`: Added `other: []` to `localData` object in `handleFiles()` to prevent crash in results view
* `ProjectIntake.jsx`: Changed `fileCategories` → `pendingFileCategories` in both `saveToLocalFolder()` calls
Files Confirmed Clean (No Changes Needed)
* `ProjectList.jsx` — already local-only
* `StatsRibbon.jsx` — already local-only
* `ProjectSideNav.jsx` — Studio Takeoffs nav link already wired
* `StudioInbox.jsx` — "+ Bid" button already implemented
9. REMAINING WORK (FROM COMPLETION_ROADMAP.md)
Phase D — Demo Ready (Do These First)
* [ ] D5: Full E2E verify of Type-First Takeoff workflow
* [ ] D6: Verify "+ Bid" button navigates to `/bid-sheet` after adding (may already work)
Phase 7 — Builder Enhancements
* [ ] 7.3: Wire project file load/save UI (IPC handlers exist, need UI buttons)
* [ ] 7.4: Remove/shim remaining `localhost:8000` calls in secondary viewers:
   * `DocumentViewer.jsx` → use Electron file dialog
   * `SpecViewer.jsx` → disable backend features, local PDF only
   * `AddendumViewer.jsx` → disable visual diff
   * `DoorSchedule.jsx` → disable classification API
   * `MarkupTransfer.jsx` → disable entirely
Phase 8 — Studio → Builder Engineering Workflow
* [ ] 8.1: Port FrameEngineerModal from GlazeBid AIQ Suite into Builder
* [ ] 8.2: Wire EngineeredFrame output → BidStore
* [ ] 8.3: Load project data in Studio from .gbid on re-open
Phase 9 — Packaging & Distribution
* [ ] 9.1: Builder PDF intake drop zone
* [ ] 9.2: TypeScript strict compliance in apps/studio/
* [ ] 9.3: Electron Builder packaging for Windows .exe installer
* [ ] 9.4: Desktop shortcut + auto-updater
Phase 10 — AI Extensions (Future)
* [ ] 10.1: ONNX model integration for Ghost Detector
* [ ] 10.2: Session Learner persistence to .gbid
* [ ] 10.3: Cloud training pipeline
Dead Code to Delete

```
apps/builder/src/components/ProjectIntake.new.jsx
apps/builder/src/components/ProjectIntake.old.jsx
apps/builder/src/components/PDFViewer.jsx.broken
apps/builder/src/components/SheetSidebar.new.jsx

```

Verify first: `grep -r "ProjectIntake.new\|ProjectIntake.old\|PDFViewer.jsx.broken\|SheetSidebar.new" apps/builder/src/`
10. NEXT HIGH-VALUE FEATURE — SPEC PARSER
The single feature that would most differentiate GlazeBid from anything else on the market:
Drop a spec PDF → AI extracts:
* Basis of design (manufacturer, system name)
* Approved equal manufacturers
* Finish specification (anodized, painted, PVDF)
* Warranty requirements
* Testing requirements (AAMA, ASTM, hurricane, blast)
* Division 8 scope summary (08 41 13, 08 44 00, etc.)
* Any special requirements (blast, bullet resistant, fire rated, film)
This saves 45-90 minutes per bid. No competitor has it for glazing specifically.
Implementation path:
* Use Anthropic Claude API (claude-sonnet-4-20250514) with PDF document input
* Parse spec book pages 08 41 00 through 08 44 99
* Output structured JSON → populate project metadata
* Surface in ProjectHome as "Spec Summary" card
11. AGENT TEAM STRUCTURE (FOR COWORK)
Agent Role Responsibility Constraint Project Manager Orchestrate, prioritize, assign tasks Reads MASTER_ARCHITECTURE.md first Builder Agent All work in apps/builder/src/ JSX only — no TypeScript Studio Agent All work in apps/studio/src/ TypeScript strict — must pass tsc IPC Agent electron/main.ts + preload files Frozen channel names and namespaces Demo Fix Agent localhost:8000 → local shims try/catch pattern, never delete UI TS Fix Agent TypeScript strict compliance apps/studio/ only QA Agent Cross-app contract validation RawTakeoff type compatibility
12. CRITICAL RULES FOR ALL AGENTS
1. Builder is JSX only — never introduce TypeScript into `apps/builder/src/`
2. Studio is TypeScript strict — all files must pass `tsc --noEmit`
3. IPC channel names are frozen — see MASTER_ARCHITECTURE.md Section 4.2
4. `window.electronAPI` (capital A) = Builder preload namespace
5. `window.electron` (lowercase) = Studio preload namespace
6. `RawTakeoff` type must stay compatible between both apps
7. Never call `localhost:8000` — all backend calls must have local fallbacks
8. Navigation must always complete — cloud/network failures must never block UI
9. `.gbid` format is the single source of truth for project persistence
10. The snap system (`engine/snapEngine.ts` + `engine/pdfSnapParser.ts`) is stable — do not modify
13. DEV COMMANDS

```bash
# Start full stack (Builder + Studio + Electron)
cd "C:\Users\mjaym\GlazeBid v2"
npm run dev:builder

# Start individual app (no Electron)
npm run dev --workspace apps/builder   # http://localhost:5173
npm run dev --workspace apps/studio    # http://localhost:5174

# Rebuild Electron main + preloads
node scripts/build-preloads.mjs

# Build for production
npm run build:builder
npm run build:studio

```

14. HOW TO USE THIS FILE IN COWORK
At the start of every Cowork session, tell Claude:
"Read CLAUDE_CONTEXT.md and MASTER_ARCHITECTURE.md before we begin. Today we are working on [specific task]."
For agent-specific sessions:
"You are the Builder Agent. Read CLAUDE_CONTEXT.md — specifically sections 5, 8, 9, and 12. Your constraint is JSX only in apps/builder/src/. Today's task is [task]."
This file is the single source of truth for project context. Update it whenever major decisions are made or phases are completed.