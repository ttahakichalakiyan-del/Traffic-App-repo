import { Router, Request, Response, NextFunction } from 'express';
import { AppError, AuthErrors } from '../lib/errors';

// Socket.io instance will be set from server.ts
let ioInstance: { emit: (event: string, data: unknown) => void } | null = null;

export function setIoInstance(io: { emit: (event: string, data: unknown) => void }) {
  ioInstance = io;
}

const router = Router();

function verifyInternalKey(req: Request, _res: Response, next: NextFunction) {
  const key = req.headers['x-internal-key'];
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!expectedKey) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Internal API key not configured');
  }

  if (key !== expectedKey) {
    throw AuthErrors.unauthorized();
  }

  next();
}

// ============================================================
// POST /api/internal/predictions-updated
// Called by ML engine after nightly predictions run
// ============================================================
router.post(
  '/predictions-updated',
  verifyInternalKey,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (ioInstance) {
        ioInstance.emit('predictions:updated', {
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        data: { notified: !!ioInstance },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// POST /api/internal/trigger-traffic-collection
// Manually trigger the traffic collector job
// ============================================================
router.post(
  '/trigger-traffic-collection',
  verifyInternalKey,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      // Notify any listeners via socket that a manual collection was triggered
      if (ioInstance) {
        ioInstance.emit('traffic:collection_triggered', {
          timestamp: new Date().toISOString(),
          source: 'manual',
        });
      }

      res.json({
        success: true,
        data: { triggered: true, timestamp: new Date().toISOString() },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

export const internalRouter = router;
