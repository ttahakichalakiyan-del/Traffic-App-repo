// ⚠ dotenv MUST be the very first import so process.env is populated
// before any other module (e.g. db/index.ts) reads it at instantiation time.
import 'dotenv/config';

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';

import { isAppError } from './lib/errors';
import { initializeSocket } from './socket/index';
import { startCronJobs } from './jobs/index';
import { setIoInstance } from './routes/internal.routes';

// Route imports
import { authRouter } from './routes/auth.routes';
import { trackingRouter } from './routes/tracking.routes';
import { areasRouter } from './routes/areas.routes';
import { sectorsRouter } from './routes/sectors.routes';
import { staffRouter } from './routes/staff.routes';
import { rosterRouter } from './routes/roster.routes';
import { trafficRouter } from './routes/traffic.routes';
import { predictionsRouter } from './routes/predictions.routes';
import { alertsRouter } from './routes/alerts.routes';
import { adminRouter } from './routes/admin.routes';
import { internalRouter } from './routes/internal.routes';
import { versionRouter } from './routes/version.routes';

// ============================================================
// App setup
// ============================================================
const app = express();
const httpServer = createServer(app);

const isProd = process.env.NODE_ENV === 'production';

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? '*',
    credentials: true,
  }),
);

// Compression
app.use(compression());

// Logging
app.use(morgan(isProd ? 'combined' : 'dev'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================================
// Request ID middleware
// ============================================================
app.use((req: Request, res: Response, next: NextFunction) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// ============================================================
// Rate limiters
// ============================================================
const isTest = process.env.NODE_ENV === 'test';

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: {
    success: false,
    error: 'Too many requests, please try again later',
    timestamp: new Date().toISOString(),
  },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: {
    success: false,
    error: 'Too many login attempts, please try again later',
    timestamp: new Date().toISOString(),
  },
});

app.use(globalLimiter);

// ============================================================
// Health check
// ============================================================
const healthHandler = (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV || 'development',
  });
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler); // Admin panel alias

// ============================================================
// Routes
// ============================================================
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/tracking', trackingRouter);
app.use('/api/areas', areasRouter);
app.use('/api/sectors', sectorsRouter);
app.use('/api/staff', staffRouter);
app.use('/api/roster', rosterRouter);
app.use('/api/traffic', trafficRouter);
app.use('/api/predictions', predictionsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/internal', internalRouter);
app.use('/api/version', versionRouter);

// ============================================================
// 404 handler
// ============================================================
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    data: null,
    error: 'Route not found',
    path: req.path,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// Global error handler
// ============================================================
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const requestId = req.id || 'unknown';

  if (isAppError(err)) {
    console.error(`[${requestId}] AppError: ${err.code} - ${err.message}`);
    res.status(err.statusCode).json({
      success: false,
      data: null,
      error: err.message,
      code: err.code,
      requestId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // PostgreSQL unique constraint violation → 409 Conflict
  if ((err as NodeJS.ErrnoException & { code?: string }).code === '23505') {
    console.error(`[${requestId}] DB unique constraint:`, err.message);
    res.status(409).json({
      success: false,
      data: null,
      error: 'Resource already exists',
      code: 'CONFLICT',
      requestId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Unexpected error
  console.error(`[${requestId}] Unhandled error:`, err);
  res.status(500).json({
    success: false,
    data: null,
    error: isProd ? 'Internal server error' : err.message,
    requestId,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// Socket.io
// ============================================================
const io = initializeSocket(httpServer);
setIoInstance(io);

// ============================================================
// Cron jobs (skip in test environment)
// ============================================================
if (process.env.NODE_ENV !== 'test') {
  startCronJobs();
}

// ============================================================
// Start server (skip in test environment)
// ============================================================
const PORT = parseInt(process.env.PORT || '3001', 10);

if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, () => {
    console.log(`\n  🚔 CTPL Backend running on port ${PORT}`);
    console.log(`  📡 Socket.io ready`);
    console.log(`  🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  ❤️  Health: http://localhost:${PORT}/health\n`);
  });
}

// ============================================================
// Graceful shutdown
// ============================================================
function gracefulShutdown(signal: string) {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  httpServer.close(() => {
    console.log('[Shutdown] HTTP server closed');
    io.close(() => {
      console.log('[Shutdown] Socket.io closed');
      process.exit(0);
    });
  });

  // Force exit after 10s
  setTimeout(() => {
    console.error('[Shutdown] Forced exit after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { app, httpServer, io };
