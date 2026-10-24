"""Application configuration module using pydantic-settings.
"""
from pathlib import Path
from typing import List, Optional, Union
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Global configuration settings for NEXUS AI backend."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # General Project Info
    PROJECT_NAME: str = "NEXUS AI - Topic-Augmented Knowledge Graph Backend"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False

    # Server Settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # CORS
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000",
        "*",
    ]

    @field_validator("CORS_ORIGINS", mode="after")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                try:
                    import json
                    parsed = json.loads(v)
                    if isinstance(parsed, list):
                        return [str(i).strip() for i in parsed if str(i).strip()]
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    # Storage & Upload Directories
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    UPLOAD_DIR: Path = Path("backend/uploads")
    STORAGE_DIR: Path = Path("backend/storage")
    IMAGE_STORAGE_DIR: Path = Path("backend/storage/images")
    MAX_UPLOAD_SIZE_BYTES: int = 50 * 1024 * 1024  # 50 MB
    ALLOWED_EXTENSIONS: Union[List[str], str] = [".pdf", ".txt", ".md", ".png", ".jpg", ".jpeg", ".webp"]
    ALLOWED_IMAGE_EXTENSIONS: Union[List[str], str] = [".png", ".jpg", ".jpeg", ".webp"]
    MAX_IMAGE_DIMENSION: int = 2048
    MAX_IMAGE_ANALYSIS_BYTES: int = 8 * 1024 * 1024
    VISION_MAX_RETRIES: int = 2
    ENABLE_OCR_FALLBACK: bool = True

    @field_validator("ALLOWED_EXTENSIONS", mode="after")
    @classmethod
    def assemble_allowed_extensions(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                try:
                    import json
                    parsed = json.loads(v)
                    if isinstance(parsed, list):
                        return [str(i).strip() for i in parsed if str(i).strip()]
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    # Ingestion & Chunking
    CHUNK_SIZE: int = 600
    CHUNK_OVERLAP: int = 120
    MIN_CHUNK_SIZE: int = 50

    # ChromaDB (Vector Store)
    CHROMA_PERSIST_DIRECTORY: str = "backend/storage/chroma"
    CHROMA_COLLECTION_PREFIX: str = "nexus"
    CHROMA_HOST: Optional[str] = None
    CHROMA_PORT: Optional[int] = None

    # Neo4j (Knowledge Graph)
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "nexuspassword"
    NEO4J_DATABASE: str = "neo4j"
    NEO4J_MAX_CONNECTION_LIFETIME: int = 3600
    NEO4J_MAX_CONNECTION_POOL_SIZE: int = 50
    NEO4J_CONNECTION_TIMEOUT: float = 5.0
    # Flag to allow falling back to in-memory Graph (NetworkX) when Neo4j is offline or in testing
    USE_IN_MEMORY_GRAPH_FALLBACK: bool = True

    # Embedding Provider
    # Options: "chroma_default", "fast_embed", "sentence_transformers", "ollama", "openai"
    EMBEDDING_PROVIDER: str = "chroma_default"
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    EMBEDDING_DIMENSION: int = 384
    EMBEDDING_BATCH_SIZE: int = 32

    # LLM Provider
    # Options: "ollama", "openai", "rule_based"
    LLM_PROVIDER: str = "ollama"
    LLM_BASE_URL: str = "http://localhost:11434"
    LLM_MODEL: str = "qwen3:1.7b"
    LLM_API_KEY: str = ""
    LLM_TIMEOUT_SECONDS: float = 120.0
    LLM_TEMPERATURE: float = 0.1

    # Graph Retrieval Constraints
    MAX_GRAPH_HOPS: int = 3
    MAX_GRAPH_NEIGHBORS: int = 25
    MAX_PATH_RESULTS: int = 5
    DEFAULT_RETRIEVAL_LIMIT: int = 5
    MAX_RETRIEVAL_LIMIT: int = 20

    # Topic Discovery
    TOPIC_MIN_CLUSTER_SIZE: int = 2
    TOPIC_MAX_COMMUNITIES: int = 15

    # Vision & Multimodal Understanding
    VISION_PROVIDER: str = "ollama"  # "ollama", "openai", "heuristic"
    VISION_BASE_URL: str = "http://localhost:11434"
    VISION_MODEL: str = "llava"  # e.g. "llava", "qwen2-vl", "moondream", etc.
    VISION_API_KEY: str = ""
    VISION_TIMEOUT_SECONDS: float = 60.0
    MAX_IMAGE_EXTRACTION_PER_DOC: int = 50
    RENDER_PAGE_AS_IMAGE_FALLBACK: bool = True

    # Visual Generation
    IMAGE_GEN_PROVIDER: str = "pollinations"  # "pollinations", "openai", "svg_procedural", "disabled"
    IMAGE_GEN_BASE_URL: str = "https://api.openai.com"
    IMAGE_GEN_API_KEY: str = ""
    IMAGE_GEN_MODEL: str = "flux"
    IMAGE_GEN_TIMEOUT_SECONDS: float = 45.0

    def ensure_directories(self) -> None:
        """Create necessary directories if they do not exist."""
        self.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        self.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        self.IMAGE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        Path(self.CHROMA_PERSIST_DIRECTORY).mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_directories()
