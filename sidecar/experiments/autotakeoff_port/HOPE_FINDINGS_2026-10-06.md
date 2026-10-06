# Hope Aquatic & Rec Center — second unseen set (2026-10-06)

BiLD Architects, 19 sheets, exterior-heavy: 451T storefront, 1600 curtain wall, translucent wall panels,
aluminum tube louvers. Run by Opus, 0 model calls in the engine.

## Scores (eval_v3, Martin's markups as a floor — he notes he doesn't mark 100%)
| set | first cold run | after this session |
|---|---|---|
| Hope | 4.3 % (sheets untitled, frame types unread) | **57.2 %** of 516 objects |
| Curtis (re-scored with rotation-corrected key) | — | **88.7 %** (was reported 82.1 %; key bug) |
| McLarty | — | 71.4 %; ledger 85/85 |
| Valvoline | — | 75.0 %; ledger 9/9 |

### Engine-only marks, sorted (sort_extras.py)
| set | matched Martin | engine-only, same item Martin marked elsewhere ("probable") | suspicious | on sheets Martin didn't mark |
|---|---|---|---|---|
| Hope | 448 | 346 | **31 (9 items)** | 0 |
| Curtis | 842 | 302 | **2 (1 item: G100C)** | 0 |
| Valvoline | 66 | 44 | 32 (7 items, all detail hits) | 21 |
| McLarty | 316 | 237 | 114 (40 items, mostly detail hits) | 220 |

## What broke on Hope and the generic fix
| broke | fix |
|---|---|
| Title block has no sheet title at all | sheet titles fall back to the drawing titles on the sheet ("FIRST FLOOR PLAN - AREA A"); untitled sheets read by every non-counting reader |
| "DOOR TYPES" / "HARDWARE SETS" sheets not seen as schedules | TYPES / HARDWARE SETS count as schedule titles |
| Captioned reader switched off when a stray pictorial entry existed; caption gap 19 pt > 18 | captioned reader always runs; strays filtered (grouped marks, detail bubbles, label boxes); gap 30 pt |
| Door schedule = MARK + HEAD/JAMB/SILL detail refs only | **detail references resolved to detail titles** ("6/A3.8" → "HEAD DETAIL - SF FRAME IN CMU"); title silent → the detail's own STOREFRONT/CW keywords. 53/59 door rows match Martin |
| Frame types labelled in text ("FRAME TYPE 6"), door types collide with frame tags (Door Type F vs frame F) | text type labels kept with their word ("FRAME TYPE 6", "DOOR TYPE F") |
| Exterior elevations titled "NORTHWEST ELEVATION" → whole job read as interior | compass / building elevations count as exterior |
| "W/ TRANSLUCENT WALL PANEL" not seen | translucent panel implied line item on those frames |
| Tube louvers (Martin: 44 Sun Control Polylengths) | **members.py**: callout names louvers/fins/sun shades → each tube (lone parallel line pair) measured; 31/44 matched, lengths 17'–27' like Martin's |
| Answer-key bug: Martin's annotation rects on 90°-rotated sheets were unrotated | key export multiplies by page.rotation_matrix (Curtis re-scored 88.7 %) |
| Grid bubble + general callout read as an 89' "frame H" | captioned frames over 60' wide / 40' tall dropped |
| McLarty type 2 replaced by a captioned "2" on A3.0 | schedule entries (table / pictorial) beat captioned labels of the same mark |
| General notes drawn everywhere | notes stay in the ledger; drawn only when they name a manufacturer/series (Valvoline "STOREFRONT DOORS TYPE A SHALL BE KAWNEER") |
| Detail markups never overlapped Martin's | detail number bubble is now marked (that's what he highlights); unnumbered notes/legend headings not drawn |

## Martin's Hope conventions (from 665 markups)
- Each opening Area on the exterior elevations, storefront strip and translucent panel above as separate Areas.
- Door schedule rows highlighted by system; frame-type captions highlighted; hardware sets highlighted (plain "Highlight").
- Detail number bubbles on detail sheets.
- Every louver tube measured (Sun Control Device Polylength).
- Break metal polylengths around openings / panel perimeters; "All Glass Wall Polylength" tool used along the aluminum canopy (A4.1/A4.2, 28 marks) — confirm what that represents.

