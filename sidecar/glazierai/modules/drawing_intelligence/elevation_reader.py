"""
GlazierAI Drawing Intelligence — Step 3: Elevation Reader

Processes elevation sheets to extract two things:
  1. System definitions embedded in the sheet (e.g. A2.0 exterior materials legend)
     → Written to SystemRegistry so Steps 4–6 can reference them
  2. Mark inventory → every mark number found on the elevations / schedules
     → Written to MarkRegistry so the takeoff assembler can count & sort

Two sheet modes:
  "exterior_with_legend"   A2.0-style: legend table + 4 building elevations
                           Two passes: legend first, then mark read
  "interior_schedule"      A3.3-style: pictorial door/frame schedule in elevation format
                           One pass: classify each mark as all_glass_wall vs storefront

MarkEntry vs SystemEntry:
  SystemEntry = "what does SF-1 mean?" (manufacturer, series, scope type)
  MarkEntry   = "where does mark 107 appear and what system is it?" (instance)
  Marks link to SystemEntries via system_code; Step 4 fills in dimensions per mark.
"""

from __future__ import annotations
import json
import logging
from dataclasses import dataclass, field

import anthropic

from .vision_helper import pdf_page_to_vision_block, strip_metadata, DPI_LEGEND
from .legend_extractor import SystemRegistry, SystemEntry
from .sheet_classifier import ClassificationResult
from glazierai.model_config import VISION_MODEL, EXTRACTION_OPTS

logger = logging.getLogger(__name__)


# ─── Mark Registry ────────────────────────────────────────────────────────────

@dataclass
class MarkEntry:
    """
    One mark instance found on an elevation or schedule sheet.
    A mark is a unique glazing assembly with its own callout tag.

    On exterior elevations (A2.0): marks may be system references ("SF-1") or
    numbered instances. On interior schedules (A3.3): marks are sequential
    numbers (100, 107, 115) each representing a distinct door/partition assembly.
    """
    mark_id: str              # tag visible in drawing: "SF-1", "2", "107"
    scope_type: str           # "curtain_wall", "storefront", "all_glass_wall", etc.
    scope_hex: str            # e.g. "#008000"
    system_code: str | None   # reference to SystemRegistry entry, if known
    location: str             # "West Elevation", "Interior Office C-04", etc.
    description: str          # brief plain-English description of the assembly
    key_specs: str            # glass type, finish, notable hardware
    source_sheet: str         # "A2.0", "A3.3"
    is_glazing_scope: bool = True
    confidence: float = 1.0
    notes: str = ""


@dataclass
class MarkRegistry:
    """
    All marks found across all elevation sheets for this drawing set.
    Keyed by mark_id for fast lookup; duplicates across sheets are merged.
    """
    project_name: str = ""
    marks: dict[str, MarkEntry] = field(default_factory=dict)
    tokens_used: int = 0
    errors: list[str] = field(default_factory=list)

    def add(self, entry: MarkEntry) -> None:
        if entry.mark_id in self.marks:
            logger.debug(f"  Mark {entry.mark_id} already in registry — keeping first")
            return
        self.marks[entry.mark_id] = entry

    def glazing_scope_marks(self) -> list[MarkEntry]:
        return [m for m in self.marks.values() if m.is_glazing_scope]

    def by_scope_type(self, scope_type: str) -> list[MarkEntry]:
        return [m for m in self.marks.values() if m.scope_type == scope_type]

    def to_summary_string(self) -> str:
        lines = [f"MARK REGISTRY — {len(self.glazing_scope_marks())} glazing scope marks:"]
        by_type: dict[str, list[str]] = {}
        for m in self.marks.values():
            if m.is_glazing_scope:
                by_type.setdefault(m.scope_type, []).append(m.mark_id)
        for scope_type, ids in sorted(by_type.items()):
            lines.append(f"  [{scope_type}]  {', '.join(sorted(ids))}")
        return "\n".join(lines)


# ─── Prompts ──────────────────────────────────────────────────────────────────

