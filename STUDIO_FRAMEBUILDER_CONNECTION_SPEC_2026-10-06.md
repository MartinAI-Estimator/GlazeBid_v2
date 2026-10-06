# Studio → Frame Builder connection — findings and interview (2026-10-06)

Builds on GlazeBid_Frame_Builder_Interview_Spec_2026-10-03.md (Frame Builder V1) and STUDIO_REVIEW_SPEC_2026-10-06.md.

## What exists today
| piece | state |
|---|---|
| Frame Builder V1 engine (`packages/frame-engine/src/core`) | geometry, joinery, glass + block sizes, doors, optimizer, brake metal, labor + lift line, Kawneer library with Tubelite twins; 19/19 tests pass. `hydrateFrame(payload)` builds a FrameSpec and lists `needsInput` instead of guessing. |
| Frame Builder V1 UI (`apps/builder/src/components/FrameBuilderV1`) | interactive elevation, inspector, reports, bid-cart sync (`builderBridge.syncToBid`). Import = pasted JSON / `.gbframes.json` only. |
| Window-schedule upload | only in the **old G3 Frame Builder** (`ScheduleImport.jsx`, `lib/scheduleParser.js` → `useFrameBuilderStore.hydrateFrames`). Spreadsheets by rules; **PDFs always go to AI**. Not wired to V1. |
| Studio → Builder | Finalize → Studio Inbox (`StudioInbox.jsx`) → old **G4** `parametricFrameMath` → bid cart. Right-click "Open in Frame Builder" (`frame-builder-send`) → a blank "needs work" card in the old workspace. **Nothing reaches V1.** |
| What the auto-takeoff knows per frame type | mark, class, plan count (Thus), overall size (schedule / elevation / dimension string), bays × rows, **mullion positions on the elevation**, series when named, notes, head/jamb/sill details, door marks; spec check adds series / finish / glass. |

## Decisions (Martin, 2026-10-06)
1. **Hand-off: both.** Finalize sends every frame type to Frame Builder V1, built and ready to review; right-click any frame in Studio → "Open in Frame Builder".
2. **One frame per type mark, quantity = plan count.** An opening of a different size becomes a variant (SF1A).
3. **Bay / row sizes:** mullion positions → DLO using the system's sightlines, flagged "from drawing"; dimension strings win where present.
4. **Window-schedule upload moves to V1, no AI.** Spreadsheets by rules (as today); PDF schedules by the same deterministic engine Studio uses; unread fields flagged.
5. **Re-sync:** fields the estimator never touched update silently; edited fields are kept with a "drawing now says X" note to accept / ignore; new marks added; missing marks flagged, never deleted.
6. **Schedule vs Studio for the same mark:** merge — size and type from the schedule, count from the plans, bays from the elevation; every disagreement flagged on the frame.
7. **Non-frame items, split by kind:** break metal → the frame's brake-metal table (on the frame it touches when known); glazing-only lites → glass report; mirrors, translucent panels, pass-thru → bid cart lines.
8. **Retire** (after parity): Studio Inbox G4 frame math; the old G3 Frame Builder (once its upload lives in V1). **Keep** Studio's own frame tool for now.
9. **Doors** go into the frame's door bay when an elevation / plan tag ties them to the frame type; schedule data (single/pair, size, hardware set) fills the leaf; doors in no frame become standalone door frames.
10. **System when none is named:** spec cross-check / drawing notes first, else Ext SF → Kawneer 451T, Int SF → Trifab 450, CW → 1600 — flagged "assumed".
11. **Two-way links (all three):** frame → its sheets in Studio (item trace); quantity / size edits in the Frame Builder show back in Studio; Studio markups show built / needs input / not sent.
12. **Glass and finish:** job defaults from the spec cross-check and drawing notes (flagged "from specs"); per-frame values from the schedule where listed.
13. **Arrival:** an Incoming panel (mark, source, size, bays, qty, needs-input) → Build all / per row; flagged frames stay highlighted until cleared.
14. **Size mode:** R.O. / M.O. on the schedule or detail → rough-opening mode with the job's default joints; otherwise frame size, flagged "assumed frame size".
15. **Job link:** Studio opened from a Builder project sends to that project's Frame Builder takeoff; opened standalone, it asks which project.

