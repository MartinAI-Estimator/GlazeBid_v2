"""
GlazeBid AiQ — Universal Takeoff Logic Test

Tests the implementation-plan pipeline on UNMARKED drawing sets and scores
each stage against the estimator's real Bluebeam markups (markup_corpus.json).

HARD RULE: every rule in this file must be universal — derived from how
architectural drawings work in general, never tuned to a specific job.
If a rule needs a job name to work, it is cheating and must be deleted.

Stages tested:
  1. TRIAGE      — find glazing-relevant pages from text alone
  2. CONSTRAINTS — extract mark tags, dimensions, scale strings
  3. GEOMETRY    — propose candidate glazing rectangles from vector data
  4. VERIFY      — keep candidates matching constraints (dimension check)
  5. SCORE       — precision/recall vs ground-truth highlight polygons

Usage:
  python run_test.py <unmarked.pdf> --job "<corpus job name>" --corpus <markup_corpus.json> -o <outdir>
"""

from __future__ import annotations
import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

import fitz

# ═══════════════════════ UNIVERSAL VOCABULARY ═══════════════════════
# Standard architectural conventions only. No project-specific terms.

GLAZING_KEYWORDS = [
    "STOREFRONT", "CURTAIN WALL", "CURTAINWALL", "GLAZING", "GLAZED",
    "WINDOW", "ALUMINUM ENTRANCE", "ALL GLASS", "MIRROR", "VESTIBULE",
    "TRANSLUCENT", "SKYLIGHT", "GLASS RAIL", "HANDRAIL GLASS",
]
SHEET_TYPE_KEYWORDS = {
    "elevation": ["EXTERIOR ELEVATION", "BUILDING ELEVATION", "ELEVATIONS"],
    "floor_plan": ["FLOOR PLAN", "OVERALL PLAN", "ENLARGED PLAN"],
    "schedule": ["WINDOW SCHEDULE", "DOOR SCHEDULE", "OPENING SCHEDULE",
                 "STOREFRONT SCHEDULE", "GLAZING SCHEDULE", "FRAME SCHEDULE",
                 "WINDOW TYPES", "DOOR TYPES", "FRAME TYPES", "STOREFRONT TYPES"],
    "detail": ["WALL SECTION", "DETAILS", "SECTION"],
}
# Mark tag: 1-3 letter glazing-system prefix + number  (SF-1, CW1, W-01, IW-3, GL2, A4 excluded)
MARK_RE = re.compile(r"\b(SF|CW|IW|AW|GL|WT|W|SW)[-. ]?(\d{1,3}[A-Z]?)\b")
# Common non-glazing uses of same prefixes (grid W, watts, etc.) filtered by context:
MARK_CONTEXT_BAD = re.compile(r"(WATT|WIRE|WEEK|WEST\b)")
# Feet-inches: 23'-6 15/16"  |  3'-4"  |  12'-0"
DIM_RE = re.compile(r"(\d{1,3})'\s*-?\s*(\d{1,2})(?:\s+(\d+)/(\d+))?\s*\"")
# Scale strings: 1/8" = 1'-0"  |  3/32"=1'-0"  |  1 1/2" = 1'-0"
SCALE_RE = re.compile(
    r"(\d+(?:\s+\d+/\d+)?(?:/\d+)?)\s*\"\s*=\s*1'\s*-?\s*0?\"?"
)


def frac_to_float(s: str) -> float:
    s = s.strip()
    if " " in s:
        whole, frac = s.split()
        n, d = frac.split("/")
        return float(whole) + float(n) / float(d)
    if "/" in s:
        n, d = s.split("/")
        return float(n) / float(d)
    return float(s)


# ═══════════════════════ STAGE 1 — TRIAGE ═══════════════════════

def triage_page(page: fitz.Page) -> dict:
    text = page.get_text().upper()
    sheet_type = "other"
    for stype, kws in SHEET_TYPE_KEYWORDS.items():
        if any(k in text for k in kws):
            sheet_type = stype
            break
    kw_hits = [k for k in GLAZING_KEYWORDS if k in text]
    marks = extract_marks(text)
    relevant = bool(kw_hits) or bool(marks)
    return {
        "sheet_type": sheet_type,
        "glazing_keywords": kw_hits,
        "relevant": relevant,
    }


# ═══════════════════════ STAGE 2 — CONSTRAINTS ═══════════════════════

def extract_marks(text_upper: str) -> list[str]:
    out = set()
    for m in MARK_RE.finditer(text_upper):
        ctx = text_upper[max(0, m.start() - 12): m.end() + 12]
        if MARK_CONTEXT_BAD.search(ctx):
            continue
        out.add(f"{m.group(1)}-{m.group(2)}")
    return sorted(out)