## Still open
- Break metal (≈56 polylengths), canopy (28), translucent panels with sloped tops (no closed rect), plan Polylengths, about half the elevation Areas.
- A102–A104: HM-frame doors Martin marked Glazing Only — nothing in the schedule says the leaf has glass (flag).
- Hope suspicious list (9 items) for Martin to confirm.

## Follow-ups with Martin (2026-10-06)
- **Marked PDF misplaced on rotated sheets** (10 of 19 Hope sheets, 21 of 75 Valvoline, 1 Curtis): markup_writer now maps engine (as-viewed) coordinates through page.derotation_matrix; read_back maps them forward. Scores were unaffected (scored before writing).
- **Canopy "All Glass Wall Polylength" (28)** = break metal; Martin used the wrong tool. Key relabelled.
- **A102–A104 Glazing Only** — answered by Martin: the plan door tag carries door type | frame type | hardware set ("A103 / A | 11 | 15"); frame type 11 = HM frame with 1/4" clear glass. New `door_tags.py` reads the cells (dividers inside the tag; wall lines behind it ignored); the frame-type position is found by matching values to the FRAME TYPE n entries (no legend). Frame type text is added to the door row before classifying; a frame type with no tag of its own is counted from the door tags naming it. Result: A102/A103/A104 Glazing Only, plus **A107A** (frame 11, Martin's plan shows its sidelite purple but the schedule row isn't highlighted — probable miss); FRAME TYPE 11 qty 4. Other three sets unchanged.
- **Glass guardrail**: found on A5.13 (det 1, 4, 5); missed A2.19 callout + 94'-7" run, A2.2B run, A5.13 det 2. Needs callout → leader → measured line (same machinery as break metal).

## Break metal (first pass, 2026-10-06)
- Martin's rule: **break metal is driven purely off details — if a detail shows it and it touches our system, we pick it up.** **Sill flashing is always ours when shown** (masons never pick it up).
- `breakmetal.py`: details whose callouts name break/brake metal, metal or aluminum flashing/trim/wrap at SF / CW / translucent (not cavity/thru-wall, roofing, by others); title → edge (head / sill / jamb incl. wrap, between, corner); callouts highlighted; named edges of each frame on the exterior elevations → Break Metal polylengths, merged per line.
- Hope 57.2 % → 66.5 %; break metal 60/88 (all 6 callouts, 54/59 elevation runs). Engine total 1,544 LF vs Martin 1,665 LF. Engine's F-window sills are correct per the rule (Martin missed them in the rush).
- Valvoline: aluminum sill flashing callout now found; engine's ~116 LF on elevations is scope Martin missed (confirmed).
- Next: plan column wraps (23 boxes on A2.2A/B), full-height piers (needs sloped translucent panels), and limiting HEAD details to the openings they're cut through (section markers on the elevations) instead of every frame of the system.

## Translucent panels + break metal by detail marker (2026-10-06, later)
- **Translucent panels** (`translucent.py`): not tagged like storefront — found from the elevation note ("TRANSLUCENT PANEL SYSTEM") → shoulder → leader arrow tips → rib pattern (rib = tight line pair ≈0.5 pt; frame = pair ≈1.4 pt or a line running past the ribs; ribs stitched across horizontal breaks; tags/leaders bridged) → every rib run in that row standing on the same (possibly sloped) bottom line = a bay → sloped polygon to the outside of the frame. Hope: 28 bays, ≈3,810 sf; A4.1 upper 156.5/184.1/210.4/237.5 sf vs Martin 156.4/183.5/210.5/237.1; A4.2 lower 7 × 143.7 = Martin's 143.7. 26 of Martin's 28 elevation areas found. Not measured (flagged): the A4.2 panel behind the tube louvers (Martin 1,205 sf), the right end of X, bay Y.
- **Break metal by detail marker**: markers on the window-type sheets (A3.2–A3.5, "4" over "A3.10") tie each detail to the frame types it's cut through (4/A3.9 → F jambs; 8/A3.9 head → N only; translucent wraps → A–D, E, P …). Elevation frames get only their types' edges; sets without markers fall back to every frame of the system. Translucent bays get the translucent details' edges → full-height piers. Hope: 1,458 LF (was 1,953); 60/88 of Martin's break metal marks; precision 72/138 (was 77/178).
- **Pier wraps**: one per pier along each run of translucent bays (thin mullions < 0.8' excluded) → 33 EA on Hope vs Martin's 23 boxes on the plans — flagged, needs Martin's check.
- Hope 66.5 % → 69.2 %. Curtis / McLarty / Valvoline unchanged.
