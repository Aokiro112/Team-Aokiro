import {
  DocumentListResponse,
  DocumentResponse,
  GraphResponse,
  IngestionJobResponse,
  NeighborResponse,
  NodeDetailResponse,
  PathQueryResponse,
  QueryRequest,
  QueryResponse,
  TopicDetailResponse,
  TopicListResponse,
  TopicModel,
  ModelItem,
  ModelsListResponse,
} from '../types/backend';
import {
  INITIAL_CHAT_MESSAGES,
  INITIAL_DOCUMENTS,
  MOCK_EDGES,
  MOCK_NODES,
  MOCK_TOPICS,
} from './mockData';

// Storage key for app settings
const SETTINGS_KEY = 'nexus_app_settings';

export interface AppConfig {
  apiBaseUrl: string;
  useMock: boolean;
}

export function getAppConfig(): AppConfig {
  const saved = localStorage.getItem(SETTINGS_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // ignore
    }
  }
  return {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1',
    useMock: false, // Default to live backend
  };
}

export function saveAppConfig(cfg: AppConfig): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(cfg));
}

// In-memory reactive state for mock changes (upload, delete, etc.)
let localDocuments: DocumentResponse[] = [...INITIAL_DOCUMENTS];
let localNodes = [...MOCK_NODES];
let localEdges = [...MOCK_EDGES];
let localTopics = [...MOCK_TOPICS];

