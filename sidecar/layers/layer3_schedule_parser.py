"""
layer3_schedule_parser.py

Extract door / window / curtainwall / storefront schedule entries from PDF pages.

Two extraction strategies:
  1. **Table path** — PyMuPDF ``page.find_tables()`` for structured schedule tables
     with headers like MARK, TYPE, SIZE, WIDTH, HEIGHT.
  2. **Text path** — regex on ``page.get_text('text')`` for detail-block schedules
     where each entry is a paragraph with "FROM X TO Y" location + dimension string
     (e.g. "3'-0\" x 7'-0\" x 1 3/4\"  18 GA. HM DOOR").

Public API
----------
    parse_schedule(pdf_path) → ScheduleInventory
        Full pipeline: find schedule pages, extract entries, return dict keyed by mark.

    find_schedule_pages(pdf_path) → list[dict]
        Identify pages that contain real schedule data (not just "PER SCHEDULE" refs).

    extract_schedule_entries(pdf_path, page_index) → list[ScheduleEntry]
        Extract entries from a single page.

    parse_dimension_to_inches(text) → float | None
        Convert an architectural dimension string to inches.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import fitz  # PyMuPDF

# ── Data Types ────────────────────────────────────────────────────────────────


@dataclass
class ScheduleEntry:
    """A single schedule row: one mark → one opening."""
    mark: str
    width_in: float = 0.0
    height_in: float = 0.0
    qty: int = 1
    system_type: str = ""
    description: str = ""
    raw_text: str = ""


ScheduleInventory = Dict[str, ScheduleEntry]


# ── Constants ─────────────────────────────────────────────────────────────────

# Minimum ratio of "true schedule evidence" lines vs total "SCHEDULE" mentions
# to distinguish real schedule pages from wall sections that say "PER SCHEDULE"
_MIN_EVIDENCE_RATIO = 0.3

# Keywords that indicate a page IS a schedule (in title or header)
_SCHEDULE_TITLE_KW = re.compile(
    r"\b(?:door|window|glazing|storefront|curtain\s*wall|frame|opening|hardware)"
    r"\s+schedule\b"
    r"|schedule\s+(?:of\s+)?(?:doors|windows|glazing|openings|frames)",
    re.IGNORECASE,
)

# Keywords that indicate "PER SCHEDULE" reference (false positive on non-schedule pages)
_PER_SCHEDULE_PAT = re.compile(r"\bper\s+(?:finish\s+)?schedule\b", re.IGNORECASE)

# ── Dimension Patterns ────────────────────────────────────────────────────────

# Architectural dimension: feet-inches with optional smart quotes
# Matches: 3'-0", 10'-6", 3'-0", 3\u2019-0\u201d, 3' - 0"
_FEET_INCH_PAT = re.compile(
    r"(\d+)\s*['\u2018\u2019]\s*-?\s*(\d+)\s*[\"″\u201c\u201d]?"
)

# WxH dimension on one line: "3'-0" x 7'-0"" (with optional thickness after)
_WXH_PAT = re.compile(
    r"(\d+\s*['\u2018\u2019]\s*-?\s*\d+\s*[\"″\u201c\u201d]?)"
    r"\s*x\s*"
    r"(\d+\s*['\u2018\u2019]\s*-?\s*\d+\s*[\"″\u201c\u201d]?)",
    re.IGNORECASE,
)

# Location pattern: FROM X TO Y, BETWEEN X AND Y, AT X
_LOCATION_PAT = re.compile(
    r"(?:FROM\s+(.+?)\s+TO\s+(.+?)$)"
    r"|(?:BETWEEN\s+(.+?)\s+(?:AND|&)\s+(.+?)$)"
    r"|(?:AT\s+(.+?)$)",
    re.IGNORECASE | re.MULTILINE,
)

# Room number in location text: e.g. "HALL 113", "SERVICE SHOP 124"
_ROOM_NUM_PAT = re.compile(r"(\d{2,3})\b")

# System-type keywords
_SYSTEM_PATTERNS = [
    (re.compile(r"HM\s*DOOR|HOLLOW\s*METAL\s*DOOR", re.I), "door"),
    (re.compile(r"WOOD\s*DOOR|SOLID\s*CORE", re.I), "door"),
    (re.compile(r"GLASS\s*(?:PANELS?|PARTITION|DOOR)", re.I), "glass_partition"),
    (re.compile(r"STOREFRONT", re.I), "storefront"),
    (re.compile(r"CURTAIN\s*WALL", re.I), "curtainwall"),
    (re.compile(r"OVERHEAD\s*DOOR|COILING|ROLLING", re.I), "overhead_door"),
    (re.compile(r"SECURITY\s*GRILLE", re.I), "security_grille"),
]

# Table header keywords (for table extraction path)
_TABLE_HEADER_KW = {
    "mark", "tag", "no", "number", "type", "size", "width", "height",
    "description", "qty", "quantity", "finish",
}


# ── Dimension Helpers ─────────────────────────────────────────────────────────


def parse_dimension_to_inches(text: str) -> Optional[float]:
    """Convert an architectural dimension string to inches.

    Handles:  3'-0", 7'-6", 10'-0", smart quotes (3\u2019-0\u201d), spaces.
    Returns None for non-dimension strings.
    """
    if not text or not isinstance(text, str):
        return None
    text = text.strip()
    m = _FEET_INCH_PAT.search(text)
    if not m:
        return None
    feet = int(m.group(1))
    inches = int(m.group(2))
    return float(feet * 12 + inches)


def _classify_system_type(text: str) -> str:
    """Classify a text block into a system type."""
    for pat, stype in _SYSTEM_PATTERNS:
        if pat.search(text):
            return stype
    return ""


# ── Schedule Page Detection ───────────────────────────────────────────────────


def find_schedule_pages(pdf_path: str) -> List[dict]:
    """Identify pages that contain real schedule data.

    Uses fast text-only heuristics first, then table checks only on candidates.
    Returns list of dicts with keys:
        page_index: int, page_number: int, evidence_type: str, score: float
    """
    doc = fitz.open(pdf_path)
    results = []

    for idx in range(len(doc)):
        page = doc[idx]
        text = page.get_text("text")
        upper = text.upper()

        # Fast pre-filter: skip pages with no "SCHEDULE" mention at all
        if "SCHEDULE" not in upper:
            continue

        # Count evidence types
        title_match = bool(_SCHEDULE_TITLE_KW.search(text))
        per_schedule_count = len(_PER_SCHEDULE_PAT.findall(text))
        has_wxh = bool(_WXH_PAT.search(text))

        # Score the page (text-only, no expensive table extraction)
        score = 0.0
        evidence = []

        if title_match:
            score += 0.5
            evidence.append("title_match")
        if has_wxh:
            score += 0.3
            evidence.append("wxh_dimensions")

        # Penalize pages where all "SCHEDULE" mentions are "PER SCHEDULE"
        schedule_total = upper.count("SCHEDULE")
        if schedule_total > 0 and per_schedule_count > 0:
            per_ratio = per_schedule_count / schedule_total
            if per_ratio > 0.8 and not title_match and not has_wxh:
                score -= 0.4
                evidence.append("per_schedule_penalty")

        if score >= 0.2:
            results.append({
                "page_index": idx,
                "page_number": idx + 1,
                "evidence_type": "+".join(evidence) if evidence else "none",
                "score": round(score, 2),
            })

    doc.close()

    # Sort by score descending
    results.sort(key=lambda x: x["score"], reverse=True)
    return results


# ── Entry Extraction — Text Path ──────────────────────────────────────────────


def _extract_entries_from_text(page) -> List[ScheduleEntry]:
    """Extract schedule entries from page text using regex patterns.

    Looks for detail blocks:
      - "FROM X TO Y" / "BETWEEN X AND Y" / "AT X" (location)
      - "W'-H\" x W'-H\" x T\"  GA.  TYPE" (dimension + description)
      - Room numbers as marks
    """
    text = page.get_text("text")
    lines = text.split("\n")
    entries: List[ScheduleEntry] = []
    seen_marks: set = set()

    # Strategy: scan for WxH dimension lines, then look backwards for location
    for i, line in enumerate(lines):
        stripped = line.strip()
        wxh = _WXH_PAT.search(stripped)
        if not wxh:
            continue

        w_str, h_str = wxh.group(1), wxh.group(2)
        w_in = parse_dimension_to_inches(w_str)
        h_in = parse_dimension_to_inches(h_str)
        if w_in is None or h_in is None:
            continue

        # Look backwards (up to 5 lines) for location pattern
        mark = ""
        location_text = ""
        for j in range(max(0, i - 5), i):
            loc = _LOCATION_PAT.search(lines[j].strip())
            if loc:
                location_text = lines[j].strip()
                # Extract room numbers from location
                room_nums = _ROOM_NUM_PAT.findall(location_text)
                if room_nums:
                    # Use the first room number as mark
                    mark = room_nums[0]
                break

        # Classify system type from the dimension line + nearby lines
        context = " ".join(
            lines[k].strip()
            for k in range(max(0, i - 2), min(len(lines), i + 3))
        )
        system_type = _classify_system_type(context)

        # Build description from dimension line
        description = stripped

        # If no mark from location, try to find a standalone number nearby
        if not mark:
            for j in range(max(0, i - 3), min(len(lines), i + 3)):
                candidate = lines[j].strip()
                if re.match(r"^\d{2,3}$", candidate):
                    mark = candidate
                    break

        if not mark:
            # Generate a sequential mark
            mark = f"ENTRY-{len(entries) + 1}"

        # Deduplicate: if same mark already exists, append suffix
        original_mark = mark
        suffix = 1
        while mark in seen_marks:
            suffix += 1
            mark = f"{original_mark}-{suffix}"
        seen_marks.add(mark)

        entries.append(ScheduleEntry(
            mark=mark,
            width_in=w_in,
            height_in=h_in,
            qty=1,
            system_type=system_type,
            description=description,
            raw_text=location_text + "\n" + stripped if location_text else stripped,
        ))

    return entries


# ── Entry Extraction — Table Path ─────────────────────────────────────────────


def _extract_entries_from_tables(page) -> List[ScheduleEntry]:
    """Extract schedule entries from structured PyMuPDF tables.

    Looks for tables where the header row contains schedule-related keywords
    like MARK, TYPE, SIZE, WIDTH, HEIGHT, etc.
    Skips pages with many tables (>20) as those are detail drawings, not schedules.
    """
    entries: List[ScheduleEntry] = []

    try:
        tables = page.find_tables()
    except Exception:
        return entries

    # Pages with many tables are detail drawings (e.g. door detail sheets
    # with 48 individual hardware callout tables) — skip table path
    if len(tables.tables) > 20:
        return entries

    for t in tables.tables:
        data = t.extract()
        if not data or len(data) < 2:
            continue

        # Check if first row looks like a header
        header = [str(c).strip().lower() if c else "" for c in data[0]]

        # Find column indices for key fields
        mark_col = _find_col(header, ["mark", "tag", "no", "number", "no."])
        width_col = _find_col(header, ["width", "size"])
        height_col = _find_col(header, ["height"])
        type_col = _find_col(header, ["type", "description", "desc"])
        qty_col = _find_col(header, ["qty", "quantity"])

        # Need at least mark and one dimension column
        if mark_col is None:
            continue
        if width_col is None and height_col is None:
            continue

        # Extract rows
        for row in data[1:]:
            cells = [str(c).strip() if c else "" for c in row]
            if len(cells) <= mark_col:
                continue

            mark = cells[mark_col]
            if not mark:
                continue

            w_in = 0.0
            h_in = 0.0

            if width_col is not None and width_col < len(cells):
                dim = parse_dimension_to_inches(cells[width_col])
                if dim is not None:
                    w_in = dim

            if height_col is not None and height_col < len(cells):
                dim = parse_dimension_to_inches(cells[height_col])
                if dim is not None:
                    h_in = dim

            # Try parsing a combined "size" column (WxH)
            if (w_in == 0 or h_in == 0) and width_col is not None:
                size_text = cells[width_col]
                wxh = _WXH_PAT.search(size_text)
                if wxh:
                    w = parse_dimension_to_inches(wxh.group(1))
                    h = parse_dimension_to_inches(wxh.group(2))
                    if w is not None:
                        w_in = w
                    if h is not None:
                        h_in = h

            desc = ""
            if type_col is not None and type_col < len(cells):
                desc = cells[type_col]

            qty = 1
            if qty_col is not None and qty_col < len(cells):
                try:
                    qty = int(cells[qty_col])
                except (ValueError, TypeError):
                    pass

            system_type = _classify_system_type(desc) if desc else ""

            entries.append(ScheduleEntry(
                mark=mark,
                width_in=w_in,
                height_in=h_in,
                qty=qty,
                system_type=system_type,
                description=desc,
                raw_text=" | ".join(cells),
            ))

    return entries


def _find_col(header: List[str], keywords: List[str]) -> Optional[int]:
    """Find column index whose header contains one of the keywords."""
    for i, cell in enumerate(header):
        for kw in keywords:
            if kw in cell:
                return i
    return None


# ── Public API ────────────────────────────────────────────────────────────────


def extract_schedule_entries(
    pdf_path: str, page_index: int
) -> List[ScheduleEntry]:
    """Extract schedule entries from a single page.

    Tries table extraction first; falls back to text-based extraction.
    Returns combined, deduplicated list.
    """
    doc = fitz.open(pdf_path)
    if page_index < 0 or page_index >= len(doc):
        doc.close()
        return []

    page = doc[page_index]

    # Try both paths
    table_entries = _extract_entries_from_tables(page)
    text_entries = _extract_entries_from_text(page)

    doc.close()

    # Prefer table entries if they have good data; merge with text entries
    if table_entries and any(e.width_in > 0 for e in table_entries):
        return table_entries

    return text_entries


def parse_schedule(pdf_path: str) -> ScheduleInventory:
    """Full pipeline: find schedule pages → extract entries → return inventory.

    Returns dict keyed by mark (string) → ScheduleEntry.
    """
    pages = find_schedule_pages(pdf_path)
    inventory: ScheduleInventory = {}

    for page_info in pages:
        entries = extract_schedule_entries(pdf_path, page_info["page_index"])
        for entry in entries:
            if entry.mark and entry.mark not in inventory:
                inventory[entry.mark] = entry

    return inventory
