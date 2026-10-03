"""
eval_v2.py — scores an auto-takeoff against the estimators' Bluebeam markups,
using Martin's definition of "found the scope" (interview 2026-10-03).

What changed from eval_harness.py (v1, kept for the July ledger):
  * Subjects → classes come from knowledge/scope_taxonomy.json (Martin's real
    tool chest). WW = window wall. General Note / Architect / clouds ignored.
  * Duplicate jobs are dropped (Olathe "Bid Set BRIAN" == "100% DD").
  * AutoCAD SHX Text "annotations" (architect linework) are not ground truth.
  * One opening marked twice (Highlight + Area on the same frame) is ONE item.
  * Doors (circles) are scored as points: a door is found if a candidate door
    of any door class lands within --door-tol points of it.
  * Exclusions are scored on their own: the AI must mark them too.
  * Brian's markups count (same toolbox, same standard).

Candidate file (same as v1, two optional keys):
{
  "job": "<corpus job name>", "source": "<pipeline version>",
  "candidates": [
    {"page": 4, "rect": [x0,y0,x1,y1], "scope_class": "ext_sf",
     "role": "region" | "door",          # optional, default region
     "confidence": 0.9, "flag": "needs review: …"}   # optional
  ]
}

Usage:
  python qaqc/eval_v2.py --self-test --corpus corpus/markup_corpus.json
  python qaqc/eval_v2.py cand_*.json --corpus corpus/markup_corpus.json -o qaqc/baseline/v2
  python qaqc/eval_v2.py --list-jobs --corpus corpus/markup_corpus.json
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from knowledge.taxonomy import classify_markup, classes  # noqa: E402

ACCEPTANCE_JOBS = ["McLarty Mazda - Bid Plans", "Curtis MS Renovation - Bid Set",
                   "Hope Aquatic & Rec Center - Bid Drawings"]

# Classes scored as regions / doors.  Notes, measures, labels are not "scope found".
_DOOR_ROLE = {"door"}
_REGION_ROLES = {"region", "area"}


def _kind(cls: str) -> str:
    c = classes().get(cls)
    return c["kind"] if c else "ignore"


def _family(cls: str) -> str:
    c = classes().get(cls)
    return c["family"] if c else "ignore"


# ── geometry ─────────────────────────────────────────────────────────────────

def iou(a, b) -> float:
    ix0, iy0, ix1, iy1 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    ua = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def center(r):
    return ((r[0] + r[2]) / 2, (r[1] + r[3]) / 2)


def contains(r, p) -> bool:
    return r[0] <= p[0] <= r[2] and r[1] <= p[1] <= r[3]


def dist(p, q) -> float:
    return ((p[0]-q[0])**2 + (p[1]-q[1])**2) ** 0.5


# ── ground truth ─────────────────────────────────────────────────────────────

def _fingerprint(job: dict) -> frozenset:
    # page numbers ignored: the same markups re-saved into a longer set are the same job
    return frozenset(f"{a['subject']}|{[round(v) for v in a['rect']]}" for p in job["pages"] for a in p["annotations"])


def _same_job(a: frozenset, b: frozenset) -> bool:
    return bool(a) and len(a & b) / len(a | b) >= 0.9


def load_gt(corpus_path: Path) -> tuple[dict, list[str]]:
    """job → {"regions": {page: [items]}, "doors": {page: [items]}, "excluded": {page: [items]}}"""
    corpus = json.loads(corpus_path.read_text(encoding="utf-8"))
    seen, dropped, gt = {}, [], {}
    for job in corpus["jobs"]:
        fp = _fingerprint(job)
        dup = next((name for f, name in seen.items() if _same_job(fp, f)), None)
        if dup:
            dropped.append(f"{job['job']} (duplicate of {dup})")
            continue
        seen[fp] = job["job"]
        regions, doors, excluded = defaultdict(list), defaultdict(list), defaultdict(list)
        for p in job["pages"]:
            for a in p["annotations"]:
                cls, role = classify_markup(a["subject"], a["type"], a.get("fill") or a.get("stroke"), a.get("author"))
                k = _kind(cls)
                item = {"rect": a["rect"], "class": cls, "subject": a["subject"], "author": a.get("author")}
                if k == "exclusion" and role in _REGION_ROLES:
                    excluded[p["page"]].append(item)
                elif k in ("scope", "pass_thru", "implied"):
                    if role in _DOOR_ROLE:
                        doors[p["page"]].append(item)
                    elif role in _REGION_ROLES:
                        regions[p["page"]].append(item)
        # Highlight + Area on the same opening = one item
        for pg, items in regions.items():
            merged: list[dict] = []
            for it in sorted(items, key=lambda x: -(x["rect"][2]-x["rect"][0])*(x["rect"][3]-x["rect"][1])):
                if any(_family(m["class"]) == _family(it["class"]) and
                       (iou(m["rect"], it["rect"]) >= 0.5 or contains(m["rect"], center(it["rect"])) and iou(m["rect"], it["rect"]) >= 0.3)
                       for m in merged):
                    continue
                merged.append(it)
            regions[pg] = merged
        gt[job["job"]] = {"regions": dict(regions), "doors": dict(doors), "excluded": dict(excluded)}
    return gt, dropped


# ── scoring ──────────────────────────────────────────────────────────────────

def _match_regions(gts, cands, iou_t):
    """greedy; returns list of (gi, ci) and unmatched cand idx"""
    pairs, used = [], set()
    for gi, g in enumerate(gts):
        best, bc = -1.0, None
        gc = center(g["rect"])
        for ci, c in enumerate(cands):
            if ci in used:
                continue
            ov = iou(c["rect"], g["rect"])
            if ov >= iou_t or contains(c["rect"], gc):
                if ov > best:
                    best, bc = ov, ci
        if bc is not None:
            used.add(bc)
            pairs.append((gi, bc))
    return pairs, [ci for ci in range(len(cands)) if ci not in used]


def _match_points(gts, cands, tol):
    pairs, used = [], set()
    for gi, g in enumerate(gts):
        gc = center(g["rect"])
        best, bc = tol, None
        for ci, c in enumerate(cands):
            if ci in used:
                continue
            d = dist(center(c["rect"]), gc)
            if d <= best:
                best, bc = d, ci
        if bc is not None:
            used.add(bc)
            pairs.append((gi, bc))
    return pairs, [ci for ci in range(len(cands)) if ci not in used]


def score_job(cands: list[dict], g: dict, iou_t: float, door_tol: float) -> dict:
    by_page = defaultdict(lambda: {"regions": [], "doors": [], "excluded": []})
    for c in cands:
        cls = c.get("scope_class", "")
        role = c.get("role", "region")
        k = _kind(cls)
        bucket = "excluded" if k == "exclusion" else ("doors" if role == "door" else "regions")
        by_page[c["page"]][bucket].append(c)

    out = {}
    per_class = defaultdict(lambda: {"gt": 0, "found": 0, "class_ok": 0, "cand": 0})
    diff = {"missed": [], "false_positive": [], "misclassified": []}
    for bucket in ("regions", "doors", "excluded"):
        tp = cls_ok = n_gt = n_c = 0
        pages = set(g[bucket]) | {p for p, v in by_page.items() if v[bucket]}
        for pg in pages:
            gts = g[bucket].get(pg, [])
            cs = by_page[pg][bucket] if pg in by_page else []
            n_gt += len(gts)
            n_c += len(cs)
            for c in cs:
                per_class[c.get("scope_class", "?")]["cand"] += 1
            for x in gts:
                per_class[x["class"]]["gt"] += 1
            if bucket == "doors":
                pairs, fp = _match_points(gts, cs, door_tol)
            else:
                pairs, fp = _match_regions(gts, cs, iou_t)
            matched_g = {gi for gi, _ in pairs}
            for gi, ci in pairs:
                tp += 1
                gx, cx = gts[gi], cs[ci]
                per_class[gx["class"]]["found"] += 1
                if cx.get("scope_class") == gx["class"]:
                    cls_ok += 1
                    per_class[gx["class"]]["class_ok"] += 1
                else:
                    diff["misclassified"].append({"bucket": bucket, "page": pg, "gt_class": gx["class"],
                                                  "gt_subject": gx["subject"], "cand_class": cx.get("scope_class"),
                                                  "rect": gx["rect"]})
            for gi, gx in enumerate(gts):
                if gi not in matched_g:
                    diff["missed"].append({"bucket": bucket, "page": pg, "class": gx["class"],
                                           "subject": gx["subject"], "rect": gx["rect"]})
            for ci in fp:
                diff["false_positive"].append({"bucket": bucket, "page": pg,
                                               "class": cs[ci].get("scope_class"), "rect": cs[ci]["rect"]})
        out[bucket] = {"gt": n_gt, "cand": n_c, "found": tp, "class_ok": cls_ok,
                       "recall": _r(tp, n_gt), "precision": _r(tp, n_c), "class_acc": _r(cls_ok, tp),
                       "e2e_recall": _r(cls_ok, n_gt)}
    out["per_class"] = {k: dict(v) for k, v in sorted(per_class.items())}
    out["diff"] = diff
    return out


def _r(n, d):
    return round(n / d, 3) if d else None


def _self_candidates(g: dict) -> list[dict]:
    c = []
    for bucket, role in (("regions", "region"), ("doors", "door"), ("excluded", "region")):
        for pg, items in g[bucket].items():
            c += [{"page": pg, "rect": x["rect"], "scope_class": x["class"], "role": role} for x in items]
    return c


def _print_row(name, s):
    r, d, e = s["regions"], s["doors"], s["excluded"]
    print(f"{name[:44]:44s} | items {r['found']:4d}/{r['gt']:<4d} R={r['recall']} P={r['precision']} cls={r['class_acc']}"
          f" | doors {d['found']}/{d['gt']} R={d['recall']} | excl {e['found']}/{e['gt']}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("candidates", nargs="*")
    ap.add_argument("--corpus", required=True)
    ap.add_argument("--iou", type=float, default=0.25)
    ap.add_argument("--door-tol", type=float, default=36.0, help="points (36 pt = 1/2 inch on paper)")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--list-jobs", action="store_true")
    ap.add_argument("-o", "--out")
    a = ap.parse_args()

    gt, dropped = load_gt(Path(a.corpus))
    if dropped:
        print("dropped duplicate jobs:", "; ".join(dropped))

    if a.list_jobs:
        for j, g in gt.items():
            n = lambda b: sum(len(v) for v in g[b].values())
            star = "*" if j in ACCEPTANCE_JOBS else " "
            print(f"{star} {j:60s} items={n('regions'):4d} doors={n('doors'):4d} excluded={n('excluded'):3d}")
        print("* = acceptance set (Martin, 2026-10-03)")
        return 0

    results = {}
    if a.self_test:
        for j, g in gt.items():
            results[j] = score_job(_self_candidates(g), g, a.iou, a.door_tol)
    else:
        for path in a.candidates:
            c = json.loads(Path(path).read_text(encoding="utf-8"))
            if c["job"] not in gt:
                print(f"!! {path}: job {c['job']!r} not in corpus (see --list-jobs)")
                continue
            results[c["job"]] = score_job(c["candidates"], gt[c["job"]], a.iou, a.door_tol)
            results[c["job"]]["source"] = c.get("source")

    for j, s in results.items():
        _print_row(j, s)
    if results:
        agg = {b: {k: sum(s[b][k] for s in results.values()) for k in ("gt", "cand", "found", "class_ok")}
               for b in ("regions", "doors", "excluded")}
        for b, v in agg.items():
            v.update(recall=_r(v["found"], v["gt"]), precision=_r(v["found"], v["cand"]),
                     class_acc=_r(v["class_ok"], v["found"]), e2e_recall=_r(v["class_ok"], v["gt"]))
        print("-" * 120)
        _print_row("AGGREGATE", agg)
        if a.out:
            od = Path(a.out)
            od.mkdir(parents=True, exist_ok=True)
            (od / "eval_v2_report.json").write_text(json.dumps({"aggregate": agg, "jobs": results}, indent=1), encoding="utf-8")
            print(f"wrote {od / 'eval_v2_report.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
