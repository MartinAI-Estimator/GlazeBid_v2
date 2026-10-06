"""
pipeline.py — the deterministic auto-takeoff.

    result = run_autotakeoff(pdf_path, project_name="")   -> dict (JSON-safe)

Order (Martin's): sheet index → schedules → legends on every legend/schedule/
elevation sheet → floor-plan tag census (the count) → elevation snap (W×H,
bays/rows) → details by keyword → classification → ledger + markups + flags.

Every item carries: mark, class, Bluebeam subject, W/H in inches, bays/rows,
qty (plan count; schedule when no plan), sf, flags with reasons, and the
markups (sheet, page, rect, subject, role, text) that cite it.  No model
calls anywhere in this module.
"""
from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass, field, asdict

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

from .sheet_index import build_index, SheetInfo
from .schedules import read_schedule_sheet, ScheduleEntry
from .legend import legend_rows, legend_classes, LegendRow
from .plans import plan_census, merge_counts, PlanCensus
from .elevations import snap_elevation, sched_sizes, ElevSnap
from .details import find_details, Detail
from .classify import classify, detail_keywords, class_kind, Classification
from .subjects import subject_for, FLAG, EXCLUDED
from .units import fmt_in, sf as sqft, page_ppf
from .pdfgeom import clear_cache, text_lines, segments

logger = logging.getLogger(__name__)

READ_ORDER = ("schedule", "legend", "plan", "elevation", "enlarged", "section", "detail")
DEFAULT_PPF = {"schedule": 18.0, "plan": 9.0, "elevation": 9.0, "enlarged": 18.0, "section": 18.0, "detail": 72.0}


@dataclass
class Markup:
    item: str
    sheet: str
    page: int
    subject: str
    role: str                 # region | area | linear | door | count | label | flag
    rect: list | None = None
    points: list | None = None
    text: str = ""
    stroke: str = ""
    fill: str = ""
    opacity: float | None = None
    dashed: bool = False
    note: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Item:
    id: str
    cls: str
    kind: str
    label: str
    desc: str = ""
    location: str | None = None
    w_in: float | None = None
    h_in: float | None = None
    frames: list = field(default_factory=list)
    bays: int | None = None
    rows: int | None = None
    qty: int | None = None
    qty_source: str = ""
    sf_each: float | None = None
    sf_total: float | None = None
    series: list = field(default_factory=list)
    hardware: list = field(default_factory=list)
    implied: list = field(default_factory=list)
    flags: list = field(default_factory=list)
    notes: list = field(default_factory=list)
    citations: list = field(default_factory=list)   # "A3.2 type 1", "A1.2 tag ×1", "A2.0 elev snapped"
    pair: bool = False
    stile: str | None = None
    is_door: bool = False
    source: str = "schedule"      # schedule | legend | note | detail
    allglass: dict | None = None  # frameless measures (panels, joints, edges, doors, film)

    def to_dict(self) -> dict:
        return asdict(self)


def _is_door(e: ScheduleEntry) -> bool:
    """A tabular row is a door when its table is a door schedule: title or a column says DOOR."""
    if e.layout != "tabular":
        return False
    if "DOOR" in (e.table or "").upper():
        return True
    return any(k.upper().startswith("DOOR") for k in e.cells)


def _loc_hint(sheet: SheetInfo) -> str | None:
    t = sheet.title.upper()
    if "EXTERIOR" in t:
        return "exterior"
    if "INTERIOR" in t:
        return "interior"
    return None


