"""
spec_check.py — read the Division 08 specs and cross-check them against the
drawings / auto-takeoff.  Deterministic (regex + the series catalog), no model
calls, every fact cited to its section and page.

    spec = read_specs(pdf_path, pages=None)
        → {"sections": [...], "facts": [...], "source": ..., "has_div08": bool}
          Works on a project manual (one section per few pages) and on spec
          SHEETS inside a drawing set (several sections per page, G-series).
    hits = drawing_mentions(drawings_pdf)          finish / glass-type lines on the drawings
    out  = cross_check(spec, takeoff_result, hits) → conflicts + scope hints
    alts = find_alternates(pdf_path, pages=None)   alternates that touch glazing

Fact topics: manufacturer, series, basis_of_design, substitutions, finish, glass,
hardware, engineering, field_test, mockup, warranty, qualification, heat_soak,
extra_stock, thermal, security, placeholder, by_others.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24.3
    import fitz

from .classify import _match_series

# ── Sections ──────────────────────────────────────────────────────────────────

# Glazing contractor's sections (MasterFormat 2016) → the takeoff classes they cover
SECTION_CLASSES: dict[str, tuple[str, list[str]]] = {
    "081116": ("Aluminum doors and frames", ["int_sf", "int_sf_door", "alum_frame_only"]),
    "084113": ("Storefronts and entrances", ["ext_sf", "int_sf", "ext_sf_door", "int_sf_door", "fire_rated_sf"]),
    "084126": ("All-glass entrances and storefronts", ["all_glass_wall", "all_glass_door"]),
    "084213": ("Aluminum-framed entrances", ["ext_sf_door", "int_sf_door", "ext_cw_door", "int_cw_door"]),
    "084226": ("All-glass entrances", ["all_glass_door", "all_glass_wall"]),
    "084229": ("Automatic entrances", ["auto_door"]),
    "084233": ("Revolving doors", ["revolving_door"]),
    "084413": ("Glazed aluminum curtain walls", ["ext_cw", "int_cw", "ext_cw_door", "int_cw_door"]),
    "084423": ("Structural-sealant-glazed curtain walls", ["ext_cw", "int_cw"]),
    "084433": ("Sloped glazing", ["skylight"]),
    "084513": ("Translucent wall assemblies", ["translucent_panel"]),
    "084523": ("Translucent assemblies", ["translucent_panel"]),
    "085113": ("Aluminum windows", ["window"]),
    "085213": ("Aluminum windows", ["window"]),
    "085619": ("Pass windows", ["transaction_window"]),
    "085653": ("Security windows", ["transaction_window", "br_transaction_window"]),
    "085680": ("Service windows", ["transaction_window"]),
    "086200": ("Unit skylights", ["skylight"]),
    "086300": ("Metal-framed skylights", ["skylight"]),
    "088000": ("Glazing", []),
    "088300": ("Mirrors", ["mirror"]),
    "088700": ("Glazing surface films", ["glass_film"]),
    "088813": ("Fire-rated glazing", ["fire_rated_glazing", "fire_rated_door", "fire_rated_sf"]),
    "088853": ("Security glazing", ["br_transaction_window"]),
    "088856": ("Security glazing", ["br_transaction_window"]),
}

# Sections that touch our scope but belong to someone else — scope-letter hints
RELATED_SECTIONS: dict[str, str] = {
    "081113": "Hollow metal frames — vision lites are glass-only scope for us",
    "081213": "Hollow metal frames — vision lites are glass-only scope for us",
    "081416": "Wood doors — vision lites are glass-only scope for us",
    "082000": "Wood doors — vision lites are glass-only scope for us",
    "087100": "Door hardware — confirm who furnishes hardware on aluminum doors",
    "076200": "Sheet metal flashing and trim — sill flashing and break metal at our frames are still ours",
    "055213": "Railings — glass infill may be ours; railing system is Division 05",
    "057300": "Decorative railings — glass infill may be ours",
    "057313": "Glazed decorative railings — check who carries the glass",
    "102800": "Toilet accessories — Bobrick mirrors are Division 10, frameless mirrors are ours",
    "107113": "Sunshades — ours only when integral to the curtain wall / storefront",
    "079200": "Joint sealants — perimeter sealant at our frames is usually ours",
    "012300": "Alternates",
    "012100": "Allowances",
}

_TITLE_OURS = re.compile(r"GLAZ|GLASS|MIRROR|CURTAIN\s*WALL|STOREFRONT|SKYLIGHT|TRANSLUCENT|"
                         r"ALUMINUM[- ](?:FRAMED|DOORS?|WINDOWS?|ENTRANCE)|ENTRANCES?\b|WINDOWS?\b", re.I)
_TITLE_NOT = re.compile(r"HOLLOW METAL|WOOD|FIBERGLASS|OVERHEAD|COILING|SECTIONAL|ACCESS|LOUVER|HARDWARE|"
                        r"STAIR|ROOF HATCH|COLD STORAGE|TRAFFIC|STRIP CURTAIN|VINYL|CLAD", re.I)

_HEADER = re.compile(
    r"\bSECTION\s+(\d{2})\s?(\d{2})\s?(\d{2})(?:\s?\.\s?(\d{2}))?\s*[-–—:]\s*"
    r"([A-Z][A-Z0-9 ,&/'().\-]{3,110})", re.I)


def _csi(m: re.Match) -> str:
    base = f"{m.group(1)} {m.group(2)} {m.group(3)}"
    return base + (f".{m.group(4)}" if m.group(4) else "")


def _clean_title(raw: str) -> str:
    # stop at the first outline marker / lowercase word (the body)
    words = []
    for w in raw.split():
        if re.fullmatch(r"[A-H1-9]\.|PART", w) or re.search(r"[a-z]", w):
            break
        words.append(w)
    t = " ".join(words).strip(" -.,")
    return t


@dataclass
class Section:
    csi: str
    key: str                  # digits only, 6 (sub-number dropped)
    title: str
    page: int                 # first page
    page_end: int
    start: int                # offsets into the joined text
    end: int
    ours: bool
    covers: list = field(default_factory=list)
    related: str | None = None

    def to_dict(self) -> dict:
        d = asdict(self)
        d.pop("start"); d.pop("end")
        return d


def _join_pages(doc, pages) -> tuple[str, list[int]]:
    parts, starts, pos = [], [], 0
    for p in pages:
        t = re.sub(r"\s+", " ", doc[p].get_text()) + " "
        starts.append(pos)
        parts.append(t)
        pos += len(t)
    return "".join(parts), starts


def _page_at(starts: list[int], pages: list[int], off: int) -> int:
    lo, hi = 0, len(starts) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if starts[mid] <= off:
            lo = mid
        else:
            hi = mid - 1
    return pages[lo]


def find_sections(text: str, starts: list[int], pages: list[int]) -> list[Section]:
    heads = []
    for m in _HEADER.finditer(text):
        # a reference ("…specified in Section 08 80 00 "Glazing."") is quoted / lower-case — not a header
        title = _clean_title(m.group(5))
        if len(title) < 4 or not re.search(r"[A-Z]{3}", title):
            continue
        heads.append((m.start(), _csi(m), title))
    out: list[Section] = []
    for i, (s, csi, title) in enumerate(heads):
        e = heads[i + 1][0] if i + 1 < len(heads) else len(text)
        eos = re.search(r"END\s+OF\s+SECTION", text[s:e], re.I)
        if eos:
            e = s + eos.end()
        key = csi.replace(" ", "")[:6]
        covers = SECTION_CLASSES.get(key, ("", []))[1]
        ours = key in SECTION_CLASSES or (bool(_TITLE_OURS.search(title)) and not _TITLE_NOT.search(title) and key.startswith("08"))
        out.append(Section(csi=csi, key=key, title=title, page=_page_at(starts, pages, s),
                           page_end=_page_at(starts, pages, max(s, e - 1)), start=s, end=e, ours=ours,
                           covers=list(covers), related=RELATED_SECTIONS.get(key)))
    # a section listed more than once (table of contents, running headers): keep the longest
    best: dict[str, Section] = {}
    for sec in out:
        b = best.get(sec.key)
        if b is None or (sec.end - sec.start) > (b.end - b.start):
            best[sec.key] = sec
    return sorted(best.values(), key=lambda s: s.start)


# ── Facts ─────────────────────────────────────────────────────────────────────

MANUFACTURERS: dict[str, str] = {
    # framing
    r"KAWNEER": "Kawneer", r"TUBELITE": "Tubelite", r"YKK": "YKK AP", r"EFCO": "EFCO",
    r"OLDCASTLE|\bOBE\b|BUILDING\s?ENVELOPE": "Oldcastle BuildingEnvelope", r"ARCADIA": "Arcadia",
    r"VISTAWALL": "Vistawall", r"U\.?\s?S\.? ALUMINUM": "US Aluminum", r"C\.?\s?R\.? LAURENCE|\bCRL\b": "C.R. Laurence",
    r"WAUSAU": "Wausau", r"CORAL ARCHITECTURAL": "Coral", r"MANKO": "Manko", r"WINCO": "Winco",
    r"GRAHAM ARCHITECTURAL": "Graham", r"TRACO": "Traco", r"PITCO": "PITCO", r"\bHYDRO\b|\bSAPA\b": "Hydro",
    r"SPECIAL[- ]LITE": "Special-Lite", r"MON[- ]RAY": "Mon-Ray", r"\bRACO\b": "RACO", r"WESTERN INTEGRATED": "Western Integrated",
    # glass
    r"VITRO|\bPPG\b": "Vitro", r"GUARDIAN": "Guardian", r"VIRACON": "Viracon", r"CARDINAL GLASS": "Cardinal",
    r"PILKINGTON": "Pilkington", r"\bAGC\b": "AGC", r"SAINT[- ]GOBAIN": "Saint-Gobain",
    # fire-rated / security
    r"TECHNICAL GLASS PRODUCTS|\bTGP\b|FIRELITE": "TGP", r"SAFTI": "SAFTI FIRST", r"VETROTECH": "Vetrotech",
    r"SCHOTT": "Schott", r"TOTAL SECURITY|ARMORTEX|INSULGARD": "security glazing maker",
    # automatic / all-glass
    r"STANLEY": "Stanley", r"HORTON": "Horton", r"BESAM|ASSA ABLOY": "ASSA ABLOY", r"RECORD[- ]USA|RECORD AUTOMATIC|RECORD-USA": "Record",
    r"DORMA|DORMAKABA": "dormakaba", r"TORMAX": "Tormax", r"NABCO": "Nabco",
    # translucent / skylights
    r"KALWALL": "Kalwall", r"CPI DAYLIGHTING|\bCPI\b": "CPI Daylighting", r"MAJOR INDUSTRIES": "Major Industries",
    r"VELUX": "VELUX", r"WASCO": "Wasco",
    # mirrors
    r"BOBRICK": "Bobrick",
}
FRAMING = {"Kawneer", "Tubelite", "YKK AP", "EFCO", "Oldcastle BuildingEnvelope", "Arcadia", "Vistawall",
           "US Aluminum", "C.R. Laurence", "Wausau", "Coral", "Manko", "Winco", "Graham", "Traco", "PITCO", "Hydro",
           "Special-Lite", "Mon-Ray", "RACO", "Western Integrated"}
OUR_MAKERS = {"Kawneer", "Tubelite"}

_OR_EQUAL = re.compile(r"or\s+(?:an?\s+)?(?:architect[- ]?)?(?:approved\s+)?(?:equal|equivalent|similar)|"
                       r"substitutions?\s+(?:will\s+be\s+|are\s+)?(?:permitted|considered|accepted)|comparable product", re.I)
_CLOSED = re.compile(r"no\s+substitutions|substitutions?\s+(?:will\s+not|are\s+not|not)\s+(?:be\s+)?(?:permitted|allowed|accepted|considered)|"
                     r"sole\s+source|no\s+other\s+manufacturer", re.I)

TOPICS: list[tuple[str, re.Pattern]] = [
    ("basis_of_design", re.compile(r"basis[- ]of[- ]design", re.I)),
    ("placeholder", re.compile(r"\binsert\s+(?:manufacturer|drawing\s+designation|product|color|name|number)|\[insert|<insert", re.I)),
    ("finish", re.compile(r"(?:\bfinish\b[^.]{0,80}(?:anodi[sz]|anodic|aama\s*260[345]|pvdf|fluoropolymer|kynar|"
                          r"powder|painted|baked|bronze|black|champagne|clear|white|color))|anodic finish|anodized finish|"
                          r"aama\s*260[345]|aama\s*611|\bclass\s+(?:i|ii|1|2)\b[^.]{0,40}anod", re.I)),
    ("glass", re.compile(r"glass\s+type|insulating[- ]glass|\bIGU\b|low[- ]e|tinted|\btint\b|tempered|heat[- ]strengthened|"
                         r"laminated|spandrel|solarban|sunguard|\bSN\s?\d{2}|\bVE\s?1-|\bVNE|loe[- ]?\d|argon|interlayer|"
                         r"overall unit thickness|frit|bird[- ](?:safe|friendly)|low[- ]iron|starphire|optiwhite", re.I)),
    ("hardware", re.compile(r"\b(?:closers?|panic|exit\s+devices?|pivots?|continuous\s+hinges?|push(?:/|\s+)pulls?|pulls?\b|"
                            r"thresholds?|weather[- ]?strip|cylinders?|electric\s+strike|door\s+stops?|deadlocks?|"
                            r"locksets?|door\s+hardware|hardware\s+sets?)", re.I)),
    ("engineering", re.compile(r"delegated[- ]design|signed\s+and\s+sealed|structural\s+calculations|"
                               r"professional\s+engineer|engineering\s+calculations", re.I)),
    ("field_test", re.compile(r"field[- ](?:quality[- ]control\s+)?test|aama\s*50[123]|astm\s*e\s?1105|water[- ](?:spray|hose)\s+test|"
                              r"testing\s+agency\s+(?:to|shall)\s+(?:perform|test)", re.I)),
    ("mockup", re.compile(r"mock[- ]?ups?\b", re.I)),
    ("warranty", re.compile(r"warranty\s+period|(?:\d+|one|two|three|five|ten|twenty)[- ]years?\s+(?:from|after)\s+(?:date\s+of\s+)?substantial", re.I)),
    ("qualification", re.compile(r"\bNACC\b|\bAGMT\b|\bFDAI\b|egress\s+door\s+(?:assembly\s+)?inspector|"
                                 r"installer\s+(?:qualifications?|shall\s+be)|certified\s+installer", re.I)),
    ("heat_soak", re.compile(r"heat[- ]soak", re.I)),
    ("extra_stock", re.compile(r"extra\s+(?:stock\s+)?materials|attic\s+stock|maintenance\s+(?:stock|materials)", re.I)),
    ("thermal", re.compile(r"u-factor|thermally\s+(?:broken|improved|enhanced)|thermal\s+break|\bCRF\b|"
                           r"condensation\s+resistance|\bSHGC\b|solar\s+heat\s+gain", re.I)),
    ("security", re.compile(r"blast|hurricane|impact[- ]resistant|large[- ]missile|forced[- ]entry|bullet|ballistic|UL\s*752", re.I)),
    ("by_others", re.compile(r"(?:furnished|provided|installed)\s+(?:by|under)\s+(?:others|owner|section\s+\d)|\bOFCI\b|\bOFOI\b|"
                             r"not\s+in\s+contract|\bN\.?I\.?C\.?\b|by\s+(?:the\s+)?owner", re.I)),
]

_MARKER = re.compile(r"(?:(?<=\s)|^)(?:PART\s+\d|\d{1,2}\.\d{1,2}|[A-Z]|\d{1,2}|[a-z])\.?\s(?=[A-Z])")


def _clauses(text: str) -> list[tuple[int, str]]:
    """Split a section into outline clauses (A. / 1. / a. / 2.3 …) with their offsets."""
    cuts = [0] + [m.start() for m in _MARKER.finditer(text)] + [len(text)]
    out = []
    for a, b in zip(cuts, cuts[1:]):
        c = text[a:b].strip()
        if len(c) > 3:
            out.append((a, c))
    # glue tiny clauses (a dangling "1." or a page header) onto the next
    glued, carry, carry_at = [], "", None
    for off, c in out:
        if len(c) < 14 and not re.search(r"[a-z]{3}", c):
            carry, carry_at = (carry + " " + c).strip(), carry_at if carry_at is not None else off
            continue
        glued.append((carry_at if carry_at is not None else off, (carry + " " + c).strip()))
        carry, carry_at = "", None
    return glued


_COLOR = re.compile(r"\b(clear|dark\s+bronze|medium\s+bronze|light\s+bronze|bronze|black|champagne|white|"
                    r"stainless|silver|gray|grey|custom)\b", re.I)


def _values(topic: str, clause: str) -> dict:
    v: dict = {}
    up = clause.upper()
    if topic == "finish":
        v["colors"] = sorted({re.sub(r"\s+", " ", c.lower()) for c in _COLOR.findall(clause)})
        v["anodized"] = bool(re.search(r"anodi[sz]|anodic", clause, re.I))
        v["painted"] = bool(re.search(r"pvdf|fluoropolymer|kynar|aama\s*260[345]|powder|painted|baked", clause, re.I))
        m = re.search(r"aama\s*(260[345])", clause, re.I)
        if m:
            v["aama"] = m.group(1)
        if re.search(r"as selected by (?:the\s+)?architect|from manufacturer'?s full range", clause, re.I):
            v["by_architect"] = True
    elif topic == "glass":
        v["thickness"] = sorted(set(re.findall(r"\b(1/4|1/2|3/8|5/16|9/16|3/4|1|1-1/4)\s?(?:\"|inch|in\.)", clause, re.I)) |
                                set(re.findall(r"\b(\d{1,2})\s?mm\b", clause, re.I)))
        v["products"] = sorted({m.strip() for m in re.findall(
            r"(Solarban\s?(?:R)?\d{2,3}|SunGuard\s+[A-Z]{2,4}\s?\d{2}(?:/\d{2})?|SN\s?\d{2}(?:/\d{2})?|SNX\s?\d{2}(?:/\d{2})?|"
            r"VE\s?1-2M|VNE\s?\d-\d{2}|VRE\s?\d-\d{2}|LoE[- ]?\d{3}|Energy Advantage|Optiwhite|Starphire)", clause, re.I)})
        v["tint"] = sorted({c.lower() for c in re.findall(r"\b(gray|grey|bronze|green|blue|solexia|azuria|optigray|pacifica)\b", clause, re.I)})
        v["tempered"] = bool(re.search(r"tempered", clause, re.I))
        v["laminated"] = bool(re.search(r"laminated", clause, re.I))
        v["insulating"] = bool(re.search(r"insulating|\bIGU\b", clause, re.I))
        v["types"] = sorted(set(re.findall(r"\b((?:GL|GT|G|IG|IGU|TG|LG|SG|FG|SP)-?\d{1,2}[A-Z]?)\b", up)) - {"G-1"} if
                            re.search(r"type|designation", clause, re.I) else set())
    elif topic == "warranty":
        m = re.search(r"(\d+|one|two|three|five|ten|twenty)[- ]years?", clause, re.I)
        if m:
            v["years"] = m.group(1).lower()
    elif topic == "hardware":
        v["items"] = sorted({re.sub(r"\s+", " ", h.lower()).rstrip("s") for h in TOPICS[4][1].findall(clause)})
        v["in_087100"] = bool(re.search(r"08\s?71\s?00", clause))
    return v


def _facts_for(sec: Section, text: str, starts, pages) -> list[dict]:
    body = text[sec.start:sec.end]
    facts: list[dict] = []
    makers: dict[str, dict] = {}
    for off, clause in _clauses(body):
        page = _page_at(starts, pages, sec.start + off)
        cite = {"section": sec.csi, "title": sec.title, "page": page}
        short = clause[:320] + ("…" if len(clause) > 320 else "")
        for rx, name in MANUFACTURERS.items():
            if re.search(rx, clause, re.I) and name not in makers:
                makers[name] = dict(cite, text=short)
        for s in _match_series(clause):
            facts.append(dict(cite, topic="series", text=short,
                              values={"manufacturer": s.get("manufacturer"), "series": s.get("series"),
                                      "scope_class": s.get("scope_class"), "matched": s.get("matched")}))
        if _OR_EQUAL.search(clause):
            facts.append(dict(cite, topic="substitutions", text=short, values={"open": True}))
        elif _CLOSED.search(clause):
            facts.append(dict(cite, topic="substitutions", text=short, values={"open": False}))
        for topic, rx in TOPICS:
            if rx.search(clause):
                if topic == "hardware" and not sec.ours:
                    continue
                facts.append(dict(cite, topic=topic, text=short, values=_values(topic, clause)))
    for name, c in makers.items():
        facts.append(dict(c, topic="manufacturer", values={"name": name, "framing": name in FRAMING}))
    return facts


def _spec_pages(doc) -> list[int]:
    """Pages that carry spec text: every page of a project manual, spec sheets of a drawing set."""
    hits = []
    for p in doc:
        t = p.get_text()
        if len(re.findall(r"(?i)\bsection\s+\d{2}\s?\d{2}\s?\d{2}", t)) >= 1 and \
                re.search(r"(?i)\bPART\s+[123]\b|\b[A-H]\.\s+[A-Z][a-z]|SUBMITTALS|WARRANTY|MANUFACTURERS?", t):
            hits.append(p.number)
    return hits


_NOTE_SCOPE = re.compile(r"STOREFRONT|CURTAIN\s*WALL|GLAZING|GLASS|ALUMINUM\s+(?:DOOR|FRAME|ENTRANCE|WINDOW)|WINDOWS?\b|ENTRANCES?\b", re.I)
_NOTE_SPEC = re.compile(r"\bSHALL\b|\bPROVIDE\b|BASIS\s+OF\s+DESIGN|MANUFACTURED\s+BY|\bBY\s+(?:KAWNEER|TUBELITE|YKK|EFCO)|"
                        r"\bSERIES\b|OR\s+(?:APPROVED\s+)?(?:EQUAL|SIMILAR)|FINISH|ANODI", re.I)


def note_specs(doc, skip: set[int]) -> tuple[Section | None, list[dict]]:
    """Spec-like general notes on drawing sheets ("STOREFRONT SHALL BE KAWNEER TRIFAB 451T…")."""
    blocks: list[tuple[int, str]] = []
    for pg in doc:
        if pg.number in skip:
            continue
        for b in pg.get_text("blocks"):
            t = re.sub(r"\s+", " ", b[4]).strip()
            if 40 <= len(t) <= 1200 and _NOTE_SCOPE.search(t) and _NOTE_SPEC.search(t) and \
                    (_match_series(t) or re.search(r"SHALL\s+BE|BASIS\s+OF\s+DESIGN|MANUFACTURED\s+BY|FINISH|INSULAT|TEMPERED|LOW[- ]E", t, re.I)):
                blocks.append((pg.number, t))
    if not blocks:
        return None, []
    text, starts, pages, pos = "", [], [], 0
    for p, t in blocks:
        starts.append(pos); pages.append(p)
        text += t + " A. "      # each note is its own clause
        pos = len(text)
    sec = Section(csi="Drawing notes", key="notes", title="Storefront / glazing notes on the drawings",
                  page=blocks[0][0], page_end=blocks[-1][0], start=0, end=len(text), ours=True, covers=[])
    return sec, _facts_for(sec, text, starts, pages)


def read_specs(pdf_path: str, pages: list[int] | None = None) -> dict:
    doc = fitz.open(pdf_path)
    try:
        manual = len(doc) <= 3 or _looks_like_manual(doc)
        if pages is None:
            pages = list(range(len(doc))) if manual else _spec_pages(doc)
        text, starts = _join_pages(doc, pages) if pages else ("", [])
        sections = find_sections(text, starts, pages) if pages else []
        facts: list[dict] = []
        for sec in sections:
            if sec.ours or sec.key.startswith("08"):
                facts += _facts_for(sec, text, starts, pages)
        if not manual:
            nsec, nfacts = note_specs(doc, set(pages))
            if nsec:
                sections.append(nsec)
                facts += nfacts
        return {
            "pages_read": pages,
            "sections": [s.to_dict() for s in sections],
            "facts": facts,
            "has_div08": any(s.key.startswith("08") for s in sections),
        }
    finally:
        doc.close()


def _looks_like_manual(doc) -> bool:
    """A project manual (8.5x11, mostly text) rather than a drawing set."""
    r = doc[0].rect
    return max(r.width, r.height) < 1100


# ── Drawings side ─────────────────────────────────────────────────────────────

_DWG_FINISH = re.compile(r"(ANODI[SZ]|KYNAR|PVDF|FLUOROPOLYMER|AAMA\s*260[345]|POWDER\s*COAT|PAINTED\s+ALUM)", re.I)
_DWG_CONTEXT = re.compile(r"STOREFRONT|CURTAIN\s*WALL|ENTRANCE|ALUM(?:INUM|\.)?\s+(?:DOOR|FRAME|WINDOW|SYSTEM)|MULLION|WINDOW\s+FRAME|GLAZING\s+SYSTEM", re.I)
_DWG_NOT = re.compile(r"SCHLUTER|\bTRIM\b|LOUVER|RAILING|COPING|FLASHING|SHEET\s+METAL|\bPANEL|CANOPY|SIGN|TOILET|PARTITION|HANDRAIL|GRILLE", re.I)
_DWG_GLASS = re.compile(r"\b(?:GLASS|GLAZING)\s+TYPE\b|\b(?:GL|GT|IGU|TG|SG)-?\d{1,2}[A-Z]?\b\s*[:\-=]|INSULATED\s+GLASS|"
                        r"\b1\"\s*(?:INSULAT|IGU)|LOW[- ]E|TEMPERED|LAMINATED|SPANDREL|SOLARBAN|SUNGUARD", re.I)


def drawing_mentions(pdf_path: str, skip_pages: set[int] | None = None) -> dict:
    """Finish and glass lines on the drawing sheets (spec sheets excluded)."""
    skip_pages = skip_pages or set()
    out = {"finish": [], "glass": []}
    doc = fitz.open(pdf_path)
    try:
        for pg in doc:
            if pg.number in skip_pages:
                continue
            for b in pg.get_text("blocks"):
                t = re.sub(r"\s+", " ", b[4]).strip()
                if len(t) < 6 or len(t) > 400:
                    continue
                rect = [round(v, 1) for v in (fitz.Rect(b[:4]) * pg.rotation_matrix)]
                if _DWG_FINISH.search(t) and _DWG_CONTEXT.search(t) and not _DWG_NOT.search(t):
                    out["finish"].append({"page": pg.number, "rect": rect, "text": t[:240],
                                          "values": _values("finish", t)})
                if _DWG_GLASS.search(t):
                    out["glass"].append({"page": pg.number, "rect": rect, "text": t[:240],
                                         "values": _values("glass", t + " type")})
    finally:
        doc.close()
    for k in out:  # same note repeated on many sheets → keep the first few
        seen, keep = {}, []
        for h in out[k]:
            n = seen.get(h["text"], 0)
            if n < 2:
                keep.append(h)
            seen[h["text"]] = n + 1
        out[k] = keep[:80]
    return out


# ── Alternates ────────────────────────────────────────────────────────────────

_ALT = re.compile(r"\b(?:ADD(?:ITIVE)?|DEDUCT(?:IVE)?|BID)\s+ALTERNATE\s*(?:NO\.?|NUMBER|#)?\s*([0-9]{1,2}|[A-Z](?![A-Z]))?|"
                  r"\bALTERNATE\s*(?:NO\.?|NUMBER|#)\s*([0-9]{1,2}|[A-Z](?![A-Z]))|\bALTERNATE\s+([0-9]{1,2})\b(?!\s*(?:MM|IN|\"|'))|"
                  r"\bALT\.?\s*(?:NO\.?|#)\s*(\d{1,2})|\bALTERNATE\s+([A-Z])\s*[:\-\u2013]", re.I)
_GLAZ = re.compile(r"STOREFRONT|CURTAIN\s*WALL|GLASS|GLAZ|WINDOW|ENTRANCE|SKYLIGHT|MIRROR|ALUMINUM\s+(?:DOOR|FRAME)|"
                   r"TRANSLUCENT|FILM|SUNSHADE|CANOPY|LOUVER|DOORS?\b", re.I)


def find_alternates(pdf_path: str, pages: list[int] | None = None) -> list[dict]:
    out = []
    doc = fitz.open(pdf_path)
    try:
        for pg in doc:
            if pages is not None and pg.number not in pages:
                continue
            for b in pg.get_text("blocks"):
                t = re.sub(r"\s+", " ", b[4]).strip()
                m = _ALT.search(t)
                if not m or len(t) < 12 or not _GLAZ.search(t):
                    continue
                label = next((g for g in m.groups() if g), "").upper()
                out.append({"page": pg.number, "label": f"Alt {label}".strip(), "text": t[:300],
                            "rect": [round(v, 1) for v in (fitz.Rect(b[:4]) * pg.rotation_matrix)]})
    finally:
        doc.close()
    seen, keep = set(), []
    for a in out:
        k = (a["label"], a["text"][:80])
        if k not in seen:
            seen.add(k)
            keep.append(a)
    return keep[:60]


def tag_alternates(items: list[dict], alternates: list[dict]) -> None:
    """item['alternate'] = 'Alt 2' when the item's own text says alternate, or an alternate names its mark."""
    for it in items:
        if it.get("kind") != "scope":
            continue
        own = " ".join([it.get("desc") or "", " ".join(it.get("notes") or [])])
        m = _ALT.search(own)
        if m:
            it["alternate"] = f"Alt {next((g for g in m.groups() if g), '').upper()}".strip()
            continue
        mark = str(it.get("id") or "")
        if len(mark) < 2:
            continue
        rx = re.compile(r"(?<![A-Z0-9])" + re.escape(mark) + r"(?![A-Z0-9])", re.I)
        for a in alternates:
            if rx.search(a["text"]):
                it["alternate"] = a["label"]
                break


