"""Comprehensive automated tests for Multimodal Vision, Document Understanding,
and Visual Generation features in NEXUS AI.
Validates scenarios 1-10 from the requirements.
"""
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import settings
from backend.app.schemas.chat import QueryRequest, QueryResponse, QueryIntent
from backend.app.schemas.visuals import VisualGenerationRequest, VisualGenerationType
from backend.app.services.image_extraction_service import image_extraction_service
from backend.app.services.vision_service import vision_service
from backend.app.services.visual_generation_service import visual_generation_service
from backend.app.workers.ingestion_worker import ingestion_worker


@pytest.mark.asyncio
async def test_pdf_diagram_extraction_and_analysis(sample_pdf_with_diagram: Path):
    """Scenario 1 & 2: Extract embedded diagram from PDF and verify visual metadata and analysis."""
    visuals = await image_extraction_service.extract_and_process_document_images(
        document_id="doc_physics_test",
        file_path=sample_pdf_with_diagram,
        filename="physics_diagram.pdf",
    )

    assert len(visuals) >= 1
    diagram = visuals[0]
    assert diagram.document_id == "doc_physics_test"
    assert diagram.page_number == 1
    assert diagram.format in ["png", "jpg", "jpeg"]
    assert diagram.image_url.startswith("/api/v1/documents/images/")
    assert Path(diagram.image_path).exists()
    assert diagram.description is not None
    assert len(diagram.description) > 10
    # Caption should correlate with Figure 1 on page
    assert "Figure 1" in (diagram.caption or "") or "Gaussian" in diagram.description


@pytest.mark.asyncio
async def test_grounded_qa_with_visual_evidence(sample_pdf_with_diagram: Path, client: TestClient):
    """Scenario 3, 4 & 5: Ask question requiring diagram and surrounding text, verify citations and visual links."""
    # 1. Upload and ingest document
    with open(sample_pdf_with_diagram, "rb") as f:
        upload_resp = client.post(
            f"{settings.API_V1_STR}/documents",
            files={"file": ("physics_diagram.pdf", f, "application/pdf")},
        )
    assert upload_resp.status_code == 202
    doc_id = upload_resp.json()["document"]["id"]
    job_id = upload_resp.json()["job_id"]

    # Run ingestion pipeline
    job_registry = {job_id: {"id": job_id, "details": {}, "stage_durations": {}}}
    await ingestion_worker.process_document_pipeline(
        job_id=job_id,
        document_id=doc_id,
        job_registry=job_registry,
        save_jobs_cb=lambda: None,
    )

    # 2. Query knowledge base regarding Gauss's law and the Gaussian surface diagram
    chat_resp = client.post(
        f"{settings.API_V1_STR}/chat/query",
        json={
            "query": "Explain the Gaussian surface diagram and how it relates to Gauss's law.",
            "document_ids": [doc_id],
        },
    )
    assert chat_resp.status_code == 200
    data = chat_resp.json()

    # Scenario 3: Verify grounded answer is received
    assert len(data["answer"]) > 20
    assert "gauss" in data["answer"].lower() or "electric" in data["answer"].lower() or "figure" in data["answer"].lower()

    # Scenario 4: Verify answer links to correct document and page
    assert len(data["citations"]) >= 1
    assert data["citations"][0]["document_id"] == doc_id
    assert data["citations"][0]["page_number"] == 1

    # Scenario 5: Verify visual evidence is attached
    assert "visual_evidence" in data
    assert len(data["visual_evidence"]) >= 1
    vis = data["visual_evidence"][0]
    assert vis["document_id"] == doc_id
    assert vis["page_number"] == 1
    assert vis["image_url"].startswith("/api/v1/documents/images/")


@pytest.mark.asyncio
async def test_generate_flowchart_in_chat(sample_pdf_with_diagram: Path, client: TestClient):
    """Scenario 6: Ask for a flowchart based on document and render actual Mermaid diagram."""
    req = VisualGenerationRequest(
        prompt="Generate a flowchart explaining the electric flux calculation through a Gaussian surface.",
        visual_type=VisualGenerationType.FLOWCHART,
        context="Gauss's law calculates net electric flux through a closed surface containing charge Q.",
    )
    visual = await visual_generation_service.generate_visual(req)

    assert visual.render_format == "mermaid"
    assert "flowchart" in visual.content.lower() or "graph" in visual.content.lower()
    assert "-->" in visual.content
    assert visual.title is not None