// ==========================================
// DOCUMENTS API
// ==========================================
export const documentsApi = {
  async listDocuments(
    collection_id?: string,
    limit = 50,
    offset = 0
  ): Promise<DocumentListResponse> {
    const config = getAppConfig();
    if (!config.useMock) {
      try {
        const url = new URL(`${config.apiBaseUrl}/documents`);
        if (collection_id) url.searchParams.set('collection_id', collection_id);
        url.searchParams.set('limit', limit.toString());
        url.searchParams.set('offset', offset.toString());

        const res = await fetch(url.toString());
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn('Backend unavailable, falling back to mock documents:', err);
      }
    }

    // Mock logic
    const items = localDocuments.slice(offset, offset + limit);
    return {
      items,
      total: localDocuments.length,
      page: Math.floor(offset / limit) + 1,
      page_size: limit,
    };
  },

  async uploadDocument(
    file: File,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<{ document: DocumentResponse; job_id: string }> {
    const config = getAppConfig();
    if (!config.useMock) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('collection_id', 'default');
        const res = await fetch(`${config.apiBaseUrl}/documents`, {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          return { document: data.document, job_id: data.job_id || 'mock-job' };
        }
      } catch (err) {
        console.warn('Backend upload failed, simulating ingestion pipeline:', err);
      }
    }

    // Realistic multi-stage pipeline simulation mirroring backend JobStages
    const stages = [
      { name: 'QUEUED', pct: 10, delay: 400 },
      { name: 'EXTRACTING_TEXT', pct: 25, delay: 600 },
      { name: 'CHUNKING', pct: 45, delay: 500 },
      { name: 'EMBEDDING', pct: 65, delay: 700 },
      { name: 'EXTRACTING_GRAPH', pct: 85, delay: 800 },
      { name: 'RESOLVING_ENTITIES', pct: 95, delay: 600 },
      { name: 'COMPLETED', pct: 100, delay: 400 },
    ];

    for (const step of stages) {
      if (onProgress) onProgress(step.name, step.pct);
      await new Promise((r) => setTimeout(r, step.delay));
    }

    const newDoc: DocumentResponse = {
      id: `doc-${Date.now()}`,
      filename: file.name,
      content_type: file.type || 'application/pdf',
      collection_id: 'default',
      content_hash: `hash-${Math.random().toString(36).substring(2, 9)}`,
      file_size_bytes: file.size,
      status: 'INDEXED',
      total_pages: Math.floor(Math.random() * 40) + 12,
      total_chunks: Math.floor(Math.random() * 60) + 20,
      total_entities: Math.floor(Math.random() * 30) + 15,
      total_relationships: Math.floor(Math.random() * 50) + 25,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: { uploaded_by: 'Student' },
    };

    localDocuments = [newDoc, ...localDocuments];
    return { document: newDoc, job_id: `job-${Date.now()}` };
  },

  async deleteDocument(documentId: string): Promise<boolean> {
    const config = getAppConfig();
    if (!config.useMock) {
      try {
        const res = await fetch(`${config.apiBaseUrl}/documents/${documentId}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          localDocuments = localDocuments.filter((d) => d.id !== documentId);
          return true;
        }
      } catch (err) {
        console.warn('Backend delete failed:', err);
      }
    }

    localDocuments = localDocuments.filter((d) => d.id !== documentId);
    return true;
  },

  async reindexDocument(documentId: string): Promise<boolean> {
    const config = getAppConfig();
    if (!config.useMock) {
      try {
        const res = await fetch(`${config.apiBaseUrl}/documents/${documentId}/reindex`, {
          method: 'POST',
        });
        return res.ok;
      } catch (err) {
        console.warn('Backend reindex failed:', err);
      }
    }

    const doc = localDocuments.find((d) => d.id === documentId);
    if (doc) {
      doc.status = 'PROCESSING';
      setTimeout(() => {
        doc.status = 'INDEXED';
      }, 3000);
    }
    return true;
  },
};

// ==========================================
// KNOWLEDGE GRAPH API
// ==========================================
export const graphApi = {
  async getGraph(
    limit = 50,
    offset = 0,
    entity_type?: string,
    topic_id?: string
  ): Promise<GraphResponse> {
    const config = getAppConfig();
    if (!config.useMock) {
      try {
        const url = new URL(`${config.apiBaseUrl}/graph`);
        url.searchParams.set('limit', limit.toString());
        url.searchParams.set('offset', offset.toString());
        if (entity_type) url.searchParams.set('entity_type', entity_type);
        if (topic_id) url.searchParams.set('topic_id', topic_id);

        const res = await fetch(url.toString());
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn('Backend graph unavailable:', err);
      }
    }

    let nodes = [...localNodes];
    if (entity_type && entity_type !== 'All') {
      nodes = nodes.filter(
        (n) => n.entity_type.toLowerCase() === entity_type.toLowerCase()
      );
    }

    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = localEdges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    return {
      nodes: nodes.slice(offset, offset + limit),
      edges,
      total_nodes: nodes.length,
      total_edges: edges.length,
      limit,
      offset,
    };
  },

  async getNodeDetails(nodeId: string): Promise<NodeDetailResponse | null> {
    const config = getAppConfig();
    if (!config.useMock) {
      try {
        const res = await fetch(`${config.apiBaseUrl}/graph/nodes/${nodeId}`);
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn('Backend node details unavailable:', err);
      }
    }

    const node = localNodes.find((n) => n.id === nodeId);
    if (!node) return null;

    const inEdges = localEdges.filter((e) => e.target === nodeId);
    const outEdges = localEdges.filter((e) => e.source === nodeId);
    const neighborIds = new Set([
      ...inEdges.map((e) => e.source),
      ...outEdges.map((e) => e.target),
    ]);

    const neighbors = localNodes.filter((n) => neighborIds.has(n.id));

    return {
      node,
      neighbors,
      in_edges: inEdges,
      out_edges: outEdges,
      associated_topics: [
        { id: 'topic-transformers', name: 'Attention Mechanism', weight: 8 },
        { id: 'topic-llm', name: 'Large Language Models', weight: 6 },
        { id: 'topic-bert', name: 'BERT', weight: 4 },
        { id: 'topic-ml', name: 'Training', weight: 3 },
      ],
      source_chunks: [
        {
          chunk_id: 'chunk-101',
          text: 'The Transformer architecture abandons recurrence and convolution entirely in favor of an attention mechanism.',
          document_id: 'doc-1',
          page_number: 1,
        },
        {
          chunk_id: 'chunk-102',
          text: 'Scaled dot-product attention computes output as weighted sum of values based on query and key compatibility.',
          document_id: 'doc-1',
          page_number: 12,
        },
      ],
    };
  },
};

// ==========================================
// TOPICS API
// ==========================================
export const topicsApi = {
  async listTopics(limit = 50, offset = 0): Promise<TopicListResponse> {
    const config = getAppConfig();
    if (!config.useMock) {
      try {
        const url = new URL(`${config.apiBaseUrl}/topics`);
        url.searchParams.set('limit', limit.toString());
        url.searchParams.set('offset', offset.toString());
        const res = await fetch(url.toString());
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn('Backend topics unavailable:', err);
      }
    }

    return {
      topics: localTopics.slice(offset, offset + limit),
      total: localTopics.length,
    };
  },

  async getTopic(topicId: string): Promise<TopicDetailResponse | null> {
    const config = getAppConfig();
    if (!config.useMock) {
      try {
        const res = await fetch(`${config.apiBaseUrl}/topics/${topicId}`);
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn('Backend topic details unavailable:', err);
      }
    }

    const topic = localTopics.find((t) => t.id === topicId);
    if (!topic) return null;

    const entities = localNodes.filter((n) => topic.entity_ids.includes(n.id));
    const docs = localDocuments
      .filter((d) => topic.document_ids.includes(d.id))
      .map((d) => ({
        id: d.id,
        filename: d.filename,
        page_count: d.total_pages,
        mention_count: Math.floor(topic.entity_count / 2),
      }));

    return {
      topic,
      associated_entities: entities,
      associated_documents: docs,
      representative_chunks: topic.representative_passages.map((text) => ({
        text,
        document_id: topic.document_ids[0],
      })),
    };
  },
};

// ==========================================
// CHAT & GROUNDED QA API
// ==========================================
export const chatApi = {
  async queryKnowledgeBase(request: QueryRequest): Promise<QueryResponse> {
    const config = getAppConfig();
    try {
      const res = await fetch(`${config.apiBaseUrl}/chat/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (res.ok) {
        return await res.json();
      } else {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server returned ${res.status}`);
      }
    } catch (err: any) {
      console.warn('Backend chat query failed:', err);
      return {
        request_id: `req-err-${Date.now()}`,
        query: request.query,
        intent: 'UNANSWERABLE',
        retrieval_strategy: request.retrieval_strategy_override || 'HYBRID',
        answer: `Could not connect to backend at ${config.apiBaseUrl}. Please ensure the backend server is running.\n\nError: ${err.message}`,
        evidence_sufficiency: 'INSUFFICIENT',
        citations: [],
        supporting_passages: [],
        related_entities: [],
        supporting_paths: [],
        retrieval_trace: ['Connection error to backend /chat/query'],
        warnings: [err.message],
        metadata: {},
      };
    }
  },
};

// ==========================================
// MODELS API
// ==========================================
export const modelsApi = {
  async getAvailableModels(): Promise<ModelsListResponse> {
    const config = getAppConfig();
    if (!config.useMock) {
      try {
        const res = await fetch(`${config.apiBaseUrl}/models`);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('Backend /models endpoint call failed, falling back:', err);
      }
    }

    return {
      active_model: 'qwen3:1.7b',
      provider: 'ollama',
      models: [
        {
          name: 'rule_based',
          display_name: 'Deterministic Grounding Engine',
          provider: 'rule_based',
          is_local: true,
          is_default: false,
          description: 'Offline, extractive, zero-hallucination citation engine.',
        },
        {
          name: 'qwen3:1.7b',
          display_name: 'qwen3:1.7b (2.0B)',
          provider: 'ollama',
          is_local: true,
          is_default: true,
          parameter_size: '2.0B',
          description: 'Local Ollama Qwen 3 model.',
        },
        {
          name: 'qwen3.5:4b',
          display_name: 'qwen3.5:4b (4.2B)',
          provider: 'ollama',
          is_local: true,
          is_default: false,
          parameter_size: '4.2B',
          description: 'Local Ollama Qwen 3.5 model.',
        },
        {
          name: 'aokiro:latest',
          display_name: 'aokiro:latest (7.6B)',
          provider: 'ollama',
          is_local: true,
          is_default: false,
          parameter_size: '7.6B',
          description: 'Fine-tuned local assistant.',
        },
        {
          name: 'qwen2.5-coder:7b-instruct-q4_K_M',
          display_name: 'qwen2.5-coder (7.6B)',
          provider: 'ollama',
          is_local: true,
          is_default: false,
          parameter_size: '7.6B',
          description: 'Local code intelligence model.',
        },
      ],
    };
  },
};
