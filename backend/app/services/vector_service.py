"""Vector embedding and retrieval service.
Integrates with ChromaDB and supports configurable embedding providers.
"""
from typing import Any, Dict, List, Optional
import httpx
from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.repositories.chroma_repository import chroma_repo


class VectorService:
    """Handles text embedding generation and vector search through ChromaDB."""

    def __init__(self):
        self.repo = chroma_repo

    async def get_embeddings(self, texts: List[str]) -> Optional[List[List[float]]]:
        """Generate embeddings if using an external provider like Ollama or OpenAI.
        If using Chroma's default, returns None so Chroma computes them automatically.
        """
        if settings.EMBEDDING_PROVIDER == "ollama" and settings.LLM_BASE_URL:
            try:
                embeddings = []
                async with httpx.AsyncClient(timeout=30.0) as client:
                    for text in texts:
                        resp = await client.post(
                            f"{settings.LLM_BASE_URL}/api/embeddings",
                            json={"model": settings.EMBEDDING_MODEL, "prompt": text},
                        )
                        if resp.status_code == 200:
                            embeddings.append(resp.json().get("embedding", []))
                        else:
                            return None
                return embeddings
            except Exception as e:
                logger.warning(f"Ollama embedding failed ({e}), falling back to Chroma default.")
                return None

        # Chroma default will compute embeddings internally
        return None

    async def index_chunks(
        self,
        collection_id: str,
        chunk_ids: List[str],
        documents: List[str],
        metadatas: List[Dict[str, Any]],
    ) -> None:
        """Store and index document chunks with embeddings."""
        if not chunk_ids:
            return

        embeddings = await self.get_embeddings(documents)
        self.repo.add_chunks(
            collection_name=collection_id,
            chunk_ids=chunk_ids,
            documents=documents,
            metadatas=metadatas,
            embeddings=embeddings,
        )

    async def search(
        self,
        query: str,
        collection_id: str = "default",
        n_results: int = 5,
        document_ids: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Perform semantic similarity search on chunks."""
        where_filter = None
        if document_ids and len(document_ids) == 1:
            where_filter = {"document_id": document_ids[0]}
        elif document_ids and len(document_ids) > 1:
            where_filter = {"document_id": {"$in": document_ids}}

        try:
            results = self.repo.query(
                collection_name=collection_id,
                query_texts=[query],
                n_results=n_results,
                where=where_filter,
            )
        except Exception as e:
            logger.error(f"Error querying ChromaDB: {e}")
            return []

        retrieved: List[Dict[str, Any]] = []
        if not results or not results.get("ids") or not results["ids"][0]:
            return []

        ids = results["ids"][0]
        docs = results["documents"][0]
        metadatas = results["metadatas"][0]
        distances = results.get("distances", [[0.0] * len(ids)])[0]

        for cid, doc, meta, dist in zip(ids, docs, metadatas, distances):
            # Cosine distance to similarity score
            score = max(0.0, min(1.0, 1.0 - (dist / 2.0)))
            retrieved.append({
                "chunk_id": cid,
                "text": doc,
                "metadata": meta,
                "score": score,
                "document_id": meta.get("document_id", ""),
                "page_number": int(meta.get("page_number", 1)),
            })

        return retrieved

    def delete_document_chunks(self, collection_id: str, document_id: str) -> int:
        """Delete all chunks for a document."""
        return self.repo.delete_by_document_id(collection_id, document_id)


vector_service = VectorService()
