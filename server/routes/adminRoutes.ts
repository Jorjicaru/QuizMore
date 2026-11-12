import { Router, Response } from 'express';
import { db } from '../db';
import { authenticate, requireAdmin, AuthRequest } from '../auth';
import { gameManager } from '../gameEngine';
import { getConnectedUsersStats } from '../socketHandler';
import { isEmailDeliveryConfigured } from '../emailService';
import { isMaintenanceModeEnabled, getRecentServerErrors } from '../maintenance';

const router = Router();

function getAdminActor(req: AuthRequest): { id: string; username: string } {
  const adminId = req.userId || 'admin';
  const adminUser = db.findUserById(adminId);
  return {
    id: adminId,
    username: adminUser?.username || 'admin',
  };
}

// Get users list
router.get('/users', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const search = String(req.query.search || '').toLowerCase();
  let users = db.getAllUsers().map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    isBanned: !!u.isBanned,
    createdAt: u.createdAt,
    rating: u.profile.rating ?? 1200,
    matchesPlayed: u.profile.matchesPlayed ?? 0,
    wins: u.profile.wins ?? 0,
    losses: u.profile.losses ?? 0,
    highestScore: u.profile.highestScore ?? 0,
    territoriesConquered: u.profile.territoriesConquered ?? 0,
    correctAnswersTotal: u.profile.correctAnswersTotal ?? 0,
    title: u.profile.title || 'Răzeș',
  }));

  if (search) {
    users = users.filter(
      (u) => u.username.toLowerCase().includes(search) || u.email.toLowerCase().includes(search)
    );
  }

  res.json({ users });
});

// Ban/unban user (audited)
router.post(
  '/users/:id/ban',
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      if (id === req.userId) {
        res.status(400).json({ error: 'Nu vă puteți suspenda propriul cont de administrator.' });
        return;
      }
      const targetUser = db.findUserById(id);
      if (!targetUser) {
        res.status(404).json({ error: 'Utilizatorul nu a fost găsit.' });
        return;
      }
      const isBanned = await db.toggleUserBan(id);
      const actor = getAdminActor(req);
      await db.recordAuditLog({
        adminId: actor.id,
        adminUsername: actor.username,
        action: isBanned ? 'USER_BAN' : 'USER_UNBAN',
        targetType: 'user',
        targetId: id,
        details: {
          username: targetUser.username,
          isBanned,
          reason: typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 200) : undefined,
        },
      });
      res.json({
        success: true,
        isBanned,
        message: isBanned ? 'Utilizatorul a fost suspendat.' : 'Utilizatorul a fost reactivat.',
      });
    } catch (err) {
      console.error('[Admin Ban User Error]:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Eroare la actualizarea stării utilizatorului în baza de date.' });
    }
  }
);

// Change role (audited)
router.post(
  '/users/:id/role',
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { role } = req.body;
      if (role !== 'user' && role !== 'admin') {
        res.status(400).json({ error: 'Rol invalid.' });
        return;
      }
      if (id === req.userId && role !== 'admin') {
        res.status(400).json({ error: 'Nu vă puteți revoca propriul rol de administrator.' });
        return;
      }
      const targetUser = db.findUserById(id);
      if (!targetUser) {
        res.status(404).json({ error: 'Utilizatorul nu a fost găsit.' });
        return;
      }
      const previousRole = targetUser.role;
      const ok = await db.setUserRole(id, role);
      if (!ok) {
        res.status(404).json({ error: 'Utilizatorul nu a fost găsit.' });
        return;
      }
      const actor = getAdminActor(req);
      await db.recordAuditLog({
        adminId: actor.id,
        adminUsername: actor.username,
        action: 'USER_ROLE_CHANGE',
        targetType: 'user',
        targetId: id,
        details: {
          username: targetUser.username,
          previousRole,
          newRole: role,
        },
      });
      res.json({ success: true, message: `Rolul a fost schimbat în ${role}.` });
    } catch (err) {
      console.error('[Admin Role Change Error]:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Eroare la actualizarea rolului în baza de date.' });
    }
  }
);

