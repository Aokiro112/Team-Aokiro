import {
  DocumentResponse,
  GraphResponse,
  NodeDetailResponse,
  NodeModel,
  EdgeModel,
  TopicModel,
  TopicDetailResponse,
  QueryResponse,
  Citation,
} from '../types/backend';

export const INITIAL_DOCUMENTS: DocumentResponse[] = [
  {
    id: "doc-1",
    filename: "Transformer Architecture.pdf",
    content_type: "application/pdf",
    collection_id: "default",
    content_hash: "hash-8f43a9b",
    file_size_bytes: 4280192,
    status: "INDEXED",
    total_pages: 52,
    total_chunks: 82,
    total_entities: 48,
    total_relationships: 96,
    created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    metadata: { author: "Vaswani et al.", domain: "AI/NLP" }
  },
  {
    id: "doc-2",
    filename: "Machine Learning Basics.pdf",
    content_type: "application/pdf",
    collection_id: "default",
    content_hash: "hash-3c12d4e",
    file_size_bytes: 2198420,
    status: "INDEXED",
    total_pages: 28,
    total_chunks: 44,
    total_entities: 32,
    total_relationships: 64,
    created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    metadata: { author: "Prof. Bishop", domain: "Machine Learning" }
  },
  {
    id: "doc-3",
    filename: "Computer Vision Notes.pdf",
    content_type: "application/pdf",
    collection_id: "default",
    content_hash: "hash-7a91c0b",
    file_size_bytes: 3481020,
    status: "PROCESSING",
    total_pages: 36,
    total_chunks: 58,
    total_entities: 24,
    total_relationships: 40,
    created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    metadata: { author: "Stanford CS231n", domain: "Vision" }
  },
  {
    id: "doc-4",
    filename: "NLP Summary.pdf",
    content_type: "application/pdf",
    collection_id: "default",
    content_hash: "hash-9e88fa1",
    file_size_bytes: 1840190,
    status: "INDEXED",
    total_pages: 31,
    total_chunks: 50,
    total_entities: 38,
    total_relationships: 72,
    created_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    metadata: { author: "Manning et al.", domain: "NLP" }
  },
  {
    id: "doc-5",
    filename: "AI Research Paper.pdf",
    content_type: "application/pdf",
    collection_id: "default",
    content_hash: "hash-5d32fe7",
    file_size_bytes: 1205930,
    status: "INDEXED",
    total_pages: 18,
    total_chunks: 29,
    total_entities: 22,
    total_relationships: 38,
    created_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    metadata: { author: "DeepMind", domain: "Foundations" }
  },
  {
    id: "doc-6",
    filename: "Deep Learning Foundations.pdf",
    content_type: "application/pdf",
    collection_id: "default",
    content_hash: "hash-1b22de9",
    file_size_bytes: 5120000,
    status: "INDEXED",
    total_pages: 45,
    total_chunks: 70,
    total_entities: 45,
    total_relationships: 90,
    created_at: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString(),
    metadata: { author: "Goodfellow et al.", domain: "Deep Learning" }
  }
];

