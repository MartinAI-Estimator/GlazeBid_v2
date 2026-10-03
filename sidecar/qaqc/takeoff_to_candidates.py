"""
takeoff_to_candidates.py — bridge the vision pipeline into the eval harness.

The production endpoint POST /drawing-intelligence/run now returns
`detections` with bbox + page_index (geometry_anchoring.py).  This script
turns that payload into the candidate-file format eval_harness.py scores:

    { "job": "<corpus job name>", "source": "<pipeline version>",
      "candidates": [ { "page": 4, "rect": [x0,y0,x1,y1],
                        "scope_class": "ext_sf", "confidence": 0.9 }, … ] }

Two ways to use it
──────────────────
A) You already have a /run response saved as JSON:
     python takeoff_to_candidates.py result_mclarty.json \
         --job "McLarty Mazda - Bid Plans" -o baseline/cand_vision_McLarty_Mazda.json

B) Run the pipeline yourself (needs ANTHROPIC_API_KEY in the env, ~2–4 min/set,
   real API spend) and score in one go:
     cd sidecar
     python qaqc/takeoff_to_candidates.py --run "qaqc/test_data/McLarty Mazda - Bid Plans - Non Marked.pdf" \
         --job "McLarty Mazda - Bid Plans" -o qaqc/baseline/cand_vision_McLarty_Mazda.json \
         --score --corpus corpus/markup_corpus.json --out-dir qaqc/baseline/vision-v1

   --score calls eval_harness.py on the emitted candidate file.  The harness
   prints det-P / det-R / cls-acc and writes the diff JSON to --out-dir, which
   is what goes in the BASELINE.md ledger.

Job names must match `job` in corpus/markup_corpus.json exactly.  Run with
--list-jobs to print them.

Nothing here touches the corpus or BASELINE.md.  A ledger row is written by a
human after reading the numbers.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SIDECAR = HERE.parent


def load_result(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def to_candidates(result: dict, job: str, source: str | None = None,
                  include_fallback: bool = True, min_confidence: float = 0.0) -> dict:
    dets = result.get("detections") or []
    cands = []
    skipped_no_class = 0
    for d in dets:
        cls = d.get("harness_class")
        if not cls:
            skipped_no_class += 1
            continue
        if not include_fallback and d.get("anchor_method") == "tag_fallback":
            continue
        conf = float(d.get("confidence", 0.0))
        if conf < min_confidence:
            continue
        bbox = d.get("bbox")
        page = d.get("page_index")
        if not (isinstance(bbox, list) and len(bbox) == 4) or page is None:
            continue
        cands.append({
            "page": int(page),
            "rect": [float(v) for v in bbox],
            "scope_class": cls,
            "role": "door" if d.get("role") == "door" else "region",
            "confidence": conf,
            "flag": d.get("flag"),
            # extra context, ignored by the harness but useful in diffs
            "mark": d.get("mark"),
            "system_type": d.get("system_type"),
            "anchor_method": d.get("anchor_method"),
        })
    if skipped_no_class:
        print(f"  note: {skipped_no_class} detection(s) had a scope_type with no harness class — skipped",
              file=sys.stderr)
    return {
        "job": job,
        "source": source or (dets[0].get("source") if dets else "vision+geometry-v1"),
        "pipeline_meta": {
            "project": result.get("project"),
            "generated_at": result.get("generated_at"),
            "total_tokens": result.get("total_tokens"),
            "legend": result.get("legend"),
            "anchoring": result.get("anchoring"),
        },
        "candidates": cands,
    }


def _load_env_glazierai() -> None:
    """
    Same fallback electron/main.ts uses (readEnvGlazierai): if the key isn't
    in the environment, read ANTHROPIC_API_KEY=... from ~/.env_glazierai.
    """
    if os.environ.get("ANTHROPIC_API_KEY"):
        return
    home = os.environ.get("USERPROFILE") or os.environ.get("HOME") or ""
    p = Path(home) / ".env_glazierai"
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if line.startswith("ANTHROPIC_API_KEY="):
            os.environ["ANTHROPIC_API_KEY"] = line.split("=", 1)[1].strip().strip('"').strip("'")
            print(f"  API key loaded from {p}", file=sys.stderr)
            return


def run_pipeline(pdf_path: str, project_name: str) -> dict:
    """Call _run_pipeline directly (same code path as the HTTP endpoint)."""
    if str(SIDECAR) not in sys.path:
        sys.path.insert(0, str(SIDECAR))
    _load_env_glazierai()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("ANTHROPIC_API_KEY is not set (env or ~/.env_glazierai) — the vision pipeline needs it.")
    from glazierai.modules.drawing_intelligence.drawing_intelligence_router import (
        DrawingIntelligenceRequest, _run_pipeline,
    )
    req = DrawingIntelligenceRequest(pdf_path=pdf_path, project_name=project_name)
    return _run_pipeline(req)


def list_jobs(corpus: Path) -> None:
    c = json.loads(corpus.read_text(encoding="utf-8"))
    for j in c["jobs"]:
        n = sum(len(p["annotations"]) for p in j["pages"])
        print(f"  {j['job']!r:60s} pages={len(j['pages']):3d} annots={n}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("result", nargs="?", help="saved /drawing-intelligence/run JSON (mode A)")
    ap.add_argument("--run", metavar="PDF", help="run the pipeline on this PDF instead (mode B)")
    ap.add_argument("--job", help="corpus job name (must match markup_corpus.json)")
    ap.add_argument("--project-name", help="project name passed to the pipeline (default: --job)")
    ap.add_argument("-o", "--out", help="candidate JSON to write")
    ap.add_argument("--save-result", help="(mode B) also save the raw pipeline result here")
    ap.add_argument("--source", help="override 'source' label")
    ap.add_argument("--no-fallback", action="store_true", help="drop tag_fallback detections")
    ap.add_argument("--min-confidence", type=float, default=0.0)
    ap.add_argument("--score", action="store_true", help="run eval_harness.py on the output")
    ap.add_argument("--corpus", default=str(SIDECAR / "corpus" / "markup_corpus.json"))
    ap.add_argument("--out-dir", default=str(HERE / "baseline" / "vision-v1"))
    ap.add_argument("--iou", type=float, default=0.25)
    ap.add_argument("--list-jobs", action="store_true")
    a = ap.parse_args()

    if a.list_jobs:
        list_jobs(Path(a.corpus))
        return 0
    if not a.job:
        ap.error("--job is required (use --list-jobs to see names)")

    if a.run:
        print(f"→ running vision pipeline on {a.run!r} …")
        result = run_pipeline(a.run, a.project_name or a.job)
        if a.save_result:
            Path(a.save_result).write_text(json.dumps(result, indent=2), encoding="utf-8")
            print(f"  raw result saved: {a.save_result}")
    elif a.result:
        result = load_result(Path(a.result))
    else:
        ap.error("give a saved result JSON or --run PDF")

    anch = result.get("anchoring") or {}
    print(f"  anchoring: {anch.get('marks_anchored')}/{anch.get('marks_total')} marks → "
          f"{anch.get('detections')} detections {anch.get('by_method')}")

    cand = to_candidates(result, a.job, a.source, include_fallback=not a.no_fallback,
                         min_confidence=a.min_confidence)
    out = Path(a.out or (HERE / "baseline" / f"cand_vision_{a.job.split(' - ')[0].replace(' ', '_')}.json"))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(cand, indent=2), encoding="utf-8")
    print(f"  {len(cand['candidates'])} candidates → {out}")

    if a.score:
        cmd = [sys.executable, str(HERE / "eval_harness.py"), str(out),
               "--corpus", a.corpus, "--iou", str(a.iou), "-o", a.out_dir]
        print("→ " + " ".join(f'"{c}"' if " " in c else c for c in cmd))
        return subprocess.call(cmd)
    return 0


if __name__ == "__main__":
    sys.exit(main())
