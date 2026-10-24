"""Custom exception classes and HTTP error response handlers.
"""
from typing import Any, Dict, Optional
from fastapi import Request, status
from fastapi.responses import JSONResponse


class NexusException(Exception):
    """Base application exception."""

    def __init__(
        self,
        message: str,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        code: str = "INTERNAL_SERVER_ERROR",
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details or {}


class DocumentNotFoundException(NexusException):
    def __init__(self, document_id: str):
        super().__init__(
            message=f"Document with ID '{document_id}' not found.",
            status_code=status.HTTP_404_NOT_FOUND,
            code="DOCUMENT_NOT_FOUND",
            details={"document_id": document_id},
        )


class JobNotFoundException(NexusException):
    def __init__(self, job_id: str):
        super().__init__(
            message=f"Ingestion job with ID '{job_id}' not found.",
            status_code=status.HTTP_404_NOT_FOUND,
            code="JOB_NOT_FOUND",
            details={"job_id": job_id},
        )


class NodeNotFoundException(NexusException):
    def __init__(self, node_id: str):
        super().__init__(
            message=f"Graph node with ID '{node_id}' not found.",
            status_code=status.HTTP_404_NOT_FOUND,
            code="NODE_NOT_FOUND",
            details={"node_id": node_id},
        )


class TopicNotFoundException(NexusException):
    def __init__(self, topic_id: str):
        super().__init__(
            message=f"Topic with ID '{topic_id}' not found.",
            status_code=status.HTTP_404_NOT_FOUND,
            code="TOPIC_NOT_FOUND",
            details={"topic_id": topic_id},
        )


class GraphConnectionException(NexusException):
    def __init__(self, message: str = "Failed to connect to Knowledge Graph database."):
        super().__init__(
            message=message,
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="GRAPH_SERVICE_UNAVAILABLE",
        )


class VectorStoreException(NexusException):
    def __init__(self, message: str = "Vector database error."):
        super().__init__(
            message=message,
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="VECTOR_STORE_ERROR",
        )


class InvalidQueryException(NexusException):
    def __init__(self, message: str):
        super().__init__(
            message=message,
            status_code=status.HTTP_400_BAD_REQUEST,
            code="INVALID_QUERY",
        )


class DuplicateDocumentException(NexusException):
    def __init__(self, document_id: str, filename: str):
        super().__init__(
            message=f"Document '{filename}' already exists with ID '{document_id}'.",
            status_code=status.HTTP_409_CONFLICT,
            code="DUPLICATE_DOCUMENT",
            details={"document_id": document_id, "filename": filename},
        )


async def nexus_exception_handler(request: Request, exc: NexusException) -> JSONResponse:
    """Format custom NexusException into uniform API error payload."""
    request_id = getattr(request.state, "request_id", "unknown")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            },
            "request_id": request_id,
        },
    )
