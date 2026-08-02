# PartnerPak Studio Frame-Build Model — Interpretation for GlazeBid Frame Builder

**Source:** Quick Start Guide with Workbook, PartnerPak Studio Rev3 (DeMichele Group), 136 pp.
**Purpose:** This is the workflow GlazeBid's Parametric Frame Builder must match (then beat),
re-skinned with GlazeBid styling/UX. Read alongside `WINDOW_SCHEDULE_IMPORT.md`.

---

## 1. The Core Paradigm: SCAFFOLD → SCULPT

PartnerPak never asks the user to draw sticks. Every frame starts as a parametric N×M grid,
then gets sculpted by exception:

```
Frameset defaults (metal, finish, glazing, sealants)
      ↓
New Frame: name, panels, rows, "Number Thus" (qty), width, height
      ↓  [Add Frame]
Graphic Editor opens with auto-generated equal-split grid
      ↓
Sculpt: position horizontals, set DLOs, delete/insert sticks,
        insert doors, change infill per panel
      ↓
Save → New Frame (rapid loop; estimator builds 5-10 frames in minutes)
```

Every workbook exercise is: enter 6 numbers → 2-5 sculpting steps → save → next.
**That loop speed is the entire product.** GlazeBid already has the scaffold
(WizardNewFrame → bays/rows). What's missing is most of the sculpt verbs.

## 2. Hierarchy (maps 1:1 to GlazeBid)

| PartnerPak | Carries | GlazeBid today |
|---|---|---|
| Project | job info, rollups, markups | Project (.gbid) |
| **Frameset** | metal group/system, back+face color, glazing slots (Annealed / Tempered / Spandrel / Other=NULL GLAZING), sealants (caulk, backer rod) | Group (has system/finish/glass — missing sealants, missing multi-slot glazing) |
| **Frame** | name, panels, rows, qty ("Number Thus"), W, H, Include-RO toggle | Frame in useFrameBuilderStore ✓ |

Frameset grouping by metal system enables **Alt Bid**: swap the metal system for a whole
frameset at once to price an alternate. (GlazeBid has altVendor1/2 on groups — same intent.)

## 3. The Sculpt Verbs (ranked by how often the workbook uses them)

**Tier 1 — used in nearly every exercise (GlazeBid v1 MUST have):**
1. **Position Horizontal** — select transom/sill/head stick(s), set Bottom-of-Horizontal
   (or Top/Center) to an ABSOLUTE height in inches. E.g. "set BOH to 28"" (bulkhead),
   "BOH to 84"" (door transom), "head to 6' 10 1/2"" (soffit drop). This is THE most-used verb.
