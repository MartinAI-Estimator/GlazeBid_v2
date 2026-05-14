# GlazeBid v2 AiQ — Constraint Verification Session Summary

**Date:** April 17, 2026  
**Project:** GlazeBid v2 / AiQ drawing intelligence engine  
**Repo:** MartinAI-Estimator/GlazeBid_v2, master branch

---

## Problem Framing

Current AiQ pipeline on McLarty Mazda ground truth:
- **Recall:** 91%
- **Precision:** 13%

The rules-based geometry engine finds real glazing reliably but can't discriminate glazing from other rectangular features. Raising size thresholds further won't close the gap — it trades recall for precision linearly with no net improvement.

---

## Key Insight — The Breakthrough

**Stop trying to *discover* glazing. Start *verifying* it.**

Drawings aren't designed to be geometrically parsed in isolation — they're designed to be read cross-referentially. Schedules and elevations carry the authoritative mark + dimension data. Feed those as constraints into the existing geometry engine and the candidate space collapses.

---

## Architectural Decisions

- **Additive, not a rewrite.** Geometry engine stays put. A new verification layer sits downstream of it.

- **Fallback hierarchy for constraint sourcing:**
  1. Schedule exists → use Sprint 3 schedule parser
  2. No schedule but elevations exist → extract marks from elevations (new work)
  3. Neither → flag as unconstrained; no silent failures

- **Fully local.** No cloud VLM. Title-block OCR via Tesseract; vector text preferred where available.

- **Shared `ConstraintProvider` interface.** Verification logic is source-agnostic — schedule and elevation adapters both emit the same `ConstraintSet` shape.

---

## What Was Resolved This Session

- Schedule parser already exists (Sprint 3) — confirmed in codebase
- McLarty has no schedule — confirmed; elevation-mark path is required for this job
- Size-filter tuning is exhausted as a precision lever — not worth further investment
- Cloud VLM is off the table (on-device constraint)
- Elevations-as-schedule is the correct fallback for smaller commercial jobs (dealerships, strip retail, small institutional)

---

## Deliverable — Dual Experiment Spec

**File:** `AIQ_CONSTRAINT_EXPERIMENTS_SPEC.md` — ready to hand to VS Code Claude

### Experiment 1 — Hope Aquatic (Schedule-Constrained Verification)
- Run Sprint 3 schedule parser → extract marks + dimensions
- Use as constraints for geometry engine verification
- **Target:** Precision ≥60%, Recall ≥85%
- Branch: isolated, no merge to master without Martin review

### Experiment 2 — McLarty Mazda (Elevation-Mark-Constrained Verification)
- No schedule — extract glazing marks (`SF-`, `CW-`, `W-`, `GL-` prefixes) and dimensions from elevation sheets via vector text + OCR
- Feed as constraints to geometry engine
- **Target:** Precision ≥50%, Recall ≥80%
- Branch: isolated, no merge to master without Martin review

### Shared Rules for Both Experiments
- Baseline unconstrained run recorded on both sets for direct lift comparison
- ±20% dimensional tolerance for candidate matching
- Dimension match only — count logged but not enforced (count-as-constraint is a follow-up knob)
- Explicit no-silent-failure rule when zero marks extracted — surface warning, do not proceed silently
- Dev server restart required before any debugging — suspected root cause of prior Studio debug cycle

---

## Open Items for Next Session

- [ ] Confirm mark prefix list for project-specific conventions after first experiment run
- [ ] Design consolidation PR structure if Experiment 1 succeeds (promote verification layer to master behind a feature flag)
- [ ] Count-as-constraint enforcement as follow-up once dimensional match is proven
- [ ] Define what "partial" constrained confidence means in practice — how should the UI surface it?

---

## Workflow Reminder

Three-way build process:
1. **This Cowork instance** — architecture decisions, session continuity, sprint review
2. **VS Code Claude** — implementation; spec goes here
3. **Martin** — domain expert, PM, review gate; results come back to Martin before anything merges

Spec → VS Code Claude. Results → Martin review. Nothing merges to master without Martin sign-off.
