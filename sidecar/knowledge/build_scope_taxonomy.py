"""
build_scope_taxonomy.py — generate sidecar/knowledge/scope_taxonomy.json

ONE source of truth for "what does this Bluebeam markup mean":
    subject  →  scope class, markup role, family, color

Inputs
    reference/bluebeam/estimating_toolbox.json   decoded from Martin's
        %APPDATA%\\Bluebeam Software\\Revu\\21\\Estimating ToolBox.btx
        (subjects, annotation types, colors — the team's real tool chest)
    CLASS_OF / ROLE_OF below                     what each subject means
                                                 (Martin's interview, 2026-10-03)

Output
    sidecar/knowledge/scope_taxonomy.json        read by eval_harness, the
                                                 markup writer and the pipeline

Re-run after Martin edits his tool chest:
    python sidecar/knowledge/build_scope_taxonomy.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOLBOX = ROOT / "reference" / "bluebeam" / "estimating_toolbox.json"
OUT = Path(__file__).resolve().parent / "scope_taxonomy.json"

# ── Scope classes ────────────────────────────────────────────────────────────
# family  = which system card / Frame Builder family it lands in
# kind    = "scope" (we bid it) | "pass_thru" (in our number, a sub does it)
#         | "implied" (accessory scope that rides on a system)
#         | "exclusion" | "note" | "measure" | "ignore"
CLASSES = {
    # framing systems
    "ext_sf":             {"label": "Exterior Storefront",            "family": "storefront",     "kind": "scope"},
    "int_sf":             {"label": "Interior Storefront",            "family": "storefront",     "kind": "scope"},
    "int_alum_partition": {"label": "Interior Aluminum Partition",    "family": "storefront",     "kind": "scope"},
    "ext_cw":             {"label": "Exterior Curtain Wall",          "family": "curtain_wall",   "kind": "scope"},
    "int_cw":             {"label": "Interior Curtain Wall",          "family": "curtain_wall",   "kind": "scope"},
    "window_wall":        {"label": "Window Wall",                    "family": "window_wall",    "kind": "scope"},
    "window":             {"label": "Fixed / Operable Window",        "family": "window",         "kind": "scope"},
    "transaction_window": {"label": "Transaction Window",             "family": "window",         "kind": "scope"},
    "br_transaction_window": {"label": "Bullet-Resistant Transaction Window", "family": "window", "kind": "scope"},
    "fire_rated_sf":      {"label": "Fire-Rated Storefront",          "family": "fire_rated",     "kind": "scope"},
    # glass-primary
    "all_glass_wall":     {"label": "All-Glass Wall / Entrance",      "family": "all_glass",      "kind": "scope"},
    "glazing_only":       {"label": "Glazing Only",                   "family": "glazing_only",   "kind": "scope"},
    "fire_rated_glazing": {"label": "Fire-Rated Glazing Only",        "family": "glazing_only",   "kind": "scope"},
    "mirror":             {"label": "Mirror",                         "family": "specialty",      "kind": "scope"},
    "glass_handrail":     {"label": "Glass Handrail",                 "family": "specialty",      "kind": "scope"},
    "translucent_panel":  {"label": "Translucent Panel",              "family": "specialty",      "kind": "scope"},
    "sun_control":        {"label": "Sun Control Device",             "family": "specialty",      "kind": "scope"},
    # doors
    "ext_sf_door":        {"label": "Ext Storefront Door",            "family": "storefront",     "kind": "scope"},
    "int_sf_door":        {"label": "Int Storefront Door",            "family": "storefront",     "kind": "scope"},
    "ext_cw_door":        {"label": "Ext Curtain Wall Door",          "family": "curtain_wall",   "kind": "scope"},
    "int_cw_door":        {"label": "Int Curtain Wall Door",          "family": "curtain_wall",   "kind": "scope"},
    "terrace_door":       {"label": "Terrace Door",                   "family": "curtain_wall",   "kind": "scope"},
    "all_glass_door":     {"label": "All-Glass Door",                 "family": "all_glass",      "kind": "scope"},
    "glazing_only_door":  {"label": "Glazing Only Door (HM/wood lite)", "family": "glazing_only", "kind": "scope"},
    "fire_rated_door":    {"label": "Fire-Rated Aluminum Door / Lite", "family": "fire_rated",    "kind": "scope"},
    "alum_frame_only":    {"label": "Aluminum Door Frame Only",       "family": "storefront",     "kind": "scope"},
    "revolving_door":     {"label": "Revolving Door",                 "family": "pass_thru",      "kind": "pass_thru"},
    "bifold_sliding":     {"label": "Bi-Fold / Sliding Door",         "family": "specialty",      "kind": "scope"},
    "auto_door":          {"label": "Automatic Sliding Door",         "family": "pass_thru",      "kind": "pass_thru"},
    "skylight":           {"label": "Skylight",                       "family": "pass_thru",      "kind": "pass_thru"},
    # implied / accessory scope
    "break_metal":        {"label": "Break Metal Flashing & Trim",    "family": "implied",        "kind": "implied"},
    "floor_line_fire_caulk": {"label": "Floor Line Fire Caulking",    "family": "implied",        "kind": "implied"},
    "wl_dl_clip":         {"label": "Windload / Deadload Clip",       "family": "implied",        "kind": "implied"},
    "ssg_caulk":          {"label": "SSG Caulk Joint",                "family": "implied",        "kind": "implied"},
    "polished_edge":      {"label": "Polished Edge",                  "family": "implied",        "kind": "implied"},
    "hm_lite_count":      {"label": "HM Lite Count",                  "family": "glazing_only",   "kind": "implied"},
    "structural_steel":   {"label": "Structural Steel",               "family": "implied",        "kind": "implied"},
    "glass_film":         {"label": "Glass Film",                     "family": "specialty",      "kind": "scope"},
    # non-scope
    "excluded":           {"label": "Excluded by Binswanger",         "family": "exclusion",      "kind": "exclusion"},
    "qty_label":          {"label": "Qty Text Box (mark + count)",    "family": "note",           "kind": "note"},
    "note":               {"label": "Note / callout",                 "family": "note",           "kind": "note"},
    "measure":            {"label": "Length measurement",             "family": "measure",        "kind": "measure"},
    "ignore":             {"label": "Ignored (not takeoff)",          "family": "ignore",         "kind": "ignore"},
}

# ── Subject → class.  Keys are normalized (lowercase, no dots, single spaces).
# Covers every subject in the tool chest AND every legacy subject in the corpus.
CLASS_OF = {
    "ext sf area": "ext_sf", "ext sf highlight": "ext_sf", "ext sf polylength": "ext_sf",
    "ext sf line": "ext_sf", "sf frames": "ext_sf", "exterior sf": "ext_sf",
    "int sf area": "int_sf", "int sf highlight": "int_sf", "int sf polylength": "int_sf", "int sf line": "int_sf",
    "interior aluminum partition area": "int_alum_partition", "int aluminum partition highlight": "int_alum_partition",
    "interior aluminum partition polylength": "int_alum_partition", "interior aluminum partition line": "int_alum_partition",
    "ext cw area": "ext_cw", "ext cw highlight": "ext_cw", "ext cw polylength": "ext_cw", "ext cw line": "ext_cw",
    "int cw area": "int_cw", "int cw highlight": "int_cw", "int cw polylength": "int_cw",
    # "WW" = WINDOW WALL (Martin, 2026-10-03) — not wet wall
    "ext ww area": "window_wall", "ext ww highlight": "window_wall", "ext ww polylength": "window_wall", "ext ww line": "window_wall",
    "fixed / operable window": "window", "fixed / operable window highlight": "window",
    "operable window polylength": "window", "operable window line": "window",
    "transaction window area": "transaction_window", "transaction window highlight": "transaction_window",
    "transaction window line": "transaction_window",
    "br transaction window area": "br_transaction_window", "br transaction window highlight": "br_transaction_window",
    "fire rated storefront area": "fire_rated_sf", "fire rated sf highlight": "fire_rated_sf",
    "fire rated sf polylength": "fire_rated_sf", "fire rated storefront line": "fire_rated_sf",
    "all glass wall area": "all_glass_wall", "all glass wall highlight": "all_glass_wall",
    "all glass wall polylength": "all_glass_wall", "all glass wall line": "all_glass_wall",
    "glazing only area": "glazing_only", "glazing only highlight": "glazing_only", "glazing only line": "glazing_only",
    "fire rated glazing area": "fire_rated_glazing", "fire rated glazing only highlight": "fire_rated_glazing",
    "mirror area": "mirror", "mirror highlight": "mirror", "mirror polylength": "mirror", "mirror line": "mirror",
    "glass handrail area": "glass_handrail", "handrail highlight": "glass_handrail",
    "glass handrail polylength": "glass_handrail", "glass handrail line": "glass_handrail",
    "translucent panel area": "translucent_panel", "translucent panel highlight": "translucent_panel",
    "translucent panel polylength": "translucent_panel", "translucent panel line": "translucent_panel",
    "sun control device area": "sun_control", "sun control device highlight": "sun_control",
    "sun control device polylength": "sun_control",
    # doors
    "ext sf door": "ext_sf_door", "int sf door": "int_sf_door",
    "ext cw door": "ext_cw_door", "int cw door": "int_cw_door",
    "terrace door": "terrace_door", "terrace door highlight": "terrace_door",
    "all glass door": "all_glass_door", "all glass doors": "all_glass_door",
    "glazing only door": "glazing_only_door", "glazing only door's": "glazing_only_door",
    "fire rated aluminum door": "fire_rated_door", "fire rated door lite's": "fire_rated_door",
    "aluminum door frame only": "alum_frame_only",
    "revolving door": "revolving_door",
    "bi-fold / sliding door": "bifold_sliding", "bi-fold / sliding door highlight": "bifold_sliding",
    "bi-fold / slding door polylength": "bifold_sliding", "bi-fold / sliding door's": "bifold_sliding",
    "automatic sliding door": "auto_door", "auto-sliding door highlight": "auto_door",
    "interior aluminum partition doors": "int_sf_door",
    # implied
    "break metal flashing & trims": "break_metal", "break metal flashing & trim polylength": "break_metal",
    "floor line fire caulking polylength": "floor_line_fire_caulk",
    "wl-dl clip": "wl_dl_clip", "windload - deadload": "wl_dl_clip",
    "ssg caulk count": "ssg_caulk", "polished edge count": "polished_edge",
    "hm lite counts": "hm_lite_count", "structural steel": "structural_steel",
    "glass film highlight": "glass_film", "glass film area": "glass_film", "glass film polylength": "glass_film",
    "skylight highlight": "skylight", "skylight area": "skylight", "skylight count": "skylight",
    # non-scope
    "excluded by binswanger": "excluded",
    "qty text box": "qty_label",
    "text box": "note", "typewritten text": "note", "callout": "note",
    "length measurement": "measure",
    # Martin: General Note + Architect markups are ignored (2026-10-03)
    "general note": "ignore", "architect": "ignore",
    "cloud": "ignore", "cloud+": "ignore", "snapshot": "ignore", "stamp": "ignore", "image": "ignore",
    "legend": "ignore", "rectangle": "ignore", "line": "ignore", "arrow": "ignore",
    "polygon": "ignore", "polyline": "ignore", "highlight": "ignore",
}

# Subjects whose class depends on the fill color (legend-block door circles).
COLOR_CLASSED = {"aluminum stile door"}
COLOR_TO_DOOR_CLASS = {
    "#FF8000": "ext_sf_door", "#008000": "ext_cw_door", "#80FFFF": "all_glass_door",
    "#FFFF00": "bifold_sliding", "#FF0000": "fire_rated_door", "#800040": "glazing_only_door",
}

# Authors whose markups are never ground truth (architect content flattened into annots)
IGNORED_AUTHORS = {"AutoCAD SHX Text"}


def role_of(annot_type: str, subject_norm: str) -> str:
    """Markup role — how the estimator used it, independent of scope."""
    t = annot_type.replace("Annotation", "")
    if subject_norm == "qty text box":
        return "label"
    if t in ("MeasureArea",) or subject_norm.endswith(" area"):
        return "area"
    if t in ("MeasurePolylength", "PolyLine") or "polylength" in subject_norm:
        return "linear"
    if t == "Line" or subject_norm.endswith(" line"):
        return "linear"
    if t == "Circle" or "door" in subject_norm and t != "Polygon":
        return "door"
    if t == "MeasureCount" or "count" in subject_norm or subject_norm in ("wl-dl clip", "windload - deadload"):
        return "count"
    if t in ("FreeText",):
        return "label"
    return "region"


def norm(s: str | None) -> str:
    return " ".join((s or "").replace(".", "").lower().split())


def main() -> None:
    tools = json.loads(TOOLBOX.read_text(encoding="utf-8"))
    subjects: dict[str, dict] = {}
    unmapped = []
    for t in tools:
        subj = t.get("subject")
        if not subj:
            continue
        k = norm(subj)
        if k in subjects:
            continue
        if k in COLOR_CLASSED:
            cls = "color_classed"
        else:
            cls = CLASS_OF.get(k)
        if cls is None:
            unmapped.append(subj)
            cls = "ignore"
        subjects[k] = {
            "subject": subj,
            "class": cls,
            "role": role_of(t["type"], k),
            "annot_type": t["type"],
            "stroke": t.get("stroke_hex") or None,
            "fill": t.get("fill_hex") or None,
            "opacity": float(t["opacity"]) if t.get("opacity") else None,
            "in_toolbox": True,
        }
    # legacy / corpus-only subjects that are not in today's chest
    for k, cls in CLASS_OF.items():
        if k not in subjects:
            subjects[k] = {"subject": k, "class": cls, "role": role_of("", k),
                           "annot_type": None, "stroke": None, "fill": None,
                           "opacity": None, "in_toolbox": False}

    # Role is fixed for non-scope text/measure tools regardless of PDF type
    for s in subjects.values():
        if s["class"] in ("note", "qty_label"):
            s["role"] = "label"
        elif s["class"] == "measure":
            s["role"] = "linear"

    # The color each class is DRAWN in when GlazeBid writes a markup: the
    # Highlight tool's color for that class (falls back to Area, then any).
    draw = {}
    for pref in ("region", "area", "linear", "door", "count"):
        for s in subjects.values():
            if s["in_toolbox"] and s["role"] == pref and s["class"] in CLASSES and s["class"] not in draw:
                draw[s["class"]] = {"subject": s["subject"], "stroke": s["stroke"], "fill": s["fill"]}

    out = {
        "_generated_by": "sidecar/knowledge/build_scope_taxonomy.py",
        "_source_toolbox": "reference/bluebeam/Estimating ToolBox.btx (Revu 21, Martin's Estimating Tool Box)",
        "_notes": [
            "WW = WINDOW WALL (Martin 2026-10-03). Window wall and Break Metal share #008080 — tell them apart by subject, never by color.",
            "General Note and Architect markups are ignored (Martin 2026-10-03).",
            "Pass-thru items (auto sliders, skylights, revolving doors) are their own scope type: carried in our number, done by a hired sub.",
        ],
        "classes": CLASSES,
        "subjects": dict(sorted(subjects.items())),
        "color_classed_subjects": sorted(COLOR_CLASSED),
        "color_to_door_class": COLOR_TO_DOOR_CLASS,
        "draw_style": draw,
        "ignored_authors": sorted(IGNORED_AUTHORS),
        "unmapped_toolbox_subjects": unmapped,
    }
    OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"wrote {OUT}  subjects={len(subjects)}  unmapped={unmapped}")


if __name__ == "__main__":
    main()
