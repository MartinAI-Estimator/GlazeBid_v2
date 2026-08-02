# Spec Splitter — company features design

Written 2026-07-15. Extends SPEC_SORTER_FIX_PLAN.md and UI_SPEC_SPEC_SORTER.md with four
requirements from the owner. Read those two docs first.

---

## 1. Company playbook

### Decision: fillable playbook, not hard-coded rules

The company authors its own playbook; the program compiles and enforces it. Hard-coding
one company's rules would make the product unsellable. Architecture is two layers:

```
┌───────────────────────────────────────────────┐
│ Layer 2: COMPANY PLAYBOOK (user-authored)     │  overrides + additions
├───────────────────────────────────────────────┤
│ Layer 1: GLAZING BASELINE (ships with app)    │  the existing 35 SCAN_CATEGORIES
└───────────────────────────────────────────────┘  + CHECKLIST_GROUPS meaning lines
```

### Playbook file: `company-playbook.json`

Stored per company (app settings dir), NOT per project. Projects reference it; a project
can carry local overrides. Shareable across the company's estimators by copying one file.
Human-visible fields are plain language; compiled scan rules are stored alongside them.

```json
{
  "playbookVersion": 1,
  "company": "ABC Glazing Co",
  "updated": "2026-07-15",
  "scope": {
    "alwaysReview": ["00", "01", "02", "05", "07", "08"],
    "neverBid": ["blast-resistant glazing", "detention glazing"]
  },
  "watchItems": [
    {
      "id": "wi-001",
      "instruction": "Flag any spec that makes the glazing contractor pay for field water testing",
      "severity": "risk",
      "meaning": "Testing is on our dime — add a test day plus crew to the number.",
      "compiled": { "patterns": ["field\\s+(water|quality)\\s+test", "ASTM\\s+E1105"], "requireNear": ["glazing contractor|glazier|by the installer"], "nearWindow": 200 },
      "compiledBy": "ai", "compiledAt": "2026-07-15", "enabled": true
    }
  ],
  "overrides": [
    { "categoryKey": "fireRating", "severity": "risk", "note": "We only bid 45/60-min. 90+ goes to review." }
  ],
  "preferredManufacturers": ["Kawneer", "Oldcastle", "YKK AP"],
  "chatGuidance": "We self-perform caulking. We do not do auto-operators — flag them as excluded scope."
}
```

### Authoring flow (two ways in, same result)

1. **Form editor in-app** (primary): Settings → Playbook. Add watch item = one text box
   ("What should we look for?"), severity picker, optional "what it means for the bid"
   line. No regex exposed, ever.
2. **Upload a filled template** (for company rollout): a .docx/.md template the company
   fills out section by section (scope, watch items, never-bid list, manufacturers).
   The app parses it with AI into the same JSON.

### Compilation (plain language → scan rules)

- On save/upload, each `instruction` is sent to Claude (via the company's own key — see
  §4) with a strict contract: return `{patterns[], requireNear[], severity, meaning}`
  JSON only. Stored in `compiled`.
- Compiled rules run in the same local regex engine as the baseline categories — scanning
  stays offline; AI is only needed when the playbook changes.
- Every compiled rule is auto-tested against the instruction text itself and shown to the
  user with a live preview: "Try it: paste a sentence that should match." Failed
  compilations stay disabled with a visible badge.
- No API key present → watch items can still be saved; app falls back to plain keyword
  matching derived from the instruction (degraded but functional), badge "basic matching".

### Report integration

- Playbook findings render exactly like baseline findings (same verified-citation rules)
  with a "Your playbook" tag so estimators see company rules firing.
- `neverBid` hits render at the top of the report as a stop-sign banner: "Your playbook
  says you don't bid this: blast-resistant glazing (found in 08 88 53, p. 214)."

---

## 2. Document organization and saving

Extends the existing `saveSections` IPC (works today, unstructured output).

### Output structure (default, configurable)

```
<chosen root>\<Project Name>\Specs\
├── 00 Procurement & Contracting\
│   ├── 00 21 13 - Instructions to Bidders.pdf
│   └── 00 72 00 - General Conditions.pdf
├── 01 General Requirements\
│   └── 01 25 00 - Substitution Procedures.pdf
├── 07 Thermal & Moisture\
│   └── 07 92 00 - Joint Sealants.pdf
├── 08 Openings\
│   ├── 08 41 13 - Aluminum-Framed Entrances and Storefronts.pdf
│   └── 08 80 00 - Glazing.pdf
└── _Full Report.pdf        ← the risk report, exported
```

### Behaviors

- "Save my scope" one-click: saves every in-scope + worth-reviewing section, organized as
  above. "Save selected" still available for cherry-picking.
- Naming template configurable in settings: `{number} - {title}.pdf` default; tokens
  {number} {title} {division} {project}. Sanitized for Windows filenames (exists).
- Remember last output root per project in the .gbid; global default in settings.
- After save: success toast with "Open folder" (Electron `shell.openPath`).
- Manifest file `_sections.json` written alongside (section list, page ranges, confidence,
  source PDF hash) so a re-split can diff against the previous save.
- Site version: same structure delivered as a .zip download (JSZip client-side); no
  behavior fork in the section-splitting code.

---

## 3. Division 00 / 01 / 02 coverage

### Engine status (verified, not assumed)

