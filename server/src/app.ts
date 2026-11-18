import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './lib/env';
import { prisma } from './lib/prisma';
import { apiLimiter } from './middleware/rateLimiters';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import { conversationRoutes } from './routes/conversations';
import type { Realtime } from './socket/realtime';

export function createApp(realtime: Realtime) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, db: 'up' });
    } catch {
      res.status(503).json({ ok: false, db: 'down' });
    }
  });

  app.use(apiLimiter);
  app.use('/auth', authRoutes);
  app.use('/users', userRoutes);
  app.use('/conversations', conversationRoutes(realtime));
  app.use((_req, res) => res.status(404).json({ error: 'not found' }));
  app.use(errorHandler);
  return app;
}
