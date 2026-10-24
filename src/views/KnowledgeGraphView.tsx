import React, { useState, useEffect, useRef, useMemo } from 'react';
// @ts-ignore
import ForceGraph2D from 'react-force-graph-2d';
import {
  Search,
  Plus,
  Minus,
  Maximize2,
  X,
  ArrowRight,
  Sparkles,
  Compass,
  Network,
  Layers,
} from 'lucide-react';
import { NodeModel, EdgeModel, NodeDetailResponse } from '../types/backend';
import { graphApi } from '../services/api';

interface KnowledgeGraphViewProps {
  onNavigateToDocuments?: () => void;
}

export const KnowledgeGraphView: React.FC<KnowledgeGraphViewProps> = ({
  onNavigateToDocuments,
}) => {
  const fgRef = useRef<any>(null);
  const [rawNodes, setRawNodes] = useState<NodeModel[]>([]);
  const [rawEdges, setRawEdges] = useState<EdgeModel[]>([]);
  const [filterType, setFilterType] = useState<string>('All');
  const [densityLimit, setDensityLimit] = useState<'core' | 'standard' | 'all'>('standard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<NodeModel | null>(null);
  const [nodeDetail, setNodeDetail] = useState<NodeDetailResponse | null>(null);

  // Highlighting state
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());
  const [highlightedEdgeIds, setHighlightedEdgeIds] = useState<Set<string>>(new Set());
  const [highlightInfo, setHighlightInfo] = useState<{ title: string; count: number } | null>(null);

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
    
    // Highlight selected node and immediate neighbors
    const linkedNodeIds = new Set<string>([node.id]);
    const linkedEdgeIds = new Set<string>();

    activeEdges.forEach((e) => {
      const sId = typeof e.source === 'object' ? (e.source as any).id : e.source;
      const tId = typeof e.target === 'object' ? (e.target as any).id : e.target;
      if (sId === node.id) {
        linkedNodeIds.add(tId);
        linkedEdgeIds.add(e.id);
      }
      if (tId === node.id) {
        linkedNodeIds.add(sId);
        linkedEdgeIds.add(e.id);
      }
    });

    setHighlightedNodeIds(linkedNodeIds);
    setHighlightedEdgeIds(linkedEdgeIds);
    setHighlightInfo({
      title: node.canonical_name,
      count: linkedNodeIds.size,
    });

    try {
      const detail = await graphApi.getNodeDetails(node.id);
      setNodeDetail(detail);
    } catch (err) {
      console.warn('Failed to load node detail:', err);
    }
  };

  const clearHighlight = () => {
    setHighlightedNodeIds(new Set());
    setHighlightedEdgeIds(new Set());
    setHighlightInfo(null);
  };

  // Filter and prioritize nodes by density limit & search query
  const activeNodes = useMemo(() => {
    let list = [...rawNodes];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
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
  }, [rawNodes, rawEdges, densityLimit, searchQuery]);

  const activeNodeIds = useMemo(() => new Set(activeNodes.map((n) => n.id)), [activeNodes]);

  const activeEdges = useMemo(() => {
    return rawEdges.filter((e) => activeNodeIds.has(e.source) && activeNodeIds.has(e.target));
  }, [rawEdges, activeNodeIds]);

  const topicList = useMemo(() => {
    return rawNodes.filter((n) => n.entity_type === 'Topic');
  }, [rawNodes]);

  // Formatted GraphData for react-force-graph-2d
  const graphData = useMemo(() => ({
    nodes: activeNodes.map(n => ({
      ...n,
      id: n.id,
      name: n.canonical_name,
      val: n.entity_type === 'Topic' ? 12 : Math.min(14, Math.max(5, (n.degree || 1) * 0.8 + 3))
    })),
    links: activeEdges.map(e => ({
      ...e,
      source: e.source,
      target: e.target
    }))
  }), [activeNodes, activeEdges]);

  // Tune D3 physics layout for comfortable spacing and collision avoidance
  useEffect(() => {
    if (fgRef.current) {
      const fg = fgRef.current;
      if (typeof fg.d3Force === 'function') {
        fg.d3Force('charge')?.strength(-280);
        fg.d3Force('link')?.distance(90);
      }
    }
  }, [graphData]);

  // Zoom to Topic Cluster
  const zoomToTopicCluster = (topic: NodeModel) => {
    if (fgRef.current) {
      const gnode = graphData.nodes.find((n: any) => n.id === topic.id);
      if (gnode && (gnode as any).x !== undefined) {
        fgRef.current.centerAt((gnode as any).x, (gnode as any).y, 600);
        fgRef.current.zoom(2.2, 600);
      }
    }
    const linked = new Set<string>([topic.id]);
    const linkedEdges = new Set<string>();
    activeEdges.forEach((e) => {
      const sId = typeof e.source === 'object' ? (e.source as any).id : e.source;
      const tId = typeof e.target === 'object' ? (e.target as any).id : e.target;
      if (sId === topic.id) {
        linked.add(tId);
        linkedEdges.add(e.id);
      }
      if (tId === topic.id) {
        linked.add(sId);
        linkedEdges.add(e.id);
      }
    });
    setHighlightedNodeIds(linked);
    setHighlightedEdgeIds(linkedEdges);
    setHighlightInfo({ title: `Cluster: ${topic.canonical_name}`, count: linked.size });
    handleSelectNode(topic);
  };

  const getBaseColor = (type: string): string => {
    switch (type) {
      case 'Topic': return '#7C3AED';
      case 'Person': return '#10b981';
      case 'Organization': return '#f59e0b';
      case 'Technology': return '#06b6d4';
      case 'MedicalCondition': return '#ef4444';
      case 'Concept': return '#6366f1';
      default: return '#6366f1';
    }
  };

  const getNodeColor = (node: any): string => {
    if (highlightedNodeIds.size > 0 && !highlightedNodeIds.has(node.id)) return '#1e293b';
    return getBaseColor(node.entity_type);
  };

  const resetView = () => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(500, 60);
    }
    clearHighlight();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-5 animate-in fade-in duration-200 relative flex flex-col h-[calc(100vh-4.5rem)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div>
          <span className="text-[11px] font-bold tracking-widest text-neutral-400 uppercase font-mono">
            TOPIC-AUGMENTED KNOWLEDGE GRAPH
          </span>
          <h1 className="text-3xl font-black text-neutral-900 tracking-tight mt-1">
            Explore Connections
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Interactive, clustered node-link knowledge graph mapping entity relationships and topic communities.
          </p>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <div className="relative w-full sm:w-56">
            <Search size={14} className="absolute left-3.5 top-2.5 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search entities or topics..."
              className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-white border border-neutral-200 text-xs text-neutral-800 placeholder-neutral-400 outline-none focus:border-neutral-900 transition-colors shadow-2xs"
            />
          </div>

          <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl">
            {['All', 'Topic', 'Person', 'Concept', 'Organization'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
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
              className={`px-2.5 py-1 rounded-lg cursor-pointer ${
                densityLimit === 'core' ? 'bg-white font-bold text-neutral-900 shadow-2xs' : 'text-neutral-500'
              }`}
            >
              Core (15)
            </button>
            <button
              onClick={() => setDensityLimit('standard')}
              className={`px-2.5 py-1 rounded-lg cursor-pointer ${
                densityLimit === 'standard' ? 'bg-white font-bold text-neutral-900 shadow-2xs' : 'text-neutral-500'
              }`}
            >
              Standard (35)
            </button>
            <button
              onClick={() => setDensityLimit('all')}
              className={`px-2.5 py-1 rounded-lg cursor-pointer ${
                densityLimit === 'all' ? 'bg-white font-bold text-neutral-900 shadow-2xs' : 'text-neutral-500'
              }`}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {/* Main Interactive Canvas Area */}
      <div className="relative flex-1 bg-[#0f172a] rounded-3xl border border-neutral-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Top Floating Controls & Thematic Chips */}
        <div className="absolute top-4 left-4 right-4 z-10 flex flex-col gap-2.5 pointer-events-none">
          <div className="flex items-center justify-between">
            {/* Status / Highlight Info */}
            <div className="pointer-events-auto">
              {highlightInfo ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-medium shadow-lg animate-in fade-in">
                  <Sparkles size={13} />
                  <span>{highlightInfo.title} ({highlightInfo.count} nodes connected)</span>
                  <button
                    onClick={clearHighlight}
                    className="p-0.5 hover:bg-emerald-600 rounded transition-colors ml-1 cursor-pointer"
                    title="Clear highlight"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/70 text-slate-200 text-xs font-semibold shadow-md">
                  <Network size={14} className="text-indigo-400" />
                  <span>Topic-Augmented Graph</span>
                  <span className="text-[10px] font-mono text-slate-400">
                    ({activeNodes.length} nodes · {activeEdges.length} links)
                  </span>
                </div>
              )}
            </div>

            {/* Camera Zoom Buttons */}
            <div className="pointer-events-auto flex items-center gap-1 bg-slate-900/90 backdrop-blur-md border border-slate-700/70 p-1 rounded-xl shadow-md">
              <button
                onClick={() => {
                  if (fgRef.current) {
                    const currentZoom = fgRef.current.zoom();
                    fgRef.current.zoom(currentZoom * 1.25, 400);
                  }
                }}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Zoom In"
              >
                <Plus size={15} />
              </button>
              <button
                onClick={() => {
                  if (fgRef.current) {
                    const currentZoom = fgRef.current.zoom();
                    fgRef.current.zoom(currentZoom * 0.8, 400);
                  }
                }}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Zoom Out"
              >
                <Minus size={15} />
              </button>
              <button
                onClick={resetView}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Reset View"
              >
                <Maximize2 size={15} />
              </button>
            </div>
          </div>

          {/* Click-to-Zoom Thematic Topic Chips Bar */}
          {topicList.length > 0 && (
            <div className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto py-1 px-1 scrollbar-none">
              <span className="text-[10px] font-mono font-bold text-purple-300 bg-purple-950/70 border border-purple-800/60 px-2 py-1 rounded-lg shrink-0 flex items-center gap-1">
                <Compass size={11} />
                THEMES:
              </span>
              {topicList.map((top) => (
                <button
                  key={top.id}
                  onClick={() => zoomToTopicCluster(top)}
                  className="px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-purple-900/50 border border-purple-700/50 text-purple-200 hover:text-purple-100 text-[11px] font-semibold whitespace-nowrap shadow-sm transition-all flex items-center gap-1 cursor-pointer backdrop-blur-xs"
                >
                  <span className="text-purple-400">✦</span>
                  <span>{top.canonical_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ForceGraph2D Canvas */}
        <div className="flex-1 w-full h-full relative">
          {/* @ts-ignore */}
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            nodeId="id"
            nodeColor={(node: any) => getNodeColor(node)}
            nodeVal={(node: any) => node.val}
            nodeLabel={(node: any) => node.name}
            linkColor={(link: any) => {
              const linkId = (link as any).id;
              if (highlightedEdgeIds.has(linkId)) return '#10b981';
              return (link as any).relationship_type === 'BELONGS_TO_TOPIC' ? '#a78bfa' : '#475569';
            }}
            linkWidth={(link: any) => {
              const linkId = (link as any).id;
              return highlightedEdgeIds.has(linkId) ? 2.5 : 1.2;
            }}
            linkDirectionalArrowLength={5}
            linkDirectionalArrowRelPos={1}
            linkLabel={(link: any) => (link as any).relationship_type || ''}
            onNodeClick={(node: any) => handleSelectNode(node as NodeModel)}
            nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
              const isTopic = node.entity_type === 'Topic';
              const isSynthetic = node.metadata?.dataset_status === 'SYNTHETIC';
              const r = isTopic ? 11 : Math.min(14, Math.max(5, (node.degree || 1) * 0.8 + 3));
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
              ctx.fillText(node.name, node.x, node.y + r + 3 / globalScale);
            }}
            nodeCanvasObjectMode={() => 'replace'}
            backgroundColor="#0f172a"
            cooldownTicks={100}
            d3AlphaDecay={0.025}
            d3VelocityDecay={0.35}
            // @ts-ignore
            className="w-full h-full"
          />

          {/* Node Detail Drawer / Floating Inspector */}
          {selectedNode && (
            <div className="absolute right-4 top-16 bottom-4 w-80 md:w-96 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-5 shadow-2xl flex flex-col justify-between overflow-y-auto z-20 animate-in slide-in-from-right-4 duration-200">
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span
                      className={`text-[10px] uppercase font-bold font-mono tracking-wider px-2 py-0.5 rounded-full ${
                        selectedNode.entity_type === 'Topic'
                          ? 'bg-purple-900/80 text-purple-200 border border-purple-700'
                          : selectedNode.entity_type === 'Person'
                          ? 'bg-emerald-900/80 text-emerald-200 border border-emerald-700'
                          : selectedNode.entity_type === 'Organization'
                          ? 'bg-amber-900/80 text-amber-200 border border-amber-700'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {selectedNode.entity_type}
                    </span>
                    <h3 className="text-lg font-bold text-white leading-tight mt-1.5">
                      {selectedNode.canonical_name}
                    </h3>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedNode(null);
                      clearHighlight();
                    }}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed mt-3">
                  {selectedNode.description ||
                    'Extracted entity node anchored to thematic communities.'}
                </p>

                {nodeDetail && nodeDetail.neighbors && nodeDetail.neighbors.length > 0 && (
                  <div className="mt-5">
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-2.5">
                      Connected Relationships ({nodeDetail.neighbors.length})
                    </h4>
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                      {nodeDetail.neighbors.map((nb, i) => (
                        <div
                          key={i}
                          onClick={() => handleSelectNode(nb)}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 text-xs cursor-pointer transition-colors"
                        >
                          <span className="font-medium text-slate-200">{nb.canonical_name}</span>
                          <span className="text-[10px] font-mono text-slate-400 uppercase">{nb.entity_type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-800 mt-4">
                <button
                  onClick={onNavigateToDocuments}
                  className="w-full py-2.5 rounded-xl text-xs font-semibold bg-white text-slate-900 hover:bg-slate-100 transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <span>View Related Documents</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KnowledgeGraphView;
