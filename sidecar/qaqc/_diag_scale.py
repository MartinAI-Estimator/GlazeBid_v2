import fitz, sys
sys.path.insert(0, '.')
from layers.layer2_extractor import detect_scale
doc = fitz.open('qaqc/test_data/McLarty Mazda - Bid Plans - Non Marked.pdf')
for i in range(6):
    page = doc[i]
    result = detect_scale(page)
    print(f'Page {i}: scale={result.scale_factor:.4f} conf={result.scale_confidence:.2f} source={result.source}')
    blocks = page.get_text('blocks')
    scale_blocks = [b[4].strip() for b in blocks if 'scale' in b[4].lower() or '1/' in b[4] or "=1'" in b[4]]
    print(f'  Scale-related text: {scale_blocks[:5]}')
doc.close()
