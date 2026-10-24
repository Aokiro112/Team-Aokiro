import React from 'react';
import {
  Upload,
  Share2,
  Columns,
  MessageSquare,
  FileText,
  ArrowRight,
  Database,
  Network,
  GitBranch,
} from 'lucide-react';
import { NavigationTab } from '../components/layout/Sidebar';
import { DocumentResponse } from '../types/backend';
import { formatRelativeTime } from './DocumentsView';

interface HomeViewProps {
  documents: DocumentResponse[];
  onNavigate: (tab: NavigationTab) => void;
  onSelectDocument?: (doc: DocumentResponse) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  documents,
  onNavigate,
  onSelectDocument,
}) => {
  const quickActions = [
    {
      title: 'Split Workspace',
      subtitle: 'Dual chat & graph',
      icon: Columns,
      tab: 'workspace' as NavigationTab,
    },
    {
      title: 'Upload Documents',
      subtitle: 'PDF, TXT and more',
      icon: Upload,
      tab: 'documents' as NavigationTab,
    },
    {
      title: 'Explore Graph',
      subtitle: 'See connections',
      icon: Share2,
      tab: 'graph' as NavigationTab,
    },
    {
      title: 'Ask NEXUS',
      subtitle: 'Get clear answers',
      icon: MessageSquare,
      tab: 'ask' as NavigationTab,
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-200">
      {/* Hero Welcome Banner */}
      <div className="bg-white rounded-3xl p-8 border border-[#EBEBEF] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6 overflow-hidden relative">
        <div className="space-y-3 max-w-xl z-10">
          <span className="text-[11px] font-bold tracking-widest text-neutral-400 uppercase font-mono">
            WELCOME BACK
          </span>
          <h1 className="text-3xl md:text-4xl font-black text-neutral-900 tracking-tight leading-tight">
            Turn Your Documents into Real Understanding.
          </h1>
          <p className="text-sm text-neutral-500 leading-relaxed">
            Upload documents, explore connections, and ask questions to get accurate, source-backed answers.
          </p>
        </div>

        {/* Artistic Fluid Monochrome Wave Graphic */}
        <div className="relative w-full md:w-64 h-36 bg-[#18181B] rounded-2xl flex flex-col justify-between p-4 overflow-hidden shrink-0 shadow-md">
          {/* Wave SVG illustration */}
          <div className="absolute inset-0 opacity-40 mix-blend-screen pointer-events-none">
            <svg viewBox="0 0 400 200" className="w-full h-full object-cover">
              <path
                d="M 0,100 C 100,20 200,180 300,80 C 350,30 400,120 450,90 L 400,200 L 0,200 Z"
                fill="none"
                stroke="white"
                strokeWidth="1.5"
                opacity="0.6"
              />
              <path
                d="M -50,130 C 80,40 180,160 280,110 C 330,70 380,140 430,100"
                fill="none"
                stroke="white"
                strokeWidth="1"
                opacity="0.4"
              />
              <path
                d="M 20,80 C 120,160 220,40 320,140 C 360,90 410,120 460,80"
                fill="none"
                stroke="white"
                strokeWidth="1.2"
                opacity="0.5"
              />
            </svg>
          </div>

          <div className="z-10">
            <span className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase font-mono block">
              KNOWLEDGE
            </span>
            <span className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase font-mono block">
              CONNECTS
            </span>
            <span className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase font-mono block">
              IDEAS
            </span>
          </div>

          <div className="z-10 flex items-center justify-between">
            <span className="text-[10px] text-neutral-400 font-mono">v1.0.0</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          </div>
        </div>
      </div>

      {/* 4 Quick Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <div
              key={action.title}
              onClick={() => onNavigate(action.tab)}
              className="bg-white p-5 rounded-2xl border border-[#EBEBEF] hover:border-neutral-300 shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col justify-between h-32"
            >
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-neutral-100/90 flex items-center justify-center text-neutral-800 group-hover:bg-[#0F0F11] group-hover:text-white transition-colors duration-200">
                  <Icon size={18} strokeWidth={2} />
                </div>
                <ArrowRight
                  size={16}
                  className="text-neutral-300 group-hover:text-neutral-900 group-hover:translate-x-1 transition-all duration-200"
                />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900 group-hover:text-black">
                  {action.title}
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">{action.subtitle}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Two-Column Lower Section: Recent Documents & Knowledge Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Recent Documents (Spans 2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-[#EBEBEF] shadow-2xs">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wider font-mono">
              Recent Documents
            </h2>
            <button
              onClick={() => onNavigate('documents')}
              className="text-xs font-semibold text-neutral-500 hover:text-neutral-900 flex items-center gap-1 transition-colors"
            >
              <span>View all</span>
              <ArrowRight size={13} />
            </button>
          </div>

          <div className="divide-y divide-neutral-100">
            {documents.slice(0, 4).map((doc) => {
              const timeLabel = formatRelativeTime(doc.created_at);
              const isProcessing = doc.status === 'PENDING' || doc.status === 'PROCESSING';
              const isFailed = doc.status === 'FAILED';

              return (
                <div
                  key={doc.id}
                  onClick={() => onSelectDocument && onSelectDocument(doc)}
                  className="py-3.5 flex items-center justify-between hover:bg-neutral-50/80 px-2 rounded-xl cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-600">
                      <FileText size={16} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-neutral-800 hover:text-black transition-colors">
                        {doc.filename}
                      </h4>
                      <p className="text-[11px] text-neutral-400">
                        {doc.total_pages} pages • {doc.total_entities} entities
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                        isProcessing
                          ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse'
                          : isFailed
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-neutral-100 text-neutral-700 border-neutral-200'
                      }`}
                    >
                      {isProcessing ? 'Processing' : isFailed ? 'Failed' : 'Processed'}
                    </span>
                    <span className="text-xs text-neutral-400 font-medium text-right">
                      {timeLabel}
                    </span>
                  </div>
                </div>
              );
            })}
            {documents.length === 0 && (
              <div className="py-8 text-center text-neutral-400 text-xs">
                No documents uploaded yet. Upload a document to start building your knowledge base.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Knowledge Overview */}
        <div className="bg-white rounded-2xl p-6 border border-[#EBEBEF] shadow-2xs flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wider font-mono mb-5 flex items-center gap-2">
              <Database size={15} className="text-neutral-400" />
              Knowledge Overview
            </h2>

            <div className="space-y-4">
              {/* Stat 1: Documents */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-neutral-50 border border-neutral-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white border border-neutral-200 flex items-center justify-center text-neutral-800 shadow-2xs">
                    <FileText size={17} />
                  </div>
                  <div>
                    <span className="text-base font-bold text-neutral-900">{documents.length}</span>
                    <p className="text-xs text-neutral-500 font-medium">Documents</p>
                  </div>
                </div>
              </div>

              {/* Stat 2: Entities */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-neutral-50 border border-neutral-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white border border-neutral-200 flex items-center justify-center text-neutral-800 shadow-2xs">
                    <Network size={17} />
                  </div>
                  <div>
                    <span className="text-base font-bold text-neutral-900">
                      {documents.reduce((acc, d) => acc + (d.total_entities || 0), 0)}
                    </span>
                    <p className="text-xs text-neutral-500 font-medium">Entities</p>
                  </div>
                </div>
              </div>

              {/* Stat 3: Relationships */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-neutral-50 border border-neutral-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white border border-neutral-200 flex items-center justify-center text-neutral-800 shadow-2xs">
                    <GitBranch size={17} />
                  </div>
                  <div>
                    <span className="text-base font-bold text-neutral-900">
                      {documents.reduce((acc, d) => acc + (d.total_relationships || 0), 0)}
                    </span>
                    <p className="text-xs text-neutral-500 font-medium">Relationships</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigate('graph')}
            className="w-full mt-6 py-2.5 rounded-xl text-xs font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 shadow-xs"
          >
            <span>Explore Full Graph</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
