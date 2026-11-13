import { Server as SocketIOServer, Socket } from 'socket.io';
import { GameManager } from './gameEngine';
import { verifyAuthToken } from './auth';
import { isMaintenanceModeEnabled, getMaintenanceMessage } from './maintenance';

const connectedSocketsByUser = new Map<string, Set<string>>();
let activeIoInstance: SocketIOServer | null = null;

export function emitToUser(userId: string, event: string, payload: any): void {
  if (!activeIoInstance) return;
  const sockets = connectedSocketsByUser.get(userId);
  if (!sockets) return;
  for (const socketId of sockets) {
    activeIoInstance.to(socketId).emit(event, payload);
  }
}

export function getConnectedUsersStats(): {
  onlineUsersCount: number;
  activeSocketConnections: number;
  onlineUserIds: string[];
} {
  let activeSocketConnections = 0;
  const onlineUserIds: string[] = [];
  for (const [userId, sockets] of connectedSocketsByUser.entries()) {
    if (sockets.size > 0) {
      onlineUserIds.push(userId);
      activeSocketConnections += sockets.size;
    }
  }
  return {
    onlineUsersCount: onlineUserIds.length,
    activeSocketConnections,
    onlineUserIds,
  };
}

export function setupSocketHandlers(io: SocketIOServer, gameManager: GameManager): void {
  activeIoInstance = io;

  const broadcastPublicRooms = () => {
    io.emit('public_rooms_updated', { rooms: gameManager.getPublicRooms() });
  };

  io.use((socket, next) => {
    if (isMaintenanceModeEnabled()) {
      return next(new Error(getMaintenanceMessage()));
    }
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token)
      return next(new Error('Autentificare necesară pentru conexiunea multiplayer.'));
    const identity = verifyAuthToken(token);
    if (!identity)
      return next(new Error('Sesiune invalidă sau expirată. Autentifică-te din nou.'));
    socket.data.identity = identity;
    next();
  });

  gameManager.setIoCallback((roomId, event, data) => {
    io.to(`room_${roomId}`).emit(event, data);
  });

  io.on('connection', (socket: Socket) => {
    const identity = socket.data.identity as {
      userId: string;
      role: 'user' | 'admin';
      username: string;
      avatar: string;
    };
    let currentRoomId: string | null = null;
    const currentUserId = identity.userId;
    const user = { id: identity.userId, username: identity.username, avatar: identity.avatar };

    const userSet = connectedSocketsByUser.get(currentUserId) || new Set<string>();
    userSet.add(socket.id);
    connectedSocketsByUser.set(currentUserId, userSet);

    socket.on('create_room', (data = {}, callback) => {
      try {
        if (currentRoomId) {
          socket.leave(`room_${currentRoomId}`);
          gameManager.leaveRoom(currentRoomId, currentUserId);
          currentRoomId = null;
        }
        const game = gameManager.createRoom({
          hostUser: user,
          roomName: data.roomName,
          isPrivate: data.isPrivate,
          maxPlayers: data.maxPlayers || 4,
          initialBotsCount: data.initialBotsCount || 0,
          botDifficulty: data.botDifficulty || 'intermediar',
          selectedCategories: Array.isArray(data.selectedCategories)
            ? data.selectedCategories
            : [],
        });
        currentRoomId = game.roomId;
        socket.join(`room_${game.roomId}`);
        broadcastPublicRooms();
        callback?.({
          success: true,
          isSpectator: false,
          game: gameManager.getClientState(game.roomId),
        });
      } catch (err: any) {
        callback?.({ success: false, message: err?.message || 'Nu s-a putut crea camera.' });
      }
    });

    const handleJoinOrReconnect = (data: any = {}, callback?: (res: any) => void) => {
      const roomId = String(data.roomId || '')
        .trim()
        .toUpperCase();
      if (!roomId) {
        return callback?.({ success: false, message: 'Codul camerei lipsește.' });
      }
      if (currentRoomId && currentRoomId !== roomId) {
        socket.leave(`room_${currentRoomId}`);
        gameManager.leaveRoom(currentRoomId, currentUserId);
        currentRoomId = null;
      }
      const result = gameManager.joinRoom(roomId, user);
      if (result.success && result.game) {
        currentRoomId = roomId;
        socket.join(`room_${roomId}`);
        io.to(`room_${roomId}`).emit('game_state_update', gameManager.getClientState(roomId));
        broadcastPublicRooms();
        callback?.({
          success: true,
          isSpectator: Boolean(result.isSpectator),
          message: result.message,
          game: gameManager.getClientState(roomId),
        });
      } else {
        callback?.({ success: false, message: result.message });
      }
    };

    socket.on('join_room', handleJoinOrReconnect);
    socket.on('reconnect_room', handleJoinOrReconnect);

    socket.on('leave_room', () => {
      if (currentRoomId) {
        const roomId = currentRoomId;
        socket.leave(`room_${roomId}`);
        gameManager.leaveRoom(roomId, currentUserId);
        currentRoomId = null;
        broadcastPublicRooms();
      }
    });

    socket.on('set_ready', (data = {}) => {
      if (currentRoomId) gameManager.setReady(currentRoomId, currentUserId, !!data.isReady);
    });
    socket.on('add_bot', (data = {}) => {
      if (currentRoomId) {
        gameManager.addBot(currentRoomId, currentUserId, data.difficulty || 'intermediar');
        broadcastPublicRooms();
      }
    });
    socket.on('remove_bot', (data = {}) => {
      if (currentRoomId && data.botId) {
        gameManager.removeBot(currentRoomId, currentUserId, data.botId);
        broadcastPublicRooms();
      }
    });
    socket.on('time_sync_request', (data = {}, callback) => {
      const payload = {
        requestId: data.requestId,
        clientSentAt: data.clientSentAt,
        serverNowMs: Date.now(),
      };
      if (typeof callback === 'function') callback(payload);
      socket.emit('time_sync_response', payload);
    });

    socket.on('start_game', (_data, callback) => {
      if (currentRoomId) {
        const res = gameManager.startGame(currentRoomId, currentUserId);
        broadcastPublicRooms();
        callback?.(res);
      }
    });
    socket.on('select_territory', (data = {}, callback) => {
      if (currentRoomId && data.territoryId)
        callback?.(gameManager.selectTerritory(currentRoomId, currentUserId, data.territoryId));
    });
    socket.on('regenerate_tower', (_data = {}, callback) => {
      if (currentRoomId) {
        callback?.(gameManager.regenerateTower(currentRoomId, currentUserId));
      } else {
        callback?.({ success: false, message: 'Nu ești într-o cameră activă.' });
      }
    });
    socket.on('submit_answer', (data = {}, callback) => {
      if (currentRoomId && data.answer !== undefined) {
        callback?.(
          gameManager.submitAnswer(
            currentRoomId,
            currentUserId,
            data.answer,
            data.questionInstanceId
          )
        );
      } else {
        callback?.({
          success: false,
          code: 'INVALID_ANSWER',
          message: 'Nu ești într-o cameră activă sau răspunsul lipsește.',
        });
      }
    });
    socket.on('send_chat', (data = {}) => {
      if (!currentRoomId || typeof data.text !== 'string') return;
      const text = data.text.trim().slice(0, 500);
      if (!text) return;
      io.to(`room_${currentRoomId}`).emit('chat_message', {
        id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        userId: currentUserId,
        username: identity.username,
        avatar: identity.avatar,
        text,
        timestamp: Date.now(),
      });
    });

    socket.on('disconnect', () => {
      const set = connectedSocketsByUser.get(currentUserId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) {
          connectedSocketsByUser.delete(currentUserId);
        }
      }
      if (currentRoomId) {
        gameManager.handleSocketDisconnect(currentRoomId, currentUserId);
        broadcastPublicRooms();
      }
    });
  });
}
