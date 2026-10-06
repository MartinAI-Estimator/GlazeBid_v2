# Studio vs the must-have list — gap audit (2026-10-06)

Source: apps/studio/src (≈21k lines; React + pdf.js + zustand, Electron). Checked against
STUDIO_REVIEW_SPEC_2026-10-06.md.

## Already there (build on it)
| area | what exists |
|---|---|
| PDF viewing | pdf.js with tiled rendering (pdfTileManager), zoom in/out/fit (+ − 0), pan, continuous scroll |
| Documents | multiple PDF tabs (drawings / specs / manual), page list, thumbnails, bookmarks |
| Scale | per-page calibration (draw a known dimension → enter length) |
| Shapes | line, rectangle, polygon, count marker; select, delete, copy / paste / duplicate, right-click menu |
| Colors | Toolbox scope colors (constants/markupTools.ts, mirrors glazebid_scope_colors.py) |
| Frame work | parametric frame builder, type library, grid editor, structural panel |
| Back end | sidecar client; the sidecar already exposes POST /autotakeoff |
| AI helpers | Ghost, Wand, Rake, Box&Snap, auto-scan — **to remove** (spec §7) |

## Missing — Bluebeam parity
| # | gap | notes |
|---|---|---|
| P1 | **Polylength** shape (multi-segment measured line) | Martin's most-used linear tool; today only single line |
| P2 | **Edit handles**: move, resize, drag vertices, add/remove vertex | today shapes can only be deleted / duplicated |
| P3 | **Real undo / redo** | menu calls document.execCommand — does nothing for the canvas |
| P4 | **Tool Chest** with Martin's subjects (Ext SF Area, Ext SF Polylength, Glazing Only Door …), live measurement labels (A = sf / W / H, LF, count) | colors exist; subjects + per-tool label formats don't |
| P5 | **Markups list** panel (columns, totals, filters, export) | none |
| P6 | **Bluebeam round-trip**: read PDF annotations (show others' read-only), write ours as real PDF annotations Bluebeam opens (subject, color, measure dictionaries, /NM ids) | none in Studio; sidecar's PyMuPDF writer can do the write, read_back exists |
| P7 | **Page labels from the sheet index** (A3.1, A4.1 …) + **hyperlinked callouts** (detail bubbles / "6/A3.8" jump) | engine already reads both |
| P8 | **Text, cloud, callout, arrow** annotations | none |
| P9 | **Text search** across the set | none |
| P10 | **Compare / overlay** two revisions | none |
| P11 | **Split view** (two sheets side by side) | none |
| P12 | Bluebeam shortcut set (pan/zoom/select/delete match) | partial (own letters) |

## Missing — engine review layer (spec §2–5)
| # | gap |
|---|---|
| R1 | Run auto-takeoff from Studio (call /autotakeoff), load items + markups as editable shapes with the "unreviewed" badge |
| R2 | Summary tab: totals by system, assumptions with citations, sheet coverage, flag count → step through flags |
| R3 | Yellow flag pins on the drawing |
| R4 | Edit flows: double-click label → quantity; reclassify (job only); "apply to all of type?" prompt; reject reasons |
| R5 | Decision log (accept / reject / edit / add-as-miss) persisted per job — the learning answer key |
| R6 | Finalize → push to GlazeBid estimate + write marked PDF |
| R7 | Click item → every sheet it appears on |
| R8 | Revisions: re-run + changed-items list; overlay compare (P10) |
| R9 | Bid-day checklist, scope checklist, glossary on hover, Spec Reader cross-check |

## Proposed build order
1. **Foundations** — P3 undo/redo, P2 edit handles, P1 polylength, P4 Tool Chest + live labels, remove Ghost/Wand/Rake/Box&Snap from the UI.
2. **Engine in Studio** — R1 load takeoff as shapes, R2 summary, R3 flag pins, R4 edits, R5 decision log, P5 markups list.
3. **Bluebeam I/O + navigation** — P6 round-trip, P7 page labels + hyperlinks, P12 shortcuts, R6 finalize.
4. **Annotate / compare / search** — P8, P9, P10, P11, R8.
5. **Beyond Bluebeam** — R7, R9.
Each step is tested on the Hope / Curtis / McLarty / Valvoline sets.

## Build status (2026-10-06)
- **Step 1 done** (425f2dc): undo/redo, edit handles, Polylength, Tool Chest (Martin's ToolBox), live labels, Ghost/Wand/Rake/Box&Snap retired.
- **Step 2 done** (9f6933e, 25a8af5): Run Auto-Takeoff in Studio, engine markups as editable shapes, Summary, Markups list (+CSV), typed quantities (apply-to-all prompt), reclassify, delete reasons, decision log → `_autotakeoff_runs/<project>/decisions.jsonl`.
- **Step 3 done** (7a08172): Bluebeam round-trip (measurement annotations with /Measure at sheet scale; others' markups preserved, shown locked, toggle), sheet labels/scales/hyperlinked callouts on open, Alt+←/→ views, PgUp/PgDn, Shift+Alt+L/N/A/C, Finalize (accept → Builder inbox → marked set).
- Needs Martin on screen: feel of handles / labels / shortcuts; Bluebeam opening our marked set as measurements.
- Next: step 4 (text / cloud / callout annotations, text search, revision compare + overlay, split view), step 5 (click item → all sheets, Spec Reader cross-check, bid-day + scope checklists, glossary).
