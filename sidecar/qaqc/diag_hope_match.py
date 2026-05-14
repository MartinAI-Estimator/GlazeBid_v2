"""Diagnostic: trace what _parse_scale_ratio matches on Hope pages."""

import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fitz
from layers.layer2_extractor import _parse_scale_ratio

HOPE_PDF = os.path.join(os.path.dirname(__file__), "test_data",
    "Hope Aquatic & Rec Center - Bid Drawings - Non Marked.pdf")

doc = fitz.open(HOPE_PDF)

for pn in range(len(doc)):
    page = doc[pn]
    all_blocks = page.get_text("blocks")
    matches = []
    for block in all_blocks:
        if len(block) <= 4: continue
        text = block[4].strip()
        for line in text.split('\n'):
            pts = _parse_scale_ratio(line.strip())
            if pts and pts > 0 and 0.3 <= pts <= 300.0:
                matches.append((line.strip()[:80], pts, block[0], block[1]))
    
    if matches:
        w, h = page.rect.width, page.rect.height
        print(f"\nPage {pn} ({len(matches)} matches):")
        for text, pts, x, y in matches:
            pct_x = x / w * 100
            pct_y = y / h * 100
            print(f"  [{pct_x:.0f}%x,{pct_y:.0f}%y] pts={pts:.3f}: {text}")
    else:
        print(f"\nPage {pn}: NO MATCHES")

doc.close()
