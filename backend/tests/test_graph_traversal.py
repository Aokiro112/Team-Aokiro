"""Unit tests for knowledge graph traversal, neighbor expansion, and bounded path discovery.
"""
from backend.app.schemas.graph import EdgeModel, NodeModel
from backend.app.services.graph_service import graph_service
from backend.app.repositories.neo4j_repository import graph_repo


def test_graph_node_and_edge_persistence():
    # Setup chain: A -> B -> C -> D
    node_a = NodeModel(id="ent_a", canonical_name="Department of CS", entity_type="Organization")
    node_b = NodeModel(id="ent_b", canonical_name="AI Specialization", entity_type="AcademicProgram")
    node_c = NodeModel(id="ent_c", canonical_name="Robotics Lab", entity_type="Facility")
    node_d = NodeModel(id="ent_d", canonical_name="Autonomous Drone Project", entity_type="Project")

    graph_repo.upsert_entity(node_a)
    graph_repo.upsert_entity(node_b)
    graph_repo.upsert_entity(node_c)
    graph_repo.upsert_entity(node_d)

    edge_ab = EdgeModel(
        id="rel_ab", source="ent_a", target="ent_b", relationship_type="OFFERS",
        evidence="Department offers specialization", chunk_ids=["chk_1"],
    )
    edge_bc = EdgeModel(
        id="rel_bc", source="ent_b", target="ent_c", relationship_type="COLLABORATES_WITH",
        evidence="Specialization collaborates with lab", chunk_ids=["chk_2"],
    )
    edge_cd = EdgeModel(
        id="rel_cd", source="ent_c", target="ent_d", relationship_type="CONDUCTS",
        evidence="Lab conducts drone project", chunk_ids=["chk_3"],
    )

    graph_repo.upsert_edge(edge_ab)
    graph_repo.upsert_edge(edge_bc)
    graph_repo.upsert_edge(edge_cd)

    # 1. Test Node Details
    detail = graph_service.get_node_detail("ent_b")
    assert detail.node.canonical_name == "AI Specialization"
    assert len(detail.neighbors) == 2
    assert len(detail.in_edges) == 1
    assert len(detail.out_edges) == 1

    # 2. Test Neighbor Expansion
    neighbors = graph_service.get_neighbors("ent_b", max_neighbors=5)
    assert neighbors.total_neighbors == 2
    neighbor_ids = {n.id for n in neighbors.neighbors}
    assert "ent_a" in neighbor_ids
    assert "ent_c" in neighbor_ids

    # 3. Test Bounded Path Discovery (A to D: 3 hops)
    path_res = graph_service.find_paths("ent_a", "ent_d", max_hops=3, limit=5)
    assert path_res.total_paths_found >= 1
    p = path_res.paths[0]
    assert p.length == 3
    assert [n.id for n in p.nodes] == ["ent_a", "ent_b", "ent_c", "ent_d"]
    assert "chk_1" in p.evidence_chunks
    assert "chk_2" in p.evidence_chunks
    assert "chk_3" in p.evidence_chunks

    # 4. Test Entity Search
    search_res = graph_service.search("Drone", limit=5)
    assert search_res.total_matches >= 1
    assert any(n.id == "ent_d" for n in search_res.nodes)
