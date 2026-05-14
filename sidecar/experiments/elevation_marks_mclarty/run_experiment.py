"""
run_experiment.py — Experiment 2: McLarty Mazda elevation mark extraction

Compares unconstrained vs constraint-verified AiQ pipeline performance on
the McLarty Mazda drawing set.  Results are written to a JSON file and
summarised to stdout.

Usage
-----
Run from the ``sidecar/`` directory:

    python experiments/elevation_marks_mclarty/run_experiment.py
    python experiments/elevation_marks_mclarty/run_experiment.py --constraints none
    python experiments/elevation_marks_mclarty/run_experiment.py --constraints elevation
    python experiments/elevation_marks_mclarty/run_experiment.py --help

The ``--constraints`` argument controls whether the elevation-mark
ConstraintSet is applied as a post-processing filter.  Both modes are always
computed and written to the output JSON so the delta is always available.

Output
------
``sidecar/experiments/elevation_marks_mclarty_results.json``
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import warnings
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# ── path bootstrap ─────────────────────────────────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
_EXPERIMENTS_DIR = os.path.dirname(_HERE)
_SIDECAR_DIR = os.path.dirname(_EXPERIMENTS_DIR)
for _p in (_SIDECAR_DIR, _EXPERIMENTS_DIR):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import fitz  # type: ignore

# Pipeline layers
from layers.layer_prescan import prescan_drawing_set  # type: ignore
from layers.layer2_extractor import extract_vector_graph  # type: ignore
from layers.rules_engine import run_rules_engine, GlazingCandidate  # type: ignore

# Ground-truth annotation extraction + matching from existing script
from qaqc.ground_truth_mclarty import (  # type: ignore
    extract_annotations,
    Annotation,
    Candidate,
    _candidate_bbox,
    _annotation_center_in_candidate,
    _coverage_ratio,
    CANDIDATE_MIN_CONF,
    MATCH_IOU_THRESHOLD,
)

# Experiment shared modules
from experiments.shared.constraint_types import ConstraintSet  # type: ignore
from experiments.shared.verification_layer import apply_verification  # type: ignore
from experiments.elevation_marks_mclarty.elevation_extractor import (  # type: ignore
    extract_constraints,
)

logger = logging.getLogger(__name__)

# ── file paths ─────────────────────────────────────────────────────────────
_TEST_DATA = os.path.join(_SIDECAR_DIR, "sidecar", "qaqc", "test_data")
# Also try relative path if running from sidecar/
if not os.path.isdir(_TEST_DATA):
    _TEST_DATA = os.path.join(_SIDECAR_DIR, "qaqc", "test_data")

MARKED_PDF  = os.path.join(_TEST_DATA, "McLarty Mazda - Bid Plans.pdf")
CLEAN_PDF   = os.path.join(_TEST_DATA, "McLarty Mazda - Bid Plans - Non Marked.pdf")

RESULTS_JSON = os.path.join(_EXPERIMENTS_DIR, "elevation_marks_mclarty_results.json")

# Elevation pages identified by the prescan fix (§Phase 6 prescan promotion).
# Explicitly listed here so the experiment is reproducible without needing to
# re-run the prescan.
ELEVATION_PAGES = [0, 1, 4, 5]


# ── pipeline helpers ────────────────────────────────────────────────────────

def _run_pipeline(
    pdf_path: str,
    min_confidence: float = CANDIDATE_MIN_CONF,
) -> tuple[List[Candidate], list[int]]:
    """
    Run the AiQ detection pipeline on *pdf_path* and return
    ``(candidates, scan_pages)``.
    """
    prescan = prescan_drawing_set(pdf_path)
    scan_pages = sorted(prescan.scan_pages)
    all_candidates: List[Candidate] = []

    for page_num in scan_pages:
        try:
            graph = extract_vector_graph(
                pdf_path, page_num=page_num, sheet_type="elevation"
            )
            if not graph.is_valid and graph.node_count < 10:
                continue

            raw = run_rules_engine(
                graph.x,
                graph.edge_index,
                graph.edge_attr,
                scale_factor=graph.scale.scale_factor,
                scale_confidence=graph.scale.scale_confidence,
                source_sheet=f"page_{page_num}",
            )
            for c in raw:
                if c.confidence < min_confidence or c.status == "rejected":
                    continue
                # Derive ft dimensions from candidate bounding box + scale
                bbox = _candidate_bbox(c)
                scale = graph.scale.scale_factor  # pts per inch
                width_ft: Optional[float] = None
                height_ft: Optional[float] = None
                if scale and scale > 0:
                    width_ft  = round(bbox.width  / scale / 12.0, 2)
                    height_ft = round(bbox.height / scale / 12.0, 2)

                all_candidates.append(
                    Candidate(
                        page_num=page_num,
                        candidate_id=c.candidate_id,
                        confidence=round(c.confidence, 3),
                        system_hint=c.system_hint,
                        bbox=bbox,
                    )
                )
                # Attach computed ft dimensions as extra attributes so
                # apply_verification can compare them
                all_candidates[-1].__dict__["width_ft"]  = width_ft
                all_candidates[-1].__dict__["height_ft"] = height_ft

        except Exception as exc:
            logger.warning("Pipeline error on page %d: %s", page_num, exc)

    return all_candidates, scan_pages


def _candidate_to_dict(c: Candidate) -> dict[str, Any]:
    """Convert a Candidate dataclass to a plain dict for the verifier."""
    return {
        "candidate_id": c.candidate_id,
        "page_num":      c.page_num,
        "confidence":    c.confidence,
        "system_hint":   c.system_hint,
        "width_ft":      c.__dict__.get("width_ft"),
        "height_ft":     c.__dict__.get("height_ft"),
    }


# ── comparison / metrics ────────────────────────────────────────────────────

def _compare(
    annotations: List[Annotation],
    candidates: List[Candidate],
    clean_page_count: int,
) -> tuple[int, int, int]:
    """
    Return (tp_annotations, fp_candidates, fn_annotations).

    Match criterion: annotation centre inside candidate bbox,
    or coverage ratio >= MATCH_IOU_THRESHOLD.
    """
    from collections import defaultdict
    cand_by_page: dict[int, list[Candidate]] = defaultdict(list)
    for c in candidates:
        cand_by_page[c.page_num].append(c)

    matched_cand_ids: set[str] = set()
    tp = 0
    fn = 0

    for annot in annotations:
        pg = annot.page_num
        if pg >= clean_page_count:
            fn += 1
            continue

        page_cands = cand_by_page.get(pg, [])
        best_score = 0.0
        best_cand: Optional[Candidate] = None

        for cand in page_cands:
            if _annotation_center_in_candidate(annot.rect, cand.bbox):
                score = 1.0
            else:
                score = _coverage_ratio(annot.rect, cand.bbox)
            if score > best_score:
                best_score = score
                best_cand = cand

        if best_score >= MATCH_IOU_THRESHOLD and best_cand is not None:
            tp += 1
            matched_cand_ids.add(best_cand.candidate_id)
        else:
            fn += 1

    fp = len(candidates) - len(matched_cand_ids)
    return tp, fp, fn


def _metrics(tp: int, fp: int, fn: int) -> dict[str, Any]:
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall    = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1        = (2 * precision * recall / (precision + recall)
                 if (precision + recall) > 0 else 0.0)
    return {
        "precision": round(precision, 4),
        "recall":    round(recall, 4),
        "f1":        round(f1, 4),
        "tp":        tp,
        "fp":        fp,
        "fn":        fn,
    }


# ── main experiment ──────────────────────────────────────────────────────────

def run(verbose: bool = False) -> dict[str, Any]:
    """
    Execute both baseline and constrained pipeline runs and return the
    combined results dict (also written to RESULTS_JSON).
    """
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format="%(levelname)s  %(message)s")

    print("=" * 70)
    print("Experiment 2 — McLarty Mazda Elevation Mark Extraction")
    print(f"Run at: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 70)

    # ── Validate input files ────────────────────────────────────────────────
    for path, label in [(CLEAN_PDF, "clean PDF"), (MARKED_PDF, "marked PDF")]:
        if not os.path.isfile(path):
            print(f"\nERROR: {label} not found at:\n  {path}")
            sys.exit(1)

    # ── Step 1: Extract ground-truth annotations ────────────────────────────
    print("\n[1/4] Extracting ground-truth annotations from marked PDF …")
    annotations = extract_annotations(MARKED_PDF)
    doc_marked  = fitz.open(MARKED_PDF)
    doc_clean   = fitz.open(CLEAN_PDF)
    marked_pages = len(doc_marked)
    clean_pages  = len(doc_clean)
    doc_marked.close()
    doc_clean.close()
    print(f"      Found {len(annotations)} annotations across {marked_pages}-page marked set")

    # ── Step 2: Extract elevation mark constraints ──────────────────────────
    print("\n[2/4] Extracting elevation mark constraints …")
    constraint_set = extract_constraints(CLEAN_PDF, scan_pages=ELEVATION_PAGES)
    print(f"      Marks found: {sorted(constraint_set.mark_ids())}")
    print(f"      Confidence:  {constraint_set.confidence}")
    print(f"      Source:      {constraint_set.source}")
    for mc in constraint_set.marks:
        dim_str = (
            f"w={mc.width_ft:.1f}ft  h={mc.height_ft:.1f}ft"
            if mc.width_ft is not None
            else "no dimensions"
        )
        print(f"        {mc.mark_id:<12} page={mc.source_page}  {dim_str}")

    # ── Step 3: Run AiQ pipeline (once, results shared by both modes) ───────
    print("\n[3/4] Running AiQ detection pipeline on clean PDF …")
    candidates, scan_pages = _run_pipeline(CLEAN_PDF)
    print(f"      Scan pages: {scan_pages}")
    print(f"      Total candidates (conf ≥ {CANDIDATE_MIN_CONF}): {len(candidates)}")

    # ── Step 4: Compute baseline metrics ────────────────────────────────────
    tp_b, fp_b, fn_b = _compare(annotations, candidates, clean_pages)
    baseline_metrics = _metrics(tp_b, fp_b, fn_b)

    print(f"\n      Baseline  P={baseline_metrics['precision']:.3f}  "
          f"R={baseline_metrics['recall']:.3f}  F1={baseline_metrics['f1']:.3f}")

    # ── Step 5: Apply constraint verification and compute constrained metrics
    print("\n[4/4] Applying constraint verification …")
    cand_dicts = [_candidate_to_dict(c) for c in candidates]
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        annotated = apply_verification(cand_dicts, constraint_set)

    for w in caught:
        print(f"      WARNING: {w.message}")

    status_counts: dict[str, int] = {}
    for cd in annotated:
        s = cd["constraint_status"]
        status_counts[s] = status_counts.get(s, 0) + 1

    print(f"      Constraint status breakdown: {status_counts}")

    # Constrained mode: drop "rejected" candidates
    rejected_ids = {
        cd["candidate_id"]
        for cd in annotated
        if cd["constraint_status"] == "rejected"
    }
    constrained_cands = [
        c for c in candidates if c.candidate_id not in rejected_ids
    ]
    print(f"      Candidates after rejection: {len(constrained_cands)} "
          f"(removed {len(rejected_ids)})")

    tp_c, fp_c, fn_c = _compare(annotations, constrained_cands, clean_pages)
    constrained_metrics = _metrics(tp_c, fp_c, fn_c)

    print(f"      Constrained P={constrained_metrics['precision']:.3f}  "
          f"R={constrained_metrics['recall']:.3f}  F1={constrained_metrics['f1']:.3f}")

    # ── Build results dict ───────────────────────────────────────────────────
    delta = {
        "precision": round(constrained_metrics["precision"] - baseline_metrics["precision"], 4),
        "recall":    round(constrained_metrics["recall"]    - baseline_metrics["recall"],    4),
        "f1":        round(constrained_metrics["f1"]        - baseline_metrics["f1"],        4),
    }

    results: dict[str, Any] = {
        "experiment":   "elevation_marks_mclarty",
        "run_date":     datetime.now(timezone.utc).isoformat(),
        "config": {
            "mark_regex":           r"^(SF|CW|W|GL|SG|IG|SP|AL|A)-\d+[A-Z]?$",
            "proximity_pts":        200,
            "dim_tolerance":        0.25,
            "reject_threshold":     0.50,
            "min_candidate_conf":   CANDIDATE_MIN_CONF,
            "match_threshold":      MATCH_IOU_THRESHOLD,
            "elevation_pages":      ELEVATION_PAGES,
        },
        "input_files": {
            "clean_pdf":            os.path.basename(CLEAN_PDF),
            "marked_pdf":           os.path.basename(MARKED_PDF),
            "clean_pages":          clean_pages,
            "marked_pages":         marked_pages,
        },
        "constraint_extraction": {
            "scan_pages":           ELEVATION_PAGES,
            "marks_found":          sorted(constraint_set.mark_ids()),
            "confidence":           constraint_set.confidence,
            "source":               constraint_set.source,
            "marks_detail": [
                {
                    "mark_id":    mc.mark_id,
                    "width_ft":   mc.width_ft,
                    "height_ft":  mc.height_ft,
                    "bay_count":  mc.bay_count,
                    "source_page": mc.source_page,
                }
                for mc in constraint_set.marks
            ],
        },
        "pipeline": {
            "scan_pages":           scan_pages,
            "total_candidates":     len(candidates),
            "total_annotations":    len(annotations),
        },
        "baseline": {
            **baseline_metrics,
            "total_candidates":  len(candidates),
            "total_annotations": len(annotations),
        },
        "constrained": {
            **constrained_metrics,
            "total_candidates":       len(constrained_cands),
            "total_annotations":      len(annotations),
            "rejected_by_constraint": len(rejected_ids),
            "status_breakdown":       status_counts,
        },
        "delta": delta,
        "prerequisite_notes": [
            "Experiment 1 (Hope Aquatic / schedule constraint): BLOCKED — "
            "no marked ground-truth PDF available in test_data/.",
            "Tesseract not required — PyMuPDF extracts vector text directly.",
            "PDF paths differ from spec (data/ground_truth/…) — "
            "using sidecar/qaqc/test_data/ convention.",
        ],
    }

    # ── Write JSON ───────────────────────────────────────────────────────────
    os.makedirs(os.path.dirname(RESULTS_JSON), exist_ok=True)
    with open(RESULTS_JSON, "w", encoding="utf-8") as fh:
        json.dump(results, fh, indent=2)
    print(f"\nResults saved → {RESULTS_JSON}")

    # ── Summary table ────────────────────────────────────────────────────────
    w = 16
    print("\n" + "─" * 60)
    print(f"{'':>{w}}  {'Precision':>10}  {'Recall':>8}  {'F1':>8}")
    print("─" * 60)
    print(
        f"{'Baseline':>{w}}  "
        f"{baseline_metrics['precision']:>10.3f}  "
        f"{baseline_metrics['recall']:>8.3f}  "
        f"{baseline_metrics['f1']:>8.3f}"
    )
    print(
        f"{'Constrained':>{w}}  "
        f"{constrained_metrics['precision']:>10.3f}  "
        f"{constrained_metrics['recall']:>8.3f}  "
        f"{constrained_metrics['f1']:>8.3f}"
    )
    arrow = lambda v: ("+" if v >= 0 else "") + f"{v:.3f}"
    print(
        f"{'Δ (constraint)':>{w}}  "
        f"{arrow(delta['precision']):>10}  "
        f"{arrow(delta['recall']):>8}  "
        f"{arrow(delta['f1']):>8}"
    )
    print("─" * 60)
    print()

    return results


# ── CLI entry point ────────────────────────────────────────────────────────

if __name__ == "__main__":
    ap = argparse.ArgumentParser(
        description="Run Experiment 2: McLarty elevation mark constraint verification"
    )
    ap.add_argument(
        "--constraints",
        choices=["elevation", "none"],
        default="elevation",
        help=(
            "Constraint mode. 'elevation' applies mark extraction + "
            "verification (default). 'none' is baseline only (both are "
            "always computed and written to JSON regardless)."
        ),
    )
    ap.add_argument("--verbose", action="store_true", help="Debug-level logging")
    args = ap.parse_args()

    run(verbose=args.verbose)
