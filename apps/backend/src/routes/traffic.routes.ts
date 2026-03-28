import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { validate, validateParams } from '../middleware/validate.middleware';
import { verifyDspToken } from '../middleware/auth.middleware';
import { db } from '../db/index';
import { trafficSnapshots } from '../db/schema';
import { AreaErrors } from '../lib/errors';

const router = Router();

const AreaIdParamSchema = z.object({
  areaId: z.string().uuid(),
});

// ============================================================
// GET /api/traffic/area/:areaId/current
// ============================================================
router.get(
  '/area/:areaId/current',
  verifyDspToken,
  validateParams(AreaIdParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { areaId } = req.params;
      if (req.dsp!.areaId !== areaId) {
        throw AreaErrors.accessDenied();
      }

      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

      const snapshots = await db
        .select()
        .from(trafficSnapshots)
        .where(
          and(
            eq(trafficSnapshots.areaId, areaId),
            gte(trafficSnapshots.timestamp, thirtyMinAgo),
          ),
        )
        .orderBy(desc(trafficSnapshots.congestionLevel))
        .limit(20);

      res.json({
        success: true,
        data: snapshots.map((s) => ({
          segmentId: s.segmentId,
          roadName: s.roadName,
          lat: s.lat,
          lng: s.lng,
          congestionLevel: s.congestionLevel,
          speedKmh: s.speedKmh,
          timestamp: s.timestamp,
        })),
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

export const trafficRouter = router;
