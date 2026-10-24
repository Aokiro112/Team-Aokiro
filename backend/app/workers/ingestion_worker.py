"""Background ingestion worker executing the 14-stage document processing pipeline.
"""
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List
from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.repositories.neo4j_repository import graph_repo
from backend.app.schemas.documents import DocumentStatus
from backend.app.schemas.jobs import JobStage, JobStatus
from backend.app.services.document_service import document_service
from backend.app.services.entity_resolution_service import entity_resolution_service
from backend.app.services.extraction_service import extraction_service
from backend.app.services.topic_service import topic_service
from backend.app.services.vector_service import vector_service


class IngestionWorker:
    """Orchestrates document ingestion across ChromaDB, Neo4j, and Topic Discovery."""

    def __init__(self):
        self.doc_svc = document_service
        self.vec_svc = vector_service
        self.extract_svc = extraction_service
        self.resolve_svc = entity_resolution_service
        self.topic_svc = topic_service
        self.graph_repo = graph_repo

    async def process_document_pipeline(
        self,
        job_id: str,
        document_id: str,
        job_registry: Dict[str, Dict[str, Any]],
        save_jobs_cb: Any,
    ) -> None:
        """Execute the 14-stage pipeline sequentially."""
        job = job_registry.get(job_id)
        if not job:
            return

        def update_stage(stage: JobStage, progress: float, details: Dict[str, Any] = None):
            job["current_stage"] = stage.value
            job["progress_percent"] = progress
            if details:
                job["details"].update(details)
            save_jobs_cb()

        start_time = time.time()
        job["status"] = JobStatus.PROCESSING.value
        job["started_at"] = datetime.now(timezone.utc).isoformat()
        save_jobs_cb()

        try:
            # Stage 1: Load Document Record
            doc_record = self.doc_svc.get_document(document_id)
            file_path = Path(self.doc_svc.get_document_registry()[document_id]["file_path"])
            collection_id = doc_record.collection_id

            self.doc_svc.update_document_status(document_id, DocumentStatus.PROCESSING)

            # Stage 2: Extract text (preserve page numbers)
            update_stage(JobStage.EXTRACTING_TEXT, 15.0)
            t_stage = time.time()
            pages = self.doc_svc.extract_text(file_path)
            job["stage_durations"]["extract_text"] = time.time() - t_stage

            if not pages or all(not p.get("text", "").strip() for p in pages):
                raise ValueError("Document contains no readable text.")

            self.doc_svc.update_document_status(document_id, DocumentStatus.PROCESSING, total_pages=len(pages))

            # Stage 3: Chunking
            update_stage(JobStage.CHUNKING, 30.0)
            t_stage = time.time()
            chunks = self.doc_svc.chunk_document(document_id, pages)
            job["stage_durations"]["chunking"] = time.time() - t_stage

            if not chunks:
                raise ValueError("No valid chunks generated from document text.")

            # Stage 4: Embedding & Vector Storage in ChromaDB
            update_stage(JobStage.EMBEDDING, 50.0)
            t_stage = time.time()
            chunk_ids = [c["chunk_id"] for c in chunks]
            chunk_texts = [c["text"] for c in chunks]
            chunk_metas = [
                {
                    "document_id": document_id,
                    "filename": doc_record.filename,
                    "page_number": c["page_number"],
                    "start_char": c["start_char"],
                    "end_char": c["end_char"],
                }
                for c in chunks
            ]
            await self.vec_svc.index_chunks(collection_id, chunk_ids, chunk_texts, chunk_metas)
            job["stage_durations"]["embedding"] = time.time() - t_stage

            # Stage 5: Entity & Relationship Extraction
            update_stage(JobStage.EXTRACTING_GRAPH, 65.0)
            t_stage = time.time()
            all_raw_entities = []
            all_raw_edges = []
            all_raw_topics = []

            for chk in chunks:
                res = await self.extract_svc.extract_from_chunk(
                    chunk_text=chk["text"],
                    chunk_id=chk["chunk_id"],
                    document_id=document_id,
                    page_number=chk["page_number"],
                )
                all_raw_entities.extend(res.get("entities", []))
                all_raw_edges.extend(res.get("relationships", []))
                all_raw_topics.extend(res.get("topics", []))

            # Extract global document themes via single fast LLM call
            doc_sample_text = " ".join([p.get("text", "") for p in pages[:10]])
            doc_themes = await self.extract_svc.extract_document_themes(doc_sample_text, document_id)
            all_raw_topics.extend(doc_themes)

            job["stage_durations"]["extraction"] = time.time() - t_stage

            # Stage 6: Conservative Entity Resolution
            update_stage(JobStage.RESOLVING_ENTITIES, 75.0)
            t_stage = time.time()
            resolved_entities, resolved_edges = self.resolve_svc.resolve_entities_and_edges(
                all_raw_entities, all_raw_edges
            )
            job["stage_durations"]["entity_resolution"] = time.time() - t_stage

            # Stage 7: Persisting Graph Nodes, Chunks, and Provenance
            update_stage(JobStage.PERSISTING_GRAPH, 85.0)
            t_stage = time.time()
            # Register document node
            self.graph_repo.upsert_document(document_id, doc_record.filename, doc_record.metadata)
            # Register chunk nodes with text provenance
            for chk in chunks:
                self.graph_repo.upsert_chunk(chk["chunk_id"], document_id, chk["page_number"], chk["text"])
            # Register entity nodes
            for ent in resolved_entities:
                self.graph_repo.upsert_entity(ent)
            # Register edge relationships
            for edge in resolved_edges:
                self.graph_repo.upsert_edge(edge)
            job["stage_durations"]["graph_persistence"] = time.time() - t_stage

            # Stage 8: Topic Discovery & Community Clustering
            update_stage(JobStage.BUILDING_TOPICS, 92.0)
            t_stage = time.time()
            discovered_topics = self.topic_svc.discover_and_update_topics(
                entities=resolved_entities,
                edges=resolved_edges,
                extracted_topics=all_raw_topics,
                chunks=chunks,
                document_id=document_id,
            )
            job["stage_durations"]["topics"] = time.time() - t_stage

            # Stage 9: Validate Indexing Consistency
            update_stage(JobStage.VALIDATING_CONSISTENCY, 98.0)
            t_stage = time.time()
            # Verify Chroma contains indexed chunks
            chroma_count = self.vec_svc.repo.get_collection_count(collection_id)
            if chroma_count < len(chunks):
                logger.warning(f"Indexing consistency notice: collection count {chroma_count} vs {len(chunks)} chunks.")
            job["stage_durations"]["validation"] = time.time() - t_stage

            # Stage 10: Complete Job
            job["status"] = JobStatus.COMPLETED.value
            job["current_stage"] = JobStage.COMPLETED.value
            job["progress_percent"] = 100.0
            job["completed_at"] = datetime.now(timezone.utc).isoformat()
            job["details"] = {
                "total_pages": len(pages),
                "total_chunks": len(chunks),
                "total_entities": len(resolved_entities),
                "total_relationships": len(resolved_edges),
                "total_topics": len(discovered_topics),
                "total_duration_seconds": round(time.time() - start_time, 2),
            }
            save_jobs_cb()

            # Update Document record to INDEXED
            self.doc_svc.update_document_status(
                document_id=document_id,
                status=DocumentStatus.INDEXED,
                total_pages=len(pages),
                total_chunks=len(chunks),
                total_entities=len(resolved_entities),
                total_relationships=len(resolved_edges),
            )
            logger.info(
                f"Successfully completed ingestion pipeline for document {document_id} in {round(time.time() - start_time, 2)}s"
            )

        except Exception as e:
            logger.error(f"Ingestion pipeline failed for document {document_id}: {e}", exc_info=True)
            job["status"] = JobStatus.FAILED.value
            job["current_stage"] = JobStage.FAILED.value
            job["error_message"] = str(e)
            job["completed_at"] = datetime.now(timezone.utc).isoformat()
            save_jobs_cb()

            self.doc_svc.update_document_status(
                document_id=document_id,
                status=DocumentStatus.FAILED,
                error_message=str(e),
            )


ingestion_worker = IngestionWorker()
