"""
schedules.py — door / frame / storefront schedules, read from the text layer
and the vector drawing.  Two layouts are handled:

  pictorial   (McLarty A3.2/A3.3)  — a circled mark, a FROM/BETWEEN… description
               column, a hardware table, and a ¼"-scale type drawing above.
               The frame rectangle is snapped from the vector lines sitting on
               the floor line above the label; W×H come from the rectangle at
               the sheet scale and are cross-checked against dimension strings.
  tabular     (Valvoline A-6.1)    — a header row (MARK / NO. / WIDTH / HEIGHT /
               MATERIAL / FRAME / GLAZING / HDWR / REMARKS…), rows under it.

Both produce ScheduleEntry objects: mark, description lines, W/H in inches,
bays/rows, hardware text, the rects to highlight, and a scale/dim cross-check.
No model calls.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

from .pdfgeom import text_lines, TextLine, type_frames, mullion_positions, dedupe, small_shapes
from .units import fmt_in, parse_dim, norm_text, region_ppf, ppf_from_dims, nearest_ppf, STANDARD_PPF
from .tags import find_tags

MARK_RE = re.compile(r"^(?:[A-Z]{0,2}-?\d{1,4}[A-Za-z]?(?:\.\d{1,2}[A-Za-z]?)?|[A-Z]{1,2}-?\d{0,2}[a-z]?|[A-Z]\d?-[A-Z0-9]{1,3})$")
STOP_RE = re.compile(r"^(HARDWARE|QUANTITY|QUANITY|QTY\.?|DESCRIPTION|FINISH|HDWR\.?|REMARKS|NOTES?|SET)\s*[:#]?\s*(DESCRIPTION)?$", re.I)
HEADER_WORDS = re.compile(r"^(KEYED\s+NOTES|HDWR\s+SET|MARK|NO\.?|NUMBER|TYPE|SIZE(\s*W\s*X\s*H)?|WIDTH|HEIGHT|THK\.?|THICKNESS|MAT(ERIA)?L\.?|TYPE\s+MATERIAL|MATERIAL|FRAME(\s*TYPE)?|GLAZING|GLASS|FINISH|HEAD|JAMB|SILL|THRESHOLD|HDWR\.?(\s*SET)?|HARDWARE(\s*SET)?|SET|REMARKS|COMMENTS|NOTES|DETAIL(S)?|LABEL|RATING|FIRE\s*RATING|DOOR|QTY\.?|LOCATION|ROOM(\s*NAME)?|FROM|TO|ELEV(ATION)?|MFR\.?|MANUFACTURER|SERIES|MODEL|OPERATION|LOUVER|UNDERCUT|CLOSER|LOCKSET|SWING|HAND)$", re.I)


@dataclass
class ScheduleEntry:
    mark: str
    sheet: str
    page: int
    layout: str                      # pictorial | tabular
    marks: list = field(default_factory=list)    # all marks sharing this entry (["17","18","19"])
    text: list = field(default_factory=list)    # description lines, in reading order
    cells: dict = field(default_factory=dict)   # tabular: column header -> cell text
    w_in: float | None = None
    h_in: float | None = None
    frames: list = field(default_factory=list)  # [{rect, w_in, h_in, bays, rows, mullions_x, mullions_y}]
    ppf: float | None = None
    dims_in: list = field(default_factory=list) # dimension strings near the drawing (inches)
    dim_check: str = ""              # ok | text_vs_geometry | no_dims
    mark_rect: list | None = None
    label_rect: list | None = None   # description block
    hardware_rect: list | None = None
    hardware: list = field(default_factory=list)
    table: str = ""                  # tabular: table title if found
    flags: list = field(default_factory=list)
    ppf_scores: dict = field(default_factory=dict)
    text_ppf: float | None = None

    extra: str = ""                  # words looked up from type drawings / code tables

    @property
    def desc(self) -> str:
        base = " / ".join(self.text) if self.text else " | ".join(f"{k}: {v}" for k, v in self.cells.items() if v)
        return f"{base} || {self.extra}" if self.extra else base

    def to_dict(self) -> dict:
        return asdict(self)


# ── Pictorial ─────────────────────────────────────────────────────────────────

_TYPE_TEXT = re.compile(r"DOOR|FRAME|\bFROM\b|BETWEEN|GRILLE|OVERHEAD|GLASS|GLAZ|STOREFRONT|CURTAIN|WINDOW|LOUVER|PANEL|PARTITION|ENTRANCE|OPENING|MIRROR|SKYLIGHT|RAIL", re.I)
_SHEETNO = re.compile(r"^[A-Z]{1,3}-?\d{1,3}(\.\d{1,2})?[A-Za-z]?$")
_SPLIT_HEAD = re.compile(r"^(?P<mark>[A-Z]{0,2}\d{1,3}[a-z]?)\s+(?P<head>[A-Z]{3,}.{3,})$")


def _mark_candidates(lines: list[TextLine], pg: fitz.Page | None = None) -> list[TextLine]:
    """Short mark tokens; also marks merged into their head line ("22 FROM EXTERIOR TO SHOP")."""
    cands = [t for t in lines if MARK_RE.match(t.text.strip()) and t.size < 10]
    shapes = small_shapes(pg, 40) if pg is not None else []
    for t in lines:
        if t.size >= 10.5:
            continue
        m = _SPLIT_HEAD.match(norm_text(t.text))
        if not m:
            continue
        # only when nothing mark-like sits immediately left of this line
        if any(abs(c.rect[1] - t.rect[1]) < 10 and 0 <= t.rect[0] - c.rect[2] < 40 for c in cands):
            continue
        w = (t.rect[2] - t.rect[0]) * len(m.group("mark")) / max(1, len(t.text))
        # and only when the leading token sits inside a callout symbol ("2 EQUAL PANELS" has none)
        c = fitz.Point(t.rect[0] + w / 2, (t.rect[1] + t.rect[3]) / 2)
        if shapes and not any(sh[0].contains(c) and sh[0].x1 < t.rect[0] + w + 12 for sh in shapes):
            continue
        cands.append(TextLine((t.rect[0], t.rect[1], t.rect[0] + w, t.rect[3]), m.group("mark"), t.size, False))
    # overlapping duplicates (a stray "04" printed over "10"): keep the one not starting with 0
    out: list[TextLine] = []
    for c in sorted(cands, key=lambda c: c.text.startswith("0")):
        if any(abs(c.rect[0] - o.rect[0]) < 2 and abs(c.rect[1] - o.rect[1]) < 2 for o in out):
            continue
        out.append(c)
    return out


def group_marks(grp, cands, last):
    return [t for t in cands if t.text.strip() in grp and abs(t.rect[1] - last.rect[1]) < 6 and t.rect[0] <= last.rect[0]]


def read_pictorial(pg: fitz.Page, sheet: str, default_ppf: float = 18.0) -> list[ScheduleEntry]:
    lines = [t for t in text_lines(pg) if not t.vertical]
    cands = _mark_candidates(lines, pg)
    split_heads = {id(t) for t in lines if _SPLIT_HEAD.match(norm_text(t.text))}

    def _head(m):
        # a detail bubble is "2" over "A5.3": anything sheet-number-like beside the mark disqualifies it
        if any(abs(t.rect[1] - m.rect[1]) < 14 and 0 <= t.rect[0] - m.rect[2] < 30 and _SHEETNO.match(t.text.strip()) for t in lines):
            return None
        right = [t for t in lines if m.rect[2] - 1 < t.rect[0] < m.rect[2] + 40 and abs(t.rect[1] - m.rect[1]) < 10
                 and len(t.text.replace(" ", "")) > 6 and t.size < 10.5 and t is not m
                 and any(len(w) >= 4 for w in t.text.split())]
        right.sort(key=lambda t: t.rect[0])
        if right:
            return right[0]
        # the mark was split out of its own head line
        for t in lines:
            if id(t) in split_heads and abs(t.rect[0] - m.rect[0]) < 2 and abs(t.rect[1] - m.rect[1]) < 2:
                mm = _SPLIT_HEAD.match(norm_text(t.text))
                return TextLine((m.rect[2] + 4, t.rect[1], t.rect[2], t.rect[3]), mm.group("head"), t.size, False)
        return None

    def _solitary(m):
        # a type mark stands alone; hardware quantities come in a vertical run at the same x
        return not any(o is not m and abs(o.rect[0] - m.rect[0]) < 4 and 0 < abs(o.rect[1] - m.rect[1]) < 30 for o in cands)

    # horizontal runs of marks sharing one description ("17 18 19  FROM EXTERIOR TO WASHBAYS")
    solitary = [t for t in cands if _solitary(t)]
    solitary.sort(key=lambda t: (round(t.rect[1] / 6), t.rect[0]))
    groups: list[list[TextLine]] = []
    for t in solitary:
        if groups and abs(groups[-1][-1].rect[1] - t.rect[1]) < 6 and 0 <= t.rect[0] - groups[-1][-1].rect[2] <= 12:
            groups[-1].append(t)
        else:
            groups.append([t])
    marks: list[TextLine] = []
    group_of: dict[int, list[str]] = {}
    for g in groups:
        last = g[-1]
        if _head(last) is None:
            continue
        marks.append(last)
        group_of[id(last)] = [t.text.strip() for t in g]
    out: list[ScheduleEntry] = []
    seen: set[str] = set()
    for m in marks:
        y0 = m.rect[1]
        head = _head(m)
        hx = head.rect[0]
        others = [t for t in marks if abs(t.rect[1] - y0) < 40 and t.rect[0] > m.rect[0] + 5]
        xmax = min(t.rect[0] for t in others) - 10 if others else min(pg.rect.width * 0.95, hx + 1200)
        body = [t for t in lines if y0 - 2 <= t.rect[1] < y0 + 160 and hx - 30 <= t.rect[0] < xmax
                and t.size <= 10.5 and not MARK_RE.match(t.text.strip())]
        body.sort(key=lambda t: (round(t.rect[1]), t.rect[0]))
        desc: list[str] = []
        stop_y = None
        prev_b = None
        for t in body:
            if STOP_RE.match(t.text.strip()):
                stop_y = t.rect[1]
                break
            if prev_b is not None and t.rect[1] - prev_b > 40:
                break    # a gap this big is the next thing on the sheet, not this description
            if t.rect[0] < hx - 5 and not desc:
                continue
            desc.append(t.text.strip())
            prev_b = t.rect[3]
        if not desc:
            continue
        frames_probe = type_frames(pg, (m.rect[0], y0), xmax)
        if not frames_probe and len(desc) < 2 and _size_from_text(" ".join(desc))[0] is None:
            continue   # a detail bubble or a stray number, not a schedule type
        if not _TYPE_TEXT.search(" ".join(desc)):
            continue   # not an opening: equipment, finish or furniture type
        grp = group_of.get(id(m), [m.text.strip()])
        mark = grp[0] if len(grp) == 1 else f"{grp[0]}-{grp[-1]}"
        if mark in seen:
            mark = f"{mark}#{sum(1 for e in out if e.mark.startswith(mark)) + 1}"
        seen.add(mark)
        e = ScheduleEntry(mark=mark, sheet=sheet, page=pg.number, layout="pictorial", text=desc,
                          mark_rect=[round(v, 1) for v in m.rect], marks=grp)
        if len(grp) > 1:
            e.mark_rect = [round(min(t.rect[0] for t in group_marks(grp, cands, m)), 1), e.mark_rect[1], e.mark_rect[2], e.mark_rect[3]]
        lab_y1 = max([t.rect[3] for t in body if t.rect[1] < (stop_y or y0 + 160) and t.text.strip() in desc] or [m.rect[3]])
        e.label_rect = [round(min(m.rect[0], hx) - 4, 1), round(y0 - 2, 1), round(xmax, 1), round(lab_y1 + 2, 1)]
        # hardware table under the stop word
        if stop_y is not None:
            hw = [t for t in lines if stop_y <= t.rect[1] < stop_y + 220 and hx - 30 <= t.rect[0] < xmax and t.size <= 9.5]
            hw.sort(key=lambda t: (round(t.rect[1]), t.rect[0]))
            # end at a vertical gap > 18 pt
            kept: list[TextLine] = []
            prev = None
            for t in hw:
                if prev is not None and t.rect[1] - prev.rect[3] > 18:
                    break
                kept.append(t)
                prev = t if prev is None or t.rect[3] > prev.rect[3] else prev
            if kept:
                e.hardware = [t.text.strip() for t in kept]
                e.hardware_rect = [round(min(t.rect[0] for t in kept) - 4, 1), round(stop_y - 2, 1),
                                   round(max(t.rect[2] for t in kept) + 4, 1), round(max(t.rect[3] for t in kept) + 2, 1)]
        # frames above the label
        frames = type_frames(pg, (m.rect[0], y0), xmax)
        if frames:
            win = fitz.Rect(frames[0].x0 - 120, min(f.y0 for f in frames) - 120, frames[0].x1 + 120, y0)
            dims = [(parse_dim(t.text), t) for t in text_lines(pg) if win.intersects(t.r) and parse_dim(t.text)]
            e.dims_in = sorted({d for d, _ in dims if d})
            # scale candidates: every standard scale scored by how many dimension strings
            # match the drawn width / height.  Resolved sheet-wide after all entries are read.
            e.ppf_scores = scale_scores(frames, e.dims_in)
            e.text_ppf = region_ppf(pg, frames[0], None)
            ppf = e.text_ppf or default_ppf
            e.ppf = ppf
            for fr in frames:
                xs, ys = mullion_positions(pg, fr)
                bays, rows = len(xs) + 1, len(ys) + 1
                if bays > 12 or rows > 8:
                    e.flags.append(f"grid {bays}x{rows} from vector lines looks like slats/hatch — verify")
                e.frames.append({"rect": [round(v, 1) for v in fr],
                                 "w_in": round(fr.width / ppf * 12, 2), "h_in": round(fr.height / ppf * 12, 2),
                                 "bays": bays, "rows": rows,
                                 "mullions_x": [round(x, 1) for x in xs], "mullions_y": [round(y, 1) for y in ys]})
            e.w_in = e.frames[0]["w_in"]
            e.h_in = sum(f["h_in"] for f in e.frames) if len(e.frames) > 1 else e.frames[0]["h_in"]
        else:
            e.flags.append("no type drawing found above the mark")
        # text size in the description ("3'-0\" x 7'-0\"") when the drawing has none
        if e.w_in is None:
            w, h = _size_from_text(" ".join(desc))
            if w:
                e.w_in, e.h_in = w, h
        out.append(e)
    _resolve_scales(out, default_ppf)
    return out


def scale_scores(frames, dims_in: list[float], lo: float = 4.5, hi: float = 72.0) -> dict[float, int]:
    """{ppf: number of dimension strings matching the drawn width or height}."""
    scores: dict[float, int] = {}
    for ppf in STANDARD_PPF:
        if not (lo <= ppf <= hi):
            continue
        n = 0
        for fr in frames[:1]:
            for drawn in (fr.width / ppf * 12, fr.height / ppf * 12):
                if any(abs(d - drawn) <= max(1.0, 0.02 * drawn) for d in dims_in):
                    n += 1
        if n:
            scores[ppf] = n
    return scores


def _resolve_scales(entries: list[ScheduleEntry], default_ppf: float) -> None:
    """
    One scale per schedule sheet unless an entry has two-dimension evidence of
    its own.  Sheet scale = the scale most entries' dimensions agree on; else
    the scale note; else the default.
    """
    from collections import Counter
    votes: Counter = Counter()
    for e in entries:
        sc = getattr(e, "ppf_scores", None) or {}
        if sc:
            best = max(sc.values())
            for ppf, n in sc.items():
                if n == best:
                    votes[ppf] += n
    text = Counter(e.text_ppf for e in entries if getattr(e, "text_ppf", None))
    if votes:
        sheet_ppf = votes.most_common(1)[0][0]
    elif text:
        sheet_ppf = text.most_common(1)[0][0]
    else:
        sheet_ppf = default_ppf
    for e in entries:
        if not e.frames:
            continue
        sc = getattr(e, "ppf_scores", None) or {}
        own = max(sc.items(), key=lambda kv: kv[1])[0] if sc else None
        ppf = sheet_ppf
        if own is not None and sc[own] >= 2 and own != sheet_ppf and not sc.get(sheet_ppf):
            ppf = own
            e.flags.append(f"scale {ppf:g} pt/ft from this drawing's own dimensions (sheet is {sheet_ppf:g})")
        elif not sc:
            e.flags.append(f"scale assumed {ppf:g} pt/ft (no dimension string matched this drawing)")
        if abs(ppf - e.ppf) > 0.01 or True:
            k = ppf / e.ppf
            e.ppf = ppf
            for f in e.frames:
                f["w_in"] = round(f["w_in"] / k, 2)
                f["h_in"] = round(f["h_in"] / k, 2)
            e.w_in = e.frames[0]["w_in"]
            e.h_in = sum(f["h_in"] for f in e.frames) if len(e.frames) > 1 else e.frames[0]["h_in"]
        if e.dims_in:
            wok = any(abs(d - e.w_in) <= max(1.5, 0.02 * e.w_in) for d in e.dims_in)
            hok = any(abs(d - e.frames[0]["h_in"]) <= max(1.5, 0.02 * e.frames[0]["h_in"]) for d in e.dims_in)
            e.dim_check = "ok" if (wok or hok) else "text_vs_geometry"
            if e.dim_check != "ok":
                e.flags.append("drawn size does not match any dimension string — check scale")
        else:
            e.dim_check = "no_dims"


_SIZE = re.compile(r"""(\d+'\s*-?\s*\d*\s*(?:\d+/\d+)?\s*"?)\s*[xX×]\s*(\d+'\s*-?\s*\d*\s*(?:\d+/\d+)?\s*"?)""")


