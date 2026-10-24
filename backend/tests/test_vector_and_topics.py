"""Unit tests for ChromaDB vector operations and Topic/Community discovery.
"""
import pytest
from backend.app.schemas.graph import EdgeModel, NodeModel
from backend.app.schemas.topics import TopicModel
from backend.app.services.topic_service import topic_service
from backend.app.services.vector_service import vector_service


@pytest.mark.asyncio
async def test_vector_indexing_and_search():
    coll = "test_collection"
    chunk_ids = ["chk_test_1", "chk_test_2"]
    docs = [
        "The Computer Science Department offers advanced artificial intelligence courses.",
        "The Medical School regulates clinical surgery residencies and healthcare.",
    ]
    metas = [
        {"document_id": "doc_cs", "page_number": 1},
        {"document_id": "doc_med", "page_number": 3},
    ]

    await vector_service.index_chunks(coll, chunk_ids, docs, metas)

    # Search for AI
    results = await vector_service.search("artificial intelligence", collection_id=coll, n_results=2)
    assert len(results) >= 1
    assert results[0]["chunk_id"] == "chk_test_1"
    assert results[0]["document_id"] == "doc_cs"

    # Search with document filter
    filtered = await vector_service.search(
        "courses", collection_id=coll, document_ids=["doc_med"], n_results=2
    )
    assert all(r["document_id"] == "doc_med" for r in filtered)


def test_topic_and_community_discovery():
    node1 = NodeModel(id="ent_t1", canonical_name="Machine Learning", entity_type="Technology")
    node2 = NodeModel(id="ent_t2", canonical_name="Deep Learning", entity_type="Technology")
    node3 = NodeModel(id="ent_t3", canonical_name="Neural Networks", entity_type="Technology")

    edge1 = EdgeModel(id="rel_t1", source="ent_t1", target="ent_t2", relationship_type="INCLUDES")
    edge2 = EdgeModel(id="rel_t2", source="ent_t2", target="ent_t3", relationship_type="UTILIZES")

    extracted_topic = TopicModel(
        id="top_ai",
        name="Artificial Intelligence",
        description="Theme on modern AI systems",
        keywords=["machine", "learning", "neural"],
        document_ids=["doc_1"],
        representative_passages=["Machine learning models are trained on datasets."],
    )

    chunks = [{"id": "chk_1", "text": "Deep learning and neural networks advance AI."}]

    topics = topic_service.discover_and_update_topics(
        entities=[node1, node2, node3],
        edges=[edge1, edge2],
        extracted_topics=[extracted_topic],
        chunks=chunks,
        document_id="doc_1",
    )

    assert len(topics) >= 1
    stored_topics, total = topic_service.get_topics(limit=10)
    assert total >= 1

    # Verify topic graph
    subgraph_nodes, subgraph_edges = topic_service.get_topic_graph(topics[0].id)
    assert isinstance(subgraph_nodes, list)
    assert isinstance(subgraph_edges, list)
