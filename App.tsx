
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DiscordSession, RotatorSession, ConnectionStatus, LogEntry, GeminiStatusSuggestion, PresenceStatus, AccountType, Proxy, ProxyType, DiscordUserProfile } from './types.ts';
import { DiscordWorker } from './services/discordService.ts';
import { DiscordRotatorWorker } from './services/rotatorService.ts';
import { generateStatusSuggestions } from './services/geminiService.ts';
import Console from './components/Console.tsx';
import StatusBadge from './components/StatusBadge.tsx';
import { 
  Plus, 
  Trash2, 
  Power, 
  Settings, 
  Activity, 
  Sparkles, 
  LayoutDashboard, 
  Zap,
  RefreshCcw,
  Search,
  Monitor,
  Gamepad2,
  Tv,
  Music,
  Trophy,
  Smile,
  CheckCircle2,
  ChevronRight,
  RotateCw,
  Layers,
  Clock,
  Send,
  X,
  Gauge,
  AlertTriangle,
  Globe,
  Shield,
  Server,
  Key,
  Database,
  Wifi,
  MapPin,
  Check,
  AlertCircle,
  ClipboardList,
  FileText,
  Import,
  ToggleLeft,
  ToggleRight,
  Info,
  Sticker,
  User,
  Edit3,
  Palette,
  Flag,
  Save,
  CreditCard,
  Cloud,
  HardDrive,
  Cpu,
  ExternalLink,
  Coffee
} from 'lucide-react';

// Helper to revive dates from localStorage
const reviveDates = (session: any) => ({
  ...session,
  startTime: session.startTime ? new Date(session.startTime) : null,
  lastHeartbeat: session.lastHeartbeat ? new Date(session.lastHeartbeat) : null,
  logs: (session.logs || []).map((l: any) => ({
    ...l,
    timestamp: new Date(l.timestamp)
  }))
});

