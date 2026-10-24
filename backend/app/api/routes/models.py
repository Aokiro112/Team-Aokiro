"""Model discovery and selection routes for NEXUS AI.
Discovers local Ollama models on any machine and exposes options for dynamic grounded QA inference.
"""
import os
from pathlib import Path
import shutil
import subprocess
from typing import Dict, List
import httpx
from fastapi import APIRouter, status
from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.schemas.models import ModelItem, ModelsListResponse

router = APIRouter(prefix="/models", tags=["Model Management"])


def _discover_models_from_cli() -> List[ModelItem]:
    """Discover models using the local `ollama list` CLI command if installed."""
    models: List[ModelItem] = []
    ollama_bin = shutil.which("ollama")
    if not ollama_bin:
        return models

    try:
        res = subprocess.run(
            [ollama_bin, "list"],
            capture_output=True,
            text=True,
            timeout=2.0,
            check=False,
        )
        if res.returncode == 0 and res.stdout:
            lines = res.stdout.strip().splitlines()
            # First line is usually header: NAME ID SIZE MODIFIED
            for line in lines[1:]:
                parts = line.split()
                if parts:
                    name = parts[0]
                    size_str = parts[2] if len(parts) >= 3 else ""
                    models.append(
                        ModelItem(
                            name=name,
                            display_name=f"{name} ({size_str})" if size_str else name,
                            provider="ollama",
                            parameter_size=size_str or None,
                            size_bytes=None,
                            is_local=True,
                            is_default=False,
                            description=f"Local Ollama model: {name}",
                        )
                    )
    except Exception as e:
        logger.debug(f"ollama list CLI check: {e}")

    return models


def _model_matches(model_name: str, target: str) -> bool:
    """Helper to check if model name matches target (handling :latest suffix and casing)."""
    if not model_name or not target:
        return False
    m_clean = model_name.lower().removesuffix(":latest")
    t_clean = target.lower().removesuffix(":latest")
    return m_clean == t_clean or m_clean.startswith(t_clean) or t_clean.startswith(m_clean)


def _discover_models_from_disk() -> List[ModelItem]:
    """Fallback scanner for locally installed Ollama models from manifest directories."""
    models: List[ModelItem] = []
    possible_roots = [
        Path.home() / ".ollama" / "models" / "manifests",
        Path("/var/lib/ollama/manifests"),
        Path("/var/lib/ollama/.ollama/models/manifests"),
        Path("/var/lib/ollama/models/manifests"),
        Path("/usr/share/ollama/.ollama/models/manifests"),
        Path("/usr/share/ollama/models/manifests"),
    ]
    custom_root = os.environ.get("OLLAMA_MODELS")
    if custom_root:
        possible_roots.append(Path(custom_root) / "manifests")

    seen_names = set()
    for manifest_root in possible_roots:
        if not manifest_root.exists():
            continue
        try:
            for root, _, files in os.walk(manifest_root):
                for file in files:
                    full_path = Path(root) / file
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

                        if model_id not in seen_names:
                            seen_names.add(model_id)
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
            logger.debug(f"Error scanning local Ollama disk manifests at {manifest_root}: {e}")

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
    detected_models_map: Dict[str, ModelItem] = {}
    ollama_online = False

    # 1. Query live Ollama daemon across possible standard endpoints
    candidate_urls = [
        settings.LLM_BASE_URL.rstrip("/"),
        "http://127.0.0.1:11434",
        "http://localhost:11434",
    ]
    # Remove duplicates preserving order
    seen_urls = set()
    candidate_urls = [u for u in candidate_urls if not (u in seen_urls or seen_urls.add(u))]

    for base_url in candidate_urls:
        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                resp = await client.get(f"{base_url}/api/tags")
                if resp.status_code == 200:
                    ollama_online = True
                    data = resp.json()
                    for m in data.get("models", []):
                        name = m.get("name") or m.get("model")
                        if not name:
                            continue
                        details = m.get("details", {})
                        param_size = details.get("parameter_size")
                        size = m.get("size")
                        detected_models_map[name] = ModelItem(
                            name=name,
                            display_name=f"{name}" + (f" ({param_size})" if param_size else ""),
                            provider="ollama",
                            parameter_size=param_size,
                            size_bytes=size,
                            is_local=True,
                            is_default=_model_matches(name, settings.LLM_MODEL),
                            description=f"Ollama {param_size or ''} model running locally.",
                        )
                    break
        except Exception as e:
            logger.debug(f"Live Ollama API query for {base_url} returned: {e}")

    # 2. If daemon wasn't reachable via HTTP, try CLI
    if not detected_models_map:
        for m in _discover_models_from_cli():
            detected_models_map[m.name] = m

    # 3. Fallback: check filesystem manifests
    if not detected_models_map:
        for m in _discover_models_from_disk():
            detected_models_map[m.name] = m

    detected_models = list(detected_models_map.values())

    # 4. If an Ollama model is configured, ensure it is available in detected models
    if settings.LLM_PROVIDER == "ollama" and settings.LLM_MODEL:
        if not any(_model_matches(m.name, settings.LLM_MODEL) for m in detected_models):
            configured_name = settings.LLM_MODEL
            param = "1.7B" if "1.7b" in configured_name.lower() else None
            configured_item = ModelItem(
                name=configured_name,
                display_name=f"{configured_name}" + (f" ({param})" if param else ""),
                provider="ollama",
                parameter_size=param,
                size_bytes=None,
                is_local=True,
                is_default=True,
                description=f"Configured Ollama model: {configured_name}",
            )
            detected_models_map[configured_name] = configured_item
            detected_models.insert(0, configured_item)

    # 5. Always include Deterministic Rule-Based Grounding Model
    rule_model = ModelItem(
        name="rule_based",
        display_name="Deterministic Grounding Engine",
        provider="rule_based",
        parameter_size="N/A",
        size_bytes=0,
        is_local=True,
        is_default=(settings.LLM_PROVIDER == "rule_based" or not detected_models),
        description="Offline, extractive, zero-hallucination citation engine.",
    )

    all_models = [rule_model] + detected_models

    # Determine active model
    active_model = "rule_based"
    if settings.LLM_PROVIDER == "ollama":
        matched = next((m for m in detected_models if _model_matches(m.name, settings.LLM_MODEL)), None)
        if matched:
            active_model = matched.name
        elif detected_models:
            qwen_match = next((m for m in detected_models if "qwen" in m.name.lower()), None)
            active_model = qwen_match.name if qwen_match else detected_models[0].name
        else:
            active_model = settings.LLM_MODEL
    elif detected_models:
        active_model = detected_models[0].name

    for m in all_models:
        m.is_default = (m.name == active_model)

    return ModelsListResponse(
        active_model=active_model,
        provider="ollama" if active_model != "rule_based" else "rule_based",
        models=all_models,
    )