// Adjust user leaderboard/profile stats (protected, validated, audited)
router.post(
  '/users/:id/adjust-stats',
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const targetUser = db.findUserById(id);
      if (!targetUser) {
        res.status(404).json({ error: 'Utilizatorul nu a fost găsit.' });
        return;
      }

      const { rating, wins, losses, matchesPlayed, highestScore, title, reason } = req.body || {};
      const updates: Record<string, any> = {};

      if (rating !== undefined) {
        const val = Number(rating);
        if (!Number.isInteger(val) || val < 0 || val > 10000) {
          res.status(400).json({ error: 'Ratingul trebuie să fie un număr întreg între 0 și 10000.' });
          return;
        }
        updates.rating = val;
      }
      if (wins !== undefined) {
        const val = Number(wins);
        if (!Number.isInteger(val) || val < 0 || val > 100000) {
          res.status(400).json({ error: 'Numărul de victorii trebuie să fie un întreg între 0 și 100000.' });
          return;
        }
        updates.wins = val;
      }
      if (losses !== undefined) {
        const val = Number(losses);
        if (!Number.isInteger(val) || val < 0 || val > 100000) {
          res.status(400).json({ error: 'Numărul de înfrângeri trebuie să fie un întreg între 0 și 100000.' });
          return;
        }
        updates.losses = val;
      }
      if (matchesPlayed !== undefined) {
        const val = Number(matchesPlayed);
        if (!Number.isInteger(val) || val < 0 || val > 200000) {
          res.status(400).json({ error: 'Numărul de meciuri trebuie să fie un întreg între 0 și 200000.' });
          return;
        }
        updates.matchesPlayed = val;
      }
      if (highestScore !== undefined) {
        const val = Number(highestScore);
        if (!Number.isInteger(val) || val < 0 || val > 10000000) {
          res.status(400).json({ error: 'Scorul maxim trebuie să fie un întreg între 0 și 10000000.' });
          return;
        }
        updates.highestScore = val;
      }
      if (title !== undefined) {
        if (typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 48) {
          res.status(400).json({ error: 'Titlul trebuie să aibă între 2 și 48 de caractere.' });
          return;
        }
        updates.title = title.trim();
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: 'Nu a fost furnizat niciun câmp valid pentru actualizare.' });
        return;
      }

      const beforeStats = {
        rating: targetUser.profile.rating,
        wins: targetUser.profile.wins,
        losses: targetUser.profile.losses,
        matchesPlayed: targetUser.profile.matchesPlayed,
        highestScore: targetUser.profile.highestScore,
        title: targetUser.profile.title,
      };

      const updatedProfile = await db.updateUserProfile(id, updates);
      if (!updatedProfile) {
        res.status(404).json({ error: 'Utilizatorul nu a fost găsit.' });
        return;
      }

      const actor = getAdminActor(req);
      await db.recordAuditLog({
        adminId: actor.id,
        adminUsername: actor.username,
        action: 'USER_STATS_ADJUST',
        targetType: 'user',
        targetId: id,
        details: {
          username: targetUser.username,
          before: beforeStats,
          after: updates,
          reason: typeof reason === 'string' ? reason.trim().slice(0, 200) : 'Corecție administrativă',
        },
      });

      res.json({
        success: true,
        profile: updatedProfile,
        message: `Statisticile jucătorului ${targetUser.username} au fost actualizate.`,
      });
    } catch (err) {
      console.error('[Admin Adjust Stats Error]:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Eroare la actualizarea statisticilor în baza de date.' });
    }
  }
);

// Get all rooms (live waiting, active, finished)
router.get('/rooms', authenticate, requireAdmin, (_req: AuthRequest, res: Response): void => {
  res.json({ rooms: gameManager.getAllRoomsForAdmin() });
});

