# GlazeBid Autonomous Takeoff — Current Standing + Interview Bank
*2026-10-03 · read directly from the live tree (`feature/frame-builder-v1`) and `OneDrive\Arch Drawing Markups`*

Goal: drop a drawing-set PDF in, get back a complete glazing scope takeoff with every glazing item found, classified, quantified and cited.

---

## Part 1 — Where it actually stands today

### What exists and works
| Piece | Where | State |
|---|---|---|
| Vision pipeline (classify → legend → elevations → schedules → assemble) | `sidecar/glazierai/modules/drawing_intelligence/` | Runs end to end. **Legend is now Step 2**, and **all schedule sheets are read** (both fixed after the Sept 17 audit). |
| Geometry anchoring (tag → box on the sheet) | `geometry_anchoring.py` | Built; turns each mark into a `bbox` + page. |
| Box & Snap (estimator draws a box, AI finds frames + bays/rows inside) | `/drawing-intelligence/run-region`, `useRegionTakeoff.js`, `useBoxSnapTool.ts` | Built, wired into Builder and Studio. |
| Your Bluebeam ground truth | `sidecar/corpus/bluebeam_markup_extractor.py` → `markup_corpus.json` | 33 jobs, 11,146 markups. |
| Scorer | `sidecar/qaqc/eval_harness.py`, `takeoff_to_candidates.py`, `run-vision-baseline.bat` | Built. |
| Scope color / subject map | `glazebid_scope_colors.py` | 17 scope types mapped to your Bluebeam subjects. |
| Trade knowledge base | `sidecar/knowledge/system_knowledge_base.json` | 9 scope-boundary rules + series→class table (PITCO, Kawneer, Tubelite, OBE). |
| Bluebeam import (Smart Scan) | `apps/builder/src/utils/bluebeamParser.js`, `pdfAnnotationParser.js` | Reads markups from a PDF into frames. |

