
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
    if (config) {
      this.config = config;
    }
  }

  private log(message: string, type: LogEntry['type'] = 'INFO') {
    const proxyIp = this.config.proxy?.ip || this.config.proxy?.host;
    this.onUpdate(this.isConnected ? 'ONLINE' : 'CONNECTING', {
      timestamp: new Date(),
      message: this.config.proxy ? `[${proxyIp}] ${message}` : message,
      type
    });
  }

  private async restRequest(method: string, endpoint: string, body?: any) {
    const url = `https://discord.com/api/v10${endpoint}`;
    
    const directFetch = async () => {
      try {
        const res = await fetch(url, {
          method,
          headers: {
            'Authorization': this.token,
            'Content-Type': 'application/json'
          },
          body: body ? JSON.stringify(body) : undefined
        });
        if (!res.ok) {
           const errText = await res.text();
           throw new Error(`HTTP ${res.status}: ${errText}`);
        }
        return await res.json();
      } catch (e) {
        this.log(`REST direct failure: ${e}`, 'ERROR');
        return null;
      }
    };

    if (!this.RELAY_URL) return directFetch();

    return new Promise((resolve) => {
      const restWs = new WebSocket(this.RELAY_URL);
      const timeout = setTimeout(() => {
        restWs.close();
        resolve(directFetch());
      }, 8000);

      restWs.onopen = () => {
        restWs.send(JSON.stringify({
          type: 'REST_PROXY',
          method,
          endpoint: url,
          headers: { 'Authorization': this.token, 'Content-Type': 'application/json' },
          body,
          proxy: this.config.proxy ? { host: this.config.proxy.host, port: this.config.proxy.port, username: this.config.proxy.username, password: this.config.proxy.password, type: this.config.proxy.type } : null
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

      restWs.onerror = () => {
        clearTimeout(timeout);
        resolve(directFetch());
        restWs.close();
      };
    });
  }

  public async updateProfile(data: Partial<DiscordUserProfile>) {
    this.log(`Syncing identity updates to Discord...`, 'DEBUG');
    const payload: any = {};
    if (data.global_name !== undefined) payload.global_name = data.global_name.trim() || null;
    if (data.bio !== undefined) payload.bio = data.bio.trim();
    if (data.accent_color !== undefined) payload.accent_color = data.accent_color;
    if (data.pronouns !== undefined) payload.pronouns = data.pronouns.trim();

    const result: any = await this.restRequest('PATCH', '/users/@me', payload);
    if (result && (result.id || result.username)) {
      this.log('Identity synchronized successfully.', 'SUCCESS');
      this.onUpdate(this.isConnected ? 'ONLINE' : 'CONNECTING', undefined, result);
      return true;
    }
    this.log(`Identity Sync Failed. Verify token permissions.`, 'ERROR');
    return false;
  }

  public async switchHypeSquad(houseId: number) {
    this.log(`Requesting HypeSquad affiliation change...`, 'DEBUG');
    await this.restRequest('POST', '/hypesquad/online', { house_id: houseId });
    this.log(`HypeSquad affiliation update sent.`, 'SUCCESS');
  }

  public connect() {
    this.isConnected = false;
    const proxy = this.config.proxy;
    const discordGateway = 'wss://gateway.discord.gg/?v=10&encoding=json';
    
    // Safety check for mixed content
    if (window.location.protocol === 'https:' && this.RELAY_URL.startsWith('ws://')) {
       this.log("Security Block: 'ws://' link detected on HTTPS. Use 'wss://' tunnel link.", 'ERROR');
       this.onUpdate('ERROR');
       return;
    }

    const connectionUrl = (proxy && this.RELAY_URL) ? this.RELAY_URL : discordGateway;
    this.onUpdate('CONNECTING', { timestamp: new Date(), message: proxy ? `Routing via Relay Node...` : `Establishing Direct Discord Link...`, type: 'INFO' });

    try {
      this.ws = new WebSocket(connectionUrl);

      this.ws.onopen = () => {
        if (proxy && this.RELAY_URL) {
          this.ws?.send(JSON.stringify({
            type: 'INIT_PROXY',
            target: discordGateway,
            proxy: { host: proxy.host, port: proxy.port, username: proxy.username, password: proxy.password, type: proxy.type }
          }));
        }
      };

      this.ws.onmessage = (event) => {
        let payload;
        try {
           payload = JSON.parse(event.data);
        } catch(e) {
           this.log("Relay Handshake Error: Invalid response. Ensure tunnel landing page is bypassed.", 'ERROR');
           return;
        }

        if (payload.type === 'RELAY_READY') {
          this.log('Relay link verified. Authorizing...', 'SUCCESS');
          return;
        }
        if (payload.type === 'RELAY_ERROR') {
          this.log(`Relay Handshake Failed: ${payload.error}`, 'ERROR');
          if (payload.error.includes('ETIMEDOUT')) {
             this.log("Tip: RDP is unreachable or firewall is blocking Discord outbound link.", 'DEBUG');
          }
          this.onUpdate('ERROR');
          return;
        }

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
          case 1: 
            this.sendHeartbeat();
            break;
        }
      };

      this.ws.onerror = () => {
        this.log(`WebSocket link failure. Check Infrastructure panel for SSL/Mixed-Content diagnostics.`, 'ERROR');
        this.onUpdate('ERROR');
      };

      this.ws.onclose = (event) => {
        this.isConnected = false;
        this.stopHeartbeat();
        if (event.code !== 1000) {
           this.log(`Socket closed (Code: ${event.code}). Retrying...`, 'DEBUG');
           this.reconnect();
        } else {
           this.onUpdate('OFFLINE');
        }
      };
    } catch (error) {
      this.log(`Engine failure: ${error}`, 'ERROR');
      this.onUpdate('ERROR');
    }
  }

  private identify() {
    const activities: any[] = [];
    if (this.config.customStatusText || this.config.statusEmoji) {
      const emojiParts = this.config.statusEmoji?.split(':');
      const emojiObj = emojiParts && emojiParts.length >= 2 ? { name: emojiParts[0], id: emojiParts[1], animated: false } : this.config.statusEmoji ? { name: this.config.statusEmoji } : undefined;
      activities.push({ type: 4, name: "Custom Status", state: this.config.customStatusText || "", emoji: emojiObj });
    }
    if (this.config.rpcEnabled && this.config.activityName) {
      activities.push({ type: this.config.activityType, name: this.config.activityName, details: this.config.activityDetails || undefined, state: this.config.activityState || undefined, application_id: this.config.applicationId || undefined });
    }
    this.ws?.send(JSON.stringify({ op: 2, d: { token: this.token, properties: { $os: "Windows", $browser: "Chrome", $device: "" }, presence: { status: this.config.status, afk: false, activities: activities, since: 0 } } }));
  }

  private startHeartbeat() { if (this.heartbeatInterval) this.intervalRef = setInterval(() => this.sendHeartbeat(), this.heartbeatInterval); }
  private sendHeartbeat() { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ op: 1, d: this.sequence })); }
  private stopHeartbeat() { if (this.intervalRef) clearInterval(this.intervalRef); }
  private reconnect() { this.stopHeartbeat(); setTimeout(() => this.connect(), 5000); }
  public disconnect() { this.stopHeartbeat(); if (this.ws) { this.ws.onclose = null; this.ws.close(1000); } this.onUpdate('OFFLINE'); }
}
