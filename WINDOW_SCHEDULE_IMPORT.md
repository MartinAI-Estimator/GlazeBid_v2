# Window Schedule Import (Path C) — Findings & Logic

**Session date:** 2026-07-24
**Status:** BUILT + TESTED (sandbox). Needs one in-app E2E run with API key before demo.
**Next session:** Finishing the Parametric Frame Builder — punch list at bottom.

---

## 1. What Was Built

Drag-and-drop window schedule import: drop a PDF/Excel/CSV schedule anywhere on the
Frame Builder → frames are extracted, reviewed, and auto-built into the parametric store.

| File | Role |
|---|---|
| `apps/builder/src/store/useFrameBuilderStore.js` | `hydrateFrame(payload)` + `hydrateFrames(payloads)` — the missing wire from the AiQ context doc, now built |
| `apps/builder/src/lib/scheduleParser.js` | File → Frame Payload JSON. Rules-based first, AI fallback |
| `apps/builder/src/components/FrameBuilder/ScheduleImport.jsx` | Review modal (editable table, confidence, flags) + drop overlay |
| `apps/builder/src/components/FrameBuilder/FrameBuilder.jsx` | Drag handlers on root, Upload button in FRAMES panel, hidden file input |
| `apps/builder/src/lib/scheduleParser.test.js` | Vitest: dims, header mapping, page filter (~20 cases) |
| `apps/builder/src/__tests__/store/useFrameBuilderStore.hydrate.test.js` | Vitest: hydration (~14 cases) |

## 2. Data Flow

```
File drop / browse (FrameBuilder.jsx)
      ↓
parseWindowSchedule(file)                        [scheduleParser.js]
      ├─ XLSX/XLS/CSV → extractSheetRows (SheetJS)
      │     └─ rulesMapRows: header-alias detection → payloads   (NO API COST)
      │           └─ unmappable headers? → serialize rows → aiMapSchedule
      └─ PDF → extractPdfText (pdfjs, same pattern as specReader.js)
            └─ filterSchedulePages (keyword page filter)
                  └─ aiMapSchedule via window.electronAPI.aiChat  (Haiku-class)
      ↓
ScheduleImport.jsx review table (edit/exclude rows, amber = flagged)
      ↓  "Build N Frames →"
useFrameBuilderStore.hydrateFrames(payloads)
      ├─ group find-or-create (by location, else systemType)
      ├─ field mapping + validation result per frame
      └─ resolveBOM() scheduled per frame (≥12" dims)
```

## 3. Key Logic Decisions (implemented, tested)

- **Payload schema** = exactly the Frame Payload JSON from the Cowork context doc §4.
  `hydrateFrame` accepts it verbatim; AI prompt in `scheduleParser.js` emits it verbatim.
- **Rules before AI** (architecture principle): spreadsheets never hit the API when
  headers are recognizable (MARK/WIDTH/HEIGHT + aliases). PDFs always go to AI.
- **Auto-grouping:** `location`/`frameSet` in payload wins; else systemType →
  Ext Storefront / Ext Curtainwall / Hollow Metal / HM Fire-Rated. Groups are reused
  by case-insensitive name match. Mirrors PartnerPak's FrameSet level.
- **LaborType at frame level:** STANDARD (SF/HM), COMBINATION (CW). New `laborType`
  field on frames — first consumer will be the labor engine (Phase 3).
- **EQ bays:** payload `bayWidths: null` → `bayConfigs: []` → existing UI renders
  equal widths. Explicit widths → `bayConfigs[].widthOverride`. Length mismatch → warn + ignore.
- **Never silently skip:** missing `rowHeights` / `sillAFF` / dims → `needsInput[]`
  in the validation result, echoed on the results screen. `flaggedFields` from the AI
  propagate into `needsInput` too.
- **Glass:** fuzzy-match against the specs library (normalized contains); no match →
  new spec created from the payload string, warned.
- **No frame field yet** for safetyFilm / brakemetal / squareCornerMullion /
  specialtyGlass → folded into `estimatorNotes` as ⚑ flags + `importMeta` on the frame
  (`source`, `confidence`, `needsInput`, `importedAt`).
