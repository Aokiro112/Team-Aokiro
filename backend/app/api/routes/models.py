"""Model discovery and selection routes for NEXUS AI.
Discovers local Ollama models and exposes options for dynamic grounded QA inference.
"""
import os
from pathlib import Path
from typing import List
import httpx
from fastapi import APIRouter, status
from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.schemas.models import ModelItem, ModelsListResponse

router = APIRouter(prefix="/models", tags=["Model Management"])


def _discover_models_from_disk() -> List[ModelItem]:
    """Fallback scanner for locally installed Ollama models from ~/.ollama/models/manifests."""
    models: List[ModelItem] = []
    manifest_root = Path.home() / ".ollama" / "models" / "manifests"
    if not manifest_root.exists():
        return models

    try:
        for root, _, files in os.walk(manifest_root):
            for file in files:
                full_path = Path(root) / file
                # Path format typically: .../manifests/registry.ollama.ai/library/<model>/<tag>
                parts = full_path.parts
                try:
                    idx = parts.index("manifests")
                    subparts = parts[idx + 1 :]
                    if len(subparts) >= 3:
                        model_name = subparts[-2]
                        tag = subparts[-1]
                        model_id = f"{model_name}:{tag}"
                    else:
                        model_id = file
                    
                    models.append(
                        ModelItem(
                            name=model_id,
                            display_name=f"{model_id} (Local)",
                            provider="ollama",
                            parameter_size=None,
                            size_bytes=full_path.stat().st_size if full_path.exists() else None,
                            is_local=True,
                            is_default=False,
                            description=f"Installed local Ollama model: {model_id}",
                        )
                    )
                except Exception:
                    continue
    except Exception as e:
        logger.warning(f"Error scanning local Ollama disk manifests: {e}")

    return models


@router.get(
    "",
    response_model=ModelsListResponse,
    status_code=status.HTTP_200_OK,
    summary="List available local and configured models",
)
async def list_available_models() -> ModelsListResponse:
    """Discovers available local models from Ollama daemon or local disk manifests,
    along with the deterministic rule-based grounding engine.
    """
    detected_models: List[ModelItem] = []
    ollama_online = False

    # 1. Query live Ollama daemon
    base_url = settings.LLM_BASE_URL.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{base_url}/api/tags")
            if resp.status_code == 200:
                ollama_online = True
                data = resp.json()
                for m in data.get("models", []):
                    name = m.get("name") or m.get("model")
                    details = m.get("details", {})
                    param_size = details.get("parameter_size")
                    size = m.get("size")
                    detected_models.append(
                        ModelItem(
                            name=name,
                            display_name=f"{name}" + (f" ({param_size})" if param_size else ""),
                            provider="ollama",
                            parameter_size=param_size,
                            size_bytes=size,
                            is_local=True,
                            is_default=(name == settings.LLM_MODEL),
                            description=f"Ollama {param_size or ''} model running locally.",
                        )
                    )
    except Exception as e:
        logger.debug(f"Live Ollama API query returned: {e}")

    # 2. If daemon wasn't reachable, scan disk manifests
    if not detected_models:
        disk_models = _discover_models_from_disk()
        for dm in disk_models:
            if dm.name == settings.LLM_MODEL:
                dm.is_default = True
            detected_models.append(dm)

    # 3. Always include Deterministic Rule-Based Grounding Model
    is_rule_default = settings.LLM_PROVIDER == "rule_based" or not detected_models
    rule_model = ModelItem(
        name="rule_based",
        display_name="Deterministic Grounding Engine",
        provider="rule_based",
        parameter_size="N/A",
        size_bytes=0,
        is_local=True,
        is_default=is_rule_default,
        description="Offline, extractive, zero-hallucination citation engine.",
    )

    all_models = [rule_model] + detected_models

    active_model = settings.LLM_MODEL if (detected_models and settings.LLM_PROVIDER == "ollama") else "rule_based"
    # If the configured default model exists in detected models, use it, otherwise first detected or rule_based
    model_names = [m.name for m in all_models]
    if active_model not in model_names:
        active_model = detected_models[0].name if detected_models else "rule_based"

    return ModelsListResponse(
        active_model=active_model,
        provider="ollama" if (ollama_online and active_model != "rule_based") else "rule_based",
        models=all_models,
    )
