import { Router, Response } from 'express';
import { db } from '../db';
import { gameManager } from '../gameEngine';
import { getConnectedUsersStats, emitToUser } from '../socketHandler';
import { authenticate, AuthRequest } from '../auth';

const router = Router();

function computeUserPresence(userId: string, onlineSet: Set<string>): {
  presenceStatus: 'online' | 'in_room' | 'offline';
  currentRoomId: string | null;
  currentRoomName: string | null;
  currentRoomPhase: string | null;
} {
  const activeRoom = gameManager.getRoomForUser(userId);
  if (activeRoom && activeRoom.phase !== 'finished') {
    const p = activeRoom.players.find((pl) => pl.id === userId);
    if (p && p.isConnected !== false) {
      return {
        presenceStatus: 'in_room',
        currentRoomId: activeRoom.roomId,
        currentRoomName: activeRoom.roomName,
        currentRoomPhase: activeRoom.phase,
      };
    }
  }
  if (onlineSet.has(userId)) {
    return {
      presenceStatus: 'online',
      currentRoomId: null,
      currentRoomName: null,
      currentRoomPhase: null,
    };
  }
  return {
    presenceStatus: 'offline',
    currentRoomId: null,
    currentRoomName: null,
    currentRoomPhase: null,
  };
}

// Ensure at least one test companion account exists for mobile/Preview verification
function ensureTestCompanionUsers(): void {
  const all = db.getAllUsers();
  const hasCompanion = all.some((u) => u.id === 'usr_demo_voievod');
  if (!hasCompanion) {
    const createdAt = new Date().toISOString();
    void db.createUser({
      id: 'usr_demo_voievod',
      username: 'Voievod_Mircea',
      email: 'mircea.voievod@conquiz.ro',
      passwordHash: '$2a$10$demoCompanionHashPlaceholderForTestingOnly000000000000',
      role: 'user',
      tokenVersion: 1,
      createdAt,
      profile: {
        id: 'usr_demo_voievod',
        username: 'Voievod_Mircea',
        email: 'mircea.voievod@conquiz.ro',
        role: 'user',
        avatar: 'av_stefan',
        title: 'Străjer al Cetății',
        rating: 1280,
        matchesPlayed: 14,
        wins: 9,
        losses: 5,
        territoriesConquered: 68,
        correctAnswersTotal: 112,
        highestScore: 5400,
        createdAt,
      },
    });
  }
}

// Get friends & friend requests with live presence status + suggested players for quick testing
router.get('/friends', authenticate, (req: AuthRequest, res: Response): void => {
  ensureTestCompanionUsers();
  const userId = req.userId!;
  const rawFriends = db.getFriends(userId);
  const { onlineUserIds } = getConnectedUsersStats();
  const onlineSet = new Set(onlineUserIds);

  const friends = rawFriends.map((item) => {
    const presence = computeUserPresence(item.friend.id, onlineSet);
    return {
      ...item,
      presenceStatus: presence.presenceStatus,
      currentRoomId: presence.currentRoomId,
      currentRoomName: presence.currentRoomName,
      currentRoomPhase: presence.currentRoomPhase,
    };
  });

  const existingFriendIds = new Set(rawFriends.map((f) => f.friend.id));
  existingFriendIds.add(userId);

  const suggestedPlayers = db
    .getAllUsers()
    .filter((u) => !existingFriendIds.has(u.id) && !u.isBanned)
    .slice(0, 12)
    .map((u) => {
      const presence = computeUserPresence(u.id, onlineSet);
      return {
        ...u.profile,
        presenceStatus: presence.presenceStatus,
        currentRoomId: presence.currentRoomId,
        currentRoomName: presence.currentRoomName,
        currentRoomPhase: presence.currentRoomPhase,
      };
    });

  res.json({ friends, suggestedPlayers });
});

// Quick-befriend a test/suggested account in one step (for mobile/Preview testing)
router.post(
  '/friends/quick-befriend',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      ensureTestCompanionUsers();
      const userId = req.userId!;
      const targetId = String(req.body?.recipientId || 'usr_demo_voievod');
      if (targetId === userId) {
        res.status(400).json({ error: 'Nu te poți adăuga pe tine însuți.' });
        return;
      }
      const existing = db.getFriends(userId).find((f) => f.friend.id === targetId);
      if (existing) {
        if (existing.status === 'pending') {
          await db.respondFriendRequest(existing.id, true);
        }
        res.json({ success: true, message: 'Prietenul este deja în lista ta!' });
        return;
      }
      const reqRec = await db.sendFriendRequest(userId, targetId);
      if (reqRec) {
        await db.respondFriendRequest(reqRec.id, true);
      }
      emitToUser(targetId, 'social_update', { type: 'friend_accepted', fromUserId: userId });
      res.json({ success: true, message: 'Prieten adăugat instant pentru testare!' });
    } catch (err) {
      console.error('[Social Quick Befriend Error]:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Eroare la împrietenirea rapidă.' });
    }
  }
);

