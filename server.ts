import dotenv from 'dotenv';
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { assertSafeRuntimeEnvironment, isAiStudioPreviewEnv } from './server/envSecurity';
import { gameManager } from './server/gameEngine';
import { db } from './server/db';
import {
  isPostgresConfigured,
  checkPostgresHealth,
  saveActiveGameSnapshotsToPostgres,
  loadActiveGameSnapshotsFromPostgres,
  deleteActiveGameSnapshotFromPostgres,
  closePostgresPool,
} from './server/postgresRepo';
import authRoutes from './server/routes/authRoutes';
import questionRoutes from './server/routes/questionRoutes';
import gameRoutes from './server/routes/gameRoutes';
import socialRoutes from './server/routes/socialRoutes';
import adminRoutes from './server/routes/adminRoutes';
import { setupSocketHandlers } from './server/socketHandler';
import { isMaintenanceModeEnabled, getMaintenanceMessage } from './server/maintenance';

// Load .env with override: true if present so user edits in .env take effect immediately
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: true });
} else {
  dotenv.config();
}

const PORT = Number(process.env.PORT) || 3000;

// Lightweight in-memory rate limiter for auth & API endpoints
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
function createRateLimiter(windowMs: number, maxRequests: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip =
      (req.headers['x-real-ip'] as string) ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    const key = `${req.baseUrl || req.path}:${ip}`;
    const now = Date.now();
    const record = rateLimitStore.get(key);
    if (!record || now >= record.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    record.count += 1;
    if (record.count > maxRequests) {
      res.status(429).json({
        error: 'Prea multe cereri într-un interval scurt. Te rugăm să aștepți câteva secunde.',
      });
      return;
    }
    next();
  };
}

async function startServer() {
  // 1. Validate production environment security before starting
  assertSafeRuntimeEnvironment(process.env);

  // 2. Initialize authoritative database (PostgreSQL when DATABASE_URL is set)
  await db.init();

  // 3. Restore any interrupted active games from PostgreSQL snapshots
  if (isPostgresConfigured()) {
    const snapshots = await loadActiveGameSnapshotsFromPostgres();
    if (snapshots.length > 0) {
      const count = gameManager.restoreGamesFromSnapshots(snapshots);
      for (const s of snapshots) {
        await deleteActiveGameSnapshotFromPostgres(s.roomId);
      }
      console.log(`🔄 S-au restaurat ${count} camere active din PostgreSQL.`);
    }
  }

  // Periodic non-blocking active game snapshots (every 15 seconds) when PostgreSQL is active
  let snapshotIntervalId: NodeJS.Timeout | null = null;
  let isSavingPeriodicSnapshots = false;
  if (isPostgresConfigured()) {
    const intervalMs = Math.max(
      5000,
      Number(process.env.ACTIVE_ROOM_SNAPSHOT_INTERVAL_MS) || 15000
    );
    snapshotIntervalId = setInterval(() => {
      if (isSavingPeriodicSnapshots) return;
      const activeGames = gameManager.getAllActiveGames();
      if (activeGames.length === 0) return;
      isSavingPeriodicSnapshots = true;
      void saveActiveGameSnapshotsToPostgres(activeGames, false).finally(() => {
        isSavingPeriodicSnapshots = false;
      });
    }, intervalMs);
    snapshotIntervalId.unref?.();
  }

  const app = express();
  app.set('trust proxy', 1);
  const httpServer = http.createServer(app);

  let allowedOrigin: string | boolean = process.env.NODE_ENV !== 'production';
  if (process.env.APP_URL && /^https?:\/\//i.test(process.env.APP_URL)) {
    try {
      allowedOrigin = new URL(process.env.APP_URL).origin;
    } catch {
      allowedOrigin = process.env.NODE_ENV !== 'production';
    }
  }
  const io = new SocketIOServer(httpServer, {
    cors: { origin: allowedOrigin, credentials: true },
    transports: ['websocket', 'polling'],
  });

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Liveness endpoint (/healthz) - remains 200 OK even in maintenance mode so Docker does not restart loop
  app.get('/healthz', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'conquiz-romania-multiplayer',
      version: '9.2.0',
      maintenanceMode: isMaintenanceModeEnabled(),
      uptimeSeconds: Math.round(process.uptime()),
      activeGames: gameManager.getActiveGamesCount(),
      timestamp: new Date().toISOString(),
    });
  });

  // Public status endpoint (/api/status) for maintenance detection by frontend
  app.get('/api/status', (_req, res) => {
    const maintenance = isMaintenanceModeEnabled();
    res.status(200).json({
      ok: true,
      maintenance,
      message: maintenance ? getMaintenanceMessage() : null,
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness endpoint (/readyz) - verifies DB connectivity and >= 5000 approved questions
  app.get('/readyz', async (_req, res) => {
    const metrics = db.getHealthMetrics();
    let dbOk = true;
    let pgLatencyMs: number | undefined;
    if (isPostgresConfigured()) {
      const pgHealth = await checkPostgresHealth();
      dbOk = pgHealth.connected;
      pgLatencyMs = pgHealth.latencyMs;
    }
    const questionsReady = metrics.approvedQuestions >= 5000;
    const isReady = dbOk && questionsReady;

    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'not_ready',
      maintenanceMode: isMaintenanceModeEnabled(),
      storageMode: metrics.storageMode,
      databaseConnected: dbOk,
      postgresLatencyMs: pgLatencyMs,
      totalQuestions: metrics.totalQuestions,
      approvedQuestions: metrics.approvedQuestions,
      activeGames: gameManager.getActiveGamesCount(),
      timestamp: new Date().toISOString(),
    });
  });

  // Maintenance mode guard for API routes (returns 503 Service Unavailable with Romanian message)
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/status') {
      return next();
    }
    if (isMaintenanceModeEnabled()) {
      res.status(503).json({
        error: getMaintenanceMessage(),
        maintenance: true,
      });
      return;
    }
    next();
  });

  // API Routes with rate limiting
  app.use('/api/auth', createRateLimiter(60_000, 60), authRoutes);
  app.use('/api/questions', createRateLimiter(60_000, 180), questionRoutes);
  app.use('/api/games', createRateLimiter(60_000, 180), gameRoutes);
  app.use('/api/social', createRateLimiter(60_000, 120), socialRoutes);
  app.use('/api/admin', createRateLimiter(60_000, 120), adminRoutes);

  // Setup Real-time Game WebSockets
  setupSocketHandlers(io, gameManager);

  // Mount Vite middleware ONLY in development via dynamic import (so production needs zero devDependencies)
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr =
      process.env.DISABLE_HMR === 'true' || isAiStudioPreviewEnv(process.env);
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : { server: httpServer },
        watch: disableHmr ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist/index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🏰 CONQUIZ V9.2 server running on http://0.0.0.0:${PORT}`);
  });

  // Graceful shutdown handler for SIGTERM / SIGINT (Proxmox / Docker stop)
  let isShuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[${signal}] Se oprește serverul CONQUIZ în mod controlat...`);
    try {
      if (snapshotIntervalId) {
        clearInterval(snapshotIntervalId);
        snapshotIntervalId = null;
      }
      const activeGames = gameManager.getAllActiveGames();
      if (activeGames.length > 0 && isPostgresConfigured()) {
        await saveActiveGameSnapshotsToPostgres(activeGames, true);
      }
      gameManager.shutdownAllRooms();
      db.save();
      io.close();
      httpServer.close();
      await closePostgresPool();
    } catch (err) {
      console.error('Eroare la oprirea controlată:', err);
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
