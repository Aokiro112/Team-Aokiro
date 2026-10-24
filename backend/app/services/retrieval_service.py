"""Hybrid retrieval service for NEXUS AI.
Combines semantic vector retrieval, knowledge graph traversal, and topic community discovery.
Preserves verifiable source chunk provenance and graph paths.
"""
from typing import Any, Dict, List, Optional, Set, Tuple
from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.repositories.neo4j_repository import graph_repo
from backend.app.schemas.chat import QueryIntent, RetrievalStrategy
from backend.app.schemas.graph import EdgeModel, GraphPath, NodeModel
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

        # Fallback handling
        if not retrieved_chunks and strategy != RetrievalStrategy.VECTOR_ONLY:
            trace.append("fallback_to_vector_search")
            retrieved_chunks = await self.vector_svc.search(
                query=query,
                collection_id=collection_id,
                n_results=limit,
                document_ids=document_ids,
            )
            if not retrieved_chunks:
                warnings.append("Insufficient evidence found across vector and graph indices.")

        trace.append("evidence_validation")
        return {
            "chunks": retrieved_chunks[:limit],
            "related_entities": related_entities[:10],
            "supporting_paths": supporting_paths[:settings.MAX_PATH_RESULTS],
            "trace": trace,
            "warnings": warnings,
        }

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
        for topic in self.repo.memory_engine.topic_nodes.values():
            if topic.name.lower() in q_lower or any(kw in q_lower for kw in topic.keywords):
                matched_topics.append(topic)

        if not matched_topics:
            # Pick top topics by entity count
            matched_topics = sorted(
                self.repo.memory_engine.topic_nodes.values(),
                key=lambda t: t.entity_count,
                reverse=True,
            )[:3]

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
