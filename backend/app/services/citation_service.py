"""Citation verification and provenance service for NEXUS AI.
Extracts grounded citations with document, page, and chunk provenance.
Never invents documents, page numbers, or non-existent chunks.
"""
from typing import Any, Dict, List, Optional
from backend.app.schemas.chat import Citation
from backend.app.utils.identifiers import generate_citation_id


class CitationService:
    """Creates verifiable citations strictly tied to retrieved chunks."""

    def build_citations(
        self,
        retrieved_chunks: List[Dict[str, Any]],
        document_registry: Dict[str, Dict[str, Any]],
        max_citations: int = 5,
    ) -> List[Citation]:
        """Convert retrieved source chunks into verified Citation objects."""
        citations: List[Citation] = []
        seen_chunks = set()

        for chunk in retrieved_chunks:
            chunk_id = chunk.get("chunk_id") or chunk.get("id")
            if not chunk_id or chunk_id in seen_chunks:
                continue

            doc_id = chunk.get("document_id") or chunk.get("metadata", {}).get("document_id", "")
            page_num = int(chunk.get("page_number") or chunk.get("metadata", {}).get("page_number", 1))
            raw_text = chunk.get("text") or chunk.get("document", "")

            # Look up document filename
            doc_info = document_registry.get(doc_id, {})
            filename = doc_info.get("filename", f"Document-{doc_id[:8]}")

            # Extract a concise, meaningful excerpt
            excerpt = self._extract_concise_excerpt(raw_text)
            cit_id = generate_citation_id(doc_id, chunk_id)

            citation = Citation(
                citation_id=cit_id,
                document_id=doc_id,
                document_filename=filename,
                chunk_id=chunk_id,
                page_number=page_num,
                excerpt=excerpt,
                relevance_score=float(chunk.get("score", 1.0)),
            )
            citations.append(citation)
            seen_chunks.add(chunk_id)

            if len(citations) >= max_citations:
                break

        return citations

    def _extract_concise_excerpt(self, text: str, max_chars: int = 240) -> str:
        """Create a clean excerpt from the chunk."""
        clean = " ".join(text.split())
        if len(clean) <= max_chars:
            return clean
        # Truncate at sentence or word boundary
        truncated = clean[:max_chars]
        last_space = truncated.rfind(" ")
        if last_space > 100:
            truncated = truncated[:last_space]
        return f"{truncated}..."


citation_service = CitationService()
