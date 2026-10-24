"""Conservative entity resolution and deduplication service.
Merges duplicate entities conservatively while preserving provenance and preventing
spurious merges between distinct concepts.
"""
import re
from typing import Dict, List, Set, Tuple
from backend.app.core.logging import logger
from backend.app.schemas.graph import EdgeModel, NodeModel
from backend.app.utils.identifiers import normalize_slug


class EntityResolutionService:
    """Performs conservative entity deduplication and graph normalization."""

    def resolve_entities_and_edges(
        self,
        entities: List[NodeModel],
        edges: List[EdgeModel],
    ) -> Tuple[List[NodeModel], List[EdgeModel]]:
        """Deduplicate entities conservatively and remap edge endpoints accordingly."""
        if not entities:
            return [], []

        # Map canonical slug -> canonical NodeModel
        canonical_map: Dict[str, NodeModel] = {}
        # Map alias ID -> canonical ID
        id_remap: Dict[str, str] = {}

        for entity in entities:
            slug = normalize_slug(entity.canonical_name)
            # Find matching existing entity
            matched_slug = self._find_conservative_match(entity, slug, canonical_map)

            if matched_slug:
                canonical = canonical_map[matched_slug]
                id_remap[entity.id] = canonical.id

                # Merge provenance & metadata conservatively
                canonical.document_ids = list(set(canonical.document_ids + entity.document_ids))
                canonical.chunk_ids = list(set(canonical.chunk_ids + entity.chunk_ids))
                canonical.topic_ids = list(set(canonical.topic_ids + entity.topic_ids))

                # Retain aliases in metadata
                aliases = set(canonical.metadata.get("aliases", []))
                aliases.add(entity.canonical_name)
                canonical.metadata["aliases"] = list(aliases)

                if not canonical.description and entity.description:
                    canonical.description = entity.description
            else:
                canonical_map[slug] = entity
                id_remap[entity.id] = entity.id
                if "aliases" not in entity.metadata:
                    entity.metadata["aliases"] = [entity.canonical_name]

        resolved_entities = list(canonical_map.values())

        # Remap edges and deduplicate
        resolved_edges: List[EdgeModel] = []
        edge_signature_map: Dict[str, EdgeModel] = {}

        for edge in edges:
            src = id_remap.get(edge.source, edge.source)
            tgt = id_remap.get(edge.target, edge.target)

            # Prevent self-loops formed by resolution unless explicitly required
            if src == tgt:
                continue

            rel_type = edge.relationship_type.upper().strip().replace(" ", "_")
            sig = f"{src}->{rel_type}->{tgt}"

            if sig in edge_signature_map:
                existing = edge_signature_map[sig]
                existing.document_ids = list(set(existing.document_ids + edge.document_ids))
                existing.chunk_ids = list(set(existing.chunk_ids + edge.chunk_ids))
                if edge.evidence and edge.evidence not in existing.evidence:
                    existing.evidence = f"{existing.evidence}; {edge.evidence}".strip("; ")
                existing.confidence = max(existing.confidence, edge.confidence)
            else:
                remapped_edge = EdgeModel(
                    id=edge.id,
                    source=src,
                    target=tgt,
                    relationship_type=rel_type,
                    evidence=edge.evidence,
                    confidence=edge.confidence,
                    document_ids=edge.document_ids,
                    chunk_ids=edge.chunk_ids,
                    metadata=edge.metadata,
                )
                edge_signature_map[sig] = remapped_edge

        resolved_edges = list(edge_signature_map.values())
        logger.debug(
            f"Entity resolution: {len(entities)} -> {len(resolved_entities)} nodes, "
            f"{len(edges)} -> {len(resolved_edges)} edges."
        )
        return resolved_entities, resolved_edges

    def _find_conservative_match(
        self,
        candidate: NodeModel,
        candidate_slug: str,
        existing_map: Dict[str, NodeModel],
    ) -> str:
        """Find conservative match in existing entities.
        Only merges on exact slug match or strict acronym-expansion match with compatible types.
        """
        # Exact slug match
        if candidate_slug in existing_map:
            existing = existing_map[candidate_slug]
            if self._are_types_compatible(candidate.entity_type, existing.entity_type):
                return candidate_slug

        # Acronym check (e.g. AI vs Artificial Intelligence)
        for slug, existing in existing_map.items():
            if not self._are_types_compatible(candidate.entity_type, existing.entity_type):
                continue

            if self._is_strict_acronym(candidate.canonical_name, existing.canonical_name) or \
               self._is_strict_acronym(existing.canonical_name, candidate.canonical_name):
                # Verify they share at least one document context
                shared_docs = set(candidate.document_ids).intersection(set(existing.document_ids))
                if shared_docs:
                    return slug

        return ""

    def _are_types_compatible(self, type1: str, type2: str) -> bool:
        """Check if two entity types can be safely merged."""
        t1, t2 = (type1 or "Concept").lower(), (type2 or "Concept").lower()
        if t1 == t2 or t1 == "concept" or t2 == "concept":
            return True
        # Incompatible distinct categories
        incompatibles = [
            ({"person"}, {"organization", "technology", "policy"}),
            ({"policy"}, {"technology", "person"}),
        ]
        for s1, s2 in incompatibles:
            if (t1 in s1 and t2 in s2) or (t1 in s2 and t2 in s1):
                return False
        return True

    def _is_strict_acronym(self, short_name: str, long_name: str) -> bool:
        """Check if short_name is a genuine uppercase acronym of long_name."""
        clean_short = re.sub(r"[^A-Z]", "", short_name)
        if len(clean_short) < 2 or len(clean_short) > 6:
            return False

        words = [w for w in re.split(r"[\s_-]+", long_name) if w and w[0].isupper()]
        if len(words) != len(clean_short):
            return False

        expected = "".join(w[0] for w in words)
        return clean_short == expected


entity_resolution_service = EntityResolutionService()
