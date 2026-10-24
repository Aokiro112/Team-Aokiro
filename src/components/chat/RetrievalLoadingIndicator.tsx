import React, { useState, useEffect } from 'react';
import { Search, Database, Network, Sparkles, CheckCircle2 } from 'lucide-react';

interface RetrievalLoadingIndicatorProps {
  modelName?: string;
  strategy?: string;
}

export const RetrievalLoadingIndicator: React.FC<RetrievalLoadingIndicatorProps> = ({
  modelName = 'qwen3:1.7b',
  strategy = 'HYBRID',
}) => {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const timer1 = setTimeout(() => setActiveStep(1), 700);
    const timer2 = setTimeout(() => setActiveStep(2), 1700);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  const steps = [
    {
      title: 'Searching ChromaDB Vector Embeddings',
      desc: 'Retrieving dense semantic chunks and page matches',
      icon: Database,
    },
    {
      title: 'Traversing Knowledge Graph Connections',
      desc: 'Exploring multi-hop thematic and entity relationships',
      icon: Network,
    },
    {
      title: 'Synthesizing Grounded Answer',
      desc: `Evaluating evidence sufficiency & citations with ${modelName}`,
      icon: Sparkles,
    },
  ];

  return (
    <div className="w-full max-w-lg p-4 rounded-2xl bg-white border border-neutral-200/90 shadow-2xs space-y-3 animate-in fade-in duration-200">
      <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-mono text-xs font-bold text-neutral-800 tracking-wider uppercase">
            Searching Knowledge Base
          </span>
        </div>
        <span className="font-mono text-[10px] bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded">
          {strategy}
        </span>
      </div>

      <div className="space-y-2.5">
        {steps.map((s, idx) => {
          const isDone = activeStep > idx;
          const isCurrent = activeStep === idx;
          const Icon = s.icon;

          return (
            <div
              key={idx}
              className={`flex items-start gap-2.5 transition-opacity duration-300 ${
                isCurrent ? 'opacity-100' : isDone ? 'opacity-70' : 'opacity-40'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs ${
                  isDone
                    ? 'bg-emerald-100 text-emerald-800'
                    : isCurrent
                    ? 'bg-neutral-900 text-white animate-pulse'
                    : 'bg-neutral-100 text-neutral-400'
                }`}
              >
                {isDone ? <CheckCircle2 size={13} /> : <Icon size={12} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-neutral-800 leading-tight">
                  {s.title}
                </div>
                <div className="text-[11px] text-neutral-400 leading-tight mt-0.5 font-mono">
                  {s.desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
