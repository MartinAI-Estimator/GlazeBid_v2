# Spec Sorter Fix Plan

Generated 2026-07-15 from a diagnostic session. All findings verified against three real spec PDFs
(`C:\Users\mjaym\OneDrive\Arch Drawing Markups\Specs`), not synthetic tests.

---

## 1. Test Evidence — Three Failure Classes

### A. Project Manual - Bid Specs.pdf (Brighton Cold Storage, 298 pages — classic spec book)
- TOC strategy failed silently (its regex requires a trailing page number; this TOC has none) → fell back to header scan.
- Header scan found 52 sections with mostly correct ranges — **but the TOC page poisoned it**:
  - Phantom section `08 11 13 HOLLOW METAL DOORS p.3–9` — page 3 is the TABLE OF CONTENTS. The TOC line matched the header regex, and dedupe keeps the *earliest* page per section number, so the TOC mention overwrote the real location.
  - The real 08 11 13 body (~p.220–227) got silently swallowed into `07 92 16 p.216–227`.
- ~1/3 of sections came back "Untitled Section."
- **Key discovery:** every page of this book carries a running footer `<TITLE>  <SECTION NO>  -  <page-in-section>` (e.g. "HOLLOW METAL DOORS AND FRAMES 08 11 13 - 8"). Per-page footer attribution gives exact boundaries — strictly better than TOC or first-page-header detection.

### B. Tricity Family - Bid Specs.pdf (2 pages — spec sheets G5.02/G5.03 out of a drawing set)
- Full text layer present (28K chars/page), 36"×24" multi-column sheets.
- Engine found **zero sections**. Two reasons:
  1. Header scan only reads the top 8 text lines of each page — on a drawing sheet that's the title block.
  2. Section headers are inline, mixed-case, mid-column: `Section 06 16 00 - SHEATHING`. Div 08 content is present (08 41 13, 08 44 13, 08 71 00, 08 80 00-family…) and completely missed.

### C. Mclaughlin - Bid Set.pdf (13 pages — scanned drawing set)
- **Zero text items on every page.** Pure raster scan. No parsing strategy can work without OCR.
- Current behavior: generic "no sections detected" error with no explanation of why.

---

## 2. Root Causes (code-level)

| # | Root cause | Location | Symptom it caused |
|---|-----------|----------|-------------------|
| 1 | TOC trailing digits treated as absolute PDF start page. Real TOCs list section-relative numbers, page counts, or nothing. | `specSorter.js` `parseTocLine` / `TOC_ENTRY_RE` | Wrong mapping whenever TOC path triggers (≥3 regex matches) |
| 2 | Either/or strategy: if TOC finds ≥3 lines, header scan (the accurate method) never runs. | `specSorter.js` `parseSpecSections` | Accurate data discarded exactly when inaccurate data exists |
| 3 | Dedupe keeps the *earliest* page per section number — TOC/index mentions poison real locations. | `specSorter.js` `dedupeAndSortStarts` | Phantom sections at TOC pages; real bodies merged into neighbors |
| 4 | Header scan reads only top-8 lines, single-column assumption. | `specSorter.js` `scanSectionHeaders` | Drawing-sheet specs return zero sections |
| 5 | No text-layer detection / OCR path. | whole pipeline | Scanned sets fail with unhelpful error |
| 6 | Downstream pages computed as `sectionStartPage + relativePage` — inherits every boundary error. | `SpecSorterPage.jsx` `handleScan` (pgOffset) | "→ p.X" links jump to wrong pages |
| 7 | Highlight re-searches the page for the excerpt at render time and silently gives up; falls back to `r.text` summary strings that never exist on any page. | `SpecSorterPage.jsx` `PageCanvas` overlay + line ~1425 (`r.highlight \|\| r.text`) | Highlight "never works" |
| 8 | AI enhancement accepts model-returned `{found, excerpt, page}` with zero verification; excerpts are paraphrased, pages guessed. Displayed as real citations. | `specScanner.js` `aiEnhanceSection`; same class of risk in `SpecChatPanel.jsx` | Hallucinated findings |
| 9 | Regex categories fire on boilerplate anywhere (e.g. `/\bcolor\s*:/i`, `/\bNOA\b/`), first-hit-wins, no context scoring. | `specScanner.js` `SCAN_CATEGORIES` / `scanCategory` | Noisy/false findings |
| 10 | Tests only use a synthetic PDF whose TOC conveniently lists absolute page numbers — the one format real specs don't use. | `specSorter.test.js` | Green tests, broken product |

---

## 3. Fix Phases

### Phase 1 — Boundary detection rewrite (fixes wrong sections + wrong mapping at the source)
The new primary strategy is **per-page attribution**, not start-page detection:

1. For every page, extract header/footer bands (top ~15% and bottom ~10% of page height, using text item Y coordinates — not "first 8 lines").
2. Match running header/footer patterns: `<TITLE> <NN NN NN> - <n>` and `SECTION <NN NN NN>`. Each page gets an owner section (or `null`).
3. Detect and exclude TOC/index pages first (TOC heading regex + high density of section-number lines) so they can never claim ownership.
4. Build ranges from contiguous runs of same-owner pages. Gaps between two runs of the same neighbor inherit forward. `page-in-section == 1` (from footers like "08 11 13 - 1") confirms exact starts.
5. First-page header scan (current logic, full page not top-8) remains as signal #2; TOC parsing is demoted to **titles and section-list validation only — never page numbers**.
6. Confidence score per section (footer-attributed = high; header-only = medium; inferred = low) surfaced in the UI so the estimator can spot-check low-confidence boundaries.
7. Dedupe rule: prefer the occurrence with body evidence (footer run / "PART 1 - GENERAL" content) over earliest page.