export const MOCK_NODES: NodeModel[] = [
  {
    id: "node-transformer",
    canonical_name: "Transformer",
    entity_type: "Concept",
    description: "A deep learning architecture based on self-attention mechanisms, widely used in NLP and other domains.",
    degree: 11,
    topic_ids: ["topic-transformers", "topic-nlp"],
    document_ids: ["doc-1", "doc-4"],
    chunk_ids: ["chunk-101", "chunk-102"],
    metadata: { is_primary: true }
  },
  {
    id: "node-attention-mechanism",
    canonical_name: "Attention Mechanism",
    entity_type: "Topic",
    description: "Algorithmic technique that allows neural networks to concentrate on specific subsets of inputs.",
    degree: 8,
    topic_ids: ["topic-transformers"],
    document_ids: ["doc-1"],
    chunk_ids: ["chunk-103"],
    metadata: {}
  },
  {
    id: "node-self-attention",
    canonical_name: "Self Attention",
    entity_type: "Concept",
    description: "Relates different positions of a single sequence to compute a representation of the sequence.",
    degree: 7,
    topic_ids: ["topic-transformers"],
    document_ids: ["doc-1"],
    chunk_ids: ["chunk-104"],
    metadata: {}
  },
  {
    id: "node-bert",
    canonical_name: "BERT",
    entity_type: "Concept",
    description: "Bidirectional Encoder Representations from Transformers for language representation.",
    degree: 5,
    topic_ids: ["topic-transformers", "topic-nlp"],
    document_ids: ["doc-1", "doc-4"],
    chunk_ids: ["chunk-105"],
    metadata: {}
  },
  {
    id: "node-nlp",
    canonical_name: "Natural Language Processing",
    entity_type: "Topic",
    description: "Broad domain focusing on computational methods for processing and analyzing natural languages.",
    degree: 9,
    topic_ids: ["topic-nlp"],
    document_ids: ["doc-1", "doc-4"],
    chunk_ids: ["chunk-106"],
    metadata: {}
  },
  {
    id: "node-gpt",
    canonical_name: "GPT",
    entity_type: "Concept",
    description: "Generative Pre-trained Transformer series employing causal self-attention for text generation.",
    degree: 6,
    topic_ids: ["topic-transformers", "topic-llm"],
    document_ids: ["doc-1", "doc-5"],
    chunk_ids: ["chunk-107"],
    metadata: {}
  },
  {
    id: "node-text-generation",
    canonical_name: "Text Generation",
    entity_type: "Concept",
    description: "Synthesis of coherent natural language output using autoregressive probabilistic models.",
    degree: 4,
    topic_ids: ["topic-nlp"],
    document_ids: ["doc-1", "doc-4"],
    chunk_ids: ["chunk-108"],
    metadata: {}
  },
  {
    id: "node-llm",
    canonical_name: "Large Language Models",
    entity_type: "Topic",
    description: "Massive scale neural networks trained on vast token corpora to generalize across diverse NLP tasks.",
    degree: 8,
    topic_ids: ["topic-llm"],
    document_ids: ["doc-1", "doc-5"],
    chunk_ids: ["chunk-109"],
    metadata: {}
  },
  {
    id: "node-training",
    canonical_name: "Training",
    entity_type: "Concept",
    description: "Optimization process minimizing cross-entropy loss via backpropagation and AdamW optimizer.",
    degree: 6,
    topic_ids: ["topic-ml"],
    document_ids: ["doc-1", "doc-2"],
    chunk_ids: ["chunk-110"],
    metadata: {}
  },
  {
    id: "node-tokenization",
    canonical_name: "Tokenization",
    entity_type: "Concept",
    description: "Subword segmentation (Byte-Pair Encoding, WordPiece) transforming text strings into discrete vocabulary tokens.",
    degree: 4,
    topic_ids: ["topic-nlp"],
    document_ids: ["doc-1"],
    chunk_ids: ["chunk-111"],
    metadata: {}
  },
  {
    id: "node-positional-encoding",
    canonical_name: "Positional Encoding",
    entity_type: "Concept",
    description: "Sinusoidal or learned vectors injected into input embeddings to supply sequence order awareness.",
    degree: 3,
    topic_ids: ["topic-transformers"],
    document_ids: ["doc-1"],
    chunk_ids: ["chunk-112"],
    metadata: {}
  },
  {
    id: "node-embedding",
    canonical_name: "Embedding",
    entity_type: "Concept",
    description: "Dense vector spaces mapping discrete tokens into continuous semantic geometric coordinates.",
    degree: 5,
    topic_ids: ["topic-ml", "topic-nlp"],
    document_ids: ["doc-1", "doc-2"],
    chunk_ids: ["chunk-113"],
    metadata: {}
  }
];

