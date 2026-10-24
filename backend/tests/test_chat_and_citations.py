"""Integration tests for Chat API, grounded answers, citations, and evidence sufficiency.
"""
import pytest
from backend.app.schemas.chat import (
    EvidenceSufficiency,
    QueryIntent,
    RetrievalStrategy,
)
from backend.app.services.document_service import document_service
from backend.app.workers.ingestion_worker import ingestion_worker


@pytest.mark.asyncio
async def test_grounded_chat_factual_query(client, sample_text_document):
    # Ingest document synchronously for deterministic chat testing
    with open(sample_text_document, "rb") as f:
        content = f.read()

    doc_resp, file_path, _ = document_service.register_uploaded_file(
        filename="academic_policy.txt",
        content=content,
        content_type="text/plain",
        collection_id="college-handbook",
        allow_duplicate=True,
    )

    # Run ingestion pipeline directly
    job_registry = {
        "job_sync": {
            "id": "job_sync",
            "document_id": doc_resp.id,
            "status": "PROCESSING",
            "current_stage": "QUEUED",
            "progress_percent": 0.0,
            "stage_durations": {},
            "details": {},
        }
    }
    await ingestion_worker.process_document_pipeline(
        job_id="job_sync",
        document_id=doc_resp.id,
        job_registry=job_registry,
        save_jobs_cb=lambda: None,
    )

    # 1. Ask factual question
    query_payload = {
        "query": "Which department offers the AI Specialization?",
        "collection_id": "college-handbook",
        "document_ids": [doc_resp.id],
        "include_graph": True,
    }
    resp = client.post("/api/v1/chat/query", json=query_payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["query"] == query_payload["query"]
    assert data["intent"] in [QueryIntent.FACTUAL.value, QueryIntent.DOCUMENT_SPECIFIC.value]
    assert data["evidence_sufficiency"] in [EvidenceSufficiency.SUFFICIENT.value, EvidenceSufficiency.PARTIAL.value]
    assert len(data["citations"]) >= 1

    # Verify citation fields
    cit = data["citations"][0]
    assert cit["document_id"] == doc_resp.id
    assert cit["document_filename"] == "academic_policy.txt"
    assert cit["page_number"] == 1
    assert "chk_" in cit["chunk_id"]
    assert len(cit["excerpt"]) > 0

    assert len(data["retrieval_trace"]) >= 3


def test_unanswerable_query_reports_insufficient_evidence(client):
    query_payload = {
        "query": "What is the quantum teleportation frequency of Martian spacecraft?",
        "collection_id": "empty-collection",
    }
    resp = client.post("/api/v1/chat/query", json=query_payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["evidence_sufficiency"] == EvidenceSufficiency.INSUFFICIENT.value
    assert "insufficient evidence" in data["answer"].lower()
    assert len(data["citations"]) == 0
    assert len(data["warnings"]) >= 1


@pytest.mark.asyncio
async def test_multihop_query_returns_graph_paths(client, sample_text_document):
    with open(sample_text_document, "rb") as f:
        content = f.read()

    doc_resp, _, _ = document_service.register_uploaded_file(
        filename="academic_policy.txt",
        content=content,
        content_type="text/plain",
        collection_id="college-handbook",
        allow_duplicate=True,
    )

    job_registry = {
        "job_sync2": {
            "id": "job_sync2",
            "document_id": doc_resp.id,
            "status": "PROCESSING",
            "current_stage": "QUEUED",
            "progress_percent": 0.0,
            "stage_durations": {},
            "details": {},
        }
    }
    await ingestion_worker.process_document_pipeline(
        job_id="job_sync2",
        document_id=doc_resp.id,
        job_registry=job_registry,
        save_jobs_cb=lambda: None,
    )

    query_payload = {
        "query": "How is the Computer Science Department connected to the AI Specialization and Research Opportunities?",
        "collection_id": "college-handbook",
        "include_graph": True,
    }
    resp = client.post("/api/v1/chat/query", json=query_payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["intent"] == QueryIntent.MULTI_HOP.value
    assert data["retrieval_strategy"] == RetrievalStrategy.HYBRID.value
    assert len(data["related_entities"]) >= 1
    assert "graph_expansion" in data["retrieval_trace"]
