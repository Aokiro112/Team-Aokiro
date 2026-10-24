"""Test configuration and fixtures for NEXUS AI backend test suite.
"""
import shutil
import tempfile
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
import pymupdf

# Set testing environment before importing app
import os
os.environ["ENVIRONMENT"] = "testing"

from backend.app.core.config import settings
from backend.app.main import app
from backend.app.repositories.neo4j_repository import graph_repo, InMemoryGraphEngine
from backend.app.repositories.chroma_repository import chroma_repo
from backend.app.services.document_service import document_service
from backend.app.services.ingestion_service import ingestion_service


@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    """Create isolated temporary storage for test execution."""
    temp_dir = tempfile.mkdtemp(prefix="nexus_test_")
    orig_upload = settings.UPLOAD_DIR
    orig_storage = settings.STORAGE_DIR
    orig_chroma = settings.CHROMA_PERSIST_DIRECTORY

    settings.UPLOAD_DIR = Path(temp_dir) / "uploads"
    settings.STORAGE_DIR = Path(temp_dir) / "storage"
    settings.CHROMA_PERSIST_DIRECTORY = str(Path(temp_dir) / "chroma")
    settings.ensure_directories()

    # Re-initialize service paths
    document_service.upload_dir = settings.UPLOAD_DIR
    document_service.metadata_file = settings.STORAGE_DIR / "documents.json"
    document_service._registry = {}
    ingestion_service.jobs_file = settings.STORAGE_DIR / "jobs.json"
    ingestion_service._jobs = {}
    chroma_repo.persist_directory = settings.CHROMA_PERSIST_DIRECTORY
    chroma_repo._client = None

    yield

    # Teardown
    shutil.rmtree(temp_dir, ignore_errors=True)
    settings.UPLOAD_DIR = orig_upload
    settings.STORAGE_DIR = orig_storage
    settings.CHROMA_PERSIST_DIRECTORY = orig_chroma


@pytest.fixture(autouse=True)
def reset_state_per_test():
    """Ensure clean in-memory registries for each test."""
    document_service._registry.clear()
    ingestion_service._jobs.clear()
    graph_repo.memory_engine = InMemoryGraphEngine()
    yield


@pytest.fixture
def client():
    """FastAPI test client."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def sample_text_document(tmp_path) -> Path:
    """Create a sample TXT document with structured domain content."""
    content = """# College of Computing Academic Policy

The Computer Science Department offers the AI Specialization for graduate students.
The AI Specialization requires Prerequisite Courses in Linear Algebra and Probability.
Students enrolled in the AI Specialization are eligible for Research Opportunities in the Robotics Lab.
The Robotics Lab is located in the Engineering Complex and was developed by Dr. Alan Turing.

## Attendance and Academic Integrity
Students must attend at least 80 percent of scheduled classes to be eligible for final examinations.
Academic dishonesty and plagiarism are strictly prohibited and governed by the University Conduct Code.
"""
    file_path = tmp_path / "academic_policy.txt"
    file_path.write_text(content, encoding="utf-8")
    return file_path


@pytest.fixture
def sample_pdf_document(tmp_path) -> Path:
    """Create a genuine multi-page PDF using PyMuPDF for realistic extraction testing."""
    pdf_path = tmp_path / "sample_curriculum.pdf"
    doc = pymupdf.open()

    # Page 1
    page1 = doc.new_page()
    page1.insert_text(
        (50, 72),
        "Faculty of Engineering Overview\n\n"
        "The Data Science Institute provides Advanced Analytics Training.\n"
        "Advanced Analytics Training requires Python Programming and Database Systems.\n"
        "The Institute collaborates with the Computer Science Department on Machine Learning initiatives.",
        fontsize=12,
    )

    # Page 2
    page2 = doc.new_page()
    page2.insert_text(
        (50, 72),
        "Ethics and AI Governance\n\n"
        "The Ethics Board regulates Autonomous Systems Research.\n"
        "Autonomous Systems Research is part of the Robotics Lab curriculum.\n"
        "All projects must be approved by the Ethics Board prior to public demonstration.",
        fontsize=12,
    )

    doc.save(pdf_path)
    doc.close()
    return pdf_path