### Why it does not "find all glazing scope" yet
1. **Never measured.** `run-vision-baseline.bat` was written Sept 18 and never run — there is no `result_vision_*.json`. The only scored row is the July geometry baseline (det-P 0.016 / det-R 0.165).
2. **Half the set is ignored.** The classifier routes sheets to 7 steps, but the router only processes legend, elevations and exterior schedules. **Interior schedules (step 5), floor plans (step 6) and details (step 7) are classified and then dropped.** That is where interior storefront, glazing-only lites in HM doors, all-glass walls, mirrors and borrowed lites live — e.g. Curtis MS is ~80% interior, Olathe has 100+ glazing-only marks on plans/interior elevations.
3. **The knowledge base isn't used.** No pipeline code reads `system_knowledge_base.json`. The PITCO TMW 450 = CW lesson and the overhead-door exclusion are written down but never fed to the model.
4. **One look per sheet.** Each sheet goes to the model as a single image, clamped in resolution on E-size sheets. The zoom loop (Phase D) that made the floor-plan blind test work was never built.
5. **Only frames, not the rest of your takeoff.** Your markups also carry doors, break metal, sun shades, translucent panels, handrails, caulking counts, WL-DL clips, hardware notes, exclusions. The pipeline's output has no slot for most of these.
6. **No markup back into the PDF.** Phase E (write your Bluebeam subjects/colors back into the set) does not exist, so you can't review the result the way you review your own work.
7. **Hand-off loses the frame.** "Run AI Takeoff" makes Builder system cards with width × height and quantity 1 per mark; no bays/rows, no Frame Builder v1 `hydrateFrame`. The Bluebeam Smart Scan uses its own 4-system regex, not the canonical subject map.
8. **Test data is thin and partly unreadable.** Only 4 of ~14 paired jobs (marked + blank) are wired into the scorer. Most PDFs in `Drawing Sets\` and `New Drawings Sets\` are OneDrive cloud-only right now. Olathe appears in the corpus twice (same 1,011 markups), and ~40% of its markups are Brian's (`bmcginness`).
9. **Still not backed up.** All of the drawing-intelligence changes above are uncommitted on `feature/frame-builder-v1`, and that branch isn't pushed.

### Test material on disk
- **Marked by you (ground truth):** 33 sets in `Newest Drawings Marked\` (+ duplicates in `Drawing Sets Marked up\`).
- **Paired blank sets (score directly):** Curtis MS, Hope Aquatic, McLarty Mazda, Olathe (in `New Drawings Sets\`); BOA Citadel, Brighton, Dick's, McLaughlin, Panda Express, Salvation Army, Tabor BEC, Tricity, Valvoline (in `Drawing Sets\` as "Orig").
- **Blank with no markup (true blind tests):** BOA Broomfield, Chipotle Fountain, Commerce Bldg 1–3, Tierra Encantada, Greenwood Elementary, Floor Plan Training (has a marked twin).

---

## Part 2 — Interview bank
Answer in any order. Short answers are fine. "Depends" is a fine answer if you say what it depends on.

### A. What "done" looks like
1. When the takeoff finishes, what do you want to open first: a marked-up PDF, a scope list, system cards in Builder, or Frame Builder frames?
2. Is the first goal "find every glazing item and classify it" (scope ID) or "scope ID + quantities you'd price from"?
3. What is "complete"? List every line item you'd expect on a finished takeoff for a typical job.
4. What miss rate can you live with on a first release? (e.g. misses 1 in 20 items, but always flags what it wasn't sure of)
5. What's worse for you: a missed item or a false item?
6. How long is acceptable for a 20-sheet set? 60-sheet set?
7. How much API spend per set is acceptable?
8. Who reviews the result — always you, or could a junior estimator review it?
9. What does the review step look like in your head: accept/reject each item, or edit a markup set?
10. Should AI-found items be visually different from your own markups (author, color, layer)?

### B. What comes in the door
11. Do bid sets arrive as one combined PDF or separate files per discipline?
12. How often is a set scanned (no vector lines)?
13. Do specs come in the same PDF as drawings, or always separate?
14. How do addenda arrive — revised sheets, full re-issue, narrative only? Should the takeoff re-run on addenda?
15. Do you get Revit/CAD files ever, or only PDF?
16. Which sheet disciplines can hold glazing scope besides A-sheets? (ID interiors, S for embeds, civil for site/bus shelters?)
17. Sheet sizes you see most (24×36, 30×42, 36×48)?
18. Should the tool split the set (arch/structural vs MEP) itself, or do you upload only the arch pages?

### C. How you read a set (order of operations)
19. Walk me through your first 10 minutes on a new set, sheet by sheet.
20. Do you always find the legend/materials schedule first, like McLarty A2.0?
21. When there is no legend and no window schedule, what is your key?
22. When do you open specs vs drawings — before, during, after?
23. Do you mark the floor plans first or the elevations first? Why?
24. Which sheets do you skip entirely without opening?
25. Which sheets do you skim but don't mark?
26. On a typical set, which single sheet type gives you the most scope?
27. How do you make sure you didn't miss an opening — do you cross-check plan count vs elevation count?
28. How do you handle a sheet with both elevations and a schedule on it?

### D. Your Bluebeam tool chest — what each markup means
29. **Qty Text Box** — the content is things like `1 Thus`, `F Thus`, `SF1`, `SF14S`, `INT25`, `E4`, `SAB`, `2INTA`, `B112B`. What does each pattern mean? What is "Thus"?
30. Are the Qty Text Box letters/numbers your frame type IDs, the architect's marks, or room/door numbers?
31. What do the N/S/E/W suffixes mean (`SF1N`, `SF11W`)?
32. **Highlight vs Area vs Polylength vs Line vs Count** for the same system — when do you use each?
33. Do the **Area** markups (W/H/A) feed pricing, or are they a check against the schedule size?
34. **Length Measurement** — what are you measuring (frame width, run length, head height)?
35. **Excluded by Binswanger** (red polygons) — what triggers it, and should AI output exclusions too?
36. **Legend** stamps — what are these on the page?
37. **Glazing ONLY Door / Aluminum Stile Door / Ext SF Door / Int SF Door** (circles) — counted per leaf or per opening?
38. **SSG Caulk Count / Polished Edge Count / HM Lite Counts / WL-DL Clip / Windload–Deadload** — what quantity does each produce, and which are scope vs pricing notes?
39. **Break Metal Flashing & Trims** — when is break metal yours vs by others?
40. **Floor Line Fire Caulking** — always yours when it appears?
41. **Typewritten Text** (LH/RH, BUTT JOINT, EXTENDED CAP) — what are these notes for?
42. Are there tools in your chest you use that aren't in `glazebid_scope_colors.py`?
43. Which markups are "scope found" and which are "working notes"? (The scorer needs to know what to count.)

### E. Scope in / out (boundaries)
44. Hollow metal frames with glass: glass only, always? Even fire-rated glass?
45. Wood doors with vision lites: who glazes?
46. Overhead/sectional door lites: always excluded (rule says yes — confirm no exceptions).
47. Aluminum storefront doors: you furnish doors + frames + hardware? Which hardware is yours by default?
48. Auto sliding / revolving doors: in scope, subbed out, or excluded?
49. All-glass entrances (patch fittings): yours?
50. Interior aluminum frames (e.g. Rapid/RACO/Western Integrated) — storefront scope or by others?
51. Transaction / drive-through windows — always in?
52. Bullet-resistant glazing — in, or flagged?
53. Skylights — unit skylights vs framed: which are yours?
54. Louvers in storefront/CW: yours?
55. Spandrel and metal panel infills in CW: yours?
56. Shower doors and mirrors: in/out rules beyond the Bobrick rule?
57. Glass handrails/guards — confirm the aluminum vs welded steel rule.
58. Fire-rated glazing in HM — glass only? Fire-rated storefront — yours?
59. Sun shades/fins: integral to CW vs standalone — who owns the standalone ones?
60. Translucent panels — always in (rule says yes).
61. Glass film — always in when called out?
62. Display cases, glass shelving, back-painted glass, markerboards?
63. Canopies with glass?
64. Existing-to-remain glazing on renovations — how do you treat "EX"?
65. Anything that's in scope for Binswanger but usually not for other glaziers (or the reverse)?
66. What's on your standard exclusions list?

### F. Classification (what system is it?)
67. Order of trust when deciding SF vs CW: spec section, legend, series code, details, size?
68. If no series is named, how do you call SF vs CW from the drawings?
69. Window wall — separate class, or rolled into SF/CW?
70. Ext vs Int: how do you call a storefront in an interior vestibule? At an exterior wall but inside a canopy?
71. Fixed/operable aluminum windows (08 51 13) — separate system card always?
72. When is a frame "SSG CW" vs "Cap CW"?
73. Any series you see often that should be added to the knowledge base now? (List as many as you can.)
74. How do you decide "All Glass Wall" vs "Int SF"?
75. Fire-rated SF vs fire-rated glazing only — how do you tell on drawings?

### G. Quantities and measurement
76. For each storefront/CW frame, what quantities do you need: width, height, bays, rows, door count, SF, LF of perimeter?
77. Where do the sizes come from, in order: schedule dims, elevation dims, scaled?
78. EQ-spaced bays: how do you compute actual widths?
79. "AS SCHED." heights with no schedule height: what do you assume?
80. Scale: per viewport or per sheet? Do you trust graphic bar scales?
81. Do you ever measure on plans for widths, or only elevations?
82. How do you count typical frames repeated on multiple elevations (e.g. "SF14 ×6")?
83. Doors: what do you capture per door (size, single/pair, hardware set)?
84. Glass: do you need a glass type per lite at takeoff stage, or later?
85. Caulking/sealant: measured at takeoff or derived from frame perimeters?
86. Break metal: measured LF at takeoff?

### H. Cross-referencing and conflicts
87. Schedule says one size, elevation dims say another — who wins?
88. Plan shows a tag that's not on any schedule/elevation — what do you do?
89. Spec lists a system the drawings never show — flag or ignore?
90. Drawings show a system the spec doesn't cover — flag or ignore?
91. What goes to RFI vs what you just assume and note in the proposal?
92. Should the tool draft RFIs/clarifications from conflicts, like the Spec Reader does?

### I. Implied scope (not drawn, but you price it)
93. List the items you add from experience that are never highlighted (e.g. shims, sill pans, receptors, steel reinforcing, blocking notes).
94. When a note says "provide internal reinforcing at CW" — line item, or a pricing adder?
95. Hardware "by storefront provider" — how is it carried into the bid?
96. Mock-ups, testing, engineering, shop drawings — added every job?
97. What details tell you the substrate (EIFS, ACM, brick) and why does it matter at takeoff stage?

### J. Your markups as ground truth
98. Which of the 33 marked sets do you trust most as "this is exactly right"?
99. Which ones are rough or incomplete and should be left out of scoring?
100. Olathe: ~400 of the markups are Brian's. Count his as ground truth, or only yours?
101. "Olathe … Bid Set BRIAN" and "Olathe … 100% DD" have identical markups — same job, drop one?
102. Did you ever mark only part of a set (e.g. only exterior) because the rest was excluded by bid scope?
103. Do you mark every instance, or one per type plus a Qty Text Box?
104. Are the marked sets the final bid version, or before addenda?
105. For the jobs we have, do you also have the final Excel bid/PO (like Hope, Olathe, Highlands in `Excel Samples`)? Those would let us score quantities, not just locations.

### K. Output and hand-off
106. Should the AI write Bluebeam-compatible markups back into the PDF with your exact subjects/colors?
107. Should the output open in GlazeBid's PDF viewer, in Bluebeam, or both?
108. Should each found frame land in Frame Builder v1 as an editable frame (bays/rows), or as a system-card row first?
109. One system card per scope type, or per frame type/mark?
110. What should "needs review" look like — a list, a color, a separate layer?
111. Should the takeoff also produce the "General Elevation" / "Glass Block Size" style reports you have in `Excel Samples`?

### L. Engineering decisions
112. Cloud vision (Claude) required — OK to assume an internet connection and API key?
113. Is drawing data leaving your machine OK with your employer and the architects/GCs?
114. Model preference: best accuracy regardless of cost, or capped cost per set?
115. Should runs be cached so re-opening a set costs nothing?
116. Commit and push all drawing-intelligence work now (yes/no)?
117. OK to make OneDrive keep the test sets "always on this device"?

### M. Testing plan
118. Which 3 jobs should be the "must pass" acceptance set?
119. Which blank-only sets should be saved as true blind tests (never looked at while building)?
120. What score on the acceptance set means "ship it to the first ten shops"?
121. Do you want to sit through a visual review after each run, or only at milestones?

*More questions will be added as answers come in.*

---

## Part 3 — Answers log (Martin, 2026-10-03)

### Round 1 — goals
- **First output:** a marked-up PDF in his Bluebeam subjects/colors, with a scope list beside it.
- **First release must:** find and classify all scope, with counts. Sizes come second.
- **Missed item vs false item:** equally bad, so confidence flags matter in both directions.
- **"Thus" in a Qty Text Box** = quantity of that type ("4 Thus" = 4 of this type).

### Round 2 — workflow / ground truth
- **Reading order:** specs first (his separate Spec Reader, to be incorporated), then schedules, then floor plans, then elevations (to compare), then details. → The pipeline must change from legend → elevations → schedules to specs → schedules → plans → elevations → details.
- **Marks every instance**, not one per type.
- **Brian's markups** count as ground truth (same standard).
- **AI should mark exclusions too** (red "Excluded by Binswanger").

### Round 3 — scope boundaries
- **In scope:** auto sliding doors and unit skylights (both **pass-thru items**: carried in the number, done by a hired sub), all-glass entrances, interior aluminum frames, bullet-resistant glass, louvers in SF/CW, shower doors, back-painted glass.
- **Wood doors with vision lites:** we glaze them (glazing only).
- **Fire-rated glass in HM:** in scope, glass only.

### Round 4 — classification
- **SF vs CW with no series:** height / spans floors, head and sill details, legend or keynote text, plus cross-referencing and industry knowledge.
- **When sources disagree:** legend and details win, but always flag it.
- **Ext vs Int:** architect's label first; otherwise, touches outside air = Ext.
- **Window wall:** its own class (new scope type, not in `glazebid_scope_colors.py` yet).

### Round 5 — markups and quantities
- **Markups on one frame:** plan highlight + Qty box, elevation Area (W/H/SF), elevation highlight, and the schedule row highlighted. All four.
- **Size source:** all three (schedule, elevation dims, measured) have been used. The tool should carry whichever exists and say which one it used.
- **N/S/E/W suffix:** both a building/wing and his own frame number, depending on the job.
- **Qty codes** (INT25, E4, SAB, 2INTA): a mix of the architect's marks and his own IDs, specific to each job. The Qty box is mostly the type tag, sometimes with a count.

### Round 6 — AI labels and counts
- **AI Qty box text:** architect's mark + count (e.g. "SF-1 — 4 Thus").
- **Counting:** every instance; the plan count is the truth.
- **Area markup:** on every glazed frame on the elevations.

### Round 7 — implied scope
- **All of these in v1:** break metal/flashing, hardware by SF provider, scope notes, sun shades/fins, floor-line fire caulk, WL-DL clips, SSG caulk / polished edges, glass film.
- **Break metal:** ours when it touches our frame.
- **RFIs:** yes, draft RFIs for conflicts, like the Spec Reader does.

### Round 8 — output
- **Review in:** GlazeBid only (not Bluebeam).
- **Hand-off:** both — system cards, with each frame linked into Frame Builder v1.
- **Cloud vision:** fine.
- **Cost:** accuracy first; optimize later.

### Round 9 — testing
- **Acceptance set:** McLarty Mazda, Curtis MS, Hope Aquatic.
- **Marked sets:** all 33 are complete; small counts just mean small jobs.
- **Blind sets held back:** Commerce 1–3, Chipotle, Tierra Encantada, Greenwood, BOA Broomfield.
- **Backup:** commit + push. Committed locally as `bc2d36b`; push needs Martin's GitHub login (run `push-glazebid.bat`).

### Round 10 — plans, details, hardware
- **Spotting glazing on plans:** glass line symbol, window/frame tag, door tag → door type, wall type. **Watch for vinyl windows, which are drawn the same way.** Always cross-reference with the schedule or details, whichever exists.
- **Interior elevations** sometimes hold scope that isn't on the floor plan.
- **Details:** mark the detail title, the break metal drawn in it, and anchors/clips.
- **Hardware on SF doors:** all of it, pulled from specs. Default to included, with an option to uncheck.

### Round 11 — windows, renovation, alternates
- **Vinyl, fiberglass and wood/clad windows: out. Aluminum windows: in.**
- **Existing / EX glazing:** flag for review.
- **Demo of existing glazing:** only ours when the GC specifically asks.
- **Alternates / phases:** tag each item as base, alt #, or phase.

### Round 12 — measuring and uncertainty
- **Scale:** check the stated scale against a dimension; use the dims if they disagree.
- **Bays and rows:** both needed at takeoff, finalized in Frame Builder.
- **Per door:** single/pair, size, hardware set #, stile type, **swing from the floor plan**.
- **Unsure items:** mark them with a yellow "needs review" flag and the reason.

### Round 13 — specs, learning, users
- **Spec → takeoff hand-off:** on hold; Martin is building it separately.
- **No specs:** run anyway and flag it.
- **Learning:** log every accept/reject/edit as training and eval data.
- **Subject names:** Martin's tool chest is the standard for everyone (Brian uses the same toolbox).

### Round 14 — pass-thru, window wall, toolbox
- **Pass-thru items** (auto sliders, skylights) are their own scope type, tagged as sub-quoted.
- **"Ext WW" = WINDOW WALL**, not wet wall. `glazebid_scope_colors.py` is wrong and must be fixed.
- **Toolbox found:** `%APPDATA%\Bluebeam Software\Revu\21\Estimating ToolBox.btx` (Dec 18 2025). Copied to `reference/bluebeam/`, and all 243 tools were decoded to `estimating_toolbox.json` (subject, annotation type, stroke/fill color, opacity). That file now becomes the source of truth for subjects and colors.
  - **Window wall:** `#008080` teal (Ext WW Area / Highlight / Polylength / Line).
  - **Break Metal also uses `#008080`.** Same color as window wall; tell them apart by subject, never by color.
  - **Tools in the chest but not in the scope map:** Revolving Door, Terrace Door, Aluminum Door Frame Only, General Note, Structural Steel, Architect, SF Frames (count), Interior Aluminum Partition Doors, Fire Rated Door Lite's, Glazing Only Door's (count), and the legend blocks (Rectangle + Line + Text Box per color).
