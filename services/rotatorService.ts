
import { ConnectionStatus, LogEntry, PresenceStatus, Proxy } from '../types.ts';

export interface RotatorConfig {
  status: PresenceStatus;
  statusList: string[];
  intervalSeconds: number;
  proxy?: Proxy;
}

export class DiscordRotatorWorker {
  private ws: WebSocket | null = null;
  private heartbeatInterval: number | null = null;
  private hbRef: any = null;
  private rotationRef: any = null;
  private sequence: number | null = null;
  private token: string;
  private onUpdate: (status: ConnectionStatus, log?: LogEntry, index?: number) => void;
  private isConnected: boolean = false;
  private config: RotatorConfig;
  private currentIndex: number = 0;
  
  private RELAY_URL = (import.meta as any).env?.VITE_RELAY_URL || (window as any).process?.env?.VITE_RELAY_URL || "";

  constructor(
    token: string, 
    onUpdate: (status: ConnectionStatus, log?: LogEntry, index?: number) => void, 
    config: RotatorConfig
  ) {
    this.token = token;
    this.onUpdate = onUpdate;
    this.config = config;
  }

  private log(message: string, type: LogEntry['type'] = 'INFO') {
    const proxyIp = this.config.proxy?.ip || this.config.proxy?.host;
    this.onUpdate(this.isConnected ? 'ONLINE' : 'CONNECTING', {
      timestamp: new Date(),
      message: this.config.proxy ? `[${proxyIp}] ${message}` : message,
      type
    });
  }

  public connect() {
    this.stopHeartbeat();
    this.stopRotation();
    this.isConnected = false;
    this.currentIndex = 0;
    
    const proxy = this.config.proxy;
    const discordGateway = 'wss://gateway.discord.gg/?v=10&encoding=json';
    const connectionUrl = (proxy && this.RELAY_URL) ? this.RELAY_URL : discordGateway;

    this.log(`[Rotator] Booting... ${proxy ? 'via Relay Node' : 'direct connection'}`, 'INFO');

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
          this.log('Relay handshake complete.', 'SUCCESS');
          return;
        }
        if (payload.type === 'RELAY_ERROR') {
          this.log(`Relay Failure: ${payload.error}`, 'ERROR');
          this.onUpdate('ERROR');
          return;
        }

        const { op, d, t, s } = payload;
        if (s !== undefined) this.sequence = s;

        switch (op) {
          case 10: // Hello
            this.heartbeatInterval = d.heartbeat_interval;
            this.startHeartbeat();
            this.identify();
            break;
          case 0: // Dispatch
            if (t === 'READY') {
              this.isConnected = true;
              this.log(`Authenticated: ${d.user.username}`, 'SUCCESS');
              this.onUpdate('ONLINE');
              this.updatePresence(this.config.statusList[0] || 'Active');
              setTimeout(() => this.startRotation(), 2000);
            }
            break;
          case 1: // Heartbeat Request
            this.sendHeartbeat();
            break;
        }
      };

      this.ws.onclose = (e) => {
        this.isConnected = false;
        this.stopRotation();
        this.stopHeartbeat();
        if (e.code !== 1000) this.reconnect();
        else this.onUpdate('OFFLINE');
      };

    } catch (e) {
      this.log(`Engine failure: ${e}`, 'ERROR');
      this.onUpdate('ERROR');
    }
  }

  private identify() {
    this.ws?.send(JSON.stringify({
      op: 2,
      d: {
        token: this.token,
        properties: { $os: "Windows", $browser: "Chrome", $device: "" },
        presence: {
          status: this.config.status,
          since: 0,
          activities: [{ type: 4, name: "Custom Status", state: this.config.statusList[0] || 'Active' }],
          afk: false
        }
      }
    }));
  }

  private startRotation() {
    this.stopRotation();
    if (!this.isConnected || this.config.statusList.length < 2) return;
    const intervalMs = Math.max(this.config.intervalSeconds, 15) * 1000;
    this.rotationRef = setInterval(() => this.advanceRotation(), intervalMs);
  }

  private advanceRotation() {
    if (!this.isConnected) return;
    const nextIndex = (this.currentIndex + 1) % this.config.statusList.length;
    this.updatePresence(this.config.statusList[nextIndex]);
    this.currentIndex = nextIndex;
    this.onUpdate('ONLINE', undefined, this.currentIndex);
  }

  private updatePresence(text: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        op: 3,
        d: {
          since: 0,
          activities: [{ type: 4, name: "Custom Status", state: text }],
          status: this.config.status,
          afk: false
        }
      }));
    }
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) {
      this.hbRef = setInterval(() => this.sendHeartbeat(), this.heartbeatInterval);
    }
  }

  private sendHeartbeat() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op: 1, d: this.sequence }));
    }
  }

  private stopHeartbeat() { if (this.hbRef) clearInterval(this.hbRef); }
  private stopRotation() { if (this.rotationRef) clearInterval(this.rotationRef); }

  private reconnect() {
    this.stopHeartbeat();
    this.stopRotation();
    setTimeout(() => this.connect(), 5000);
  }

  public disconnect() {
    this.stopRotation();
    this.stopHeartbeat();
    if (this.ws) { this.ws.onclose = null; this.ws.close(1000); }
    this.onUpdate('OFFLINE');
  }
}
