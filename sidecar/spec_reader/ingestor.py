"""
GlazierAI Spec Reader — Ingestor
PDF text extraction and CSI section detection.

Responsibilities:
  1. Extract full text from a PDF (text-based; scanned PDFs will return empty)
  2. Detect all CSI section boundaries in the text
  3. Filter to glazing-relevant sections
  4. Return section text slices ready for extraction
"""

from __future__ import annotations

import re
import logging
from pathlib import Path
from dataclasses import dataclass, field

import pdfplumber

logger = logging.getLogger(__name__)


# ─── Glazing Scope Classification ────────────────────────────────────────────
# CSI section prefixes that are glazing contractor scope.
# Key: normalized prefix (no spaces), Value: scope reason

GLAZING_SCOPE_PREFIXES: dict[str, str] = {
    "084113": "Aluminum-framed storefronts and entrances",
    "084126": "All-glass entrances",
    "084213": "Automatic entrances",
    "084226": "All-glass entrances (sliding)",
    "084413": "Glazed aluminum curtain walls",
    "084433": "Sloped glazing assemblies",
    "084513": "Translucent wall and roof assemblies",
    "085113": "Steel windows",
    "085213": "Aluminum windows",
    "085313": "Plastic windows",
    "085619": "Pass windows",
    "085680": "Service windows / drive-up windows",
    "086200": "Unit skylights",
    "086300": "Metal-framed skylights",
    "086313": "Sloped glazing",
    "088000": "Glazing (glass products and IGUs)",
    "088300": "Mirrors (architectural — Division 08 mirrors are glazing scope. Bobrick specialty/toilet accessory mirrors are Division 10, not glazing scope)",
    "088800": "Special function glazing",
    "088813": "Fire-rated glazing",
    "088816": "Bullet-resistant glazing",
    "088819": "Storm-resistant glazing",
}

# Section prefixes explicitly NOT glazing scope
NON_GLAZING_SCOPE_PREFIXES: set[str] = {
    # ── Division 05 — Glass railings/handrails ────────────────────────────────
    # The railing SYSTEM is Division 05 (metals contractor).
    # Glass INFILL panels for railings may appear in 08 80 00 — if so, that's
    # a scope clarification item, not automatic glazing scope.
    "055219",  # Pipe and tube railings (may include glass infill)
    "057300",  # Decorative metal railings
    "057316",  # Wire rope railings
    "057319",  # Glass railings — railing system is Division 05, not glazing

    # ── Division 10 — Sunshades and canopies ─────────────────────────────────
    # Standalone specialty products, NOT glazing contractor scope.
    # Exception: integral sunshades specified within a Division 08 curtain wall
    # section (e.g., Kawneer SunShade) may be glazing scope — GlazierAI flags
    # these for estimator review rather than auto-excluding them.
    "107113",  # Exterior horizontal louvers
    "107116",  # Exterior vertical louvers
    "107313",  # Awnings
    "107316",  # Canopies
    "107319",  # Marquees
    "107100",  # Exterior sun control devices (sunshades)
    "107300",  # Protective covers (canopies, marquees)
    "081113",  # Hollow metal doors and frames
    "081213",  # Hollow metal frames
    "081416",  # Flush wood doors
    "081433",  # Stile and rail wood doors
    "081613",  # Fiberglass doors
    "083113",  # Access doors
    "083223",  # Overhead coiling doors
    "083323",  # Overhead high-speed fabric doors
    "083413",  # Cold storage doors
    "083513",  # Folding doors
    "083613",  # Sectional doors
    "083800",  # Traffic doors
    "083813",  # Flexible strip curtains
    "087100",  # Door hardware
    "087113",  # Door hardware
    "089119",  # Fixed louvers
    "089200",  # Louvers and vents
}


@dataclass
class RawSection:
    """A CSI section detected in the spec text"""
    csi_number: str          # e.g. "08 41 13"
    csi_number_raw: str      # as found in the text (may have odd spacing)
    csi_title: str           # e.g. "ALUMINUM-FRAMED ENTRANCES AND STOREFRONTS"
    csi_title_clean: str     # title-cased clean version
    start_char: int
    end_char: int
    text: str                # the section text slice
    is_glazing_scope: bool
    scope_reason: str


@dataclass
class IngestorResult:
    """Full result from ingesting a project manual PDF"""
    pdf_path: str
    page_count: int
    full_text: str
    full_text_length: int
    all_sections: list[RawSection] = field(default_factory=list)
    glazing_sections: list[RawSection] = field(default_factory=list)
    non_glazing_sections: list[RawSection] = field(default_factory=list)
    extraction_warnings: list[str] = field(default_factory=list)


# ─── Section Header Pattern ───────────────────────────────────────────────────
# Matches: "SECTION 08 41 13 - ALUMINUM-FRAMED ENTRANCES AND STOREFRONTS"  (all-caps, standard project manual)
# Also:    "SECTION 08 41 13\nALUMINUM-FRAMED ENTRANCES AND STOREFRONTS"   (newline separator)
# Also:    "Section 08 41 13 -GLAZING"                                      (title-case, contractor spec sheet)
# Also:    "Section 08 42 29.23 -AUTOMATIC ENTRANCES"                       (6-digit + sub-number)
# The CSI number can have varying whitespace between the digits.