def _size_from_text(t: str):
    t = norm_text(t)
    m = _SIZE.search(t)
    if not m:
        return None, None
    return parse_dim(m.group(1).strip()), parse_dim(m.group(2).strip())


# ── Tabular ───────────────────────────────────────────────────────────────────

@dataclass
class Table:
    title: str
    header_rect: list
    columns: list            # [(name, x0, x1)]
    rows: list               # [{"y": y, "rect": [...], "cells": {name: text}}]
    rect: list


_UPPER_HEADER = re.compile(r"^(DOOR|PANEL|FRAME|FIRE|KEYED|HDWR|HARDWARE|GLASS|GLAZING|ROUGH|MASONRY|LABEL|UNIT|OPENING|DOOR\s+OPENING|ROOM|WALL|SILL|HEAD)$", re.I)
_MARK_HEAD = re.compile(r"^(MARK|NO\.?|NUMBER|DOOR|DOOR\s+NO\.?|OPENING|WINDOW|TAG)$", re.I)


def find_tables(pg: fitz.Page) -> list[Table]:
    lines = [t for t in text_lines(pg) if not t.vertical]
    from collections import Counter
    body_size = Counter(round(t.size, 1) for t in lines if len(t.text) > 2).most_common(1)[0][0] if lines else 9.0
    hmax = max(13.5, body_size * 1.4)
    # header rows: >= 4 header words on one y
    byy: dict[int, list[TextLine]] = {}
    for t in lines:
        if HEADER_WORDS.match(norm_text(t.text).strip(" :")) and t.size < hmax:
            byy.setdefault(round(t.rect[1] / 4), []).append(t)
    tables: list[Table] = []
    for _, hs_all in sorted(byy.items()):
        if len(hs_all) < 4:
            continue
        hs_all.sort(key=lambda t: t.rect[0])
        # two tables side by side on one header row: split where a mark column starts again
        groups: list[list[TextLine]] = [[]]
        for t in hs_all:
            nm = norm_text(t.text).strip(" :")
            if groups[-1] and len(groups[-1]) >= 4 and _MARK_HEAD.match(nm) and not _upper_word(lines, t):
                groups.append([])
            groups[-1].append(t)
        for hs in groups:
            if len(hs) < 4:
                continue
            tb = _table_from_header(lines, hs, hmax)
            if tb:
                tables.append(tb)
    return tables


