"""Intelligent query routing service for NEXUS AI.
Classifies user queries into distinct retrieval intents and selects optimal retrieval strategies.
Generates an observable retrieval audit trace.
"""
import re
from typing import List, Optional, Tuple
from backend.app.core.logging import logger
from backend.app.schemas.chat import QueryIntent, RetrievalStrategy


class QueryRouter:
    """Classifies user intent and selects retrieval strategy."""

    def route_query(
        self,
        query: str,
        document_ids: Optional[List[str]] = None,
        strategy_override: Optional[RetrievalStrategy] = None,
    ) -> Tuple[QueryIntent, RetrievalStrategy, List[str]]:
        """Determine intent, strategy, and initial retrieval trace."""
        trace = ["query_classification"]
        q_clean = query.strip()

        # If user explicitly overrode strategy
        if strategy_override:
            intent = self._classify_intent(q_clean, document_ids)
            trace.append(f"strategy_override_applied({strategy_override.value})")
            return intent, strategy_override, trace

        # Intent classification
        intent = self._classify_intent(q_clean, document_ids)

        if intent == QueryIntent.THEMATIC:
            strategy = RetrievalStrategy.TOPIC_COMMUNITY
            trace.append("routed_to_topic_community")
        elif intent == QueryIntent.VISUAL_GROUNDED:
            strategy = RetrievalStrategy.HYBRID
            trace.append("routed_to_visual_grounded_hybrid")
        elif intent == QueryIntent.MULTI_HOP:
            strategy = RetrievalStrategy.HYBRID
            trace.append("routed_to_graph_multi_hop_hybrid")
        elif intent == QueryIntent.DOCUMENT_SPECIFIC:
            strategy = RetrievalStrategy.HYBRID
            trace.append("routed_to_document_scoped_hybrid")
        elif intent == QueryIntent.FACTUAL:
            strategy = RetrievalStrategy.HYBRID
            trace.append("routed_to_targeted_hybrid")
        else:
            strategy = RetrievalStrategy.VECTOR_ONLY
            trace.append("routed_to_vector_default")

        return intent, strategy, trace

    def _classify_intent(self, query: str, document_ids: Optional[List[str]]) -> QueryIntent:
        """Classify query into one of the 5 core intents."""
        q_lower = query.lower()

        # Check for unanswerable / nonsensical / empty
        if len(q_lower) < 3 or re.match(r"^[\W_]+$", q_lower):
            return QueryIntent.UNANSWERABLE

        # 0. Visual / Diagram Intent: Explicit questions asking to inspect, explain, or generate diagrams, charts, or images
        visual_patterns = [
            r"\b(?:diagram|chart|graph|figure|illustration|plot|screenshot|image|flowchart|concept map)\b",
            r"\bexplain this (?:diagram|image|figure|chart|picture)\b",
            r"\bwhat does this (?:figure|diagram|chart|graph) (?:show|depict|mean)\b",
            r"\bgenerate (?:a )?(?:flowchart|diagram|concept map|illustration|visual)\b",
            r"\bvisual representation\b",
        ]
        if any(re.search(p, q_lower) for p in visual_patterns):
            return QueryIntent.VISUAL_GROUNDED

        # 1. Document-Specific Intent: Explicit doc IDs supplied or query references specific docs
        doc_patterns = [
            r"\bin this document\b",
            r"\baccording to the (?:policy|handbook|document|manual|file|report)\b",
            r"\bwhat does the (?:policy|document|section|regulation)\b",
            r"\bin page \d+\b",
        ]
        if (document_ids and len(document_ids) > 0) or any(re.search(p, q_lower) for p in doc_patterns):
            return QueryIntent.DOCUMENT_SPECIFIC

        # 2. Multi-Hop Intent: Connections, paths, chains, relations between distinct concepts
        multihop_patterns = [
            r"\bhow (?:is|are) .+ (?:connected|related|linked) to\b",
            r"\bconnection between\b",
            r"\bpath (?:from|between)\b",
            r"\bhow does .+ lead to\b",
            r"\bchain of\b",
            r"\brelationship between .+ and\b",
            r"\bhow do .+ and .+ interact\b",
        ]
        if any(re.search(p, q_lower) for p in multihop_patterns):
            return QueryIntent.MULTI_HOP

        # 3. Thematic Intent: Broad cross-document themes, concepts, summaries, recurring ideas
        thematic_patterns = [
            r"\bmain themes?\b",
            r"\brecurring (?:topics?|themes?|patterns?)\b",
            r"\bacross (?:all|the|these) documents?\b",
            r"\bwhat are the (?:key|primary|major) concepts\b",
            r"\bwhich concepts connect the\b",
            r"\boverview of\b",
            r"\bsummarize the (?:handbook|collection|documents|papers)\b",
            r"\bgeneral themes\b",
        ]
        if any(re.search(p, q_lower) for p in thematic_patterns):
            return QueryIntent.THEMATIC

        # 4. Factual Intent: Specific questions about entities, facts, definitions, queries with "who", "which", "where", "when", "what"
        factual_patterns = [
            r"^(?:which|who|where|when|what is|what does|is there|does)\b",
            r"\bdefinition of\b",
            r"\boffers\b",
            r"\brequires\b",
        ]
        if any(re.search(p, q_lower) for p in factual_patterns):
            return QueryIntent.FACTUAL

        # Default to Factual
        return QueryIntent.FACTUAL


query_router = QueryRouter()
