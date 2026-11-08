import { Router, Response } from 'express';
import { db } from '../db';
import { authenticate, requireAdmin, AuthRequest } from '../auth';
import { gameManager } from '../gameEngine';

const router = Router();

// Get users list
router.get('/users', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const search = String(req.query.search || '').toLowerCase();
  let users = db.getAllUsers().map(u => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    isBanned: !!u.isBanned,
    createdAt: u.createdAt,
    rating: u.profile.rating,
    matchesPlayed: u.profile.matchesPlayed,
    wins: u.profile.wins,
  }));

  if (search) {
    users = users.filter(u =>
      u.username.toLowerCase().includes(search) ||
      u.email.toLowerCase().includes(search)
    );
  }

  res.json({ users });
});

// Ban/unban user
router.post('/users/:id/ban', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const { id } = req.params;
  if (id === req.userId) {
    res.status(400).json({ error: 'Nu vă puteți suspenda propriul cont de administrator.' });
    return;
  }
  const isBanned = db.toggleUserBan(id);
  res.json({ success: true, isBanned, message: isBanned ? 'Utilizatorul a fost suspendat.' : 'Utilizatorul a fost reactivat.' });
});

// Change role
router.post('/users/:id/role', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const { id } = req.params;
  const { role } = req.body;
  if (role !== 'user' && role !== 'admin') {
    res.status(400).json({ error: 'Rol invalid.' });
    return;
  }
  db.setUserRole(id, role);
  res.json({ success: true, message: `Rolul a fost schimbat în ${role}.` });
});

// Admin stats
router.get('/stats', authenticate, requireAdmin, (_req: AuthRequest, res: Response): void => {
  const allUsers = db.getAllUsers();
  const allQuestions = db.getAllQuestions();
  const gamesHistory = db.getGamesHistory(100);
  const activeRooms = gameManager.getPublicRooms();

  const totalUsers = allUsers.length;
  const bannedUsers = allUsers.filter(u => u.isBanned).length;
  const totalGames = gamesHistory.length;
  const totalQuestions = allQuestions.length;

  res.json({
    totalUsers,
    bannedUsers,
    totalGames,
    totalQuestions,
    activeRoomsCount: activeRooms.length,
  });
});

export default router;
