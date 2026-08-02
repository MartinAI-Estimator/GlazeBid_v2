"""
GlazierAI Drawing Intelligence — Step 4: Schedule Reader

Reads the exterior door and frame schedule (typically A3.2) and builds the
Schedule Registry — one ScheduleEntry per mark/keynote.

The schedule is the *authoritative source for dimensions*.  Each mark/keynote
number here corresponds directly to the diamond callout tags on the building
elevations (A2.0).  The assembler joins:

  MarkRegistry  (Step 3): mark "2" → [curtain_wall] West Elevation
  ScheduleEntry (Step 4): mark "2" → CW-1, 12'×10'4", Pittco TMW 450

…to produce the final opening take-off with count, area, and glass spec.

Sheet mode handled here:
  "ext_schedule"   Pictorial door/frame schedule (A3.2-style)
                   One pass: read every mark row, extract dimensions + system
"""

from __future__ import annotations
import json
import logging
import re
from dataclasses import dataclass, field

import anthropic

from .vision_helper import pdf_page_to_vision_block, strip_metadata, DPI_LEGEND
from .legend_extractor import SystemRegistry
from .sheet_classifier import ClassificationResult

logger = logging.getLogger(__name__)


# ─── Schedule Registry ────────────────────────────────────────────────────────

@dataclass
class ScheduleEntry:
    """
    One opening/assembly entry from an exterior door or frame schedule.

    mark_id matches the keynote callout number on the elevation drawings
    (A2.0 diamond tags).  system_code resolves to a SystemRegistry entry
    once the assembler joins the two registries.
    """
    mark_id: str             # keynote / mark number visible in schedule: "2", "GD-1"
    system_code: str | None  # glazing system code: "CW-1", "SF-1" — null if not labeled
    scope_type: str          # "curtain_wall", "storefront", "glass_door",
                             #   "overhead_door", "rolling_door", "all_glass_wall"
    scope_hex: str           # hex color consistent with other steps
    width_ft: float | None   # opening width in decimal feet
    height_ft: float | None  # opening height in decimal feet
    opening_type: str        # "single", "pair", "sgl+sidelite", "pair+sidelite",
                             #   "overhead", "sliding", "curtain_wall_panel", "other"
    glass_spec: str          # glass specification string
    hardware_notes: str      # notable hardware (closer, panic, lock, etc.)
    source_sheet: str        # e.g. "A3.2"
    confidence: float = 1.0
    notes: str = ""


@dataclass
class ScheduleRegistry:
    """
    All schedule entries extracted from one or more exterior schedule sheets.
    Keyed by mark_id; later sheets overwrite earlier ones for the same mark.
    """
    project_name: str = ""
    entries: dict[str, ScheduleEntry] = field(default_factory=dict)
    tokens_used: int = 0
    errors: list[str] = field(default_factory=list)

    def add(self, entry: ScheduleEntry) -> None:
        if entry.mark_id in self.entries:
            logger.debug(f"  Mark {entry.mark_id} already in schedule — overwriting")
        self.entries[entry.mark_id] = entry

    def get(self, mark_id: str) -> ScheduleEntry | None:
        return self.entries.get(mark_id)

    def by_scope_type(self, scope_type: str) -> list[ScheduleEntry]:
        return [e for e in self.entries.values() if e.scope_type == scope_type]

    def to_summary_string(self) -> str:
        lines = [f"SCHEDULE REGISTRY — {len(self.entries)} entries:"]
        for mark_id, e in sorted(self.entries.items(), key=lambda x: _sort_key(x[0])):
            dim = ""
            if e.width_ft is not None and e.height_ft is not None:
                w_in = int(round(e.width_ft * 12))
                h_in = int(round(e.height_ft * 12))
                dim = f"  {w_in // 12}'-{w_in % 12:02d}\" × {h_in // 12}'-{h_in % 12:02d}\""
            sys_label = f" ({e.system_code})" if e.system_code else ""
            lines.append(
                f"  {mark_id:6s}  [{e.scope_type}]{dim}  {e.opening_type}{sys_label}"
            )
        return "\n".join(lines)


def _sort_key(mark_id: str):
    """Sort numerically when mark_id is a number, alphabetically otherwise."""
    try:
        return (0, int(mark_id), "")
    except ValueError:
        return (1, 0, mark_id)


# ─── Scope color map ──────────────────────────────────────────────────────────

_SCOPE_HEX: dict[str, str] = {
    "curtain_wall":   "#008000",
    "storefront":     "#FF8000",
    "glass_door":     "#0000FF",
    "overhead_door":  "#800080",
    "rolling_door":   "#800080",
    "all_glass_wall": "#80FFFF",
    "glass_film":     "#CC99FF",
    "other":          "#808080",
}