- **Timeline:** none. "I want it running and workable, so let's get it correct."

---

## Part 4 — What the answers change (target design)

**Pipeline order (matches how Martin reads a set):**
0. Spec Reader output (when available) → approved systems, sections in scope. Run anyway with a flag when there are no specs.
1. Classify every sheet.
2. **Schedules** (door, window, frame types, hardware sets): every schedule sheet, exterior *and* interior (step 5 is ignored today).
3. **Legend / materials key**: system codes → scope type, using the knowledge base (series → class) and Martin's in/out rules.
4. **Floor plans** (step 6 is ignored today): find every opening — door tags, window tags, glass lines, glazed wall types. Zoom loop on high-res tiles. **The plan count is the truth.** Capture door swing.
5. **Elevations**: compare against the plans; W/H/SF, bays × rows; scale checked against dimension strings.
6. **Interior elevations / enlarged plans**: mirrors, back-painted glass, shower doors, borrowed lites.
7. **Details** (step 7 is ignored today): detail titles by system, break metal touching our frame, anchors/clips, CW vs SF evidence.
8. **Implied scope + notes**: hardware by SF provider, scope notes, floor-line fire caulk, WL-DL, SSG caulk / polished edges, glass film, sun shades.
9. **Cross-check + conflicts**: plan vs elevation vs schedule counts, legend vs details on system type → yellow review flags + RFI drafts.
10. **Exclusions**: overhead doors, HM/wood frames, vinyl/fiberglass/wood windows, Bobrick mirrors, etc. → red "Excluded by Binswanger". EX/existing → yellow flag.

