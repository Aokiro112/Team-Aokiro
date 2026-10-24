"""Topic schemas for NEXUS AI.
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from backend.app.schemas.graph import EdgeModel, NodeModel


class TopicModel(BaseModel):
    id: str
    name: str
    description: str
    keywords: List[str] = Field(default_factory=list)
    document_count: int = 0
    entity_count: int = 0
    document_ids: List[str] = Field(default_factory=list)
    entity_ids: List[str] = Field(default_factory=list)
    representative_passages: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class TopicListResponse(BaseModel):
    topics: List[TopicModel]
    total: int


class TopicDetailResponse(BaseModel):
    topic: TopicModel
    associated_entities: List[NodeModel]
    associated_documents: List[Dict[str, Any]]
    representative_chunks: List[Dict[str, Any]]


class TopicGraphResponse(BaseModel):
    topic_id: str
    topic_name: str
    nodes: List[NodeModel]
    edges: List[EdgeModel]


class TopicDocumentsResponse(BaseModel):
    topic_id: str
    topic_name: str
    documents: List[Dict[str, Any]]
    total_documents: int
