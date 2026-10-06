# GlazeBid Studio — Bluebeam replacement + takeoff review (interview, 2026-10-06)

Martin's brief: Studio **replaces Bluebeam for the estimator**. Every PDF viewing / markup / measure tool an
estimator uses stays; the AI layer sits on top and can be adjusted. "Everything Bluebeam does for us, plus
more the estimator can imagine." Users: Martin now; intended for **any glazing estimator, including entry level**.

## 1. Bluebeam parity (must-haves before AI polish)
- **Measure + Tool Chest**: length, polylength, area, count with the Estimating ToolBox subjects/colors
  (reference/bluebeam/estimating_toolbox.json); calibration per page/viewport.
- **Markups list**: columns, totals, filters (subject, page, author, layer); export.
- **Navigation**: thumbnails, bookmarks, page labels = sheet numbers, hyperlinked callouts (detail
  bubbles / "6/A3.8" jump to the detail), split view, multiple tabs.
- **Annotate + compare**: clouds, text, callouts, snapshots, overlay/compare revisions, Sets.
- **Bluebeam round-trip, both ways**: open PDFs with others' Bluebeam markups (shown, ignored for takeoff);
  save PDFs that Bluebeam opens with our markups intact (subjects, colors, measurements, /NM ids).
- **Input**: mixed — standard shortcuts for pan / zoom / select / delete (match Bluebeam), mouse for the rest.
- **Layout**: Bluebeam-like — thumbnails left, drawing center, markups list bottom, properties right;
  Summary as a tab.

## 2. Reviewing the engine's takeoff
- **Start at the Summary**: totals by system (SF / LF / EA / doors; alternates separate), assumptions
  (series, glass, finish, hardware — each with sheet citations), sheet coverage (read / had scope /
  skipped + why). Flag count on the summary; click to step through.
- **Engine markups** use the Toolbox subject style **plus a small "unreviewed" badge**.
- **Accept on Finalize**: anything not rejected or edited is accepted when the takeoff is finalized.
- **Editing**: move, resize, reshape, delete, change quantity, reclassify — all highlights.
  - Quantity: **double-click the label on the markup and type**.
  - Edits to one instance of a type (size, glass, shape): **ask each time** — "apply to all 11 type F?"
    yes / just this one / pick.
  - Reclassify: **this job only**; the engine learns quietly from the log (no rule prompts).
  - Reject/delete: **one-click reasons** (not ours / by others / duplicate / existing / wrong spot /
    wrong size / other); Delete key skips the prompt.
- **Yellow flags** (engine uncertainty + reason): **count on Summary + yellow pin on the drawing**.
- **No "you may have missed" queue** — the engine does the takeoff; that list only existed for scoring
  against hand markups.
- **Engine misses**: anything the estimator draws with a Toolbox tool joins the takeoff normally and is
  **quietly logged as "engine missed this"** for learning.
- **Every accept / reject / edit / add is logged** (standing rule) — the log is the answer key going forward.

## 3. Revisions / addenda
- **Both**: re-run the engine on the new set and list what changed (added / removed / resized), carrying
  accepted edits forward; **and** overlay compare on any sheet.

## 4. Finalize
- **Push to the GlazeBid estimate** (items, sizes, quantities → estimate / frame builder).
- **Write the marked PDF** (Bluebeam-compatible).
- (Not on finalize: version lock, scope letter — scope letter / RFIs still a hand-off target, on demand.)
- **Alternates**: tagged in the base takeoff ("ALT 1"), filterable; totals kept separate.

## 5. Beyond Bluebeam (front and center)
- **Click an item → every sheet it appears on**: schedule row, elevation, plan tags, details, side by side.
- **Spec cross-check**: hand-off to Spec Reader — flag drawing vs spec disagreements (series, glass, finish).
- **Bid-day checklist** before finalize: every flag resolved, every sheet covered, alternates priced.

## 6. Entry-level estimators
- **Scope checklist** per job (hardware, alternates, fire-rated, existing to remain, by others, …).
- **Glossary on hover** for glazing terms (451T, sidelite, sill flashing, …).

## 7. Existing AI helpers
- Ghost / Wand / Rake: **remove from the UI** — the engine covers them (code stays in git history).

## Scope rules decided in this session
- Mirrors: **ours unless marked Bobrick (Div 10 accessory); frameless mirrors always ours** (rules.json).
- Read every leader-arrow note on elevations, every project (notes.py).
- Sill flashing is always ours when shown; break metal driven purely off details.

## Open for the next interview round
- Markups-list columns and the export format the estimate needs.
- Exact keyboard shortcut set (Bluebeam defaults to mirror).
- How "apply to all of type" shows the instances before committing.
- Scope-letter / RFI drafting flow (on demand).
- Multi-user / licensing (undecided — single user for now, built so a team or other companies can be added).
