import { io, Socket } from 'socket.io-client';

const TOKEN_KEY = 'conquiz_token';

class SocketService {
  private socket: Socket | null = null;

  public connect(): Socket {
    if (!this.socket) {
      this.socket = io({
        transports: ['websocket', 'polling'],
        autoConnect: true,
        auth: (callback) => callback({ token: localStorage.getItem(TOKEN_KEY) }),
      });

      this.socket.on('connect', () => {
        console.log('Conectat la serverul CONQUIZ multiplayer');
      });
      this.socket.on('disconnect', () => {
        console.log('Deconectat de la server');
      });
    }
    return this.socket;
  }

  public getSocket(): Socket {
    return this.socket || this.connect();
  }

  /** Re-authenticate the socket after login, registration or guest sign-in. */
  public reconnectWithCurrentToken(): Socket {
    if (!this.socket) return this.connect();
    this.socket.auth = (callback: (data: { token: string | null }) => void) => callback({ token: localStorage.getItem(TOKEN_KEY) });
    this.socket.disconnect();
    this.socket.connect();
    return this.socket;
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
