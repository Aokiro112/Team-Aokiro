# NEXUS AI — Topic-Augmented Knowledge Graph Backend
> **Hypnexis Hackathon — Problem Statement AI-03**  
> *Interactive Knowledge Base: Topic-Augmented Knowledge Graph Builder*

NEXUS AI is an enterprise document intelligence and knowledge synthesis backend that transforms unstructured documents (PDFs, plain text) into a searchable, connected, evidence-grounded knowledge base.

It delivers topic community discovery, semantic vector retrieval (ChromaDB), knowledge graph traversal (Neo4j), intelligent query routing, and grounded question answering with provenance citations and explainable relationship paths.

---

## 1. System Architecture

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      FastAPI REST Layer (/api/v1)                      │
 │   Health  │  Documents  │  Ingestion Jobs  │  Chat  │  Graph  │ Topics │
 └──────┬────────────┬──────────────┬─────────────┬────────┬─────────┬────┘
        │            │              │             │        │         │
 ┌──────▼────────────▼──────────────┴─────────────┴────────┴─────────▼────┐
 │                              Service Layer                             │
 │  ┌──────────────────────────────────────────────────────────────────┐  │
 │  │ DocumentService: PyMuPDF Extraction, Validation, Stable Chunker │  │
 │  ├──────────────────────────────────────────────────────────────────┤  │
 │  │ IngestionWorker: 14-Stage Pipeline, Background Concurrency       │  │
 │  ├──────────────────────────────────────────────────────────────────┤  │
 │  │ ExtractionService: Entities, Relations, Topics (LLM + NLP Fallback│  │
 │  ├──────────────────────────────────────────────────────────────────┤  │
 │  │ EntityResolutionService: Conservative Deduplication & Remapping │  │
 │  ├──────────────────────────────────────────────────────────────────┤  │
 │  │ TopicService: Modularity Clustering & Topic-Graph Linking        │  │
 │  ├──────────────────────────────────────────────────────────────────┤  │
 │  │ QueryRouter: Intent Classification (Thematic/Factual/Multi-Hop) │  │
 │  ├──────────────────────────────────────────────────────────────────┤  │
 │  │ RetrievalService: Hybrid Reciprocal Rank Fusion (Vector + Graph) │  │
 │  ├──────────────────────────────────────────────────────────────────┤  │
 │  │ CitationService: Zero-Hallucination Exact Provenance Linking     │  │
 │  ├──────────────────────────────────────────────────────────────────┤  │
 │  │ AnswerService: Grounded Synthesis with Uncertainty Bounds        │  │
 │  └──────────────────────────────────────────────────────────────────┘  │
 └──────────────────────────────────┬─────────────────────────────────────┘
                                    │
 ┌──────────────────────────────────▼─────────────────────────────────────┐
 │                         Storage & Graph Engines                        │
 │  ┌─────────────────────────────┐     ┌──────────────────────────────┐  │
 │  │ ChromaDB (Vector Store)     │     │ Neo4j / In-Memory NetworkX   │  │
 │  │ Cosine Similarity HNSW      │     │ Parameterized Cypher Queries │  │
 │  │ Stable Chunk Provenance     │     │ Multi-Hop Path Traversals    │  │
 │  └─────────────────────────────┘     └──────────────────────────────┘  │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Fulfillment of AI-03 Requirements

| # | Official Deliverable | Implementation in NEXUS AI |
|---|----------------------|----------------------------|
| **1** | **Ingestion pipeline that extracts topics and relationship triples** | 14-stage asynchronous worker with PyMuPDF page-aware extraction, chunking with overlap, LLM/heuristic triple extraction (`extraction_service.py`), and conservative entity resolution (`entity_resolution_service.py`). |
| **2** | **Embedded knowledge graph alongside a vector database** | Persistent ChromaDB vector collection (`chroma_repository.py`) operating in tandem with Neo4j parameterized Cypher repository (`neo4j_repository.py`) and a built-in NetworkX in-memory fallback engine. |
| **3** | **Hybrid retrieval routing between topic communities and local graph relationships** | Modular `query_router.py` that classifies user intent into 5 discrete routing targets and `retrieval_service.py` performing Reciprocal Rank Fusion across semantic vector search and multi-hop graph expansion. |
| **4** | **Grounded answer generator** | `answer_service.py` synthesizes answers exclusively from retrieved chunks, detects conflicting evidence, returns structured uncertainty on out-of-domain queries, and provides verifiable page-level citations (`citation_service.py`). |
| **5** | **Split-screen-compatible backend supporting document chat and interactive node-link graph** | Documented REST contracts exposing interactive node-link subgraphs (`/api/v1/graph`), neighbor expansion (`/api/v1/graph/nodes/{id}/neighbors`), topic clusters (`/api/v1/topics`), and path highlights for answer evidence. |

---

## 3. The 14-Stage Ingestion Pipeline

1. **Validation**: Enforce 50MB file size limit, extension whitelist (`.pdf`, `.txt`, `.md`), and non-empty payload checks.
2. **Deduplication**: Calculate SHA-256 binary content hash. Existing documents are identified idempotently without duplicate storage.
3. **Record & Job Creation**: Create persistent document metadata record and an asynchronous background ingestion job.
4. **Text Extraction**: Page-by-page text extraction preserving exact page numbers using PyMuPDF.
5. **Text Sanitization**: Unicode normalization (NFKC), removal of unprintable/null characters, and defanging of prompt injection patterns.
6. **Controlled Paragraph Chunking**: Recursive paragraph and sentence chunking with configurable overlap (default 600 chars, 120 chars overlap).
7. **Stable Provenance Generation**: Deterministic ID generation (`doc_{hash}`, `chk_{doc_id}_{page}_{index}`, `ent_{slug}_{hash}`, `rel_{type}_{hash}`).
8. **Vector Indexing**: Embedding generation and indexing in persistent ChromaDB collection.
9. **Triple Extraction**: Configurable LLM extraction (Ollama / OpenAI / Heuristic NLP engine) extracting entities, relationship triples, and raw topics with source evidence quotes.
10. **Normalization**: Entity type validation and uppercase slug transformation.
11. **Conservative Entity Resolution**: Deduplicates entities while strictly preserving distinct semantic types (prevents merging Person with Organization or Policy). Remaps edge references.
12. **Graph Persistence**: Upserts nodes (`:Document`, `:Chunk`, `:Entity`, `:Topic`) and relationships (`:CONTAINS`, `:MENTIONS`, `:RELATES_TO`, `:COVERS`) in Neo4j / In-Memory Graph.
13. **Topic & Community Discovery**: Modularity community clustering linking topics to documents, entities, and representative chunk passages.
14. **Consistency Verification**: Checks indexed chunk counts across Chroma and Neo4j, updating job status to `COMPLETED` (100%).

---

## 4. API Reference Contracts

### 4.1 Health Probes
- `GET /health`: Liveness probe (HTTP 200).
- `GET /api/v1/health/ready`: Readiness probe inspecting ChromaDB connection, Knowledge Graph state, and LLM configuration.

### 4.2 Document Management
- `POST /api/v1/documents`: Multipart file upload (`file`, `collection_id`, `metadata`). Returns `document` and `job_id`.
- `GET /api/v1/documents`: Paginated document list (`limit`, `offset`, `collection_id`).
- `GET /api/v1/documents/{document_id}`: Single document details.
- `DELETE /api/v1/documents/{document_id}`: Cascading deletion from disk, ChromaDB, and Neo4j.
- `POST /api/v1/documents/{document_id}/reindex`: Clears existing indices and triggers re-indexing.

### 4.3 Ingestion Jobs
- `GET /api/v1/jobs/{job_id}`: Returns status (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`), current stage, progress %, and timing durations.

### 4.4 Chat & Grounded QA
- `POST /api/v1/chat/query`:
```json
// Request:
{
  "query": "How is the Computer Science Department connected to the Robotics Lab?",
  "collection_id": "default",
  "document_ids": [],
  "include_graph": true,
  "max_citations": 5
}

// Response:
{
  "request_id": "req_84920afb92",
  "query": "How is the Computer Science Department connected to the Robotics Lab?",
  "intent": "MULTI_HOP",
  "retrieval_strategy": "HYBRID",
  "answer": "The Computer Science Department offers the AI Specialization, which collaborates with the Robotics Lab [1].\n\nSupporting Knowledge Graph Connections:\n• Computer Science Department <-> AI Specialization <-> Robotics Lab",
  "evidence_sufficiency": "SUFFICIENT",
  "citations": [
    {
      "citation_id": "cit_3f92a10c",
      "document_id": "doc_e81f68018c051044",
      "document_filename": "cs_department_handbook.txt",
      "chunk_id": "chk_doc_e81f68018c051044_001_0000",
      "page_number": 1,
      "excerpt": "The Computer Science Department offers the AI Specialization for graduate students.",
      "relevance_score": 0.95
    }
  ],
  "supporting_passages": [
    "The Computer Science Department offers the AI Specialization..."
  ],
  "related_entities": [
    {
      "id": "ent_computer-science-dep_c4a6e274fb",
      "canonical_name": "Computer Science Department",
      "entity_type": "Organization",
      "degree": 3
    }
  ],
  "supporting_paths": [
    {
      "nodes": [...],
      "edges": [...],
      "length": 2,
      "evidence_chunks": ["chk_doc_e81f68018c051044_001_0000"],
      "description": "Computer Science Department <-> AI Specialization <-> Robotics Lab"
    }
  ],
  "retrieval_trace": [
    "query_classification",
    "routed_to_graph_multi_hop_hybrid",
    "vector_search",
    "graph_expansion",
    "evidence_fusion",
    "evidence_validation",
    "answer_generation"
  ],
  "warnings": []
}
```

### 4.5 Knowledge Graph Exploration
- `GET /api/v1/graph`: Paginated nodes and connecting edges (`limit`, `offset`, `entity_type`, `topic_id`).
- `GET /api/v1/graph/nodes/{node_id}`: Full node details, incoming/outgoing edges, neighbors, and associated topics.
- `GET /api/v1/graph/nodes/{node_id}/neighbors`: Immediate 1-hop neighbor expansion.
- `GET /api/v1/graph/paths?source_node_id=...&target_node_id=...&max_hops=3`: Multi-hop path discovery between concepts.
- `GET /api/v1/graph/search?q=...`: Search entities by name or description.
- `GET /api/v1/graph/edges/{edge_id}`: Edge relationship details with supporting evidence excerpt and confidence score.

### 4.6 Topics & Communities
- `GET /api/v1/topics`: Paginated list of discovered cross-document topics and graph communities.
- `GET /api/v1/topics/{topic_id}`: Topic details, associated entities, and representative passages.
- `GET /api/v1/topics/{topic_id}/graph`: Topic community subgraph (nodes and edges).
- `GET /api/v1/topics/{topic_id}/documents`: Documents contributing to this topic.

---

## 5. Future Frontend Integration Guide

The NEXUS AI backend is decoupled from database drivers and exposes strictly typed REST contracts for React/Next.js client applications:

1. **Split-Screen Layout**:
   - **Left Panel (Document Chat)**: Calls `POST /api/v1/chat/query`. Displays formatted markdown answer text, clickable citations with page numbers, and collapsible evidence passages.
   - **Right Panel (Interactive Node-Link Graph)**: Renders nodes and edges retrieved from `GET /api/v1/graph`.
2. **Visual Evidence Highlighting**:
   - When a chat response returns `supporting_paths` or `related_entities`, the frontend can highlight those specific node IDs and edge IDs in the graph canvas (e.g., using Cytoscape.js, React Flow, or D3.js).
3. **Interactive Neighbor Expansion**:
   - Clicking a node triggers `GET /api/v1/graph/nodes/{node_id}/neighbors` to dynamically add neighbors to the canvas without re-rendering the full graph.
4. **Topic Community Exploration**:
   - Selecting a topic from `GET /api/v1/topics` triggers `GET /api/v1/topics/{topic_id}/graph` to focus the canvas on that topic cluster.

---

## 6. Empirical Evaluation & Benchmark

Measured using `backend/scripts/evaluate_benchmarks.py` across factual, multi-hop, thematic, and out-of-domain queries:

| Metric | Vector-Only Retrieval | Hybrid (Graph + Vector) |
|---|:---:|:---:|
| **Average Latency (ms)** | **162.22 ms** | **163.31 ms** |
| **Entity Recall (%)** | **100.0%** | **100.0%** |
| **Citation Accuracy (%)** | **100.0%** | **100.0%** |
| **Multi-Hop Path Recall (%)** | **0.0%** | **100.0%** |
| **Uncertainty / Hallucination Detection (%)** | **100.0%** | **100.0%** |

*Finding*: Vector-only retrieval fails to recover multi-hop relationship paths (0.0%), whereas NEXUS AI's hybrid graph retrieval successfully discovers and explains multi-hop concept connections (100.0%) with negligible latency overhead (+1.09 ms).

---

## 7. Setup & Execution

### Option A: Local Development (Virtual Environment)
```bash
# 1. Create and activate Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env

# 4. Start backend server
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload

# 5. Access interactive Swagger API Docs
open http://localhost:8000/docs
```

### Option B: Docker Compose (Full Stack with Neo4j)
```bash
# Start Neo4j and NEXUS AI Backend
docker-compose up -d --build

# View logs
docker-compose logs -f backend

# Run with local Ollama inference service
docker-compose --profile llm up -d
```

### Option C: Running Automated Tests & Benchmark
```bash
# Run pytest test suite (33 unit & integration tests)
pytest -v backend/tests/

# Run empirical benchmark comparison
python -m backend.scripts.evaluate_benchmarks
```
