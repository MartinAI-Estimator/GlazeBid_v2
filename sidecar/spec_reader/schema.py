"""
GlazierAI Spec Reader - Pydantic Schema
All request/response models for the spec reader module.
"""

from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field


# --- Request Models -----------------------------------------------------------

class AnalyzeSpecRequest(BaseModel):
    """Request body for /spec-reader/analyze (multipart PDF + metadata)"""
    project_name: str = Field(..., description="Project name for context")
    project_address: Optional[str] = None
    job_number: Optional[str] = None


class AnalyzeSectionRequest(BaseModel):
    """Request body for /spec-reader/analyze-section (raw text input)"""
    project_name: str
    csi_number: str    # e.g. "08 41 13"
    csi_title: str     # e.g. "Aluminum-Framed Entrances and Storefronts"
    section_text: str  # raw extracted text for this section


# --- Detection Models ---------------------------------------------------------

class DetectedSection(BaseModel):
    """A glazing-relevant CSI section found in a PDF"""
    csi_number: str           # "08 41 13"
    csi_title: str            # "Aluminum-Framed Entrances and Storefronts"
    start_char: int           # character offset in full text
    end_char: int
    char_count: int
    is_glazing_scope: bool    # True if this is glazing contractor scope
    scope_reason: str         # why it is/isn't glazing scope


class DetectionResult(BaseModel):
    """Result of PDF section detection"""
    project_name: str
    pdf_pages: int
    total_sections_found: int
    glazing_sections: list[DetectedSection]
    non_glazing_sections: list[DetectedSection]
    full_text_length: int


# --- Extraction Models - mirrors the Claude JSON output ----------------------

class PerformanceValue(BaseModel):
    value: Optional[float] = None
    operator: Optional[Literal["max", "min", "exact"]] = None
    unit: Optional[str] = None
    scope: Optional[str] = None
    standard: Optional[str] = None
    defer_to_drawings: bool = False


class CRFSpec(BaseModel):
    fixed_value: Optional[float] = None
    fixed_operator: Optional[Literal["max", "min", "exact"]] = None
    door_value: Optional[float] = None
    door_operator: Optional[Literal["max", "min", "exact"]] = None
    standard: Optional[str] = None


class WindLoadSpec(BaseModel):
    value: Optional[float] = None
    unit: Optional[str] = None
    defer_to_drawings: bool = False
    note: Optional[str] = None


class PerformanceSpec(BaseModel):
    u_factor: Optional[PerformanceValue] = None
    shgc: Optional[PerformanceValue] = None
    crf: Optional[CRFSpec] = None
    air_infiltration: Optional[PerformanceValue] = None
    water_infiltration_static: Optional[PerformanceValue] = None
    water_infiltration_dynamic: Optional[PerformanceValue] = None
    structural_wind_load: Optional[WindLoadSpec] = None
    deflection_limit: Optional[str] = None
    seismic: Optional[str] = None
    performance_grade: Optional[str] = None


class ManufacturerGroup(BaseModel):
    type: Optional[Literal["basis_of_design", "approved_alternates", "no_substitutions"]] = None
    names: list[str] = Field(default_factory=list)
    notes: Optional[str] = None


class ManufacturersSpec(BaseModel):
    framing: Optional[ManufacturerGroup] = None
    entrance_doors: Optional[ManufacturerGroup] = None
    glass: Optional[ManufacturerGroup] = None
    fire_rated_glass: Optional[ManufacturerGroup] = None
    single_source_required: bool = False


class IGUSpec(BaseModel):
    specified: bool = False
    overall_thickness: Optional[str] = None
    outboard_lite: Optional[str] = None
    airspace: Optional[str] = None
    inboard_lite: Optional[str] = None
    sealing_system: Optional[str] = None
    spacer: Optional[str] = None
    coating: Optional[str] = None
    defer_to_drawings: bool = False


class SafetyGlazingSpec(BaseModel):
    required: bool = False
    standard: Optional[str] = None


class LaminatedSpec(BaseModel):
    required: bool = False
    interlayer: Optional[str] = None


class TintedSpec(BaseModel):
    specified: bool = False
    color: Optional[str] = None


class FireRatedGlassSpec(BaseModel):
    required: bool = False
    ratings_minutes: list[int] = Field(default_factory=list)
    testing_standard: Optional[str] = None


class GlassSpec(BaseModel):
    types_specified: list[str] = Field(default_factory=list)
    igu: Optional[IGUSpec] = None
    min_exterior_thickness_mm: Optional[float] = None
    safety_glazing: Optional[SafetyGlazingSpec] = None
    laminated: Optional[LaminatedSpec] = None
    tinted: Optional[TintedSpec] = None
    fire_rated: Optional[FireRatedGlassSpec] = None
    special_requirements: Optional[str] = None