# ── Cross-check ───────────────────────────────────────────────────────────────

def _cite(f: dict) -> dict:
    return {"section": f.get("section"), "page": f.get("page"), "text": f.get("text", "")[:240],
            "in_drawings": bool(f.get("in_drawings"))}


def cross_check(spec: dict, result: dict | None, dwg: dict | None = None) -> dict:
    sections = spec.get("sections", [])
    facts = spec.get("facts", [])
    items = [i for i in (result or {}).get("items", []) if i.get("kind") in ("scope", "pass_thru")]
    classes_found: dict[str, int] = {}
    for i in items:
        classes_found[i["cls"]] = classes_found.get(i["cls"], 0) + 1
    by_sec: dict[str, list[dict]] = {}
    for f in facts:
        by_sec.setdefault(f["section"], []).append(f)

    checks: list[dict] = []

    def add(severity, topic, message, spec_cites=(), dwg_cites=(), section=None):
        checks.append({"severity": severity, "topic": topic, "message": message, "section": section,
                       "spec": list(spec_cites)[:4], "drawings": list(dwg_cites)[:4]})

    ours = [s for s in sections if s.get("ours")]

    # 1 — spec sections vs what the takeoff found
    for s in ours:
        cov = s.get("covers") or []
        if cov and result is not None and not any(c in classes_found for c in cov):
            add("check", "coverage",
                f"Specs include {s['csi']} {s['title']} but the takeoff found none on the drawings — confirm it isn't missed.",
                [{"section": s["csi"], "page": s["page"], "text": s["title"], "in_drawings": bool(s.get("in_drawings"))}], section=s["csi"])
    if spec.get("has_div08") and result is not None:
        covered = {c for s in ours for c in (s.get("covers") or [])}
        for cls, n in classes_found.items():
            fam = {"ext_sf", "int_sf", "ext_sf_door", "int_sf_door", "ext_cw", "int_cw", "ext_cw_door", "int_cw_door",
                   "translucent_panel", "window", "transaction_window", "mirror", "fire_rated_glazing", "all_glass_wall",
                   "all_glass_door", "auto_door", "skylight"}
            if cls in fam and cls not in covered:
                ex = next((i for i in items if i["cls"] == cls), None)
                add("check", "coverage",
                    f"The drawings show {n} {cls.replace('_', ' ')} item(s) but no matching Division 08 section was found — RFI the system / performance requirements.",
                    dwg_cites=[{"item": ex["id"], "text": (ex.get("citations") or [""])[0]}] if ex else [])

    # 2 — manufacturers / series: is Kawneer or Tubelite allowed?
    FRAMED = {"ext_sf", "int_sf", "ext_cw", "int_cw", "window", "window_wall", "alum_frame_only"}
    for s in ours:
        if not (set(s.get("covers") or []) & FRAMED) and not re.search(r"STOREFRONT|CURTAIN|ALUMINUM", s["title"], re.I):
            continue
        sf = by_sec.get(s["csi"], [])
        makers = [f for f in sf if f["topic"] == "manufacturer" and f["values"].get("framing")]
        if not makers:
            continue
        names = {f["values"]["name"] for f in makers}
        open_ = any(f["topic"] == "substitutions" and f["values"].get("open") for f in sf)
        closed = any(f["topic"] == "substitutions" and not f["values"].get("open") for f in sf)
        if not names & OUR_MAKERS:
            if closed:
                sev, tail = "conflict", " and substitutions are closed: a substitution request is needed before bid."
            elif open_:
                sev, tail = "check", "; it allows an equal, so price Kawneer / Tubelite as the equal and say so in the scope letter."
            else:
                sev, tail = "check", "; it doesn't say whether an equal is accepted — submit a substitution request or RFI before pricing Kawneer / Tubelite."
            add(sev, "manufacturer", f"{s['csi']} lists {', '.join(sorted(names))} — neither Kawneer nor Tubelite" + tail,
                [_cite(f) for f in makers], section=s["csi"])
        elif "Kawneer" not in names or "Tubelite" not in names:
            missing = ({"Kawneer", "Tubelite"} - names).pop()
            add("info", "manufacturer",
                f"{s['csi']} lists {', '.join(sorted(names & OUR_MAKERS))} but not {missing}"
                + ("; equals are allowed." if open_ else " — stay with the listed maker."),
                [_cite(f) for f in makers if f["values"]["name"] in OUR_MAKERS], section=s["csi"])

    # series: the drawings name a series of a maker the specs name, but not that series
    spec_series = {}
    for f in facts:
        if f["topic"] == "series":
            spec_series.setdefault((f["values"]["manufacturer"], f["values"]["series"]), f)
    listed = {f["values"]["name"] for f in facts if f["topic"] == "manufacturer"}
    dwg_series = {}
    for i in items:
        for x in i.get("series") or []:
            if isinstance(x, dict):
                dwg_series.setdefault((x.get("manufacturer"), x.get("series")), i)
    for (mfr, ser), it in dwg_series.items():
        spec_same = [k for k in spec_series if k[0] == mfr]
        if spec_same and (mfr, ser) not in spec_series:
            add("conflict", "series",
                f"Drawings name {mfr} {ser}; the specs call for {', '.join(f'{a} {b}' for a, b in spec_same)}.",
                [_cite(spec_series[k]) for k in spec_same], [{"item": it["id"], "text": f"{mfr} {ser}"}],
                section=spec_series[spec_same[0]]["section"])
        elif listed and mfr and mfr not in listed and spec.get("has_div08"):
            add("check", "series", f"Drawings name {mfr} {ser} but the specs don't list {mfr}.",
                dwg_cites=[{"item": it["id"], "text": f"{mfr} {ser}"}])

    # 3 — finish: real spec sections (framing) vs the drawings (not the drawings' own notes vs themselves)
    framing_csi = {x["csi"] for x in ours if x["key"] not in ("088000", "088300", "088813", "notes") and
                   (set(x.get("covers") or []) & {"ext_sf", "int_sf", "ext_cw", "int_cw", "window", "alum_frame_only"} or
                    re.search(r"STOREFRONT|CURTAIN|ALUMINUM", x["title"], re.I))}
    sfin = [f for f in facts if f["topic"] == "finish" and f["section"] in framing_csi and (f["values"].get("colors") or f["values"].get("aama"))]
    spec_colors = {c for f in sfin for c in f["values"].get("colors", []) if c not in ("custom",)}
    if dwg and sfin:
        dfin = dwg.get("finish", [])
        dwg_colors = {c for h in dfin for c in h["values"].get("colors", [])}
        if dwg_colors and spec_colors and not (spec_colors & dwg_colors):
            add("conflict", "finish",
                f"Finish disagrees: specs say {', '.join(sorted(spec_colors))}; drawings say {', '.join(sorted(dwg_colors))}.",
                [_cite(f) for f in sfin], [{"page": h["page"], "rect": h["rect"], "text": h["text"]} for h in dfin])
        anod = any(f["values"].get("anodized") for f in sfin)
        paint = any(f["values"].get("painted") for f in sfin)
        d_anod = any(h["values"].get("anodized") for h in dfin)
        d_paint = any(h["values"].get("painted") for h in dfin)
        if (anod and not paint and d_paint and not d_anod) or (paint and not anod and d_anod and not d_paint):
            add("conflict", "finish", "Specs and drawings disagree on anodized vs painted finish.",
                [_cite(f) for f in sfin], [{"page": h["page"], "rect": h["rect"], "text": h["text"]} for h in dfin])
    if any(f["values"].get("by_architect") for f in sfin):
        add("check", "finish", "Finish color is 'as selected by Architect' — price a standard color or RFI it.",
            [_cite(f) for f in sfin if f["values"].get("by_architect")])

    # 4 — glass types: drawing designations the specs don't define
    sglass = [f for f in facts if f["topic"] == "glass" and f["section"] != "Drawing notes"]
    spec_types = {t for f in sglass for t in f["values"].get("types", [])}
    if dwg and spec_types:
        dtypes = {}
        for h in dwg.get("glass", []):
            for t in h["values"].get("types", []):
                dtypes.setdefault(t, h)
        missing = {t: h for t, h in dtypes.items() if t not in spec_types}
        if missing:
            add("check", "glass", f"Glass types on the drawings not defined in the specs: {', '.join(sorted(missing))}.",
                [_cite(f) for f in sglass if f["values"].get("types")],
                [{"page": h["page"], "rect": h["rect"], "text": h["text"]} for h in missing.values()])

    # 5 — template text left in the specs
    ours_csi = {s["csi"] for s in ours}
    ph: dict[str, list[dict]] = {}
    for f in facts:
        if f["topic"] == "placeholder" and f["section"] in ours_csi:
            ph.setdefault(f["section"], []).append(f)
    for sec, fs in ph.items():
        add("check", "placeholder",
            f"Spec template text left in {sec} ({len(fs)} place{'s' if len(fs) > 1 else ''}) — values never filled in (basis of design, glass designation…). RFI.",
            [_cite(f) for f in fs], section=sec)

    # 6 — cost items an estimator must carry
    COST = {
        "engineering": "Delegated design — carry engineering (stamped calcs / shop drawings).",
        "field_test": "Field water / air testing required — carry the testing.",
        "mockup": "Mock-up required — carry it.",
        "heat_soak": "Heat-soaked tempered glass required — adds glass cost and lead time.",
        "extra_stock": "Extra / attic-stock materials required.",
        "qualification": "Installer / inspector qualifications required (NACC / AGMT / FDAI) — confirm the crew qualifies.",
        "security": "Security / impact / blast requirement — specialty glazing.",
    }
    for topic, msg in COST.items():
        fs = [f for f in facts if f["topic"] == topic and any(s["csi"] == f["section"] and s.get("ours") for s in sections)]
        if fs:
            add("info", topic, msg, [_cite(f) for f in fs], section=fs[0]["section"])
    warr = [f for f in facts if f["topic"] == "warranty" and f["values"].get("years")]
    long_w = [f for f in warr if f["values"]["years"] in ("five", "ten", "twenty") or (f["values"]["years"].isdigit() and int(f["values"]["years"]) >= 5)]
    if long_w:
        add("info", "warranty", "Extended warranties: " + "; ".join(sorted({f"{f['section']} {f['values']['years']} yr" for f in long_w})) + " — check which are installer warranties.",
            [_cite(f) for f in long_w])

    # 7 — hardware: who furnishes
    hw = [f for f in facts if f["topic"] == "hardware"]
    if any(f["values"].get("in_087100") for f in hw):
        add("check", "hardware", "Entrance hardware is partly specified in 08 71 00 Door Hardware — confirm who furnishes it on aluminum doors (we include it by default).",
            [_cite(f) for f in hw if f["values"].get("in_087100")])

    # 8 — related sections for the scope letter
    hints = []
    for s in sections:
        if s.get("related"):
            hints.append({"section": s["csi"], "title": s["title"], "page": s["page"], "note": s["related"]})

    order = {"conflict": 0, "check": 1, "info": 2}
    checks.sort(key=lambda c: order[c["severity"]])
    return {"checks": checks, "related": hints,
            "summary": {k: sum(1 for c in checks if c["severity"] == k) for k in order}}


