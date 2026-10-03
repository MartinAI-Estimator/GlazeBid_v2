# GlazeBid Scope Color System — Canonical Reference
# Version 1.0
# This file is the single source of truth for scope type colors across:
#   - Bluebeam toolbox markup colors
#   - Builder System card colors
#   - GlazierAI classification output
#   - Studio markup rendering
#   - GlazeField (future)
#   - GlazierAI Pro (future)
#
# Subjects/colors mirror Martin's Estimating ToolBox.btx (reference/bluebeam/).
# The full subject → class map lives in sidecar/knowledge/scope_taxonomy.json;
# this file is the per-scope color card.  NOTE: #008080 is shared by Window Wall
# and Break Metal, and #FF8000 by Ext/Int SF — classify by SUBJECT, not color.

SCOPE_COLORS = {

    # ── Primary Framing Systems ───────────────────────────────────────────────

    "curtain_wall": {
        "hex": "#008000",
        "name": "Curtain Wall",
        "bluebeam_subjects": [
            "Ext CW Highlight", "Ext CW Area", "Ext CW Polylength",
            "Ext CW Line", "Ext CW Door", "Ext CW Polylength",
            "Int CW Highlight", "Int CW Area", "Int CW Polylength",
            "Int CW Door", "Terrace Door Highlight",
        ],
        "csi_sections": ["08 44 13", "08 44 33", "08 45 13"],
        "system_card_label": "Curtain Wall",
        "notes": "Includes terrace doors and bi-fold/sliding panels within CW assembly",
    },

    "storefront": {
        "hex": "#FF8000",
        "name": "Storefront",
        "bluebeam_subjects": [
            "Ext SF Highlight", "Ext SF Area", "Ext SF Polylength",
            "Ext SF Line", "Ext SF Door", "SF Frames",
            "Int SF Highlight", "Int SF Area", "Int SF Polylength",
            "Int SF Door", "Int Aluminum Partition Highlight",
            "Interior Aluminum Partition Area", "Interior Aluminum Partition Polylength",
            "Interior Aluminum Partition Doors",
        ],
        "csi_sections": ["08 41 13", "08 42 26"],
        "system_card_label": "Storefront",
        "notes": "Includes interior aluminum partitions and bi-fold/sliding panels within SF assembly",
    },

    "window_wall": {
        "hex": "#008080",
        "name": "Window Wall",
        "bluebeam_subjects": [
            "Ext WW Highlight", "Ext WW Area", "Ext WW Polylength", "Ext WW Line",
        ],
        "csi_sections": ["08 44 00"],
        "system_card_label": "Window Wall",
        "notes": "WW = WINDOW WALL (Martin, 2026-10-03) — was mislabeled 'Wet Wall'. "
                 "Shares #008080 with Break Metal; tell them apart by subject, never color.",
    },

    "break_metal": {
        "hex": "#008080",
        "name": "Break Metal Flashing & Trim",
        "bluebeam_subjects": [
            "Break Metal Flashing & Trims", "Break Metal Flashing & Trim Polylength",
        ],
        "csi_sections": [],
        "system_card_label": "Break Metal",
        "notes": "Ours when it touches our frame (Martin, 2026-10-03).",
    },

    # ── Glass-Primary Systems ─────────────────────────────────────────────────

    "all_glass_wall": {
        "hex": "#80FFFF",
        "name": "All-Glass Wall",
        "bluebeam_subjects": [
            "All Glass Wall Highlight", "All Glass Wall Area",
            "All Glass Wall Polylength", "All Glass Wall Line",
            "All Glass Door", "All Glass Doors",
        ],
        "csi_sections": ["08 42 26"],
        "system_card_label": "All-Glass Wall / Frameless",
        "notes": "Frameless glass partitions, patch-fitted systems, butt-jointed glass",
    },

    "glazing_only": {
        "hex": "#800040",
        "name": "Glazing Only",
        "bluebeam_subjects": [
            "Glazing Only Highlight", "Glazing Only Area",
            "Glazing Only Line", "Glazing Only Door",
            "Glazing Only Door's", "Glazing ONLY Door",
            "HM Lite Counts",
        ],
        "csi_sections": ["08 80 00"],
        "system_card_label": "Glazing Only",
        "notes": "Glass in HM frames, OH door vision lites, sidelite glass only — no aluminum scope",
    },

    "window": {
        "hex": "#0000FF",
        "name": "Fixed / Operable Window",
        "bluebeam_subjects": [
            "Fixed / Operable Window Highlight", "Fixed / Operable Window Area",
            "Operable Window Polylength", "Operable Window Line",
            "Transaction Window Highlight", "Transaction Window Line",
            "Transaction Window Area", "BR Transaction Window Highlight",
            "Polished Edge Count",
        ],
        "csi_sections": ["08 51 13", "08 52 13", "08 53 13", "08 56 19", "08 56 80"],
        "system_card_label": "Windows / Transaction Windows",
        "notes": "Includes pass windows and drive-up transaction windows",
    },

    "translucent_panel": {
        "hex": "#0080FF",
        "name": "Translucent Panel",
        "bluebeam_subjects": [
            "Translucent Panel Highlight", "Translucent Panel Area",
            "Translucent Panel Polylength", "SSG Caulk Count",
        ],
        "csi_sections": ["08 45 13"],
        "system_card_label": "Translucent Panels",
        "notes": "Kalwall, polycarbonate panel systems, SSG structural silicone glazing",
    },

    # ── Specialty Systems ─────────────────────────────────────────────────────

    "bifold_sliding": {
        "hex": "#FFFF00",
        "name": "Bi-Fold / Sliding Door",
        "bluebeam_subjects": [
            "Bi-Fold / Sliding Door Highlight", "Bi-Fold / Slding Door Polylength",
            "Bi-Fold / Sliding Door's", "Auto-Sliding Door Highlight",
            "Automatic Sliding Door",
        ],
        "csi_sections": ["08 42 29"],
        "system_card_label": "Bi-Fold / Sliding Doors",
        "notes": "Standalone only — panels within CW or SF assembly inherit parent color",
    },

    "fire_rated": {
        "hex": "#FF0000",
        "name": "Fire Rated",
        "bluebeam_subjects": [
            "Fire Rated SF Highlight", "Fire Rated Storefront Area",
            "Fire Rated SF Polylength", "Fire Rated Glazing Only Highlight",
            "Fire Rated Glazing Area", "Fire Rated Door Lite's",
            "Floor Line Fire Caulking Polylength",
        ],
        "csi_sections": ["08 88 13"],
        "system_card_label": "Fire Rated Glazing",
        "notes": "Fire-rated storefront and glazing-only. Floor line fire caulking included.",
    },

    "sun_control": {
        "hex": "#FF80FF",
        "name": "Sun Control Device",
        "bluebeam_subjects": [
            "Sun Control Device Highlight", "Sun Control Device Area",
            "Sun Control Device Polylength",
        ],
        "csi_sections": ["08 44 13"],
        "system_card_label": "Sun Control Devices",
        "notes": "Standalone only — integral sunshades within CW/SF inherit parent color",
    },

    "mirror": {
        "hex": "#FF80C0",
        "name": "Mirror",
        "bluebeam_subjects": [
            "Mirror Highlight", "Mirror Area", "Mirror Polylength",
        ],
        "csi_sections": ["08 83 00"],
        "system_card_label": "Mirrors",
        "notes": "Division 08 architectural mirrors only. Bobrick/Division 10 = not scope.",
    },

    "glass_handrail": {
        "hex": "#FF0080",
        "name": "Glass Handrail",
        "bluebeam_subjects": [
            "Handrail Highlight", "Glass Handrail Area",
            "Glass Handrail Polylength",
        ],
        "csi_sections": ["05 73 19"],
        "system_card_label": "Glass Handrails",
        "notes": "Glass infill panels only — railing system (posts, top rail) is Div 05 metals",
    },

    # ── New Tools (v1.0 additions) ────────────────────────────────────────────

    "glass_film": {
        "hex": "#CC99FF",
        "name": "Glass Film",
        "bluebeam_subjects": [
            "Glass Film Highlight", "Glass Film Area", "Glass Film Polylength",
        ],
        "csi_sections": ["08 88 00"],
        "system_card_label": "Glass Film",
        "notes": "Applied window film — 3M, LLumar, etc. Measured by SF and LF.",
    },

    "skylight": {
        "hex": "#00B4D8",
        "name": "Skylight",
        "bluebeam_subjects": [
            "Skylight Highlight", "Skylight Area",
            "Skylight Polylength", "Skylight Count",
        ],
        "csi_sections": ["08 62 00", "08 63 00"],
        "system_card_label": "Skylights",
        "notes": "Unit skylights and metal-framed skylights. Count tool for unit quantity.",
    },

    "bullet_blast": {
        "hex": "#CC0033",
        "name": "Bullet / Blast Resistant",
        "bluebeam_subjects": [
            "Bullet Resistant Glazing Highlight", "Bullet Resistant Glazing Area",
            "Blast Resistant Glazing Highlight", "Blast Resistant Glazing Area",
            "Bullet Blast Glazing Polylength", "Bullet Blast Glazing Line",
        ],
        "csi_sections": ["08 88 16", "08 88 19"],
        "system_card_label": "Bullet / Blast Resistant Glazing",
        "notes": "Deep crimson — distinct from fire-rated red (#FF0000)",
    },

    "glass_canopy": {
        "hex": "#33CC99",
        "name": "Glass Canopy / Overhead Glazing",
        "bluebeam_subjects": [
            "Glass Canopy Highlight", "Glass Canopy Area",
            "Overhead Glazing Highlight", "Overhead Glazing Area",
            "Sloped Glazing Highlight", "Glass Canopy Polylength",
        ],
        "csi_sections": ["08 44 33", "08 63 13"],
        "system_card_label": "Glass Canopy / Overhead Glazing",
        "notes": "Sloped and overhead glass assemblies. Teal-green — distinct from CW green and WW teal.",
    },

    "smart_glass": {
        "hex": "#9933FF",
        "name": "Smart / Switchable Glass",
        "bluebeam_subjects": [
            "Smart Glass Highlight", "Smart Glass Area",
            "Switchable Glass Highlight", "Electrochromic Glass Area",
            "Smart Glass Polylength",
        ],
        "csi_sections": ["08 88 00"],
        "system_card_label": "Smart / Switchable Glass",
        "notes": "Electrochromic, PDLC, dynamic glass. Electric purple — distinct from all existing tools.",
    },
}


# ── Quick-reference color maps ────────────────────────────────────────────────
# Use these for GlazierAI classification output and Builder System card colors

# Colors are NOT unique (see header) — this map is lossy; prefer subjects.
COLOR_TO_SCOPE = {v["hex"]: k for k, v in SCOPE_COLORS.items()}
SCOPE_TO_COLOR = {k: v["hex"] for k, v in SCOPE_COLORS.items()}
SCOPE_TO_LABEL = {k: v["system_card_label"] for k, v in SCOPE_COLORS.items()}

# Total scope types: 18
# Complete as of GlazeBid v2 / GlazierAI v1.0