LEGEND_EXTRACT_SYSTEM = """You are GlazierAI, reading an exterior materials legend table \
embedded in an architectural elevation sheet.

Return ONLY entries where is_glazing_scope is true (glazing subcontractor scope).
Skip non-glazing entries entirely — do not include ACM panels, coatings, CMU block, \
sealants, or other non-glass/non-aluminum materials.

For each glazing entry, assign a scope_type from:
  curtain_wall     Aluminum CW (stick, unitized, SSG, bi-fold CW infill)
  storefront       Aluminum storefront (thermal or non-thermal)
  glazing_only     Glass in hollow-metal or overhead doors — no aluminum supplied
  glass_film       Applied window film (3M, Llumar, etc.)
  all_glass_wall   Frameless patch-fit glass walls / butt-jointed glass

Glazing scope items: curtain wall, storefront, glass doors with aluminum frames, \
glass film, skylights, frameless glass. If the "additional information" column says \
"local glass contractor", include it.

CRITICAL: Read only what is printed. If a manufacturer name is unclear, use null.
Do not guess common brands. Return ONLY valid JSON, no markdown."""

LEGEND_EXTRACT_USER = """Read the EXTERIOR MATERIALS SCHEDULE LEGEND table on this drawing.
Project: {project_name}   Sheet: {sheet_number}

Return ONLY the glazing-scope entries (is_glazing_scope=true). Omit all non-glazing rows.

Return JSON:
{{
  "legend_entries": [
    {{
      "code": "SF-1",
      "category": "CURTAIN WALL",
      "manufacturer": "Pittco Architectural Metals Inc",
      "product": "Curtain Wall System TMW 450",
      "finish": "Anodized Black",
      "glazing": "1 inch IGU",
      "scope_type": "curtain_wall",
      "scope_hex": "#008000",
      "is_glazing_scope": true,
      "confidence": 0.95
    }}
  ]
}}
Return only the JSON object."""


ELEVATION_MARKS_SYSTEM = """You are GlazierAI, reading exterior building elevations \
to identify every glazing mark visible on the drawings.

A mark is a callout tag — typically a diamond ◆ or circle ○ with a code inside — \
pointing to a glazing system or door. Read only marks that are actually visible. \
Do not infer marks from context. If a tag code is ambiguous, record it with low confidence.

Assign scope_type from the system registry provided. If a mark's system code is not in \
the registry, classify by visual appearance (curtain wall grid = curtain_wall, etc.).

Return ONLY valid JSON, no markdown."""

ELEVATION_MARKS_USER = """Read the building elevation drawings on this sheet and list \
every glazing mark tag you can see.

Project: {project_name}   Sheet: {sheet_number}
Elevations on this sheet: {elevation_names}

System registry for reference:
{registry_context}

Return JSON:
{{
  "marks": [
    {{
      "mark_id": "SF-1",
      "elevation": "West",
      "system_code": "SF-1",
      "scope_type": "curtain_wall",
      "scope_hex": "#008000",
      "location": "West Elevation — main Jewel Box glazing",
      "description": "Curtain wall system at entry feature",
      "key_specs": "Pittco TMW 450, Anodized Black",
      "is_glazing_scope": true,
      "confidence": 0.92,
      "notes": ""
    }},
    {{
      "mark_id": "GF-1",
      "elevation": "West",
      "system_code": "GF-1",
      "scope_type": "glass_film",
      "scope_hex": "#CC99FF",
      "location": "West Elevation — Main Entry glass panels",
      "description": "Applied gradient film at entry",
      "key_specs": "3M FASARA ILLUMINA, gradient density",
      "is_glazing_scope": true,
      "confidence": 0.88,
      "notes": ""
    }}
  ]
}}
List every mark you can see on every elevation. Return only the JSON."""


INT_SCHEDULE_SYSTEM = """You are GlazierAI, reading an interior door and frame schedule \
drawn in pictorial elevation format.

Each panel in the schedule shows one assembly type: either aluminum-framed glazed doors \
and sidelites, or frameless all-glass partitions. A circled number tag below each \
elevation identifies the mark number.

Classify each mark as one of:
  all_glass_wall   Frameless / butt-jointed / patch-fit glass panels and doors
                   Key phrases: EQUAL PANELS, CLEAR SILICON SEALANT, butt glazed,
                   patch fittings, no visible aluminum frame
  storefront       Aluminum-framed interior glazed doors, transoms, sidelites
                   Key phrases: aluminum frame, narrow stile, pivot door in frame

CRITICAL rules:
- Read mark numbers exactly as printed — do not guess sequential numbers
- If a mark has applied frost / film notation, add it to key_specs
- Do not fabricate marks not visible in the drawing
Return ONLY valid JSON, no markdown."""