// Search users to add as friend
router.get('/users/search', authenticate, (req: AuthRequest, res: Response): void => {
  const q = String(req.query.q || '').toLowerCase();
  const { onlineUserIds } = getConnectedUsersStats();
  const onlineSet = new Set(onlineUserIds);

  if (!q || q.length < 2) {
    res.json({ users: [] });
    return;
  }
  const users = db
    .getAllUsers()
    .filter((u) => u.id !== req.userId && u.username.toLowerCase().includes(q))
    .slice(0, 10)
    .map((u) => {
      const presence = computeUserPresence(u.id, onlineSet);
      return {
        ...u.profile,
        presenceStatus: presence.presenceStatus,
        currentRoomId: presence.currentRoomId,
        currentRoomName: presence.currentRoomName,
        currentRoomPhase: presence.currentRoomPhase,
      };
    });

  res.json({ users });
});

// Send friend request
router.post(
  '/friends/request',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { recipientId } = req.body;
      if (!recipientId) {
        res.status(400).json({ error: 'Lipsește identificatorul destinatarului.' });
        return;
      }

      const result = await db.sendFriendRequest(req.userId!, recipientId);
      if (!result) {
        res.status(400).json({ error: 'Cererea nu a putut fi trimisă (poate există deja).' });
        return;
      }

      emitToUser(recipientId, 'social_update', { type: 'friend_request', fromUserId: req.userId });
      res.json({ success: true, message: 'Cererea de prietenie a fost expediată!' });
    } catch (err) {
      console.error('[Social Friend Request Error]:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Eroare la salvarea cererii de prietenie în baza de date.' });
    }
  }
);

// Accept or decline friend request
router.post(
  '/friends/respond',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { requestId, accept } = req.body;
      const ok = await db.respondFriendRequest(requestId, !!accept);
      if (!ok) {
        res.status(404).json({ error: 'Cererea nu a fost găsită.' });
        return;
      }
      res.json({ success: true, message: accept ? 'Cerere acceptată!' : 'Cerere refuzată.' });
    } catch (err) {
      console.error('[Social Friend Respond Error]:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Eroare la actualizarea cererii de prietenie în baza de date.' });
    }
  }
);

// Invite or challenge a friend to a room
router.post(
  '/friends/invite',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const sender = db.findUserById(req.userId!);
      if (!sender) {
        res.status(401).json({ error: 'Utilizator neautentificat.' });
        return;
      }
      const { recipientId, roomId, mode = 'invite' } = req.body;
      if (!recipientId || !roomId) {
        res.status(400).json({ error: 'Lipsesc destinatarul sau codul camerei.' });
        return;
      }
      const cleanRoomId = String(roomId).trim().toUpperCase();
      const room = gameManager.getRoom(cleanRoomId);
      if (!room || room.phase === 'finished') {
        res.status(404).json({ error: 'Camera nu mai este activă.' });
        return;
      }

      const isChallenge = mode === 'challenge';
      const title = isChallenge
        ? `⚔️ Provocare 1v1 de la ${sender.username}`
        : `🏰 Invitație în cameră de la ${sender.username}`;
      const message = isChallenge
        ? `${sender.username} te-a provocat la un duel în camera „${room.roomName}” (Cod: ${cleanRoomId})!`
        : `${sender.username} te-a invitat în camera „${room.roomName}” (Cod: ${cleanRoomId})!`;

      const notif = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userId: String(recipientId),
        title,
        message,
        type: 'game_invite' as const,
        roomId: cleanRoomId,
        senderId: sender.id,
        senderUsername: sender.username,
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      await db.addNotification(notif);
      emitToUser(String(recipientId), 'game_invite_received', notif);
      emitToUser(String(recipientId), 'social_update', { type: 'game_invite', roomId: cleanRoomId });

      res.json({
        success: true,
        roomId: cleanRoomId,
        message: isChallenge
          ? `Provocarea a fost trimisă! Cod cameră: ${cleanRoomId}`
          : `Invitația în camera ${cleanRoomId} a fost trimisă!`,
      });
    } catch (err) {
      console.error('[Social Friend Invite Error]:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Eroare la trimiterea invitației.' });
    }
  }
);

// Get notifications
router.get('/notifications', authenticate, (req: AuthRequest, res: Response): void => {
  const notifications = db.getNotifications(req.userId!);
  res.json({ notifications });
});

// Mark notification read
router.post(
  '/notifications/:id/read',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const ok = await db.markNotificationAsRead(req.params.id, req.userId!);
      res.json({ success: ok });
    } catch (err) {
      console.error('[Social Notification Read Error]:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Eroare la actualizarea notificării în baza de date.' });
    }
  }
);

export default router;