def _upper_word(lines: list[TextLine], t: TextLine) -> TextLine | None:
    """The first line of a two-line header ("DOOR" over "TYPE")."""
    h = t.rect[3] - t.rect[1]
    for u in lines:
        if u is t or not (0 < t.rect[1] - u.rect[3] < 0.9 * h + 3):
            continue
        if min(u.rect[2], t.rect[2]) - max(u.rect[0], t.rect[0]) > 0.5 * min(u.rect[2] - u.rect[0], t.rect[2] - t.rect[0]):
            if _UPPER_HEADER.match(norm_text(u.text).strip(" :")):
                return u
    return None


def _table_from_header(lines: list[TextLine], hs: list[TextLine], hmax: float) -> Table | None:
    y0 = min(t.rect[1] for t in hs)
    y1 = max(t.rect[3] for t in hs)
    cols = []
    for i, t in enumerate(hs):
        x0 = (hs[i - 1].rect[2] + t.rect[0]) / 2 if i > 0 else t.rect[0] - 40
        x1 = (t.rect[2] + hs[i + 1].rect[0]) / 2 if i + 1 < len(hs) else t.rect[2] + 120
        name = norm_text(t.text).strip(" :").upper()
        up = _upper_word(lines, t)
        if up is not None:
            name = f"{norm_text(up.text).strip(' :').upper()} {name}"
            y0 = min(y0, up.rect[1])
        cols.append((name, x0, x1))
    # a later column with the same name gets a suffix so cells don't merge ("TYPE" twice)
    seen: dict[str, int] = {}
    for i, (n, a, b) in enumerate(cols):
        seen[n] = seen.get(n, 0) + 1
        if seen[n] > 1:
            cols[i] = (f"{n} {seen[n]}", a, b)
    above = [t for t in lines if y0 - 60 <= t.rect[3] <= y0 and t.rect[0] < cols[-1][2] and t.rect[2] > cols[0][1] and t.size >= hs[0].size]
    above.sort(key=lambda t: -t.rect[3])
    title = above[0].text.strip() if above else ""
    rh = hs[0].rect[3] - hs[0].rect[1]
    body = [t for t in lines if t.rect[1] > y1 and cols[0][1] <= t.rect[0] <= cols[-1][2] and t.size < hmax]
    body.sort(key=lambda t: t.rect[1])
    rows: list[dict] = []
    cur_y = y1
    for t in body:
        if t.rect[1] - cur_y > 4.5 * rh and rows:
            break
        if HEADER_WORDS.match(norm_text(t.text).strip(" :")) and sum(1 for u in body if abs(u.rect[1] - t.rect[1]) < 3 and HEADER_WORDS.match(norm_text(u.text).strip(" :"))) >= 4:
            break
        cur_y = max(cur_y, t.rect[3])
        cx = (t.rect[0] + t.rect[2]) / 2
        col = next((c[0] for c in cols if c[1] <= cx < c[2]), None)
        if col is None:
            continue
        row = next((r for r in rows if abs(r["y"] - t.rect[1]) < rh * 0.6), None)
        if row is None:
            row = {"y": t.rect[1], "rect": [t.rect[0], t.rect[1], t.rect[2], t.rect[3]], "cells": {}}
            rows.append(row)
        row["cells"][col] = (row["cells"].get(col, "") + " " + t.text.strip()).strip()
        r = row["rect"]
        r[0], r[1], r[2], r[3] = min(r[0], t.rect[0]), min(r[1], t.rect[1]), max(r[2], t.rect[2]), max(r[3], t.rect[3])
    if not rows:
        return None
    trect = [cols[0][1], y0, cols[-1][2], max(r["rect"][3] for r in rows)]
    return Table(title, [cols[0][1], y0, cols[-1][2], y1], cols, rows, trect)


