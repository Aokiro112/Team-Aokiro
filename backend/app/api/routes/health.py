"""Health and Readiness endpoints for NEXUS AI backend.
"""
from datetime import datetime, timezone
from typing import Any, Dict
from fastapi import APIRouter, status
from backend.app.core.config import settings
from backend.app.repositories.chroma_repository import chroma_repo
from backend.app.repositories.neo4j_repository import graph_repo

router = APIRouter(tags=["Health"])


@router.get("/health", status_code=status.HTTP_200_OK)
def liveness_check() -> Dict[str, Any]:
    """Basic application liveness check."""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/health/ready", status_code=status.HTTP_200_OK)
def readiness_check() -> Dict[str, Any]:
    """Dependency readiness probe for ChromaDB, Knowledge Graph, and LLM configuration."""
    chroma_ok = chroma_repo.check_health()
    graph_health = graph_repo.check_health()

    is_ready = chroma_ok

    return {
        "ready": is_ready,
        "dependencies": {
            "chroma_vector_store": {
                "status": "connected" if chroma_ok else "unreachable",
                "healthy": chroma_ok,
                "persist_directory": settings.CHROMA_PERSIST_DIRECTORY,
            },
            "knowledge_graph": graph_health,
            "llm_configuration": {
                "provider": settings.LLM_PROVIDER,
                "model": settings.LLM_MODEL,
                "base_url": settings.LLM_BASE_URL,
            },
            "embedding_configuration": {
                "provider": settings.EMBEDDING_PROVIDER,
                "model": settings.EMBEDDING_MODEL,
            },
            "vision_configuration": {
                "provider": settings.VISION_PROVIDER,
                "model": settings.VISION_MODEL,
                "configured": settings.VISION_PROVIDER not in {"heuristic", "disabled"},
            },
            "visual_generation_configuration": {
                "provider": settings.IMAGE_GEN_PROVIDER,
                "model": settings.IMAGE_GEN_MODEL,
                "configured": settings.IMAGE_GEN_PROVIDER not in {"disabled", "svg_procedural"},
            },
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
