"""Reproducible benchmarking and evaluation script for NEXUS AI.
Compares Vector-Only Retrieval vs Graph-Plus-Vector Hybrid Retrieval on a standardized evaluation dataset.
Measures latency, retrieval recall, citation correctness, path correctness, and unsupported-answer rate.
"""
import asyncio
import time
from typing import Any, Dict, List
from backend.app.schemas.chat import (
    EvidenceSufficiency,
    QueryIntent,
    QueryRequest,
    RetrievalStrategy,
)
from backend.app.services.answer_service import answer_service
from backend.app.services.document_service import document_service
from backend.app.services.query_router import query_router
from backend.app.services.retrieval_service import retrieval_service
from backend.app.workers.ingestion_worker import ingestion_worker

# Evaluation Corpus
EVALUATION_DOCUMENTS = [
    {
        "filename": "cs_department_handbook.txt",
        "content": (
            "The Computer Science Department offers the AI Specialization for graduate students.\n"
            "The AI Specialization requires Prerequisite Courses in Linear Algebra and Probability Theory.\n"
            "Students enrolled in the AI Specialization are eligible for Research Opportunities in the Robotics Lab.\n"
            "The Robotics Lab is directed by Professor Alan Turing and develops Autonomous Systems.\n"
            "Autonomous Systems are evaluated by the Ethics Board under Academic Guidelines.\n"
        ),
    },
    {
        "filename": "academic_regulations.txt",
        "content": (
            "Attendance Policy: All students must maintain a minimum of 80 percent classroom attendance.\n"
            "Failure to meet attendance requirements results in automatic disbarment from final semester exams.\n"
            "Academic Integrity: Plagiarism, unauthorized collaboration, and contract cheating are strictly prohibited.\n"
            "Violations are subject to disciplinary hearings conducted by the Student Conduct Committee.\n"
        ),
    },
]

# Standardized Test Dataset
EVALUATION_QUESTIONS = [
    {
        "id": "q1_factual",
        "query": "Which department offers the AI Specialization?",
        "expected_intent": QueryIntent.FACTUAL,
        "expected_entities": ["Computer Science Department", "AI Specialization"],
        "expected_doc": "cs_department_handbook.txt",
        "is_answerable": True,
    },
    {
        "id": "q2_factual",
        "query": "What percentage of attendance is mandatory for semester exams?",
        "expected_intent": QueryIntent.FACTUAL,
        "expected_entities": ["Attendance Policy"],
        "expected_doc": "academic_regulations.txt",
        "is_answerable": True,
    },
    {
        "id": "q3_multihop",
        "query": "How is the Computer Science Department connected to the Robotics Lab and Autonomous Systems?",
        "expected_intent": QueryIntent.MULTI_HOP,
        "expected_entities": ["Computer Science Department", "AI Specialization", "Robotics Lab", "Autonomous Systems"],
        "expected_doc": "cs_department_handbook.txt",
        "is_answerable": True,
    },
    {
        "id": "q4_thematic",
        "query": "What are the main themes across these academic documents?",
        "expected_intent": QueryIntent.THEMATIC,
        "expected_entities": [],
        "expected_doc": "",
        "is_answerable": True,
    },
    {
        "id": "q5_unanswerable",
        "query": "What are the quantum propulsion specifications for interstellar voyages?",
        "expected_intent": QueryIntent.UNANSWERABLE,
        "expected_entities": [],
        "expected_doc": "",
        "is_answerable": False,
    },
]


async def setup_benchmark_corpus() -> Dict[str, str]:
    """Ingest test documents."""
    doc_id_map = {}
    for doc in EVALUATION_DOCUMENTS:
        doc_resp, _, _ = document_service.register_uploaded_file(
            filename=doc["filename"],
            content=doc["content"].encode("utf-8"),
            content_type="text/plain",
            collection_id="benchmark",
            allow_duplicate=True,
        )
        job_registry = {
            "bench_job": {
                "id": "bench_job",
                "document_id": doc_resp.id,
                "status": "PROCESSING",
                "current_stage": "QUEUED",
                "progress_percent": 0.0,
                "stage_durations": {},
                "details": {},
            }
        }
        await ingestion_worker.process_document_pipeline(
            job_id="bench_job",
            document_id=doc_resp.id,
            job_registry=job_registry,
            save_jobs_cb=lambda: None,
        )
        doc_id_map[doc["filename"]] = doc_resp.id
    return doc_id_map


