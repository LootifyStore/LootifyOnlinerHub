
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

  // Useful Feature: Perform REST requests through the Relay to maintain Proxy IP
  private async restRequest(method: string, endpoint: string, body?: any) {
    if (!this.RELAY_URL) {
      this.log('Relay URL missing. Profile updates will be direct (LEAKS IP).', 'DEBUG');
      const res = await fetch(`https://discord.com/api/v10${endpoint}`, {
        method,
        headers: {
          'Authorization': this.token,
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
      });
      return res.json();
    }

    // Wrap the REST request inside a specialized WS command for the relay
    // Note: This assumes the relay script handles REST proxying via a WebSocket bridge
    return new Promise((resolve, reject) => {
      const restWs = new WebSocket(this.RELAY_URL);
      restWs.onopen = () => {
        restWs.send(JSON.stringify({
          type: 'REST_PROXY',
          method,
          endpoint: `https://discord.com/api/v10${endpoint}`,
          headers: { 'Authorization': this.token },
          body,
          proxy: this.config.proxy ? {
            host: this.config.proxy.host,
            port: this.config.proxy.port,
            username: this.config.proxy.username,
            password: this.config.proxy.password,
            type: this.config.proxy.type
          } : null
        }));
      };
      restWs.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'REST_RESULT') {
          resolve(data.data);
          restWs.close();
        } else if (data.type === 'RELAY_ERROR') {
          reject(data.error);
          restWs.close();
        }
      };
      restWs.onerror = (e) => reject(e);
      setTimeout(() => restWs.close(), 10000);
    });
  }

  public async updateProfile(data: Partial<DiscordUserProfile>) {
    this.log(`Attempting profile sync: ${Object.keys(data).join(', ')}...`, 'DEBUG');
    try {
      const payload: any = {};
      if (data.global_name !== undefined) payload.global_name = data.global_name;
      if (data.bio !== undefined) payload.bio = data.bio;
      if (data.accent_color !== undefined) payload.accent_color = data.accent_color;
      if (data.pronouns !== undefined) payload.pronouns = data.pronouns;

      const result: any = await this.restRequest('PATCH', '/users/@me', payload);
      if (result.id) {
        this.log('Profile settings persisted successfully.', 'SUCCESS');
        this.onUpdate(this.isConnected ? 'ONLINE' : 'CONNECTING', undefined, result);
        return true;
      } else {
        this.log(`Profile update rejected: ${JSON.stringify(result)}`, 'ERROR');
        return false;
      }
    } catch (e) {
      this.log(`REST Exception: ${e}`, 'ERROR');
      return false;
    }
  }

  public async switchHypeSquad(houseId: number) {
    this.log(`Executing HypeSquad Migration to House ${houseId}...`, 'DEBUG');
    try {
      await this.restRequest('POST', '/hypesquad/online', { house_id: houseId });
      this.log('HypeSquad House affiliation updated.', 'SUCCESS');
    } catch (e) {
      this.log(`HypeSquad Error: ${e}`, 'ERROR');
    }
  }

  public connect() {
    this.isConnected = false;
    const proxy = this.config.proxy;
    const discordGateway = 'wss://gateway.discord.gg/?v=10&encoding=json';
    const connectionUrl = (proxy && this.RELAY_URL) ? this.RELAY_URL : discordGateway;

    this.onUpdate('CONNECTING', { 
      timestamp: new Date(), 
      message: proxy ? `Routing via Relay [${proxy.alias}] at ${proxy.ip || proxy.host}...` : `Establishing Direct Discord Link...`, 
      type: 'INFO' 
    });

    try {
      this.ws = new WebSocket(connectionUrl);

      this.ws.onopen = () => {
        if (proxy && this.RELAY_URL) {
          this.ws?.send(JSON.stringify({
            type: 'INIT_PROXY',
            target: discordGateway,
            proxy: {
              host: proxy.host,
              port: proxy.port,
              username: proxy.username,
              password: proxy.password,
              type: proxy.type
            }
          }));
        }
      };

      this.ws.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === 'RELAY_READY') {
          this.log('Relay Node Active. Authenticating...', 'SUCCESS');
          return;
        }
        if (payload.type === 'RELAY_ERROR') {
          this.log(`Relay Failure: ${payload.error}`, 'ERROR');
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

      this.ws.onclose = (event) => {
        this.isConnected = false;
        this.stopHeartbeat();
        if (event.code !== 1000) this.reconnect();
        else this.onUpdate('OFFLINE');
      };
    } catch (error) {
      this.log(`Fatal Error: ${error}`, 'ERROR');
      this.onUpdate('ERROR');
    }
  }

  private identify() {
    const activities: any[] = [];
    if (this.config.customStatusText || this.config.statusEmoji) {
      const emojiParts = this.config.statusEmoji?.split(':');
      const emojiObj = emojiParts && emojiParts.length >= 2 ? {
        name: emojiParts[0],
        id: emojiParts[1],
        animated: false
      } : this.config.statusEmoji ? {
        name: this.config.statusEmoji
      } : undefined;

      activities.push({
        type: 4,
        name: "Custom Status",
        state: this.config.customStatusText || "",
        emoji: emojiObj
      });
    }

    if (this.config.rpcEnabled && this.config.activityName) {
      activities.push({
        type: this.config.activityType,
        name: this.config.activityName,
        details: this.config.activityDetails || undefined,
        state: this.config.activityState || undefined,
        application_id: this.config.applicationId || undefined
      });
    }

    this.ws?.send(JSON.stringify({
      op: 2,
      d: {
        token: this.token,
        properties: { $os: "Windows", $browser: "Chrome", $device: "" },
        presence: {
          status: this.config.status,
          afk: false,
          activities: activities,
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
  private reconnect() { this.stopHeartbeat(); setTimeout(() => this.connect(), 5000); }

  public disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close(1000);
    }
    this.onUpdate('OFFLINE');
  }
}