_SECTION_HEADER_RE = re.compile(
    r"(?i:section)\s+"                      # "SECTION" or "Section" (case-insensitive)
    r"(0\s*8\s+[\d.]+\s*\d*)"              # CSI number: 08 XX XX or 08 XX XX.XX
    r"(?:\s*[-\u2013\u2014]\s*|\s+)"        # separator: dash or whitespace
    r"([A-Za-z][A-Za-z,&()/.'\- ]{3,80})"  # title: 4–81 chars, mixed case allowed
    r"(?=\s|$|(?i:Section)\s+0)",           # stop before next Section header or end
    re.MULTILINE,
)

# End-of-section markers
_END_OF_SECTION_RE = re.compile(
    r"END\s+OF\s+SECTION(?:\s+0\s*8\s+\d\s*\d\s+\d\s*\d)?",
    re.MULTILINE,
)


def _normalize_csi(raw: str) -> str:
    """
    Normalize a CSI number to standard format: "08 41 13"
    Handles "084113", "08  41  13", "08-41-13", etc.
    """
    digits = re.sub(r"\D", "", raw)
    if len(digits) >= 6:
        return f"{digits[0:2]} {digits[2:4]} {digits[4:6]}"
    if len(digits) == 4:
        return f"{digits[0:2]} {digits[2:4]} 00"
    return raw.strip()


def _csi_key(csi_number: str) -> str:
    """Return digits-only key for dict lookup: '08 41 13' -> '084113'"""
    return re.sub(r"\D", "", csi_number)


def _classify_section(csi_number: str) -> tuple[bool, str]:
    """
    Determine if a CSI section is glazing contractor scope.

    Returns:
        (is_glazing_scope, reason_string)
    """
    key = _csi_key(csi_number)

    # Explicit non-glazing list takes priority
    if key in NON_GLAZING_SCOPE_PREFIXES:
        return False, "Explicitly non-glazing scope (doors, hardware, louvers)"

    # Exact match in glazing scope list
    if key in GLAZING_SCOPE_PREFIXES:
        return True, GLAZING_SCOPE_PREFIXES[key]

    # Fuzzy: any 08 4x, 08 5x, 08 6x, 08 8x section not explicitly excluded
    if key.startswith("08"):
        second_pair = key[2:4]
        if second_pair in {"41", "42", "43", "44", "45", "51", "52", "53",
                           "56", "62", "63", "80", "83", "88"}:
            return True, f"Division 08 glazing-adjacent section (08 {second_pair} xx)"
        return False, f"Division 08 section not identified as glazing scope (08 {second_pair} xx)"

    return False, "Not a Division 08 section"


# ─── Glazing Content Quality Check ──────────────────────────────────────────
# Used to detect sections whose text slice was mis-extracted (e.g., columnar
# PDF layouts where pdfplumber interleaves column content across sections).

_GLAZING_CONTENT_KEYWORDS: frozenset[str] = frozenset({
    "glass", "glazing", "aluminum", "aluminium", "storefront", "curtain wall",
    "curtainwall", "entrance", "window", "sealant", "gasket", "insulating",
    "tempered", "laminated", "coating", "anodized", "kynar", "pvdf",
    "thermal", "framing", "silicone", "skylight", "igu",
})

_GLAZING_CONTENT_MIN_HITS = 4  # require at least this many keyword hits in the body


def _has_glazing_content(text: str) -> bool:
    """Return True if the section BODY (excluding the header line) contains enough
    glazing-domain keywords. Stripping the header prevents the section title from
    satisfying the check on its own (e.g., 'GLAZED ALUMINUM CURTAIN WALLS' alone
    would hit 'aluminum' and 'curtain wall' without any real body content).
    """
    # Skip the header line — its keywords always match the classified section type
    lines = text.split("\n", 2)
    body = lines[2] if len(lines) > 2 else (lines[1] if len(lines) > 1 else "")
    lower = body.lower()
    return sum(1 for kw in _GLAZING_CONTENT_KEYWORDS if kw in lower) >= _GLAZING_CONTENT_MIN_HITS


def extract_text_from_pdf(pdf_path: str | Path) -> tuple[str, int]:
    """
    Extract full text from a PDF using pdfplumber.

    Returns:
        (full_text, page_count)
    """
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    pages_text: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        page_count = len(pdf.pages)
        for page in pdf.pages:
            text = page.extract_text() or ""
            pages_text.append(text)

    full_text = "\n".join(pages_text)
    logger.info(f"Extracted {len(full_text):,} chars from {page_count} pages: {pdf_path.name}")
    return full_text, page_count


