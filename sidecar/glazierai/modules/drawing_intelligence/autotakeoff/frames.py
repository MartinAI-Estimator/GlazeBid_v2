"""
frames.py — auto-takeoff result → Frame Builder payloads (one per frame type).

    out = frame_payloads(result, spec_check=None)
      → { "schema": "glazebid.framePayloads/2",
          "project": ..., "frames": [payload…], "nonFrames": [line…],
          "doorTypes": [...], "jobDefaults": {...}, "summary": {...} }

A payload is the Cowork §4 frame payload (what hydrateFrame() reads) plus what
the drawings told us and where:
    mark, cls, systemType, location, manufacturer, frameSeries, finish, primaryGlass,
    overallWidth, overallHeight, sizeMode ('frame'|'ro'), quantity,
    panelCount, rowCount, mullionsX / mullionsY (member centerlines, inches from
    the frame's left / bottom edge, read off the elevation), bayWidths / rowHeights
    (centerline spans incl. the frame edges), doors [...], hasDoor,
    variants [...], buildable, provenance { field: {source, sheet?, page?, rect?, note?} },
    flaggedFields, needs [{field, reason}], itemId (Studio trace), citations.

DLO conversion is left to hydrateFrame (it knows the system's sightlines).
Deterministic; no model calls.
"""
from __future__ import annotations

import re

from .units import parse_dim
from .elevation_grid import read_grid

SCHEMA = "glazebid.framePayloads/2"

FRAME_CLASSES = {"ext_sf", "int_sf", "ext_cw", "int_cw", "window_wall", "window", "fire_rated_sf",
                 "int_alum_partition", "alum_frame_only"}
DOOR_CLASSES = {"ext_sf_door", "int_sf_door", "ext_cw_door", "int_cw_door", "terrace_door", "fire_rated_door"}
GLASS_ONLY = {"glazing_only", "glazing_only_door", "fire_rated_glazing"}
SYSTEM_TYPE = {"ext_sf": "storefront", "int_sf": "storefront", "fire_rated_sf": "storefront", "int_alum_partition": "storefront",
               "alum_frame_only": "storefront", "ext_cw": "curtainwall", "int_cw": "curtainwall", "window_wall": "window wall",
               "window": "window"}
DEFAULT_SERIES = {  # decision 10: specs / notes first, then these, flagged "assumed"
    "ext_sf": ("Kawneer", "Trifab VG 451T"), "int_sf": ("Kawneer", "Trifab VG 450"), "fire_rated_sf": ("Kawneer", "Trifab VG 450"),
    "ext_cw": ("Kawneer", "1600 Wall System 1 (7-1/2\")"), "int_cw": ("Kawneer", "1600 Wall System 1 (6\")"),
    "int_alum_partition": ("Kawneer", "Trifab VG 450"), "alum_frame_only": ("Kawneer", "Trifab VG 450"),
}

_RO = re.compile(r"\bR\.?\s?O\.?\b|ROUGH\s+OPENING|MASONRY\s+OPENING|\bM\.?\s?O\.?\b", re.I)


def cells_of(desc: str | None) -> dict[str, str]:
    """'KEY: VAL | KEY: VAL || extra' → {KEY: VAL} (schedule row cells)."""
    out: dict[str, str] = {}
    head = (desc or "").split("||")[0]
    for part in head.split(" | "):
        if ":" in part:
            k, v = part.split(":", 1)
            k, v = k.strip().upper(), v.strip()
            if k and v and k not in out:
                out[k] = v
    return out


def _cell(cells: dict, *names: str) -> tuple[str | None, str | None]:
    for k, v in cells.items():
        for n in names:
            if re.fullmatch(n, k):
                return k, v
    return None, None


def _dim(v: str | None) -> float | None:
    if not v:
        return None
    d = parse_dim(v)
    if d is None:   # "6'-0" 6'-0 3/4"" → the first dimension
        m = re.search(r"\d+\s*'\s*-?\s*\d*(?:\s+\d+/\d+)?\s*\"?|\d+(?:\s+\d+/\d+)?\s*\"", v)
        d = parse_dim(m.group(0)) if m else None
    return d


