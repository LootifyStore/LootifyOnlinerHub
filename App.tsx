
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DiscordSession, RotatorSession, ConnectionStatus, LogEntry, PresenceStatus, AccountType, Proxy, ProxyType, DiscordUserProfile } from './types.ts';
import { DiscordWorker } from './services/discordService.ts';
import { DiscordRotatorWorker } from './services/rotatorService.ts';
import { generateStatusSuggestions, generateBioSuggestions } from './services/geminiService.ts';
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
  RefreshCcw,
  Monitor,
  Gamepad2,
  Tv,
  Music,
  Trophy,
  Smile,
  CheckCircle2,
  RotateCw,
  Layers,
  Clock,
  X,
  Gauge,
  Globe,
  Shield,
  Server,
  Key,
  Wifi,
  MapPin,
  AlertCircle,
  ClipboardList,
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
  Zap,
  Coffee,
  Hash
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

  // Isolated state for Identity Suite to prevent breaking main logic
  const [editingProfile, setEditingProfile] = useState<Partial<DiscordUserProfile>>({});
  const [bioKeywords, setBioKeywords] = useState('');
  const [isGeneratingBio, setIsGeneratingBio] = useState(false);

  const standardWorkers = useRef<Map<string, DiscordWorker>>(new Map());
  const rotatorWorkers = useRef<Map<string, DiscordRotatorWorker>>(new Map());

  const getRelayUrl = () => (import.meta as any).env?.VITE_RELAY_URL || "";

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

  const removeAccount = (id: string, type: string) => {
    stopAccount(id, type as AccountType);
    if (type === 'STANDARD') setSessions(prev => prev.filter(s => s.id !== id));
    else setRotatorSessions(prev => prev.filter(s => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleSaveProfile = async () => {
    if (!selectedId) return;
    const worker = standardWorkers.current.get(selectedId);
    if (worker) {
      const success = await worker.updateProfile(editingProfile);
      if (success) {
        setEditingProfile({});
      }
    } else {
      alert("Discord Identity Bridge requires an ACTIVE ENGINE to push updates via Proxy.");
    }
  };

  const handleGenerateBio = async () => {
    if (!bioKeywords.trim()) return;
    setIsGeneratingBio(true);
    try {
      const bios = await generateBioSuggestions(bioKeywords);
      if (bios.length > 0) {
        setEditingProfile(p => ({ ...p, bio: bios[0] }));
      }
    } finally {
      setIsGeneratingBio(false);
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
        presenceStatus: 'online', customStatusText: 'Lootify Hub 😍', statusEmoji: '🎁', rpcEnabled: true,
        activityName: 'Lootify Hub', activityType: 0, activityDetails: 'Persistence System', activityState: 'Onliner Active',
        proxyId: selectedProxyId || undefined
      };
      setSessions(p => [...p, newSession]);
    } else {
      const newSession: RotatorSession = {
        id, token: newToken.trim(), label: newLabel.trim() || `Rotator ${rotatorSessions.length + 1}`,
        status: 'OFFLINE', lastHeartbeat: null, startTime: null, logs: [], accountType: 'ROTATOR',
        presenceStatus: 'online', statusList: ['Lootify Active 😍', '24/7 Monitoring 🔥'], interval: 60, currentIndex: 0,
        proxyId: selectedProxyId || undefined
      };
      setRotatorSessions(p => [...p, newSession]);
    }
    setNewToken(''); setNewLabel(''); setSelectedProxyId(''); setIsAdding(false); setSelectedId(id); setSelectedType(addType);
  };

  const currentAccount = selectedType === 'STANDARD' 
    ? sessions.find(s => s.id === selectedId) 
    : selectedType === 'ROTATOR' 
      ? rotatorSessions.find(s => s.id === selectedId)
      : null;

  const getProfileValue = (key: keyof DiscordUserProfile) => {
    return (editingProfile[key] as any) ?? (currentAccount as DiscordSession).profile?.[key] ?? '';
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#050810] text-slate-100 font-sans">
      <aside className="w-80 bg-[#0a0f1d] border-r border-slate-800/40 flex flex-col shrink-0 shadow-2xl">
        <div className="p-8 border-b border-slate-800/40 flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20"><Layers className="w-7 h-7 text-white" /></div>
          <div>
            <h1 className="font-black text-xl leading-tight tracking-tighter uppercase italic text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-blue-500">Lootify</h1>
            <div className="flex items-center gap-1">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
               <p className="text-[9px] text-slate-500 font-black tracking-widest uppercase">Onliner Core</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-8 px-4 space-y-10 custom-scrollbar">
          <button onClick={() => { setSelectedType('PROXY_VAULT'); setSelectedId(null); }}
            className={`w-full group px-5 py-4 rounded-2xl flex items-center justify-between transition-all border ${selectedType === 'PROXY_VAULT' ? 'bg-amber-600/10 border-amber-500/40 shadow-inner' : 'bg-slate-900/30 border-slate-800/40 hover:bg-slate-800/30 text-slate-400'}`}>
            <div className="flex items-center gap-4"><Globe className={`w-5 h-5 ${selectedType === 'PROXY_VAULT' ? 'text-amber-400' : 'text-slate-600 group-hover:text-amber-400'}`} />
            <span className="text-xs font-black uppercase tracking-widest">Proxy Vault</span></div>
            <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-950 rounded-lg border border-slate-800">{proxies.length}/20</span>
          </button>

          <div>
            <div className="px-4 mb-4 flex justify-between items-center group cursor-default">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Standard Cluster</span>
              <button onClick={() => { setAddType('STANDARD'); setIsAdding(true); setSelectedType('STANDARD'); }} className="p-1.5 bg-slate-800/50 hover:bg-blue-600/20 rounded-lg text-blue-400 border border-slate-700/50 transition-all"><Plus className="w-3.5 h-3.5" /></button>
            </div>
            <div className="space-y-1.5">
              {sessions.map(s => (
                <button key={s.id} onClick={() => { setSelectedId(s.id); setSelectedType('STANDARD'); }}
                  className={`w-full px-4 py-4 rounded-2xl flex items-center gap-4 transition-all border ${selectedId === s.id && selectedType === 'STANDARD' ? 'bg-blue-600/10 border-blue-500/40 shadow-inner' : 'bg-transparent border-transparent hover:bg-slate-800/30 text-slate-400'}`}>
                  <div className={`w-2.5 h-2.5 rounded-full ${s.status === 'ONLINE' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-slate-700'}`} />
                  <span className="text-sm font-bold truncate flex-1 text-left">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="px-4 mb-4 flex justify-between items-center group cursor-default">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Rotator Cluster</span>
              <button onClick={() => { setAddType('ROTATOR'); setIsAdding(true); setSelectedType('ROTATOR'); }} className="p-1.5 bg-slate-800/50 hover:bg-purple-600/20 rounded-lg text-purple-400 border border-slate-700/50 transition-all"><Plus className="w-3.5 h-3.5" /></button>
            </div>
            {rotatorSessions.map(s => (
              <button key={s.id} onClick={() => { setSelectedId(s.id); setSelectedType('ROTATOR'); }}
                className={`w-full px-4 py-4 rounded-2xl flex items-center gap-4 transition-all border ${selectedId === s.id && selectedType === 'ROTATOR' ? 'bg-purple-600/10 border-purple-500/40 shadow-inner' : 'bg-transparent border-transparent hover:bg-slate-800/30 text-slate-400'}`}>
                <RotateCw className={`w-3.5 h-3.5 ${s.status === 'ONLINE' ? 'text-purple-400 animate-spin-slow' : 'text-slate-700'}`} />
                <span className="text-sm font-bold truncate flex-1 text-left">{s.label}</span>
              </button>
            ))}
          </div>
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto flex flex-col relative">
        {isAdding ? (
          <div className="flex-1 flex items-center justify-center p-12 animate-in fade-in duration-300">
            <div className="w-full max-w-lg bg-[#0a0f1d] border border-slate-800/40 rounded-[3rem] p-12 shadow-3xl">
              <h2 className="text-3xl font-black mb-10 text-center tracking-tighter uppercase">Initialize {addType} Engine</h2>
              <form onSubmit={handleAdd} className="space-y-6">
                <input type="text" placeholder="Alias (e.g. Main Acc)" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-semibold focus:border-blue-500/40 outline-none" />
                <input type="password" placeholder="Discord Token" value={newToken} onChange={e => setNewToken(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-mono focus:border-blue-500/40 outline-none" />
                <select value={selectedProxyId} onChange={e => setSelectedProxyId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm focus:border-blue-500/40 outline-none font-semibold text-slate-400 appearance-none">
                    <option value="">Direct Connection (No Proxy)</option>
                    {proxies.map(p => <option key={p.id} value={p.id}>{p.alias} ({p.type})</option>)}
                </select>
                <div className="flex gap-4 pt-6">
                  <button type="button" onClick={() => setIsAdding(false)} className="flex-1 py-5 bg-slate-900 rounded-2xl font-bold text-sm border border-slate-800 uppercase tracking-widest">Discard</button>
                  <button type="submit" className="flex-1 py-5 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl">Authorize</button>
                </div>
              </form>
            </div>
          </div>
        ) : selectedType === 'PROXY_VAULT' ? (
          <div className="p-10 max-w-6xl mx-auto w-full space-y-12 pb-20 animate-in fade-in duration-300">
             <header className="flex flex-col md:flex-row items-center justify-between p-12 bg-gradient-to-br from-amber-600/10 to-[#0a0f1d] border border-amber-500/20 rounded-[3rem] shadow-2xl gap-8">
                <div className="flex items-center gap-10">
                   <div className="w-24 h-24 bg-amber-500/5 border border-amber-500/20 rounded-[2rem] flex items-center justify-center text-amber-500 shadow-inner"><Globe className="w-12 h-12" /></div>
                   <div><h2 className="text-5xl font-black tracking-tighter uppercase italic">Proxy Vault</h2><p className="text-slate-500 text-xs font-black uppercase tracking-[0.3em] mt-2">Manage encrypted routes ({proxies.length}/20)</p></div>
                </div>
                <div className="flex gap-4">
                   <button onClick={() => setIsAddingProxy(true)} className="px-10 py-5 bg-amber-600 hover:bg-amber-500 rounded-[1.5rem] font-black text-sm flex items-center gap-3 shadow-2xl uppercase tracking-widest"><Plus className="w-5 h-5" /> New Node</button>
                </div>
             </header>

             {isAddingProxy && (
                <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 animate-in slide-in-from-top-4 duration-300">
                   <form onSubmit={(e) => {
                      e.preventDefault();
                      const np: Proxy = { id: crypto.randomUUID(), alias: proxyAlias || 'Unnamed Proxy', host: proxyHost, port: parseInt(proxyPort), username: proxyUser, password: proxyPass, type: proxyType, testStatus: 'idle' };
                      setProxies(prev => [...prev, np]);
                      setIsAddingProxy(false);
                      setProxyAlias(''); setProxyHost(''); setProxyPort('8080'); setProxyUser(''); setProxyPass('');
                   }} className="grid grid-cols-2 gap-6">
                      <input type="text" placeholder="Alias" value={proxyAlias} onChange={e => setProxyAlias(e.target.value)} required className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-500/50 outline-none" />
                      <select value={proxyType} onChange={e => setProxyType(e.target.value as ProxyType)} className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-500/50 outline-none">
                         <option value="HTTP">HTTP</option>
                         <option value="SOCKS5">SOCKS5</option>
                      </select>
                      <input type="text" placeholder="Host" value={proxyHost} onChange={e => setProxyHost(e.target.value)} required className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-500/50 outline-none" />
                      <input type="number" placeholder="Port" value={proxyPort} onChange={e => setProxyPort(e.target.value)} required className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-500/50 outline-none" />
                      <input type="text" placeholder="User" value={proxyUser} onChange={e => setProxyUser(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-500/50 outline-none" />
                      <input type="password" placeholder="Pass" value={proxyPass} onChange={e => setProxyPass(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-500/50 outline-none" />
                      <div className="col-span-2 flex gap-4">
                         <button type="button" onClick={() => setIsAddingProxy(false)} className="flex-1 py-4 bg-slate-800 rounded-xl font-black text-xs uppercase">Cancel</button>
                         <button type="submit" className="flex-1 py-4 bg-amber-600 rounded-xl font-black text-xs uppercase">Secure Node</button>
                      </div>
                   </form>
                </div>
             )}

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {proxies.map(p => (
                  <div key={p.id} className="bg-slate-950 border border-slate-800 rounded-[2.5rem] p-8 flex flex-col justify-between group hover:border-amber-500/40 transition-all shadow-xl min-h-[250px]">
                    <div>
                      <div className="flex items-center justify-between mb-8">
                        <div className="px-4 py-1.5 bg-amber-500/10 rounded-full text-[10px] font-black text-amber-500 uppercase">{p.type}</div>
                        <button onClick={() => setProxies(prev => prev.filter(x => x.id !== p.id))} className="text-slate-700 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      <h4 className="text-2xl font-black tracking-tighter uppercase mb-2">{p.alias}</h4>
                      <p className="text-sm font-mono text-slate-500 truncate">{p.host}:{p.port}</p>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        ) : currentAccount ? (
          <div className="p-10 max-w-7xl mx-auto w-full space-y-10 pb-32 animate-in fade-in duration-300">
            <header className={`flex flex-col md:flex-row md:items-center justify-between gap-8 p-12 rounded-[3rem] shadow-2xl border relative overflow-hidden ${selectedType === 'ROTATOR' ? 'bg-[#10081a] border-purple-500/20' : 'bg-[#080d1a] border-blue-500/20'}`}>
              <div className="flex items-center gap-10 relative z-10">
                <div className="relative">
                  <div className="w-28 h-28 rounded-[2.5rem] flex items-center justify-center border bg-slate-950 shadow-inner overflow-hidden">
                    {(currentAccount as DiscordSession).profile?.avatar ? (
                      <img src={`https://cdn.discordapp.com/avatars/${(currentAccount as DiscordSession).profile?.id}/${(currentAccount as DiscordSession).profile?.avatar}.png?size=256`} className="w-full h-full object-cover" alt="Avatar" />
                    ) : <User className="w-12 h-12 text-slate-700" />}
                  </div>
                  <div className={`absolute -bottom-2 -right-2 w-10 h-10 border-[10px] border-[#0a0f1d] rounded-full ${currentAccount.status === 'ONLINE' ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                </div>
                <div>
                  <h2 className="text-5xl font-black tracking-tighter uppercase italic">{(currentAccount as DiscordSession).profile?.global_name || currentAccount.label}</h2>
                  <div className="flex items-center gap-4 mt-2 font-mono text-[10px] text-slate-500">
                    <StatusBadge status={currentAccount.status} />
                    <span>{(currentAccount as DiscordSession).profile?.username ? `@${(currentAccount as DiscordSession).profile?.username}` : 'DISCONNECTED'}</span>
                    {currentAccount.proxyId && <span className="flex items-center gap-1 text-amber-500"><Shield className="w-3 h-3" /> PROXY ACTIVE</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-4 relative z-10">
                {currentAccount.status !== 'ONLINE' ? (
                  <button onClick={() => selectedType === 'STANDARD' ? startStandard(currentAccount.id) : startRotator(currentAccount.id)} className="px-10 py-5 bg-blue-600 hover:bg-blue-500 rounded-[1.5rem] font-black text-sm uppercase shadow-2xl active:scale-95 transition-all">START ENGINE</button>
                ) : (
                  <button onClick={() => stopAccount(currentAccount.id, selectedType as AccountType)} className="px-10 py-5 bg-red-600/10 text-red-500 rounded-[1.5rem] font-black text-sm border border-red-500/20 hover:bg-red-600/20 transition-all">STOP ENGINE</button>
                )}
                <button onClick={() => removeAccount(currentAccount.id, selectedType)} className="p-5 bg-slate-900/50 hover:bg-red-500 text-slate-500 hover:text-white rounded-[1.5rem] border border-slate-800 transition-all shadow-lg"><Trash2 className="w-6 h-6" /></button>
              </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              {selectedType === 'STANDARD' ? (
                <section className="lg:col-span-2 bg-[#0a0f1d] border border-slate-800/40 rounded-[3rem] p-10 space-y-12 shadow-3xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-blue-500/10 rounded-2xl"><User className="w-8 h-8 text-blue-400" /></div>
                      <div>
                         <h3 className="text-2xl font-black uppercase tracking-tight italic leading-tight">Identity Suite</h3>
                         <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Global Profile Persistence</p>
                      </div>
                    </div>
                    <button onClick={handleSaveProfile} className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-sm uppercase flex items-center gap-3 shadow-xl transition-all">
                      <Save className="w-5 h-5" /> PERSIST SYNC
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-8">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">Display Name</label>
                        <input type="text" 
                          value={getProfileValue('global_name')}
                          onChange={e => setEditingProfile(p => ({ ...p, global_name: e.target.value }))}
                          placeholder="Loading displayName..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-bold focus:border-blue-500/40 outline-none" />
                      </div>

                      <div className="space-y-3">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">Pronouns</label>
                         <input type="text" 
                            value={getProfileValue('pronouns')}
                            onChange={e => setEditingProfile(p => ({ ...p, pronouns: e.target.value }))}
                            placeholder="e.g. they/them"
                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-bold focus:border-blue-500/40 outline-none" />
                      </div>

                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center justify-between">
                          <span>About Me</span>
                          <span className="text-[9px] text-slate-700">MAX 190</span>
                        </label>
                        <div className="space-y-3">
                          <textarea rows={4} 
                            value={getProfileValue('bio')}
                            onChange={e => setEditingProfile(p => ({ ...p, bio: e.target.value.slice(0, 190) }))}
                            placeholder="Discord Bio..."
                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-bold focus:border-blue-500/40 outline-none resize-none custom-scrollbar shadow-inner" />
                          <div className="flex gap-2">
                             <input type="text" placeholder="AI Keywords..." 
                               value={bioKeywords} onChange={e => setBioKeywords(e.target.value)}
                               className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-[11px] font-semibold outline-none focus:border-indigo-500/30" />
                             <button onClick={handleGenerateBio} disabled={isGeneratingBio}
                               className="px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 rounded-xl text-[10px] font-black uppercase border border-indigo-500/20 transition-all flex items-center gap-2">
                               {isGeneratingBio ? <RefreshCcw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} AI
                             </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-10">
                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-5 block">Profile Color Index</label>
                        <div className="flex items-center gap-4 p-5 bg-slate-950 border border-slate-800 rounded-2xl shadow-inner">
                           <div className="w-14 h-14 rounded-2xl shadow-xl border border-white/5" style={{ backgroundColor: `#${(editingProfile.accent_color ?? (currentAccount as DiscordSession).profile?.accent_color ?? 0).toString(16).padStart(6, '0')}` }} />
                           <div className="flex-1">
                              <input type="text" 
                                 placeholder="HEX (e.g. 5865F2)"
                                 className="bg-transparent border-none text-base font-mono font-black w-full outline-none uppercase"
                                 onChange={e => {
                                   const val = e.target.value.replace('#', '');
                                   if (val.length <= 6) {
                                     const intVal = parseInt(val, 16);
                                     if (!isNaN(intVal)) setEditingProfile(p => ({ ...p, accent_color: intVal }));
                                   }
                                 }}
                              />
                              <p className="text-[9px] text-slate-600 uppercase font-black tracking-widest mt-1">Accent Hex</p>
                           </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-5 block">HypeSquad Delegation</label>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { id: 1, name: 'Bravery', color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20' },
                            { id: 2, name: 'Brilliance', color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20' },
                            { id: 3, name: 'Balance', color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' }
                          ].map(house => (
                            <button key={house.id} 
                              onClick={() => standardWorkers.current.get(currentAccount.id)?.switchHypeSquad(house.id)}
                              className={`flex flex-col items-center justify-center p-5 rounded-2xl border transition-all hover:scale-[1.03] active:scale-95 ${house.bg} ${house.border}`}>
                              <Flag className={`w-6 h-6 ${house.color} mb-2`} />
                              <span className={`text-[8px] font-black uppercase ${house.color}`}>{house.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="p-8 bg-slate-950 border border-slate-800 rounded-[2.5rem] shadow-inner relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><CreditCard className="w-16 h-16" /></div>
                        <h4 className="text-xs font-black uppercase text-slate-600 mb-6 flex items-center gap-2">Account Metadata</h4>
                        <div className="space-y-4 font-mono text-[10px]">
                           <div className="flex justify-between border-b border-slate-900 pb-2"><span className="text-slate-600 uppercase">Internal ID:</span><span className="text-slate-300">{(currentAccount as DiscordSession).profile?.id || 'Locked'}</span></div>
                           <div className="flex justify-between border-b border-slate-900 pb-2"><span className="text-slate-600 uppercase">Avatar Hash:</span><span className="text-slate-400 truncate w-24 text-right">{(currentAccount as DiscordSession).profile?.avatar || 'None'}</span></div>
                           <div className="flex justify-between"><span className="text-slate-600 uppercase">State:</span><span className="text-emerald-500 uppercase font-black">Authorized</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              ) : (
                <section className="lg:col-span-2 bg-[#0a0f1d] border border-slate-800/40 rounded-[3rem] p-10 space-y-12 shadow-3xl">
                   <div className="flex items-center gap-4">
                      <div className="p-4 bg-purple-500/10 rounded-2xl"><RotateCw className="w-8 h-8 text-purple-400" /></div>
                      <div>
                         <h3 className="text-2xl font-black uppercase tracking-tight italic leading-tight">Rotation Matrix</h3>
                         <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Active Pulse: {(currentAccount as RotatorSession).interval}s</p>
                      </div>
                   </div>
                   <div className="space-y-6">
                      <div className="flex gap-4">
                         <input type="text" placeholder="Add Status to Matrix..." value={newStatusItem} onChange={e => setNewStatusItem(e.target.value)} className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-bold focus:border-purple-500/40 outline-none" />
                         <button onClick={() => {
                            if (!newStatusItem.trim()) return;
                            setRotatorSessions(prev => prev.map(s => s.id === selectedId ? { ...s, statusList: [...s.statusList, newStatusItem.trim()] } : s));
                            setNewStatusItem('');
                         }} className="px-8 bg-purple-600 rounded-2xl font-black text-white uppercase text-xs">Push</button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         {(currentAccount as RotatorSession).statusList.map((status, idx) => (
                            <div key={idx} className={`p-4 rounded-xl border flex items-center justify-between transition-all ${idx === (currentAccount as RotatorSession).currentIndex ? 'bg-purple-600/10 border-purple-500/50' : 'bg-slate-950 border-slate-800'}`}>
                               <span className="text-sm font-bold truncate pr-4 text-slate-300">"{status}"</span>
                               <button onClick={() => setRotatorSessions(prev => prev.map(s => s.id === selectedId ? { ...s, statusList: s.statusList.filter((_, i) => i !== idx) } : s))} className="text-slate-700 hover:text-red-500 transition-colors"><X className="w-4 h-4" /></button>
                            </div>
                         ))}
                      </div>
                   </div>
                </section>
              )}

              <div className="space-y-10">
                <section className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-xl">
                   <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-3"><Smile className="w-5 h-5 text-blue-400" /> Presence Gate</h3>
                   <div className="space-y-6">
                      <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl flex items-center gap-4 shadow-inner">
                        <span className="text-2xl">{(currentAccount as DiscordSession).statusEmoji || '🎁'}</span>
                        <p className="text-sm font-bold text-slate-200 truncate">"{(currentAccount as DiscordSession).customStatusText || 'Lootify Onliner'}"</p>
                      </div>
                      {selectedType === 'STANDARD' && (
                         <div className="grid grid-cols-2 gap-2">
                            {['online', 'idle', 'dnd', 'invisible'].map(p => (
                               <button key={p} 
                                  onClick={() => setSessions(prev => prev.map(s => s.id === selectedId ? { ...s, presenceStatus: p as PresenceStatus } : s))}
                                  className={`py-3 rounded-xl text-[10px] font-black uppercase border transition-all ${(currentAccount as DiscordSession).presenceStatus === p ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-600'}`}>{p}</button>
                            ))}
                         </div>
                      )}
                   </div>
                </section>

                <section className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-xl flex flex-col h-full max-h-[400px]">
                   <div className="flex items-center justify-between mb-6 shrink-0">
                      <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-3"><Activity className="w-5 h-5 text-emerald-400" /> Pulse Log</h3>
                      <div className="flex gap-1">
                         <div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div>
                         <div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div>
                         <div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div>
                      </div>
                   </div>
                   <Console logs={currentAccount.logs} />
                </section>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-20 text-center animate-in fade-in duration-1000">
            <div className="w-40 h-40 bg-slate-900 rounded-[3.5rem] flex items-center justify-center border border-slate-800 shadow-3xl mb-12 relative group">
               <Layers className="w-20 h-20 text-slate-800 group-hover:scale-110 transition-transform duration-700" />
               <div className="absolute inset-0 bg-indigo-500/5 rounded-[3.5rem] blur-3xl group-hover:blur-[4rem] transition-all"></div>
            </div>
            <h2 className="text-6xl font-black tracking-tighter mb-6 uppercase italic">Lootify Onliner</h2>
            <p className="text-slate-500 max-w-lg mx-auto leading-relaxed text-lg font-medium mb-12">Enterprise cluster management for persistent Discord sessions. 24/7 WebSocket heartbeat with identity suite integration.</p>
            <div className="flex gap-4">
               <button onClick={() => { setAddType('STANDARD'); setIsAdding(true); }} className="px-12 py-6 bg-blue-600 hover:bg-blue-500 text-white rounded-[1.75rem] font-black text-sm transition-all shadow-2xl shadow-blue-600/20 active:scale-95 uppercase tracking-widest">Deploy Standard</button>
               <button onClick={() => { setAddType('ROTATOR'); setIsAdding(true); }} className="px-12 py-6 bg-purple-600 hover:bg-purple-500 text-white rounded-[1.75rem] font-black text-sm transition-all shadow-2xl shadow-purple-600/20 active:scale-95 uppercase tracking-widest">Deploy Rotator</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
