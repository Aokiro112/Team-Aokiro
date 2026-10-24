"""Document management API endpoints for NEXUS AI.
"""
import json
from typing import Any, Dict, Optional
from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from backend.app.core.config import settings
from backend.app.core.exceptions import NexusException
from backend.app.core.logging import logger
from backend.app.repositories.neo4j_repository import graph_repo
from backend.app.schemas.documents import (
    DocumentListResponse,
    DocumentReindexRequest,
    DocumentResponse,
)
from backend.app.services.document_service import document_service
from backend.app.services.ingestion_service import ingestion_service
from backend.app.services.vector_service import vector_service

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.post(
    "",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload and ingest a document",
)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="PDF or TXT document file"),
    collection_id: str = Form("default", description="Namespace / collection ID"),
    metadata: Optional[str] = Form(None, description="Optional JSON metadata string"),
) -> Dict[str, Any]:
    """Upload PDF or TXT document and trigger the 14-stage background ingestion pipeline."""
    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    parsed_meta = {}
    if metadata:
        try:
            parsed_meta = json.loads(metadata)
        except Exception:
            logger.warning(f"Failed to parse metadata JSON: {metadata}")

    doc_response, file_path, is_duplicate = document_service.register_uploaded_file(
        filename=file.filename or "uploaded_file.txt",
        content=content,
        content_type=file.content_type or "text/plain",
        collection_id=collection_id,
        metadata=parsed_meta,
    )

    if is_duplicate:
        return {
            "message": "Document already exists and is indexed.",
            "document": doc_response,
            "job_id": None,
            "is_duplicate": True,
        }

    # Create ingestion job
    job = ingestion_service.create_job(doc_response.id)
    # Queue background task
    ingestion_service.trigger_ingestion(job.id, doc_response.id, background_tasks)

    return {
        "message": "Document accepted for ingestion.",
        "document": doc_response,
        "job_id": job.id,
        "is_duplicate": False,
    }


@router.get("", response_model=DocumentListResponse, summary="List all indexed documents")
def list_documents(
    collection_id: Optional[str] = Query(None, description="Filter by collection"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> DocumentListResponse:
    items, total = document_service.list_documents(collection_id=collection_id, limit=limit, offset=offset)
    page = (offset // limit) + 1 if limit > 0 else 1
    return DocumentListResponse(
        items=items,
        total=total,
        page=page,
        page_size=limit,
    )


@router.get("/{document_id}", response_model=DocumentResponse, summary="Get document details")
def get_document(document_id: str) -> DocumentResponse:
    return document_service.get_document(document_id)


@router.delete("/{document_id}", status_code=status.HTTP_200_OK, summary="Delete document and index data")
def delete_document(document_id: str) -> Dict[str, Any]:
    doc = document_service.get_document(document_id)
    collection_id = doc.collection_id

    # 1. Clean Chroma chunks
    deleted_chunks = vector_service.delete_document_chunks(collection_id, document_id)

    # 2. Clean Knowledge graph nodes, edges, and provenance
    graph_repo.delete_document(document_id)

    # 3. Clean document record and disk file
    document_service.delete_document(document_id)

    return {
        "message": f"Document '{doc.filename}' ({document_id}) and associated indices were deleted successfully.",
        "document_id": document_id,
        "deleted_vector_chunks": deleted_chunks,
    }


@router.post("/{document_id}/reindex", status_code=status.HTTP_202_ACCEPTED, summary="Reindex existing document")
def reindex_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    request: DocumentReindexRequest = DocumentReindexRequest(),
) -> Dict[str, Any]:
    doc = document_service.get_document(document_id)

    # Clean existing indices
    vector_service.delete_document_chunks(doc.collection_id, document_id)
    graph_repo.delete_document(document_id)

    # Create new job and trigger
    job = ingestion_service.create_job(document_id)
    ingestion_service.trigger_ingestion(job.id, document_id, background_tasks)

    return {
        "message": "Reindexing triggered.",
        "document_id": document_id,
        "job_id": job.id,
    }
