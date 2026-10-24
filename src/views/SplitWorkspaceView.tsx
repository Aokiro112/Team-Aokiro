import React, { useState, useEffect, useRef, useMemo } from 'react';
// @ts-ignore
import ForceGraph2D from 'react-force-graph-2d';
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
  Compass,
  MessageSquare,
  Network,
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
  ChatMessage,
} from '../types/backend';
import { chatApi, documentsApi, graphApi } from '../services/api';
import { RichAnswerRenderer } from '../components/chat/RichAnswerRenderer';
import { RetrievalLoadingIndicator } from '../components/chat/RetrievalLoadingIndicator';

interface SplitWorkspaceViewProps {
  onOpenCitation: (citation: Citation) => void;
  onSelectDocument: (doc: DocumentResponse) => void;
  messages?: ChatMessage[];
  setMessages?: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onClearChat?: () => void;
}

interface NodeSimState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  anchorX: number;
  anchorY: number;
  width: number;
  height: number;
  isTopic: boolean;
}

export const SplitWorkspaceView: React.FC<SplitWorkspaceViewProps> = ({
  onOpenCitation,
  onSelectDocument,
  messages: propMessages,
  setMessages: propSetMessages,
  onClearChat,
}) => {
  // Document state
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat state (props from App.tsx or localStorage fallback)
  const [fallbackMessages, setFallbackMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('nexus_chat_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const messages = propMessages ?? fallbackMessages;
  const setMessages = propSetMessages ?? setFallbackMessages;

  const handleClearChat = () => {
    if (onClearChat) {
      onClearChat();
    } else {
      setMessages([]);
      try {
        localStorage.removeItem('nexus_chat_history');
      } catch (e) {
        console.warn(e);
      }
    }
  };

  const [inputQuery, setInputQuery] = useState('');
  const [isLoadingAnswer, setIsLoadingAnswer] = useState(false);
  const [availableModels, setAvailableModels] = useState<Array<{ name: string; display_name: string }>>([]);
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem('nexus_selected_model') || 'qwen3:1.7b'
  );
  const [selectedStrategy, setSelectedStrategy] = useState<RetrievalStrategy>('HYBRID');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Graph state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fgRef = useRef<any>(null);
  const [rawNodes, setRawNodes] = useState<NodeModel[]>([]);
  const [rawEdges, setRawEdges] = useState<EdgeModel[]>([]);
  const [filterType, setFilterType] = useState<string>('All');
  const [densityLimit, setDensityLimit] = useState<'core' | 'standard' | 'all'>('standard');
  const [searchGraphQuery, setSearchGraphQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<NodeModel | null>(null);
  const [nodeDetail, setNodeDetail] = useState<NodeDetailResponse | null>(null);

  // Graph Highlights
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());
  const [highlightedEdgeIds, setHighlightedEdgeIds] = useState<Set<string>>(new Set());
  const [highlightInfo, setHighlightInfo] = useState<{ title: string; count: number } | null>(null);

  // Canvas transform & interaction
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragCanvasStart, setDragCanvasStart] = useState({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

  // Physics simulation state ref
  const nodeSimMapRef = useRef<Map<string, NodeSimState>>(new Map());

  // 1. Initial Load of Real Data & Dynamic Models
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
      const data = await graphApi.getGraph(150, 0, filterType === 'All' ? undefined : filterType);
      setRawNodes(data.nodes);
      setRawEdges(data.edges);
    } catch (err) {
      console.warn('Failed to load graph:', err);
    }
  };

  const loadAvailableModels = async () => {
    try {
      const res = await fetch('/api/v1/models');
      if (res.ok) {
        const data = await res.json();
        if (data.models && data.models.length > 0) {
          setAvailableModels(data.models);
          // Keep active model if exists, else first detected
          if (!data.models.some((m: any) => m.name === selectedModel)) {
            const fallback = data.active_model || data.models[0].name;
            setSelectedModel(fallback);
            localStorage.setItem('nexus_selected_model', fallback);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to query local models:', err);
    }
  };

  useEffect(() => {
    loadDocuments();
    loadGraph();
    loadAvailableModels();

    const handleModelChange = (e: any) => {
      if (e.detail) setSelectedModel(e.detail);
    };
    const handleDocsUpdate = () => {
      loadDocuments();
      loadGraph();
    };
    window.addEventListener('nexus_model_changed', handleModelChange);
    window.addEventListener('nexus_documents_updated', handleDocsUpdate);
    return () => {
      window.removeEventListener('nexus_model_changed', handleModelChange);
      window.removeEventListener('nexus_documents_updated', handleDocsUpdate);
    };
  }, []);

  useEffect(() => {
    loadGraph();
  }, [filterType]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoadingAnswer]);

  // Filter and prioritize nodes by density limit
  const activeNodes = useMemo(() => {
    let list = [...rawNodes];
    if (searchGraphQuery.trim()) {
      const q = searchGraphQuery.toLowerCase();
      list = list.filter(
        (n) => n.canonical_name.toLowerCase().includes(q) || n.entity_type.toLowerCase().includes(q)
      );
    }

    if (densityLimit === 'core') {
      const nonTopics = list.filter((n) => n.entity_type !== 'Topic').slice(0, 20);
      const nonTopicIds = new Set(nonTopics.map(n => n.id));
      const connectedEdges = rawEdges.filter(e => nonTopicIds.has(e.source) || nonTopicIds.has(e.target));
      const connectedTopicIds = new Set(connectedEdges.map(e => e.source).concat(connectedEdges.map(e => e.target)));
      const topics = list.filter((n) => n.entity_type === 'Topic' && connectedTopicIds.has(n.id));
      return [...topics, ...nonTopics];
    } else if (densityLimit === 'standard') {
      const nonTopics = list.filter((n) => n.entity_type !== 'Topic').slice(0, 45);
      const nonTopicIds = new Set(nonTopics.map(n => n.id));
      const connectedEdges = rawEdges.filter(e => nonTopicIds.has(e.source) || nonTopicIds.has(e.target));
      const connectedTopicIds = new Set(connectedEdges.map(e => e.source).concat(connectedEdges.map(e => e.target)));
      const topics = list.filter((n) => n.entity_type === 'Topic' && connectedTopicIds.has(n.id));
      return [...topics, ...nonTopics];
    }
    return list;
  }, [rawNodes, rawEdges, densityLimit, searchGraphQuery]);

  const activeNodeIds = useMemo(() => new Set(activeNodes.map((n) => n.id)), [activeNodes]);

  const activeEdges = useMemo(() => {
    return rawEdges.filter((e) => activeNodeIds.has(e.source) && activeNodeIds.has(e.target));
  }, [rawEdges, activeNodeIds]);

  const graphData = useMemo(() => ({
    nodes: activeNodes.map(n => ({ ...n, id: n.id, name: n.canonical_name, val: n.entity_type === 'Topic' ? 10 : Math.min(13, Math.max(5, (n.degree || 1) * 0.8 + 3)) })),
    links: activeEdges.map(e => ({ ...e, source: e.source, target: e.target }))
  }), [activeNodes, activeEdges]);

  // Tune D3 physics layout for comfortable spacing and collision avoidance
  useEffect(() => {
    if (fgRef.current) {
      const fg = fgRef.current;
      if (typeof fg.d3Force === 'function') {
        fg.d3Force('charge')?.strength(-260);
        fg.d3Force('link')?.distance(85);
      }
    }
  }, [graphData]);

  // Extract list of unique topics for quick-zoom bar
  const topicList = useMemo(() => {
    return rawNodes.filter((n) => n.entity_type === 'Topic');
  }, [rawNodes]);

  // 2. Initialize Physics Positions on Clustered Thematic Centers
  useEffect(() => {
    if (activeNodes.length === 0) return;

    const simMap = nodeSimMapRef.current;
    const topicNodes = activeNodes.filter((n) => n.entity_type === 'Topic');
    const T = topicNodes.length || 1;
    const clusterRadius = Math.max(280, 180 + T * 35);

    // Position Topic nodes as radial anchor centers
    const topicAnchorMap = new Map<string, { x: number; y: number }>();
    topicNodes.forEach((top, idx) => {
      const angle = (2 * Math.PI * idx) / T - Math.PI / 2;
      const ax = Math.cos(angle) * clusterRadius;
      const ay = Math.sin(angle) * clusterRadius;
      topicAnchorMap.set(top.id, { x: ax, y: ay });
    });

    activeNodes.forEach((node, idx) => {
      const isTopic = node.entity_type === 'Topic';
      let ax = 0;
      let ay = 0;

      if (isTopic) {
        const anchor = topicAnchorMap.get(node.id) || { x: 0, y: 0 };
        ax = anchor.x;
        ay = anchor.y;
      } else {
        // Find associated topic anchors
        const matchedAnchors: Array<{ x: number; y: number }> = [];
        (node.topic_ids || []).forEach((tid) => {
          if (topicAnchorMap.has(tid)) matchedAnchors.push(topicAnchorMap.get(tid)!);
        });

        if (matchedAnchors.length > 0) {
          ax = matchedAnchors.reduce((acc, a) => acc + a.x, 0) / matchedAnchors.length;
          ay = matchedAnchors.reduce((acc, a) => acc + a.y, 0) / matchedAnchors.length;
          // Add organic offset around topic anchor
          const offsetAngle = (idx * 1.37) % (2 * Math.PI);
          const offsetDist = 90 + ((idx * 23) % 110);
          ax += Math.cos(offsetAngle) * offsetDist;
          ay += Math.sin(offsetAngle) * offsetDist;
        } else {
          // General entity without direct topic: orbit gently around center
          const angle = (idx * 0.78) % (2 * Math.PI);
          const r = 70 + ((idx * 17) % 140);
          ax = Math.cos(angle) * r;
          ay = Math.sin(angle) * r;
        }
      }

      const existing = simMap.get(node.id);
      const approxWidth = isTopic
        ? node.canonical_name.length * 8 + 48
        : node.canonical_name.length * 7.5 + 38;
      const approxHeight = isTopic ? 38 : 32;

      if (!existing) {
        simMap.set(node.id, {
          x: ax + (Math.random() - 0.5) * 20,
          y: ay + (Math.random() - 0.5) * 20,
          vx: 0,
          vy: 0,
          anchorX: ax,
          anchorY: ay,
          width: approxWidth,
          height: approxHeight,
          isTopic,
        });
      } else {
        existing.anchorX = ax;
        existing.anchorY = ay;
        existing.width = approxWidth;
        existing.height = approxHeight;
        existing.isTopic = isTopic;
      }
    });

    // Remove defunct nodes
    Array.from(simMap.keys()).forEach((id) => {
      if (!activeNodeIds.has(id)) simMap.delete(id);
    });
  }, [activeNodes, activeNodeIds]);

  // 3. Highlight Graph from Query Answer
  const highlightAnswerEvidence = (resp: QueryResponse) => {
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();

    if (resp.related_entities) {
      resp.related_entities.forEach((ent) => nodeIds.add(ent.id));
    }
    if (resp.supporting_paths) {
      resp.supporting_paths.forEach((p) => {
        p.nodes?.forEach((n) => nodeIds.add(n.id));
        p.edges?.forEach((e) => edgeIds.add(e.id));
      });
    }
    if (resp.citations) {
      resp.citations.forEach((c) => nodeIds.add(c.document_id));
    }

    setHighlightedNodeIds(nodeIds);
    setHighlightedEdgeIds(edgeIds);
    setHighlightInfo({
      title: `${resp.intent} Evidence Highlighted`,
      count: nodeIds.size,
    });
    setTimeout(() => { if (fgRef.current) fgRef.current.zoomToFit(400, 60); }, 350);

    // Focus camera on centroid of highlighted nodes
    if (nodeIds.size > 0 && nodeSimMapRef.current.size > 0) {
      let sumX = 0, sumY = 0, count = 0;
      nodeIds.forEach((id) => {
        const pos = nodeSimMapRef.current.get(id);
        if (pos) {
          sumX += pos.x;
          sumY += pos.y;
          count++;
        }
      });
      if (count > 0) {
        setPan({ x: -(sumX / count) * 0.9, y: -(sumY / count) * 0.9 });
        setZoom(1.05);
      }
    }
  };

  const clearHighlight = () => {
    setHighlightedNodeIds(new Set());
    setHighlightedEdgeIds(new Set());
    setHighlightInfo(null);
  };

  const zoomToTopicCluster = (topic: NodeModel) => {
    if (fgRef.current) {
      const gnode = graphData.nodes.find((n: any) => n.id === topic.id);
      if (gnode && (gnode as any).x !== undefined) {
        fgRef.current.centerAt((gnode as any).x, (gnode as any).y, 600);
        fgRef.current.zoom(2.2, 600);
      }
    }
    const linked = new Set<string>([topic.id]);
    activeEdges.forEach((e) => {
      if (e.source === topic.id) linked.add(e.target as string);
      if (e.target === topic.id) linked.add(e.source as string);
    });
    setHighlightedNodeIds(linked);
    setHighlightInfo({ title: `Cluster: ${topic.canonical_name}`, count: linked.size });
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

  // 6. Physics Simulation & Canvas Render Loop (60 FPS with Anti-Collision)
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

      // Subtle engineering dot grid background
      ctx.strokeStyle = '#EEF0F4';
      ctx.lineWidth = 1;
      const gridSize = 42 * zoom;
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

      const simMap = nodeSimMapRef.current;
      const simNodes = activeNodes
        .map((n) => ({ node: n, sim: simMap.get(n.id) }))
        .filter((item): item is { node: NodeModel; sim: NodeSimState } => item.sim !== undefined);

      // ==========================================
      // FORCE-DIRECTED PHYSICS RELAXATION STEP
      // ==========================================
      // A. Pull toward anchor cluster center
      simNodes.forEach(({ sim, node }) => {
        if (node.id === draggedNodeId) return;
        const pullStrength = sim.isTopic ? 0.045 : 0.03;
        sim.vx += (sim.anchorX - sim.x) * pullStrength;
        sim.vy += (sim.anchorY - sim.y) * pullStrength;
      });

      // B. Spring attraction along connected edges
      activeEdges.forEach((edge) => {
        const s = simMap.get(edge.source);
        const t = simMap.get(edge.target);
        if (!s || !t) return;

        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = s.isTopic || t.isTopic ? 140 : 110;
        const force = (dist - targetDist) * 0.025;

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (edge.source !== draggedNodeId) {
          s.vx += fx;
          s.vy += fy;
        }
        if (edge.target !== draggedNodeId) {
          t.vx -= fx;
          t.vy -= fy;
        }
      });

      // C. Anti-Collision Pill-Box Repulsion (Guarantees NO Overlapping Labels)
      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const a = simNodes[i].sim;
          const b = simNodes[j].sim;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const minDistX = (a.width + b.width) / 2 + 18;
          const minDistY = (a.height + b.height) / 2 + 14;

          if (Math.abs(dx) < minDistX && Math.abs(dy) < minDistY) {
            const overlapX = minDistX - Math.abs(dx);
            const overlapY = minDistY - Math.abs(dy);
            const signX = dx >= 0 ? 1 : -1;
            const signY = dy >= 0 ? 1 : -1;

            const pushFactor = 0.15;
            if (simNodes[i].node.id !== draggedNodeId) {
              a.vx -= signX * overlapX * pushFactor;
              a.vy -= signY * overlapY * pushFactor;
            }
            if (simNodes[j].node.id !== draggedNodeId) {
              b.vx += signX * overlapX * pushFactor;
              b.vy += signY * overlapY * pushFactor;
            }
          } else {
            // Soft Coulomb repulsion
            const distSq = dx * dx + dy * dy;
            if (distSq < 90000 && distSq > 1) {
              const repel = 140 / distSq;
              if (simNodes[i].node.id !== draggedNodeId) {
                a.vx -= dx * repel;
                a.vy -= dy * repel;
              }
              if (simNodes[j].node.id !== draggedNodeId) {
                b.vx += dx * repel;
                b.vy += dy * repel;
              }
            }
          }
        }
      }

      // D. Velocity integration with smooth friction
      simNodes.forEach(({ sim, node }) => {
        if (node.id === draggedNodeId) {
          sim.vx = 0;
          sim.vy = 0;
          return;
        }
        sim.vx *= 0.82;
        sim.vy *= 0.82;
        sim.x += sim.vx;
        sim.y += sim.vy;
      });

      const hasHighlights = highlightedNodeIds.size > 0;

      // ==========================================
      // DRAW EDGES WITH RELATION BADGES & ARROWS
      // ==========================================
      activeEdges.forEach((edge) => {
        const s = simMap.get(edge.source);
        const t = simMap.get(edge.target);
        if (!s || !t) return;

        const isHighlighted =
          highlightedEdgeIds.has(edge.id) ||
          (highlightedNodeIds.has(edge.source) && highlightedNodeIds.has(edge.target));

        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const angle = Math.atan2(dy, dx);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        // Clip edge line to target pill perimeter
        const targetRadius = (t.width / 2) * 0.85;
        const endX = t.x - Math.cos(angle) * targetRadius;
        const endY = t.y - Math.sin(angle) * targetRadius;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(endX, endY);

        if (isHighlighted) {
          ctx.strokeStyle = '#10B981';
          ctx.lineWidth = 2.6;
          ctx.setLineDash([5, 3]);
        } else if (hasHighlights) {
          ctx.strokeStyle = 'rgba(203, 213, 225, 0.4)';
          ctx.lineWidth = 1;
        } else if (edge.relationship_type === 'BELONGS_TO_TOPIC') {
          ctx.strokeStyle = '#DDD6FE';
          ctx.lineWidth = 1.2;
        } else {
          ctx.strokeStyle = '#E2E8F0';
          ctx.lineWidth = 1.4;
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrow head pointing to target
        const arrowLength = 7;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - arrowLength * Math.cos(angle - Math.PI / 6),
          endY - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          endX - arrowLength * Math.cos(angle + Math.PI / 6),
          endY - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = isHighlighted ? '#10B981' : '#CBD5E1';
        ctx.fill();

        // Edge Relationship Badge at midpoint
        if ((isHighlighted || zoom > 0.8) && edge.relationship_type) {
          const midX = (s.x + endX) / 2;
          const midY = (s.y + endY) / 2;
          const badgeText = edge.relationship_type.replace(/_/g, ' ');

          ctx.font = 'bold 8.5px ui-monospace, SFMono-Regular, monospace';
          const tw = ctx.measureText(badgeText).width;
          const bw = tw + 10;
          const bh = 15;

          ctx.fillStyle = isHighlighted ? '#ECFDF5' : '#FFFFFF';
          ctx.strokeStyle = isHighlighted ? '#10B981' : '#E2E8F0';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(midX - bw / 2, midY - bh / 2, bw, bh, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = isHighlighted ? '#047857' : '#64748B';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(badgeText, midX, midY);
        }

        ctx.restore();
      });

      // ==========================================
      // DRAW HIGH-PRECISION CATEGORY PILLS
      // ==========================================
      simNodes.forEach(({ node, sim }) => {
        const isHighlighted = highlightedNodeIds.has(node.id);
        const isHovered = hoveredNodeId === node.id;
        const isSelected = selectedNode?.id === node.id;
        const isTopic = node.entity_type === 'Topic';

        const rx = sim.x - sim.width / 2;
        const ry = sim.y - sim.height / 2;
        const opacity = hasHighlights && !isHighlighted ? 0.25 : 1.0;

        ctx.save();
        ctx.globalAlpha = opacity;

        // Outer Glow for highlighted or selected node
        if (isHighlighted || isSelected) {
          ctx.beginPath();
          ctx.roundRect(rx - 4, ry - 4, sim.width + 8, sim.height + 8, sim.height / 2 + 4);
          ctx.fillStyle = isHighlighted ? 'rgba(16, 185, 129, 0.25)' : 'rgba(15, 23, 42, 0.15)';
          ctx.fill();
        }

        // Pill Container
        ctx.beginPath();
        ctx.roundRect(rx, ry, sim.width, sim.height, sim.height / 2);

        if (isTopic) {
          // Vibrant Purple Gradient for Topic Community Hubs
          const grad = ctx.createLinearGradient(rx, ry, rx + sim.width, ry);
          grad.addColorStop(0, '#7C3AED');
          grad.addColorStop(1, '#6D28D9');
          ctx.fillStyle = grad;
          ctx.shadowColor = 'rgba(124, 58, 237, 0.35)';
          ctx.shadowBlur = 8;
          ctx.shadowOffsetY = 2;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;

          // Border
          ctx.strokeStyle = '#5B21B6';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Text & Icon
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          ctx.fillText(`✦ ${node.canonical_name}`, rx + 14, sim.y);
        } else {
          // Entity Pill (Color-Coded by Category)
          let borderColor = '#E2E8F0';
          let iconChar = '●';
          let iconColor = '#94A3B8';

          if (node.entity_type === 'Person') {
            borderColor = isHovered ? '#059669' : '#10B981';
            iconChar = '👤';
            iconColor = '#059669';
          } else if (node.entity_type === 'Organization') {
            borderColor = isHovered ? '#D97706' : '#F59E0B';
            iconChar = '🏛️';
            iconColor = '#D97706';
          } else if (node.entity_type === 'MedicalCondition' || node.entity_type === 'Concept') {
            borderColor = isHovered ? '#0284C7' : '#38BDF8';
            iconChar = '💡';
            iconColor = '#0284C7';
          } else if (node.entity_type === 'Document') {
            borderColor = isHovered ? '#4F46E5' : '#6366F1';
            iconChar = '📄';
            iconColor = '#4F46E5';
          }

          ctx.fillStyle = '#FFFFFF';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.05)';
          ctx.shadowBlur = 5;
          ctx.shadowOffsetY = 2;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;

          ctx.strokeStyle = isSelected ? '#0F172A' : isHovered ? '#1E293B' : borderColor;
          ctx.lineWidth = isSelected ? 2.2 : isHovered ? 1.8 : 1.2;
          ctx.stroke();

          // Icon dot / emoji
          ctx.font = '10px sans-serif';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          ctx.fillText(iconChar, rx + 10, sim.y);

          // Entity Label
          ctx.fillStyle = '#0F172A';
          ctx.font = '500 11.5px "Plus Jakarta Sans", sans-serif';
          ctx.fillText(node.canonical_name, rx + 26, sim.y);
        }

        // Degree counter badge
        if (node.degree > 1 && !isTopic) {
          ctx.beginPath();
          ctx.arc(rx + sim.width - 9, sim.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#F1F5F9';
          ctx.fill();
          ctx.strokeStyle = '#CBD5E1';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = '#64748B';
          ctx.font = 'bold 8px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(node.degree), rx + sim.width - 9, sim.y);
        }

        ctx.restore();
      });

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [activeNodes, activeEdges, highlightedNodeIds, highlightedEdgeIds, zoom, pan, hoveredNodeId, draggedNodeId, selectedNode]);

  // Canvas Mouse & Interaction Handlers
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2 - pan.x;
    const mouseY = e.clientY - rect.top - rect.height / 2 - pan.y;

    const simMap = nodeSimMapRef.current;
    let clickedNodeId: string | null = null;

    activeNodes.forEach((n) => {
      const sim = simMap.get(n.id);
      if (sim) {
        const dx = Math.abs(mouseX / zoom - sim.x);
        const dy = Math.abs(mouseY / zoom - sim.y);
        if (dx <= sim.width / 2 && dy <= sim.height / 2) {
          clickedNodeId = n.id;
        }
      }
    });

    if (clickedNodeId) {
      setDraggedNodeId(clickedNodeId);
      const clicked = activeNodes.find((n) => n.id === clickedNodeId);
      if (clicked) handleSelectNode(clicked);
    } else {
      setIsDraggingCanvas(true);
      setDragCanvasStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (draggedNodeId) {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width / 2 - pan.x;
      const mouseY = e.clientY - rect.top - rect.height / 2 - pan.y;
      const sim = nodeSimMapRef.current.get(draggedNodeId);
      if (sim) {
        sim.x = mouseX / zoom;
        sim.y = mouseY / zoom;
        sim.vx = 0;
        sim.vy = 0;
      }
      return;
    }

    if (isDraggingCanvas) {
      setPan({
        x: e.clientX - dragCanvasStart.x,
        y: e.clientY - dragCanvasStart.y,
      });
      return;
    }

    // Check hover
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2 - pan.x;
    const mouseY = e.clientY - rect.top - rect.height / 2 - pan.y;

    const simMap = nodeSimMapRef.current;
    let foundHover: string | null = null;

    activeNodes.forEach((n) => {
      const sim = simMap.get(n.id);
      if (sim) {
        const dx = Math.abs(mouseX / zoom - sim.x);
        const dy = Math.abs(mouseY / zoom - sim.y);
        if (dx <= sim.width / 2 && dy <= sim.height / 2) {
          foundHover = n.id;
        }
      }
    });

    setHoveredNodeId(foundHover);
  };

  const handleCanvasMouseUp = () => {
    setIsDraggingCanvas(false);
    setDraggedNodeId(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.min(2.5, Math.max(0.35, prev * zoomFactor)));
  };

  const samplePrompts = [
    'Summarize the key findings and executive takeaways.',
    'What are the main topics and entities covered in this knowledge base?',
    'What are the most critical figures, metrics, or data points mentioned?',
    'Explain how the primary concepts and entities are connected.',
  ];

  const getBaseColor = (type: string): string => {
    switch (type) {
      case 'Topic': return '#7C3AED';
      case 'Person': return '#10b981';
      case 'Organization': return '#f59e0b';
      case 'Technology': return '#06b6d4';
      case 'MedicalCondition': return '#ef4444';
      case 'Work': return '#8b5cf6';
      default: return '#6366f1';
    }
  };

  const getNodeColor = (node: any): string => {
    if (highlightedNodeIds.size > 0 && !highlightedNodeIds.has(node.id)) return '#1e293b';
    return getBaseColor(node.entity_type);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-white">
      {/* ======================================================== */}
      {/* LEFT HALF: DOCUMENT UPLOADER & GROUNDED CHAT             */}
      {/* ======================================================== */}
      <div className="w-1/2 flex flex-col border-r border-[#EBEBEF] h-full overflow-hidden bg-[#FAFAFC]">
        {/* Top: Document Ingestion Section */}
        <div className="p-4 border-b border-[#EBEBEF] bg-white shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800 font-mono">
                Knowledge Base Ingestion
              </h2>
            </div>
            <span className="text-[11px] font-mono text-neutral-400">
              {documents.length} Document{documents.length !== 1 ? 's' : ''} Indexed
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
                  <span>{uploadStatus || 'Ingesting with high-speed NLP...'}</span>
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
            <div className="mt-3 max-h-24 overflow-y-auto space-y-1.5 pr-1">
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

        {/* Middle: Grounded Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length > 0 && (
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100 text-xs text-neutral-400">
              <span className="font-mono text-[10px] uppercase tracking-wider font-semibold">
                Conversation ({messages.length})
              </span>
              <button
                onClick={handleClearChat}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 border border-neutral-200/90 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shadow-2xs"
                title="Start a new chat (⌘N)"
              >
                <Plus size={12} strokeWidth={2.5} />
                <span>New Chat</span>
              </button>
            </div>
          )}
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-400">
              <div className="w-12 h-12 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center mb-3 shadow-2xs">
                <Sparkles size={20} className="text-neutral-800" />
              </div>
              <h3 className="text-sm font-bold text-neutral-800">Ask Your Knowledge Base</h3>
              <p className="text-xs text-neutral-500 max-w-sm mt-1 leading-relaxed">
                Queries are intelligently routed to answer broad thematic questions or multi-hop factual chains.
                Evidence paths are visually highlighted on the right graph.
              </p>

              {/* Sample Prompts */}
              <div className="mt-4 flex flex-col gap-1.5 w-full max-w-sm">
                {samplePrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSendMessage(prompt)}
                    className="text-left text-xs p-2.5 rounded-xl bg-white hover:bg-neutral-100 border border-neutral-200/80 text-neutral-700 transition-colors shadow-2xs"
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
                    className={`max-w-[92%] rounded-2xl p-4 leading-relaxed ${
                      isUser
                        ? 'bg-neutral-900 text-white rounded-tr-xs text-xs sm:text-[13px] whitespace-pre-wrap'
                        : 'bg-white border border-neutral-200/90 text-neutral-800 rounded-tl-xs shadow-2xs w-full'
                    }`}
                  >
                    {isUser ? (
                      <div>{msg.text}</div>
                    ) : (
                      <RichAnswerRenderer
                        content={msg.text}
                        citations={msg.response?.citations}
                        response={msg.response}
                        onOpenCitation={onOpenCitation}
                        onHighlightEvidence={
                          msg.response ? () => highlightAnswerEvidence(msg.response!) : undefined
                        }
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
          {isLoadingAnswer && (
            <div className="flex items-start justify-start w-full">
              <RetrievalLoadingIndicator modelName={selectedModel} strategy={selectedStrategy} />
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Bottom: Dynamic Model Selector & Chat Input */}
        <div className="p-3 border-t border-[#EBEBEF] bg-white shrink-0 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            {/* Dynamic Local Model Selector */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-neutral-400 uppercase text-[10px] flex items-center gap-1">
                <Cpu size={11} className="text-emerald-600" />
                Model:
              </span>
              <select
                value={selectedModel}
                onChange={(e) => {
                  setSelectedModel(e.target.value);
                  localStorage.setItem('nexus_selected_model', e.target.value);
                }}
                className="font-mono text-[11px] font-semibold bg-neutral-100 hover:bg-neutral-200 text-neutral-800 px-2.5 py-1 rounded-lg border border-neutral-200 focus:outline-none cursor-pointer"
              >
                {availableModels.length > 0 ? (
                  availableModels.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.display_name}
                    </option>
                  ))
                ) : (
                  <option value={selectedModel}>{selectedModel}</option>
                )}
              </select>
              <button
                onClick={loadAvailableModels}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded transition-colors"
                title="Refresh detected local models"
              >
                <RefreshCw size={11} />
              </button>
            </div>

            {/* Retrieval Strategy Switcher & Clear History */}
            <div className="flex items-center gap-1.5">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearChat}
                  className="flex items-center gap-1 px-2 py-0.8 rounded text-[10px] font-medium text-neutral-600 hover:text-black hover:bg-neutral-100 border border-neutral-200/80 transition-colors cursor-pointer"
                  title="Start a new chat"
                >
                  <Plus size={10} strokeWidth={2.5} />
                  <span>New Chat</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedStrategy(selectedStrategy === 'HYBRID' ? 'VECTOR_ONLY' : 'HYBRID')}
                className={`px-2.5 py-0.8 rounded text-[10px] font-bold font-mono transition-colors ${
                  selectedStrategy === 'HYBRID'
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {selectedStrategy === 'HYBRID' ? 'HYBRID (Graph + Chroma)' : 'VECTOR ONLY'}
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
      {/* RIGHT HALF: FORCE-CLUSTERED TOPIC KNOWLEDGE GRAPH       */}
      {/* ======================================================== */}
      <div className="w-1/2 flex flex-col h-full overflow-hidden relative bg-white">
        {/* Top Floating Bar: Topics & Density Controls */}
        <div className="absolute top-3 left-3 right-3 z-10 flex flex-col gap-2 pointer-events-none">
          <div className="flex items-center justify-between">
            {/* Active Highlight Badge or Graph Status */}
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
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-xs border border-neutral-200 text-neutral-800 text-xs font-semibold shadow-2xs">
                  <Network size={14} className="text-indigo-600" />
                  <span>Topic-Augmented Graph</span>
                  <span className="text-[10px] font-mono text-neutral-400">
                    ({activeNodes.length} nodes · {activeEdges.length} links)
                  </span>
                </div>
              )}
            </div>

            {/* Density & Zoom Controls */}
            <div className="pointer-events-auto flex items-center gap-1.5 bg-white/95 backdrop-blur-xs border border-neutral-200 p-1 rounded-xl shadow-2xs">
              {/* Density filter */}
              <div className="flex items-center bg-neutral-100 rounded-lg p-0.5 text-[10px] font-mono mr-1">
                <button
                  onClick={() => setDensityLimit('core')}
                  className={`px-2 py-0.5 rounded ${
                    densityLimit === 'core' ? 'bg-white font-bold text-neutral-900 shadow-2xs' : 'text-neutral-500'
                  }`}
                  title="Show Core Top 15 Entities"
                >
                  Core (15)
                </button>
                <button
                  onClick={() => setDensityLimit('standard')}
                  className={`px-2 py-0.5 rounded ${
                    densityLimit === 'standard' ? 'bg-white font-bold text-neutral-900 shadow-2xs' : 'text-neutral-500'
                  }`}
                  title="Show Standard Top 35 Entities"
                >
                  Standard (35)
                </button>
                <button
                  onClick={() => setDensityLimit('all')}
                  className={`px-2 py-0.5 rounded ${
                    densityLimit === 'all' ? 'bg-white font-bold text-neutral-900 shadow-2xs' : 'text-neutral-500'
                  }`}
                  title="Show All Entities"
                >
                  All
                </button>
              </div>

              {/* Zoom Buttons */}
              <button
                onClick={() => setZoom((z) => Math.min(2.5, z * 1.15))}
                className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-600"
                title="Zoom In"
              >
                <Plus size={14} />
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(0.35, z * 0.85))}
                className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-600"
                title="Zoom Out"
              >
                <Minus size={14} />
              </button>
              <button
                onClick={() => {
                  setZoom(0.85);
                  setPan({ x: 0, y: 0 });
                }}
                className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-600"
                title="Reset View"
              >
                <Maximize2 size={14} />
              </button>
            </div>
          </div>

          {/* Click-to-Zoom Thematic Topic Chips */}
          {topicList.length > 0 && (
            <div className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto py-1 px-1 scrollbar-none">
              <span className="text-[10px] font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.8 rounded-lg shrink-0 flex items-center gap-1">
                <Compass size={11} />
                THEMES:
              </span>
              {topicList.map((top) => (
                <button
                  key={top.id}
                  onClick={() => zoomToTopicCluster(top)}
                  className="px-2.5 py-0.8 rounded-lg bg-white/95 hover:bg-purple-50 border border-purple-200 text-purple-900 text-[11px] font-semibold whitespace-nowrap shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                >
                  <span>✦</span>
                  <span>{top.canonical_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Canvas Renderer */}
        <div className="flex-1 h-full w-full relative">
          {/* @ts-ignore */}
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            nodeId="id"
            nodeColor={(node: any) => getNodeColor(node)}
            nodeVal={(node: any) => node.val}
            nodeLabel={(node: any) => node.name}
            linkColor={(link: any) => highlightedEdgeIds.has((link as any).id) ? '#10b981' : (link as any).relationship_type === 'BELONGS_TO_TOPIC' ? '#DDD6FE' : '#94a3b8'}
            linkWidth={(link: any) => highlightedEdgeIds.has((link as any).id) ? 2.5 : 1}
            linkDirectionalArrowLength={5}
            linkDirectionalArrowRelPos={1}
            linkLabel={(link: any) => (link as any).relationship_type || ''}
            onNodeClick={(node: any) => handleSelectNode(node as NodeModel)}
            nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
              const isTopic = node.entity_type === 'Topic';
              const isSynthetic = node.metadata?.dataset_status === 'SYNTHETIC';
              const r = isTopic ? 10 : Math.min(13, Math.max(5, (node.degree || 1) * 0.8 + 3));
              const isHighlighted = highlightedNodeIds.has(node.id);
              const isSelected = selectedNode?.id === node.id;
              const dimmed = highlightedNodeIds.size > 0 && !isHighlighted;

              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              ctx.fillStyle = dimmed ? '#1e293b' : isSynthetic ? '#f97316' : getBaseColor(node.entity_type);
              ctx.fill();

              if (isHighlighted || isSelected) {
                ctx.strokeStyle = isSelected ? '#ffffff' : '#10b981';
                ctx.lineWidth = 2.5 / globalScale;
                ctx.stroke();
              } else if (isSynthetic) {
                ctx.strokeStyle = '#fdba74';
                ctx.lineWidth = 1.8 / globalScale;
                ctx.stroke();
              }

              const fontSize = Math.max(isTopic ? 11 : 9, (isTopic ? 13 : 10) / globalScale);
              ctx.font = `${isTopic ? 'bold ' : ''}${fontSize}px Inter, Sans-Serif`;
              ctx.fillStyle = dimmed ? '#334155' : isSynthetic ? '#fdba74' : '#e2e8f0';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillText(node.name, node.x, node.y + r + 2 / globalScale);
            }}
            nodeCanvasObjectMode={() => 'replace'}
            backgroundColor="#0f172a"
            cooldownTicks={100}
            d3AlphaDecay={0.025}
            d3VelocityDecay={0.35}
            // @ts-ignore
            className="w-full h-full"
          />

          {/* Floating Node Inspector Flyout */}
          {selectedNode && (
            <div className="absolute bottom-4 right-4 max-w-sm w-80 bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-neutral-200 p-4 z-20 animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="flex items-start justify-between">
                <div>
                  <span
                    className={`text-[10px] uppercase font-bold font-mono tracking-wider px-2 py-0.5 rounded-full ${
                      selectedNode.entity_type === 'Topic'
                        ? 'bg-purple-100 text-purple-800'
                        : selectedNode.entity_type === 'Person'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-neutral-100 text-neutral-700'
                    }`}
                  >
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

              {/* 1-Click "Ask in Chat" Button */}
              <div className="mt-3 pt-2">
                <button
                  onClick={() => {
                    handleSendMessage(`Tell me about ${selectedNode.canonical_name} and its significance.`);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold shadow-2xs transition-colors"
                >
                  <MessageSquare size={12} />
                  <span>Ask AI about {selectedNode.canonical_name}</span>
                </button>
              </div>

              {nodeDetail && nodeDetail.neighbors && nodeDetail.neighbors.length > 0 && (
                <div className="mt-3 pt-3 border-t border-neutral-100">
                  <span className="text-[10px] uppercase font-bold font-mono text-neutral-400 block mb-1.5">
                    Connected Relationships ({nodeDetail.neighbors.length})
                  </span>
                  <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
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
