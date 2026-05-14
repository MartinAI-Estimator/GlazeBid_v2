# GlazeBid Strategy Session — Full Context Summary

**Date:** April 17, 2026  
**Type:** Architecture + Competitive Strategy + AI Training Roadmap  
**Repo:** MartinAI-Estimator/GlazeBid_v2, master branch

---

## Topic 1 — Autonomous Takeoff Engine Architecture

### The Core Insight
The drawings are not the source of truth — **the architect's intent is**. Drawings are a lossy 2D projection of that intent. The system reconstructs intent from evidence scattered across 400 pages.

### Layer 1 — The Vision Engine (Spatial Reconstruction)

**Dual-pass protocol:**
1. **Geometric extraction pass** — uses pdfmium to identify all wall openings as UUID-tagged candidates
2. **VLM semantic classification pass** — GPT-4o Vision or Claude classifies each opening using surrounding context: tag presence, room adjacency, linework weight, exterior wall proximity

**Sheet Router** runs first on every page — classifies into:
- Floor Plan / Elevation / Section+Detail / Schedule / Specification
- Queues each sheet type for the appropriate downstream process before any analysis runs

### Layer 2 — The Brain (Contextual Cross-Referencing)

**Intent Graph** — a directed property graph (kuzu or Neo4j) where every piece of extracted information becomes an **Evidence Object** with:
- Source coordinates
- Extracted value
- Confidence score

**Edges encode cross-document relationships:**
- `W1` on floor plan → `W1` on elevation → `Detail 8/A501` → `Spec 08.41.13`

**Scoped Evidence Bundle** assembled per assembly tag → sent to long-context model for reconciliation.

**Conflict handling:** Contradictions between documents generate a **Conflict Node** flagged for human review — no silent resolution.

**Priority hierarchy (highest to lowest):**
Spec → Schedule → Elevation note → Floor Plan tag

### Layer 3 — The Soul (Trust & Implication Protocol)

**Citation Stack** — every Assembly Record carries an immutable ordered array of Evidence Objects pointing to exact page, bounding box, and pixel for every quantity and specification. Every line item in the Studio UI is clickable and jumps to the source document.

**Implication Engine** — rules-based expert system that runs after assembly resolution. Asks what the scope implies that isn't explicitly drawn:
- Span rules: >24' unsupported → structural steel flag
- Stack joint rules
- Thermal break rules
- Sill condition rules
- Hardware implication rules

Every implied item gets a citation of type `"implied_by_rule"`.

**Final output:** IFC-compatible 3D BIM object from which the Bill of Materials is computed deterministically.

---

## Topic 2 — Competitive Benchmarking

### Difficulty Rating for Automated Glazing Takeoff
**7–8 / 10** — compared to:
- General construction quantity takeoff: **4/10** (largely solved by Togal.AI, STACK)
- MEP linear takeoff: **5/10** (mostly solved)

**Why glazing is harder:**
- No standardized symbol language
- Multi-document cross-referencing requirement
- Implied scope that exists nowhere in the drawings

**The window:** Opened 18–24 months ago with long-context vision-language models. The market segment is genuinely empty.

**The moat:** AiQ already partially built + 15 years of domain expertise = defensible position.

### AI Tool Landscape
| Tool | Best Use |
|---|---|
| Claude Code | Deep reasoning, architectural problems — escalation path when others fail |
| Cursor | Daily in-editor flow |
| Devin (Cognition Labs) | Most autonomous software engineer agent |
| MIT "vericoding" (Max Tegmark) | Frontier for provably correct code generation |

### Get Physics Done (GPD)
- Open-source agentic AI physicist by Dr. Alex Wissner-Gross / Physical Superintelligence PBC
- Scopes a physics problem, builds phased roadmap, executes derivations, verifies against physical laws
- Runs inside Claude Code, Gemini CLI, Codex, OpenCode
- Apache 2.0 licensed — github.com/psi-oss/get-physics-done
- **Not directly applicable to glazing** (physics-specific hardcoded domain rules) but its methodology is the exact template

