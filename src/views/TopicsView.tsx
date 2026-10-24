import React, { useState, useEffect } from 'react';
import {
  Layers,
  Search,
  FileText,
  ChevronRight,
  X,
  ArrowRight,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { TopicModel, TopicDetailResponse } from '../types/backend';
import { topicsApi } from '../services/api';

interface TopicsViewProps {
  onNavigateToDocuments?: () => void;
}

export const TopicsView: React.FC<TopicsViewProps> = ({
  onNavigateToDocuments,
}) => {
  const [topics, setTopics] = useState<TopicModel[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<TopicModel | null>(null);
  const [topicDetail, setTopicDetail] = useState<TopicDetailResponse | null>(null);
  const [drawerTab, setDrawerTab] = useState<'concepts' | 'documents'>('concepts');

  useEffect(() => {
    const fetchTopics = async () => {
      const data = await topicsApi.listTopics(50, 0);
      setTopics(data.topics);

      // Default select "Machine Learning" (primary topic in design screenshot)
      const mlTopic = data.topics.find((t) => t.name === 'Machine Learning') || data.topics[0];
      if (mlTopic) {
        setSelectedTopic(mlTopic);
        const detail = await topicsApi.getTopic(mlTopic.id);
        setTopicDetail(detail);
      }
    };
    fetchTopics();
  }, []);

  const handleSelectTopic = async (topic: TopicModel) => {
    setSelectedTopic(topic);
    const detail = await topicsApi.getTopic(topic.id);
    setTopicDetail(detail);
  };

  const filteredTopics = topics.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold tracking-widest text-neutral-400 uppercase font-mono">
            TOPICS
          </span>
          <h1 className="text-3xl font-black text-neutral-900 tracking-tight mt-1">
            Discover Key Topics
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Find and explore important concepts extracted from your documents.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3.5 top-3 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search topics..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-neutral-200 text-xs text-neutral-800 placeholder-neutral-400 outline-none focus:border-neutral-900 transition-colors"
          />
        </div>
      </div>

      {/* Main Content Layout (Table + Topic Detail Drawer) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left / Center Table (Spans 2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#EBEBEF] shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/60 text-[11px] font-bold text-neutral-400 uppercase tracking-wider font-mono">
                  <th className="py-3 px-6">Topic</th>
                  <th className="py-3 px-6">Related Documents</th>
                  <th className="py-3 px-6">Mentions</th>
                  <th className="py-3 px-6 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-sm">
                {filteredTopics.map((topic) => {
                  const isSelected = selectedTopic?.id === topic.id;

                  return (
                    <tr
                      key={topic.id}
                      onClick={() => handleSelectTopic(topic)}
                      className={`hover:bg-neutral-50/70 transition-colors cursor-pointer group ${
                        isSelected ? 'bg-neutral-50/80 font-medium' : ''
                      }`}
                    >
                      {/* Topic Name */}
                      <td className="py-4 px-6">
                        <span className="font-semibold text-neutral-900 group-hover:text-black">
                          {topic.name}
                        </span>
                      </td>

                      {/* Related Documents icons representation */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-1.5">
                          {Array.from({ length: Math.min(topic.document_count, 4) }).map(
                            (_, i) => (
                              <div
                                key={i}
                                className="w-6 h-6 rounded bg-neutral-100 border border-neutral-200/80 flex items-center justify-center text-neutral-500"
                                title={`Document ${i + 1}`}
                              >
                                <FileText size={12} />
                              </div>
                            )
                          )}
                          {topic.document_count > 4 && (
                            <span className="text-[11px] text-neutral-400 font-mono">
                              +{topic.document_count - 4}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Mentions */}
                      <td className="py-4 px-6 text-xs text-neutral-600 font-mono">
                        {topic.entity_count}
                      </td>

                      {/* Chevron Action */}
                      <td className="py-4 px-6 text-right">
                        <ChevronRight
                          size={16}
                          className="text-neutral-400 group-hover:text-neutral-900 group-hover:translate-x-0.5 transition-all inline-block"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Topic Detail Drawer (Matching Screenshot) */}
        <div className="bg-white rounded-2xl border border-[#EBEBEF] shadow-2xs p-6 flex flex-col justify-between">
          {selectedTopic ? (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-neutral-900 leading-tight">
                    {selectedTopic.name}
                  </h3>
                  <span className="inline-block mt-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
                    Topic
                  </span>
                </div>
                <button
                  onClick={() => setSelectedTopic(null)}
                  className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Description */}
              <p className="text-xs text-neutral-600 leading-relaxed">
                {selectedTopic.description}
              </p>

              {/* Tabs: Related Concepts | Documents */}
              <div className="flex border-b border-neutral-100 gap-6 text-xs font-semibold">
                <button
                  onClick={() => setDrawerTab('concepts')}
                  className={`pb-2 transition-colors relative ${
                    drawerTab === 'concepts'
                      ? 'text-neutral-900 border-b-2 border-neutral-900 -mb-px'
                      : 'text-neutral-400 hover:text-neutral-600'
                  }`}
                >
                  Related Concepts
                </button>
                <button
                  onClick={() => setDrawerTab('documents')}
                  className={`pb-2 transition-colors relative ${
                    drawerTab === 'documents'
                      ? 'text-neutral-900 border-b-2 border-neutral-900 -mb-px'
                      : 'text-neutral-400 hover:text-neutral-600'
                  }`}
                >
                  Documents
                </button>
              </div>

              {/* Tab Content 1: Related Concepts */}
              {drawerTab === 'concepts' && (
                <div className="space-y-2">
                  {(selectedTopic.metadata?.related_concepts || [
                    { name: 'Learning Algorithms', count: 12 },
                    { name: 'Neural Networks', count: 9 },
                    { name: 'Training', count: 7 },
                    { name: 'Model Evaluation', count: 6 },
                  ]).map((concept: any) => (
                    <div
                      key={concept.name}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50 border border-neutral-100 text-xs"
                    >
                      <span className="font-medium text-neutral-800">{concept.name}</span>
                      <span className="font-mono text-neutral-400">{concept.count}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab Content 2: Documents */}
              {drawerTab === 'documents' && (
                <div className="space-y-2">
                  {topicDetail?.associated_documents && topicDetail.associated_documents.length > 0 ? (
                    topicDetail.associated_documents.map((doc) => (
                      <div
                        key={doc.id}
                        onClick={onNavigateToDocuments}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-50 border border-neutral-100 text-xs hover:bg-neutral-100/70 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileText size={14} className="text-neutral-500 shrink-0" />
                          <span className="font-medium text-neutral-800 truncate">
                            {doc.filename}
                          </span>
                        </div>
                        <span className="font-mono text-neutral-400 text-[11px] shrink-0">
                          {doc.page_count}p
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-neutral-400">4 documents associated</div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-center text-neutral-400">
              <Layers size={24} className="mb-2 text-neutral-300" />
              <p className="text-xs">Select any topic to view its concepts and documents.</p>
            </div>
          )}

          {/* Bottom Action */}
          {selectedTopic && (
            <div className="pt-4 border-t border-neutral-100 mt-6">
              <button
                onClick={onNavigateToDocuments}
                className="w-full py-2.5 rounded-xl text-xs font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 shadow-xs"
              >
                <span>Explore Associated Material</span>
                <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
