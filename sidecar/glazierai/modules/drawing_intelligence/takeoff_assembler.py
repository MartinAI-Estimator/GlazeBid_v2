"""
GlazierAI Drawing Intelligence — Takeoff Assembler

Joins the three registries produced by Steps 2–4 into a structured
TakeoffResult ready for Builder ingest.

Join logic:
  Phase 1 — Schedule entries (have dims): group by scope_type + system_code,
             compute total SF, count door units.
  Phase 2 — Mark entries with no schedule match: create "no dims" groups,
             flag for field measure.
  Phase 3 — System registry coverage: flag systems with no marks or schedule
             entries for manual review.

Output: TakeoffResult → to_dict() / to_json() → Builder system card population
"""

from __future__ import annotations
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from .legend_extractor import SystemRegistry
from .elevation_reader import MarkRegistry
from .schedule_reader import ScheduleRegistry

logger = logging.getLogger(__name__)


# ─── Scope sort order ─────────────────────────────────────────────────────────

_SCOPE_ORDER: dict[str, int] = {
    "curtain_wall":   0,
    "storefront":     1,
    "glass_door":     2,
    "all_glass_wall": 3,
    "glass_film":     4,
    "overhead_door":  5,
    "rolling_door":   6,
    "other":          7,
}

# scope types that are not glazing scope and should be skipped
_NON_GLAZING_SCOPES = {"other", "overhead_door", "rolling_door"}


def _sort_key(mark_id: str):
    try:
        return (0, int(mark_id), "")
    except ValueError:
        return (1, 0, mark_id)


# ─── Output data structures ───────────────────────────────────────────────────

@dataclass
class TakeoffGroup:
    """
    One line in the takeoff — a unique (scope_type, system_code) combination.

    For exterior systems with schedule dimensions: total_sf is computed.
    For interior marks without schedule entries: total_sf is None and
    entry_count gives the mark count for estimating purposes.
    """
    scope_type: str
    scope_hex: str
    system_code: str | None      # e.g. "SF-1"; None for unlinked interior marks
    manufacturer: str | None
    series: str | None
    glazing: str | None          # glass spec from system registry
    marks: list[str]             # mark_ids contributing to this group
    mark_entries: list[dict]     # per-mark dims: [{mark_id, width_in, height_in, opening_type, sf}]
    total_sf: float | None       # sum of W×H; None = no dimensions available
    door_pairs: int              # count of pair-door openings
    door_singles: int            # count of single-door openings
    entry_count: int             # total mark instances in this group
    source_sheets: list[str]
    flags: list[str]

    def to_dict(self) -> dict:
        return {
            "scope_type":    self.scope_type,
            "scope_hex":     self.scope_hex,
            "system_code":   self.system_code,
            "manufacturer":  self.manufacturer,
            "series":        self.series,
            "glazing":       self.glazing,
            "marks":         sorted(self.marks, key=_sort_key),
            "mark_entries":  sorted(self.mark_entries, key=lambda e: _sort_key(e["mark_id"])),
            "total_sf":      round(self.total_sf, 2) if self.total_sf is not None else None,
            "door_pairs":    self.door_pairs,
            "door_singles":  self.door_singles,
            "entry_count":   self.entry_count,
            "source_sheets": sorted(self.source_sheets),
            "flags":         self.flags,
        }


@dataclass
class TakeoffResult:
    """Final assembled takeoff for one drawing set."""
    project: str
    systems: list[TakeoffGroup]
    unmatched_marks: list[str]            # marks with no schedule entry
    unmatched_schedule_entries: list[str] # schedule entries with no elevation mark
    manual_review_items: list[str]
    total_tokens: int
    generated_at: str                     # ISO 8601

    def to_dict(self) -> dict:
        return {
            "project":                    self.project,
            "generated_at":               self.generated_at,
            "total_tokens":               self.total_tokens,
            "systems":                    [g.to_dict() for g in self.systems],
            "unmatched_marks":            self.unmatched_marks,
            "unmatched_schedule_entries": self.unmatched_schedule_entries,
            "manual_review_items":        self.manual_review_items,
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)


