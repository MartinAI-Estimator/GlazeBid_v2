"""
ground_truth_mclarty.py

Ground-truth validation of the AiQ pipeline against Martin's Bluebeam
markup on McLarty Mazda Bid Plans.

Step 1 — Extract annotations from the marked-up PDF.
Step 2 — Run the AiQ pipeline on the clean PDF.
Step 3 — Compare at ≥ 50% IoU, compute precision / recall / F1.
Step 4 — Save full report to qaqc/ground_truth_report_mclarty.txt.

Usage:
    cd sidecar
    python qaqc/ground_truth_mclarty.py
"""

import os
import sys
import math
import textwrap
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Tuple

# ── path setup ────────────────────────────────────────────────────────────────
SIDECAR_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SIDECAR_DIR)

import fitz  # PyMuPDF

from layers.layer_prescan import prescan_drawing_set
from layers.layer2_extractor import extract_vector_graph
from layers.rules_engine import run_rules_engine, GlazingCandidate, Rect

# ── PDF paths ─────────────────────────────────────────────────────────────────
TEST_DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_data")
MARKED_PDF   = os.path.join(TEST_DATA, "McLarty Mazda - Bid Plans.pdf")
CLEAN_PDF    = os.path.join(TEST_DATA, "McLarty Mazda - Bid Plans - Non Marked.pdf")

# ── thresholds ────────────────────────────────────────────────────────────────
MATCH_IOU_THRESHOLD     = 0.50   # annotation ↔ candidate IoU to call a TP
CANDIDATE_MIN_CONF      = 0.70   # minimum candidate confidence to include

# Bluebeam annotation type codes to include as scope markup
# 4=Square/Rectangle, 5=Circle, 6=Polygon, 7=PolyLine, 8=Ink,
# 14=Highlight, 19=FreeText, 25=Polygon (alt code)
SCOPE_ANNOT_TYPES = {4, 5, 6, 7, 8, 14, 19, 25}

# Minimum annotation dimension to count as real scope markup.
# Bluebeam PolyLines used as dimension ticks are ~15 pts tall — exclude them.
MIN_ANNOT_SIZE_PTS = 30

# Colors to SKIP — these are usually notes, dimensions, or leader lines
# (add hex colours that are clearly not scope, e.g. black #000000)
SKIP_COLORS: set = set()


# ── data structures ───────────────────────────────────────────────────────────
@dataclass
class Annotation:
    page_num: int          # 0-based in marked PDF
    annot_type: str
    color_hex: str         # stroke or fill color, "#RRGGBB"
    rect: fitz.Rect        # bounding rect in PDF pts
    label: str = ""        # associated popup text


@dataclass
class Candidate:
    page_num: int
    candidate_id: str
    confidence: float
    system_hint: str
    bbox: fitz.Rect        # fitz.Rect for easy intersection


# ── helpers ───────────────────────────────────────────────────────────────────
def _rgb_to_hex(rgb) -> str:
    """Convert (r, g, b) floats 0-1 to #RRGGBB string."""
    if rgb is None:
        return "#000000"
    r, g, b = rgb
    return "#{:02X}{:02X}{:02X}".format(int(r * 255), int(g * 255), int(b * 255))


def _annot_color(annot: fitz.Annot) -> str:
    """Best-effort color extraction from a Bluebeam annotation."""
    c = annot.colors
    stroke = c.get("stroke")
    fill   = c.get("fill")
    if stroke:
        return _rgb_to_hex(stroke)
    if fill:
        return _rgb_to_hex(fill)
    return "#000000"


def _rect_iou(a: fitz.Rect, b: fitz.Rect) -> float:
    """IoU between two fitz.Rect objects."""
    inter = a & b  # intersection
    if inter.is_empty:
        return 0.0
    inter_area = inter.width * inter.height
    union_area = a.width * a.height + b.width * b.height - inter_area
    return inter_area / union_area if union_area > 0 else 0.0


def _candidate_bbox(c: GlazingCandidate) -> fitz.Rect:
    bb = c.bounding_box
    return fitz.Rect(bb.x, bb.y, bb.x + bb.width, bb.y + bb.height)


