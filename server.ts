import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { gameManager } from './server/gameEngine';
import { db } from './server/db';
import {
  isPostgresConfigured,
  checkPostgresHealth,
  saveActiveGameSnapshotsToPostgres,
  closePostgresPool,
} from './server/postgresRepo';
import authRoutes from './server/routes/authRoutes';
import questionRoutes from './server/routes/questionRoutes';
import gameRoutes from './server/routes/gameRoutes';
import socialRoutes from './server/routes/socialRoutes';
import adminRoutes from './server/routes/adminRoutes';
import { setupSocketHandlers } from './server/socketHandler';

const PORT = Number(process.env.PORT) || 3000;

// Lightweight in-memory rate limiter for auth & API endpoints
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
function createRateLimiter(windowMs: number, maxRequests: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip =
      (req.headers['cf-connecting-ip'] as string) ||
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

  // Liveness endpoint (/healthz)
  app.get('/healthz', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'conquiz-romania-multiplayer',
      version: '9.0.0',
      uptimeSeconds: Math.round(process.uptime()),
      activeGames: gameManager.getActiveGamesCount(),
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
      storageMode: metrics.storageMode,
      databaseConnected: dbOk,
      postgresLatencyMs: pgLatencyMs,
      totalQuestions: metrics.totalQuestions,
      approvedQuestions: metrics.approvedQuestions,
      activeGames: gameManager.getActiveGamesCount(),
      timestamp: new Date().toISOString(),
    });
  });

  // API Routes with rate limiting
  app.use('/api/auth', createRateLimiter(60_000, 60), authRoutes);
  app.use('/api/questions', createRateLimiter(60_000, 180), questionRoutes);
  app.use('/api/games', createRateLimiter(60_000, 180), gameRoutes);
  app.use('/api/social', createRateLimiter(60_000, 120), socialRoutes);
  app.use('/api/admin', createRateLimiter(60_000, 120), adminRoutes);

  // Setup Real-time Game WebSockets
  setupSocketHandlers(io, gameManager);

  // Mount Vite middleware in development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
    console.log(`🏰 CONQUIZ server running on http://0.0.0.0:${PORT}`);
  });

  // Graceful shutdown handler for SIGTERM / SIGINT (Proxmox / Docker stop)
  let isShuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[${signal}] Se oprește serverul CONQUIZ în mod controlat...`);
    try {
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

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
