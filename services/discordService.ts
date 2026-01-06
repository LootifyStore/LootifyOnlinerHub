
import { ConnectionStatus, LogEntry, PresenceStatus, Proxy } from '../types.ts';

export interface WorkerConfig {
  status: PresenceStatus;
  customStatusText: string;
  activityName: string;
  activityType: number;
  proxy?: Proxy;
}

export class DiscordWorker {
  private ws: WebSocket | null = null;
  private heartbeatInterval: number | null = null;
  private intervalRef: any = null;
  private sequence: number | null = null;
  private token: string;
  private onUpdate: (status: ConnectionStatus, log?: LogEntry) => void;
  private isConnected: boolean = false;
  
  // Reads the relay URL from Vercel/Vite environment variables
  private RELAY_URL = (import.meta as any).env?.VITE_RELAY_URL || (window as any).process?.env?.VITE_RELAY_URL || "";

  private config: WorkerConfig = {
    status: 'online',
    customStatusText: '',
    activityName: '',
    activityType: 0
  };

  constructor(
    token: string, 
    onUpdate: (status: ConnectionStatus, log?: LogEntry) => void, 
    config?: WorkerConfig
  ) {
    this.token = token;
    this.onUpdate = onUpdate;
    if (config) {
      this.config = config;
    }
  }

  private log(message: string, type: LogEntry['type'] = 'INFO') {
    this.onUpdate(this.isConnected ? 'ONLINE' : 'CONNECTING', {
      timestamp: new Date(),
      message,
      type
    });
  }

  public connect() {
    this.isConnected = false;
    const proxy = this.config.proxy;
    
    const discordGateway = 'wss://gateway.discord.gg/?v=10&encoding=json';
    
    // Use Relay URL if proxy is present, otherwise direct
    const connectionUrl = (proxy && this.RELAY_URL) ? this.RELAY_URL : discordGateway;

    if (proxy && !this.RELAY_URL) {
      this.log('Relay configuration missing. Proxies will not function.', 'ERROR');
    }

    this.onUpdate('CONNECTING', { 
      timestamp: new Date(), 
      message: proxy ? `Routing via Relay [${proxy.alias}]...` : `Establishing Direct Discord Link...`, 
      type: 'INFO' 
    });

    try {
      this.ws = new WebSocket(connectionUrl);

      this.ws.onopen = () => {
        if (proxy && this.RELAY_URL) {
          this.log('Relay Handshake: Syncing proxy credentials...', 'DEBUG');
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
          this.log('Relay Node Active. Authenticating with Discord...', 'SUCCESS');
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
          case 10: // Hello
            this.heartbeatInterval = d.heartbeat_interval;
            this.startHeartbeat();
            this.identify();
            break;
          case 0: // Dispatch
            if (t === 'READY') {
              this.isConnected = true;
              this.log(`Authorized as ${d.user.username}`, 'SUCCESS');
              this.onUpdate('ONLINE');
            }
            break;
          case 1: // Heartbeat Request
            this.sendHeartbeat();
            break;
        }
      };

      this.ws.onerror = () => {
        this.log(`Network failure. Verify Relay/Proxy status.`, 'ERROR');
        this.onUpdate('ERROR');
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
    if (this.config.customStatusText) {
      activities.push({
        type: 4,
        name: "Custom Status",
        state: this.config.customStatusText
      });
    }
    if (this.config.activityName) {
      activities.push({
        type: this.config.activityType,
        name: this.config.activityName,
        details: "Lootify Hub"
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

  private stopHeartbeat() {
    if (this.intervalRef) clearInterval(this.intervalRef);
  }

  private reconnect() {
    this.stopHeartbeat();
    setTimeout(() => this.connect(), 5000);
  }

  public disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close(1000);
    }
    this.onUpdate('OFFLINE');
  }
}