def _sheet_of(citations: list[str], kind: str) -> str | None:
    for c in citations or []:
        if kind in c:
            return c.split()[0]
    return None


def _glass_text(item: dict, cells: dict) -> str | None:
    _, g = _cell(cells, r"GLAZING", r"GLASS(?: TYPE)?", r"GL(?:ASS|AZING)? TYPE")
    if g:
        return g
    m = re.search(r"(1\"|1/4\"|1/2\"|3/8\"|5/16\")\s*(?:CLEAR\s+)?(?:INSUL\w*|IGU|TEMP\w*|CLEAR|LAMINATED|TINTED)[^|;,.]{0,60}",
                  item.get("desc") or "", re.I)
    return m.group(0).strip() if m else None


def _finish_text(cells: dict, desc: str) -> str | None:
    _, f = _cell(cells, r"FINISH(?: \d)?", r"FRAME FINISH")
    if f and not re.search(r"SEE|MATCH|SCHEDULE|PT-\d", f, re.I):
        return f
    m = re.search(r"((?:#\d{2}\s+)?(?:CLEAR|DARK BRONZE|BRONZE|BLACK|CHAMPAGNE)\s+ANODIZ\w*(?:[^|;.]{0,30}CLASS\s+I{1,2})?|KYNAR[^|;.]{0,30}|PVDF[^|;.]{0,30})",
                  desc or "", re.I)
    return m.group(0).strip() if m else None


def _best_elev(item: dict) -> dict | None:
    """The drawn elevation of the type (schedule pictorial / elevation).  Pieces stacked on top
    of each other (one type drawn as two frames) are joined, the joint becoming a horizontal."""
    frs = [f for f in item.get("frames") or [] if f.get("rect")]
    if not frs:
        return None
    if len(frs) > 1:
        xs = [(f["rect"][0], f["rect"][2]) for f in frs]
        lo, hi = max(a for a, _ in xs), min(b for _, b in xs)
        if hi - lo > 0.8 * min(b - a for a, b in xs):          # same columns → stacked
            st = sorted(frs, key=lambda f: f["rect"][1])
            rect = [min(f["rect"][0] for f in st), st[0]["rect"][1], max(f["rect"][2] for f in st), st[-1]["rect"][3]]
            ys = [y for f in st for y in (f.get("mullions_y") or [])] + [st[i]["rect"][3] for i in range(len(st) - 1)]
            return {"rect": rect, "mullions_x": st[0].get("mullions_x") or [], "mullions_y": ys,
                    "w_in": max(f.get("w_in") or 0 for f in st), "h_in": sum(f.get("h_in") or 0 for f in st), "joined": len(st)}
    w, h = item.get("w_in") or 0, item.get("h_in") or 0
    return min(frs, key=lambda f: abs((f.get("w_in") or 0) - w) + abs((f.get("h_in") or 0) - h))


def _members(fr: dict, W: float, H: float) -> tuple[list[float], list[float]]:
    """Mullion / horizontal page positions → inches from the frame's left / bottom edge."""
    x0, y0, x1, y1 = fr["rect"]
    sx = W / max(1e-6, x1 - x0)
    sy = H / max(1e-6, y1 - y0)
    xs = sorted(round((x - x0) * sx, 2) for x in fr.get("mullions_x") or [] if x0 < x < x1)
    ys = sorted(round((y1 - y) * sy, 2) for y in fr.get("mullions_y") or [] if y0 < y < y1)
    return _members_clean(xs, W), _members_clean(ys, H)


MEMBER_FACES_IN = 3.5   # a member's two faces are < 3-1/2" apart; no real lite is that narrow
MIN_LITE_IN = 6.0