export const MOCK_EDGES: EdgeModel[] = [
  {
    id: "edge-1",
    source: "node-transformer",
    target: "node-attention-mechanism",
    relationship_type: "UTILIZES",
    evidence: "The Transformer relies entirely on an attention mechanism to draw global dependencies between input and output.",
    confidence: 0.98,
    document_ids: ["doc-1"],
    chunk_ids: ["chunk-101"],
    metadata: {}
  },
  {
    id: "edge-2",
    source: "node-attention-mechanism",
    target: "node-self-attention",
    relationship_type: "SUBTYPE_OF",
    evidence: "Self-attention is an attention mechanism relating different positions of a single sequence.",
    confidence: 0.95,
    document_ids: ["doc-1"],
    chunk_ids: ["chunk-103"],
    metadata: {}
  },
  {
    id: "edge-3",
    source: "node-transformer",
    target: "node-bert",
    relationship_type: "ARCHITECTURAL_BASE_FOR",
    evidence: "BERT's model architecture is a multi-layer bidirectional Transformer encoder.",
    confidence: 0.96,
    document_ids: ["doc-1", "doc-4"],
    chunk_ids: ["chunk-105"],
    metadata: {}
  },
  {
    id: "edge-4",
    source: "node-transformer",
    target: "node-nlp",
    relationship_type: "APPLIED_IN",
    evidence: "Transformers revolutionized natural language processing by enabling parallelized sequence modeling.",
    confidence: 0.99,
    document_ids: ["doc-1", "doc-4"],
    chunk_ids: ["chunk-106"],
    metadata: {}
  },
  {
    id: "edge-5",
    source: "node-transformer",
    target: "node-gpt",
    relationship_type: "ARCHITECTURAL_BASE_FOR",
    evidence: "Generative Pre-trained Transformer models use masked multi-head self-attention decoder stacks.",
    confidence: 0.97,
    document_ids: ["doc-1", "doc-5"],
    chunk_ids: ["chunk-107"],
    metadata: {}
  },
  {
    id: "edge-6",
    source: "node-gpt",
    target: "node-text-generation",
    relationship_type: "CAPABILITY_OF",
    evidence: "GPT is optimized for autoregressive natural language text generation.",
    confidence: 0.94,
    document_ids: ["doc-5"],
    chunk_ids: ["chunk-108"],
    metadata: {}
  },
  {
    id: "edge-7",
    source: "node-transformer",
    target: "node-llm",
    relationship_type: "FOUNDATIONAL_TO",
    evidence: "Modern Large Language Models are predominantly instantiated with Transformer architectures.",
    confidence: 0.99,
    document_ids: ["doc-1", "doc-5"],
    chunk_ids: ["chunk-109"],
    metadata: {}
  },
  {
    id: "edge-8",
    source: "node-transformer",
    target: "node-training",
    relationship_type: "REQUIRES",
    evidence: "Training transformers involves masked language modeling and cross-entropy optimization.",
    confidence: 0.92,
    document_ids: ["doc-1", "doc-2"],
    chunk_ids: ["chunk-110"],
    metadata: {}
  },
  {
    id: "edge-9",
    source: "node-transformer",
    target: "node-tokenization",
    relationship_type: "PREPROCESSING_FOR",
    evidence: "Input sentences undergo subword tokenization before being projected into the Transformer.",
    confidence: 0.93,
    document_ids: ["doc-1"],
    chunk_ids: ["chunk-111"],
    metadata: {}
  },
  {
    id: "edge-10",
    source: "node-transformer",
    target: "node-positional-encoding",
    relationship_type: "INCORPORATES",
    evidence: "Since transformers lack recurrence, positional encodings must be injected to retain token order.",
    confidence: 0.97,
    document_ids: ["doc-1"],
    chunk_ids: ["chunk-112"],
    metadata: {}
  },
  {
    id: "edge-11",
    source: "node-transformer",
    target: "node-embedding",
    relationship_type: "INGESTS",
    evidence: "Input tokens are mapped into learned dense embeddings of dimension d_model = 512.",
    confidence: 0.95,
    document_ids: ["doc-1"],
    chunk_ids: ["chunk-113"],
    metadata: {}
  }
];

