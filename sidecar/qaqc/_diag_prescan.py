import sys
sys.path.insert(0, '.')
from layers.layer_prescan import prescan_drawing_set

PDF = 'qaqc/test_data/McLarty Mazda - Bid Plans - Non Marked.pdf'
result = prescan_drawing_set(PDF)
print(f'total={result.total_pages}  scan={result.scan_pages}  ref={result.reference_pages}')
for r in result.results:
    skip = r.skip_reason or '-'
    kw = r.keywords_found[:3] if r.keywords_found else []
    print(f'Page {r.page_num:>2}: {r.sheet_type:<15} score={r.relevance_score:.2f}  role={r.processing_role:<20}  paths={r.path_count:>4}  kw={kw}  skip={skip}')
