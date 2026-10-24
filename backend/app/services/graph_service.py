"""Knowledge graph service for NEXUS AI.
Provides node lookups, neighbor expansion, bounded multi-hop path search, and graph traversal.
"""
from typing import Any, Dict, List, Optional, Tuple
from backend.app.core.config import settings
from backend.app.core.exceptions import NodeNotFoundException
from backend.app.core.logging import logger
from backend.app.repositories.neo4j_repository import graph_repo
from backend.app.schemas.graph import (
    EdgeModel,
    GraphPath,
    GraphResponse,
    GraphSearchResponse,
    NeighborResponse,
    NodeDetailResponse,
    NodeModel,
    PathQueryResponse,
)


class GraphService:
    """Provides high-level graph querying and traversal capabilities."""

    def __init__(self):
        self.repo = graph_repo

    def get_graph(
        self,
        limit: int = 50,
        offset: int = 0,
        entity_type: Optional[str] = None,
        topic_id: Optional[str] = None,
    ) -> GraphResponse:
        """Fetch nodes and their connecting edges with pagination and filtering."""
        nodes, total_nodes = self.repo.get_nodes(limit, offset, entity_type, topic_id)
        node_ids = {n.id for n in nodes}

        # Filter edges between retrieved nodes
        edges: List[EdgeModel] = []
        for edge in self.repo.memory_engine.edge_records.values():
            if edge.source in node_ids and edge.target in node_ids:
                edges.append(edge)

        return GraphResponse(
            nodes=nodes,
            edges=edges,
            total_nodes=total_nodes,
            total_edges=len(self.repo.memory_engine.edge_records),
            limit=limit,
            offset=offset,
        )

    def get_node_detail(self, node_id: str) -> NodeDetailResponse:
        """Fetch full details for a node including neighbors, in/out edges, and topics."""
        node = self.repo.get_node_by_id(node_id)
        if not node:
            raise NodeNotFoundException(node_id)

        neighbors, edges = self.repo.get_neighbors(node_id, max_neighbors=settings.MAX_GRAPH_NEIGHBORS)

        in_edges = [e for e in edges if e.target == node_id]
        out_edges = [e for e in edges if e.source == node_id]

        # Gather associated topics
        topics = []
        for tid in node.topic_ids:
            top = self.repo.memory_engine.topic_nodes.get(tid)
            if top:
                topics.append({"id": top.id, "name": top.name, "description": top.description})

        # Gather source chunks
        chunks = []
        for cid in node.chunk_ids:
            chk = self.repo.memory_engine.chunk_nodes.get(cid)
            if chk:
                chunks.append(chk)

        return NodeDetailResponse(
            node=node,
            neighbors=neighbors,
            in_edges=in_edges,
            out_edges=out_edges,
            associated_topics=topics,
            source_chunks=chunks,
        )

    def get_neighbors(self, node_id: str, max_neighbors: int = 25) -> NeighborResponse:
        """Fetch immediate neighbors and connecting edges for a node."""
        node = self.repo.get_node_by_id(node_id)
        if not node:
            raise NodeNotFoundException(node_id)

        bounded_limit = min(max_neighbors, settings.MAX_GRAPH_NEIGHBORS)
        neighbors, edges = self.repo.get_neighbors(node_id, max_neighbors=bounded_limit)

        return NeighborResponse(
            center_node_id=node_id,
            neighbors=neighbors,
            edges=edges,
            total_neighbors=len(neighbors),
        )

    def find_paths(
        self,
        source_id: str,
        target_id: str,
        max_hops: int = 3,
        limit: int = 5,
    ) -> PathQueryResponse:
        """Find bounded simple paths between two entities."""
        bounded_hops = min(max_hops, settings.MAX_GRAPH_HOPS)
        bounded_limit = min(limit, settings.MAX_PATH_RESULTS)

        paths = self.repo.find_paths(
            source_id=source_id,
            target_id=target_id,
            max_hops=bounded_hops,
            limit=bounded_limit,
        )

        return PathQueryResponse(
            source_node_id=source_id,
            target_node_id=target_id,
            paths=paths,
            total_paths_found=len(paths),
        )

    def search(self, query: str, limit: int = 20) -> GraphSearchResponse:
        """Search entities by canonical name or description."""
        bounded_limit = min(limit, 50)
        nodes = self.repo.search_nodes(query, limit=bounded_limit)
        node_ids = {n.id for n in nodes}

        edges: List[EdgeModel] = []
        for edge in self.repo.memory_engine.edge_records.values():
            if edge.source in node_ids and edge.target in node_ids:
                edges.append(edge)

        return GraphSearchResponse(
            query=query,
            nodes=nodes,
            edges=edges,
            total_matches=len(nodes),
        )

    def get_edge_by_id(self, edge_id: str) -> Optional[EdgeModel]:
        return self.repo.get_edge_by_id(edge_id)


graph_service = GraphService()
