
export type ConnectionStatus = 'OFFLINE' | 'CONNECTING' | 'ONLINE' | 'ERROR';
export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible';
export type AccountType = 'STANDARD' | 'ROTATOR';
export type ProxyType = 'HTTP' | 'SOCKS5';

export interface Proxy {
  id: string;
  alias: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  type: ProxyType;
  testStatus?: 'idle' | 'testing' | 'success' | 'failed';
  ip?: string;
  country?: string;
}

export interface DiscordSession {
  id: string;
  token: string;
  label: string;
  status: ConnectionStatus;
  lastHeartbeat: Date | null;
  startTime: Date | null;
  logs: LogEntry[];
  accountType: AccountType;
  proxyId?: string; // Reference to a proxy in the vault
  
  // Standard Configuration
  presenceStatus: PresenceStatus;
  customStatusText: string;
  
  // Enhanced RPC Panel
  rpcEnabled: boolean;
  activityName: string;
  activityType: number;
  activityDetails?: string;
  activityState?: string;
  applicationId?: string;
}

export interface RotatorSession extends Omit<DiscordSession, 'customStatusText' | 'rpcEnabled' | 'activityName' | 'activityType' | 'activityDetails' | 'activityState' | 'applicationId'> {
  accountType: 'ROTATOR';
  statusList: string[];
  interval: number; // in seconds
  currentIndex: number;
  presenceStatus: PresenceStatus;
}

export interface LogEntry {
  timestamp: Date;
  message: string;
  type: 'INFO' | 'ERROR' | 'SUCCESS' | 'DEBUG';
  ip?: string; // Optional IP to show in logs
}

export interface GeminiStatusSuggestion {
  status: string;
  category: string;
}
