import React, { useState, useEffect } from 'react';
import { Sidebar, NavigationTab } from './components/layout/Sidebar';
import { TopNavbar } from './components/layout/TopNavbar';
import { HomeView } from './views/HomeView';
import { DocumentsView } from './views/DocumentsView';
import { KnowledgeGraphView } from './views/KnowledgeGraphView';
import { TopicsView } from './views/TopicsView';
import { AskChatView } from './views/AskChatView';
import { CommandPalette } from './components/modals/CommandPalette';
import { SettingsModal } from './components/modals/SettingsModal';
import { CitationModal } from './components/modals/CitationModal';
import { DocumentDetailModal } from './components/modals/DocumentDetailModal';
import { Citation, DocumentResponse } from './types/backend';
import { documentsApi } from './services/api';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('home');
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentResponse | null>(null);

  // Load documents
  const loadDocuments = async () => {
    const res = await documentsApi.listDocuments();
    setDocuments(res.items);
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F8F8FA]">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Navbar */}
        <TopNavbar
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {/* View Pages */}
        <main className="flex-1 overflow-y-auto">
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

          {currentTab === 'topics' && (
            <TopicsView
              onNavigateToDocuments={() => setCurrentTab('documents')}
            />
          )}

          {currentTab === 'ask' && (
            <AskChatView
              onOpenCitation={(citation) => setSelectedCitation(citation)}
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
