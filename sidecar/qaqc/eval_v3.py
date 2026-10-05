"""
eval_v3.py — score an auto-takeoff by SCOPE OBJECT, not by rectangle overlap.

Two answer-key formats:

  --key takeoff_blind.json     (a ledger: items with id / class / qty / w / h)
      per key item with a mark:   found (mark present), classified (class family
      agrees), counted (qty equal), sized (W and H within 2" or 3 %).

  --key martin_markups.json    (Bluebeam markups exported from Martin's set)
      every Highlight / Area / Door / Polylength markup is one scope object:
      found when an auto markup of the same class FAMILY touches it on the same
      sheet (IoU ≥ 0.25, or either box inside the other).  Count symbols,
      text boxes and general notes are not scored.

Usage:
    python eval_v3.py result.json --key takeoff_blind.json
    python eval_v3.py result.json --key martin_markups.json
    python eval_v3.py result.json --key a.json --key b.json --json out.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
for cand in (HERE, HERE.parent, HERE.parent.parent):
    if (cand / "knowledge").exists() and str(cand) not in sys.path:
        sys.path.insert(0, str(cand))

try:
    from knowledge.taxonomy import classify_markup, classes as _classes
except Exception:   # pragma: no cover
    classify_markup = None
    _classes = lambda: {}

_FAMILY_ALIAS = {"not_ours": "excluded", "all_glass": "all_glass", "hardware": "implied", "bifold": "specialty",
                 "pass_thru": "specialty", "auto_door": "pass_thru"}


def family(cls: str) -> str:
    cls = _FAMILY_ALIAS.get(cls, cls)
    c = _classes().get(cls)
    if c:
        return c["family"]
    if cls.endswith("_door"):
        return family(cls[:-5])
    return {"ext_sf": "storefront", "int_sf": "storefront", "ext_cw": "curtain_wall", "int_cw": "curtain_wall",
            "all_glass_wall": "all_glass", "all_glass": "all_glass", "glazing_only": "glazing_only",
            "excluded": "excluded", "break_metal": "implied", "glass_film": "implied", "mirror": "specialty",
            "bifold_sliding": "specialty", "window_wall": "window_wall", "window": "window"}.get(cls, cls)


def _expand(mark: str) -> list[str]:
    """'24-26' -> ['24','25','26']; '17-19' likewise; 'D2' -> ['D2']."""
    m = re.fullmatch(r"(\d+)-(\d+)", mark)
    if m and int(m.group(2)) > int(m.group(1)) and int(m.group(2)) - int(m.group(1)) < 12:
        return [str(k) for k in range(int(m.group(1)), int(m.group(2)) + 1)]
    return [p.strip() for p in re.split(r"[/,]", mark) if p.strip()]


def _inch(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace("”", '"').replace("’", "'")
    m = re.match(r"^\s*(\d+)'\s*-?\s*(\d+)?(?:\s+(\d+)/(\d+))?", s)
    if not m:
        return None
    v = int(m.group(1)) * 12 + int(m.group(2) or 0)
    if m.group(3):
        v += int(m.group(3)) / int(m.group(4))
    return float(v)


def score_vs_ledger(result: dict, key: dict) -> dict:
    items = {i["id"]: i for i in result["items"] if i.get("source", "schedule") == "schedule"}
    alias = {}
    group_size = {}
    for i in items.values():
        parts = _expand(i["id"])
        group_size[i["id"]] = len(parts)
        for m in parts:
            alias.setdefault(m, i["id"])
    rows = []
    for k in key.get("items", []):
        kid = str(k.get("id", ""))
        if not kid or kid.startswith(("X-", "BM", "HW", "HDR", "NOTE", "MIR", "GF", "FROST", "LEGEND", "DET")):
            continue
        it = items.get(kid) or items.get(alias.get(kid, ""))
        if it is None:
            # group keys like "17-19" in the key vs 17 in ours, or the reverse
            for m in _expand(kid):
                it = items.get(m) or items.get(alias.get(m, ""))
                if it:
                    break
        # "1-BF" style sub-items (a pass-thru door inside frame 1) match the frame's implied list
        sub = None
        if it is None and "-" in kid and not re.fullmatch(r"\d+-\d+", kid):
            base = kid.split("-")[0]
            it = items.get(base) or items.get(alias.get(base, ""))
            sub = kid.split("-", 1)[1] if it else None
        row = {"id": kid, "found": it is not None, "classified": None, "counted": None, "sized": None,
               "key_class": k.get("class"), "our_class": it["cls"] if it else None}
        if it:
            kc = family(k.get("class", ""))
            oc = family(it["cls"])
            if sub:
                oc_sub = [family(x.get("cls", "")) for x in it.get("implied", [])]
                row["classified"] = kc in oc_sub or kc == oc
                row["our_class"] = f"{it['cls']} + {[x.get('cls') for x in it.get('implied', [])]}"
            else:
                row["classified"] = kc == oc
            kq = k.get("qty")
            oq = it.get("qty") or 0
            g = group_size.get(it["id"], 1)
            if g > 1 and kid != it["id"]:
                oq = oq / g     # key counts one mark of the group
            row["counted"] = (kq is None) or (isinstance(kq, (int, float)) and int(kq) == oq) or sub is not None
            kw, kh = _inch(k.get("w")), _inch(k.get("h"))
            if kw and kh and it.get("w_in") and it.get("h_in"):
                row["sized"] = abs(kw - it["w_in"]) <= max(2, 0.03 * kw) and abs(kh - it["h_in"]) <= max(2, 0.03 * kh)
        rows.append(row)
    n = len(rows)
    f = sum(1 for r in rows if r["found"])
    c = sum(1 for r in rows if r["classified"])
    q = sum(1 for r in rows if r["counted"])
    sized_rows = [r for r in rows if r["sized"] is not None]
    s = sum(1 for r in sized_rows if r["sized"])
    key_ids = {str(k.get("id")) for k in key.get("items", [])}
    extras = [i for i in items.values() if i["kind"] in ("scope", "pass_thru") and i["id"] not in key_ids
              and not any(m in key_ids for m in re.split(r"[-/,]", i["id"]))]
    return {"mode": "ledger", "objects": n, "found": f, "found_pct": round(100 * f / n, 1) if n else None,
            "classified": c, "counted": q, "sized": f"{s}/{len(sized_rows)}",
            "extra_scope_items": [i["id"] for i in extras],
            "misses": [r["id"] for r in rows if not r["found"]],
            "misclassified": [(r["id"], r["key_class"], r["our_class"]) for r in rows if r["found"] and not r["classified"]],
            "miscounted": [r["id"] for r in rows if r["found"] and r["counted"] is False],
            "rows": rows}


def _iou(a, b):
    ix0, iy0, ix1, iy1 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua else 0.0


def _inside(a, b, frac=0.8):
    ix0, iy0, ix1, iy1 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    if ix1 <= ix0 or iy1 <= iy0:
        return False
    inter = (ix1 - ix0) * (iy1 - iy0)
    aa = (a[2] - a[0]) * (a[3] - a[1])
    return aa > 0 and inter / aa >= frac


def score_vs_markups(result: dict, key: list) -> dict:
    """Martin's markups as scope objects.  Needs knowledge.taxonomy for subject → class."""
    if classify_markup is None:
        return {"mode": "markups", "error": "knowledge.taxonomy not importable"}
    ours = result["markups"]
    item_cls = {i["id"]: i["cls"] for i in result["items"]}
    by_sheet: dict[str, list] = {}
    for m in ours:
        if m.get("rect") and m.get("role") in ("region", "area", "door", "linear"):
            cls = item_cls.get(m["item"], "")
            by_sheet.setdefault(m["sheet"], []).append((m, family(cls)))
    rows = []
    for k in key:
        cls, role = classify_markup(k.get("subject"), k.get("type"), k.get("fill"), k.get("title"))
        if cls in ("ignore", "note", "qty_label", "measure") or role in ("count", "label"):
            continue
        if cls == "excluded":
            continue   # Martin leaves exclusions blank; ours are extra red marks, not misses
        fam = family(cls)
        kr = k["rect"]
        cands = by_sheet.get(k["sheet"], [])
        hit = None
        for m, mf in cands:
            if _iou(kr, m["rect"]) >= 0.25 or _inside(kr, m["rect"]) or _inside(m["rect"], kr):
                hit = (m, mf)
                if mf == fam:
                    break
        rows.append({"sheet": k["sheet"], "subject": k.get("subject"), "key_class": cls, "rect": kr,
                     "found": hit is not None, "classified": (hit is not None and hit[1] == fam),
                     "our_item": hit[0]["item"] if hit else None})
    n = len(rows)
    f = sum(1 for r in rows if r["found"])
    c = sum(1 for r in rows if r["classified"])
    by_class: dict[str, dict] = {}
    for r in rows:
        d = by_class.setdefault(r["key_class"], {"n": 0, "found": 0})
        d["n"] += 1
        d["found"] += 1 if r["found"] else 0
    return {"mode": "markups", "objects": n, "found": f, "found_pct": round(100 * f / n, 1) if n else None,
            "classified": c, "by_class": by_class,
            "misses": [(r["sheet"], r["subject"], [round(v) for v in r["rect"]]) for r in rows if not r["found"]],
            "rows": rows}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("result")
    ap.add_argument("--key", action="append", required=True)
    ap.add_argument("--json", default=None)
    a = ap.parse_args(argv)
    res = json.load(open(a.result, encoding="utf-8"))
    reports = []
    for kp in a.key:
        key = json.load(open(kp, encoding="utf-8"))
        rep = score_vs_ledger(res, key) if isinstance(key, dict) else score_vs_markups(res, key)
        rep["key"] = kp
        reports.append(rep)
        print(f"== {kp} [{rep['mode']}]")
        if "error" in rep:
            print("   ", rep["error"])
            continue
        print(f"   objects {rep['objects']}  found {rep['found']} ({rep['found_pct']}%)  classified {rep['classified']}"
              + (f"  counted {rep['counted']}  sized {rep['sized']}" if rep["mode"] == "ledger" else ""))
        if rep["mode"] == "ledger":
            print("   misses:", rep["misses"])
            print("   misclassified:", rep["misclassified"])
            print("   miscounted:", rep["miscounted"])
            print("   extra scope items:", rep["extra_scope_items"])
        else:
            print("   by class:", rep["by_class"])
            print("   misses:", rep["misses"][:25], "…" if len(rep["misses"]) > 25 else "")
    if a.json:
        for r in reports:
            r.pop("rows", None)
        json.dump(reports, open(a.json, "w", encoding="utf-8"), indent=1)


if __name__ == "__main__":
    main()