# ── Step 1: Extract ground-truth annotations ──────────────────────────────────
def extract_annotations(pdf_path: str) -> List[Annotation]:
    """
    Open the marked-up PDF and return all scope annotations with
    page number, type, color, and bounding rect.
    """
    doc = fitz.open(pdf_path)
    annotations: List[Annotation] = []

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        for annot in page.annots():
            type_code = annot.type[0]
            type_name = annot.type[1]

            # Skip types that are never scope markup
            if type_code not in SCOPE_ANNOT_TYPES:
                continue

            rect = annot.rect
            # Skip degenerate rects and tiny leader-lines / dimension ticks
            if rect.width < MIN_ANNOT_SIZE_PTS or rect.height < MIN_ANNOT_SIZE_PTS:
                continue

            color_hex = _annot_color(annot)
            if color_hex in SKIP_COLORS:
                continue

            # Grab popup text if present
            label = ""
            try:
                label = annot.info.get("content", "") or annot.info.get("subject", "")
            except Exception:
                pass

            annotations.append(Annotation(
                page_num=page_idx,
                annot_type=type_name,
                color_hex=color_hex,
                rect=rect,
                label=label,
            ))

    doc.close()
    return annotations


# ── Step 2: Run AiQ pipeline on clean set ────────────────────────────────────
def run_pipeline(pdf_path: str, min_confidence: float = CANDIDATE_MIN_CONF) -> List[Candidate]:
    """
    Prescan the clean PDF, then run full detection on each scan page.
    Returns candidates with confidence >= min_confidence.
    """
    print(f"\n[Step 2] Prescanning {os.path.basename(pdf_path)} …")
    prescan = prescan_drawing_set(pdf_path)
    print(f"         Total pages: {prescan.total_pages}")
    print(f"         Scan pages:  {prescan.scan_pages}")
    print(f"         Reference:   {prescan.reference_pages}")
    print(f"         Skip:        {len(prescan.skip_pages)} pages")

    all_candidates: List[Candidate] = []
    # Use prescan-selected scan pages — this mirrors production behaviour.
    # Annotations on non-scanned pages become false negatives, which is the
    # correct penalty for a prescan that missed an elevation sheet.
    pages_to_scan = sorted(prescan.scan_pages)

    for page_num in pages_to_scan:
        print(f"         → Detecting page {page_num} …", end=" ", flush=True)
        try:
            graph = extract_vector_graph(
                pdf_path,
                page_num=page_num,
                sheet_type="elevation",
            )

            if not graph.is_valid and graph.node_count < 10:
                print(f"SKIP (invalid graph, {graph.node_count} nodes)")
                continue

            # For ground-truth validation use only per-page scale.
            # Cross-page scale propagation causes wrong dimension constraints
            # on pages where scale detection returns low confidence.
            eff_factor     = graph.scale.scale_factor
            eff_confidence = graph.scale.scale_confidence

            raw_candidates = run_rules_engine(
                graph.x,
                graph.edge_index,
                graph.edge_attr,
                scale_factor=eff_factor,
                scale_confidence=eff_confidence,
                source_sheet=f"page_{page_num}",
            )

            for c in raw_candidates:
                if c.confidence < min_confidence or c.status == "rejected":
                    continue
                all_candidates.append(Candidate(
                    page_num=page_num,
                    candidate_id=c.candidate_id,
                    confidence=round(c.confidence, 3),
                    system_hint=c.system_hint,
                    bbox=_candidate_bbox(c),
                ))

            page_total = sum(
                1 for c in raw_candidates
                if c.confidence >= min_confidence and c.status != "rejected"
            )
            print(f"{page_total} candidates (scale {eff_factor:.4f} pts/in, conf {eff_confidence:.2f})")

        except Exception as e:
            print(f"ERROR: {e}")

    return all_candidates


# ── Step 3: Match annotations to candidates ───────────────────────────────────
@dataclass
class MatchResult:
    annotation: Annotation
    matched_candidate: Optional[Candidate] = None
    best_iou: float = 0.0


def _annotation_center_in_candidate(annot_rect: fitz.Rect, cand_rect: fitz.Rect) -> bool:
    """True if the annotation's center point falls inside the candidate bbox."""
    cx = (annot_rect.x0 + annot_rect.x1) / 2
    cy = (annot_rect.y0 + annot_rect.y1) / 2
    return (cand_rect.x0 <= cx <= cand_rect.x1 and
            cand_rect.y0 <= cy <= cand_rect.y1)


