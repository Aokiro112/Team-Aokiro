import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  Send,
  Sparkles,
  RefreshCw,
  Search,
  Plus,
  Minus,
  Maximize2,
  Trash2,
  CheckCircle2,
  Cpu,
  Layers,
  ArrowRight,
  Share2,
  Filter,
  Eye,
  Info,
  X,
} from 'lucide-react';
import {
  Citation,
  DocumentResponse,
  EdgeModel,
  NodeDetailResponse,
  NodeModel,
  QueryRequest,
  QueryResponse,
  RetrievalStrategy,
} from '../types/backend';
import { chatApi, documentsApi, graphApi } from '../services/api';

interface SplitWorkspaceViewProps {
  onOpenCitation: (citation: Citation) => void;
  onSelectDocument: (doc: DocumentResponse) => void;
}

export const SplitWorkspaceView: React.FC<SplitWorkspaceViewProps> = ({
  onOpenCitation,
  onSelectDocument,
}) => {
  // Document state
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat state
  const [messages, setMessages] = useState<
    Array<{
      id: string;
      sender: 'user' | 'assistant';
      text: string;
      timestamp: string;
      response?: QueryResponse;
    }>
  >([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoadingAnswer, setIsLoadingAnswer] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem('nexus_selected_model') || 'qwen3:1.7b'
  );
  const [selectedStrategy, setSelectedStrategy] = useState<RetrievalStrategy>('HYBRID');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Graph state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<NodeModel[]>([]);
  const [edges, setEdges] = useState<EdgeModel[]>([]);
  const [filterType, setFilterType] = useState<string>('All');
  const [searchGraphQuery, setSearchGraphQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<NodeModel | null>(null);
  const [nodeDetail, setNodeDetail] = useState<NodeDetailResponse | null>(null);

  // Graph Highlights (Topic cluster, Documents & Relationship paths from Answer)
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());
  const [highlightedEdgeIds, setHighlightedEdgeIds] = useState<Set<string>>(new Set());
  const [highlightInfo, setHighlightInfo] = useState<{ title: string; count: number } | null>(null);

  // Canvas transform & interaction
  const [zoom, setZoom] = useState(0.9);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const nodePositionsRef = useRef<
    Map<string, { x: number; y: number; vx: number; vy: number; isCenter?: boolean }>
  >(new Map());

  // 1. Initial Load of Real Data
  const loadDocuments = async () => {
    try {
      const res = await documentsApi.listDocuments();
      setDocuments(res.items);
    } catch (err) {
      console.warn('Failed to load documents:', err);
    }
  };

  const loadGraph = async () => {
    try {
      const data = await graphApi.getGraph(100, 0, filterType === 'All' ? undefined : filterType);
      setNodes(data.nodes);
      setEdges(data.edges);
    } catch (err) {
      console.warn('Failed to load graph:', err);
    }
  };

  useEffect(() => {
    loadDocuments();
    loadGraph();

    const handleModelChange = (e: any) => {
      if (e.detail) setSelectedModel(e.detail);
    };
    window.addEventListener('nexus_model_changed', handleModelChange);
    return () => window.removeEventListener('nexus_model_changed', handleModelChange);
  }, []);

  useEffect(() => {
    loadGraph();
  }, [filterType]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoadingAnswer]);

  // 2. Initialize Node Positions (Center on highest-degree node)
  useEffect(() => {
    if (nodes.length === 0) return;

    const positions = new Map<
      string,
      { x: number; y: number; vx: number; vy: number; isCenter?: boolean }
    >();

    // Pick node with maximum degree as center
    const sorted = [...nodes].sort((a, b) => (b.degree || 0) - (a.degree || 0));
    const centerNode = sorted[0];

    positions.set(centerNode.id, { x: 0, y: 0, vx: 0, vy: 0, isCenter: true });

    const otherNodes = sorted.slice(1);
    const radius = Math.min(320, 120 + otherNodes.length * 6);
    const angleStep = (2 * Math.PI) / (otherNodes.length || 1);

    otherNodes.forEach((node, idx) => {
      const angle = idx * angleStep - Math.PI / 2;
      const r = radius + (idx % 3 === 0 ? 40 : idx % 3 === 1 ? -30 : 0);
      positions.set(node.id, {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        vx: 0,
        vy: 0,
      });
    });

    nodePositionsRef.current = positions;
  }, [nodes]);

  // 3. Highlight Graph from Query Answer
  const highlightAnswerEvidence = (resp: QueryResponse) => {
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();

    // Related entities
    if (resp.related_entities) {
      resp.related_entities.forEach((ent) => nodeIds.add(ent.id));
    }

    // Supporting paths
    if (resp.supporting_paths) {
      resp.supporting_paths.forEach((p) => {
        p.nodes?.forEach((n) => nodeIds.add(n.id));
        p.edges?.forEach((e) => edgeIds.add(e.id));
      });
    }

    // Source documents
    if (resp.citations) {
      resp.citations.forEach((c) => nodeIds.add(c.document_id));
    }

    setHighlightedNodeIds(nodeIds);
    setHighlightedEdgeIds(edgeIds);
    setHighlightInfo({
      title: `${resp.intent} Evidence Highlighted`,
      count: nodeIds.size,
    });

    // Auto-focus camera on highlighted nodes
    if (nodeIds.size > 0 && nodePositionsRef.current.size > 0) {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      let foundCount = 0;

      nodeIds.forEach((id) => {
        const pos = nodePositionsRef.current.get(id);
        if (pos) {
          minX = Math.min(minX, pos.x);
          maxX = Math.max(maxX, pos.x);
          minY = Math.min(minY, pos.y);
          maxY = Math.max(maxY, pos.y);
          foundCount++;
        }
      });

      if (foundCount > 0) {
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        setPan({ x: -centerX * 0.9, y: -centerY * 0.9 });
        setZoom(1.1);
      }
    }
  };

  const clearHighlight = () => {
    setHighlightedNodeIds(new Set());
    setHighlightedEdgeIds(new Set());
    setHighlightInfo(null);
  };

  // 4. Send Chat Query
  const handleSendMessage = async (textToSend?: string) => {
    const q = textToSend || inputQuery;
    if (!q.trim() || isLoadingAnswer) return;

    const userMsgId = `msg-${Date.now()}`;
    const userMessage = {
      id: userMsgId,
      sender: 'user' as const,
      text: q.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!textToSend) setInputQuery('');
    setIsLoadingAnswer(true);

    try {
      const request: QueryRequest = {
        query: q.trim(),
        collection_id: 'default',
        include_graph: true,
        max_citations: 5,
        retrieval_strategy_override: selectedStrategy,
        model: selectedModel,
      };

      const res = await chatApi.queryKnowledgeBase(request);

      const assistantMsg = {
        id: `msg-${Date.now() + 1}`,
        sender: 'assistant' as const,
        text: res.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        response: res,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Automatically highlight the evidence paths on the right graph!
      highlightAnswerEvidence(res);
    } catch (err: any) {
      console.error('Chat query error:', err);
    } finally {
      setIsLoadingAnswer(false);
    }
  };

  // 5. File Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus(`Ingesting ${file.name}...`);
    try {
      await documentsApi.uploadDocument(file);
      setUploadStatus('Ingested successfully!');
      setTimeout(() => setUploadStatus(null), 3000);
      await loadDocuments();
      await loadGraph();
    } catch (err: any) {
      setUploadStatus(`Upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      await documentsApi.deleteDocument(docId);
      await loadDocuments();
      await loadGraph();
    } catch (err) {
      console.error('Failed to delete doc:', err);
    }
  };

  const handleSelectNode = async (node: NodeModel) => {
    setSelectedNode(node);
    try {
      const detail = await graphApi.getNodeDetails(node.id);
      setNodeDetail(detail);
    } catch (err) {
      console.warn('Failed to load node detail:', err);
    }
  };

  // 6. Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // Background subtle grid
      ctx.strokeStyle = '#F0F0F4';
      ctx.lineWidth = 1;
      const gridSize = 40 * zoom;
      const startX = ((pan.x % gridSize) + gridSize) % gridSize;
      const startY = ((pan.y % gridSize) + gridSize) % gridSize;

      ctx.beginPath();
      for (let x = startX; x < width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = startY; y < height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // Transform coordinate space
      ctx.translate(width / 2 + pan.x, height / 2 + pan.y);
      ctx.scale(zoom, zoom);

      const positions = nodePositionsRef.current;
      const hasHighlights = highlightedNodeIds.size > 0;

      // Draw Edges
      edges.forEach((edge) => {
        const sourcePos = positions.get(edge.source);
        const targetPos = positions.get(edge.target);
        if (!sourcePos || !targetPos) return;

        const isHighlightedEdge =
          highlightedEdgeIds.has(edge.id) ||
          (highlightedNodeIds.has(edge.source) && highlightedNodeIds.has(edge.target));

        ctx.beginPath();
        ctx.moveTo(sourcePos.x, sourcePos.y);
        ctx.lineTo(targetPos.x, targetPos.y);

        if (isHighlightedEdge) {
          ctx.strokeStyle = '#10B981'; // Vibrant emerald highlight
          ctx.lineWidth = 2.8;
          ctx.setLineDash([4, 2]);
        } else if (hasHighlights) {
          ctx.strokeStyle = 'rgba(226, 232, 240, 0.4)';
          ctx.lineWidth = 0.8;
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = '#E2E8F0';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([]);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw edge relationship label if highlighted or zoom is high
        if ((isHighlightedEdge || zoom > 1.2) && edge.relationship_type) {
          const midX = (sourcePos.x + targetPos.x) / 2;
          const midY = (sourcePos.y + targetPos.y) / 2;
          ctx.fillStyle = isHighlightedEdge ? '#047857' : '#94A3B8';
          ctx.font = '9px ui-monospace, SFMono-Regular, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(edge.relationship_type, midX, midY - 3);
        }
      });

      // Draw Nodes
      nodes.forEach((node) => {
        const pos = positions.get(node.id);
        if (!pos) return;

        const isHighlighted = highlightedNodeIds.has(node.id);
        const isHovered = hoveredNodeId === node.id;
        const isSelected = selectedNode?.id === node.id;

        // Base node radius by degree
        let radius = Math.min(24, Math.max(12, 10 + (node.degree || 1) * 1.5));
        if (isHighlighted) radius += 4;

        // Dim non-highlighted nodes when highlights are active
        const opacity = hasHighlights && !isHighlighted ? 0.25 : 1.0;

        ctx.save();
        ctx.globalAlpha = opacity;

        // Outer Glow for highlighted nodes
        if (isHighlighted) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, radius + 7, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(pos.x, pos.y, radius + 3, 0, Math.PI * 2);
          ctx.strokeStyle = '#10B981';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Selection ring
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, radius + 5, 0, Math.PI * 2);
          ctx.strokeStyle = '#0F172A';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Node Body
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);

        if (isHighlighted) {
          ctx.fillStyle = '#0F172A';
        } else if (node.entity_type === 'Topic') {
          ctx.fillStyle = '#8B5CF6'; // Violet for topics
        } else if (node.entity_type === 'Document') {
          ctx.fillStyle = '#3B82F6'; // Blue for documents
        } else {
          ctx.fillStyle = '#1E293B'; // Dark Slate for entities
        }
        ctx.fill();

        // Node Label
        ctx.fillStyle = isHighlighted ? '#0F172A' : '#334155';
        ctx.font = isHighlighted
          ? 'bold 12px sans-serif'
          : '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const label = node.canonical_name;
        const truncated = label.length > 20 ? label.slice(0, 18) + '...' : label;
        ctx.fillText(truncated, pos.x, pos.y + radius + 4);

        // Subtitle badge for highlighted nodes
        if (isHighlighted) {
          ctx.fillStyle = '#10B981';
          ctx.font = 'bold 9px ui-monospace, monospace';
          ctx.fillText('● EVIDENCE', pos.x, pos.y + radius + 18);
        }

        ctx.restore();
      });

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [nodes, edges, highlightedNodeIds, highlightedEdgeIds, zoom, pan, hoveredNodeId, selectedNode]);

  // Canvas Mouse Interactions
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
      return;
    }

    // Check hover
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2 - pan.x;
    const mouseY = e.clientY - rect.top - rect.height / 2 - pan.y;

    const positions = nodePositionsRef.current;
    let foundHover: string | null = null;

    nodes.forEach((n) => {
      const pos = positions.get(n.id);
      if (pos) {
        const dx = (mouseX - pos.x * zoom) / zoom;
        const dy = (mouseY - pos.y * zoom) / zoom;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 24) foundHover = n.id;
      }
    });

    setHoveredNodeId(foundHover);
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2 - pan.x;
    const mouseY = e.clientY - rect.top - rect.height / 2 - pan.y;

    const positions = nodePositionsRef.current;
    let clickedNode: NodeModel | null = null;

    nodes.forEach((n) => {
      const pos = positions.get(n.id);
      if (pos) {
        const dx = (mouseX - pos.x * zoom) / zoom;
        const dy = (mouseY - pos.y * zoom) / zoom;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 24) clickedNode = n;
      }
    });

    if (clickedNode) {
      handleSelectNode(clickedNode);
    } else {
      setSelectedNode(null);
      setNodeDetail(null);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.min(2.5, Math.max(0.4, prev * zoomFactor)));
  };

  const samplePrompts = [
    'What are the main themes across these documents?',
    'What lessons does Morrie teach about life and death?',
    'What is the relationship between Morrie and Mitch?',
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-white">
      {/* ======================================================== */}
      {/* LEFT HALF: DOCUMENT UPLOADER & CHAT BOX                   */}
      {/* ======================================================== */}
      <div className="w-1/2 flex flex-col border-r border-[#EBEBEF] h-full overflow-hidden bg-[#FAFAFC]">
        {/* Top: Document Ingestion Section */}
        <div className="p-4 border-b border-[#EBEBEF] bg-white shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800 font-mono">
                Document Ingestion Pipeline
              </h2>
            </div>
            <span className="text-[11px] font-mono text-neutral-400">
              {documents.length} Indexed
            </span>
          </div>

          {/* Compact Upload Bar */}
          <div className="flex items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf,.txt"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-dashed border-neutral-300 hover:border-neutral-900 bg-neutral-50/80 hover:bg-neutral-100/80 transition-all text-xs font-semibold text-neutral-700 cursor-pointer shadow-2xs"
            >
              {isUploading ? (
                <>
                  <RefreshCw size={14} className="animate-spin text-neutral-900" />
                  <span>{uploadStatus || 'Processing with Fast NLP...'}</span>
                </>
              ) : (
                <>
                  <UploadCloud size={15} className="text-neutral-500" />
                  <span>Upload PDF or TXT to Knowledge Base</span>
                </>
              )}
            </button>
          </div>

          {/* Document list */}
          {documents.length > 0 && (
            <div className="mt-3 max-h-28 overflow-y-auto space-y-1.5 pr-1">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 border border-neutral-200/80 text-xs"
                >
                  <div
                    className="flex items-center gap-2 min-w-0 cursor-pointer"
                    onClick={() => onSelectDocument(doc)}
                  >
                    <FileText size={14} className="text-neutral-600 shrink-0" />
                    <span className="font-semibold text-neutral-800 truncate max-w-[200px]" title={doc.filename}>
                      {doc.filename}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-neutral-200 text-neutral-700">
                      {doc.total_pages}p · {doc.total_chunks} chunks
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-100 text-emerald-800 uppercase">
                      {doc.status}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteDocument(doc.id)}
                    className="p-1 text-neutral-400 hover:text-red-600 rounded transition-colors"
                    title="Delete document"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Middle: Grounded Chat Messages Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-400">
              <div className="w-12 h-12 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center mb-3 shadow-2xs">
                <Sparkles size={20} className="text-neutral-800" />
              </div>
              <h3 className="text-sm font-bold text-neutral-800">Ask Your Knowledge Base</h3>
              <p className="text-xs text-neutral-500 max-w-sm mt-1 leading-relaxed">
                Queries are intelligently routed to answer broad thematic questions or multi-hop factual chains.
                Evidence paths are visually highlighted on the right.
              </p>

              {/* Sample Prompts */}
              <div className="mt-4 flex flex-col gap-1.5 w-full max-w-sm">
                {samplePrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSendMessage(prompt)}
                    className="text-left text-xs p-2 rounded-xl bg-white hover:bg-neutral-100 border border-neutral-200/80 text-neutral-700 transition-colors"
                  >
                    "{prompt}"
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[90%] rounded-2xl p-4 text-xs leading-relaxed ${
                      isUser
                        ? 'bg-neutral-900 text-white rounded-tr-xs'
                        : 'bg-white border border-neutral-200 text-neutral-800 rounded-tl-xs shadow-2xs'
                    }`}
                  >
                    {/* Message Text */}
                    <div className="whitespace-pre-wrap">{msg.text}</div>

                    {/* Citations & Evidence Highlights (Assistant) */}
                    {!isUser && msg.response && (
                      <div className="mt-3 pt-3 border-t border-neutral-100 space-y-2">
                        {/* Highlight Button */}
                        <button
                          onClick={() => highlightAnswerEvidence(msg.response!)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-[11px] font-semibold transition-colors"
                        >
                          <Share2 size={12} />
                          <span>Highlight Evidence on Graph</span>
                        </button>

                        {/* Citations */}
                        {msg.response.citations.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {msg.response.citations.map((c) => (
                              <button
                                key={c.citation_id}
                                onClick={() => onOpenCitation(c)}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-100 hover:bg-neutral-200 text-[10px] text-neutral-700 font-mono transition-colors"
                              >
                                <FileText size={11} />
                                <span className="truncate max-w-[120px]">{c.document_filename}</span>
                                <span className="text-neutral-500">p.{c.page_number}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Model & Intent Badge */}
                        <div className="flex items-center gap-2 pt-1 text-[10px] font-mono text-neutral-400">
                          {msg.response.model_used && (
                            <span className="flex items-center gap-1 text-emerald-700">
                              <Cpu size={10} />
                              {msg.response.model_used}
                            </span>
                          )}
                          <span>•</span>
                          <span className="uppercase text-neutral-600 font-bold">{msg.response.intent}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {isLoadingAnswer && (
            <div className="flex items-center gap-2 p-3 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-500 shadow-2xs">
              <RefreshCw size={13} className="animate-spin text-neutral-900" />
              <span>Routing query & synthesizing grounded answer...</span>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Bottom: Chat Input Box */}
        <div className="p-3 border-t border-[#EBEBEF] bg-white shrink-0 space-y-2">
          {/* Controls Bar: Model & Strategy */}
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2">
              <span className="font-mono text-neutral-400 uppercase text-[10px]">Model:</span>
              <span className="font-semibold text-neutral-800 bg-neutral-100 px-2 py-0.5 rounded font-mono">
                {selectedModel}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSelectedStrategy(selectedStrategy === 'HYBRID' ? 'VECTOR_ONLY' : 'HYBRID')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-colors ${
                  selectedStrategy === 'HYBRID'
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {selectedStrategy === 'HYBRID' ? 'HYBRID (Graph+Vector)' : 'VECTOR ONLY'}
              </button>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask a thematic or factual question..."
              className="flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:border-neutral-900 bg-neutral-50/50"
            />
            <button
              type="submit"
              disabled={isLoadingAnswer || !inputQuery.trim()}
              className="px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs shrink-0"
            >
              <Send size={13} />
              <span>Ask</span>
            </button>
          </form>
        </div>
      </div>

      {/* ======================================================== */}
      {/* RIGHT HALF: INTERACTIVE KNOWLEDGE GRAPH                   */}
      {/* ======================================================== */}
      <div className="w-1/2 flex flex-col h-full overflow-hidden relative bg-white">
        {/* Top Floating Controls Bar */}
        <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
          {/* Left: Active Highlight Badge */}
          <div className="pointer-events-auto">
            {highlightInfo ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-medium shadow-md animate-in fade-in">
                <Sparkles size={13} />
                <span>{highlightInfo.title} ({highlightInfo.count} nodes)</span>
                <button
                  onClick={clearHighlight}
                  className="p-0.5 hover:bg-emerald-600 rounded transition-colors ml-1"
                  title="Clear highlight"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/90 backdrop-blur-xs border border-neutral-200 text-neutral-800 text-xs font-semibold shadow-2xs">
                <Share2 size={13} className="text-neutral-500" />
                <span>Knowledge Graph</span>
                <span className="text-[10px] font-mono text-neutral-400">({nodes.length} nodes)</span>
              </div>
            )}
          </div>

          {/* Right: Zoom & Filter Controls */}
          <div className="pointer-events-auto flex items-center gap-1.5 bg-white/90 backdrop-blur-xs border border-neutral-200 p-1 rounded-xl shadow-2xs">
            <button
              onClick={() => setZoom((z) => Math.min(2.5, z * 1.15))}
              className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-600"
              title="Zoom In"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(0.4, z * 0.85))}
              className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-600"
              title="Zoom Out"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={() => {
                setZoom(0.9);
                setPan({ x: 0, y: 0 });
              }}
              className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-600"
              title="Reset View"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>

        {/* Canvas Renderer */}
        <div className="flex-1 h-full w-full relative">
          <canvas
            ref={canvasRef}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onClick={handleCanvasClick}
            onWheel={handleWheel}
            className="w-full h-full cursor-grab active:cursor-grabbing block"
          />

          {/* Floating Node Inspector Flyout */}
          {selectedNode && (
            <div className="absolute bottom-4 right-4 max-w-sm w-80 bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-neutral-200 p-4 z-20 animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold font-mono tracking-wider px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">
                    {selectedNode.entity_type}
                  </span>
                  <h4 className="text-sm font-bold text-neutral-900 mt-1">
                    {selectedNode.canonical_name}
                  </h4>
                </div>
                <button
                  onClick={() => {
                    setSelectedNode(null);
                    setNodeDetail(null);
                  }}
                  className="p-1 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 rounded-lg"
                >
                  <X size={14} />
                </button>
              </div>

              {selectedNode.description && (
                <p className="text-xs text-neutral-600 mt-2 leading-relaxed">
                  {selectedNode.description}
                </p>
              )}

              {nodeDetail && nodeDetail.neighbors && nodeDetail.neighbors.length > 0 && (
                <div className="mt-3 pt-3 border-t border-neutral-100">
                  <span className="text-[10px] uppercase font-bold font-mono text-neutral-400 block mb-1.5">
                    Connected Relationships ({nodeDetail.neighbors.length})
                  </span>
                  <div className="max-h-24 overflow-y-auto space-y-1">
                    {nodeDetail.neighbors.map((nb, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] p-1.5 rounded bg-neutral-50">
                        <span className="text-neutral-500 font-mono text-[9px] uppercase">
                          {nb.entity_type}
                        </span>
                        <span className="font-semibold text-neutral-800">
                          {nb.canonical_name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