# ─── Prompts ──────────────────────────────────────────────────────────────────

SCHEDULE_SYSTEM = """\
You are a glazing estimator reading an architectural exterior door and frame schedule.
The schedule is in pictorial format: each mark shows an elevation drawing of the opening
plus a label block with the mark/keynote number, dimensions, system type, and glass spec.

Your job: extract every mark visible in the schedule and return structured data.

SCOPE TYPES (pick the closest):
  curtain_wall    — stick-built or unitized curtain wall (thermally broken, large spans)
  storefront      — aluminum framed storefront (thermally broken or non-TB, spans ≤ 12' typ.)
  glass_door      — aluminum-framed glass door (hinged, pivot, sliding; framed in SF or CW)
  overhead_door   — overhead sectional door with glass panels
  rolling_door    — rolling steel or glass door (storefront)
  all_glass_wall  — frameless tempered glass partition (butt-jointed, patch fittings)
  other           — non-glazing openings (solid doors, louvers, etc.)

OPENING TYPES (pick one):
  single           one leaf
  pair             two leaves, no sidelites
  sgl+sidelite     one leaf + one or two sidelites
  pair+sidelite    two leaves + sidelites
  overhead         overhead/sectional panel
  sliding          sliding panels
  curtain_wall_panel  one bay of a curtain wall grid
  other

DIMENSION FORMAT:
  Read "W × H" or "Width / Height" labels.  Convert to decimal feet.
  Fractions: 4" = 0.333 ft, 6" = 0.5 ft, 8" = 0.667 ft.
  Example: 3'-4" × 7'-0" → width_ft: 3.333, height_ft: 7.0
  If a dimension is illegible, return null.

SYSTEM CODE:
  If the schedule labels an opening with a code that matches the system registry,
  use that code exactly.  If no code is shown but you can infer from context, infer.
  Return null if uncertain.

NON-GLAZING OPENINGS:
  Include them with scope_type "other" so the assembler can flag them.
  Set is_glazing_scope: false.

Return ONLY valid JSON — no markdown fences, no comments.
"""

SCHEDULE_USER = """\
Read the exterior door and frame schedule on this sheet.

Project: {project_name}   Sheet: {sheet_number}

System registry for reference (use to match system codes):
{registry_context}

For every mark/keynote visible in the schedule, return one entry.

Return JSON:
{{
  "entries": [
    {{
      "mark_id": "2",
      "system_code": "CW-1",
      "scope_type": "curtain_wall",
      "width_ft": 12.0,
      "height_ft": 10.333,
      "opening_type": "curtain_wall_panel",
      "glass_spec": "1 inch Solarban 72 OW IGU",
      "hardware_notes": "",
      "is_glazing_scope": true,
      "confidence": 0.90,
      "notes": ""
    }},
    {{
      "mark_id": "3",
      "system_code": "GD-1",
      "scope_type": "glass_door",
      "width_ft": 3.0,
      "height_ft": 7.0,
      "opening_type": "pair",
      "glass_spec": "1 inch tempered clear",
      "hardware_notes": "Concealed closer, panic hardware",
      "is_glazing_scope": true,
      "confidence": 0.95,
      "notes": ""
    }}
  ]
}}

List every mark visible. Return only the JSON.
"""


# ─── Schedule Reader ──────────────────────────────────────────────────────────