def _members_clean(v: list[float], total: float) -> list[float]:
    """Lines → member centerlines: the two faces of one member (drawn as a double line) are
    merged; lines hugging the frame edge (inner face of a jamb / head / sill) are dropped."""
    groups: list[list[float]] = []
    for a in sorted(v):
        if groups and a - groups[-1][-1] < MEMBER_FACES_IN:
            groups[-1].append(a)
        else:
            groups.append([a])
    out = [round((g[0] + g[-1]) / 2, 2) for g in groups]
    out = [a for a in out if MEMBER_FACES_IN <= a <= total - MEMBER_FACES_IN]
    # no lite is narrower than 6": a sliver span is a stray line (jamb receptor, door stop…) — drop it
    while True:
        edges = [0.0] + out + [total]
        spans = [b - a for a, b in zip(edges, edges[1:])]
        i = next((k for k, w in enumerate(spans) if w < MIN_LITE_IN), None)
        if i is None or not out:
            return out
        if i == 0:
            out.pop(0)
        elif i == len(spans) - 1:
            out.pop()
        else:                     # two interior lines close together → one member between them
            out[i - 1] = round((out[i - 1] + out[i]) / 2, 2)
            out.pop(i)


def _cum(spans: list[float]) -> list[float]:
    """CL spans bottom→top → member positions from the bottom edge."""
    out, acc = [], 0.0
    for v in spans[:-1]:
        acc += v
        out.append(round(acc, 2))
    return out


def _best_snap(snaps: list[dict], W: float, H: float) -> dict | None:
    best = None
    for x in snaps:
        if x.get("unsure"):
            continue
        for f in x.get("frames") or []:
            err = abs((f.get("w_in") or 0) - W) + abs((f.get("h_in") or 0) - H)
            if err <= 6 and (best is None or err < best[0]):
                best = (err, {"page": x["page"], "sheet": x.get("sheet"), "rect": f["rect"]})
    return best[1] if best else None


def _spans(pos: list[float], total: float) -> list[float]:
    edges = [0.0] + pos + [total]
    return [round(b - a, 2) for a, b in zip(edges, edges[1:])]


def _series(item: dict, spec_series: dict) -> tuple[str | None, str | None, str]:
    for s in item.get("series") or []:
        if isinstance(s, dict) and (not s.get("scope_class") or s["scope_class"] == item["cls"] or
                                    s["scope_class"].split("_")[-1] == item["cls"].split("_")[-1]):
            return s.get("manufacturer"), s.get("matched") or s.get("series"), "drawing"
    for s in item.get("series") or []:
        if isinstance(s, dict):
            return s.get("manufacturer"), s.get("matched") or s.get("series"), "drawing"
    sp = spec_series.get(item["cls"]) or spec_series.get(item["cls"].split("_")[-1])
    if sp:
        return sp[0], sp[1], "specs"
    d = DEFAULT_SERIES.get(item["cls"])
    if d:
        return d[0], d[1], "assumed"
    return None, None, "assumed"


def _spec_series(spec_check: dict | None) -> dict:
    """class / family → (maker, series) from the spec check cards and drawing notes."""
    out: dict = {}
    for f in (spec_check or {}).get("facts", []):
        if f.get("topic") != "series":
            continue
        v = f.get("values") or {}
        sc = v.get("scope_class")
        if sc and sc not in out:
            out[sc] = (v.get("manufacturer"), v.get("matched") or v.get("series"))
            out.setdefault(sc.split("_")[-1], out[sc])
    return out


