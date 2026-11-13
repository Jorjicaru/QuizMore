import { Router, Response } from 'express';
import { db } from '../db';
import { authenticate, requireAdmin, AuthRequest } from '../auth';
import { gameManager } from '../gameEngine';
import { getConnectedUsersStats } from '../socketHandler';
import { isEmailDeliveryConfigured } from '../emailService';
import { isMaintenanceModeEnabled, getRecentServerErrors } from '../maintenance';
import { computeLeaderboardWithManualOverrides } from '../../src/game/rules';
import { FeedbackCategory, FeedbackStatus } from '../../src/types/game';

const router = Router();

function getAdminActor(req: AuthRequest): { id: string; username: string } {
  const adminId = req.userId || 'admin';
  const adminUser = db.findUserById(adminId);
  return {
    id: adminId,
    username: adminUser?.username || 'admin',
  };
}

// Get users list with search and computed leaderboard rank
router.get('/users', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const search = String(req.query.search || '').trim().toLowerCase();
  const allRecords = db.getAllUsers();
  const rankedProfiles = computeLeaderboardWithManualOverrides(
    allRecords.map((u) => u.profile),
    'rating'
  );
  const rankById = new Map<string, number>(rankedProfiles.map((p) => [p.id, p.rank]));

  let users = allRecords.map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    avatar: u.profile.avatar || 'av_vlad',
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
    manualRankOverride: u.profile.manualRankOverride ?? null,
    leaderboardRank: rankById.get(u.id) ?? 0,
  }));

  if (search) {
    users = users.filter(
      (u) => u.username.toLowerCase().includes(search) || u.email.toLowerCase().includes(search)
    );
  }

  res.json({ users });
});

// Get detailed user profile & match history for Admin inspection
router.get(
  '/users/:id/profile',
  authenticate,
  requireAdmin,
  (req: AuthRequest, res: Response): void => {
    const { id } = req.params;
    const targetUser = db.findUserById(id);
    if (!targetUser) {
      res.status(404).json({ error: 'Utilizatorul nu a fost găsit.' });
      return;
    }

    const allRanked = computeLeaderboardWithManualOverrides(
      db.getAllUsers().map((u) => u.profile),
      'rating'
    );
    const rankEntry = allRanked.find((p) => p.id === id);
    const gamesHistory = db.getUserGameHistory(id).slice(0, 30);
    const friendsList = db.getFriends(id);

    res.json({
      user: {
        id: targetUser.id,
        username: targetUser.username,
        email: targetUser.email,
        role: targetUser.role,
        isBanned: Boolean(targetUser.isBanned),
        createdAt: targetUser.createdAt,
        rating: targetUser.profile.rating ?? 1000,
        wins: targetUser.profile.wins ?? 0,
        losses: targetUser.profile.losses ?? 0,
        matchesPlayed: targetUser.profile.matchesPlayed ?? 0,
        territoriesConquered: targetUser.profile.territoriesConquered ?? 0,
        correctAnswersTotal: targetUser.profile.correctAnswersTotal ?? 0,
        highestScore: targetUser.profile.highestScore ?? 0,
        title: targetUser.profile.title || 'Răzeș',
        manualRankOverride: targetUser.profile.manualRankOverride ?? null,
        profile: {
          ...targetUser.profile,
          manualRankOverride: targetUser.profile.manualRankOverride ?? null,
        },
        leaderboardRank: rankEntry?.rank ?? 0,
        friendsCount: friendsList.filter((f) => f.status === 'accepted').length,
        pendingFriendsCount: friendsList.filter((f) => f.status === 'pending').length,
      },
      leaderboardRank: rankEntry?.rank ?? null,
      gamesHistory,
      recentGames: gamesHistory,
    });
  }
);

// Delete user account (protected, validated, audited, preserves match history & audit integrity)
router.delete(
  '/users/:id',
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      if (id === req.userId) {
        res.status(400).json({ error: 'Nu vă puteți șterge propriul cont de administrator.' });
        return;
      }

      const targetUser = db.findUserById(id);
      if (!targetUser) {
        res.status(404).json({ error: 'Utilizatorul nu a fost găsit.' });
        return;
      }

      const snapshotBeforeDelete = {
        id: targetUser.id,
        username: targetUser.username,
        email: targetUser.email,
        role: targetUser.role,
        rating: targetUser.profile.rating,
        matchesPlayed: targetUser.profile.matchesPlayed,
        wins: targetUser.profile.wins,
      };

      // Cleanly remove user from any waiting or active rooms
      gameManager.removeDeletedUserFromRooms(id);

      const deleted = await db.deleteUser(id);
      if (!deleted) {
        res.status(404).json({ error: 'Utilizatorul nu a fost găsit.' });
        return;
      }

      const actor = getAdminActor(req);
      const reason =
        typeof req.body?.reason === 'string' && req.body.reason.trim().length > 0
          ? req.body.reason.trim().slice(0, 200)
          : 'Ștergere administrativă a contului';

      await db.recordAuditLog({
        adminId: actor.id,
        adminUsername: actor.username,
        action: 'USER_DELETE',
        targetType: 'user',
        targetId: id,
        details: {
          ...snapshotBeforeDelete,
          reason,
          deletedData: ['users', 'friends', 'notifications', 'password_reset_tokens'],
          preservedData: ['games', 'game_player_results', 'audit_logs'],
        },
      });

      res.json({
        success: true,
        deletedUserId: id,
        deletedData: ['cont utilizator', 'prietenii', 'notificări', 'tokenuri resetare parolă'],
        preservedData: ['istoric meciuri (games & game_player_results)', 'jurnal de audit'],
        message: `Contul jucătorului ${snapshotBeforeDelete.username} a fost șters definitiv. Istoricul meciurilor a fost păstrat.`,
      });
    } catch (err) {
      console.error('[Admin Delete User Error]:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Eroare la ștergerea contului din baza de date.' });
    }
  }
);

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

