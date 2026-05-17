"""
GlazierAI Spec Reader — Extractor + Alert Engine
Claude API extraction calls and post-processing alert rules.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import anthropic

from .prompts import SYSTEM_PROMPT, build_extraction_prompt
from .schema import (
    SectionExtraction,
    EstimatorAlert,
    MockupSpec,
    FieldWaterTestSpec,
)

logger = logging.getLogger(__name__)

# Claude model — always Sonnet 4, temperature 0 for deterministic extraction
_MODEL = "claude-sonnet-4-20250514"
_MAX_TOKENS = 4096
_TEMPERATURE = 0


# ─── Extractor ────────────────────────────────────────────────────────────────

class SpecExtractor:
    """
    Calls Claude API to extract structured data from a CSI spec section.
    One instance per application lifecycle — reuse the client.
    """

    def __init__(self, api_key: str | None = None):
        """
        Args:
            api_key: Anthropic API key. If None, reads from ANTHROPIC_API_KEY env var.
        """
        self.client = anthropic.Anthropic(api_key=api_key)

    def extract_section(
        self,
        project_name: str,
        csi_number: str,
        csi_title: str,
        section_text: str,
    ) -> SectionExtraction:
        """
        Extract structured data from a single CSI section via Claude API.

        Args:
            project_name: Full project name
            csi_number:   e.g. "08 41 13"
            csi_title:    e.g. "Aluminum-Framed Entrances and Storefronts"
            section_text: Raw text of the spec section

        Returns:
            SectionExtraction with all fields populated.
            On API or parse error, returns a minimal result with extraction_error set.
        """
        user_prompt = build_extraction_prompt(
            project_name=project_name,
            csi_number=csi_number,
            csi_title=csi_title,
            section_text=section_text,
        )

        logger.info(f"Extracting {csi_number} — {csi_title} ({len(section_text):,} chars)")
        t0 = time.perf_counter()

        try:
            response = self.client.messages.create(
                model=_MODEL,
                max_tokens=_MAX_TOKENS,
                temperature=_TEMPERATURE,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            )
        except anthropic.APIError as e:
            logger.error(f"Claude API error for {csi_number}: {e}")
            return SectionExtraction(
                csi_number=csi_number,
                csi_title=csi_title,
                confidence=0.0,
                extraction_error=f"API error: {e}",
            )

        elapsed = time.perf_counter() - t0
        tokens_used = response.usage.output_tokens + response.usage.input_tokens
        logger.info(f"  → {tokens_used} tokens in {elapsed:.1f}s")

        # Extract text content from response
        raw_text = ""
        for block in response.content:
            if block.type == "text":
                raw_text += block.text

        # Parse JSON — strip markdown fences if Claude wrapped them
        raw_text = raw_text.strip()
        if raw_text.startswith("```"):
            lines = raw_text.split("\n")
            raw_text = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])

        try:
            raw_dict: dict[str, Any] = json.loads(raw_text)
        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error for {csi_number}: {e}")
            logger.debug(f"Raw response: {raw_text[:500]}")
            return SectionExtraction(
                csi_number=csi_number,
                csi_title=csi_title,
                confidence=0.0,
                extraction_error=f"JSON parse error: {e}",
                extraction_tokens_used=tokens_used,
            )

        # Validate and construct Pydantic model
        try:
            extraction = SectionExtraction.model_validate(raw_dict)
        except Exception as e:
            logger.warning(f"Pydantic validation warning for {csi_number}: {e}")
            # Attempt lenient construction — fill what we can
            extraction = _lenient_construct(raw_dict, csi_number, csi_title)

        extraction.extraction_tokens_used = tokens_used

        # Run post-processing alert rules
        extraction = _apply_alert_rules(extraction)

        logger.info(
            f"  → confidence={extraction.confidence:.0%}, "
            f"alerts={len(extraction.estimator_alerts)}"
        )
        return extraction

    async def extract_section_async(
        self,
        project_name: str,
        csi_number: str,
        csi_title: str,
        section_text: str,
    ) -> SectionExtraction:
        """
        Async version using AsyncAnthropic client.
        FastAPI endpoints should use this to avoid blocking the event loop.
        """
        async_client = anthropic.AsyncAnthropic(api_key=self.client.api_key)
        user_prompt = build_extraction_prompt(
            project_name=project_name,
            csi_number=csi_number,
            csi_title=csi_title,
            section_text=section_text,
        )

        logger.info(f"[async] Extracting {csi_number} — {csi_title}")
        t0 = time.perf_counter()

        try:
            response = await async_client.messages.create(
                model=_MODEL,
                max_tokens=_MAX_TOKENS,
                temperature=_TEMPERATURE,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            )
        except anthropic.APIError as e:
            logger.error(f"Claude API error for {csi_number}: {e}")
            return SectionExtraction(
                csi_number=csi_number,
                csi_title=csi_title,
                confidence=0.0,
                extraction_error=f"API error: {e}",
            )

        elapsed = time.perf_counter() - t0
        tokens_used = response.usage.output_tokens + response.usage.input_tokens
        logger.info(f"  → {tokens_used} tokens in {elapsed:.1f}s")

        raw_text = "".join(
            block.text for block in response.content if block.type == "text"
        ).strip()

        if raw_text.startswith("```"):
            lines = raw_text.split("\n")
            raw_text = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])

        try:
            raw_dict = json.loads(raw_text)
            extraction = SectionExtraction.model_validate(raw_dict)
        except Exception as e:
            logger.error(f"Parse/validation error for {csi_number}: {e}")
            extraction = SectionExtraction(
                csi_number=csi_number,
                csi_title=csi_title,
                confidence=0.0,
                extraction_error=str(e),
                extraction_tokens_used=tokens_used,
            )

        extraction.extraction_tokens_used = tokens_used
        extraction = _apply_alert_rules(extraction)
        return extraction


# ─── Alert Post-Processing Rules ──────────────────────────────────────────────
# Applied after Claude returns JSON. These catch anything Claude missed
# and enforce severity escalations.

def _apply_alert_rules(extraction: SectionExtraction) -> SectionExtraction:
    """
    Post-process extraction to apply deterministic alert rules.
    Adds alerts that Claude may have missed; promotes severity where needed.
    Deduplicates against existing alerts by message similarity.
    """
    existing_msgs = {a.message.lower() for a in extraction.estimator_alerts}

    def _add_alert(severity: str, category: str, message: str, ref: str | None = None) -> None:
        """Add alert only if not already present (dedup by keyword)"""
        key = message.lower()[:60]
        if not any(key[:30] in m for m in existing_msgs):
            extraction.estimator_alerts.append(EstimatorAlert(
                severity=severity,
                category=category,
                message=message,
                source_reference=ref,
            ))
            existing_msgs.add(key)

    # ── CRITICAL escalations ──────────────────────────────────────────────────

    # Mock-up → always CRITICAL
    if extraction.testing and extraction.testing.mockup_required:
        if extraction.testing.mockup_required.required:
            _add_alert("critical", "cost",
                       "Mock-up required — coordinate size, schedule, and location with GC before bidding.")

    # No substitutions → CRITICAL
    if extraction.manufacturers:
        for group_name in ("framing", "glass", "entrance_doors"):
            group = getattr(extraction.manufacturers, group_name, None)
            if group and group.type == "no_substitutions":
                _add_alert("critical", "risk",
                           f"No substitutions permitted on {group_name.replace('_', ' ')} — "
                           f"must use basis of design product. Confirm availability and lead time.")

    # ── WARNING rules ─────────────────────────────────────────────────────────

    # PE stamp
    if extraction.submittals and extraction.submittals.delegated_design_pe_stamp:
        if extraction.submittals.delegated_design_pe_stamp.required:
            _add_alert("warning", "cost",
                       "Delegated design required — PE-stamped engineering calculations must be provided. "
                       "Budget for engineering fees.")

    # NACC
    if extraction.qualifications and extraction.qualifications.nacc_certified:
        _add_alert("warning", "qualification",
                   "NACC contractor certification required. Confirm your firm holds current certification.")

    # AGMT
    if extraction.qualifications and extraction.qualifications.agmt_certified_technicians:
        _add_alert("warning", "qualification",
                   "AGMT-certified glazing technicians required on-site during installation.")

    # Egress door inspector
    if extraction.qualifications and extraction.qualifications.egress_door_inspector:
        insp = extraction.qualifications.egress_door_inspector
        if insp.required:
            cert = f" — must hold {insp.certification}" if insp.certification else ""
            _add_alert("warning", "qualification",
                       f"Egress door inspector required{cert}. Schedule inspection before punch list.")

    # Field water test
    if extraction.testing and extraction.testing.field_water_test:
        if extraction.testing.field_water_test.required:
            std = extraction.testing.field_water_test.standard or "field water test standard"
            _add_alert("warning", "cost",
                       f"Field water testing required ({std}). Budget for test coordination and any remediation.")

    # Fire-rated glazing
    if extraction.glass and extraction.glass.fire_rated and extraction.glass.fire_rated.required:
        ratings = extraction.glass.fire_rated.ratings_minutes
        rating_str = "/".join(str(r) for r in ratings) + "-minute" if ratings else ""
        _add_alert("warning", "scope",
                   f"Fire-rated glazing required ({rating_str}). "
                   f"Verify fire-rated framing system is included in scope.")

    # Sustainable design submittals
    if extraction.submittals and extraction.submittals.sustainable_design:
        _add_alert("warning", "schedule",
                   "Sustainable design submittals required (EPD, HPD, VOC reports, recycled content, "
                   "regional materials certificates). Confirm all suppliers can provide documentation.")

    # Single source
    if extraction.manufacturers and extraction.manufacturers.single_source_required:
        _add_alert("warning", "scope",
                   "Single source required — all framing components must come from one manufacturer. "
                   "Mixing manufacturer systems on this project is not permitted.")

    # Seismic
    if extraction.performance and extraction.performance.seismic:
        _add_alert("warning", "cost",
                   f"Seismic performance required ({extraction.performance.seismic}). "
                   f"Confirm seismic clips and connections are included in scope.")

    # ── INFO rules ────────────────────────────────────────────────────────────

    # Multiple framing types in one section
    if extraction.system and len(extraction.system.framing_types) > 1:
        types_str = " / ".join(extraction.system.framing_types)
        _add_alert("info", "scope",
                   f"Multiple framing types in one section: {types_str}. Price each separately.")

    # CRF door >> CRF fixed (>15 point gap)
    if extraction.performance and extraction.performance.crf:
        crf = extraction.performance.crf
        if crf.fixed_value and crf.door_value:
            if abs(crf.door_value - crf.fixed_value) > 15:
                _add_alert("info", "scope",
                           f"Entrance door CRF ({crf.door_value}) is significantly higher than "
                           f"fixed glazing CRF ({crf.fixed_value}) — confirms thermally broken "
                           f"door frames required.")

    # U-factor not specified
    if extraction.performance:
        u = extraction.performance.u_factor
        if u is None or (u.value is None and not u.defer_to_drawings):
            _add_alert("info", "scope",
                       "U-factor not specified in this section — check 08 80 00 (Glazing) "
                       "or project energy model for glass performance requirements.")

    # Preinstallation conference
    if extraction.testing and extraction.testing.preinstallation_conference:
        _add_alert("info", "schedule",
                   "Pre-installation conference required at project site before glazing begins.")

    # Color sample selection by Architect
    if extraction.submittals and extraction.submittals.color_samples_architect_selection:
        cs = extraction.submittals.color_samples_architect_selection
        if cs.required:
            qty = f" ({cs.quantity})" if cs.quantity else ""
            _add_alert("info", "schedule",
                       f"Glass color samples{qty} required for Architect selection before fabrication. "
                       f"Build selection lead time into project schedule.")

    # Sort: critical → warning → info
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    extraction.estimator_alerts.sort(key=lambda a: severity_order.get(a.severity, 9))

    return extraction


# ─── Lenient Construction ─────────────────────────────────────────────────────

def _lenient_construct(
    raw: dict[str, Any],
    csi_number: str,
    csi_title: str,
) -> SectionExtraction:
    """
    Best-effort SectionExtraction from a raw dict that failed full validation.
    Preserves whatever fields parsed correctly.
    """
    return SectionExtraction(
        csi_number=raw.get("csi_number", csi_number),
        csi_title=raw.get("csi_title", csi_title),
        confidence=float(raw.get("confidence", 0.5)),
        low_confidence_fields=raw.get("low_confidence_fields", []),
        not_specified=raw.get("not_specified", []),
        defer_to_drawings=raw.get("defer_to_drawings", []),
        raw_flags=raw.get("raw_flags", []),
        extraction_error="Pydantic validation partial failure — some fields may be missing",
    )
