"""Diagnostic: re-check unknown system counts with scale propagation."""

import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fitz
import numpy as np
from layers.layer2_extractor import extract_vector_graph, detect_scale
from layers.rules_engine import (
    run_rules_engine, classify_system,
    CW_MIN_WIDTH_FT, CW_MIN_HEIGHT_FT, SF_MIN_WIDTH_FT, SF_MAX_WIDTH_FT,
)

HOPE_PDF = os.path.join(os.path.dirname(__file__), "test_data",
    "Hope Aquatic & Rec Center - Bid Drawings - Non Marked.pdf")

# First pass: detect scales for all pages
doc = fitz.open(HOPE_PDF)
n_pages = len(doc)
page_scales = []
for pn in range(n_pages):
    page = doc[pn]
    sc = detect_scale(page)
    page_scales.append(sc)
doc.close()

# Compute fallback: median of all detected scales > 0
valid_scales = [s.scale_factor for s in page_scales if s.scale_confidence >= 0.5]
fallback_sf = float(np.median(valid_scales)) if valid_scales else 0.0
fallback_conf = 0.50  # propagated scale gets lower confidence

print(f"Detected scales on {len(valid_scales)}/{n_pages} pages")
print(f"Fallback scale: {fallback_sf:.3f} pts/in (median of detected)")
print()

total = 0
unknown_count = 0
classified_by_propagation = 0

for pn in range(n_pages):
    graph = extract_vector_graph(HOPE_PDF, page_num=pn)
    
    if graph.node_count < 10:
        continue
    
    # Use propagated scale if page has no scale
    eff_sf = graph.scale.scale_factor
    eff_sc = graph.scale.scale_confidence
    propagated = False
    if eff_sc < 0.5 and fallback_sf > 0:
        eff_sf = fallback_sf
        eff_sc = fallback_conf
        propagated = True
    
    candidates = run_rules_engine(
        x=graph.x,
        edge_index=graph.edge_index,
        edge_attr=graph.edge_attr,
        scale_factor=eff_sf,
        scale_confidence=eff_sc,
        source_sheet=f"page_{pn}",
    )
    
    for c in candidates:
        if c.confidence < 0.70:
            continue
        total += 1
        
        if c.system_hint == "unknown":
            unknown_count += 1
        elif propagated:
            classified_by_propagation += 1

print(f"Total candidates ≥70%: {total}")
print(f"Unknown: {unknown_count} ({unknown_count/total*100:.1f}%)" if total > 0 else "No candidates")
print(f"Classified via scale propagation: {classified_by_propagation}")
print(f"\nTarget: <10% unknown")
