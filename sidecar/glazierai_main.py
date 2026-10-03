"""
glazierai_main.py — DEPRECATED.  Do not add routes here.

The single GlazeBid sidecar application lives in `sidecar/main.py`.  It mounts
the AiQ geometry layers, the Spec Reader (/spec-reader) and the vision
Drawing Intelligence pipeline (/drawing-intelligence) on port 8100.

This file used to be a second FastAPI app that mounted ONLY the spec reader
and carried a TODO to mount the AiQ routes.  Anyone who started it got a
service with no drawing intelligence.  It now re-exports `main:app` so that
any stale launcher (`uvicorn glazierai_main:app`) still gets the full service,
and logs a warning so the stale launcher gets fixed.

Correct start command:
    uvicorn main:app --host 127.0.0.1 --port 8100
"""

import logging
import warnings

logging.getLogger("glazierai").warning(
    "glazierai_main is deprecated — start the sidecar with `uvicorn main:app`. "
    "Re-exporting main:app."
)
warnings.warn(
    "sidecar/glazierai_main.py is deprecated; use sidecar/main.py",
    DeprecationWarning,
    stacklevel=2,
)

from main import app  # noqa: E402,F401  — re-export the real app

__all__ = ["app"]
