"""Engine-only marks → probable (same item matched Martin somewhere) vs suspicious."""
import json, sys, collections
sys.path.insert(0, '/home/claude/build')
from eval_v3 import _iou, _inside, family

def touches(a, b):
    return _iou(a, b) > 0.1 or _inside(a, b, 0.5) or _inside(b, a, 0.5)

def sort_extras(res, key):
    items = {i['id']: i for i in res['items']}
    bys = collections.defaultdict(list)
    for k in key:
        bys[k['sheet']].append(k)
    marks = [m for m in res['markups'] if m['role'] in ('region', 'linear', 'area') and m['rect']
             and items.get(m['item'], {}).get('kind') not in ('excluded',)]
    matched_items = set()
    unmatched = []
    for m in marks:
        if any(touches(m['rect'], k['rect']) for k in bys[m['sheet']]):
            matched_items.add(m['item'])
        else:
            unmatched.append(m)
    martin_fams = collections.defaultdict(set)
    for k in key:
        s = (k.get('subject') or '').lower()
        martin_fams[k['sheet']].add(s)
    prob, susp = [], []
    marked_sheets = {k['sheet'] for k in key if (k.get('subject') or '') not in ('', 'Legend')}
    unrev = [m for m in unmatched if m['sheet'] not in marked_sheets]
    unmatched = [m for m in unmatched if m['sheet'] in marked_sheets]
    for m in unmatched:
        it = items.get(m['item'], {})
        if m['item'] in matched_items:
            prob.append(m)
        else:
            susp.append(m)
    sort_extras.unreviewed = len(unrev)
    by_item = collections.defaultdict(list)
    for m in susp:
        by_item[m['item']].append(m)
    return len(marks), prob, susp, by_item, items

if __name__ == '__main__':
    res = json.load(open(sys.argv[1])); key = json.load(open(sys.argv[2]))
    n, prob, susp, by_item, items = sort_extras(res, key)
    u = getattr(sort_extras, 'unreviewed', 0)
    print(f'engine marks {n}: matched {n-len(prob)-len(susp)-u}, engine-only probable {len(prob)}, suspicious {len(susp)} ({len(by_item)} items), on sheets you did not mark {u}')
    rows = []
    for iid, ms in sorted(by_item.items(), key=lambda kv: -len(kv[1])):
        it = items.get(iid, {})
        rows.append({'item': iid, 'class': it.get('cls'), 'source': it.get('source'), 'marks': len(ms),
                     'sheets': sorted({m['sheet'] for m in ms}), 'why': (it.get('desc') or '')[:90]})
    json.dump(rows, open(sys.argv[3], 'w'), indent=1)
    for r in rows[:40]:
        print(f"  {r['marks']:>3}  {r['item'][:28]:<28} {str(r['class'])[:18]:<18} {r['source']:<9} {','.join(r['sheets'])[:30]:<30} {r['why'][:60]}")