export const MOCK_TOPICS: TopicModel[] = [
  {
    id: "topic-ml",
    name: "Machine Learning",
    description: "A field of AI that enables systems to learn from data without explicit programming.",
    keywords: ["supervised", "unsupervised", "loss", "gradient", "evaluation", "validation"],
    document_count: 4,
    entity_count: 42,
    document_ids: ["doc-1", "doc-2", "doc-5", "doc-6"],
    entity_ids: ["node-training", "node-embedding"],
    representative_passages: [
      "Machine learning algorithms build mathematical models based on sample training data to make predictions or decisions.",
      "Loss minimization using gradient descent forms the bedrock of modern empirical risk minimization."
    ],
    metadata: {
      related_concepts: [
        { name: "Learning Algorithms", count: 12 },
        { name: "Neural Networks", count: 9 },
        { name: "Training", count: 7 },
        { name: "Model Evaluation", count: 6 }
      ]
    }
  },
  {
    id: "topic-transformers",
    name: "Transformers",
    description: "Deep learning architecture adopting self-attention to weight input data significance differentially.",
    keywords: ["attention", "multi-head", "encoder", "decoder", "feedforward", "residual"],
    document_count: 3,
    entity_count: 38,
    document_ids: ["doc-1", "doc-4", "doc-5"],
    entity_ids: ["node-transformer", "node-attention-mechanism", "node-self-attention"],
    representative_passages: [
      "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks; we propose Transformer instead.",
      "Multi-head attention allows the model to jointly attend to information from different representation subspaces."
    ],
    metadata: {
      related_concepts: [
        { name: "Self-Attention", count: 15 },
        { name: "Multi-Head Projection", count: 11 },
        { name: "Positional Encoding", count: 7 },
        { name: "Residual Connections", count: 5 }
      ]
    }
  },
  {
    id: "topic-cv",
    name: "Computer Vision",
    description: "Interdisciplinary scientific field dealing with digital image and video processing and semantic extraction.",
    keywords: ["convolution", "feature map", "kernel", "spatial", "pooling", "classification"],
    document_count: 2,
    entity_count: 27,
    document_ids: ["doc-3", "doc-6"],
    entity_ids: [],
    representative_passages: [
      "Convolutional layers preserve spatial 2D relationships between pixels through localized receptive fields.",
      "Vision Transformers now challenge CNNs by partitioning images into visual patches treated as discrete tokens."
    ],
    metadata: {
      related_concepts: [
        { name: "Convolutional Filters", count: 10 },
        { name: "Feature Maps", count: 8 },
        { name: "Patch Projection", count: 5 },
        { name: "Image Segmentation", count: 4 }
      ]
    }
  },
  {
    id: "topic-nlp",
    name: "Natural Language Processing",
    description: "Subfield of computer science and artificial intelligence concerned with computer-human language interactions.",
    keywords: ["syntax", "semantics", "parsing", "tokenization", "sentiment", "embeddings"],
    document_count: 3,
    entity_count: 24,
    document_ids: ["doc-1", "doc-4", "doc-5"],
    entity_ids: ["node-nlp", "node-bert", "node-text-generation"],
    representative_passages: [
      "Natural language understanding requires parsing morphological, syntactic, and discourse-level structures.",
      "Pretrained contextual embeddings capture polysemy and syntactic dependencies across long contexts."
    ],
    metadata: {
      related_concepts: [
        { name: "Part-of-Speech Tagging", count: 8 },
        { name: "Named Entity Recognition", count: 7 },
        { name: "Semantic Parsing", count: 5 },
        { name: "Contextual Embeddings", count: 4 }
      ]
    }
  },
  {
    id: "topic-dl",
    name: "Deep Learning",
    description: "Subset of machine learning based on artificial neural networks with multiple representation layers.",
    keywords: ["backprop", "activation", "ReLU", "normalization", "regularization", "GPU"],
    document_count: 4,
    entity_count: 20,
    document_ids: ["doc-1", "doc-2", "doc-3", "doc-6"],
    entity_ids: ["node-training"],
    representative_passages: [
      "Deep architectures learn hierarchical representations where higher layers amplify aspects of the input important for discrimination.",
      "Stochastic gradient descent with momentum accelerates convergence along directional ravines."
    ],
    metadata: {
      related_concepts: [
        { name: "Backpropagation", count: 9 },
        { name: "Layer Normalization", count: 5 },
        { name: "Weight Initialization", count: 4 },
        { name: "Vanishing Gradients", count: 2 }
      ]
    }
  }
];

