"""
alerts.py

Post-processing alert engine for GlazierAI Spec Reader.

Claude generates alerts inline during extraction. This module runs AFTER the
Claude API call and applies deterministic rule-based checks to:
  1. Promote severity of alerts Claude may have under-flagged
  2. Inject standard alerts for conditions Claude reliably detects but
     may not always generate (belt-and-suspenders)
  3. Deduplicate alerts
  4. Sort alerts by severity (critical → warning → info)

Rules are derived from the prompt spec's "ESTIMATOR ALERT RULES" section.
"""

from __future__ import annotations

import logging
from .schema import EstimatorAlert, SectionExtraction

logger = logging.getLogger("glazierai.spec_reader.alerts")

_SEVERITY_ORDER = {"critical": 0, "warning": 1, "info": 2}


def post_process(section: SectionExtraction) -> SectionExtraction:
    """
    Run all post-processing rules against an extracted SpecSection.
    Mutates section.estimator_alerts in place, then returns the section.
    """
    alerts = list(section.estimator_alerts)

    # ── CRITICAL rules ────────────────────────────────────────────────────────

    if section.testing.mockup_required.required:
        desc = section.testing.mockup_required.description or "see spec"
        _ensure_alert(alerts, severity="critical", category="cost",
            message=f"Mock-up required: {desc}. This is a significant cost and schedule item.",
            source_reference="testing.mockup_required")

    if section.manufacturers.framing.type == "no_substitutions":
        _ensure_alert(alerts, severity="critical", category="risk",
            message="No substitutions allowed on framing system. You must price the named "
                    "manufacturer only — verify lead time and availability before bidding.",
            source_reference="manufacturers.framing")

    if section.glass.special_requirements:
        req = section.glass.special_requirements.lower()
        if "blast" in req:
            _ensure_alert(alerts, severity="critical", category="cost",
                message="Blast-resistant glazing specified. Requires specialized glass, "
                        "framing, anchorage, and contractor qualification. Obtain specialty quote.",
                source_reference="glass.special_requirements")
        if "bullet" in req or "ballistic" in req:
            _ensure_alert(alerts, severity="critical", category="cost",
                message="Bullet-resistant glazing specified. Requires UL 752 rated glass "
                        "and framing. Obtain specialty quote.",
                source_reference="glass.special_requirements")
        if "bird" in req:
            _ensure_alert(alerts, severity="critical", category="scope",
                message="Bird-friendly glazing required. Fritting, UV coating, or pattern "
                        "film must be specified and priced.",
                source_reference="glass.special_requirements")
        if "hurricane" in req or "impact" in req:
            _ensure_alert(alerts, severity="critical", category="cost",
                message="Hurricane/impact-rated glazing specified. Verify impact ratings, "
                        "NOA numbers, and Florida Product Approval if applicable.",
                source_reference="glass.special_requirements")

    if section.submittals.delegated_design_pe_stamp.required or \
       section.qualifications.delegated_design_engineer:
        _ensure_alert(alerts, severity="critical", category="cost",
            message="Delegated design (PE-stamped engineering) required. Budget for "
                    "engineering fees — typically $3,000–$15,000 depending on system complexity.",
            source_reference="qualifications.delegated_design_engineer")

    # ── WARNING rules ─────────────────────────────────────────────────────────

    if section.glass.fire_rated.required:
        ratings = section.glass.fire_rated.ratings_minutes
        rating_str = ", ".join(f"{r} min" for r in ratings) if ratings else "unspecified duration"
        _ensure_alert(alerts, severity="warning", category="cost",
            message=f"Fire-rated glazing required ({rating_str}). This is a premium-cost "
                    "item. Confirm fire-rated framing is also required.",
            source_reference="glass.fire_rated")

    if section.testing.field_water_test.required:
        std = section.testing.field_water_test.standard or "AAMA 501.2"
        _ensure_alert(alerts, severity="warning", category="cost",
            message=f"Field water testing required ({std}). Budget for third-party test "
                    "agency, scheduling coordination, and potential remediation.",
            source_reference="testing.field_water_test")

    if section.qualifications.nacc_certified:
        _ensure_alert(alerts, severity="warning", category="qualification",
            message="NACC contractor certification required. Confirm your firm holds "
                    "current NACC certification before bidding.",
            source_reference="qualifications.nacc_certified")

    if section.qualifications.agmt_certified_technicians:
        _ensure_alert(alerts, severity="warning", category="qualification",
            message="AGMT-certified glazing technicians required on this project.",
            source_reference="qualifications.agmt_certified_technicians")

    if section.qualifications.egress_door_inspector.required:
        cert = section.qualifications.egress_door_inspector.certification or "DHI FDAI"
        _ensure_alert(alerts, severity="warning", category="qualification",
            message=f"Egress door inspector required — must hold {cert} certification.",
            source_reference="qualifications.egress_door_inspector")

    if section.manufacturers.single_source_required:
        _ensure_alert(alerts, severity="warning", category="risk",
            message="Single source required — all framing, doors, and glazing components "
                    "must come from one manufacturer. Limits competitive quoting.",
            source_reference="manufacturers.single_source_required")

    if section.testing.preinstallation_conference:
        _ensure_alert(alerts, severity="warning", category="schedule",
            message="Pre-installation conference required. Coordinate with GC before "
                    "scheduling installation — this is a contractual prerequisite.",
            source_reference="testing.preinstallation_conference")

    if section.submittals.sustainable_design:
        _ensure_alert(alerts, severity="warning", category="cost",
            message="Sustainable design submittals required (EPD, HPD, VOC reports, recycled "
                    "content, regional materials). Confirm all suppliers can provide "
                    "documentation before bidding.",
            source_reference="submittals.sustainable_design")

    if section.submittals.color_samples_architect_selection.required:
        _ensure_alert(alerts, severity="warning", category="schedule",
            message="Color samples require Architect selection before fabrication can begin. "
                    "Build review time into your schedule — this is a common delay driver.",
            source_reference="submittals.color_samples_architect_selection")

    if (section.finish.warranty_years or 0) > 10:
        _ensure_alert(alerts, severity="warning", category="risk",
            message=f"Finish warranty specified at {section.finish.warranty_years} years — "
                    "above standard 10-year KYNAR warranty. Confirm manufacturer can provide.",
            source_reference="finish.warranty_years")

    if section.performance.seismic:
        _ensure_alert(alerts, severity="warning", category="cost",
            message=f"Seismic performance required ({section.performance.seismic}). "
                    "Verify anchorage design and deflection accommodation.",
            source_reference="performance.seismic")

    if section.performance.crf.fixed_value is not None:
        _ensure_alert(alerts, severity="warning", category="cost",
            message=f"Condensation Resistance Factor (CRF) specified (≥{section.performance.crf.fixed_value} "
                    "fixed glazing). This confirms thermally broken framing required.",
            source_reference="performance.crf")

    # ── INFO rules ────────────────────────────────────────────────────────────

    if len(section.system.framing_types) > 1:
        types = " / ".join(section.system.framing_types)
        _ensure_alert(alerts, severity="info", category="scope",
            message=f"Multiple framing types in one section: {types}. "
                    "Price each type separately.",
            source_reference="system.framing_types")

    if (section.performance.crf.door_value and section.performance.crf.fixed_value and
            abs(section.performance.crf.door_value - section.performance.crf.fixed_value) > 15):
        _ensure_alert(alerts, severity="info", category="scope",
            message=f"Entrance door CRF ({section.performance.crf.door_value}) differs "
                    f"significantly from fixed glazing CRF ({section.performance.crf.fixed_value}) "
                    "— confirms thermally broken door frames required.",
            source_reference="performance.crf")

    if (section.performance.u_factor.value is None and
            not section.performance.u_factor.defer_to_drawings):
        _ensure_alert(alerts, severity="info", category="scope",
            message="U-factor not specified in this section — check 08 80 00 or energy model.",
            source_reference="performance.u_factor")

    if section.glass.min_exterior_thickness_mm:
        _ensure_alert(alerts, severity="info", category="scope",
            message=f"Minimum exterior glass thickness specified: "
                    f"{section.glass.min_exterior_thickness_mm}mm. Verify glass schedule.",
            source_reference="glass.min_exterior_thickness_mm")

    # ── Deduplicate and sort ──────────────────────────────────────────────────

    alerts = _deduplicate(alerts)
    alerts.sort(key=lambda a: (_SEVERITY_ORDER.get(a.severity, 9), a.category))

    section.estimator_alerts = alerts
    return section


