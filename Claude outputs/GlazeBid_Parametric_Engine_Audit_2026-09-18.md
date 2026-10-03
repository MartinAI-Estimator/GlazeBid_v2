# GlazeBid Parametric Engine — Money Bridge Audit

**Date:** 2026-09-18
**Scope:** `laborCalcEngine.js`, `ParametricFrameBuilder.jsx`, `useBidMath.js`, `useBidStore.js`, `computeBOM.js`, `@glazebid/frame-engine` (bomResolver / fabricationRules / archetypes / panelLayout), Studio `systemEngine.ts`, `pricingLogic.js`, `StudioInbox.jsx`, and your `PARTNERPAK_FRAME_BUILD_MODEL.md` / `PARTNERPAK_DAT_FORMAT.md`
**Source:** live working tree on `martin-dell`, read-only. No code changed.

---

## The finding that reorders everything else

**Material dollars are not computed from the BOM. Anywhere.**

`useBidMath.js:171`:
```js
// Materials: straight sum of vendor quote lump sums
const totalMaterialCost = vendorQuotes.reduce((s, q) => s + (q.amount || 0), 0);
```

Every cut list, glass schedule, and aluminum LF total in the app is computed, displayed, exported for RFQ — and then **never priced**. The estimator gets a number from the Kawneer rep and the glass fabricator and types it in. `bomResolver.buildBOMLines()` confirms it structurally: `listPrice: 0, // Would be filled by price book integration` and `extCost: 0`.

That's a legitimate shop workflow. It is not PartnerPak's workflow. PartnerPak prices the bid from a die-level BOM against a manufacturer price book. So "bring the frame builder up to PartnerPak" is not a refinement of the current pipeline — it's adding a pricing architecture the current pipeline doesn't have a slot for. Everything below should be read with that in mind: the geometry gaps are real, but closing them produces a *better RFQ*, not a *priced bid*, until the price-book layer exists.

---

## 0. Map: four geometry engines, one labor engine, two frame builders

Before the five questions — you need to know there isn't one parametric engine.

| # | Engine | Location | Who calls it | Reaches the bid $? |
|---|---|---|---|---|
| G1 | `computeFabricationBOM()` | `apps/builder/src/engine/computeBOM.js` | `shopDrawingGenerator.js`, `FormulaReferenceTab` | No |
| G2 | `computeFabricationBOM()` | `apps/studio/src/engine/parametric/systemEngine.ts` | Studio FrameType library / bomGenerator | No (Studio side) |
| G3 | `resolveFrameBOM()` → `computeFabricationCutList()` | `packages/frame-engine/src/{bomResolver,fabricationRules}` | `useFrameBuilderStore` → **`FrameBuilder.jsx` module** | **No** — `useFrameBuilderStore` imports `useBidStore` but the module has its own groups/frames; nothing pushes to `useBidStore.frames` |
| G4 | inline `calc` useMemo | `apps/builder/src/components/BidSheet/ParametricFrameBuilder.jsx:1210–1340` | **`handleSave` → `useBidStore.addFrame`** | **Yes — this is the only one** |
| L1 | `calcFrameMH()` | `apps/builder/src/utils/laborCalcEngine.js` | G1, G4, `useBidStore.calcTotals`, workspace panels | Yes (labor $) |

G1's own header says it *"re-implements the same BOM computation logic"* as G2 because Vite can't import across apps. G3 is the 4,000-LOC "proper" package. G4 — the one that actually feeds the bid — is a 130-line `useMemo` inside a 2,300-line React component that imports **none** of the other three.

The Aug 2 consolidation (`DEVELOPMENT_BACKLOG.md` item 1) genuinely unified **labor** onto L1 — every engine now delegates hours to `calcFrameMH`, and that engine is a faithful line-by-line port of the Warren Bid Sheet Excel formulas. That part is solid. Geometry was never consolidated.

