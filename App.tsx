
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DiscordSession, RotatorSession, ConnectionStatus, LogEntry, PresenceStatus, AccountType, Proxy, ProxyType, DiscordUserProfile } from './types.ts';
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
  CreditCard
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

  // Local state for profile editing (avoiding direct session mutation while typing)
  const [editingProfile, setEditingProfile] = useState<Partial<DiscordUserProfile>>({});

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

  // Fix: Implemented missing removeAccount function
  const removeAccount = (id: string, type: any) => {
    stopAccount(id, type as AccountType);
    if (type === 'STANDARD') {
      setSessions(prev => prev.filter(s => s.id !== id));
    } else if (type === 'ROTATOR') {
      setRotatorSessions(prev => prev.filter(s => s.id !== id));
    }
    if (selectedId === id) {
      setSelectedId(null);
    }
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
      alert("Engine must be START to sync profile changes.");
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
            className={`w-full group px-5 py-4 rounded-2xl flex items-center justify-between transition-all border ${selectedType === 'PROXY_VAULT' ? 'bg-amber-600/10 border-amber-500/40' : 'bg-slate-900/30 border-slate-800/40 hover:bg-slate-800/30 text-slate-400'}`}>
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
          <div className="flex-1 flex items-center justify-center p-12">
            <div className={`w-full max-w-lg bg-[#0a0f1d] border rounded-[3rem] p-12 shadow-3xl transition-all border-slate-800/20`}>
              <h2 className="text-3xl font-black mb-10 text-center tracking-tighter uppercase">Initialize {addType} Engine</h2>
              <form onSubmit={handleAdd} className="space-y-6">
                <input type="text" placeholder="Alias (e.g. Main Acc)" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-semibold focus:border-blue-500/40" />
                <input type="password" placeholder="Discord Token" value={newToken} onChange={e => setNewToken(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-mono focus:border-blue-500/40" />
                <div className="flex gap-4 pt-6">
                  <button type="button" onClick={() => setIsAdding(false)} className="flex-1 py-5 bg-slate-900 rounded-2xl font-bold text-sm border border-slate-800 uppercase tracking-widest">Discard</button>
                  <button type="submit" className="flex-1 py-5 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl">Authorize</button>
                </div>
              </form>
            </div>
          </div>
        ) : selectedType === 'PROXY_VAULT' ? (
          <div className="p-10 max-w-6xl mx-auto w-full space-y-12 pb-20">
             <header className="flex flex-col md:flex-row items-center justify-between p-12 bg-gradient-to-br from-amber-600/10 to-[#0a0f1d] border border-amber-500/20 rounded-[3rem] shadow-2xl gap-8">
                <div className="flex items-center gap-10">
                   <div className="w-24 h-24 bg-amber-500/5 border border-amber-500/20 rounded-[2rem] flex items-center justify-center text-amber-500 shadow-inner"><Globe className="w-12 h-12" /></div>
                   <div><h2 className="text-5xl font-black tracking-tighter uppercase italic">Proxy Vault</h2><p className="text-slate-500 text-xs font-black uppercase tracking-[0.3em] mt-2">Route interactions through nodes ({proxies.length}/20)</p></div>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => setIsBulkImport(true)} className="px-8 py-5 bg-slate-900 hover:bg-slate-800 rounded-[1.5rem] font-black text-sm flex items-center gap-3 border border-slate-800 uppercase tracking-widest"><ClipboardList className="w-5 h-5" /> Bulk Import</button>
                  <button onClick={() => setIsAddingProxy(true)} className="px-10 py-5 bg-amber-600 hover:bg-amber-500 rounded-[1.5rem] font-black text-sm flex items-center gap-3 shadow-2xl uppercase tracking-widest"><Plus className="w-5 h-5" /> Register Node</button>
                </div>
             </header>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {proxies.map(p => (
                  <div key={p.id} className="bg-slate-950 border border-slate-800 rounded-[2.5rem] p-8 flex flex-col justify-between group hover:border-amber-500/40 transition-all shadow-xl min-h-[300px]">
                    <div>
                      <div className="flex items-center justify-between mb-8"><div className="px-4 py-1.5 bg-amber-500/10 rounded-full text-[10px] font-black text-amber-500 uppercase">{p.type}</div></div>
                      <h4 className="text-2xl font-black tracking-tighter uppercase mb-2">{p.alias}</h4>
                      <p className="text-sm font-mono text-slate-500">{p.host}:{p.port}</p>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        ) : currentAccount ? (
          <div className="p-10 max-w-7xl mx-auto w-full space-y-10 pb-32">
            <header className={`flex flex-col md:flex-row md:items-center justify-between gap-8 p-12 rounded-[3rem] shadow-2xl border relative overflow-hidden ${selectedType === 'ROTATOR' ? 'bg-[#10081a] border-purple-500/20' : 'bg-[#080d1a] border-blue-500/20'}`}>
              <div className="flex items-center gap-10 relative z-10">
                <div className="relative">
                  <div className="w-28 h-28 rounded-[2.5rem] flex items-center justify-center border bg-slate-950 shadow-inner">
                    {(currentAccount as DiscordSession).profile?.avatar ? (
                      <img src={`https://cdn.discordapp.com/avatars/${(currentAccount as DiscordSession).profile?.id}/${(currentAccount as DiscordSession).profile?.avatar}.png`} className="w-full h-full rounded-[2.5rem] object-cover" alt="Avatar" />
                    ) : <User className="w-12 h-12 text-slate-700" />}
                  </div>
                  <div className={`absolute -bottom-2 -right-2 w-10 h-10 border-[10px] border-[#0a0f1d] rounded-full ${currentAccount.status === 'ONLINE' ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                </div>
                <div>
                  <h2 className="text-5xl font-black tracking-tighter uppercase italic">{currentAccount.label}</h2>
                  <div className="flex items-center gap-4 mt-2">
                    <StatusBadge status={currentAccount.status} />
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{currentAccount.proxyId ? 'SECURED ROUTE' : 'DIRECT LINK'}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-4 relative z-10">
                {currentAccount.status !== 'ONLINE' ? (
                  <button onClick={() => selectedType === 'STANDARD' ? startStandard(currentAccount.id) : startRotator(currentAccount.id)} className="px-10 py-5 bg-blue-600 rounded-[1.5rem] font-black text-sm uppercase shadow-2xl">START ENGINE</button>
                ) : (
                  <button onClick={() => stopAccount(currentAccount.id, selectedType as AccountType)} className="px-10 py-5 bg-red-600/10 text-red-500 rounded-[1.5rem] font-black text-sm border border-red-500/20 transition-all">STOP ENGINE</button>
                )}
                <button onClick={() => removeAccount(currentAccount.id, selectedType)} className="p-5 bg-slate-900/50 hover:bg-red-500 text-slate-500 hover:text-white rounded-[1.5rem] border border-slate-800 transition-all"><Trash2 className="w-6 h-6" /></button>
              </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              {/* Account Management Suite (New Section) */}
              {selectedType === 'STANDARD' && (
                <section className="lg:col-span-2 bg-[#0a0f1d] border border-slate-800 rounded-[3rem] p-10 space-y-12 shadow-3xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4"><div className="p-4 bg-blue-500/10 rounded-2xl"><User className="w-8 h-8 text-blue-400" /></div>
                    <h3 className="text-2xl font-black uppercase tracking-tight italic">Profile Identity Suite</h3></div>
                    <button onClick={handleSaveProfile} className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-sm uppercase flex items-center gap-3 shadow-xl transition-all"><Save className="w-5 h-5" /> SYNC SETTINGS</button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Display Name</label>
                        <input type="text" placeholder={(currentAccount as DiscordSession).profile?.global_name || 'Loading...'}
                          onChange={e => setEditingProfile(p => ({ ...p, global_name: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-bold focus:border-blue-500/40" />
                      </div>
                      <div className="space-y-3">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Pronouns</label>
                         <input type="text" placeholder={(currentAccount as DiscordSession).profile?.pronouns || 'he/him'}
                            onChange={e => setEditingProfile(p => ({ ...p, pronouns: e.target.value }))}
                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-bold focus:border-blue-500/40" />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">About Me (Bio)</label>
                        <textarea rows={4} placeholder={(currentAccount as DiscordSession).profile?.bio || 'Tell Discord about yourself...'}
                          onChange={e => setEditingProfile(p => ({ ...p, bio: e.target.value }))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-sm font-bold focus:border-blue-500/40 resize-none custom-scrollbar" />
                      </div>
                    </div>

                    <div className="space-y-10">
                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-4 block">HypeSquad Delegation</label>
                        <div className="grid grid-cols-3 gap-4">
                          {[
                            { id: 1, name: 'Bravery', color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20' },
                            { id: 2, name: 'Brilliance', color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20' },
                            { id: 3, name: 'Balance', color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' }
                          ].map(house => (
                            <button key={house.id} 
                              onClick={() => standardWorkers.current.get(currentAccount.id)?.switchHypeSquad(house.id)}
                              className={`flex flex-col items-center justify-center p-6 rounded-3xl border transition-all hover:scale-105 active:scale-95 ${house.bg} ${house.border}`}>
                              <Flag className={`w-8 h-8 ${house.color} mb-2`} />
                              <span className={`text-[10px] font-black uppercase ${house.color}`}>{house.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="p-8 bg-slate-950 border border-slate-800 rounded-[2.5rem] shadow-inner">
                        <h4 className="text-xs font-black uppercase text-slate-600 mb-6 flex items-center gap-2"><CreditCard className="w-4 h-4" /> Account Metadata</h4>
                        <div className="space-y-4 font-mono text-[10px]">
                           <div className="flex justify-between"><span className="text-slate-600 uppercase">Internal ID:</span><span className="text-slate-300">{(currentAccount as DiscordSession).profile?.id || 'Locked'}</span></div>
                           <div className="flex justify-between"><span className="text-slate-600 uppercase">Username:</span><span className="text-slate-300">{(currentAccount as DiscordSession).profile?.username || 'Locked'}</span></div>
                           <div className="flex justify-between"><span className="text-slate-600 uppercase">Color Index:</span><span className="text-slate-300">#{(currentAccount as DiscordSession).profile?.accent_color?.toString(16) || 'None'}</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Status and Telemetry */}
              <div className="space-y-10">
                <section className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-xl">
                   <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-3"><Smile className="w-5 h-5 text-blue-400" /> Current Presence</h3>
                   <div className="space-y-4">
                      <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl flex items-center gap-4">
                        <span className="text-2xl">{(currentAccount as DiscordSession).statusEmoji}</span>
                        <p className="text-sm font-bold text-slate-200">"{(currentAccount as DiscordSession).customStatusText}"</p>
                      </div>
                      <div className="flex gap-2">
                        {['online', 'idle', 'dnd', 'invisible'].map(p => (
                          <button key={p} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase border ${(currentAccount as DiscordSession).presenceStatus === p ? 'bg-blue-600 border-blue-500' : 'bg-slate-950 border-slate-800 text-slate-600'}`}>{p}</button>
                        ))}
                      </div>
                   </div>
                </section>

                <section className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-xl">
                   <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-3"><Activity className="w-5 h-5 text-emerald-400" /> Engine Pulse</h3>
                   <Console logs={currentAccount.logs} />
                </section>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-20 text-center animate-in fade-in duration-1000">
            <div className="w-40 h-40 bg-slate-900 rounded-[3.5rem] flex items-center justify-center border border-slate-800 shadow-3xl mb-12 relative">
               <Layers className="w-20 h-20 text-slate-800" />
               <div className="absolute inset-0 bg-indigo-500/5 rounded-[3.5rem] blur-3xl"></div>
            </div>
            <h2 className="text-6xl font-black tracking-tighter mb-6 uppercase italic">Lootify Onliner</h2>
            <p className="text-slate-500 max-w-lg mx-auto leading-relaxed text-lg font-medium mb-12">Enterprise persistence for Discord clusters. Maintain 24/7 presence with advanced rotation and identity management.</p>
            <div className="flex gap-4">
               <button onClick={() => { setAddType('STANDARD'); setIsAdding(true); }} className="px-10 py-6 bg-blue-600 text-white rounded-[1.75rem] font-black text-sm transition-all shadow-2xl uppercase">Deploy Standard</button>
               <button onClick={() => { setAddType('ROTATOR'); setIsAdding(true); }} className="px-10 py-6 bg-purple-600 text-white rounded-[1.75rem] font-black text-sm transition-all shadow-2xl uppercase">Deploy Rotator</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