def _door_of(item: dict) -> dict:
    cells = cells_of(item.get("desc"))
    _, wv = _cell(cells, r"DOOR OPENING WIDTH", r"WIDTH", r"DOOR WIDTH", r"OPENING WIDTH")
    _, hv = _cell(cells, r"DOOR OPENING HEIGHT", r"HEIGHT", r"DOOR HEIGHT", r"OPENING HEIGHT")
    w = _dim(wv) or item.get("w_in")
    h = _dim(hv) or item.get("h_in")
    _, hw = _cell(cells, r"HARDWARE(?: SET)?", r"HW(?: SET)?", r"HDWR(?: SET)?", r"HARDWARE GROUP")
    _, ft = _cell(cells, r"FRAME TYPE(?: \(PLAN TAG\))?", r"FRAME", r"TYPE MATERIAL 2")
    _, dt = _cell(cells, r"DOOR TYPE(?: \(PLAN TAG\))?", r"TYPE MATERIAL")
    remarks = " ".join(v for k, v in cells.items() if k.startswith(("REMARK", "NOTE", "KEYED")))
    pair = bool(item.get("pair")) or bool(w and w >= 60) or bool(re.search(r"\bPAIR\b|\bPR\b|DOUBLE", remarks + " " + (dt or ""), re.I))
    stile = (item.get("stile") or "").lower()
    stile = "wide" if "WIDE" in (item.get("desc") or "").upper() and not stile else stile
    return {
        "mark": item["id"], "itemId": item["id"], "cls": item["cls"],
        "kind": "pair" if pair else "single",
        "width": w, "height": h,
        "stile": "narrow" if "narrow" in stile else "wide" if "wide" in stile else "medium" if "medium" in stile else None,
        "hardware": hw or (", ".join(item.get("hardware") or []) or None),
        "panic": bool(re.search(r"PANIC|EXIT DEVICE", remarks + " " + (item.get("desc") or ""), re.I)),
        "frameType": (ft or "").strip() or None,
        "doorType": (dt or "").split()[0] if dt else None,
        "existingFrame": bool(ft and re.fullmatch(r"EX\.?|EXIST\w*|\(E\)", ft.strip(), re.I)),
        "quantity": item.get("qty") or 1,
        "glass": _glass_text(item, cells),
        "flags": list(item.get("flags") or []),
    }


def _norm_mark(s: str | None) -> str:
    s = re.sub(r"^(?:FRAME|DOOR|STOREFRONT|WINDOW)\s+TYPE\s*", "", (s or "").upper().strip())
    return re.sub(r"[\s\-.]", "", s)