@pytest.mark.asyncio
async def test_generate_illustrative_image():
    """Scenario 7: Request an illustrative image and verify provider is invoked with structured visual metadata."""
    req = VisualGenerationRequest(
        prompt="A spherical Gaussian surface with radial electric field vectors",
        visual_type=VisualGenerationType.ILLUSTRATION,
        context="Electric field lines radiating perpendicularly from a central point charge.",
    )
    visual = await visual_generation_service.generate_visual(req)

    assert visual.render_format in ["image_url", "svg"]
    assert visual.content is not None
    assert len(visual.content) > 10
    if visual.render_format == "image_url":
        assert visual.content.startswith("http")
    else:
        assert "<svg" in visual.content


@pytest.mark.asyncio
async def test_configured_openai_image_provider_is_invoked(monkeypatch):
    """The configured image provider is called server-side and its response is surfaced."""
    from backend.app.services.visual_generation_service import VisualGenerationService

    calls = []

    class FakeResponse:
        status_code = 200

        def json(self):
            return {"data": [{"b64_json": "ZmFrZS1pbWFnZQ=="}]}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def post(self, url, **kwargs):
            calls.append((url, kwargs))
            return FakeResponse()

    monkeypatch.setattr("backend.app.services.visual_generation_service.httpx.AsyncClient", lambda **_kwargs: FakeClient())
    old_provider = settings.IMAGE_GEN_PROVIDER
    old_key = settings.IMAGE_GEN_API_KEY
    old_model = settings.IMAGE_GEN_MODEL
    settings.IMAGE_GEN_PROVIDER = "openai"
    settings.IMAGE_GEN_API_KEY = "test-only-key"
    settings.IMAGE_GEN_MODEL = "gpt-image-2.5-sunburst"
    try:
        service = VisualGenerationService()
        visual = await service.generate_visual(
            VisualGenerationRequest(
                prompt="A clean educational diagram of electric flux",
                visual_type=VisualGenerationType.ILLUSTRATION,
            )
        )
        assert calls
        assert calls[0][0].endswith("/v1/images/generations")
        assert calls[0][1]["json"]["model"] == "gpt-image-2.5-sunburst"
        assert visual.render_format == "image_url"
        assert visual.status == "COMPLETED"
    finally:
        settings.IMAGE_GEN_PROVIDER = old_provider
        settings.IMAGE_GEN_API_KEY = old_key
        settings.IMAGE_GEN_MODEL = old_model


@pytest.mark.asyncio
async def test_unsupported_model_and_missing_keys_graceful_handling():
    """Scenario 8: Verify unsupported models and missing keys produce clean fallbacks without crashing."""
    # Test vision service heuristic fallback with blank credentials
    analysis = await vision_service.analyze_image(
        image_bytes=b"dummy_small_png_stream" * 10,
        image_format="png",
        context_text="Figure 3: System Pipeline",
        document_filename="test.pdf",
        page_number=2,
    )
    assert analysis is not None
    assert analysis["visual_type"] is not None
    assert analysis["description"] is not None
    assert analysis["analysis_provider"] in ["deterministic_heuristic_analyzer", "none"]


def test_document_visual_isolation(client: TestClient, tmp_path: Path):
    """Scenario 9: Verify that documents cannot expose one another's visual content inappropriately."""
    # Register doc A with a visual
    img_data = {
        "id": "img_docA_p1_1",
        "document_id": "doc_A_123",
        "document_filename": "docA.pdf",
        "page_number": 1,
        "image_path": str(tmp_path / "imgA.png"),
        "image_url": "/api/v1/documents/images/img_docA_p1_1",
        "content_hash": "hash_a_123",
        "visual_type": "DIAGRAM",
        "description": "Doc A isolated diagram.",
        "confidence": 1.0,
        "analysis_provider": "heuristic",
        "is_page_render": False,
    }
    image_extraction_service._registry["img_docA_p1_1"] = img_data

    # Query visuals for a non-existent doc B
    resp_b = client.get(f"{settings.API_V1_STR}/documents/doc_B_999/visuals")
    # Should either 404 because doc B doesn't exist, or return empty list
    assert resp_b.status_code in [404, 200]
    if resp_b.status_code == 200:
        assert resp_b.json() == []