_MARK_COLS = ("MARK", "NO.", "NO", "NUMBER", "DOOR", "DOOR NO.", "DOOR NO", "DOOR NUMBER", "OPENING", "WINDOW", "TAG", "TYPE", "LABEL")
_SIZE_COLS = ("WIDTH", "HEIGHT", "SIZE", "SIZE WXH", "SIZE W X H", "MATERIAL", "TYPE MATERIAL", "MATL", "MATL.", "FRAME", "GLAZING", "GLASS", "FRAME TYPE", "DOOR TYPE", "PANEL MATERIAL", "DOOR MATERIAL", "FRAME MATERIAL")


def is_schedule_table(tb: "Table") -> bool:
    names = [c[0] for c in tb.columns]
    return any(n in names for n in _MARK_COLS) and sum(1 for n in names if n in _SIZE_COLS) >= 2


def read_tables(pg: fitz.Page, sheet: str) -> list[ScheduleEntry]:
    out: list[ScheduleEntry] = []
    for tb in find_tables(pg):
        if not is_schedule_table(tb):
            continue
        names = [c[0] for c in tb.columns]
        mark_col = next((n for n in _MARK_COLS if n in names), names[0])
        pending: ScheduleEntry | None = None
        for row in tb.rows:
            mark = row["cells"].get(mark_col, "").strip()
            if mark and MARK_RE.match(mark):
                e = ScheduleEntry(mark=mark, sheet=sheet, page=pg.number, layout="tabular", cells=dict(row["cells"]),
                                  table=tb.title, mark_rect=list(row["rect"]), label_rect=list(row["rect"]))
                _size_from_cells(e)
                out.append(e)
                pending = e
            elif pending is not None and row["cells"]:
                # continuation line of the previous row (wrapped remarks)
                for k, v in row["cells"].items():
                    pending.cells[k] = (pending.cells.get(k, "") + " " + v).strip()
                r = pending.label_rect
                r[3] = max(r[3], row["rect"][3])
    return out


