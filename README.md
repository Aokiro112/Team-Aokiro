# Team-Aokiro — NEXUS AI

> **Hypnexis Hackathon — Problem Statement AI-03**  
> **Interactive Knowledge Base: Topic-Augmented Knowledge Graph Builder**

NEXUS AI is an interactive document-intelligence backend that transforms unstructured documents into a searchable, connected, evidence-grounded knowledge base.

It combines:
- Document ingestion and PyMuPDF text extraction with page provenance.
- Entity, topic, and relationship extraction with conservative resolution.
- Knowledge graph construction with Neo4j and embedded NetworkX graph fallback.
- Semantic vector retrieval with persistent ChromaDB.
- Cross-document topic and community discovery.
- Intelligent query routing across 5 distinct intents (Thematic, Factual, Multi-Hop, Document-Specific, Unanswerable).
- Hybrid graph-plus-vector retrieval with Reciprocal Rank Fusion.
- Grounded answer generation with strict zero-hallucination citations and graph-path explainability.
- Versioned REST APIs (`/api/v1`) designed for seamless integration with a React/Next.js frontend.

---

## Quickstart

```bash
# 1. Setup virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. Run automated tests
pytest -v backend/tests/

# 3. Run empirical benchmark
python -m backend.scripts.evaluate_benchmarks

# 4. Start backend
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive OpenAPI documentation is available at `http://localhost:8000/docs`.

For detailed architecture, API contracts, benchmark results, and Docker Compose deployment instructions, see [backend/README.md](backend/README.md).
