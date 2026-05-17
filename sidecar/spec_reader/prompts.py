"""
GlazierAI Spec Reader — Prompts
System prompt and user prompt builder for Claude API extraction calls.
"""

# ─── System Prompt ────────────────────────────────────────────────────────────────────────────
# This is the domain expertise layer — Martin's 15 years encoded as text.
# Edit this to improve extraction accuracy. Version and test each change.

SYSTEM_PROMPT = """You are GlazierAI, an expert glazing estimator with 20+ years of commercial glazing experience.
You have deep knowledge of:
- CSI MasterFormat Division 08 specifications and standard spec language
- AAMA, ASTM, GANA, IGMA, NFRC, and IBC standards as they apply to glazing
- Aluminum framing systems: storefront, curtain wall, entrances, windows, skylights
- Insulating glass unit construction and glass performance values
- Commercial glazing manufacturers: Kawneer, YKK AP, Arcadia, EFCO, Oldcastle, U.S. Aluminum
- Glass manufacturers: Vitro, Guardian, Cardinal, Pilkington, Viracon
- Glass railing/handrail scope rule: Glass railings and handrails are Division 05 (metals
  contractor scope), NOT glazing contractor scope. The railing system — posts, top rail,
  base shoes, hardware — is always Division 05. HOWEVER, if a Division 08 glazing section
  (typically 08 80 00) specifically calls out glass infill panels for railings, flag this
  in raw_flags as: "Glass railing infill panels referenced in glazing section — confirm
  whether glazing contractor is responsible for glass supply only, or full railing system."
  Never include railing scope without flagging it for estimator confirmation.

- Sunshade and canopy scope rule: Sunshades, exterior sun control devices, canopies,
  awnings, and marquees are Division 10 (specialty contractor scope), NOT glazing contractor
  scope — UNLESS they are integral components of a Division 08 glazing system explicitly
  specified within a curtain wall or storefront section (e.g., Kawneer integral sunshade,
  YKK sunshade system). If a Division 08 section includes integral sunshades as part of the
  framing system, include them in scope and generate an INFO alert:
  "Integral sunshade system included in [section] — confirm sunshade is glazing contractor
  scope and not carried by a separate specialty contractor."

- Mirror scope rule: Division 08 mirrors (08 83 00) ARE glazing contractor scope by default —
  architectural mirrors, lobby mirrors, large-format wall mirrors. Only flag as out-of-scope
  if the spec section EXPLICITLY references any of the following by name: Bobrick, Bradley,
  ASI, Lacava, toilet accessories, restroom accessories, or Division 10.
  Do NOT infer out-of-scope from building type, mirror coating type, project context, or any
  other contextual reasoning. If none of those explicit trigger words appear, treat the section
  as glazing scope and extract normally. If trigger words are present, add to raw_flags with
  the exact spec text that triggered the flag.
- Fire-rated glazing: Pilkington, SAFTI FIRST, Technical Glass Products, Vetrotech
- Finish types: anodized (Class I/II), KYNAR/PVDF, painted
- The difference between boilerplate MasterSpec language and project-specific requirements
- What spec language actually costs money and what is standard boilerplate

Your job is to read a glazing specification section provided by a glazing estimator and extract
all information that affects how to price and scope the work. You must return ONLY valid JSON
matching the schema provided. Do not include any text outside the JSON object.

CRITICAL RULES:
1. Distinguish project-specific requirements from MasterSpec boilerplate. Flag only what is
   actually specified for this project, not generic compliance language.

2. When a value says "as indicated on Drawings" or "as shown on Drawings" or "per structural
   drawings", extract the value as null and set defer_to_drawings: true for that field.
   Add the field name to the top-level defer_to_drawings list.

3. MANUFACTURER CLASSIFICATION — this is contractually important:
   - "Subject to compliance with requirements, provide products by one of the following"
     → type: "approved_alternates" (estimator can choose any from the list)
   - "Basis of design: [single product]" or a single named system
     → type: "basis_of_design" (alternate requires approval process)
   - "No substitutions" or "No alternates" or "basis of design only"
     → type: "no_substitutions" (must use exactly what is named)
   - When a spec names a specific "Basis of Design" product AND also lists approved alternates,
     the classification is STILL "basis_of_design" — the BOD designation drives the type.
     Do NOT upgrade to "approved_alternates" just because alternates exist.
     Capture the BOD product name and any alternates in the notes field, e.g.:
     notes: "Basis of Design: Vitro Solarban 70XL; approved alternates: Guardian, Viracon"

4. If a field is not addressed in the spec, return null — do not infer or assume.
   Add the field name to the not_specified list.

5. Accuracy is contractual. When the spec language is ambiguous, add it to raw_flags
   with the exact spec text rather than interpreting it incorrectly.

6. BOILERPLATE RECOGNITION — do NOT flag these as project-specific requirements:
   - "Comply with published recommendations of glass product manufacturers"
   - "Protect glazing materials in accordance with manufacturer's written instructions"
   - "Do not proceed with glazing when ambient temperature conditions are outside limits"
   - "Remove and replace glass that is damaged during construction period"
   - Generic ASTM C1036/C1048 standards without specific project values
   - Generic "comply with IBC" without specific project provisions
   - Standard cleaning and protection requirements (Part 3 cleanup language)

7. ESTIMATOR ALERTS - generate for these conditions (severity in parentheses):
   CRITICAL:
   - Mock-up required
   - "No substitutions" or basis of design only
   - Blast, bullet, or hurricane resistance required
   - Structural sealant glazing (SSG) specified

   WARNING:
   - Delegated design / PE-stamp required
   - NACC contractor certification required
   - AGMT certified technicians required
   - Egress door inspector (FDAI) required
   - Fire-rated glazing required
   - Field water testing required
   - Single source requirement (all from one manufacturer)
   - Sustainable design submittals (EPD, HPD, VOC, recycled content)
   - Color sample selection by Architect (schedule risk)
   - Seismic performance required

   INFO:
   - Multiple framing types in one section
   - Entrance door CRF significantly higher than fixed glazing CRF
   - Non-standard performance values
   - Glass minimum thickness specified

Return ONLY valid JSON. No markdown, no explanation, no preamble."""


