"""Topic and community discovery service for NEXUS AI.
Extracts, consolidates, and clusters cross-document themes and graph communities.
"""
from typing import Any, Dict, List, Optional, Tuple
import networkx as nx
from networkx.algorithms import community
from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.repositories.neo4j_repository import graph_repo
from backend.app.schemas.graph import EdgeModel, NodeModel
from backend.app.schemas.topics import TopicModel
from backend.app.utils.identifiers import generate_topic_id, normalize_slug


class TopicService:
    """Manages cross-document topic discovery, community clustering, and provenance."""

    def __init__(self):
        self.repo = graph_repo

    def discover_and_update_topics(
        self,
        entities: List[NodeModel],
        edges: List[EdgeModel],
        extracted_topics: List[TopicModel],
        chunks: List[Dict[str, Any]],
        document_id: str,
    ) -> List[TopicModel]:
        """Consolidate topics, discover graph communities, and persist topic-entity links."""
        consolidated_topics: Dict[str, TopicModel] = {}

        # 1. Ingest extracted topics
        for top in extracted_topics:
            norm_id = generate_topic_id(top.name)
            if norm_id in consolidated_topics:
                existing = consolidated_topics[norm_id]
                existing.document_ids = list(set(existing.document_ids + top.document_ids))
                existing.representative_passages.extend(top.representative_passages)
                existing.representative_passages = existing.representative_passages[:3]
                existing.keywords = list(set(existing.keywords + top.keywords))
            else:
                top.id = norm_id
                consolidated_topics[norm_id] = top

        # 2. Graph Community Discovery (Louvain / Greedy Modularity / Connected Components)
        # Build subgraph of entities and edges
        subgraph = nx.Graph()
        for ent in entities:
            subgraph.add_node(ent.id, canonical_name=ent.canonical_name, type=ent.entity_type)
        for edge in edges:
            subgraph.add_edge(edge.source, edge.target)

        # Detect communities if graph has sufficient connected components
        if subgraph.number_of_nodes() >= 3 and subgraph.number_of_edges() >= 2:
            try:
                communities = community.greedy_modularity_communities(subgraph)
                for idx, comm in enumerate(communities):
                    if len(comm) < settings.TOPIC_MIN_CLUSTER_SIZE:
                        continue

                    # Pick top entities in community by degree
                    comm_nodes = [n for n in comm if n in self.repo.memory_engine.entity_nodes or any(e.id == n for e in entities)]
                    if not comm_nodes:
                        continue

                    # Find representative entity name for community topic
                    node_objs = [self.repo.get_node_by_id(nid) or next((e for e in entities if e.id == nid), None) for nid in comm_nodes]
                    node_objs = [n for n in node_objs if n is not None]

                    if not node_objs:
                        continue

                    sorted_nodes = sorted(node_objs, key=lambda n: n.degree, reverse=True)
                    top_node = sorted_nodes[0]
                    cname = top_node.canonical_name
                    if cname.startswith("ent_") or cname.startswith("top_"):
                        parts = cname.split("_")
                        if len(parts) >= 2:
                            cname = parts[1].replace("-", " ").title()
                    community_name = f"{cname} Theme"
                    comm_topic_id = generate_topic_id(community_name)

                    # Gather representative chunk passages
                    passages = []
                    comm_chunk_ids = set()
                    for n in node_objs:
                        comm_chunk_ids.update(n.chunk_ids)

                    for chk in chunks:
                        if chk.get("id") in comm_chunk_ids or chk.get("chunk_id") in comm_chunk_ids:
                            passages.append(chk.get("text", "")[:250])
                            if len(passages) >= 2:
                                break

                    comm_topic = TopicModel(
                        id=comm_topic_id,
                        name=community_name,
                        description=f"Graph community centered around {top_node.canonical_name} and related concepts.",
                        keywords=[top_node.canonical_name.lower()] + [n.canonical_name.lower() for n in sorted_nodes[1:4]],
                        document_ids=[document_id],
                        entity_ids=[n.id for n in sorted_nodes],
                        entity_count=len(sorted_nodes),
                        representative_passages=passages,
                    )
                    consolidated_topics[comm_topic_id] = comm_topic

            except Exception as e:
                logger.warning(f"Community detection exception: {e}")

        # 3. Associate entities to topics based on keywords and name overlaps
        for topic_id, topic in consolidated_topics.items():
            is_syn_topic = topic.metadata.get("dataset_status") == "SYNTHETIC" or "synthetic" in topic.name.lower()
            for ent in entities:
                is_syn_ent = ent.metadata.get("dataset_status") == "SYNTHETIC" or "synthetic" in ent.canonical_name.lower()
                if is_syn_topic != is_syn_ent:
                    continue
                ent_name_lower = ent.canonical_name.lower()
                if any(kw in ent_name_lower or ent_name_lower in kw for kw in topic.keywords):
                    if ent.id not in topic.entity_ids:
                        topic.entity_ids.append(ent.id)
                    if topic.id not in ent.topic_ids:
                        ent.topic_ids.append(topic.id)

            topic.entity_count = len(topic.entity_ids)
            topic.document_count = len(topic.document_ids)

        # Sort and select top prominent topics (max 15) to keep graph meaningful and uncluttered
        sorted_topics = sorted(
            consolidated_topics.values(),
            key=lambda t: (t.entity_count, len(t.keywords), len(t.representative_passages)),
            reverse=True,
        )
        selected_topics = sorted_topics[:8]

        # Persist selected topics in graph repository
        for topic in selected_topics:
            self.repo.upsert_topic(topic)
            self.repo.link_topic_to_document(topic.id, document_id)
            for eid in topic.entity_ids:
                self.repo.link_topic_to_entity(topic.id, eid)

        logger.info(f"Discovered and updated {len(selected_topics)} topics for document {document_id}")
        return selected_topics

    def get_topics(self, limit: int = 50, offset: int = 0) -> Tuple[List[TopicModel], int]:
        all_topics = list(self.repo.memory_engine.topic_nodes.values())
        total = len(all_topics)
        paged = all_topics[offset : offset + limit]
        return paged, total

    def get_topic_by_id(self, topic_id: str) -> Optional[TopicModel]:
        return self.repo.memory_engine.topic_nodes.get(topic_id)

    def get_topic_graph(self, topic_id: str) -> Tuple[List[NodeModel], List[EdgeModel]]:
        return self.repo.get_topic_subgraph(topic_id)

    def get_topic_documents(self, topic_id: str) -> List[Dict[str, Any]]:
        topic = self.get_topic_by_id(topic_id)
        if not topic:
            return []

        docs = []
        for doc_id in topic.document_ids:
            doc_info = self.repo.memory_engine.document_nodes.get(doc_id)
            if doc_info:
                docs.append(doc_info)
            else:
                docs.append({"id": doc_id, "filename": "Document"})
        return docs


topic_service = TopicService()