class FinishSpec(BaseModel):
    type: Optional[Literal[
        "clear_anodized", "dark_anodized", "color_anodized",
        "kynar_pvdf", "painted", "mill"
    ]] = None
    color: Optional[str] = None
    standard: Optional[str] = None
    warranty_years: Optional[int] = None


class SamplesSpec(BaseModel):
    required: bool = False
    description: Optional[str] = None


class DelegatedDesignSpec(BaseModel):
    required: bool = False
    note: Optional[str] = None


class ColorSamplesSpec(BaseModel):
    required: bool = False
    quantity: Optional[str] = None


class SubmittalsSpec(BaseModel):
    shop_drawings: bool = False
    product_data: bool = False
    samples: Optional[SamplesSpec] = None
    delegated_design_pe_stamp: Optional[DelegatedDesignSpec] = None
    color_samples_architect_selection: Optional[ColorSamplesSpec] = None
    sustainable_design: bool = False
    hardware_schedule: bool = False
    glazing_schedule: bool = False
    energy_certs_nfrc: bool = False


class MockupSpec(BaseModel):
    required: bool = False
    description: Optional[str] = None


class FieldWaterTestSpec(BaseModel):
    required: bool = False
    standard: Optional[str] = None


class TestingSpec(BaseModel):
    mockup_required: Optional[MockupSpec] = None
    field_water_test: Optional[FieldWaterTestSpec] = None
    preconstruction_adhesion_test: bool = False
    preinstallation_conference: bool = False


class EgressInspectorSpec(BaseModel):
    required: bool = False
    certification: Optional[str] = None


class QualificationsSpec(BaseModel):
    nacc_certified: bool = False
    agmt_certified_technicians: bool = False
    egress_door_inspector: Optional[EgressInspectorSpec] = None
    delegated_design_engineer: bool = False


class WarrantySpec(BaseModel):
    system_years: Optional[int] = None
    finish_factory_applied_years: Optional[int] = None
    finish_anodized_years: Optional[int] = None
    glass_coated_years: Optional[int] = None
    glass_laminated_years: Optional[int] = None
    glass_tempered_years: Optional[int] = None
    notes: Optional[str] = None


class EstimatorAlert(BaseModel):
    severity: Literal["critical", "warning", "info"]
    category: Literal["cost", "risk", "scope", "qualification", "schedule"]
    message: str
    source_reference: Optional[str] = None


class SystemSpec(BaseModel):
    type: Optional[Literal[
        "storefront", "curtain_wall", "entrance_doors", "windows",
        "skylights", "fire_rated", "glazing_only", "service_window", "other"
    ]] = None
    description: Optional[str] = None
    framing_types: list[str] = Field(default_factory=list)
    glazing_method: Optional[str] = None
    fabrication_method: Optional[str] = None


# --- Main Extraction Result ---------------------------------------------------

class SectionExtraction(BaseModel):
    """Full extraction result for a single CSI section - mirrors Claude JSON output"""
    csi_number: str
    csi_title: str
    confidence: float = Field(ge=0.0, le=1.0)
    low_confidence_fields: list[str] = Field(default_factory=list)

    system: Optional[SystemSpec] = None
    performance: Optional[PerformanceSpec] = None
    manufacturers: Optional[ManufacturersSpec] = None
    glass: Optional[GlassSpec] = None
    finish: Optional[FinishSpec] = None
    submittals: Optional[SubmittalsSpec] = None
    testing: Optional[TestingSpec] = None
    qualifications: Optional[QualificationsSpec] = None
    warranty: Optional[WarrantySpec] = None

    estimator_alerts: list[EstimatorAlert] = Field(default_factory=list)
    not_specified: list[str] = Field(default_factory=list)
    defer_to_drawings: list[str] = Field(default_factory=list)
    raw_flags: list[str] = Field(default_factory=list)

    # Processing metadata
    extraction_tokens_used: Optional[int] = None
    extraction_error: Optional[str] = None


# --- Full Analysis Response ---------------------------------------------------

class SpecAnalysisResult(BaseModel):
    """Complete spec reader analysis result for a full project manual"""
    project_name: str
    project_address: Optional[str] = None
    job_number: Optional[str] = None

    pdf_pages: int
    sections_detected: int
    sections_extracted: int
    total_alerts: int
    critical_alerts: int

    sections: list[SectionExtraction]
    total_tokens_used: int = 0
    processing_time_seconds: Optional[float] = None
