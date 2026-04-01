"""Diagnostic: re-run rules engine on pages 7 and 34 after threshold fix."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from layers.layer2_extractor import extract_vector_graph
from layers.rules_engine import run_rules_engine

PDF = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_data", "test_elevation.pdf")

for page_num in [7, 34]:
    graph = extract_vector_graph(PDF, page_num=page_num, sheet_type='elevation')
    candidates = run_rules_engine(
        graph.x, graph.edge_index, graph.edge_attr,
        scale_factor=graph.scale.scale_factor,
        scale_confidence=graph.scale.scale_confidence,
        source_sheet=f'page_{page_num}'
    )
    accepted = [c for c in candidates if c.status == 'auto_accepted']
    review   = [c for c in candidates if c.status == 'needs_review']
    rejected = [c for c in candidates if c.status == 'rejected']
    print(f'Page {page_num}: scale={graph.scale.scale_factor:.4f} ({graph.scale.scale_confidence:.0%}) | candidates={len(candidates)} accepted={len(accepted)} review={len(review)} rejected={len(rejected)}')
    if accepted or review:
        top = (accepted or review)[0]
        print(f'  Top: conf={top.confidence:.2f} sys={top.system_hint} rules={top.rules_passed}')
