# Prompt for VS Code Claude — Spec Splitter: fixes, UI, and company features

Copy everything below the line into Claude Code. (v2 — supersedes the earlier version; now includes the UI rebuild and company features.)

---

You are working in the repo `C:\Users\mjaym\GlazeBid v2` — an Electron app for commercial glazing estimating with two React apps: Builder (`apps/builder/`, plain JSX, port 5173) and Studio (`apps/studio/`, TypeScript strict, port 5174).

**Read these files first, in this order:**
1. `CLAUDE.md` (repo root) — project rules. Critical: Builder is JSX-only (never add TypeScript under `apps/builder/src/`), never call `localhost:8000`, IPC channel names and the `window.electronAPI` / `window.electron` preload namespaces are frozen.
2. `SPEC_SORTER_FIX_PLAN.md` — diagnosis and 7-phase engine fix plan, with test evidence from real spec PDFs.
3. `UI_SPEC_SPEC_SORTER.md` — the full UI redesign spec (3-stage layout, components, states, interpretation rules, acceptance criteria).
4. `SPEC_SPLITTER_COMPANY_FEATURES.md` — company playbook, organized saving, Div 00/01/02 coverage, BYO Anthropic key + spec intelligence pack.

**Context you have no other way of knowing:**
The Spec Splitter feature (splits construction spec PDFs into MasterFormat sections, flags Division 8 glazing scope, scans for risk findings) was unreliable: wrong boundaries, links to wrong pages, highlights never rendering, AI-hallucinated findings. A diagnostic session on 2026-07-15 tested against 3 real spec PDFs, traced every symptom to root causes (fix plan §2), and fixed the boundary engine.

**Phase 1 is already done.** New engine at `apps/builder/src/lib/specSorterV2.js`, validated against real PDFs. Per-page attribution: every page declares its owner section via running header/footer bands ("HOLLOW METAL DOORS AND FRAMES 08 11 13 - 8"). On the Brighton Project Manual (298 pages): 57 sections, 100% page coverage, all high-confidence. Returns `{ needsOcr: true }` for scanned PDFs. Exports `parseSpecSectionsV2(pdfBuffer)` (superset of the V1 contract, adds `confidence` + `detectionMethod` per section) and `attributePages(doc, totalPages)`.

**Existing files (keep V1 as reference until V2 is fully integrated):**
- `apps/builder/src/lib/specSorter.js` — V1 engine (buggy: TOC digits treated as absolute pages; header-scan skipped when TOC matches; dedupe poisoned by TOC mentions).
- `apps/builder/src/lib/specScanner.js` — regex risk scanner (~35 categories in `SCAN_CATEGORIES`) + `aiEnhanceSection` (accepts unverified AI findings — hallucination source).
- `apps/builder/src/lib/specReader.js` — rules-based extraction of 6 estimator categories.
- `apps/builder/src/components/SpecSorterPage.jsx` (~2,675 lines) — main UI. Key spots: `handleScan` (~1886), `handleJump` (~2032), citation link `r.highlight || r.text` fallback (~1425), `PageCanvas` highlight overlay (~795–1020), `CHECKLIST_GROUPS` with `impact` strings.
- `apps/builder/src/utils/specSectionExtractor.js` — compat wrapper, delegates to V1.
- `apps/builder/src/components/SpecViewer.jsx`, `SpecChatPanel.jsx`.
- Tests: `apps/builder/src/lib/specSorter.test.js`, `specReader.test.js` (`npm run test:run` from `apps/builder/`). Warning: the V1 test uses a synthetic PDF whose TOC lists absolute page numbers — real specs don't, which is why tests were green while the product was broken.

