# Spec Sorter UI specification

One design for both the desktop app (`apps/builder/src/components/SpecSorterPage.jsx`) and the future site version. Written 2026-07-15, after Phase 1 of SPEC_SORTER_FIX_PLAN.md. Audience: mixed — clear enough to demo and sell, fast enough for a working estimator.

## Design principles

1. **Scope-first, not document-first.** The default view answers "what's mine?" — Division 08 sections front and center. Everything else is one click away, never in the way.
2. **Verdict before details.** The scan report opens with a bid-readiness verdict in estimator language, not a list of regex matches.
3. **Every claim earns its link.** A finding only shows a page link if the excerpt was verified to exist on that page. No verified location → text-only finding, visibly marked unverified if AI-sourced.
4. **Plain language everywhere.** Every finding carries a "what this means for your bid" sentence. Jargon (delegated design, OCIP) is always paired with the consequence ("engineering is your cost").
5. **Honest engine states.** Confidence is always visible. Failures explain themselves and offer the next action.

## Information architecture

Three stages, one page. A slim stage indicator (Upload → Sections → Risk report) doubles as navigation once stages are unlocked.

```
┌──────────────────────────────────────────────────────────┐
│ Top bar: file name · pages · sections · confidence badge │
├──────────────────────┬───────────────────────────────────┤
│ LEFT PANEL (~380px)  │ RIGHT PANEL (flex)                │
│ stage-dependent:     │ PDF viewer (existing PdfScroll-   │
│  · section list, or  │ Viewer + PageCanvas highlight)    │
│  · risk report       │                                   │
└──────────────────────┴───────────────────────────────────┘
```

Desktop: two-panel split as above. Site: identical layout ≥1024px; below that the viewer becomes a slide-over opened by citation links.

## Stage 1 — Upload / detection

- Large drop zone with one sentence: "Drop a spec book or project manual (PDF)". Secondary button: browse.
- During detection: progress with real numbers ("Reading page 143 of 298"), then "Found 41 sections so far…". Never an anonymous spinner.
- Detection complete → summary strip (see Stage 2 header) and auto-advance.

Error / edge states:
- **needsOcr: true** → centered state: icon, "This PDF is a scan", body "‹file› has no readable text layer, so sections can't be detected yet. Run text recognition to continue.", primary button "Run text recognition (~2 min)" (Phase 3; until implemented, button says "Text recognition coming soon" disabled-reason style, plus "Choose a different PDF").
- **Partial text** (some pages textless) → banner on Stage 2: "N pages couldn't be read (scanned pages). Sections on those pages may be missing."
- **No sections found** → explain the two likely causes (drawing-set spec sheet, unusual formatting) and offer "Show me the raw pages" fallback so the user can still view/split manually.

## Stage 2 — Section review

Header (always visible above list):
- File name, "298 pages · 57 sections found".
- Overall confidence badge: High (all/most sections high) / Mixed / Low, colored `--bg-success` / `--bg-warning` / `--bg-danger` with matching text token. Tooltip explains: "Boundaries confirmed by the running page footers on every page."

Summary cards (3):
- "Your scope · Division 08" — count, accent styling.
- "Worth reviewing · Div 01 / 05 / 07" — count. These divisions carry known scope-gap risk for glaziers (sealants, steel subframes, testing costs).
- "Not your trade" — count, muted.

Filter pills: `My scope (16)` (default) · `Worth reviewing (28)` · `All (57)`. Pill state = accent tint. Search field filters by number or title.

Section row (dense list, bordered rows, no cards):
- Checkbox (pre-checked: all Div 08 + any section a previous scan flagged).
- Confidence dot: green/amber/red with tooltip ("Confirmed on every page" / "Check the boundary" / "Needs review"). Sourced from `section.confidence` (specSorterV2).
- Section number in mono, title, `p. 220–227` range.
- Row click (not checkbox) → viewer jumps to section start page; row gets selected outline.
- Medium/low confidence rows: amber/red left border (no radius on single-side border), plus inline "Adjust boundary" affordance → opens a lightweight range editor (start/end page steppers with live viewer preview). This is the human override for imperfect detection.

Footer actions: primary "Scan selected for risks" (with rough time estimate), secondary "Save as separate PDFs". Selection count visible.

## Stage 3 — Risk report