def summarize(spec: dict) -> list[dict]:
    """One card per glazing section: makers, series, finish, glass, hardware, cost items."""
    cards = []
    for s in spec.get("sections", []):
        if not s.get("ours"):
            continue
        fs = [f for f in spec["facts"] if f["section"] == s["csi"]]
        get = lambda t: [f for f in fs if f["topic"] == t]
        cards.append({
            "section": s["csi"], "title": s["title"], "page": s["page"], "in_drawings": bool(s.get("in_drawings")),
            "manufacturers": sorted({f["values"]["name"] for f in get("manufacturer")}),
            "series": sorted({f"{f['values']['manufacturer']} {f['values']['series']}" for f in get("series")}),
            "substitutions": ("open" if any(f["values"].get("open") for f in get("substitutions")) else
                              "closed" if get("substitutions") else "not stated"),
            "finish": [f["text"] for f in get("finish") if f["values"].get("colors") or f["values"].get("aama")][:3],
            "glass": [f["text"] for f in sorted(get("glass"), key=lambda f: -_glass_info(f["values"]))
                      if _glass_info(f["values"]) >= 2][:6],
            "hardware": sorted({h for f in get("hardware") for h in f["values"].get("items", [])}),
            "cost": sorted({f["topic"] for f in fs if f["topic"] in ("engineering", "field_test", "mockup", "heat_soak",
                                                                    "extra_stock", "qualification", "security", "warranty")}),
        })
    return cards


