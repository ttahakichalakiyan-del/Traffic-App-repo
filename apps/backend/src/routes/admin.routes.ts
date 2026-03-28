import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql, count, ilike, or } from 'drizzle-orm';
import { validate } from '../middleware/validate.middleware';
import { verifyAdminToken } from '../middleware/auth.middleware';
import { hashPassword, hashPin } from '../lib/password';
import { AppError } from '../lib/errors';
import { db } from '../db/index';
import {
  dspUsers,
  areas,
  sectors,
  staffMembers,
  sessions,
  dailyRosters,
} from '../db/schema';

const router = Router();

// All admin routes require a valid admin token
router.use(verifyAdminToken);

// ============================================================
// Helper: Super admin guard
// ============================================================
function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.admin?.isSuperAdmin) {
    return next(new AppError(403, 'FORBIDDEN', 'Super admin access required'));
  }
  next();
}

// ============================================================
// In-memory cron-job last-run store
// ============================================================
const cronLastRun = new Map<string, Date | null>([
  ['traffic_collector', null],
  ['roster_reminder', null],
  ['data_cleanup', null],
  ['ml_predictions', null],
]);

export function updateCronLastRun(jobId: string) {
  cronLastRun.set(jobId, new Date());
}

// ============================================================
// Zod Schemas
// ============================================================
const CreateDspUserSchema = z.object({
  username: z.string().min(4, 'Username must be at least 4 characters'),
  fullName: z.string().min(1, 'Full name is required'),
  badgeNumber: z.string().optional(),
  rank: z.string().optional(),
  designation: z.string().optional(),
  phone: z.string().optional(),
  areaId: z.string().uuid().optional(),
});

const UpdateDspUserSchema = z.object({
  fullName: z.string().optional(),
  rank: z.string().optional(),
  designation: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});

const CreateStaffSchema = z.object({
  badgeId: z.string().min(1, 'Badge ID is required'),
  fullName: z.string().min(1, 'Full name is required'),
  rank: z.string().optional(),
  designation: z.string().optional(),
  phone: z.string().optional(),
  areaId: z.string().uuid().optional(),
  sectorId: z.string().uuid().optional(),
  pin: z
    .string()
    .length(4, 'PIN must be exactly 4 digits')
    .regex(/^\d{4}$/, 'PIN must be 4 digits'),
});

const UpdateStaffSchema = z.object({
  fullName: z.string().optional(),
  rank: z.string().optional(),
  designation: z.string().optional(),
  phone: z.string().optional(),
  areaId: z.string().uuid().nullable().optional(),
  sectorId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

const CreateAreaSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  dspUserId: z.union([z.string().uuid(), z.literal(''), z.null()]).optional().transform(v => v || null),
  colorHex: z.string().optional(),
  geoJsonPolygon: z.unknown().optional(),
});

// ─── GeoJSON Helper ──────────────────────────────────────────
// Accepts any format pasted from geojson.io:
//   - FeatureCollection  → extracts first feature's geometry
//   - Feature            → extracts geometry
//   - LineString         → auto-closes into a Polygon ring
//   - Polygon            → used as-is
// Returns a GeoJSON Polygon geometry string, or null on failure.
function normalizeToPolygonGeoJson(raw: unknown): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let geo: any = raw;

    // FeatureCollection → take first feature
    if (geo?.type === 'FeatureCollection') {
      geo = geo.features?.[0]?.geometry ?? null;
    }
    // Feature → extract geometry
    if (geo?.type === 'Feature') {
      geo = geo.geometry ?? null;
    }
    if (!geo || !geo.type) return null;

    // LineString → close the ring and wrap as Polygon
    if (geo.type === 'LineString') {
      const coords: number[][] = geo.coordinates;
      if (!coords || coords.length < 3) return null;
      // Close ring: first point === last point
      const ring = [...coords];
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push(first);
      }
      geo = { type: 'Polygon', coordinates: [ring] };
    }

    // MultiPolygon → take first polygon
    if (geo.type === 'MultiPolygon') {
      geo = { type: 'Polygon', coordinates: geo.coordinates[0] };
    }

    if (geo.type !== 'Polygon') return null;

    return JSON.stringify(geo);
  } catch {
    return null;
  }
}

