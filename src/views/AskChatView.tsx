import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  Sparkles,
  FileText,
  Bookmark,
  Share2,
  ChevronDown,
  Maximize2,
  Paperclip,
  CheckCircle,
  HelpCircle,
  RefreshCw,
  Cpu,
  Trash2,
  Plus,
} from 'lucide-react';
import { Citation, QueryRequest, QueryResponse, RetrievalStrategy, ChatMessage } from '../types/backend';
import { chatApi } from '../services/api';
import { INITIAL_CHAT_MESSAGES } from '../services/mockData';
import { RichAnswerRenderer } from '../components/chat/RichAnswerRenderer';
import { RetrievalLoadingIndicator } from '../components/chat/RetrievalLoadingIndicator';

interface AskChatViewProps {
  onOpenCitation: (citation: Citation) => void;
  messages?: ChatMessage[];
  setMessages?: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onClearChat?: () => void;
}

export const AskChatView: React.FC<AskChatViewProps> = ({
  onOpenCitation,
  messages: propMessages,
  setMessages: propSetMessages,
  onClearChat,
}) => {
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem('nexus_selected_model') || 'qwen3:1.7b'
  );

  const [fallbackMessages, setFallbackMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('nexus_chat_history');
      return saved ? JSON.parse(saved) : INITIAL_CHAT_MESSAGES;
    } catch {
      return INITIAL_CHAT_MESSAGES;
    }
  });

  const messages = propMessages ?? fallbackMessages;
  const setMessages = propSetMessages ?? setFallbackMessages;

  const handleClearChat = () => {
    if (onClearChat) {
      onClearChat();
    } else {
      setMessages([]);
      try {
        localStorage.removeItem('nexus_chat_history');
      } catch (e) {
        console.warn(e);
      }
    }
  };

  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<RetrievalStrategy>('HYBRID');
  const [isDeepSearch, setIsDeepSearch] = useState(true);
  const [showStrategyDropdown, setShowStrategyDropdown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    const handleModelChange = (e: any) => {
      if (e.detail) {
        setSelectedModel(e.detail);
      }
    };
    window.addEventListener('nexus_model_changed', handleModelChange);
    return () => window.removeEventListener('nexus_model_changed', handleModelChange);
  }, []);

  const handleSendMessage = async (textToSend?: string) => {
    const q = textToSend || inputQuery;
    if (!q.trim() || isLoading) return;

    const userMsgId = `msg-${Date.now()}`;
    const userMessage = {
      id: userMsgId,
      sender: 'user' as const,
      text: q.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!textToSend) setInputQuery('');
    setIsLoading(true);

    try {
      const request: QueryRequest = {
        query: q.trim(),
        collection_id: 'default',
        include_graph: true,
        max_citations: 5,
        retrieval_strategy_override: selectedStrategy,
        model: selectedModel,
      };

      const res = await chatApi.queryKnowledgeBase(request);

      const assistantMsg = {
        id: `msg-${Date.now() + 1}`,
        sender: 'assistant' as const,
        text: res.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        response: res,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const samplePrompts = [
    'Explain the attention mechanism in transformers with a simple example from my notes.',
    'Compare BERT and GPT architectures based on my study material.',
    'What are the core components required for Transformer training?',
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto flex flex-col h-[calc(100vh-4rem)] animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-[#F0F0F4] shrink-0">
        <div>
          <span className="text-[11px] font-bold tracking-widest text-neutral-400 uppercase font-mono">
            ASK NEXUS
          </span>
          <h1 className="text-3xl font-black text-neutral-900 tracking-tight mt-1">
            Get Clear Answers
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Ask questions about your documents and get source-backed answers.
          </p>
        </div>

        {/* Top Right Options: Model Badge, Deep Search & Expand */}
        <div className="flex items-center gap-2 relative">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-neutral-100 border border-neutral-200/80 text-xs font-mono text-neutral-700 shadow-2xs">
            <Cpu size={13} className="text-emerald-600" />
            <span className="font-semibold truncate max-w-[140px]">{selectedModel}</span>
          </div>

          <button
            onClick={() => {
              setIsDeepSearch(!isDeepSearch);
              setSelectedStrategy(!isDeepSearch ? 'HYBRID' : 'VECTOR_ONLY');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              isDeepSearch
                ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
            }`}
          >
            <Sparkles size={13} className={isDeepSearch ? 'text-amber-300' : 'text-neutral-400'} />
            <span>Deep Search</span>
          </button>

          {/* Strategy Dropdown Toggle */}
          <div className="relative">
            <button
              onClick={() => setShowStrategyDropdown(!showStrategyDropdown)}
              className="p-1.5 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-600 transition-colors"
              title="Retrieval Strategy"
            >
              <ChevronDown size={16} />
            </button>

            {showStrategyDropdown && (
              <div className="absolute right-0 top-10 w-48 bg-white rounded-xl shadow-lg border border-neutral-200 py-1 z-30 text-xs">
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  Retrieval Strategy
                </div>
                {(['HYBRID', 'GRAPH_ONLY', 'VECTOR_ONLY', 'TOPIC_COMMUNITY'] as RetrievalStrategy[]).map(
                  (strat) => (
                    <button
                      key={strat}
                      onClick={() => {
                        setSelectedStrategy(strat);
                        setShowStrategyDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 font-medium transition-colors ${
                        selectedStrategy === strat
                          ? 'bg-neutral-100 text-neutral-900'
                          : 'text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      {strat.replace('_', ' ')}
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* New Chat Button */}
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-neutral-200 text-neutral-700 hover:text-black hover:bg-neutral-100 transition-colors cursor-pointer shadow-2xs"
              title="Start a new chat (⌘N)"
            >
              <Plus size={13} strokeWidth={2.5} />
              <span>New Chat</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Thread Container */}
      <div className="flex-1 overflow-y-auto py-6 space-y-6 pr-2">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';

          return (
            <div
              key={msg.id}
              className={`flex items-start gap-3.5 ${
                isUser ? 'justify-end' : 'justify-start'
              }`}
            >
              {/* Assistant Avatar */}
              {!isUser && (
                <div className="w-8 h-8 rounded-full bg-[#0F0F11] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm mt-0.5">
                  ✱
                </div>
              )}

              {/* Message Content Bubble */}
              <div
                className={`max-w-3xl rounded-2xl p-5 leading-relaxed ${
                  isUser
                    ? 'bg-[#F2F2F5] text-neutral-900 rounded-tr-xs text-xs sm:text-[13px] whitespace-pre-wrap font-sans'
                    : 'bg-white border border-[#EBEBEF] text-neutral-800 rounded-tl-xs shadow-2xs w-full'
                }`}
              >
                {isUser ? (
                  <div>{msg.text}</div>
                ) : (
                  <RichAnswerRenderer
                    content={msg.text}
                    citations={msg.response?.citations}
                    response={msg.response}
                    onOpenCitation={onOpenCitation}
                  />
                )}
              </div>
            </div>
          );
        })}

        {/* Search-First Loading Indicator Bubble */}
        {isLoading && (
          <div className="flex items-start gap-3.5 justify-start">
            <div className="w-8 h-8 rounded-full bg-[#0F0F11] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-1">
              ✱
            </div>
            <RetrievalLoadingIndicator modelName={selectedModel} strategy={selectedStrategy} />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Prompt Suggestions */}
      {messages.length <= 2 && (
        <div className="py-2 flex items-center gap-2 overflow-x-auto text-xs shrink-0">
          <span className="text-[11px] text-neutral-400 uppercase font-mono shrink-0">
            Suggested:
          </span>
          {samplePrompts.map((p, i) => (
            <button
              key={i}
              onClick={() => handleSendMessage(p)}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-600 hover:text-neutral-900 transition-colors whitespace-nowrap text-left"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Bottom Input Box */}
      <div className="pt-2 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="relative bg-white rounded-2xl border border-neutral-200 shadow-sm focus-within:border-neutral-900 transition-colors flex items-center p-2 gap-2"
        >
          <button
            type="button"
            className="p-2 text-neutral-400 hover:text-neutral-700 rounded-xl transition-colors shrink-0"
            title="Attach Document"
          >
            <Paperclip size={18} />
          </button>

          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder="Ask questions about your documents and get source-backed answers..."
            className="w-full text-xs sm:text-sm text-neutral-900 placeholder-neutral-400 outline-none bg-transparent"
          />

          <button
            type="submit"
            disabled={!inputQuery.trim() || isLoading}
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${
              inputQuery.trim() && !isLoading
                ? 'bg-neutral-900 text-white shadow-xs hover:bg-neutral-800'
                : 'bg-neutral-100 text-neutral-300 cursor-not-allowed'
            }`}
          >
            <Send size={15} />
          </button>
        </form>
        <div className="text-[10px] text-neutral-400 text-center mt-2 font-mono">
          Answers synthesized using hybrid retrieval across indexed knowledge graphs and embeddings.
        </div>
      </div>
    </div>
  );
};
