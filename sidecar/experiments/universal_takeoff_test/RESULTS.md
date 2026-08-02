# Universal Takeoff Logic Test — Results

**Date:** July 15, 2026
**Test:** `run_test.py` on 4 UNMARKED bid sets (McLarty Mazda, Curtis MS Renovation, Hope Aquatic, Olathe Animal Care), scored against Martin's real Bluebeam markups (`markup_corpus.json`).
**Rule enforced:** universal logic only — no per-drawing tuning. Same code, same thresholds, all four jobs.

---

## Stage Results Across All Four Jobs

| Stage | McLarty | Curtis MS | Hope Aquatic | Olathe |
|---|---|---|---|---|
| Triage recall (find GT pages) | 1.00 | 0.56 | 0.79 | 0.81 |
| Mark tags found | SF-1..3 ✅ | 0 ❌ | 0 ❌ | CW-1, SF-1, GL-1..3 ✅ |
| Scale text found (pages) | 10/12 | 16/19 | **0/19** | **1/21** |
| Geometry precision | 0.036 | 0.028 | 0.010 | 0.011 |
| Geometry recall | 0.138 | 0.460 | 0.128 | 0.158 |
| Dim-verify precision | 0.000 | 0.021 | 0.009 | 0.016 |

## What the Numbers Say

**1. Text-only triage is decent but not sufficient (56–100%).**
Keyword rules find most glazing-relevant pages but misclassify sheet types
(Hope A3.1 pictorial door schedule was typed "elevation") and miss pages whose
relevance is graphical, not textual. → Triage needs a low-DPI vision pass, as
planned (Phase D pass 1). Text rules remain useful as a cheap pre-filter.

**2. Mark extraction works ONLY where the architect tags systems (2 of 4 jobs).**
McLarty and Olathe use SF-/CW-/GL- tags → found them all, universally.
Curtis and Hope don't tag with those conventions (frame types + door marks
instead). → Constraint extraction cannot assume a tagging convention; it must
also read schedules/legends semantically (vision), per the fallback hierarchy
in the constraint session notes.

**3. Scale text is NOT reliably extractable (0 pages on Hope, 1 on Olathe).**
Scale is often graphic (bar scales) or per-viewport. Any logic depending on
"read the scale string" fails universally. → Scale must come from calibration,
dimension-string-to-drawn-length ratios, or vision — never assumed from text.
This killed dimension verification in this test (precision ≤2%).

**4. Vector rectangle geometry is a weak proposer (1–4% precision, 13–46% recall).**
Confirms the McLarty finding on three more jobs: glazing is mostly NOT drawn
as rectangle primitives; it's assembled linework. Geometry-first discovery is
the wrong driver universally — not just on one job.

**5. Vision pass (Claude as the VLM layer) — the strong result.**
Blind test on Hope A3.1 (job where every text rule failed): reading the
unmarked sheet, the vision layer identified glazing scope with **9/9 agreement**
with Martin's actual markups on frame types (all Kawneer storefront frames in,
all HM frames out), correctly classified door types (aluminum storefront /
overhead glass doors in; wood/HM/coiling out, incl. glazing-only for HM frame
w/ glass lite), and independently identified the door schedule as the
constraint/quantity source — the same cross-referencing structure Martin's
qty text boxes encode.

**Miss:** hardware-set scope implications (Martin's yellow highlights on
"provided by aluminum storefront provider" hardware). Reading it isn't the
gap — knowing it's bid scope is. → implication engine (rules), Phase H.

**6. Second blind vision test — McLarty A3.2 (Exterior Door & Frame Schedule).**
Mixed-system page: PITCO storefront/curtain wall frames, HM doors w/ vision
lites, overhead/rolling/high-speed doors, louvers, closure trim.

*Agreements with Martin's markups:*
- Scope in/out matched on effectively every assembly: all PITCO glazed frames
  in; rolling door, Kytec spiral doors (polycarbonate vision panels), louvered
  HM doors, coiling counter doors out.
