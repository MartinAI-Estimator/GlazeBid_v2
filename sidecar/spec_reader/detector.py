"""
detector.py

CSI section detector for GlazierAI Spec Reader.

Scans ingested page text to locate Division 08 glazing sections.
Returns a list of DetectedSection objects with page ranges and full text.

Detection strategy:
  1. Regex scan for CSI MasterFormat section headers (e.g. "SECTION 08 41 13")
  2. Page-accumulation: collect all text until the next section header is found
  3. Filter to glazing-relevant sections only (configurable)
  4. Merge multi-page sections into single text blocks
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from .ingestor import SectionResult  # noqa: F401 (kept for any external callers)

# DetectedSection was removed from schema.py — define a local version for
# any code that still calls detect_sections() directly.
@dataclass
class _LegacyDetectedSection:
    csi_number: str
    csi_title: str
    start_page: int
    end_page: int
    char_count: int
    text: str

# Public alias kept for backward compat
DetectedSection = _LegacyDetectedSection

logger = logging.getLogger("glazierai.spec_reader.detector")


# ── CSI Section Header Patterns ───────────────────────────────────────────────

# Matches lines like:
#   "SECTION 08 41 13"
#   "SECTION 08 44 13 - GLAZED ALUMINUM CURTAIN WALLS"
#   "08 41 13 ALUMINUM-FRAMED ENTRANCES AND STOREFRONTS"
#   "08 8000 GLAZING"  (older 5-digit format)
_SECTION_HEADER = re.compile(
    r"""
    (?:SECTION\s+)?             # optional "SECTION" prefix
    (0 ?8 ?[\s\-]?              # starts with 08 (with optional spaces)
    [\d]{2}[\s\-]?[\d]{0,2})   # CSI number: 08 XX XX or 08 XXXX
    (?:[\s\-]+([A-Z][A-Z\s,&/()\-]{3,}))?  # optional title
    """,
    re.VERBOSE | re.IGNORECASE
)

# Normalize a raw CSI match to "XX XX XX" format
_CSI_NORMALIZE = re.compile(r"[\s\-]")


# ── Glazing Section Filter ────────────────────────────────────────────────────

# Division 08 sections relevant to a glazing subcontractor.
# Keyed by CSI prefix → human title. Used to decide which sections to extract.
GLAZING_SECTIONS: dict[str, str] = {
    "08 41": "Entrances and Storefronts",
    "08 42": "Entrances",
    "08 43": "Storefronts",
    "08 44": "Curtain Wall Glazing",
    "08 45": "Translucent Wall and Roof Assemblies",
    "08 46": "Window Wall Assemblies",
    "08 51": "Metal Windows",
    "08 52": "Wood Windows",
    "08 53": "Plastic Windows",
    "08 54": "Composite Windows",
    "08 55": "Pressure-Resistant Windows",
    "08 56": "Special Function Windows",
    "08 62": "Unit Skylights",
    "08 63": "Metal-Framed Skylights",
    "08 71": "Door Hardware",
    "08 80": "Glazing",
    "08 81": "Glass Glazing",
    "08 83": "Mirrors",
    "08 84": "Plastic Glazing",
    "08 85": "Glazing Accessories",
    "08 87": "Solar Control Films",
    "08 88": "Special Function Glazing",
    "08 89": "Glazing Accessories",
    "08 91": "Louvers",
    "08 95": "Vents",
}

# Minimum character count for a section to be worth extracting
MIN_SECTION_CHARS = 200

# Maximum characters to send to Claude per section (avoids token overflow)
MAX_SECTION_CHARS = 40_000


def detect_sections(
    pages: list,
    sections_filter: list[str] | None = None,
) -> list[DetectedSection]:
    """
    Scan page-level text and return all detectable glazing CSI sections.

    Args:
        pages: Output from ingestor.ingest_pdf()
        sections_filter: If provided, only return sections whose CSI number
                         is in this list (e.g. ['08 41 13', '08 44 13']).
                         If None or empty, return all glazing-relevant sections.

    Returns:
        List of DetectedSection objects, ordered by start page.
    """
    # Build a flat list of (page_num, line_text) with section boundary markers
    boundaries: list[tuple[int, str, str]] = []  # (page_num, csi_number, csi_title)
    page_texts: dict[int, str] = {p.page_num: p.text for p in pages if p.text}

    for page in sorted(pages, key=lambda p: p.page_num):
        if not page.text:
            continue
        for line in page.text.splitlines():
            match = _find_section_header(line)
            if match:
                csi_num, csi_title = match
                if _is_glazing_section(csi_num):
                    boundaries.append((page.page_num, csi_num, csi_title))
                    logger.debug(f"  Found section {csi_num} on page {page.page_num}")

    if not boundaries:
        logger.warning("No glazing CSI sections detected in document")
        return []

    logger.info(f"Detected {len(boundaries)} glazing section header(s)")

    # Build sections by accumulating text between boundaries
    sections: list[DetectedSection] = []
    all_pages = sorted(page_texts.keys())

    for i, (start_page, csi_num, csi_title) in enumerate(boundaries):
        end_page = boundaries[i + 1][0] - 1 if i + 1 < len(boundaries) else all_pages[-1]

        # Accumulate text across all pages in range
        section_text = _collect_section_text(
            page_texts, start_page, end_page, csi_num
        )

        if len(section_text) < MIN_SECTION_CHARS:
            logger.debug(f"  Skipping {csi_num} — too short ({len(section_text)} chars)")
            continue

        # Truncate if enormous
        if len(section_text) > MAX_SECTION_CHARS:
            logger.warning(
                f"  Section {csi_num} truncated from {len(section_text)} to "
                f"{MAX_SECTION_CHARS} chars"
            )
            section_text = section_text[:MAX_SECTION_CHARS]

        sections.append(DetectedSection(
            csi_number=csi_num,
            csi_title=csi_title,
            start_page=start_page,
            end_page=end_page,
            char_count=len(section_text),
            text=section_text,
        ))

    # Apply filter if requested
    if sections_filter:
        normalized_filter = {_normalize_csi(s) for s in sections_filter}
        sections = [
            s for s in sections
            if _normalize_csi(s.csi_number) in normalized_filter
        ]
        logger.info(f"After filter: {len(sections)} section(s) to extract")

    return sections


def _find_section_header(line: str) -> tuple[str, str] | None:
    """
    Check if a line is a CSI section header.
    Returns (normalized_csi_number, title) or None.
    """
    line = line.strip()
    if len(line) < 5 or len(line) > 200:
        return None

    match = _SECTION_HEADER.match(line)
    if not match:
        return None

    raw_num = match.group(1)
    raw_title = (match.group(2) or "").strip().title()

    csi_num = _normalize_csi(raw_num)
    if not csi_num:
        return None

    # If we didn't get a title from the header regex, look it up in our table
    if not raw_title:
        raw_title = _lookup_title(csi_num) or "Unknown"

    return csi_num, raw_title


def _normalize_csi(raw: str) -> str:
    """Normalize a raw CSI string to 'XX XX XX' format."""
    digits = re.sub(r"[^\d]", "", raw)
    if len(digits) == 6:
        return f"{digits[:2]} {digits[2:4]} {digits[4:6]}"
    if len(digits) == 5:
        return f"{digits[:2]} {digits[2:4]} {digits[4:5]}0"
    if len(digits) == 4:
        return f"{digits[:2]} {digits[2:4]}"
    return ""


def _is_glazing_section(csi_num: str) -> bool:
    """Return True if this CSI number is relevant to glazing scope."""
    for prefix in GLAZING_SECTIONS:
        if csi_num.startswith(prefix):
            return True
    return False


def _lookup_title(csi_num: str) -> str | None:
    """Look up a human-readable title for a known section number."""
    for prefix, title in GLAZING_SECTIONS.items():
        if csi_num.startswith(prefix):
            return title
    return None


def _collect_section_text(
    page_texts: dict[int, str],
    start_page: int,
    end_page: int,
    csi_num: str,
) -> str:
    """
    Collect and concatenate page text from start_page to end_page inclusive.
    Skips page breaks, headers, and footers (heuristic: short isolated lines).
    """
    chunks: list[str] = []
    for page_num in range(start_page, end_page + 1):
        text = page_texts.get(page_num, "")
        if text:
            chunks.append(text)

    return "\n\n".join(chunks).strip()