def run_autotakeoff(pdf_path: str, project_name: str = "", sheets_limit: list[str] | None = None) -> dict:
    t0 = time.time()
    clear_cache()
    doc = fitz.open(pdf_path)
    index = build_index(doc)
    arch = [s for s in index if s.discipline.upper().startswith(("A", "G", "I")) and s.category != "cover"]
    if sheets_limit:
        arch = [s for s in arch if s.sheet in sheets_limit]
    by_cat: dict[str, list[SheetInfo]] = {}
    for s in arch:
        for c in s.categories:
            # a sheet with no title anywhere is read by every reader that can't double-count
            for cc in (("schedule", "elevation", "detail") if c == "unknown" else (c,)):
                if s not in by_cat.setdefault(cc, []):
                    by_cat[cc].append(s)

    out: dict = {"project": project_name, "pdf": pdf_path, "pages": len(doc),
                 "sheets": [s.to_dict() for s in index], "read": [], "skipped": []}

    # ── 1. schedules ────────────────────────────────────────────────────────
    entries: list[ScheduleEntry] = []
    for s in by_cat.get("schedule", []):
        es = read_schedule_sheet(doc[s.page], s.sheet, DEFAULT_PPF["schedule"])
        entries += es
        out["read"].append({"sheet": s.sheet, "page": s.page, "step": "schedule", "items": len(es)})
    # elevation sheets sometimes carry the pictorial schedule (storefront types)
    for s in by_cat.get("elevation", []):
        if s in by_cat.get("schedule", []):
            continue
        from .classify import is_glazing_text
        es = [e for e in read_schedule_sheet(doc[s.page], s.sheet, DEFAULT_PPF["schedule"])
              if (e.frames or e.layout == "tabular") and is_glazing_text(e.desc)]
        if es:
            entries += es
            out["read"].append({"sheet": s.sheet, "page": s.page, "step": "schedule(on elevation sheet)", "items": len(es)})
    # one entry per mark: when two schedule sheets carry the same mark, keep the
    # one with a drawing / size; the other is a stray (detail bubble, enlarged plan)
    best: dict[str, ScheduleEntry] = {}
    _rank = {"tabular": 0, "pictorial": 1, "captioned": 2}
    for e in entries:
        cur = best.get(e.mark)
        if cur is None:
            best[e.mark] = e
            continue
        has = lambda x: bool(x.frames or x.w_in)
        # a real schedule (table / pictorial type) beats a captioned label of the same mark;
        # otherwise the one with a drawing / size wins
        if (_rank.get(e.layout, 3), not has(e)) < (_rank.get(cur.layout, 3), not has(cur)):
            best[e.mark] = e
    entries = list(best.values())
    # a pictorial "type" with neither a drawing nor a size is not an opening we can carry
    dropped = [e for e in entries if e.layout == "pictorial" and not e.frames and not e.w_in]
    entries = [e for e in entries if e not in dropped]
    out["skipped_entries"] = [{"sheet": e.sheet, "mark": e.mark, "text": e.desc[:80]} for e in dropped]
    marks = {e.mark for e in entries}
    sched, alias = sched_sizes(entries)
    sched_marks = set(sched.keys()) | marks

    # ── 2. legends / notes on every legend, schedule, elevation and plan sheet ──
    rows: list[LegendRow] = []
    seen_rows: set[tuple] = set()
    for cat in ("legend", "schedule", "elevation", "plan"):
        for s in by_cat.get(cat, []):
            for r in legend_rows(doc[s.page], s.sheet):
                k = (r.page, r.code, round(r.rect[1] / 5))
                if k in seen_rows:
                    continue
                seen_rows.add(k)
                rows.append(r)
    # drop legend "rows" that are really schedule-table cells
    table_rects = [(e.page, fitz.Rect(e.label_rect)) for e in entries if e.layout == "tabular" and e.label_rect]
    rows = [r for r in rows if not any(p == r.page and R.intersects(fitz.Rect(r.rect)) and R.width > 300 for p, R in table_rects)]
    lclasses = legend_classes(rows)
    out["read"].append({"step": "legend", "rows": len(rows), "codes": sorted(lclasses.keys())})

    # ── 3. plan census (the count) ──────────────────────────────────────────
    censuses: list[PlanCensus] = []
    plan_sheets = by_cat.get("plan", [])
    # Each schedule FAMILY (a table, or a pictorial sheet) uses one callout symbol
    # on the plans: door marks in pills, window marks in rectangles, etc.  The
    # family's symbol is the kind that matches the most distinct marks on any plan.
    from .elevations import mark_kind
    from collections import Counter
    families: dict[str, set] = {}
    for e in entries:
        fam = f"{e.sheet}|{e.layout}|{e.table}"
        families.setdefault(fam, set()).add(e.mark)
    fam_kind: dict[str, str | None] = {}
    for fam, fmarks in families.items():
        cnt: Counter = Counter()
        for s in plan_sheets:
            k = mark_kind(doc[s.page], fmarks, alias)
            if k:
                pc0 = plan_census(doc[s.page], s.sheet, fmarks, alias, kind=k)
                cnt[k] += len(pc0.counts)
        fam_kind[fam] = cnt.most_common(1)[0][0] if cnt else None
    out["mark_symbol"] = {fam: k for fam, k in fam_kind.items()}
    for s in plan_sheets:
        merged = PlanCensus(s.sheet, s.page, None)
        for fam, fmarks in families.items():
            if not fam_kind[fam]:
                continue
            pc = plan_census(doc[s.page], s.sheet, fmarks, alias, kind=fam_kind[fam])
            for m, n in pc.counts.items():
                merged.counts[m] = merged.counts.get(m, 0) + n
                merged.tags.setdefault(m, []).extend(pc.tags.get(m, []))
            for m, n in pc.unmatched.items():
                if m not in sched_marks:
                    merged.unmatched[m] = max(merged.unmatched.get(m, 0), n)
            merged.kind = fam_kind[fam] if merged.kind is None else merged.kind
        censuses.append(merged)
        out["read"].append({"sheet": s.sheet, "page": s.page, "step": "plan", "kind": merged.kind,
                            "tags": sum(merged.counts.values()), "unmatched": merged.unmatched})
    plan_counts = merge_counts(censuses, {s.sheet: s.title for s in index})

    # ── 3a. compound door tags: "A103 / A | 11 | 15" → door type, frame type, hardware ──
    # Some architects tie a door to a glazed frame type only through the plan tag.
    from .door_tags import tag_cells, cell_roles
    door_marks_tab = {e.mark for e in entries if e.layout == "tabular" and _is_door(e)}
    plan_cells: dict[str, list[str]] = {}
    for pc in censuses:
        for m, tgs in pc.tags.items():
            if m in door_marks_tab and m not in plan_cells:
                for tg in tgs:
                    cl = tag_cells(doc[pc.page], tg)
                    if cl:
                        plan_cells[m] = cl
                        break
    frame_words: dict[str, str] = {}
    for e in entries:
        mu = e.mark.upper()
        if mu.startswith("FRAME TYPE "):
            frame_words[mu.split()[-1]] = " ".join(e.text) if e.layout != "tabular" else e.desc
    door_type_marks = {e.mark.upper().split()[-1] for e in entries if e.mark.upper().startswith("DOOR TYPE ")}

    # ── 3b. classify schedule entries (needed to decide what to snap) ──────
    sheet_of = {s.page: s for s in index}

    def legend_for(text: str):
        for code, lc in lclasses.items():
            if re.search(r"(?<![A-Z0-9])" + re.escape(code) + r"(?![A-Z0-9])", text, re.I):
                return code, lc["cls"]
        return None, None

    cls_of: dict[int, Classification] = {}
    from .schedules import type_drawings
    from .door_types import read_type_drawings, read_code_tables, describe_row
    tdraw: dict[int, dict] = {}
    # type drawings (door / frame types) and code tables (panel material, keyed notes …)
    type_info: dict = {}
    code_tabs: dict = {}
    hm_frames = False
    # every detail title in the set, for schedule cells like "6/A3.8"
    detail_titles: dict = {}
    _dsheets = []
    for cat in ("detail", "section", "enlarged", "elevation", "schedule"):
        for s in by_cat.get(cat, []):
            if s not in _dsheets:
                _dsheets.append(s)
    _all_details: dict = {}
    for s in _dsheets:
        ds = find_details(doc[s.page], s.sheet, detail_keywords())
        _all_details[s.page] = ds
        for d in ds:
            if d.num and d.num != "?":
                t = d.title
                # when the title names no system, carry the detail's own keywords ("…VESTIBULE INT. [STOREFRONT]")
                if not re.search(r"\bSF\b|STOREFRONT|CURTAIN|\bCW\b|\bHM\b|HOLLOW METAL|OVERHEAD|COILING|WOOD", t, re.I):
                    kws = sorted({h["kw"] for h in d.hits if h["kw"] in ("STOREFRONT", "STORE FRONT", "CURTAIN WALL", "CURTAINWALL")})
                    if kws:
                        t = f"{t} [{', '.join(kws)}]"
                detail_titles.setdefault((d.num, s.sheet.replace("-", "").upper()), t)
    out["detail_titles"] = {f"{k[0]}/{k[1]}": v for k, v in detail_titles.items()}
    if any(e.layout == "tabular" for e in entries):
        for s in index:
            if s.discipline.upper().startswith(("A", "I")) and ("TYPE" in s.title.upper() or "schedule" in s.categories):
                ti = read_type_drawings(doc[s.page], s.sheet)
                for k, v in ti.items():
                    type_info.setdefault(k, v)
                hm_frames = hm_frames or any("HOLLOW METAL FRAME" in v.section for v in ti.values())
                for k, v in read_code_tables(doc[s.page]).items():
                    code_tabs.setdefault(k, v)
        out["type_drawings"] = {k: v.to_dict() for k, v in type_info.items()}
        out["code_tables"] = code_tabs
    # interior job = no exterior elevations anywhere (titles like "EXTERIOR ELEVATIONS" or
    # compass elevations "NORTHWEST ELEVATION", "SOUTH ELEVATION", "BUILDING ELEVATIONS")
    _ext = re.compile(r"EXTERIOR|(NORTH|SOUTH|EAST|WEST)\w*\s+ELEVATION|BUILDING ELEVATION", re.I)
    job_interior = not any(_ext.search(s.title) for s in index)
    tag_roles: dict[int, str] = {}
    if plan_cells and frame_words:
        tag_roles = cell_roles(plan_cells, set(frame_words), door_type_marks | set(type_info), set())
        out["read"].append({"step": "door tag cells", "tags": len(plan_cells), "roles": {str(k): v for k, v in tag_roles.items()}})
    from .classify import rules as _rules
    fire_cols = [c.upper() for c in _rules().get("fire_rating_columns", [])]
    for e in entries:
        s = sheet_of[e.page]
        txt = e.desc if e.layout == "tabular" else " ".join(e.text)
        is_door = _is_door(e)
        if e.layout == "tabular" and is_door and e.mark in plan_cells and tag_roles:
            cl = plan_cells[e.mark]
            have = " ".join(e.cells).upper()
            for i, role in tag_roles.items():
                if i < len(cl) and role in ("frame", "door"):
                    col = "FRAME TYPE (PLAN TAG)" if role == "frame" else "DOOR TYPE (PLAN TAG)"
                    if (role == "frame" and "FRAME" in have) or (role == "door" and re.search(r"\bTYPE\b", have) and "FRAME" not in have):
                        continue
                    e.cells[col] = cl[i]
            txt = e.desc
        if e.layout == "tabular" and (type_info or code_tabs or detail_titles or frame_words):
            extra = describe_row(e.cells, type_info, code_tabs, hm_frame_codes=hm_frames, detail_titles=detail_titles,
                                 frame_words=frame_words)
            if extra:
                e.extra = extra
                txt = e.desc
        code, lcls = legend_for(txt)
        hint = _loc_hint(s) or ("interior" if job_interior and _rules()["location"].get("default_interior_when_no_exterior_sheets") else None)
        c = classify(txt, location=hint, legend_class=lcls, is_door=is_door, legend_code=code)
        if hint == "interior" and not _loc_hint(s):
            c.notes.append("interior assumed: no exterior sheets in this set")
        # fire rating column on a glass-only door → fire-rated glazing
        fire_rx = re.compile(_rules().get("fire_rating_value", r"\d+\s*(MIN|HR)"), re.I)
        fire = next((v for k, v in e.cells.items() if k.upper() in fire_cols and fire_rx.search(v or "")), None) if e.layout == "tabular" else None
        if fire and c.cls in ("glazing_only", "glazing_only_door"):
            c.cls, c.kind = "fire_rated_glazing", "scope"
            c.notes.append(f"fire rating {fire} → fire-rated glazing")
        # tabular door with a TYPE letter: read the door-type drawing's geometry
        if e.layout == "tabular" and c.cls == "unclassified":
            cells = {k.upper(): v for k, v in e.cells.items()}
            typ = (cells.get("TYPE") or cells.get("TYPE MATERIAL") or "").split()
            letter = typ[0] if typ and re.fullmatch(r"[A-Z]\d?", typ[0]) else None
            if letter:
                if e.page not in tdraw:
                    tdraw[e.page] = type_drawings(doc[e.page])
                td = tdraw[e.page].get(letter)
                if td:
                    c.notes.append(f"door type {letter} drawing: {td['bays']}x{td['rows']} panels, looks {td['look']}")
                    if td["look"] == "sectional" or (e.w_in and e.h_in and e.w_in >= 96 and e.h_in >= 96):
                        c.cls, c.kind = "excluded", "excluded"
                        c.flags.append(f"door type {letter}: no material named; drawing reads as a sectional overhead door ({td['rows']} panels, {fmt_in(e.w_in)} x {fmt_in(e.h_in)}) — excluded, confirm")
        cls_of[id(e)] = c
    scope_sched = {m: v for m, v in sched.items() if any(cls_of[id(e)].kind in ("scope", "pass_thru") for e in entries if e.mark == m)}

    # ── 4. elevation snap (scope marks only — nobody measures an HM door) ──
    snaps: list[ElevSnap] = []
    from .elevations import size_search
    for s in by_cat.get("elevation", []):
        ss = snap_elevation(doc[s.page], s.sheet, scope_sched, alias, DEFAULT_PPF["elevation"])
        tagged = {x.mark for x in ss}
        untagged = {m: v for m, v in scope_sched.items() if m not in tagged}
        if untagged and "INTERIOR" not in s.title.upper():
            ss += size_search(doc[s.page], s.sheet, untagged, default_ppf=DEFAULT_PPF["elevation"])
        snaps += ss
        out["read"].append({"sheet": s.sheet, "page": s.page, "step": "elevation", "snaps": len(ss),
                            "unsure": sum(1 for x in ss if x.unsure)})

    # ── 5. details ──────────────────────────────────────────────────────────
    KW = detail_keywords()
    details: list[Detail] = []
    for cat in ("detail", "section", "enlarged", "elevation", "schedule"):
        for s in by_cat.get(cat, []):
            if any(d.page == s.page for d in details):
                continue
            ds = [d for d in (_all_details.get(s.page) or find_details(doc[s.page], s.sheet, KW)) if d.hits]
            details += ds
            if ds:
                out["read"].append({"sheet": s.sheet, "page": s.page, "step": "details", "hits": len(ds)})

    # ── 6. classify + ledger ────────────────────────────────────────────────
    items: list[Item] = []
    markups: list[Markup] = []

    for e in entries:
        s = sheet_of[e.page]
        txt = e.desc if e.layout == "tabular" else " ".join(e.text)
        is_door = _is_door(e)
        c = cls_of[id(e)]
        it = Item(id=e.mark, cls=c.cls, kind=c.kind, label=e.mark, desc=txt, location=c.location,
                  w_in=e.w_in, h_in=e.h_in, frames=e.frames, series=c.series, hardware=e.hardware,
                  implied=c.implied, flags=list(e.flags) + c.flags, notes=c.notes, pair=c.pair, stile=c.stile, is_door=is_door)
        if e.frames:
            it.bays = e.frames[0]["bays"]
            it.rows = sum(f["rows"] for f in e.frames) if len(e.frames) > 1 else e.frames[0]["rows"]
        it.citations.append(f"{e.sheet} {e.layout} schedule type {e.mark}" + (f" ({', '.join(e.marks)})" if len(e.marks) > 1 else ""))
        # qty: plan count across all marks in the group
        n = plan_counts.get(e.mark, 0) + sum(plan_counts.get(m, 0) for m in (e.marks or []) if m != e.mark)
        if n:
            it.qty, it.qty_source = n, "plan tags"
            it.citations.append(f"plan tags ×{n}")
        elif e.mark.upper().startswith("FRAME TYPE ") and tag_roles and any(
                r == "frame" and i < len(cl) and cl[i] == e.mark.split()[-1]
                for cl in plan_cells.values() for i, r in tag_roles.items()):
            fi = [i for i, r in tag_roles.items() if r == "frame"][0]
            refs = sorted(m for m, cl in plan_cells.items() if fi < len(cl) and cl[fi] == e.mark.split()[-1])
            it.qty, it.qty_source = len(refs), "door tags on plans"
            it.citations.append(f"door tags {', '.join(refs)}")
            it.flags.append(f"count = doors whose plan tag names frame type {e.mark.split()[-1]} ({len(refs)}) — confirm")
        else:
            it.qty, it.qty_source = 1, "schedule (no plan tag found)"
            if c.kind in ("scope", "pass_thru"):
                it.flags.append("no plan tag found for this mark — count assumed 1")
        # elevation snaps for this mark
        esn = [x for x in snaps if x.mark == e.mark]
        if esn:
            good = [x for x in esn if x.frames and not x.unsure]
            if all(x.tag_kind == "size" for x in esn):
                it.flags.append(f"elevation located by size only on {esn[0].sheet} — confirm")
            it.citations.append(f"{esn[0].sheet} elevation ×{len(esn)}" + (" (snapped)" if good else " (tag only)"))
            if good and c.kind == "scope":
                g = good[0]
                it.w_in = g.frames[0]["w_in"]
                it.h_in = sum(f["h_in"] for f in g.frames) if len(g.frames) > 1 else g.frames[0]["h_in"]
                it.notes.append(f"size from {g.sheet} elevation snap (schedule {fmt_in(e.w_in)} x {fmt_in(e.h_in)})")
                if e.w_in and abs(it.w_in - e.w_in) > max(6, 0.05 * e.w_in):
                    it.flags.append(f"elevation width {fmt_in(it.w_in)} vs schedule {fmt_in(e.w_in)} — confirm (RFI?)")
            if len(esn) != it.qty and it.qty_source == "plan tags" and c.kind == "scope":
                it.notes.append(f"elevation shows {len(esn)} tag(s), plan {it.qty}")
        if it.w_in and it.h_in and c.kind in ("scope", "pass_thru"):
            it.sf_each = sqft(it.w_in, it.h_in)
            it.sf_total = round(it.sf_each * (it.qty or 1), 1)
        it.label = f"{e.mark} — {it.qty} Thus" if it.qty else e.mark
        if c.cls in ("all_glass_wall", "all_glass_door"):
            from .allglass import all_glass_measures
            it.allglass = all_glass_measures(txt, it.w_in, it.h_in, it.bays, it.rows,
                                             has_film=any(i["cls"] == "glass_film" for i in c.implied))
        items.append(it)
        markups += _schedule_markups(it, e, s)
        for pc in censuses:
            for m in (e.marks or [e.mark]):
                for tg in pc.tags.get(m, []):
                    markups += _tag_markup(it, pc.sheet, pc.page, tg, doc[pc.page], e)
        for x in esn:
            markups += _elev_markups(it, x, e)

    # legend rows and notes as items
    for r in rows:
        c = classify(r.text)
        if c.cls == "glazing_only" and any(i["cls"] == "glass_film" for i in c.implied):
            c.cls = "glass_film"
        iid = f"{r.sheet} {r.kind} {r.code}"
        it = Item(id=iid, cls=c.cls, kind=c.kind if c.cls != "unclassified" else "note", label=f"{r.code} ({r.sheet})",
                  desc=r.text, flags=c.flags, notes=c.notes, implied=c.implied, series=c.series, source=r.kind)
        it.citations.append(f"{r.sheet} {r.kind} row {r.code}")
        items.append(it)
        # legend rows are drawn (Martin colours them); numbered notes only when they name a
        # manufacturer / series (Valvoline: "STOREFRONT DOORS TYPE A SHALL BE KAWNEER…",
        # Kawneer hardware rows) — generic code notes stay in the ledger only
        _mfr = re.compile(r"KAWNEER|TUBELITE|YKK|EFCO|OLDCASTLE|\bOBE\b|PITT?CO|\bCRL\b|ARCADIA|US ALUMINUM|VITRO|WAUSAU|KALWALL", re.I)
        if r.kind == "legend" or c.series or _mfr.search(r.text):
            sub = subject_for(c.cls, "region") or subject_for("note", "label")
            markups.append(_mk(iid, r.sheet, r.page, sub, "region", r.rect, note=f"{r.kind} row {r.code}: {r.keyword}"))

    # details
    for d in details:
        if d.num in ("?", "") and re.search(r"NOTES|LEGEND|KEY\b|ABBREVIATIONS|GENERAL", d.title, re.I):
            continue   # an unnumbered notes / legend heading, not a detail or a schedule
        kws = sorted({h["kw"] for h in d.hits})
        c = classify(" ".join(h["text"] for h in d.hits))
        iid = f"{d.sheet} det {d.num}"
        it = Item(id=iid, cls=c.cls, kind="detail", label=f"{d.num}/{d.sheet} {d.title}", desc="; ".join(kws),
                  flags=[f for f in c.flags if "assumed exterior" not in f], notes=c.notes, implied=c.implied, source="detail")
        it.citations.append(f"{d.sheet} detail {d.num} ({d.title})")
        items.append(it)
        sub = subject_for(c.cls if c.kind != "excluded" else "excluded", "region") or subject_for("ext_sf", "region")
        markups.append(_mk(iid, d.sheet, d.page, sub, "region", d.title_rect, note=f"detail title; keywords {', '.join(kws)}"))
        if d.num_rect:
            markups.append(_mk(iid, d.sheet, d.page, sub, "region", d.num_rect, note="detail number"))
        for h in d.hits[:6]:
            markups.append(_mk(iid, d.sheet, d.page, sub, "region", h["rect"], note=f"keyword {h['kw']}"))

    # repeated members called out by a note (tube louvers, fins, sun shades)
    from .members import find_members
    from .units import page_ppf as _pppf
    for s in arch:
        if not set(s.categories) & {"elevation", "enlarged", "section", "unknown", "detail"}:
            continue
        res = find_members(doc[s.page], s.sheet, _pppf(doc[s.page], 18.0) or 18.0)
        if not res:
            continue
        iid = f"{s.sheet} sun control"
        total = round(sum(m["len_in"] for m in res["members"]), 1)
        it = Item(id=iid, cls="sun_control", kind="scope", label=f"Sun control / louvers ({s.sheet}) — {len(res['members'])} members",
                  desc=res["callout"], qty=len(res["members"]), qty_source="members drawn on the elevation",
                  notes=[f"{len(res['members'])} members, total {fmt_in(total)}"],
                  flags=["sun control members counted from the elevation drawing — confirm count and that they are ours (spec)"],
                  source="members")
        it.citations.append(f"{s.sheet} callout: {res['callout'][:60]}")
        items.append(it)
        lin = subject_for("sun_control", "linear")
        reg = subject_for("sun_control", "region")
        if reg:
            markups.append(_mk(iid, s.sheet, s.page, reg, "region", res["callout_rect"], note="callout"))
        for m in res["members"]:
            x0, y0 = m["p0"]; x1, y1 = m["p1"]
            markups.append(Markup(iid, s.sheet, s.page, lin[0], "linear", [min(x0, x1) - 2, min(y0, y1) - 2, max(x0, x1) + 2, max(y0, y1) + 2],
                                  [m["p0"], m["p1"]], text=f"{lin[0]}\n{fmt_in(m['len_in'])}", stroke=lin[1], fill=lin[2], opacity=lin[3],
                                  note=f"member {fmt_in(m['len_in'])}"))

    # translucent wall panels: a note with leader arrows into ribbed bays (not tagged like storefront)
    from .translucent import find_panels as _find_panels
    from .units import page_ppf as _pppf2
    panels_by_page: dict[int, list] = {}
    tp_misses: list = []
    for s in arch:
        if "elevation" not in s.categories:
            continue
        ppf_ = _pppf2(doc[s.page], 18.0) or 18.0
        miss: list = []
        ps = _find_panels(doc[s.page], ppf_, miss)
        if ps:
            panels_by_page[s.page] = ps
        tp_misses += [dict(m, sheet=s.sheet, page=s.page) for m in miss]
    out["translucent_panels"] = {sheet_of[k].sheet: v for k, v in panels_by_page.items()}
    if panels_by_page or tp_misses:
        iid = "TRANSLUCENT PANELS"
        tot = round(sum(p_["sf"] for v in panels_by_page.values() for p_ in v), 1)
        n_ = sum(len(v) for v in panels_by_page.values())
        tp_it = Item(id=iid, cls="translucent_panel", kind="scope", label=f"Translucent wall panels — {n_} bays, {tot} sf",
                     desc="TRANSLUCENT WALL PANEL SYSTEM (from elevation notes)", qty=tot or None,
                     qty_source="bays measured on the elevations (sf)", source="elevation notes",
                     notes=[f"{n_} bays, {tot} sf total"])
        area_s = subject_for("translucent_panel", "area")
        reg_s = subject_for("translucent_panel", "region")
        for pno, ps in panels_by_page.items():
            s = sheet_of[pno]
            tp_it.citations.append(f"{s.sheet}: {len(ps)} bays")
            for nr in {tuple(p_["note_rect"]) for p_ in ps}:
                if reg_s:
                    markups.append(_mk(iid, s.sheet, pno, reg_s, "region", list(nr), note="translucent panel note"))
            for p_ in ps:
                if area_s:
                    markups.append(Markup(iid, s.sheet, pno, area_s[0], "area", p_["rect"], p_["poly"],
                                          text=f"A = {p_['sf']} sf\nW = {fmt_in(p_['w_in'])}\nH = {fmt_in(p_['h_in'])}",
                                          stroke=area_s[1], fill=area_s[2], opacity=area_s[3], note="translucent bay"))
        for m_ in tp_misses:
            tp_it.flags.append(f"{m_['sheet']}: translucent panel note's arrows point at panels the engine could not measure (behind louvers / irregular) — take off by hand")
            if reg_s:
                markups.append(_mk(iid, m_["sheet"], m_["page"], reg_s, "region", m_["rect"], note="translucent panel note — not measured"))
        tp_it.flags.append("translucent bays found from the note arrows and the rib pattern — confirm every bay is captured")
        items.append(tp_it)

    # break metal: driven off details that show it at our systems; measured on the exterior elevations
    from .breakmetal import scan_details as _bm_scan, edges_for as _bm_edges, runs as _bm_runs
    bm_details = []
    for pno, ds in _all_details.items():
        s = sheet_of[pno]
        bm_details += _bm_scan(doc[pno], s.sheet, ds)
    out["break_metal_details"] = [b.to_dict() for b in bm_details]
    if bm_details:
        emap = _bm_edges(bm_details)
        iid = "BREAK METAL"
        bm_it = Item(id=iid, cls="break_metal", kind="scope", label="Break metal flashing & trim (from details)",
                     desc="; ".join(sorted({f"{b.num}/{b.sheet} {b.title}" for b in bm_details}))[:400],
                     qty=None, qty_source="details + exterior elevations", source="details",
                     notes=[f"edges by system: " + ", ".join(f"{k}: {'/'.join(sorted(v)) or 'callout only'}" for k, v in sorted(emap.items()))])
        bm_it.citations += [f"{b.sheet} detail {b.num}: {b.title}" for b in bm_details]
        reg = subject_for("break_metal", "region")
        lin = subject_for("break_metal", "linear")
        for b in bm_details:
            for c in b.callouts[:4]:
                markups.append(_mk(iid, b.sheet, b.page, reg, "region", c["rect"], note=f"detail {b.num}: {c['text'][:40]}"))
        items_by_id = {i.id: i for i in items}
        # which frame types each detail is cut through: markers on the type-elevation sheets
        from .breakmetal import detail_markers as _bm_markers
        bm_keys = {(b.num, b.sheet.replace("-", "").upper()): b for b in bm_details}
        mark_edges: dict[str, set] = {}
        _type_pages = sorted({e.page for e in entries if e.layout in ("captioned", "pictorial")})
        for pno in _type_pages:
            for k, ms in _bm_markers(doc[pno], [e for e in entries if e.page == pno]).items():
                b = bm_keys.get(k)
                if not b:
                    continue
                for m_ in ms:
                    mark_edges.setdefault(m_, set()).update(b.edges)
                bm_it.citations.append(f"detail {b.num}/{b.sheet} marked on types {', '.join(sorted(ms))}")
        out["break_metal_by_type"] = {k: sorted(v) for k, v in mark_edges.items()}
        total_in = 0.0
        by_sheet: dict[int, list] = {}
        for x in snaps:
            s = sheet_of.get(x.page)
            it = items_by_id.get(x.mark)
            if not s or not it or it.kind != "scope" or x.unsure or "elevation" not in s.categories or not _ext.search(s.title):
                continue
            if mark_edges:
                e_ = mark_edges.get(x.mark, set())          # only the details cut through this type
            else:                                            # no markers in the set: every frame of the system
                sysk = ["cw"] if "cw" in it.cls else ["sf"] if "sf" in it.cls else []
                e_ = set().union(*[emap.get(k, set()) for k in sysk]) if sysk else set()
            if not e_:
                continue
            for f_ in x.frames:
                if f_.get("err", 0) <= 0.2:
                    by_sheet.setdefault(x.page, []).append((f_["rect"], e_, x.ppf))
        for pno, ps in panels_by_page.items():
            s = sheet_of[pno]
            if _ext.search(s.title) and emap.get("translucent"):
                ppf_t = _pppf2(doc[pno], 18.0) or 18.0
                for p_ in ps:
                    by_sheet.setdefault(pno, []).append((p_["rect"], emap["translucent"], ppf_t))
        for pno, frs in by_sheet.items():
            s = sheet_of[pno]
            ppf_ = next((p for *_r, p in frs if p), None)
            if not ppf_:
                continue
            for rn in _bm_runs([(r_, e_) for r_, e_, _p in frs], ppf_):
                if rn["len_in"] < 12:
                    continue
                total_in += rn["len_in"]
                (x0, y0), (x1, y1) = rn["p0"], rn["p1"]
                markups.append(Markup(iid, s.sheet, s.page, lin[0], "linear", [min(x0, x1) - 2, min(y0, y1) - 2, max(x0, x1) + 2, max(y0, y1) + 2],
                                      [rn["p0"], rn["p1"]], text=f"{lin[0]}\n{fmt_in(rn['len_in'])}", stroke=lin[1], fill=lin[2],
                                      opacity=lin[3], note=f"{rn['orient']} run {fmt_in(rn['len_in'])}"))
        # column / pier wraps at translucent panels: one per pier along each continuous row of bays
        wrap_d = [b for b in bm_details if "translucent" in b.systems and re.search(r"WRAP", b.title, re.I)]
        if wrap_d and panels_by_page:
            wid = "BREAK METAL WRAPS"
            n_w = 0
            for pno, ps in panels_by_page.items():
                s = sheet_of[pno]
                ppf_t = _pppf2(doc[pno], 18.0) or 18.0
                rows_: list[list] = []
                for p_ in sorted(ps, key=lambda q: q["rect"][0]):
                    for row in rows_:
                        last = row[-1]
                        if abs(last["rect"][3] - p_["rect"][3]) <= 6 * ppf_t / 6.75 and 0 <= p_["rect"][0] - last["rect"][2] <= 3 * ppf_t:
                            row.append(p_)
                            break
                    else:
                        rows_.append([p_])
                for row in rows_:
                    # a thin mullion between paired panels (< 0.8') is not a pier — no wrap there
                    xs_ = [row[0]["rect"][0]] + [(a["rect"][2] + b["rect"][0]) / 2 for a, b in zip(row, row[1:])
                                                 if (b["rect"][0] - a["rect"][2]) / ppf_t >= 0.8] + [row[-1]["rect"][2]]
                    for i_, xw in enumerate(xs_):
                        q = row[min(i_, len(row) - 1)]["rect"]
                        n_w += 1
                        markups.append(_mk(wid, s.sheet, pno, reg, "region", [xw - 4, q[3] - 14, xw + 4, q[3]],
                                           note=f"pier wrap {n_w} ({wrap_d[0].num}/{wrap_d[0].sheet})"))
            if n_w:
                w_it = Item(id=wid, cls="break_metal", kind="scope", label=f"Break metal wraps at translucent panel piers — {n_w} EA",
                            desc="; ".join(f"{b.num}/{b.sheet} {b.title}" for b in wrap_d), qty=n_w,
                            qty_source="piers between / at the ends of translucent bays on the elevations", source="details",
                            flags=["wrap count = piers along each run of translucent bays (ends included) — confirm against the plan columns"])
                w_it.citations += [f"{b.sheet} detail {b.num}: {b.title}" for b in wrap_d]
                items.append(w_it)
        if total_in:
            bm_it.qty = round(total_in / 12, 1)
            bm_it.notes.append(f"total {fmt_in(total_in)} on exterior elevations (LF)")
        bm_it.flags.append("break metal lengths are the frame edges named by the details — confirm which openings each detail covers")
        items.append(bm_it)

    # flags → yellow flag markups at the item's first citation markup
    for it in items:
        if it.flags:
            first = next((m for m in markups if m.item == it.id and m.rect), None)
            if first:
                markups.append(Markup(it.id, first.sheet, first.page, FLAG[0], "flag", first.rect, text="; ".join(it.flags),
                                      stroke=FLAG[1], fill=FLAG[2], note="needs review"))

    # ── 7. summary ──────────────────────────────────────────────────────────
    out["schedule_entries"] = [e.to_dict() for e in entries]
    out["legend_rows"] = [r.to_dict() for r in rows]
    out["legend_classes"] = lclasses
    out["plan_census"] = [pc.to_dict() for pc in censuses]
    out["elevation_snaps"] = [x.to_dict() for x in snaps]
    out["details"] = [d.to_dict() for d in details]
    out["items"] = [i.to_dict() for i in items]
    out["markups"] = [m.to_dict() for m in markups]
    out["flags"] = [{"item": i.id, "flags": i.flags} for i in items if i.flags]
    out["totals"] = _totals(items)
    out["skipped"] = [s.sheet for s in index if s not in arch]
    out["elapsed_s"] = round(time.time() - t0, 2)
    out["model_calls"] = 0
    return out


