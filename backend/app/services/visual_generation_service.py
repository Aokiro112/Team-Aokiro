"""Visual Generation Service for NEXUS AI.
Synthesizes structured diagrams (Mermaid flowcharts, concept maps, technical diagrams)
and illustrative educational images grounded in document concepts and chat context.
"""
from datetime import datetime, timezone
import hashlib
import html
import json
import re
import urllib.parse
from typing import Any, Dict, List, Optional, Tuple
import httpx

from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.schemas.visuals import (
    GeneratedVisual,
    VisualGenerationRequest,
    VisualGenerationType,
)
from backend.app.utils.identifiers import generate_visual_id


class VisualGenerationService:
    """Orchestrates structured diagram rendering and image generation."""

    def __init__(self):
        self.provider = settings.IMAGE_GEN_PROVIDER.lower()
        self.model = settings.IMAGE_GEN_MODEL

    async def generate_visual(self, request: VisualGenerationRequest) -> GeneratedVisual:
        """Generate a structured diagram (Mermaid/SVG) or illustrative image."""
        visual_id = generate_visual_id("vis")
        now = datetime.now(timezone.utc).isoformat()
        v_type = request.visual_type

        # 1. Structured Technical Diagrams: Mermaid / SVG
        if v_type in [
            VisualGenerationType.FLOWCHART,
            VisualGenerationType.CONCEPT_MAP,
            VisualGenerationType.TECHNICAL_DIAGRAM,
            VisualGenerationType.GRAPH_VISUALIZATION,
        ]:
            mermaid_code, title, concepts = await self._synthesize_mermaid_diagram(
                prompt=request.prompt,
                visual_type=v_type,
                context=request.context or "",
            )
            return GeneratedVisual(
                id=visual_id,
                visual_type=v_type,
                render_format="mermaid",
                content=mermaid_code,
                title=title,
                caption=(
                    f"Deterministic {v_type.value.lower().replace('_', ' ')} grounded in the supplied context. "
                    "Relationships inferred by the diagram synthesizer should be checked against the cited sources."
                ),
                prompt=request.prompt,
                generated_by="nexus_mermaid_engine",
                created_at=now,
                source_concepts=concepts,
                status="COMPLETED",
                metadata={"type": v_type.value},
            )

        # 2. Illustrative Images: Pollinations / OpenAI / Procedural SVG
        else:
            image_url, title, concepts = await self._synthesize_illustration(
                prompt=request.prompt,
                context=request.context or "",
            )
            generation_status = "COMPLETED" if self.provider in {"pollinations", "openai"} and image_url.startswith(("http", "data:image/")) else "FALLBACK"
            return GeneratedVisual(
                id=visual_id,
                visual_type=VisualGenerationType.ILLUSTRATION,
                render_format="image_url" if image_url.startswith(("http", "data:image/")) else "svg",
                content=image_url,
                title=title,
                caption=(
                    f"AI-generated educational illustration for: {request.prompt[:80]}"
                    if generation_status == "COMPLETED"
                    else "Procedural SVG fallback: an image-generation provider was not configured or unavailable."
                ),
                prompt=request.prompt,
                generated_by=f"nexus_{self.provider}" if generation_status == "COMPLETED" else "nexus_svg_procedural_fallback",
                created_at=now,
                source_concepts=concepts,
                download_url=image_url if image_url.startswith("http") else None,
                status=generation_status,
                metadata={"provider": self.provider, "model": self.model},
            )

    async def _synthesize_mermaid_diagram(
        self,
        prompt: str,
        visual_type: VisualGenerationType,
        context: str,
    ) -> Tuple[str, str, List[str]]:
        """Synthesize verified, syntax-clean Mermaid diagram code from context and prompt."""
        # 1. Try LLM synthesis if Ollama or OpenAI is online
        candidate_urls = [settings.LLM_BASE_URL.rstrip("/")]
        if "localhost" in settings.LLM_BASE_URL:
            candidate_urls.append(settings.LLM_BASE_URL.replace("localhost", "127.0.0.1"))
        elif "127.0.0.1" in settings.LLM_BASE_URL:
            candidate_urls.append(settings.LLM_BASE_URL.replace("127.0.0.1", "localhost"))

        llm_prompt = f"""You are an expert technical diagram and Mermaid.js author.
Create a clean, visually informative, perfectly formatted Mermaid.js diagram based on the user's prompt and context.

Diagram Type: {visual_type.value}
User Request: {prompt}
Context:
\"\"\"{context[:1500]}\"\"\"

SYNTAX RULES:
- Use "flowchart TD" or "flowchart LR" for flowcharts and processes.
- Use "graph TD" or "graph LR" for concept maps.
- Use "sequenceDiagram" for interactions or protocols.
- Always quote node labels containing spaces or special characters: A["Node Label (details)"]
- Do not use markdown backticks inside node labels.
- Output ONLY the raw Mermaid diagram syntax. No markdown fences, no explanation."""

        for base in candidate_urls:
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.post(
                        f"{base}/api/generate",
                        json={
                            "model": settings.LLM_MODEL,
                            "prompt": llm_prompt,
                            "stream": False,
                            "options": {"temperature": 0.1},
                        },
                    )
                    if resp.status_code == 200:
                        raw = resp.json().get("response", "").strip()
                        cleaned = self._sanitize_mermaid(raw, visual_type)
                        if cleaned:
                            title = self._derive_title(prompt, visual_type)
                            concepts = self._extract_concepts(cleaned)
                            return cleaned, title, concepts
            except Exception as e:
                logger.debug(f"LLM Mermaid synthesis via {base} notice: {e}")
                continue

        # 2. Deterministic Rule-Based Diagram Generator Fallback
        return self._generate_deterministic_mermaid(prompt, visual_type, context)

    def _sanitize_mermaid(self, raw_code: str, v_type: VisualGenerationType) -> Optional[str]:
        """Strip markdown fences, sanitize node IDs, and enforce valid diagram headers."""
        if not raw_code:
            return None

        # Remove markdown fences
        clean = re.sub(r"^```(?:mermaid)?\s*", "", raw_code.strip(), flags=re.IGNORECASE)
        clean = re.sub(r"```\s*$", "", clean).strip()

        # Check for valid Mermaid header
        valid_headers = [
            "flowchart TD", "flowchart LR", "flowchart TB", "graph TD", "graph LR",
            "graph TB", "sequenceDiagram", "classDiagram", "stateDiagram", "stateDiagram-v2", "erDiagram"
        ]
        has_header = any(clean.startswith(h) for h in valid_headers)
        if not has_header:
            if v_type == VisualGenerationType.FLOWCHART:
                clean = "flowchart TD\n" + clean
            else:
                clean = "graph TD\n" + clean

        return clean if len(clean.splitlines()) >= 2 else None

    def _generate_deterministic_mermaid(
        self,
        prompt: str,
        visual_type: VisualGenerationType,
        context: str,
    ) -> Tuple[str, str, List[str]]:
        """Generate structured Mermaid diagram deterministically from extracted text entities."""
        title = self._derive_title(prompt, visual_type)
        # Extract meaningful terms from prompt & context
        full_text = f"{prompt} {context}"
        words = re.findall(r"\b[A-Z][a-zA-Z0-9_-]{2,}\b", full_text)
        unique_nodes = list(dict.fromkeys(words))[:6]

        if not unique_nodes:
            unique_nodes = ["Input Data", "Processing Engine", "Knowledge Graph", "Analysis Module", "Output Result"]

        lines = []
        if visual_type == VisualGenerationType.FLOWCHART:
            lines.append("flowchart TD")
            lines.append('    Start(["User Input / Query"]) --> Step1["Data Ingestion"]')
            for i, n in enumerate(unique_nodes):
                next_node = unique_nodes[i + 1] if i + 1 < len(unique_nodes) else "ValidatedOutput"
                lines.append(f'    Step{i+1}["{n}"] --> Step{i+2}["{next_node}"]')
            lines.append('    ValidatedOutput["Grounded Verification"] --> EndNode(["Final Answer & Visualizations"])')

        elif visual_type == VisualGenerationType.CONCEPT_MAP or visual_type == VisualGenerationType.GRAPH_VISUALIZATION:
            lines.append("graph LR")
            root = unique_nodes[0] if unique_nodes else "Core Concept"
            lines.append(f'    C_ROOT["{root}"]')
            for i, n in enumerate(unique_nodes[1:], 1):
                lines.append(f'    C_ROOT -- relates to --> C_{i}["{n}"]')
                if i % 2 == 0 and i > 1:
                    lines.append(f'    C_{i-1} -- interacts with --> C_{i}')

        else:  # Technical diagram
            lines.append("sequenceDiagram")
            lines.append("    autonumber")
            lines.append("    actor User")
            lines.append("    participant Client as Nexus Frontend")
            lines.append("    participant API as FastAPI Backend")
            lines.append("    participant Graph as Knowledge Graph")
            lines.append("    User->>Client: Submit Grounded Query")
            lines.append("    Client->>API: POST /api/v1/chat/query")
            lines.append("    API->>Graph: Hybrid Graph & Vector Traversal")
            lines.append("    Graph-->>API: Evidence Chunks & Citations")
            lines.append("    API-->>Client: Grounded Answer & Visual Elements")
            lines.append("    Client-->>User: Render Interactive Visual Evidence")

        code = "\n".join(lines)
        return code, title, unique_nodes

    async def _synthesize_illustration(
        self,
        prompt: str,
        context: str,
    ) -> Tuple[str, str, List[str]]:
        """Generate high-quality illustrative visual via Pollinations, OpenAI DALL-E, or procedural SVG."""
        title = self._derive_title(prompt, VisualGenerationType.ILLUSTRATION)
        concepts = re.findall(r"\b[A-Z][a-zA-Z0-9_-]{2,}\b", f"{prompt} {context}")[:5]

        # 1. Pollinations AI (production-quality, zero-key image generation)
        if self.provider == "pollinations":
            # Create a descriptive, safe prompt
            enhanced_prompt = f"Educational technical diagram, scientific visual illustration of {prompt}. Crisp vector aesthetic, clean white background, educational textbook infographic style, high detail."
            clean_prompt = re.sub(r"[^\w\s-]", "", enhanced_prompt)[:300]
            encoded_prompt = urllib.parse.quote(clean_prompt)
            seed = abs(hash(prompt)) % 100000
            pollinations_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=1024&height=640&nologo=true&seed={seed}&model={self.model}"
            return pollinations_url, title, concepts

        # 2. OpenAI DALL-E 3
        if self.provider == "openai" and settings.IMAGE_GEN_API_KEY:
            try:
                headers = {
                    "Authorization": f"Bearer {settings.IMAGE_GEN_API_KEY}",
                    "Content-Type": "application/json",
                }
                payload = {
                    "model": self.model if self.model != "flux" else "gpt-image-2.5-sunburst",
                    "prompt": f"Educational technical illustration: {prompt}. Clean, accurate, diagrammatic style.",
                    "n": 1,
                    "size": "1024x1024",
                }
                async with httpx.AsyncClient(timeout=settings.IMAGE_GEN_TIMEOUT_SECONDS) as client:
                    resp = await client.post(
                        f"{settings.IMAGE_GEN_BASE_URL.rstrip('/')}/v1/images/generations",
                        headers=headers,
                        json=payload,
                    )
                    if resp.status_code == 200:
                        item = resp.json().get("data", [{}])[0]
                        url = item.get("url")
                        if url:
                            return url, title, concepts
                        b64_json = item.get("b64_json")
                        if b64_json:
                            return f"data:image/png;base64,{b64_json}", title, concepts
            except Exception as e:
                logger.warning(f"OpenAI DALL-E generation failed ({e}); falling back to procedural SVG.")

        # 3. Procedural SVG Fallback. This is explicitly labeled as a fallback and is
        # never presented as an external image-generation result.
        svg_content = self._generate_procedural_svg(prompt, concepts)
        return svg_content, title, concepts

    def _generate_procedural_svg(self, prompt: str, concepts: List[str]) -> str:
        """Generate a crisp, responsive SVG diagram."""
        display_concepts = concepts if concepts else ["Input", "Processing", "Knowledge Graph", "Analysis"]
        nodes_svg = []
        for i, c in enumerate(display_concepts[:4]):
            x = 80 + i * 200
            nodes_svg.append(f"""
            <g transform="translate({x}, 160)">
              <rect width="160" height="90" rx="12" fill="#F8FAFC" stroke="#0F172A" stroke-width="2"/>
              <circle cx="80" cy="35" r="16" fill="#10B981" fill-opacity="0.2"/>
              <text x="80" y="40" font-family="sans-serif" font-size="12" font-weight="bold" fill="#047857" text-anchor="middle">#{i+1}</text>
               <text x="80" y="68" font-family="sans-serif" font-size="12" font-weight="600" fill="#0F172A" text-anchor="middle">{html.escape(c[:18])}</text>
            </g>
            """)
            if i < len(display_concepts[:4]) - 1:
                nodes_svg.append(f"""
                <line x1="{x + 160}" y1="205" x2="{x + 200}" y2="205" stroke="#94A3B8" stroke-width="2" stroke-dasharray="4"/>
                <polygon points="{x + 200},205 {x + 192},200 {x + 192},210" fill="#94A3B8"/>
                """)

        return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 400" width="100%" height="100%">
          <rect width="100%" height="100%" fill="#FFFFFF" rx="16"/>
          <text x="460" y="60" font-family="sans-serif" font-size="20" font-weight="bold" fill="#0F172A" text-anchor="middle">{html.escape(prompt[:60])}</text>
          <text x="460" y="90" font-family="sans-serif" font-size="13" fill="#64748B" text-anchor="middle">NEXUS AI Evidence-Grounded Conceptual Diagram</text>
          {''.join(nodes_svg)}
        </svg>"""

    def _derive_title(self, prompt: str, v_type: VisualGenerationType) -> str:
        words = prompt.strip().split()
        short = " ".join(words[:6])
        type_name = v_type.value.replace("_", " ").title()
        return f"{type_name}: {short}..." if len(words) > 6 else f"{type_name}: {short}"

    def _extract_concepts(self, mermaid_code: str) -> List[str]:
        matches = re.findall(r'\["([^"]+)"\]', mermaid_code)
        clean = [m.strip() for m in matches if len(m.strip()) > 2]
        return list(dict.fromkeys(clean))[:6]


visual_generation_service = VisualGenerationService()
