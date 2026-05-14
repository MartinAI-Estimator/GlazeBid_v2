"""Sprint 3 Gate Report — Schedule Parser Results."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from layers.layer3_schedule_parser import parse_schedule, find_schedule_pages

TEST_DATA = os.path.join(os.path.dirname(__file__), 'test_data')
MCLARTY = os.path.join(TEST_DATA, 'test_elevation.pdf')
HOPE = os.path.join(TEST_DATA, 'Hope Aquatic & Rec Center - Bid Drawings - Non Marked.pdf')

for name, path in [('McLarty Mazda', MCLARTY), ('Hope Aquatic', HOPE)]:
    print(f"\n{'='*60}")
    print(f"  {name}")
    print(f"{'='*60}")
    
    pages = find_schedule_pages(path)
    print(f"\n  Schedule pages found: {len(pages)}")
    for p in pages:
        print(f"    Page {p['page_number']} (idx {p['page_index']}) "
              f"score={p['score']} evidence={p['evidence_type']}")
    
    inventory = parse_schedule(path)
    qualified = [e for e in inventory.values() if e.mark and e.width_in > 0 and e.height_in > 0]
    
    print(f"\n  Total entries extracted: {len(inventory)}")
    print(f"  Entries with mark+width+height: {len(qualified)}")
    
    if qualified:
        print(f"\n  Qualified entries:")
        for e in qualified:
            print(f"    mark={e.mark:>6s}  W={e.width_in:6.1f}\"  H={e.height_in:6.1f}\""
                  f"  type={e.system_type:<16s}  desc={e.description[:50]}")
    
    if len(qualified) >= 3:
        print(f"\n  *** GATE PASS: {len(qualified)} entries with mark+width+height ***")
    else:
        print(f"\n  GATE: {len(qualified)} entries (need ≥3 for pass)")
