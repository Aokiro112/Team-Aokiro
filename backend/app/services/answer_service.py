"""Grounded answer generation service for NEXUS AI.
Synthesizes answers strictly from retrieved evidence with verifiable citations,
contradiction detection, and evidence sufficiency assessments.
"""
import re
from typing import Any, Dict, List, Optional, Tuple
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
from backend.app.schemas.visuals import (
    GeneratedVisual,
    VisualEvidence,
    VisualGenerationRequest,
    VisualGenerationType,
)
from backend.app.services.citation_service import citation_service
from backend.app.services.visual_generation_service import visual_generation_service
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
        visual_evidence: List[VisualEvidence] = retrieval_data.get("visual_evidence", [])
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
        has_visual_match = bool(visual_evidence)
        max_score = max([float(c.get("score", 0.0)) for c in chunks], default=0.0)

        if not chunks and not visual_evidence or (not has_keyword_match and not has_visual_match and max_score < 0.65 and not paths):
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
                visual_evidence=[],
                generated_visual=None,
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
            visual_evidence=visual_evidence,
        )

        supporting_passages = [c.get("text", "") for c in chunks[:3]]

        # 4. Check for Visual Generation Intent (Flowcharts, Concept Maps, Diagrams, Illustrations)
        q_lower = request.query.lower()
        generated_visual: Optional[GeneratedVisual] = None
        is_visual_gen_request = bool(
            re.search(
                r"\b(?:generate|create|turn this into|draw|make|show me) (?:a )?(?:flowchart|concept map|diagram|illustration|visual)\b",
                q_lower,
            )
        )
        if is_visual_gen_request:
            v_gen_type = VisualGenerationType.FLOWCHART
            if "concept map" in q_lower or "concept" in q_lower:
                v_gen_type = VisualGenerationType.CONCEPT_MAP
            elif "illustration" in q_lower or "picture" in q_lower or "drawing" in q_lower:
                v_gen_type = VisualGenerationType.ILLUSTRATION
            elif "technical" in q_lower or "sequence" in q_lower:
                v_gen_type = VisualGenerationType.TECHNICAL_DIAGRAM

            try:
                context_summary = " ".join([c.get("text", "") for c in chunks[:4]])
                generated_visual = await visual_generation_service.generate_visual(
                    VisualGenerationRequest(
                        prompt=request.query,
                        visual_type=v_gen_type,
                        context=context_summary,
                        document_ids=request.document_ids,
                    )
                )
                trace.append(f"synthesized_{v_gen_type.value.lower()}_visual")
            except Exception as e:
                logger.warning(f"Visual synthesis error: {e}")

        # 5. Determine Target Model & Generate Answer Text
        requested_model = request.model or (self.model if self.llm_provider == "ollama" else "rule_based")
        answer_text, actual_model_used = await self._synthesize_answer_text(
            query=request.query,
            chunks=chunks,
            paths=paths,
            citations=citations,
            intent=intent,
            requested_model=requested_model,
            visual_evidence=visual_evidence,
        )

        if intent == QueryIntent.VISUAL_GROUNDED and visual_evidence:
            visual_answer = await self._answer_from_visuals(request.query, visual_evidence, chunks)
            if visual_answer:
                answer_text, actual_model_used = visual_answer
                if citations and not re.search(r"\[\d+(?:,\s*\d+)*\]", answer_text):
                    answer_text = f"{answer_text.rstrip()} [1]"
            else:
                warnings.append(
                    "A vision-capable model was unavailable; this answer uses indexed visual descriptions and surrounding text only."
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
            model_used=actual_model_used,
            visual_evidence=visual_evidence,
            generated_visual=generated_visual,
        )

    async def _answer_from_visuals(
        self,
        query: str,
        visuals: List[VisualEvidence],
        chunks: List[Dict[str, Any]],
    ) -> Optional[Tuple[str, str]]:
        """Use the original top-ranked image when the configured vision provider is available."""
        from pathlib import Path
        from backend.app.services.vision_service import vision_service

        visual = visuals[0]
        path = Path(visual.image_path)
        if not path.exists():
            return None
        try:
            context = " ".join(
                c.get("text", "") for c in chunks if c.get("page_number") == visual.page_number
            )[:1500]
            result = await vision_service.answer_question(
                image_bytes=path.read_bytes(),
                question=query,
                context_text=context or visual.surrounding_text or "",
                image_format=visual.format,
            )
            if result and result.get("answer"):
                return result["answer"], result.get("provider", "vision")
        except Exception as exc:
            logger.debug(f"Visual question synthesis unavailable: {exc}")
        return None

    def _assess_evidence_consistency(self, chunks: List[Dict[str, Any]]) -> Tuple[EvidenceSufficiency, Optional[str]]:
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
        requested_model: Optional[str] = None,
        visual_evidence: Optional[List[VisualEvidence]] = None,
    ) -> Tuple[str, str]:
        """Call LLM or deterministic fallback to produce grounded answer."""
        context_parts = []
        chunk_map = {
            (ch.get("chunk_id") or ch.get("id")): (ch.get("text") or ch.get("document", ""))
            for ch in chunks
        }
        for idx, c in enumerate(citations):
            evidence_text = chunk_map.get(c.chunk_id) or c.excerpt
            context_parts.append(f"[{idx+1}] (Doc: {c.document_filename}, Page: {c.page_number}):\n{evidence_text}")

        if visual_evidence:
            v_desc = []
            for v_idx, v in enumerate(visual_evidence, 1):
                lbls = f"Labels/Elements: {', '.join(v.detected_labels)}" if v.detected_labels else ""
                v_desc.append(
                    f"[Figure #{v_idx}] ({v.visual_type.value} from {v.document_filename}, Page {v.page_number}):\n"
                    f"Title: {v.title}\n"
                    f"Caption: {v.caption or 'N/A'}\n"
                    f"Visual Content Analysis: {v.description}\n"
                    f"{v.detailed_analysis or ''}\n"
                    f"{lbls}"
                )
            context_parts.append("Visual Evidence & Document Diagrams:\n" + "\n\n".join(v_desc))

        if paths:
            path_desc = "\n".join([f"- Path: {p.description}" for p in paths])
            context_parts.append(f"Knowledge Graph Paths:\n{path_desc}")

        context = "\n\n".join(context_parts)

        # 1. Deterministic Rule-Based Grounding explicitly requested
        if requested_model == "rule_based":
            ans = self._extractive_grounded_synthesis(query, chunks, paths, citations, visual_evidence)
            return ans, "rule_based"

        # 2. Try Ollama (either requested model or default configured)
        ollama_model = requested_model or self.model
        if self.base_url:
            try:
                ans = await self._call_ollama(query, context, model=ollama_model)
                if ans:
                    return ans, ollama_model
            except Exception as e:
                logger.warning(f"Ollama ({ollama_model}) answer generation failed: {e}")

        # 3. Try OpenAI if configured
        if self.llm_provider == "openai" and settings.LLM_API_KEY:
            try:
                ans = await self._call_openai(query, context)
                if ans:
                    return ans, self.model
            except Exception as e:
                logger.warning(f"OpenAI answer generation failed: {e}")

        # 4. Fallback to Deterministic Grounded Synthesis
        ans = self._extractive_grounded_synthesis(query, chunks, paths, citations, visual_evidence)
        return ans, "rule_based"

    async def _call_ollama(self, query: str, context: str, model: Optional[str] = None) -> Optional[str]:
        target_model = model or self.model
        prompt = f"""You are NEXUS AI, an advanced evidence-grounded research assistant.
Your task is to write a cohesive, comprehensive, highly readable, and beautifully structured answer to the user's question based strictly on the provided Context.

STRICT FORMATTING & SYNTAX GUIDELINES:
1. Evidence-First Grounding:
   - Ground every statement strictly in the provided Context.
   - Attach bracketed inline citations directly to the claims or numbers they verify (e.g. "Net revenues reached $58.28 billion [1].").
2. Strong Visual Formatting:
   - Use Markdown headings (###) to organize logical sections.
   - Keep paragraphs concise (2-3 sentences max) to avoid walls of text.
   - Highlight key figures, dates, and terms in **bold**.
   - Use clean bullet points (- **Topic / Year**: details [1]) for metrics and lists.
   - When presenting multi-year financial data, metrics, or comparisons, include a clean Markdown table with headers (e.g. | Year | Metric | Value |).
3. Boundaries:
   - If facts are missing or confidential, explicitly note that they are not established in the available corpus. Never speculate or hallucinate.
4. Knowledge Graph Relations:
   - If Knowledge Graph Paths are provided below, conclude your answer with the section:
### Supporting Knowledge Graph Connections:
followed by bullet points detailing each directed connection.

Context:
{context}

Question: {query}
Answer:"""
        candidate_urls = [self.base_url]
        if "localhost" in self.base_url:
            candidate_urls.append(self.base_url.replace("localhost", "127.0.0.1"))
        elif "127.0.0.1" in self.base_url:
            candidate_urls.append(self.base_url.replace("127.0.0.1", "localhost"))

        for endpoint_url in candidate_urls:
            try:
                async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT_SECONDS) as client:
                    resp = await client.post(
                        f"{endpoint_url}/api/generate",
                        json={
                            "model": target_model,
                            "prompt": prompt,
                            "stream": False,
                            "think": False,
                            "options": {
                                "temperature": 0.1,
                                "num_ctx": 4096,
                            },
                        },
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        resp_text = (data.get("response") or "").strip()
                        if not resp_text and data.get("thinking"):
                            # Fallback if model placed text inside thinking
                            clean_think = re.sub(r"<think>.*?</think>", "", data.get("thinking", ""), flags=re.DOTALL).strip()
                            resp_text = clean_think or data.get("thinking", "").strip()
                        return resp_text if resp_text else None
            except Exception as e:
                logger.debug(f"Calling Ollama at {endpoint_url} failed: {e}")
                continue

        return None

    async def _call_openai(self, query: str, context: str) -> Optional[str]:
        headers = {"Authorization": f"Bearer {settings.LLM_API_KEY}"}
        prompt = f"""You are NEXUS AI, an advanced evidence-grounded research assistant.
Answer the user's question using strictly the provided Context. Answer directly, cite sources like [1], and include directed graph paths if present.

Context:
{context}

Question: {query}"""
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
        visual_evidence: Optional[List[VisualEvidence]] = None,
    ) -> str:
        """High-precision dynamic extractive synthesis with clean sentence scoring and zero hardcoding."""
        q_lower = query.lower()

        # If no citations, chunks, or visual evidence, cleanly state evidence limitation
        if not citations and not chunks and not visual_evidence:
            return "Based on the available documents in the knowledge base, there is insufficient evidence to directly answer this question."

        # Extract and sanitize informative sentences from citations
        cleaned_passages = []
        is_asking_eval = any(w in q_lower for w in ["benchmark", "question", "eval", "gold standard", "rubric"])
        for idx, citation in enumerate(citations):
            raw_text = citation.excerpt or ""
            lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
            clean_excerpt = " ".join(lines)
            clean_excerpt = re.sub(r"^\d{1,2}\s*\|\s*[^:\n]+:\s*", "", clean_excerpt)

            # Split into clean sentences
            raw_sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", clean_excerpt)]
            valid_sentences = []
            for s in raw_sentences:
                clean_s = re.sub(r"^[,;:\-\s]+", "", s).strip()
                if len(clean_s) < 25:
                    continue
                # Skip benchmark QA rows unless user asked about benchmarks
                if not is_asking_eval and re.search(r"^(?:q:|expected:|gold-standard|rubric)", clean_s, re.IGNORECASE):
                    continue
                valid_sentences.append(clean_s)

            if valid_sentences:
                query_words = set(re.findall(r"\b[a-z]{4,}\b", q_lower))
                best_s = valid_sentences[0]
                best_score = -1
                for s in valid_sentences:
                    s_words = set(re.findall(r"\b[a-z]{4,}\b", s.lower()))
                    overlap = len(s_words & query_words)
                    if overlap > best_score:
                        best_score = overlap
                        best_s = s
                # Ensure sentence ends with period before citation
                if not best_s.endswith((".", "!", "?")):
                    best_s += "."
                cleaned_passages.append(f"{best_s} [{idx+1}]")

        if not cleaned_passages and chunks:
            raw_c = chunks[0].get("text", "")
            first_line = re.sub(r"^[,;:\-\s]+", "", raw_c.split("\n")[0]).strip()[:200]
            if first_line:
                cleaned_passages.append(f"{first_line}. [1]")

        # If visual evidence is present, append grounded visual descriptions
        if visual_evidence:
            for v_idx, v in enumerate(visual_evidence, 1):
                caption_part = f" (**{v.caption}**)" if v.caption else ""
                cleaned_passages.append(
                    f"**Figure #{v_idx}** (Page {v.page_number} of *{v.document_filename}*){caption_part}: {v.description}"
                )

        body = "\n\n".join(cleaned_passages)

        if paths:
            path_texts = [f"• {p.description}" for p in paths]
            body += "\n\n### Supporting Knowledge Graph Connections:\n" + "\n".join(path_texts)

        return body


answer_service = AnswerService()
