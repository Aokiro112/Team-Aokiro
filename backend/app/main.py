"""NEXUS AI — Interactive Knowledge Base: Topic-Augmented Knowledge Graph Backend.
FastAPI application entrypoint.
"""
from contextlib import asynccontextmanager
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from backend.app.api.routes.chat import router as chat_router
from backend.app.api.routes.documents import router as documents_router
from backend.app.api.routes.graph import router as graph_router
from backend.app.api.routes.health import router as health_router
from backend.app.api.routes.jobs import router as jobs_router
from backend.app.api.routes.models import router as models_router
from backend.app.api.routes.topics import router as topics_router
from backend.app.core.config import settings
from backend.app.core.exceptions import NexusException, nexus_exception_handler
from backend.app.core.logging import logger
from backend.app.repositories.neo4j_repository import graph_repo
from backend.app.utils.identifiers import generate_request_id


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION} [{settings.ENVIRONMENT}]")
    settings.ensure_directories()
    # Eagerly initialize graph driver
    graph_repo.get_driver()

    yield

    logger.info("Shutting down NEXUS AI Backend. Closing database drivers.")
    graph_repo.close()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=(
        "NEXUS AI transforms unstructured documents into a searchable, connected, "
        "evidence-grounded knowledge base with topic communities, hybrid graph retrieval, "
        "and explainable graph paths."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# 1. CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 2. Request ID & Timing Middleware
@app.middleware("http")
async def add_request_context_and_timing(request: Request, call_next):
    req_id = request.headers.get("X-Request-ID", generate_request_id())
    request.state.request_id = req_id
    start_time = time.time()

    response = await call_next(request)

    process_time = time.time() - start_time
    response.headers["X-Request-ID"] = req_id
    response.headers["X-Process-Time"] = f"{process_time:.4f}s"
    return response


# 3. Custom Exception Handlers
app.add_exception_handler(NexusException, nexus_exception_handler)


# 4. Mount Routes
# Health (Root & Versioned)
app.include_router(health_router)
app.include_router(health_router, prefix=settings.API_V1_STR)

# Business APIs under /api/v1
app.include_router(documents_router, prefix=settings.API_V1_STR)
app.include_router(jobs_router, prefix=settings.API_V1_STR)
app.include_router(chat_router, prefix=settings.API_V1_STR)
app.include_router(models_router, prefix=settings.API_V1_STR)
app.include_router(graph_router, prefix=settings.API_V1_STR)
app.include_router(topics_router, prefix=settings.API_V1_STR)


@app.get("/", tags=["Root"])
def root_status():
    """Root info endpoint."""
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "health": "/health",
        "api_v1": settings.API_V1_STR,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