# ─── Assembler ────────────────────────────────────────────────────────────────

def assemble(
    system_registry: SystemRegistry,
    mark_registry: MarkRegistry,
    schedule_registry: ScheduleRegistry | None,
    project_name: str = "",
    total_tokens: int = 0,
) -> TakeoffResult:
    """
    Join the three registries into a TakeoffResult.

    Args:
        system_registry:   Built by Steps 2–3 (legend + elevation)
        mark_registry:     Built by Step 3 (elevation marks)
        schedule_registry: Built by Step 4 (exterior door/frame schedule)
        project_name:      e.g. "McLarty Mazda"
        total_tokens:      Sum of tokens from all upstream steps

    Returns:
        TakeoffResult with groups, flags, and QC lists
    """
    groups: dict[tuple[str, str | None], TakeoffGroup] = {}

    # mark_ids and system_codes that the schedule already covers
    schedule_covered_marks: set[str] = set()
    schedule_covered_systems: set[str] = set()

    # ── Phase 1: Schedule entries → primary dimensional data ─────────────────
    for mark_id, entry in (schedule_registry.entries.items() if schedule_registry else []):
        if entry.scope_type in _NON_GLAZING_SCOPES:
            continue

        key = (entry.scope_type, entry.system_code)
        if key not in groups:
            sys_entry = (
                system_registry.get(entry.system_code)
                if entry.system_code
                else None
            )
            groups[key] = TakeoffGroup(
                scope_type=entry.scope_type,
                scope_hex=entry.scope_hex,
                system_code=entry.system_code,
                manufacturer=sys_entry.manufacturer if sys_entry else None,
                series=sys_entry.series if sys_entry else None,
                glazing=sys_entry.glazing if sys_entry else (entry.glass_spec or None),
                marks=[],
                mark_entries=[],
                total_sf=0.0,
                door_pairs=0,
                door_singles=0,
                entry_count=0,
                source_sheets=[],
                flags=[],
            )

        g = groups[key]
        g.marks.append(mark_id)
        g.entry_count += 1
        if entry.source_sheet not in g.source_sheets:
            g.source_sheets.append(entry.source_sheet)

        width_in = round(entry.width_ft * 12) if entry.width_ft is not None else None
        height_in = round(entry.height_ft * 12) if entry.height_ft is not None else None
        g.mark_entries.append({
            "mark_id": mark_id,
            "width_in": width_in,
            "height_in": height_in,
            "opening_type": entry.opening_type,
            "sf": round(entry.width_ft * entry.height_ft, 2) if entry.width_ft and entry.height_ft else None,
        })

        if entry.width_ft is not None and entry.height_ft is not None:
            g.total_sf = (g.total_sf or 0.0) + entry.width_ft * entry.height_ft
        else:
            _add_flag(g, "no_dims_on_some_entries")

        ot = entry.opening_type
        if ot in ("pair", "pair+sidelite"):
            g.door_pairs += 1
        elif ot in ("single", "sgl+sidelite"):
            g.door_singles += 1

        schedule_covered_marks.add(mark_id)
        if entry.system_code:
            schedule_covered_systems.add(entry.system_code)

    # Clean up groups whose total_sf is still 0.0 (all entries had no dims)
    for g in groups.values():
        if g.total_sf == 0.0:
            g.total_sf = None
            _add_flag(g, "no_dims_available")

    # ── Phase 2: Mark entries not covered by schedule ─────────────────────────
    unmatched_mark_ids: list[str] = []

    for mark_id, mark in mark_registry.marks.items():
        if not mark.is_glazing_scope:
            continue
        if mark_id in schedule_covered_marks:
            continue
        # System-code covered: mark references an exterior system already in the takeoff
        if mark.system_code and mark.system_code in schedule_covered_systems:
            logger.debug(f"  Mark {mark_id} system-covered by {mark.system_code} — skipping")
            continue

        # True unmatched: create a dims-unknown group
        key = (mark.scope_type, mark.system_code)
        if key not in groups:
            sys_entry = (
                system_registry.get(mark.system_code)
                if mark.system_code
                else None
            )
            groups[key] = TakeoffGroup(
                scope_type=mark.scope_type,
                scope_hex=mark.scope_hex,
                system_code=mark.system_code,
                manufacturer=sys_entry.manufacturer if sys_entry else None,
                series=sys_entry.series if sys_entry else None,
                glazing=sys_entry.glazing if sys_entry else None,
                marks=[],
                mark_entries=[],
                total_sf=None,
                door_pairs=0,
                door_singles=0,
                entry_count=0,
                source_sheets=[],
                flags=["no_schedule_dims — field measure required"],
            )

        g = groups[key]
        g.marks.append(mark_id)
        g.entry_count += 1
        if mark.source_sheet not in g.source_sheets:
            g.source_sheets.append(mark.source_sheet)
        g.mark_entries.append({
            "mark_id": mark_id,
            "width_in": None,
            "height_in": None,
            "opening_type": None,
            "sf": None,
        })
        unmatched_mark_ids.append(mark_id)

    # ── Phase 3: System registry coverage check ───────────────────────────────
    manual_review_items: list[str] = []

    for code, sys_entry in sorted(system_registry.entries.items()):
        if not sys_entry.is_glazing_scope:
            continue
        if code in schedule_covered_systems:
            continue
        # Also covered if the code appears as a group key via marks
        if any(g.system_code == code for g in groups.values()):
            continue

        glazing_lower = (sys_entry.glazing or "").lower()
        desc_lower = (sys_entry.description or "").lower()

        if "spandrel" in glazing_lower or "spandrel" in desc_lower:
            manual_review_items.append(
                f"{code} [{sys_entry.scope_type}] — spandrel panel; "
                f"area included in parent system calculation"
            )
        elif sys_entry.scope_type == "glass_film":
            manual_review_items.append(
                f"{code} [{sys_entry.scope_type}] — area not determined; add manually"
            )
        else:
            manual_review_items.append(
                f"{code} [{sys_entry.scope_type}] — no marks or schedule entries found; "
                f"verify on elevation drawings"
            )

    # ── Phase 4: Schedule entries with no elevation mark ─────────────────────
    mark_ids_in_registry = set(mark_registry.marks.keys())
    unmatched_sched: list[str] = []
    for mark_id, entry in (schedule_registry.entries.items() if schedule_registry else []):
        if entry.scope_type in _NON_GLAZING_SCOPES:
            continue
        if mark_id not in mark_ids_in_registry:
            unmatched_sched.append(mark_id)

    # ── Sort and return ───────────────────────────────────────────────────────
    sorted_groups = sorted(
        groups.values(),
        key=lambda g: (
            _SCOPE_ORDER.get(g.scope_type, 9),
            g.system_code or "~",
        ),
    )

    return TakeoffResult(
        project=project_name,
        systems=sorted_groups,
        unmatched_marks=sorted(set(unmatched_mark_ids), key=_sort_key),
        unmatched_schedule_entries=sorted(unmatched_sched, key=_sort_key),
        manual_review_items=manual_review_items,
        total_tokens=total_tokens,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


def _add_flag(group: TakeoffGroup, flag: str) -> None:
    if flag not in group.flags:
        group.flags.append(flag)


# ─── CLI / end-to-end validation ──────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    if len(sys.argv) < 3:
        print(
            "Usage: python -m glazierai.modules.drawing_intelligence.takeoff_assembler"
            " <pdf_path> <project_name>"
        )
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
    classification = classifier.classify(pdf_path, routing_overrides=MCLARTY_OVERRIDES)
    logger.info("")

    # ── Step 3: All elevation sheets ──────────────────────────────────────────
    from .elevation_reader import ElevationReader, MarkRegistry

    elev_reader = ElevationReader()
    system_registry = None
    mark_registry = MarkRegistry(project_name=project_name)

    elev_sheets = classification.sheets_for_step("step_3_elevation")
    for sheet in elev_sheets:
        if sheet.sheet_number == "A2.0":
            mode = "exterior_with_legend"
            elev_names = ["West", "East", "South", "North"]
        else:
            mode = "interior_schedule"
            elev_names = None

        system_registry, mark_registry = elev_reader.process_elevation_sheet(
            pdf_path=pdf_path,
            page_index=sheet.page_index,
            sheet_number=sheet.sheet_number,
            sheet_title=sheet.sheet_title,
            sheet_mode=mode,
            project_name=project_name,
            system_registry=system_registry,
            mark_registry=mark_registry,
            elevation_names=elev_names,
        )
    logger.info("")

    # ── Step 4: Exterior schedule ─────────────────────────────────────────────
    from .schedule_reader import ScheduleReader, ScheduleRegistry

    sched_reader = ScheduleReader()
    schedule_registry = ScheduleRegistry(project_name=project_name)

    for sheet in classification.sheets_for_step("step_4_ext_schedule"):
        schedule_registry = sched_reader.process_schedule_sheet(
            pdf_path=pdf_path,
            page_index=sheet.page_index,
            sheet_number=sheet.sheet_number,
            sheet_title=sheet.sheet_title,
            project_name=project_name,
            system_registry=system_registry,
            schedule_registry=schedule_registry,
        )
    logger.info("")

    # ── Assemble ──────────────────────────────────────────────────────────────
    total_tokens = (
        classification.tokens_used
        + (system_registry.tokens_used if system_registry else 0)
        + mark_registry.tokens_used
        + schedule_registry.tokens_used
    )

    result = assemble(
        system_registry=system_registry,
        mark_registry=mark_registry,
        schedule_registry=schedule_registry,
        project_name=project_name,
        total_tokens=total_tokens,
    )

    # ── Human-readable summary ────────────────────────────────────────────────
    divider = "=" * 60
    logger.info(f"Assembled {len(result.systems)} takeoff groups, "
                f"{total_tokens:,} total tokens")

    print(f"\n{divider}")
    print(f"TAKEOFF SUMMARY — {project_name}")
    print(divider)

    for g in result.systems:
        sf_str = f"{g.total_sf:,.1f} SF" if g.total_sf is not None else "dims unknown"
        door_str = ""
        if g.door_pairs or g.door_singles:
            parts = []
            if g.door_pairs:
                parts.append(f"{g.door_pairs} pair{'s' if g.door_pairs > 1 else ''}")
            if g.door_singles:
                parts.append(f"{g.door_singles} single{'s' if g.door_singles > 1 else ''}")
            door_str = "  " + " + ".join(parts)
        sys_label = f" ({g.system_code})" if g.system_code else ""
        src_label = ", ".join(g.source_sheets)
        print(
            f"  [{g.scope_type}]{sys_label}  "
            f"{g.entry_count} marks  {sf_str}{door_str}  [{src_label}]"
        )
        if g.flags:
            for flag in g.flags:
                print(f"    ! {flag}")

    if result.manual_review_items:
        print(f"\n  MANUAL REVIEW ({len(result.manual_review_items)} items):")
        for item in result.manual_review_items:
            print(f"    * {item}")

    if result.unmatched_marks:
        print(
            f"\n  UNMATCHED MARKS ({len(result.unmatched_marks)}) — "
            f"no schedule entry: {', '.join(result.unmatched_marks[:10])}"
            + (" ..." if len(result.unmatched_marks) > 10 else "")
        )

    if result.unmatched_schedule_entries:
        print(
            f"\n  UNMATCHED SCHEDULE ENTRIES ({len(result.unmatched_schedule_entries)}) — "
            f"not found on elevations: {', '.join(result.unmatched_schedule_entries[:10])}"
            + (" ..." if len(result.unmatched_schedule_entries) > 10 else "")
        )

    # ── JSON output ───────────────────────────────────────────────────────────
    print(f"\n{divider}")
    print("TAKEOFF JSON (Builder ingest format)")
    print(divider)
    print(result.to_json())
