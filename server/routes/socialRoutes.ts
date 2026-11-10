import { Router, Response } from 'express';
import { db } from '../db';
import { authenticate, AuthRequest } from '../auth';

const router = Router();

// Get friends & friend requests
router.get('/friends', authenticate, (req: AuthRequest, res: Response): void => {
  const friends = db.getFriends(req.userId!);
  res.json({ friends });
});

// Search users to add as friend
router.get('/users/search', authenticate, (req: AuthRequest, res: Response): void => {
  const q = String(req.query.q || '').toLowerCase();
  if (!q || q.length < 2) {
    res.json({ users: [] });
    return;
  }
  const users = db
    .getAllUsers()
    .filter((u) => u.id !== req.userId && u.username.toLowerCase().includes(q))
    .slice(0, 10)
    .map((u) => u.profile);

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