def _ensure_alert(
    alerts: list[EstimatorAlert],
    severity: str,
    category: str,
    message: str,
    source_reference: str | None = None,
) -> None:
    """
    Add an alert only if no existing alert covers the same condition.
    Deduplication is by message prefix (first 60 chars).
    """
    key = message[:60].lower()
    for existing in alerts:
        if existing.message[:60].lower() == key:
            # Promote severity if needed
            if _SEVERITY_ORDER.get(severity, 9) < _SEVERITY_ORDER.get(existing.severity, 9):
                existing.severity = severity  # type: ignore[assignment]
            return
    alerts.append(EstimatorAlert(
        severity=severity,  # type: ignore[arg-type]
        category=category,  # type: ignore[arg-type]
        message=message,
        source_reference=source_reference,
    ))


def _deduplicate(alerts: list[EstimatorAlert]) -> list[EstimatorAlert]:
    """Remove near-duplicate alerts (same first 60 chars), keeping highest severity."""
    seen: dict[str, EstimatorAlert] = {}
    for alert in alerts:
        key = alert.message[:60].lower()
        if key not in seen:
            seen[key] = alert
        else:
            existing = seen[key]
            if _SEVERITY_ORDER.get(alert.severity, 9) < _SEVERITY_ORDER.get(existing.severity, 9):
                seen[key] = alert
    return list(seen.values())
