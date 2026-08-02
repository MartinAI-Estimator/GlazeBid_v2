"""
GlazeBid AiQ — Phase A Eval Harness

Scores ANY pipeline output against the estimator's ground-truth markup corpus
(sidecar/corpus/markup_corpus.json — 33 jobs of real Bluebeam takeoff markups).

Every pipeline change from Phase A onward is judged by this scoreboard.
Gate rule: no merge unless scores are >= recorded baseline AND Martin has
visually reviewed a sample.

── Candidate file format (what any pipeline stage must emit) ─────────────────
{
  "job": "<corpus job name>",
  "source": "<pipeline stage name/version>",
  "candidates": [
    {
      "page": 4,                        # 0-based page index
      "rect": [x0, y0, x1, y1],         # PDF points
      "scope_class": "ext_sf",          # canonical class (see SUBJECT_MAP)
      "confidence": 0.9                 # optional
    }, ...
  ]
}

── Scoring (v1: region annotations) ──────────────────────────────────────────
Ground truth = corpus annotations of type Polygon/Square whose subject
normalizes to a scope class. Matching is greedy per page:
  match if IoU >= --iou (default 0.25) OR candidate contains GT center.
Two scoreboards:
  DETECTION      — right place, any scope class
  CLASSIFICATION — of the detected, how many have the right class
Diff output lists every miss / false positive / misclassification with
page + rect so failures are reviewable in the actual PDF.

v2 TODO: linear scoring (Polylength PolyLines, LF coverage), count scoring
(Circle/Count dots), per-page partial credit.

Usage:
  python eval_harness.py <candidates.json> [more.json ...] --corpus <markup_corpus.json> -o <outdir>
  python eval_harness.py --self-test --corpus <markup_corpus.json>   # GT vs GT sanity check
"""

from __future__ import annotations
import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

# ── Canonical scope classes: corpus subject → class ──────────────────────────
# Aliases handled by normalization (strip dots, case, whitespace).
SUBJECT_MAP = {
    "ext sf highlight": "ext_sf", "ext sf area": "ext_sf",
    "ext sf polylength": "ext_sf", "ext sf door": "ext_sf",
    "sf frames": "ext_sf",
    "ext cw highlight": "ext_cw", "ext cw area": "ext_cw",
    "ext cw polylength": "ext_cw",
    "int sf highlight": "int_sf", "int sf area": "int_sf",
    "int sf polylength": "int_sf", "int sf door": "int_sf",
    "all glass wall highlight": "all_glass_wall",
    "all glass wall area": "all_glass_wall",
    "all glass wall polylength": "all_glass_wall",
    "all glass doors": "all_glass_wall",
    "glazing only highlight": "glazing_only",
    "glazing only door": "glazing_only",
    "glazing only line": "glazing_only",
    "fire rated glazing only highlight": "glazing_only",
    "mirror highlight": "mirror", "mirror area": "mirror",
    "break metal flashing & trims": "break_metal",
    "break metal flashing & trim polylength": "break_metal",
    "glass handrail area": "glass_handrail",
    "int aluminum partition highlight": "int_alum_partition",
    "fixed / operable window highlight": "window",
    "fixed / operable window": "window",
    "auto-sliding door highlight": "auto_door",
    "translucent panel polylength": "translucent_panel",
    "sun control device polylength": "sun_control",
    "aluminum stile door": "alum_stile_door",
    "excluded by binswanger": "excluded",
}
# Region-type annotation types eligible as v1 ground truth
REGION_TYPES = {"Polygon", "Square"}


def norm_subject(s: str | None) -> str | None:
    if not s:
        return None
    key = " ".join(s.replace(".", "").lower().split())
    return SUBJECT_MAP.get(key)


# ── geometry helpers (no deps) ────────────────────────────────────────────────

def iou(a, b) -> float:
    ix0, iy0 = max(a[0], b[0]), max(a[1], b[1])
    ix1, iy1 = min(a[2], b[2]), min(a[3], b[3])
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    ua = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def contains_center(cand, gt) -> bool:
    cx, cy = (gt[0]+gt[2])/2, (gt[1]+gt[3])/2
    return cand[0] <= cx <= cand[2] and cand[1] <= cy <= cand[3]


# ── ground truth loading ──────────────────────────────────────────────────────

def load_gt(corpus_path: Path) -> dict[str, dict[int, list[dict]]]:
    c = json.loads(corpus_path.read_text(encoding="utf-8"))
    gt: dict[str, dict[int, list[dict]]] = {}
    for job in c["jobs"]:
        pages: dict[int, list[dict]] = defaultdict(list)
        for p in job["pages"]:
            for a in p["annotations"]:
                cls = norm_subject(a["subject"])
                if cls and cls != "excluded" and a["type"] in REGION_TYPES:
                    pages[p["page"]].append({"rect": a["rect"], "class": cls,
                                             "subject": a["subject"]})
        if pages:
            gt[job["job"]] = dict(pages)
    return gt


# ── scoring ───────────────────────────────────────────────────────────────────