def _size_from_cells(e: ScheduleEntry) -> None:
    c = {k.upper(): v for k, v in e.cells.items()}
    w = parse_dim(c.get("WIDTH", "")) if c.get("WIDTH") else None
    h = parse_dim(c.get("HEIGHT", "")) if c.get("HEIGHT") else None
    if w is None or h is None:
        for k in ("SIZE W X H", "SIZE WXH", "SIZE", "SIZE W×H"):
            if c.get(k):
                w2, h2 = _size_from_text(c[k])
                w = w if w is not None else w2
                h = h if h is not None else h2
    e.w_in, e.h_in = w, h


def read_schedule_sheet(pg: fitz.Page, sheet: str, default_ppf: float = 18.0) -> list[ScheduleEntry]:
    """All layouts; tabular entries first (they carry explicit sizes), then pictorial, then captioned."""
    tab = read_tables(pg, sheet)
    pic = read_pictorial(pg, sheet, default_ppf)
    have = {e.mark for e in tab}
    out = tab + [e for e in pic if e.mark not in have]
    if not pic and not tab:
        # captioned elevations only where the sheet has no pictorial / tabular schedule
        out += read_captioned(pg, sheet, default_ppf)
    return out


# ── Door / frame type drawings (letters under elevations, "DOOR TYPES") ──────