Verdict header:
- Letter-style grade chip (A–D) computed from existing `computeRiskScore`, colored by severity band.
- One-line verdict, plain language: "Bid with caution — 3 things could cost you money on this job. 2 need a question to the GC before bid day."
- Action: "Draft RFI questions" → generates GC questions from risk findings (AI-assisted; output is user-editable text).

Findings list, grouped by severity (risks → cautions → confirmed), each finding card:
- Severity chip: `Could cost you money` (danger) / `Verify before bidding` (warning) / `Confirmed` (success) / `AI-suggested, unverified` (neutral gray, only when Phase 5 verification failed but the user opted to see them).
- Title (short), then the **meaning line** — one sentence, money-consequence first. Meaning lines live in the checklist item definitions (`CHECKLIST_GROUPS` in SpecSorterPage.jsx already has `impact` — promote it to the primary text, not a footnote).
- Expand → verbatim quote block (left border in severity color, italic).
- Citation row: section chip (mono) + page link "p. 263 — view highlighted". Link only renders when the finding has verified `{page, rects}` (Phase 4 capture-time data). Clicking scrolls the viewer and draws the stored highlight rects.
- Footer strip: counts by severity + the trust statement: "Every page link is verified — no link, no claim."

Report must be exportable: "Copy summary" (plain text for email) and include in the existing proposal/SOW flow later.

## Component inventory (Builder, JSX)

| Component | New/changed | Notes |
|---|---|---|
| `SpecSorterShell` | new | stage state machine, top bar, split layout |
| `DetectionProgress` | new | real-number progress, error/OCR states |
| `SectionSummaryCards` | new | 3 scope cards |
| `SectionList` / `SectionRow` | rewrite of existing list | confidence dot, scope filters, boundary editor |
| `BoundaryEditor` | new | start/end steppers + viewer preview |
| `RiskVerdictHeader` | new | grade + verdict sentence + RFI action |
| `FindingCard` | rewrite of checklist item renderer | meaning-first, quote expand, verified citation |
| `PdfScrollViewer` / `PageCanvas` | keep | feed stored rects (Phase 4) instead of re-searching text |

State: keep Zustand-free local state as today unless it grows; stage machine is a simple `useState('upload'|'sections'|'report')`.

## Visual language

- Follow the app's existing dark theme on desktop (`#0d1117` family) but define tokens, not hex, in new components: `--ss-bg`, `--ss-surface`, `--ss-border`, `--ss-text`, `--ss-text-muted`, plus semantic `--ss-danger/warning/success/accent` (+ `-bg` tints). Desktop maps them to the current dark palette; the site maps the same names to its light theme. New components must not hardcode hex.
- Severity is always icon + color + word (never color alone).
- Sentence case throughout. No exclamation marks. Every empty/error state names the file and the next action.
- Density: rows 36–40px; report cards roomier (12–14px padding) since they're read, not scanned.

## Interpretation rules (the part that makes output easy to read)

1. Meaning line templates per checklist item, money-first. Examples:
   - noSubstitutions → "You must price the named ‹manufacturer› system — no approved equals. Lock supplier pricing before bid day."
   - delegatedDesign → "Engineering is your cost: stamped calcs required. Add engineering to your number."
   - perimeterSealants → "Division 07 sealant work is assigned to the glazing contractor here. Often missed — price the caulking."
   - ocip → "Owner-controlled insurance — deduct your insurance cost from the bid or you're double-paying."
2. Numbers beat adjectives: surface the extracted value in the title when present ("20-year warranty on IGUs", "$2,500/day liquidated damages").
3. Never show a category as "found" without either a verified citation or an explicit unverified badge.
4. Grade bands (from computeRiskScore): A "Clean spec — bid it", B "Minor items — read the flagged findings", C "Bid with caution — resolve the risks first", D "High risk — get answers from the GC before spending estimating hours".

## Acceptance criteria

- A first-time user can go from PDF drop to reading the risk report without instructions.
- Div 08 scope visible within one second of detection completing (no filtering required).
- Every rendered page link lands on a highlighted excerpt; findings without verified locations show no page link.
- OCR-needed and partial-text states explain themselves and offer an action.
- Confidence is visible per section and overall; medium/low confidence sections offer boundary adjustment.
- No TypeScript in `apps/builder/src/`; no new backend calls; site version reuses the same component structure and token names.
