"""Document schemas for NEXUS AI.
"""
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class DocumentStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    INDEXED = "INDEXED"
    FAILED = "FAILED"


class DocumentBase(BaseModel):
    filename: str
    content_type: str = "text/plain"
    collection_id: str = "default"
    metadata: Dict[str, Any] = Field(default_factory=dict)


class DocumentCreate(DocumentBase):
    pass


class DocumentResponse(DocumentBase):
    id: str
    content_hash: str
    file_size_bytes: int
    status: DocumentStatus
    total_pages: int = 1
    total_chunks: int = 0
    total_entities: int = 0
    total_relationships: int = 0
    created_at: datetime
    updated_at: datetime
    error_message: Optional[str] = None


class DocumentListResponse(BaseModel):
    items: List[DocumentResponse]
    total: int
    page: int
    page_size: int


class DocumentReindexRequest(BaseModel):
    force: bool = False
