# Curtis MS Renovation — first unseen set (2026-10-05)

Auto-takeoff run on Curtis (VLK, 19 sheets, interior renovation) with no Fable involvement in the run.
It had never seen this architect. First run: **0 schedule entries, sheet titles wrong** ("A", "H1").
After fixes in this session: **82.1 % of Martin's 603 markup objects found**, door schedule rows
classified to match Martin's highlights on **360 of 361**, in ~150 s, 0 model calls.
McLarty and Valvoline re-scored after every change: both still 100 % on their ledgers; markup overlap
McLarty 71.7 % (was 70.7), Valvoline 75.0 % (was 72.7).

## What broke on a new architect, and the fix (all generic, none Curtis-specific)
| broke | why | fix |
|---|---|---|
| sheet numbers "A2.11G1" read as "H1" | sheet-number pattern allowed one trailing letter; key-plan letters matched instead | pattern allows `A2.11G1`; title read centred under "SHEET TITLE", date lines dropped |
| door schedule: 0 rows | header text 12.7 pt (> fixed 12 pt cutoff); two-line headers ("DOOR / TYPE"); two tables side by side on one row | header size relative to body text; stacked header words joined; a new table starts where a mark column repeats |
| rows merged | marks like `A106.1` didn't match the mark pattern → treated as continuation lines | marks may carry `.1` |
| doors unclassifiable | rows are codes only (type C, panel 2, frame 1) — no word "glass" anywhere | **new `door_types.py`**: reads type elevation drawings (lite rectangle inside the leaf → vision lite; many slats → coiling; section title → storefront / sliding), and code tables (PANEL MATERIAL NOTES, DOOR KEYED NOTES); adds those words to the row before classifying |
| "OVERHEAD" in keyed note "manual hold-open, overhead" excluded doors | bare word | overhead rule now needs OVERHEAD + DOOR/COILING/SECTIONAL/ROLLING/GRILLE |
| FRP doors classed glazing | "FIBERGLASS" contains "GLASS" | glass keywords exclude FIBERGLASS |
| fire rating from revision triangles ("1") | stray delta numbers in the rating column | fire rating must look like a rating (45 MIN, 90 MIN, 1 HR) |
| SA assemblies (SAA…SBF) not tags | 3-letter marks; hexagon drawn as 4 loose strokes with a white mask behind the text | pattern allows 3 letters; loose-stroke hexagons; masks that hug the text ignored |
| door tags not found | ellipses drawn as ~24 short line segments, rotated text | ring-of-segments ellipse detector |
| glazing assemblies not read | caption is UNDER the tag, frame lines broken at every transom | **captioned reader**: tag → caption below → pane cluster above → snap to outer frame lines → dimension-string check (flagged when used) |
| plan Polylength on the wrong line | a line of the right length isn't the storefront | **frame box in the wall** (thin closed rect, long side = schedule width) first; run search only as fallback and for all-glass |

New rules (rules.json): existing-to-remain excluded + flagged; sliding storefront → Bi-Fold/Sliding;
fire-rated storefront → Fire Rated SF; fire rating on a glass-only door → Fire Rated Glazing Only;
motorized panels → overhead/coiling; interior assumed (flagged) when the set has no exterior sheets.

## Martin's Curtis convention (learned from his 835 markups)
- Door schedule rows highlighted by class: type C/D/M (vision lite) = Glazing Only; with 45/90 MIN = Fire
  Rated Glazing Only; SFD-* = Int SF; T/U/V sliding = Bi-Fold/Sliding; flush / HM / coiling / existing left blank.
- Glazing assemblies on A7.21: tag hexagon + "n Thus" box (SAB 40 Thus, SAA 33 Thus); not the drawing.
- Plans: SA hexagon tag + a box along the wall at the frame; door tags as circles (Glazing ONLY Door …).
- No details, notes or legend rows marked on this job.

## Still open
- **Question for Martin:** plan sheets A2.11D, F, G1, G2, H2 carry only 4–12 of his marks vs 40–62 tags
  found — partially marked, or are those units out of scope?
- About a third of the engine's marks have no Martin markup: mostly plan tags on those sheets, detail
  keyword hits and note rows (he didn't mark details/notes on Curtis), and the A7.21 drawing boxes.
  Candidate convention switch: per-job "mark details / notes / type drawings" options in Studio.
- Fire-rated SF found 4 of 12, Ext CW 0 of 2, BR transaction window 1 of 2, door G100C (type M) disagrees.