- HM-door vision lites correctly called "glazing only" (Martin's magenta) —
  frames 9, 12, 16, 29; frame 21 (glass in 16-ga HM frames) likewise.
- Caught GF-1 glass film note (frame 3) and anodized closure trim → break
  metal (Martin's blue markup).

*Misses — both classification knowledge, not vision:*
1. **SF vs CW inverted.** Vision guessed from panel size; truth was in the
   manufacturer system codes (PITCO TMW 450 = Martin's CW/green, TMS 114 =
   SF/orange). → needs a manufacturer/system knowledge base (PITCO, Kawneer,
   YKK... series → system class) + spec section cross-ref (08 41 13 vs
   08 44 13) as authoritative tiebreak. This is the "AI tradesman" knowledge
   layer, and it is buildable as data, not model training.
2. **Overhead sectional door lites** called glazing-only; Martin excludes
   (glazed by door supplier). → scope-boundary rule.
3. Martin also marks hardware tables and scope-relevant notes (curtain wall
   internal-reinforcing note) — same implication-engine gap as Hope test.

**Combined pattern from both blind tests:**
*Vision solves detection and geometry; trade knowledge solves classification;
rules solve scope boundaries.* All three are buildable now. Plan adjustment:
add a "System Knowledge Base" component (manufacturer series → system class,
scope-boundary conventions) feeding the VLM verification prompts and the
implication engine.

---

## Full-Workflow Blind Tests (Plan → Elevation → Details), McLarty

Martin's real workflow marks ALL glazing-relevant page types: floor plans for
location/counts, elevations for areas/measurement, details for substrate
awareness. Blind vision tests on each, unmarked vs Martin's markups:

**Floor plan (A1.2)** — required the zoom loop: full-sheet view insufficient,
300-DPI quadrant crops fully legible (foveation confirmed as a hard
requirement for plans).
- Hits: west facade exterior runs; south SF runs (tags 5/6a/6b/7/8);
  Consultation 105 all-glass cluster (marks 131–145); F&I/Flex glass fronts
  (103–105); Jewel Box. Frame tags on plan map 1:1 to A3.2 frame numbers —
  the cross-reference graph is explicit in the documents.
- Misses: north CW run at Service Advisors (hedged); Svc Mgr/Corridor interior
  glass; two small borrowed lites at Retail/Tech Parts.
- Workflow finding: Martin colors the mark hexagons themselves — the plan is
  the count/location layer of the takeoff.

**Elevations (A2.0)**
- Hits: CW at two-story showroom glass + north corner tower; SF at grade
  bands (south/west); east service side correctly clean (OH doors excluded).
- KEY FINDING: Martin color-codes the EXTERIOR MATERIALS LEGEND rows first
  (SF-1 green = TMW 450 curtain wall, SF-2 orange = TMS storefront, D-1/D-4
  orange, GF-1 yellow) — he builds the job's classification key from the
  legend, then applies it set-wide. Pipeline must do the same: bind legend
  facts BEFORE classifying openings. (My two elevation misses were failures
  to apply legend facts I had already read — D-3 'no glazing', D-6 solid.)
- McLarty has NO window schedule — legend + elevations carried the entire
  classification. Validates the fallback hierarchy: schedule → legend →
  elevation marks → flag unconstrained.

**Plan details (A4.2)**
- 6/6 agreement on SF details (titles 1–6 marked orange; all carry
  'STOREFRONT PER SCHEDULE'); CW correct in substance (I called 11–13, Martin
  flags governing detail 13 green).
- Workflow finding: Martin marks the DETAIL TITLE as the scope flag.
  Substrate info (shims, weather barrier, sealant, nailers, EIFS/ACM
  interfaces) is why details are in scope review at all.

**Verdict across all page types:** vision-led reading with legend-first
binding and zoom crops reproduces Martin's scope identification with high
agreement on every drawing type in the takeoff workflow. Remaining gaps are
consistently trade-knowledge/rules, never detection.

---

## Conclusions for the Implementation Plan

1. **Vision must lead, geometry must assist.** Plan Phase C/D (VLM crops +
   zoom loop) moves ahead of heavy geometry investment. The rules-based
   geometry engine remains as a measurement/localization assist once vision
   has said *what and where*, not as the discovery driver.
2. **Semantic schedule reading is the universal constraint source.** Tag-regex
   extraction is a fast path when tags exist (2/4 jobs), never the only path.
3. **Scale = calibration or inference, never text scraping.**
4. **Triage gets a vision pass at low DPI** — text keywords as pre-filter only.
5. **Implication rules are real scope** (hardware, glazing-only in HM frames)
   and are where 15 years of estimating shows up most. Highest-value place for
   Martin's expert-rule authoring.

## Artifacts

- `run_test.py` — the universal-rules test harness (reusable)
- `results/result_*.json` — per-job stage outputs, page by page
- Corpus ground truth: `sidecar/corpus/markup_corpus.json` (33 jobs, 11,146 annots)