**Acceptance:** Project Manual parses with 08 11 13 at its true range; zero sections claiming TOC pages; all sections titled.

### Phase 2 — Drawing-sheet mode (makes Tricity-style sheets work)
1. Detect sheet-format pages: page width > ~1700pt (ARCH D/E) or width≫height with title-block text.
2. Column segmentation by X-coordinate clustering of text items, then per-column line collapse (the current global Y-sort interleaves columns into garbage).
3. Inline section detection: `Section \d{2} \d{2} \d{2}` case-insensitive anywhere in column text.
4. Output model change: these sections are *regions on a shared page*, not page ranges — sections get optional `{page, column, yRange}` instead of assuming exclusive page ownership. Extraction of "the section as its own PDF" is replaced by text-region extraction for scanning (page-splitting stays available for whole-sheet export).

**Acceptance:** Tricity returns its Div 08 sections (08 41 13, 08 44 13, 08 71 00, 08 80 00…) with correct sheet/column locations.

### Phase 3 — Scanned-PDF handling (Mclaughlin class)
1. Cheap text-layer probe (first 5 pages: any text items?). If none → clear UI state: "This PDF is a scan with no text layer — OCR required," not a generic failure.
2. OCR integration behind that gate. Options, in order of preference:
   - Tesseract.js in a worker (pure client, fits the no-backend rule; slow on big sets but fine for 13-page drawing sets)
   - Python sidecar OCR (sidecar/ already exists) for batch speed
3. OCR output feeds the same per-page attribution pipeline.

**Acceptance:** Mclaughlin either parses via OCR or shows the explicit OCR-needed message. Never a silent zero.

### Phase 4 — Links and highlights (fix at capture time, not render time)
The core change: **capture location once, at scan time, when the text and its coordinates are in hand** — stop re-deriving at render time.

1. When a regex category matches, record `{absolutePage, verbatim excerpt, char offsets, and the pdfjs item rects}` immediately. The highlight overlay then just draws stored rects — no fuzzy re-search, works every time the boundary data is right.
2. Delete the `r.text` fallback in the jump call (`r.highlight || r.text`) — a summary string is never on the page.
3. Any finding without a verified page renders as text-only (no fake "→ p.X" link).
4. Keep the existing overlay renderer; it's fine once fed stored rects.

**Acceptance:** every "→ p.X" link lands on a page where the excerpt is visibly highlighted; links without verified locations don't render as links.

### Phase 5 — AI grounding (kill hallucinations)
1. Post-verify every AI finding: search the *actual extracted page texts* for the returned excerpt (normalized). Not found verbatim → discard or mark "AI-suggested, unverified" with distinct styling and no page citation.
2. Derive the page from where verification found the text, never from the model's claimed page number.
3. Prompt change: require verbatim quotes ("copy the exact characters"), send full section text in chunks rather than 4,500-char truncation (currently the AI literally can't see most of each section — guessing is built in).
4. Same verbatim-quote + verification contract in SpecChatPanel citations.

**Acceptance:** zero displayed findings whose excerpt does not exist in the document text.

### Phase 6 — Scanner precision (reduce false positives)
1. Tier the categories: high-precision patterns (AAMA 2605, ASTM E283…) pass alone; low-precision ones (`color:`, `NOA`) require a corroborating keyword within N chars or ≥2 pattern hits.
2. Return all matches per category (not first-hit-wins); rank by pattern precision; show count in UI.
3. Suppress boilerplate: findings inside Division 00/01 sections get labeled as contract-level, not glazing-scope.

### Phase 7 — Real-fixture test suite
1. Build test fixtures that reproduce the three real formats: spec book with running footers + pageless TOC; multi-column drawing sheet; textless scan.
2. Regression tests pinned to the exact bugs above (TOC page can't own a section; dedupe prefers body evidence; drawing sheet yields Div 08 list; AI finding with fabricated excerpt is rejected).
3. Keep a small library of real spec PDFs out of the repo (local test folder) with expected-output JSON snapshots.

---

## 4. Suggested Order & Effort

| Phase | Fixes | Est. size | Depends on |
|-------|-------|-----------|------------|
| 1. Boundary rewrite | wrong sections, wrong mapping | L | — |
| 4. Links/highlights | dead links, no highlight | M | 1 |
| 5. AI grounding | hallucinations | S–M | — (parallel with 1) |
| 2. Drawing-sheet mode | Tricity-class inputs | M–L | 1 |
| 3. OCR path | Mclaughlin-class inputs | M | 2 |
| 6. Scanner precision | noisy findings | S | — |
| 7. Test suite | keeps it fixed | M | 1–5 |

Phases 1 → 4 → 5 deliver the "it finally works on a normal spec book" milestone. 2 and 3 extend coverage to drawing-set specs. This ordering also front-loads everything the future **site version** reuses — the whole engine stays client-side (pdfjs + pdf-lib), so the web port inherits the fixed pipeline as-is; only the Electron IPC save path gets swapped for browser downloads.

## 5. Constraints honored
- Builder stays JSX-only; all engine changes in `apps/builder/src/lib/` remain plain JS.
- No `localhost:8000`; OCR options are local (tesseract.js or existing sidecar).
- `.gbid` persistence untouched; frozen IPC namespaces untouched.
