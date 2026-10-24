"""Knowledge Graph API endpoints for NEXUS AI.
Supports node lookups, neighbor expansion, bounded multi-hop path search, and entity search.
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status
from backend.app.schemas.graph import (
    EdgeModel,
    GraphPath,
    GraphResponse,
    GraphSearchResponse,
    NeighborResponse,
    NodeDetailResponse,
    NodeModel,
    PathQueryResponse,
)
from backend.app.services.graph_service import graph_service

router = APIRouter(prefix="/graph", tags=["Knowledge Graph"])


@router.get("", response_model=GraphResponse, summary="Get graph nodes and edges")
def get_graph(
    limit: int = Query(50, ge=1, le=200, description="Max nodes to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    topic_id: Optional[str] = Query(None, description="Filter by topic ID"),
) -> GraphResponse:
    """Fetch nodes and their connecting edges with pagination and filtering.
    Never returns the entire graph by default.
    """
    return graph_service.get_graph(
        limit=limit,
        offset=offset,
        entity_type=entity_type,
        topic_id=topic_id,
    )


@router.get("/nodes/{node_id}", response_model=NodeDetailResponse, summary="Get node details")
def get_node_details(node_id: str) -> NodeDetailResponse:
    """Fetch node details with incoming/outgoing edges, neighbors, and associated topics/chunks."""
    return graph_service.get_node_detail(node_id)


@router.get("/nodes/{node_id}/neighbors", response_model=NeighborResponse, summary="Get node neighbors")
def get_node_neighbors(
    node_id: str,
    max_neighbors: int = Query(25, ge=1, le=50, description="Max neighbors to return"),
) -> NeighborResponse:
    """Expand a node to inspect its immediate neighbors and connecting edges."""
    return graph_service.get_neighbors(node_id, max_neighbors=max_neighbors)


@router.get("/paths", response_model=PathQueryResponse, summary="Find bounded paths between entities")
def find_paths(
    source_node_id: str = Query(..., description="Starting entity ID"),
    target_node_id: str = Query(..., description="Ending entity ID"),
    max_hops: int = Query(3, ge=1, le=5, description="Max path length (hops)"),
    limit: int = Query(5, ge=1, le=20, description="Max paths to return"),
) -> PathQueryResponse:
    """Discover multi-hop explanatory paths between two entities with supporting chunk evidence."""
    return graph_service.find_paths(
        source_id=source_node_id,
        target_id=target_node_id,
        max_hops=max_hops,
        limit=limit,
    )


@router.get("/search", response_model=GraphSearchResponse, summary="Search nodes by name or description")
def search_nodes(
    q: str = Query(..., min_length=1, description="Search term"),
    limit: int = Query(20, ge=1, le=50, description="Max results"),
) -> GraphSearchResponse:
    """Search entity nodes by name or description."""
    return graph_service.search(query=q, limit=limit)


@router.get("/edges/{edge_id}", response_model=EdgeModel, summary="Get edge details")
def get_edge(edge_id: str) -> EdgeModel:
    """Fetch edge relationship details with source evidence and confidence."""
    edge = graph_service.get_edge_by_id(edge_id)
    if not edge:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Edge with ID '{edge_id}' not found.",
        )
    return edge
