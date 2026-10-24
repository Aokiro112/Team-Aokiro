"""Entity, Topic, and Relationship extraction service.
Supports LLM extraction via Ollama/OpenAI with an intelligent heuristic NLP fallback.
"""
import json
import re
from typing import Any, Dict, List, Optional, Tuple
import httpx
from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.utils.identifiers import (
    generate_entity_id,
    generate_relationship_id,
    generate_topic_id,
)
from backend.app.schemas.graph import EdgeModel, NodeModel
from backend.app.schemas.topics import TopicModel


class ExtractionService:
    """Extracts entities, relationship triples, and topics from text chunks."""

    def __init__(self):
        self.llm_provider = settings.LLM_PROVIDER
        self.base_url = settings.LLM_BASE_URL
        self.model = settings.LLM_MODEL
        self.timeout = settings.LLM_TIMEOUT_SECONDS

    async def extract_from_chunk(
        self,
        chunk_text: str,
        chunk_id: str,
        document_id: str,
        page_number: int,
    ) -> Dict[str, Any]:
        """Extract entities, relationships, and topics from a chunk rapidly."""
        if not chunk_text or len(chunk_text.strip()) < 20:
            return {"entities": [], "relationships": [], "topics": []}

        # Fast deterministic heuristic NLP extraction (runs in milliseconds, handles entities & relations)
        return self._heuristic_nlp_extraction(chunk_text, chunk_id, document_id, page_number)

    async def extract_document_themes(
        self,
        document_text: str,
        document_id: str,
        model: Optional[str] = None,
    ) -> List[TopicModel]:
        """Extract high-level thematic topics for the entire document using a single fast LLM call."""
        target_model = model or self.model
        sample_text = document_text[:3500].strip()
        if not sample_text or len(sample_text) < 50:
            return []

        if self.llm_provider == "ollama" and self.base_url:
            try:
                prompt = f"""Identify 3 to 6 major thematic topics covered in this document.
Return ONLY valid JSON matching this schema:
{{
  "topics": [
    {{"name": "Theme/Topic Name", "description": "Brief description of this theme"}}
  ]
}}

Document Excerpt:
\"\"\"{sample_text}\"\"\"
"""
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.post(
                        f"{self.base_url}/api/generate",
                        json={
                            "model": target_model,
                            "prompt": prompt,
                            "format": "json",
                            "stream": False,
                            "options": {"temperature": 0.0},
                        },
                    )
                    if resp.status_code == 200:
                        body = resp.json()
                        raw_json = json.loads(body.get("response", "{}"))
                        topics = []
                        for t in raw_json.get("topics", []):
                            tname = str(t.get("name", "")).strip()
                            if tname:
                                tid = generate_topic_id(tname)
                                topics.append(
                                    TopicModel(
                                        id=tid,
                                        name=tname,
                                        description=str(t.get("description", f"Theme: {tname}")),
                                        keywords=[w.lower() for w in re.findall(r"\w+", tname)],
                                        document_ids=[document_id],
                                        representative_passages=[sample_text[:250]],
                                    )
                                )
                        if topics:
                            return topics
            except Exception as e:
                logger.debug(f"Document theme extraction via LLM timed out or failed ({e}). Using NLP themes.")

        return []

    async def _extract_via_ollama(self, text: str) -> Optional[Dict[str, Any]]:
        """Call Ollama for structured JSON triple extraction."""
        prompt = self._build_extraction_prompt(text)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False,
                    "options": {"temperature": 0.0},
                },
            )
            if resp.status_code == 200:
                body = resp.json()
                raw_json = body.get("response", "{}")
                return json.loads(raw_json)
        return None

    async def _extract_via_openai(self, text: str) -> Optional[Dict[str, Any]]:
        """Call OpenAI-compatible endpoint for structured extraction."""
        prompt = self._build_extraction_prompt(text)
        headers = {"Authorization": f"Bearer {settings.LLM_API_KEY}"}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/v1/chat/completions",
                headers=headers,
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": "You are a knowledge graph extraction assistant. Respond only with valid JSON."},
                        {"role": "user", "content": prompt},
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.0,
                },
            )
            if resp.status_code == 200:
                content = resp.json()["choices"][0]["message"]["content"]
                return json.loads(content)
        return None

    def _build_extraction_prompt(self, text: str) -> str:
        return f"""Extract entities, relationships, and topics from the text.
Return ONLY valid JSON matching this schema:
{{
  "entities": [
    {{"name": "Entity Name", "type": "Concept/Organization/Person/Technology/Policy", "description": "Brief description"}}
  ],
  "relationships": [
    {{"source": "Entity Name 1", "target": "Entity Name 2", "type": "RELATES_TO/OFFERS/REQUIRES/PART_OF/DEFINES", "evidence": "Exact quote from text"}}
  ],
  "topics": [
    {{"name": "Topic Name", "description": "Brief description"}}
  ]
}}

Text:
\"\"\"{text[:1800]}\"\"\"
"""

    def _process_extracted_payload(
        self,
        payload: Dict[str, Any],
        chunk_text: str,
        chunk_id: str,
        document_id: str,
    ) -> Dict[str, Any]:
        """Convert raw LLM extraction into typed NodeModel and EdgeModel objects."""
        raw_entities = payload.get("entities", [])
        raw_relationships = payload.get("relationships", [])
        raw_topics = payload.get("topics", [])

        entities: List[NodeModel] = []
        name_to_id: Dict[str, str] = {}

        for ent in raw_entities:
            name = str(ent.get("name", "")).strip()
            if not name or len(name) < 2:
                continue
            etype = str(ent.get("type", "Concept")).strip().capitalize()
            desc = str(ent.get("description", "")).strip()
            eid = generate_entity_id(name, etype)
            name_to_id[name.lower()] = eid

            node = NodeModel(
                id=eid,
                canonical_name=name,
                entity_type=etype,
                description=desc,
                document_ids=[document_id],
                chunk_ids=[chunk_id],
            )
            entities.append(node)

        relationships: List[EdgeModel] = []
        for rel in raw_relationships:
            src = str(rel.get("source", "")).strip()
            tgt = str(rel.get("target", "")).strip()
            rtype = str(rel.get("type", "RELATES_TO")).strip().upper().replace(" ", "_")
            evidence = str(rel.get("evidence", "")).strip() or chunk_text[:200]

            if not src or not tgt:
                continue

            src_id = name_to_id.get(src.lower(), generate_entity_id(src))
            tgt_id = name_to_id.get(tgt.lower(), generate_entity_id(tgt))

            rel_id = generate_relationship_id(src_id, tgt_id, rtype, evidence)
            edge = EdgeModel(
                id=rel_id,
                source=src_id,
                target=tgt_id,
                relationship_type=rtype,
                evidence=evidence,
                confidence=0.9,
                document_ids=[document_id],
                chunk_ids=[chunk_id],
            )
            relationships.append(edge)

        topics: List[TopicModel] = []
        for top in raw_topics:
            tname = str(top.get("name", "")).strip()
            if not tname:
                continue
            tid = generate_topic_id(tname)
            desc = str(top.get("description", f"Topic covering {tname}")).strip()
            topic = TopicModel(
                id=tid,
                name=tname,
                description=desc,
                keywords=[tname.lower()],
                document_ids=[document_id],
                representative_passages=[chunk_text[:250]],
            )
            topics.append(topic)

        return {
            "entities": entities,
            "relationships": relationships,
            "topics": topics,
        }

    def _heuristic_nlp_extraction(
        self,
        chunk_text: str,
        chunk_id: str,
        document_id: str,
        page_number: int,
    ) -> Dict[str, Any]:
        """Intelligent rule-based extraction for offline & deterministic testing.
        Extracts entities, relationship triples, and topics using syntactic patterns.
        """
        sentences = re.split(r"(?<=[.!?])\s+", chunk_text)
        entities_dict: Dict[str, NodeModel] = {}
        relationships: List[EdgeModel] = []
        topics_dict: Dict[str, TopicModel] = {}

        # Common stop words to exclude from entity candidate detection
        stopwords = {
            "the", "a", "an", "this", "that", "these", "those", "is", "are", "was",
            "were", "in", "on", "at", "to", "for", "with", "by", "from", "and", "or",
            "but", "as", "if", "when", "than", "then", "its", "it", "they", "we", "you",
            "all", "any", "both", "each", "few", "more", "most", "some", "such", "no"
        }

        # Relation indicators and verbs
        verb_patterns = [
            (r"\b(?:offers|provides|delivers|develops|creates|builds)\b", "OFFERS"),
            (r"\b(?:requires|mandates|demands|needs)\b", "REQUIRES"),
            (r"\b(?:is defined as|refers to|means)\b", "DEFINES"),
            (r"\b(?:is a|is an|acts as|serves as)\b", "IS_A"),
            (r"\b(?:is located in|situated at|based in)\b", "LOCATED_IN"),
            (r"\b(?:part of|component of|module of)\b", "PART_OF"),
            (r"\b(?:associated with|related to|connected to|collaborates with|eligible for)\b", "RELATED_TO"),
            (r"\b(?:developed by|created by|authored by|directed by|led by|headed by)\b", "DEVELOPED_BY"),
            (r"\b(?:governs|regulates|enforces|evaluated by|reviewed by|governed by)\b", "GOVERNS"),
            (r"\b(?:implements|uses|utilizes|employs|conducts)\b", "IMPLEMENTS"),
        ]

        def clean_ent_name(name: str) -> str:
            name = re.sub(r"^[^\w]+|[^\w]+$", "", name).strip()
            name = re.sub(r"^(?:the|a|an)\s+", "", name, flags=re.IGNORECASE).strip()
            return name

        # 1. Candidate Entity Extraction from Capitalized Noun Phrases & Acronyms
        for sentence in sentences:
            sentence_clean = sentence.strip()
            if not sentence_clean:
                continue

            # Find capitalized multi-word phrases (e.g. "Computer Science Department", "Artificial Intelligence")
            cap_phrases = re.findall(r"\b[A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)*\b", sentence_clean)
            # Find uppercase acronyms of 2-6 chars (e.g. "AI", "NLP", "API", "RAG")
            acronyms = re.findall(r"\b[A-Z]{2,6}\b", sentence_clean)

            detected_names = set(cap_phrases + acronyms)
            valid_names = []
            for n in detected_names:
                cleaned = clean_ent_name(n)
                if cleaned and cleaned.lower() not in stopwords and len(cleaned) > 1:
                    valid_names.append(cleaned)

            # Classify entity types heuristically
            for name in valid_names:
                etype = "Concept"
                lower = name.lower()
                if any(w in lower for w in ["department", "university", "institute", "organization", "corp", "lab"]):
                    etype = "Organization"
                elif any(w in lower for w in ["system", "algorithm", "model", "database", "api", "framework", "tool", "ai"]):
                    etype = "Technology"
                elif any(w in lower for w in ["policy", "guideline", "rule", "code", "regulation"]):
                    etype = "Policy"
                elif any(w in lower for w in ["course", "specialization", "program", "degree", "curriculum"]):
                    etype = "AcademicProgram"

                eid = generate_entity_id(name, etype)
                if eid not in entities_dict:
                    entities_dict[eid] = NodeModel(
                        id=eid,
                        canonical_name=name,
                        entity_type=etype,
                        description=f"{etype} mentioned in document context.",
                        document_ids=[document_id],
                        chunk_ids=[chunk_id],
                    )

            # 2. Extract Relationships via Verbal Patterns
            for pat, rel_type in verb_patterns:
                match = re.search(pat, sentence_clean, re.IGNORECASE)
                if match:
                    verb_start, verb_end = match.span()
                    left_part = sentence_clean[:verb_start]
                    right_part = sentence_clean[verb_end:]

                    # Find entity in left part and entity in right part
                    left_ents = [n for n in valid_names if n in left_part]
                    right_ents = [n for n in valid_names if n in right_part]

                    if left_ents and right_ents:
                        src_name = left_ents[-1]
                        tgt_name = right_ents[0]
                        src_id = generate_entity_id(src_name)
                        tgt_id = generate_entity_id(tgt_name)

                        # Ensure both exist in entities
                        if src_id not in entities_dict:
                            entities_dict[src_id] = NodeModel(
                                id=src_id, canonical_name=src_name, entity_type="Concept",
                                document_ids=[document_id], chunk_ids=[chunk_id],
                            )
                        if tgt_id not in entities_dict:
                            entities_dict[tgt_id] = NodeModel(
                                id=tgt_id, canonical_name=tgt_name, entity_type="Concept",
                                document_ids=[document_id], chunk_ids=[chunk_id],
                            )

                        rel_id = generate_relationship_id(src_id, tgt_id, rel_type, sentence_clean)
                        edge = EdgeModel(
                            id=rel_id,
                            source=src_id,
                            target=tgt_id,
                            relationship_type=rel_type,
                            evidence=sentence_clean,
                            confidence=0.85,
                            document_ids=[document_id],
                            chunk_ids=[chunk_id],
                        )
                        relationships.append(edge)

        # 3. Topic extraction: Identify main themes based on recurring high-salience terms
        words = re.findall(r"\b[a-zA-Z]{4,}\b", chunk_text.lower())
        filtered_words = [w for w in words if w not in stopwords]
        freq: Dict[str, int] = {}
        for w in filtered_words:
            freq[w] = freq.get(w, 0) + 1

        top_terms = sorted(freq.items(), key=lambda x: x[1], reverse=True)[:3]
        for term, count in top_terms:
            if count >= 2:
                topic_name = term.capitalize()
                tid = generate_topic_id(topic_name)
                topics_dict[tid] = TopicModel(
                    id=tid,
                    name=topic_name,
                    description=f"Theme around {topic_name}",
                    keywords=[term],
                    document_ids=[document_id],
                    representative_passages=[chunk_text[:300]],
                )

        return {
            "entities": list(entities_dict.values()),
            "relationships": relationships,
            "topics": list(topics_dict.values()),
        }


extraction_service = ExtractionService()
