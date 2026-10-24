import React, { useState } from 'react';
import { X, CheckCircle, AlertCircle, RefreshCw, Server, Database, Shield } from 'lucide-react';
import { getAppConfig, saveAppConfig, AppConfig } from '../../services/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChange?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onConfigChange,
}) => {
  const [config, setConfig] = useState<AppConfig>(getAppConfig());
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  if (!isOpen) return null;

  const handleSave = () => {
    saveAppConfig(config);
    if (onConfigChange) onConfigChange();
    onClose();
  };

  const handleTestBackend = async () => {
    setTestStatus('testing');
    setStatusMessage('Checking backend health at ' + config.apiBaseUrl + '...');
    try {
      const baseUrl = config.apiBaseUrl.replace(/\/api\/v1\/?$/, '');
      const res = await fetch(`${baseUrl}/health`, { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        setTestStatus('success');
        setStatusMessage(`Connected! Service: ${data.service || 'NEXUS Backend'} (${data.status})`);
      } else {
        setTestStatus('failed');
        setStatusMessage(`Backend returned HTTP ${res.status}`);
      }
    } catch (err: any) {
      setTestStatus('failed');
      setStatusMessage(`Unable to reach backend. Check if FastAPI is running on port 8000.`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <div>
            <h2 className="text-base font-bold text-neutral-900">Application Settings</h2>
            <p className="text-xs text-neutral-500">Configure NEXUS AI Frontend & Backend Alignment</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Mock Mode Switch */}
          <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-neutral-50 border border-neutral-200/80">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-neutral-900">
                  Mock Engine Mode
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Recommended Offline
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                Operates entirely in-browser using mock datasets aligned with the backend schema without requiring Neo4j or ChromaDB to be running.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
              <input
                type="checkbox"
                checked={config.useMock}
                onChange={(e) => setConfig({ ...config, useMock: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-neutral-900"></div>
            </label>
          </div>

          {/* Backend URL Input */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              Backend API Base URL (FastAPI)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={config.apiBaseUrl}
                onChange={(e) => setConfig({ ...config, apiBaseUrl: e.target.value })}
                placeholder="http://localhost:8000/api/v1"
                className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:border-neutral-900 font-mono text-neutral-800"
              />
              <button
                type="button"
                onClick={handleTestBackend}
                disabled={testStatus === 'testing'}
                className="px-3 py-2 rounded-xl text-xs font-medium border border-neutral-200 hover:bg-neutral-100 transition-colors flex items-center gap-1.5 shrink-0 text-neutral-700"
              >
                {testStatus === 'testing' ? (
                  <RefreshCw size={13} className="animate-spin" />
                ) : (
                  <Server size={13} />
                )}
                Test
              </button>
            </div>
            {statusMessage && (
              <div className={`mt-2 text-xs flex items-center gap-1.5 ${testStatus === 'success' ? 'text-emerald-600' : 'text-amber-600'}`}>
                {testStatus === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                <span>{statusMessage}</span>
              </div>
            )}
          </div>

          {/* Architecture Architecture Details */}
          <div className="p-4 rounded-xl border border-neutral-200 text-xs text-neutral-600 space-y-2">
            <div className="font-semibold text-neutral-800 flex items-center gap-1.5">
              <Database size={14} />
              Backend Services Contract
            </div>
            <p className="text-[11px] text-neutral-500 leading-normal">
              Matches FastAPI branch schema: <code>/api/v1/documents</code>, <code>/api/v1/graph</code>, <code>/api/v1/topics</code>, <code>/api/v1/chat/query</code>.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3.5 bg-neutral-50 border-t border-neutral-100">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors shadow-xs"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
