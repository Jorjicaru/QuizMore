import { Router, Request, Response } from 'express';
import { db } from '../db';
import { gameManager } from '../gameEngine';
import { authenticate, AuthRequest } from '../auth';

const router = Router();

// Public waiting rooms
router.get('/rooms', (_req: Request, res: Response): void => {
  const rooms = gameManager.getPublicRooms();
  res.json({ rooms });
});

// Leaderboard
router.get('/leaderboard', (req: Request, res: Response): void => {
  const { type = 'rating' } = req.query;
  const allUsers = db.getAllUsers().map(u => u.profile);

  let sorted = [...allUsers];
  if (type === 'wins') {
    sorted.sort((a, b) => b.wins - a.wins);
  } else if (type === 'territories') {
    sorted.sort((a, b) => b.territoriesConquered - a.territoriesConquered);
  } else if (type === 'score') {
    sorted.sort((a, b) => b.highestScore - a.highestScore);
  } else {
    // Default: rating
    sorted.sort((a, b) => b.rating - a.rating);
  }

  const leaderboard = sorted.slice(0, 50).map((u, index) => ({
    rank: index + 1,
    ...u,
  }));

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

export default router;