def _mk(item: str, sheet: str, page: int, sub, role: str, rect, text: str = "", note: str = "", dashed: bool = False) -> Markup:
    subj, stroke, fill, op = sub if sub else ("Needs Review", "#FFFF00", "#FFFF00", None)
    return Markup(item, sheet, page, subj, role, [round(float(v), 1) for v in rect] if rect else None, None, text,
                  stroke, fill, op, dashed, note)


def _schedule_markups(it: Item, e: ScheduleEntry, s: SheetInfo) -> list[Markup]:
    cls = it.cls if it.kind != "excluded" else "excluded"
    region = subject_for(cls, "region") or subject_for("excluded", "region")
    ms: list[Markup] = []
    if e.mark_rect:
        ms.append(_mk(it.id, e.sheet, e.page, region, "region", e.mark_rect, note="schedule mark"))
    if e.frames:
        for f in e.frames:
            ms.append(_mk(it.id, e.sheet, e.page, region, "region", f["rect"], note="type drawing (snapped to vector lines)"))
        r = e.frames[0]["rect"]
        if it.kind in ("scope", "pass_thru"):
            ms.append(Markup(it.id, e.sheet, e.page, "Qty Text Box", "label", [r[0], r[3] + 6, r[0] + 90, r[3] + 26],
                             text=it.label, stroke="#FFFFFF", note="count"))
    elif e.label_rect:
        ms.append(_mk(it.id, e.sheet, e.page, region, "region", e.label_rect, note="schedule row"))
    if it.allglass and e.frames:
        f0 = e.frames[0]["rect"]
        ppf = e.ppf or 18.0
        ag = it.allglass
        if ag.get("film_h_in"):
            band = [f0[0], f0[3] - ag["film_h_in"] / 12 * ppf, f0[2], f0[3]]
            film = subject_for("glass_film", "area") or ("Glass Film Area", "#FF00FF", "#FF00FF", None)
            ms.append(Markup(it.id, e.sheet, e.page, film[0], "area", [round(v, 1) for v in band],
                             text=f"A = {ag['film_sf']} sf\nW = {fmt_in(it.w_in)}\nH = {fmt_in(ag['film_h_in'])}",
                             stroke=film[1] or "#FF00FF", fill=film[2] or "#FF00FF", note="frost / film band"))
        area = subject_for("all_glass_wall", "area")
        if area and ag.get("area_sf"):
            ms.append(Markup(it.id, e.sheet, e.page, area[0], "area", list(f0),
                             text=f"A = {ag['area_sf']} sf\nW = {fmt_in(it.w_in)}\nH = {fmt_in(it.h_in)}",
                             stroke=area[1], fill=area[2], note="all-glass opening area"))
        ssg = subject_for("ssg_caulk", "count")
        pe = subject_for("polished_edge", "count")
        dr = subject_for("all_glass_door", "door")
        y = f0[3] + 30
        for sub, n, label in ((ssg, ag["ssg_joints"], "SSG joints"), (pe, ag["polished_edges"], "polished edges"), (dr, ag["doors"], "all-glass doors")):
            if sub and n:
                ms.append(Markup(it.id, e.sheet, e.page, sub[0], "count", [f0[0], y, f0[0] + 14, y + 14],
                                 text=f"{n} {label}", stroke=sub[1], fill=sub[2], note=f"{label}: {n} (derived — verify)"))
                y += 18
    if e.hardware_rect and it.kind in ("scope", "pass_thru"):
        ms.append(_mk(it.id, e.sheet, e.page, region, "region", e.hardware_rect, note="hardware table (included by default)"))
    if e.label_rect and e.frames:
        ms.append(_mk(it.id, e.sheet, e.page, region, "region", e.label_rect, note="type description"))
    return ms


