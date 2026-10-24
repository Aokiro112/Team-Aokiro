import React from 'react';
import { X, Download, FileText, Tag, ZoomIn, ExternalLink } from 'lucide-react';
import { VisualEvidence } from '../../types/backend';
import { resolveApiAssetUrl } from '../../services/api';

interface VisualPreviewModalProps {
  visual: VisualEvidence | null;
  onClose: () => void;
}

export const VisualPreviewModal: React.FC<VisualPreviewModalProps> = ({ visual, onClose }) => {
  if (!visual) return null;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = resolveApiAssetUrl(visual.image_url);
    link.download = `${visual.id}.${visual.format || 'png'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50/50">
          <div className="flex items-center gap-3 min-w-0">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
              {visual.visual_type}
            </span>
            {visual.analysis_status && visual.analysis_status !== 'ANALYZED' && (
              <span className="px-2 py-1 rounded-full text-[10px] font-mono font-semibold bg-amber-50 text-amber-800 border border-amber-200/80">
                {visual.analysis_status}
              </span>
            )}
            <div className="min-w-0">
              <h3 className="text-base font-bold text-neutral-900 truncate">
                {visual.title || `Visual Asset (p. ${visual.page_number})`}
              </h3>
              <p className="text-xs text-neutral-500 flex items-center gap-2 mt-0.5 font-mono">
                <span>{visual.document_filename}</span>
                <span>•</span>
                <span>Page {visual.page_number}</span>
                {visual.width && visual.height && (
                  <>
                    <span>•</span>
                    <span>{visual.width} × {visual.height} px</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200/80 text-neutral-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Download size={14} />
              <span>Download</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-neutral-200/80 text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Main Image View */}
          <div className="flex items-center justify-center p-4 bg-neutral-50 rounded-2xl border border-neutral-200/80 overflow-hidden max-h-[480px]">
            <img
              src={resolveApiAssetUrl(visual.image_url)}
              alt={visual.caption || visual.title || 'Visual evidence'}
              className="max-h-[440px] max-w-full object-contain rounded-lg shadow-xs"
              onError={(e) => {
                // Fallback placeholder if image load fails
                (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><rect width="100%" height="100%" fill="%23f1f5f9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="14" fill="%2364748b">Visual Asset Preview</text></svg>';
              }}
            />
          </div>

          {/* Caption & Analysis Card */}
          <div className="space-y-4">
            {visual.caption && (
              <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 font-mono block mb-1">
                  Document Caption
                </span>
                <p className="text-xs font-semibold text-neutral-800 italic">
                  "{visual.caption}"
                </p>
              </div>
            )}

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 font-mono block mb-1">
                Visual Content Analysis
              </span>
              <p className="text-xs leading-relaxed text-neutral-700">
                {visual.description}
              </p>
              {visual.analysis_error && (
                <p className="text-[11px] text-amber-700 mt-1.5">{visual.analysis_error}</p>
              )}
            </div>

            {visual.detailed_analysis && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 font-mono block mb-1">
                  Structured Interpretation
                </span>
                <p className="text-xs leading-relaxed text-neutral-600 bg-neutral-50/70 p-3 rounded-xl border border-neutral-200/60 font-mono">
                  {visual.detailed_analysis}
                </p>
              </div>
            )}

            {visual.detected_labels && visual.detected_labels.length > 0 && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 font-mono block mb-1.5">
                  Detected Labels & Components
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {visual.detected_labels.map((lbl, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/70"
                    >
                      <Tag size={10} className="text-emerald-600" />
                      <span>{lbl}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
