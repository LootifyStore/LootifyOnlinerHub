
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

export interface DiscordUserProfile {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  banner: string | null;
  accent_color: number | null;
  global_name: string | null; // Display Name
  bio: string;
  pronouns: string;
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
  proxyId?: string;
  
  // Profile Data (Loaded on connect)
  profile?: DiscordUserProfile;

  // Standard Configuration
  presenceStatus: PresenceStatus;
  customStatusText: string;
  statusEmoji?: string;
  
  // Enhanced RPC Panel
  rpcEnabled: boolean;
  activityName: string;
  activityType: number;
  activityDetails?: string;
  activityState?: string;
  applicationId?: string;
}

export interface RotatorSession extends Omit<DiscordSession, 'customStatusText' | 'statusEmoji' | 'rpcEnabled' | 'activityName' | 'activityType' | 'activityDetails' | 'activityState' | 'applicationId'> {
  accountType: 'ROTATOR';
  statusList: string[];
  interval: number;
  currentIndex: number;
  presenceStatus: PresenceStatus;
}

export interface LogEntry {
  timestamp: Date;
  message: string;
  type: 'INFO' | 'ERROR' | 'SUCCESS' | 'DEBUG';
  ip?: string;
}

export interface GeminiStatusSuggestion {
  status: string;
  category: string;
}
