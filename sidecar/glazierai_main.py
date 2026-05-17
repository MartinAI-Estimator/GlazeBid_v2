"""
GlazierAI — Main FastAPI Application
This is the unified GlazierAI service, running at localhost:8100.
It replaces and extends the AiQ sidecar.

Modules:
  /spec-reader  — Spec Reader (live)
  /aiq          — Drawing Intelligence / AiQ (existing, imported from aiq module)

Start:
  uvicorn glazierai_main:app --host 0.0.0.0 --port 8100 --reload
"""

import logging
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger("glazierai")

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="GlazierAI",
    description=(
        "GlazierAI — Domain AI for commercial glazing. "
        "Powers GlazeBid, GlazeOps, GlazePrism, GlazeField."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow GlazeBid Electron renderer and Builder dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Builder (Vite dev)
        "http://localhost:5174",   # Studio (Vite dev)
        "http://localhost:3000",   # Any other local dev
        "app://.",                 # Electron renderer origin
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Mount Spec Reader ────────────────────────────────────────────────────────
from spec_reader.router import spec_reader_router

app.include_router(
    spec_reader_router,
    prefix="/spec-reader",
    tags=["Spec Reader"],
)

# ─── Mount AiQ (Drawing Intelligence) ────────────────────────────────────────
# TODO: import and mount existing AiQ routes here
# from modules.drawing.router import drawing_router
# app.include_router(drawing_router, prefix="/aiq", tags=["Drawing Intelligence"])


# ─── Root ─────────────────────────────────────────────────────────────────────

@app.get("/", tags=["Root"])
async def root():
    return {
        "service": "GlazierAI",
        "version": "1.0.0",
        "status": "running",
        "modules": {
            "spec_reader": "/spec-reader",
            "drawing_intelligence": "/aiq (coming soon)",
        },
        "docs": "/docs",
    }


@app.get("/health", tags=["Root"])
async def health():
    """Top-level health check for Electron sidecar manager"""
    return {
        "status": "ok",
        "anthropic_configured": bool(os.getenv("ANTHROPIC_API_KEY")),
    }