INT_SCHEDULE_USER = """Read every door/frame assembly shown on this interior \
door and frame schedule.

Project: {project_name}   Sheet: {sheet_number}

Return JSON:
{{
  "marks": [
    {{
      "mark_id": "107",
      "scope_type": "all_glass_wall",
      "scope_hex": "#80FFFF",
      "system_code": null,
      "location": "Interior — 3 equal panels",
      "description": "Frameless glass partition, 3 equal panels, butt jointed",
      "key_specs": "1/2 inch clear tempered, silicon sealant at wall, applied frost below 36 inches",
      "is_glazing_scope": true,
      "confidence": 0.95,
      "notes": ""
    }},
    {{
      "mark_id": "112",
      "scope_type": "storefront",
      "scope_hex": "#FF8000",
      "system_code": null,
      "location": "Interior — aluminum door with sidelite",
      "description": "Aluminum-framed interior glazed door and sidelite assembly",
      "key_specs": "Narrow stile, clear glass, pivot hardware",
      "is_glazing_scope": true,
      "confidence": 0.90,
      "notes": ""
    }}
  ]
}}
List every mark visible. Return only the JSON."""


# ─── Elevation Reader ──────────────────────────────────────────────────────────

class ElevationReader:
    """
    Step 3: Reads elevation and schedule sheets to build the Mark Registry.

    Sheet modes:
      "exterior_with_legend"   Two-pass: extract legend → update SystemRegistry,
                               then read elevations → populate MarkRegistry
      "interior_schedule"      One-pass: read pictorial door/frame schedule
    """

    def __init__(self, api_key: str | None = None):
        self.client = anthropic.Anthropic(api_key=api_key)

    def process_elevation_sheet(
        self,
        pdf_path: str,
        page_index: int,
        sheet_number: str,
        sheet_title: str,
        sheet_mode: str,
        project_name: str = "",
        system_registry: SystemRegistry | None = None,
        mark_registry: MarkRegistry | None = None,
        elevation_names: list[str] | None = None,
    ) -> tuple[SystemRegistry, MarkRegistry]:
        """
        Process one elevation or schedule sheet.

        Args:
            pdf_path:        Path to drawing PDF
            page_index:      0-based page number
            sheet_number:    e.g. "A2.0"
            sheet_title:     e.g. "Exterior Elevations"
            sheet_mode:      "exterior_with_legend" | "interior_schedule"
            project_name:    For prompt context
            system_registry: Existing registry to update, or None to create new
            mark_registry:   Existing registry to update, or None to create new
            elevation_names: Names of elevations on the sheet (e.g. ["West","East","South","North"])

        Returns:
            (updated SystemRegistry, updated MarkRegistry)
        """
        if system_registry is None:
            system_registry = SystemRegistry(project_name=project_name)
        if mark_registry is None:
            mark_registry = MarkRegistry(project_name=project_name)

        logger.info(f"Step 3 [{sheet_mode}] — {sheet_number}: {sheet_title}")

        if sheet_mode == "exterior_with_legend":
            # Two passes, different DPI:
            #   100 DPI for legend table (larger text, avoids PNG request-size limit)
            #   150 DPI for mark reading (callout diamond tags need better resolution)
            legend_block = pdf_page_to_vision_block(pdf_path, page_index, dpi=100)
            marks_block  = pdf_page_to_vision_block(pdf_path, page_index, dpi=150)
            logger.info(
                f"  Rendered page {page_index}: "
                f"legend {legend_block.get('_width_px')}x{legend_block.get('_height_px')}"
                f"@{legend_block.get('_dpi')}dpi  "
                f"marks {marks_block.get('_width_px')}x{marks_block.get('_height_px')}"
                f"@{marks_block.get('_dpi')}dpi"
            )
            system_registry = self._extract_embedded_legend(
                legend_block, sheet_number, project_name, system_registry
            )
            mark_registry = self._read_exterior_elevation_marks(
                marks_block, sheet_number, project_name,
                system_registry, mark_registry,
                elevation_names or []
            )
        elif sheet_mode == "interior_schedule":
            block = pdf_page_to_vision_block(pdf_path, page_index, dpi=DPI_LEGEND)
            logger.info(
                f"  Rendered page {page_index} at {block.get('_dpi')} DPI "
                f"({block.get('_width_px')}x{block.get('_height_px')}px)"
            )
            mark_registry = self._read_interior_schedule_marks(
                block, sheet_number, project_name, mark_registry
            )
        else:
            logger.warning(f"Unknown sheet_mode '{sheet_mode}' — skipping {sheet_number}")

        return system_registry, mark_registry

    # ── Pass 1: Legend extraction ─────────────────────────────────────────────

    def _extract_embedded_legend(
        self,
        image_block: dict,
        sheet_number: str,
        project_name: str,
        registry: SystemRegistry,
    ) -> SystemRegistry:
        """
        Extract the exterior materials legend table embedded in the elevation sheet.
        Adds entries to SystemRegistry and returns it.
        """
        logger.info(f"  Pass 1 — extracting legend from {sheet_number}")
        content = [
            strip_metadata(image_block),
            {
                "type": "text",
                "text": LEGEND_EXTRACT_USER.format(
                    project_name=project_name,
                    sheet_number=sheet_number,
                ),
            },
        ]

        try:
            response = self.client.messages.create(
                model=VISION_MODEL,
                **EXTRACTION_OPTS,
                max_tokens=8192,
                system=LEGEND_EXTRACT_SYSTEM,
                messages=[{"role": "user", "content": content}],
            )
        except anthropic.APIError as e:
            logger.error(f"  {sheet_number} legend API error ({type(e).__name__}): {e}")
            registry.errors.append(f"{sheet_number} legend: API error — {e}")
            return registry

        registry.tokens_used += response.usage.input_tokens + response.usage.output_tokens
        raw = _clean_json(response)

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error(f"  {sheet_number} legend JSON parse error: {e} | raw: {raw[:300]}")
            registry.errors.append(f"{sheet_number} legend: JSON parse error — {e}")
            return registry

        added = 0
        for item in data.get("legend_entries", []):
            entry = SystemEntry(
                code=item.get("code", "?"),
                scope_type=item.get("scope_type") or "",
                scope_hex=item.get("scope_hex") or "",
                description=item.get("category", ""),
                manufacturer=item.get("manufacturer"),
                series=item.get("product"),
                finish=item.get("finish"),
                glazing=item.get("glazing"),
                hardware=None,
                is_glazing_scope=item.get("is_glazing_scope", False),
                exclusion_reason=None if item.get("is_glazing_scope") else "Non-glazing",
                source_sheet=sheet_number,
                confidence=float(item.get("confidence", 1.0)),
            )
            # Legend precedence: a code already bound by a DIFFERENT sheet (the
            # dedicated Step 2 legend) is authoritative for this sheet's marks.
            # The embedded read may only fill fields the bound entry left empty.
            existing = registry.get(entry.code)
            if existing is not None and existing.source_sheet != sheet_number:
                if existing.scope_type != entry.scope_type or existing.is_glazing_scope != entry.is_glazing_scope:
                    logger.warning(
                        f"  {sheet_number} embedded legend says {entry.code} = {entry.scope_type!r} "
                        f"(glazing={entry.is_glazing_scope}); keeping {existing.source_sheet} = "
                        f"{existing.scope_type!r} (glazing={existing.is_glazing_scope})"
                    )
                for f in ("manufacturer", "series", "finish", "glazing", "description"):
                    if not getattr(existing, f) and getattr(entry, f):
                        setattr(existing, f, getattr(entry, f))
                continue
            registry.add(entry)
            added += 1

        glazing = sum(
            1 for e in registry.entries.values()
            if e.is_glazing_scope and e.source_sheet == sheet_number
        )
        logger.info(f"  {sheet_number} legend: {added} entries, {glazing} glazing scope")
        for e in registry.entries.values():
            if e.is_glazing_scope and e.source_sheet == sheet_number:
                logger.info(f"    + {e.code:<8} [{e.scope_type}]  {e.description}")
        return registry

    # ── Pass 2: Exterior elevation marks ─────────────────────────────────────

    def _read_exterior_elevation_marks(
        self,
        image_block: dict,
        sheet_number: str,
        project_name: str,
        system_registry: SystemRegistry,
        mark_registry: MarkRegistry,
        elevation_names: list[str],
    ) -> MarkRegistry:
        """
        Read all glazing marks visible on the exterior elevation drawings.
        Uses the system registry as context so the model maps marks to scope types.
        """
        logger.info(f"  Pass 2 — reading elevation marks from {sheet_number}")
        content = [
            strip_metadata(image_block),
            {
                "type": "text",
                "text": ELEVATION_MARKS_USER.format(
                    project_name=project_name,
                    sheet_number=sheet_number,
                    elevation_names=", ".join(elevation_names) if elevation_names
                                    else "unknown",
                    registry_context=system_registry.to_context_string(),
                ),
            },
        ]

        try:
            response = self.client.messages.create(
                model=VISION_MODEL,
                **EXTRACTION_OPTS,
                max_tokens=4096,
                system=ELEVATION_MARKS_SYSTEM,
                messages=[{"role": "user", "content": content}],
            )
        except anthropic.APIError as e:
            logger.error(f"  {sheet_number} marks API error ({type(e).__name__}): {e}")
            mark_registry.errors.append(f"{sheet_number} marks: API error — {e}")
            return mark_registry

        mark_registry.tokens_used += (
            response.usage.input_tokens + response.usage.output_tokens
        )
        raw = _clean_json(response)

        return self._parse_marks_response(raw, sheet_number, mark_registry)

    # ── Interior schedule (one-pass) ──────────────────────────────────────────

    def _read_interior_schedule_marks(
        self,
        image_block: dict,
        sheet_number: str,
        project_name: str,
        mark_registry: MarkRegistry,
    ) -> MarkRegistry:
        """
        Read every mark from a pictorial interior door/frame schedule (A3.3 style).
        Classifies each assembly as all_glass_wall or storefront.
        """
        logger.info(f"  Pass 1 — reading interior schedule marks from {sheet_number}")
        content = [
            strip_metadata(image_block),
            {
                "type": "text",
                "text": INT_SCHEDULE_USER.format(
                    project_name=project_name,
                    sheet_number=sheet_number,
                ),
            },
        ]

        try:
            response = self.client.messages.create(
                model=VISION_MODEL,
                **EXTRACTION_OPTS,
                max_tokens=8192,
                system=INT_SCHEDULE_SYSTEM,
                messages=[{"role": "user", "content": content}],
            )
        except anthropic.APIError as e:
            mark_registry.errors.append(f"{sheet_number} schedule: API error — {e}")
            return mark_registry

        mark_registry.tokens_used += (
            response.usage.input_tokens + response.usage.output_tokens
        )
        raw = _clean_json(response)
        return self._parse_marks_response(raw, sheet_number, mark_registry)

    # ── Shared mark parser ────────────────────────────────────────────────────

    def _parse_marks_response(
        self,
        raw: str,
        sheet_number: str,
        mark_registry: MarkRegistry,
    ) -> MarkRegistry:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            mark_registry.errors.append(f"{sheet_number} marks: JSON parse error — {e}")
            return mark_registry

        added = 0
        for item in data.get("marks", []):
            if not item.get("is_glazing_scope", True):
                continue
            entry = MarkEntry(
                mark_id=str(item.get("mark_id", "?")),
                scope_type=item.get("scope_type", ""),
                scope_hex=item.get("scope_hex", ""),
                system_code=item.get("system_code"),
                location=item.get("location") or item.get("elevation", ""),
                description=item.get("description", ""),
                key_specs=item.get("key_specs", ""),
                source_sheet=sheet_number,
                is_glazing_scope=item.get("is_glazing_scope", True),
                confidence=float(item.get("confidence", 1.0)),
                notes=item.get("notes", ""),
            )
            mark_registry.add(entry)
            added += 1

        logger.info(f"  {sheet_number}: {added} glazing marks added to registry")
        for m in mark_registry.marks.values():
            if m.source_sheet == sheet_number:
                sys_ref = f"→ {m.system_code}" if m.system_code else ""
                logger.info(
                    f"    + {m.mark_id:<8} [{m.scope_type:<18}] "
                    f"{m.location[:40]} {sys_ref}"
                )
        return mark_registry

    # ── Batch processor ───────────────────────────────────────────────────────

    def process_elevation_sheets(
        self,
        pdf_path: str,
        classification: ClassificationResult,
        project_name: str = "",
        system_registry: SystemRegistry | None = None,
        sheet_mode_overrides: dict[str, str] | None = None,
        elevation_names_by_sheet: dict[str, list[str]] | None = None,
    ) -> tuple[SystemRegistry, MarkRegistry]:
        """
        Process all step_3_elevation sheets from a classification result.

        Args:
            sheet_mode_overrides:     e.g. {"A2.0": "exterior_with_legend",
                                            "A3.3": "interior_schedule"}
                                      Defaults to "interior_schedule" for any
                                      sheet whose title mentions 'interior' or
                                      'door', else "exterior_with_legend".
            elevation_names_by_sheet: e.g. {"A2.0": ["West","East","South","North"]}
        """
        if system_registry is None:
            system_registry = SystemRegistry(project_name=project_name)
        mark_registry = MarkRegistry(project_name=project_name)

        overrides = sheet_mode_overrides or {}
        elev_names = elevation_names_by_sheet or {}
        elevation_sheets = classification.sheets_for_step("step_3_elevation")

        if not elevation_sheets:
            logger.warning("No step_3_elevation sheets found in classification")
            return system_registry, mark_registry

        for sheet in elevation_sheets:
            # Determine sheet mode
            if sheet.sheet_number in overrides:
                mode = overrides[sheet.sheet_number]
            else:
                title_lower = sheet.sheet_title.lower()
                mode = (
                    "interior_schedule"
                    if any(kw in title_lower for kw in ("interior", "door", "frame", "fixture"))
                    else "exterior_with_legend"
                )
                logger.info(
                    f"  Auto-detected mode '{mode}' for {sheet.sheet_number} "
                    f"({sheet.sheet_title})"
                )

            system_registry, mark_registry = self.process_elevation_sheet(
                pdf_path=pdf_path,
                page_index=sheet.page_index,
                sheet_number=sheet.sheet_number,
                sheet_title=sheet.sheet_title,
                sheet_mode=mode,
                project_name=project_name,
                system_registry=system_registry,
                mark_registry=mark_registry,
                elevation_names=elev_names.get(sheet.sheet_number),
            )

        logger.info(f"\n{mark_registry.to_summary_string()}")
        logger.info(f"\n{system_registry.to_context_string()}")
        return system_registry, mark_registry


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _clean_json(response) -> str:
    raw = "".join(b.text for b in response.content if b.type == "text").strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
    return raw


