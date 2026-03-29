import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, sql, desc, gte, lt, isNull } from 'drizzle-orm';
import { validate } from '../middleware/validate.middleware';
import { validateParams } from '../middleware/validate.middleware';
import { verifyStaffToken, verifyDspToken } from '../middleware/auth.middleware';
import { db } from '../db/index';
import { staffLocations, staffMembers, sectors } from '../db/schema';
import { emitToArea } from '../socket/index';
import { getStaffMyDuty, getStaffByArea } from '../db/queries/staff.queries';
import { AreaErrors } from '../lib/errors';

const router = Router();

// ============================================================
// In-memory cache for staff list (30-second TTL)
// ============================================================
const STAFF_CACHE = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30 * 1000;

// ============================================================
// Zod schemas
// ============================================================

const LocationPingSchema = z.object({
  lat: z.number().min(23).max(37),
  lng: z.number().min(61).max(77),
  accuracy: z.number().optional(),
  speed: z.number().optional(),
  bearing: z.number().optional(),
  batteryLevel: z.number().min(0).max(100).optional(),
  timestamp: z.string().datetime(),
});

const BatchLocationsSchema = z.object({
  locations: z.array(LocationPingSchema).min(1).max(100),
});

const AreaIdParamSchema = z.object({
  areaId: z.string().uuid(),
});

