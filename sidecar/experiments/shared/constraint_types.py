"""
constraint_types.py — §2.1

Shared dataclasses for AiQ constraint-based verification experiments.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional


@dataclass
class MarkConstraint:
    """
    A single glazing-mark entry with optional dimension constraints.

    ``mark_id``   — The label as it appears on the drawing (e.g. ``"SF-1"``).
    ``width_ft``  — Nominal opening width in decimal feet, or ``None`` if not
                    determinable from the elevation drawing.
    ``height_ft`` — Nominal opening height in decimal feet, or ``None``.
    ``bay_count`` — Number of bays (panels) in the system, or ``None``.
    ``source_page`` — 0-based page index where the mark was extracted.
    """

    mark_id: str
    width_ft: Optional[float] = None
    height_ft: Optional[float] = None
    bay_count: Optional[int] = None
    source_page: int = -1


@dataclass
class ConstraintSet:
    """
    The full set of mark constraints extracted for one drawing set / experiment.

    ``marks``      — All extracted :class:`MarkConstraint` records.
    ``confidence`` — Overall extraction quality:

        * ``"constrained"``   — ≥ half the marks have usable dimension data.
        * ``"partial"``       — Marks found but fewer than half carry dimensions.
        * ``"unconstrained"`` — Zero marks could be extracted; verification is a
                                no-op and a WARNING will be emitted.

    ``source`` — Human-readable description of the extraction method and pages
                 used (e.g. ``"elevation_text pages=[0,1,4,5]"``).
    """

    marks: list[MarkConstraint] = field(default_factory=list)
    confidence: Literal["constrained", "partial", "unconstrained"] = "unconstrained"
    source: str = ""

    # ── convenience helpers ──────────────────────────────────────────────────

    def get(self, mark_id: str) -> Optional[MarkConstraint]:
        """Return the first MarkConstraint matching *mark_id*, or ``None``."""
        return next((m for m in self.marks if m.mark_id == mark_id), None)

    def mark_ids(self) -> set[str]:
        """Set of all mark labels in this set."""
        return {m.mark_id for m in self.marks}

    def has_dimensions(self) -> bool:
        """True if at least one mark has width or height data."""
        return any(
            m.width_ft is not None or m.height_ft is not None for m in self.marks
        )

    def __len__(self) -> int:
        return len(self.marks)
