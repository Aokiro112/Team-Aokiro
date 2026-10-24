"""Text processing, cleaning, chunking, and hashing utilities.
"""
import hashlib
import re
import unicodedata
from typing import Any, Dict, List, Optional


def calculate_content_hash(data: bytes) -> str:
    """Compute SHA-256 hash of binary content."""
    return hashlib.sha256(data).hexdigest()


def sanitize_text(text: str) -> str:
    """Sanitize raw extracted text:
    - Normalize unicode (NFKC).
    - Strip null bytes, unprintable/control characters.
    - Defang common prompt injection tokens (e.g. delimiters like System:, [INST], etc.).
    - Normalize whitespace.
    """
    if not text:
        return ""

    # Normalize unicode
    text = unicodedata.normalize("NFKC", text)

    # Remove null characters and non-printable control characters (keep \n and \t)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]", "", text)

    # Replace suspicious system injection prompt patterns
    # (neutralize instructions trying to override system persona)
    text = re.sub(r"(?i)<\s*system\s*>", "[SYSTEM_TAG]", text)
    text = re.sub(r"(?i)<\s*/\s*system\s*>", "[/SYSTEM_TAG]", text)
    text = re.sub(r"(?i)\[\s*INST\s*\]", "[INST_TAG]", text)
    text = re.sub(r"(?i)\[\s*/\s*INST\s*\]", "[/INST_TAG]", text)

    # Normalize multiple newlines and spaces
    text = re.sub(r"\r\n|\r", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def chunk_text_by_paragraphs(
    text: str,
    page_number: int = 1,
    chunk_size: int = 600,
    chunk_overlap: int = 120,
    min_chunk_size: int = 50,
) -> List[Dict[str, Any]]:
    """Split text recursively by paragraphs and sentences with overlap.
    Preserves page number, char start/end offsets, and token count approximation.
    """
    clean = sanitize_text(text)
    if not clean or len(clean) < min_chunk_size:
        if clean:
            return [{
                "text": clean,
                "page_number": page_number,
                "start_char": 0,
                "end_char": len(clean),
                "word_count": len(clean.split()),
            }]
        return []

    # Split into paragraphs first
    paragraphs = [p.strip() for p in clean.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [clean]

    chunks: List[Dict[str, Any]] = []
    current_chunk = ""
    current_start = 0

    for para in paragraphs:
        # If single paragraph is larger than chunk_size, split by sentences
        if len(para) > chunk_size:
            sentences = re.split(r"(?<=[.!?])\s+", para)
            for sentence in sentences:
                sentence = sentence.strip()
                if not sentence:
                    continue
                if len(current_chunk) + len(sentence) + 1 <= chunk_size:
                    current_chunk = f"{current_chunk} {sentence}".strip()
                else:
                    if len(current_chunk) >= min_chunk_size:
                        chunks.append({
                            "text": current_chunk,
                            "page_number": page_number,
                            "start_char": current_start,
                            "end_char": current_start + len(current_chunk),
                            "word_count": len(current_chunk.split()),
                        })
                        # Apply overlap
                        overlap_start = max(0, len(current_chunk) - chunk_overlap)
                        overlap_text = current_chunk[overlap_start:]
                        current_start += len(current_chunk) - len(overlap_text)
                        current_chunk = f"{overlap_text} {sentence}".strip()
                    else:
                        current_chunk = sentence
        else:
            if len(current_chunk) + len(para) + 2 <= chunk_size:
                current_chunk = f"{current_chunk}\n\n{para}".strip()
            else:
                if len(current_chunk) >= min_chunk_size:
                    chunks.append({
                        "text": current_chunk,
                        "page_number": page_number,
                        "start_char": current_start,
                        "end_char": current_start + len(current_chunk),
                        "word_count": len(current_chunk.split()),
                    })
                    overlap_start = max(0, len(current_chunk) - chunk_overlap)
                    overlap_text = current_chunk[overlap_start:]
                    current_start += len(current_chunk) - len(overlap_text)
                    current_chunk = f"{overlap_text}\n\n{para}".strip()
                else:
                    current_chunk = para

    # Append trailing chunk
    if current_chunk and len(current_chunk) >= min_chunk_size:
        chunks.append({
            "text": current_chunk,
            "page_number": page_number,
            "start_char": current_start,
            "end_char": current_start + len(current_chunk),
            "word_count": len(current_chunk.split()),
        })

    return chunks
