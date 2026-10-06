"""
sheet_index.py — sheet number, title and category for every page, from the
title block text (no model).

    index = build_index(doc)      -> list[SheetInfo]
    SheetInfo(page, sheet, title, category, discipline, rotation, ppf)

Sheet number = the largest text in the lower-right title block that looks
like a sheet number ("A1.2", "A-6.1", "AD101", "S-201", "CS-1").
Title = lines under a "Sheet Title" / "Sheet Name" label when there is one,
else the mid-size text column directly above the sheet number.
Category comes from title keywords (the read order is schedules → plans →
elevations → details, per Martin), discipline from the sheet prefix.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, asdict

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

from .pdfgeom import text_lines, TextLine

SHEET_RE = re.compile(r"^(?P<disc>[A-Z]{1,3})\s?-?\s?(?P<num>\d{1,3}(?:[.\-]\d{1,3})?(?:[A-Za-z]{1,2}\d?)?)$")
_TITLE_LABEL = re.compile(r"^(SHEET\s*(TITLE|NAME)|DRAWING\s*TITLE|TITLE)\s*[:#]?$", re.I)
_LABELS = re.compile(r"^(SHEET|DATE|PROJECT|DRAWN|CHECKED|SCALE|JOB|REVISION|ISSUE|PROFESSIONAL|SEAL|STAMP|NO\.?|#|PROJECT NUMBER|SHEET #)\b.*[:#]?$", re.I)

CATEGORIES = ("schedule", "legend", "plan", "elevation", "detail", "section", "enlarged", "cover", "other", "unknown")


@dataclass
class SheetInfo:
    page: int
    sheet: str
    title: str
    category: str
    categories: list
    discipline: str
    rotation: int
    width: float
    height: float

    def to_dict(self) -> dict:
        return asdict(self)


_NOT_PLAN = re.compile(r"CEILING|ROOF|SITE|FINISH|FURNITURE|EQUIPMENT|DEMO|MILLWORK|LANDSCAPE|GRADING|UTILITY|FRAMING|FOUNDATION|ELECTRICAL|PLUMBING|MECHANICAL|HVAC|LIGHTING|POWER|LIFE SAFETY|CODE|EGRESS|SLAB|PAVING|DRAINAGE|DEVELOPMENT|PHOTOMETRIC|IRRIGATION|PENETRATION|GAS|WASTE|WATER|PIPING|VOLTAGE|EROSION")


def categorize_all(title: str, sheet: str = "") -> list[str]:
    """Every category a title claims, in read-order priority.  'other' when none."""
    t = (title or "").upper()
    cats: list[str] = []
    if "COVER" in t or sheet.upper().startswith(("CS", "G0", "G-0", "T1", "T-1")):
        cats.append("cover")
    if "SCHEDULE" in t or re.search(r"\bTYPES\b|HARDWARE SETS?", t):
        cats.append("schedule")
    if "LEGEND" in t:
        cats.append("legend")
    if re.search(r"(?<!ENLARGED )PLANS?\b(?!\s*DETAIL)", t) and not _NOT_PLAN.search(t):
        cats.append("plan")
    if "ELEVATION" in t:
        cats.append("elevation")
    if "ENLARGED" in t:
        cats.append("enlarged")
    if "DETAIL" in t:
        cats.append("detail")
    if "SECTION" in t:
        cats.append("section")
    return cats or ["other"]


def categorize(title: str, sheet: str = "") -> str:
    return categorize_all(title, sheet)[0]


def _title_block(pg: fitz.Page) -> fitz.Rect:
    W, H = pg.rect.width, pg.rect.height
    return fitz.Rect(W * 0.78, H * 0.70, W, H)


def read_sheet(pg: fitz.Page) -> SheetInfo:
    blk = _title_block(pg)
    tl = [t for t in text_lines(pg) if blk.intersects(t.r) and not t.vertical]
    # sheet number: largest font that matches SHEET_RE
    cands = [t for t in tl if SHEET_RE.match(t.text.replace(" ", "")) and len(t.text) <= 10]
    sheet = ""
    num: TextLine | None = None
    if cands:
        cands.sort(key=lambda t: (-t.size, -t.rect[1]))
        num = cands[0]
        sheet = num.text.replace(" ", "")
    # also try the right strip for vertical title blocks
    if not num:
        W, H = pg.rect.width, pg.rect.height
        strip = fitz.Rect(W * 0.90, 0, W, H)
        tl2 = [t for t in text_lines(pg) if strip.intersects(t.r)]
        cands = [t for t in tl2 if SHEET_RE.match(t.text.replace(" ", "")) and len(t.text) <= 10]
        if cands:
            cands.sort(key=lambda t: -t.size)
            num = cands[0]
            sheet = num.text.replace(" ", "")
            tl = tl2
    title = _title(tl, num)
    disc = SHEET_RE.match(sheet).group("disc") if sheet and SHEET_RE.match(sheet) else ""
    cats = categorize_all(title, sheet)
    if not title:
        # no sheet title in the title block (Hope): use the drawing titles on the sheet
        dts = drawing_titles(pg)
        if dts:
            title = " / ".join(dts[:4])
            cats = []
            for t in dts:
                for c in categorize_all(t, sheet):
                    if c not in cats and c != "other":
                        cats.append(c)
            cats = cats or ["other"]
        else:
            cats = ["unknown"]
    return SheetInfo(pg.number, sheet, title, cats[0], cats, disc, pg.rotation,
                     pg.rect.width, pg.rect.height)


def _title(tl: list[TextLine], num: TextLine | None) -> str:
    if num is None:
        return ""
    label = [t for t in tl if _TITLE_LABEL.match(t.text.strip())]
    lines: list[TextLine] = []
    if label:
        lab = label[0]
        # titles are often centred under the label: take lines whose centre is near the label's centre,
        # stopping at the next label ("SHEET NO.") below
        lcx = (lab.rect[0] + lab.rect[2]) / 2
        nxt = [t for t in tl if t is not lab and t.rect[1] > lab.rect[3] and _LABELS.match(t.text.strip())
               and abs((t.rect[0] + t.rect[2]) / 2 - lcx) < 120]
        ystop = min([t.rect[1] for t in nxt] + [lab.rect[3] + 100])
        x0, x1 = lab.rect[0] - 160, lab.rect[0] + 260
        lines = [t for t in tl if lab.rect[3] - 2 <= t.rect[1] < ystop and abs((t.rect[0] + t.rect[2]) / 2 - lcx) < 110
                 and x0 <= t.rect[0] <= x1 and t is not lab and not _LABELS.match(t.text)
                 and t.size >= 9 and not re.fullmatch(r"[\d./\-\s]+", t.text.strip())]
    if not lines:
        # text column above the sheet number, mid-size, contiguous
        nx0, nx1 = num.rect[0] - 40, num.rect[2] + 40
        col = [t for t in tl if t.rect[3] <= num.rect[1] + 2 and t.rect[1] >= num.rect[1] - 260
               and t.rect[2] >= nx0 and t.rect[0] <= nx1 and 11 <= t.size < num.size
               and not _LABELS.match(t.text) and t is not num]
        col.sort(key=lambda t: -t.rect[1])   # nearest the number first
        prev = None
        for t in col:
            if prev is not None and prev.rect[1] - t.rect[3] > 1.6 * (t.rect[3] - t.rect[1]):
                break
            lines.append(t)
            prev = t
    lines.sort(key=lambda t: (round(t.rect[1]), t.rect[0]))
    title = " ".join(t.text.strip() for t in lines)
    title = re.sub(r"\s+", " ", title).replace(" - ", " - ").strip(" -:")
    return title


def drawing_titles(pg: fitz.Page) -> list[str]:
    """Title-tier text on the drawing area (largest first): 'FIRST FLOOR PLAN - AREA A', 'DOOR TYPES' …"""
    from collections import Counter
    L = [t for t in text_lines(pg) if not t.vertical and t.rect[0] < pg.rect.width * 0.9]
    if not L:
        return []
    body = Counter(round(t.size, 1) for t in L if len(t.text) > 2).most_common(1)[0][0]
    big = [t for t in L if t.size >= body * 1.6 and len(t.text) > 5 and re.search(r"[A-Z]{3}", t.text)
           and not re.search(r"SCALE|COPYRIGHT|^\d", t.text, re.I)]
    big.sort(key=lambda t: (-t.size, t.rect[1]))
    out: list[str] = []
    for t in big:
        txt = re.sub(r"\s+", " ", t.text.strip())
        if txt not in out:
            out.append(txt)
    return out


def build_index(doc: fitz.Document) -> list[SheetInfo]:
    out = [read_sheet(doc[i]) for i in range(len(doc))]
    # fill blank titles from a cover-sheet index ("A-1.1  FLOOR PLAN") when present
    cover = [s for s in out if s.category == "cover" or s.sheet.upper().startswith(("CS", "G-", "G0", "G1"))]
    if cover and any(not s.title for s in out):
        lut = _cover_index(doc[cover[0].page])
        for s in out:
            if not s.title and s.sheet in lut:
                s.title = lut[s.sheet]
                s.categories = categorize_all(s.title, s.sheet)
                s.category = s.categories[0]
    return out


def _cover_index(pg: fitz.Page) -> dict[str, str]:
    lut: dict[str, str] = {}
    tl = text_lines(pg)
    nums = [t for t in tl if SHEET_RE.match(t.text.replace(" ", "")) and t.size < 14]
    for n in nums:
        right = [t for t in tl if abs(t.rect[1] - n.rect[1]) < 4 and n.rect[2] < t.rect[0] < n.rect[2] + 60 and len(t.text) > 3]
        if right:
            right.sort(key=lambda t: t.rect[0])
            lut[n.text.replace(" ", "")] = right[0].text.strip()
    return lut


def arch_sheets(index: list[SheetInfo]) -> list[SheetInfo]:
    """Sheets worth reading for glazing: architectural disciplines."""
    return [s for s in index if s.discipline.upper() in ("A", "AD", "AE", "AS", "AI", "ID", "G", "GI", "A1", "A2")]
