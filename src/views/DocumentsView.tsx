import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  Search,
  MoreVertical,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle,
  Clock,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { DocumentResponse } from '../types/backend';
import { documentsApi } from '../services/api';

interface DocumentsViewProps {
  documents: DocumentResponse[];
  onRefresh: () => void;
  onSelectDocument?: (doc: DocumentResponse) => void;
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  documents,
  onRefresh,
  onSelectDocument,
}) => {
  const [filter, setFilter] = useState<'all' | 'processing'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState('');
  const [activeMenuDocId, setActiveMenuDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(5);
    setCurrentStage('QUEUED');

    try {
      await documentsApi.uploadDocument(file, (stage, pct) => {
        setCurrentStage(stage);
        setUploadProgress(pct);
      });
      onRefresh();
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        setCurrentStage('');
      }, 800);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(5);
    setCurrentStage('QUEUED');

    try {
      await documentsApi.uploadDocument(file, (stage, pct) => {
        setCurrentStage(stage);
        setUploadProgress(pct);
      });
      onRefresh();
    } catch (err) {
      console.error('Drop upload failed:', err);
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        setCurrentStage('');
      }, 800);
    }
  };

  const handleDelete = async (docId: string) => {
    await documentsApi.deleteDocument(docId);
    setActiveMenuDocId(null);
    onRefresh();
  };

  const handleReindex = async (docId: string) => {
    await documentsApi.reindexDocument(docId);
    setActiveMenuDocId(null);
    onRefresh();
  };

  // Filter documents
  const filteredDocs = documents.filter((doc) => {
    const matchesSearch = doc.filename.toLowerCase().includes(searchQuery.toLowerCase());
    if (filter === 'processing') {
      return matchesSearch && doc.status === 'PROCESSING';
    }
    return matchesSearch;
  });

  const processingCount = documents.filter((d) => d.status === 'PROCESSING').length;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold tracking-widest text-neutral-400 uppercase font-mono">
            DOCUMENTS
          </span>
          <h1 className="text-3xl font-black text-neutral-900 tracking-tight mt-1">
            Your Documents
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Upload and manage your study material. We'll extract knowledge and build connections.
          </p>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors shrink-0"
        >
          <Plus size={15} />
          <span>Upload Documents</span>
        </button>
      </div>

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".pdf,.txt,.docx,.md"
        className="hidden"
      />

      {/* Upload Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="bg-white border-2 border-dashed border-[#E4E4E7] rounded-3xl p-10 flex flex-col items-center justify-center text-center hover:border-neutral-400 transition-colors cursor-pointer group shadow-2xs"
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="w-12 h-12 rounded-2xl bg-neutral-100 flex items-center justify-center text-neutral-700 group-hover:scale-105 transition-transform mb-4">
          <Upload size={22} strokeWidth={1.8} />
        </div>
        <h3 className="text-sm font-bold text-neutral-900">
          Drag & drop your files here
        </h3>
        <p className="text-xs text-neutral-400 mt-1">or click to browse</p>
        <p className="text-[11px] text-neutral-400 mt-2 font-mono">
          Supports PDF, TXT, DOCX — Max 100MB per file
        </p>

        <button
          type="button"
          className="mt-5 px-5 py-2 rounded-xl bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition-colors shadow-xs"
        >
          Browse Files
        </button>
      </div>

      {/* Live Pipeline Status Banner (When Uploading) */}
      {isUploading && (
        <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm space-y-3 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-semibold text-neutral-800">
              <RefreshCw size={14} className="animate-spin text-neutral-900" />
              <span>Pipeline Stage: <span className="font-mono text-neutral-900">{currentStage}</span></span>
            </div>
            <span className="font-mono font-bold text-neutral-700">{uploadProgress}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-neutral-100 overflow-hidden">
            <div
              className="h-full bg-neutral-900 transition-all duration-300 rounded-full"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <div className="text-[11px] text-neutral-400 font-mono flex items-center justify-between">
            <span>Extracting Text → Chunking → Generating Embeddings → Graph Resolution</span>
            <span>FastAPI Background Task</span>
          </div>
        </div>
      )}

      {/* Filter Tabs & Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Filter Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              filter === 'all'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200/70'
            }`}
          >
            All Documents ({documents.length})
          </button>
          <button
            onClick={() => setFilter('processing')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              filter === 'processing'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200/70'
            }`}
          >
            Processing ({processingCount})
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3.5 top-3 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-neutral-200 text-xs text-neutral-800 placeholder-neutral-400 outline-none focus:border-neutral-900 transition-colors"
          />
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white rounded-2xl border border-[#EBEBEF] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/60 text-[11px] font-bold text-neutral-400 uppercase tracking-wider font-mono">
                <th className="py-3 px-6">Name</th>
                <th className="py-3 px-6">Pages</th>
                <th className="py-3 px-6">Added</th>
                <th className="py-3 px-6">Status</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-sm">
              {filteredDocs.map((doc, idx) => {
                const addedTimes = [
                  '3 hours ago',
                  '1 day ago',
                  '2 days ago',
                  '3 days ago',
                  '5 days ago',
                  '6 days ago',
                ];
                const addedLabel = addedTimes[idx] || 'Recently';
                const isProcessing = doc.status === 'PROCESSING';

                return (
                  <tr
                    key={doc.id}
                    className="hover:bg-neutral-50/70 transition-colors group cursor-pointer"
                    onClick={() => onSelectDocument && onSelectDocument(doc)}
                  >
                    {/* Name */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-700 shrink-0">
                          <FileText size={16} />
                        </div>
                        <div>
                          <span className="font-semibold text-neutral-900 hover:text-black block">
                            {doc.filename}
                          </span>
                          <span className="text-[11px] text-neutral-400 font-mono">
                            {(doc.file_size_bytes / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Pages */}
                    <td className="py-4 px-6 text-xs text-neutral-600 font-mono">
                      {doc.total_pages}
                    </td>

                    {/* Added */}
                    <td className="py-4 px-6 text-xs text-neutral-500">
                      {addedLabel}
                    </td>

                    {/* Status */}
                    <td className="py-4 px-6">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                          isProcessing
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isProcessing ? 'bg-blue-500 animate-ping' : 'bg-emerald-600'
                          }`}
                        />
                        {isProcessing ? 'Processing' : 'Processed'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td
                      className="py-4 px-6 text-right relative"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() =>
                          setActiveMenuDocId(activeMenuDocId === doc.id ? null : doc.id)
                        }
                        className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors"
                      >
                        <MoreVertical size={16} />
                      </button>

                      {/* Dropdown Menu */}
                      {activeMenuDocId === doc.id && (
                        <div className="absolute right-6 top-12 z-20 w-44 bg-white rounded-xl shadow-lg border border-neutral-200 py-1.5 text-xs text-left animate-in fade-in duration-100">
                          <button
                            onClick={() => {
                              if (onSelectDocument) onSelectDocument(doc);
                              setActiveMenuDocId(null);
                            }}
                            className="w-full flex items-center gap-2 px-3.5 py-2 hover:bg-neutral-50 text-neutral-700 font-medium"
                          >
                            <FileText size={14} /> View Details
                          </button>
                          <button
                            onClick={() => handleReindex(doc.id)}
                            className="w-full flex items-center gap-2 px-3.5 py-2 hover:bg-neutral-50 text-neutral-700 font-medium"
                          >
                            <RefreshCw size={14} /> Reindex Document
                          </button>
                          <div className="my-1 border-t border-neutral-100" />
                          <button
                            onClick={() => handleDelete(doc.id)}
                            className="w-full flex items-center gap-2 px-3.5 py-2 hover:bg-rose-50 text-rose-600 font-medium"
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