def score_job(cands: list[dict], gt_pages: dict[int, list[dict]],
              iou_thresh: float) -> dict:
    by_page: dict[int, list[dict]] = defaultdict(list)
    for c in cands:
        by_page[c["page"]].append(c)

    n_gt = sum(len(v) for v in gt_pages.values())
    n_cand = len(cands)
    det_tp = 0          # candidate matched to a GT region
    cls_tp = 0          # matched AND class correct
    diffs = {"missed": [], "false_positive": [], "misclassified": []}
    per_class = defaultdict(lambda: {"gt": 0, "found": 0, "class_ok": 0})

    for pno, gts in gt_pages.items():
        for g in gts:
            per_class[g["class"]]["gt"] += 1
        matched_gt: set[int] = set()
        matched_cand: set[int] = set()
        pool = by_page.get(pno, [])
        for gi, g in enumerate(gts):
            best, best_ci = 0.0, None
            for ci, c in enumerate(pool):
                if ci in matched_cand:
                    continue
                ov = iou(c["rect"], g["rect"])
                hit = ov >= iou_thresh or contains_center(c["rect"], g["rect"])
                if hit and ov >= best:
                    best, best_ci = ov, ci
            if best_ci is not None:
                matched_gt.add(gi)
                matched_cand.add(best_ci)
                det_tp += 1
                per_class[g["class"]]["found"] += 1
                c = pool[best_ci]
                if c.get("scope_class") == g["class"]:
                    cls_tp += 1
                    per_class[g["class"]]["class_ok"] += 1
                else:
                    diffs["misclassified"].append(
                        {"page": pno, "gt": g, "cand_class": c.get("scope_class"),
                         "cand_rect": c["rect"]})
            else:
                diffs["missed"].append({"page": pno, **g})
        for ci, c in enumerate(pool):
            if ci not in matched_cand:
                diffs["false_positive"].append(
                    {"page": pno, "rect": c["rect"],
                     "scope_class": c.get("scope_class")})

    def safe(n, d): return round(n / d, 3) if d else None
    return {
        "gt_regions": n_gt, "candidates": n_cand,
        "detection": {"tp": det_tp,
                      "precision": safe(det_tp, n_cand),
                      "recall": safe(det_tp, n_gt)},
        "classification": {"correct": cls_tp,
                           "accuracy_of_detected": safe(cls_tp, det_tp),
                           "end_to_end_recall": safe(cls_tp, n_gt)},
        "per_class": {k: dict(v) for k, v in sorted(per_class.items())},
        "diff": diffs,
    }


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("candidates", nargs="*", help="candidate JSON files")
    ap.add_argument("--corpus", required=True)
    ap.add_argument("--iou", type=float, default=0.25)
    ap.add_argument("--self-test", action="store_true",
                    help="score ground truth against itself (must be ~1.0)")
    ap.add_argument("-o", "--out", default=None)
    args = ap.parse_args()

    gt = load_gt(Path(args.corpus))
    runs = []

    if args.self_test:
        for job, pages in gt.items():
            cands = [{"page": pno, "rect": g["rect"], "scope_class": g["class"]}
                     for pno, gs in pages.items() for g in gs]
            runs.append(("self-test", job, cands))
    else:
        if not args.candidates:
            ap.error("provide candidate files or --self-test")
        for f in args.candidates:
            d = json.loads(Path(f).read_text(encoding="utf-8"))
            if d["job"] not in gt:
                print(f"WARN: job not in corpus GT: {d['job']}", file=sys.stderr)
                continue
            runs.append((d.get("source", f), d["job"], d["candidates"]))

    reports = {}
    print(f"{'JOB':<45} {'GTrgn':>5} {'cand':>5} {'det-P':>6} {'det-R':>6} {'cls-acc':>7} {'e2e-R':>6}")
    agg = {"gt": 0, "cand": 0, "det_tp": 0, "cls_tp": 0}
    for source, job, cands in runs:
        r = score_job(cands, gt[job], args.iou)
        reports[job] = {"source": source, **r}
        d, c = r["detection"], r["classification"]
        agg["gt"] += r["gt_regions"]; agg["cand"] += r["candidates"]
        agg["det_tp"] += d["tp"]; agg["cls_tp"] += c["correct"]
        print(f"{job[:44]:<45} {r['gt_regions']:>5} {r['candidates']:>5} "
              f"{str(d['precision']):>6} {str(d['recall']):>6} "
              f"{str(c['accuracy_of_detected']):>7} {str(c['end_to_end_recall']):>6}")

    if agg["gt"]:
        print("-" * 88)
        print(f"{'AGGREGATE':<45} {agg['gt']:>5} {agg['cand']:>5} "
              f"{round(agg['det_tp']/agg['cand'],3) if agg['cand'] else None:>6} "
              f"{round(agg['det_tp']/agg['gt'],3):>6} "
              f"{round(agg['cls_tp']/agg['det_tp'],3) if agg['det_tp'] else None:>7} "
              f"{round(agg['cls_tp']/agg['gt'],3):>6}")

    if args.out:
        out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
        (out / "eval_report.json").write_text(json.dumps(reports, indent=1))
        print(f"\nfull report + diffs → {out/'eval_report.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