And there are **two frame-builder UIs**: `BidSheet/ParametricFrameBuilder.jsx` (G4, feeds the bid, no material pricing) and `FrameBuilder/FrameBuilder.jsx` (G3, has per-pound pricing in `MetalMaterialList.jsx`, doesn't feed the bid). The one that prices doesn't feed the bid; the one that feeds the bid doesn't price.

---

## 1. The Intake Contract

### What each engine expects

**G4 — the live money path** (`useBidStore` BidFrame, `useBidStore.js:9–14`):
```js
{
  frameId, elevationTag, systemType,          // systemType is a DISPLAY STRING: 'Storefront 2×4.5'
  quantity,
  inputs: { width, height, bays, rows, glassBite, mullionSightline,
            headSightline, sillSightline, systemName, shapeMode,
            leftLegHeight?, rightLegHeight?, sillStepUps?, geometry: {…} },
  bom:    { totalAluminumLF, totalGlassSqFt, glassLitesCount,
            shopHours, distHours, fieldHours, totalLaborHours,
            cutList: [{ part:'Vertical'|'Horizontal'|…, qty, lengthInches, note }],
            glassSizes: { glassType, widthInches, heightInches, qty },
            transomGlass?, door? }
}
```
Rough opening: `inputs.width/height` are **frame OD in decimal inches**; there is no RO vs. frame-size distinction and no shim/clearance field (PartnerPak has "Include RO" toggle + shims). Glass type: a **free-text label** (`'GL-1 (1" Low-E)'`), not a spec ID. Grid: `bays × rows` integers, plus `bayHorizontals` (per-bay horizontal positions — the one irregular-grid concession).

**G3 — frame-engine** (`ResolveFrameBOMParams`, `bomResolver/index.ts:59`): the richest contract — `widthInches, heightInches, bays, rows, bayTypes[] ('glazing'|'door-single'|'door-pair'), vendorSystemId, altVendor1Id, finishType, finishMultiplier, glassBiteOverride, stockLengthFt (21|24), glassSpecId, pricePerSqFt, fabricationRulesOverride`. Real IDs, real enums. Not connected to the bid.

**L1 — labor** (`calcFrameMH(frame, hf, ir, beadsOfCaulk, systemType)`): count-driven. Wants `bays, rows, panels (=DLO count), doors/pairs/singles, joints, perimeter (LF), subsills, gtBays, gtDlos, vents, ssg, steel, brakeMetal, stoolTrim, ft, wlDl` and a canonical `systemType`. It computes nothing geometric; it multiplies counts by rates.

### Piping `TakeoffResult` in

Today the landing point is `StudioInbox.jsx:33–50` ("+ Bid"):
```js
inputs: { width: g.widthInches, height: g.heightInches, bays: 1, rows: 1, glassBite: 0.75, sightline: 2 },
bom:    { totalAluminumLF: (2 * (g.widthInches + g.heightInches) / 12) * g.qty, … }
```
**Every takeoff becomes a 1×1 frame with hardcoded bite/sightline and a perimeter-only aluminum figure.** Your backlog already names this ("Replace naive perimeter BOM in StudioInbox"). This is exactly where a `TakeoffResult` detection would land, and it would throw away the two fields that matter most.

What `TakeoffResult` carries vs. what G4 needs:

| Field | TakeoffResult has it? | G4 needs it | Bridge |
|---|---|---|---|
| width / height (inches) | via `bbox` × calibration | ✅ | trivial — Studio already does this at confirm |
| system type | `system_type` canonical (`Ext SF`…) | display string `'Storefront 2×4.5'` | needs `canonical → systemProfile` lookup; **G4 keys its geometry off the profile name, not the canonical type** |
| bays / rows | `bay_count` (vision) — **not** in `detections[]` today; `MarkEntry` has no bay/row | ✅ required | vision knows it (`elevation_reader` reads "bays × rows if visible"); anchoring drops it. One-line add to `AnchoredDetection`. |
| mark | `mark` | `elevationTag` | direct |
| glass type | not detected | free-text | default from system profile; legend has `glazing` spec per system code — mappable |
| sightline / bite | not detected | `sysSL`, `sysBite` from `SYSTEM_GEOMETRY_CATALOG` | derive from `system_type` → profile; that's what G4 already does |
| door in bay | `description` may say "door"; `schedule_reader` has door types | `doorType`, `doorBay` | partial — schedule has it, elevation marks don't carry bay index |

**Verdict: ~70% of the contract is derivable from `system_type` + calibrated `bbox` alone**, because G4 already derives sightline/bite from the profile. The two real gaps are `bays`/`rows` (fix: carry `bay_count`/`row_count` through `geometry_anchoring.py`; the rules engine already computes `bay_count` per candidate) and the canonical→profile-name mapping (fix: a 5-entry table, or stop keying G4 on display strings — see §5).

---

## 2. Extrusion & Stick Math

### How mullion lengths are computed — per engine

**G4 (live):**
```js
verticalsCount   = bays + 1;                 totalVerticalLF = verticalsCount * h / 12
dloWidth         = (w − (bays+1) × sysSL) / bays
glassCutWidth    = dloWidth + 2 × sysBite
totalHorizontalLF = (w*2)/12 + (interiorHorizPcs × glassCutWidth)/12
cutList: [{ part:'Vertical', qty: bays+1, lengthInches: h },
          { part:'Horizontal', qty: (rows+1)×bays, lengthInches: glassCutWidth }]
```
✅ Verticals run full height, continuous.
✅ Horizontals are cut to **DLO + 2×bite** ("pocket-to-pocket") — correct for screw-spline storefront where the horizontal seats into the vertical's glazing pocket.
✅ Jamb sightline is subtracted (`(bays+1) × sysSL` — jambs count). This is the most correct DLO formula of the four.
❌ **Head and sill are `w × 2 / 12` — full frame width**, while interior horizontals are pocket-to-pocket. For a screw-spline system head/sill *also* run between jambs (cut = w − 2×jamb face). This is a small but systematic over-count.
❌ **Storefront only.** No branch on system category. For **curtain wall the topology inverts** — horizontals run through (or between verticals with shear blocks), verticals are cut per row at the stack joint. There is a `// TODO curtain_wall: reverse` in `FrameBuilderCanvas.jsx:556` and no math behind it. Bid a Cap CW frame through G4 and you get storefront cut lengths.
❌ All bays equal width. `dloWidth` is one number. PartnerPak's Tier-1 verb "Set DLO — adjacent panels absorb the remainder" has no representation. (`bayHorizontals` does give per-bay *vertical* irregularity — half the model.)
❌ No jamb vs. intermediate mullion distinction. `'Vertical' × (bays+1)` — but jambs and intermediates are different dies with different weights, prices, and labor (L1 counts them together as `bays` too). Same for head / sill / transom: three dies, one line.

**G3 (frame-engine, `computeFabricationCutList`):**
✅ Separate HEAD / SILL_B*n* / JAMB / MULLION_V / TRANSOM_H roles, per-bay sills, door bays omit the sill, cut lengths formatted to 1/16", weight per LF from vendor part.
❌ `computeGridDimensions`: `dloWidth = bayWidth − profileWidth` — subtracts **one** face width per bay, so jambs are not deducted and interior mullions are half-counted. G4's formula is more correct than the "proper" package's.
❌ `transomCut = widthInches − profileWidth` — a transom that runs the full frame width minus one mullion. Wrong for storefront (should be per-bay, pocket-to-pocket), wrong for CW (should be between verticals or continuous with the verticals notched).
❌ Also storefront-only topology; `bayTypes` handles doors but not CW.

**G1 / G2:** `knifeW = bayW − 2·deduct − sightline·2·glassBite` — sightline **multiplied by** bite. That is inches², not inches. This is a placeholder formula that happens to produce plausible-looking numbers at default values. G1 also cuts transoms at full `width`. Nothing feeding the bid uses these, but `shopDrawingGenerator.js` does — your shop drawings are drawn from the wrong formula.

### Stock-length optimization and waste

**Only G3 has anything**, and it isn't an optimizer:
```ts
export function computeBarOptimization(totalLFNeeded, stockLengthFt: 21|24, kerf = 0.125) {
  const usableLengthIn = stockLengthFt * 12 - kerfInches;
  const barsRequired  = Math.ceil((totalLFNeeded * 12) / usableLengthIn);
```
This is **`ceil(total LF ÷ stock length)`** — it treats all footage as fungible. It is called per cut-list line in `buildBOMLines`, so it doesn't mix parts, but it ignores that individual cuts have to fit: three 13' verticals total 39' → it says 2 × 24' bars; you cannot get three 13' pieces out of two 24' bars. **It systematically under-orders whenever cut length > half the stock length — which is every vertical on every frame over 10'-6" tall with 21' stock.** Kerf is subtracted once per bar, not once per cut. No waste factor beyond the derived scrap %; no per-vendor stock lengths (Kawneer 24', others 21'/22'); no drop-reuse across frames.

**G4 (the bid) has none of this.** `totalAluminumLF` goes to the bid as a single number. `CutListOptimizer.jsx` exists in the FrameBuilder module (G3 side) — I did not audit its algorithm, but it doesn't reach the bid either.

---

## 3. Glass & DLO

**G4 (live):**
```js
dloWidth  = (w − (bays+1)·sysSL) / bays
dloHeight = (h − headSL − sillSL − (rows−1)·sysSL) / rows
glassCutW = dloWidth  + 2·sysBite
glassCutH = dloHeight + 2·sysBite
```
✅ Glass = DLO + 2×bite. Correct.
✅ Sightlines from the system profile (`SYSTEM_GEOMETRY_CATALOG` via `sysSL`/`sysBite`), with per-position head/sill overrides, and a `geometry` snapshot saved with the frame (`sightline, hSightline, bite, hBite`) so h/v asymmetry is representable.
✅ Door transom: `transomDLOH = h − 84 − DOOR_HEADER_SL − headSL`, correct order of subtraction.
✅ Raked-head mode exists (`shapeMode: 'raked_head'`, `leftLegHeight/rightLegHeight`); Studio's G2 has the trapezoid glass math (`gh_left / gh_right` with slope). G4's raked branch was not traced in detail here.
❌ **All lites are the same size.** One `glassSizes` entry per frame: `{ widthInches, heightInches, qty }`. Irregular grids (bulkhead row, unequal bays) produce multiple sizes; G4 can't emit them. `useBidStore.buildGlassRFQ` groups by `(w × h × type)` and would work fine with multiple sizes if it received them.
❌ **No glass edge clearance / setting-block height.** Real knife size is `DLO + 2×bite − edge clearance` (typically 1/8"–1/4" total) so the lite floats in the pocket; PartnerPak's Frame S example in your `.dat` notes: DLO 51.9998 × 27.5, glass 52¾ × 28¼ → **glass = DLO + ¾" per axis, not + 2×⅝ = 1¼"**. Your bite constants may already be net-of-clearance by convention — worth a 5-minute check against one real Kawneer 451 glass takeout. If they aren't, every lite is ordered ~½" oversize.
❌ Glass type is a label. No thickness → weight, no tempered/annealed/spandrel per lite (PartnerPak's **t/a/spandrel per panel** is Tier 1), no IGU makeup → price. `frame-engine` has `GlassSpec` with these fields; G4 doesn't use it.
❌ `sqFtPerLite = glassCutW × glassCutH / 144` — actual area, not the fabricator's billing rule (most bill on **rounded-up inch** dimensions, some on 1/4-SF or min-SF-per-lite). That's a 3–8% under-count on small lites.

---

## 4. Accessories & Hardware

**G4 (live): nothing.** The cut list has `'Door Hardware Allowance'` with `qty: leaves` and `lengthInches: null`. That's the entire hardware model on the money path. Perimeter caulk exists **only as a labor driver** — `perimeter × beadsOfCaulk` LF → `caulkMH` in L1. No sausage count, no material line.

**G3 (frame-engine, `buildAccessories`) — built, not connected:**

| Item | Rule (`DEFAULT_FRAMED_RULES`) | Assessment |
|---|---|---|
| Setting blocks | 2 per lite | ✅ standard |
| Screws | 4 per joint, joints = `(bays + lites) × 2` | ⚠️ The joint formula is a legacy heuristic, not a topology count. Real screw-spline: 2 screws per horizontal-to-vertical joint × 2 ends; a 4-bay × 2-row frame has 2×5×3 = 30 horizontal ends → ~60 screws, plus corner keys. `(4+8)×2 = 24 joints × 4 = 96`. Direction of error varies with grid. |
| Weep baffles | 1 per LF of sill | ⚠️ Weeps are per sill *bay* (2–3 each), not per LF |
| End dams | 2 per frame | ✅ |
| Shim tape | 1 LF per LF of sill | ✅ |
| Drain holes | 2 per sill | ✅ |
| Caulk | `computeCaulkSausages(perimeterLF, w, d, waste%)` — 20 oz sausage, empirical coverage | ✅ reasonable; **but `volumePerLF` is computed and then unused** — coverage uses a constant 36.6 |
| **Shear blocks** | ❌ `PartRole` `'shear-block'` exists in the vendor catalog; **no rule generates a quantity** | Should be 1 per horizontal-to-vertical intersection for shear-block systems (CW, some SF); 0 for screw-spline |
| **Pressure plates** | ❌ `'pressure-plate'` role exists; **no length or count computed** | CW: 1 per vertical + 1 per horizontal, cut to the same length as the member it clamps |
| **Snap covers** | ❌ `'cap-cover'` role exists; **no length computed** | Same as pressure plates, ordered by LF |
| Corner keys | `'corner-key'` role exists; no rule | 4 per frame for mitered SF |
| Gaskets / glazing vinyl | ❌ not modeled at all | PartnerPak has an `AddVinyl` table; typically 2 × glass perimeter per lite (interior + exterior wedge/bulb) |
| Anchors / clips | ❌ not modeled | L1 has `clips` labor per bay but no material |
| Thermal struts / isolators | `'thermal-strut'` role exists; no rule | |

So: the **data model** knows what a pressure plate is (`PartRole`), a few vendor entries carry a part number for it (`YCW750-PP`), and **no line of code anywhere computes how many or how long.** The captured-CW BOM is a storefront BOM with different die numbers.

**Vendor catalog reality check:** 23 vendor systems in `VENDOR_CATALOG`. Part numbers are of the form `451-010`, `451-020`, `451-SB01`, `YCW750-V`. These are role-placeholders in a plausible format — one die per *role family*. A real Kawneer 451T frame uses distinct dies for jamb, intermediate vertical, head, sill, sill flashing, transom, door header, plus glazing adaptors — 6–10 dies where the catalog has 2. `listPrice` is `0` on every line; there is no price book import anywhere in the live tree (`pricingLogic.js` is unreachable from `App.jsx`; `PriceBookManager.jsx` has a "Coming soon: connect your Anthropic key" placeholder for the paste-a-quote extractor).

---

## 5. The Gap to PartnerPak

You've already written the target — `PARTNERPAK_FRAME_BUILD_MODEL.md §8` names *"the one architectural jump: PartnerPak grids are IRREGULAR."* Correct, and I'd rank it second. Here's the full gap list, ordered by what blocks a priced bid, not by what's most visible.

### Gap 1 — There is no price book. (Blocks everything.)
No die-level price data, no import, no `$ × LF` anywhere on the bid path. Every geometry improvement below produces a better RFQ document and changes the bid total by $0. What's needed: a **price-book entity** `{ vendorSystemId, partNumber, description, $/LF (or $/lb + lb/LF), finishMultipliers, stockLengthFt, effectiveDate }`, an importer (Kawneer/Tubelite/YKK price sheets are PDF/XLS; the `.dat` parser proves you can read structured vendor data), and `buildBOMLines` filling `listPrice`/`extCost` from it. Then `useBidMath.totalMaterialCost` becomes `Σ BOM extCost + Σ vendor quotes (for non-BOM items)`, with the quote path kept for glass (which shops *do* quote out).

### Gap 2 — Die-level BOM, not role-level.
One `'vertical-mullion'` die for jambs + intermediates and one `'horizontal-member'` for head + sill + transom cannot price a frame. Your own `.dat` reverse-engineering found PartnerPak's stick roles: `HEAD, SILL, INT VERTICAL, STOP, SILL RECEPTORS, PP HEAD, FACE`. The `PartRole` enum needs to grow to that granularity, the vendor catalog needs real dies (this is data entry against manufacturer catalogs — tedious, not hard), and the cut-list generator has to emit per-die lines.

### Gap 3 — Topology per system family.
One storefront cut-list generator serves five system types. Needed: **screw-spline SF** (verticals through, horizontals pocket-to-pocket — what G4 does now), **shear-block SF** (same cuts, + shear blocks per intersection), **captured CW** (horizontals between verticals with shear blocks *or* verticals through — vendor-specific; + pressure plate + cover per member; + stack joints on tall units), **SSG CW** (no exterior pressure plate; structural silicone LF + spacer + backer instead). This is a `switch (systemClass)` around four ~80-line generators, and it's the single largest *accuracy* gap for the CW work in your corpus (Ext CW is 329 + 85 + 17 annotations).

### Gap 4 — Irregular grid model. (Your §8; I agree.)
`bays × rows` + `bayHorizontals` gets you halfway. PartnerPak's Tier-1 verbs — position horizontal to absolute BOH, set DLO with neighbor absorption, delete stick, per-panel infill — all require a stick graph or per-bay segment model. `frame-engine` has `bayConfigs[]/rowConfigs[]` in `useFrameBuilderStore` (empty arrays by default) and `BayConfig`/`RowConfig` types — the skeleton exists in G3, not G4.

### Gap 5 — Cutting-stock optimization.
Replace `ceil(LF/stock)` with first-fit-decreasing per die across all frames in a frameset, per-vendor stock lengths, kerf per cut, drop threshold, waste % output. FFD is ~40 lines and within 2–5% of optimal for this problem shape. Do it per **frameset** (PartnerPak's unit) so drops from frame A feed frame B.

### Gap 6 — Glass schedule fidelity.
Per-lite sizes (falls out of Gap 4), tempered/annealed/spandrel per panel, edge clearance, fabricator billing rounding, glass weight (for crane/labor), IGU makeup → `GlassSpec` (exists in frame-engine, unused by G4).

### Gap 7 — Hardware and door configurator.
Per-door itemized hardware with frame preps and per-door shop/field minutes (PartnerPak §4). `HARDWARE_SETS` in `pricingLogic.js` (unreachable) and `DoorPackage` in frame-engine are starting points. This is also where the RESULTS.md "hardware-set scope implications" miss lives.

### Gap 8 — Consolidate to one engine.
Four geometry engines is not a feature gap, it's the reason every fix has to be made four times and the shop drawings disagree with the bid. G3 (`frame-engine`) is the right home — it's typed, pure, tested (`test-bomResolver.ts`), and already has the richest contract. G4's DLO math is more correct than G3's; port G4's formulas *into* G3, make `ParametricFrameBuilder.jsx` call `resolveFrameBOM`, delete G1, and have Studio consume the package (the "shared/types is empty" item from the first audit).

---

## Status table

| Capability | G4 (bid) | G3 (frame-engine) | Verdict |
|---|---|---|---|
| Frame OD → DLO (SF) | ✅ correct, jambs deducted | ⚠️ one face/bay, jambs not deducted | **G4 formula is the keeper** |
| Vertical continuous / horizontal pocket-to-pocket | ✅ | ⚠️ transom = full width − 1 face | G4 |
| Head/sill cut length | ⚠️ full width | ✅ per-bay | G3 |
| Curtain wall topology | ❌ | ❌ | **Missing entirely** |
| Per-bay unequal widths | ❌ | ❌ (types exist) | Missing |
| Per-bay horizontals | ✅ `bayHorizontals` | ❌ | G4 |
| Door bay (sill removed, header, transom) | ✅ | ✅ | Both |
| Raked head | ✅ mode exists | ❌ | G4 (G2 has trapezoid glass) |
| Glass = DLO + 2×bite | ✅ | ✅ | Both; **verify bite is net of edge clearance** |
| Multiple glass sizes per frame | ❌ | ✅ (schedule rows) | G3 |
| Glass type/thickness/temper | ❌ label only | ⚠️ `GlassSpec` type, thin data | Missing |
| Stock-length optimization | ❌ | ⚠️ `ceil(LF/stock)` — under-orders on long cuts | **Needs FFD** |
| Waste factor | ❌ | ⚠️ derived scrap % only | Missing |
| Setting blocks / screws / weeps / end dams / shim | ❌ | ✅ rules (screw & weep rules questionable) | G3, unconnected |
| Shear blocks | ❌ | ❌ role only | Missing |
| Pressure plates / snap covers | ❌ | ❌ role only | Missing |
| Gaskets / vinyl | ❌ | ❌ | Missing |
| Perimeter caulk LF | ✅ (labor only) | ✅ sausages | G3 for material |
| Die-level part numbers | ❌ `'Vertical'` | ⚠️ 1 die per role family, placeholder numbers | **Needs catalog work** |
| Price book / $ per die | ❌ | ❌ `listPrice: 0` | **Missing — Gap 1** |
| Material $ on bid | Σ vendor quotes | — | Manual |
| Labor hours | ✅ L1, Excel parity | ✅ L1 | **Solid** |
| PartnerPak `.dat` import | — | ✅ parser, 18/18 dims exact | Real asset |

---

## What to build, in order

1. **Fix the intake, today.** Carry `bay_count`/`row_count` through `geometry_anchoring.py` → `detections[]`; replace `StudioInbox`'s 1×1 perimeter frame with a real `ParametricFrameBuilder`-shaped payload keyed on canonical `system_type`. Zero new math; it stops throwing away what vision already knows.
2. **Price book + die-level catalog** (Gap 1 + 2). Nothing else moves the bid number.
3. **Consolidate onto `frame-engine`** with G4's DLO formulas ported in (Gap 8). Do this *before* the topology work or you'll write CW math four times.
4. **CW topology + pressure plate/cover/shear-block rules** (Gap 3). Highest accuracy gain for the corpus.
5. **FFD cutting stock per frameset** (Gap 5).
6. **Irregular grid + Tier-1 sculpt verbs** (Gap 4) — the UX jump, on a sound engine.
7. Glass fidelity, door configurator (Gaps 6–7).

One check to run before any of it: open one real Kawneer 451 glass takeout you've had fabricated and compare its ordered size to `DLO + 2×0.625`. If the fab's number is smaller, your bite constants need edge clearance subtracted, and every lite currently on a bid is oversize.

---
*Read-only audit of the live tree. Line numbers cite the staged copies as of 2026-09-18. Formula claims verified by reading the code, not by running it.*
