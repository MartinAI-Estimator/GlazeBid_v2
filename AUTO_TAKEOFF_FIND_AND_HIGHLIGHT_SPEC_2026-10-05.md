# GlazeBid Auto-Takeoff — How Scope Is Found and Highlighted
*Spec from Martin's interview, 2026-10-05. Companion to `GlazeBid_AutoTakeoff_Standing_and_Interview_2026-10-03.md`.*

---

## 1. Where it looks

| Rule | Decision |
|---|---|
| Sheets opened | **Every A-sheet and every ID (interior design) sheet**, even ones that look irrelevant. S, M, E, P, C and L sheets are not read. |
| Unsure whether a sheet matters | **Read it anyway.** A missed sheet costs more than the API spend. |
| Never mark | Title blocks / logos, key plans / vicinity maps, photos / renderings. |
| Others' markups in the PDF (GC, other estimators, other toolboxes) | **Ignored.** The AI starts clean and hides them. |

## 2. How it finds scope (order of work)

1. **Sort sheets.** Each one is labeled legend, schedule (exterior/interior), floor plan, enlarged plan, elevation, interior elevation, section, detail, or other A/ID.
2. **Build the job key** before anything is highlighted:
   - Legend / materials schedule: code → system → class (Kawneer/Tubelite series decides SF vs CW).
   - Door / frame / window schedules: mark → size, system, glass type, hardware set.
3. **Read every sheet in Martin's order** (schedules → floor plans → elevations → details).
   - Each sheet is cut into zoomed tiles, roughly 12–25 per sheet.
   - Each tile is read with the job key and Martin's rules loaded.
4. **On floor plans:**
   - A glass line in the wall **is enough to mark it, even with no tag.**
   - Class comes from the elevation / legend; if unknown, flag it.
   - Untagged openings are **grouped by size + system** into an AI-named type (e.g. SF-A).
5. **Link across sheets by mark / tag.**
   - The plan gives the instance count; the elevation gives the size; the schedule gives the type data.
6. **Enlarged plan + overall plan show the same opening:** mark both, **count once** (linked as one item).
7. **"Typical Levels 2–4" / "Building B similar or mirrored":** multiply the count, and **flag the multiplier** for Martin to confirm.
8. **Sections / wall sections:** highlight glazing for reference, **don't count it.**

## 3. How it highlights — by sheet type

All marks use Martin's **Estimating ToolBox.btx** subjects, colors and **opacity exactly as in the toolbox**.

| Sheet | What gets marked |
|---|---|
| **Floor plan** | **Highlight the opening including jambs**, rough opening to rough opening, wall thickness deep. **Glass doors: frame highlight + a circle on each door** (door tools: Ext SF Door, Glazing ONLY Door, etc.). |
| **Elevation** | Every glazed frame gets a **highlight + Area markup (W / H / SF)**: every instance, not one per type. **W × H = the box snapped to the frame's drawn lines × the view's scale**, with the scale checked against a printed dimension string. |
| **Schedule (table)** | **Highlight the whole row** for each mark that's ours. |
| **Schedule (pictorial type elevations)** | **Highlight the whole type drawing.** |
| **Hardware sets** | Highlight hardware set rows that are ours. |
| **Schedules — excluded types** | **Leave blank** (no red on schedules). Exclusions are marked red on plans / elevations only. |
| **Legend / materials schedule** | **Color each scope row** in its system color (like McLarty A2.0). |
| **Details** | **Detail title** in the system color; **break metal as a Polylength** (LF); **WL-DL clips counted**; **floor-line fire caulk as a Polylength**. |
| **Sections** | Highlight glazing, no count. |
| **Every marked sheet** | A **color legend block** (key of the colors used on that sheet), like the toolbox legend boxes. |

**Qty Text Box:** placed **once at the schedule row / type drawing** with the **job total**, e.g. "SF-1 — 12 Thus". It is not placed beside each instance.

**Snapping:** snap to the PDF's real drawn lines **whenever possible on every sheet; required on elevations** (the Area measurement depends on it). Where no lines can be found, the AI's box is used and the item is flagged.

## 4. Unsure items and flags

- Low-confidence items are drawn with a **dashed outline** until accepted.
- The flag note says **why it's flagged** and links the **RFI draft** when it's a drawing conflict.

## 5. Review in Studio

- **Studio (GlazeBid's PDF viewer) is where the work happens.** Bluebeam should rarely be used for corrections on auto-takeoff jobs.
- **Accept the whole job** in one step; the estimator keeps adjusting as they move through the set.
- **Editing tools:**
  - drag / resize a highlight;
  - right-click to change class;
  - draw a missed item (Box & Snap fills in class / mark);
  - re-run one sheet after fixing the job key.
- Every edit is logged (training / eval data).

## 6. Files and round-trip

- **The GlazeBid project file is the takeoff.** Studio reads and writes it; it is the source of truth.
- **Export:** a PDF with **real annotations** in Martin's subjects / colors. It opens in Bluebeam like his own markups, and in any PDF viewer.
- **Opening a PDF back in GlazeBid:**
  - Each exported markup carries a hidden GlazeBid ID, so a returned PDF matches item-for-item to the project.
  - Markups without an ID (drawn in Bluebeam) are read through the toolbox subject map and offered as new items.
  - Markups whose subjects aren't in the toolbox are ignored.
  - No special file type is needed; any PDF works. The project file just carries more (links, flags, sizes).

## 7. Build order that follows from this

1. First scored run (McLarty / Curtis / Hope) of the reader built 10/3 → see what it misses.
2. **Line snapping** (vector geometry → exact frame boxes; elevation scale check).
3. **Cross-sheet linking + counting** (mark/tag link, plan count, enlarged-plan de-dup, size+system grouping for untagged, typical multipliers).
4. **Markup writer** (toolbox subjects/colors/opacity, Area W/H/SF, door circles, schedule rows, detail titles, Polylengths, Qty boxes at schedule, legend block, dashed for unsure, hidden IDs).
5. **Studio review** (accept job, drag/resize, change class, draw missed, re-run sheet, edit log).
6. PDF export + re-open.
