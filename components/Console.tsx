
import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types.ts';

interface ConsoleProps {
  logs: LogEntry[];
}

const Console: React.FC<ConsoleProps> = ({ logs }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getTypeColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'ERROR': return 'text-red-400';
      case 'SUCCESS': return 'text-emerald-400';
      case 'DEBUG': return 'text-slate-500';
      default: return 'text-blue-400';
    }
  };

  const formatTimestamp = (ts: any) => {
    try {
      if (ts instanceof Date) return ts.toLocaleTimeString();
      return new Date(ts).toLocaleTimeString();
    } catch (e) {
      return '--:--:--';
    }
  };

  return (
    <div className="bg-slate-950 rounded-lg border border-slate-800 h-64 flex flex-col overflow-hidden shadow-inner">
      <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex justify-between items-center">
        <span className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">Live Logs</span>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
        </div>
      </div>
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed"
      >
        {logs.length === 0 ? (
          <div className="text-slate-600 italic">Waiting for connection...</div>
        ) : (
          logs.map((log, idx) => (
            <div key={idx} className="mb-1 flex gap-3">
              <span className="text-slate-600 shrink-0">
                [{formatTimestamp(log.timestamp)}]
              </span>
              <span className={`${getTypeColor(log.type)}`}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Console;