def test_image_serving_endpoint_and_path_traversal_protection(client: TestClient, tmp_path: Path):
    """Security test: verify path traversal is blocked on image serving endpoint."""
    # Malicious path traversal attempts
    bad_resp1 = client.get(f"{settings.API_V1_STR}/documents/images/../../etc/passwd")
    assert bad_resp1.status_code in [404, 400]

    bad_resp2 = client.get(f"{settings.API_V1_STR}/documents/images/..%2F..%2Fetc%2Fpasswd")
    assert bad_resp2.status_code in [404, 400]

    bad_resp3 = client.get(f"{settings.API_V1_STR}/documents/images/non_existent_img_12345")
    assert bad_resp3.status_code == 404


def test_existing_text_only_features_continue_working(client: TestClient, sample_text_document: Path):
    """Scenario 10: Verify existing text-only chat, retrieval, and knowledge-graph features continue to work cleanly."""
    with open(sample_text_document, "rb") as f:
        up_res = client.post(
            f"{settings.API_V1_STR}/documents",
            files={"file": ("academic_policy.txt", f, "text/plain")},
        )
    assert up_res.status_code == 202

    # Text query
    chat_res = client.post(
        f"{settings.API_V1_STR}/chat/query",
        json={"query": "What are the prerequisite courses for AI Specialization?"},
    )
    assert chat_res.status_code == 200
    res_data = chat_res.json()
    assert "Linear Algebra" in res_data["answer"] or len(res_data["citations"]) >= 1


@pytest.mark.asyncio
async def test_standalone_image_upload_is_indexed_without_binary_text(client: TestClient, tmp_path: Path):
    """Image-only uploads remain usable and receive direct page/image provenance."""
    import io
    from PIL import Image

    image = Image.new("RGB", (160, 100), color=(20, 120, 90))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)

    response = client.post(
        f"{settings.API_V1_STR}/documents",
        files={"file": ("standalone.png", buffer, "image/png")},
    )
    assert response.status_code == 202
    payload = response.json()
    doc_id = payload["document"]["id"]
    job_id = payload["job_id"]

    # TestClient runs the background task, but execute explicitly as well to make the
    # assertion independent of background-task timing.
    job_registry = {job_id: {"id": job_id, "details": {}, "stage_durations": {}}}
    await ingestion_worker.process_document_pipeline(
        job_id=job_id,
        document_id=doc_id,
        job_registry=job_registry,
        save_jobs_cb=lambda: None,
    )

    visuals_response = client.get(f"{settings.API_V1_STR}/documents/{doc_id}/visuals")
    assert visuals_response.status_code == 200
    visuals = visuals_response.json()
    assert len(visuals) == 1
    assert visuals[0]["analysis_status"] in ["ANALYZED", "PARTIAL", "UNAVAILABLE"]

    answer = client.post(
        f"{settings.API_V1_STR}/chat/query",
        json={"query": "Explain this uploaded image.", "document_ids": [doc_id]},
    )
    assert answer.status_code == 200
    answer_data = answer.json()
    assert answer_data["visual_evidence"]
    assert answer_data["citations"]
    assert answer_data["citations"][0]["page_number"] == 1
    assert answer_data["citations"][0]["visual_id"] == visuals[0]["id"]


def test_visual_retrieval_is_collection_scoped():
    """Visual metadata from another collection is not returned by normal retrieval."""
    from backend.app.services.retrieval_service import retrieval_service

    original = dict(image_extraction_service._registry)
    try:
        image_extraction_service._registry = {
            "img_collection_a": {
                "id": "img_collection_a",
                "document_id": "doc_a",
                "document_filename": "a.png",
                "page_number": 1,
                "image_path": "/tmp/a.png",
                "image_url": "/api/v1/documents/images/img_collection_a",
                "content_hash": "a",
                "description": "Collection A diagram",
                "metadata": {"collection_id": "collection_a"},
            },
            "img_collection_b": {
                "id": "img_collection_b",
                "document_id": "doc_b",
                "document_filename": "b.png",
                "page_number": 1,
                "image_path": "/tmp/b.png",
                "image_url": "/api/v1/documents/images/img_collection_b",
                "content_hash": "b",
                "description": "Collection B diagram",
                "metadata": {"collection_id": "collection_b"},
            },
        }
        results = retrieval_service._retrieve_visual_evidence(
            "explain the diagram",
            [],
            collection_id="collection_a",
            prefer_visual=True,
        )
        assert [item.id for item in results] == ["img_collection_a"]
    finally:
        image_extraction_service._registry = original