// ============================================================
// POST /api/tracking/location — single ping
// ============================================================
router.post(
  '/location',
  verifyStaffToken,
  validate(LocationPingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const staffId = req.staff!.id;
      const areaId = req.staff!.areaId;
      const { lat, lng, accuracy, speed, bearing, batteryLevel, timestamp } = req.body;
      const ts = new Date(timestamp);

      // 1. Insert location
      await db.insert(staffLocations).values({
        staffId,
        lat,
        lng,
        locationPoint: sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`,
        accuracy: accuracy ?? null,
        speed: speed ?? null,
        bearing: bearing ?? null,
        batteryLevel: batteryLevel ?? null,
        isOnDuty: true,
        timestamp: ts,
      });

      // 2. Update last_seen_at (trigger also does this, but explicit for non-PostGIS setups)
      await db
        .update(staffMembers)
        .set({ lastSeenAt: ts })
        .where(eq(staffMembers.id, staffId));

      // 3. Get staff details for socket emit
      const [staff] = await db
        .select({
          fullName: staffMembers.fullName,
          sectorId: staffMembers.sectorId,
          isOnDuty: staffMembers.isOnDuty,
        })
        .from(staffMembers)
        .where(eq(staffMembers.id, staffId))
        .limit(1);

      let sectorColor: string | null = null;
      if (staff?.sectorId) {
        const [sec] = await db
          .select({ colorHex: sectors.colorHex })
          .from(sectors)
          .where(eq(sectors.id, staff.sectorId))
          .limit(1);
        sectorColor = sec?.colorHex ?? null;
      }

      // 4. Emit to area (fire-and-forget)
      if (areaId) {
        emitToArea(areaId, 'staff:position_update', {
          staffId,
          fullName: staff?.fullName ?? '',
          lat,
          lng,
          accuracy: accuracy ?? null,
          batteryLevel: batteryLevel ?? null,
          sectorId: staff?.sectorId ?? null,
          sectorColor,
          isOnDuty: staff?.isOnDuty ?? false,
          timestamp,
        });
      }

      // 5. Return immediately
      res.json({
        success: true,
        data: { received: true },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// POST /api/tracking/location/batch — batch pings
// ============================================================
router.post(
  '/location/batch',
  verifyStaffToken,
  validate(BatchLocationsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const staffId = req.staff!.id;
      const areaId = req.staff!.areaId;
      const { locations } = req.body;

      // 1. Sort by timestamp ASC
      const sorted = [...locations].sort(
        (a: { timestamp: string }, b: { timestamp: string }) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      // 2. Bulk insert all locations
      const insertValues = sorted.map((loc: {
        lat: number;
        lng: number;
        accuracy?: number;
        speed?: number;
        bearing?: number;
        batteryLevel?: number;
        timestamp: string;
      }) => ({
        staffId,
        lat: loc.lat,
        lng: loc.lng,
        locationPoint: sql`ST_SetSRID(ST_MakePoint(${loc.lng}, ${loc.lat}), 4326)`,
        accuracy: loc.accuracy ?? null,
        speed: loc.speed ?? null,
        bearing: loc.bearing ?? null,
        batteryLevel: loc.batteryLevel ?? null,
        isOnDuty: true,
        timestamp: new Date(loc.timestamp),
      }));

      await db.insert(staffLocations).values(insertValues);

      // 3. Update last_seen_at with latest timestamp
      const latest = sorted[sorted.length - 1];
      await db
        .update(staffMembers)
        .set({ lastSeenAt: new Date(latest.timestamp) })
        .where(eq(staffMembers.id, staffId));

      // 4. Emit only latest position
      if (areaId) {
        const [staff] = await db
          .select({
            fullName: staffMembers.fullName,
            sectorId: staffMembers.sectorId,
            isOnDuty: staffMembers.isOnDuty,
          })
          .from(staffMembers)
          .where(eq(staffMembers.id, staffId))
          .limit(1);

        let sectorColor: string | null = null;
        if (staff?.sectorId) {
          const [sec] = await db
            .select({ colorHex: sectors.colorHex })
            .from(sectors)
            .where(eq(sectors.id, staff.sectorId))
            .limit(1);
          sectorColor = sec?.colorHex ?? null;
        }

        emitToArea(areaId, 'staff:position_update', {
          staffId,
          fullName: staff?.fullName ?? '',
          lat: latest.lat,
          lng: latest.lng,
          accuracy: latest.accuracy ?? null,
          batteryLevel: latest.batteryLevel ?? null,
          sectorId: staff?.sectorId ?? null,
          sectorColor,
          isOnDuty: staff?.isOnDuty ?? false,
          timestamp: latest.timestamp,
        });
      }

      // 5. Return count
      res.json({
        success: true,
        data: { processed: sorted.length, failed: 0 },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// POST /api/tracking/duty/start
// ============================================================
router.post(
  '/duty/start',
  verifyStaffToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const staffId = req.staff!.id;
      const areaId = req.staff!.areaId;

      // 1. Set on duty
      await db
        .update(staffMembers)
        .set({ isOnDuty: true })
        .where(eq(staffMembers.id, staffId));

      // 2. Get staff details with sector info
      const [staff] = await db
        .select({
          fullName: staffMembers.fullName,
          designation: staffMembers.designation,
          sectorId: staffMembers.sectorId,
        })
        .from(staffMembers)
        .where(eq(staffMembers.id, staffId))
        .limit(1);

      let sectorName: string | null = null;
      if (staff?.sectorId) {
        const [sec] = await db
          .select({ name: sectors.name })
          .from(sectors)
          .where(eq(sectors.id, staff.sectorId))
          .limit(1);
        sectorName = sec?.name ?? null;
      }

      // 3. Emit duty started
      if (areaId) {
        emitToArea(areaId, 'staff:duty_started', {
          staffId,
          fullName: staff?.fullName ?? '',
          designation: staff?.designation ?? null,
          sectorName,
          timestamp: new Date().toISOString(),
        });
      }

      // 4. Get today's duty assignment
      const todayStr = new Date().toISOString().split('T')[0];
      const todaysDuty = await getStaffMyDuty(staffId, todayStr);

      // 5. Return
      res.json({
        success: true,
        data: { todaysDuty },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// POST /api/tracking/duty/end
// ============================================================
router.post(
  '/duty/end',
  verifyStaffToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const staffId = req.staff!.id;
      const areaId = req.staff!.areaId;

      // 1. Set off duty
      await db
        .update(staffMembers)
        .set({ isOnDuty: false })
        .where(eq(staffMembers.id, staffId));

      // 2. Get name for emit
      const [staff] = await db
        .select({ fullName: staffMembers.fullName })
        .from(staffMembers)
        .where(eq(staffMembers.id, staffId))
        .limit(1);

      // 3. Emit duty ended
      if (areaId) {
        emitToArea(areaId, 'staff:duty_ended', {
          staffId,
          fullName: staff?.fullName ?? '',
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        data: null,
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// GET /api/tracking/area/:areaId/staff — staff status groups
// ============================================================
router.get(
  '/area/:areaId/staff',
  verifyDspToken,
  validateParams(AreaIdParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { areaId } = req.params;

      // Verify DSP has access to this area
      if (req.dsp!.areaId !== areaId) {
        throw AreaErrors.accessDenied();
      }

      // Check in-memory cache first (30-second TTL)
      const cached = STAFF_CACHE.get(areaId);
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return res.json({ success: true, data: cached.data, error: null, timestamp: new Date().toISOString() });
      }

      // Query the view
      const allStaff = await getStaffByArea(areaId);
      const now = Date.now();
      const fiveMin = 5 * 60 * 1000;
      const thirtyMin = 30 * 60 * 1000;

      const onDuty: typeof allStaff = [];
      const stale: typeof allStaff = [];
      const offline: typeof allStaff = [];
      const neverConnected: typeof allStaff = [];

      for (const s of allStaff) {
        const lastPing = s.last_ping_at ? new Date(s.last_ping_at).getTime() : null;

        if (lastPing === null) {
          // No location data ever
          neverConnected.push(s);
        } else if (s.is_on_duty && (now - lastPing) < fiveMin) {
          onDuty.push(s);
        } else if (s.is_on_duty && (now - lastPing) < thirtyMin) {
          stale.push(s);
        } else {
          offline.push(s);
        }
      }

      const responseData = {
        onDuty,
        stale,
        recent: [] as typeof onDuty,
        offline,
        neverConnected,
        counts: {
          onDuty: onDuty.length,
          stale: stale.length,
          offline: offline.length,
          neverConnected: neverConnected.length,
          total: allStaff.length,
        },
      };

      // Store in cache
      STAFF_CACHE.set(areaId, { data: responseData, ts: Date.now() });

      res.json({
        success: true,
        data: responseData,
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

export const trackingRouter = router;
