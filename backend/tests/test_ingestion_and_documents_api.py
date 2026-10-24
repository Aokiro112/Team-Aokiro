"""Integration tests for Document Ingestion API, Background Pipeline, and Lifecycle.
"""
import pytest
from backend.app.schemas.jobs import JobStatus


def test_upload_and_process_text_document(client, sample_text_document):
    # 1. Upload TXT document
    with open(sample_text_document, "rb") as f:
        response = client.post(
            "/api/v1/documents",
            files={"file": ("academic_policy.txt", f, "text/plain")},
            data={"collection_id": "test-collection"},
        )

    assert response.status_code == 202
    data = response.json()
    assert "document" in data
    assert data["job_id"] is not None
    doc_id = data["document"]["id"]
    job_id = data["job_id"]

    # 2. Poll job status until complete (or verified running)
    job_resp = client.get(f"/api/v1/jobs/{job_id}")
    assert job_resp.status_code == 200
    job_data = job_resp.json()
    assert job_data["document_id"] == doc_id
    assert job_data["status"] in [JobStatus.PENDING.value, JobStatus.PROCESSING.value, JobStatus.COMPLETED.value]


def test_upload_and_process_pdf_document(client, sample_pdf_document):
    # Upload multi-page PDF
    with open(sample_pdf_document, "rb") as f:
        response = client.post(
            "/api/v1/documents",
            files={"file": ("sample_curriculum.pdf", f, "application/pdf")},
            data={"collection_id": "test-collection"},
        )

    assert response.status_code == 202
    data = response.json()
    assert data["document"]["id"] is not None


def test_duplicate_upload_detection(client, sample_text_document):
    with open(sample_text_document, "rb") as f:
        content = f.read()

    # Upload first time
    res1 = client.post(
        "/api/v1/documents",
        files={"file": ("academic_policy.txt", content, "text/plain")},
    )
    assert res1.status_code == 202

    # Upload second time (exact duplicate)
    res2 = client.post(
        "/api/v1/documents",
        files={"file": ("academic_policy.txt", content, "text/plain")},
    )
    assert res2.status_code == 202
    data2 = res2.json()
    assert data2["is_duplicate"] is True
    assert data2["job_id"] is None


def test_empty_file_upload_rejected(client):
    response = client.post(
        "/api/v1/documents",
        files={"file": ("empty.txt", b"", "text/plain")},
    )
    assert response.status_code == 400


def test_unsupported_extension_rejected(client):
    response = client.post(
        "/api/v1/documents",
        files={"file": ("malicious.exe", b"binarycontent", "application/octet-stream")},
    )
    assert response.status_code == 400


def test_document_listing_and_deletion(client, sample_text_document):
    with open(sample_text_document, "rb") as f:
        res = client.post(
            "/api/v1/documents",
            files={"file": ("to_delete.txt", f.read() + b"\nUnique salt", "text/plain")},
        )
    doc_id = res.json()["document"]["id"]

    # Verify listed
    list_resp = client.get("/api/v1/documents")
    assert list_resp.status_code == 200
    docs = list_resp.json()["items"]
    assert any(d["id"] == doc_id for d in docs)

    # Delete
    del_resp = client.delete(f"/api/v1/documents/{doc_id}")
    assert del_resp.status_code == 200

    # Verify 404 after deletion
    get_resp = client.get(f"/api/v1/documents/{doc_id}")
    assert get_resp.status_code == 404