specSorterV2 already parses ALL divisions — the Brighton test detected 00 01 10 (TOC),
every 01 section, and 02 41 19. Splitting is NOT the gap. The gaps are scope-flagging
and scan categories.

### Changes

1. **Scope flags**: add '00' and '02' to review scope. Replace the single
   `GLAZING_DIVISIONS` set with two: `SCOPE_DIVISIONS = {08}` (my scope) and
   `REVIEW_DIVISIONS = {00, 01, 02, 05, 07}` (worth reviewing — where the money traps
   live). Both become playbook-overridable (§1 `scope.alwaysReview`).
2. **Pre-checked for scanning**: Div 00/01/02 sections default-checked alongside Div 08.
3. **New scan categories** (specScanner.js SCAN_CATEGORIES) — these exist already:
   liquidatedDamages, retainage, bondRequirements, insuranceRequirements, payWhenPaid,
   prevailingWage, ocip, workingHours, phasing, closeout, ownerFurnished. ADD:
   - `taxes` — sales/use tax status, tax-exempt owner, contractor-pays-tax language.
     Patterns: /sales\s+tax/i, /use\s+tax/i, /tax[\s-]exempt/i, /taxes?\s+(included|excluded|paid by)/i.
     Meaning: "Confirm tax treatment before pricing — exempt project vs contractor-paid changes your number."
   - `bidForms` — bid form / bid bond form / proposal form identification.
     Patterns: /bid\s+form/i, /form\s+of\s+proposal/i, /bid\s+bond\s+form/i.
     Meaning: "Required bid paperwork found — download and fill before bid day." Severity: info, but
     surfaced in a dedicated "Bid day paperwork" group in the report.
   - `substitutionForms` — substitution request form + deadline.
     Patterns: /substitution\s+request\s+form/i, /substitutions?.{0,40}(days?|deadline|prior to bid)/i.
     Meaning: "Substitution deadline — if you're quoting an equal, the clock is running."
   - `contractTerms` — governing contract form (AIA A201, ConsensusDocs, custom).
     Patterns: /AIA\s+(Document\s+)?A\d{3}/i, /ConsensusDocs/i, /general\s+conditions\s+of\s+the\s+contract/i.
     Meaning: "Contract form identified — send to whoever reviews your subcontracts."
4. **Report grouping**: findings from Div 00/01/02 render under "Contract & general
   conditions" with the same verified citations. Bid-form findings under "Bid day paperwork".

---

## 4. AI chat as a connector + built-in spec intelligence

### Bring-your-own Anthropic account

- Settings → AI connection: paste Anthropic API key, "Test connection" button, model
  picker (default claude-sonnet-latest). Key stored locally via Electron `safeStorage`
  (OS-level encryption), NEVER in .gbid files, never leaves the machine except to
  Anthropic's API directly.
- All AI features check one gate: playbook compilation (§1), AI-enhanced scanning,
  RFI drafting, and Spec Chat. No key → those features show "Connect your Anthropic
  account" with everything else fully functional (the regex engine, splitting, saving,
  and report work 100% offline).
- Site version: same BYO-key model; calls go browser → Anthropic (CORS permitting) or
  through the company's own proxy — never through a GlazeBid server holding keys.
- Existing `window.electronAPI.aiChat` IPC stays the transport; the main process reads
  the stored key instead of any bundled one. IPC channel names unchanged (frozen).

### Built-in spec intelligence (the "supercharge")

A versioned instruction pack shipped with the app — this is GlazeBid IP, layered onto
every chat/AI call regardless of whose key runs it:

```
apps/builder/src/ai/specIntelligence.js   (exports versioned prompt blocks)
├── CORE          — glazing spec expertise: MasterFormat structure, Div 08 section map,
│                   basis-of-design vs approved-equal logic, AAMA/ASTM test meanings,
│                   finish classes, IGU warranty norms, scope-gap patterns (07 92 sealants,
│                   05 50 steel, 26/28 electrification)
├── GROUNDING     — citation contract: answer only from provided spec text; every claim
│                   cites section + page; verbatim quotes; "not found in this spec" is a
│                   required answer when true (mirrors Phase 5 verification rules)
├── ESTIMATOR     — voice: money-consequence first, estimator language, flag what needs
│                   a GC question, never legal advice
└── PLAYBOOK      — injected at runtime: company chatGuidance + watchItems + neverBid
                    so chat answers reflect company rules ("we self-perform caulking")
```

- Chat context: the extracted section texts (per-page, with page numbers) for whatever
  sections the user has loaded, chunked to fit. Answers must cite; the UI renders
  citations as the same verified page links as report findings (verify excerpt exists
  before rendering the link — Phase 5 rule applies to chat too).
- Pack is versioned (`specIntelligenceVersion`) and updates ship with the app —
  companies get smarter chat without touching their playbook.

---

## Build order (extends the existing phase plan)

| Step | What | Depends on |
|---|---|---|
| A | Div 00/02 scope flags + 4 new scan categories (§3) | nothing — do with UI build |
| B | Organized saving (§2) | nothing — extends working IPC |
| C | BYO key settings + gate + specIntelligence pack (§4) | nothing |
| D | Playbook: JSON format + form editor + report integration (§1) | C (compilation needs key) |
| E | Playbook: template upload + AI parse | D |

A and B are small and should ride along with the UI implementation. C before D because
playbook compilation uses the company key. All of this is Builder-side JSX + one Electron
main-process change (safeStorage for the key) — no frozen contracts touched.
