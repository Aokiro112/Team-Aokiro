/**
 * NEXUS AI — TypeScript contracts mirroring FastAPI backend schemas
 * Exact match with backend/app/schemas/*
 */

// ==========================================
// DOCUMENTS (backend/app/schemas/documents.py)
// ==========================================

export type DocumentStatus = "PENDING" | "PROCESSING" | "INDEXED" | "FAILED";

export interface DocumentResponse {
  id: string;
  filename: string;
  content_type: string;
  collection_id: string;
  metadata: Record<string, any>;
  content_hash: string;
  file_size_bytes: number;
  status: DocumentStatus;
  total_pages: number;
  total_chunks: number;
  total_entities: number;
  total_relationships: number;
  created_at: string;
  updated_at: string;
  error_message?: string | null;
}

export interface DocumentListResponse {
  items: DocumentResponse[];
  total: number;
  page: number;
  page_size: number;
}

export interface DocumentReindexRequest {
  force?: boolean;
}

// ==========================================
// KNOWLEDGE GRAPH (backend/app/schemas/graph.py)
// ==========================================

export interface NodeModel {
  id: string;
  canonical_name: string;
  entity_type: "Concept" | "Topic" | "Document" | string;
  description?: string | null;
  degree: number;
  topic_ids: string[];
  document_ids: string[];
  chunk_ids: string[];
  metadata: Record<string, any>;
}

export interface EdgeModel {
  id: string;
  source: string;
  target: string;
  relationship_type: string;
  evidence: string;
  confidence: number;
  document_ids: string[];
  chunk_ids: string[];
  metadata: Record<string, any>;
}

export interface GraphResponse {
  nodes: NodeModel[];
  edges: EdgeModel[];
  total_nodes: number;
  total_edges: number;
  limit: number;
  offset: number;
}

export interface GraphPath {
  nodes: NodeModel[];
  edges: EdgeModel[];
  length: number;
  evidence_chunks: string[];
  description?: string | null;
}

export interface NodeDetailResponse {
  node: NodeModel;
  neighbors: NodeModel[];
  in_edges: EdgeModel[];
  out_edges: EdgeModel[];
  associated_topics: Array<{ id: string; name: string; weight?: number }>;
  source_chunks: Array<{ chunk_id: string; text: string; document_id: string; page_number?: number }>;
}

export interface NeighborResponse {
  center_node_id: string;
  neighbors: NodeModel[];
  edges: EdgeModel[];
  total_neighbors: number;
}

export interface PathQueryRequest {
  source_node_id: string;
  target_node_id: string;
  max_hops?: number;
  limit?: number;
}

export interface PathQueryResponse {
  source_node_id: string;
  target_node_id: string;
  paths: GraphPath[];
  total_paths_found: number;
}

export interface GraphSearchResponse {
  query: string;
  nodes: NodeModel[];
  edges: EdgeModel[];
  total_matches: number;
}

// ==========================================
// TOPICS (backend/app/schemas/topics.py)
// ==========================================

export interface TopicModel {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  document_count: number;
  entity_count: number;
  document_ids: string[];
  entity_ids: string[];
  representative_passages: string[];
  metadata: Record<string, any>;
}

export interface TopicListResponse {
  topics: TopicModel[];
  total: number;
}

export interface TopicDetailResponse {
  topic: TopicModel;
  associated_entities: NodeModel[];
  associated_documents: Array<{
    id: string;
    filename: string;
    page_count?: number;
    mention_count?: number;
  }>;
  representative_chunks: Array<{
    text: string;
    document_id?: string;
    page_number?: number;
  }>;
}

export interface TopicGraphResponse {
  topic_id: string;
  topic_name: string;
  nodes: NodeModel[];
  edges: EdgeModel[];
}

export interface TopicDocumentsResponse {
  topic_id: string;
  topic_name: string;
  documents: Array<{
    id: string;
    filename: string;
    page_count?: number;
    mention_count?: number;
  }>;
  total_documents: number;
}

// ==========================================
// CHAT & QA (backend/app/schemas/chat.py)
// ==========================================

export type QueryIntent =
  | "THEMATIC"
  | "FACTUAL"
  | "MULTI_HOP"
  | "DOCUMENT_SPECIFIC"
  | "UNANSWERABLE";

export type RetrievalStrategy =
  | "VECTOR_ONLY"
  | "GRAPH_ONLY"
  | "TOPIC_COMMUNITY"
  | "HYBRID";

export type EvidenceSufficiency =
  | "SUFFICIENT"
  | "PARTIAL"
  | "INSUFFICIENT"
  | "CONTRADICTORY";

export interface Citation {
  citation_id: string;
  document_id: string;
  document_filename: string;
  chunk_id: string;
  page_number: number;
  excerpt: string;
  relevance_score: number;
}

export interface QueryRequest {
  query: string;
  collection_id?: string;
  document_ids?: string[];
  include_graph?: boolean;
  max_citations?: number;
  retrieval_strategy_override?: RetrievalStrategy | null;
  model?: string;
}

export interface QueryResponse {
  request_id: string;
  query: string;
  intent: QueryIntent;
  retrieval_strategy: RetrievalStrategy;
  answer: string;
  evidence_sufficiency: EvidenceSufficiency;
  citations: Citation[];
  supporting_passages: string[];
  related_entities: NodeModel[];
  supporting_paths: GraphPath[];
  retrieval_trace: string[];
  warnings: string[];
  model_used?: string;
  metadata: Record<string, any>;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  response?: QueryResponse;
}

export interface ModelItem {
  name: string;
  display_name: string;
  provider: string;
  parameter_size?: string | null;
  size_bytes?: number | null;
  is_local: boolean;
  is_default: boolean;
  description?: string | null;
}

export interface ModelsListResponse {
  active_model: string;
  provider: string;
  models: ModelItem[];
}

// ==========================================
// INGESTION JOBS (backend/app/schemas/jobs.py)
// ==========================================

export type JobStage =
  | "QUEUED"
  | "EXTRACTING_TEXT"
  | "CHUNKING"
  | "EMBEDDING"
  | "EXTRACTING_GRAPH"
  | "RESOLVING_ENTITIES"
  | "BUILDING_TOPICS"
  | "PERSISTING_GRAPH"
  | "VALIDATING_CONSISTENCY"
  | "COMPLETED"
  | "FAILED";

export type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface IngestionJobResponse {
  id: string;
  document_id: string;
  status: JobStatus;
  current_stage: JobStage;
  progress_percent: number;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  stage_durations: Record<string, number>;
  details: Record<string, any>;
}
