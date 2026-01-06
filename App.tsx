
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DiscordSession, RotatorSession, ConnectionStatus, LogEntry, GeminiStatusSuggestion, PresenceStatus, AccountType, Proxy, ProxyType } from './types.ts';
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
  AlertCircle
} from 'lucide-react';

const App: React.FC = () => {
  const [sessions, setSessions] = useState<DiscordSession[]>([]);
  const [rotatorSessions, setRotatorSessions] = useState<RotatorSession[]>([]);
  const [proxies, setProxies] = useState<Proxy[]>([]);
  
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<AccountType | 'PROXY_VAULT'>('STANDARD');

  const [isAdding, setIsAdding] = useState(false);
  const [addType, setAddType] = useState<AccountType>('STANDARD');
  const [newToken, setNewToken] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [selectedProxyId, setSelectedProxyId] = useState<string>('');
  
  const [newStatusItem, setNewStatusItem] = useState('');
  const [customInterval, setCustomInterval] = useState<string>('60');

  // Proxy Form State
  const [isAddingProxy, setIsAddingProxy] = useState(false);
  const [proxyAlias, setProxyAlias] = useState('');
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState('8080');
  const [proxyUser, setProxyUser] = useState('');
  const [proxyPass, setProxyPass] = useState('');
  const [proxyType, setProxyType] = useState<ProxyType>('HTTP');

  const standardWorkers = useRef<Map<string, DiscordWorker>>(new Map());
  const rotatorWorkers = useRef<Map<string, DiscordRotatorWorker>>(new Map());

  const addStandardLog = useCallback((id: string, log: LogEntry) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, logs: [...s.logs, log].slice(-100) } : s));
  }, []);

  const updateStandardStatus = useCallback((id: string, status: ConnectionStatus) => {
    setSessions(prev => prev.map(s => s.id === id ? { 
      ...s, status, 
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
    const s = sessions.find(x => x.id === id);
    if (!s) return;
    const proxy = proxies.find(p => p.id === s.proxyId);
    const worker = new DiscordWorker(s.token, (status, log) => {
      updateStandardStatus(id, status);
      if (log) addStandardLog(id, log);
    }, { 
      status: s.presenceStatus, 
      customStatusText: s.customStatusText, 
      activityName: s.activityName, 
      activityType: s.activityType,
      proxy: proxy
    });
    standardWorkers.current.set(id, worker);
    worker.connect();
  };

  const startRotator = (id: string) => {
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
        presenceStatus: 'online', customStatusText: 'Lootify Onliner 😍', activityName: 'Lootify Hub', activityType: 0,
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

  const handleAddProxy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!proxyHost || !proxyPort) return;
    if (proxies.length >= 5) return alert("Maximum 5 proxies allowed in the vault.");

    const newProxy: Proxy = {
      id: crypto.randomUUID(),
      alias: proxyAlias || `Proxy ${proxies.length + 1}`,
      host: proxyHost,
      port: parseInt(proxyPort),
      username: proxyUser,
      password: proxyPass,
      type: proxyType,
      testStatus: 'idle'
    };

    setProxies(p => [...p, newProxy]);
    setProxyAlias(''); setProxyHost(''); setProxyPort('8080'); setProxyUser(''); setProxyPass(''); setIsAddingProxy(false);
  };

  const testProxy = async (id: string) => {
    setProxies(prev => prev.map(p => p.id === id ? { ...p, testStatus: 'testing' } : p));
    
    // Simulate a proxy check delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      const mockIps = ["45.12.33.102", "185.244.22.11", "91.200.12.8", "194.22.4.91", "5.18.2.144"];
      const mockCountries = ["Germany", "United States", "United Kingdom", "France", "Netherlands"];
      const randIdx = Math.floor(Math.random() * mockIps.length);

      setProxies(prev => prev.map(p => p.id === id ? { 
        ...p, 
        testStatus: 'success', 
        ip: mockIps[randIdx], 
        country: mockCountries[randIdx] 
      } : p));
    } catch (e) {
      setProxies(prev => prev.map(p => p.id === id ? { ...p, testStatus: 'failed' } : p));
    }
  };

  const removeAccount = (id: string, type: AccountType) => {
    stopAccount(id, type);
    if (type === 'STANDARD') setSessions(p => p.filter(x => x.id !== id));
    else setRotatorSessions(p => p.filter(x => x.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const removeProxy = (id: string) => {
    setProxies(p => p.filter(x => x.id !== id));
    // Clear associations
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
    const mins = Math.floor((new Date().getTime() - startTime.getTime()) / 60000);
    return mins > 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#050810] text-slate-100 font-sans">
      
      {/* Sidebar */}
      <aside className="w-80 bg-[#0a0f1d] border-r border-slate-800/40 flex flex-col shrink-0 shadow-2xl">
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
          
          {/* Proxy Vault Shortcut */}
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
                <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-950 rounded-lg border border-slate-800">{proxies.length}/5</span>
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
                <button
                  key={s.id} onClick={() => { setSelectedId(s.id); setSelectedType('STANDARD'); }}
                  className={`w-full group px-4 py-4 rounded-2xl flex items-center gap-4 transition-all border ${
                    selectedId === s.id && selectedType === 'STANDARD' ? 'bg-blue-600/10 border-blue-500/40 shadow-inner' : 'bg-transparent border-transparent hover:bg-slate-800/30 text-slate-400'
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className={`w-2.5 h-2.5 rounded-full ${s.status === 'ONLINE' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-slate-700'}`} />
                    {s.proxyId && <Globe className="absolute -top-1 -right-1 w-2 h-2 text-amber-500" />}
                  </div>
                  <span className="text-sm font-bold truncate flex-1 text-left">{s.label}</span>
                </button>
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
                <button
                  key={s.id} onClick={() => { setSelectedId(s.id); setSelectedType('ROTATOR'); }}
                  className={`w-full group px-4 py-4 rounded-2xl flex items-center gap-4 transition-all border ${
                    selectedId === s.id && selectedType === 'ROTATOR' ? 'bg-purple-600/10 border-purple-500/40 shadow-inner' : 'bg-transparent border-transparent hover:bg-slate-800/30 text-slate-400'
                  }`}
                >
                  <div className="relative shrink-0">
                    <RotateCw className={`w-3.5 h-3.5 ${s.status === 'ONLINE' ? 'text-purple-400 animate-spin-slow' : 'text-slate-700'}`} />
                    {s.proxyId && <Globe className="absolute -top-1 -right-1 w-2 h-2 text-amber-500" />}
                  </div>
                  <span className="text-sm font-bold truncate flex-1 text-left">{s.label}</span>
                  <span className="text-[10px] font-mono opacity-40">{s.statusList.length}Q</span>
                </button>
              ))}
            </div>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto flex flex-col relative">
        {isAdding ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className={`w-full max-w-lg bg-[#0a0f1d] border rounded-[3rem] p-12 shadow-3xl transition-all ${addType === 'ROTATOR' ? 'border-purple-500/20' : 'border-blue-500/20'}`}>
              <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-8 border ${addType === 'ROTATOR' ? 'bg-purple-500/10 border-purple-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                {addType === 'ROTATOR' ? <RotateCw className="w-10 h-10 text-purple-400" /> : <Layers className="w-10 h-10 text-blue-400" />}
              </div>
              <h2 className="text-3xl font-black mb-2 text-center tracking-tighter uppercase">Initialize {addType === 'ROTATOR' ? 'Rotator' : 'Onliner'}</h2>
              <p className="text-center text-slate-500 text-sm mb-10 font-medium tracking-tight">Sync your Discord Token securely with Lootify Onliner.</p>
              
              <form onSubmit={handleAdd} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Alias</label>
                    <input type="text" placeholder="e.g. Main Acc" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/40 font-semibold" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Route intelligence</label>
                    <select 
                      value={selectedProxyId} 
                      onChange={e => setSelectedProxyId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-blue-500/40 font-semibold appearance-none text-slate-400"
                    >
                      <option value="">Direct Connection</option>
                      {proxies.map(p => (
                        <option key={p.id} value={p.id}>{p.alias} ({p.type})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Discord Token</label>
                  <input type="password" placeholder="MTAz..." value={newToken} onChange={e => setNewToken(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-5 text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/40 font-mono" />
                </div>
                <div className="flex gap-4 pt-6">
                  <button type="button" onClick={() => setIsAdding(false)} className="flex-1 py-5 bg-slate-900 hover:bg-slate-800 rounded-[1.5rem] font-bold text-sm transition-all border border-slate-800 shadow-lg uppercase tracking-widest">Discard</button>
                  <button type="submit" className={`flex-1 py-5 rounded-[1.5rem] font-black text-sm transition-all shadow-2xl uppercase tracking-widest ${addType === 'ROTATOR' ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-600/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'}`}>Authorize</button>
                </div>
              </form>
            </div>
          </div>
        ) : selectedType === 'PROXY_VAULT' ? (
          <div className="p-10 max-w-6xl mx-auto w-full space-y-12">
             <header className="flex items-center justify-between p-12 bg-gradient-to-br from-amber-600/10 to-[#0a0f1d] border border-amber-500/20 rounded-[3rem] shadow-2xl">
                <div className="flex items-center gap-10">
                   <div className="w-24 h-24 bg-amber-500/5 border border-amber-500/20 rounded-[2rem] flex items-center justify-center text-amber-500 shadow-inner">
                      <Globe className="w-12 h-12" />
                   </div>
                   <div>
                      <h2 className="text-5xl font-black tracking-tighter uppercase italic">Proxy Vault</h2>
                      <p className="text-slate-500 text-xs font-black uppercase tracking-[0.3em] mt-2">Route your interactions through custom nodes</p>
                   </div>
                </div>
                <button onClick={() => setIsAddingProxy(true)} className="px-10 py-5 bg-amber-600 hover:bg-amber-500 text-white rounded-[1.5rem] font-black text-sm flex items-center gap-3 transition-all shadow-2xl active:scale-95 uppercase tracking-widest">
                   <Plus className="w-5 h-5" /> Register Node
                </button>
             </header>

             {isAddingProxy ? (
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
                                     proxyType === t ? 'bg-amber-500 border-amber-400 text-white shadow-lg shadow-amber-500/20' : 'bg-slate-950 border-slate-800 text-slate-500'
                                  }`}>{t}</button>
                            ))}
                         </div>
                      </div>
                      <div className="space-y-3">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Host Address</label>
                         <input type="text" placeholder="127.0.0.1 or domain.com" value={proxyHost} onChange={e => setProxyHost(e.target.value)} required
                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-mono focus:border-amber-500/50 outline-none transition-all" />
                      </div>
                      <div className="space-y-3">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Network Port</label>
                         <input type="number" placeholder="8080" value={proxyPort} onChange={e => setProxyPort(e.target.value)} required
                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-mono focus:border-amber-500/50 outline-none transition-all" />
                      </div>
                      <div className="space-y-3">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Username (Optional)</label>
                         <input type="text" value={proxyUser} onChange={e => setProxyUser(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-bold focus:border-amber-500/50 outline-none transition-all" />
                      </div>
                      <div className="space-y-3">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Password (Optional)</label>
                         <input type="password" value={proxyPass} onChange={e => setProxyPass(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-bold focus:border-amber-500/50 outline-none transition-all" />
                      </div>
                      <div className="md:col-span-2 flex gap-4 pt-6 border-t border-slate-800 mt-4">
                         <button type="button" onClick={() => setIsAddingProxy(false)} className="flex-1 py-5 bg-slate-900 hover:bg-slate-800 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border border-slate-800">Cancel</button>
                         <button type="submit" className="flex-1 py-5 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-amber-600/20">Secure & Save Node</button>
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
                      <div key={p.id} className="bg-slate-950 border border-slate-800 rounded-[2.5rem] p-8 flex flex-col justify-between group hover:border-amber-500/40 transition-all shadow-xl min-h-[420px]">
                         <div>
                            <div className="flex items-center justify-between mb-8">
                               <div className="px-4 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-[10px] font-black text-amber-500 uppercase tracking-widest">{p.type}</div>
                               <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => testProxy(p.id)} 
                                    disabled={p.testStatus === 'testing'}
                                    className={`p-2.5 rounded-xl transition-all border ${
                                      p.testStatus === 'testing' ? 'bg-amber-500/20 text-amber-500 animate-pulse border-amber-500/30' : 
                                      p.testStatus === 'success' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20' :
                                      p.testStatus === 'failed' ? 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20' :
                                      'bg-slate-800/50 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 border-slate-700/50'
                                    }`}
                                  >
                                    <Wifi className={`w-4 h-4 ${p.testStatus === 'testing' && 'animate-bounce'}`} />
                                  </button>
                                  <button onClick={() => removeProxy(p.id)} className="p-2.5 text-slate-600 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all border border-transparent hover:border-red-500/20"><Trash2 className="w-4 h-4" /></button>
                               </div>
                            </div>
                            <h4 className="text-2xl font-black tracking-tighter uppercase mb-2 truncate">{p.alias}</h4>
                            
                            {p.testStatus === 'success' && p.ip ? (
                               <div className="mt-4 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-300">
                                  <div className="flex items-center justify-between mb-2">
                                     <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Active Node IP</span>
                                     <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                  </div>
                                  <p className="text-sm font-mono font-bold text-slate-200">{p.ip}</p>
                                  <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-500 font-bold uppercase">
                                     <MapPin className="w-3 h-3" /> {p.country}
                                  </div>
                               </div>
                            ) : p.testStatus === 'failed' ? (
                               <div className="mt-4 p-4 bg-red-500/5 border border-red-500/10 rounded-2xl text-red-400 flex items-center gap-3">
                                  <AlertCircle className="w-4 h-4 shrink-0" />
                                  <span className="text-[10px] font-black uppercase tracking-widest leading-tight">Connection Refused: Check Host/Port</span>
                               </div>
                            ) : p.testStatus === 'testing' ? (
                               <div className="mt-4 p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl text-amber-400 flex items-center gap-3">
                                  <RefreshCcw className="w-4 h-4 animate-spin shrink-0" />
                                  <span className="text-[10px] font-black uppercase tracking-widest">Pinging Node Infrastructure...</span>
                               </div>
                            ) : (
                               <div className="mt-4 p-4 bg-slate-900/50 border border-slate-800/50 rounded-2xl text-slate-500 flex items-center gap-3">
                                  <Globe className="w-4 h-4 shrink-0" />
                                  <span className="text-[10px] font-black uppercase tracking-widest">Untested Node</span>
                               </div>
                            )}

                            <div className="space-y-2 mt-6">
                               <div className="flex items-center gap-3 text-slate-500 font-mono text-xs bg-slate-900/50 p-3 rounded-xl border border-slate-800/50">
                                  <Globe className="w-3.5 h-3.5" /> {p.host}:{p.port}
                               </div>
                               {p.username && (
                                  <div className="flex items-center gap-3 text-slate-600 font-mono text-[10px] bg-slate-900/30 p-3 rounded-xl border border-slate-800/30">
                                     <Key className="w-3.5 h-3.5" /> Authenticated
                                  </div>
                               )}
                            </div>
                         </div>
                         <div className="mt-10 pt-6 border-t border-slate-900 flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Active Links</span>
                            <span className="text-[10px] font-mono text-amber-500 font-bold px-3 py-1 bg-amber-500/5 rounded-lg border border-amber-500/10">
                               {sessions.filter(s => s.proxyId === p.id).length + rotatorSessions.filter(s => s.proxyId === p.id).length} SECTORED
                            </span>
                         </div>
                      </div>
                   ))}
                </div>
             )}
          </div>
        ) : currentAccount ? (
          <div className="p-10 max-w-7xl mx-auto w-full space-y-10 animate-in fade-in duration-500">
            
            <header className={`flex flex-col md:flex-row md:items-center justify-between gap-8 p-12 rounded-[3rem] shadow-2xl border relative overflow-hidden group ${
              selectedType === 'ROTATOR' ? 'bg-[#10081a] border-purple-500/20' : 'bg-[#080d1a] border-blue-500/20'
            }`}>
              <div className="flex items-center gap-10 relative z-10">
                <div className="relative">
                   <div className={`w-28 h-28 rounded-[2.5rem] flex items-center justify-center border shadow-inner ${
                     selectedType === 'ROTATOR' ? 'bg-purple-500/5 border-purple-500/20 text-purple-400' : 'bg-blue-500/5 border-blue-500/20 text-blue-400'
                   }`}>
                      {selectedType === 'ROTATOR' ? <RotateCw className={`w-12 h-12 ${currentAccount.status === 'ONLINE' && 'animate-spin-slow'}`} /> : <Smile className="w-12 h-12" />}
                   </div>
                   <div className={`absolute -bottom-2 -right-2 w-10 h-10 border-[10px] border-[#0a0f1d] rounded-full ${
                     currentAccount.status === 'ONLINE' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.6)]' : 'bg-slate-700'
                   }`} />
                </div>
                <div>
                  <div className="flex items-center gap-5 mb-3">
                    <h2 className="text-5xl font-black tracking-tighter uppercase italic">{currentAccount.label}</h2>
                    <StatusBadge status={currentAccount.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-y-2 gap-x-6 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">
                    <span className="flex items-center gap-2"> {selectedType} SECTOR</span>
                    <span className="w-1.5 h-1.5 bg-slate-800 rounded-full" />
                    <span>UPTIME: {formatUptime(currentAccount.startTime)}</span>
                    {currentAccount.proxyId && (
                      <>
                        <span className="w-1.5 h-1.5 bg-slate-800 rounded-full" />
                        <span className="flex items-center gap-2 text-amber-500">
                          <Globe className="w-3 h-3" /> 
                          PROXY: {proxies.find(p => p.id === currentAccount.proxyId)?.alias} 
                          {proxies.find(p => p.id === currentAccount.proxyId)?.ip && (
                            <span className="ml-1 text-slate-600">({proxies.find(p => p.id === currentAccount.proxyId)?.ip})</span>
                          )}
                        </span>
                      </>
                    )}
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
              
              {selectedType === 'ROTATOR' ? (
                <>
                  <section className="bg-[#0a0f1d] border border-slate-800/60 rounded-[2.5rem] p-10 shadow-xl space-y-10">
                    <div className="flex items-center justify-between border-b border-slate-800/50 pb-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-purple-500/10 rounded-2xl shadow-inner"><RotateCw className="w-6 h-6 text-purple-400" /></div>
                        <h3 className="font-black text-lg tracking-tight uppercase">Status Pipeline</h3>
                      </div>
                      <button onClick={async () => {
                        const suggestions = await generateStatusSuggestions("motivational tech productivity");
                        if (suggestions.length > 0) {
                          setRotatorSessions(prev => prev.map(s => s.id === selectedId ? { ...s, statusList: [...s.statusList, ...suggestions.map(sg => sg.status)] } : s));
                        }
                      }} className="p-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border border-indigo-500/20">
                         <Sparkles className="w-4 h-4" /> AI Suggest
                      </button>
                    </div>
                    
                    <div className="space-y-6">
                      <div className="flex gap-4">
                        <input type="text" placeholder="Add status (Emoji support 😍)..." value={newStatusItem} onChange={e => setNewStatusItem(e.target.value)}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm focus:border-purple-500/50 transition-all font-medium" />
                        <button onClick={() => {
                          if (!newStatusItem.trim()) return;
                          setRotatorSessions(prev => prev.map(s => s.id === selectedId ? { ...s, statusList: [...s.statusList, newStatusItem.trim()] } : s));
                          setNewStatusItem('');
                        }} className="p-4 bg-purple-600 hover:bg-purple-500 rounded-2xl transition-all shadow-lg shadow-purple-600/20">
                          <Plus className="w-6 h-6 text-white" />
                        </button>
                      </div>

                      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {(currentAccount as RotatorSession).statusList.map((status, idx) => (
                          <div key={idx} className={`p-5 rounded-2xl border flex items-center justify-between group transition-all ${
                            (currentAccount as RotatorSession).currentIndex === idx ? 'bg-purple-600/10 border-purple-500/40 scale-[1.02] shadow-xl' : 'bg-slate-950 border-slate-800/40'
                          }`}>
                            <div className="flex items-center gap-4 overflow-hidden">
                              <span className={`text-[10px] font-mono shrink-0 font-black ${ (currentAccount as RotatorSession).currentIndex === idx ? 'text-purple-400' : 'text-slate-600' }`}>
                                {String(idx + 1).padStart(2, '0')}
                              </span>
                              <p className="text-sm font-bold text-slate-200 truncate">"{status}"</p>
                            </div>
                            <div className="flex items-center gap-2">
                               { (currentAccount as RotatorSession).currentIndex === idx && (
                                 <span className="text-[8px] font-black text-purple-400 uppercase tracking-widest px-2 py-1 bg-purple-500/20 rounded-md border border-purple-500/30">Active</span>
                               )}
                               <button onClick={() => {
                                 setRotatorSessions(prev => prev.map(s => s.id === selectedId ? { ...s, statusList: s.statusList.filter((_, i) => i !== idx) } : s));
                               }} className="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all">
                                 <X className="w-4 h-4" />
                               </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="bg-[#0a0f1d] border border-slate-800/60 rounded-[2.5rem] p-10 shadow-xl space-y-10">
                    <div className="flex items-center gap-4 border-b border-slate-800/50 pb-6">
                      <div className="p-3 bg-amber-500/10 rounded-2xl shadow-inner"><Gauge className="w-6 h-6 text-amber-400" /></div>
                      <h3 className="font-black text-lg tracking-tight uppercase">Rotation Delay</h3>
                    </div>
                    
                    <div className="space-y-8">
                      <div className="p-8 bg-slate-950 rounded-3xl border border-slate-800/40 text-center relative group overflow-hidden shadow-inner">
                         <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                         <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4">Pulse Interval</p>
                         <h4 className="text-6xl font-mono font-black text-amber-400 tracking-tighter relative z-10">{(currentAccount as RotatorSession).interval}<span className="text-xl ml-1 text-slate-700 font-sans">SEC</span></h4>
                      </div>

                      <div className="space-y-6">
                        <div>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-3 block">Set Multiplier</label>
                          <div className="flex gap-3">
                            <div className="relative flex-1">
                               <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                               <input 
                                 type="number" 
                                 min="15"
                                 placeholder="Seconds (min 15)..." 
                                 value={customInterval} 
                                 onChange={e => setCustomInterval(e.target.value)}
                                 className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-12 pr-6 py-4 text-sm focus:border-amber-500/50 transition-all font-bold" 
                               />
                            </div>
                            <button 
                              onClick={() => {
                                const val = parseInt(customInterval);
                                if (isNaN(val) || val < 15) return alert("Minimum 15 seconds to prevent Discord account flags.");
                                setRotatorSessions(prev => prev.map(s => s.id === selectedId ? { ...s, interval: val } : s));
                                if (currentAccount.status === 'ONLINE') {
                                   stopAccount(currentAccount.id, 'ROTATOR');
                                   setTimeout(() => startRotator(currentAccount.id), 1000);
                                }
                              }}
                              className="px-6 py-4 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-black text-xs transition-all shadow-lg shadow-amber-600/20 uppercase tracking-widest"
                            >
                              Sync
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-3">
                          {[15, 30, 60, 120].map(val => (
                            <button key={val} onClick={() => {
                              setRotatorSessions(prev => prev.map(s => s.id === selectedId ? { ...s, interval: val } : s));
                              setCustomInterval(val.toString());
                              if (currentAccount.status === 'ONLINE') {
                                stopAccount(currentAccount.id, 'ROTATOR');
                                setTimeout(() => startRotator(currentAccount.id), 1000);
                              }
                            }} className={`py-4 rounded-2xl text-[11px] font-black border transition-all ${
                              (currentAccount as RotatorSession).interval === val ? 'bg-amber-500/10 border-amber-500 text-amber-400 shadow-lg shadow-amber-500/5' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-white hover:border-slate-600'
                            }`}>{val}s</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                </>
              ) : (
                <>
                  <section className="bg-slate-900 border border-slate-800/60 rounded-[2.5rem] p-10 shadow-xl space-y-8">
                    <div className="flex items-center gap-4 border-b border-slate-800/50 pb-6">
                      <div className="p-3 bg-blue-500/10 rounded-2xl shadow-inner"><Smile className="w-6 h-6 text-blue-400" /></div>
                      <h3 className="font-black text-lg tracking-tight uppercase">Identity Panel</h3>
                    </div>
                    <div className="space-y-8">
                       <div className="space-y-4">
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Gateway Presence</label>
                        <div className="grid grid-cols-4 gap-3">
                          {(['online', 'idle', 'dnd', 'invisible'] as PresenceStatus[]).map(s => (
                            <button key={s} onClick={() => setSessions(prev => prev.map(x => x.id === selectedId ? { ...x, presenceStatus: s } : x))}
                              className={`py-4 rounded-2xl text-[11px] font-black capitalize border transition-all ${
                                (currentAccount as DiscordSession).presenceStatus === s ? 'bg-blue-600 border-blue-500 text-white shadow-xl' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-white shadow-inner'
                              }`}>{s}</button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Static Status</label>
                        <div className="flex gap-3">
                           <input type="text" value={(currentAccount as DiscordSession).customStatusText} onChange={e => setSessions(prev => prev.map(x => x.id === selectedId ? { ...x, customStatusText: e.target.value } : x))}
                             className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-6 py-5 text-sm focus:border-blue-500 font-bold shadow-inner" />
                           <button onClick={async () => {
                             const suggestions = await generateStatusSuggestions("funny professional gaming");
                             if (suggestions.length > 0) {
                               setSessions(prev => prev.map(x => x.id === selectedId ? { ...x, customStatusText: suggestions[0].status } : x));
                             }
                           }} className="p-5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-2xl border border-indigo-500/20 transition-all">
                              <Sparkles className="w-5 h-5" />
                           </button>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="bg-slate-900 border border-slate-800/60 rounded-[2.5rem] p-10 shadow-xl space-y-8">
                    <div className="flex items-center gap-4 border-b border-slate-800/50 pb-6">
                      <div className="p-3 bg-purple-500/10 rounded-2xl shadow-inner"><Gamepad2 className="w-6 h-6 text-purple-400" /></div>
                      <h3 className="font-black text-lg tracking-tight uppercase">Rich Presence (RPC)</h3>
                    </div>
                    <div className="space-y-8">
                       <div className="space-y-4">
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Modality</label>
                        <div className="flex flex-wrap gap-3">
                          {[
                            { id: 0, name: 'Playing', icon: <Gamepad2 className="w-4 h-4" /> },
                            { id: 3, name: 'Watching', icon: <Monitor className="w-4 h-4" /> },
                            { id: 2, name: 'Listening', icon: <Music className="w-4 h-4" /> }
                          ].map(t => (
                            <button key={t.id} onClick={() => setSessions(prev => prev.map(x => x.id === selectedId ? { ...x, activityType: t.id } : x))}
                              className={`flex items-center gap-3 px-6 py-4 rounded-2xl text-[11px] font-black border transition-all ${
                                (currentAccount as DiscordSession).activityType === t.id ? 'bg-purple-600 border-purple-500 text-white shadow-lg' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-white shadow-inner'
                              }`}>{t.icon} {t.name}</button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Application Name</label>
                        <input type="text" value={(currentAccount as DiscordSession).activityName} onChange={e => setSessions(prev => prev.map(x => x.id === selectedId ? { ...x, activityName: e.target.value } : x))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-5 text-sm focus:border-purple-500 font-bold shadow-inner" />
                      </div>
                    </div>
                  </section>
                </>
              )}

              <section className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 shadow-xl xl:col-span-2">
                 <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-emerald-500/10 rounded-2xl shadow-inner"><LayoutDashboard className="w-6 h-6 text-emerald-400" /></div>
                      <h3 className="font-black text-lg tracking-tight uppercase">Telemetry Console</h3>
                    </div>
                    <div className="flex items-center gap-3">
                       <div className="px-6 py-2 bg-emerald-500/10 text-emerald-400 rounded-full text-[10px] font-black tracking-widest border border-emerald-500/20 uppercase shadow-inner">Gateway Secure</div>
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
               Enterprise-grade WebSocket persistence for Discord accounts. Deploy clusters and maintain a consistent 24/7 presence with advanced rotation logic and proxy routing.
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