def extract_dims_ft(text: str) -> list[float]:
    dims = []
    for m in DIM_RE.finditer(text):
        ft = int(m.group(1)) + int(m.group(2)) / 12
        if m.group(3) and m.group(4):
            ft += int(m.group(3)) / int(m.group(4)) / 12
        if 0.5 <= ft <= 100:  # plausible building dimensions
            dims.append(round(ft, 3))
    return dims


def extract_scale_in_per_ft(text: str) -> float | None:
    """Return drawing scale as inches-on-paper per foot-of-building."""
    best = None
    for m in SCALE_RE.finditer(text):
        try:
            v = frac_to_float(m.group(1))
            if 0.01 <= v <= 12:
                best = v  # last plausible scale on sheet (titleblock usually last)
        except (ValueError, ZeroDivisionError):
            continue
    return best


# ═══════════════════════ STAGE 3 — GEOMETRY CANDIDATES ═══════════════════════

def rect_candidates(page: fitz.Page) -> list[fitz.Rect]:
    """Closed rectangles from vector drawings. Universal filters only:
    plausible on-paper size and aspect for a glazing assembly at any
    common architectural scale."""
    pw, ph = page.rect.width, page.rect.height
    page_area = pw * ph
    cands = []
    for d in page.get_drawings():
        for item in d["items"]:
            if item[0] != "re":
                continue
            r = fitz.Rect(item[1])
            if r.is_empty or r.width <= 0 or r.height <= 0:
                continue
            area = r.width * r.height
            aspect = max(r.width / r.height, r.height / r.width)
            # universal: glazing marks on paper are between ~0.05" and half sheet
            if area < page_area * 1e-5 or area > page_area * 0.25:
                continue
            if aspect > 40:
                continue
            cands.append(r)
    # dedupe near-identical rects
    out = []
    for r in cands:
        if not any(abs(r.x0 - o.x0) < 2 and abs(r.y0 - o.y0) < 2
                   and abs(r.x1 - o.x1) < 2 and abs(r.y1 - o.y1) < 2 for o in out):
            out.append(r)
    return out


# ═══════════════════════ STAGE 4 — CONSTRAINT VERIFY ═══════════════════════

def verify_by_dims(cands: list[fitz.Rect], dims_ft: list[float],
                   scale_in_per_ft: float | None, tol: float = 0.20) -> list[dict]:
    """Keep candidates whose paper size converts to a dimension that appears
    in the job's extracted dimension pool (±tol). Requires page scale."""
    verified = []
    for r in cands:
        entry = {"rect": [round(v, 1) for v in r], "verified": False,
                 "w_ft": None, "h_ft": None}
        if scale_in_per_ft:
            w_ft = (r.width / 72) / scale_in_per_ft
            h_ft = (r.height / 72) / scale_in_per_ft
            entry["w_ft"], entry["h_ft"] = round(w_ft, 2), round(h_ft, 2)
            def matches(x): return any(abs(x - d) / d <= tol for d in dims_ft if d > 0)
            if 0.5 <= w_ft <= 80 and 0.5 <= h_ft <= 60 and (matches(w_ft) or matches(h_ft)):
                entry["verified"] = True
        verified.append(entry)
    return verified


# ═══════════════════════ STAGE 5 — SCORING ═══════════════════════

def load_ground_truth(corpus_path: Path, job_name: str) -> dict[int, list[dict]]:
    c = json.loads(corpus_path.read_text(encoding="utf-8"))
    job = next((j for j in c["jobs"] if j["job"] == job_name), None)
    if not job:
        raise SystemExit(f"job not in corpus: {job_name}")
    gt: dict[int, list[dict]] = {}
    for p in job["pages"]:
        items = [a for a in p["annotations"]
                 if a["subject"] and ("HIGHLIGHT" in a["subject"].upper()
                                      or "AREA" in a["subject"].upper())]
        if items:
            gt[p["page"]] = items
    return gt


def iou(a: fitz.Rect, b: fitz.Rect) -> float:
    inter = fitz.Rect(a) & b
    if inter.is_empty:
        return 0.0
    ia = inter.width * inter.height
    ua = a.width * a.height + b.width * b.height - ia
    return ia / ua if ua else 0.0


def score_page(cands: list[dict], gt_items: list[dict], only_verified: bool):
    pool = [c for c in cands if (c["verified"] or not only_verified)]
    gt_rects = [fitz.Rect(a["rect"]) for a in gt_items]
    matched_gt, matched_c = set(), set()
    for ci, c in enumerate(pool):
        cr = fitz.Rect(c["rect"])
        for gi, gr in enumerate(gt_rects):
            if gi in matched_gt:
                continue
            if iou(cr, gr) >= 0.25 or (gr.width and cr.contains((gr.tl + gr.br) / 2)):
                matched_gt.add(gi)
                matched_c.add(ci)
                break
    return len(matched_c), len(pool), len(matched_gt), len(gt_rects)


