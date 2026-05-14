"""
elevation_extractor.py

Extract glazing mark tokens and adjacent dimension text from elevation sheets
of a PDF drawing set.  Returns a :class:`ConstraintSet`.

§ Design rules
--------------
1.  Mark tokens require a dash between prefix and number to avoid false-
    positives from sheet cross-reference labels (``A1``, ``A2`` → sheet refs;
    ``A-1``, ``SF-1`` → glazing marks).

2.  Dimension text within PROXIMITY_PTS points of each mark is parsed for
    standard architectural notation:
        - ``12'-6"``   foot + inch
        - ``150"``     total inches
        - ``12.5 ft``  decimal feet

3.  ConstraintSet.confidence levels:
        "constrained"   ≥ 50 % of marks carry at least one dimension.
        "partial"       1+ marks found but < 50 % have dimensions.
        "unconstrained" zero marks found — caller should fallback (§2.3).
"""

from __future__ import annotations

import logging
import re
import sys
import os
from dataclasses import dataclass
from typing import Optional

# PyMuPDF
import fitz  # type: ignore

# Parent package is one level up from this file's directory
_HERE = os.path.dirname(os.path.abspath(__file__))
_EXPERIMENTS_DIR = os.path.dirname(_HERE)
_SIDECAR_DIR = os.path.dirname(_EXPERIMENTS_DIR)
if _SIDECAR_DIR not in sys.path:
    sys.path.insert(0, _SIDECAR_DIR)

from experiments.shared.constraint_types import ConstraintSet, MarkConstraint

logger = logging.getLogger(__name__)

# ── mark extraction ───────────────────────────────────────────────────────────
#
# Require a dash: prefix MUST be followed by "-" then digits to avoid matching
# bare sheet labels like "A1", "A4".
# Supported prefixes (per spec §4 + Martin additions): SF CW W GL SG IG SP A AL
#
_MARK_RE = re.compile(
    r"\b(SF|CW|W|GL|SG|IG|SP|AL|A)-(\d+[A-Z]?)\b"
)

