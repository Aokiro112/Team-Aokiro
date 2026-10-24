"""Ingestion jobs API endpoints for NEXUS AI.
"""
from fastapi import APIRouter
from backend.app.schemas.jobs import IngestionJobResponse
from backend.app.services.ingestion_service import ingestion_service

router = APIRouter(prefix="/jobs", tags=["Ingestion Jobs"])


@router.get("/{job_id}", response_model=IngestionJobResponse, summary="Get ingestion job status")
def get_job_status(job_id: str) -> IngestionJobResponse:
    """Fetch status, current stage, progress %, and timing metrics for an ingestion job."""
    return ingestion_service.get_job(job_id)