def _tag_markup(it: Item, sheet: str, page: int, tg: dict, pg: fitz.Page, e: ScheduleEntry) -> list[Markup]:
    cls = it.cls if it.kind != "excluded" else "excluded"
    region = subject_for(cls, "region") or subject_for("excluded", "region")
    ms = [_mk(it.id, sheet, page, region, "region", tg["shape"], note=f"plan tag {tg['text']} ({tg['kind']})")]
    # Polylength along the opening (Martin's plan convention) when the width is known
    lin = subject_for(cls, "linear")
    if lin and it.kind in ("scope", "pass_thru") and (it.w_in or e.w_in):
        from .plans import opening_runs
        from .units import page_ppf
        ppf = page_ppf(pg, DEFAULT_PPF["plan"]) or DEFAULT_PPF["plan"]
        sh = tg["shape"]
        c = ((sh[0] + sh[2]) / 2, (sh[1] + sh[3]) / 2)
        from .plans import frame_box
        fb = None if it.cls in ("all_glass_wall", "all_glass_door") else frame_box(pg, c, e.w_in or it.w_in, ppf)
        runs = [] if fb else opening_runs(pg, c, e.w_in or it.w_in, ppf)
        if fb:
            q, ln = fb
            if q.width >= q.height:
                p0, p1 = ((q.x0, (q.y0 + q.y1) / 2), (q.x1, (q.y0 + q.y1) / 2))
            else:
                p0, p1 = (((q.x0 + q.x1) / 2, q.y0), ((q.x0 + q.x1) / 2, q.y1))
            runs = [(p0, p1, ln, 0.0)]
        if runs:
            p0, p1, ln, d = runs[0]
            ms.append(Markup(it.id, sheet, page, lin[0], "linear",
                             [round(min(p0[0], p1[0]) - 2, 1), round(min(p0[1], p1[1]) - 2, 1), round(max(p0[0], p1[0]) + 2, 1), round(max(p0[1], p1[1]) + 2, 1)],
                             [[round(p0[0], 1), round(p0[1], 1)], [round(p1[0], 1), round(p1[1], 1)]],
                             text=f"{lin[0]}\n{fmt_in(ln)}", stroke=lin[1], fill=lin[2], opacity=lin[3],
                             note=f"opening extent on plan, {fmt_in(ln)} (run {d:.0f} pt from tag)"))
        else:
            ms[0].note += "; opening extent not located on plan"
    return ms


