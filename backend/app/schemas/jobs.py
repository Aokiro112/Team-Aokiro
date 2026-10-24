"""Ingestion job schemas for NEXUS AI.
"""
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class JobStage(str, Enum):
    QUEUED = "QUEUED"
    EXTRACTING_TEXT = "EXTRACTING_TEXT"
    CHUNKING = "CHUNKING"
    EMBEDDING = "EMBEDDING"
    EXTRACTING_GRAPH = "EXTRACTING_GRAPH"
    RESOLVING_ENTITIES = "RESOLVING_ENTITIES"
    BUILDING_TOPICS = "BUILDING_TOPICS"
    PERSISTING_GRAPH = "PERSISTING_GRAPH"
    VALIDATING_CONSISTENCY = "VALIDATING_CONSISTENCY"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class JobStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class IngestionJobResponse(BaseModel):
    id: str
    document_id: str
    status: JobStatus
    current_stage: JobStage
    progress_percent: float = Field(default=0.0, ge=0.0, le=100.0)
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    stage_durations: Dict[str, float] = Field(default_factory=dict)
    details: Dict[str, Any] = Field(default_factory=dict)