def frame_payloads(result: dict, spec_check: dict | None = None, pdf_path: str | None = None) -> dict:
    items = [i for i in result.get("items", []) if i.get("kind") in ("scope", "pass_thru")]
    spec_series = _spec_series(spec_check)
    sheets = {s["page"]: s for s in result.get("sheets", [])}
    entries = {}
    for e in result.get("schedule_entries", []):
        entries.setdefault(e.get("mark"), e)
    sheets["_entries"] = entries
    snaps: dict = {}
    for x in result.get("elevation_snaps", []):
        snaps.setdefault(x.get("mark"), []).append(x)
    sheets["_snaps"] = snaps
    doc = None
    if pdf_path:
        import pymupdf as _fitz
        from .pdfgeom import clear_cache
        clear_cache()            # the page caches are keyed by document identity — never reuse another doc's
        doc = _fitz.open(pdf_path)
    sheets["_doc"] = doc

    door_type_items = [i for i in items if re.match(r"DOOR TYPE\b", i["id"], re.I)]
    door_type_ids = {i["id"] for i in door_type_items}
    # elevation / sheet notes ("A3.1 note 6: ALUM. STOREFRONT…") say where storefront is, not a frame type
    note_items = [i for i in items if i["cls"] in FRAME_CLASSES and re.search(r"\b(?:note|legend)\b", i["id"], re.I) and not i.get("w_in")]
    note_ids = {i["id"] for i in note_items}
    frame_items = [i for i in items if i["cls"] in FRAME_CLASSES and i["id"] not in door_type_ids and i["id"] not in note_ids]
    door_items = [i for i in items if i["cls"] in DOOR_CLASSES or (i.get("is_door") and i["cls"] not in GLASS_ONLY)]

    # frame type code → frame item (its own id, or the FRAME TYPE cell on its schedule row)
    by_code: dict[str, dict] = {}
    for it in frame_items:
        by_code.setdefault(_norm_mark(it["id"]), it)
        _, ft = _cell(cells_of(it.get("desc")), r"FRAME TYPE(?: \(PLAN TAG\))?")
        if ft:
            by_code.setdefault(_norm_mark(ft), it)

    doors_on: dict[str, list[dict]] = {}
    standalone: list[dict] = []
    existing: list[dict] = []
    for di in door_items:
        d = _door_of(di)
        host = by_code.get(_norm_mark(d["frameType"])) if d["frameType"] and d["frameType"] not in ("--", "-") else None
        if host:
            doors_on.setdefault(host["id"], []).append(d)
        elif d["existingFrame"]:
            existing.append(d)
        else:
            standalone.append(d)

    frames: list[dict] = []
    seen_ids: set = set()
    for it in frame_items:
        if it["id"] in seen_ids:
            continue
        seen_ids.add(it["id"])
        frames.append(_payload(it, doors_on.get(it["id"], []), spec_series, sheets))
    for d in standalone:
        frames.append(_door_frame(d, spec_series))

    non_frames = _non_frames(items, frame_items, door_items, door_type_ids | note_ids)
    seen_notes = set()
    for i in note_items:
        key = (i["id"], (i.get("desc") or "")[:80])
        if key in seen_notes:
            continue
        seen_notes.add(key)
        non_frames.append({"itemId": i["id"], "cls": i["cls"], "kind": "note",
                           "description": (i.get("desc") or i["id"])[:300], "quantity": None, "unit": "",
                           "flags": ["a note on the drawings, not a frame type — the frames it points at should be tagged; check nothing is missed"],
                           "citations": i.get("citations") or []})
    for d in existing:
        non_frames.append({"itemId": d["itemId"], "cls": d["cls"], "kind": "door", "description":
                           f"Door {d['mark']} in an existing frame — {d['kind']} {(_fmt(d['width']) or '?')} x {(_fmt(d['height']) or '?')}",
                           "quantity": d["quantity"], "unit": "EA", "door": d, "flags": ["existing frame — door only"]})

    door_types = [{"mark": i["id"], "itemId": i["id"], "desc": (i.get("desc") or "")[:300], "glass": _glass_text(i, cells_of(i.get("desc"))),
                   "w_in": i.get("w_in"), "h_in": i.get("h_in")} for i in door_type_items]

    out = {
        "schema": SCHEMA,
        "project": result.get("project"),
        "frames": frames,
        "nonFrames": non_frames,
        "doorTypes": door_types,
        "jobDefaults": job_defaults(spec_check),
        "gridRead": doc is not None,
        "summary": {
            "frames": len(frames),
            "buildable": sum(1 for f in frames if f["buildable"]),
            "needsInput": sum(1 for f in frames if f["needs"]),
            "doorsInFrames": sum(len(v) for v in doors_on.values()),
            "standaloneDoors": len(standalone), "existingFrameDoors": len(existing),
            "nonFrames": len(non_frames),
        },
    }
    if doc is not None:
        from .pdfgeom import clear_cache
        clear_cache()
        doc.close()
    return out


def _fmt(v):
    if not v:
        return None
    ft, inch = divmod(round(v * 16) / 16, 12)
    return f"{int(ft)}'-{inch:g}\""


