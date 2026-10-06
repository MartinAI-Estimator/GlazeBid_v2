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
