import React from 'react';
import { X, FileText, RefreshCw, Trash2, Database, Network, Clock, CheckCircle } from 'lucide-react';
import { DocumentResponse } from '../../types/backend';

interface DocumentDetailModalProps {
  document: DocumentResponse | null;
  onClose: () => void;
  onReindex?: (id: string) => void;
  onDelete?: (id: string) => void;
  onNavigateToGraph?: () => void;
}

export const DocumentDetailModal: React.FC<DocumentDetailModalProps> = ({
  document,
  onClose,
  onReindex,
  onDelete,
  onNavigateToGraph,
}) => {
  if (!document) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-800">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900 leading-tight">
                {document.filename}
              </h3>
              <p className="text-xs text-neutral-400 font-mono">
                {(document.file_size_bytes / (1024 * 1024)).toFixed(2)} MB • {document.content_type}
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

        {/* Content */}
        <div className="p-6 space-y-5 text-xs">
          {/* Status Banner */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-neutral-50 border border-neutral-100">
            <span className="font-semibold text-neutral-700">Ingestion Status:</span>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                document.status === 'PROCESSING'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {document.status}
            </span>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl border border-neutral-200/80 bg-white">
              <span className="text-[11px] text-neutral-400 font-mono uppercase block">Pages</span>
              <span className="text-lg font-bold text-neutral-900">{document.total_pages}</span>
            </div>
            <div className="p-3.5 rounded-xl border border-neutral-200/80 bg-white">
              <span className="text-[11px] text-neutral-400 font-mono uppercase block">Chunks</span>
              <span className="text-lg font-bold text-neutral-900">{document.total_chunks}</span>
            </div>
            <div className="p-3.5 rounded-xl border border-neutral-200/80 bg-white">
              <span className="text-[11px] text-neutral-400 font-mono uppercase block">Extracted Entities</span>
              <span className="text-lg font-bold text-neutral-900">{document.total_entities}</span>
            </div>
            <div className="p-3.5 rounded-xl border border-neutral-200/80 bg-white">
              <span className="text-[11px] text-neutral-400 font-mono uppercase block">Relationships</span>
              <span className="text-lg font-bold text-neutral-900">{document.total_relationships}</span>
            </div>
          </div>

          {/* Technical Metadata */}
          <div className="p-3 rounded-xl bg-neutral-50 font-mono text-[11px] text-neutral-600 space-y-1">
            <div>Document ID: <span className="text-neutral-900">{document.id}</span></div>
            <div>Content Hash: <span className="text-neutral-900">{document.content_hash}</span></div>
            <div>Indexed At: <span className="text-neutral-900">{new Date(document.created_at).toLocaleString()}</span></div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-neutral-50 border-t border-neutral-100">
          <div className="flex gap-2">
            {onDelete && (
              <button
                onClick={() => {
                  onDelete(document.id);
                  onClose();
                }}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-1.5"
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
            {onReindex && (
              <button
                onClick={() => {
                  onReindex(document.id);
                  onClose();
                }}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-neutral-700 hover:bg-neutral-200/70 transition-colors flex items-center gap-1.5"
              >
                <RefreshCw size={14} /> Reindex
              </button>
            )}
          </div>

          {onNavigateToGraph && (
            <button
              onClick={() => {
                onNavigateToGraph();
                onClose();
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Network size={14} /> View in Graph
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
