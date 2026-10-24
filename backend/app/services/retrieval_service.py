"""Hybrid retrieval service for NEXUS AI.
Combines semantic vector retrieval, knowledge graph traversal, and topic community discovery.
Preserves verifiable source chunk provenance and graph paths.
"""
import re
from typing import Any, Dict, List, Optional, Set, Tuple
from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.repositories.neo4j_repository import graph_repo
from backend.app.schemas.chat import QueryIntent, RetrievalStrategy
from backend.app.schemas.graph import EdgeModel, GraphPath, NodeModel
from backend.app.schemas.visuals import VisualEvidence
from backend.app.services.graph_service import graph_service
from backend.app.services.topic_service import topic_service
from backend.app.services.vector_service import vector_service


class RetrievalService:
    """Orchestrates hybrid graph, vector, and topic retrieval."""

    def __init__(self):
        self.vector_svc = vector_service
        self.graph_svc = graph_service
        self.topic_svc = topic_service
        self.repo = graph_repo

    async def execute_retrieval(
        self,
        query: str,
        intent: QueryIntent,
        strategy: RetrievalStrategy,
        collection_id: str = "default",
        document_ids: Optional[List[str]] = None,
        limit: int = 5,
    ) -> Dict[str, Any]:
        """Execute retrieval workflow based on strategy and intent."""
        trace = []
        warnings = []
        retrieved_chunks: List[Dict[str, Any]] = []
        related_entities: List[NodeModel] = []
        supporting_paths: List[GraphPath] = []

        if strategy == RetrievalStrategy.TOPIC_COMMUNITY or intent == QueryIntent.THEMATIC:
            trace.append("topic_retrieval")
            topic_chunks, entities = self._retrieve_topic_evidence(query)
            retrieved_chunks.extend(topic_chunks)
            related_entities.extend(entities)

            # Complement with vector search for comprehensive thematic context
            trace.append("vector_supplement")
            vector_chunks = await self.vector_svc.search(
                query=query,
                collection_id=collection_id,
                n_results=limit,
                document_ids=document_ids,
            )
            retrieved_chunks = self._merge_and_deduplicate_chunks(retrieved_chunks, vector_chunks)

        elif strategy == RetrievalStrategy.GRAPH_ONLY:
            trace.append("graph_retrieval")
            graph_chunks, entities, paths = self._retrieve_graph_evidence(query, limit)
            retrieved_chunks.extend(graph_chunks)
            related_entities.extend(entities)
            supporting_paths.extend(paths)

        elif strategy == RetrievalStrategy.VECTOR_ONLY:
            trace.append("vector_search")
            retrieved_chunks = await self.vector_svc.search(
                query=query,
                collection_id=collection_id,
                n_results=limit,
                document_ids=document_ids,
            )

        else:
            # HYBRID Retrieval (Default / Multi-Hop / Factual)
            trace.append("vector_search")
            vector_chunks = await self.vector_svc.search(
                query=query,
                collection_id=collection_id,
                n_results=limit,
                document_ids=document_ids,
            )

            trace.append("graph_expansion")
            graph_chunks, entities, paths = self._retrieve_graph_evidence(query, limit)

            related_entities.extend(entities)
            supporting_paths.extend(paths)

            # Reciprocal rank / score fusion
            retrieved_chunks = self._fuse_results(vector_chunks, graph_chunks)
            trace.append("evidence_fusion")

        # Fallback handling applies only when the selected route returned no evidence.
        if not retrieved_chunks:
            trace.append("fallback_to_vector_search")
            retrieved_chunks = await self.vector_svc.search(
                query=query,
                collection_id=collection_id,
                n_results=limit,
                document_ids=document_ids,
            )
        if not retrieved_chunks and not supporting_paths:
            warnings.append("Insufficient evidence found across vector and graph indices.")

        # Synthetic Record Quarantine: Filter synthetic fixtures from real-world answers unless explicitly queried
        q_lower_check = query.lower()
        asks_about_synthetic = any(w in q_lower_check for w in ["synthetic", "fixture", "northstar", "testland", "syn-", "example beverage group"])
        asks_about_benchmarks = any(w in q_lower_check for w in ["benchmark", "gold standard", "eval rubric", "test dataset question"])
        if not asks_about_synthetic:
            retrieved_chunks = [
                c for c in retrieved_chunks
                if "status=synthetic" not in (c.get("text") or "").lower()
                and "synthetic records for parser" not in (c.get("text") or "").lower()
                and (asks_about_benchmarks or not re.search(r"^(?:q:\s*|expected:\s*|gold-standard)", (c.get("text") or "").strip(), re.IGNORECASE))
            ]
            related_entities = [e for e in related_entities if e.metadata.get("dataset_status") != "SYNTHETIC" and "synthetic" not in e.canonical_name.lower()]
            supporting_paths = [
                p for p in supporting_paths
                if not any(e.metadata.get("dataset_status") == "SYNTHETIC" or "synthetic" in (e.relationship_type or "").lower() for e in p.edges)
                and "synthetic" not in p.description.lower()
            ]

        trace.append("evidence_validation")

        # Multimodal Visual Retrieval: Retrieve related visual assets
        visual_evidence = self._retrieve_visual_evidence(
            query,
            retrieved_chunks,
            document_ids,
            collection_id=collection_id,
            prefer_visual=intent == QueryIntent.VISUAL_GROUNDED,
        )
        if visual_evidence:
            trace.append(f"retrieved_{len(visual_evidence)}_visual_assets")

        return {
            "chunks": retrieved_chunks[:limit],
            "related_entities": related_entities[:10],
            "supporting_paths": supporting_paths[:settings.MAX_PATH_RESULTS],
            "visual_evidence": visual_evidence,
            "trace": trace,
            "warnings": warnings,
        }

    def _retrieve_visual_evidence(
        self,
        query: str,
        retrieved_chunks: List[Dict[str, Any]],
        document_ids: Optional[List[str]] = None,
        collection_id: str = "default",
        prefer_visual: bool = False,
        max_visuals: int = 4,
    ) -> List[VisualEvidence]:
        """Match and rank visual evidence relevant to the query and retrieved textual chunks."""
        q_lower = query.lower()
        try:
            from backend.app.services.image_extraction_service import image_extraction_service
            all_visuals = image_extraction_service.list_all_visuals(limit=200)
        except Exception:
            return []

        # Visual metadata is shared on disk, so collection scoping must always be
        # applied before optional document filtering, just like Chroma metadata.
        all_visuals = [
            v for v in all_visuals
            if (v.metadata or {}).get("collection_id", "default") == collection_id
        ]
        if document_ids:
            all_visuals = [v for v in all_visuals if v.document_id in document_ids]

        matched: List[Tuple[float, VisualEvidence]] = []
        seen_ids = set()

        retrieved_pages = {(c.get("document_id"), c.get("page_number")) for c in retrieved_chunks if c.get("page_number")}
        chunk_visual_ids = {
            c.get("metadata", {}).get("visual_id") or c.get("visual_id")
            for c in retrieved_chunks if c.get("is_visual") or c.get("metadata", {}).get("is_visual")
        }

        for v in all_visuals:
            if v.id in seen_ids:
                continue

            score = 0.0
            if v.id in chunk_visual_ids:
                score += 5.0
            if (v.document_id, v.page_number) in retrieved_pages:
                score += 3.0

            search_corpus = f"{v.title or ''} {v.caption or ''} {v.description or ''} {' '.join(v.detected_labels)}".lower()
            q_terms = [t for t in re.findall(r"\w{3,}", q_lower) if t not in ["what", "this", "that", "from", "with", "show", "tell", "explain"]]
            term_matches = sum(1 for t in q_terms if t in search_corpus)

            if term_matches > 0:
                score += term_matches * 1.5

            # If user explicitly asked for diagram/chart on a specific page
            page_mention = re.search(r"\bpage\s*(\d+)\b", q_lower)
            if page_mention and int(page_mention.group(1)) == v.page_number:
                score += 4.0

            if score == 0 and prefer_visual:
                # An image-only upload has no text page/chunk to seed retrieval. Explicit
                # visual intent lets the scoped visual index provide the evidence directly.
                score = 1.0

            if score > 0:
                seen_ids.add(v.id)
                matched.append((score, v))

        matched.sort(key=lambda x: x[0], reverse=True)
        return [item[1] for item in matched[:max_visuals]]

    def _retrieve_graph_evidence(
        self,
        query: str,
        limit: int,
    ) -> Tuple[List[Dict[str, Any]], List[NodeModel], List[GraphPath]]:
        """Identify entities mentioned in query, traverse neighbors, and find multi-hop paths."""
        q_lower = query.lower()
        matched_nodes: List[NodeModel] = []
        for node in self.repo.memory_engine.entity_nodes.values():
            name_lower = node.canonical_name.lower()
            # Match if canonical name appears in query, or query appears in name
            if name_lower in q_lower or (len(name_lower) > 3 and name_lower in q_lower):
                matched_nodes.append(node)
            elif len(name_lower) > 3:
                # Check for significant multi-word token overlap
                words = [w for w in name_lower.split() if len(w) > 3]
                if words and all(w in q_lower for w in words):
                    matched_nodes.append(node)

        # Fallback to general search if no exact entity substring matched
        if not matched_nodes:
            matched_nodes = self.graph_svc.search(query, limit=5).nodes

        if not matched_nodes:
            return [], [], []

        entities_found: Dict[str, NodeModel] = {n.id: n for n in matched_nodes}
        paths_found: List[GraphPath] = []
        chunk_ids_to_fetch: Set[str] = set()

        # If two or more entities found in query, discover paths between them
        if len(matched_nodes) >= 2:
            for i in range(len(matched_nodes)):
                for j in range(i + 1, min(len(matched_nodes), 5)):
                    src, tgt = matched_nodes[i].id, matched_nodes[j].id
                    res = self.graph_svc.find_paths(src, tgt, max_hops=settings.MAX_GRAPH_HOPS, limit=2)
                    for path in res.paths:
                        paths_found.append(path)
                        chunk_ids_to_fetch.update(path.evidence_chunks)
                        for node in path.nodes:
                            entities_found[node.id] = node

                    # Try reverse direction if no direct forward path
                    if not res.paths:
                        res_rev = self.graph_svc.find_paths(tgt, src, max_hops=settings.MAX_GRAPH_HOPS, limit=2)
                        for path in res_rev.paths:
                            paths_found.append(path)
                            chunk_ids_to_fetch.update(path.evidence_chunks)
                            for node in path.nodes:
                                entities_found[node.id] = node

        # Expand neighbors for top matched nodes
        for node in matched_nodes[:2]:
            neighbor_res = self.graph_svc.get_neighbors(node.id, max_neighbors=5)
            for neighbor in neighbor_res.neighbors:
                entities_found[neighbor.id] = neighbor
            for edge in neighbor_res.edges:
                chunk_ids_to_fetch.update(edge.chunk_ids)

        # Retrieve chunk text for graph evidence
        graph_chunks: List[Dict[str, Any]] = []
        for cid in chunk_ids_to_fetch:
            chunk_node = self.repo.memory_engine.chunk_nodes.get(cid)
            if chunk_node:
                graph_chunks.append({
                    "chunk_id": cid,
                    "text": chunk_node.get("text", ""),
                    "document_id": chunk_node.get("document_id", ""),
                    "page_number": chunk_node.get("page_number", 1),
                    "score": 0.9,
                    "metadata": {"source": "knowledge_graph"},
                })

        return graph_chunks, list(entities_found.values()), paths_found

    def _retrieve_topic_evidence(
        self,
        query: str,
    ) -> Tuple[List[Dict[str, Any]], List[NodeModel]]:
        """Find matching topics and retrieve representative passages and entities."""
        q_lower = query.lower()
        matched_topics = []
        import re as _re
        query_words = set(_re.findall(r'\b[a-z]{4,}\b', q_lower)) - {
            'what', 'where', 'when', 'which', 'does', 'this', 'that', 'with',
            'from', 'have', 'about', 'there', 'across', 'main', 'most', 'your',
            'their', 'these', 'those', 'some', 'very', 'just', 'also', 'then'
        }
        for topic in self.repo.memory_engine.topic_nodes.values():
            topic_words = set(_re.findall(r'\b[a-z]{4,}\b', topic.name.lower()))
            keyword_match = any(kw in q_lower for kw in topic.keywords)
            word_overlap = bool(topic_words & query_words)
            if keyword_match or word_overlap or topic.name.lower() in q_lower:
                matched_topics.append(topic)

        if not matched_topics:
            matched_topics = sorted(
                self.repo.memory_engine.topic_nodes.values(),
                key=lambda t: t.entity_count,
                reverse=True,
            )[:5]

        topic_chunks: List[Dict[str, Any]] = []
        entities: List[NodeModel] = []

        for top in matched_topics:
            for passage in top.representative_passages:
                # Fabricate or find chunk representation
                doc_id = top.document_ids[0] if top.document_ids else "doc_topic"
                topic_chunks.append({
                    "chunk_id": f"chk_{top.id[:12]}_top",
                    "text": passage,
                    "document_id": doc_id,
                    "page_number": 1,
                    "score": 0.85,
                    "metadata": {"topic": top.name, "source": "topic_community"},
                })
            for eid in top.entity_ids[:5]:
                ent = self.repo.get_node_by_id(eid)
                if ent:
                    entities.append(ent)

        return topic_chunks, entities

    def _fuse_results(
        self,
        vector_chunks: List[Dict[str, Any]],
        graph_chunks: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Fuse vector and graph evidence using score-weighted deduplication."""
        fused: Dict[str, Dict[str, Any]] = {}

        # Vector chunks (weight 0.5)
        for rank, chunk in enumerate(vector_chunks):
            cid = chunk["chunk_id"]
            rrf_score = 0.5 * (1.0 / (60 + rank + 1)) + 0.5 * chunk.get("score", 0.5)
            fused[cid] = {**chunk, "fused_score": rrf_score}

        # Graph chunks (weight 0.6 boost for explicit graph provenance)
        for rank, chunk in enumerate(graph_chunks):
            cid = chunk["chunk_id"]
            graph_score = 0.6 * (1.0 / (60 + rank + 1)) + 0.5
            if cid in fused:
                fused[cid]["fused_score"] += graph_score
                fused[cid]["score"] = max(fused[cid].get("score", 0), 0.95)
            else:
                fused[cid] = {**chunk, "fused_score": graph_score}

        sorted_fused = sorted(fused.values(), key=lambda c: c.get("fused_score", 0.0), reverse=True)
        return sorted_fused

    def _merge_and_deduplicate_chunks(
        self,
        list_a: List[Dict[str, Any]],
        list_b: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        seen_ids = set()
        merged = []
        for chk in list_a + list_b:
            cid = chk.get("chunk_id")
            if cid and cid not in seen_ids:
                seen_ids.add(cid)
                merged.append(chk)
        return merged


retrieval_service = RetrievalService()
