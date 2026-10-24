import React, { useState, useEffect, useRef } from 'react';
import { Search, Settings, Cpu, ChevronDown, Check, RefreshCw, Sparkles, CheckCircle2, Plus } from 'lucide-react';
import { getAppConfig, modelsApi } from '../../services/api';
import { ModelItem } from '../../types/backend';

interface TopNavbarProps {
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onNewChat?: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  onOpenSearch,
  onOpenSettings,
  onNewChat,
}) => {
  const config = getAppConfig();
  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('qwen3:1.7b');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchModels = async () => {
    setIsLoadingModels(true);
    try {
      const res = await modelsApi.getAvailableModels();
      setModels(res.models);
      const saved = localStorage.getItem('nexus_selected_model');
      if (saved && res.models.some((m) => m.name === saved)) {
        setSelectedModel(saved);
      } else if (res.active_model) {
        setSelectedModel(res.active_model);
        localStorage.setItem('nexus_selected_model', res.active_model);
      }
    } catch (err) {
      console.warn('Failed to fetch models:', err);
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    fetchModels();

    const handleExternalChange = (e: any) => {
      if (e.detail) {
        setSelectedModel(e.detail);
      }
    };
    window.addEventListener('nexus_model_changed', handleExternalChange);

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('nexus_model_changed', handleExternalChange);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelectModel = (modelName: string) => {
    setSelectedModel(modelName);
    localStorage.setItem('nexus_selected_model', modelName);
    window.dispatchEvent(new CustomEvent('nexus_model_changed', { detail: modelName }));
    setShowModelDropdown(false);
  };

  const activeModelObj = models.find((m) => m.name === selectedModel);

  return (
    <header className="h-16 px-8 border-b border-[#F0F0F4] bg-white flex items-center justify-between gap-3 shrink-0">
      {/* Left: Dynamic Local Model Selector & Quick New Chat */}
      <div className="flex items-center gap-2.5">
        <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowModelDropdown(!showModelDropdown)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-100/90 hover:bg-neutral-100 border border-neutral-200/90 text-neutral-800 transition-all text-xs font-medium shadow-2xs group"
          title="Choose Local Inference Model"
        >
          <div className="flex items-center justify-center w-5 h-5 rounded-lg bg-neutral-900 text-white shadow-2xs">
            <Cpu size={12} className="text-emerald-400" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider leading-none">
              Inference Model
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-semibold text-neutral-900 max-w-[140px] truncate">
                {activeModelObj?.name || selectedModel}
              </span>
              {activeModelObj?.parameter_size && (
                <span className="px-1 py-0.2 bg-emerald-100 text-emerald-800 text-[9px] font-mono font-bold rounded">
                  {activeModelObj.parameter_size}
                </span>
              )}
            </div>
          </div>
          <ChevronDown
            size={14}
            className={`text-neutral-400 transition-transform duration-150 ml-1 ${
              showModelDropdown ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Dropdown Menu */}
        {showModelDropdown && (
          <div className="absolute left-0 top-11 w-80 bg-white rounded-2xl shadow-xl border border-neutral-200 py-2 z-40 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-100">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 font-mono">
                  Available Local Models
                </span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-600">
                  {models.length}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  fetchModels();
                }}
                disabled={isLoadingModels}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded hover:bg-neutral-100 transition-colors"
                title="Rescan models"
              >
                <RefreshCw size={12} className={isLoadingModels ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto py-1 divide-y divide-neutral-50">
              {models.map((m) => {
                const isSelected = m.name === selectedModel;
                return (
                  <button
                    key={m.name}
                    onClick={() => handleSelectModel(m.name)}
                    className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors ${
                      isSelected ? 'bg-neutral-50' : 'hover:bg-neutral-50/80'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isSelected ? (
                        <CheckCircle2 size={15} className="text-neutral-900" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border border-neutral-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-neutral-900 truncate">
                          {m.name}
                        </span>
                        {m.parameter_size && (
                          <span className="px-1.5 py-0.2 rounded bg-neutral-200/80 text-neutral-700 text-[10px] font-mono">
                            {m.parameter_size}
                          </span>
                        )}
                        {m.provider === 'rule_based' && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-bold uppercase">
                            Deterministic
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-500 mt-0.5 line-clamp-1">
                        {m.description || `${m.provider} local inference`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

        {onNewChat && (
          <button
            onClick={onNewChat}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold shadow-2xs transition-all cursor-pointer"
            title="Start a new chat (⌘N)"
          >
            <Plus size={13} strokeWidth={2.5} />
            <span className="hidden sm:inline">New Chat</span>
          </button>
        )}
      </div>

      {/* Right Controls: Status Pill, Global Search, Settings */}
      <div className="flex items-center gap-3">
        {/* Backend connection pill */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-600 border border-neutral-200/80">
          <span className={`w-1.5 h-1.5 rounded-full ${config.useMock ? 'bg-emerald-500' : 'bg-blue-500'}`} />
          <span>{config.useMock ? 'Mock API Engine' : 'Live Backend API'}</span>
        </div>

        {/* Global Search trigger bar */}
        <div
          onClick={onOpenSearch}
          className="flex items-center gap-2.5 px-3.5 py-2 w-56 md:w-72 rounded-xl bg-neutral-100/80 hover:bg-neutral-100 border border-transparent hover:border-neutral-200 text-neutral-400 hover:text-neutral-600 cursor-pointer transition-all duration-150"
        >
          <Search size={15} className="text-neutral-400" />
          <span className="text-xs font-normal text-neutral-500 select-none flex-1 truncate">
            Search documents, topics...
          </span>
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold text-neutral-400 bg-white rounded border border-neutral-200 shadow-2xs font-mono">
            ⌘ K
          </kbd>
        </div>

        {/* Settings icon button */}
        <button
          onClick={onOpenSettings}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
          title="Settings"
        >
          <Settings size={18} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
};