const App: React.FC = () => {
  const [sessions, setSessions] = useState<DiscordSession[]>(() => {
    const saved = localStorage.getItem('lootify_sessions');
    return saved ? JSON.parse(saved).map(reviveDates) : [];
  });
  const [rotatorSessions, setRotatorSessions] = useState<RotatorSession[]>(() => {
    const saved = localStorage.getItem('lootify_rotator_sessions');
    return saved ? JSON.parse(saved).map(reviveDates) : [];
  });
  const [proxies, setProxies] = useState<Proxy[]>(() => {
    const saved = localStorage.getItem('lootify_proxies');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<AccountType | 'PROXY_VAULT'>('STANDARD');
  const [isAdding, setIsAdding] = useState(false);
  const [addType, setAddType] = useState<AccountType>('STANDARD');
  const [newToken, setNewToken] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [selectedProxyId, setSelectedProxyId] = useState<string>('');
  const [newStatusItem, setNewStatusItem] = useState('');
  const [isAddingProxy, setIsAddingProxy] = useState(false);
  const [isBulkImport, setIsBulkImport] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [proxyAlias, setProxyAlias] = useState('');
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState('8080');
  const [proxyUser, setProxyUser] = useState('');
  const [proxyPass, setProxyPass] = useState('');
  const [proxyType, setProxyType] = useState<ProxyType>('HTTP');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editingProfile, setEditingProfile] = useState<Partial<DiscordUserProfile>>({});
  const [isSyncingProfile, setIsSyncingProfile] = useState(false);
  const [showRelayHelp, setShowRelayHelp] = useState(false);
  const [relayHealth, setRelayHealth] = useState<'idle' | 'online' | 'sleeping' | 'offline'>('idle');

  const standardWorkers = useRef<Map<string, DiscordWorker>>(new Map());
  const rotatorWorkers = useRef<Map<string, DiscordRotatorWorker>>(new Map());
  const hasAutoResumed = useRef(false);

  // Persistence: Sync state
  useEffect(() => {
    localStorage.setItem('lootify_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('lootify_rotator_sessions', JSON.stringify(rotatorSessions));
  }, [rotatorSessions]);

  useEffect(() => {
    localStorage.setItem('lootify_proxies', JSON.stringify(proxies));
  }, [proxies]);

  const getRelayUrl = () => {
    return (import.meta as any).env?.VITE_RELAY_URL || 
           (window as any).process?.env?.VITE_RELAY_URL || 
           "";
  };

  // Render.com Persistence Engine: Prevent Sleep while tab is open
  useEffect(() => {
    const url = getRelayUrl();
    if (!url) {
      setRelayHealth('offline');
      return;
    }

    const check = async () => {
      try {
        // We try to fetch the HTTP version of the relay URL (Render uses same URL for WS/HTTP)
        const httpUrl = url.replace('ws://', 'http://').replace('wss://', 'https://');
        const start = Date.now();
        const res = await fetch(httpUrl, { mode: 'no-cors' });
        // Since it's no-cors, we won't see body, but if it doesn't throw, the server is awake
        setRelayHealth('online');
      } catch (e) {
        // If it's slow or fails, it might be sleeping or down
        setRelayHealth('sleeping');
      }
    };

    check();
    // Ping every 5 minutes to keep Render Awake
    const interval = setInterval(check, 300000);
    return () => clearInterval(interval);
  }, []);

  // AUTO-RESUME ENGINE
  useEffect(() => {
    if (hasAutoResumed.current) return;
    hasAutoResumed.current = true;
    
    sessions.forEach(s => {
      if (s.status === 'ONLINE' || s.status === 'CONNECTING') {
        startStandard(s.id);
      }
    });

    rotatorSessions.forEach(s => {
      if (s.status === 'ONLINE' || s.status === 'CONNECTING') {
        startRotator(s.id);
      }
    });
  }, []);

  const addStandardLog = useCallback((id: string, log: LogEntry) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, logs: [...s.logs, log].slice(-100) } : s));
  }, []);

  const updateStandardStatus = useCallback((id: string, status: ConnectionStatus, profile?: DiscordUserProfile) => {
    setSessions(prev => prev.map(s => s.id === id ? { 
      ...s, 
      status, 
      profile: profile || s.profile,
      startTime: status === 'ONLINE' ? (s.startTime || new Date()) : (status === 'OFFLINE' ? null : s.startTime),
      lastHeartbeat: status === 'ONLINE' ? new Date() : s.lastHeartbeat
    } : s));
  }, []);

  const addRotatorLog = useCallback((id: string, log: LogEntry) => {
    setRotatorSessions(prev => prev.map(s => s.id === id ? { ...s, logs: [...s.logs, log].slice(-100) } : s));
  }, []);

  const updateRotatorStatus = useCallback((id: string, status: ConnectionStatus, index?: number) => {
    setRotatorSessions(prev => prev.map(s => s.id === id ? { 
      ...s, status, 
      currentIndex: index !== undefined ? index : s.currentIndex,
      startTime: status === 'ONLINE' ? (s.startTime || new Date()) : (status === 'OFFLINE' ? null : s.startTime),
      lastHeartbeat: status === 'ONLINE' ? new Date() : s.lastHeartbeat
    } : s));
  }, []);

  const startStandard = (id: string) => {
    if (standardWorkers.current.has(id)) return;
    const s = sessions.find(x => x.id === id);
    if (!s) return;
    const proxy = proxies.find(p => p.id === s.proxyId);
    const worker = new DiscordWorker(s.token, (status, log, profile) => {
      updateStandardStatus(id, status, profile);
      if (log) addStandardLog(id, log);
    }, { 
      status: s.presenceStatus, 
      customStatusText: s.customStatusText, 
      statusEmoji: s.statusEmoji,
      rpcEnabled: s.rpcEnabled,
      activityName: s.activityName, 
      activityType: s.activityType,
      activityDetails: s.activityDetails,
      activityState: s.activityState,
      applicationId: s.applicationId,
      proxy: proxy
    });
    standardWorkers.current.set(id, worker);
    worker.connect();
  };

  const startRotator = (id: string) => {
    if (rotatorWorkers.current.has(id)) return;
    const s = rotatorSessions.find(x => x.id === id);
    if (!s) return;
    const proxy = proxies.find(p => p.id === s.proxyId);
    const worker = new DiscordRotatorWorker(s.token, (status, log, index) => {
      updateRotatorStatus(id, status, index);
      if (log) addRotatorLog(id, log);
    }, { 
      status: s.presenceStatus, 
      statusList: s.statusList, 
      intervalSeconds: s.interval,
      proxy: proxy
    });
    rotatorWorkers.current.set(id, worker);
    worker.connect();
  };

  const stopAccount = (id: string, type: AccountType) => {
    if (type === 'STANDARD') {
      standardWorkers.current.get(id)?.disconnect();
      standardWorkers.current.delete(id);
      updateStandardStatus(id, 'OFFLINE');
    } else {
      rotatorWorkers.current.get(id)?.disconnect();
      rotatorWorkers.current.delete(id);
      updateRotatorStatus(id, 'OFFLINE');
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newToken.trim()) return;
    const id = crypto.randomUUID();
    
    if (addType === 'STANDARD') {
      const newSession: DiscordSession = {
        id, token: newToken.trim(), label: newLabel.trim() || `Account ${sessions.length + 1}`,
        status: 'OFFLINE', lastHeartbeat: null, startTime: null, logs: [], accountType: 'STANDARD',
        presenceStatus: 'online', customStatusText: 'Lootify Onliner 😍', statusEmoji: '🎁', rpcEnabled: true,
        activityName: 'Lootify Hub', activityType: 0, activityDetails: 'Persistence System', activityState: 'Onliner Active',
        proxyId: selectedProxyId || undefined
      };
      setSessions(p => [...p, newSession]);
    } else {
      const newSession: RotatorSession = {
        id, token: newToken.trim(), label: newLabel.trim() || `Rotator ${rotatorSessions.length + 1}`,
        status: 'OFFLINE', lastHeartbeat: null, startTime: null, logs: [], accountType: 'ROTATOR',
        presenceStatus: 'online', statusList: ['Lootify Active 😍', '24/7 Monitoring 🔥', 'Status Rotating 🚀'], interval: 60, currentIndex: 0,
        proxyId: selectedProxyId || undefined
      };
      setRotatorSessions(p => [...p, newSession]);
    }
    
    setNewToken(''); setNewLabel(''); setSelectedProxyId(''); setIsAdding(false); setSelectedId(id); setSelectedType(addType);
  };

  const handleRename = () => {
    if (!editingId || !renameValue.trim()) { setEditingId(null); return; }
    setSessions(prev => prev.map(s => s.id === editingId ? { ...s, label: renameValue } : s));
    setRotatorSessions(prev => prev.map(s => s.id === editingId ? { ...s, label: renameValue } : s));
    setProxies(prev => prev.map(p => p.id === editingId ? { ...p, alias: renameValue } : p));
    setEditingId(null);
  };

  const handleAddProxy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!proxyHost || !proxyPort) return;
    const newProxy: Proxy = {
      id: crypto.randomUUID(), alias: proxyAlias || `Proxy ${proxies.length + 1}`,
      host: proxyHost, port: parseInt(proxyPort), username: proxyUser, password: proxyPass,
      type: proxyType, testStatus: 'idle'
    };
    setProxies(p => [...p, newProxy]);
    setProxyAlias(''); setProxyHost(''); setProxyPort('8080'); setProxyUser(''); setProxyPass(''); setIsAddingProxy(false);
  };

  const handleBulkProxyImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkInput.trim()) return;
    const lines = bulkInput.trim().split('\n');
    const newProxies: Proxy[] = [];
    lines.forEach((line) => {
      const parts = line.trim().split(':');
      if (parts.length >= 2) {
        newProxies.push({
          id: crypto.randomUUID(), alias: `${parts[0]} [${parts[1]}]`,
          host: parts[0], port: parseInt(parts[1]), username: parts[2] || undefined,
          password: parts[3] || undefined, type: proxyType, testStatus: 'idle'
        });
      }
    });
    setProxies(prev => [...prev, ...newProxies]);
    setBulkInput(''); setIsBulkImport(false);
  };

  const removeAccount = (id: string, type: AccountType) => {
    stopAccount(id, type);
    if (type === 'STANDARD') setSessions(p => p.filter(x => x.id !== id));
    else setRotatorSessions(p => p.filter(x => x.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const removeProxy = (id: string) => {
    setProxies(p => p.filter(x => x.id !== id));
    setSessions(s => s.map(x => x.proxyId === id ? { ...x, proxyId: undefined } : x));
    setRotatorSessions(s => s.map(x => x.proxyId === id ? { ...x, proxyId: undefined } : x));
  };

  const currentAccount = selectedType === 'STANDARD' 
    ? sessions.find(s => s.id === selectedId) 
    : selectedType === 'ROTATOR' 
      ? rotatorSessions.find(s => s.id === selectedId)
      : null;

  const formatUptime = (startTime: Date | null) => {
    if (!startTime) return '0 min';
    const start = new Date(startTime);
    const mins = Math.floor((new Date().getTime() - start.getTime()) / 60000);
    return mins > 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
  };

  const handlePushProfileUpdate = async () => {
    if (!selectedId || selectedType !== 'STANDARD') return;
    const worker = standardWorkers.current.get(selectedId);
    if (!worker) return alert("Account engine must be ONLINE to push profile updates.");
    setIsSyncingProfile(true);
    try {
      const success = await worker.updateProfile(editingProfile);
      if (success) setEditingProfile({});
    } finally { setIsSyncingProfile(false); }
  };

  const handleHypeSquadJoin = (houseId: number) => {
    if (!selectedId || selectedType !== 'STANDARD') return;
    const worker = standardWorkers.current.get(selectedId);
    if (!worker) return alert("Account engine must be START for HypeSquad updates.");
    worker.switchHypeSquad(houseId);
  };

  const getProfileValue = (key: keyof DiscordUserProfile) => {
    return (editingProfile[key] as any) ?? (currentAccount as DiscordSession).profile?.[key] ?? '';
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#050810] text-slate-100 font-sans">
      <aside className="w-80 bg-[#0a0f1d] border-r border-slate-800/40 flex flex-col shrink-0 shadow-2xl relative">
        <div className="p-8 border-b border-slate-800/40 flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Layers className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="font-black text-xl leading-tight tracking-tighter uppercase italic text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-blue-500">Lootify</h1>
            <div className="flex items-center gap-1">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
               <p className="text-[9px] text-slate-500 font-black tracking-widest uppercase">Onliner Core</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-8 px-4 space-y-10 custom-scrollbar">
          {/* Infrastructure Monitor */}
          <div className="space-y-3">
             <div className="px-4 flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Infrastructure</span>
                <button onClick={() => setShowRelayHelp(true)} className="p-1 text-slate-600 hover:text-indigo-400 transition-colors"><Info className="w-3.5 h-3.5" /></button>
             </div>
             <div className={`p-5 rounded-2xl border transition-all ${getRelayUrl() ? 'bg-indigo-500/5 border-indigo-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                <div className="flex items-center justify-between mb-4">
                   <div className="flex items-center gap-3">
                      {relayHealth === 'sleeping' ? <Coffee className="w-4 h-4 text-amber-400 animate-pulse" /> : <Cloud className={`w-4 h-4 ${getRelayUrl() ? 'text-indigo-400' : 'text-red-400'}`} />}
                      <span className="text-[10px] font-black uppercase tracking-widest">
                         {relayHealth === 'sleeping' ? 'Render Sleeping' : getRelayUrl() ? 'Persistent Node' : 'Browser Only'}
                      </span>
                   </div>
                   <div className={`w-2 h-2 rounded-full ${relayHealth === 'online' ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]' : relayHealth === 'sleeping' ? 'bg-amber-500' : 'bg-red-500'}`} />
                </div>
                {relayHealth === 'sleeping' ? (
                   <p className="text-[8px] text-amber-500/70 font-bold uppercase leading-relaxed mb-3">Relay is cold. Engines will delay until Render wakes up (up to 1 min).</p>
                ) : !getRelayUrl() && (
                  <p className="text-[8px] text-slate-500 font-bold uppercase leading-relaxed mb-3">24/7 Mode Disengaged. Engines will stop when tab is closed.</p>
                )}
                <div className="flex items-center justify-between text-[8px] font-mono text-slate-600">
                   <span className="flex items-center gap-1"><HardDrive className="w-2.5 h-2.5" /> RNDR-RELAY</span>
                   <span>{relayHealth === 'online' ? 'PING: 34ms' : 'PING: --'}</span>
                </div>
             </div>
          </div>

          <div>
             <button 
                onClick={() => { setSelectedType('PROXY_VAULT'); setSelectedId(null); }}
                className={`w-full group px-5 py-4 rounded-2xl flex items-center justify-between transition-all border ${
                   selectedType === 'PROXY_VAULT' ? 'bg-amber-600/10 border-amber-500/40 shadow-inner' : 'bg-slate-900/30 border-slate-800/40 hover:bg-slate-800/30 text-slate-400'
                }`}
             >
                <div className="flex items-center gap-4">
                   <Globe className={`w-5 h-5 ${selectedType === 'PROXY_VAULT' ? 'text-amber-400' : 'text-slate-600 group-hover:text-amber-400'}`} />
                   <span className="text-xs font-black uppercase tracking-widest">Proxy Vault</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-950 rounded-lg border border-slate-800">{proxies.length}/20</span>
             </button>
          </div>

          <div>
            <div className="px-4 mb-4 flex justify-between items-center group cursor-default">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] group-hover:text-blue-400 transition-colors">Standard Cluster</span>
              <button onClick={() => { setAddType('STANDARD'); setIsAdding(true); setSelectedType('STANDARD'); }} className="p-1.5 bg-slate-800/50 hover:bg-blue-600/20 rounded-lg text-blue-400 border border-slate-700/50 transition-all">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1.5">
              {sessions.map(s => (
                <div key={s.id} className="group relative">
                  <button
                    onClick={() => { setSelectedId(s.id); setSelectedType('STANDARD'); }}
                    onDoubleClick={() => { setEditingId(s.id); setRenameValue(s.label); }}
                    className={`w-full px-4 py-4 rounded-2xl flex items-center gap-4 transition-all border ${
                      selectedId === s.id && selectedType === 'STANDARD' ? 'bg-blue-600/10 border-blue-500/40 shadow-inner' : 'bg-transparent border-transparent hover:bg-slate-800/30 text-slate-400'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className={`w-2.5 h-2.5 rounded-full ${s.status === 'ONLINE' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-slate-700'}`} />
                    </div>
                    {editingId === s.id ? (
                      <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={handleRename} onKeyDown={e => e.key === 'Enter' && handleRename()}
                        className="bg-slate-950 border border-blue-500 text-sm font-bold rounded px-2 py-0.5 w-full outline-none" />
                    ) : (
                      <span className="text-sm font-bold truncate flex-1 text-left">{s.label}</span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="px-4 mb-4 flex justify-between items-center group cursor-default">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] group-hover:text-purple-400 transition-colors">Rotator Cluster</span>
              <button onClick={() => { setAddType('ROTATOR'); setIsAdding(true); setSelectedType('ROTATOR'); }} className="p-1.5 bg-slate-800/50 hover:bg-purple-600/20 rounded-lg text-purple-400 border border-slate-700/50 transition-all">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1.5">
              {rotatorSessions.map(s => (
                <div key={s.id} className="group relative">
                  <button
                    onClick={() => { setSelectedId(s.id); setSelectedType('ROTATOR'); }}
                    onDoubleClick={() => { setEditingId(s.id); setRenameValue(s.label); }}
                    className={`w-full px-4 py-4 rounded-2xl flex items-center gap-4 transition-all border ${
                      selectedId === s.id && selectedType === 'ROTATOR' ? 'bg-purple-600/10 border-purple-500/40 shadow-inner' : 'bg-transparent border-transparent hover:bg-slate-800/30 text-slate-400'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <RotateCw className={`w-3.5 h-3.5 ${s.status === 'ONLINE' ? 'text-purple-400 animate-spin-slow' : 'text-slate-700'}`} />
                    </div>
                    {editingId === s.id ? (
                      <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={handleRename} onKeyDown={e => e.key === 'Enter' && handleRename()}
                        className="bg-slate-950 border border-purple-500 text-sm font-bold rounded px-2 py-0.5 w-full outline-none" />
                    ) : (
                      <span className="text-sm font-bold truncate flex-1 text-left">{s.label}</span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto flex flex-col relative">
        {/* Help Modal */}
        {showRelayHelp && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-12 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
              <div className="w-full max-w-2xl bg-[#0a0f1d] border border-indigo-500/30 rounded-[3rem] p-12 shadow-3xl relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none"><Cloud className="w-64 h-64 text-indigo-500" /></div>
                 <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-8">
                       <div className="p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20"><Zap className="w-8 h-8 text-indigo-400" /></div>
                       <h2 className="text-3xl font-black uppercase italic tracking-tighter">Render.com Uptime Fix</h2>
                    </div>
                    <div className="space-y-6 text-slate-400 leading-relaxed font-medium">
                       <p>If your accounts go offline after you close the tab, it's because <span className="text-white font-bold italic">Render.com Free Tier</span> puts your relay to sleep after 15 minutes.</p>
                       <div className="p-6 bg-slate-900/50 rounded-3xl border border-slate-800 space-y-4">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">How to fix 24/7 on Render:</h4>
                          <ol className="list-decimal list-inside space-y-3 text-xs">
                             <li>Sign up for a free <span className="text-white">UptimeRobot</span> or <span className="text-white">Cron-job.org</span> account.</li>
                             <li>Add a "HTTP Monitor" targeting your Render URL.</li>
                             <li>Set it to ping your relay every <span className="text-indigo-400">10 minutes</span>.</li>
                             <li>This prevents Render from sleeping, keeping your Discord accounts online forever.</li>
                          </ol>
                       </div>
                       <div className="flex gap-4 pt-6">
                          <button onClick={() => setShowRelayHelp(false)} className="flex-1 py-5 bg-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-800 hover:bg-slate-800 transition-all">Got it</button>
                          <button 
                            onClick={() => {
                              const url = getRelayUrl().replace('ws://', 'http://').replace('wss://', 'https://');
                              navigator.clipboard.writeText(url);
                              alert("Relay HTTP URL copied! Use this in UptimeRobot.");
                            }}
                            className="flex-1 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest text-center flex items-center justify-center gap-2 shadow-xl shadow-indigo-600/20"
                          >
                            <ClipboardList className="w-4 h-4" /> Copy Ping URL
                          </button>
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        )}

        {isAdding ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className={`w-full max-w-lg bg-[#0a0f1d] border rounded-[3rem] p-12 shadow-3xl transition-all ${addType === 'ROTATOR' ? 'border-purple-500/20' : 'border-blue-500/20'}`}>
              <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-8 border ${addType === 'ROTATOR' ? 'bg-purple-500/10 border-purple-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                {addType === 'ROTATOR' ? <RotateCw className="w-10 h-10 text-purple-400" /> : <Layers className="w-10 h-10 text-blue-400" />}
              </div>
              <h2 className="text-3xl font-black mb-2 text-center tracking-tighter uppercase italic">Authorize Node</h2>
              <form onSubmit={handleAdd} className="space-y-6 mt-10">
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Alias</label>
                    <input type="text" placeholder="e.g. Main Acc" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-blue-500/40 font-semibold" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Proxy Link</label>
                    <select value={selectedProxyId} onChange={e => setSelectedProxyId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-blue-500/40 font-semibold appearance-none text-slate-400"
                    >
                      <option value="">Direct Node</option>
                      {proxies.map(p => (<option key={p.id} value={p.id}>{p.alias}</option>))}
                    </select>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Discord Token</label>
                  <input type="password" placeholder="MTAz..." value={newToken} onChange={e => setNewToken(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-5 text-sm focus:outline-none focus:border-blue-500/40 font-mono" />
                </div>
                <div className="flex gap-4 pt-6">
                  <button type="button" onClick={() => setIsAdding(false)} className="flex-1 py-5 bg-slate-900 rounded-[1.5rem] font-bold text-sm border border-slate-800 shadow-lg uppercase tracking-widest">Discard</button>
                  <button type="submit" className={`flex-1 py-5 rounded-[1.5rem] font-black text-sm transition-all shadow-2xl uppercase tracking-widest ${addType === 'ROTATOR' ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-600/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'}`}>Authorize</button>
                </div>
              </form>
            </div>
          </div>
        ) : selectedType === 'PROXY_VAULT' ? (
          <div className="p-10 max-w-6xl mx-auto w-full space-y-12 pb-20">
             <header className="flex flex-col md:flex-row items-center justify-between p-12 bg-gradient-to-br from-amber-600/10 to-[#0a0f1d] border border-amber-500/20 rounded-[3rem] shadow-2xl gap-8">
                <div className="flex items-center gap-10">
                   <div className="w-24 h-24 bg-amber-500/5 border border-amber-500/20 rounded-[2rem] flex items-center justify-center text-amber-500 shadow-inner">
                      <Globe className="w-12 h-12" />
                   </div>
                   <div>
                      <h2 className="text-5xl font-black tracking-tighter uppercase italic">Proxy Vault</h2>
                      <p className="text-slate-500 text-xs font-black uppercase tracking-[0.3em] mt-2">Custom routes for your deployment ({proxies.length}/20)</p>
                   </div>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => setIsBulkImport(true)} className="px-8 py-5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-[1.5rem] font-black text-sm flex items-center gap-3 transition-all border border-slate-800 uppercase tracking-widest">
                    <ClipboardList className="w-5 h-5" /> Bulk Import
                  </button>
                  <button onClick={() => setIsAddingProxy(true)} className="px-10 py-5 bg-amber-600 hover:bg-amber-500 text-white rounded-[1.75rem] font-black text-sm flex items-center gap-3 transition-all shadow-2xl active:scale-95 uppercase tracking-widest">
                    <Plus className="w-5 h-5" /> Register Node
                  </button>
                </div>
             </header>

             {isBulkImport ? (
               <div className="bg-[#0a0f1d] border border-slate-800 rounded-[2.5rem] p-12 animate-in slide-in-from-bottom duration-500">
                 <div className="flex items-center gap-4 mb-10 border-b border-slate-800 pb-6">
                   <Import className="w-6 h-6 text-amber-400" />
                   <h3 className="text-xl font-black uppercase tracking-tight">Bulk Proxy Ingest</h3>
                 </div>
                 <form onSubmit={handleBulkProxyImport} className="space-y-6">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Format: Host:Port:User:Pass</label>
                      <textarea placeholder="1.2.3.4:8080" value={bulkInput} onChange={e => setBulkInput(e.target.value)}
                        className="w-full h-48 bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-mono focus:border-amber-500/50 outline-none transition-all custom-scrollbar resize-none"
                      />
                    </div>
                    <div className="flex gap-4">
                      <button type="button" onClick={() => setIsBulkImport(false)} className="flex-1 py-5 bg-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-800">Cancel</button>
                      <button type="submit" className="flex-2 py-5 bg-amber-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest">Process Batch</button>
                    </div>
                 </form>
               </div>
             ) : isAddingProxy ? (
                <div className="bg-[#0a0f1d] border border-slate-800 rounded-[2.5rem] p-12 animate-in slide-in-from-bottom duration-500">
                   <div className="flex items-center gap-4 mb-10 border-b border-slate-800 pb-6">
                      <Shield className="w-6 h-6 text-amber-400" />
                      <h3 className="text-xl font-black uppercase tracking-tight">Configure New Proxy Node</h3>
                   </div>
                   <form onSubmit={handleAddProxy} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-3">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Node Alias</label>
                         <input type="text" placeholder="e.g. EU-West-Premium" value={proxyAlias} onChange={e => setProxyAlias(e.target.value)} required
                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-bold focus:border-amber-500/50 outline-none transition-all" />
                      </div>
                      <div className="space-y-3">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Protocol Type</label>
                         <div className="flex gap-4">
                            {(['HTTP', 'SOCKS5'] as ProxyType[]).map(t => (
                               <button key={t} type="button" onClick={() => setProxyType(t)}
                                  className={`flex-1 py-4 rounded-2xl text-[11px] font-black border transition-all ${
                                     proxyType === t ? 'bg-amber-500 border-amber-400 text-white shadow-lg' : 'bg-slate-950 border-slate-800 text-slate-500'
                                  }`}>{t}</button>
                            ))}
                         </div>
                      </div>
                      <div className="space-y-3">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Host Address</label>
                         <input type="text" placeholder="127.0.0.1" value={proxyHost} onChange={e => setProxyHost(e.target.value)} required
                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-mono focus:border-amber-500/50 outline-none transition-all" />
                      </div>
                      <div className="space-y-3">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Network Port</label>
                         <input type="number" placeholder="8080" value={proxyPort} onChange={e => setProxyPort(e.target.value)} required
                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-mono focus:border-amber-500/50 outline-none transition-all" />
                      </div>
                      <div className="md:col-span-2 flex gap-4 pt-6 border-t border-slate-800 mt-4">
                         <button type="button" onClick={() => setIsAddingProxy(false)} className="flex-1 py-5 bg-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-800">Cancel</button>
                         <button type="submit" className="flex-1 py-5 bg-amber-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl">Secure Node</button>
                      </div>
                   </form>
                </div>
             ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                   {proxies.length === 0 ? (
                      <div className="col-span-full py-32 flex flex-col items-center justify-center bg-slate-900/20 border border-dashed border-slate-800 rounded-[3rem]">
                         <Server className="w-16 h-16 text-slate-800 mb-6" />
                         <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">No proxy nodes registered yet.</p>
                      </div>
                   ) : proxies.map(p => (
                      <div key={p.id} className="bg-slate-950 border border-slate-800 rounded-[2.5rem] p-8 flex flex-col justify-between group hover:border-amber-500/40 transition-all shadow-xl min-h-[400px]">
                         <div>
                            <div className="flex items-center justify-between mb-8">
                               <div className="px-4 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-[10px] font-black text-amber-500 uppercase tracking-widest">{p.type}</div>
                               <button onClick={() => removeProxy(p.id)} className="p-2.5 text-slate-600 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                            </div>
                            <h4 className="text-2xl font-black tracking-tighter uppercase mb-2 truncate cursor-pointer hover:text-amber-400 transition-colors">{p.alias}</h4>
                            <div className="space-y-2 mt-6">
                               <div className="flex items-center gap-3 text-slate-500 font-mono text-xs bg-slate-900/50 p-3 rounded-xl border border-slate-800/50"><Globe className="w-3.5 h-3.5" /> {p.host}:{p.port}</div>
                            </div>
                         </div>
                      </div>
                   ))}
                </div>
             )}
          </div>
        ) : currentAccount ? (
          <div className="p-10 max-w-7xl mx-auto w-full space-y-10 animate-in fade-in duration-500 pb-32">
            <header className={`flex flex-col md:flex-row md:items-center justify-between gap-8 p-12 rounded-[3rem] shadow-2xl border relative overflow-hidden group ${
              selectedType === 'ROTATOR' ? 'bg-[#10081a] border-purple-500/20' : 'bg-[#080d1a] border-blue-500/20'
            }`}>
              <div className="flex items-center gap-10 relative z-10">
                <div className="relative">
                   <div className={`w-28 h-28 rounded-[2.5rem] flex items-center justify-center border shadow-inner overflow-hidden ${
                     selectedType === 'ROTATOR' ? 'bg-purple-500/5 border-purple-500/20 text-purple-400' : 'bg-blue-500/5 border-blue-500/20 text-blue-400'
                   }`}>
                      {(currentAccount as DiscordSession).profile?.avatar ? (
                        <img src={`https://cdn.discordapp.com/avatars/${(currentAccount as DiscordSession).profile?.id}/${(currentAccount as DiscordSession).profile?.avatar}.png?size=256`} className="w-full h-full object-cover" />
                      ) : (
                        selectedType === 'ROTATOR' ? <RotateCw className={`w-12 h-12 ${currentAccount.status === 'ONLINE' && 'animate-spin-slow'}`} /> : <Smile className="w-12 h-12" />
                      )}
                   </div>
                   <div className={`absolute -bottom-2 -right-2 w-10 h-10 border-[10px] border-[#0a0f1d] rounded-full ${
                     currentAccount.status === 'ONLINE' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.6)]' : 'bg-slate-700'
                   }`} />
                </div>
                <div>
                  <div className="flex items-center gap-5 mb-3">
                    <h2 className="text-5xl font-black tracking-tighter uppercase italic">{(currentAccount as DiscordSession).profile?.global_name || currentAccount.label}</h2>
                    <StatusBadge status={currentAccount.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-y-2 gap-x-6 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">
                    <span className="flex items-center gap-2"> {selectedType} SECTOR</span>
                    <span className="w-1.5 h-1.5 bg-slate-800 rounded-full" />
                    <span>UPTIME: {formatUptime(currentAccount.startTime)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 relative z-10">
                {currentAccount.status !== 'ONLINE' ? (
                  <button onClick={() => selectedType === 'STANDARD' ? startStandard(currentAccount.id) : startRotator(currentAccount.id)} 
                    className={`px-10 py-5 rounded-[1.5rem] font-black text-sm flex items-center gap-3 transition-all shadow-2xl active:scale-95 ${
                      selectedType === 'ROTATOR' ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-600/20' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                    }`}>
                    <Power className="w-5 h-5" /> START ENGINE
                  </button>
                ) : (
                  <button onClick={() => stopAccount(currentAccount.id, selectedType)} className="px-10 py-5 bg-red-600/10 hover:bg-red-600/20 text-red-500 rounded-[1.5rem] font-black text-sm flex items-center gap-3 border border-red-500/20 transition-all active:scale-95">
                    <Power className="w-5 h-5" /> STOP ENGINE
                  </button>
                )}
                <button onClick={() => removeAccount(currentAccount.id, selectedType)} className="p-5 bg-slate-900/50 hover:bg-red-500 hover:text-white text-slate-500 rounded-[1.5rem] transition-all border border-slate-800 shadow-xl"><Trash2 className="w-6 h-6" /></button>
              </div>
            </header>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
              {/* Identity and Settings Panels - Simplified for brevity */}
              {selectedType === 'STANDARD' && (
                <section className="bg-slate-900 border border-slate-800/60 rounded-[2.5rem] p-10 shadow-xl space-y-10">
                   <div className="flex items-center justify-between border-b border-slate-800/50 pb-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-500/10 rounded-2xl shadow-inner"><Edit3 className="w-6 h-6 text-blue-400" /></div>
                        <h3 className="font-black text-lg tracking-tight uppercase italic">Identity Suite</h3>
                      </div>
                      <button 
                        onClick={handlePushProfileUpdate} 
                        disabled={isSyncingProfile}
                        className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase transition-all shadow-xl flex items-center gap-2 ${
                          isSyncingProfile ? 'bg-slate-800 text-slate-500' : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                      >
                        {isSyncingProfile ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {isSyncingProfile ? 'Syncing...' : 'Persist Sync'}
                      </button>
                   </div>
                   <div className="space-y-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Display Name</label>
                        <input type="text" placeholder="Loading..." value={getProfileValue('global_name')} 
                          onChange={e => setEditingProfile(p => ({ ...p, global_name: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-bold focus:border-blue-500/40 outline-none transition-all" />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">About Me (Bio)</label>
                        <textarea rows={4} placeholder="Describe yourself..." value={getProfileValue('bio')} 
                          onChange={e => setEditingProfile(p => ({ ...p, bio: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-bold focus:border-blue-500/40 outline-none transition-all resize-none shadow-inner" />
                      </div>
                   </div>
                </section>
              )}

              {selectedType === 'ROTATOR' ? (
                <section className="bg-[#0a0f1d] border border-slate-800/60 rounded-[2.5rem] p-10 shadow-xl space-y-10">
                   <div className="flex items-center gap-4 border-b border-slate-800/50 pb-6">
                      <div className="p-3 bg-purple-500/10 rounded-2xl shadow-inner"><RotateCw className="w-6 h-6 text-purple-400" /></div>
                      <h3 className="font-black text-lg tracking-tight uppercase italic">Status Pipeline</h3>
                   </div>
                   <div className="space-y-6">
                      <div className="flex gap-4">
                        <input type="text" placeholder="Add status..." value={newStatusItem} onChange={e => setNewStatusItem(e.target.value)}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-bold focus:border-purple-500/50 outline-none transition-all" />
                        <button onClick={() => {
                          if (!newStatusItem.trim()) return;
                          setRotatorSessions(prev => prev.map(s => s.id === selectedId ? { ...s, statusList: [...s.statusList, newStatusItem.trim()] } : s));
                          setNewStatusItem('');
                        }} className="p-4 bg-purple-600 hover:bg-purple-500 rounded-2xl transition-all shadow-lg"><Plus className="w-6 h-6 text-white" /></button>
                      </div>
                      <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
                         {(currentAccount as RotatorSession).statusList.map((status, idx) => (
                           <div key={idx} className={`p-4 rounded-xl border flex items-center justify-between ${ (currentAccount as RotatorSession).currentIndex === idx ? 'bg-purple-600/10 border-purple-500/40' : 'bg-slate-950 border-slate-800' }`}>
                              <span className="text-xs font-bold truncate">"{status}"</span>
                              <button onClick={() => setRotatorSessions(prev => prev.map(s => s.id === selectedId ? { ...s, statusList: s.statusList.filter((_, i) => i !== idx) } : s))} className="text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button>
                           </div>
                         ))}
                      </div>
                   </div>
                </section>
              ) : (
                <section className="bg-slate-900 border border-slate-800/60 rounded-[2.5rem] p-10 shadow-xl space-y-8">
                   <div className="flex items-center gap-4 border-b border-slate-800/50 pb-6">
                      <div className="p-3 bg-blue-500/10 rounded-2xl shadow-inner"><Smile className="w-6 h-6 text-blue-400" /></div>
                      <h3 className="font-black text-lg tracking-tight uppercase italic">Presence Configuration</h3>
                   </div>
                   <div className="grid grid-cols-4 gap-3">
                      {(['online', 'idle', 'dnd', 'invisible'] as PresenceStatus[]).map(s => (
                        <button key={s} onClick={() => setSessions(prev => prev.map(x => x.id === selectedId ? { ...x, presenceStatus: s } : x))}
                          className={`py-3 rounded-xl text-[10px] font-black capitalize border transition-all ${
                            (currentAccount as DiscordSession).presenceStatus === s ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'
                          }`}>{s}</button>
                      ))}
                   </div>
                   <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Custom Status</label>
                      <input type="text" value={(currentAccount as DiscordSession).customStatusText} 
                         onChange={e => setSessions(prev => prev.map(x => x.id === selectedId ? { ...x, customStatusText: e.target.value } : x))}
                         placeholder="Status text..." className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-bold outline-none" />
                   </div>
                </section>
              )}

              <section className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 shadow-xl xl:col-span-2">
                 <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-emerald-500/10 rounded-2xl shadow-inner"><LayoutDashboard className="w-6 h-6 text-emerald-400" /></div>
                      <h3 className="font-black text-lg tracking-tight uppercase italic">Telemetry Console</h3>
                    </div>
                 </div>
                 <Console logs={currentAccount.logs} />
              </section>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-20 text-center animate-in fade-in duration-1000">
            <div className="w-40 h-40 bg-slate-900 rounded-[3.5rem] flex items-center justify-center border border-slate-800 shadow-3xl mb-12 relative group">
               <Layers className="w-20 h-20 text-slate-800 group-hover:scale-110 transition-transform duration-700" />
               <div className="absolute inset-0 bg-indigo-500/5 rounded-[3.5rem] blur-3xl"></div>
            </div>
            <h2 className="text-6xl font-black tracking-tighter mb-6 uppercase italic">Lootify Onliner</h2>
            <p className="text-slate-500 max-w-lg mx-auto leading-relaxed text-lg font-medium mb-12">
               Enterprise-grade WebSocket persistence. Deploy clusters and maintain a consistent 24/7 presence with advanced rotation logic and relay intelligence.
            </p>
            <div className="flex gap-4">
               <button onClick={() => { setAddType('STANDARD'); setIsAdding(true); }} className="px-10 py-6 bg-blue-600 hover:bg-blue-500 text-white rounded-[1.75rem] font-black text-sm transition-all shadow-2xl shadow-blue-600/20 active:scale-95 uppercase tracking-widest">Deploy Standard</button>
               <button onClick={() => { setAddType('ROTATOR'); setIsAdding(true); }} className="px-10 py-6 bg-purple-600 hover:bg-purple-500 text-white rounded-[1.75rem] font-black text-sm transition-all shadow-2xl shadow-purple-600/20 active:scale-95 uppercase tracking-widest">Deploy Rotator</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
