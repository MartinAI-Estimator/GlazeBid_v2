"""
GlazeBid AiQ — Bluebeam Markup Corpus Extractor

Walks folders of Bluebeam-marked bid PDFs and extracts every annotation into
a normalized ground-truth corpus. Each annotation is a labeled example of
scope identification by a professional estimator:

    subject      → scope class ("Ext SF Highlight", "SSG Caulk Count", ...)
    vertices     → exact polygon/polyline geometry (PDF points)
    content      → measurement text where present (e.g. "23'-6 15/16\"")
    measurement  → parsed decimal feet from content when parseable
    rect         → bounding box
    page metadata → page number, size

Output:
    markup_corpus.json   — full normalized corpus
    corpus_summary.md    — per-job and per-class statistics

Usage:
    python bluebeam_markup_extractor.py <input_dir> [<input_dir2> ...] -o <out_dir>

Unreadable files (e.g. OneDrive cloud-only placeholders) are skipped and
reported so they can be hydrated and re-run.
"""

from __future__ import annotations
import argparse
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import fitz  # PyMuPDF

# feet-inches like  23'-6 15/16"  |  3'-4"  |  11'-8 15/16"  |  6"
_FEET_IN = re.compile(
    r"(?:(\d+)'\s*-?\s*)?(\d+)?(?:\s+(\d+)/(\d+))?\s*\""
)


def parse_feet(text: str) -> float | None:
    """Parse the first feet-inches token in text to decimal feet."""
    m = _FEET_IN.search(text or "")
    if not m or not any(m.groups()):
        return None
    feet = int(m.group(1) or 0)
    inches = int(m.group(2) or 0)
    if m.group(3) and m.group(4) and int(m.group(4)) != 0:
        inches += int(m.group(3)) / int(m.group(4))
    return round(feet + inches / 12.0, 4)


def extract_annot(a: "fitz.Annot", page_no: int) -> dict:
    info = a.info
    content = info.get("content") or ""
    verts = a.vertices
    if verts:
        # vertices may be list of tuples or list of Point-like
        flat = []
        for v in verts:
            if hasattr(v, "x"):
                flat.append([round(v.x, 2), round(v.y, 2)])
            elif isinstance(v, (list, tuple)) and len(v) == 2 and not isinstance(v[0], (list, tuple)):
                flat.append([round(v[0], 2), round(v[1], 2)])
            elif isinstance(v, (list, tuple)):
                for p in v:
                    flat.append([round(p[0], 2), round(p[1], 2)])
        verts = flat
    return {
        "page": page_no,
        "type": a.type[1],
        "subject": info.get("subject") or None,
        "author": info.get("title") or None,
        "content": content or None,
        "measurement_ft": parse_feet(content),
        "rect": [round(v, 2) for v in a.rect],
        "vertices": verts or None,
        "stroke": a.colors.get("stroke") or None,
        "fill": a.colors.get("fill") or None,
        "opacity": a.opacity if a.opacity >= 0 else None,
    }


def extract_pdf(path: Path) -> dict | None:
    try:
        doc = fitz.open(path)
    except Exception as e:
        print(f"  SKIP (unreadable — cloud-only?): {path.name}", file=sys.stderr)
        return None
    pages = []
    n_annots = 0
    for pno, page in enumerate(doc):
        annots = [extract_annot(a, pno) for a in (page.annots() or [])]
        n_annots += len(annots)
        pages.append({
            "page": pno,
            "width_pts": round(page.rect.width, 1),
            "height_pts": round(page.rect.height, 1),
            "annotations": annots,
        })
    doc.close()
    return {
        "job": path.stem,
        "file": str(path),
        "page_count": len(pages),
        "annotation_count": n_annots,
        "pages": pages,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="+")
    ap.add_argument("-o", "--out", required=True)
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    seen: set[str] = set()
    jobs, skipped = [], []
    for d in args.inputs:
        for pdf in sorted(Path(d).glob("*.pdf")):
            if pdf.name in seen:
                continue
            seen.add(pdf.name)
            print(f"processing: {pdf.name}", file=sys.stderr)
            job = extract_pdf(pdf)
            if job is None:
                skipped.append(pdf.name)
            else:
                jobs.append(job)

    corpus = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "job_count": len(jobs),
        "total_annotations": sum(j["annotation_count"] for j in jobs),
        "skipped_files": skipped,
        "jobs": jobs,
    }
    (out_dir / "markup_corpus.json").write_text(
        json.dumps(corpus, indent=1), encoding="utf-8"
    )

    # ── summary ──
    cls = Counter()
    lines = [
        "# Bluebeam Markup Corpus Summary",
        f"\nGenerated: {corpus['generated']}",
        f"\nJobs: {len(jobs)}  |  Total annotations: {corpus['total_annotations']}",
        f"\nSkipped (unreadable): {len(skipped)}" + (f" — {', '.join(skipped)}" if skipped else ""),
        "\n## Per Job\n",
        "| Job | Pages | Annotations | Top classes |",
        "|---|---|---|---|",
    ]
    for j in jobs:
        c = Counter(
            a["subject"] or "(none)"
            for p in j["pages"] for a in p["annotations"]
        )
        cls.update(c)
        top = ", ".join(f"{k} ({v})" for k, v in c.most_common(3))
        lines.append(f"| {j['job']} | {j['page_count']} | {j['annotation_count']} | {top} |")
    lines += ["\n## Scope Class Totals\n", "| Subject | Count |", "|---|---|"]
    for k, v in cls.most_common():
        lines.append(f"| {k} | {v} |")
    (out_dir / "corpus_summary.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"\nWrote {out_dir/'markup_corpus.json'} and corpus_summary.md", file=sys.stderr)
    print(f"Jobs: {len(jobs)}, annotations: {corpus['total_annotations']}, skipped: {len(skipped)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
