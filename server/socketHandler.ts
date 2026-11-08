import { Server as SocketIOServer, Socket } from 'socket.io';
import { GameManager } from './gameEngine';
import { verifyAuthToken } from './auth';

export function setupSocketHandlers(io: SocketIOServer, gameManager: GameManager): void {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) return next(new Error('Autentificare necesară pentru conexiunea multiplayer.'));
    const identity = verifyAuthToken(token);
    if (!identity) return next(new Error('Sesiune invalidă sau expirată. Autentifică-te din nou.'));
    socket.data.identity = identity;
    next();
  });

  gameManager.setIoCallback((roomId, event, data) => {
    io.to(`room_${roomId}`).emit(event, data);
  });

  io.on('connection', (socket: Socket) => {
    const identity = socket.data.identity as { userId: string; role: 'user' | 'admin'; username: string; avatar: string };
    let currentRoomId: string | null = null;
    const currentUserId = identity.userId;
    const user = { id: identity.userId, username: identity.username, avatar: identity.avatar };

    socket.on('create_room', (data = {}, callback) => {
      try {
        if (currentRoomId) return callback?.({ success: false, message: 'Ești deja într-o cameră.' });
        const game = gameManager.createRoom({
          hostUser: user,
          roomName: data.roomName,
          isPrivate: data.isPrivate,
          maxPlayers: data.maxPlayers || 4,
          initialBotsCount: data.initialBotsCount || 0,
          botDifficulty: data.botDifficulty || 'intermediar',
          selectedCategories: Array.isArray(data.selectedCategories) ? data.selectedCategories : [],
        });
        currentRoomId = game.roomId;
        socket.join(`room_${game.roomId}`);
        callback?.({ success: true, game: gameManager.getClientState(game.roomId) });
      } catch (err: any) {
        callback?.({ success: false, message: err?.message || 'Nu s-a putut crea camera.' });
      }
    });

    socket.on('join_room', (data = {}, callback) => {
      if (currentRoomId) return callback?.({ success: false, message: 'Ești deja într-o cameră.' });
      const roomId = String(data.roomId || '').trim().toUpperCase();
      const result = gameManager.joinRoom(roomId, user);
      if (result.success && result.game) {
        currentRoomId = roomId;
        socket.join(`room_${roomId}`);
        io.to(`room_${roomId}`).emit('game_state_update', gameManager.getClientState(roomId));
        callback?.({ success: true, game: gameManager.getClientState(roomId) });
      } else {
        callback?.({ success: false, message: result.message });
      }
    });

    socket.on('leave_room', () => {
      if (currentRoomId) {
        const roomId = currentRoomId;
        socket.leave(`room_${roomId}`);
        gameManager.leaveRoom(roomId, currentUserId);
        currentRoomId = null;
      }
    });

    socket.on('set_ready', (data = {}) => {
      if (currentRoomId) gameManager.setReady(currentRoomId, currentUserId, !!data.isReady);
    });
    socket.on('add_bot', (data = {}) => {
      if (currentRoomId) gameManager.addBot(currentRoomId, currentUserId, data.difficulty || 'intermediar');
    });
    socket.on('remove_bot', (data = {}) => {
      if (currentRoomId && data.botId) gameManager.removeBot(currentRoomId, currentUserId, data.botId);
    });
    socket.on('start_game', (_data, callback) => {
      if (currentRoomId) callback?.(gameManager.startGame(currentRoomId, currentUserId));
    });
    socket.on('select_territory', (data = {}, callback) => {
      if (currentRoomId && data.territoryId) callback?.(gameManager.selectTerritory(currentRoomId, currentUserId, data.territoryId));
    });
    socket.on('submit_answer', (data = {}, callback) => {
      if (currentRoomId && data.answer !== undefined) callback?.(gameManager.submitAnswer(currentRoomId, currentUserId, data.answer));
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
      if (currentRoomId) gameManager.leaveRoom(currentRoomId, currentUserId);
    });
  });
}
