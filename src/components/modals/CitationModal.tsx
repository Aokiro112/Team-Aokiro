import React from 'react';
import { X, FileText, ExternalLink, Bookmark, CheckCircle2 } from 'lucide-react';
import { Citation } from '../../types/backend';

interface CitationModalProps {
  citation: Citation | null;
  onClose: () => void;
}

export const CitationModal: React.FC<CitationModalProps> = ({
  citation,
  onClose,
}) => {
  if (!citation) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-800">
              <FileText size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900 leading-tight">
                {citation.document_filename}
              </h3>
              <p className="text-[11px] text-neutral-500 font-mono">
                Page {citation.page_number} • Chunk ID: {citation.chunk_id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Excerpt Body */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
              <Bookmark size={13} /> Grounded Evidence Passage
            </span>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
              <CheckCircle2 size={13} />
              <span>{Math.round(citation.relevance_score * 100)}% match</span>
            </div>
          </div>

          <blockquote className="p-4 rounded-xl bg-neutral-50 border-l-4 border-neutral-900 text-neutral-800 text-sm leading-relaxed font-serif italic">
            "{citation.excerpt}"
          </blockquote>

          <div className="text-[11px] text-neutral-400">
            Source document ID: <span className="font-mono text-neutral-600">{citation.document_id}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 bg-neutral-50 border-t border-neutral-100">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
