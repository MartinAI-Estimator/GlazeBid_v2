"""
Quick pipeline test: prescan + detect-glazing on a full drawing set.
Reports candidate counts and confidence distribution.
"""
import base64
import collections
import requests
import sys

SIDECAR = "http://127.0.0.1:8100"
PDF_PATH = r"C:\Users\mjaym\GlazeBid v2\sidecar\qaqc\test_data\Hope Aquatic & Rec Center - Bid Drawings - Non Marked.pdf"

def main():
    # Health
    r = requests.get(f"{SIDECAR}/health")
    health = r.json()
    print("Health:", health.get("status"), "v" + str(health.get("version", "?")))

    # Load PDF
    with open(PDF_PATH, "rb") as f:
        pdf_b64 = base64.b64encode(f.read()).decode()
    print(f"PDF loaded: {len(pdf_b64) // 1024}KB base64")

    # Prescan
    print("Running prescan...")
    r = requests.post(f"{SIDECAR}/prescan-drawing-set", json={"pdf_base64": pdf_b64}, timeout=120)
    prescan = r.json()
    print(f"  status: {prescan['status']}")
    print(f"  total pages: {prescan['total_pages']}")
    print(f"  scan pages ({len(prescan['scan_pages'])}): {prescan['scan_pages']}")
    print(f"  ref pages ({len(prescan['reference_pages'])}): {prescan['reference_pages']}")
    print(f"  skip pages ({len(prescan['skip_pages'])}): {prescan['skip_pages']}")

    # Detect glazing on each scan page
    all_candidates = []
    for page_num in prescan["scan_pages"]:
        page_result = next((r for r in prescan["results"] if r["page_num"] == page_num), None)
        sheet_type = page_result["sheet_type"] if page_result else "elevation"
        sys.stdout.write(f"  Page {page_num} ({sheet_type})... ")
        sys.stdout.flush()
        r = requests.post(f"{SIDECAR}/detect-glazing", json={
            "pdf_base64": pdf_b64,
            "page_num": page_num,
            "sheet_type": sheet_type,
        }, timeout=120)
        result = r.json()
        cands = result.get("candidates", [])
        cands = [c for c in cands if c.get("status") != "rejected"]
        print(f"{len(cands)} candidates")
        for c in cands:
            c["pageNum"] = page_num
        all_candidates.extend(cands)

    print(f"\n{'='*50}")
    print(f"TOTAL CANDIDATES: {len(all_candidates)}")
    print(f"{'='*50}")

    # Confidence distribution
    tiers = {"high (>=90%)": 0, "mid (70-89%)": 0, "low (50-69%)": 0, "reject (<50%)": 0}
    for c in all_candidates:
        pct = c["confidence"] * 100
        if pct >= 90:
            tiers["high (>=90%)"] += 1
        elif pct >= 70:
            tiers["mid (70-89%)"] += 1
        elif pct >= 50:
            tiers["low (50-69%)"] += 1
        else:
            tiers["reject (<50%)"] += 1

    print("\nConfidence distribution:")
    for tier, count in tiers.items():
        print(f"  {tier}: {count}")

    # Threshold analysis
    for threshold in [90, 80, 70, 60, 50]:
        at_t = [c for c in all_candidates if c["confidence"] * 100 >= threshold]
        print(f"\n--- At {threshold}% threshold: {len(at_t)} candidates ---")
        sys_counts = collections.Counter(c.get("system_hint", "unknown") for c in at_t)
        print(f"  Systems: {dict(sys_counts)}")
        page_counts = collections.Counter(c["pageNum"] for c in at_t)
        print(f"  Pages: {dict(sorted(page_counts.items()))}")

    # Top 20 by confidence
    top = sorted(all_candidates, key=lambda c: c["confidence"], reverse=True)[:20]
    print(f"\nTop 20 candidates:")
    print(f"  {'ID':<20} {'Conf':>5} {'System':<15} {'Page':>4} {'W_in':>6} {'H_in':>6}")
    for c in top:
        cid = c["candidate_id"].split("_")[-1][:16]
        print(f"  {cid:<20} {c['confidence']*100:>4.0f}% {c.get('system_hint','?'):<15} {c['pageNum']:>4} {c.get('width_inches',0):>6.0f} {c.get('height_inches',0):>6.0f}")


if __name__ == "__main__":
    main()