**Test PDFs** (real fixtures, keep out of git): `C:\Users\mjaym\OneDrive\Arch Drawing Markups\Specs\`
- `Project Manual - Bid Specs.pdf` — expect 57 sections via page-attribution, 16 Div 08, `08 11 13 HOLLOW METAL DOORS AND FRAMES` at p.220–227 (NOT p.3 — that's the TOC), extended numbers `03 15 16.13` / `07 42 13.19` detected.
- `Tricity Family - Bid Specs.pdf` — 2 drawing sheets, specs in columns. Phase 2 target, not now.
- `Mclaughlin - Bid Set.pdf` — 13-page scan, no text layer. Must show the OCR-needed state, never a silent zero.

---

## Work plan — commit after each task

### Task 1 — Wire V2 into the app
Replace V1 `parseSpecSections` with `parseSpecSectionsV2` in `SpecSorterPage.jsx` and `specSectionExtractor.js`. Handle new fields: per-section `confidence`, `detectionMethod`, and the `needsOcr` result. Keep selection/extraction/scanning flow working.

### Task 2 — Regression tests
`apps/builder/src/lib/specSorterV2.test.js` with pdf-lib fixtures mimicking REAL formats: (a) running footers `<TITLE> <NN NN NN> - <n>` on every page + a TOC WITHOUT page numbers; (b) TOC page mentioning section numbers — assert it can never become a section's startPage; (c) extended numbers `03 15 16.13`; (d) empty-text PDF → `needsOcr: true`.

### Task 3 — UI rebuild per UI_SPEC_SPEC_SORTER.md
Implement the 3-stage layout (Upload → Sections → Risk report), scope-first section list (My scope / Worth reviewing / All), confidence dots + boundary editor, verdict header with grade + plain-language sentence, meaning-first finding cards, OCR/partial-text/zero-section states. Follow the spec's component inventory and acceptance criteria exactly. New components use the `--ss-*` token names (mapped to the current dark palette), no hardcoded hex.

### Task 4 — Links and highlights (fix plan Phase 4)
Capture citation locations at scan time: when a category matches in `specScanner.js`/`specReader.js`, record `{absolutePage, verbatim excerpt, char offsets, pdfjs item rects}`. `PageCanvas` draws stored rects — no render-time re-search. Delete the `r.text` jump fallback. Findings without verified locations render text-only, no page link.

### Task 5 — AI grounding (fix plan Phase 5)
In `aiEnhanceSection` and `SpecChatPanel.jsx`: verify every AI-returned excerpt exists verbatim (normalized) in extracted page texts before display. Not found → discard or badge "AI-suggested, unverified", no page citation. Page number comes from where verification found the text, never from the model. Prompt for exact quotes.

### Task 6 — Div 00/01/02 coverage (company features §3)
In `specSorterV2.js`: replace `GLAZING_DIVISIONS` with `SCOPE_DIVISIONS = {08}` and `REVIEW_DIVISIONS = {00, 01, 02, 05, 07}` (output gains `isReviewRelevant`; keep `isGlazingRelevant` for compat). Div 00/01/02 sections default-checked for scanning. Add 4 scan categories to `SCAN_CATEGORIES` with the patterns and meaning lines specified in SPEC_SPLITTER_COMPANY_FEATURES.md §3: `taxes`, `bidForms`, `substitutionForms`, `contractTerms`. Report groups: "Contract & general conditions" and "Bid day paperwork".

### Task 7 — Organized saving (company features §2)
Extend the existing `saveSections` IPC flow: division subfolders (`08 Openings\08 41 13 - Title.pdf`), configurable naming template `{number} - {title}.pdf`, "Save my scope" one-click (all in-scope + review sections), remember output root per project in .gbid + global default, post-save "Open folder" (`shell.openPath`), `_sections.json` manifest (section list, ranges, confidence, source hash). Do not rename IPC channels.

### Task 8 — BYO Anthropic key + spec intelligence pack (company features §4)
Settings → AI connection: API key input, stored via Electron `safeStorage` (main process; never in .gbid), test-connection button, model picker. Gate ALL AI features on key presence with a "Connect your Anthropic account" state; everything non-AI must work keyless. The spec intelligence pack ALREADY EXISTS at `apps/builder/src/ai/specIntelligence.js` — fully authored (CORE glazing expertise / GROUNDING citation contract / ESTIMATOR voice / PLAYBOOK injection). Do NOT rewrite its content. Wire it in: every AI call builds its system prompt via `buildSystemPrompt({ mode, playbook })` — mode 'chat' for SpecChatPanel, 'scan' for aiEnhanceSection, 'rfi' for RFI drafting, 'playbookCompile' for Task 9. Existing `aiChat` IPC stays the transport; main process reads the stored key.

### Task 9 — Company playbook (company features §1)
`company-playbook.json` format as specified. Settings → Playbook form editor (plain-language watch items, severity, meaning line — no regex exposed). AI compilation of instructions → `{patterns, requireNear, severity, meaning}` via the company key, with live "try it" preview and disabled-badge on failed compiles; keyword-matching fallback when keyless. Playbook findings render like baseline findings tagged "Your playbook"; `neverBid` hits render as a stop banner atop the report. Template upload (.docx/.md → AI parse) is last and optional if time-boxed.

---

**Order**: 1 → 2 → 3 → 4 → 5, then 6 and 7 (small, independent), then 8 → 9 (9 depends on 8). Commit after each task. Run `npm run test:run` (apps/builder) after every task; manually verify against the three real PDFs via `npm run dev:builder` (repo root) after tasks 3, 5, 7, and 9.

**Acceptance criteria (all must hold at the end):**
- Project Manual: 57 sections, 08 11 13 at p.220–227, TOC pages own no content sections; Div 00/01/02 sections appear under "Worth reviewing" and are scanned by default.
- Mclaughlin: explicit OCR-needed UI state.
- Every rendered "→ p.X" link lands on a page with the excerpt visibly highlighted; zero displayed findings whose excerpt doesn't exist in the document text.
- A first-time user goes from PDF drop to reading the risk report without instructions; Div 08 scope visible immediately after detection.
- "Save my scope" produces the division-folder structure with the manifest.
- With no API key: splitting, scanning, report, and saving all work; AI features show the connect state.
- Playbook watch items written in plain language fire in the report with verified citations and a "Your playbook" tag.
- No TypeScript under `apps/builder/src/`. No new backend calls. No frozen IPC/namespace changes.