def _coverage_ratio(annot_rect: fitz.Rect, cand_rect: fitz.Rect) -> float:
    """Fraction of the annotation area covered by the candidate bbox."""
    inter = annot_rect & cand_rect
    if inter.is_empty:
        return 0.0
    annot_area = annot_rect.width * annot_rect.height
    return (inter.width * inter.height) / annot_area if annot_area > 0 else 0.0


def compare(
    annotations: List[Annotation],
    candidates: List[Candidate],
    marked_page_count: int,
    clean_page_count: int,
) -> Tuple[List[MatchResult], List[Candidate]]:
    """
    For each annotation, find the best-matching candidate on the same page.

    Match criterion: annotation center falls inside candidate bbox  
    OR candidate covers >= MATCH_IOU_THRESHOLD of the annotation area.

    (IoU is inappropriate here because candidates are multi-bay systems
    that are much larger than individual annotated bays.)
    """
    def map_page(marked_page: int) -> Optional[int]:
        if marked_page < clean_page_count:
            return marked_page
        return None

    cand_by_page: Dict[int, List[Candidate]] = {}
    for cand in candidates:
        cand_by_page.setdefault(cand.page_num, []).append(cand)

    match_results: List[MatchResult] = []
    matched_candidate_ids: set = set()

    for annot in annotations:
        clean_page = map_page(annot.page_num)
        result = MatchResult(annotation=annot)

        if clean_page is None:
            match_results.append(result)
            continue

        page_cands = cand_by_page.get(clean_page, [])
        best_score = 0.0
        best_cand = None

        for cand in page_cands:
            # Primary: center containment (most meaningful for bay→system)
            if _annotation_center_in_candidate(annot.rect, cand.bbox):
                score = 1.0
            else:
                # Secondary: coverage ratio (fraction of annotation covered)
                score = _coverage_ratio(annot.rect, cand.bbox)

            if score > best_score:
                best_score = score
                best_cand = cand

        # A match requires EITHER center containment (score=1.0)
        # OR coverage ratio >= MATCH_IOU_THRESHOLD
        if best_score >= MATCH_IOU_THRESHOLD and best_cand is not None:
            result.matched_candidate = best_cand
            result.best_iou = best_score
            matched_candidate_ids.add(best_cand.candidate_id)

        match_results.append(result)

    unmatched_cands = [c for c in candidates if c.candidate_id not in matched_candidate_ids]
    return match_results, unmatched_cands