# ── dimension extraction ──────────────────────────────────────────────────────
#
# Three common formats found in architectural elevation tickets:
#   12'-6"    →  feet + inches
#   150"      →  total inches
#   12.5 ft   →  decimal feet  (rare but seen in some sets)
#   12.5'     →  decimal feet (prime symbol)
#
_DIM_FEET_INCH_RE  = re.compile(r"(\d+)'-(\d+(?:\.\d+)?)[\"″]")
_DIM_TOTAL_INCH_RE = re.compile(r"(\d+(?:\.\d+)?)[\"″]")
_DIM_DECIMAL_FT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(?:ft|')")

PROXIMITY_PTS: float = 200.0   # search radius around each mark token (pts)


# ── internal helpers ──────────────────────────────────────────────────────────

@dataclass
class _TextSpan:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2


def _extract_spans(page: fitz.Page) -> list[_TextSpan]:
    """Return all text spans on *page* with their bounding boxes."""
    spans: list[_TextSpan] = []
    blocks = page.get_text("dict")["blocks"]
    for block in blocks:
        if block["type"] != 0:  # 0 = text
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                txt = span["text"].strip()
                if not txt:
                    continue
                bbox = span["bbox"]  # (x0, y0, x1, y1)
                spans.append(_TextSpan(txt, bbox[0], bbox[1], bbox[2], bbox[3]))
    return spans


def _nearby_spans(
    mark_span: _TextSpan,
    all_spans: list[_TextSpan],
    radius: float = PROXIMITY_PTS,
) -> list[_TextSpan]:
    """Return spans whose centre falls within *radius* pts of the mark centre."""
    cx, cy = mark_span.cx, mark_span.cy
    result: list[_TextSpan] = []
    for s in all_spans:
        if s is mark_span:
            continue
        dx = s.cx - cx
        dy = s.cy - cy
        if (dx * dx + dy * dy) <= radius * radius:
            result.append(s)
    return result


def _parse_dimension(text: str) -> Optional[float]:
    """
    Return the first dimension found in *text* as decimal feet, or ``None``.

    Search order:  feet+inch  >  decimal-ft  >  total-inch
    """
    # feet + inch: 12'-6"  →  12.5
    m = _DIM_FEET_INCH_RE.search(text)
    if m:
        ft = float(m.group(1))
        inch = float(m.group(2))
        return ft + inch / 12.0

    # decimal feet: 12.5 ft  or  12.5'
    m = _DIM_DECIMAL_FT_RE.search(text)
    if m:
        val = float(m.group(1))
        if 1.0 < val < 200.0:   # sanity: <1 ft and >200 ft not plausible
            return val

    # total inches: 150"  →  12.5 ft
    m = _DIM_TOTAL_INCH_RE.search(text)
    if m:
        val = float(m.group(1)) / 12.0
        if 1.0 < val < 200.0:
            return val

    return None


def _find_dimensions_near(
    mark_span: _TextSpan,
    all_spans: list[_TextSpan],
    radius: float = PROXIMITY_PTS,
) -> tuple[Optional[float], Optional[float]]:
    """
    Search nearby spans for width × height dimensions.

    Heuristic: dimensions are typically arranged left-to-right (width first)
    or top-to-bottom (height second).  We collect all parseable dimension
    values near the mark and assign the largest as width and the second
    largest as height (architectural drawings usually note width > height
    for storefronts/curtainwall).

    Returns (width_ft, height_ft) — either may be None.
    """
    nearby = _nearby_spans(mark_span, all_spans, radius)
    dims: list[float] = []
    for s in nearby:
        val = _parse_dimension(s.text)
        if val is not None:
            dims.append(val)

    dims.sort(reverse=True)
    width_ft  = dims[0] if len(dims) >= 1 else None
    height_ft = dims[1] if len(dims) >= 2 else None
    return width_ft, height_ft


# ── public API ────────────────────────────────────────────────────────────────

def extract_constraints(
    pdf_path: str,
    scan_pages: Optional[list[int]] = None,
    proximity_pts: float = PROXIMITY_PTS,
) -> ConstraintSet:
    """
    Open *pdf_path*, scan the given *scan_pages* for glazing mark tokens, and
    build a :class:`ConstraintSet`.

    Parameters
    ----------
    pdf_path
        Absolute path to the clean (non-marked-up) PDF.
    scan_pages
        0-based list of pages to search.  If ``None``, the production prescan
        is run to determine which pages to examine.
    proximity_pts
        Radius (in PDF points) around each mark token within which to search
        for dimension text.

    Returns
    -------
    ConstraintSet
    """
    if scan_pages is None:
        # Import prescan lazily to avoid circular dependency in tests
        from layers.layer_prescan import prescan_drawing_set  # type: ignore
        result = prescan_drawing_set(pdf_path)
        scan_pages = sorted(result.scan_pages)

    logger.info(
        "extract_constraints: scanning pages %s of %s",
        scan_pages,
        os.path.basename(pdf_path),
    )

    doc = fitz.open(pdf_path)
    collected: dict[str, MarkConstraint] = {}   # mark_id → MarkConstraint

    for pg_idx in scan_pages:
        if pg_idx >= len(doc):
            logger.warning("extract_constraints: page %d out of range, skipping", pg_idx)
            continue

        page = doc[pg_idx]
        spans = _extract_spans(page)
        logger.debug("Page %d: %d text spans", pg_idx, len(spans))

        for span in spans:
            m = _MARK_RE.fullmatch(span.text.strip())
            if m is None:
                # Also check multi-word spans that contain a mark token
                # (some PDFs embed the tag text together with surrounding spaces)
                m = _MARK_RE.search(span.text)
                if m is None:
                    continue

            mark_id = f"{m.group(1)}-{m.group(2)}"

            if mark_id in collected:
                # Already seen — only update if we gain dimension data
                existing = collected[mark_id]
                if existing.width_ft is not None and existing.height_ft is not None:
                    continue

            width_ft, height_ft = _find_dimensions_near(span, spans, proximity_pts)

            mc = MarkConstraint(
                mark_id=mark_id,
                width_ft=width_ft,
                height_ft=height_ft,
                source_page=pg_idx,
            )
            collected[mark_id] = mc

            logger.info(
                "  mark %s on page %d → w=%.1f ft, h=%.1f ft",
                mark_id,
                pg_idx,
                width_ft if width_ft is not None else float("nan"),
                height_ft if height_ft is not None else float("nan"),
            )

    doc.close()

    marks = list(collected.values())

    # Determine confidence level
    if not marks:
        confidence = "unconstrained"
    else:
        with_dims = sum(
            1 for m in marks
            if m.width_ft is not None or m.height_ft is not None
        )
        confidence = "constrained" if with_dims >= len(marks) / 2 else "partial"

    source = (
        f"elevation_text pages={scan_pages} "
        f"proximity={proximity_pts:.0f}pts"
    )

    cs = ConstraintSet(marks=marks, confidence=confidence, source=source)
    logger.info(
        "extract_constraints: found %d mark(s), confidence=%s",
        len(marks),
        confidence,
    )
    return cs


# ── CLI diagnostic ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    import json

    ap = argparse.ArgumentParser(
        description="Extract glazing mark constraints from a PDF elevation sheet."
    )
    ap.add_argument("pdf", help="Path to the clean (non-marked) PDF")
    ap.add_argument(
        "--pages",
        nargs="+",
        type=int,
        default=None,
        metavar="N",
        help="0-based page indices to scan (default: auto from prescan)",
    )
    ap.add_argument(
        "--proximity",
        type=float,
        default=PROXIMITY_PTS,
        help=f"Search radius in PDF points (default {PROXIMITY_PTS})",
    )
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s  %(message)s",
    )

    cs = extract_constraints(
        args.pdf, scan_pages=args.pages, proximity_pts=args.proximity
    )

    print(f"\nConstraintSet — confidence={cs.confidence}  source={cs.source!r}")
    print(f"  {len(cs.marks)} mark(s) found:")
    for mc in cs.marks:
        dims = (
            f"w={mc.width_ft:.2f}ft  h={mc.height_ft:.2f}ft"
            if mc.width_ft is not None
            else "no dimensions"
        )
        print(f"    {mc.mark_id:<12} page={mc.source_page}  {dims}")

    out = {
        "confidence": cs.confidence,
        "source": cs.source,
        "marks": [
            {
                "mark_id": mc.mark_id,
                "width_ft": mc.width_ft,
                "height_ft": mc.height_ft,
                "bay_count": mc.bay_count,
                "source_page": mc.source_page,
            }
            for mc in cs.marks
        ],
    }
    print("\n--- JSON ---")
    print(json.dumps(out, indent=2))
