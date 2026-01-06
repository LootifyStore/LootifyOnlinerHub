
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
  private lastUpdate: number = 0;
  private lastHeartbeatAck: boolean = true;

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
    this.onUpdate(this.isConnected ? 'ONLINE' : 'CONNECTING', {
      timestamp: new Date(),
      message,
      type
    });
  }

  public connect() {
    this.stopHeartbeat();
    this.stopRotation();
    this.isConnected = false;
    this.lastHeartbeatAck = true;
    this.currentIndex = 0;
    
    const proxy = this.config.proxy;
    const proxyMsg = proxy ? ` via Proxy [${proxy.alias}]` : '';
    this.log(`[System] Initializing Lootify Engine${proxyMsg}...`, 'INFO');
    
    if (proxy) {
      this.log(`[Proxy Info] Node: ${proxy.host}:${proxy.port}`, 'DEBUG');
      if (proxy.ip) {
        this.log(`[Network] Routed IP: ${proxy.ip} | Country: ${proxy.country || 'N/A'}`, 'SUCCESS');
      }
    }

    try {
      this.ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');

      this.ws.onopen = () => {
        this.log('WebSocket link established.', 'SUCCESS');
      };

      this.ws.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        const { op, d, t, s } = payload;
        if (s !== undefined && s !== null) this.sequence = s;

        switch (op) {
          case 10: // Hello
            this.heartbeatInterval = d.heartbeat_interval;
            this.startHeartbeat();
            this.identify();
            break;
          
          case 11: // Heartbeat ACK
            this.lastHeartbeatAck = true;
            break;

          case 7: // Reconnect
            this.log('Gateway session refresh required.', 'DEBUG');
            this.reconnect();
            break;

          case 9: // Invalid Session
            this.log('Session integrity failed.', 'ERROR');
            this.reconnect();
            break;

          case 0: // Dispatch
            if (t === 'READY') {
              this.isConnected = true;
              this.log(`Authorized: ${d.user.username}`, 'SUCCESS');
              this.onUpdate('ONLINE');
              
              // Immediate sync for status 1
              this.log('[Engine] Step 1: Setting initial account presence...', 'INFO');
              this.updatePresence(this.config.statusList[0] || 'Lootify Onliner Active');
              
              this.log(`[Engine] Delaying rotation for ${this.config.intervalSeconds}s...`, 'DEBUG');
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
        
        if (e.code === 4004) {
          this.log('Access Denied: Token is invalid.', 'ERROR');
          this.onUpdate('ERROR');
        } else if (e.code === 4008) {
          this.log('Rate Limit: Excessive updates. Pausing engine...', 'ERROR');
          this.onUpdate('ERROR');
          setTimeout(() => this.reconnect(), 15000);
        } else if (e.code !== 1000) {
          this.log(`Tunnel Dropped (${e.code}). Attempting recovery...`, 'ERROR');
          this.reconnect();
        } else {
          this.onUpdate('OFFLINE');
        }
      };

      this.ws.onerror = () => this.log('Stream encountered a network error.', 'ERROR');

    } catch (e) {
      this.log(`Fatal start error: ${e}`, 'ERROR');
      this.onUpdate('ERROR');
    }
  }

  private identify() {
    this.log('Broadcasting identity to Gateway...', 'INFO');
    
    // Using First Status in Identify payload to force visibility
    const firstStatus = this.config.statusList[0] || 'Lootify Onliner';

    this.ws?.send(JSON.stringify({
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
          since: 0,
          activities: [{
            type: 4,
            name: "Custom Status",
            state: firstStatus,
            emoji: null
          }],
          afk: false
        }
      }
    }));
  }

  private startRotation() {
    this.stopRotation();
    if (!this.isConnected || this.config.statusList.length < 2) return;

    const intervalMs = Math.max(this.config.intervalSeconds, 15) * 1000;
    this.log(`[Engine] Rotation loop started (Freq: ${intervalMs/1000}s).`, 'SUCCESS');

    this.rotationRef = setInterval(() => {
      this.advanceRotation();
    }, intervalMs);
  }

  private advanceRotation() {
    if (!this.isConnected || this.ws?.readyState !== WebSocket.OPEN) return;
    
    const now = Date.now();
    // Safety guard for Discord Gateway rate limits
    if (now - this.lastUpdate < 12000) return;

    const nextIndex = (this.currentIndex + 1) % this.config.statusList.length;
    const nextText = this.config.statusList[nextIndex];

    this.log(`[Engine] Transition: Status #${this.currentIndex + 1} -> Status #${nextIndex + 1}`, 'INFO');
    this.log(`[Engine] Status set for #${nextIndex + 1}: "${nextText}"`, 'DEBUG');
    
    this.updatePresence(nextText);
    this.currentIndex = nextIndex;
    this.onUpdate('ONLINE', undefined, this.currentIndex);
    this.lastUpdate = now;
    
    this.log(`[Engine] Delay of ${this.config.intervalSeconds}s until next rotation...`, 'DEBUG');
  }

  private updatePresence(text: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const payload = {
        op: 3,
        d: {
          since: 0,
          activities: [{ 
            type: 4, 
            name: "Custom Status", 
            state: text, 
            emoji: null
          }],
          status: this.config.status,
          afk: false
        }
      };
      
      this.ws.send(JSON.stringify(payload));
    }
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) {
      this.sendHeartbeat();
      this.hbRef = setInterval(() => {
        if (!this.lastHeartbeatAck) {
          this.log('Heartbeat missed. Re-establishing link...', 'ERROR');
          this.reconnect();
          return;
        }
        this.lastHeartbeatAck = false;
        this.sendHeartbeat();
      }, this.heartbeatInterval);
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
    this.ws?.close();
    setTimeout(() => this.connect(), 5000);
  }

  public disconnect() {
    this.stopRotation();
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close(1000);
    }
    this.onUpdate('OFFLINE');
  }
}
