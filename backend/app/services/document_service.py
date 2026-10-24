"""Document management and file processing service for NEXUS AI.
Handles file validation, text extraction (PyMuPDF & plain text), chunking, and persistence.
"""
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import pymupdf  # PyMuPDF
from backend.app.core.config import settings
from backend.app.core.exceptions import (
    DocumentNotFoundException,
    DuplicateDocumentException,
    NexusException,
)
from backend.app.core.logging import logger
from backend.app.schemas.documents import DocumentResponse, DocumentStatus
from backend.app.utils.identifiers import generate_chunk_id, generate_document_id
from backend.app.utils.text_processing import calculate_content_hash, chunk_text_by_paragraphs


class DocumentService:
    """Manages document storage, file validation, text extraction, and metadata."""

    def __init__(self):
        self.upload_dir = settings.UPLOAD_DIR
        self.metadata_file = settings.STORAGE_DIR / "documents.json"
        self._registry: Dict[str, Dict[str, Any]] = {}
        self._load_registry()

    def _load_registry(self) -> None:
        """Load document metadata registry from disk."""
        if self.metadata_file.exists():
            try:
                with open(self.metadata_file, "r", encoding="utf-8") as f:
                    self._registry = json.load(f)
            except Exception as e:
                logger.error(f"Error loading document metadata file: {e}")
                self._registry = {}
        else:
            self._registry = {}

    def _save_registry(self) -> None:
        """Save document metadata registry to disk."""
        try:
            self.metadata_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.metadata_file, "w", encoding="utf-8") as f:
                json.dump(self._registry, f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Error saving document metadata file: {e}")

    def get_document(self, document_id: str) -> DocumentResponse:
        """Fetch document record by ID."""
        record = self._registry.get(document_id)
        if not record:
            raise DocumentNotFoundException(document_id)
        return DocumentResponse(**record)

    def list_documents(
        self,
        collection_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[DocumentResponse], int]:
        """List documents with pagination and optional collection filtering."""
        docs = list(self._registry.values())
        if collection_id:
            docs = [d for d in docs if d.get("collection_id") == collection_id]

        total = len(docs)
        # Sort by created_at desc
        sorted_docs = sorted(docs, key=lambda x: x.get("created_at", ""), reverse=True)
        paged = sorted_docs[offset : offset + limit]
        return [DocumentResponse(**d) for d in paged], total

    def register_uploaded_file(
        self,
        filename: str,
        content: bytes,
        content_type: str = "text/plain",
        collection_id: str = "default",
        metadata: Optional[Dict[str, Any]] = None,
        allow_duplicate: bool = False,
    ) -> Tuple[DocumentResponse, Path, bool]:
        """Validate upload, compute hash, detect duplicates, and persist file to disk."""
        # 1. Enforce size limit
        if len(content) > settings.MAX_UPLOAD_SIZE_BYTES:
            raise NexusException(
                f"File size exceeds maximum allowed limit of {settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)} MB",
                status_code=413,
                code="FILE_TOO_LARGE",
            )

        # 2. Enforce file extension
        ext = Path(filename).suffix.lower()
        if ext not in settings.ALLOWED_EXTENSIONS:
            raise NexusException(
                f"Unsupported file extension '{ext}'. Allowed extensions: {settings.ALLOWED_EXTENSIONS}",
                status_code=400,
                code="UNSUPPORTED_FILE_TYPE",
            )

        # 3. Calculate SHA-256 hash
        content_hash = calculate_content_hash(content)
        document_id = generate_document_id(content_hash)

        # 4. Check for duplicate
        if document_id in self._registry and not allow_duplicate:
            existing = self._registry[document_id]
            logger.info(f"Duplicate document detected: {filename} matches {document_id}")
            return DocumentResponse(**existing), Path(existing["file_path"]), True

        # 5. Save file to disk
        file_path = self.upload_dir / f"{document_id}{ext}"
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        with open(file_path, "wb") as f:
            f.write(content)

        now = datetime.now(timezone.utc)
        record = {
            "id": document_id,
            "filename": filename,
            "content_hash": content_hash,
            "file_size_bytes": len(content),
            "content_type": content_type,
            "collection_id": collection_id,
            "status": DocumentStatus.PENDING.value,
            "total_pages": 1,
            "total_chunks": 0,
            "total_entities": 0,
            "total_relationships": 0,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "file_path": str(file_path),
            "metadata": metadata or {},
            "error_message": None,
        }

        self._registry[document_id] = record
        self._save_registry()
        logger.info(f"Registered document {filename} with ID {document_id}")
        return DocumentResponse(**record), file_path, False

    @staticmethod
    def _strip_running_headers_and_footers(raw_pages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Dynamically detect and strip repetitive running headers and footers across any document."""
        if len(raw_pages) <= 2:
            return raw_pages

        import re
        top_line_counts: Dict[str, int] = {}
        bottom_line_counts: Dict[str, int] = {}

        for p in raw_pages:
            lines = [l.strip() for l in p["text"].splitlines() if len(l.strip()) > 3]
            for l in lines[:3]:
                top_line_counts[l] = top_line_counts.get(l, 0) + 1
            for l in lines[-2:]:
                bottom_line_counts[l] = bottom_line_counts.get(l, 0) + 1

        # Any line appearing at the top/bottom on >= 25% of pages is a running header/footer
        threshold = max(3, int(len(raw_pages) * 0.25))
        repetitive_headers = {l for l, count in top_line_counts.items() if count >= threshold}
        repetitive_footers = {l for l, count in bottom_line_counts.items() if count >= threshold}

        cleaned_pages = []
        for p in raw_pages:
            lines = p["text"].splitlines()
            kept = []
            for l in lines:
                s = l.strip()
                if s in repetitive_headers or s in repetitive_footers:
                    continue
                if re.match(r"^(?:page\s*\d+|\d+\s*/\s*\d+|-\s*\d+\s*-|\d+)$", s, re.IGNORECASE):
                    continue
                kept.append(l)
            cleaned_text = "\n".join(kept).strip()
            cleaned_pages.append({
                "page_number": p["page_number"],
                "text": cleaned_text or p["text"]
            })
        return cleaned_pages

    def extract_text(self, file_path: Path) -> List[Dict[str, Any]]:
        """Extract text from PDF or text file while preserving page numbers and dynamically stripping headers."""
        ext = file_path.suffix.lower()
        raw_pages: List[Dict[str, Any]] = []

        if ext == ".pdf":
            try:
                doc = pymupdf.open(file_path)
                for page_num in range(len(doc)):
                    page = doc[page_num]
                    text = page.get_text()
                    raw_pages.append({"page_number": page_num + 1, "text": text})
                doc.close()
            except Exception as e:
                logger.error(f"Error extracting text from PDF {file_path}: {e}")
                raise NexusException(f"Failed to extract text from PDF: {e}", status_code=400)
        else:
            try:
                with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                    text = f.read()
                raw_pages.append({"page_number": 1, "text": text})
            except Exception as e:
                logger.error(f"Error reading text file {file_path}: {e}")
                raise NexusException(f"Failed to read file: {e}", status_code=400)

        return self._strip_running_headers_and_footers(raw_pages)

    def chunk_document(
        self,
        document_id: str,
        pages: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Chunk document text preserving chunk IDs, page numbers, and offsets."""
        all_chunks: List[Dict[str, Any]] = []
        chunk_idx = 0

        for page_data in pages:
            page_num = page_data["page_number"]
            page_text = page_data["text"]

            page_chunks = chunk_text_by_paragraphs(
                text=page_text,
                page_number=page_num,
                chunk_size=settings.CHUNK_SIZE,
                chunk_overlap=settings.CHUNK_OVERLAP,
                min_chunk_size=settings.MIN_CHUNK_SIZE,
            )

            for chk in page_chunks:
                chunk_id = generate_chunk_id(document_id, page_num, chunk_idx)
                all_chunks.append({
                    "id": chunk_id,
                    "chunk_id": chunk_id,
                    "document_id": document_id,
                    "page_number": page_num,
                    "text": chk["text"],
                    "start_char": chk["start_char"],
                    "end_char": chk["end_char"],
                    "word_count": chk["word_count"],
                })
                chunk_idx += 1

        return all_chunks

    def update_document_status(
        self,
        document_id: str,
        status: DocumentStatus,
        total_pages: Optional[int] = None,
        total_chunks: Optional[int] = None,
        total_entities: Optional[int] = None,
        total_relationships: Optional[int] = None,
        error_message: Optional[str] = None,
    ) -> None:
        """Update indexing progress and metrics."""
        if document_id in self._registry:
            record = self._registry[document_id]
            record["status"] = status.value
            record["updated_at"] = datetime.now(timezone.utc).isoformat()
            if total_pages is not None:
                record["total_pages"] = total_pages
            if total_chunks is not None:
                record["total_chunks"] = total_chunks
            if total_entities is not None:
                record["total_entities"] = total_entities
            if total_relationships is not None:
                record["total_relationships"] = total_relationships
            if error_message is not None:
                record["error_message"] = error_message
            self._save_registry()

    def delete_document(self, document_id: str) -> None:
        """Delete document record and file from disk."""
        if document_id not in self._registry:
            raise DocumentNotFoundException(document_id)

        record = self._registry.pop(document_id)
        file_path = Path(record.get("file_path", ""))
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception as e:
                logger.warning(f"Could not delete file {file_path}: {e}")

        self._save_registry()
        logger.info(f"Deleted document record {document_id}")

    def get_document_registry(self) -> Dict[str, Dict[str, Any]]:
        return self._registry


document_service = DocumentService()