export const INITIAL_CHAT_MESSAGES: Array<{
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  response?: QueryResponse;
}> = [
  {
    id: "msg-1",
    sender: "user",
    text: "Explain the attention mechanism in transformers with a simple example from my notes.",
    timestamp: "10:42 AM"
  },
  {
    id: "msg-2",
    sender: "assistant",
    text: `The attention mechanism allows the model to focus on relevant parts of the input while processing each token. Based on your documents ("Transformer Architecture.pdf", page 12):

1. **It computes Query, Key and Value vectors** for each token using learned linear projections.
2. **Uses scaled dot-product attention** to get attention scores:
   $$\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V$$
3. **Produces a weighted sum** of values based on these attention distribution scores.

**Example:** In your notes, the sentence *"The cat sat on the mat"* shows higher attention between *"cat"* and *"sat"* because they are semantically related in the sentence structure.`,
    timestamp: "10:42 AM",
    response: {
      request_id: "req-qa-9812",
      query: "Explain the attention mechanism in transformers with a simple example from my notes.",
      intent: "FACTUAL",
      retrieval_strategy: "HYBRID",
      answer: `The attention mechanism allows the model to focus on relevant parts of the input while processing each token. Based on your documents ("Transformer Architecture.pdf", page 12):

1. It computes Query, Key and Value vectors for each token.
2. Uses scaled dot-product attention to get attention scores.
3. Produces a weighted sum of values based on these scores.

Example: In your notes, the sentence "The cat sat on the mat" shows higher attention between "cat" and "sat" because they are semantically related.`,
      evidence_sufficiency: "SUFFICIENT",
      citations: [
        {
          citation_id: "cit-1",
          document_id: "doc-1",
          document_filename: "Transformer Architecture.pdf",
          chunk_id: "chunk-101",
          page_number: 12,
          excerpt: "An attention function can be described as mapping a query and a set of key-value pairs to an output, where the query, keys, values, and output are all vectors. In the sentence 'The cat sat on the mat', token representations attend selectively to associated subject-verb linkages.",
          relevance_score: 0.94
        }
      ],
      supporting_passages: [
        "Scaled dot-product attention operates by computing inner products of queries with keys, normalized by square root of dimensionality.",
        "Self-attention allows each position in the encoder to attend to all positions in the previous layer of the encoder."
      ],
      related_entities: [
        MOCK_NODES[0], // Transformer
        MOCK_NODES[1], // Attention Mechanism
        MOCK_NODES[2], // Self Attention
      ],
      supporting_paths: [
        {
          nodes: [MOCK_NODES[0], MOCK_NODES[1], MOCK_NODES[2]],
          edges: [MOCK_EDGES[0], MOCK_EDGES[1]],
          length: 2,
          evidence_chunks: ["chunk-101", "chunk-103"],
          description: "Transformer -> UTILIZES -> Attention Mechanism -> SUBTYPE_OF -> Self Attention"
        }
      ],
      retrieval_trace: [
        "Query router classified intent as FACTUAL (hybrid graph + vector)",
        "Vector search identified 4 candidate chunks (top score: 0.94)",
        "Knowledge graph expanded 2-hop neighborhood around 'Transformer'",
        "Resolved 3 cross-entity citations with verified page references"
      ],
      warnings: [],
      metadata: {
        latency_ms: 42,
        tokens_evaluated: 640
      }
    }
  }
];
