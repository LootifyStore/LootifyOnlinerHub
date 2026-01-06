
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
    const proxyMsg = proxy ? ` via Proxy [${proxy.alias}]` : '';
    
    this.onUpdate('CONNECTING', { 
      timestamp: new Date(), 
      message: `Initiating Gateway v10 Tunnel${proxyMsg}...`, 
      type: 'INFO' 
    });
    
    if (proxy) {
      this.log(`Proxy Node: ${proxy.host}:${proxy.port} (${proxy.type})`, 'DEBUG');
      if (proxy.ip) {
        this.log(`[Network] Outbound IP: ${proxy.ip} | Node Location: ${proxy.country || 'Global'}`, 'SUCCESS');
      }
    }

    try {
      this.ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');

      this.ws.onopen = () => {
        this.log('Tunnel synchronized.', 'SUCCESS');
      };

      this.ws.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        const { op, d, t, s } = payload;

        if (s) this.sequence = s;

        switch (op) {
          case 10: // Hello
            this.heartbeatInterval = d.heartbeat_interval;
            this.startHeartbeat();
            this.identify();
            break;
          
          case 11: // Heartbeat ACK
            break;

          case 0: // Dispatch
            if (t === 'READY') {
              this.isConnected = true;
              this.log(`Session Authorized: ${d.user.username}`, 'SUCCESS');
              this.onUpdate('ONLINE');
            }
            break;

          case 1: // Heartbeat Request
            this.sendHeartbeat();
            break;

          case 9: // Invalid Session
            this.log('Session discarded by Gateway.', 'ERROR');
            this.reconnect();
            break;
        }
      };

      this.ws.onerror = () => {
        this.log(`Network stream failure.`, 'ERROR');
        this.onUpdate('ERROR');
      };

      this.ws.onclose = (event) => {
        this.isConnected = false;
        this.stopHeartbeat();

        if (event.code === 4004) {
          this.log('Auth Failure: Check Token.', 'ERROR');
          this.onUpdate('ERROR');
        } else if (event.code === 1000) {
          this.onUpdate('OFFLINE');
        } else {
          this.log(`Stream dropped (Code ${event.code}). Retrying...`, 'ERROR');
          this.reconnect();
        }
      };

    } catch (error) {
      this.log(`Critical Error: ${error}`, 'ERROR');
      this.onUpdate('ERROR');
    }
  }

  private identify() {
    const activities: any[] = [];

    if (this.config.customStatusText) {
      activities.push({
        type: 4,
        name: "Custom Status",
        state: this.config.customStatusText,
        emoji: null
      });
    }

    if (this.config.activityName) {
      activities.push({
        type: this.config.activityType,
        name: this.config.activityName,
        details: "Managing via Lootify",
        application_id: null
      });
    }

    this.log(`Setting account presence to ${this.config.status}...`, 'INFO');

    const payload = {
      op: 2,
      d: {
        token: this.token,
        properties: {
          $os: "Windows",
          $browser: "Chrome",
          $device: ""
        },
        presence: {
          status: this.config.status,
          afk: false,
          activities: activities,
          since: 0
        }
      }
    };
    this.ws?.send(JSON.stringify(payload));
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) {
      this.intervalRef = setInterval(() => {
        this.sendHeartbeat();
      }, this.heartbeatInterval);
    }
  }

  private sendHeartbeat() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op: 1, d: this.sequence }));
    }
  }

  private stopHeartbeat() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
  }

  private reconnect() {
    this.stopHeartbeat();
    this.ws?.close();
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