def _payload(it: dict, doors: list[dict], spec_series: dict, sheets: dict) -> dict:
    cells = cells_of(it.get("desc"))
    cit = it.get("citations") or []
    prov: dict = {}
    needs: list[dict] = []

    def need(field, reason):
        needs.append({"field": field, "reason": reason})

    W, H = it.get("w_in"), it.get("h_in")
    size_note = next((n for n in it.get("notes") or [] if n.startswith("size from")), None)
    sched = _sheet_of(cit, "schedule")
    if W and H:
        src = "elevation" if size_note and "elevation" in size_note else "dimension" if size_note and "dimension" in size_note else "schedule" if sched else "elevation"
        prov["size"] = {"source": src, "sheet": sched if src == "schedule" else None, "note": size_note}
    else:
        need("size", "No size on the schedule or elevation — measure it in Studio or enter it.")

    # size mode (decision 14)
    ro_hit = any(_RO.search(k) or _RO.search(v) for k, v in cells.items() if re.search(r"SIZE|WIDTH|HEIGHT|OPENING", k))
    size_mode = "ro" if ro_hit else "frame"
    if W and H:
        if ro_hit:
            prov["sizeMode"] = {"source": "schedule", "note": "schedule says R.O. / M.O."}
        else:
            prov["sizeMode"] = {"source": "assumed", "note": "assumed frame size (no R.O. label)"}

    # system (decision 10)
    maker, series, ssrc = _series(it, spec_series)
    prov["system"] = {"source": ssrc}
    if ssrc == "assumed":
        need("system", f"No series on the drawings or specs — assumed {maker} {series}.")

    # bays / rows from the elevation: the grid reader on the PDF when we have it, else the
    # engine's mullion lines
    fr = _best_elev(it)
    mx, my = ([], [])
    grid = None
    ent = sheets["_entries"].get(it["id"]) or {}
    src_page, src_rect, src_sheet = None, None, None
    if fr and W and H:
        src_page, src_rect, src_sheet = ent.get("page"), fr.get("rect"), ent.get("sheet") or _sheet_of(cit, "schedule")
    elif W and H:
        snap = _best_snap(sheets.get("_snaps", {}).get(it["id"]) or [], W, H)
        if snap:
            src_page, src_rect, src_sheet = snap["page"], snap["rect"], snap["sheet"]
    doc = sheets.get("_doc")
    if doc is not None and src_rect is not None and src_page is not None:
        try:
            grid = read_grid(doc[src_page], src_rect, W, H)
        except Exception as e:     # a bad drawing never stops the payload
            grid = None
            needs.append({"field": "bays", "reason": f"Elevation could not be read ({e})."})
    if grid and grid["columns"]:
        mx = grid["mullionsX"]
        my = [] if grid["rowsShared"] is None else _cum(grid["rowsShared"])
        prov["bays"] = {"source": "elevation", "page": src_page, "sheet": src_sheet, "rect": src_rect,
                        "note": "bays, rows and door bays read off the elevation — confirm DLOs"
                        + (f"; {'; '.join(grid['notes'])}" if grid["notes"] else "")}
        bays, rows = len(grid["columns"]), max(len(c["rows"]) for c in grid["columns"])
    elif fr and W and H:
        mx, my = _members(fr, W, H)
        prov["bays"] = {"source": "elevation", "page": src_page, "sheet": src_sheet, "rect": src_rect,
                        "note": "member positions read off the type elevation — confirm DLOs"
                        + (f" ({fr['joined']} pieces joined)" if fr.get("joined") else "")}
        bays, rows = len(mx) + 1, len(my) + 1
    else:
        bays, rows = it.get("bays") or None, it.get("rows") or None
        need("bays", "No elevation matched — bays / rows not read.")

    # door bays from the elevation ↔ the doors the schedule ties to this frame type
    columns = None
    if grid and grid["columns"]:
        columns = [{"widthCL": c["width"], "kind": c["kind"], "rows": c["rows"], "horizontalsAt": c["horizontalsAt"],
                    "doorHeight": c["doorHeight"], "leaves": c["leaves"], "why": c["why"]} for c in grid["columns"]]
        door_cols = [i for i, c in enumerate(columns) if c["kind"] == "door"]
        # the schedule says this frame type has a door the drawing didn't make obvious: take the
        # bay that can hold one (door width, nothing across it below head height)
        if len(doors) > len(door_cols):
            cands = [i for i, c in enumerate(columns) if c["kind"] == "glass" and 28 <= c["widthCL"] <= 84
                     and (not c["horizontalsAt"] or min(c["horizontalsAt"]) >= 78)]
            for d in doors[len(door_cols):]:
                if not cands:
                    break
                want = d.get("width")
                ci = min(cands, key=lambda i: abs(columns[i]["widthCL"] - want)) if want else max(cands, key=lambda i: columns[i]["widthCL"])
                cands.remove(ci)
                columns[ci].update(kind="door", leaves=2 if (d.get("kind") == "pair" or columns[ci]["widthCL"] >= 60) else 1,
                                   doorHeight=columns[ci]["horizontalsAt"][0] if columns[ci]["horizontalsAt"] else None,
                                   why="the schedule puts a door in this frame; bay picked by size — confirm")
            door_cols = sorted(i for i, c in enumerate(columns) if c["kind"] == "door")
        for k, ci in enumerate(door_cols):
            if k < len(doors):
                columns[ci]["door"] = doors[k]["mark"]
        if door_cols and not doors:
            need("doors", f"{len(door_cols)} door bay(s) read on the elevation but no door on the schedule names this frame type — which doors are they?")
        if len(doors) > len(door_cols):
            need("doors", f"{len(doors)} door(s) name this frame type but {len(door_cols)} door bay(s) were read — place the rest.")

    qty = it.get("qty") or 1
    prov["quantity"] = {"source": "plan" if "plan" in (it.get("qty_source") or "") else "schedule", "note": it.get("qty_source")}

    glass = _glass_text(it, cells)
    finish = _finish_text(cells, it.get("desc") or "")
    if glass:
        prov["glass"] = {"source": "schedule" if any(k.startswith("GLAZ") or k.startswith("GLASS") for k in cells) else "drawing"}
    if finish:
        prov["finish"] = {"source": "schedule" if "FINISH" in " ".join(cells) else "drawing"}

    # doors tied to this frame (decision 9)
    for d in doors:
        if not d["width"]:
            need("doors", f"Door {d['mark']} has no opening width — set it in the door bay.")

    # variants: elevations of this type drawn at a different size (decision 2)
    variants = []
    for f in it.get("frames") or []:
        fw, fh = f.get("w_in"), f.get("h_in")
        if W and H and fw and fh and (abs(fw - W) > 2 or abs(fh - H) > 2):
            pg = f.get("page")
            variants.append({"overallWidth": fw, "overallHeight": fh, "page": pg, "rect": f.get("rect"),
                             "sheet": (sheets.get(pg) or {}).get("sheet") if pg is not None else None,
                             "note": "elevation drawn at a different size — make a variant if it is a different opening"})

    flags = list(it.get("flags") or [])
    for f in flags:
        needs.append({"field": "drawing", "reason": f})

    return {
        "mark": it["id"], "itemId": it["id"], "cls": it["cls"], "systemType": SYSTEM_TYPE.get(it["cls"], "storefront"),
        "location": it.get("location"),
        "manufacturer": maker, "frameSeries": series,
        "finish": finish, "primaryGlass": glass,
        "overallWidth": W, "overallHeight": H, "sizeMode": size_mode,
        "quantity": qty,
        "panelCount": bays, "rowCount": rows,
        "mullionsX": mx, "mullionsY": my, "columns": columns,
        "bayWidths": _spans(mx, W) if fr and W else None,
        "rowHeights": _spans(my, H) if fr and H else None,
        "sillAFF": None,
        "hasDoor": bool(doors) or bool(columns and any(c["kind"] == "door" for c in columns)), "doors": doors,
        "doorBays": [i for i, c in enumerate(columns or []) if c["kind"] == "door"],
        "variants": variants,
        "buildable": bool(W and H),
        "provenance": prov,
        "needs": needs,
        "flaggedFields": sorted({n["field"] for n in needs}),
        "notes": "; ".join(n for n in (it.get("notes") or []) if not n.startswith("size from"))[:600],
        "description": (it.get("desc") or "")[:400],
        "citations": cit,
        "confidence": (grid or {}).get("confidence") or (0.8 if (W and H and fr) else 0.6 if (W and H) else 0.3),
    }


