import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { gameManager } from './server/gameEngine';
import authRoutes from './server/routes/authRoutes';
import questionRoutes from './server/routes/questionRoutes';
import gameRoutes from './server/routes/gameRoutes';
import socialRoutes from './server/routes/socialRoutes';
import adminRoutes from './server/routes/adminRoutes';
import { setupSocketHandlers } from './server/socketHandler';

const PORT = 3000;

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  let allowedOrigin: string | boolean = process.env.NODE_ENV !== 'production';
  if (process.env.APP_URL && /^https?:\/\//i.test(process.env.APP_URL)) {
    try { allowedOrigin = new URL(process.env.APP_URL).origin; } catch { allowedOrigin = process.env.NODE_ENV !== 'production'; }
  }
  const io = new SocketIOServer(httpServer, {
    cors: { origin: allowedOrigin, credentials: true },
    transports: ['websocket', 'polling'],
  });

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/questions', questionRoutes);
  app.use('/api/games', gameRoutes);
  app.use('/api/social', socialRoutes);
  app.use('/api/admin', adminRoutes);

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
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
