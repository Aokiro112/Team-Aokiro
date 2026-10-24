import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Plus,
  Minus,
  Maximize2,
  X,
  FileText,
  Layers,
  ArrowRight,
  Sparkles,
  Share2,
  Compass,
  Network,
} from 'lucide-react';
import { NodeModel, EdgeModel, NodeDetailResponse } from '../types/backend';
import { graphApi } from '../services/api';

interface KnowledgeGraphViewProps {
  onNavigateToDocuments?: () => void;
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

export const KnowledgeGraphView: React.FC<KnowledgeGraphViewProps> = ({
  onNavigateToDocuments,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rawNodes, setRawNodes] = useState<NodeModel[]>([]);
  const [rawEdges, setRawEdges] = useState<EdgeModel[]>([]);
  const [filterType, setFilterType] = useState<string>('All');
  const [densityLimit, setDensityLimit] = useState<'core' | 'standard' | 'all'>('standard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<NodeModel | null>(null);
  const [nodeDetail, setNodeDetail] = useState<NodeDetailResponse | null>(null);

  // Transform and interaction state
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragCanvasStart, setDragCanvasStart] = useState({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

  // Physics simulation state ref
  const nodeSimMapRef = useRef<Map<string, NodeSimState>>(new Map());

  // Load Graph Data
  const fetchGraph = async () => {
    try {
      const data = await graphApi.getGraph(150, 0, filterType === 'All' ? undefined : filterType);
      setRawNodes(data.nodes);
      setRawEdges(data.edges);

      const sorted = [...data.nodes].sort((a, b) => (b.degree || 0) - (a.degree || 0));
      const primaryNode = sorted[0];
      if (primaryNode && !selectedNode) {
        setSelectedNode(primaryNode);
        const detail = await graphApi.getNodeDetails(primaryNode.id);
        setNodeDetail(detail);
      }
    } catch (err) {
      console.warn('Failed to load graph in KnowledgeGraphView:', err);
    }
  };

  useEffect(() => {
    fetchGraph();
  }, [filterType]);

  const handleSelectNode = async (node: NodeModel) => {
    setSelectedNode(node);
    try {
      const detail = await graphApi.getNodeDetails(node.id);
      setNodeDetail(detail);
    } catch (err) {
      console.warn('Failed to load node detail:', err);
    }
  };

  // Filter and prioritize nodes by density limit
  const activeNodes = useMemo(() => {
    let list = [...rawNodes];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (n) => n.canonical_name.toLowerCase().includes(q) || n.entity_type.toLowerCase().includes(q)
      );
    }

    if (densityLimit === 'core') {
      const topics = list.filter((n) => n.entity_type === 'Topic');
      const nonTopics = list.filter((n) => n.entity_type !== 'Topic').slice(0, 15);
      return [...topics, ...nonTopics];
    } else if (densityLimit === 'standard') {
      const topics = list.filter((n) => n.entity_type === 'Topic');
      const nonTopics = list.filter((n) => n.entity_type !== 'Topic').slice(0, 35);
      return [...topics, ...nonTopics];
    }
    return list;
  }, [rawNodes, densityLimit, searchQuery]);

  const activeNodeIds = useMemo(() => new Set(activeNodes.map((n) => n.id)), [activeNodes]);

  const activeEdges = useMemo(() => {
    return rawEdges.filter((e) => activeNodeIds.has(e.source) && activeNodeIds.has(e.target));
  }, [rawEdges, activeNodeIds]);

  const topicList = useMemo(() => {
    return rawNodes.filter((n) => n.entity_type === 'Topic');
  }, [rawNodes]);

  // Initialize Clustered Thematic Positions
  useEffect(() => {
    if (activeNodes.length === 0) return;

    const simMap = nodeSimMapRef.current;
    const topicNodes = activeNodes.filter((n) => n.entity_type === 'Topic');
    const T = topicNodes.length || 1;
    const clusterRadius = Math.max(280, 180 + T * 35);

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
        const matchedAnchors: Array<{ x: number; y: number }> = [];
        (node.topic_ids || []).forEach((tid) => {
          if (topicAnchorMap.has(tid)) matchedAnchors.push(topicAnchorMap.get(tid)!);
        });

        if (matchedAnchors.length > 0) {
          ax = matchedAnchors.reduce((acc, a) => acc + a.x, 0) / matchedAnchors.length;
          ay = matchedAnchors.reduce((acc, a) => acc + a.y, 0) / matchedAnchors.length;
          const offsetAngle = (idx * 1.37) % (2 * Math.PI);
          const offsetDist = 90 + ((idx * 23) % 110);
          ax += Math.cos(offsetAngle) * offsetDist;
          ay += Math.sin(offsetAngle) * offsetDist;
        } else {
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

    Array.from(simMap.keys()).forEach((id) => {
      if (!activeNodeIds.has(id)) simMap.delete(id);
    });
  }, [activeNodes, activeNodeIds]);

  // Main Canvas Render Loop
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

      // Dot grid background
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

      // Transform
      ctx.translate(width / 2 + pan.x, height / 2 + pan.y);
      ctx.scale(zoom, zoom);

      const simMap = nodeSimMapRef.current;
      const simNodes = activeNodes
        .map((n) => ({ node: n, sim: simMap.get(n.id) }))
        .filter((item): item is { node: NodeModel; sim: NodeSimState } => item.sim !== undefined);

      // Force relaxation step
      simNodes.forEach(({ sim, node }) => {
        if (node.id === draggedNodeId) return;
        const pullStrength = sim.isTopic ? 0.045 : 0.03;
        sim.vx += (sim.anchorX - sim.x) * pullStrength;
        sim.vy += (sim.anchorY - sim.y) * pullStrength;
      });

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

      // Anti-Collision Pill-Box Repulsion
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
          }
        }
      }

      // Velocity integration
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

      // Draw Edges
      activeEdges.forEach((edge) => {
        const s = simMap.get(edge.source);
        const t = simMap.get(edge.target);
        if (!s || !t) return;

        const isHighlighted = selectedNode && (edge.source === selectedNode.id || edge.target === selectedNode.id);
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const angle = Math.atan2(dy, dx);
        const targetRadius = (t.width / 2) * 0.85;
        const endX = t.x - Math.cos(angle) * targetRadius;
        const endY = t.y - Math.sin(angle) * targetRadius;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = isHighlighted ? '#10B981' : edge.relationship_type === 'BELONGS_TO_TOPIC' ? '#DDD6FE' : '#E2E8F0';
        ctx.lineWidth = isHighlighted ? 2.5 : 1.3;
        ctx.stroke();

        // Arrow head
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

        // Edge badge
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

      // Draw Nodes
      simNodes.forEach(({ node, sim }) => {
        const isHovered = hoveredNodeId === node.id;
        const isSelected = selectedNode?.id === node.id;
        const isTopic = node.entity_type === 'Topic';

        const rx = sim.x - sim.width / 2;
        const ry = sim.y - sim.height / 2;

        ctx.save();

        if (isSelected) {
          ctx.beginPath();
          ctx.roundRect(rx - 4, ry - 4, sim.width + 8, sim.height + 8, sim.height / 2 + 4);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.15)';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.roundRect(rx, ry, sim.width, sim.height, sim.height / 2);

        if (isTopic) {
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

          ctx.strokeStyle = '#5B21B6';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          ctx.fillText(`✦ ${node.canonical_name}`, rx + 14, sim.y);
        } else {
          let borderColor = '#E2E8F0';
          let iconChar = '●';

          if (node.entity_type === 'Person') {
            borderColor = isHovered ? '#059669' : '#10B981';
            iconChar = '👤';
          } else if (node.entity_type === 'Organization') {
            borderColor = isHovered ? '#D97706' : '#F59E0B';
            iconChar = '🏛️';
          } else if (node.entity_type === 'MedicalCondition' || node.entity_type === 'Concept') {
            borderColor = isHovered ? '#0284C7' : '#38BDF8';
            iconChar = '💡';
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

          ctx.font = '10px sans-serif';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          ctx.fillText(iconChar, rx + 10, sim.y);

          ctx.fillStyle = '#0F172A';
          ctx.font = '500 11.5px "Plus Jakarta Sans", sans-serif';
          ctx.fillText(node.canonical_name, rx + 26, sim.y);
        }

        ctx.restore();
      });

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [activeNodes, activeEdges, zoom, pan, hoveredNodeId, draggedNodeId, selectedNode]);

  // Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
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

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
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

  const handleMouseUp = () => {
    setIsDraggingCanvas(false);
    setDraggedNodeId(null);
  };

  const resetView = () => {
    setZoom(0.85);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200 relative flex flex-col h-[calc(100vh-5rem)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div>
          <span className="text-[11px] font-bold tracking-widest text-neutral-400 uppercase font-mono">
            TOPIC-AUGMENTED KNOWLEDGE GRAPH
          </span>
          <h1 className="text-3xl font-black text-neutral-900 tracking-tight mt-1">
            Explore Connections
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Interactive, clustered node-link knowledge graph mapping entity relationships and topic communities.
          </p>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search size={15} className="absolute left-3.5 top-3 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search entities or topics..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-neutral-200 text-xs text-neutral-800 placeholder-neutral-400 outline-none focus:border-neutral-900 transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded-xl">
            {['All', 'Topic', 'Person', 'Concept', 'Organization'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  filterType === type
                    ? 'bg-neutral-900 text-white shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Density Limit */}
          <div className="flex items-center bg-neutral-100 rounded-xl p-1 text-xs font-mono">
            <button
              onClick={() => setDensityLimit('core')}
              className={`px-2.5 py-1 rounded-lg ${
                densityLimit === 'core' ? 'bg-white font-bold text-neutral-900 shadow-2xs' : 'text-neutral-500'
              }`}
            >
              Core (15)
            </button>
            <button
              onClick={() => setDensityLimit('standard')}
              className={`px-2.5 py-1 rounded-lg ${
                densityLimit === 'standard' ? 'bg-white font-bold text-neutral-900 shadow-2xs' : 'text-neutral-500'
              }`}
            >
              Standard (35)
            </button>
            <button
              onClick={() => setDensityLimit('all')}
              className={`px-2.5 py-1 rounded-lg ${
                densityLimit === 'all' ? 'bg-white font-bold text-neutral-900 shadow-2xs' : 'text-neutral-500'
              }`}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {/* Main Interactive Canvas Area */}
      <div className="relative flex-1 bg-white rounded-3xl border border-[#EBEBEF] shadow-2xs overflow-hidden flex">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="w-full h-full block select-none cursor-grab active:cursor-grabbing"
        />

        {/* Floating Zoom Controls */}
        <div className="absolute left-6 top-6 flex flex-col gap-2 z-10">
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.15, 2.5))}
            className="w-9 h-9 rounded-xl bg-white border border-neutral-200 text-neutral-700 hover:text-neutral-950 flex items-center justify-center shadow-xs hover:bg-neutral-50 transition-colors"
            title="Zoom In"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.15, 0.35))}
            className="w-9 h-9 rounded-xl bg-white border border-neutral-200 text-neutral-700 hover:text-neutral-950 flex items-center justify-center shadow-xs hover:bg-neutral-50 transition-colors"
            title="Zoom Out"
          >
            <Minus size={16} />
          </button>
          <button
            onClick={resetView}
            className="w-9 h-9 rounded-xl bg-white border border-neutral-200 text-neutral-700 hover:text-neutral-950 flex items-center justify-center shadow-xs hover:bg-neutral-50 transition-colors"
            title="Reset View"
          >
            <Maximize2 size={15} />
          </button>
        </div>

        {/* Node Detail Drawer */}
        {selectedNode && (
          <div className="absolute right-0 top-0 bottom-0 w-80 md:w-96 bg-white border-l border-[#EBEBEF] p-6 shadow-xl flex flex-col justify-between overflow-y-auto z-20 animate-in slide-in-from-right-4 duration-200">
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-neutral-900 leading-tight">
                    {selectedNode.canonical_name}
                  </h3>
                  <span className="inline-block mt-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
                    {selectedNode.entity_type}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="text-xs text-neutral-600 leading-relaxed mt-4">
                {selectedNode.description ||
                  'Extracted entity node anchored to thematic communities.'}
              </p>

              {nodeDetail && nodeDetail.neighbors && nodeDetail.neighbors.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider font-mono mb-3">
                    Connected Relationships ({nodeDetail.neighbors.length})
                  </h4>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {nodeDetail.neighbors.map((nb, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 rounded-xl bg-neutral-50 border border-neutral-100 text-xs"
                      >
                        <span className="font-medium text-neutral-800">{nb.canonical_name}</span>
                        <span className="text-[10px] font-mono text-neutral-400 uppercase">{nb.entity_type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-neutral-100">
              <button
                onClick={onNavigateToDocuments}
                className="w-full py-2.5 rounded-xl text-xs font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 shadow-xs"
              >
                <span>View Related Documents</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
