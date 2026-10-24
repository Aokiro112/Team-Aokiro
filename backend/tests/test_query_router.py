"""Unit tests for the Intelligent Query Router.
"""
from backend.app.schemas.chat import QueryIntent, RetrievalStrategy
from backend.app.services.query_router import query_router


def test_route_thematic_query():
    query = "What are the main themes and recurring topics across these research documents?"
    intent, strategy, trace = query_router.route_query(query)

    assert intent == QueryIntent.THEMATIC
    assert strategy == RetrievalStrategy.TOPIC_COMMUNITY
    assert "query_classification" in trace
    assert "routed_to_topic_community" in trace


def test_route_multihop_query():
    query = "How is AI Specialization connected to Prerequisite Courses and the Robotics Lab?"
    intent, strategy, trace = query_router.route_query(query)

    assert intent == QueryIntent.MULTI_HOP
    assert strategy == RetrievalStrategy.HYBRID
    assert "routed_to_graph_multi_hop_hybrid" in trace


def test_route_document_specific_query():
    query = "What does the policy document state regarding attendance criteria?"
    intent, strategy, trace = query_router.route_query(query)

    assert intent == QueryIntent.DOCUMENT_SPECIFIC
    assert strategy == RetrievalStrategy.HYBRID

    # When explicit document_ids are provided
    intent2, strategy2, _ = query_router.route_query("Explain grading scale", document_ids=["doc_123"])
    assert intent2 == QueryIntent.DOCUMENT_SPECIFIC


def test_route_factual_query():
    query = "Which department offers the AI Specialization?"
    intent, strategy, trace = query_router.route_query(query)

    assert intent == QueryIntent.FACTUAL
    assert strategy == RetrievalStrategy.HYBRID


def test_route_unanswerable_query():
    query = "??? !!!"
    intent, strategy, _ = query_router.route_query(query)
    assert intent == QueryIntent.UNANSWERABLE


def test_strategy_override():
    query = "What is the policy?"
    intent, strategy, trace = query_router.route_query(
        query, strategy_override=RetrievalStrategy.VECTOR_ONLY
    )
    assert strategy == RetrievalStrategy.VECTOR_ONLY
    assert any("strategy_override_applied" in step for step in trace)
