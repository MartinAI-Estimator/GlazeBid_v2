"""Diagnostic: trace why candidates get 'unknown' system classification."""

import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fitz
from layers.layer2_extractor import extract_vector_graph
from layers.rules_engine import (
    run_rules_engine, classify_system,
    CW_MIN_WIDTH_FT, CW_MIN_HEIGHT_FT, SF_MIN_WIDTH_FT, SF_MAX_WIDTH_FT,
)

HOPE_PDF = os.path.join(os.path.dirname(__file__), "test_data",
    "Hope Aquatic & Rec Center - Bid Drawings - Non Marked.pdf")

doc = fitz.open(HOPE_PDF)
n_pages = len(doc)
doc.close()

total = 0
unknown_count = 0
unknown_reasons = {"low_scale": 0, "too_narrow": 0, "too_short": 0, "other": 0}
unknown_dims = []

for pn in range(n_pages):
    graph = extract_vector_graph(HOPE_PDF, page_num=pn)
    
    if graph.node_count < 10:
        continue
    
    candidates = run_rules_engine(
        x=graph.x,
        edge_index=graph.edge_index,
        edge_attr=graph.edge_attr,
        scale_factor=graph.scale.scale_factor,
        scale_confidence=graph.scale.scale_confidence,
        source_sheet=f"page_{pn}",
    )
    
    for c in candidates:
        if c.confidence < 0.70:
            continue
        total += 1
        
        if c.system_hint == "unknown":
            unknown_count += 1
            # Diagnose why
            sf = graph.scale.scale_factor
            sc = graph.scale.scale_confidence
            bb = c.bounding_box
            
            if sc < 0.5 or sf <= 0:
                unknown_reasons["low_scale"] += 1
                unknown_dims.append((pn, "low_scale", sc, sf, 0, 0))
            else:
                w_ft = (bb.width / sf) / 12.0
                h_ft = (bb.height / sf) / 12.0
                
                if w_ft < SF_MIN_WIDTH_FT:
                    unknown_reasons["too_narrow"] += 1
                elif h_ft < 2.0:
                    unknown_reasons["too_short"] += 1
                else:
                    unknown_reasons["other"] += 1
                
                unknown_dims.append((pn, f"w={w_ft:.1f}ft h={h_ft:.1f}ft", sc, sf, w_ft, h_ft))

print(f"Total candidates ≥70%: {total}")
print(f"Unknown: {unknown_count} ({unknown_count/total*100:.0f}%)" if total > 0 else "No candidates")
print(f"\nUnknown breakdown:")
for reason, count in unknown_reasons.items():
    print(f"  {reason}: {count}")

print(f"\nUnknown candidate details (page, reason, scale_conf, scale_factor, w_ft, h_ft):")
for item in unknown_dims[:30]:
    print(f"  Page {item[0]:2d}: {item[1]:<25s} scale_conf={item[2]:.2f} sf={item[3]:.3f}")