def _door_frame(d: dict, spec_series: dict) -> dict:
    """A door in no frame type → its own door frame (single door bay)."""
    cls = {"ext_sf_door": "ext_sf", "int_sf_door": "int_sf", "ext_cw_door": "ext_cw", "int_cw_door": "int_cw"}.get(d["cls"], "ext_sf")
    maker, series, ssrc = _series({"cls": cls, "series": []}, spec_series)
    needs = [{"field": "size", "reason": "Door frame: frame size = door opening + jambs and header — confirm the frame size and any transom."}]
    if d["width"] and d["width"] > 96:
        needs.append({"field": "doors", "reason": f"Opening {_fmt(d['width'])} is wider than a pair of doors — likely a storefront with door bay(s); set the bays."})
    if not d["width"]:
        needs.append({"field": "doors", "reason": f"Door {d['mark']} has no opening width."})
    if ssrc == "assumed":
        needs.append({"field": "system", "reason": f"No series on the drawings or specs — assumed {maker} {series}."})
    for f in d["flags"]:
        needs.append({"field": "drawing", "reason": f})
    return {
        "mark": d["mark"], "itemId": d["itemId"], "cls": cls, "systemType": SYSTEM_TYPE.get(cls, "storefront"),
        "location": "exterior" if cls.startswith("ext") else "interior",
        "manufacturer": maker, "frameSeries": series, "finish": None, "primaryGlass": d["glass"],
        "overallWidth": d["width"], "overallHeight": d["height"], "sizeMode": "door_opening",
        "quantity": d["quantity"], "panelCount": 1, "rowCount": 1, "mullionsX": [], "mullionsY": [], "columns": None,
        "bayWidths": None, "rowHeights": None, "sillAFF": 0,
        "hasDoor": True, "doors": [d], "doorBays": [0], "variants": [],
        "standaloneDoor": True, "buildable": bool(d["width"] and d["height"]),
        "provenance": {"size": {"source": "schedule", "note": "door opening"}, "system": {"source": ssrc}},
        "needs": needs, "flaggedFields": sorted({n["field"] for n in needs}),
        "notes": "", "description": "", "citations": [], "confidence": 0.6,
    }