// Force close an active or waiting room (audited)
router.post(
  '/rooms/:roomId/close',
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { roomId } = req.params;
      const reason =
        typeof req.body?.reason === 'string' && req.body.reason.trim().length > 0
          ? req.body.reason.trim().slice(0, 200)
          : 'Cameră închisă de administrator.';
      const closed = await gameManager.forceCloseRoom(roomId, reason);
      if (!closed) {
        res.status(404).json({ error: 'Camera nu a fost găsită.' });
        return;
      }
      const actor = getAdminActor(req);
      await db.recordAuditLog({
        adminId: actor.id,
        adminUsername: actor.username,
        action: 'ROOM_FORCE_CLOSE',
        targetType: 'room',
        targetId: roomId,
        details: { reason },
      });
      res.json({
        success: true,
        message: `Camera #${roomId} a fost închisă.`,
      });
    } catch (err) {
      console.error('[Admin Close Room Error]:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Eroare la închiderea camerei.' });
    }
  }
);

// Get recent audit logs
router.get('/audit-logs', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
  res.json({ logs: db.getAuditLogs(limit) });
});

// Comprehensive Admin Live Stats & System Health
router.get('/stats', authenticate, requireAdmin, (_req: AuthRequest, res: Response): void => {
  const allUsers = db.getAllUsers();
  const allQuestions = db.getAllQuestions();
  const gamesHistory = db.getGamesHistory(200);
  const allRooms = gameManager.getAllRoomsForAdmin();
  const connectedStats = getConnectedUsersStats();
  const healthMetrics = db.getHealthMetrics();
  const emailConfigured = isEmailDeliveryConfigured(process.env);

  const waitingRooms = allRooms.filter((r) => r.phase === 'waiting');
  const activePlayingRooms = allRooms.filter(
    (r) => r.phase !== 'waiting' && r.phase !== 'finished'
  );
  const finishedMemoryRooms = allRooms.filter((r) => r.phase === 'finished');

  const roomsByPhase: Record<string, number> = {
    waiting: waitingRooms.length,
    base_selection: allRooms.filter((r) => r.phase === 'base_selection').length,
    conquest: allRooms.filter((r) => r.phase === 'conquest').length,
    allocation: allRooms.filter((r) => r.phase === 'allocation').length,
    war: allRooms.filter((r) => r.phase === 'war').length,
    finished: finishedMemoryRooms.length,
  };

  let disconnectedPlayersCount = 0;
  let botControlledPlayersCount = 0;
  for (const r of activePlayingRooms) {
    disconnectedPlayersCount += r.disconnectedHumansCount;
    botControlledPlayersCount += r.botTakeoverCount;
  }

  res.json({
    totalUsers: allUsers.length,
    bannedUsers: allUsers.filter((u) => u.isBanned).length,
    totalGames: gamesHistory.length,
    totalQuestions: allQuestions.length,
    approvedQuestions: healthMetrics.approvedQuestions,
    activeRoomsCount: activePlayingRooms.length,
    waitingRoomsCount: waitingRooms.length,
    finishedRoomsCount: Math.max(gamesHistory.length, finishedMemoryRooms.length),
    roomsByPhase,
    onlineAuthenticatedCount: connectedStats.onlineUsersCount,
    activeSocketsCount: connectedStats.activeSocketConnections,
    onlineUserIds: connectedStats.onlineUserIds,
    disconnectedPlayersCount,
    botControlledPlayersCount,
    rooms: allRooms,
    health: {
      storageMode: healthMetrics.storageMode,
      postgresConnected: healthMetrics.postgresConnected,
      emailConfigured,
      maintenanceMode: isMaintenanceModeEnabled(),
      recentErrors: getRecentServerErrors(20),
      uptimeSeconds: Math.floor(process.uptime()),
      serverTime: new Date().toISOString(),
    },
  });
});

export default router;