async def evaluate_strategy(
    strategy: RetrievalStrategy,
    doc_id_map: Dict[str, str],
) -> Dict[str, Any]:
    """Run benchmark questions against a specific retrieval strategy."""
    total_latency_ms = 0.0
    recall_hits = 0
    total_expected_entities = 0
    citation_correct = 0
    total_citations = 0
    path_hits = 0
    multihop_count = 0
    unsupported_answers = 0
    total_questions = len(EVALUATION_QUESTIONS)

    doc_registry = document_service.get_document_registry()

    for item in EVALUATION_QUESTIONS:
        query = item["query"]
        t0 = time.time()

        intent, _, trace = query_router.route_query(query, strategy_override=strategy)

        retrieval_data = await retrieval_service.execute_retrieval(
            query=query,
            intent=intent,
            strategy=strategy,
            collection_id="benchmark",
            limit=5,
        )

        response = await answer_service.generate_answer(
            request=QueryRequest(query=query, collection_id="benchmark"),
            intent=intent,
            strategy=strategy,
            retrieval_data=retrieval_data,
            document_registry=doc_registry,
        )

        elapsed_ms = (time.time() - t0) * 1000.0
        total_latency_ms += elapsed_ms

        # 1. Recall on expected entities
        retrieved_text = " ".join([c.get("text", "") for c in retrieval_data.get("chunks", [])])
        for ent in item["expected_entities"]:
            total_expected_entities += 1
            if ent.lower() in retrieved_text.lower():
                recall_hits += 1

        # 2. Citation correctness
        for cit in response.citations:
            total_citations += 1
            if cit.document_id in doc_id_map.values() and len(cit.excerpt) > 10:
                citation_correct += 1

        # 3. Graph Path correctness for multi-hop
        if item["expected_intent"] == QueryIntent.MULTI_HOP:
            multihop_count += 1
            if len(response.supporting_paths) > 0:
                path_hits += 1

        # 4. Unsupported answer check (on unanswerable query)
        if not item["is_answerable"]:
            if response.evidence_sufficiency == EvidenceSufficiency.INSUFFICIENT:
                unsupported_answers += 1

    avg_latency = round(total_latency_ms / total_questions, 2)
    entity_recall = round((recall_hits / total_expected_entities * 100) if total_expected_entities else 100.0, 1)
    citation_accuracy = round((citation_correct / total_citations * 100) if total_citations else 100.0, 1)
    path_recall = round((path_hits / multihop_count * 100) if multihop_count else 0.0, 1)
    unsupported_detection = round((unsupported_answers / 1.0 * 100), 1)

    return {
        "strategy": strategy.value,
        "avg_latency_ms": avg_latency,
        "entity_recall_pct": entity_recall,
        "citation_accuracy_pct": citation_accuracy,
        "path_recall_pct": path_recall,
        "unsupported_answer_detection_pct": unsupported_detection,
    }


async def run_benchmark():
    print("=" * 70)
    print("  NEXUS AI | Retrieval Benchmark & Empirical Evaluation")
    print("=" * 70)
    print("1. Ingesting standardized evaluation corpus...")
    doc_id_map = await setup_benchmark_corpus()
    print(f"   Indexed {len(doc_id_map)} documents.")

    print("\n2. Running Vector-Only Retrieval benchmark...")
    vec_results = await evaluate_strategy(RetrievalStrategy.VECTOR_ONLY, doc_id_map)

    print("3. Running Hybrid (Graph + Vector) Retrieval benchmark...")
    hybrid_results = await evaluate_strategy(RetrievalStrategy.HYBRID, doc_id_map)

    print("\n" + "=" * 70)
    print("  EMPIRICAL EVALUATION RESULTS")
    print("=" * 70)
    fmt = "{:<32} | {:<16} | {:<16}"
    print(fmt.format("Metric", "Vector-Only", "Hybrid (Graph+Vector)"))
    print("-" * 70)
    print(fmt.format("Average Latency (ms)", f"{vec_results['avg_latency_ms']} ms", f"{hybrid_results['avg_latency_ms']} ms"))
    print(fmt.format("Entity Recall (%)", f"{vec_results['entity_recall_pct']}%", f"{hybrid_results['entity_recall_pct']}%"))
    print(fmt.format("Citation Accuracy (%)", f"{vec_results['citation_accuracy_pct']}%", f"{hybrid_results['citation_accuracy_pct']}%"))
    print(fmt.format("Multi-Hop Path Recall (%)", f"{vec_results['path_recall_pct']}%", f"{hybrid_results['path_recall_pct']}%"))
    print(fmt.format("Uncertainty Detection (%)", f"{vec_results['unsupported_answer_detection_pct']}%", f"{hybrid_results['unsupported_answer_detection_pct']}%"))
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(run_benchmark())
