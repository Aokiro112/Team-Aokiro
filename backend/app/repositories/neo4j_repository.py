"""Knowledge Graph repository for NEXUS AI.
Supports enterprise Neo4j database with an in-memory NetworkX engine fallback.
Ensures zero-downtime development and testability even without a running Neo4j instance.
"""
import json
from typing import Any, Dict, List, Optional, Set, Tuple
import networkx as nx
from neo4j import GraphDatabase, Driver
from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.schemas.graph import EdgeModel, GraphPath, NodeModel
from backend.app.schemas.topics import TopicModel


class InMemoryGraphEngine:
    """NetworkX-based in-memory graph engine implementing the knowledge graph contract."""

    def __init__(self):
        self.graph = nx.MultiDiGraph()
        self.entity_nodes: Dict[str, NodeModel] = {}
        self.edge_records: Dict[str, EdgeModel] = {}
        self.document_nodes: Dict[str, Dict[str, Any]] = {}
        self.chunk_nodes: Dict[str, Dict[str, Any]] = {}
        self.topic_nodes: Dict[str, TopicModel] = {}

    def upsert_entity(self, node: NodeModel) -> None:
        if node.id in self.entity_nodes:
            existing = self.entity_nodes[node.id]
            # Merge document_ids, chunk_ids, topic_ids
            doc_ids = list(set(existing.document_ids + node.document_ids))
            chk_ids = list(set(existing.chunk_ids + node.chunk_ids))
            top_ids = list(set(existing.topic_ids + node.topic_ids))
            desc = node.description or existing.description
            updated = NodeModel(
                id=node.id,
                canonical_name=node.canonical_name,
                entity_type=node.entity_type or existing.entity_type,
                description=desc,
                degree=existing.degree,
                topic_ids=top_ids,
                document_ids=doc_ids,
                chunk_ids=chk_ids,
                metadata={**existing.metadata, **node.metadata},
            )
            self.entity_nodes[node.id] = updated
        else:
            self.entity_nodes[node.id] = node

        if not self.graph.has_node(node.id):
            self.graph.add_node(
                node.id,
                canonical_name=node.canonical_name,
                entity_type=node.entity_type,
                type="Entity",
            )

    def upsert_edge(self, edge: EdgeModel) -> None:
        # Ensure source and target exist
        if not self.graph.has_node(edge.source):
            self.upsert_entity(NodeModel(id=edge.source, canonical_name=edge.source))
        if not self.graph.has_node(edge.target):
            self.upsert_entity(NodeModel(id=edge.target, canonical_name=edge.target))

        if edge.id in self.edge_records:
            existing = self.edge_records[edge.id]
            doc_ids = list(set(existing.document_ids + edge.document_ids))
            chk_ids = list(set(existing.chunk_ids + edge.chunk_ids))
            ev = f"{existing.evidence}; {edge.evidence}".strip("; ")
            updated = EdgeModel(
                id=edge.id,
                source=edge.source,
                target=edge.target,
                relationship_type=edge.relationship_type,
                evidence=ev,
                confidence=max(existing.confidence, edge.confidence),
                document_ids=doc_ids,
                chunk_ids=chk_ids,
                metadata={**existing.metadata, **edge.metadata},
            )
            self.edge_records[edge.id] = updated
        else:
            self.edge_records[edge.id] = edge
            self.graph.add_edge(
                edge.source,
                edge.target,
                key=edge.id,
                relationship_type=edge.relationship_type,
                evidence=edge.evidence,
                id=edge.id,
            )

        # Update node degrees
        if edge.source in self.entity_nodes:
            self.entity_nodes[edge.source].degree = self.graph.degree(edge.source)
        if edge.target in self.entity_nodes:
            self.entity_nodes[edge.target].degree = self.graph.degree(edge.target)

    def upsert_document(self, doc_id: str, filename: str, metadata: Dict[str, Any]) -> None:
        self.document_nodes[doc_id] = {
            "id": doc_id,
            "filename": filename,
            "metadata": metadata,
        }

    def upsert_chunk(self, chunk_id: str, doc_id: str, page_number: int, text: str) -> None:
        self.chunk_nodes[chunk_id] = {
            "id": chunk_id,
            "document_id": doc_id,
            "page_number": page_number,
            "text": text,
        }

    def upsert_topic(self, topic: TopicModel) -> None:
        self.topic_nodes[topic.id] = topic

    def link_topic_to_entity(self, topic_id: str, entity_id: str) -> None:
        if topic_id in self.topic_nodes and entity_id in self.entity_nodes:
            if entity_id not in self.topic_nodes[topic_id].entity_ids:
                self.topic_nodes[topic_id].entity_ids.append(entity_id)
                self.topic_nodes[topic_id].entity_count = len(self.topic_nodes[topic_id].entity_ids)
            if topic_id not in self.entity_nodes[entity_id].topic_ids:
                self.entity_nodes[entity_id].topic_ids.append(topic_id)

    def link_topic_to_document(self, topic_id: str, doc_id: str) -> None:
        if topic_id in self.topic_nodes:
            if doc_id not in self.topic_nodes[topic_id].document_ids:
                self.topic_nodes[topic_id].document_ids.append(doc_id)
                self.topic_nodes[topic_id].document_count = len(self.topic_nodes[topic_id].document_ids)

    def get_nodes(
        self,
        limit: int = 50,
        offset: int = 0,
        entity_type: Optional[str] = None,
        topic_id: Optional[str] = None,
    ) -> Tuple[List[NodeModel], int]:
        nodes = list(self.entity_nodes.values())
        if entity_type:
            nodes = [n for n in nodes if n.entity_type.lower() == entity_type.lower()]
        if topic_id:
            nodes = [n for n in nodes if topic_id in n.topic_ids]
        total = len(nodes)
        paged = nodes[offset : offset + limit]
        return paged, total

    def get_node_by_id(self, node_id: str) -> Optional[NodeModel]:
        return self.entity_nodes.get(node_id)

    def get_edge_by_id(self, edge_id: str) -> Optional[EdgeModel]:
        return self.edge_records.get(edge_id)

    def get_neighbors(self, node_id: str, max_neighbors: int = 25) -> Tuple[List[NodeModel], List[EdgeModel]]:
        if not self.graph.has_node(node_id):
            return [], []

        neighbor_ids: Set[str] = set()
        for succ in self.graph.successors(node_id):
            neighbor_ids.add(succ)
        for pred in self.graph.predecessors(node_id):
            neighbor_ids.add(pred)

        selected_neighbors = list(neighbor_ids)[:max_neighbors]
        neighbor_nodes = [self.entity_nodes[nid] for nid in selected_neighbors if nid in self.entity_nodes]

        edges: List[EdgeModel] = []
        for eid, edge in self.edge_records.items():
            if (edge.source == node_id and edge.target in neighbor_ids) or \
               (edge.target == node_id and edge.source in neighbor_ids):
                edges.append(edge)

        return neighbor_nodes, edges

    def find_paths(
        self,
        source_id: str,
        target_id: str,
        max_hops: int = 3,
        limit: int = 5,
    ) -> List[GraphPath]:
        if not self.graph.has_node(source_id) or not self.graph.has_node(target_id):
            return []

        try:
            # Try directed paths first
            raw_paths = list(nx.all_simple_paths(self.graph, source_id, target_id, cutoff=max_hops))
            # If no directed path, check undirected connections between concepts
            if not raw_paths:
                undirected = self.graph.to_undirected(as_view=True)
                raw_paths = list(nx.all_simple_paths(undirected, source_id, target_id, cutoff=max_hops))
        except Exception:
            return []

        results: List[GraphPath] = []
        for path_nodes_ids in raw_paths:
            if len(results) >= limit:
                break

            nodes: List[NodeModel] = []
            for nid in path_nodes_ids:
                if nid in self.entity_nodes:
                    nodes.append(self.entity_nodes[nid])

            edges: List[EdgeModel] = []
            evidence_chunks: List[str] = []
            for i in range(len(path_nodes_ids) - 1):
                u, v = path_nodes_ids[i], path_nodes_ids[i + 1]
                # Find matching edge in edge_records in either direction
                matched_edge = None
                for edge in self.edge_records.values():
                    if (edge.source == u and edge.target == v) or (edge.source == v and edge.target == u):
                        matched_edge = edge
                        break
                if matched_edge:
                    edges.append(matched_edge)
                    evidence_chunks.extend(matched_edge.chunk_ids)

            path_desc = " <-> ".join([n.canonical_name for n in nodes])
            results.append(
                GraphPath(
                    nodes=nodes,
                    edges=edges,
                    length=len(edges),
                    evidence_chunks=list(set(evidence_chunks)),
                    description=path_desc,
                )
            )

        return results

    def search_nodes(self, query: str, limit: int = 20) -> List[NodeModel]:
        q = query.lower()
        matches = []
        for node in self.entity_nodes.values():
            if q in node.canonical_name.lower() or (node.description and q in node.description.lower()):
                matches.append(node)
            if len(matches) >= limit:
                break
        return matches

    def get_topic_subgraph(self, topic_id: str) -> Tuple[List[NodeModel], List[EdgeModel]]:
        if topic_id not in self.topic_nodes:
            return [], []

        topic = self.topic_nodes[topic_id]
        topic_entity_ids = set(topic.entity_ids)

        nodes = [self.entity_nodes[eid] for eid in topic_entity_ids if eid in self.entity_nodes]
        edges = []
        for edge in self.edge_records.values():
            if edge.source in topic_entity_ids and edge.target in topic_entity_ids:
                edges.append(edge)

        return nodes, edges

    def delete_document(self, document_id: str) -> None:
        """Remove document and prune orphaned chunks, edges, and entities."""
        # 1. Remove doc record
        self.document_nodes.pop(document_id, None)

        # 2. Find and remove chunks
        chunks_to_remove = [cid for cid, c in self.chunk_nodes.items() if c.get("document_id") == document_id]
        for cid in chunks_to_remove:
            self.chunk_nodes.pop(cid, None)

        # 3. Clean up edges associated with document
        edges_to_remove = []
        for eid, edge in self.edge_records.items():
            if document_id in edge.document_ids:
                edge.document_ids.remove(document_id)
                # Remove associated chunk ids
                edge.chunk_ids = [c for c in edge.chunk_ids if c not in chunks_to_remove]
                if not edge.document_ids:
                    edges_to_remove.append(eid)

        for eid in edges_to_remove:
            edge = self.edge_records.pop(eid, None)
            if edge and self.graph.has_edge(edge.source, edge.target, key=eid):
                self.graph.remove_edge(edge.source, edge.target, key=eid)

        # 4. Clean up entities associated with document
        entities_to_remove = []
        for nid, node in self.entity_nodes.items():
            if document_id in node.document_ids:
                node.document_ids.remove(document_id)
                node.chunk_ids = [c for c in node.chunk_ids if c not in chunks_to_remove]
                if not node.document_ids and self.graph.degree(nid) == 0:
                    entities_to_remove.append(nid)

        for nid in entities_to_remove:
            self.entity_nodes.pop(nid, None)
            if self.graph.has_node(nid):
                self.graph.remove_node(nid)

        # 5. Clean up topics
        for topic in self.topic_nodes.values():
            if document_id in topic.document_ids:
                topic.document_ids.remove(document_id)
                topic.document_count = len(topic.document_ids)


