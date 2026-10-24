"""Contradiction detection schemas for NEXUS AI.
Captures structured claims, comparative conflicts, and provenance.
"""
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class ConflictType(str, Enum):
    NUMERICAL_MISMATCH = "NUMERICAL_MISMATCH"
    POLICY_OPPOSITION = "POLICY_OPPOSITION"
    ATTRIBUTE_CONFLICT = "ATTRIBUTE_CONFLICT"
    CONDITIONAL_DIFFERENCE = "CONDITIONAL_DIFFERENCE"


class ClaimEvidence(BaseModel):
    """Structured verifiable claim extracted from a specific document chunk."""
    claim_text: str = Field(..., description="Exact claim sentence or statement")
    subject: str = Field(..., description="Entity or topic subject of the claim")
    predicate: str = Field(..., description="Action, property, or relationship")
    value: str = Field(..., description="Target value, rule, metric, or policy value")
    document_id: str = Field(..., description="Source document ID")
    document_filename: str = Field(..., description="Human-readable filename")
    page_number: int = Field(default=1, description="Source page number")
    chunk_id: str = Field(..., description="Source chunk ID")
    condition_or_date: Optional[str] = Field(None, description="Temporal or conditional qualifier if any")


class ContradictionReport(BaseModel):
    """Structured report detailing a verified contradiction between two or more claims."""
    subject: str = Field(..., description="Subject about which conflicting claims are made")
    attribute: str = Field(..., description="Attribute or policy aspect in dispute")
    conflict_type: ConflictType = Field(..., description="Classification of the conflict")
    claims: List[ClaimEvidence] = Field(..., min_length=2, description="At least two conflicting claims")
    explanation: str = Field(..., description="Clear explanation of the disagreement")
    confidence: float = Field(default=0.9, ge=0.0, le=1.0, description="Confidence in contradiction detection")
