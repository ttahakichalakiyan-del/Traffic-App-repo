import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { validate, validateParams } from '../middleware/validate.middleware';
import { verifyDspToken } from '../middleware/auth.middleware';
import { db } from '../db/index';
import { alerts } from '../db/schema';
import { emitToArea } from '../socket/index';
import { AreaErrors, GeneralErrors } from '../lib/errors';

const router = Router();

const AreaIdParamSchema = z.object({
  areaId: z.string().uuid(),
});

const AlertIdParamSchema = z.object({
  id: z.string().uuid(),
});

const CreateAlertSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  roadName: z.string().optional(),
  alertType: z.string().min(1),
  severity: z.number().int().min(1).max(3),
  description: z.string().optional(),
});

// ============================================================
// GET /api/alerts/area/:areaId — active alerts for area
// ============================================================
router.get(
  '/area/:areaId',
  verifyDspToken,
  validateParams(AreaIdParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { areaId } = req.params;
      if (req.dsp!.areaId !== areaId) {
        throw AreaErrors.accessDenied();
      }

      const activeAlerts = await db
        .select()
        .from(alerts)
        .where(
          and(
            eq(alerts.areaId, areaId),
            eq(alerts.isActive, true),
          ),
        )
        .orderBy(desc(alerts.severity), desc(alerts.detectedAt));

      // Add elapsed time
      const now = Date.now();
      const withElapsed = activeAlerts.map((a) => {
        const detectedMs = a.detectedAt ? new Date(a.detectedAt).getTime() : now;
        const elapsedMin = Math.floor((now - detectedMs) / 60000);
        let elapsed: string;
        if (elapsedMin < 1) elapsed = 'abhi';
        else if (elapsedMin < 60) elapsed = `${elapsedMin} min pehle`;
        else elapsed = `${Math.floor(elapsedMin / 60)} ghante pehle`;

        return { ...a, elapsed };
      });

      res.json({
        success: true,
        data: withElapsed,
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// POST /api/alerts — create alert
// ============================================================
router.post(
  '/',
  verifyDspToken,
  validate(CreateAlertSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const areaId = req.dsp!.areaId;
      if (!areaId) {
        throw AreaErrors.notFound();
      }

      const { lat, lng, roadName, alertType, severity, description } = req.body;

      const [alert] = await db
        .insert(alerts)
        .values({
          areaId,
          lat,
          lng,
          roadName: roadName ?? null,
          alertType,
          severity,
          description: description ?? null,
          isActive: true,
        })
        .returning();

      // Emit to area
      emitToArea(areaId, 'alert:new', alert);

      res.status(201).json({
        success: true,
        data: alert,
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// PUT /api/alerts/:id/resolve
// ============================================================
router.put(
  '/:id/resolve',
  verifyDspToken,
  validateParams(AlertIdParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const [updated] = await db
        .update(alerts)
        .set({
          isActive: false,
          resolvedAt: new Date(),
          acknowledgedByDspId: req.dsp!.id,
        })
        .where(eq(alerts.id, id))
        .returning();

      if (!updated) {
        throw GeneralErrors.notFound('Alert');
      }

      res.json({
        success: true,
        data: updated,
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// POST /api/alerts/:id/acknowledge
// ============================================================
router.post(
  '/:id/acknowledge',
  verifyDspToken,
  validateParams(AlertIdParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const [updated] = await db
        .update(alerts)
        .set({ acknowledgedByDspId: req.dsp!.id })
        .where(eq(alerts.id, id))
        .returning();

      if (!updated) {
        throw GeneralErrors.notFound('Alert');
      }

      res.json({
        success: true,
        data: updated,
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

export const alertsRouter = router;