# ── Step 4: Build and save report ─────────────────────────────────────────────
def build_report(
    marked_page_count: int,
    clean_page_count: int,
    annotations: List[Annotation],
    candidates: List[Candidate],
    match_results: List[MatchResult],
    unmatched_cands: List[Candidate],
) -> str:
    tp_results   = [r for r in match_results if r.matched_candidate is not None]
    fn_results   = [r for r in match_results if r.matched_candidate is None]
    fp_cands     = unmatched_cands

    # Standard object-detection metrics:
    #   TP = GT annotations covered by >= 1 candidate (recall numerator)
    #   FN = GT annotations NOT covered (recall denominator remainder)
    #   FP = candidates that cover no GT annotation (precision denominator)
    #   TP_cands = candidates that DO cover >= 1 GT annotation
    tp_annot  = len(tp_results)   # annotation-centric TP (for recall)
    fn_annot  = len(fn_results)
    fp_count  = len(fp_cands)
    tp_cands  = len(candidates) - fp_count  # candidate-centric TP (for precision)

    precision = tp_cands / len(candidates) if candidates else 0.0
    recall    = tp_annot / (tp_annot + fn_annot) if (tp_annot + fn_annot) > 0 else 0.0
    f1        = (2 * precision * recall / (precision + recall)
                 if (precision + recall) > 0 else 0.0)

    lines = []
    lines.append("=" * 72)
    lines.append("GLAZEBID AiQ GROUND-TRUTH VALIDATION v2 — McLarty Mazda")
    lines.append("Generated: April 13, 2026")
    lines.append("Fixes applied: prescan detail-page promotion (CURTAINWALL keyword); production-mode scan pages.")
    lines.append("=" * 72)
    lines.append("")

    # PDF info
    lines.append("── PDF Info ──────────────────────────────────────────────────────────")
    lines.append(f"  Marked set:  McLarty Mazda - Bid Plans.pdf          ({marked_page_count} pages)")
    lines.append(f"  Clean set:   McLarty Mazda - Bid Plans - Non Marked.pdf ({clean_page_count} pages)")
    if marked_page_count != clean_page_count:
        lines.append(f"  ⚠  Page counts differ by {abs(marked_page_count - clean_page_count)}."
                     "  Pages beyond clean set range are unmatchable.")
    lines.append("")

    # ── Annotation summary
    lines.append("── Step 1: Ground-Truth Annotations ─────────────────────────────────")
    lines.append(f"  Total annotations extracted: {len(annotations)}")

    page_set = sorted(set(a.page_num for a in annotations))
    lines.append(f"  Annotated pages ({len(page_set)}): {page_set}")

    type_dist: Dict[str, int] = {}
    color_dist: Dict[str, int] = {}
    for a in annotations:
        type_dist[a.annot_type] = type_dist.get(a.annot_type, 0) + 1
        color_dist[a.color_hex] = color_dist.get(a.color_hex, 0) + 1

    lines.append("  Type distribution:")
    for t, n in sorted(type_dist.items(), key=lambda x: -x[1]):
        lines.append(f"    {t:<20} {n}")
    lines.append("  Color distribution:")
    for col, n in sorted(color_dist.items(), key=lambda x: -x[1]):
        lines.append(f"    {col}   {n}")
    lines.append("")

    # ── Candidate summary
    lines.append("── Step 2: AiQ Candidates (conf ≥ {:.0%}) ────────────────────────────".format(CANDIDATE_MIN_CONF))
    lines.append(f"  Total candidates: {len(candidates)}")

    cand_page_dist: Dict[int, int] = {}
    cand_sys_dist: Dict[str, int] = {}
    for c in candidates:
        cand_page_dist[c.page_num] = cand_page_dist.get(c.page_num, 0) + 1
        cand_sys_dist[c.system_hint] = cand_sys_dist.get(c.system_hint, 0) + 1

    lines.append("  System type distribution:")
    for s, n in sorted(cand_sys_dist.items(), key=lambda x: -x[1]):
        lines.append(f"    {s:<25} {n}")
    lines.append("  Page distribution:")
    for pg, n in sorted(cand_page_dist.items()):
        lines.append(f"    page {pg:>3}   {n} candidates")
    lines.append("")

    # ── Match table
    lines.append("── Step 3: Match Table (center-containment or coverage ≥ {:.0%}) ──────".format(MATCH_IOU_THRESHOLD))
    lines.append(f"  True  positives  (TP annots):  {tp_annot}  ← Martin's items AiQ found")
    lines.append(f"  False negatives  (FN annots):  {fn_annot}  ← Martin's items AiQ missed")
    lines.append(f"  True  pos cands  (TP cands):   {tp_cands}  ← AiQ candidates confirmed as real scope")
    lines.append(f"  False positives  (FP cands):   {fp_count}  ← AiQ candidates with no markup")
    lines.append("")

    lines.append("  True Positives (annotations covered):")
    if tp_results:
        for r in tp_results:
            a = r.annotation
            c = r.matched_candidate
            lines.append(
                f"    p{a.page_num:>2} {a.annot_type:<12} {a.color_hex}  "
                f"→ cand {c.candidate_id[:12]}  {c.system_hint:<20}  "
                f"conf={c.confidence:.2f}  IoU={r.best_iou:.2f}"
            )
    else:
        lines.append("    (none)")
    lines.append("")

    lines.append("  False Negatives (missed annotations):")
    if fn_results:
        for r in fn_results:
            a = r.annotation
            lines.append(
                f"    p{a.page_num:>2} {a.annot_type:<12} {a.color_hex}  "
                f"rect=({a.rect.x0:.0f},{a.rect.y0:.0f},{a.rect.x1:.0f},{a.rect.y1:.0f})"
                + (f"  label={a.label!r}" if a.label else "")
            )
    else:
        lines.append("    (none)")
    lines.append("")

    lines.append("  False Positives (unmatched AiQ candidates):")
    if fp_cands:
        for c in fp_cands[:50]:  # cap at 50 for readability
            lines.append(
                f"    p{c.page_num:>2} {c.candidate_id[:12]}  {c.system_hint:<20}  conf={c.confidence:.2f}"
            )
        if len(fp_cands) > 50:
            lines.append(f"    … and {len(fp_cands) - 50} more")
    else:
        lines.append("    (none)")
    lines.append("")

    # ── Final scores
    lines.append("── Final Scores ──────────────────────────────────────────────────────")
    lines.append(f"  Precision : {precision:.3f}  ({tp_cands} TP candidates / {len(candidates)} total candidates)")
    lines.append(f"  Recall    : {recall:.3f}  ({tp_annot} annotations found / {tp_annot+fn_annot} total)")
    lines.append(f"  F1 Score  : {f1:.3f}")
    lines.append("")
    lines.append("  Interpretation:")
    lines.append(f"    {recall:.0%} of Martin's scope items on scanned pages were detected by AiQ (recall).")
    lines.append(f"    {precision:.0%} of AiQ's candidates correspond to marked scope (precision).")
    lines.append("    Pages not selected by prescan are counted as false negatives.")
    lines.append(f"    Scan pages used: {sorted(set(a.page_num for a in annotations if a.page_num in set()))}.")
    lines.append("=" * 72)

    return "\n".join(lines), precision, recall, f1


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    for path in (MARKED_PDF, CLEAN_PDF):
        if not os.path.exists(path):
            print(f"ERROR: PDF not found: {path}")
            sys.exit(1)

    # ── Step 1
    print("[Step 1] Extracting ground-truth annotations from marked PDF …")
    annotations = extract_annotations(MARKED_PDF)
    marked_doc  = fitz.open(MARKED_PDF)
    marked_page_count = len(marked_doc)
    marked_doc.close()

    page_set = sorted(set(a.page_num for a in annotations))
    type_dist: Dict[str, int] = {}
    color_dist: Dict[str, int] = {}
    for a in annotations:
        type_dist[a.annot_type] = type_dist.get(a.annot_type, 0) + 1
        color_dist[a.color_hex] = color_dist.get(a.color_hex, 0) + 1

    print(f"         Extracted {len(annotations)} annotations on {len(page_set)} pages: {page_set}")
    print(f"         Types:  {dict(sorted(type_dist.items(), key=lambda x:-x[1]))}")
    print(f"         Colors: {dict(sorted(color_dist.items(), key=lambda x:-x[1]))}")

    # ── Step 2
    candidates = run_pipeline(CLEAN_PDF)
    clean_doc  = fitz.open(CLEAN_PDF)
    clean_page_count = len(clean_doc)
    clean_doc.close()

    sys_dist: Dict[str, int] = {}
    for c in candidates:
        sys_dist[c.system_hint] = sys_dist.get(c.system_hint, 0) + 1
    print(f"\n         Found {len(candidates)} candidates ≥{CANDIDATE_MIN_CONF:.0%} confidence")
    print(f"         System distribution: {sys_dist}")

    # ── Step 3
    print(f"\n[Step 3] Comparing annotations to candidates (IoU ≥ {MATCH_IOU_THRESHOLD:.0%}) …")
    match_results, unmatched_cands = compare(
        annotations, candidates, marked_page_count, clean_page_count
    )

    tp = sum(1 for r in match_results if r.matched_candidate is not None)
    fn = sum(1 for r in match_results if r.matched_candidate is None)
    fp = len(unmatched_cands)
    print(f"         TP={tp}  FN={fn}  FP={fp}")

    # ── Step 4
    print("[Step 4] Saving report …")
    report_text, precision, recall, f1 = build_report(
        marked_page_count, clean_page_count,
        annotations, candidates, match_results, unmatched_cands,
    )

    report_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "ground_truth_report_mclarty_v2.txt"
    )
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report_text)
    print(f"         Saved → {report_path}")

    print("\n" + "=" * 50)
    print(f"  Precision : {precision:.3f}")
    print(f"  Recall    : {recall:.3f}")
    print(f"  F1 Score  : {f1:.3f}")
    print("=" * 50)


if __name__ == "__main__":
    main()
