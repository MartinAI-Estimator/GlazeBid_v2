r"""
Sprint 4 -> Sprint 5 Diagnostic: Two validations on real data.

Validation 1: POST /detect-glazing to localhost:8100 with McLarty page 6
Validation 2: Layer 9 homography between elevation and floor plan pages

Usage:
    cd "C:\Users\mjaym\GlazeBid v2"
    .venv\Scripts\python.exe sidecar/qaqc/diag_pre_sprint5.py
"""

import base64
import json
import os
import sys
import time
import subprocess
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

TEST_DATA_DIR = os.path.join(os.path.dirname(__file__), "test_data")
REAL_PDF_PATH = os.path.join(TEST_DATA_DIR, "test_elevation.pdf")
BASE_URL = "http://localhost:8100"

# ===============================================================================
# VALIDATION 1 - Full FastAPI /detect-glazing E2E
# ===============================================================================

def validation_1():
    print("=" * 80)
    print("VALIDATION 1 - POST /detect-glazing (McLarty A2.0, page 6)")
    print("=" * 80)

    # Encode PDF as base64
    with open(REAL_PDF_PATH, "rb") as f:
        pdf_b64 = base64.b64encode(f.read()).decode("utf-8")

    payload = {
        "pdf_base64": pdf_b64,
        "page_num": 6,
        "sheet_type": "elevation",
    }

    try:
        resp = requests.post(f"{BASE_URL}/detect-glazing", json=payload, timeout=120)
        print(f"\n  HTTP Status: {resp.status_code}")
        data = resp.json()

        # Print select fields, not the full massive response
        print(f"  Response status: {data.get('status')}")
        print(f"  Candidate count: {data.get('candidate_count')}")

        if data.get("status") == "error":
            print(f"  ERROR: {data.get('error')}")
            print(f"\n  Full response:\n{json.dumps(data, indent=2)}")
            return

        candidates = data.get("candidates", [])
        print(f"  Scale: {json.dumps(data.get('scale', {}), indent=4)}")
        print(f"  Graph meta: {json.dumps(data.get('graph_meta', {}), indent=4)}")
        print(f"  Warnings: {data.get('warnings', [])}")

        # Confidence distribution
        confs = [c["confidence"] for c in candidates]
        if confs:
            print(f"\n  Confidence range: {min(confs):.2f} - {max(confs):.2f}")
            bins = {">=0.90": 0, "0.70-0.89": 0, "0.50-0.69": 0, "<0.50": 0}
            for c in confs:
                if c >= 0.90: bins[">=0.90"] += 1
                elif c >= 0.70: bins["0.70-0.89"] += 1
                elif c >= 0.50: bins["0.50-0.69"] += 1
                else: bins["<0.50"] += 1
            print(f"  Confidence bins: {json.dumps(bins, indent=4)}")

        # System types
        types = {}
        for c in candidates:
            t = c.get("system_hint", "unknown")
            types[t] = types.get(t, 0) + 1
        print(f"\n  System types: {json.dumps(types, indent=4)}")

        # Scope values
        scopes = {}
        for c in candidates:
            s = c.get("scope", "missing")
            scopes[s] = scopes.get(s, 0) + 1
        print(f"  Scope values: {json.dumps(scopes, indent=4)}")

        # Schedule matches
        sched_count = sum(1 for c in candidates if c.get("schedule_match"))
        print(f"\n  Candidates with schedule_match: {sched_count}/{len(candidates)}")
        for c in candidates:
            if c.get("schedule_match"):
                print(f"    {c['candidate_id']}: {json.dumps(c['schedule_match'])}")

        # Top 10 candidates detail
        print(f"\n  --- Top 10 Candidates ---")
        print(f"  {'ID':<16} {'Conf':>5} {'System':<15} {'Scope':<14} {'W_in':>6} {'H_in':>6} {'Sched'}")
        print(f"  {'-'*16} {'-----':>5} {'-'*15} {'-'*14} {'------':>6} {'------':>6} {'-'*10}")
        for c in candidates[:10]:
            sm = c.get("schedule_match")
            sm_str = sm["mark"] if sm else "-"
            print(f"  {c['candidate_id']:<16} {c['confidence']:>5.2f} "
                  f"{c.get('system_hint','?'):<15} {c.get('scope','?'):<14} "
                  f"{c.get('width_inches',0):>6.0f} {c.get('height_inches',0):>6.0f} {sm_str}")

        # Full raw JSON of first candidate
        if candidates:
            print(f"\n  --- Raw JSON: First Candidate ---")
            print(f"  {json.dumps(candidates[0], indent=4)}")

    except requests.ConnectionError:
        print(f"\n  CONNECTION ERROR: Could not reach {BASE_URL}")
        print(f"  The sidecar server is not running.")
        return False
    except Exception as e:
        print(f"\n  EXCEPTION: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return False

    return True


# ===============================================================================
# VALIDATION 2 - Layer 9 Homography on Real Data
# ===============================================================================

def validation_2():
    print("\n" + "=" * 80)
    print("VALIDATION 2 - Layer 9 Homography (McLarty Mazda)")
    print("=" * 80)

    import fitz
    from layers.layer1_router import classify_sheet
    from layers.layer9_homography import detect_grid_labels, sync_sheets, match_grid_labels

    doc = fitz.open(REAL_PDF_PATH)
    print(f"\n  PDF: {os.path.basename(REAL_PDF_PATH)}")
    print(f"  Pages: {len(doc)}")

    # Step 1: Classify all pages to find floor plan and elevation sheets
    print(f"\n  --- Step 1: Sheet Classification ---")
    classifications = []
    for i in range(len(doc)):
        page = doc[i]
        result = classify_sheet(page, sheet_id=f"page_{i}")
        classifications.append({
            "page": i,
            "type": result.sheet_type,
            "confidence": result.confidence,
            "sheet_number": result.sheet_number,
        })
        print(f"    Page {i:2d}: {result.sheet_type:<15} conf={result.confidence:.2f} "
              f"sheet={result.sheet_number or '-'}")

    # Find elevation and floor plan pages
    elevations = [c for c in classifications if c["type"] == "elevation"]
    floor_plans = [c for c in classifications if c["type"] == "floor_plan"]
    print(f"\n  Elevations found: {len(elevations)} pages")
    print(f"  Floor plans found: {len(floor_plans)} pages")

    if not elevations:
        print("  WARNING: No elevation pages found. Trying all non-schedule pages...")
        elevations = [c for c in classifications if c["type"] not in ("schedule", "unknown")]

    # Step 2: Grid label detection on candidate pages
    print(f"\n  --- Step 2: Grid Label Detection ---")

    # Pick best elevation (page 6 = A2.0 based on Sprint 2-4 work)
    elev_page_num = 6
    elev_page = doc[elev_page_num]
    elev_labels = detect_grid_labels(elev_page, sheet_id=f"page_{elev_page_num}")
    print(f"\n  Elevation page {elev_page_num}:")
    print(f"    Grid labels found: {len(elev_labels)}")
    if elev_labels:
        for lbl in elev_labels[:20]:
            print(f"      '{lbl.label}' at ({lbl.x:.1f}, {lbl.y:.1f}) conf={lbl.confidence:.1f}")
    else:
        print(f"    (none)")

    # Try multiple pages for floor plan candidates
    # McLarty: page 0 might be site plan, page 1-3 might be floor plans
    fp_candidates = [0, 1, 2, 3, 4, 5]
    best_fp = None
    best_fp_labels = []
    for pg in fp_candidates:
        if pg >= len(doc):
            continue
        page = doc[pg]
        labels = detect_grid_labels(page, sheet_id=f"page_{pg}")
        ct = classifications[pg]["type"] if pg < len(classifications) else "?"
        print(f"\n  Page {pg} ({ct}):")
        print(f"    Grid labels found: {len(labels)}")
        if labels:
            for lbl in labels[:15]:
                print(f"      '{lbl.label}' at ({lbl.x:.1f}, {lbl.y:.1f}) conf={lbl.confidence:.1f}")
            if len(labels) > len(best_fp_labels):
                best_fp = pg
                best_fp_labels = labels

    # Also try higher-numbered pages
    for pg in range(7, min(len(doc), 15)):
        page = doc[pg]
        labels = detect_grid_labels(page, sheet_id=f"page_{pg}")
        ct = classifications[pg]["type"] if pg < len(classifications) else "?"
        print(f"\n  Page {pg} ({ct}):")
        print(f"    Grid labels found: {len(labels)}")
        if labels:
            for lbl in labels[:15]:
                print(f"      '{lbl.label}' at ({lbl.x:.1f}, {lbl.y:.1f}) conf={lbl.confidence:.1f}")
            if len(labels) > len(best_fp_labels):
                best_fp = pg
                best_fp_labels = labels

    # Step 3: Homography computation
    print(f"\n  --- Step 3: Homography Computation ---")
    if best_fp is not None and elev_labels and best_fp_labels:
        print(f"  Attempting homography: page {elev_page_num} (elevation) <-> page {best_fp} (best labels)")

        # Find matching labels
        matches = match_grid_labels(elev_labels, best_fp_labels)
        print(f"  Matching labels: {len(matches)}")
        for m in matches:
            print(f"    '{m.label}': ({m.point_a[0]:.1f},{m.point_a[1]:.1f}) -> ({m.point_b[0]:.1f},{m.point_b[1]:.1f})")

        # Run sync_sheets
        result = sync_sheets(
            elev_page,
            doc[best_fp],
            sheet_a_id=f"page_{elev_page_num}",
            sheet_b_id=f"page_{best_fp}"
        )
        print(f"\n  Homography result:")
        print(f"    is_reliable: {result.is_reliable}")
        print(f"    matched_labels: {len(result.matched_labels)}")
        print(f"    reprojection_error_pts: {result.reprojection_error_pts:.2f}")
        print(f"    errors: {result.errors}")
        if result.transform_matrix is not None:
            print(f"    transform_matrix:\n{result.transform_matrix}")
        else:
            print(f"    transform_matrix: None (not computed)")
    else:
        print(f"  Cannot compute homography:")
        if not elev_labels:
            print(f"    - No grid labels on elevation page {elev_page_num}")
        if best_fp is None:
            print(f"    - No page found with grid labels for floor plan")
        elif not best_fp_labels:
            print(f"    - No grid labels on best floor plan page {best_fp}")

    # Step 4: Cross-sheet candidate verification summary
    print(f"\n  --- Step 4: Cross-Sheet Verdict ---")
    if best_fp is not None and elev_labels and best_fp_labels:
        print(f"  Elevation labels: {', '.join(l.label for l in elev_labels[:20])}")
        print(f"  Floor plan labels: {', '.join(l.label for l in best_fp_labels[:20])}")
        common = set(l.label for l in elev_labels) & set(l.label for l in best_fp_labels)
        print(f"  Common labels: {common if common else 'NONE'}")
    else:
        print(f"  Cross-sheet verification not possible - insufficient grid labels.")

    doc.close()


# ===============================================================================

if __name__ == "__main__":
    validation_2()  # Run this first since it doesn't need the server

    print("\n\n")

    # Now try Validation 1 - needs the server running
    print("Attempting Validation 1 (requires sidecar on localhost:8100)...")
    validation_1()
