"""
GlazierAI Drawing Intelligence — Step 2: Legend Extractor

Reads materials/system legend sheets and builds the System Registry —
the authoritative map of system codes to scope types that all subsequent
steps use as context.

Input:  Legend sheet(s) at 200 DPI (e.g. A3.1 interior legend)
        Elevation sheet(s) at 200 DPI when legend is embedded (e.g. A2.0)
Output: SystemRegistry — dict of system code → scope type + details

Note on A2.0:
  The exterior materials schedule legend is embedded on the elevation sheet.
  Step 3 (elevation reader) handles A2.0 in a two-pass read:
    Pass 1 → extract exterior legend → adds to SystemRegistry
    Pass 2 → read elevations using registry as context
  Step 2 here handles dedicated legend sheets only (A3.1, A6.x, etc.)
"""

from __future__ import annotations
import json
import logging
from dataclasses import dataclass, field

import anthropic

from .vision_helper import pdf_page_to_vision_block, strip_metadata, DPI_LEGEND
from .sheet_classifier import ClassificationResult
from glazierai.model_config import VISION_MODEL, EXTRACTION_OPTS

logger = logging.getLogger(__name__)


# ─── System Registry ──────────────────────────────────────────────────────────

@dataclass
class SystemEntry:
    """One entry in the System Registry — one system code from the drawings."""
    code: str                    # e.g. "SF-1", "SF-3", "GF-1", "D-8"
    scope_type: str              # canonical scope type from SCOPE_COLORS
    scope_hex: str               # hex color for this scope type
    description: str             # plain-English description
    manufacturer: str | None     # manufacturer name
    series: str | None           # product series/model
    finish: str | None           # finish type and color
    glazing: str | None          # glass specification
    hardware: str | None         # hardware notes
    is_glazing_scope: bool       # True = we supply/install this
    exclusion_reason: str | None # why it's excluded (if not glazing scope)
    source_sheet: str            # which sheet this came from
    confidence: float = 1.0
    raw_notes: str = ""


@dataclass
class SystemRegistry:
    """
    The authoritative system code → scope type map for one drawing set.
    Built across Steps 2 and 3, used as context in Steps 4-6.
    """
    project_name: str = ""
    entries: dict[str, SystemEntry] = field(default_factory=dict)
    tokens_used: int = 0
    errors: list[str] = field(default_factory=list)

    def add(self, entry: SystemEntry) -> None:
        self.entries[entry.code] = entry

    def get(self, code: str) -> SystemEntry | None:
        return self.entries.get(code)

    def glazing_scope_entries(self) -> list[SystemEntry]:
        return [e for e in self.entries.values() if e.is_glazing_scope]

    def to_context_string(self) -> str:
        """
        Compact text summary for injection into downstream prompts.
        Lists only glazing-scope entries with code → scope type → description.
        """
        lines = ["SYSTEM REGISTRY (glazing scope only):"]
        for code, entry in sorted(self.entries.items()):
            if entry.is_glazing_scope:
                lines.append(
                    f"  {code}: [{entry.scope_type}] {entry.description}"
                    + (f" — {entry.manufacturer} {entry.series}" if entry.manufacturer else "")
                    + (f" / {entry.glazing}" if entry.glazing else "")
                )
        return "\n".join(lines)


# ─── Prompts ──────────────────────────────────────────────────────────────────

