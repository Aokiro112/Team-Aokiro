# NEXUS AI — Interactive Knowledge Base Frontend

Modern, high-performance web interface for **NEXUS AI: Topic-Augmented Knowledge Graph & Grounded Question Answering System**.

Designed with a clean monochrome aesthetic matching the production design specifications.

---

## 🌟 Core Features & Views

1. **Dashboard (`Home`)**
   - Overview metrics: Total Indexed Documents, Discovered Entities, and Graph Relationships.
   - Quick access cards for file ingestion, graph exploration, topic discovery, and QA.
   - Recent documents table with real-time status indicators.

2. **Documents Library (`Documents`)**
   - Drag-and-drop file upload zone (supports PDF, TXT, MD, PNG, JPG, WebP).
   - Ingestion pipeline simulator reflecting backend stages:
     `QUEUED` ➔ `EXTRACTING_TEXT` ➔ `CHUNKING` ➔ `EMBEDDING` ➔ `EXTRACTING_GRAPH` ➔ `RESOLVING_ENTITIES` ➔ `BUILDING_TOPICS` ➔ `COMPLETED`.
   - Filter tabs (`All Documents`, `Processing`), full-text search, and action dropdowns (View Details, Reindex, Delete).

3. **Knowledge Graph (`Explore Connections`)**
   - High-performance 2D Canvas force-directed graph renderer with zoom, pan, and drag physics.
   - Radial concept layouts (e.g., `Transformer` center entity with connected topics and sub-concepts).
   - Entity type filters (`All`, `Entity`, `Topic`, `Document`).
   - Radar minimap thumbnail and interactive Node Detail Flyout with connected topics and source excerpts.

4. **Topics & Communities (`Discover Key Topics`)**
   - Discovered topic clusters with associated document badges and mention frequencies.
   - Topic detail drawer showcasing related concepts and associated study materials.

5. **Ask NEXUS (`Get Clear Answers`)**
   - Grounded Q&A interface with retrieval strategy selector:
     - `Deep Search` / `HYBRID` (Vector + Knowledge Graph traversal)
     - `GRAPH_ONLY`
     - `VECTOR_ONLY`
     - `TOPIC_COMMUNITY`
   - Verifiable citation pills with page numbers and popover modals for inspecting evidence passages.

6. **Command Palette (`⌘K` / `Ctrl+K`) & Settings**
   - Instant keyboard search across documents, topics, and entities.
   - Switch seamlessly between **Mock Engine Mode** (zero setup required) and **Live FastAPI Backend API** (`http://localhost:8000/api/v1`).
## 🌟 Architecture Overview

1. **Frontend (React 19 + Vite + TypeScript + Tailwind CSS v4)**:
   - Interactive Force-Directed Knowledge Graph with 2D Canvas physics, radial layouts, and node flyouts.
   - Grounded Q&A Assistant with dynamic **Local LLM Selector** (Ollama models & deterministic fallback) and source citations.
    - Document Ingestion pipeline manager and Topics & Communities discovery view.
    - Multimodal evidence shelf with source-image preview, page provenance, Mermaid export, and visual generation controls.
   - Command Palette (`⌘K` / `Ctrl+K`) for global search.

2. **Backend (FastAPI + ChromaDB + Neo4j / NetworkX + Ollama)**:
    - Document Ingestion & PyMuPDF text extraction with exact page provenance.
    - Visual extraction for embedded PDF images, vector/scanned page renders, OCR fallback, and provider-backed image analysis.
   - Entity, topic, and relationship extraction with conservative resolution.
    - Hybrid GraphRAG retrieval combining ChromaDB vector embeddings, visual evidence, and Neo4j / NetworkX graph traversals via Reciprocal Rank Fusion (RRF).
   - Local model discovery (`/api/v1/models`) supporting Ollama models (`qwen3`, `qwen3.5`, `qwen2.5-coder`, custom models) and zero-hallucination deterministic offline synthesis.

---

## 🛠️ Tech Stack

- **Framework**: [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Graph Engine**: Native HTML5 Canvas 2D Physics & Force Simulator

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Build for Production
```bash
npm run build
```

### 4. Backend Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

Run the backend checks with `.venv/bin/python -m pytest -q backend/tests/`.

### 5. Multimodal configuration

Configure the optional providers in the root `.env` copied above (the same template is also available at `backend/.env.example`):

- `VISION_PROVIDER=ollama` with a vision model such as `llava`, or `VISION_PROVIDER=openai` with `LLM_API_KEY` and a vision-capable `VISION_MODEL`.
- `IMAGE_GEN_PROVIDER=pollinations` for URL-backed illustrations, `openai` with the separate `IMAGE_GEN_API_KEY`, or `svg_procedural` for an offline fallback.
- `ENABLE_OCR_FALLBACK=true` enables optional Tesseract OCR when a vision provider is unavailable. OCR/context metadata is marked partial; the system does not claim visual relationships were understood.

All provider credentials are read by the backend only. Structured flowcharts, concept maps, graph visualizations, and technical diagrams use deterministic Mermaid rendering; illustrative requests use the configured image provider or an explicitly labeled SVG fallback.

---

## 🔗 Backend Alignment

The frontend data contracts strictly mirror the FastAPI backend Pydantic models from the `backend` branch:
- `DocumentResponse`, `DocumentListResponse` (`backend/app/schemas/documents.py`)
- `NodeModel`, `EdgeModel`, `GraphResponse`, `NodeDetailResponse` (`backend/app/schemas/graph.py`)
- `TopicModel`, `TopicListResponse`, `TopicDetailResponse` (`backend/app/schemas/topics.py`)
- `QueryRequest`, `QueryResponse`, `Citation` (`backend/app/schemas/chat.py`)
- `IngestionJobResponse` (`backend/app/schemas/jobs.py`)
