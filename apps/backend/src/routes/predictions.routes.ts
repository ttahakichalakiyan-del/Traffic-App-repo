import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, desc, gte } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { validateParams } from '../middleware/validate.middleware';
import { verifyDspToken } from '../middleware/auth.middleware';
import { db } from '../db/index';
import { predictions } from '../db/schema';
import { AreaErrors } from '../lib/errors';

const router = Router();

const AreaIdParamSchema = z.object({
  areaId: z.string().uuid(),
});

// ============================================================
// GET /api/predictions/tomorrow/:areaId
// ============================================================
router.get(
  '/tomorrow/:areaId',
  verifyDspToken,
  validateParams(AreaIdParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { areaId } = req.params;
      if (req.dsp!.areaId !== areaId) {
        throw AreaErrors.accessDenied();
      }

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const results = await db
        .select()
        .from(predictions)
        .where(
          and(
            eq(predictions.areaId, areaId),
            eq(predictions.predictedDate, tomorrowStr),
            gte(predictions.confidence, 0.5),
          ),
        )
        .orderBy(desc(predictions.confidence));

      res.json({
        success: true,
        data: results.map((p) => ({
          id: p.id,
          roadName: p.roadName,
          lat: p.lat,
          lng: p.lng,
          predictedDate: p.predictedDate,
          timeWindowStart: p.timeWindowStart,
          timeWindowEnd: p.timeWindowEnd,
          dayOfWeek: p.dayOfWeek,
          confidence: p.confidence,
          historicalOccurrences: p.historicalOccurrences,
          modelVersion: p.modelVersion,
        })),
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// GET /api/predictions/accuracy — accuracy report stub
// ============================================================
router.get(
  '/accuracy',
  verifyDspToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { areaId, days = '7' } = req.query as { areaId?: string; days?: string };

      const daysInt = Math.min(Math.max(parseInt(days, 10) || 7, 1), 90);

      // Return summary: accuracy per area per day (empty if no data)
      const result = await db.execute(sql`
        SELECT
          p.area_id,
          p.predicted_date,
          COUNT(*) AS total_predictions,
          COUNT(CASE WHEN p.confidence >= 0.7 THEN 1 END) AS high_confidence
        FROM predictions p
        WHERE p.predicted_date >= CURRENT_DATE - INTERVAL '${sql.raw(String(daysInt))} days'
          ${areaId ? sql`AND p.area_id = ${areaId}::uuid` : sql``}
        GROUP BY p.area_id, p.predicted_date
        ORDER BY p.predicted_date DESC
      `);

      const rows = (result.rows ?? []).map((r: Record<string, unknown>) => ({
        areaId: r.area_id,
        date: r.predicted_date,
        totalPredictions: Number(r.total_predictions),
        highConfidence: Number(r.high_confidence),
        accuracyPct: r.total_predictions
          ? Math.round((Number(r.high_confidence) / Number(r.total_predictions)) * 100)
          : 0,
      }));

      res.json({
        success: true,
        data: rows,
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

export const predictionsRouter = router;
