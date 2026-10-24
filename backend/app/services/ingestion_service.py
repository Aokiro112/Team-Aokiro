"""Ingestion job manager service for NEXUS AI.
Tracks job progress, stages, error details, and coordinates background workers.
"""
from datetime import datetime, timezone
import json
from typing import Any, Dict, Optional
from fastapi import BackgroundTasks
from backend.app.core.config import settings
from backend.app.core.exceptions import JobNotFoundException
from backend.app.core.logging import logger
from backend.app.schemas.jobs import IngestionJobResponse, JobStage, JobStatus
from backend.app.utils.identifiers import generate_job_id
from backend.app.workers.ingestion_worker import ingestion_worker


class IngestionService:
    """Manages ingestion jobs and dispatches background processing."""

    def __init__(self):
        self.jobs_file = settings.STORAGE_DIR / "jobs.json"
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self.worker = ingestion_worker
        self._load_jobs()

    def _load_jobs(self) -> None:
        if self.jobs_file.exists():
            try:
                with open(self.jobs_file, "r", encoding="utf-8") as f:
                    self._jobs = json.load(f)
            except Exception as e:
                logger.error(f"Error loading jobs file: {e}")
                self._jobs = {}
        else:
            self._jobs = {}

    def _save_jobs(self) -> None:
        try:
            self.jobs_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.jobs_file, "w", encoding="utf-8") as f:
                json.dump(self._jobs, f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Error saving jobs file: {e}")

    def create_job(self, document_id: str) -> IngestionJobResponse:
        """Create and queue a new ingestion job."""
        job_id = generate_job_id()
        now = datetime.now(timezone.utc).isoformat()
        job = {
            "id": job_id,
            "document_id": document_id,
            "status": JobStatus.PENDING.value,
            "current_stage": JobStage.QUEUED.value,
            "progress_percent": 0.0,
            "created_at": now,
            "started_at": None,
            "completed_at": None,
            "error_message": None,
            "stage_durations": {},
            "details": {},
        }
        self._jobs[job_id] = job
        self._save_jobs()
        return IngestionJobResponse(**job)

    def get_job(self, job_id: str) -> IngestionJobResponse:
        """Retrieve job status by ID."""
        job = self._jobs.get(job_id)
        if not job:
            raise JobNotFoundException(job_id)
        return IngestionJobResponse(**job)

    def trigger_ingestion(
        self,
        job_id: str,
        document_id: str,
        background_tasks: Optional[BackgroundTasks] = None,
    ) -> None:
        """Dispatch worker in background or synchronously if background_tasks is None."""
        if background_tasks:
            background_tasks.add_task(
                self.worker.process_document_pipeline,
                job_id=job_id,
                document_id=document_id,
                job_registry=self._jobs,
                save_jobs_cb=self._save_jobs,
            )
        else:
            # If no background_tasks (e.g. called directly from async function)
            import asyncio
            asyncio.create_task(
                self.worker.process_document_pipeline(
                    job_id=job_id,
                    document_id=document_id,
                    job_registry=self._jobs,
                    save_jobs_cb=self._save_jobs,
                )
            )


ingestion_service = IngestionService()
