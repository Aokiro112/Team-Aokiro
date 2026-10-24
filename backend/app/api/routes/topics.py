"""Topic and Community API endpoints for NEXUS AI.
"""
from fastapi import APIRouter, HTTPException, Query, status
from backend.app.schemas.topics import (
    TopicDetailResponse,
    TopicDocumentsResponse,
    TopicGraphResponse,
    TopicListResponse,
    TopicModel,
)
from backend.app.services.graph_service import graph_service
from backend.app.services.topic_service import topic_service

router = APIRouter(prefix="/topics", tags=["Topics & Communities"])


@router.get("", response_model=TopicListResponse, summary="List all discovered topics")
def list_topics(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> TopicListResponse:
    """List cross-document topics and graph communities."""
    topics, total = topic_service.get_topics(limit=limit, offset=offset)
    return TopicListResponse(topics=topics, total=total)


@router.get("/{topic_id}", response_model=TopicDetailResponse, summary="Get topic details")
def get_topic(topic_id: str) -> TopicDetailResponse:
    """Get topic metadata, associated entities, documents, and representative chunks."""
    topic = topic_service.get_topic_by_id(topic_id)
    if not topic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Topic with ID '{topic_id}' not found.",
        )

    # Fetch associated entities
    entities = []
    for eid in topic.entity_ids:
        ent = topic_service.repo.get_node_by_id(eid)
        if ent:
            entities.append(ent)

    # Fetch associated documents
    docs = topic_service.get_topic_documents(topic_id)

    # Gather representative chunks
    chunks = []
    for p in topic.representative_passages:
        chunks.append({"text": p})

    return TopicDetailResponse(
        topic=topic,
        associated_entities=entities,
        associated_documents=docs,
        representative_chunks=chunks,
    )


@router.get("/{topic_id}/graph", response_model=TopicGraphResponse, summary="Get topic subgraph")
def get_topic_graph(topic_id: str) -> TopicGraphResponse:
    """Fetch nodes and edges belonging to a topic community."""
    topic = topic_service.get_topic_by_id(topic_id)
    if not topic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Topic with ID '{topic_id}' not found.",
        )

    nodes, edges = topic_service.get_topic_graph(topic_id)
    return TopicGraphResponse(
        topic_id=topic_id,
        topic_name=topic.name,
        nodes=nodes,
        edges=edges,
    )


@router.get("/{topic_id}/documents", response_model=TopicDocumentsResponse, summary="Get topic documents")
def get_topic_documents(topic_id: str) -> TopicDocumentsResponse:
    """Fetch documents associated with a topic."""
    topic = topic_service.get_topic_by_id(topic_id)
    if not topic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Topic with ID '{topic_id}' not found.",
        )

    docs = topic_service.get_topic_documents(topic_id)
    return TopicDocumentsResponse(
        topic_id=topic_id,
        topic_name=topic.name,
        documents=docs,
        total_documents=len(docs),
    )