def _elev_markups(it: Item, x: ElevSnap, e: ScheduleEntry) -> list[Markup]:
    cls = it.cls if it.kind != "excluded" else "excluded"
    region = subject_for(cls, "region") or subject_for("excluded", "region")
    area = subject_for(cls, "area")
    ms: list[Markup] = [_mk(it.id, x.sheet, x.page, region, "region", x.tag_rect, note="elevation tag")]
    roles = [f.get("role") for f in (e.frames or [])]
    for fi_, f in enumerate(x.frames):
        bad = x.unsure or f["err"] > 0.2
        if fi_ < len(roles) and roles[fi_] == "translucent_panel":
            tsub = subject_for("translucent_panel", "area")
            if tsub and not bad:
                ms.append(_mk(it.id, x.sheet, x.page, tsub, "area", f["rect"],
                              text=f"A = {sqft(f['w_in'], f['h_in'])} sf\nW = {fmt_in(f['w_in'])}\nH = {fmt_in(f['h_in'])}"))
            continue
        ms.append(_mk(it.id, x.sheet, x.page, region, "region", f["rect"], dashed=bad,
                      note="elevation frame (snapped)" if not bad else x.note or "snap disagrees with schedule — dashed"))
        if area and not bad and it.kind == "scope":
            ms.append(_mk(it.id, x.sheet, x.page, area, "area", f["rect"],
                          text=f"A = {sqft(f['w_in'], f['h_in'])} sf\nW = {fmt_in(f['w_in'])}\nH = {fmt_in(f['h_in'])}"))
    return ms


