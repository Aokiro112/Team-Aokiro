import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Copy, Check, Download, Maximize2, Minimize2, AlertCircle } from 'lucide-react';

interface MermaidViewerProps {
  code: string;
  title?: string;
  caption?: string;
}

mermaid.initialize({
  startOnLoad: false,
  theme: 'neutral',
  securityLevel: 'strict',
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  flowchart: {
    htmlLabels: true,
    curve: 'basis',
  },
});

export const MermaidViewer: React.FC<MermaidViewerProps> = ({ code, title, caption }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const renderDiagram = async () => {
      if (!code.trim()) return;

      const cleanCode = code
        .replace(/^```(?:mermaid)?\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();

      const uniqueId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;

      try {
        setError(null);
        const { svg } = await mermaid.render(uniqueId, cleanCode);
        if (isMounted) {
          setSvgContent(svg);
        }
      } catch (err: any) {
        console.warn('Mermaid rendering failed:', err);
        if (isMounted) {
          setError(err?.message || 'Could not parse Mermaid syntax');
          setSvgContent('');
        }
      }
    };

    renderDiagram();
    return () => {
      isMounted = false;
    };
  }, [code]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSvg = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(title || 'diagram').toLowerCase().replace(/\s+/g, '_')}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={`my-3 rounded-2xl border border-neutral-200/90 bg-white shadow-2xs overflow-hidden transition-all duration-300 ${
        isExpanded ? 'fixed inset-4 z-50 flex flex-col p-6 shadow-2xl' : 'relative'
      }`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-50/80 border-b border-neutral-200/80">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-xs font-bold text-neutral-800 truncate font-mono">
            {title || 'Structured Diagram'}
          </span>
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-100/70 text-emerald-800 font-semibold shrink-0">
            Mermaid
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleCopyCode}
            className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-neutral-200/70 text-neutral-600 text-[11px] font-medium transition-colors cursor-pointer"
            title="Copy Mermaid code"
          >
            {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
            <span>{copied ? 'Copied' : 'Code'}</span>
          </button>

          {svgContent && (
            <button
              type="button"
              onClick={handleDownloadSvg}
              className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-neutral-200/70 text-neutral-600 text-[11px] font-medium transition-colors cursor-pointer"
              title="Export as SVG"
            >
              <Download size={12} />
              <span>Export</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-lg hover:bg-neutral-200/70 text-neutral-600 transition-colors cursor-pointer"
            title={isExpanded ? 'Minimize' : 'Expand full screen'}
          >
            {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Diagram Canvas */}
      <div className={`p-4 overflow-auto flex items-center justify-center bg-white ${isExpanded ? 'flex-1' : 'min-h-[220px]'}`}>
        {svgContent ? (
          <div
            ref={containerRef}
            className="w-full flex justify-center [&_svg]:max-w-full [&_svg]:h-auto select-none"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        ) : error ? (
          <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/80 text-amber-900 w-full text-left">
            <div className="flex items-center gap-2 text-xs font-semibold mb-1">
              <AlertCircle size={14} className="text-amber-600" />
              <span>Diagram Rendering Notice</span>
            </div>
            <p className="text-[11px] text-amber-700 font-mono whitespace-pre-wrap">{code}</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span className="w-4 h-4 border-2 border-neutral-300 border-t-emerald-600 rounded-full animate-spin" />
            <span>Rendering diagram...</span>
          </div>
        )}
      </div>

      {/* Caption Footer */}
      {caption && (
        <div className="px-4 py-2 bg-neutral-50/50 border-t border-neutral-100 text-[11px] text-neutral-500 italic">
          {caption}
        </div>
      )}
    </div>
  );
};
