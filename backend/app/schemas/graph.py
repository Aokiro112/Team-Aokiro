"""Knowledge graph schemas for NEXUS AI.
Designed for interactive node-link visualization and graph explainability.
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class NodeModel(BaseModel):
    id: str
    canonical_name: str
    entity_type: str = "Concept"
    description: Optional[str] = None
    degree: int = 0
    topic_ids: List[str] = Field(default_factory=list)
    document_ids: List[str] = Field(default_factory=list)
    chunk_ids: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class EdgeModel(BaseModel):
    id: str
    source: str
    target: str
    relationship_type: str
    evidence: str = ""
    confidence: float = 1.0
    document_ids: List[str] = Field(default_factory=list)
    chunk_ids: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class GraphResponse(BaseModel):
    nodes: List[NodeModel]
    edges: List[EdgeModel]
    total_nodes: int
    total_edges: int
    limit: int
    offset: int = 0


class GraphPath(BaseModel):
    nodes: List[NodeModel]
    edges: List[EdgeModel]
    length: int
    evidence_chunks: List[str] = Field(default_factory=list)
    description: Optional[str] = None


class NodeDetailResponse(BaseModel):
    node: NodeModel
    neighbors: List[NodeModel]
    in_edges: List[EdgeModel]
    out_edges: List[EdgeModel]
    associated_topics: List[Dict[str, Any]] = Field(default_factory=list)
    source_chunks: List[Dict[str, Any]] = Field(default_factory=list)


class NeighborResponse(BaseModel):
    center_node_id: str
    neighbors: List[NodeModel]
    edges: List[EdgeModel]
    total_neighbors: int


class PathQueryRequest(BaseModel):
    source_node_id: str
    target_node_id: str
    max_hops: int = Field(default=3, ge=1, le=5)
    limit: int = Field(default=5, ge=1, le=20)


class PathQueryResponse(BaseModel):
    source_node_id: str
    target_node_id: str
    paths: List[GraphPath]
    total_paths_found: int


class GraphSearchResponse(BaseModel):
    query: str
    nodes: List[NodeModel]
    edges: List[EdgeModel]
    total_matches: int