def _totals(items: list[Item]) -> dict:
    t: dict[str, dict] = {}
    for i in items:
        if i.kind not in ("scope", "pass_thru") or i.source != "schedule":
            continue
        d = t.setdefault(i.cls, {"items": 0, "qty": 0, "sf": 0.0})
        d["items"] += 1
        d["qty"] += i.qty or 0
        d["sf"] += i.sf_total or 0.0
    for d in t.values():
        d["sf"] = round(d["sf"], 1)
    return t


def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(description="GlazeBid deterministic auto-takeoff")
    ap.add_argument("pdf")
    ap.add_argument("-o", "--out", default=None)
    ap.add_argument("--project", default="")
    ap.add_argument("--sheets", default=None, help="comma-separated sheet numbers to limit to")
    a = ap.parse_args(argv)
    res = run_autotakeoff(a.pdf, a.project, a.sheets.split(",") if a.sheets else None)
    js = json.dumps(res, indent=1, default=str)
    if a.out:
        open(a.out, "w", encoding="utf-8").write(js)
    print(f"{len(res['items'])} items, {len(res['markups'])} markups, {len(res['flags'])} flagged, {res['elapsed_s']}s, 0 model calls")
    for cls, d in res["totals"].items():
        print(f"  {cls:<20} {d['items']:>3} types  qty {d['qty']:>3}  {d['sf']:>9.1f} sf")


if __name__ == "__main__":
    main()
