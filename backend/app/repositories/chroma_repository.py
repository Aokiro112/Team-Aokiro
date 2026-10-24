"""ChromaDB vector repository for NEXUS AI.
Manages persistent semantic collections, chunk embeddings, and similarity retrieval.
"""
from typing import Any, Dict, List, Optional
import chromadb
from chromadb.config import Settings as ChromaSettings
from backend.app.core.config import settings
from backend.app.core.logging import logger


class ChromaRepository:
    """Manages chunk vector storage and retrieval with ChromaDB."""

    def __init__(self, persist_directory: Optional[str] = None):
        self.persist_directory = persist_directory or settings.CHROMA_PERSIST_DIRECTORY
        self._client: Optional[chromadb.ClientAPI] = None

    def get_client(self) -> chromadb.ClientAPI:
        """Get or initialize persistent ChromaDB client."""
        if self._client is None:
            logger.info(f"Initializing ChromaDB client at: {self.persist_directory}")
            self._client = chromadb.PersistentClient(
                path=self.persist_directory,
                settings=ChromaSettings(anonymized_telemetry=False, allow_reset=True),
            )
        return self._client

    def get_or_create_collection(self, collection_name: str = "default") -> chromadb.Collection:
        """Get or create collection with prefix."""
        client = self.get_client()
        full_name = f"{settings.CHROMA_COLLECTION_PREFIX}_{collection_name}"
        # Chroma collection names must be 3-63 chars, alphanumeric + underscores/hyphens
        clean_name = full_name.replace("-", "_")[:60]
        return client.get_or_create_collection(
            name=clean_name,
            metadata={"hnsw:space": "cosine"},
        )

    def add_chunks(
        self,
        collection_name: str,
        chunk_ids: List[str],
        documents: List[str],
        metadatas: List[Dict[str, Any]],
        embeddings: Optional[List[List[float]]] = None,
    ) -> None:
        """Add or update chunks in Chroma collection."""
        if not chunk_ids:
            return

        collection = self.get_or_create_collection(collection_name)
        # Chroma expects metadatas values to be str, int, float, or bool
        cleaned_metadatas = []
        for m in metadatas:
            cleaned = {}
            for k, v in m.items():
                if isinstance(v, (str, int, float, bool)):
                    cleaned[k] = v
                elif isinstance(v, list):
                    cleaned[k] = ",".join(str(x) for x in v)
                else:
                    cleaned[k] = str(v)
            cleaned_metadatas.append(cleaned)

        if embeddings:
            collection.upsert(
                ids=chunk_ids,
                documents=documents,
                metadatas=cleaned_metadatas,
                embeddings=embeddings,
            )
        else:
            collection.upsert(
                ids=chunk_ids,
                documents=documents,
                metadatas=cleaned_metadatas,
            )
        logger.debug(f"Added/updated {len(chunk_ids)} chunks in collection {collection_name}")

    def query(
        self,
        collection_name: str,
        query_texts: Optional[List[str]] = None,
        query_embeddings: Optional[List[List[float]]] = None,
        n_results: int = 5,
        where: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Perform semantic search on collection."""
        collection = self.get_or_create_collection(collection_name)
        count = collection.count()
        if count == 0:
            return {"ids": [[]], "documents": [[]], "metadatas": [[]], "distances": [[]]}

        actual_n = min(n_results, count)
        if query_embeddings:
            return collection.query(
                query_embeddings=query_embeddings,
                n_results=actual_n,
                where=where,
                include=["documents", "metadatas", "distances"],
            )
        elif query_texts:
            return collection.query(
                query_texts=query_texts,
                n_results=actual_n,
                where=where,
                include=["documents", "metadatas", "distances"],
            )
        else:
            raise ValueError("Either query_texts or query_embeddings must be provided")

    def get_chunk_by_id(self, collection_name: str, chunk_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve single chunk by ID."""
        collection = self.get_or_create_collection(collection_name)
        result = collection.get(ids=[chunk_id], include=["documents", "metadatas"])
        if result and result.get("ids") and len(result["ids"]) > 0:
            return {
                "id": result["ids"][0],
                "document": result["documents"][0] if result.get("documents") else "",
                "metadata": result["metadatas"][0] if result.get("metadatas") else {},
            }
        return None

    def delete_by_document_id(self, collection_name: str, document_id: str) -> int:
        """Delete all chunks belonging to a document."""
        collection = self.get_or_create_collection(collection_name)
        try:
            # Query chunks by document_id
            chunks = collection.get(where={"document_id": document_id})
            ids_to_delete = chunks.get("ids", [])
            if ids_to_delete:
                collection.delete(ids=ids_to_delete)
                logger.info(f"Deleted {len(ids_to_delete)} chunks for document {document_id}")
                return len(ids_to_delete)
        except Exception as e:
            logger.error(f"Error deleting chunks for document {document_id}: {e}")
        return 0

    def get_collection_count(self, collection_name: str = "default") -> int:
        """Get total count of chunks in collection."""
        try:
            collection = self.get_or_create_collection(collection_name)
            return collection.count()
        except Exception as e:
            logger.error(f"Failed to get collection count: {e}")
            return 0

    def check_health(self) -> bool:
        """Check if ChromaDB client is functional."""
        try:
            client = self.get_client()
            client.heartbeat()
            return True
        except Exception as e:
            logger.warning(f"ChromaDB health check failed: {e}")
            return False


chroma_repo = ChromaRepository()