const UpdateAreaSchema = z.object({
  name: z.string().optional(),
  dspUserId: z.string().uuid().nullable().optional(),
  colorHex: z.string().optional(),
  isActive: z.boolean().optional(),
  geoJsonPolygon: z.unknown().optional(),
});

const UpdateSectorSchema = z.object({
  name: z.string().optional(),
  colorHex: z.string().optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// ============================================================
// Helper: generate temp password
// ============================================================
function generateTempPassword(): string {
  return (
    Math.random().toString(36).slice(2, 6).toUpperCase() +
    Math.floor(1000 + Math.random() * 9000)
  );
}

// ============================================================
// 1. GET /api/admin/dsp-users
// ============================================================
router.get('/dsp-users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = req.query.search as string | undefined;
    const status = (req.query.status as string) || 'all';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;

    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(dspUsers.fullName, `%${search}%`),
          ilike(dspUsers.badgeNumber, `%${search}%`),
          ilike(dspUsers.username, `%${search}%`),
        ),
      );
    }

    if (status === 'active') {
      conditions.push(eq(dspUsers.isActive, true));
    } else if (status === 'inactive') {
      conditions.push(eq(dspUsers.isActive, false));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(dspUsers)
        .where(whereClause)
        .orderBy(desc(dspUsers.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(dspUsers).where(whereClause),
    ]);

    const users = rows.map(({ passwordHash, ...rest }) => rest);

    res.json({
      success: true,
      data: { users, total: Number(total), page, limit },
      error: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 2. POST /api/admin/dsp-users
// ============================================================
router.post(
  '/dsp-users',
  validate(CreateDspUserSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { username, fullName, badgeNumber, rank, designation, phone } = req.body;

      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);

      const [user] = await db
        .insert(dspUsers)
        .values({
          username: username.toLowerCase(),
          fullName,
          passwordHash,
          badgeNumber: badgeNumber ?? null,
          rank: rank ?? null,
          designation: designation ?? null,
          phone: phone ?? null,
        })
        .returning();

      res.status(201).json({
        success: true,
        data: {
          user: { id: user.id, username: user.username, fullName: user.fullName },
          tempPassword,
        },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// 3. PUT /api/admin/dsp-users/:id
// ============================================================
router.put(
  '/dsp-users/:id',
  validate(UpdateDspUserSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { fullName, rank, designation, phone, isActive } = req.body;

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (fullName !== undefined) updateData.fullName = fullName;
      if (rank !== undefined) updateData.rank = rank;
      if (designation !== undefined) updateData.designation = designation;
      if (phone !== undefined) updateData.phone = phone;
      if (isActive !== undefined) updateData.isActive = isActive;

      const [updated] = await db
        .update(dspUsers)
        .set(updateData)
        .where(eq(dspUsers.id, id))
        .returning();

      if (!updated) {
        throw new AppError(404, 'NOT_FOUND', 'DSP user not found');
      }

      const { passwordHash, ...user } = updated;

      res.json({
        success: true,
        data: { user },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// 4. POST /api/admin/dsp-users/:id/reset-password
// ============================================================
router.post(
  '/dsp-users/:id/reset-password',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);

      const [updated] = await db
        .update(dspUsers)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(dspUsers.id, id))
        .returning({ id: dspUsers.id });

      if (!updated) {
        throw new AppError(404, 'NOT_FOUND', 'DSP user not found');
      }

      res.json({
        success: true,
        data: { tempPassword },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// 5. DELETE /api/admin/dsp-users/:id (soft delete)
// ============================================================
router.delete(
  '/dsp-users/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const [updated] = await db
        .update(dspUsers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(dspUsers.id, id))
        .returning({ id: dspUsers.id });

      if (!updated) {
        throw new AppError(404, 'NOT_FOUND', 'DSP user not found');
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
// 6. GET /api/admin/areas-list
// ============================================================
router.get('/areas-list', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const areaList = await db
      .select({ id: areas.id, name: areas.name })
      .from(areas)
      .where(eq(areas.isActive, true))
      .orderBy(areas.name);

    res.json({
      success: true,
      data: { areas: areaList },
      error: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 7. GET /api/admin/staff
// ============================================================
router.get('/staff', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = req.query.search as string | undefined;
    const areaId = req.query.areaId as string | undefined;
    const sectorId = req.query.sectorId as string | undefined;
    const status = (req.query.status as string) || 'all';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;

    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(staffMembers.fullName, `%${search}%`),
          ilike(staffMembers.badgeId, `%${search}%`),
        ),
      );
    }

    if (areaId) {
      conditions.push(eq(staffMembers.areaId, areaId));
    }

    if (sectorId) {
      conditions.push(eq(staffMembers.sectorId, sectorId));
    }

    if (status === 'active') {
      conditions.push(eq(staffMembers.isActive, true));
    } else if (status === 'inactive') {
      conditions.push(eq(staffMembers.isActive, false));
    } else if (status === 'onDuty') {
      conditions.push(eq(staffMembers.isOnDuty, true));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: staffMembers.id,
          badgeId: staffMembers.badgeId,
          fullName: staffMembers.fullName,
          rank: staffMembers.rank,
          designation: staffMembers.designation,
          phone: staffMembers.phone,
          areaId: staffMembers.areaId,
          sectorId: staffMembers.sectorId,
          isActive: staffMembers.isActive,
          isOnDuty: staffMembers.isOnDuty,
          lastSeenAt: staffMembers.lastSeenAt,
          createdAt: staffMembers.createdAt,
          updatedAt: staffMembers.updatedAt,
          areaName: areas.name,
          sectorName: sectors.name,
        })
        .from(staffMembers)
        .leftJoin(areas, eq(staffMembers.areaId, areas.id))
        .leftJoin(sectors, eq(staffMembers.sectorId, sectors.id))
        .where(whereClause)
        .orderBy(desc(staffMembers.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(staffMembers).where(whereClause),
    ]);

    res.json({
      success: true,
      data: { staff: rows, total: Number(total), page, limit },
      error: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 8. POST /api/admin/staff
// ============================================================
router.post(
  '/staff',
  validate(CreateStaffSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { badgeId, fullName, rank, designation, phone, areaId, sectorId, pin } = req.body;

      // Check phone uniqueness (badge uniqueness is enforced by DB unique constraint)
      if (phone) {
        const [existing] = await db
          .select({ id: staffMembers.id })
          .from(staffMembers)
          .where(eq(staffMembers.phone, phone))
          .limit(1);
        if (existing) {
          throw new AppError(409, 'CONFLICT', 'Yeh phone number pehle se kisi staff member ke liye registered hai');
        }
      }

      const pinHash = await hashPin(pin);

      const [member] = await db
        .insert(staffMembers)
        .values({
          badgeId,
          fullName,
          pinHash,
          rank: rank ?? null,
          designation: designation ?? null,
          phone: phone ?? null,
          areaId: areaId ?? null,
          sectorId: sectorId ?? null,
        })
        .returning();

      res.status(201).json({
        success: true,
        data: {
          staff: { id: member.id, badgeId: member.badgeId, fullName: member.fullName },
        },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// 9. PUT /api/admin/staff/:id
// ============================================================
router.put(
  '/staff/:id',
  validate(UpdateStaffSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { fullName, rank, designation, phone, areaId, sectorId, isActive } = req.body;

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (fullName !== undefined) updateData.fullName = fullName;
      if (rank !== undefined) updateData.rank = rank;
      if (designation !== undefined) updateData.designation = designation;
      if (phone !== undefined) updateData.phone = phone;
      if (areaId !== undefined) updateData.areaId = areaId;
      if (sectorId !== undefined) updateData.sectorId = sectorId;
      if (isActive !== undefined) updateData.isActive = isActive;

      const [updated] = await db
        .update(staffMembers)
        .set(updateData)
        .where(eq(staffMembers.id, id))
        .returning();

      if (!updated) {
        throw new AppError(404, 'NOT_FOUND', 'Staff member not found');
      }

      const { pinHash, ...staff } = updated;

      res.json({
        success: true,
        data: { staff },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// 10. POST /api/admin/staff/:id/reset-pin
// ============================================================
router.post(
  '/staff/:id/reset-pin',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const newPin = String(Math.floor(1000 + Math.random() * 9000));
      const pinHash = await hashPin(newPin);

      const [updated] = await db
        .update(staffMembers)
        .set({ pinHash, updatedAt: new Date() })
        .where(eq(staffMembers.id, id))
        .returning({ id: staffMembers.id });

      if (!updated) {
        throw new AppError(404, 'NOT_FOUND', 'Staff member not found');
      }

      res.json({
        success: true,
        data: { newPin },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// 11. POST /api/admin/staff/bulk-import
// NOTE: must be declared before /staff/:id to avoid route conflict
// ============================================================
router.post(
  '/staff/bulk-import',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const items: Array<{
        badgeId: string;
        fullName: string;
        pin?: string;
        rank?: string;
        designation?: string;
        phone?: string;
        areaId?: string;
        sectorId?: string;
      }> = req.body;

      if (!Array.isArray(items)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Body must be an array of staff objects');
      }

      let created = 0;
      let updated = 0;
      let failed = 0;
      const errors: Array<{ index: number; badgeId?: string; error: string }> = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
          if (!item.badgeId || !item.fullName) {
            throw new Error('badgeId and fullName are required');
          }

          const [existing] = await db
            .select({ id: staffMembers.id })
            .from(staffMembers)
            .where(eq(staffMembers.badgeId, item.badgeId))
            .limit(1);

          if (existing) {
            const updateData: Record<string, unknown> = {
              fullName: item.fullName,
              updatedAt: new Date(),
            };
            if (item.rank !== undefined) updateData.rank = item.rank;
            if (item.designation !== undefined) updateData.designation = item.designation;
            if (item.phone !== undefined) updateData.phone = item.phone;
            if (item.areaId !== undefined) updateData.areaId = item.areaId;
            if (item.sectorId !== undefined) updateData.sectorId = item.sectorId;
            if (item.pin) {
              updateData.pinHash = await hashPin(item.pin);
            }

            await db
              .update(staffMembers)
              .set(updateData)
              .where(eq(staffMembers.id, existing.id));
            updated++;
          } else {
            const pin = item.pin ?? String(Math.floor(1000 + Math.random() * 9000));
            const pinHash = await hashPin(pin);

            await db.insert(staffMembers).values({
              badgeId: item.badgeId,
              fullName: item.fullName,
              pinHash,
              rank: item.rank ?? null,
              designation: item.designation ?? null,
              phone: item.phone ?? null,
              areaId: item.areaId ?? null,
              sectorId: item.sectorId ?? null,
            });
            created++;
          }
        } catch (err) {
          failed++;
          errors.push({
            index: i,
            badgeId: item.badgeId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      res.json({
        success: true,
        data: { created, updated, failed, errors },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// 12. GET /api/admin/areas
// ============================================================
router.get('/areas', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const areaRows = await db
      .select({
        id: areas.id,
        name: areas.name,
        dspUserId: areas.dspUserId,
        colorHex: areas.colorHex,
        isActive: areas.isActive,
        createdAt: areas.createdAt,
        updatedAt: areas.updatedAt,
        dspFullName: dspUsers.fullName,
        boundaryGeoJson: sql<string | null>`ST_AsGeoJSON(${areas.boundary})`,
      })
      .from(areas)
      .leftJoin(dspUsers, eq(areas.dspUserId, dspUsers.id))
      .orderBy(areas.name);

    // Count sectors per area
    const sectorCounts = await db
      .select({
        areaId: sectors.areaId,
        sectorCount: count(),
      })
      .from(sectors)
      .groupBy(sectors.areaId);

    const sectorCountMap = new Map(
      sectorCounts.map((r) => [r.areaId, Number(r.sectorCount)]),
    );

    const enriched = areaRows.map((area) => ({
      ...area,
      sectorCount: sectorCountMap.get(area.id) ?? 0,
    }));

    res.json({
      success: true,
      data: { areas: enriched },
      error: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 13. POST /api/admin/areas
// ============================================================
router.post(
  '/areas',
  validate(CreateAreaSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, dspUserId, colorHex, geoJsonPolygon } = req.body;

      const normalizedGeo = geoJsonPolygon ? normalizeToPolygonGeoJson(geoJsonPolygon) : null;
      const boundaryValue = normalizedGeo
        ? sql`ST_GeomFromGeoJSON(${normalizedGeo})`
        : sql`ST_GeomFromText('POLYGON((0 0,0 1,1 1,1 0,0 0))', 4326)`;

      const [area] = await db
        .insert(areas)
        .values({
          name,
          dspUserId: dspUserId ?? null,
          colorHex: colorHex ?? '#2563EB',
          boundary: boundaryValue as unknown as string,
        })
        .returning({
          id: areas.id,
          name: areas.name,
          colorHex: areas.colorHex,
          isActive: areas.isActive,
          dspUserId: areas.dspUserId,
          createdAt: areas.createdAt,
          updatedAt: areas.updatedAt,
        });

      // Auto-create 3 default sectors
      const defaultSectors = await db
        .insert(sectors)
        .values([
          { areaId: area.id, name: 'Sector A', displayOrder: 1 },
          { areaId: area.id, name: 'Sector B', displayOrder: 2 },
          { areaId: area.id, name: 'Sector C', displayOrder: 3 },
        ])
        .returning();

      res.status(201).json({
        success: true,
        data: { area, sectors: defaultSectors },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// 14. PUT /api/admin/areas/:id
// ============================================================
router.put(
  '/areas/:id',
  validate(UpdateAreaSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, dspUserId, colorHex, isActive, geoJsonPolygon } = req.body;

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) updateData.name = name;
      if (dspUserId !== undefined) updateData.dspUserId = dspUserId;
      if (colorHex !== undefined) updateData.colorHex = colorHex;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (geoJsonPolygon !== undefined) {
        const normalizedGeo = normalizeToPolygonGeoJson(geoJsonPolygon);
        if (normalizedGeo) {
          updateData.boundary = sql`ST_GeomFromGeoJSON(${normalizedGeo})`;
        }
      }

      const [updated] = await db
        .update(areas)
        .set(updateData)
        .where(eq(areas.id, id))
        .returning({
          id: areas.id,
          name: areas.name,
          colorHex: areas.colorHex,
          isActive: areas.isActive,
          dspUserId: areas.dspUserId,
          updatedAt: areas.updatedAt,
        });

      if (!updated) {
        throw new AppError(404, 'NOT_FOUND', 'Area not found');
      }

      res.json({
        success: true,
        data: { area: updated },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// 15. GET /api/admin/areas/:id/sectors
// ============================================================
router.get(
  '/areas/:id/sectors',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const sectorList = await db
        .select()
        .from(sectors)
        .where(eq(sectors.areaId, id))
        .orderBy(sectors.displayOrder);

      res.json({
        success: true,
        data: { sectors: sectorList },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// 16. PUT /api/admin/sectors/:id
// ============================================================
router.put(
  '/sectors/:id',
  validate(UpdateSectorSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, colorHex, displayOrder, isActive } = req.body;

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (colorHex !== undefined) updateData.colorHex = colorHex;
      if (displayOrder !== undefined) updateData.displayOrder = displayOrder;
      if (isActive !== undefined) updateData.isActive = isActive;

      const [updated] = await db
        .update(sectors)
        .set(updateData)
        .where(eq(sectors.id, id))
        .returning();

      if (!updated) {
        throw new AppError(404, 'NOT_FOUND', 'Sector not found');
      }

      res.json({
        success: true,
        data: { sector: updated },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// 17. GET /api/admin/rosters
// ============================================================
router.get('/rosters', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const date = (req.query.date as string) || today;
    const dspId = req.query.dspId as string | undefined;

    const conditions: ReturnType<typeof eq>[] = [eq(dailyRosters.rosterDate, date)];

    if (dspId) {
      conditions.push(eq(dailyRosters.createdByDspId, dspId));
    }

    const rosters = await db
      .select({
        id: dailyRosters.id,
        sectorId: dailyRosters.sectorId,
        rosterDate: dailyRosters.rosterDate,
        status: dailyRosters.status,
        createdByDspId: dailyRosters.createdByDspId,
        publishedAt: dailyRosters.publishedAt,
        notes: dailyRosters.notes,
        totalStaffCount: dailyRosters.totalStaffCount,
        assignedStaffCount: dailyRosters.assignedStaffCount,
        createdAt: dailyRosters.createdAt,
        updatedAt: dailyRosters.updatedAt,
        sectorName: sectors.name,
        areaId: sectors.areaId,
        areaName: areas.name,
      })
      .from(dailyRosters)
      .leftJoin(sectors, eq(dailyRosters.sectorId, sectors.id))
      .leftJoin(areas, eq(sectors.areaId, areas.id))
      .where(and(...conditions))
      .orderBy(areas.name, sectors.displayOrder);

    res.json({
      success: true,
      data: { date, rosters },
      error: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 18. GET /api/admin/system/sessions
// ============================================================
router.get('/system/sessions', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionList = await db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        userType: sessions.userType,
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .orderBy(desc(sessions.createdAt));

    res.json({
      success: true,
      data: { sessions: sessionList },
      error: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 19. DELETE /api/admin/system/sessions/:userId
// Super admin only
// ============================================================
router.delete(
  '/system/sessions/:userId',
  requireSuperAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;

      const deleted = await db
        .delete(sessions)
        .where(eq(sessions.userId, userId))
        .returning({ id: sessions.id });

      res.json({
        success: true,
        data: { deleted: deleted.length },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// 20. GET /api/admin/system/stats
// Super admin only
// ============================================================
router.get(
  '/system/stats',
  requireSuperAdmin,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const tableNames = [
        'staff_locations',
        'traffic_snapshots',
        'predictions',
        'roster_entries',
        'sessions',
      ];

      let tables: Array<{ name: string; rowCount: number; size: string }> = [];

      try {
        const rowCountResult = await db.execute(
          sql`
            SELECT relname AS name, n_live_tup AS row_count
            FROM pg_stat_user_tables
            WHERE relname = ANY(${tableNames})
          `,
        );

        const sizeResult = await db.execute(
          sql`
            SELECT relname AS name, pg_size_pretty(pg_total_relation_size(quote_ident(relname))) AS size
            FROM pg_stat_user_tables
            WHERE relname = ANY(${tableNames})
          `,
        );

        const sizeMap = new Map<string, string>(
          (sizeResult.rows as Array<{ name: string; size: string }>).map((r) => [r.name, r.size]),
        );

        tables = (rowCountResult.rows as Array<{ name: string; row_count: string | number }>).map(
          (r) => ({
            name: r.name,
            rowCount: Number(r.row_count),
            size: sizeMap.get(r.name) ?? 'unknown',
          }),
        );
      } catch {
        // Return empty array on error
        tables = [];
      }

      res.json({
        success: true,
        data: { tables },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// 21. GET /api/admin/system/cron-status
// ============================================================
router.get('/system/cron-status', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const jobs = [
      {
        id: 'traffic_collector',
        name: 'Traffic Collector',
        schedule: 'Every 15 minutes',
        lastRun: cronLastRun.get('traffic_collector')?.toISOString() ?? null,
        status: cronLastRun.get('traffic_collector') ? 'completed' : 'pending',
      },
      {
        id: 'roster_reminder',
        name: 'Roster Reminder',
        schedule: '8:00 PM daily',
        lastRun: cronLastRun.get('roster_reminder')?.toISOString() ?? null,
        status: cronLastRun.get('roster_reminder') ? 'completed' : 'pending',
      },
      {
        id: 'data_cleanup',
        name: 'Data Cleanup',
        schedule: '2:00 AM daily',
        lastRun: cronLastRun.get('data_cleanup')?.toISOString() ?? null,
        status: cronLastRun.get('data_cleanup') ? 'completed' : 'pending',
      },
      {
        id: 'ml_predictions',
        name: 'ML Predictions',
        schedule: '8:00 PM daily',
        lastRun: cronLastRun.get('ml_predictions')?.toISOString() ?? null,
        status: cronLastRun.get('ml_predictions') ? 'completed' : 'pending',
      },
    ];

    res.json({
      success: true,
      data: { jobs },
      error: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export const adminRouter = router;
