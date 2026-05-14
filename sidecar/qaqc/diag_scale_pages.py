"""Diagnostic: run scale detection on every page of both test PDFs."""

import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fitz
from layers.layer2_extractor import detect_scale, _parse_scale_ratio

TEST_DATA = os.path.join(os.path.dirname(__file__), "test_data")
PDFS = [
    ("McLarty", os.path.join(TEST_DATA, "test_elevation.pdf")),
    ("Hope", os.path.join(TEST_DATA, "Hope Aquatic & Rec Center - Bid Drawings - Non Marked.pdf")),
]

for label, path in PDFS:
    if not os.path.exists(path):
        print(f"\n{label}: NOT FOUND"); continue
    
    doc = fitz.open(path)
    n = len(doc)
    detected = 0
    high_conf = 0
    print(f"\n{'='*70}")
    print(f"{label} — {n} pages")
    print(f"{'='*70}")
    print(f"{'Page':>4}  {'Conf':>5}  {'Factor':>8}  {'Source':<20}  Scale")
    print(f"{'----':>4}  {'-----':>5}  {'--------':>8}  {'------':<20}  -----")
    
    # Also collect all text lines that contain "scale" for debugging
    missed_scale_lines = []
    
    for i in range(n):
        page = doc[i]
        sc = detect_scale(page)
        
        if sc.scale_confidence > 0:
            detected += 1
            if sc.scale_confidence >= 0.70:
                high_conf += 1
            
            # Reverse-engineer the scale string
            ppi = sc.scale_factor
            if ppi > 0:
                paper_in = ppi / 72.0
                # paper_in inches on paper = 1 foot real
                if paper_in > 0:
                    # Express as fraction
                    inv = 1.0 / paper_in  # denominator if numerator=1
                    scale_str = f"1/{inv:.0f}\" = 1'-0\"" if inv > 1.5 else f"{paper_in:.2f}\" = 1'-0\""
                else:
                    scale_str = "?"
            else:
                scale_str = "unknown"
            
            print(f"{i:4d}  {sc.scale_confidence:5.2f}  {sc.scale_factor:8.3f}  {sc.source:<20}  {scale_str}")
        else:
            # Search for any "scale" text on the page
            text = page.get_text()
            for line in text.split('\n'):
                ll = line.strip().lower()
                if 'scale' in ll or '1/8' in ll or '1/4' in ll or '3/16' in ll:
                    missed_scale_lines.append((i, line.strip()))
    
    print(f"\nSummary: {detected}/{n} pages scale detected, {high_conf}/{n} at ≥0.70 confidence")
    print(f"Target: ≥80% of scale-labeled pages at ≥0.70 confidence")
    
    if missed_scale_lines:
        print(f"\nMissed scale-related text lines ({len(missed_scale_lines)} lines):")
        for pg, line in missed_scale_lines[:20]:
            print(f"  Page {pg}: {line[:100]}")
    
    doc.close()
