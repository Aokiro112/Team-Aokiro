"""Chat and Grounded Question-Answering API endpoints for NEXUS AI.
"""
from fastapi import APIRouter, Request, status
from backend.app.core.logging import logger
from backend.app.schemas.chat import QueryRequest, QueryResponse
from backend.app.services.answer_service import answer_service
from backend.app.services.document_service import document_service
from backend.app.services.query_router import query_router
from backend.app.services.retrieval_service import retrieval_service
from backend.app.utils.identifiers import generate_request_id

router = APIRouter(prefix="/chat", tags=["Chat & Grounded QA"])


@router.post(
    "/query",
    response_model=QueryResponse,
    status_code=status.HTTP_200_OK,
    summary="Ask a question grounded in knowledge graph and documents",
)
async def query_knowledge_base(
    request: QueryRequest,
    req: Request,
) -> QueryResponse:
    """Intelligently routes the query, executes hybrid graph + vector retrieval,
    and synthesizes a grounded answer with verifiable citations and graph paths.
    """
    request_id = getattr(req.state, "request_id", generate_request_id())

    # 1. Query Routing & Intent Classification
    intent, strategy, trace = query_router.route_query(
        query=request.query,
        document_ids=request.document_ids,
        strategy_override=request.retrieval_strategy_override,
    )

    # 2. Hybrid Retrieval Execution
    retrieval_data = await retrieval_service.execute_retrieval(
        query=request.query,
        intent=intent,
        strategy=strategy,
        collection_id=request.collection_id,
        document_ids=request.document_ids,
        limit=request.max_citations,
    )

    # Merge router trace with retrieval trace
    full_trace = trace + retrieval_data.get("trace", [])
    retrieval_data["trace"] = full_trace

    # 3. Grounded Answer Generation with Citations
    doc_registry = document_service.get_document_registry()
    response = await answer_service.generate_answer(
        request=request,
        intent=intent,
        strategy=strategy,
        retrieval_data=retrieval_data,
        document_registry=doc_registry,
        request_id=request_id,
    )

    return response