def type_drawings(pg: fitz.Page, min_size_ratio: float = 2.0) -> dict[str, dict]:
    """
    {"A": {"rect": [...], "w_in", "h_in", "bays", "rows", "look": "sectional|single|pair|glass-lite|flush"}}
    for the big single-letter / short labels under door-type and frame-type
    drawings.  The look is read from the vector geometry (panel lines) so a
    type whose drawing is a sectional overhead door can be flagged even when
    nobody wrote the words.
    """
    from collections import Counter
    L = [t for t in text_lines(pg) if not t.vertical]
    body = Counter(round(t.size, 1) for t in L if len(t.text) > 2).most_common(1)[0][0] if L else 9.0
    labels = [t for t in L if re.fullmatch(r"[A-Z]{1,2}\d?|F\d{1,2}|\d{1,2}", t.text.strip()) and t.size >= body * min_size_ratio
              and t.rect[0] < pg.rect.width * 0.9]
    out: dict[str, dict] = {}
    for t in labels:
        frames = type_frames(pg, (t.rect[0], t.rect[1]), t.rect[0] + 400, floor_tol=90, up=500)
        if not frames:
            continue
        fr = frames[0]
        xs, ys = mullion_positions(pg, fr, span_frac=0.9)
        look = "flush"
        if len(ys) >= 3 and len(xs) == 0:
            look = "sectional"
        elif len(xs) == 1 and fr.width > fr.height * 0.6:
            look = "pair"
        elif len(xs) >= 1 or len(ys) >= 1:
            look = "divided"
        out[t.text.strip()] = {"rect": [round(v, 1) for v in fr], "bays": len(xs) + 1, "rows": len(ys) + 1,
                               "look": look, "label_rect": [round(v, 1) for v in t.rect]}
    return out


