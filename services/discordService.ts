
import { ConnectionStatus, LogEntry, PresenceStatus, Proxy, DiscordUserProfile } from '../types.ts';

export interface WorkerConfig {
  status: PresenceStatus;
  customStatusText: string;
  statusEmoji?: string;
  rpcEnabled: boolean;
  activityName: string;
  activityType: number;
  activityDetails?: string;
  activityState?: string;
  applicationId?: string;
  proxy?: Proxy;
}

export class DiscordWorker {
  private ws: WebSocket | null = null;
  private heartbeatInterval: number | null = null;
  private intervalRef: any = null;
  private sequence: number | null = null;
  private token: string;
  private onUpdate: (status: ConnectionStatus, log?: LogEntry, profile?: DiscordUserProfile) => void;
  private isConnected: boolean = false;
  
  private RELAY_URL = (import.meta as any).env?.VITE_RELAY_URL || (window as any).process?.env?.VITE_RELAY_URL || "";

  private config: WorkerConfig = {
    status: 'online',
    customStatusText: '',
    rpcEnabled: true,
    activityName: '',
    activityType: 0
  };

  constructor(
    token: string, 
    onUpdate: (status: ConnectionStatus, log?: LogEntry, profile?: DiscordUserProfile) => void, 
    config?: WorkerConfig
  ) {
    this.token = token;
    this.onUpdate = onUpdate;
    if (config) { this.config = config; }
  }

  private log(message: string, type: LogEntry['type'] = 'INFO') {
    this.onUpdate(this.isConnected ? 'ONLINE' : 'CONNECTING', {
      timestamp: new Date(),
      message: message,
      type
    });
  }

  private async restRequest(method: string, endpoint: string, body?: any) {
    const url = `https://discord.com/api/v10${endpoint}`;
    
    const directFetch = async () => {
      try {
        const res = await fetch(url, {
          method,
          headers: { 'Authorization': this.token, 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        this.log(`REST direct failure: ${e}`, 'ERROR');
        return null;
      }
    };

    if (!this.RELAY_URL) return directFetch();

    return new Promise((resolve) => {
      const restWs = new WebSocket(this.RELAY_URL);
      const timeout = setTimeout(() => { restWs.close(); resolve(directFetch()); }, 5000);

      restWs.onopen = () => {
        restWs.send(JSON.stringify({
          type: 'REST_PROXY', method, endpoint: url,
          headers: { 'Authorization': this.token, 'Content-Type': 'application/json' },
          body,
          proxy: this.config.proxy ? { host: this.config.proxy.host, port: this.config.proxy.port, type: this.config.proxy.type } : null
        }));
      };

      restWs.onmessage = (e) => {
        clearTimeout(timeout);
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'REST_RESULT') resolve(data.data);
          else resolve(null);
        } catch (err) { resolve(null); }
        restWs.close();
      };
    });
  }

  public async updateProfile(data: Partial<DiscordUserProfile>) {
    this.log(`Synchronizing identity...`, 'DEBUG');
    const result: any = await this.restRequest('PATCH', '/users/@me', data);
    if (result && (result.id || result.username)) {
      this.log('Identity synchronized.', 'SUCCESS');
      this.onUpdate(this.isConnected ? 'ONLINE' : 'CONNECTING', undefined, result);
      return true;
    }
    this.log(`Sync failed: Target Refused Connection`, 'ERROR');
    return false;
  }

  public async switchHypeSquad(houseId: number) {
    this.log(`Requesting HypeSquad change...`, 'DEBUG');
    const result: any = await this.restRequest('POST', '/hypesquad/online', { house_id: houseId });
    if (result && result.message) this.log(`HypeSquad Error: ${result.message}`, 'ERROR');
    else this.log(`HypeSquad affiliation confirmed.`, 'SUCCESS');
  }

  public connect() {
    this.isConnected = false;
    const discordGateway = 'wss://gateway.discord.gg/?v=10&encoding=json';
    const connectionUrl = (this.config.proxy && this.RELAY_URL) ? this.RELAY_URL : discordGateway;

    this.onUpdate('CONNECTING', { 
      timestamp: new Date(), 
      message: this.RELAY_URL ? `Initializing Gateway Handshake via Relay Node...` : `Warning: Establishing non-persistent browser link. (No 24/7 Mode)`, 
      type: this.RELAY_URL ? 'INFO' : 'ERROR' 
    });

    try {
      this.ws = new WebSocket(connectionUrl);

      this.ws.onopen = () => {
        if (this.config.proxy && this.RELAY_URL) {
          this.ws?.send(JSON.stringify({
            type: 'INIT_PROXY', target: discordGateway,
            proxy: { host: this.config.proxy.host, port: this.config.proxy.port, type: this.config.proxy.type }
          }));
        }
      };

      this.ws.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === 'RELAY_READY') return;
        if (payload.type === 'RELAY_ERROR') { this.onUpdate('ERROR'); return; }

        const { op, d, t, s } = payload;
        if (s) this.sequence = s;

        switch (op) {
          case 10: 
            this.heartbeatInterval = d.heartbeat_interval;
            this.startHeartbeat();
            this.identify();
            break;
          case 0: 
            if (t === 'READY') {
              this.isConnected = true;
              this.log(`Authorized as ${d.user.username}`, 'SUCCESS');
              this.onUpdate('ONLINE', undefined, d.user);
            }
            break;
          case 1: this.sendHeartbeat(); break;
        }
      };

      this.ws.onclose = (event) => {
        this.isConnected = false;
        this.stopHeartbeat();
        if (event.code !== 1000) this.reconnect();
        else this.onUpdate('OFFLINE');
      };
    } catch (error) { this.onUpdate('ERROR'); }
  }

  private identify() {
    this.ws?.send(JSON.stringify({
      op: 2,
      d: {
        token: this.token,
        properties: { $os: "Windows", $browser: "Chrome", $device: "" },
        presence: {
          status: this.config.status,
          afk: false,
          activities: this.config.customStatusText ? [{ type: 4, name: "Custom Status", state: this.config.customStatusText }] : [],
          since: 0
        }
      }
    }));
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) {
      this.intervalRef = setInterval(() => this.sendHeartbeat(), this.heartbeatInterval);
    }
  }

  private sendHeartbeat() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op: 1, d: this.sequence }));
    }
  }

  private stopHeartbeat() { if (this.intervalRef) clearInterval(this.intervalRef); }

  private reconnect() {
    this.stopHeartbeat();
    setTimeout(() => this.connect(), 5000);
  }

  public disconnect() {
    this.stopHeartbeat();
    if (this.ws) { this.ws.onclose = null; this.ws.close(1000); }
    this.onUpdate('OFFLINE');
  }
}
