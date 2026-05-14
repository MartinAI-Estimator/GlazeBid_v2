"""Diagnostic: check what scale text exists and where on Hope pages."""

import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fitz
from layers.layer2_extractor import _parse_scale_ratio

HOPE_PDF = os.path.join(os.path.dirname(__file__), "test_data",
    "Hope Aquatic & Rec Center - Bid Drawings - Non Marked.pdf")

doc = fitz.open(HOPE_PDF)

# Check pages where confidence < 0.70
LOW_PAGES = [0, 1, 2, 3, 15, 16, 17]
# Also check pages with no detection at all
NO_DET = [6, 7, 8, 9]

for pn in LOW_PAGES + NO_DET:
    page = doc[pn]
    rect = page.rect
    w, h = rect.width, rect.height
    print(f"\n{'='*60}")
    print(f"Page {pn} — {w:.0f}×{h:.0f} pts")
    print(f"{'='*60}")
    
    # Check title block regions
    regions = {
        "bottom 20%": fitz.Rect(0, h * 0.80, w, h),
        "right 25%": fitz.Rect(w * 0.75, 0, w, h),
        "bottom-right": fitz.Rect(w * 0.60, h * 0.85, w, h),
    }
    
    for rname, region in regions.items():
        blocks = page.get_text("blocks", clip=region)
        scale_lines = []
        for block in blocks:
            if len(block) <= 4: continue
            text = block[4].strip()
            for line in text.split('\n'):
                line_stripped = line.strip()
                if not line_stripped: continue
                pts = _parse_scale_ratio(line_stripped)
                if pts and pts > 0:
                    scale_lines.append((line_stripped, pts, block[0], block[1]))
                elif any(kw in line_stripped.lower() for kw in ['scale', '1:', '= 1']):
                    scale_lines.append((line_stripped, None, block[0], block[1]))
        
        if scale_lines:
            print(f"\n  {rname}:")
            for text, pts, x, y in scale_lines:
                if pts:
                    print(f"    [{x:.0f},{y:.0f}] PARSED → {pts:.3f} pts/in: {text[:80]}")
                else:
                    print(f"    [{x:.0f},{y:.0f}] UNPARSED: {text[:80]}")
    
    # Full page: find all text with "scale" or ratio patterns
    all_blocks = page.get_text("blocks")
    print(f"\n  All scale-related text on page:")
    for block in all_blocks:
        if len(block) <= 4: continue
        text = block[4].strip()
        for line in text.split('\n'):
            line_stripped = line.strip()
            ll = line_stripped.lower()
            if 'scale' in ll or ('1:' in ll and any(c.isdigit() for c in ll)):
                x, y = block[0], block[1]
                pts = _parse_scale_ratio(line_stripped)
                pct_x = x / w * 100
                pct_y = y / h * 100
                print(f"    [{x:.0f},{y:.0f}] ({pct_x:.0f}%x,{pct_y:.0f}%y) "
                      f"{'→'+str(round(pts,3)) if pts else 'FAIL'}: {line_stripped[:80]}")

doc.close()