# ── Captioned types (Curtis A7.21: tag under the drawing, caption under the tag) ──

def read_captioned(pg: fitz.Page, sheet: str, default_ppf: float = 18.0) -> list[ScheduleEntry]:
    """
    Glazing-assembly / frame-type elevations where each drawing has a tag
    (hexagon / circle) under it and a caption under the tag:
          [ drawing ]
          (SAB)  40 Thus
          2" X 4.5" ALUMINUM STOREFRONT NON-INSULATED
    Only tags whose caption names glazing are kept.
    """
    from .tags import find_tags
    from .classify import is_glazing_text
    from .pdfgeom import rect_candidates, union_adjacent
    L = [t for t in text_lines(pg) if not t.vertical]
    out: list[ScheduleEntry] = []
    seen: set[str] = set()
    for t in find_tags(pg, kinds=("hexagon", "circle", "pill", "diamond")):
        sh = fitz.Rect(t.shape)
        cx = (sh.x0 + sh.x1) / 2
        cap = [u for u in L if 0 <= u.rect[1] - sh.y1 < 60 and abs((u.rect[0] + u.rect[2]) / 2 - cx) < 140 and len(u.text.strip()) > 3]
        cap.sort(key=lambda u: u.rect[1])
        kept = []
        prev = sh.y1
        for u in cap:
            if u.rect[1] - prev > 18:
                break
            kept.append(u)
            prev = u.rect[3]
        text = [u.text.strip() for u in kept]
        if not text or not is_glazing_text(" ".join(text)):
            continue
        mark = t.text
        if mark in seen:
            continue
        seen.add(mark)
        e = ScheduleEntry(mark=mark, sheet=sheet, page=pg.number, layout="captioned", text=text,
                          mark_rect=[round(v, 1) for v in sh])
        e.label_rect = [round(min([sh.x0] + [u.rect[0] for u in kept]) - 3, 1), round(sh.y0 - 2, 1),
                        round(max([sh.x1] + [u.rect[2] for u in kept]) + 3, 1), round(max(u.rect[3] for u in kept) + 2, 1)]
        # the drawing: closed rectangles just above the tag, overlapping it horizontally
        win = fitz.Rect(cx - 320, sh.y0 - 520, cx + 320, sh.y0 - 4)
        rc = dedupe(rect_candidates(pg, win, minlen=12))
        fr = _pane_cluster(rc, sh)
        if fr is not None:
            fr = _snap_out(pg, fr)
            dims = sorted({d for d in (parse_dim(u.text) for u in text_lines(pg)
                                       if fitz.Rect(fr.x0 - 140, fr.y0 - 140, fr.x1 + 140, fr.y1 + 20).intersects(u.r)) if d})
            e.dims_in = dims
            e.ppf_scores = scale_scores([fr], dims)
            e.text_ppf = region_ppf(pg, fr, None)
            e.ppf = e.text_ppf or default_ppf
            xs, ys = mullion_positions(pg, fr)
            e.frames.append({"rect": [round(v, 1) for v in fr], "w_in": round(fr.width / e.ppf * 12, 2),
                             "h_in": round(fr.height / e.ppf * 12, 2), "bays": len(xs) + 1, "rows": len(ys) + 1,
                             "mullions_x": [round(x, 1) for x in xs], "mullions_y": [round(y, 1) for y in ys]})
            e.w_in, e.h_in = e.frames[0]["w_in"], e.frames[0]["h_in"]
        else:
            e.flags.append("no elevation drawing found above the tag")
        out.append(e)
    _resolve_scales(out, default_ppf)
    for e in out:
        _dims_override(e)
    return out


