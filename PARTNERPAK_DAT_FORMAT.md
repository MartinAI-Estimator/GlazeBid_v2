# PartnerPak `.dat` Format — Reverse-Engineering Findings (Phase 3)

**Session date:** 2026-07-24
**Sample:** `reference/partnerpak/Alpine Buick GMC-20260723131753.dat` + printed bid reports (`Alpine Buick GMC.txt`)
**Parser:** `packages/frame-engine/src/partnerpak/PartnerPakParser.ts`
**Tests:** `apps/builder/src/__tests__/engine/partnerPakParser.test.js`

## 1. Container

`.dat` = ZIP (deflate) wrapping a single SQL Server Compact (SQLCE) database file.
Inner file magic: `6A 4B BE F6`. Entry name carries the project name:
`<ProjectName>-<timestamp>.dat`.

## 2. Database Layout (as scanned, not via SQLCE engine)

- **4096-byte pages.** Page type word at offset 6: `0x40` row pages, `0x50` LOB/spill,
  `0x60/0x30/0x20/0x10` system/index, `0x00` free.
- **Tables** (from `__SysObjects` strings): Project, FrameSets, Frames, MetalGroups,
  DoorGroups, DoorList, AddMetal, AddGlass, AddHardware, AddVinyl, AddBrakeMetal,
  AddCharges, MATERIALFLOW, MATERIALFLOWCART, MATERIALFLOWUNIT.
- **Frames table** is the heart — ~140 columns including FrameName, FrameWidth,
  FrameHeight, FramePanels, FrameRows, NumberThus, shims, FrameXML, SerializedData,
  glazing slots, LaborType, Picture2D.

## 3. Frame Row Encoding (the useful parts)

**Packed ASCII header** (variable section, one per frame):
`ProjectName + FrameSetName + FrameName + DesignStyle(Standard|Combination) + Shape(Rectangle|…) + Vendor + System + BackColor + FaceColor + glass slots + sealants + LaborType`
— concatenated with NO delimiters. Set/name split uses shared-prefix clustering with a
"Frame " token-boundary guard (G vs G1/G2 collision).

**Dims:** FrameWidth/FrameHeight are **consecutive float64s in the fixed row section**.
Rows pack multiple frames per row page; when the variable section overflows to a later
page the fixed section stays put. File order of dims pairs == row order == header order.
Validated 18/18 exact vs printed reports. (Beware red herring: a UTF-16 "WúHú" string
near STRUCTURAL PARAMETERS is a *default/call-size* field, wrong for 5 of 18 frames.)

**Variable data segments** are UTF-16LE, delimiter chars U+00FA–U+00FE (nesting levels),
terminator U+00FF:
- `GLAZING ~ tag(TE/AN/SP) ~ spec ~ qty ~ glassW ~ glassH ~ … ~ dloW ~ dloH ~ laborType`
- Stick lines: `role ~ description ~ partCode ~ finish ~ side ~ length ~ …`
  (roles: HEAD, SILL, INT VERTICAL, STOP, SILL RECEPTORS, PP HEAD, FACE …)
- `STRUCTURAL PARAMETERS\DEFAULT ~ … ~ SINGLE SPAN ~ 1/8 POINT ~ deflection… ~ ÿ`
  Exactly one per frame; alternates with headers in file order.

**Small frames** keep segments in-row (fully linkable). **Large frames** spill segments
to `0x50` pages → parser pools them as `orphanGlazing`/`orphanSticks` (project-level
totals correct; per-frame linkage for spilled frames = Phase 3.1).

## 4. Validation Results (all in sandbox harness; vitest mirrors ready)

| Check | Result |
|---|---|
| Frames found | 18/18 (3 framesets: Exterior SF, Interior SF, EX CW) |
| Frameset + name split | 18/18 incl. "Glass Ceiling" and G/G1/G2 siblings |
| Width × height vs printed reports | **18/18 exact** |
| Vendor/system/colors/laborType | read as data (Kawneer in this file — nothing hardcoded) |
| Frame S glazing | 52 3/4 × 28 1/4 + DLO 51.9998 × 27.5 — exact |
| Report glass size coverage | spot-checked sizes match per-frame (report multiplies by NumberThus) |
| Parse time | ~180 ms for a 5 MB database |
| **TakeoffEngine cross-validation** | **Frame S reproduced exactly**: faces from .dat (jamb/head 2.0002, sill 2.4998), bite 0.5, glazing tol 1/8 per side → glass 52.75 × 28.25 == PartnerPak production output |

Key engineering constant confirmed: PartnerPak deducts **1/8" per side glazing tolerance**
(glass = DLO + 2×bite − 1/4" total) on this 451T storefront system.

## 5. Phase 3.1 TODOs

1. **NumberThus, FramePanels, FrameRows** — locate in fixed row section (near the dims
   f64 pair; probe int columns against report values S=18/T=3/B=2).
2. **Spilled-segment ownership** — LOB page chain linkage so 12-panel CW frames get
   their sticks/glazing attached per-frame (headers alternate; use file-order grouping
   between consecutive frame regions as first approximation).
3. **MetalGroups table** → extract full profile part maps per system (roles like
   HEAD/SILL/FEMALE VERTICAL with part codes) → auto-build GlazeBid `MetalGroup` objects.
4. **Doors** — DoorList/DoorGroups rows visible (e.g. `STANDARD\SINGLE\NON-TRANSOM\HRSO\DOOR & FRAME\500\…`); map to `DoorConfig`.
5. **`ppFrameToElevation()` adapter** — PPFrame → TakeoffEngine `TakeoffInput` +
   `hydrateFrames()` payloads, so "import competitor .dat" becomes a one-click demo.

## 5b. Phase 3.2 — `.dat` EXPORT (required)

GlazeBid must WRITE `.dat` files that PartnerPak Studio / Glazier Studio can open
(the round-trip: takeoff in GlazeBid → upload to PartnerPak for anyone still living
there). Writing valid SQLCE pages from scratch is high-risk; the pragmatic path is
**donor-template patching**: start from a known-good minimal `.dat`, rewrite the
Frames/FrameSets/AddGlass/AddMetal rows (fixed f64 dims + packed headers + UTF-16
segments are all now understood), fix page checksums, re-zip. First milestone: a
1-frame export that PartnerPak opens without error. Needed from Martin: confirm
PartnerPak accepts an imported/emailed .dat via its normal open flow, and a minimal
donor project (empty or 1-frame export).

## 6. Vendor Neutrality

The parser reads vendor, system, finishes, and part codes as opaque strings from the
file. Kawneer, Tubelite, YKK, EFCO, Oldcastle, or custom systems all flow through the
same path — nothing is keyed to any manufacturer.
