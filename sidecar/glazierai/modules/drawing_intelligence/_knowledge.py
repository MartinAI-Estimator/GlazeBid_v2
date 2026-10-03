"""
_knowledge.py — one call that appends Martin's trade knowledge to a system prompt.

Every vision prompt in this package classifies glazing.  They all get the same
rules (knowledge/system_knowledge_base.json), the Kawneer/Tubelite series table
(knowledge/series_classes.json) — so SF vs CW, glazing-only, pass-thru and
exclusions are decided the same way on every sheet.  When a prompt's own text
disagrees with these rules, the rules win (they say "authoritative").
"""
from __future__ import annotations

import sys
from pathlib import Path

_SIDECAR = Path(__file__).resolve().parents[3]
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))

from knowledge.prompt_context import trade_knowledge_block  # noqa: E402


def with_knowledge(system_prompt: str) -> str:
    try:
        block = trade_knowledge_block()
    except Exception:            # knowledge files missing must never break a takeoff
        return system_prompt
    return (system_prompt.rstrip()
            + "\n\n" + block
            + "\n\nWhere anything above conflicts with the ESTIMATOR'S TRADE KNOWLEDGE, "
              "the trade knowledge wins.")