## Build plan
1. **Frame payload from the engine** (sidecar): one payload per frame type — mark, class → system type, series / maker (item → spec check → defaults), size + size mode, qty, bays / rows, CL bay widths and row heights from mullion positions, door bays + door data, glass / finish defaults, provenance per field (sheet, page, rect) and flags. `POST /drawing-intelligence/frames/payload`.
2. **`hydrateFrame` v2** (frame-engine): CL bay widths / row heights → DLO via system sightlines; size mode; door bays with leaf data; per-field provenance in `importMeta.fields` so re-sync knows what the estimator touched. Tests.
3. **Transport:** Studio Finalize + right-click → IPC to the Builder window with `{ project, frames, nonFrames, jobDefaults }`; Builder routes into V1's Incoming queue for that project (persisted with the takeoff).
4. **V1 Incoming panel + merge / re-sync rules** (decisions 5, 6, 13).
5. **Window-schedule upload in V1:** port `rulesMapRows`; PDFs through the sidecar schedule reader; same payloads, merged by mark.
6. **Non-frames** (decision 7).
7. **Two-way:** "Show in Studio" from a frame (opens the trace); qty / size back to Studio; built-status badges on Studio markups.
8. **Retire** G4 inbox math and G3 Frame Builder once the above is accepted.

Each step tested on Hope / Curtis / McLarty / Valvoline / Tricity.

## Build status
- **Step 1 done** (6234518): `frames.py` + `elevation_grid.py`, `POST /drawing-intelligence/frames/payload`, 6 tests. The grid reader reads each type elevation's vector lines (member faces → centerlines, mullions, per-bay horizontals, door bays, pairs, door height) and ignores tags / callouts by pen weight and colour. Results: Hope 21/21 sized frames with grids, 6 door bays, 10 doors tied to frame types; Curtis 31/52 with grids, 15 door bays; McLarty 17/17, 11 door bays; Valvoline 1/7 (elevations not matched); Tricity none (its storefronts are only elevation notes — engine gap). Checked by eye: Curtis SAF/SAW/SAS/SAB, McLarty 4/5/30/101, Hope types 5/8/12.
- Fixed on the way: the page-drawing cache was keyed by document memory id (stale lines when a new PDF reuses the id) — cleared around each payload build.
- Known limits: engine frame rectangles that include wall below a raised sill (Hope K / type 12) shift door / row heights; doors whose schedule names no frame type stay standalone door frames; every read is flagged "confirm DLOs".
- **Step 2 done** (48a3caf): `importer.js` in the frame engine — centerlines → DLO with each system's sightlines (widest glass bay / tallest row left EQ so the frame closes), door bays with the scheduled door (single/pair, stile, panic → rim / CVR preset, hardware set), door height from the header, transom / per-bay rows, R.O. mode with job joints, standalone door frames, system from the named series (other makers priced as the Kawneer equal, flagged), job glass types + finish from the spec check, `importMeta` for re-sync (`resyncFrame`, `acceptDrawingValue`). 27 engine tests pass; all Hope / Curtis / McLarty / Valvoline payloads import and solve with no warnings.
- **Steps 3+4 done** (08d623f): Studio "To Frame Builder" button, Finalize step and right-click "Open in Frame Builder" send the payloads (rejected types stay behind, typed quantities travel) to the Builder project that opened Studio; the Builder files them in that project's Frame Builder takeoff (held if no project is open) and shows a notice; the Frame Builder's Incoming list builds / re-syncs (new · will update · you edited — drawing changed · up to date) and a "From Studio" box on each built frame shows needs, "drawing now says … Use drawing", Mark reviewed, Show in Studio. Step 7's links are in: Show in Studio opens the item trace; built / needs-input status and the Frame Builder quantity show in Studio's trace panel.
- Next: step 5 (window-schedule upload in V1, no AI), step 6 (non-frame lines: brake metal onto frames, glass-only to the glass report, the rest to the bid cart), step 8 (retire the G4 inbox math and the G3 builder after you accept this path).
