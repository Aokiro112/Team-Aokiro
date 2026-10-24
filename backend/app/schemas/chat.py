"""Chat and grounded question-answering schemas for NEXUS AI.
"""
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from backend.app.schemas.graph import GraphPath, NodeModel


class QueryIntent(str, Enum):
    THEMATIC = "THEMATIC"
    FACTUAL = "FACTUAL"
    MULTI_HOP = "MULTI_HOP"
    DOCUMENT_SPECIFIC = "DOCUMENT_SPECIFIC"
    UNANSWERABLE = "UNANSWERABLE"


class RetrievalStrategy(str, Enum):
    VECTOR_ONLY = "VECTOR_ONLY"
    GRAPH_ONLY = "GRAPH_ONLY"
    TOPIC_COMMUNITY = "TOPIC_COMMUNITY"
    HYBRID = "HYBRID"


class EvidenceSufficiency(str, Enum):
    SUFFICIENT = "SUFFICIENT"
    PARTIAL = "PARTIAL"
    INSUFFICIENT = "INSUFFICIENT"
    CONTRADICTORY = "CONTRADICTORY"


class Citation(BaseModel):
    citation_id: str
    document_id: str
    document_filename: str
    chunk_id: str
    page_number: int
    excerpt: str
    relevance_score: float = 1.0


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=1500)
    collection_id: str = "default"
    document_ids: List[str] = Field(default_factory=list)
    include_graph: bool = True
    max_citations: int = Field(default=5, ge=1, le=20)
    retrieval_strategy_override: Optional[RetrievalStrategy] = None


class QueryResponse(BaseModel):
    request_id: str
    query: str
    intent: QueryIntent
    retrieval_strategy: RetrievalStrategy
    answer: str
    evidence_sufficiency: EvidenceSufficiency
    citations: List[Citation] = Field(default_factory=list)
    supporting_passages: List[str] = Field(default_factory=list)
    related_entities: List[NodeModel] = Field(default_factory=list)
    supporting_paths: List[GraphPath] = Field(default_factory=list)
    retrieval_trace: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
