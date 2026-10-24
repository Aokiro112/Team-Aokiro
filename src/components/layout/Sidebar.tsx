import React from 'react';
import {
  Home,
  FileText,
  Share2,
  MessageSquare,
  Settings,
  ChevronDown,
  Columns,
  Plus,
} from 'lucide-react';

export type NavigationTab = 'workspace' | 'home' | 'documents' | 'graph' | 'ask';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  onOpenSettings: () => void;
  onNewChat?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  onOpenSettings,
  onNewChat,
}) => {
  const navItems: Array<{
    id: NavigationTab;
    label: string;
    icon: React.ElementType;
  }> = [
    { id: 'workspace', label: 'Split Workspace', icon: Columns },
    { id: 'home', label: 'Home', icon: Home },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'graph', label: 'Knowledge Graph', icon: Share2 },
    { id: 'ask', label: 'Ask', icon: MessageSquare },
  ];

  return (
    <aside className="w-64 min-w-[16rem] h-screen bg-white border-r border-[#EBEBEF] flex flex-col justify-between p-5 select-none shrink-0">
      {/* Top: Logo Branding */}
      <div>
        <div className="flex items-center gap-2 mb-6 px-2 cursor-pointer" onClick={() => onSelectTab('home')}>
          <div>
            <div className="flex items-center gap-1">
              <span className="text-xl font-black tracking-tight text-neutral-900 font-sans">
                NEXUS
              </span>
              <span className="text-sm font-bold text-neutral-900 leading-none mb-2">✱</span>
            </div>
            <p className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase -mt-1 font-mono">
              AI KNOWLEDGE GRAPH
            </p>
          </div>
        </div>

        {/* New Chat Primary Button */}
        {onNewChat && (
          <button
            onClick={onNewChat}
            className="w-full flex items-center justify-between px-3.5 py-2.5 mb-5 rounded-xl border border-neutral-200/90 hover:border-neutral-900 bg-white hover:bg-neutral-50 text-neutral-800 hover:text-black font-semibold text-xs transition-all shadow-2xs group cursor-pointer"
            title="Start a new chat (⌘N)"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-lg bg-neutral-900 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
                <Plus size={13} strokeWidth={2.5} />
              </div>
              <span className="font-semibold text-neutral-900">New Chat</span>
            </div>
            <kbd className="text-[10px] font-mono text-neutral-400 border border-neutral-200/80 px-1.5 py-0.5 rounded bg-neutral-50">
              ⌘N
            </kbd>
          </button>
        )}

        {/* Navigation list */}
        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 text-left ${
                  isActive
                    ? 'bg-[#0F0F11] text-white shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/70'
                }`}
              >
                <Icon
                  size={18}
                  className={isActive ? 'text-white stroke-[2.2]' : 'text-neutral-500 stroke-[1.8]'}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section: Settings & User Profile */}
      <div className="pt-4 border-t border-[#F0F0F4] space-y-2">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/70 transition-colors"
        >
          <Settings size={18} className="text-neutral-500 stroke-[1.8]" />
          <span>Settings</span>
        </button>

        <div className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-neutral-50 transition-colors cursor-pointer group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#18181B] text-white text-xs font-bold flex items-center justify-center shadow-inner">
              U
            </div>
            <span className="text-sm font-semibold text-neutral-800 leading-tight">
              User
            </span>
          </div>
          <ChevronDown
            size={14}
            className="text-neutral-400 group-hover:text-neutral-600 transition-colors"
          />
        </div>
      </div>
    </aside>
  );
};
