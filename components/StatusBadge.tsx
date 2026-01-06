
import React from 'react';
import { ConnectionStatus } from '../types.ts';

const StatusBadge: React.FC<{ status: ConnectionStatus }> = ({ status }) => {
  const colors = {
    OFFLINE: 'bg-slate-700 text-slate-300 border-slate-600',
    CONNECTING: 'bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse',
    ONLINE: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    ERROR: 'bg-red-500/10 text-red-500 border-red-500/20',
  };

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${colors[status]}`}>
      {status}
    </span>
  );
};

export default StatusBadge;
