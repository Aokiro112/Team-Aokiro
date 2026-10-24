import React, { useState, useEffect } from 'react';
import { Search, FileText, Share2, Layers, MessageSquare, ArrowRight, X } from 'lucide-react';
import { NavigationTab } from '../layout/Sidebar';
import { INITIAL_DOCUMENTS, MOCK_NODES, MOCK_TOPICS } from '../../services/mockData';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: NavigationTab) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery('');
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredDocs = INITIAL_DOCUMENTS.filter((d) =>
    d.filename.toLowerCase().includes(query.toLowerCase())
  );
  const filteredNodes = MOCK_NODES.filter((n) =>
    n.canonical_name.toLowerCase().includes(query.toLowerCase())
  );
  const filteredTopics = MOCK_TOPICS.filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-start justify-center pt-24 p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-neutral-100">
          <Search size={18} className="text-neutral-400 shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents, entities, topics or jump to page..."
            className="w-full text-sm text-neutral-800 placeholder-neutral-400 bg-transparent outline-none font-medium"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results Body */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-neutral-100 text-sm">
          {/* Quick Pages */}
          <div className="py-2">
            <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Quick Navigation
            </div>
            <button
              onClick={() => {
                onNavigate('documents');
                onClose();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-neutral-100 text-neutral-700 font-medium"
            >
              <span className="flex items-center gap-2.5">
                <FileText size={16} className="text-neutral-400" /> Documents Library
              </span>
              <ArrowRight size={14} className="text-neutral-300" />
            </button>
            <button
              onClick={() => {
                onNavigate('graph');
                onClose();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-neutral-100 text-neutral-700 font-medium"
            >
              <span className="flex items-center gap-2.5">
                <Share2 size={16} className="text-neutral-400" /> Knowledge Graph
              </span>
              <ArrowRight size={14} className="text-neutral-300" />
            </button>
            <button
              onClick={() => {
                onNavigate('topics');
                onClose();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-neutral-100 text-neutral-700 font-medium"
            >
              <span className="flex items-center gap-2.5">
                <Layers size={16} className="text-neutral-400" /> Topics & Communities
              </span>
              <ArrowRight size={14} className="text-neutral-300" />
            </button>
            <button
              onClick={() => {
                onNavigate('ask');
                onClose();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-neutral-100 text-neutral-700 font-medium"
            >
              <span className="flex items-center gap-2.5">
                <MessageSquare size={16} className="text-neutral-400" /> Ask NEXUS
              </span>
              <ArrowRight size={14} className="text-neutral-300" />
            </button>
          </div>

          {/* Documents */}
          {filteredDocs.length > 0 && (
            <div className="py-2">
              <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                Documents ({filteredDocs.length})
              </div>
              {filteredDocs.slice(0, 3).map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    onNavigate('documents');
                    onClose();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-neutral-100 text-neutral-700"
                >
                  <span className="flex items-center gap-2.5 truncate font-medium">
                    <FileText size={15} className="text-neutral-400 shrink-0" />
                    {d.filename}
                  </span>
                  <span className="text-xs text-neutral-400 font-normal shrink-0">
                    {d.total_pages} pages
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Graph Entities */}
          {filteredNodes.length > 0 && (
            <div className="py-2">
              <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                Graph Nodes ({filteredNodes.length})
              </div>
              {filteredNodes.slice(0, 4).map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    onNavigate('graph');
                    onClose();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-neutral-100 text-neutral-700"
                >
                  <span className="flex items-center gap-2.5 truncate font-medium">
                    <Share2 size={15} className="text-neutral-400 shrink-0" />
                    {n.canonical_name}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 font-medium">
                    {n.entity_type}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Topics */}
          {filteredTopics.length > 0 && (
            <div className="py-2">
              <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                Topics ({filteredTopics.length})
              </div>
              {filteredTopics.slice(0, 3).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onNavigate('topics');
                    onClose();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-neutral-100 text-neutral-700"
                >
                  <span className="flex items-center gap-2.5 truncate font-medium">
                    <Layers size={15} className="text-neutral-400 shrink-0" />
                    {t.name}
                  </span>
                  <span className="text-xs text-neutral-400">
                    {t.entity_count} mentions
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2.5 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between text-[11px] text-neutral-400">
          <span>Navigation: <kbd className="font-mono bg-white px-1 py-0.5 rounded border border-neutral-200">↑</kbd> <kbd className="font-mono bg-white px-1 py-0.5 rounded border border-neutral-200">↓</kbd></span>
          <span>Select: <kbd className="font-mono bg-white px-1 py-0.5 rounded border border-neutral-200">Enter</kbd></span>
          <span>Close: <kbd className="font-mono bg-white px-1 py-0.5 rounded border border-neutral-200">Esc</kbd></span>
        </div>
      </div>
    </div>
  );
};