- **System inference regexes** handle glued mark tokens: HM13, HMF1, CW-1, SF1, AS3
  (`\bhm[-\s]?\d*\b` etc. — plain `\bhm\b` misses "HM13"; this was caught and fixed in testing).

## 4. Test Results (this session, Linux sandbox harness on real store/parser code)

| Suite | Result |
|---|---|
| `hydrateFrame`/`hydrateFrames` (real store, frame-engine stubbed) | **40/40 pass** |
| Rules parser on synthetic Altruria-style XLSX (5 frames: AS1, AS9, CW-1, HM13, HMF1) | **all fields exact** — dims (`9'-10"`→118, `12'-4 1/2"`→148.5), qty, glass, finish, safetyFilm, brakemetal, hasDoor, system types incl. fire-rated |
| Same schedule as CSV | pass |
| Unmappable sheet → AI path | graceful error when bridge absent |
| `.png` drop | rejected with message |
| `parseDimToInches` (15 cases incl. unicode quotes, fractions, mm) | all pass |
| PDF extraction — `test_elevation.pdf` (35 pages) | 268K chars in ~11s; "DOOR and FRAME SCHEDULE" found |
| PDF extraction — McLarty Mazda bid set (12 pages) | 136K chars in ~3s; dims intact |
| `filterSchedulePages` on test_elevation.pdf | 268K → 22.6K chars; kept exactly pages 9 & 34 (the schedule pages), 85 dim strings retained |
| eslint on all touched files | clean (1 pre-existing warning untouched) |

**Finding that drove a fix:** full bid sets exceed the 60K-char AI clip → added
`filterSchedulePages()` (schedule-keyword page filter) before the AI call. Unfiltered
large PDFs now warn the estimator to drop just the schedule sheet.

**Not yet run** (sandbox can't execute Windows-native vitest/electron):
- `npm run test:run` in `apps/builder` (the two new vitest files)
- In-app E2E: drop a real schedule PDF with API key set → AI extraction → review → build

## 5. Known Limits (deliberate, this phase)

- Scanned/image-only PDFs rejected with a clear message — vision path is AiQ sidecar work (Phase A).
- AI path requires desktop app + API key (Admin Settings). Browser dev = rules path only.
- Schedules rarely carry bay/row grid → imports default 1×1 with panel/row nulls; estimator
  sets grid in Frame Builder (or AI infers it from elevations later — Path B/A).
- HM frames map to `sf-450` archetype (no HM archetype in frame-engine yet) — flagged in notes.

## 6. Punch List — Finishing the Parametric Frame Builder (next session)

Gap analysis vs. the target state model (context doc §3):

1. **Frame-level fields still missing** from `useFrameBuilderStore` frames:
   `safetyFilm`, `brakemetal`, `squareCornerMullion`, `expansionMullion`, `specialtyGlass`,
   `alternateGlass`, `nullGlazing`, `spanInsul`, `hardwareGroup`, `bidUnitPrice`, `glassAreaRatio`
   (currently notes-only via import). Promote to real fields + UI inputs.
2. **Scrap % with 8/10% coloring** — confirmed design decision, not yet surfaced on frames
   (BOM has stock optimization inputs; needs scrapPct calc + green/yellow/red chip).
3. **HM archetype** in `packages/frame-engine` (hollow metal + fire-rated variant) so HM
   frames stop borrowing sf-450.
4. **Door bays LOCKED in redistribution** — bayConfigs carry `type: 'door'` from import;
   verify the canvas/BOM honors locked door bays + 4" door panel minimum.
5. **Glass area ratio** calculated field (vision area / frame area) on frame + dashboard.
6. **`laborType` consumer**: labor engine should read frame.laborType (STANDARD vs
   COMBINATION rates) instead of any project-level assumption.
7. **Quick-take mode** (confirmed decision) — not started.
8. **E2E**: run the two vitest files, then live-drop test with API key; verify review →
   build → BOM → Bid Cart flow end to end.
9. Later (Paths B/A): PDF smart-highlight import, screenshot/vision import via AiQ sidecar.

## 7. How to Verify Locally (Windows)

```bash
cd "C:\Users\mjaym\GlazeBid v2\apps\builder"
npm run test:run   # includes the 2 new test files
npm run lint
# then: npm run dev:builder (from repo root), open Frame Builder, drag a schedule in
```
