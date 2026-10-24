import React, { useState } from 'react';
import {
  FileText,
  Share2,
  Copy,
  Check,
  Network,
  ExternalLink,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import { Citation, QueryResponse } from '../../types/backend';

interface RichAnswerRendererProps {
  content: string;
  citations?: Citation[];
  response?: QueryResponse;
  onOpenCitation?: (citation: Citation) => void;
  onHighlightEvidence?: () => void;
}

export const RichAnswerRenderer: React.FC<RichAnswerRendererProps> = ({
  content,
  citations = [],
  response,
  onOpenCitation,
  onHighlightEvidence,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Split into Main Content and Knowledge Graph Connections section
  const kgHeaderMatch = content.match(
    /(?:^|\n)###?\s*(?:Supporting\s+)?Knowledge\s+Graph\s+Connections:?\s*\n?([\s\S]*)$/i
  );

  let mainBody = content;
  let graphSectionText: string | null = null;

  if (kgHeaderMatch) {
    mainBody = content.slice(0, kgHeaderMatch.index).trim();
    graphSectionText = kgHeaderMatch[1].trim();
  }

  // Helper to render inline formatting: bold, italic, code, and clickable [1] citations
  const renderInlineFormatted = (text: string): React.ReactNode => {
    // Regex matches inline citations [1], [2], [1, 2], bold **...**, italic *...*, code `...`
    const regex = /(\[(\d+(?:,\s*\d+)*)\]|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      if (match[2]) {
        // Citation tag e.g. [1] or [1, 2]
        const numbers = match[2].split(',').map((n) => parseInt(n.trim(), 10));
        parts.push(
          <span key={`cite-${match.index}`} className="inline-flex items-center gap-0.5 mx-0.5 align-baseline">
            {numbers.map((num) => {
              const citIndex = num - 1;
              const cit = citations[citIndex];
              return (
                <button
                  key={num}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (cit && onOpenCitation) onOpenCitation(cit);
                  }}
                  className={`inline-flex items-center px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold transition-all cursor-pointer shadow-2xs ${
                    cit
                      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/90 hover:border-emerald-400'
                      : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                  }`}
                  title={
                    cit
                      ? `Source ${num}: ${cit.document_filename} (Page ${cit.page_number})\nClick to preview excerpt`
                      : `Source #${num}`
                  }
                >
                  <span className="text-[8px] text-emerald-600/80 mr-0.5">#</span>
                  {num}
                </button>
              );
            })}
          </span>
        );
      } else if (match[3]) {
        // Bold **text**
        parts.push(
          <strong key={`bold-${match.index}`} className="font-semibold text-neutral-900">
            {match[3]}
          </strong>
        );
      } else if (match[4]) {
        // Italic *text*
        parts.push(
          <em key={`italic-${match.index}`} className="italic text-neutral-700">
            {match[4]}
          </em>
        );
      } else if (match[5]) {
        // Inline code `code`
        parts.push(
          <code
            key={`code-${match.index}`}
            className="px-1.5 py-0.5 rounded-md bg-neutral-100 text-neutral-800 font-mono text-[11px] border border-neutral-200"
          >
            {match[5]}
          </code>
        );
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts;
  };

  // Parse Markdown Blocks (Headings, Tables, Lists, Paragraphs)
  const parseBlocks = (raw: string) => {
    const lines = raw.split('\n');
    const blocks: Array<
      | { type: 'heading'; level: number; text: string }
      | { type: 'table'; headers: string[]; rows: string[][] }
      | { type: 'list'; ordered: boolean; items: string[] }
      | { type: 'paragraph'; text: string }
    > = [];

    let currentList: { ordered: boolean; items: string[] } | null = null;
    let currentTable: { headers: string[]; rows: string[][] } | null = null;

    const flushList = () => {
      if (currentList) {
        blocks.push({ type: 'list', ...currentList });
        currentList = null;
      }
    };

    const flushTable = () => {
      if (currentTable) {
        blocks.push({ type: 'table', ...currentTable });
        currentTable = null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line) {
        flushList();
        flushTable();
        continue;
      }

      // Check Table row: starts and ends with '|'
      if (line.startsWith('|') && line.endsWith('|')) {
        flushList();
        const cells = line
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());

        // Check if divider row (e.g. |---|---|)
        const isDivider = cells.every((c) => /^:?-+:?$/.test(c));
        if (isDivider) {
          continue; // skip divider
        }

        if (!currentTable) {
          currentTable = { headers: cells, rows: [] };
        } else {
          currentTable.rows.push(cells);
        }
        continue;
      } else {
        flushTable();
      }

      // Check Headings: #, ##, ###
      const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        flushList();
        blocks.push({
          type: 'heading',
          level: headingMatch[1].length,
          text: headingMatch[2],
        });
        continue;
      }

      // Check Bullet list: - or * or •
      const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
      if (bulletMatch) {
        if (!currentList || currentList.ordered) {
          flushList();
          currentList = { ordered: false, items: [] };
        }
        currentList.items.push(bulletMatch[1]);
        continue;
      }

      // Check Numbered list: 1. 2.
      const numberMatch = line.match(/^\d+\.\s+(.+)$/);
      if (numberMatch) {
        if (!currentList || !currentList.ordered) {
          flushList();
          currentList = { ordered: true, items: [] };
        }
        currentList.items.push(numberMatch[1]);
        continue;
      }

      // Default: Paragraph line
      flushList();
      blocks.push({ type: 'paragraph', text: line });
    }

    flushList();
    flushTable();

    return blocks;
  };

  const blocks = parseBlocks(mainBody);

  return (
    <div className="space-y-4 leading-relaxed font-sans text-neutral-800 text-[13px]">
      {/* 1. Structured Markdown Body */}
      <div className="space-y-2.5">
        {blocks.map((block, idx) => {
          if (block.type === 'heading') {
            if (block.level <= 2) {
              return (
                <h3
                  key={idx}
                  className="text-base font-bold text-neutral-900 mt-4 mb-1.5 flex items-center gap-2 border-b border-neutral-100 pb-1"
                >
                  <span className="w-1.5 h-4 bg-neutral-900 rounded-full inline-block" />
                  {renderInlineFormatted(block.text)}
                </h3>
              );
            }
            return (
              <h4
                key={idx}
                className="text-sm font-bold text-neutral-900 mt-3 mb-1 flex items-center gap-1.5"
              >
                <span className="w-1 h-3 bg-neutral-400 rounded-full inline-block" />
                {renderInlineFormatted(block.text)}
              </h4>
            );
          }

          if (block.type === 'table') {
            return (
              <div
                key={idx}
                className="my-3 overflow-x-auto rounded-xl border border-neutral-200/90 shadow-2xs bg-white"
              >
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-neutral-50/80 border-b border-neutral-200 text-neutral-600 font-mono text-[11px] uppercase tracking-wider">
                    <tr>
                      {block.headers.map((h, i) => (
                        <th key={i} className="py-2.5 px-3 font-bold border-r border-neutral-100 last:border-r-0">
                          {renderInlineFormatted(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 font-sans">
                    {block.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-neutral-50/60 transition-colors">
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="py-2 px-3 text-neutral-700 border-r border-neutral-100 last:border-r-0"
                          >
                            {renderInlineFormatted(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }

          if (block.type === 'list') {
            return (
              <ul key={idx} className="my-2 space-y-1.5 pl-1">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="flex items-start gap-2.5">
                    {block.ordered ? (
                      <span className="flex items-center justify-center w-4 h-4 rounded-md bg-neutral-100 text-[10px] font-mono font-bold text-neutral-600 mt-0.5 shrink-0">
                        {itemIdx + 1}
                      </span>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-900 mt-2 shrink-0" />
                    )}
                    <div className="flex-1 text-neutral-700 leading-relaxed">
                      {renderInlineFormatted(item)}
                    </div>
                  </li>
                ))}
              </ul>
            );
          }

          // Paragraph
          return (
            <p key={idx} className="text-neutral-700 leading-relaxed">
              {renderInlineFormatted(block.text)}
            </p>
          );
        })}
      </div>

      {/* 2. Distinct Knowledge Graph Subgraph Box */}
      {graphSectionText && (
        <div className="mt-4 p-3.5 rounded-xl bg-gradient-to-br from-neutral-50 to-neutral-100/70 border border-neutral-200/90 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
                <Network size={13} />
              </div>
              <div>
                <span className="text-[11px] font-bold text-neutral-900 block font-mono uppercase tracking-wide">
                  Knowledge Graph Connections
                </span>
                <span className="text-[10px] text-neutral-500">
                  Synthesized multi-hop graph paths connecting retrieved concepts
                </span>
              </div>
            </div>

            {onHighlightEvidence && (
              <button
                type="button"
                onClick={onHighlightEvidence}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-neutral-200/70 border border-neutral-200 text-neutral-800 text-[11px] font-semibold transition-all shadow-2xs cursor-pointer"
              >
                <Share2 size={12} className="text-emerald-600" />
                <span>Highlight on Graph</span>
              </button>
            )}
          </div>

          <div className="space-y-1.5 pl-2 border-l-2 border-neutral-300">
            {graphSectionText.split('\n').map((line, lIdx) => {
              const clean = line.replace(/^[-*•]\s*/, '').trim();
              if (!clean) return null;
              return (
                <div key={lIdx} className="text-xs text-neutral-700 flex items-start gap-2">
                  <ArrowRight size={13} className="text-emerald-600 mt-0.5 shrink-0" />
                  <div className="flex-1 font-mono text-[11px]">
                    {renderInlineFormatted(clean)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Citations & Sources Shelf */}
      {citations.length > 0 && (
        <div className="mt-4 pt-3 border-t border-neutral-200/80 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-mono uppercase font-bold text-neutral-500 tracking-wider flex items-center gap-1.5">
              <FileText size={12} className="text-neutral-500" />
              Sources Referenced ({citations.length})
            </span>
            <span className="text-[10px] text-neutral-400">Click any source to view exact excerpt</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {citations.map((c, i) => (
              <button
                key={c.citation_id || i}
                type="button"
                onClick={() => onOpenCitation?.(c)}
                className="flex items-start gap-2.5 p-2 rounded-xl bg-white hover:bg-neutral-50 border border-neutral-200/90 text-left transition-all group shadow-2xs cursor-pointer"
              >
                <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-800 font-mono font-bold text-[10px] flex items-center justify-center shrink-0 group-hover:bg-emerald-100 transition-colors">
                  #{i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-neutral-800 truncate group-hover:text-black">
                      {c.document_filename}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-400 shrink-0">
                      p. {c.page_number}
                    </span>
                  </div>
                  {c.excerpt && (
                    <p className="text-[11px] text-neutral-500 line-clamp-1 italic mt-0.5">
                      "{c.excerpt}"
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4. Action Bar (Copy, Graph Highlight, Sufficiency Badges) */}
      <div className="mt-3 pt-2.5 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-400">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800 transition-colors cursor-pointer text-[11px]"
            title="Copy answer markdown"
          >
            {copied ? (
              <>
                <Check size={12} className="text-emerald-600" />
                <span className="text-emerald-600 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span>Copy</span>
              </>
            )}
          </button>

          {onHighlightEvidence && (
            <button
              type="button"
              onClick={onHighlightEvidence}
              className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-emerald-50 text-neutral-500 hover:text-emerald-700 transition-colors cursor-pointer text-[11px]"
              title="Highlight evidence path on graph"
            >
              <Share2 size={12} />
              <span>Show on Graph</span>
            </button>
          )}
        </div>

        {/* Metadata badges */}
        <div className="flex items-center gap-2">
          {response?.evidence_sufficiency && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                response.evidence_sufficiency === 'SUFFICIENT'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                  : 'bg-amber-50 text-amber-700 border border-amber-200/60'
              }`}
            >
              <ShieldCheck size={11} />
              {response.evidence_sufficiency}
            </span>
          )}

          {response?.model_used && (
            <span className="font-mono text-[10px] text-neutral-400 px-1.5 py-0.5 bg-neutral-100 rounded">
              {response.model_used}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