class ScheduleReader:
    """
    Step 4: Reads exterior door/frame schedule sheets to build the Schedule Registry.
    """

    def __init__(self, client: anthropic.Anthropic | None = None):
        self._client = client or anthropic.Anthropic()

    # ── Public API ────────────────────────────────────────────────────────────

    def process_schedule_sheet(
        self,
        pdf_path: str,
        page_index: int,
        sheet_number: str,
        sheet_title: str,
        project_name: str,
        system_registry: SystemRegistry | None = None,
        schedule_registry: ScheduleRegistry | None = None,
    ) -> ScheduleRegistry:
        """
        Process one exterior door/frame schedule sheet.

        Args:
            pdf_path:          Path to drawing PDF
            page_index:        0-based page number
            sheet_number:      e.g. "A3.2"
            sheet_title:       e.g. "Exterior Door and Frame Schedule"
            project_name:      For prompt context
            system_registry:   Optional — provides system code context for the model
            schedule_registry: Existing registry to update; creates new if None

        Returns:
            Updated ScheduleRegistry
        """
        if schedule_registry is None:
            schedule_registry = ScheduleRegistry(project_name=project_name)

        logger.info(f"Step 4 [ext_schedule] — {sheet_number}: {sheet_title}")

        block = pdf_page_to_vision_block(pdf_path, page_index, dpi=DPI_LEGEND)
        logger.info(
            f"  Rendered page {page_index} at {block.get('_dpi')} DPI "
            f"({block.get('_width_px')}x{block.get('_height_px')}px)"
        )

        schedule_registry = self._read_schedule_marks(
            block, sheet_number, project_name, system_registry, schedule_registry
        )

        return schedule_registry

    def process_schedule_sheets(
        self,
        pdf_path: str,
        classification: ClassificationResult,
        project_name: str,
        system_registry: SystemRegistry | None = None,
    ) -> ScheduleRegistry:
        """
        Process all sheets routed to step_4_ext_schedule.

        Args:
            pdf_path:        Path to drawing PDF
            classification:  Result from sheet_classifier.classify()
            project_name:    For prompt context
            system_registry: Optional system registry from Steps 2–3

        Returns:
            Populated ScheduleRegistry
        """
        schedule_sheets = classification.sheets_for_step("step_4_ext_schedule")
        schedule_registry = ScheduleRegistry(project_name=project_name)

        for sheet in schedule_sheets:
            schedule_registry = self.process_schedule_sheet(
                pdf_path=pdf_path,
                page_index=sheet.page_index,
                sheet_number=sheet.sheet_number,
                sheet_title=sheet.sheet_title,
                project_name=project_name,
                system_registry=system_registry,
                schedule_registry=schedule_registry,
            )

        return schedule_registry

    # ── Internal ──────────────────────────────────────────────────────────────

    def _read_schedule_marks(
        self,
        block: dict,
        sheet_number: str,
        project_name: str,
        system_registry: SystemRegistry | None,
        schedule_registry: ScheduleRegistry,
    ) -> ScheduleRegistry:
        """One API call — reads all marks from the schedule sheet."""

        registry_context = (
            system_registry.to_context_string()
            if system_registry
            else "(no system registry available — infer system codes from schedule labels)"
        )

        user_text = SCHEDULE_USER.format(
            project_name=project_name,
            sheet_number=sheet_number,
            registry_context=registry_context,
        )

        logger.info(f"  Pass 1 — reading schedule marks from {sheet_number}")

        response = self._client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=8192,
            system=SCHEDULE_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": [
                        strip_metadata(block),
                        {"type": "text", "text": user_text},
                    ],
                }
            ],
        )

        tokens = response.usage.input_tokens + response.usage.output_tokens
        schedule_registry.tokens_used += tokens

        raw = response.content[0].text.strip()
        # Strip markdown fences if present
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            msg = f"JSON parse error from {sheet_number}: {exc}"
            logger.error(f"  {msg}")
            schedule_registry.errors.append(msg)
            return schedule_registry

        added = 0
        for item in data.get("entries", []):
            try:
                entry = ScheduleEntry(
                    mark_id=str(item["mark_id"]),
                    system_code=item.get("system_code"),
                    scope_type=item.get("scope_type", "other"),
                    scope_hex=_SCOPE_HEX.get(item.get("scope_type", "other"), "#808080"),
                    width_ft=_parse_ft(item.get("width_ft")),
                    height_ft=_parse_ft(item.get("height_ft")),
                    opening_type=item.get("opening_type", "other"),
                    glass_spec=item.get("glass_spec", ""),
                    hardware_notes=item.get("hardware_notes", ""),
                    source_sheet=sheet_number,
                    confidence=float(item.get("confidence", 1.0)),
                    notes=item.get("notes", ""),
                )
                schedule_registry.add(entry)
                added += 1
            except (KeyError, TypeError, ValueError) as exc:
                logger.warning(f"  Skipping malformed entry {item.get('mark_id', '?')}: {exc}")

        logger.info(f"  {sheet_number}: {added} schedule entries added")
        for mark_id, e in sorted(
            schedule_registry.entries.items(), key=lambda x: _sort_key(x[0])
        ):
            if e.source_sheet == sheet_number:
                dim = "?×?"
                if e.width_ft is not None and e.height_ft is not None:
                    w_in = int(round(e.width_ft * 12))
                    h_in = int(round(e.height_ft * 12))
                    dim = f"{w_in // 12}'-{w_in % 12:02d}\" x {h_in // 12}'-{h_in % 12:02d}\""
                sys_label = f" ({e.system_code})" if e.system_code else ""
                logger.info(
                    f"    {mark_id:6s}  [{e.scope_type:18s}]  {dim:18s}  "
                    f"{e.opening_type}{sys_label}"
                )

        return schedule_registry


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _parse_ft(val) -> float | None:
    """Coerce a model value to float feet; return None if not parseable."""
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


