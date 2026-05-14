"""
Pipeline Validation Report Generator

Runs the complete pipeline (L2 extraction → Rules Engine → Scope Filter)
on both test PDFs and produces a comprehensive report.
"""

import os, sys, datetime
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fitz
import numpy as np
from layers.layer2_extractor import extract_vector_graph, detect_scale
from layers.rules_engine import run_rules_engine, GlazingCandidate
from layers.layer6_scope_filter import filter_by_scope

TEST_DATA = os.path.join(os.path.dirname(__file__), "test_data")
PDFS = [
    ("McLarty Mazda", os.path.join(TEST_DATA, "test_elevation.pdf")),
    ("Hope Aquatic", os.path.join(TEST_DATA, "Hope Aquatic & Rec Center - Bid Drawings - Non Marked.pdf")),
]

TODAY = datetime.date.today().isoformat()
REPORT_PATH = os.path.join(os.path.dirname(__file__), f"pipeline_report_{TODAY}.txt")

lines = []
def out(s=""): lines.append(s)

out(f"GlazeBid AiQ Pipeline Validation Report — {TODAY}")
out("=" * 70)

for label, path in PDFS:
    if not os.path.exists(path):
        out(f"\n{label}: FILE NOT FOUND — {path}")
        continue

    doc = fitz.open(path)
    n_pages = len(doc)

    # Phase 1: Scale detection on all pages
    page_scales = []
    for pn in range(n_pages):
        page = doc[pn]
        sc = detect_scale(page)
        page_scales.append(sc)
    doc.close()

    valid_scales = [s.scale_factor for s in page_scales if s.scale_confidence >= 0.5]
    fallback_sf = float(np.median(valid_scales)) if valid_scales else 0.0
    fallback_conf = 0.50

    scale_detected = sum(1 for s in page_scales if s.scale_confidence >= 0.70)
    scale_any = sum(1 for s in page_scales if s.scale_confidence > 0)

    # Phase 2: Extract + Rules Engine per page
    all_candidates = []
    pages_with_candidates = 0

    for pn in range(n_pages):
        graph = extract_vector_graph(path, page_num=pn)
        if graph.node_count < 10:
            continue

        eff_sf = graph.scale.scale_factor
        eff_sc = graph.scale.scale_confidence
        if eff_sc < 0.5 and fallback_sf > 0:
            eff_sf = fallback_sf
            eff_sc = fallback_conf

        candidates = run_rules_engine(
            x=graph.x,
            edge_index=graph.edge_index,
            edge_attr=graph.edge_attr,
            scale_factor=eff_sf,
            scale_confidence=eff_sc,
            source_sheet=f"page_{pn}",
        )

        for c in candidates:
            c.debug_info["page_num"] = pn
            c.debug_info["scale_factor"] = eff_sf
        all_candidates.extend(candidates)
        if candidates:
            pages_with_candidates += 1

    # Phase 3: Scope filter
    scope_results = filter_by_scope(all_candidates)
    scope_map = {r["candidate_id"]: r for r in scope_results}

    # ── Report ──
    out(f"\n{'='*70}")
    out(f"  {label}")
    out(f"  PDF: {os.path.basename(path)}")
    out(f"  Pages: {n_pages}")
    out(f"{'='*70}")

    # Scale summary
    out(f"\n  SCALE DETECTION")
    out(f"  Pages with scale ≥0.70: {scale_detected}/{n_pages} ({scale_detected/n_pages*100:.0f}%)")
    out(f"  Pages with any scale:   {scale_any}/{n_pages}")
    out(f"  Fallback scale:         {fallback_sf:.3f} pts/in")

    # Candidate counts by confidence tier
    tiers = {"high (≥0.90)": [], "mid (0.70-0.89)": [], "low (0.40-0.69)": [], "reject (<0.40)": []}
    for c in all_candidates:
        if c.confidence >= 0.90:
            tiers["high (≥0.90)"].append(c)
        elif c.confidence >= 0.70:
            tiers["mid (0.70-0.89)"].append(c)
        elif c.confidence >= 0.40:
            tiers["low (0.40-0.69)"].append(c)
        else:
            tiers["reject (<0.40)"].append(c)

    out(f"\n  CANDIDATE COUNTS")
    out(f"  Total candidates: {len(all_candidates)}")
    out(f"  Pages with candidates: {pages_with_candidates}/{n_pages}")
    for tier, cands in tiers.items():
        out(f"    {tier:20s}: {len(cands):4d}")

    # System type distribution (at ≥0.70)
    high_cands = [c for c in all_candidates if c.confidence >= 0.70]
    system_counts = {}
    for c in high_cands:
        s = c.system_hint or "unknown"
        system_counts[s] = system_counts.get(s, 0) + 1

    out(f"\n  SYSTEM TYPE DISTRIBUTION (≥0.70 confidence)")
    out(f"  Total: {len(high_cands)}")
    for sys_type, count in sorted(system_counts.items(), key=lambda x: -x[1]):
        pct = count / len(high_cands) * 100 if high_cands else 0
        out(f"    {sys_type:20s}: {count:4d} ({pct:.1f}%)")

    unknown_pct = system_counts.get("unknown", 0) / len(high_cands) * 100 if high_cands else 0
    out(f"  Unknown rate: {unknown_pct:.1f}% (target: <10%)")

    # Scope distribution
    scope_counts = {"in_scope": 0, "out_of_scope": 0, "scope_review": 0}
    for c in high_cands:
        sr = scope_map.get(c.candidate_id, {})
        scope = sr.get("scope", "scope_review")
        scope_counts[scope] = scope_counts.get(scope, 0) + 1

    out(f"\n  SCOPE DISTRIBUTION (≥0.70 confidence)")
    for scope, count in scope_counts.items():
        pct = count / len(high_cands) * 100 if high_cands else 0
        out(f"    {scope:20s}: {count:4d} ({pct:.1f}%)")

    # Top 10 candidates with dimensions
    out(f"\n  TOP 10 CANDIDATES BY CONFIDENCE")
    out(f"  {'#':>3}  {'Conf':>5}  {'System':15s}  {'Scope':12s}  {'Page':>4}  {'Width':>8}  {'Height':>8}  {'W(ft)':>7}  {'H(ft)':>7}")
    out(f"  {'---':>3}  {'-----':>5}  {'------':15s}  {'-----':12s}  {'----':>4}  {'-----':>8}  {'------':>8}  {'-----':>7}  {'-----':>7}")

    for i, c in enumerate(sorted(all_candidates, key=lambda x: -x.confidence)[:10]):
        sr = scope_map.get(c.candidate_id, {})
        scope = sr.get("scope", "?")
        pn = c.debug_info.get("page_num", "?")
        sf = c.debug_info.get("scale_factor", 0)

        w_pts = c.bounding_box.width
        h_pts = c.bounding_box.height
        if sf > 0:
            w_ft = (w_pts / sf) / 12.0
            h_ft = (h_pts / sf) / 12.0
            w_str = f"{w_ft:.1f} ft"
            h_str = f"{h_ft:.1f} ft"
        else:
            w_str = f"{w_pts:.0f} pts"
            h_str = f"{h_pts:.0f} pts"

        out(f"  {i+1:3d}  {c.confidence:5.2f}  {c.system_hint:15s}  {scope:12s}  {pn:>4}  {w_pts:8.0f}  {h_pts:8.0f}  {w_str:>7}  {h_str:>7}")

# ── Summary ──
out(f"\n{'='*70}")
out(f"  VALIDATION SUMMARY")
out(f"{'='*70}")
out(f"  Report generated: {TODAY}")
out(f"  Pipeline: L0→L2→RulesEngine→ScopeFilter (no schedule cross-ref)")
out(f"  Scale propagation: median fallback for pages without scale")
out(f"  System classification: storefront height min lowered to 1.0 ft")
out(f"  Scope profile: {os.path.join('sidecar', 'scope_profile.json')}")
out()

report_text = "\n".join(lines)
print(report_text)

with open(REPORT_PATH, "w", encoding="utf-8") as f:
    f.write(report_text)
print(f"\nReport saved to: {REPORT_PATH}")
