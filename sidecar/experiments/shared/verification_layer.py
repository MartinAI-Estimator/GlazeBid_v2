"""
verification_layer.py — §2.2 / §2.3

Post-processing verification filter.  Given a list of pipeline candidate dicts
and a ConstraintSet, each candidate is annotated with a ``constraint_status``
field and an explanatory ``constraint_note``.

Fallback (§2.3): if the ConstraintSet carries zero marks (confidence ==
"unconstrained"), every candidate passes through unchanged and a WARNING is
logged.  The caller can inspect ``candidate["constraint_status"] ==
"unconstrained"`` to detect this.

Usage::

    from experiments.shared.verification_layer import apply_verification
    from experiments.shared.constraint_types import ConstraintSet

    candidates = run_pipeline(pdf_path)          # list of dicts
    cs = extract_constraints(pdf_path)           # ConstraintSet
    annotated = apply_verification(candidates, cs)
"""

from __future__ import annotations

import logging
import warnings
from typing import Any

from .constraint_types import ConstraintSet, MarkConstraint

logger = logging.getLogger(__name__)

# ── constants ─────────────────────────────────────────────────────────────────
_DIM_TOLERANCE = 0.25      # ±25 % → "verified"
_REJECT_THRESHOLD = 0.50   # > 50 % deviation → "rejected"

# Map common system_hint values to the mark prefixes they should produce.
# Used to narrow which marks are plausible for a given candidate.
_HINT_TO_PREFIXES: dict[str, frozenset[str]] = {
    "STOREFRONT":  frozenset({"SF"}),
    "CURTAINWALL": frozenset({"CW"}),
    "WINDOW":      frozenset({"W"}),
    "GLAZED":      frozenset({"GL", "SG", "IG"}),
    "SPANDREL":    frozenset({"SP"}),
}


def _prefix_of(mark_id: str) -> str:
    """Return the alphabetic prefix part of a mark (e.g. 'SF' from 'SF-1')."""
    return mark_id.split("-")[0].upper() if "-" in mark_id else mark_id.upper()


def _plausible_marks(
    candidate: dict[str, Any],
    constraint_set: ConstraintSet,
) -> list[MarkConstraint]:
    """Return marks whose prefix is compatible with the candidate's system_hint.

    Falls back to *all* marks when the hint does not map to any prefix set.
    """
    hint = (candidate.get("system_hint") or "").upper()
    allowed = _HINT_TO_PREFIXES.get(hint)
    if allowed is None:
        return list(constraint_set.marks)
    return [m for m in constraint_set.marks if _prefix_of(m.mark_id) in allowed]


def _dim_score(
    candidate: dict[str, Any],
    mark: MarkConstraint,
) -> float:
    """
    Mean relative dimension error between candidate and mark.

    Returns a value in [0, ∞).  0 = perfect match; 0.25 = 25 % off; etc.
    Returns ``float("inf")`` when neither dimension is available.
    """
    c_w = candidate.get("width_ft")
    c_h = candidate.get("height_ft")
    scores: list[float] = []

    if mark.width_ft is not None and c_w is not None and c_w > 0:
        scores.append(abs(c_w - mark.width_ft) / mark.width_ft)
    if mark.height_ft is not None and c_h is not None and c_h > 0:
        scores.append(abs(c_h - mark.height_ft) / mark.height_ft)

    if not scores:
        return float("inf")
    return sum(scores) / len(scores)


# ── public API ────────────────────────────────────────────────────────────────

def apply_verification(
    candidates: list[dict[str, Any]],
    constraint_set: ConstraintSet,
    tolerance: float = _DIM_TOLERANCE,
    reject_threshold: float = _REJECT_THRESHOLD,
) -> list[dict[str, Any]]:
    """
    Annotate each candidate dict in-place with constraint verification results.

    Parameters
    ----------
    candidates
        Each dict must contain at minimum ``system_hint`` (str),
        ``width_ft`` (float | None), ``height_ft`` (float | None).
    constraint_set
        The :class:`~experiments.shared.constraint_types.ConstraintSet` built
        from the elevation extractor.
    tolerance
        Relative dimension error threshold for "verified" status (default 25 %).
    reject_threshold
        Relative error above which a candidate is "rejected" (default 50 %).

    Returns
    -------
    The same ``candidates`` list (mutated in-place) with two new keys added to
    each element:

    ``constraint_status``
        One of ``"verified"``, ``"rejected"``, ``"partial"``,
        ``"no_match"``, ``"unconstrained"``.
    ``constraint_note``
        Human-readable explanation of the status.
    """
    # ── §2.3 fallback: zero-mark unconstrained passthrough ───────────────────
    if constraint_set.confidence == "unconstrained" or not constraint_set.marks:
        msg = (
            "ConstraintSet has zero extractable marks — running unconstrained. "
            "All candidates pass through without dimension verification."
        )
        warnings.warn(msg, UserWarning, stacklevel=2)
        logger.warning("apply_verification: %s", msg)
        for c in candidates:
            c["constraint_status"] = "unconstrained"
            c["constraint_note"] = "no marks extracted from elevation sheets"
        return candidates

    logger.info(
        "apply_verification: %d candidates vs %d marks (confidence=%s)",
        len(candidates),
        len(constraint_set.marks),
        constraint_set.confidence,
    )

    for c in candidates:
        plausible = _plausible_marks(c, constraint_set)

        if not plausible:
            c["constraint_status"] = "no_match"
            c["constraint_note"] = (
                f"no marks plausible for system_hint="
                f"'{c.get('system_hint', '')}'"
            )
            continue

        # Find best-matching mark by dimension score
        best_mark: MarkConstraint = plausible[0]   # fallback: first plausible
        best_score = float("inf")

        for mark in plausible:
            score = _dim_score(c, mark)
            if score < best_score:
                best_score = score
                best_mark = mark

        if best_score == float("inf"):
            # Marks exist but neither side has dimensions → partial
            c["constraint_status"] = "partial"
            c["constraint_note"] = (
                f"mark(s) found ({[m.mark_id for m in plausible]}) "
                "but no dimensions available to verify"
            )
        elif best_score > reject_threshold:
            c["constraint_status"] = "rejected"
            c["constraint_note"] = (
                f"dimension mismatch vs {best_mark.mark_id}: "
                f"mean_error={best_score:.1%} > reject_threshold={reject_threshold:.0%}"
            )
        elif best_score <= tolerance:
            c["constraint_status"] = "verified"
            c["constraint_note"] = (
                f"matches {best_mark.mark_id} within {tolerance:.0%} "
                f"(error={best_score:.1%})"
            )
        else:
            c["constraint_status"] = "partial"
            c["constraint_note"] = (
                f"partial match vs {best_mark.mark_id}: "
                f"error={best_score:.1%} (>{tolerance:.0%}, <={reject_threshold:.0%})"
            )

    return candidates
