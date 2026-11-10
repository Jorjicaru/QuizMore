import { io, Socket } from 'socket.io-client';
import {
  ClockOffsetSample,
  computeClockOffsetSample,
  estimateServerNow,
  selectBestClockOffset,
} from '../game/rules';

const TOKEN_KEY = 'conquiz_token';

class SocketService {
  private socket: Socket | null = null;
  private serverClockOffsetMs = 0;
  private lastRttMs = 0;
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;

  public connect(): Socket {
    const hasToken =
      typeof localStorage !== 'undefined' && Boolean(localStorage.getItem(TOKEN_KEY));
    if (!this.socket) {
      this.socket = io({
        transports: ['websocket', 'polling'],
        autoConnect: hasToken,
        auth: (callback) => callback({ token: localStorage.getItem(TOKEN_KEY) }),
      });

      this.socket.on('connect', () => {
        console.log('Conectat la serverul CONQUIZ multiplayer');
        void this.syncServerClock(3);
        if (this.syncIntervalId) clearInterval(this.syncIntervalId);
        this.syncIntervalId = setInterval(() => {
          if (this.socket?.connected) {
            void this.syncServerClock(2);
          }
        }, 30000);
      });

      this.socket.on('disconnect', () => {
        console.log('Deconectat de la server');
      });
    } else if (hasToken && !this.socket.connected) {
      this.socket.connect();
    }
    return this.socket;
  }

  public getSocket(): Socket {
    return this.socket || this.connect();
  }

  private pingServerClockOnce(): Promise<ClockOffsetSample | null> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        resolve(null);
        return;
      }
      const clientSentAtPerfMs =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      const requestId = `ts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      this.socket
        .timeout(2500)
        .emit(
          'time_sync_request',
          { requestId, clientSentAt: clientSentAtPerfMs },
          (err: any, response: { serverNowMs?: number } | undefined) => {
            if (err || !response || typeof response.serverNowMs !== 'number') {
              resolve(null);
              return;
            }
            const clientReceivedAtPerfMs =
              typeof performance !== 'undefined' ? performance.now() : Date.now();
            const clientReceivedWallClockMs = Date.now();
            const sample = computeClockOffsetSample({
              clientSentAtPerfMs,
              clientReceivedAtPerfMs,
              clientReceivedWallClockMs,
              serverNowMs: response.serverNowMs,
            });
            resolve(sample);
          }
        );
    });
  }

  public async syncServerClock(sampleCount = 3): Promise<ClockOffsetSample> {
    const samples: ClockOffsetSample[] = [];
    for (let i = 0; i < sampleCount; i++) {
      const sample = await this.pingServerClockOnce();
      if (sample) samples.push(sample);
    }
    if (samples.length > 0) {
      const best = selectBestClockOffset(samples);
      this.serverClockOffsetMs = best.offsetMs;
      this.lastRttMs = best.rttMs;
      return best;
    }
    return { offsetMs: this.serverClockOffsetMs, rttMs: this.lastRttMs };
  }

  public getEstimatedServerNow(): number {
    return estimateServerNow(Date.now(), this.serverClockOffsetMs);
  }

  public getServerClockOffsetMs(): number {
    return this.serverClockOffsetMs;
  }

  public getLastRttMs(): number {
    return this.lastRttMs;
  }

  /** Re-authenticate the socket after login, registration or guest sign-in. */
  public reconnectWithCurrentToken(): Socket {
    if (!this.socket) return this.connect();
    this.socket.auth = (callback: (data: { token: string | null }) => void) =>
      callback({ token: localStorage.getItem(TOKEN_KEY) });
    this.socket.disconnect();
    this.socket.connect();
    return this.socket;
  }

  public disconnect(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
