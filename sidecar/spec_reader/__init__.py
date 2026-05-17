"""GlazierAI Spec Reader module"""

from .schema import (
    SectionExtraction,
    DetectedSection,
    DetectionResult,
    AnalyzeSpecRequest,
    AnalyzeSectionRequest,
    SpecAnalysisResult,
    EstimatorAlert,
)
from .ingestor import ingest_pdf, detect_sections, IngestorResult, RawSection, GLAZING_SCOPE_PREFIXES
from .extractor import SpecExtractor
from .router import spec_reader_router

__all__ = [
    "SectionExtraction",
    "DetectedSection",
    "DetectionResult",
    "AnalyzeSpecRequest",
    "AnalyzeSectionRequest",
    "SpecAnalysisResult",
    "EstimatorAlert",
    "ingest_pdf",
    "detect_sections",
    "IngestorResult",
    "RawSection",
    "GLAZING_SCOPE_PREFIXES",
    "SpecExtractor",
    "spec_reader_router",
]