LEGEND_SYSTEM = """You are GlazierAI, an expert commercial glazing estimator reading \
architectural drawing legends to identify glazing scope.

Your task is to read a materials or system legend from a drawing sheet and extract \
every entry that is relevant to a glazing subcontractor's scope.

SCOPE TYPE TAXONOMY — assign one of these scope_type values to each glazing entry:
  curtain_wall     #008000  Aluminum curtain wall systems (stick, unitized, SSG)
  storefront       #FF8000  Aluminum storefront systems (thermal or non-thermal)
  window_wall      #008080  Aluminum window wall (slab-to-slab stick system) — 'WW'
  all_glass_wall   #80FFFF  Frameless glass partitions, patch-fit, butt-jointed
  glazing_only     #800040  Glass in HM or wood doors/frames — no aluminum (NOT overhead doors)
  window           #0000FF  Fixed or operable aluminum windows
  translucent_panel #0080FF Kalwall, polycarbonate, SSG panels
  bifold_sliding   #FFFF00  Standalone bi-fold or sliding door systems
  fire_rated       #FF0000  Fire-rated storefront or glazing-only
  sun_control      #FF80FF  Sunshade devices
  mirror           #FF80C0  Architectural mirrors (Div 08)
  glass_handrail   #FF0080  Glass infill panels in railings
  glass_film       #CC99FF  Applied window film
  skylight         #00B4D8  Unit or metal-framed skylights
  bullet_blast     #CC0033  Bullet or blast resistant glazing
  glass_canopy     #33CC99  Glass canopies and overhead glazing
  smart_glass      #9933FF  Electrochromic or switchable glass

NOT GLAZING SCOPE — mark is_glazing_scope: false for:
  - Wood doors themselves (their vision lites ARE glazing_only scope)
  - Overhead / sectional / coiling doors, including their lites
  - Vinyl, fiberglass, wood/clad windows
  - Hollow metal doors and frames with NO glass
  - Toilet accessories (Bobrick, Bradley, ASI, Lacava)
  - Cable railing systems (posts, top rail, cables — glass infill IS scope)
  - Carpet, tile, paint, wall covering
  - Structural steel, framing, millwork
  - Any system explicitly assigned to a specialty contractor other than local glass

IMPORTANT RULES:
1. Glass infill panels in a railing system = glass_handrail (we supply the glass, not the rail)
2. "Local glass contractor" in the manufacturer field = definitely our scope
3. Frameless glass partitions and doors = all_glass_wall regardless of framing description
4. Applied film on glass = glass_film even if specified under a different section
5. If a system code appears but the description is ambiguous, set confidence < 0.8 and note it

Return ONLY valid JSON — no markdown, no preamble."""


# Pass 1: identify glazing-scope codes only (tiny output)
LEGEND_PASS1_TEMPLATE = """Scan this drawing legend for glazing scope items.

Project: {project_name}
Sheet: {sheet_number}

Return a JSON array of the system/type codes that are explicitly printed on this sheet
as legend entries belonging to a glazing subcontractor's scope.

CRITICAL RULES:
- Read ONLY codes that are visually present as labeled entries in the legend table
- Do NOT infer, extrapolate, or generate sequential codes beyond what you can read
- Do NOT assume a numbering sequence continues — read each entry individually
- If you cannot clearly read a code, skip it
- Exclude: wood doors, hollow metal without glass, toilet accessories, cable rail, finishes

Valid glazing scope items include: curtain wall, storefront, frameless glass partitions,
frameless glass doors, glass film, skylights, mirrors, glass handrails, and any system
with "local glass contractor" as the manufacturer.

Example output: ["SF-1", "SF-3", "D-8"]

If there are no glazing scope items, return: []
Return nothing but the JSON array."""


# Fallback single-pass when Pass 1 returns suspiciously many codes (schedule confusion)
LEGEND_FALLBACK_TEMPLATE = """Read this drawing sheet and identify the glazing system TYPE DEFINITIONS.

Project: {project_name}
Sheet: {sheet_number} — {sheet_title}

IMPORTANT DISTINCTION:
- A system LEGEND has a small number of distinct TYPE entries (typically 2–15), each with
  a manufacturer name, product series, glass specification, and finish description.
- A FINISH SCHEDULE or ROOM SCHEDULE has many numbered rows — these are NOT system types.

Find only the LEGEND entries (distinct glazing system type definitions, NOT schedule rows).
Return a JSON array with full details for each glazing-scope legend entry found:

[
  {{
    "code": "SF-3",
    "scope_type": "all_glass_wall",
    "scope_hex": "#80FFFF",
    "description": "Full Height Frameless Glass Panels",
    "manufacturer": "Local Glass Contractor",
    "series": null,
    "finish": "Chrome / Polished Aluminum trim",
    "glazing": "1/2 inch Clear Tempered, butt jointed, frosted 36 inches AFF",
    "hardware": "Concealed head closers, floor pivots",
    "confidence": 0.95,
    "raw_notes": ""
  }}
]

If there are no distinct glazing system legend entries (only a schedule), return: []
Return nothing but the JSON array."""


