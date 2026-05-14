# Feature Concept: Shop Drawing Digitization / Interactive Field Tracking

**Date:** April 17, 2026  
**Status:** Ideation — No architecture decisions made yet  
**Source:** Product discussion with Martin

---

## The Problem

Shop drawings are already digital PDFs on most jobs, but they are static and not actionable. Foremen currently track installed units on paper, memory, or whiteboards. The unit marks, elevation IDs, and frame identifiers already exist on shop drawings — they're just not interactive.

---

## The Proposed Feature

1. A user (coordinator or foreman) drops a shop drawing PDF into the app
2. The PDF becomes a "living interactive document"
3. Field glaziers can track installed scope directly on the drawing — marking units as installed in real time

---

## Strategic Value

The most valuable version closes a full GlazeBid loop:

```
Estimate → Shop Drawing → Field Install Tracking → Actual Quantities → Builder (cost reconciliation)
```

No tool in the glazing space owns that end-to-end workflow. That's the disruptive framing. Procore and PlanGrid do general interactive markup for GCs, but nothing is glazing-specific.

---

## Three Interactive Layer Generation Approaches

| Approach | Description | Tradeoff |
|---|---|---|
| **Manual setup** | Office staff defines clickable zones before sending to field | Simple to build; adds pre-field labor |
| **AiQ-assisted auto-detection** | Engine identifies unit marks and frames; coordinator reviews and publishes | Most powerful; aligns with existing AiQ work — preferred path |
| **Field-driven annotation** | Glazier taps to mark units themselves | Least setup; least structured |

---

## Key Constraints / Requirements

- **Offline-first is non-negotiable.** Job site connectivity is poor. Sync architecture is a real engineering requirement, not an afterthought.
- **UI must be 2–3 taps maximum** for the core action ("I installed this unit"). Field glaziers are not power users — adoption dies otherwise.
- **Setup ownership must be defined.** Who configures each job before field use, and how much effort does that take?
- **Stay glazing-specific.** Feature must not drift into generic plan room / markup territory.

---

## AiQ Relevance

AiQ (Python FastAPI sidecar at `localhost:8100`) already does:
- PDF normalization
- Sheet routing
- Vector graph extraction
- Glazing candidate detection

The delta between estimating use and field tracking use is meaningful but not a full rebuild. AiQ is the natural engine for auto-detecting unit marks and frame IDs on shop drawings.

---

## Open Questions (No Decisions Made)

- [ ] Which interactive layer generation method to pursue
- [ ] Where this feature lives — Studio extension? New module? Standalone field companion app?
- [ ] Offline sync strategy (IndexedDB? SQLite sync? File-based?)
- [ ] Relationship to AiQ pipeline reuse vs. new parsing logic
- [ ] What is the simplest possible v1 a foreman would actually use on day one?

---

## Recommended Next Step

Define the simplest possible version a foreman would actually use on day one of a job — before any architecture decisions. Wireframe the core 2–3 tap interaction first.

---

## GlazeBid v2 Context

- Electron desktop app (Windows-first)
- Builder: React/JSX, port 5173
- Studio: React/TS, port 5174
- AiQ sidecar: Python FastAPI, localhost:8100
- State: Zustand stores, `.gbid` local JSON files
- IPC: Custom Electron IPC bus, dual preload APIs