def detect_sections(full_text: str) -> list[RawSection]:
    """
    Find all CSI section boundaries in the full extracted text.

    Strategy:
      1. Find all SECTION XX XX XX - TITLE headers
      2. Find all END OF SECTION markers
      3. Pair them up to get text slices
      4. Classify each section as glazing scope or not

    Returns:
        List of RawSection objects, ordered by position in text
    """
    header_matches = list(_SECTION_HEADER_RE.finditer(full_text))
    if not header_matches:
        logger.warning("No CSI section headers found in text")
        return []

    end_matches = list(_END_OF_SECTION_RE.finditer(full_text))

    def find_section_end(start_char: int, next_header_start: int) -> int:
        for em in end_matches:
            if start_char < em.start() < next_header_start:
                return em.end()
        return next_header_start

    sections: list[RawSection] = []
    for i, match in enumerate(header_matches):
        csi_raw = match.group(1)
        title_raw = match.group(2).strip()

        csi_normalized = _normalize_csi(csi_raw)
        title_clean = title_raw.title()

        section_start = match.start()
        next_start = header_matches[i + 1].start() if i + 1 < len(header_matches) else len(full_text)
        section_end = find_section_end(section_start, next_start)

        section_text = full_text[section_start:section_end].strip()
        is_glazing, reason = _classify_section(csi_normalized)

        sections.append(RawSection(
            csi_number=csi_normalized,
            csi_number_raw=csi_raw,
            csi_title=title_raw,
            csi_title_clean=title_clean,
            start_char=section_start,
            end_char=section_end,
            text=section_text,
            is_glazing_scope=is_glazing,
            scope_reason=reason,
        ))

        logger.debug(
            f"  {'v' if is_glazing else 'o'} {csi_normalized} - {title_clean} "
            f"({len(section_text):,} chars)"
        )

    # Deduplicate by CSI number - TOC header lines match the same pattern as
    # the real section body. Keep whichever has the most text (body >> TOC line).
    seen: dict[str, RawSection] = {}
    for s in sections:
        key = _csi_key(s.csi_number)
        if key not in seen or len(s.text) > len(seen[key].text):
            seen[key] = s

    deduped = sorted(seen.values(), key=lambda s: s.start_char)
    if len(deduped) < len(sections):
        logger.info(f"  Removed {len(sections) - len(deduped)} duplicate TOC header(s)")

    return deduped


def ingest_pdf(pdf_path: str | Path) -> IngestorResult:
    """
    Full ingestion pipeline: PDF -> text -> section detection -> classification.

    Args:
        pdf_path: Path to the project manual PDF

    Returns:
        IngestorResult with all sections detected and classified
    """
    pdf_path = Path(pdf_path)
    result = IngestorResult(
        pdf_path=str(pdf_path),
        page_count=0,
        full_text="",
        full_text_length=0,
    )

    try:
        full_text, page_count = extract_text_from_pdf(pdf_path)
        result.full_text = full_text
        result.full_text_length = len(full_text)
        result.page_count = page_count
    except Exception as e:
        logger.error(f"PDF text extraction failed: {e}")
        result.extraction_warnings.append(f"PDF extraction error: {e}")
        return result

    if not full_text.strip():
        result.extraction_warnings.append(
            "No text extracted - PDF may be scanned. OCR support coming in a future release."
        )
        return result

    all_sections = detect_sections(full_text)
    result.all_sections = all_sections
    result.glazing_sections = [s for s in all_sections if s.is_glazing_scope]
    result.non_glazing_sections = [s for s in all_sections if not s.is_glazing_scope]

    # Validate that each glazing section actually contains glazing content.
    # Columnar PDF layouts can cause pdfplumber to interleave column text,
    # producing section slices with the right header but wrong body content.
    for s in result.glazing_sections:
        if not _has_glazing_content(s.text):
            result.extraction_warnings.append(
                f"{s.csi_number} ({s.csi_title_clean}): section text appears mis-extracted "
                f"— fewer than {_GLAZING_CONTENT_MIN_HITS} glazing keywords found. "
                f"Likely a columnar PDF layout issue. Extraction confidence will be low."
            )
            logger.warning(
                f"Content quality check failed for {s.csi_number} — possible columnar PDF mis-extraction"
            )

    logger.info(
        f"Detected {len(all_sections)} sections total - "
        f"{len(result.glazing_sections)} glazing scope, "
        f"{len(result.non_glazing_sections)} non-glazing"
    )

    return result


# --- Quick CLI test ----------------------------------------------------------
if __name__ == "__main__":
    import sys

    logging.basicConfig(level=logging.DEBUG)

    if len(sys.argv) < 2:
        print("Usage: python ingestor.py <path/to/spec.pdf>")
        sys.exit(1)

    result = ingest_pdf(sys.argv[1])

    print(f"\n{'='*60}")
    print(f"PDF: {Path(result.pdf_path).name}")
    print(f"Pages: {result.page_count}")
    print(f"Text length: {result.full_text_length:,} chars")
    print(f"\nGLAZING SECTIONS ({len(result.glazing_sections)}):")
    for s in result.glazing_sections:
        print(f"  v {s.csi_number} - {s.csi_title_clean} ({len(s.text):,} chars)")
    print(f"\nNON-GLAZING ({len(result.non_glazing_sections)}):")
    for s in result.non_glazing_sections:
        print(f"  o {s.csi_number} - {s.csi_title_clean}")
    if result.extraction_warnings:
        print(f"\nWARNINGS:")
        for w in result.extraction_warnings:
            print(f"  ! {w}")
