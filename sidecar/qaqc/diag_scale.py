"""
diag_scale.py

Scale detection diagnostic — dumps all text found on a PDF page
so we can see exactly what text is present and why scale detection
may be failing.

Usage:
    cd sidecar
    python qaqc/diag_scale.py path/to/drawing.pdf 7
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fitz
from layers.layer2_extractor import detect_scale, _parse_scale_ratio


def run(pdf_path: str, page_num: int):
    print(f"\nScale Diagnostic: {pdf_path} page {page_num}")
    print("=" * 60)

    doc = fitz.open(pdf_path)
    if page_num >= len(doc):
        print(f"ERROR: Page {page_num} does not exist ({len(doc)} pages)")
        return

    page = doc[page_num]
    rect = page.rect
    w, h = rect.width, rect.height
    print(f"Page size: {w:.0f} x {h:.0f} pts")

    # Show all text blocks with position
    print(f"\n--- All text blocks ---")
    blocks = page.get_text("blocks")
    for i, block in enumerate(blocks):
        if len(block) <= 4:
            continue
        x0, y0, x1, y1 = block[0], block[1], block[2], block[3]
        text = block[4].strip()
        if not text:
            continue
        # Show region classification
        in_bottom = y0 > h * 0.80
        in_right = x0 > w * 0.75
        region = []
        if in_bottom:
            region.append("BOTTOM")
        if in_right:
            region.append("RIGHT")
        region_str = "+".join(region) if region else "body"

        # Try to parse each line as a scale
        lines = text.split('\n')
        for line in lines:
            line = line.strip()
            if not line:
                continue
            pts = _parse_scale_ratio(line)
            scale_info = f" -> {pts:.4f} pts/in MATCH" if pts else ""
            # Safe print — replace unencodeable chars
            safe_line = line[:80].encode('ascii', errors='replace').decode('ascii')
            out_str = f"  [{region_str:10s}] {safe_line}{scale_info}"
            print(out_str.encode('ascii', errors='replace').decode('ascii'))

    # Run actual scale detection
    print(f"\n--- Scale Detection Result ---")
    result = detect_scale(page)
    print(f"  scale_factor:   {result.scale_factor:.4f}")
    print(f"  confidence:     {result.scale_confidence:.0%}")
    print(f"  source:         {result.source}")

    doc.close()


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python qaqc/diag_scale.py path/to/drawing.pdf page_num")
        sys.exit(1)
    run(sys.argv[1], int(sys.argv[2]))
