import React from 'react';
import {
  Home,
  FileText,
  Share2,
  Layers,
  MessageSquare,
  Settings,
  ChevronDown,
} from 'lucide-react';

export type NavigationTab = 'home' | 'documents' | 'graph' | 'topics' | 'ask';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  onOpenSettings,
}) => {
  const navItems: Array<{
    id: NavigationTab;
    label: string;
    icon: React.ElementType;
  }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'graph', label: 'Knowledge Graph', icon: Share2 },
    { id: 'topics', label: 'Topics', icon: Layers },
    { id: 'ask', label: 'Ask', icon: MessageSquare },
  ];

  return (
    <aside className="w-64 min-w-[16rem] h-screen bg-white border-r border-[#EBEBEF] flex flex-col justify-between p-5 select-none shrink-0">
      {/* Top: Logo Branding */}
      <div>
        <div className="flex items-center gap-2 mb-8 px-2 cursor-pointer" onClick={() => onSelectTab('home')}>
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
              M
            </div>
            <div className="flex flex-col text-left">
              <span className="text-sm font-semibold text-neutral-800 leading-tight">
                Student
              </span>
              <span className="text-[11px] text-neutral-400 font-medium">Free Plan</span>
            </div>
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