# ─── Quick test ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import os, sys
    # Windows: force UTF-8 output so em-dashes and arrows print cleanly
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s",
    )

    if len(sys.argv) < 2:
        print("Usage: python -m glazierai.modules.drawing_intelligence.elevation_reader <pdf_path> [project_name]")
        sys.exit(1)

    pdf_path  = sys.argv[1]
    proj_name = sys.argv[2] if len(sys.argv) > 2 else "McLarty Mazda"
    api_key   = os.getenv("ANTHROPIC_API_KEY")

    if not api_key:
        print("ANTHROPIC_API_KEY not set")
        sys.exit(1)

    from .sheet_classifier import SheetClassifier, ProcessStep

    # McLarty Mazda routing overrides
    MCLARTY_OVERRIDES: dict[str, ProcessStep] = {
        "A3.0": "step_6_floor_plan",
        "A3.1": "skip",
        "A3.2": "step_4_ext_schedule",
        "A3.3": "step_3_elevation",
    }

    classifier = SheetClassifier(api_key=api_key)
    classification = classifier.classify(
        pdf_path,
        routing_overrides=MCLARTY_OVERRIDES,
    )

    reader = ElevationReader(api_key=api_key)
    system_registry, mark_registry = reader.process_elevation_sheets(
        pdf_path=pdf_path,
        classification=classification,
        project_name=proj_name,
        sheet_mode_overrides={
            "A2.0": "exterior_with_legend",
            "A3.3": "interior_schedule",
        },
        elevation_names_by_sheet={
            "A2.0": ["West", "East", "South", "North"],
        },
    )

    print(f"\nTotal tokens used: {system_registry.tokens_used + mark_registry.tokens_used:,}")

    print(f"\n{'='*60}")
    print("SYSTEM REGISTRY")
    print("="*60)
    print(system_registry.to_context_string())

    print(f"\n{'='*60}")
    print("MARK REGISTRY")
    print("="*60)
    print(mark_registry.to_summary_string())

    print(f"\n{'='*60}")
    print("MARKS — FULL DETAIL")
    print("="*60)
    for mark_id, m in sorted(mark_registry.marks.items()):
        print(f"\n  {mark_id}")
        print(f"    scope    : [{m.scope_type}]  {m.scope_hex}")
        print(f"    system   : {m.system_code or '—'}")
        print(f"    location : {m.location}")
        print(f"    specs    : {m.key_specs}")
        if m.notes:
            print(f"    notes    : {m.notes}")