**Output:**
- Markups written with the exact subjects/colors from `Estimating ToolBox.btx`, author "GlazeBid AiQ".
  - Plan: highlight + door circle + Qty box ("SF-1 — 4 Thus").
  - Elevation: Area (W/H/SF) on every glazed frame, plus highlight.
  - Schedule: row highlight. Details: title highlight.
- Each item carries base / alt / phase, its source sheets, its confidence, and why.
- Reviewed in GlazeBid. Accepted items → system cards, each frame linked into Frame Builder v1 (bays/rows prefilled).
- Every accept/reject/edit is logged.

**Scoring:**
- Acceptance set: McLarty, Curtis, Hope. All 33 corpus jobs (Olathe de-duplicated, Brian included) used for development.
- Blind: Commerce 1–3, Chipotle, Tierra, Greenwood, BOA Broomfield. Never opened while building.
- Metrics per scope type: did we find the item (instance recall/precision on plans + elevations), classify it right, and count it right.

## Part 5 — Round 15 answers (2026-10-03, later)
- **Manufacturers: Kawneer and Tubelite only.** The classifier's series list comes from Frame Builder's `SYSTEM_LIBRARY` (one source, no duplicate table). Confirmed:
  - **Storefront (SF):** Trifab 450 / 451 / 451T / 451UT / 601 / 601T / 601UT, IR 501T; Tubelite 4500, E/T/TU14000, E/T/TU24650, T34000 IR.
  - **Curtain wall (CW):** Kawneer 1600 / 1600UT; Tubelite 400 / 200.
  - **SSG curtain wall:** Kawneer 1620 SSG.
- **Window wall is missing** from both the library and the classifier. Its Kawneer and Tubelite series still need to be added.
- **Other manufacturers named on drawings** (YKK, EFCO, Oldcastle, Arcadia, US Aluminum): map to the nearest Kawneer/Tubelite equivalent, keep the original name, and flag it.
- **Glass:** the takeoff captures the **glass legend makeup** for each glass type (IGU, coatings, thickness), so Frame Builder can produce the glass-size takeoff for the quote.
- **No glass type shown:** default to exterior 1" IGU, interior 1/4" tempered.
- **Exclusions:** list to be uploaded later.
- **Architects:** every architect is different, so the logic must be universal; no per-architect tuning. Clean (vector) PDFs are the priority; scans come later.
- **"General Note" and "Architect" markups:** ignore them, for both ground truth and output.

## Part 6 — Still open
- Window wall series names for Kawneer and Tubelite.
- Exclusions list (Martin to upload).
