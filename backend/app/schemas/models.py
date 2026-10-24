"""Model management schemas for NEXUS AI.
"""
from typing import List, Optional
from pydantic import BaseModel, Field


class ModelItem(BaseModel):
    name: str
    display_name: str
    provider: str = "ollama"
    parameter_size: Optional[str] = None
    size_bytes: Optional[int] = None
    is_local: bool = True
    is_default: bool = False
    description: Optional[str] = None


class ModelsListResponse(BaseModel):
    active_model: str
    provider: str
    models: List[ModelItem] = Field(default_factory=list)
