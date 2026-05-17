"""
GlazierAI Drawing Intelligence — Vision Helper
Converts PyMuPDF pages to Claude Vision API content blocks.
Written once, reused across all 6 extraction steps.
"""

from __future__ import annotations
import base64
import logging
from pathlib import Path
import fitz  # PyMuPDF — already in project, no new dependency

logger = logging.getLogger(__name__)

# Claude Vision hard limit — both dimensions must be below this.
_CLAUDE_MAX_PX = 7800  # 200px margin under the API's 8000px limit


def _clamp_dpi(page: fitz.Page, dpi: int) -> int:
    """
    Return the highest DPI that keeps both rendered dimensions under _CLAUDE_MAX_PX.
    Architectural E-size sheets (36"×48") at 200 DPI = 7200×9600px — exceeds limit.
    This clamp silently reduces DPI as needed and logs when it does so.
    """
    w_pts = page.rect.width   # PDF points (1 pt = 1/72 inch)
    h_pts = page.rect.height
    max_dpi = int(min(_CLAUDE_MAX_PX / w_pts, _CLAUDE_MAX_PX / h_pts) * 72)
    if dpi > max_dpi:
        logger.debug(
            f"DPI clamped {dpi} → {max_dpi} "
            f"(page {page.number}: {w_pts:.0f}×{h_pts:.0f}pts, "
            f"would render {int(w_pts*dpi/72)}×{int(h_pts*dpi/72)}px)"
        )
        return max_dpi
    return dpi


def page_to_vision_block(page: fitz.Page, dpi: int = 150) -> dict:
    """
    Convert a single PyMuPDF page to a Claude Vision API content block.

    Args:
        page: PyMuPDF Page object
        dpi:  Render resolution.
              100 = sheet classification (routing only, cheaper)
              150 = floor plans (room labels, mark locations)
              200 = elevations, schedules, legends (must read small text)

    Returns:
        Dict ready for inclusion in Claude API messages[].content[].
        Includes page_index metadata for downstream tracking.
    """
    dpi = _clamp_dpi(page, dpi)
    matrix = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    img_bytes = pix.tobytes("png")
    b64 = base64.b64encode(img_bytes).decode("utf-8")

    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": b64,
        },
        # Metadata — stripped before sending to API, used for tracking
        "_page_index": page.number,
        "_dpi": dpi,
        "_width_px": pix.width,
        "_height_px": pix.height,
    }


def strip_metadata(block: dict) -> dict:
    """Remove internal metadata keys before sending block to Claude API."""
    return {k: v for k, v in block.items() if not k.startswith("_")}


def pdf_pages_to_vision_blocks(
    pdf_path: str | Path,
    dpi: int = 150,
    page_indices: list[int] | None = None,
) -> list[dict]:
    """
    Render selected pages of a PDF as Claude Vision content blocks.

    Args:
        pdf_path:     Path to the PDF file
        dpi:          Render resolution (applied uniformly to all pages)
        page_indices: 0-based page numbers to render. None = all pages.

    Returns:
        List of content block dicts with metadata, in page order.
        Strip metadata with strip_metadata() before sending to API.
    """
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    doc = fitz.open(str(pdf_path))
    indices = page_indices if page_indices is not None else list(range(len(doc)))

    blocks = []
    for i in indices:
        if i >= len(doc):
            raise IndexError(f"Page index {i} out of range for {len(doc)}-page PDF")
        block = page_to_vision_block(doc[i], dpi=dpi)
        blocks.append(block)

    doc.close()
    return blocks


def pdf_page_to_vision_block(
    pdf_path: str | Path,
    page_index: int,
    dpi: int = 200,
) -> dict:
    """
    Render a single page from a PDF as a Claude Vision content block.
    Convenience wrapper — opens and closes the PDF for you.

    Args:
        pdf_path:   Path to the PDF file
        page_index: 0-based page number
        dpi:        Render resolution

    Returns:
        Single content block dict with metadata.
    """
    pdf_path = Path(pdf_path)
    doc = fitz.open(str(pdf_path))
    block = page_to_vision_block(doc[page_index], dpi=dpi)
    doc.close()
    return block


# ─── DPI Reference ────────────────────────────────────────────────────────────
# These are the standard DPI values for each Drawing Intelligence step.
# Import and use these constants rather than hardcoding DPI values.

DPI_CLASSIFIER    = 100  # Step 1 — sheet type routing only
DPI_FLOOR_PLAN    = 150  # Step 6 — room labels, mark dot locations
DPI_ELEVATION     = 200  # Step 3 — mark labels, dimension strings
DPI_SCHEDULE      = 200  # Steps 4/5 — dense table text, glass specs
DPI_LEGEND        = 200  # Step 2 — system codes, finish designations
DPI_DETAIL        = 200  # Step 7 — condition references (future)
