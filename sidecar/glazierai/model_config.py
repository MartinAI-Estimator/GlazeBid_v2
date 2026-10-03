"""
model_config.py — the ONE place the sidecar names an Anthropic model.

History: every vision call hardcoded "claude-sonnet-4-20250514".  Anthropic
retired that model on 2026-06-15, so the API now answers 404
not_found_error and every Drawing Intelligence / Spec Reader / Box & Snap
call fails.  Twelve copies of one string is how that became an outage, so
the model now lives here.

Override without a code change:
    set GLAZEBID_VISION_MODEL=claude-sonnet-4-6        (Windows)
Current IDs + retirement dates:
    https://platform.claude.com/docs/en/about-claude/model-deprecations

Matches electron/main.ts (ai:chat), which already runs claude-sonnet-5.
"""
from __future__ import annotations

import os

VISION_MODEL: str = os.environ.get("GLAZEBID_VISION_MODEL", "claude-sonnet-5").strip() or "claude-sonnet-5"

# Extra request params for DETERMINISTIC extraction calls (JSON out, no chat).
#
# Do NOT add `temperature` here: the Sonnet 5 family rejects it with a 400
# ("`temperature` is deprecated for this model").  Repeatability comes from
# turning thinking OFF instead — same choice electron/main.ts makes for its
# deterministic mode.  Thinking on would also let the model spend max_tokens
# on thinking blocks and return no text at all, which the JSON parsers here
# would read as an empty result.
EXTRACTION_OPTS: dict = {"thinking": {"type": "disabled"}}