def _dims_override(e: "ScheduleEntry") -> None:
    """
    Captioned elevations: when the drawn width/height is a few inches off the
    nearest overall dimension string (door bays have no pane, so the pane
    cluster stops short), take the dimension and say so.
    """
    if not e.frames or not e.dims_in:
        return
    f = e.frames[0]
    for key in ("w_in", "h_in"):
        v = f[key]
        near = [d for d in e.dims_in if 0.85 * v <= d <= 1.25 * v]
        if not near:
            continue
        d = min(near, key=lambda d: abs(d - v))
        if 1.0 < abs(d - v) <= max(8.0, 0.12 * v):
            f[key] = d
            e.flags.append(f"{'width' if key == 'w_in' else 'height'} {fmt_in(d)} from dimension string (drawing measured {fmt_in(v)})")
    e.w_in, e.h_in = f["w_in"], f["h_in"]


def _pane_cluster(rects: list, tag: "fitz.Rect", gap: float = 8.0):
    """
    The elevation above a tag = the connected group of panes (closed rects that
    touch or nearly touch), seeded by the pane nearest above the tag.  Works when
    the outer frame lines are broken at every mullion/transom.
    """
    cx = (tag.x0 + tag.x1) / 2
    above = [r for r in rects if r.y1 <= tag.y0 + 2]
    if not above:
        return None
    seed_c = [r for r in above if r.x0 - 60 <= cx <= r.x1 + 60]
    if not seed_c:
        return None
    seed = min(seed_c, key=lambda r: (tag.y0 - r.y1) + 0.2 * abs((r.x0 + r.x1) / 2 - cx))
    if tag.y0 - seed.y1 > 160:
        return None
    group = [seed]
    u = fitz.Rect(seed)
    changed = True
    while changed:
        changed = False
        for r in above:
            if r in group:
                continue
            g = fitz.Rect(u.x0 - gap, u.y0 - gap, u.x1 + gap, u.y1 + gap)
            if g.intersects(r) and any(fitz.Rect(q.x0 - gap, q.y0 - gap, q.x1 + gap, q.y1 + gap).intersects(r) for q in group):
                group.append(r)
                u |= r
                changed = True
    return u


def _snap_out(pg, u: "fitz.Rect", reach: float = 7.0) -> "fitz.Rect":
    """Grow a pane cluster to the frame's outer lines (jambs / head / sill members just outside it)."""
    from .pdfgeom import long_lines
    W = fitz.Rect(u.x0 - reach - 1, u.y0 - reach - 1, u.x1 + reach + 1, u.y1 + reach + 1)
    vs, hs = long_lines(pg, W, minlen=min(u.height, u.width) * 0.5)
    x0 = min([x for x, a, b in vs if u.x0 - reach <= x <= u.x0 and (b - a) >= 0.5 * u.height] + [u.x0])
    x1 = max([x for x, a, b in vs if u.x1 <= x <= u.x1 + reach and (b - a) >= 0.5 * u.height] + [u.x1])
    y0 = min([y for y, a, b in hs if u.y0 - reach <= y <= u.y0 and (b - a) >= 0.5 * u.width] + [u.y0])
    y1 = max([y for y, a, b in hs if u.y1 <= y <= u.y1 + reach and (b - a) >= 0.5 * u.width] + [u.y1])
    return fitz.Rect(x0, y0, x1, y1)
