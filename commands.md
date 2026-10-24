# NEXUS AI — Execution & Commands Reference

Guide to running, testing, and managing the NEXUS AI full-stack application.

---

## 🚀 Recommended Setup (3 Separate Terminals)

### 🖥️ Terminal 1 — Ollama (Local LLM Engine)

```bash
# Start the Ollama local inference service
ollama serve

# Check available downloaded models
ollama list

# (Optional) Pull a new model if needed
ollama pull qwen3:1.7b
```

- **Service Endpoint**: `http://localhost:11434`
- **Default Model**: `qwen3:1.7b`

---

### 🖥️ Terminal 2 — Backend (FastAPI + ChromaDB + Graph Engine)

```bash
# 1. Navigate to project root
cd "/home/aokiro/Hackathon Project"

# 2. Activate virtual environment
source .venv/bin/activate

# (First time setup only)
# pip install -r requirements.txt

# 3. Start the FastAPI server with auto-reload
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

- **Backend API**: [http://localhost:8000](http://localhost:8000)
- **Interactive Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check**: `curl http://localhost:8000/api/v1/health`
- **Detected Local Models**: `curl http://localhost:8000/api/v1/models`

---

### 🖥️ Terminal 3 — Frontend (React 19 + Vite + Tailwind CSS v4)

```bash
# 1. Navigate to project root
cd "/home/aokiro/Hackathon Project"

# (First time setup only)
# npm install

# 2. Start Vite development server
npm run dev
```

- **Web Application**: [http://localhost:3000](http://localhost:3000)

---

## ⚡ Single Command Quickstart (Background Mode)

To start both the FastAPI backend and Vite frontend from a single terminal:

```bash
cd "/home/aokiro/Hackathon Project" && \
.venv/bin/uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload & \
npm run dev
```

---

## 🧪 Testing & Verification Commands

### 1. Backend Automated Tests (34 test suite)
```bash
cd "/home/aokiro/Hackathon Project"
.venv/bin/pytest -v backend/tests/
```

### 2. Frontend Typecheck & Production Build
```bash
cd "/home/aokiro/Hackathon Project"
npm run build
```

### 3. Verify Server Status & Ports
```bash
# Check if ports 8000, 3000, and 11434 are listening
ss -tuln | grep -E ':(8000|3000|11434)'

# Quick ping tests
curl -s -o /dev/null -w "Backend Status: %{http_code}\n" http://localhost:8000/api/v1/health
curl -s -o /dev/null -w "Frontend Status: %{http_code}\n" http://localhost:3000
curl -s http://localhost:11434/
```

---

## 📁 Key File Paths & Directories

| Component | Path | Description |
|---|---|---|
| **Backend Entry** | `backend/app/main.py` | FastAPI application initialization & routes |
| **Answer Service** | `backend/app/services/answer_service.py` | Grounded synthesis & prompt templates |
| **Frontend Entry** | `src/App.tsx` | Main React layout & persistent chat state |
| **Rich Chat UI** | `src/components/chat/RichAnswerRenderer.tsx` | Formatted answers, markdown tables, inline citation chips |
| **Search Loader** | `src/components/chat/RetrievalLoadingIndicator.tsx` | Search-first multi-step retrieval beacon |
| **Vector Storage** | `backend/storage/chroma/` | Persisted ChromaDB vector embeddings |
| **Graph Cache** | `backend/storage/` | In-memory graph cache and metadata |
| **Environment** | `.env` | Configuration for ports, models, embeddings |
