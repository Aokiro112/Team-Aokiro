"""Integration tests for API contracts, schema validation, and error formats.
"""
from fastapi import status


def test_health_endpoints(client):
    # Liveness
    resp = client.get("/health")
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert data["status"] == "healthy"
    assert "version" in data

    # Versioned readiness
    ready_resp = client.get("/api/v1/health/ready")
    assert ready_resp.status_code == status.HTTP_200_OK
    ready_data = ready_resp.json()
    assert "dependencies" in ready_data
    assert "chroma_vector_store" in ready_data["dependencies"]
    assert "knowledge_graph" in ready_data["dependencies"]


def test_openapi_schema_available(client):
    resp = client.get("/openapi.json")
    assert resp.status_code == status.HTTP_200_OK
    schema = resp.json()
    assert schema["info"]["title"] == "NEXUS AI - Topic-Augmented Knowledge Graph Backend"
    assert "/api/v1/chat/query" in schema["paths"]
    assert "/api/v1/documents" in schema["paths"]
    assert "/api/v1/graph" in schema["paths"]
    assert "/api/v1/topics" in schema["paths"]


def test_invalid_document_id_returns_uniform_error(client):
    resp = client.get("/api/v1/documents/non_existent_doc_id_123")
    assert resp.status_code == status.HTTP_404_NOT_FOUND
    data = resp.json()
    assert "error" in data
    assert data["error"]["code"] == "DOCUMENT_NOT_FOUND"
    assert "request_id" in data


def test_invalid_job_id_returns_uniform_error(client):
    resp = client.get("/api/v1/jobs/non_existent_job_999")
    assert resp.status_code == status.HTTP_404_NOT_FOUND
    data = resp.json()
    assert "error" in data
    assert data["error"]["code"] == "JOB_NOT_FOUND"


def test_invalid_node_id_returns_uniform_error(client):
    resp = client.get("/api/v1/graph/nodes/non_existent_node_xyz")
    assert resp.status_code == status.HTTP_404_NOT_FOUND
    data = resp.json()
    assert "error" in data
    assert data["error"]["code"] == "NODE_NOT_FOUND"


def test_invalid_topic_id_returns_404(client):
    resp = client.get("/api/v1/topics/non_existent_topic_xyz")
    assert resp.status_code == status.HTTP_404_NOT_FOUND


def test_graph_endpoints_pagination_and_search(client):
    resp = client.get("/api/v1/graph?limit=10&offset=0")
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert "nodes" in data
    assert "edges" in data
    assert "total_nodes" in data
    assert "total_edges" in data

    search_resp = client.get("/api/v1/graph/search?q=Computer&limit=5")
    assert search_resp.status_code == status.HTTP_200_OK
    assert "total_matches" in search_resp.json()


def test_models_list_endpoint(client):
    resp = client.get("/api/v1/models")
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert "active_model" in data
    assert "models" in data
    assert len(data["models"]) >= 1
    # Check that rule_based is always available
    model_names = [m["name"] for m in data["models"]]
    assert "rule_based" in model_names

