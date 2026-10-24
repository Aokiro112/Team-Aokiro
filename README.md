# Team-Aokiro — NEXUS AI

> **Hypnexis Hackathon — Problem Statement AI-03**  
> **Interactive Knowledge Base: Topic-Augmented Knowledge Graph Builder & Grounded QA System**

NEXUS AI is a full-stack document intelligence platform that transforms unstructured documents into a searchable, connected, evidence-grounded knowledge base with interactive 2D graph visualization and verifiable multi-hop reasoning.

---

## 🌟 Architecture Overview

1. **Frontend (React 19 + Vite + TypeScript + Tailwind CSS v4)**:
   - Interactive Force-Directed Knowledge Graph with 2D Canvas physics, radial layouts, and node flyouts.
   - Grounded Q&A Assistant with dynamic **Local LLM Selector** (Ollama models & deterministic fallback) and source citations.
   - Document Ingestion pipeline manager and Topics & Communities discovery view.
   - Command Palette (`⌘K` / `Ctrl+K`) for global search.

2. **Backend (FastAPI + ChromaDB + Neo4j / NetworkX + Ollama)**:
   - Document Ingestion & PyMuPDF text extraction with exact page provenance.
   - Entity, topic, and relationship extraction with conservative resolution.
   - Hybrid GraphRAG retrieval combining ChromaDB vector embeddings and Neo4j / NetworkX graph traversals via Reciprocal Rank Fusion (RRF).
   - Local model discovery (`/api/v1/models`) supporting Ollama models (`qwen3`, `qwen3.5`, `qwen2.5-coder`, custom models) and zero-hallucination deterministic offline synthesis.

---

## 🚀 Quickstart

### 1. Backend Setup

```bash
# Setup Python virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run automated backend test suite
pytest -v backend/tests/

# Start FastAPI backend
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```
OpenAPI documentation: [http://localhost:8000/docs](http://localhost:8000/docs)

### 2. Frontend Setup

```bash
# Install node dependencies
npm install

# Start Vite dev server
npm run dev
```
Web application: [http://localhost:3000](http://localhost:3000)

---

## 🤖 Local LLM & Model Selection

NEXUS AI automatically detects local models running on your system via Ollama (`http://localhost:11434/api/tags`) or local manifests (`~/.ollama/models/manifests`):
- Models appear automatically in the **Top Navigation Model Selector bar**.
- Switch instantly between available models (e.g. `qwen3:1.7b`, `qwen3.5:4b`, `aokiro:latest`, `qwen2.5-coder`) and the **Deterministic Rule-Based Engine**.
- Each query uses the selected model for strictly grounded, citation-backed answers.

---

## 🧪 Testing & Verification

- **Backend Tests**: `.venv/bin/pytest -v backend/tests/`
- **Frontend Typecheck & Build**: `npm run build`
- **Empirical Benchmarks**: `python -m backend.scripts.evaluate_benchmarks`
