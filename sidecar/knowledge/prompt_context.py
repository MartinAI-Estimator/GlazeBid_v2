"""
prompt_context.py — turn the knowledge base into text every vision prompt carries,
and match manufacturer series in drawing text.

    from knowledge.prompt_context import trade_knowledge_block, scope_class_block, match_series

trade_knowledge_block()  → Martin's in/out/pass-thru/implied/classification rules
scope_class_block()      → the allowed scope classes (from scope_taxonomy.json)
match_series(text)       → [{"id", "manufacturer", "series", "scope_class", ...}]

Sources (all in sidecar/knowledge/):
    system_knowledge_base.json   rules (Martin)
    series_classes.json          Kawneer/Tubelite series (Frame Builder library)
    scope_taxonomy.json          classes (Martin's Bluebeam tool chest)
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

_DIR = Path(__file__).resolve().parent


@lru_cache(maxsize=None)
def _load(name: str) -> dict:
    p = _DIR / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def _rules(section: str) -> list[str]:
    return [r["rule"] for r in _load("system_knowledge_base.json").get(section, []) if r.get("rule")]


def trade_knowledge_block() -> str:
    kb = _load("system_knowledge_base.json")
    parts = ["ESTIMATOR'S TRADE KNOWLEDGE (authoritative — follow exactly):"]
    sections = [
        ("IN OUR SCOPE", "scope_in"),
        ("PASS-THRU (carried in our number, done by a hired sub — own scope type)", "pass_thru"),
        ("NOT OUR SCOPE (still mark as excluded)", "scope_out"),
        ("FLAG FOR REVIEW", "review_flags"),
        ("IMPLIED SCOPE (find and attach to the system)", "implied_scope"),
        ("CLASSIFICATION", "classification"),
        ("COUNTING", "counting"),
        ("DOORS", "doors"),
        ("GLASS", "glass"),
    ]
    for title, key in sections:
        rules = _rules(key)
        if rules:
            parts.append(f"\n{title}:")
            parts += [f"  - {r}" for r in rules]
    if kb.get("other_manufacturer_rule"):
        parts.append(f"\nOTHER MANUFACTURERS:\n  - {kb['other_manufacturer_rule']}")
    parts.append("\n" + series_table())
    return "\n".join(parts)


def series_table() -> str:
    sc = _load("series_classes.json")
    lines = ["MANUFACTURER SERIES → SYSTEM CLASS (decisive when a series is named):"]
    for s in sc.get("systems", []):
        names = ", ".join(a["text"] for a in s["aliases"][:4])
        lines.append(f"  {s['manufacturer']:<9} {s['series']:<20} → {s['scope_class']:<7} ({names})")
    for mfr, m in _load("system_knowledge_base.json").get("other_manufacturer_hints", {}).items():
        for series, cls in m.items():
            if not series.startswith("_"):
                lines.append(f"  {mfr:<9} {series:<20} → {cls:<7} (other maker — flag)")
    ww = sc.get("window_wall", {})
    if ww.get("status") == "pending":
        lines.append("  (window wall series not yet listed — classify window wall from drawings and flag)")
    return "\n".join(lines)


def scope_class_block() -> str:
    tax = _load("scope_taxonomy.json")
    lines = ["SCOPE CLASSES — use exactly one of these keys:"]
    for key, c in tax.get("classes", {}).items():
        if c["kind"] in ("note", "measure", "ignore"):
            continue
        lines.append(f"  {key:<24} {c['label']}  [{c['kind']}]")
    return "\n".join(lines)


# ── series matching in raw drawing text ──────────────────────────────────────

def _squash(s: str) -> str:
    return re.sub(r"[\s\-_/]+", "", s.upper())


_MFR = re.compile(r"KAWNEER|TUBELITE|TRIFAB", re.I)


def match_series(text: str) -> list[dict]:
    """Series codes found in text, most specific (longest alias) first."""
    if not text:
        return []
    up = text.upper()
    squashed = _squash(text)
    has_mfr = bool(_MFR.search(up))
    hits: dict[str, tuple[int, dict]] = {}
    for s in _load("series_classes.json").get("systems", []):
        for a in s["aliases"]:
            if a["needs_manufacturer_context"] and not has_mfr:
                continue
            alias = _squash(a["text"])
            # word-boundary on the raw text for short tokens, squashed match for long ones
            if len(alias) <= 5:
                ok = re.search(rf"(?<![A-Z0-9]){re.escape(a['text'].upper())}(?![A-Z0-9])", up)
            else:
                ok = alias in squashed
            if ok:
                prev = hits.get(s["id"])
                if prev is None or len(alias) > prev[0]:
                    hits[s["id"]] = (len(alias), {**{k: s[k] for k in ("id", "manufacturer", "series", "scope_class", "system_type")},
                                                  "matched": a["text"]})
    ranked = [h for _, h in sorted(hits.values(), key=lambda x: -x[0])]
    # "TRIFAB VG 451T" must not also report 451: drop hits contained in a longer hit
    keep: list[dict] = []
    for h in ranked:
        sq = _squash(h["matched"])
        if any(sq != _squash(k["matched"]) and sq in _squash(k["matched"]) for k in keep):
            continue
        keep.append(h)
    return keep