---

## Topic 3 — AI Training Roadmap

### GPD as a Methodology Template

| GPD Stage | GlazeBid Equivalent |
|---|---|
| Formulate | Sheet routing, identify glazing candidates |
| Plan | Cross-reference tags to elevations/details |
| Execute | AiQ detection + GANA rule application |
| Verify | Constraint validator + implication engine |

### The Data Moat
The blueprint reading sessions (walking Claude through drawings the way you'd train a junior estimator + systematic GANA Glazing Manual breakdown) are capturing the **reasoning chain**, not just the answer.

- **Reading** = what OCR does (extracts "W1" as a string)
- **Understanding** = what an estimator does (sees W1, flips to elevation, checks detail, notices 34-foot span, mentally flags missing structural anchor)

A 15-year glazing estimator narrating their thought process over a full drawing set is a training signal no off-the-shelf dataset has. **This is the data moat.**

### Four Concrete Next Steps

1. **Formalize the GANA extraction** into a structured Domain Constraint Library with testable rules (Rule ID, Condition, Implication, Source, Verification method)
2. **Structure blueprint reading sessions** into labeled reasoning pairs (drawing crop + expert reasoning chain + classified output with citations)
3. **Build a constraint validator** that runs every AiQ output against the GANA library and flags violations
4. **Run a full real bid set** through the pipeline against known ground truth — measure recall, precision, and implied item capture rate

The 6–8 weeks of GANA extraction and blueprint training work is the most leveraged work in the project. The code is already good. The domain knowledge encoding is what makes it defensible and what separates a pattern detector from a verifiable expert system.

---

## Topic 4 — Strategy Document Review

**Rating: 8.2 / 10**

### Strengths
- Core premise is exactly right — make the entire day faster, not feature-for-feature matching
- Competitive diagnosis of PartnerPak is accurate: Windows-only, `.dat` file collaboration, Kawneer lock-in, subscription tier gating are real daily pain points
- Prioritization order is correct: frame builder correctness → AiQ → multi-manufacturer → collaboration
- First 10 shops as proof case + side-by-side demo strategy is the right go-to-market instinct
- AiQ as a structural moat that PartnerPak cannot replicate without rebuilding from scratch is accurate and defensible

### Gaps
- **Phase 3 (Citation Intelligence ecosystem lock-in)** appears too early — it's a Year 2–3 story getting equal visual weight with launch features
- **"Flat per-seat" pricing** needs a specific number to be actionable — the value argument requires a concrete delta against PP's tier pricing
- **Cloud collaboration** is table stakes for 2025 software, not a Phase 2 moat — should move to Phase 1; structural analysis standard should move up
- **Out-of-square geometry handling** is understated — it's a real market pain point that deserves more emphasis
- **Biggest risk not named:** Frame builder correctness must be provably verified before AiQ ships. One wrong BOM on a $1.5M job destroys trust permanently

### Line Recommended for Deletion
> "GlazeBid's opportunity is not to build a better PartnerPak"

Correct as philosophy but undersells the ambition. **Better framing:** GlazeBid makes PartnerPak irrelevant the same way smartphones made GPS units irrelevant.

---

## Current GlazeBid v2 State (As of This Session)

- AiQ engine: 61 passing tests, merged to master
- McLarty Mazda ground truth: **91% recall, ~12–13% precision** (excess candidates are the key remaining challenge)
- Four unresolved Studio UI issues: right-click context menu, zoom blocking over frame overlays, bays/rows popup, click actions on green frame boxes
- Architecture: Electron desktop, Builder (React/JSX, port 5173), Studio (React/TS, port 5174), SQLite, IPC bridges, Zustand stores
- Marketing site live at glazebid.netlify.app
- Three-way workflow: this Claude instance (architecture/strategy) → VS Code Claude (implementation) → Martin (domain expert + PM + review gate)
