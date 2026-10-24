"""Visual and Multimodal schemas for NEXUS AI.
Defines contracts for extracted document visual evidence, vision model analysis,
and generated diagrams/illustrations.
"""
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class VisualType(str, Enum):
    DIAGRAM = "DIAGRAM"
    CHART = "CHART"
    TABLE = "TABLE"
    FLOWCHART = "FLOWCHART"
    CONCEPT_MAP = "CONCEPT_MAP"
    SCREENSHOT = "SCREENSHOT"
    ILLUSTRATION = "ILLUSTRATION"
    PHOTO = "PHOTO"
    DOCUMENT_PAGE = "DOCUMENT_PAGE"


class VisualEvidence(BaseModel):
    """Represents a visual asset extracted from a document, enriched with vision model analysis."""
    id: str
    document_id: str
    document_filename: str
    page_number: int
    image_path: str
    image_url: str
    content_hash: str
    width: Optional[int] = None
    height: Optional[int] = None
    format: str = "png"
    caption: Optional[str] = None
    surrounding_text: Optional[str] = None
    visual_type: VisualType = VisualType.DIAGRAM
    title: Optional[str] = None
    extracted_text: Optional[str] = None
    description: str
    detailed_analysis: Optional[str] = None
    structured_data: Optional[Dict[str, Any]] = None
    detected_labels: List[str] = Field(default_factory=list)
    related_concept_names: List[str] = Field(default_factory=list)
    confidence: float = 1.0
    analysis_provider: str = "heuristic"
    analysis_status: str = "ANALYZED"  # ANALYZED, PARTIAL, UNAVAILABLE, FAILED
    analysis_error: Optional[str] = None
    is_page_render: bool = False
    metadata: Dict[str, Any] = Field(default_factory=dict)


class VisualGenerationType(str, Enum):
    FLOWCHART = "FLOWCHART"
    CONCEPT_MAP = "CONCEPT_MAP"
    TECHNICAL_DIAGRAM = "TECHNICAL_DIAGRAM"
    ILLUSTRATION = "ILLUSTRATION"
    GRAPH_VISUALIZATION = "GRAPH_VISUALIZATION"


class VisualGenerationRequest(BaseModel):
    """Request contract to synthesize a visual diagram or illustration from chat context."""
    prompt: str = Field(..., min_length=2, max_length=2000)
    visual_type: VisualGenerationType = VisualGenerationType.FLOWCHART
    context: Optional[str] = None
    document_ids: List[str] = Field(default_factory=list)
    source_message_id: Optional[str] = None
    model: Optional[str] = None


class GeneratedVisual(BaseModel):
    """Represents an AI-synthesized visual diagram (Mermaid/SVG) or illustration image."""
    id: str
    visual_type: VisualGenerationType
    render_format: str  # "mermaid", "svg", or "image_url"
    content: str  # Mermaid string, raw SVG XML, or image URL
    title: str
    caption: Optional[str] = None
    prompt: str
    generated_by: str
    created_at: str
    source_concepts: List[str] = Field(default_factory=list)
    download_url: Optional[str] = None
    status: str = "COMPLETED"  # COMPLETED or FALLBACK
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