# ═══════════════════════ MAIN ═══════════════════════

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--job", required=True)
    ap.add_argument("--corpus", required=True)
    ap.add_argument("-o", "--out", required=True)
    args = ap.parse_args()

    doc = fitz.open(args.pdf)
    gt = load_ground_truth(Path(args.corpus), args.job)

    report = {"job": args.job, "pdf": args.pdf, "pages": []}
    all_dims: list[float] = []
    page_data = []

    # pass 1: triage + constraints (dims pooled job-wide, like an estimator's
    # mental model: schedule dims constrain what plans/elevations can contain)
    for pno, page in enumerate(doc):
        text = page.get_text()
        tri = triage_page(page)
        dims = extract_dims_ft(text)
        all_dims.extend(dims)
        page_data.append({
            "pno": pno, "tri": tri,
            "marks": extract_marks(text.upper()),
            "scale": extract_scale_in_per_ft(text),
            "n_dims": len(dims),
        })

    # pass 2: geometry + verify + score on relevant pages
    tot = {"tp_raw": 0, "n_raw": 0, "gt_hit_raw": 0,
           "tp_ver": 0, "n_ver": 0, "gt_hit_ver": 0, "n_gt": 0}
    for pd in page_data:
        pno = pd["pno"]
        gt_items = gt.get(pno, [])
        entry = {
            "page": pno, "sheet_type": pd["tri"]["sheet_type"],
            "relevant": pd["tri"]["relevant"], "marks": pd["marks"],
            "scale_in_per_ft": pd["scale"], "gt_count": len(gt_items),
        }
        if pd["tri"]["relevant"]:
            page = doc[pno]
            cands = verify_by_dims(rect_candidates(page), all_dims, pd["scale"])
            entry["candidates"] = len(cands)
            entry["verified"] = sum(1 for c in cands if c["verified"])
            if gt_items:
                tpr, nr, ghr, ngt = score_page(cands, gt_items, only_verified=False)
                tpv, nv, ghv, _ = score_page(cands, gt_items, only_verified=True)
                entry["raw"] = {"matched": tpr, "proposed": nr, "gt_found": ghr}
                entry["verified_stage"] = {"matched": tpv, "proposed": nv, "gt_found": ghv}
                tot["tp_raw"] += tpr; tot["n_raw"] += nr; tot["gt_hit_raw"] += ghr
                tot["tp_ver"] += tpv; tot["n_ver"] += nv; tot["gt_hit_ver"] += ghv
                tot["n_gt"] += ngt
        report["pages"].append(entry)

    # triage scoring: did relevant-page detection cover pages with GT?
    gt_pages = set(gt.keys())
    flagged = {pd["pno"] for pd in page_data if pd["tri"]["relevant"]}
    report["triage"] = {
        "gt_pages": sorted(gt_pages),
        "flagged_pages": sorted(flagged),
        "recall": round(len(gt_pages & flagged) / len(gt_pages), 3) if gt_pages else None,
        "pages_excluded": len(page_data) - len(flagged),
    }
    report["marks_found"] = sorted({m for pd in page_data for m in pd["marks"]})
    report["dim_pool_size"] = len(set(all_dims))

    def pr(tp, n, gh, ngt):
        return {"precision": round(tp / n, 3) if n else None,
                "recall": round(gh / ngt, 3) if ngt else None}
    report["geometry_raw"] = pr(tot["tp_raw"], tot["n_raw"], tot["gt_hit_raw"], tot["n_gt"])
    report["after_dim_verify"] = pr(tot["tp_ver"], tot["n_ver"], tot["gt_hit_ver"], tot["n_gt"])

    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^\w]+", "_", args.job)[:40]
    (out / f"result_{safe}.json").write_text(json.dumps(report, indent=1))

    t = report["triage"]
    print(f"\n=== {args.job} ===")
    print(f"TRIAGE   : recall {t['recall']}  (flagged {len(t['flagged_pages'])}/{len(page_data)} pages, GT on {len(t['gt_pages'])})")
    print(f"MARKS    : {len(report['marks_found'])} unique — {report['marks_found'][:12]}")
    print(f"DIM POOL : {report['dim_pool_size']} unique dimensions")
    print(f"GEOMETRY : precision {report['geometry_raw']['precision']}  recall {report['geometry_raw']['recall']}  ({tot['n_raw']} proposed)")
    print(f"DIM-VER  : precision {report['after_dim_verify']['precision']}  recall {report['after_dim_verify']['recall']}  ({tot['n_ver']} kept)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