def _non_frames(items, frame_items, door_items, door_type_ids) -> list[dict]:
    used = {i["id"] for i in frame_items} | {i["id"] for i in door_items} | door_type_ids
    out = []
    for i in items:
        if i["id"] in used:
            continue
        cls = i["cls"]
        q = i.get("qty")
        src = (i.get("qty_source") or "").lower()
        unit = "LF" if "lf" in src or cls == "break_metal" else "SF" if "(sf)" in src else "EA"
        kind = "brake_metal" if cls == "break_metal" else "glass" if cls in GLASS_ONLY else "line"
        line = {"itemId": i["id"], "cls": cls, "kind": kind, "description": (i.get("desc") or i.get("label") or i["id"])[:300],
                "quantity": q, "unit": unit, "w_in": i.get("w_in"), "h_in": i.get("h_in"), "sf_total": i.get("sf_total"),
                "alternate": i.get("alternate"), "flags": list(i.get("flags") or []), "citations": i.get("citations") or [],
                "passThru": i.get("kind") == "pass_thru"}
        if kind == "glass":
            line["glass"] = _glass_text(i, cells_of(i.get("desc")))
        out.append(line)
    return out


def job_defaults(spec_check: dict | None) -> dict:
    """Finish and glass types for the job from the spec check (decision 12)."""
    if not spec_check:
        return {"finish": None, "glassTypes": [], "source": None}
    finish = None
    for c in spec_check.get("cards", []):
        for f in c.get("finish") or []:
            m = re.search(r"((?:#\d{2}\s+)?(?:clear|dark bronze|bronze|black|champagne)\s+anodi\w*(?:[^.;]{0,40}class\s+i{1,2})?|"
                          r"(?:kynar|pvdf|fluoropolymer)[^.;]{0,40})", f, re.I)
            if m:
                finish = {"value": m.group(1).strip(), "section": c["section"], "page": c.get("page"), "text": f[:200]}
                break
        if finish:
            break
    glass = []
    seen = set()
    for c in spec_check.get("cards", []):
        for g in c.get("glass") or []:
            desc = re.sub(r"^[A-Z0-9]{1,3}\.\s+", "", g).strip()
            key = desc[:60].lower()
            if key in seen or len(desc) < 12:
                continue
            seen.add(key)
            glass.append({"description": desc[:200], "section": c["section"], "page": c.get("page"),
                          "insulating": bool(re.search(r"insul|igu", desc, re.I)),
                          "tempered": bool(re.search(r"temper", desc, re.I)),
                          "exterior": bool(re.search(r"exterior", desc, re.I)),
                          "interior": bool(re.search(r"interior", desc, re.I))})
    return {"finish": finish, "glassTypes": glass[:8], "source": spec_check.get("source")}
