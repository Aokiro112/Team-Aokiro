"""Grounded answer generation service for NEXUS AI.
Synthesizes answers strictly from retrieved evidence with verifiable citations,
contradiction detection, and evidence sufficiency assessments.
"""
import re
from typing import Any, Dict, List, Optional
import httpx
from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.schemas.chat import (
    EvidenceSufficiency,
    QueryIntent,
    QueryRequest,
    QueryResponse,
    RetrievalStrategy,
)
from backend.app.schemas.graph import GraphPath, NodeModel
from backend.app.services.citation_service import citation_service
from backend.app.utils.identifiers import generate_request_id


class AnswerService:
    """Generates grounded answers from retrieved evidence."""

    def __init__(self):
        self.citation_svc = citation_service
        self.llm_provider = settings.LLM_PROVIDER
        self.base_url = settings.LLM_BASE_URL
        self.model = settings.LLM_MODEL
        self.timeout = settings.LLM_TIMEOUT_SECONDS

    async def generate_answer(
        self,
        request: QueryRequest,
        intent: QueryIntent,
        strategy: RetrievalStrategy,
        retrieval_data: Dict[str, Any],
        document_registry: Dict[str, Dict[str, Any]],
        request_id: Optional[str] = None,
    ) -> QueryResponse:
        """Synthesize answer with strict evidence grounding and citations."""
        req_id = request_id or generate_request_id()
        chunks = retrieval_data.get("chunks", [])
        entities: List[NodeModel] = retrieval_data.get("related_entities", [])
        paths: List[GraphPath] = retrieval_data.get("supporting_paths", [])
        trace: List[str] = retrieval_data.get("trace", [])
        warnings: List[str] = retrieval_data.get("warnings", [])

        trace.append("answer_generation")

        # 1. Check for Insufficient Evidence / Out-of-Domain Query
        query_words = set(re.findall(r"\b[a-zA-Z]{3,}\b", request.query.lower())) - {
            "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
            "the", "and", "are", "for", "with", "about", "does", "did", "can", "could",
            "from", "this", "that", "these", "those"
        }
        all_chunk_text = " ".join(c.get("text", "").lower() for c in chunks)
        has_keyword_match = any(w in all_chunk_text for w in query_words) if query_words else False
        max_score = max([float(c.get("score", 0.0)) for c in chunks], default=0.0)

        if not chunks or (not has_keyword_match and max_score < 0.65 and not paths):
            return QueryResponse(
                request_id=req_id,
                query=request.query,
                intent=intent,
                retrieval_strategy=strategy,
                answer="Based on the uploaded documents, there is insufficient evidence to answer this question.",
                evidence_sufficiency=EvidenceSufficiency.INSUFFICIENT,
                citations=[],
                supporting_passages=[],
                related_entities=[],
                supporting_paths=[],
                retrieval_trace=trace,
                warnings=["Retrieved passages do not contain relevant evidence for the query."],
            )

        # 2. Check for Contradictory Evidence
        sufficiency, conflict_warning = self._assess_evidence_consistency(chunks)
        if conflict_warning:
            warnings.append(conflict_warning)

        # 3. Build Citations
        citations = self.citation_svc.build_citations(
            retrieved_chunks=chunks,
            document_registry=document_registry,
            max_citations=request.max_citations,
        )

        supporting_passages = [c.get("text", "") for c in chunks[:3]]

        # 4. Generate Answer Text
        answer_text = await self._synthesize_answer_text(
            query=request.query,
            chunks=chunks,
            paths=paths,
            citations=citations,
            intent=intent,
        )

        return QueryResponse(
            request_id=req_id,
            query=request.query,
            intent=intent,
            retrieval_strategy=strategy,
            answer=answer_text,
            evidence_sufficiency=sufficiency,
            citations=citations,
            supporting_passages=supporting_passages,
            related_entities=entities,
            supporting_paths=paths,
            retrieval_trace=trace,
            warnings=warnings,
        )

    def _assess_evidence_consistency(self, chunks: List[Dict[str, Any]]) -> (EvidenceSufficiency, Optional[str]):
        """Detect potential contradictory statements in retrieved chunks."""
        texts = [c.get("text", "").lower() for c in chunks]
        full_text = " ".join(texts)

        # Check for opposing polarity patterns
        has_allowed = bool(re.search(r"\b(?:permitted|allowed|mandatory|required)\b", full_text))
        has_forbidden = bool(re.search(r"\b(?:prohibited|not allowed|forbidden|strictly banned)\b", full_text))

        if has_allowed and has_forbidden:
            return (
                EvidenceSufficiency.CONTRADICTORY,
                "Conflicting policies or opposing statements detected across retrieved sources.",
            )

        if len(chunks) < 2:
            return EvidenceSufficiency.PARTIAL, None

        return EvidenceSufficiency.SUFFICIENT, None

    async def _synthesize_answer_text(
        self,
        query: str,
        chunks: List[Dict[str, Any]],
        paths: List[GraphPath],
        citations: List[Any],
        intent: QueryIntent,
    ) -> str:
        """Call LLM or deterministic fallback to produce grounded answer."""
        context_parts = []
        for idx, c in enumerate(citations):
            context_parts.append(f"[{idx+1}] (Doc: {c.document_filename}, Page: {c.page_number}):\n{c.excerpt}")

        if paths:
            path_desc = "\n".join([f"- Path: {p.description}" for p in paths])
            context_parts.append(f"Knowledge Graph Paths:\n{path_desc}")

        context = "\n\n".join(context_parts)

        # Try LLM if available
        if self.llm_provider == "ollama" and self.base_url:
            try:
                ans = await self._call_ollama(query, context)
                if ans:
                    return ans
            except Exception as e:
                logger.warning(f"Ollama answer generation failed: {e}")

        elif self.llm_provider == "openai" and settings.LLM_API_KEY:
            try:
                ans = await self._call_openai(query, context)
                if ans:
                    return ans
            except Exception as e:
                logger.warning(f"OpenAI answer generation failed: {e}")

        # Deterministic Grounded Synthesis Fallback
        return self._extractive_grounded_synthesis(query, chunks, paths, citations)

    async def _call_ollama(self, query: str, context: str) -> Optional[str]:
        prompt = f"""You are NEXUS AI, an evidence-grounded document assistant.
Answer the user's question using ONLY the provided evidence.
Do not assume or fabricate facts. Always cite sources like [1], [2].
If evidence is insufficient, state that explicitly.

Context:
{context}

Question: {query}
Answer:"""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.0},
                },
            )
            if resp.status_code == 200:
                return resp.json().get("response", "").strip()
        return None

    async def _call_openai(self, query: str, context: str) -> Optional[str]:
        headers = {"Authorization": f"Bearer {settings.LLM_API_KEY}"}
        prompt = f"Answer using ONLY the provided evidence:\n\n{context}\n\nQuestion: {query}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/v1/chat/completions",
                headers=headers,
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": "You are NEXUS AI. Answer grounded strictly in evidence."},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.0,
                },
            )
            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"].strip()
        return None

    def _extractive_grounded_synthesis(
        self,
        query: str,
        chunks: List[Dict[str, Any]],
        paths: List[GraphPath],
        citations: List[Any],
    ) -> str:
        """Deterministic extractive synthesis for offline / zero-hallucination execution."""
        sentences = []
        for idx, citation in enumerate(citations):
            # Extract first sentence of citation excerpt
            first_sentence = re.split(r"(?<=[.!?])\s+", citation.excerpt)[0].strip()
            if first_sentence:
                sentences.append(f"{first_sentence} [{idx+1}]")

        if not sentences and chunks:
            sentences.append(chunks[0].get("text", "")[:200])

        body = " ".join(sentences)

        if paths:
            path_texts = [f"• {p.description}" for p in paths]
            body += "\n\nSupporting Knowledge Graph Connections:\n" + "\n".join(path_texts)

        return body


answer_service = AnswerService()