# Pass 2: full details for the identified codes only
LEGEND_PASS2_TEMPLATE = """The following system codes on this legend sheet are glazing scope: {codes}

Project: {project_name}
Sheet: {sheet_number} — {sheet_title}

Return a JSON array with full details for ONLY those codes:

[
  {{
    "code": "SF-3",
    "scope_type": "all_glass_wall",
    "scope_hex": "#80FFFF",
    "description": "Full Height Frameless Glass Panels",
    "manufacturer": "Local Glass Contractor",
    "series": null,
    "finish": "Chrome / Polished Aluminum trim",
    "glazing": "1/2 inch Clear Tempered, butt jointed, frosted 36 inches AFF",
    "hardware": "Concealed head closers, floor pivots",
    "confidence": 0.95,
    "raw_notes": "3M FASARA Milky White Milano applied to lower 36 inches"
  }}
]

Return nothing but the JSON array."""


# ─── Legend Extractor ─────────────────────────────────────────────────────────


# ── Martin's trade knowledge appended to every system prompt (2026-10-03) ──
from glazierai.modules.drawing_intelligence._knowledge import with_knowledge as _wk  # noqa: E402
LEGEND_SYSTEM = _wk(LEGEND_SYSTEM)

class LegendExtractor:
    """
    Reads materials/system legend sheets and builds the System Registry.
    Processes dedicated legend sheets (e.g. A3.1).
    Embedded legends (e.g. on A2.0) are handled by the Elevation Reader.
    """

    def __init__(self, api_key: str | None = None):
        self.client = anthropic.Anthropic(api_key=api_key)

    def extract_from_page(
        self,
        pdf_path: str,
        page_index: int,
        sheet_number: str,
        sheet_title: str,
        project_name: str = "",
        registry: SystemRegistry | None = None,
        pass1_max_codes: int = 20,
    ) -> SystemRegistry:
        """
        Extract system definitions from one legend sheet.

        Args:
            pdf_path:     Path to the drawing PDF
            page_index:   0-based page number of the legend sheet
            sheet_number: e.g. "A3.1"
            sheet_title:  e.g. "Finish Materials Legend"
            project_name: For context in the prompt
            registry:     Existing registry to append to, or None to create new

        Returns:
            SystemRegistry with entries from this sheet added.
        """
        if registry is None:
            registry = SystemRegistry(project_name=project_name)

        logger.info(f"Step 2 — Legend extraction: {sheet_number} (page {page_index})")

        # Render at legend DPI for text readability
        block = pdf_page_to_vision_block(pdf_path, page_index, dpi=DPI_LEGEND)
        clean_block = strip_metadata(block)

        # ── Pass 1: identify glazing-scope codes (tiny output) ────────────────
        p1_content = [
            clean_block,
            {"type": "text", "text": LEGEND_PASS1_TEMPLATE.format(
                project_name=project_name,
                sheet_number=sheet_number,
            )},
        ]
        try:
            p1_response = self.client.messages.create(
                model=VISION_MODEL,
                **EXTRACTION_OPTS,
                max_tokens=1024,
                system=LEGEND_SYSTEM,
                messages=[{"role": "user", "content": p1_content}],
            )
        except anthropic.APIError as e:
            logger.error(f"Legend extractor Pass 1 API error: {e}")
            registry.errors.append(f"{sheet_number}: Pass 1 API error — {e}")
            return registry

        registry.tokens_used += p1_response.usage.input_tokens + p1_response.usage.output_tokens

        p1_raw = "".join(b.text for b in p1_response.content if b.type == "text").strip()
        if p1_raw.startswith("```"):
            lines = p1_raw.split("\n")
            p1_raw = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])

        try:
            glazing_codes: list[str] = json.loads(p1_raw)
        except json.JSONDecodeError as e:
            logger.error(f"Pass 1 JSON parse error: {e} | raw: {p1_raw[:200]}")
            registry.errors.append(f"{sheet_number}: Pass 1 JSON parse error — {e}")
            return registry

        logger.info(f"  Pass 1: {len(glazing_codes)} glazing codes found: {glazing_codes}")

        if not glazing_codes:
            logger.info(f"  {sheet_number}: no glazing scope entries found")
            return registry

        # ── Sanity check: too many codes = model is reading a schedule, not a legend ──
        if len(glazing_codes) > pass1_max_codes:
            logger.warning(
                f"  Pass 1 returned {len(glazing_codes)} codes — exceeds threshold ({pass1_max_codes}). "
                f"Sheet is likely a finish/room schedule, not a system legend. "
                f"Switching to fallback single-pass."
            )
            return self._fallback_single_pass(
                clean_block, pdf_path, page_index, sheet_number, sheet_title,
                project_name, registry,
            )

        # ── Pass 2: full details for glazing codes only ───────────────────────
        codes_str = ", ".join(glazing_codes)
        p2_content = [
            clean_block,
            {"type": "text", "text": LEGEND_PASS2_TEMPLATE.format(
                project_name=project_name,
                sheet_number=sheet_number,
                sheet_title=sheet_title,
                codes=codes_str,
            )},
        ]
        try:
            p2_response = self.client.messages.create(
                model=VISION_MODEL,
                **EXTRACTION_OPTS,
                max_tokens=4096,
                system=LEGEND_SYSTEM,
                messages=[{"role": "user", "content": p2_content}],
            )
        except anthropic.APIError as e:
            logger.error(f"Legend extractor Pass 2 API error: {e}")
            registry.errors.append(f"{sheet_number}: Pass 2 API error — {e}")
            return registry

        registry.tokens_used += p2_response.usage.input_tokens + p2_response.usage.output_tokens

        p2_raw = "".join(b.text for b in p2_response.content if b.type == "text").strip()
        if p2_raw.startswith("```"):
            lines = p2_raw.split("\n")
            p2_raw = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])

        try:
            data = json.loads(p2_raw)
        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error in legend Pass 2 response: {e}")
            registry.errors.append(f"{sheet_number}: Pass 2 JSON parse error — {e}")
            return registry

        entries_added = 0

        for item in (data if isinstance(data, list) else data.get("entries", [])):
            entry = SystemEntry(
                code=item.get("code", "?"),
                scope_type=item.get("scope_type") or "",
                scope_hex=item.get("scope_hex") or "",
                description=item.get("description", ""),
                manufacturer=item.get("manufacturer"),
                series=item.get("series"),
                finish=item.get("finish"),
                glazing=item.get("glazing"),
                hardware=item.get("hardware"),
                is_glazing_scope=True,
                exclusion_reason=None,
                source_sheet=sheet_number,
                confidence=float(item.get("confidence", 1.0)),
                raw_notes=item.get("raw_notes", ""),
            )
            registry.add(entry)
            entries_added += 1

        # Stub excluded codes so downstream steps can skip them
        for code in glazing_codes:
            if code not in registry.entries:
                logger.warning(f"  Pass 2 missed {code} — stubbing as excluded")
                registry.add(SystemEntry(
                    code=code, scope_type="", scope_hex="", description="",
                    manufacturer=None, series=None, finish=None, glazing=None,
                    hardware=None, is_glazing_scope=False,
                    exclusion_reason="Pass 2 missed entry",
                    source_sheet=sheet_number,
                ))

        glazing_count = sum(
            1 for e in registry.entries.values()
            if e.is_glazing_scope and e.source_sheet == sheet_number
        )
        logger.info(
            f"  {sheet_number}: {entries_added} entries total, "
            f"{glazing_count} glazing scope"
        )
        self._log_glazing_entries(registry, sheet_number)
        return registry

    def extract_from_classification(
        self,
        pdf_path: str,
        classification: ClassificationResult,
        project_name: str = "",
    ) -> SystemRegistry:
        """
        Process all sheets classified as step_2_legend from a classification result.

        Args:
            pdf_path:       Path to the drawing PDF
            classification: Result from SheetClassifier.classify()
            project_name:   For context in prompts

        Returns:
            SystemRegistry built from all legend sheets.
        """
        registry = SystemRegistry(project_name=project_name)
        legend_sheets = classification.sheets_for_step("step_2_legend")

        if not legend_sheets:
            logger.info("No dedicated legend sheets found — registry will be built in Step 3")
            return registry

        for sheet in legend_sheets:
            registry = self.extract_from_page(
                pdf_path=pdf_path,
                page_index=sheet.page_index,
                sheet_number=sheet.sheet_number,
                sheet_title=sheet.sheet_title,
                project_name=project_name,
                registry=registry,
            )

        logger.info(
            f"\nSystem Registry built: {len(registry.glazing_scope_entries())} glazing scope entries"
        )
        logger.info("\n" + registry.to_context_string())
        return registry

    def _fallback_single_pass(
        self,
        clean_block: dict,
        pdf_path: str,
        page_index: int,
        sheet_number: str,
        sheet_title: str,
        project_name: str,
        registry: SystemRegistry,
    ) -> SystemRegistry:
        """
        Single-pass fallback used when Pass 1 detects a finish/room schedule
        instead of a system legend. Asks directly for distinct type definitions.
        """
        content = [
            clean_block,
            {
                "type": "text",
                "text": LEGEND_FALLBACK_TEMPLATE.format(
                    project_name=project_name,
                    sheet_number=sheet_number,
                    sheet_title=sheet_title,
                ),
            },
        ]
        try:
            response = self.client.messages.create(
                model=VISION_MODEL,
                **EXTRACTION_OPTS,
                max_tokens=4096,
                system=LEGEND_SYSTEM,
                messages=[{"role": "user", "content": content}],
            )
        except anthropic.APIError as e:
            logger.error(f"Fallback pass API error: {e}")
            registry.errors.append(f"{sheet_number}: Fallback API error — {e}")
            return registry

        registry.tokens_used += response.usage.input_tokens + response.usage.output_tokens

        raw = "".join(b.text for b in response.content if b.type == "text").strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])

        try:
            items: list[dict] = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error(f"Fallback JSON parse error: {e}")
            registry.errors.append(f"{sheet_number}: Fallback JSON parse error — {e}")
            return registry

        entries_added = 0
        for item in (items if isinstance(items, list) else []):
            entry = SystemEntry(
                code=item.get("code", "?"),
                scope_type=item.get("scope_type") or "",
                scope_hex=item.get("scope_hex") or "",
                description=item.get("description", ""),
                manufacturer=item.get("manufacturer"),
                series=item.get("series"),
                finish=item.get("finish"),
                glazing=item.get("glazing"),
                hardware=item.get("hardware"),
                is_glazing_scope=True,
                exclusion_reason=None,
                source_sheet=sheet_number,
                confidence=float(item.get("confidence", 1.0)),
                raw_notes=item.get("raw_notes", ""),
            )
            registry.add(entry)
            entries_added += 1

        glazing_count = len([e for e in registry.entries.values()
                             if e.is_glazing_scope and e.source_sheet == sheet_number])
        logger.info(f"  Fallback: {entries_added} glazing entries found")
        self._log_glazing_entries(registry, sheet_number)
        return registry

    def _log_glazing_entries(self, registry: SystemRegistry, sheet_number: str) -> None:
        entries = [
            e for e in registry.entries.values()
            if e.is_glazing_scope and e.source_sheet == sheet_number
        ]
        for e in entries:
            logger.info(
                f"  + {e.code:<8} [{e.scope_type}]  {e.description[:60]}"
            )


# ─── Quick test ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import os, sys
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s"
    )

    if len(sys.argv) < 3:
        print("Usage: python -m glazierai.modules.drawing_intelligence.legend_extractor <pdf_path> <page_index> [project_name]")
        sys.exit(1)

    pdf_path   = sys.argv[1]
    page_index = int(sys.argv[2])
    proj_name  = sys.argv[3] if len(sys.argv) > 3 else ""

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY not set")
        sys.exit(1)

    extractor = LegendExtractor(api_key=api_key)
    registry  = extractor.extract_from_page(
        pdf_path=pdf_path,
        page_index=page_index,
        sheet_number=f"p{page_index}",
        sheet_title="Materials Legend",
        project_name=proj_name,
    )

    print(f"\nTokens used: {registry.tokens_used}")
    print(f"\n{registry.to_context_string()}")

    print("\n\nFull registry:")
    for code, entry in sorted(registry.entries.items()):
        scope = f"[{entry.scope_type}]" if entry.is_glazing_scope else "[EXCLUDED]"
        print(f"  {code:<8} {scope:<25} {entry.description[:60]}")
        if not entry.is_glazing_scope and entry.exclusion_reason:
            print(f"           Reason: {entry.exclusion_reason}")
