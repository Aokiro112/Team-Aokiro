import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { NodeModel, EdgeModel, NodeDetailResponse } from '../types/backend';
import { graphApi } from '../services/api';

interface KnowledgeGraphViewProps {
  onNavigateToDocuments?: () => void;
}

export const KnowledgeGraphView: React.FC<KnowledgeGraphViewProps> = ({
  onNavigateToDocuments,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<NodeModel[]>([]);
  const [edges, setEdges] = useState<EdgeModel[]>([]);
  const [filterType, setFilterType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<NodeModel | null>(null);
  const [nodeDetail, setNodeDetail] = useState<NodeDetailResponse | null>(null);

  // Transform and interaction state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Node positions in canvas coordinate space
  const nodePositionsRef = useRef<
    Map<string, { x: number; y: number; vx: number; vy: number; isCenter?: boolean }>
  >(new Map());

  // Load Graph Data
  useEffect(() => {
    const fetchGraph = async () => {
      const data = await graphApi.getGraph(50, 0, filterType === 'All' ? undefined : filterType);
      setNodes(data.nodes);
      setEdges(data.edges);

      // Default select highest degree node
      const sorted = [...data.nodes].sort((a, b) => (b.degree || 0) - (a.degree || 0));
      const primaryNode = sorted[0];
      if (primaryNode) {
        setSelectedNode(primaryNode);
        const detail = await graphApi.getNodeDetails(primaryNode.id);
        setNodeDetail(detail);
      }
    };
    fetchGraph();
  }, [filterType]);

  // Handle Node selection
  const handleSelectNode = async (node: NodeModel) => {
    setSelectedNode(node);
    const detail = await graphApi.getNodeDetails(node.id);
    setNodeDetail(detail);
  };

  // Initialize node layout positions (radial around Transformer matching the screenshot)
  useEffect(() => {
    if (nodes.length === 0) return;

    const positions = new Map<
      string,
      { x: number; y: number; vx: number; vy: number; isCenter?: boolean }
    >();

    const sorted = [...nodes].sort((a, b) => (b.degree || 0) - (a.degree || 0));
    const centerNode = sorted[0];

    // Center node position (0, 0 in canvas center)
    positions.set(centerNode.id, { x: 0, y: 0, vx: 0, vy: 0, isCenter: true });

    // Other connected nodes radially distributed
    const otherNodes = nodes.filter((n) => n.id !== centerNode.id);
    const radius = 240;
    const angleStep = (2 * Math.PI) / (otherNodes.length || 1);

    otherNodes.forEach((node, idx) => {
      const angle = idx * angleStep - Math.PI / 2;
      // Stagger radius slightly for organic natural appearance
      const r = radius + (idx % 2 === 0 ? 30 : -25);
      positions.set(node.id, {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        vx: 0,
        vy: 0,
      });
    });

    nodePositionsRef.current = positions;
  }, [nodes]);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.clearRect(0, 0, width, height);

      // Save canvas state
      ctx.save();

      // Pan & Zoom
      ctx.translate(width / 2 + pan.x, height / 2 + pan.y);
      ctx.scale(zoom, zoom);

      const positions = nodePositionsRef.current;

      // Draw Edges
      edges.forEach((edge) => {
        const sourcePos = positions.get(edge.source);
        const targetPos = positions.get(edge.target);
        if (!sourcePos || !targetPos) return;

        const isHighlighted =
          selectedNode &&
          (edge.source === selectedNode.id || edge.target === selectedNode.id);

        ctx.beginPath();
        ctx.moveTo(sourcePos.x, sourcePos.y);
        ctx.lineTo(targetPos.x, targetPos.y);
        ctx.strokeStyle = isHighlighted ? '#18181B' : '#E2E2E8';
        ctx.lineWidth = isHighlighted ? 2 : 1.2;
        ctx.stroke();

        // Subtle link connector dot
        ctx.beginPath();
        ctx.arc((sourcePos.x + targetPos.x) / 2, (sourcePos.y + targetPos.y) / 2, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = isHighlighted ? '#18181B' : '#D1D1D8';
        ctx.fill();
      });

      // Draw Nodes
      nodes.forEach((node) => {
        const pos = positions.get(node.id);
        if (!pos) return;

        const isSelected = selectedNode?.id === node.id;
        const isHovered = hoveredNodeId === node.id;
        const isPrimary = node.canonical_name === 'Transformer';

        const label = node.canonical_name;
        ctx.font = isPrimary
          ? '600 13px "Plus Jakarta Sans", sans-serif'
          : '500 12px "Plus Jakarta Sans", sans-serif';

        const textMetrics = ctx.measureText(label);
        const paddingX = 14;
        const paddingY = 8;
        const pillWidth = textMetrics.width + paddingX * 2 + (isPrimary ? 8 : 16);
        const pillHeight = 32;

        const rx = pos.x - pillWidth / 2;
        const ry = pos.y - pillHeight / 2;

        // Draw pill container
        ctx.beginPath();
        ctx.roundRect(rx, ry, pillWidth, pillHeight, 16);

        if (isPrimary || isSelected) {
          ctx.fillStyle = '#0F0F11';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 3;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;

          ctx.fillStyle = '#FFFFFF';
        } else {
          ctx.fillStyle = isHovered ? '#FFFFFF' : '#FFFFFF';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.05)';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetY = 2;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;

          ctx.strokeStyle = isHovered ? '#0F0F11' : '#E4E4E7';
          ctx.lineWidth = 1.2;
          ctx.stroke();

          ctx.fillStyle = '#18181B';
        }

        // Draw tiny icon indicator for non-primary nodes
        if (!isPrimary) {
          ctx.beginPath();
          ctx.arc(rx + 14, pos.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = node.entity_type === 'Topic' ? '#6366F1' : '#A1A1AA';
          ctx.fill();
        }

        // Text
        ctx.fillStyle = isPrimary || isSelected ? '#FFFFFF' : '#18181B';
        ctx.textBaseline = 'middle';
        const textX = isPrimary ? rx + pillWidth / 2 - textMetrics.width / 2 : rx + 24;
        ctx.fillText(label, textX, pos.y);
      });

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, [nodes, edges, selectedNode, hoveredNodeId, zoom, pan]);

  // Canvas Mouse & Interaction handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
      return;
    }

    // Check node hover
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - canvas.clientWidth / 2 - pan.x;
    const mouseY = e.clientY - rect.top - canvas.clientHeight / 2 - pan.y;

    const scaledX = mouseX / zoom;
    const scaledY = mouseY / zoom;

    const positions = nodePositionsRef.current;
    let foundNodeId: string | null = null;

    for (const [id, pos] of positions.entries()) {
      const dist = Math.hypot(scaledX - pos.x, scaledY - pos.y);
      if (dist < 40) {
        foundNodeId = id;
        break;
      }
    }

    setHoveredNodeId(foundNodeId);
    canvas.style.cursor = foundNodeId ? 'pointer' : isDragging ? 'grabbing' : 'grab';
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    setIsDragging(false);

    // If mouse didn't drag much, treat as click
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - canvas.clientWidth / 2 - pan.x) / zoom;
    const mouseY = (e.clientY - rect.top - canvas.clientHeight / 2 - pan.y) / zoom;

    const positions = nodePositionsRef.current;
    for (const [id, pos] of positions.entries()) {
      const dist = Math.hypot(mouseX - pos.x, mouseY - pos.y);
      if (dist < 40) {
        const clicked = nodes.find((n) => n.id === id);
        if (clicked) handleSelectNode(clicked);
        break;
      }
    }
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200 relative flex flex-col h-[calc(100vh-5rem)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div>
          <span className="text-[11px] font-bold tracking-widest text-neutral-400 uppercase font-mono">
            KNOWLEDGE GRAPH
          </span>
          <h1 className="text-3xl font-black text-neutral-900 tracking-tight mt-1">
            Explore Connections
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Visualize how concepts, topics and documents are connected.
          </p>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Search nodes */}
          <div className="relative w-full sm:w-64">
            <Search size={15} className="absolute left-3.5 top-3 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search nodes..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-neutral-200 text-xs text-neutral-800 placeholder-neutral-400 outline-none focus:border-neutral-900 transition-colors"
            />
          </div>

          {/* Type Filter Pills */}
          <div className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded-xl">
            {['All', 'Entity', 'Topic', 'Document'].map((type) => (
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
        </div>
      </div>

      {/* Main Interactive Canvas Area */}
      <div className="relative flex-1 bg-white rounded-3xl border border-[#EBEBEF] shadow-2xs overflow-hidden flex">
        {/* Canvas */}
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="w-full h-full block select-none cursor-grab active:cursor-grabbing"
        />

        {/* Floating Zoom Controls (Left) */}
        <div className="absolute left-6 top-6 flex flex-col gap-2 z-10">
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.15, 2.5))}
            className="w-9 h-9 rounded-xl bg-white border border-neutral-200 text-neutral-700 hover:text-neutral-950 flex items-center justify-center shadow-xs hover:bg-neutral-50 transition-colors"
            title="Zoom In"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.15, 0.4))}
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

        {/* Minimap Card (Top Right) */}
        <div className="hidden md:flex absolute right-6 top-6 w-36 h-28 bg-white/90 backdrop-blur-xs rounded-2xl border border-neutral-200 p-2 flex-col justify-between shadow-xs pointer-events-none">
          <div className="flex items-center justify-between text-[10px] text-neutral-400 font-mono">
            <span>RADAR</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          </div>
          {/* Mini schematic */}
          <div className="flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border border-dashed border-neutral-300 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-neutral-900" />
            </div>
          </div>
          <span className="text-[9px] text-neutral-400 text-center font-mono">
            {nodes.length} nodes
          </span>
        </div>

        {/* Node Detail Drawer / Flyout (Right side) */}
        {selectedNode && (
          <div className="absolute right-0 top-0 bottom-0 w-80 md:w-96 bg-white border-l border-[#EBEBEF] p-6 shadow-xl flex flex-col justify-between overflow-y-auto z-20 animate-in slide-in-from-right-4 duration-200">
            <div>
              {/* Header */}
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

              {/* Description */}
              <p className="text-xs text-neutral-600 leading-relaxed mt-4">
                {selectedNode.description ||
                  'Extracted concept entity with grounded cross-document relationship bindings.'}
              </p>

              {/* Related Topics list */}
              <div className="mt-6">
                <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider font-mono mb-3">
                  Related Topics
                </h4>
                <div className="space-y-2">
                  {nodeDetail?.associated_topics ? (
                    nodeDetail.associated_topics.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50 border border-neutral-100 text-xs"
                      >
                        <span className="font-medium text-neutral-800">{t.name}</span>
                        <span className="font-mono text-neutral-400">{t.weight || 4}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-neutral-400">Loading connections...</div>
                  )}
                </div>
              </div>

              {/* Evidence Chunks */}
              <div className="mt-6">
                <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider font-mono mb-2">
                  Source Provenance
                </h4>
                <div className="p-3 rounded-xl bg-neutral-50 text-[11px] text-neutral-600 leading-relaxed font-serif italic border border-neutral-100">
                  "{nodeDetail?.source_chunks[0]?.text ||
                    'Extracted via hybrid LLM + dependency parsing pipeline.'}"
                </div>
              </div>
            </div>

            {/* Bottom CTA */}
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