2. **Set DLO** — select a panel, set daylight-opening width or height; the adjacent
   panels absorb the remainder. (e.g. "set Panel 1 DLO width to 18"")
3. **Delete Stick** — remove horizontal/vertical → merges openings (bulkheads, door prep).
4. **Insert Horizontal / Vertical / Grid** into selected panel(s).
5. **Insert Door** (Double / Hinge-Left / Hinge-Right) into a Row-1 panel → Door Configurator.
6. **Change infill per panel** — swap a panel's glazing to Spandrel / NULL GLAZING / other slot.
7. **Multi-select power tools:** Alt+click stick = that stick + all to the right;
   Alt+Shift+click panel = panel + all right; Shift+Ctrl+click = panel + all above.
   (Bulk "set all sills to 24"" depends on this.)

**Tier 2 — regular use:**
8. Copy Frame / Copy+Reflect / Reflect (mirror elevations are constant in real jobs).
9. Add Parts — esp. brake metal with width/girth/hems/shears/breaks (separate pricing model).
10. Change stick properties (profile on selected member) — GlazeBid has this (memberOverrides ✓).
11. Fix Length / cut overrides — GlazeBid has this (cutLengthOverrides ✓).

**Tier 3 — Level 2-4 features (later phases):**
Cut stick, weld stick, miter joint, reverse joinery, expansion mull ⇄ std vertical,
structural parameters, vents, out-of-square editor (tilt/arc/fan/corners), sunburst/wagon
wheel, fabrication/machine code (NCX), DXF/Revit export.

## 4. Doors — the Door Configurator model

- **Catalog doors** = reusable templates in DB. **Project doors** = instances used on a job.
  Strategy: copy nearest catalog door → tweak → save-as. GlazeBid: door template library
  (CRL, Dorma, ASSA ABLOY, Blumcraft per confirmed decisions).
- Door properties: Type (Standard A1 / Custom A2 / A4 / A7 = stile class), Group Type
  (door / frame / door+frame), Single/Pair, W×H, Handing (SO/HLSO/HRSO), Lock type,
  Hinge type (butt/offset pivot/continuous), Stile, Frame Type, Hardware color,
  Doorlite glass, Door + frame finishes, Cross rails (size, location, stops, muntin config).
- **Hardware = itemized part numbers with frame preps** (lock + prep, hinge ×3 + prep ×3,
  closer + door prep + frame prep, push/pull). Frequency semantics per item.
- **Per-door labor minutes:** Shop (frame fab, door fab) + Field (frame install, door
  install, hardware install, door adjust). Feeds the Labor tab per frame.
- Doors live in Row 1 only. Doors are FIXED size; remaining openings split the remainder
  (= GlazeBid's confirmed "door bays LOCKED" rule + 4" door panel minimum).

## 5. Rules of Thumb (encode as guardrails/validations, verbatim from p.50)

1. **Metal system first** — profile dims drive all math; changing system later resets panels/rows.
2. No bottom-RO when frame contains doors (raise sills instead).
3. **Start with enough rows** — a door with transom needs ≥2 rows from creation;
   you CANNOT insert a door under an inserted horizontal (that opening is a "split panel").
4. Remove excess horizontals from an opening BEFORE inserting the door.
5. **Doors before DLOs** — doors don't round; other openings absorb remainder.
6. Change stick properties before DLO/positioning (mullion size changes opening size).

GlazeBid should enforce/nudge these automatically instead of documenting them — that's a UX win
over PartnerPak (e.g., auto-suggest deleting the horizontal when a door is dropped on a split panel).

## 6. Right-Panel Anatomy (Frame Information bar + tabs)

- **Frame Information tab:** frame parameters (editable post-creation; resets grid),
  metal group options (back/face color), then CONTEXT-SENSITIVE Stick Properties:
  select a panel → DLO editor + glazing dropdown; select a horizontal → Horizontal
  Location (BOH/TOH/Center); select a vertical → Center Line Location; select any
  stick → component list (jamb, face member, pressure plate, stops...) with product
  code/color/length/final adjustment per component.
- **Stick Levels tab** — show/hide member layers (back members, face, glass) on canvas.
- **BOM tab** — metal, hardware, glass, doors/door frames, vinyl & sealants.
- **General Info tab** — frame perimeter, frame area, glazing perimeter, joints, cuts,
  doors, openings. (Cheap to compute; estimators sanity-check with it.)
- **Labor tab** — labor at individual frame level.

GlazeBid's existing 3-tab inspector (FRAME / ELEMENT / BOM) is the same idea —
needs the context-sensitivity depth (DLO edit, absolute horizontal positioning) + General Info.

## 7. Canvas / Elevation Conventions (from workbook drawings)

- Dimensions rendered around the elevation: O.A. frame W/H, per-bay widths, cut sizes.
- Per-lite glass marks annotated in panels: **t** = tempered, **a** = annealed, spandrel shading.
- Door leaves drawn with swing/handing indication.
- 3D/die-detail view is a PartnerPak differentiator we skip for now (SVG elevation is fine);
  section-cut details later.
- Editor shows structural problems toggle (GlazeBid: already has structural badges — keep).

## 8. Gap Analysis — GlazeBid Frame Builder vs. this model

**Already have:** scaffold wizard, groups w/ cascade, bays/rows + width/height overrides,
canvas element selection, member profile variants, cut overrides, BOM engine, structural
check, glass spec library, schedule import (hydrateFrames), brake metal sidecar component.

**The one architectural jump:** PartnerPak grids are IRREGULAR — deleting the horizontal in
bay 2 only, sills at different heights per bay, panels spanning rows. GlazeBid's current model
is a strict bays × rows matrix. The store needs per-bay segmentation
(e.g. `bayConfigs[i].segments: [{sillY, headY, infill, isDoor}]` or a derived stick graph)
while keeping the parametric scaffold. Everything in Tier 1 hangs off this.

**Build order proposal (next session):**
1. Irregular grid data model (per-bay segments; keep bays/rows as the generator).
2. Tier-1 verbs: position horizontal (absolute BOH), delete/insert stick, per-panel infill.
3. DLO editing with neighbor absorption.
4. Multi-select (alt-click ranges) on canvas.
5. Door insert v1: fixed-size leaf + frame in a bay, LOCKED width, hardware group ref,
   per-door labor minutes (configurator-lite; full catalog later).
6. General Info panel (perimeter/area/joints/cuts — derive from BOM/geometry).
7. Copy / Copy+Reflect frame.
8. Frameset parity: glazing slots (AN/TE/SP/NULL) + sealant defaults on groups.

## 9. Where GlazeBid Beats This (keep in sight)

- AI schedule import already builds the scaffold PartnerPak makes users type (Path C shipped).
- Rules-of-thumb become automated guardrails, not tribal knowledge.
- Manufacturer-neutral vendor systems vs. Kawneer-centric metal groups.
- No Level 1/2/3/4 feature gating — cut/weld/miter/OOS ship for everyone.
- Modern selection UX (marquee, shift-ranges) vs. 2005-era alt-click combos.
