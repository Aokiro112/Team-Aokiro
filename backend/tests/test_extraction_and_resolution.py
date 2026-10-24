"""Unit tests for entity extraction and conservative entity resolution.
"""
import pytest
from backend.app.schemas.graph import EdgeModel, NodeModel
from backend.app.services.entity_resolution_service import entity_resolution_service
from backend.app.services.extraction_service import extraction_service


@pytest.mark.asyncio
async def test_extraction_service_heuristic():
    text = (
        "The Computer Science Department offers the AI Specialization. "
        "The AI Specialization requires Prerequisite Courses in Linear Algebra. "
        "The Robotics Lab provides Research Opportunities."
    )
    result = await extraction_service.extract_from_chunk(
        chunk_text=text,
        chunk_id="chk_001",
        document_id="doc_001",
        page_number=1,
    )

    entities = result.get("entities", [])
    relationships = result.get("relationships", [])
    topics = result.get("topics", [])

    assert len(entities) >= 3
    assert any("Computer Science Department" in e.canonical_name for e in entities)
    assert any("AI Specialization" in e.canonical_name or "AI" in e.canonical_name for e in entities)

    assert len(relationships) >= 1
    for rel in relationships:
        assert rel.evidence != ""
        assert rel.document_ids == ["doc_001"]
        assert rel.chunk_ids == ["chk_001"]

    assert len(topics) >= 1


def test_conservative_entity_resolution_merges_slug_duplicates():
    node1 = NodeModel(
        id="ent_1",
        canonical_name="Computer Science Department",
        entity_type="Organization",
        document_ids=["doc_1"],
        chunk_ids=["chk_1"],
    )
    node2 = NodeModel(
        id="ent_2",
        canonical_name="computer science department",
        entity_type="Organization",
        document_ids=["doc_2"],
        chunk_ids=["chk_2"],
    )
    edge = EdgeModel(
        id="rel_1",
        source="ent_2",
        target="ent_target",
        relationship_type="OFFERS",
        document_ids=["doc_2"],
        chunk_ids=["chk_2"],
    )

    resolved_nodes, resolved_edges = entity_resolution_service.resolve_entities_and_edges(
        [node1, node2], [edge]
    )

    assert len(resolved_nodes) == 1
    canonical = resolved_nodes[0]
    assert set(canonical.document_ids) == {"doc_1", "doc_2"}
    assert set(canonical.chunk_ids) == {"chk_1", "chk_2"}

    assert len(resolved_edges) == 1
    assert resolved_edges[0].source == node1.id  # Remapped to canonical


def test_entity_resolution_prevents_incompatible_type_merges():
    # An Organization and a Person with overlapping name elements should not merge
    person_node = NodeModel(
        id="ent_p",
        canonical_name="Alan Turing",
        entity_type="Person",
        document_ids=["doc_1"],
    )
    institute_node = NodeModel(
        id="ent_i",
        canonical_name="The Alan Turing Institute",
        entity_type="Organization",
        document_ids=["doc_1"],
    )

    resolved_nodes, _ = entity_resolution_service.resolve_entities_and_edges(
        [person_node, institute_node], []
    )
    assert len(resolved_nodes) == 2  # Not merged
