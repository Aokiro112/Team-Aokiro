import React, { useState, useEffect } from 'react';
import { Sidebar, NavigationTab } from './components/layout/Sidebar';
import { TopNavbar } from './components/layout/TopNavbar';
import { HomeView } from './views/HomeView';
import { DocumentsView } from './views/DocumentsView';
import { KnowledgeGraphView } from './views/KnowledgeGraphView';
import { AskChatView } from './views/AskChatView';
import { SplitWorkspaceView } from './views/SplitWorkspaceView';
import { CommandPalette } from './components/modals/CommandPalette';
import { SettingsModal } from './components/modals/SettingsModal';
import { CitationModal } from './components/modals/CitationModal';
import { DocumentDetailModal } from './components/modals/DocumentDetailModal';
import { Citation, DocumentResponse, ChatMessage } from './types/backend';
import { documentsApi } from './services/api';

const CHAT_STORAGE_KEY = 'nexus_chat_history';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('workspace');
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentResponse | null>(null);

  // Persisted chat history across tab switches and browser reloads
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(CHAT_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (err) {
      console.warn('Failed to load chat history from localStorage:', err);
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch (err) {
      console.warn('Failed to save chat history to localStorage:', err);
    }
  }, [messages]);

  const handleClearChat = () => {
    setMessages([]);
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch (err) {
      console.warn('Failed to clear chat history in localStorage:', err);
    }
  };

  const handleNewChat = () => {
    handleClearChat();
    if (currentTab !== 'workspace' && currentTab !== 'ask') {
      setCurrentTab('workspace');
    }
  };

  // Keyboard shortcut: ⌘N / Ctrl+N to trigger New Chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTab]);

  // Load documents
  const loadDocuments = async () => {
    try {
      const res = await documentsApi.listDocuments();
      setDocuments(res.items);
    } catch (err) {
      console.warn('Failed to load documents:', err);
    }
  };

  useEffect(() => {
    loadDocuments();
    const handleUpdate = () => {
      loadDocuments();
    };
    window.addEventListener('nexus_documents_updated', handleUpdate);
    return () => window.removeEventListener('nexus_documents_updated', handleUpdate);
  }, []);

  // Poll in real time when any document is pending or processing
  useEffect(() => {
    const hasPending = documents.some(
      (d) => d.status === 'PENDING' || d.status === 'PROCESSING'
    );
    if (hasPending) {
      const interval = setInterval(() => {
        loadDocuments();
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [documents]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F8F8FA]">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onNewChat={handleNewChat}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Navbar */}
        <TopNavbar
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onNewChat={handleNewChat}
        />

        {/* View Pages */}
        <main className="flex-1 overflow-y-auto">
          {currentTab === 'workspace' && (
            <SplitWorkspaceView
              onOpenCitation={(citation) => setSelectedCitation(citation)}
              onSelectDocument={(doc) => setSelectedDocument(doc)}
              messages={messages}
              setMessages={setMessages}
              onClearChat={handleClearChat}
            />
          )}

          {currentTab === 'home' && (
            <HomeView
              documents={documents}
              onNavigate={(tab) => setCurrentTab(tab)}
              onSelectDocument={(doc) => setSelectedDocument(doc)}
            />
          )}

          {currentTab === 'documents' && (
            <DocumentsView
              documents={documents}
              onRefresh={loadDocuments}
              onSelectDocument={(doc) => setSelectedDocument(doc)}
            />
          )}

          {currentTab === 'graph' && (
            <KnowledgeGraphView
              onNavigateToDocuments={() => setCurrentTab('documents')}
            />
          )}

          {currentTab === 'ask' && (
            <AskChatView
              onOpenCitation={(citation) => setSelectedCitation(citation)}
              messages={messages}
              setMessages={setMessages}
              onClearChat={handleClearChat}
            />
          )}
        </main>
      </div>

      {/* Global Modals */}
      <CommandPalette
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onNavigate={(tab) => setCurrentTab(tab)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onConfigChange={() => loadDocuments()}
      />

      <CitationModal
        citation={selectedCitation}
        onClose={() => setSelectedCitation(null)}
      />

      <DocumentDetailModal
        document={selectedDocument}
        onClose={() => setSelectedDocument(null)}
        onDelete={async (id) => {
          await documentsApi.deleteDocument(id);
          loadDocuments();
        }}
        onReindex={async (id) => {
          await documentsApi.reindexDocument(id);
          loadDocuments();
        }}
        onNavigateToGraph={() => setCurrentTab('graph')}
      />
    </div>
  );
};

export default App;
