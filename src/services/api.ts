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
  GeneratedVisual,
  VisualEvidence,
  VisualGenerationRequest,
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
    useMock: true, // Default to true as requested: "connect mat karna filhal backend"
  };
}

export function saveAppConfig(cfg: AppConfig): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(cfg));
}

export function resolveApiAssetUrl(assetUrl: string): string {
  if (!assetUrl) return assetUrl;
  if (/^(?:https?:|data:|blob:)/i.test(assetUrl)) return assetUrl;
  const base = getAppConfig().apiBaseUrl.replace(/\/$/, '');
  return `${base}${assetUrl.startsWith('/') ? assetUrl : `/${assetUrl}`}`;
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
    let acceptedUpload = false;
    let backendResponded = false;
    if (!config.useMock) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('collection_id', 'default');
        const res = await fetch(`${config.apiBaseUrl}/documents`, {
          method: 'POST',
          body: formData,
        });
        backendResponded = true;
        if (res.ok) {
          acceptedUpload = true;
          const data = await res.json();
          const jobId = data.job_id || 'mock-job';
          if (data.job_id && onProgress) {
            for (let attempt = 0; attempt < 240; attempt += 1) {
              await new Promise((resolve) => setTimeout(resolve, 500));
              const jobResponse = await fetch(`${config.apiBaseUrl}/jobs/${data.job_id}`);
              if (!jobResponse.ok) break;
              const job = await jobResponse.json();
              onProgress(job.current_stage || 'PROCESSING', Number(job.progress_percent || 0));
              if (job.status === 'COMPLETED') break;
              if (job.status === 'FAILED') {
                throw new Error(job.error_message || 'Document processing failed.');
              }
            }
          }
          return { document: data.document, job_id: jobId };
        }
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || errorData?.detail || `Upload failed (${res.status}).`);
      } catch (err) {
        if (acceptedUpload || backendResponded) throw err;
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
    if (!config.useMock) {
      try {
        const res = await fetch(`${config.apiBaseUrl}/chat/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn('Backend chat query failed:', err);
      }
    }

    // Dynamic mock response synthesis based on query keywords
    await new Promise((r) => setTimeout(r, 700)); // realistic thinking delay

    const q = request.query.toLowerCase();

    if (q.includes('bert') || q.includes('gpt')) {
      return {
        request_id: `req-${Date.now()}`,
        query: request.query,
        intent: 'THEMATIC',
        retrieval_strategy: request.retrieval_strategy_override || 'HYBRID',
        answer: `**BERT vs GPT Architectural Comparison:**

1. **BERT (Bidirectional Encoder Representations from Transformers):**
   - Uses masked language modeling with bi-directional attention context.
   - Ideal for classification, extractive QA, and token tagging.
   - Grounded in *"NLP Summary.pdf" (p. 8)*.

2. **GPT (Generative Pre-trained Transformer):**
   - Uses causal auto-regressive decoding with masked future tokens.
   - Optimized for open-ended text synthesis and instruction-following reasoning.
   - Grounded in *"Transformer Architecture.pdf" (p. 15)*.`,
        evidence_sufficiency: 'SUFFICIENT',
        citations: [
          {
            citation_id: 'cit-bert',
            document_id: 'doc-4',
            document_filename: 'NLP Summary.pdf',
            chunk_id: 'chunk-201',
            page_number: 8,
            excerpt: 'BERT utilizes bidirectional self-attention to fuse left and right context representations throughout all layers.',
            relevance_score: 0.96,
          },
          {
            citation_id: 'cit-gpt',
            document_id: 'doc-1',
            document_filename: 'Transformer Architecture.pdf',
            chunk_id: 'chunk-202',
            page_number: 15,
            excerpt: 'Autoregressive generative pretraining masks upper-triangular attention matrices to prevent information leakage.',
            relevance_score: 0.91,
          },
        ],
        supporting_passages: [
          'Bidirectional encoders attend to both past and future tokens simultaneously.',
        ],
        related_entities: [
          localNodes.find((n) => n.id === 'node-bert') || localNodes[0],
          localNodes.find((n) => n.id === 'node-gpt') || localNodes[1],
        ],
        supporting_paths: [],
        retrieval_trace: [
          'Intent classified as COMPARATIVE THEMATIC',
          'Identified 2 cross-architecture nodes in Knowledge Graph',
          'Synthesized comparative breakdown with 2 citations',
        ],
        warnings: [],
        metadata: { latency_ms: 38 },
      };
    }

    // Default grounded answer for Attention Mechanism (matches screenshot!)
    return {
      request_id: `req-${Date.now()}`,
      query: request.query,
      intent: 'FACTUAL',
      retrieval_strategy: request.retrieval_strategy_override || 'HYBRID',
      answer: `The attention mechanism allows the model to focus on relevant parts of the input while processing each token. Based on your documents ("Transformer Architecture.pdf", page 12):

1. **It computes Query, Key and Value vectors** for each token.
2. **Uses scaled dot-product attention** to get attention scores:
   $$\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V$$
3. **Produces a weighted sum** of values based on these scores.

**Example:** In your notes, the sentence *"The cat sat on the mat"* shows higher attention between *"cat"* and *"sat"* because they are semantically related.`,
      evidence_sufficiency: 'SUFFICIENT',
      citations: [
        {
          citation_id: 'cit-attn',
          document_id: 'doc-1',
          document_filename: 'Transformer Architecture.pdf',
          chunk_id: 'chunk-101',
          page_number: 12,
          excerpt:
            'The attention mechanism allows the model to focus on relevant parts of the input while processing each token. It computes Query, Key and Value vectors, uses scaled dot-product attention, and produces a weighted sum of values based on attention scores.',
          relevance_score: 0.95,
        },
      ],
      supporting_passages: [
        'Scaled dot-product attention uses inner products between queries and keys divided by the root dimension.',
      ],
      related_entities: [
        localNodes.find((n) => n.id === 'node-transformer') || localNodes[0],
        localNodes.find((n) => n.id === 'node-attention-mechanism') || localNodes[1],
        localNodes.find((n) => n.id === 'node-self-attention') || localNodes[2],
      ],
      supporting_paths: [],
      retrieval_trace: [
        'Query router selected HYBRID strategy (Vector + Graph Expansion)',
        'Extracted primary entity: Transformer (id: node-transformer)',
        'Retrieved page 12 from Transformer Architecture.pdf',
      ],
      warnings: [],
      metadata: { latency_ms: 45 },
    };
  },
};

// ==========================================
// VISUALS & MULTIMODAL API
// ==========================================
export const visualsApi = {
  getImageUrl(imageId: string): string {
    const config = getAppConfig();
    return `${config.apiBaseUrl}/documents/images/${imageId}`;
  },

  async getDocumentVisuals(documentId: string): Promise<VisualEvidence[]> {
    const config = getAppConfig();
    if (!config.useMock) {
      try {
        const res = await fetch(`${config.apiBaseUrl}/documents/${documentId}/visuals`);
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn(`Failed to fetch visuals for document ${documentId}:`, err);
      }
    }
    return [];
  },

  async generateVisual(request: VisualGenerationRequest): Promise<GeneratedVisual> {
    const config = getAppConfig();
    try {
      const res = await fetch(`${config.apiBaseUrl}/chat/visualize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (res.ok) {
        return await res.json();
      }
      throw new Error(`Server returned ${res.status}`);
    } catch (err: any) {
      console.warn('Backend visual generation call failed, falling back:', err);
      // Fallback deterministic Mermaid code
      const promptLower = request.prompt.toLowerCase();
      let code = `flowchart TD\n    A["Start: ${request.prompt.slice(0, 30)}"] --> B["Processing Engine"]\n    B --> C["Knowledge Graph"]\n    C --> D["Validated Output"]`;
      if (request.visual_type === 'CONCEPT_MAP') {
        code = `graph LR\n    C1["${request.prompt.slice(0, 25)}"] -- relates to --> C2["Core Concept"]\n    C2 -- connected to --> C3["Evidence"]`;
      }
      return {
        id: `mock-vis-${Date.now()}`,
        visual_type: request.visual_type,
        render_format: 'mermaid',
        content: code,
        title: `${request.visual_type.replace('_', ' ')}: ${request.prompt.slice(0, 40)}`,
        caption: 'Client fallback diagram generated locally.',
        prompt: request.prompt,
        generated_by: 'client_fallback',
        created_at: new Date().toISOString(),
      };
    }
  },
};