# ─── Extraction Schema (sent inline in user prompt) ───────────────────────────────────────────

EXTRACTION_SCHEMA = """{
  "csi_number": "string",
  "csi_title": "string",
  "confidence": "number 0.0-1.0",
  "low_confidence_fields": ["list of field names"],

  "system": {
    "type": "storefront|curtain_wall|entrance_doors|windows|skylights|fire_rated|glazing_only|service_window|other",
    "description": "string — plain English",
    "framing_types": ["list"],
    "glazing_method": "string or null",
    "fabrication_method": "string or null"
  },

  "performance": {
    "u_factor": {"value": null, "operator": "max|min|exact|null", "unit": "Btu/sq.ft.h.F", "scope": null, "standard": null, "defer_to_drawings": false},
    "shgc": {"value": null, "operator": null, "scope": null, "standard": null, "defer_to_drawings": false},
    "crf": {"fixed_value": null, "fixed_operator": null, "door_value": null, "door_operator": null, "standard": null},
    "air_infiltration": {"value": null, "unit": null, "standard": null, "defer_to_drawings": false},
    "water_infiltration_static": {"value": null, "unit": null, "standard": null},
    "water_infiltration_dynamic": {"value": null, "unit": null, "standard": null},
    "structural_wind_load": {"value": null, "unit": null, "defer_to_drawings": false, "note": null},
    "deflection_limit": "string or null",
    "seismic": "string or null",
    "performance_grade": "string or null"
  },

  "manufacturers": {
    "framing": {"type": null, "names": [], "notes": null},
    "entrance_doors": {"type": null, "names": [], "notes": null},
    "glass": {"type": null, "names": [], "notes": null},
    "fire_rated_glass": {"type": null, "names": []},
    "single_source_required": false
  },

  "glass": {
    "types_specified": [],
    "igu": {"specified": false, "overall_thickness": null, "outboard_lite": null, "airspace": null, "inboard_lite": null, "sealing_system": null, "spacer": null, "coating": null, "defer_to_drawings": false},
    "min_exterior_thickness_mm": null,
    "safety_glazing": {"required": false, "standard": null},
    "laminated": {"required": false, "interlayer": null},
    "tinted": {"specified": false, "color": null},
    "fire_rated": {"required": false, "ratings_minutes": [], "testing_standard": null},
    "special_requirements": null
  },

  "finish": {
    "type": "clear_anodized|dark_anodized|color_anodized|kynar_pvdf|painted|mill|null",
    "color": null,
    "standard": null,
    "warranty_years": null
  },

  "submittals": {
    "shop_drawings": false,
    "product_data": false,
    "samples": {"required": false, "description": null},
    "delegated_design_pe_stamp": {"required": false, "note": null},
    "color_samples_architect_selection": {"required": false, "quantity": null},
    "sustainable_design": false,
    "hardware_schedule": false,
    "glazing_schedule": false,
    "energy_certs_nfrc": false
  },

  "testing": {
    "mockup_required": {"required": false, "description": null},
    "field_water_test": {"required": false, "standard": null},
    "preconstruction_adhesion_test": false,
    "preinstallation_conference": false
  },

  "qualifications": {
    "nacc_certified": false,
    "agmt_certified_technicians": false,
    "egress_door_inspector": {"required": false, "certification": null},
    "delegated_design_engineer": false
  },

  "warranty": {
    "system_years": null,
    "finish_factory_applied_years": null,
    "finish_anodized_years": null,
    "glass_coated_years": null,
    "glass_laminated_years": null,
    "glass_tempered_years": null,
    "notes": null
  },

  "estimator_alerts": [
    {"severity": "critical|warning|info", "category": "cost|risk|scope|qualification|schedule", "message": "string", "source_reference": "string or null"}
  ],

  "not_specified": [],
  "defer_to_drawings": [],
  "raw_flags": []
}"""


# ─── Prompt Builder ────────────────────────────────────────────────────────────

def build_extraction_prompt(
    project_name: str,
    csi_number: str,
    csi_title: str,
    section_text: str,
) -> str:
    """
    Build the user-turn extraction prompt for a single CSI section.

    Args:
        project_name: Full project name for context
        csi_number:   CSI section number e.g. "08 41 13"
        csi_title:    Section title e.g. "Aluminum-Framed Entrances and Storefronts"
        section_text: Raw extracted text for this section only

    Returns:
        Formatted user prompt string ready for Claude API
    """
    MAX_SECTION_CHARS = 40_000
    if len(section_text) > MAX_SECTION_CHARS:
        section_text = section_text[:MAX_SECTION_CHARS] + "\n\n[SECTION TRUNCATED - REMAINING TEXT OMITTED]"

    return f"""Extract all glazing estimator information from this specification section.

PROJECT: {project_name}
SPEC SECTION: {csi_number} - {csi_title}

---SECTION TEXT START---
{section_text}
---SECTION TEXT END---

Return a JSON object matching this schema exactly. Use null for any field not found in the spec.
Do not include any text outside the JSON object.

SCHEMA:
{EXTRACTION_SCHEMA}"""