def _glass_info(v: dict) -> int:
    return (2 * len(v.get("products", [])) + len(v.get("thickness", [])) + len(v.get("tint", [])) + 2 * len(v.get("types", []))
            + int(bool(v.get("tempered"))) + int(bool(v.get("laminated"))) + int(bool(v.get("insulating"))))


def check_job(spec_pdf: str | None, drawings_pdf: str | None, result: dict | None) -> dict:
    """Everything Studio needs: spec cards, facts, cross-check, alternates."""
    spec = read_specs(spec_pdf) if spec_pdf else {"sections": [], "facts": [], "has_div08": False, "pages_read": []}
    skip: set[int] = set()
    if drawings_pdf:
        # spec sheets / spec notes in the drawing set count too (a book section wins over a sheet copy of it)
        ds = read_specs(drawings_pdf)
        skip = set(ds.get("pages_read") or [])
        have = {x["key"] for x in spec["sections"]}
        add_keys = {x["key"] for x in ds["sections"] if x["key"] not in have}
        spec["sections"] += [dict(x, in_drawings=True) for x in ds["sections"] if x["key"] in add_keys]
        add_csi = {x["csi"] for x in ds["sections"] if x["key"] in add_keys}
        spec["facts"] += [dict(f, in_drawings=True) for f in ds["facts"] if f["section"] in add_csi]
        spec["has_div08"] = spec["has_div08"] or ds["has_div08"]
    dwg = drawing_mentions(drawings_pdf, skip) if drawings_pdf else None
    alts = []
    if drawings_pdf:
        alts += [dict(a, source="drawings") for a in find_alternates(drawings_pdf)]
    if spec_pdf:
        alts += [dict(a, source="specs") for a in find_alternates(spec_pdf)]
    if result:
        tag_alternates(result.get("items", []), alts)
    xc = cross_check(spec, result, dwg)
    return {
        "source": ("spec book + drawing notes" if spec_pdf else "spec sheets / notes in the drawing set"),
        "sections": spec["sections"], "cards": summarize(spec), "facts": spec["facts"],
        "checks": xc["checks"], "related": xc["related"], "summary": xc["summary"],
        "alternates": alts,
        "item_alternates": {i["id"]: i["alternate"] for i in (result or {}).get("items", []) if i.get("alternate")},
        "pages_read": sorted(skip),
    }
