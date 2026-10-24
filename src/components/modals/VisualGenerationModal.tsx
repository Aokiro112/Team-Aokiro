import React, { useState } from 'react';
import {
  X,
  Sparkles,
  GitBranch,
  Network,
  Cpu,
  Image as ImageIcon,
  Check,
  AlertCircle,
  Download,
} from 'lucide-react';
import { GeneratedVisual, VisualGenerationRequest, VisualGenerationType } from '../../types/backend';
import { visualsApi } from '../../services/api';
import { MermaidViewer } from '../chat/MermaidViewer';

interface VisualGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPrompt?: string;
  contextText?: string;
  documentIds?: string[];
  onVisualGenerated?: (visual: GeneratedVisual) => void;
}

export const VisualGenerationModal: React.FC<VisualGenerationModalProps> = ({
  isOpen,
  onClose,
  defaultPrompt = '',
  contextText = '',
  documentIds = [],
  onVisualGenerated,
}) => {
  const [prompt, setPrompt] = useState(defaultPrompt || 'Flowchart of the core process explained above');
  const [visualType, setVisualType] = useState<VisualGenerationType>('FLOWCHART');
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultVisual, setResultVisual] = useState<GeneratedVisual | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const typeOptions: { type: VisualGenerationType; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      type: 'FLOWCHART',
      label: 'Flowchart',
      icon: <GitBranch size={16} />,
      desc: 'Step-by-step processes, workflows, and logical progressions.',
    },
    {
      type: 'CONCEPT_MAP',
      label: 'Concept Map',
      icon: <Network size={16} />,
      desc: 'Relationships, hierarchies, and interconnections between concepts.',
    },
    {
      type: 'GRAPH_VISUALIZATION',
      label: 'Knowledge Graph',
      icon: <Network size={16} />,
      desc: 'A deterministic view of the relationships surfaced by the knowledge graph.',
    },
    {
      type: 'TECHNICAL_DIAGRAM',
      label: 'Technical Diagram',
      icon: <Cpu size={16} />,
      desc: 'Sequence diagrams, system architectures, and interactions.',
    },
    {
      type: 'ILLUSTRATION',
      label: 'Illustration',
      icon: <ImageIcon size={16} />,
      desc: 'Textbook-style educational graphics and conceptual images.',
    },
  ];

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    try {
      const req: VisualGenerationRequest = {
        prompt: prompt.trim(),
        visual_type: visualType,
        context: contextText,
        document_ids: documentIds,
      };
      const res = await visualsApi.generateVisual(req);
      setResultVisual(res);
      if (onVisualGenerated) {
        onVisualGenerated(res);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to generate visual. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-3xl max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900">Generate Visual</h3>
              <p className="text-xs text-neutral-500">
                Transform answers or concepts into grounded diagrams and illustrations.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-neutral-200/80 text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Visual Type Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 font-mono mb-2">
              Select Visual Format
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {typeOptions.map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => setVisualType(opt.type)}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between h-28 ${
                    visualType === opt.type
                      ? 'border-emerald-600 bg-emerald-50/40 shadow-xs'
                      : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                  }`}
                >
                  <div className={`p-1.5 w-fit rounded-lg ${visualType === opt.type ? 'bg-emerald-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}>
                    {opt.icon}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-neutral-900">{opt.label}</div>
                    <div className="text-[10px] text-neutral-400 line-clamp-2 mt-0.5 leading-tight">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Prompt Input */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 font-mono mb-2">
              Visual Prompt & Instructions
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Describe the diagram, concepts, and relationships to illustrate..."
              className="w-full p-3.5 rounded-2xl border border-neutral-200 text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none font-sans"
            />
          </div>

          {/* Action Button */}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-semibold shadow-xs disabled:opacity-50 transition-all cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Synthesizing Visual...</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} className="text-emerald-400" />
                   <span>{resultVisual ? 'Regenerate / Refine' : 'Generate Diagram'}</span>
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Generated Result Preview */}
          {resultVisual && (
            <div className="space-y-3 pt-4 border-t border-neutral-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-800">
                  {resultVisual.title}
                </span>
                <span className="text-[10px] font-mono text-neutral-400">
                  {(resultVisual.status === 'FALLBACK' ? 'FALLBACK · ' : '') + resultVisual.render_format.toUpperCase()}
                </span>
              </div>

              {resultVisual.render_format === 'mermaid' ? (
                <MermaidViewer
                  code={resultVisual.content}
                  title={resultVisual.title}
                  caption={resultVisual.caption || undefined}
                />
              ) : resultVisual.render_format === 'svg' ? (
                <div
                  className="p-4 bg-white rounded-2xl border border-neutral-200 overflow-auto max-h-96 flex justify-center [&_svg]:max-w-full"
                  dangerouslySetInnerHTML={{ __html: resultVisual.content }}
                />
              ) : (
                <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 overflow-hidden flex flex-col items-center">
                  <img
                    src={resultVisual.content}
                    alt={resultVisual.title}
                    className="max-h-80 rounded-xl shadow-xs object-contain"
                  />
                  {resultVisual.caption && (
                    <p className="text-xs text-neutral-500 italic mt-2 text-center">
                      {resultVisual.caption}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
