
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
  Terminal,
  Lock,
  ExternalLink
} from 'lucide-react';

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
  const [showRDPGuide, setShowRDPGuide] = useState(false);
  const [relayHealth, setRelayHealth] = useState<'idle' | 'online' | 'offline'>('idle');

  const standardWorkers = useRef<Map<string, DiscordWorker>>(new Map());
  const rotatorWorkers = useRef<Map<string, DiscordRotatorWorker>>(new Map());
  const hasAutoResumed = useRef(false);

  // Added logic to resolve the currently active account for the UI
  const currentAccount = selectedType === 'STANDARD' 
    ? sessions.find(s => s.id === selectedId) 
    : selectedType === 'ROTATOR' 
      ? rotatorSessions.find(s => s.id === selectedId) 
      : null;

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
    return (import.meta as any).env?.VITE_RELAY_URL || (window as any).process?.env?.VITE_RELAY_URL || "";
  };

  const isRDPDeployment = () => {
    const url = getRelayUrl();
    return url && !url.includes('render.com') && !url.includes('vercel.app');
  };

  useEffect(() => {
    const url = getRelayUrl();
    if (!url) { setRelayHealth('offline'); return; }
    const check = async () => {
      try {
        const httpUrl = url.replace('ws://', 'http://').replace('wss://', 'https://');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        await fetch(httpUrl, { mode: 'no-cors', signal: controller.signal });
        setRelayHealth('online');
        clearTimeout(timeoutId);
      } catch (e) {
        setRelayHealth('offline');
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (hasAutoResumed.current) return;
    hasAutoResumed.current = true;
    sessions.forEach(s => (s.status === 'ONLINE' || s.status === 'CONNECTING') && startStandard(s.id));
    rotatorSessions.forEach(s => (s.status === 'ONLINE' || s.status === 'CONNECTING') && startRotator(s.id));
  }, []);

  const startStandard = (id: string) => {
    if (standardWorkers.current.has(id)) return;
    const s = sessions.find(x => x.id === id);
    if (!s) return;
    const proxy = proxies.find(p => p.id === s.proxyId);
    // Fixed: Explicitly mapping 'presenceStatus' to the 'status' property of WorkerConfig to avoid ConnectionStatus mismatch
    const worker = new DiscordWorker(s.token, (status, log, profile) => {
      setSessions(prev => prev.map(item => item.id === id ? { ...item, status, profile: profile || item.profile, startTime: status === 'ONLINE' ? (item.startTime || new Date()) : (status === 'OFFLINE' ? null : item.startTime), logs: log ? [...item.logs, log].slice(-100) : item.logs } : item));
    }, { ...s, proxy, status: s.presenceStatus });
    standardWorkers.current.set(id, worker);
    worker.connect();
  };

  const startRotator = (id: string) => {
    if (rotatorWorkers.current.has(id)) return;
    const s = rotatorSessions.find(x => x.id === id);
    if (!s) return;
    const proxy = proxies.find(p => p.id === s.proxyId);
    // Fixed: Explicitly mapping 'presenceStatus' to the 'status' property of RotatorConfig to avoid ConnectionStatus mismatch
    const worker = new DiscordRotatorWorker(s.token, (status, log, index) => {
      setRotatorSessions(prev => prev.map(item => item.id === id ? { ...item, status, currentIndex: index !== undefined ? index : item.currentIndex, startTime: status === 'ONLINE' ? (item.startTime || new Date()) : (status === 'OFFLINE' ? null : item.startTime), logs: log ? [...item.logs, log].slice(-100) : item.logs } : item));
    }, { ...s, proxy, statusList: s.statusList, intervalSeconds: s.interval, status: s.presenceStatus });
    rotatorWorkers.current.set(id, worker);
    worker.connect();
  };

  const stopAccount = (id: string, type: AccountType) => {
    if (type === 'STANDARD') { standardWorkers.current.get(id)?.disconnect(); standardWorkers.current.delete(id); }
    else { rotatorWorkers.current.get(id)?.disconnect(); rotatorWorkers.current.delete(id); }
  };

  // Added logic to remove an account from state and storage
  const removeAccount = (id: string, type: AccountType) => {
    stopAccount(id, type);
    if (type === 'STANDARD') {
      setSessions(prev => prev.filter(s => s.id !== id));
    } else {
      setRotatorSessions(prev => prev.filter(s => s.id !== id));
    }
    if (selectedId === id) setSelectedId(null);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newToken.trim()) return;
    const id = crypto.randomUUID();
    const base = { id, token: newToken.trim(), label: newLabel.trim() || `Account ${sessions.length + 1}`, status: 'OFFLINE' as ConnectionStatus, lastHeartbeat: null, startTime: null, logs: [], proxyId: selectedProxyId || undefined };
    if (addType === 'STANDARD') setSessions(p => [...p, { ...base, accountType: 'STANDARD', presenceStatus: 'online', customStatusText: 'Lootify Onliner 😍', rpcEnabled: true, activityName: 'Lootify Hub', activityType: 0 }]);
    else setRotatorSessions(p => [...p, { ...base, accountType: 'ROTATOR', presenceStatus: 'online', statusList: ['Lootify Active 😍'], interval: 60, currentIndex: 0 }]);
    setNewToken(''); setNewLabel(''); setIsAdding(false); setSelectedId(id); setSelectedType(addType);
  };

  const handleAddProxy = (e: React.FormEvent) => {
    e.preventDefault();
    setProxies(p => [...p, { id: crypto.randomUUID(), alias: proxyAlias || `Proxy ${proxies.length + 1}`, host: proxyHost, port: parseInt(proxyPort), username: proxyUser, password: proxyPass, type: proxyType, testStatus: 'idle' }]);
    setIsAddingProxy(false); setProxyAlias(''); setProxyHost('');
  };

  const formatUptime = (startTime: Date | null) => {
    if (!startTime) return '00:00:00';
    const diff = Math.floor((new Date().getTime() - new Date(startTime).getTime()) / 1000);
    const h = Math.floor(diff / 3600), m = Math.floor((diff % 3600) / 60), s = diff % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const rdpCommand = `# COPY THIS INTO POWERSHELL ON YOUR RDP
# 1. Install Node.js (If not installed)
# winget install OpenJS.NodeJS

# 2. Clone and Setup
mkdir C:\\Lootify; cd C:\\Lootify
git clone https://github.com/LootifyStore/lootifyonlinerbackend.git .
npm install  # This fixes the "Module Not Found" error!

# 3. Open Firewall for Port 3001
New-NetFirewallRule -DisplayName "Lootify Relay" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow

# 4. Start the Engine
node index.js`;

  return (
    <div className="flex h-screen overflow-hidden bg-[#050810] text-slate-100 font-sans">
      <aside className="w-80 bg-[#0a0f1d] border-r border-slate-800/40 flex flex-col shrink-0 shadow-2xl">
        <div className="p-8 border-b border-slate-800/40 flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center"><Layers className="w-7 h-7 text-white" /></div>
          <div>
            <h1 className="font-black text-xl leading-tight tracking-tighter uppercase italic text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-blue-500">Lootify</h1>
            <p className="text-[9px] text-slate-500 font-black tracking-widest uppercase">24/7 Onliner Core</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-8 px-4 space-y-8 custom-scrollbar">
          <div className="px-4 flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Infrastructure</span>
            <button onClick={() => setShowRDPGuide(true)} className="p-1 text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1">
              <span className="text-[8px] font-black">RDP SETUP</span>
              <Terminal className="w-3 h-3" />
            </button>
          </div>
          <div className={`mx-2 p-5 rounded-3xl border transition-all ${relayHealth === 'online' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase text-slate-400">{isRDPDeployment() ? 'RDP Dedicated' : 'Cloud Node'}</span>
              <div className={`w-2 h-2 rounded-full ${relayHealth === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            </div>
            <p className="text-[8px] font-mono text-slate-600 truncate">{getRelayUrl() || 'NOT_CONFIGURED'}</p>
          </div>

          <div>
             <button onClick={() => { setSelectedType('PROXY_VAULT'); setSelectedId(null); }} className={`w-full px-5 py-4 rounded-2xl flex items-center gap-4 transition-all border ${selectedType === 'PROXY_VAULT' ? 'bg-amber-600/10 border-amber-500/40' : 'bg-transparent border-transparent text-slate-400'}`}>
                <Globe className="w-5 h-5" /><span className="text-xs font-black uppercase">Proxy Vault</span>
             </button>
          </div>

          <div className="space-y-4">
            <div className="px-4 flex justify-between items-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
              <span>Standard Cluster</span>
              <button onClick={() => { setAddType('STANDARD'); setIsAdding(true); }} className="text-blue-400 hover:scale-110 transition-transform"><Plus className="w-4 h-4" /></button>
            </div>
            {sessions.map(s => (
              <button key={s.id} onClick={() => { setSelectedId(s.id); setSelectedType('STANDARD'); }} className={`w-full px-4 py-3 rounded-xl flex items-center gap-3 transition-all ${selectedId === s.id && selectedType === 'STANDARD' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' : 'text-slate-500'}`}>
                <div className={`w-2 h-2 rounded-full ${s.status === 'ONLINE' ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                <span className="text-xs font-bold truncate flex-1 text-left">{s.label}</span>
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <div className="px-4 flex justify-between items-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
              <span>Rotator Cluster</span>
              <button onClick={() => { setAddType('ROTATOR'); setIsAdding(true); }} className="text-purple-400 hover:scale-110 transition-transform"><Plus className="w-4 h-4" /></button>
            </div>
            {rotatorSessions.map(s => (
              <button key={s.id} onClick={() => { setSelectedId(s.id); setSelectedType('ROTATOR'); }} className={`w-full px-4 py-3 rounded-xl flex items-center gap-3 transition-all ${selectedId === s.id && selectedType === 'ROTATOR' ? 'bg-purple-600/10 text-purple-400 border border-purple-500/20' : 'text-slate-500'}`}>
                <div className={`w-2 h-2 rounded-full ${s.status === 'ONLINE' ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                <span className="text-xs font-bold truncate flex-1 text-left">{s.label}</span>
              </button>
            ))}
          </div>
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto relative bg-[#050810]">
        {showRDPGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/80 backdrop-blur-md">
            <div className="w-full max-w-4xl bg-[#0a0f1d] border border-emerald-500/30 rounded-[3rem] p-12 shadow-3xl overflow-hidden relative">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20"><Monitor className="w-8 h-8 text-emerald-400" /></div>
                <h2 className="text-3xl font-black uppercase italic tracking-tighter">Fix RDP Persistence</h2>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="space-y-6">
                  <p className="text-slate-400 text-sm leading-relaxed">To fix the <span className="text-red-400">"Module Not Found"</span> error, you must run <code className="bg-slate-900 px-2 py-1 rounded text-emerald-400">npm install</code> inside the repository folder on your RDP.</p>
                  <div className="p-6 bg-slate-900/50 rounded-3xl border border-slate-800 space-y-4">
                    <h4 className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-2"><Lock className="w-3 h-3" /> SECURITY</h4>
                    <ul className="text-xs space-y-2 text-slate-400">
                      <li>• Port 3001 must be open (TCP Inbound)</li>
                      <li>• Use <span className="text-white">ws://YOUR_RDP_IP:3001</span></li>
                      <li>• Keep PowerShell window open</li>
                    </ul>
                  </div>
                  <button onClick={() => setShowRDPGuide(false)} className="w-full py-4 bg-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-slate-700">Close Window</button>
                </div>
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-slate-500 uppercase ml-1">Command Suite (PowerShell)</p>
                  <div className="relative group">
                    <textarea readOnly value={rdpCommand} className="w-full h-[320px] bg-black border border-slate-800 rounded-3xl p-6 font-mono text-[10px] text-emerald-400 outline-none resize-none" />
                    <button onClick={() => { navigator.clipboard.writeText(rdpCommand); alert("Commands Copied!"); }} className="absolute bottom-4 right-4 p-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-xl"><ClipboardList className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {isAdding ? (
          <div className="flex items-center justify-center min-h-screen p-12">
            <div className="w-full max-w-md bg-[#0a0f1d] border border-slate-800 rounded-[2.5rem] p-10 shadow-3xl">
              <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-8 text-center">Initialize Account</h2>
              <form onSubmit={handleAdd} className="space-y-6">
                <input type="text" placeholder="Account Name (e.g. Main)" value={newLabel} onChange={e => setNewLabel(e.target.value)} className="w-full bg-black border border-slate-800 rounded-xl px-6 py-4 text-sm font-bold outline-none focus:border-indigo-500" />
                <input type="password" placeholder="Discord Token" value={newToken} onChange={e => setNewToken(e.target.value)} className="w-full bg-black border border-slate-800 rounded-xl px-6 py-4 text-sm font-mono outline-none focus:border-indigo-500" />
                <button type="submit" className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all">Authorize Node</button>
                <button type="button" onClick={() => setIsAdding(false)} className="w-full text-slate-500 text-[10px] font-black uppercase">Cancel</button>
              </form>
            </div>
          </div>
        ) : currentAccount ? (
          <div className="p-12 max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500">
            <header className="flex items-center justify-between bg-slate-900/50 p-10 rounded-[2.5rem] border border-slate-800 shadow-2xl">
              <div className="flex items-center gap-8">
                <div className={`w-24 h-24 rounded-3xl border border-slate-700 flex items-center justify-center bg-black shadow-inner overflow-hidden`}>
                  {currentAccount.profile?.avatar ? (
                    <img src={`https://cdn.discordapp.com/avatars/${currentAccount.profile?.id}/${currentAccount.profile?.avatar}.png`} className="w-full h-full object-cover" />
                  ) : <Smile className="w-10 h-10 text-slate-700" />}
                </div>
                <div>
                  <div className="flex items-center gap-4 mb-2">
                    <h2 className="text-4xl font-black tracking-tighter italic uppercase">{currentAccount.profile?.global_name || currentAccount.label}</h2>
                    <StatusBadge status={currentAccount.status} />
                  </div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Uptime: {formatUptime(currentAccount.startTime)}</p>
                </div>
              </div>
              <div className="flex gap-4">
                {currentAccount.status === 'OFFLINE' ? (
                  <button onClick={() => selectedType === 'STANDARD' ? startStandard(currentAccount.id) : startRotator(currentAccount.id)} className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all shadow-xl shadow-emerald-600/20">Start Engine</button>
                ) : (
                  <button onClick={() => stopAccount(currentAccount.id, selectedType as AccountType)} className="px-8 py-4 bg-red-600/10 hover:bg-red-600/20 text-red-500 rounded-2xl font-black uppercase text-xs tracking-widest border border-red-500/20 transition-all">Stop Engine</button>
                )}
                <button onClick={() => removeAccount(currentAccount.id, selectedType as AccountType)} className="p-4 bg-slate-800 text-slate-500 hover:bg-red-500 hover:text-white rounded-2xl transition-all"><Trash2 className="w-5 h-5" /></button>
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <section className="bg-slate-900/50 border border-slate-800 rounded-[2.5rem] p-8 space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                  <Terminal className="w-5 h-5 text-indigo-400" /><h3 className="font-black uppercase text-sm italic">Telemetry Console</h3>
                </div>
                <Console logs={currentAccount.logs} />
              </section>

              {selectedType === 'STANDARD' ? (
                <section className="bg-slate-900/50 border border-slate-800 rounded-[2.5rem] p-8 space-y-6">
                  <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                    <Edit3 className="w-5 h-5 text-blue-400" /><h3 className="font-black uppercase text-sm italic">Presence Control</h3>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Presence Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['online', 'idle', 'dnd', 'invisible'].map(p => (
                        <button key={p} onClick={() => setSessions(prev => prev.map(item => item.id === currentAccount.id ? { ...item, presenceStatus: p as PresenceStatus } : item))} className={`py-3 rounded-xl text-[10px] font-black uppercase border transition-all ${(currentAccount as DiscordSession).presenceStatus === p ? 'bg-blue-600 border-blue-500 text-white' : 'bg-black border-slate-800 text-slate-600'}`}>{p}</button>
                      ))}
                    </div>
                  </div>
                </section>
              ) : (
                <section className="bg-slate-900/50 border border-slate-800 rounded-[2.5rem] p-8 space-y-6">
                  <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                    <RotateCw className="w-5 h-5 text-purple-400" /><h3 className="font-black uppercase text-sm italic">Status Pipeline</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <input type="text" placeholder="Add status..." value={newStatusItem} onChange={e => setNewStatusItem(e.target.value)} className="flex-1 bg-black border border-slate-800 rounded-xl px-4 py-3 text-xs outline-none focus:border-purple-500" />
                      <button onClick={() => { if (!newStatusItem.trim()) return; setRotatorSessions(prev => prev.map(s => s.id === currentAccount.id ? { ...s, statusList: [...s.statusList, newStatusItem.trim()] } : s)); setNewStatusItem(''); }} className="p-3 bg-purple-600 rounded-xl text-white"><Plus className="w-5 h-5" /></button>
                    </div>
                    <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-2">
                      {(currentAccount as RotatorSession).statusList.map((st, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-black border border-slate-800 rounded-xl text-[10px] font-bold">
                          <span className="truncate flex-1">"{st}"</span>
                          <button onClick={() => setRotatorSessions(prev => prev.map(s => s.id === currentAccount.id ? { ...s, statusList: s.statusList.filter((_, idx) => idx !== i) } : s))} className="text-red-500"><X className="w-3 h-3" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-screen text-center p-20 animate-in fade-in duration-1000">
            <div className="w-32 h-32 bg-slate-900 rounded-[2.5rem] flex items-center justify-center mb-10 border border-slate-800"><Layers className="w-16 h-16 text-slate-700" /></div>
            <h2 className="text-5xl font-black uppercase italic tracking-tighter mb-4">Lootify Hub</h2>
            <p className="text-slate-500 max-w-md mx-auto leading-relaxed mb-10 text-sm">Professional Discord persistence engine. Scale your presence across multiple clusters with advanced RDP relay support.</p>
            <div className="flex gap-4">
              <button onClick={() => { setAddType('STANDARD'); setIsAdding(true); }} className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl shadow-indigo-600/20">Register Node</button>
              <button onClick={() => { setAddType('ROTATOR'); setIsAdding(true); }} className="px-10 py-5 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest border border-slate-700">Add Rotator</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