// Adjust user leaderboard/profile stats & manual rank override (protected, validated, audited)
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

      const {
        rating,
        wins,
        losses,
        matchesPlayed,
        territoriesConquered,
        highestScore,
        title,
        manualRankOverride,
        reason,
      } = req.body || {};
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
      if (territoriesConquered !== undefined) {
        const val = Number(territoriesConquered);
        if (!Number.isInteger(val) || val < 0 || val > 1000000) {
          res.status(400).json({ error: 'Numărul de teritorii cucerite trebuie să fie un întreg între 0 și 1000000.' });
          return;
        }
        updates.territoriesConquered = val;
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
      if (manualRankOverride !== undefined) {
        if (manualRankOverride === null || manualRankOverride === '' || manualRankOverride === 0) {
          updates.manualRankOverride = null;
        } else {
          const val = Number(manualRankOverride);
          if (!Number.isInteger(val) || val < 1 || val > 1000) {
            res.status(400).json({
              error: 'Poziția manuală în clasament trebuie să fie un număr întreg între 1 și 1000 (sau gol pentru calcul automat).',
            });
            return;
          }
          updates.manualRankOverride = val;
        }
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
        territoriesConquered: targetUser.profile.territoriesConquered,
        highestScore: targetUser.profile.highestScore,
        title: targetUser.profile.title,
        manualRankOverride: targetUser.profile.manualRankOverride ?? null,
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
        user: {
          ...updatedProfile,
          manualRankOverride: updatedProfile.manualRankOverride ?? null,
        },
        message: `Statisticile și clasamentul jucătorului ${targetUser.username} au fost actualizate.`,
      });
    } catch (err) {
      console.error('[Admin Adjust Stats Error]:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Eroare la actualizarea statisticilor în baza de date.' });
    }
  }
);

// Get user feedback list (filterable by status & category)
router.get('/feedback', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const rawStatus = String(req.query.status || 'all');
  const rawCategory = String(req.query.category || 'all');
  const validStatuses: Array<FeedbackStatus | 'all'> = ['all', 'nou', 'in_verificare', 'rezolvat'];
  const validCategories: Array<FeedbackCategory | 'all'> = [
    'all',
    'problema_tehnica',
    'intrebare_gresita',
    'idee_imbunatatire',
    'altceva',
  ];

  const statusFilter = validStatuses.includes(rawStatus as any)
    ? (rawStatus as FeedbackStatus | 'all')
    : 'all';
  const categoryFilter = validCategories.includes(rawCategory as any)
    ? (rawCategory as FeedbackCategory | 'all')
    : 'all';

  const feedback = db.getFeedbackList({
    status: statusFilter,
    category: categoryFilter,
    limit: 200,
  });

  res.json({ feedback });
});

// Update feedback status (audited)
async function handleFeedbackStatusUpdate(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    const validStatuses: FeedbackStatus[] = ['nou', 'in_verificare', 'rezolvat'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Stare feedback invalidă (valori permise: nou, in_verificare, rezolvat).' });
      return;
    }

    const existing = db.getFeedbackById(id);
    if (!existing) {
      res.status(404).json({ error: 'Mesajul de feedback nu a fost găsit.' });
      return;
    }

    const previousStatus = existing.status;
    const updated = await db.updateFeedbackStatus(id, status);
    if (!updated) {
      res.status(404).json({ error: 'Mesajul de feedback nu a fost găsit.' });
      return;
    }

    const actor = getAdminActor(req);
    await db.recordAuditLog({
      adminId: actor.id,
      adminUsername: actor.username,
      action: 'FEEDBACK_STATUS_CHANGE',
      targetType: 'feedback',
      targetId: id,
      details: {
        username: existing.username,
        category: existing.category,
        previousStatus,
        newStatus: status,
      },
    });

    res.json({
      success: true,
      feedback: updated,
      message: `Starea feedback-ului a fost schimbată în „${status}”.`,
    });
  } catch (err) {
    console.error('[Admin Feedback Status Error]:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Eroare la actualizarea stării feedback-ului.' });
  }
}

router.patch('/feedback/:id/status', authenticate, requireAdmin, handleFeedbackStatusUpdate);
router.post('/feedback/:id/status', authenticate, requireAdmin, handleFeedbackStatusUpdate);

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
  const feedbackList = db.getFeedbackList({ limit: 500 });

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
    newFeedbackCount: feedbackList.filter((f) => f.status === 'nou').length,
    totalFeedbackCount: feedbackList.length,
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