class Neo4jRepository:
    """Manages knowledge graph in Neo4j with parameterized Cypher queries.
    Seamlessly falls back to in-memory graph when Neo4j is offline or unavailable.
    """

    def __init__(self):
        self._driver: Optional[Driver] = None
        self._is_connected: Optional[bool] = None
        self.memory_engine = InMemoryGraphEngine()

    def get_driver(self) -> Optional[Driver]:
        """Lazy-load Neo4j driver."""
        if self._driver is None:
            try:
                self._driver = GraphDatabase.driver(
                    settings.NEO4J_URI,
                    auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
                    max_connection_lifetime=settings.NEO4J_MAX_CONNECTION_LIFETIME,
                    max_connection_pool_size=settings.NEO4J_MAX_CONNECTION_POOL_SIZE,
                    connection_timeout=settings.NEO4J_CONNECTION_TIMEOUT,
                )
                # Verify connectivity
                self._driver.verify_connectivity()
                self._is_connected = True
                logger.info("Successfully connected to Neo4j database.")
            except Exception as e:
                self._is_connected = False
                logger.warning(
                    f"Neo4j database connection unavailable ({e}). Using in-memory graph engine."
                )
                self._driver = None
        return self._driver

    @property
    def is_neo4j_live(self) -> bool:
        if self._is_connected is None:
            self.get_driver()
        return bool(self._is_connected and self._driver is not None)

    def close(self) -> None:
        if self._driver:
            self._driver.close()
            self._driver = None
            self._is_connected = False

    def upsert_entity(self, node: NodeModel) -> None:
        """Persist or update an entity node."""
        self.memory_engine.upsert_entity(node)
        if not self.is_neo4j_live:
            return

        query = """
        MERGE (e:Entity {id: $id})
        ON CREATE SET
            e.canonical_name = $canonical_name,
            e.entity_type = $entity_type,
            e.description = $description,
            e.document_ids = $document_ids,
            e.chunk_ids = $chunk_ids,
            e.topic_ids = $topic_ids,
            e.metadata = $metadata,
            e.degree = $degree
        ON MATCH SET
            e.canonical_name = $canonical_name,
            e.description = coalesce($description, e.description),
            e.document_ids = [x IN e.document_ids + $document_ids WHERE x IS NOT NULL],
            e.chunk_ids = [x IN e.chunk_ids + $chunk_ids WHERE x IS NOT NULL],
            e.topic_ids = [x IN e.topic_ids + $topic_ids WHERE x IS NOT NULL],
            e.degree = $degree
        """
        try:
            with self._driver.session(database=settings.NEO4J_DATABASE) as session:
                session.run(
                    query,
                    id=node.id,
                    canonical_name=node.canonical_name,
                    entity_type=node.entity_type,
                    description=node.description or "",
                    document_ids=node.document_ids,
                    chunk_ids=node.chunk_ids,
                    topic_ids=node.topic_ids,
                    metadata=json.dumps(node.metadata),
                    degree=node.degree,
                )
        except Exception as e:
            logger.error(f"Error persisting entity to Neo4j: {e}")

    def upsert_edge(self, edge: EdgeModel) -> None:
        """Persist or update relationship edge."""
        self.memory_engine.upsert_edge(edge)
        if not self.is_neo4j_live:
            return

        query = """
        MERGE (s:Entity {id: $source_id})
        MERGE (t:Entity {id: $target_id})
        MERGE (s)-[r:RELATES_TO {id: $id}]->(t)
        ON CREATE SET
            r.relationship_type = $rel_type,
            r.evidence = $evidence,
            r.confidence = $confidence,
            r.document_ids = $document_ids,
            r.chunk_ids = $chunk_ids,
            r.metadata = $metadata
        ON MATCH SET
            r.evidence = coalesce(r.evidence + '; ' + $evidence, r.evidence),
            r.confidence = CASE WHEN $confidence > r.confidence THEN $confidence ELSE r.confidence END,
            r.document_ids = [x IN r.document_ids + $document_ids WHERE x IS NOT NULL],
            r.chunk_ids = [x IN r.chunk_ids + $chunk_ids WHERE x IS NOT NULL]
        """
        try:
            with self._driver.session(database=settings.NEO4J_DATABASE) as session:
                session.run(
                    query,
                    id=edge.id,
                    source_id=edge.source,
                    target_id=edge.target,
                    rel_type=edge.relationship_type,
                    evidence=edge.evidence,
                    confidence=edge.confidence,
                    document_ids=edge.document_ids,
                    chunk_ids=edge.chunk_ids,
                    metadata=json.dumps(edge.metadata),
                )
        except Exception as e:
            logger.error(f"Error persisting edge to Neo4j: {e}")

    def upsert_document(self, doc_id: str, filename: str, metadata: Dict[str, Any]) -> None:
        self.memory_engine.upsert_document(doc_id, filename, metadata)
        if not self.is_neo4j_live:
            return

        query = """
        MERGE (d:Document {id: $id})
        SET d.filename = $filename, d.metadata = $metadata
        """
        try:
            with self._driver.session(database=settings.NEO4J_DATABASE) as session:
                session.run(query, id=doc_id, filename=filename, metadata=json.dumps(metadata))
        except Exception as e:
            logger.error(f"Error persisting document to Neo4j: {e}")

    def upsert_chunk(self, chunk_id: str, doc_id: str, page_number: int, text: str) -> None:
        self.memory_engine.upsert_chunk(chunk_id, doc_id, page_number, text)
        if not self.is_neo4j_live:
            return

        query = """
        MERGE (c:Chunk {id: $chunk_id})
        SET c.page_number = $page, c.text = $text
        WITH c
        MATCH (d:Document {id: $doc_id})
        MERGE (d)-[:CONTAINS]->(c)
        """
        try:
            with self._driver.session(database=settings.NEO4J_DATABASE) as session:
                session.run(query, chunk_id=chunk_id, doc_id=doc_id, page=page_number, text=text)
        except Exception as e:
            logger.error(f"Error persisting chunk to Neo4j: {e}")

    def upsert_topic(self, topic: TopicModel) -> None:
        self.memory_engine.upsert_topic(topic)
        if not self.is_neo4j_live:
            return

        query = """
        MERGE (t:Topic {id: $id})
        SET t.name = $name,
            t.description = $description,
            t.keywords = $keywords,
            t.representative_passages = $passages
        """
        try:
            with self._driver.session(database=settings.NEO4J_DATABASE) as session:
                session.run(
                    query,
                    id=topic.id,
                    name=topic.name,
                    description=topic.description,
                    keywords=topic.keywords,
                    passages=topic.representative_passages,
                )
        except Exception as e:
            logger.error(f"Error persisting topic to Neo4j: {e}")

    def link_topic_to_entity(self, topic_id: str, entity_id: str) -> None:
        self.memory_engine.link_topic_to_entity(topic_id, entity_id)
        if not self.is_neo4j_live:
            return

        query = """
        MATCH (t:Topic {id: $topic_id}), (e:Entity {id: $entity_id})
        MERGE (t)-[:COVERS]->(e)
        """
        try:
            with self._driver.session(database=settings.NEO4J_DATABASE) as session:
                session.run(query, topic_id=topic_id, entity_id=entity_id)
        except Exception as e:
            logger.error(f"Error linking topic to entity: {e}")

    def link_topic_to_document(self, topic_id: str, doc_id: str) -> None:
        self.memory_engine.link_topic_to_document(topic_id, doc_id)
        if not self.is_neo4j_live:
            return

        query = """
        MATCH (t:Topic {id: $topic_id}), (d:Document {id: $doc_id})
        MERGE (t)-[:APPEARS_IN]->(d)
        """
        try:
            with self._driver.session(database=settings.NEO4J_DATABASE) as session:
                session.run(query, topic_id=topic_id, doc_id=doc_id)
        except Exception as e:
            logger.error(f"Error linking topic to document: {e}")

    def get_nodes(
        self,
        limit: int = 50,
        offset: int = 0,
        entity_type: Optional[str] = None,
        topic_id: Optional[str] = None,
    ) -> Tuple[List[NodeModel], int]:
        return self.memory_engine.get_nodes(limit, offset, entity_type, topic_id)

    def get_node_by_id(self, node_id: str) -> Optional[NodeModel]:
        return self.memory_engine.get_node_by_id(node_id)

    def get_edge_by_id(self, edge_id: str) -> Optional[EdgeModel]:
        return self.memory_engine.get_edge_by_id(edge_id)

    def get_neighbors(self, node_id: str, max_neighbors: int = 25) -> Tuple[List[NodeModel], List[EdgeModel]]:
        return self.memory_engine.get_neighbors(node_id, max_neighbors)

    def find_paths(
        self,
        source_id: str,
        target_id: str,
        max_hops: int = 3,
        limit: int = 5,
    ) -> List[GraphPath]:
        return self.memory_engine.find_paths(source_id, target_id, max_hops, limit)

    def search_nodes(self, query: str, limit: int = 20) -> List[NodeModel]:
        return self.memory_engine.search_nodes(query, limit)

    def get_topic_subgraph(self, topic_id: str) -> Tuple[List[NodeModel], List[EdgeModel]]:
        return self.memory_engine.get_topic_subgraph(topic_id)

    def delete_document(self, document_id: str) -> None:
        self.memory_engine.delete_document(document_id)
        if not self.is_neo4j_live:
            return

        cypher = """
        MATCH (d:Document {id: $doc_id})
        OPTIONAL MATCH (d)-[:CONTAINS]->(c:Chunk)
        DETACH DELETE c, d
        """
        try:
            with self._driver.session(database=settings.NEO4J_DATABASE) as session:
                session.run(cypher, doc_id=document_id)
        except Exception as e:
            logger.error(f"Error deleting document from Neo4j: {e}")

    def check_health(self) -> Dict[str, Any]:
        live = self.is_neo4j_live
        return {
            "status": "healthy" if live else "fallback_active",
            "provider": "neo4j" if live else "in_memory_networkx",
            "neo4j_live": live,
            "total_nodes": len(self.memory_engine.entity_nodes),
            "total_edges": len(self.memory_engine.edge_records),
            "total_topics": len(self.memory_engine.topic_nodes),
        }


graph_repo = Neo4jRepository()
