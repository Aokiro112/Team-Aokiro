"""Document Image Extraction & Visual Evidence Processing Service for NEXUS AI.
Extracts embedded images, diagram vectors, and rendered pages from PDFs and images.
Enforces deduplication, context correlation, vision model analysis, and secure storage.
"""
import hashlib
import json
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Set
import pymupdf  # PyMuPDF
from PIL import Image
import io

from backend.app.core.config import settings
from backend.app.core.logging import logger
from backend.app.schemas.visuals import VisualEvidence, VisualType
from backend.app.services.vision_service import vision_service
from backend.app.utils.identifiers import generate_visual_id


class ImageExtractionService:
    """Manages document visual content extraction, deduplication, and vision analysis."""

    def __init__(self):
        self.storage_dir = settings.IMAGE_STORAGE_DIR
        self.metadata_file = settings.STORAGE_DIR / "visual_metadata.json"
        self._registry: Dict[str, Dict[str, Any]] = {}
        self._load_registry()

    def _load_registry(self) -> None:
        """Load visual metadata registry from disk."""
        if self.metadata_file.exists():
            try:
                with open(self.metadata_file, "r", encoding="utf-8") as f:
                    self._registry = json.load(f)
            except Exception as e:
                logger.error(f"Error loading visual metadata file: {e}")
                self._registry = {}
        else:
            self._registry = {}

    def _save_registry(self) -> None:
        """Persist visual metadata registry to disk."""
        try:
            self.metadata_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.metadata_file, "w", encoding="utf-8") as f:
                json.dump(self._registry, f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Error saving visual metadata file: {e}")

    async def extract_and_process_document_images(
        self,
        document_id: str,
        file_path: Path,
        filename: str,
        collection_id: str = "default",
    ) -> List[VisualEvidence]:
        """Extract, deduplicate, and analyze all visual elements in a document."""
        # Reindexing is idempotent: remove old visual records/assets before replacing them.
        self.remove_document_visuals(document_id)
        ext = file_path.suffix.lower()
        visuals: List[VisualEvidence] = []
        seen_hashes: Set[str] = set()

        if ext == ".pdf":
            visuals = await self._extract_pdf_visuals(document_id, file_path, filename, seen_hashes, collection_id)
        elif ext in settings.ALLOWED_IMAGE_EXTENSIONS:
            visuals = await self._process_standalone_image(document_id, file_path, filename, collection_id)

        # Register extracted visual assets
        for v in visuals:
            self._registry[v.id] = v.model_dump()

        self._save_registry()
        logger.info(f"Processed {len(visuals)} visual assets for document {document_id} ({filename})")
        return visuals

    async def _extract_pdf_visuals(
        self,
        document_id: str,
        file_path: Path,
        filename: str,
        seen_hashes: Set[str],
        collection_id: str,
    ) -> List[VisualEvidence]:
        """Extract embedded raster images and diagram vector pages from a PDF document."""
        visuals: List[VisualEvidence] = []
        try:
            doc = pymupdf.open(file_path)
        except Exception as e:
            logger.error(f"Failed to open PDF {file_path} for visual extraction: {e}")
            return []

        total_pages = len(doc)
        img_counter = 0

        for page_idx in range(total_pages):
            if img_counter >= settings.MAX_IMAGE_EXTRACTION_PER_DOC:
                break

            page_num = page_idx + 1
            page = doc[page_idx]

            # 1. Extract surrounding text context from page
            page_text = page.get_text() or ""
            text_blocks = page.get_text("blocks") or []

            # 2. Extract embedded raster images
            image_list = page.get_images(full=True)
            page_had_raster = False

            for img_info in image_list:
                if img_counter >= settings.MAX_IMAGE_EXTRACTION_PER_DOC:
                    break

                xref = img_info[0]
                try:
                    base_img = doc.extract_image(xref)
                    if not base_img:
                        continue

                    img_bytes = base_img.get("image")
                    img_ext = base_img.get("ext", "png")
                    width = base_img.get("width", 0)
                    height = base_img.get("height", 0)

                    # Filter out tiny icon decorations, spacers, or separators
                    if width < 40 or height < 40 or len(img_bytes) < 64:
                        continue

                    # Deduplication via SHA-256
                    content_hash = hashlib.sha256(img_bytes).hexdigest()
                    if content_hash in seen_hashes:
                        continue
                    seen_hashes.add(content_hash)

                    img_counter += 1
                    page_had_raster = True
                    img_id = f"img_{document_id[:8]}_p{page_num}_{img_counter}"

                    # Locate nearest caption from page blocks
                    caption = self._find_nearest_caption(page_text, text_blocks)
                    surrounding_text = self._extract_surrounding_text(page_text)

                    # Save image file to disk
                    saved_path = self._save_image_bytes(img_id, img_bytes, img_ext)

                    # Vision model analysis
                    analysis = await vision_service.analyze_image(
                        image_bytes=img_bytes,
                        image_format=img_ext,
                        context_text=f"{caption}\n{surrounding_text}",
                        document_filename=filename,
                        page_number=page_num,
                    )

                    visual_item = VisualEvidence(
                        id=img_id,
                        document_id=document_id,
                        document_filename=filename,
                        page_number=page_num,
                        image_path=str(saved_path),
                        image_url=f"{settings.API_V1_STR}/documents/images/{img_id}",
                        content_hash=content_hash,
                        width=width,
                        height=height,
                        format=img_ext,
                        caption=caption or analysis.get("caption"),
                        surrounding_text=surrounding_text[:500],
                        visual_type=VisualType(analysis.get("visual_type", VisualType.DIAGRAM.value)),
                        title=analysis.get("title") or f"Figure {img_counter} (p. {page_num})",
                        extracted_text=analysis.get("extracted_text"),
                        description=analysis.get("description", "Diagram extracted from document."),
                        detailed_analysis=analysis.get("detailed_analysis"),
                        structured_data=analysis.get("structured_data"),
                        detected_labels=analysis.get("detected_labels", []),
                        related_concept_names=analysis.get("related_concepts", []),
                        confidence=float(analysis.get("confidence", 0.9)),
                        analysis_provider=analysis.get("analysis_provider", "heuristic"),
                        analysis_status=analysis.get("analysis_status", "UNAVAILABLE"),
                        analysis_error=analysis.get("analysis_error"),
                        is_page_render=False,
                        metadata={"collection_id": collection_id, "source": "embedded_image", "xref": xref},
                    )
                    visuals.append(visual_item)

                except Exception as e:
                    logger.debug(f"Error extracting image xref {xref} on page {page_num}: {e}")
                    continue

            # 3. If page contains rich drawings or vector charts without raster images, render page pixmap
            if settings.RENDER_PAGE_AS_IMAGE_FALLBACK and img_counter < settings.MAX_IMAGE_EXTRACTION_PER_DOC:
                try:
                    drawings = page.get_drawings()
                    # Check if page has diagrammatic indicators (curves, rects, lines > 8) or visual keywords
                    has_diagram_cues = bool(re.search(r"\b(?:figure|diagram|flowchart|architecture|chart|graph|plot|table)\b", page_text, re.IGNORECASE))
                    # Render vector-heavy pages and scanned pages with little/no text. Do not
                    # duplicate a page that already yielded an embedded raster unless it has
                    # strong vector/layout evidence.
                    should_render = (
                        len(drawings) >= 6
                        or (has_diagram_cues and len(drawings) >= 2)
                        or (not page_text.strip() and not image_list)
                    ) and not (page_had_raster and not drawings)
                    if should_render:
                        pix = page.get_pixmap(dpi=150)
                        img_bytes = pix.tobytes("png")
                        content_hash = hashlib.sha256(img_bytes).hexdigest()

                        if content_hash not in seen_hashes:
                            seen_hashes.add(content_hash)
                            img_counter += 1
                            img_id = f"img_{document_id[:8]}_p{page_num}_diagram"
                            saved_path = self._save_image_bytes(img_id, img_bytes, "png")

                            caption = self._find_nearest_caption(page_text, text_blocks)
                            surrounding_text = self._extract_surrounding_text(page_text)

                            analysis = await vision_service.analyze_image(
                                image_bytes=img_bytes,
                                image_format="png",
                                context_text=f"{caption}\n{surrounding_text}",
                                document_filename=filename,
                                page_number=page_num,
                            )

                            visual_item = VisualEvidence(
                                id=img_id,
                                document_id=document_id,
                                document_filename=filename,
                                page_number=page_num,
                                image_path=str(saved_path),
                                image_url=f"{settings.API_V1_STR}/documents/images/{img_id}",
                                content_hash=content_hash,
                                width=pix.width,
                                height=pix.height,
                                format="png",
                                caption=caption or f"Page {page_num} Diagram/Illustration",
                                surrounding_text=surrounding_text[:500],
                                visual_type=VisualType(analysis.get("visual_type", VisualType.DIAGRAM.value)),
                                title=analysis.get("title") or f"Diagram on Page {page_num}",
                                extracted_text=analysis.get("extracted_text"),
                                description=analysis.get("description", f"Rendered diagram and layout from page {page_num}."),
                                detailed_analysis=analysis.get("detailed_analysis"),
                                structured_data=analysis.get("structured_data"),
                                detected_labels=analysis.get("detected_labels", []),
                                related_concept_names=analysis.get("related_concepts", []),
                                confidence=float(analysis.get("confidence", 0.85)),
                                analysis_provider=analysis.get("analysis_provider", "heuristic"),
                                analysis_status=analysis.get("analysis_status", "UNAVAILABLE"),
                                analysis_error=analysis.get("analysis_error"),
                                is_page_render=True,
                                metadata={"collection_id": collection_id, "source": "pdf_page_render"},
                            )
                            visuals.append(visual_item)
                except Exception as e:
                    logger.debug(f"Page render fallback on page {page_num} notice: {e}")

        doc.close()
        return visuals

    async def _process_standalone_image(
        self,
        document_id: str,
        file_path: Path,
        filename: str,
        collection_id: str,
    ) -> List[VisualEvidence]:
        """Process a directly uploaded image file (PNG, JPG, WebP)."""
        try:
            with open(file_path, "rb") as f:
                img_bytes = f.read()

            content_hash = hashlib.sha256(img_bytes).hexdigest()
            img_id = f"img_{document_id[:8]}_1"
            img_ext = file_path.suffix.lstrip(".").lower() or "png"

            width, height = 0, 0
            try:
                with Image.open(io.BytesIO(img_bytes)) as img:
                    width, height = img.size
            except Exception:
                pass

            saved_path = self._save_image_bytes(img_id, img_bytes, img_ext)

            analysis = await vision_service.analyze_image(
                image_bytes=img_bytes,
                image_format=img_ext,
                context_text=f"Uploaded image: {filename}",
                document_filename=filename,
                page_number=1,
            )

            visual_item = VisualEvidence(
                id=img_id,
                document_id=document_id,
                document_filename=filename,
                page_number=1,
                image_path=str(saved_path),
                image_url=f"{settings.API_V1_STR}/documents/images/{img_id}",
                content_hash=content_hash,
                width=width,
                height=height,
                format=img_ext,
                caption=analysis.get("caption") or f"Uploaded Image: {filename}",
                surrounding_text=filename,
                visual_type=VisualType(analysis.get("visual_type", VisualType.DIAGRAM.value)),
                title=analysis.get("title") or filename,
                extracted_text=analysis.get("extracted_text"),
                description=analysis.get("description", "Uploaded technical diagram or visual asset."),
                detailed_analysis=analysis.get("detailed_analysis"),
                structured_data=analysis.get("structured_data"),
                detected_labels=analysis.get("detected_labels", []),
                related_concept_names=analysis.get("related_concepts", []),
                confidence=float(analysis.get("confidence", 0.95)),
                analysis_provider=analysis.get("analysis_provider", "heuristic"),
                analysis_status=analysis.get("analysis_status", "UNAVAILABLE"),
                analysis_error=analysis.get("analysis_error"),
                is_page_render=False,
                metadata={"collection_id": collection_id, "source": "standalone_image"},
            )
            return [visual_item]

        except Exception as e:
            logger.error(f"Failed to process standalone image {file_path}: {e}")
            return []

    def _save_image_bytes(self, img_id: str, data: bytes, ext: str) -> Path:
        """Persist image bytes safely inside storage directory."""
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        safe_ext = ext.lower().replace("jpeg", "jpg")
        target_path = self.storage_dir / f"{img_id}.{safe_ext}"
        with open(target_path, "wb") as f:
            f.write(data)
        return target_path

    def _find_nearest_caption(self, page_text: str, text_blocks: List[Any]) -> Optional[str]:
        """Locate explicit caption labels like 'Figure 1: ...' or 'Table 2: ...'."""
        caption_match = re.search(
            r"(?:figure|fig\.|diagram|table|chart|scheme)\s*[\d.]*[:.-]?\s*([^\n.]+)",
            page_text,
            re.IGNORECASE,
        )
        if caption_match:
            return caption_match.group(0).strip()

        # Check block lines
        for b in text_blocks:
            if len(b) >= 5 and isinstance(b[4], str):
                line = b[4].strip()
                if re.match(r"^(?:figure|fig\.|table|chart)\b", line, re.IGNORECASE):
                    return line[:120]
        return None

    def _extract_surrounding_text(self, page_text: str) -> str:
        """Extract clean paragraph snippets representing surrounding context."""
        paras = [p.strip() for p in page_text.split("\n\n") if len(p.strip()) > 30]
        return " ".join(paras[:3])[:800]

    def get_image(self, image_id: str) -> Optional[VisualEvidence]:
        """Fetch visual evidence by image ID."""
        data = self._registry.get(image_id)
        if data:
            return VisualEvidence(**data)
        return None

    def get_image_file_path(self, image_id: str) -> Optional[Path]:
        """Retrieve sanitized, verified on-disk file path for an image ID."""
        # Sanitize image_id to prevent directory traversal
        if not re.match(r"^[a-zA-Z0-9_-]+$", image_id):
            return None

        # Look for matching file in storage_dir
        for ext in [".png", ".jpg", ".jpeg", ".webp"]:
            candidate = self.storage_dir / f"{image_id}{ext}"
            if candidate.exists() and candidate.is_file():
                return candidate

        # Fallback to registered path
        item = self.get_image(image_id)
        if item:
            registered = Path(item.image_path)
            try:
                if registered.resolve().is_relative_to(self.storage_dir.resolve()) and registered.exists():
                    return registered
            except (OSError, ValueError):
                return None

        return None

    def get_document_visuals(self, document_id: str) -> List[VisualEvidence]:
        """List all visual evidence extracted from a specific document."""
        return [
            VisualEvidence(**v)
            for v in self._registry.values()
            if v.get("document_id") == document_id
        ]

    def remove_document_visuals(self, document_id: str) -> int:
        """Delete visual metadata and stored assets for a document."""
        removed = 0
        for image_id, raw in list(self._registry.items()):
            if raw.get("document_id") != document_id:
                continue
            path = self.get_image_file_path(image_id)
            if path and path.exists():
                try:
                    path.unlink()
                except OSError as exc:
                    logger.warning(f"Could not remove visual asset {path}: {exc}")
            self._registry.pop(image_id, None)
            removed += 1
        if removed:
            self._save_registry()
        return removed

    def list_all_visuals(self, limit: int = 100) -> List[VisualEvidence]:
        """List all indexed visual assets."""
        items = list(self._registry.values())[:limit]
        return [VisualEvidence(**v) for v in items]


image_extraction_service = ImageExtractionService()
