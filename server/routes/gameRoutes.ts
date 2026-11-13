import { Router, Request, Response } from 'express';
import { db } from '../db';
import { gameManager } from '../gameEngine';
import { authenticate, AuthRequest } from '../auth';
import { computeLeaderboardWithManualOverrides } from '../../src/game/rules';

const router = Router();

// Public waiting rooms
router.get('/rooms', (_req: Request, res: Response): void => {
  const rooms = gameManager.getPublicRooms();
  res.json({ rooms });
});

// Leaderboard
router.get('/leaderboard', (req: Request, res: Response): void => {
  const rawType = String(req.query.type || 'rating');
  const sortType: 'rating' | 'wins' | 'territories' | 'score' =
    rawType === 'wins' || rawType === 'territories' || rawType === 'score'
      ? rawType
      : 'rating';

  const allUsers = db.getAllUsers().map((u) => u.profile);
  const ranked = computeLeaderboardWithManualOverrides(allUsers, sortType);
  const leaderboard = ranked.slice(0, 50);

  res.json({ leaderboard });
});

// Recent games history
router.get('/history', (_req: Request, res: Response): void => {
  const history = db.getGamesHistory(25);
  res.json({ history });
});

// Current user game history
router.get('/my-history', authenticate, (req: AuthRequest, res: Response): void => {
  const history = db.getUserGameHistory(req.userId!);
  res.json({ history });
});

// Active room for the authenticated user (for reconnect / return)
router.get('/my-active-room', authenticate, (req: AuthRequest, res: Response): void => {
  const room = gameManager.getRoomForUser(req.userId!);
  if (!room || room.phase === 'finished') {
    res.json({ activeRoom: null, room: null });
    return;
  }
  const player = room.players.find((p) => p.id === req.userId);
  if (!player) {
    res.json({ activeRoom: null, room: null });
    return;
  }
  res.json({
    activeRoom: {
      roomId: room.roomId,
      roomName: room.roomName,
      phase: room.phase,
      isConnected: player.isConnected !== false,
      botControlled: Boolean(player.botControlled),
    },
    room,
  });
});

export default router;
