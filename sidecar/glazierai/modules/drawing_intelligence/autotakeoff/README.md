# Auto-takeoff port — 2026-10-05

The deterministic auto-takeoff from the Valvoline and McLarty manual tests, ported into the sidecar as
`glazierai/modules/drawing_intelligence/autotakeoff/`. **No model calls anywhere.** Text layer + vector
geometry do the finding, sizing and counting; `rules.json` carries Martin's classification rules; everything
uncertain is flagged with a reason.

## Results (same code, both test sets, scored by `qaqc/eval_v3.py`)

| set | sheets | time | scope objects in Fable's blind ledger | found | classified | counted | vs Martin's markups (object overlap) |
|---|---|---|---|---|---|---|---|
| McLarty Mazda (orig plans) | 35 | 41 s | 85 | **85 (100 %)** | 85 | 85 | 200 / 283 (70.7 %) |
| Valvoline (original drawings, 18 of 19 A-sheets rotated 90°) | 75 | 36 s | 9 | **9 (100 %)** | 9 | 9 | 32 / 44 (72.7 %) |

- McLarty: 12 of 12 elevation Areas within 2" of Martin's Bluebeam Areas; all-glass doors 8 = Martin's 8;
  SSG joints 85 vs his 76 and polished edges 62 vs 58 (derived counts, flagged "verify").
- The misses against Martin's markups are convention gaps, not scope gaps: all-glass Area boxes that include
  his film band, the 4 break-metal detail highlights, door count symbols, and plan Polylengths where the
  opening run was not located (2 of 74 tags on McLarty).
- The blind ledger's `w`/`h` strings carry the old feet-inch formatter bug, so "sized" in the ledger score is
  meaningless; sizes were checked against the snap files and Martin's Areas instead.

## Run it

    run-autotakeoff.bat "C:\path\to\set.pdf" "Job name"
      -> set_autotakeoff.json (ledger + markups) and set_marked.pdf (annotations in toolbox subjects)

    POST /drawing-intelligence/autotakeoff  {"pdf_path": "...", "project_name": "...", "marked_pdf_path": "..."}

    python qaqc/eval_v3.py set_autotakeoff.json --key takeoff_blind.json --key martin_markups.json

## Modules (read order = Martin's: schedules → legends → plans → elevations → details)

| module | what it does | from |
|---|---|---|
| `pdfgeom.py` | rotation-safe text lines and vector segments (`× page.rotation_matrix` once, here); closed-rectangle search with an expected-size filter; `type_frames` (frame on the floor line above a label, stacked frames, side-by-side panels); mullion positions → bays/rows; dimension-box rejection | Valvoline rotation bug, McLarty bugs 1–3 |
| `units.py` | `parse_dim` (unicode fractions, `10'-1/8"`), `fmt_in` (carries 12" to the next foot), scale strings, standard pt/ft table, dimension-based scale voting | McLarty bug 1 |
| `sheet_index.py` | sheet number / title / categories from the title block; cover-sheet index fallback | both |
| `tags.py` | callout tags: short token inside a small closed symbol — hexagon, circle, diamond, rect, triangle, or a **composite** (Valvoline pills drawn as two half-circles + two lines) | McLarty hexagons, Valvoline pills |
| `schedules.py` | **pictorial** schedules (mark + FROM/BETWEEN description + hardware table + ¼" drawing, grouped marks "17 18 19", marks merged into the head line) and **tabular** schedules (header row → columns → rows, wrapped remarks); sheet-wide scale resolution; door-type drawing geometry | McLarty A3.2/A3.3, Valvoline A-6.1 |
| `legend.py` | legend / keynote / finish rows and numbered notes with glazing keywords, on every legend, schedule, elevation and plan sheet | McLarty misses SF-3, D-8, note 13 |
| `plans.py` | the count: tags by mark using the schedule family's symbol (door marks in pills, window marks in rects); same-level plan sheets take the max, different levels add; opening run on the plan for the Polylength | both |
| `elevations.py` | snap each tagged opening to the rectangle matching the schedule W×H (height ×2, penalty outside the tag, stacked frames); dominant symbol kind; **size-only search** for elevations without tags | McLarty A2.0, Valvoline A-3.x |
| `details.py` | detail titles (title-size tier), numbers from bubbles or the "11 SCALE:" line, keyword hits inside the detail's column region | McLarty bug 2 |
| `rules.json` + `classify.py` | exclusions → pass-thru → legend class (flag if the series disagrees) → series class → keyword class → generic glass (flagged); implied items (film, break metal, sill flashing, hardware, fire caulk); exterior/interior incl. "MATCH EXT. FINISH" = interior | Martin's interview answers |
| `subjects.py` | class + role → exact Estimating ToolBox subject and colour | `knowledge/scope_taxonomy.json`, `reference/bluebeam/estimating_toolbox.json` |
| `allglass.py` | panels, SSG joints, polished edges, door leaves, film band height/area per frameless opening (derived, "verify") | Martin's A3.3 markups |
| `pipeline.py` | `run_autotakeoff(pdf)` → sheets, schedule entries, legend rows, plan census, elevation snaps, details, **items** (ledger) and **markups** (sheet, page, rect, subject, role, text, dashed) + flags | |
| `markup_writer.py` | writes the markups as PDF annotations (Polygon highlights at 30 %, Areas with W/H/sf, Qty text boxes, Polylengths, yellow Needs-Review flags) with `/NM = gb:<item>#n` so GlazeBid finds its own marks after Bluebeam; `read_back()` | |
| `qaqc/eval_v3.py` | scope-object scorer: by mark against a ledger key (found / classified / counted / sized), by class-family overlap against Martin's markups | finding 3 of both tests |

## What a reviewer sees flagged (yellow, with the reason)
non-Kawneer/Tubelite series · legend vs series disagreement · bi-fold / auto door inside a frame (pass-thru
sub-item) · elevation width ≠ schedule width (RFI?) · elevation located by size only · grid from vector lines
looks like slats · scale assumed · no plan tag for a mark · manufacturer named but series unknown · door type
with no material whose drawing reads as a sectional door · mirror glazier-vs-accessory · sill flashing trade.

## Not yet built
- Studio review UI over `items` + `markups` (accept / reject / edit → learning log).
- Polylength when the opening run is not found near the tag; Martin's all-glass Area convention (frame + band).
- Curtis (interior-heavy) and a scanned set — both tests so far are clean vector PDFs. Scans need OCR + a
  raster line finder before any of this applies; that is the Tier-2 model case.
- Hardware sets from specs (Spec Reader hand-off), window-wall series, exclusions list (Martin to supply).
