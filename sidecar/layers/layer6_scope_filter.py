"""
layer6_scope_filter.py

Scope Filter for GlazeBid AiQ Pipeline.

Classifies GlazingCandidate objects as in_scope, out_of_scope, or scope_review
based on a configurable scope profile.

Default profile (Tier 1 glazing estimator):
    included:  storefront, curtain_wall, window_wall, frameless_glass, glass_railing
    excluded:  overhead_coiling, sectional, hollow_metal, louver, rolling_steel

Reads from scope_profile.json if present, otherwise uses built-in defaults.
Schedule cross-reference is also considered: if a candidate has a schedule_match
with a system_type that appears in the excluded list, it is out_of_scope.

Public API
----------
    filter_by_scope(candidates, profile=None) → list[dict]
        Classify each candidate. Returns list of dicts with candidate + scope.

    load_scope_profile(path=None) → dict
        Load scope profile from JSON or return defaults.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Default Scope Profile ─────────────────────────────────────────────────────

DEFAULT_PROFILE: Dict[str, Any] = {
    "included_systems": [
        "storefront",
        "curtain_wall",
        "window_wall",
        "frameless_glass",
        "glass_railing",
    ],
    "excluded_systems": [
        "overhead_coiling",
        "sectional",
        "hollow_metal",
        "louver",
        "rolling_steel",
    ],
}

_PROFILE_FILENAME = "scope_profile.json"


# ── Profile Loading ───────────────────────────────────────────────────────────

def load_scope_profile(path: Optional[str] = None) -> Dict[str, Any]:
    """
    Load scope profile from JSON file.

    Searches in this order:
        1. Explicit path argument
        2. scope_profile.json next to this file (sidecar/layers/)
        3. scope_profile.json in sidecar/ root
        4. Built-in DEFAULT_PROFILE

    Returns:
        Dict with 'included_systems' and 'excluded_systems' lists.
    """
    search_paths = []
    if path:
        search_paths.append(path)

    this_dir = os.path.dirname(os.path.abspath(__file__))
    search_paths.append(os.path.join(this_dir, _PROFILE_FILENAME))
    search_paths.append(os.path.join(this_dir, "..", _PROFILE_FILENAME))

    for p in search_paths:
        if os.path.isfile(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    profile = json.load(f)
                logger.info(f"Loaded scope profile from {p}")
                # Ensure required keys exist
                profile.setdefault("included_systems", DEFAULT_PROFILE["included_systems"])
                profile.setdefault("excluded_systems", DEFAULT_PROFILE["excluded_systems"])
                return profile
            except (json.JSONDecodeError, OSError) as e:
                logger.warning(f"Failed to load scope profile from {p}: {e}")

    return dict(DEFAULT_PROFILE)


# ── Scope Classification ─────────────────────────────────────────────────────

def _classify_scope(
    candidate: Any,
    included: List[str],
    excluded: List[str],
    review: Optional[List[str]] = None,
) -> str:
    """
    Determine scope for a single candidate.

    Returns: 'in_scope', 'out_of_scope', or 'scope_review'
    """
    system_hint = getattr(candidate, "system_hint", "unknown") or "unknown"
    system_lower = system_hint.lower()

    # Check schedule_match system_type first (most specific signal)
    schedule_match = getattr(candidate, "schedule_match", None)
    if schedule_match and isinstance(schedule_match, dict):
        sched_type = schedule_match.get("system_type", "").lower()
        if sched_type and sched_type in [e.lower() for e in excluded]:
            return "out_of_scope"
        if sched_type and sched_type in [i.lower() for i in included]:
            return "in_scope"

    # Check system_hint against lists
    if system_lower in [e.lower() for e in excluded]:
        return "out_of_scope"
    if system_lower in [i.lower() for i in included]:
        return "in_scope"
    if review and system_lower in [r.lower() for r in review]:
        return "scope_review"

    # Unknown or unlisted → review
    return "scope_review"


def filter_by_scope(
    candidates: List[Any],
    profile: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Classify candidates by scope.

    Args:
        candidates: List of GlazingCandidate objects.
        profile: Optional scope profile dict. If None, loads from file/defaults.

    Returns:
        List of dicts, each containing:
            - candidate_id: str
            - system_hint: str
            - confidence: float
            - scope: 'in_scope' | 'out_of_scope' | 'scope_review'
            - reason: str (explanation of classification)
    """
    if not candidates:
        return []

    if profile is None:
        profile = load_scope_profile()

    included = profile.get("included_systems", DEFAULT_PROFILE["included_systems"])
    excluded = profile.get("excluded_systems", DEFAULT_PROFILE["excluded_systems"])
    review = profile.get("scope_review_systems", [])

    results = []
    for candidate in candidates:
        scope = _classify_scope(candidate, included, excluded, review)

        # Build reason string
        system_hint = getattr(candidate, "system_hint", "unknown") or "unknown"
        schedule_match = getattr(candidate, "schedule_match", None)
        if scope == "out_of_scope" and schedule_match:
            sched_type = schedule_match.get("system_type", "")
            reason = f"schedule_match system_type '{sched_type}' in excluded list"
        elif scope == "out_of_scope":
            reason = f"system_hint '{system_hint}' in excluded list"
        elif scope == "in_scope":
            reason = f"system_hint '{system_hint}' in included list"
        else:
            reason = f"system_hint '{system_hint}' not in any list"

        results.append({
            "candidate_id": getattr(candidate, "candidate_id", ""),
            "system_hint": system_hint,
            "confidence": getattr(candidate, "confidence", 0.0),
            "scope": scope,
            "reason": reason,
        })

    return results
