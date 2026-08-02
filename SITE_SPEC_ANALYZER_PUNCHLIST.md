# Spec Analyzer (site) — UI punch list from live inspection

Inspected live 2026-07-16 at `localhost:5173/estimators` (Binswanger Glass Estimator Portal → Tools → Spec Analyzer), Brighton Project Manual loaded. Companion docs: UI_SPEC_SPEC_SORTER.md (target design), SPEC_SORTER_FIX_PLAN.md (engine phases). Ordered by severity — fix trust first, then the viewer, then navigation, then polish.

## A. Trust — findings are wrong, and that outranks all layout work

**A1. False positives are being promoted to "High Risk." Verified live.**
- "NO SUBSTITUTIONS / Sole Source / Proprietary" (01 78 39, p.100): the citation jump lands on p.100 and the excerpt IS there — but the text is Project Record Documents boilerplate ("mark copy with the proprietary name and model number…" — closeout record-keeping, not a substitution restriction). The regex matched the word "proprietary."
- "Fire-rated glazing assembly" (01 31 00, p.25): excerpt is "fire-rated enclosures around ductwork" — mechanical coordination, not glazing.
- Fix (engine, fix plan Phase 6): (a) low-precision patterns require corroborating context within N chars; (b) any finding whose source section is Division 00/01 gets demoted to a "Contract & general conditions" group and CANNOT be labeled a glazing product risk; (c) glazing-product categories (fireRating, substitutions, acoustic…) only run against Div 08 + related product sections. Expect "8 High Risk" to drop to the 3-4 real ones.

**A2. Severity language disagrees with itself.** Grade D + verdict text "Bid with caution" (the C-band message) + header pill "High Risk" = three different severity statements for one document. One source of truth: grade bands from UI_SPEC_SPEC_SORTER.md interpretation rules (D = "High risk — get answers from the GC before spending estimating hours").

## B. PDF viewer — the "half page" problem, confirmed causes

**B1. Fixed-height container clips/shrinks pages.** Page 1 rendered cut off at the bottom (title block clipped mid-line); page 100 rendered small-but-still-clipped. The viewer card has a fixed height that neither fits a letter page at width nor scales consistently.
Fix: viewer pane = full available height (`flex` column; viewer `flex: 1; min-height: 0; overflow-y: auto`), render pages at container width (fit-width default), natural page height, page scrolls vertically. Never a fixed-px page box.

