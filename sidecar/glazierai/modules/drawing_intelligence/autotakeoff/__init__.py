"""
autotakeoff — GlazeBid's deterministic drawing takeoff (no model calls).

    from glazierai.modules.drawing_intelligence.autotakeoff import run_autotakeoff, write_markups
    result = run_autotakeoff("set.pdf", "Job name")
    write_markups("set.pdf", result, "set_marked.pdf")

Built from the Valvoline and McLarty manual takeoffs (2026-10-05).  Text layer
+ vector geometry do the finding, sizing and counting; rules.json carries
Martin's classification rules; everything uncertain is flagged with a reason.
"""
from .pipeline import run_autotakeoff
from .markup_writer import write_markups, read_back

__all__ = ["run_autotakeoff", "write_markups", "read_back"]
