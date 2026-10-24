"""Stable identifier generator for NEXUS AI.
Ensures deterministic and collision-resistant IDs across Neo4j, Chroma, and metadata stores.
"""
import hashlib
import re
import uuid


def generate_document_id(content_hash: str) -> str:
    """Generate a deterministic document ID from content SHA-256."""
    return f"doc_{content_hash[:16]}"


def generate_chunk_id(document_id: str, page_number: int, chunk_index: int) -> str:
    """Generate a stable chunk ID with page and index provenance."""
    return f"chk_{document_id}_{page_number:03d}_{chunk_index:04d}"


def normalize_slug(text: str) -> str:
    """Normalize a name to a lower-case alphanumeric slug."""
    text = text.strip().lower()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    return text.strip("-")


def generate_entity_id(canonical_name: str, entity_type: str = "Concept") -> str:
    """Generate a deterministic entity ID from normalized name and type."""
    slug = normalize_slug(canonical_name)
    type_slug = normalize_slug(entity_type)
    hash_digest = hashlib.sha256(f"{type_slug}:{slug}".encode("utf-8")).hexdigest()[:10]
    return f"ent_{slug[:24]}_{hash_digest}"


def generate_relationship_id(
    source_id: str,
    target_id: str,
    relationship_type: str,
    evidence_text: str = "",
) -> str:
    """Generate a deterministic relationship ID."""
    rel_type = normalize_slug(relationship_type).upper()
    hash_input = f"{source_id}->{rel_type}->{target_id}:{evidence_text[:50]}"
    hash_digest = hashlib.sha256(hash_input.encode("utf-8")).hexdigest()[:12]
    return f"rel_{rel_type[:12]}_{hash_digest}"


def generate_topic_id(topic_name: str) -> str:
    """Generate a deterministic topic ID."""
    slug = normalize_slug(topic_name)
    hash_digest = hashlib.sha256(slug.encode("utf-8")).hexdigest()[:8]
    return f"top_{slug[:28]}_{hash_digest}"


def generate_citation_id(document_id: str, chunk_id: str) -> str:
    """Generate stable citation ID."""
    hash_digest = hashlib.sha256(f"{document_id}:{chunk_id}".encode("utf-8")).hexdigest()[:8]
    return f"cit_{hash_digest}"


def generate_job_id() -> str:
    """Generate a unique job ID."""
    return f"job_{uuid.uuid4().hex[:12]}"


def generate_request_id() -> str:
    """Generate a unique request ID."""
    return f"req_{uuid.uuid4().hex[:12]}"


def generate_visual_id(prefix: str = "vis") -> str:
    """Generate a unique visual asset or diagram ID."""
    return f"{prefix}_{uuid.uuid4().hex[:12]}"