**B2. Prev/Next single-page paging through 298 pages.** Unusable for a spec book.
Fix: continuous scroll with lazy rendering (the desktop app's `PdfScrollViewer` + IntersectionObserver pattern in SpecSorterPage.jsx is the reference implementation — port it). Keep the page indicator; add a page-number jump input and zoom in/out/fit-width controls.

**B3. "Highlight" is a yellow text box under the PDF, not on it.** The excerpt quote box ("HIGHLIGHTED ON P.100: …") is useful as a secondary aid but nothing is drawn on the page — the user still has to hunt.
Fix: draw highlight rects on an overlay canvas positioned over the matched text (fix plan Phase 4: capture pdfjs item rects at scan time, store on the finding, draw stored rects at render). Keep the quote box below as confirmation.

## C. Navigation model

**C1. Analysis ↔ PDF as separate views is the core "doesn't come naturally" problem.** "View in Spec" navigates away from the report; the estimator loses their place in the findings list every time they verify one.
Fix: split view per UI_SPEC_SPEC_SORTER.md — findings left (~40%), PDF right, both always visible ≥1024px. Citation click scrolls the right pane only. Below 1024px: PDF opens as a slide-over with a back affordance. The existing breadcrumb (finding title · section · page) is good — keep it as the right pane's header.

**C2. Sidebar is 56 sections flat in document order.** The estimator scrolls past all of Division 01 to reach Div 08.
Fix: scope-first grouping — "My scope · Div 08" pinned open on top, "Worth reviewing · 00/01/02/05/07" second, everything else collapsed. Filter pills (My scope / Worth reviewing / All) + search. Show page ranges on rows. Replace the dot legend (Risk/Warn/Clean/Pending) with words on hover and counts per group.

**C3. No entry flow.** User lands on a loaded analysis with no orientation. Add the 3-stage indicator (Upload → Sections → Report) and the detection summary strip (pages · sections found · confidence badge) so a first-time user knows where they are and what happened.

## D. Report readability

**D1. Excerpts start mid-sentence** ("cannot be readily identified and recorded later. 2. Mark copy…"). Trim to sentence boundaries; bold the matched phrase inside the quote so the eye lands on the trigger.

**D2. Alarm fatigue.** ALL-CAPS group headers, saturated red everywhere, 8 "high risk" pills. Sentence case; severity = icon + word + calm tint; red reserved for the (now fewer, real) money risks. Group names in estimator language: "Could cost you money" / "Verify before bidding" / "Contract & general conditions" / "Bid day paperwork" / "Confirmed findings". "8 Notes" is meaningless — remove or fold into the groups above.

**D3. Meaning lines are good — keep them.** The one-sentence money-consequence lines under each finding title are exactly right (see UI spec interpretation templates). They just need true findings behind them.

## E. Noted, not urgent

- Sidebar shows 56 sections (57 minus TOC) — engine output looks like V2-class detection on the site. Good.
- "Ask AI" button placement is fine; wire it to the specIntelligence pack + BYO key per SPEC_SPLITTER_COMPANY_FEATURES.md §4 when that lands on the site.
- "Save" should become "Save my scope" with the organized folder/zip output (§2 of company features).

## Suggested order
A1 → B1+B2 (one viewer rewrite) → C1 → B3 → C2 → D1+D2 → C3. A1 first because every demo of the current build shows a false "High Risk" as the top finding.

## F. Left panel redesign — glazing scope sorter (owner requirement, 2026-07-16)

Replaces the current flat section list in `SectionSidebar` (`src/estimator/SpecSorterPage.jsx:1380-1490`). Two stacked lists in the left panel:

**Top list — "All sections":** every detected section EXCEPT those auto-moved to glazing scope, sorted by section number, each row with a checkbox + number + title + page range. Scrollable, with a small search/filter input. Checking a row moves it down into the glazing scope list (tagged "added"); unchecking it there returns it here.

**Bottom list — "Glazing scope":** auto-populated on detection by matching against the default glazing section list, plus anything the user checks in the top list. Rows show checkbox (checked), number, title, page range, and an `auto` or `added` tag. This list IS the bid package: scanning, the risk report, and the future save-to-folder all operate on it.

### Default glazing sections (ship as `GLAZING_SCOPE_DEFAULTS` in `src/lib/glazingScope.js`)

| Section | Description |
|---|---|
| 08 41 13 | Aluminum-Framed Entrances and Storefronts |
| 08 41 26 | All-Glass Entrances and Storefronts |
| 08 43 13 | Aluminum-Framed Storefronts (often redundant with 08 41 13) |
| 08 44 13 | Glazed Aluminum Curtain Walls |
| 08 44 33 | Sloped Glazing Assemblies (Skylights) |
| 08 51 13 | Aluminum Windows |
| 08 56 19 | Pass-Through / Service Windows |
| 08 80 00 | Glazing (glass types, IGUs, film, sealant specs) |
| 08 81 00 | Glass Glazing (often a sub-section of 08 80 00) |
| 08 83 00 | Mirrors |
| 08 84 00 | Plastic Glazing (polycarbonate/acrylic) |
| 08 88 00 | Special Function Glazing (fire-rated / security) |

### Matching rule — family match on the first 4 digits, not exact

Real spec books use variants: Brighton has 08 56 80 Service Windows (not 08 56 19) and 08 88 13 Fire-Rated Glazing (not 08 88 00). Exact matching would miss both. So: derive the family set from the defaults (`08 41`, `08 43`, `08 44`, `08 51`, `08 56`, `08 80`, `08 81`, `08 83`, `08 84`, `08 88`) and auto-move any detected section whose number starts with a family prefix (extensions like `.23` inherit their base). On Brighton this auto-moves exactly the right 5: 08 41 13, 08 56 80, 08 80 00, 08 83 00, 08 88 13 — and correctly LEAVES hollow metal doors (08 11), overhead/sectional doors (08 33/08 36), and door hardware (08 71) in the top list, since those are other subs' scope. Keep the exact 12-row table as the display/reference list; the family set is the matcher. Both become playbook-overridable later (company features §1 `scope`).

### Behaviors

- Auto-moved rows arrive checked with an `auto` tag; the user can uncheck (returns to top list) — nothing is locked.
- Scope list persists per project (project save/localStorage) so it survives reload; re-running detection re-applies auto-matching