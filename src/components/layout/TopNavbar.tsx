import React from 'react';
import { Search, Settings, Sparkles } from 'lucide-react';
import { getAppConfig } from '../../services/api';

interface TopNavbarProps {
  onOpenSearch: () => void;
  onOpenSettings: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  onOpenSearch,
  onOpenSettings,
}) => {
  const config = getAppConfig();

  return (
    <header className="h-16 px-8 border-b border-[#F0F0F4] bg-white flex items-center justify-end gap-3 shrink-0">
      {/* Backend connection pill */}
      <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-600 border border-neutral-200/80 mr-2">
        <span className={`w-1.5 h-1.5 rounded-full ${config.useMock ? 'bg-emerald-500' : 'bg-blue-500'}`} />
        <span>{config.useMock ? 'Mock API Engine' : 'Live Backend API'}</span>
      </div>

      {/* Global Search trigger bar */}
      <div
        onClick={onOpenSearch}
        className="flex items-center gap-2.5 px-3.5 py-2 w-64 md:w-80 rounded-xl bg-neutral-100/80 hover:bg-neutral-100 border border-transparent hover:border-neutral-200 text-neutral-400 hover:text-neutral-600 cursor-pointer transition-all duration-150"
      >
        <Search size={15} className="text-neutral-400" />
        <span className="text-xs font-normal text-neutral-500 select-none flex-1">
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
    </header>
  );
};
