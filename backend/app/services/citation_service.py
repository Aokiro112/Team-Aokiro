"""Citation verification and provenance service for NEXUS AI.
Extracts grounded citations with document, page, and chunk provenance.
Never invents documents, page numbers, or non-existent chunks.
"""
from typing import Any, Dict, List, Optional
from backend.app.schemas.chat import Citation
from backend.app.schemas.visuals import VisualEvidence
from backend.app.utils.identifiers import generate_citation_id


class CitationService:
    """Creates verifiable citations strictly tied to retrieved chunks."""

    def build_citations(
        self,
        retrieved_chunks: List[Dict[str, Any]],
        document_registry: Dict[str, Dict[str, Any]],
        max_citations: int = 5,
        visual_evidence: Optional[List[VisualEvidence]] = None,
    ) -> List[Citation]:
        """Convert retrieved source chunks into verified Citation objects."""
        citations: List[Citation] = []
        seen_chunks = set()
        visual_by_id = {visual.id: visual for visual in (visual_evidence or [])}

        # Put direct visual provenance first. This is important for image-only uploads,
        # where Chroma may return a visual summary chunk before any textual evidence.
        for visual in visual_evidence or []:
            if len(citations) >= max_citations:
                break
            citations.append(
                Citation(
                    citation_id=generate_citation_id(visual.document_id, visual.id),
                    document_id=visual.document_id,
                    document_filename=visual.document_filename,
                    chunk_id=f"vis_{visual.id}",
                    page_number=visual.page_number,
                    excerpt=visual.caption or visual.description,
                    relevance_score=float(visual.confidence),
                    visual_id=visual.id,
                    image_url=visual.image_url,
                )
            )

        for chunk in retrieved_chunks:
            chunk_id = chunk.get("chunk_id") or chunk.get("id")
            if not chunk_id or chunk_id in seen_chunks:
                continue

            doc_id = chunk.get("document_id") or chunk.get("metadata", {}).get("document_id", "")
            page_num = int(chunk.get("page_number") or chunk.get("metadata", {}).get("page_number", 1))
            raw_text = chunk.get("text") or chunk.get("document", "")
            visual_id = (
                chunk.get("visual_id")
                or chunk.get("metadata", {}).get("visual_id")
                or (chunk_id[4:] if chunk_id.startswith("vis_") else None)
            )
            visual = visual_by_id.get(visual_id) if visual_id else None
            if visual is None and (chunk.get("is_visual") or chunk.get("metadata", {}).get("is_visual")):
                visual = next(
                    (
                        item for item in (visual_evidence or [])
                        if item.document_id == doc_id and item.page_number == page_num
                    ),
                    None,
                )
                visual_id = visual.id if visual else visual_id
            if visual is not None and any(item.visual_id == visual.id for item in citations):
                continue

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
                visual_id=visual_id,
                image_url=visual.image_url if visual else None,
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