# ─── CLI / quick-test ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os, sys

    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    if len(sys.argv) < 3:
        print("Usage: python -m glazierai.modules.drawing_intelligence.schedule_reader"
              " <pdf_path> <project_name>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    project_name = sys.argv[2]

    # ── Step 1: Classify ──────────────────────────────────────────────────────
    from .sheet_classifier import SheetClassifier, ProcessStep

    MCLARTY_OVERRIDES: dict[str, ProcessStep] = {
        "A3.0": "step_6_floor_plan",
        "A3.1": "skip",
        "A3.2": "step_4_ext_schedule",
        "A3.3": "step_3_elevation",
    }

    classifier = SheetClassifier()
    classification = classifier.classify(
        pdf_path, routing_overrides=MCLARTY_OVERRIDES
    )
    logger.info("")

    # ── Step 3: Build System Registry from A2.0 legend ───────────────────────
    from .elevation_reader import ElevationReader, MarkRegistry

    elevation_sheets = classification.sheets_for_step("step_3_elevation")
    system_registry = None
    mark_registry = MarkRegistry(project_name=project_name)

    # Only run legend extraction on A2.0 (exterior_with_legend mode)
    # to keep token cost low for this test
    for sheet in elevation_sheets:
        if sheet.sheet_number == "A2.0":
            reader = ElevationReader()
            system_registry, mark_registry = reader.process_elevation_sheet(
                pdf_path=pdf_path,
                page_index=sheet.page_index,
                sheet_number=sheet.sheet_number,
                sheet_title=sheet.sheet_title,
                sheet_mode="exterior_with_legend",
                project_name=project_name,
                elevation_names=["West", "East", "South", "North"],
            )
            break

    logger.info("")
    if system_registry:
        logger.info("System registry built from A2.0:")
        for code, entry in sorted(system_registry.entries.items()):
            if entry.is_glazing_scope:
                logger.info(f"  {code}: [{entry.scope_type}] {entry.description}")
    logger.info("")

    # ── Step 4: Read A3.2 schedule ───────────────────────────────────────────
    schedule_sheets = classification.sheets_for_step("step_4_ext_schedule")
    if not schedule_sheets:
        logger.warning("No sheets routed to step_4_ext_schedule — check overrides")
        sys.exit(1)

    sched_reader = ScheduleReader()
    schedule_registry = ScheduleRegistry(project_name=project_name)

    for sheet in schedule_sheets:
        schedule_registry = sched_reader.process_schedule_sheet(
            pdf_path=pdf_path,
            page_index=sheet.page_index,
            sheet_number=sheet.sheet_number,
            sheet_title=sheet.sheet_title,
            project_name=project_name,
            system_registry=system_registry,
            schedule_registry=schedule_registry,
        )

    # ── Summary ───────────────────────────────────────────────────────────────
    total_tokens = (
        classification.tokens_used
        + (system_registry.tokens_used if system_registry else 0)
        + (mark_registry.tokens_used if mark_registry else 0)
        + schedule_registry.tokens_used
    )
    logger.info("")
    logger.info(f"Total tokens used: {total_tokens:,}")

    divider = "=" * 60

    print(f"\n{divider}")
    print("SYSTEM REGISTRY")
    print(divider)
    if system_registry:
        print(system_registry.to_context_string())
    else:
        print("(none built)")

    print(f"\n{divider}")
    print("SCHEDULE REGISTRY")
    print(divider)
    print(schedule_registry.to_summary_string())

    print(f"\n{divider}")
    print("SCHEDULE ENTRIES — FULL DETAIL")
    print(divider)
    for mark_id, e in sorted(
        schedule_registry.entries.items(), key=lambda x: _sort_key(x[0])
    ):
        dim_str = "unknown"
        if e.width_ft is not None and e.height_ft is not None:
            w_in = int(round(e.width_ft * 12))
            h_in = int(round(e.height_ft * 12))
            dim_str = f"{w_in // 12}'-{w_in % 12:02d}\" x {h_in // 12}'-{h_in % 12:02d}\""
        print(f"\n  {mark_id}")
        print(f"    scope    : [{e.scope_type}]  {e.scope_hex}")
        print(f"    system   : {e.system_code or '--'}")
        print(f"    dims     : {dim_str}")
        print(f"    type     : {e.opening_type}")
        print(f"    glass    : {e.glass_spec or '--'}")
        if e.hardware_notes:
            print(f"    hardware : {e.hardware_notes}")
        if e.notes:
            print(f"    notes    : {e.notes}")
        print(f"    conf     : {e.confidence:.2f}  [{e.source_sheet}]")
