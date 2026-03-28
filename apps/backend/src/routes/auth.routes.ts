import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { validate } from '../middleware/validate.middleware';
import { verifyDspToken, verifyStaffToken, verifyAnyToken } from '../middleware/auth.middleware';
import { signToken, verifyToken, extractTokenFromHeader } from '../lib/jwt';
import { comparePassword, hashPassword, comparePin, hashPin, sha256 } from '../lib/password';
import { AppError, AuthErrors } from '../lib/errors';
import { db } from '../db/index';
import { dspUsers, staffMembers, sessions, areas, adminUsers } from '../db/schema';

const router = Router();

// ============================================================
// Zod Schemas
// ============================================================

const DeviceInfoSchema = z
  .object({
    platform: z.string().optional(),
    model: z.string().optional(),
    os: z.string().optional(),
    fingerprint: z.string().optional(),
  })
  .optional();

const DspLoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  deviceInfo: DeviceInfoSchema,
});

const StaffLoginSchema = z.object({
  badgeId: z.string().min(1, 'Badge ID is required'),
  pin: z
    .string()
    .length(4, 'PIN must be 4 digits')
    .regex(/^\d{4}$/, 'PIN must be 4 digits'),
  deviceInfo: DeviceInfoSchema,
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

const ChangePinSchema = z.object({
  currentPin: z.string().length(4).regex(/^\d{4}$/),
  newPin: z.string().length(4).regex(/^\d{4}$/),
});

// ============================================================
// POST /api/auth/dsp/login
// ============================================================
router.post(
  '/dsp/login',
  validate(DspLoginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { username, password, deviceInfo } = req.body;

      // Find DSP by username (case-insensitive)
      const [dsp] = await db
        .select()
        .from(dspUsers)
        .where(sql`LOWER(${dspUsers.username}) = LOWER(${username})`)
        .limit(1);

      if (!dsp) {
        throw AuthErrors.invalidCredentials();
      }

      if (!dsp.isActive) {
        throw AuthErrors.accountDisabled();
      }

      const valid = await comparePassword(password, dsp.passwordHash);
      if (!valid) {
        throw AuthErrors.invalidCredentials();
      }

      // Find assigned area
      const [area] = await db
        .select({ id: areas.id })
        .from(areas)
        .where(eq(areas.dspUserId, dsp.id))
        .limit(1);

      // Sign JWT
      const token = signToken(
        { userId: dsp.id, userType: 'dsp', areaId: area?.id },
        '30d',
      );

      // Save session
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      await db.insert(sessions).values({
        userId: dsp.id,
        userType: 'dsp',
        tokenHash: sha256(token),
        deviceFingerprint: deviceInfo?.fingerprint ?? null,
        expiresAt,
      });

      // Update last_login
      await db
        .update(dspUsers)
        .set({ lastLogin: new Date() })
        .where(eq(dspUsers.id, dsp.id));

      res.json({
        success: true,
        data: {
          token,
          expiresIn: '30d',
          user: {
            id: dsp.id,
            username: dsp.username,
            fullName: dsp.fullName,
            badgeNumber: dsp.badgeNumber,
            rank: dsp.rank,
            designation: dsp.designation,
          },
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
// POST /api/auth/staff/login
// ============================================================
router.post(
  '/staff/login',
  validate(StaffLoginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { badgeId, pin, deviceInfo } = req.body;

      const [staff] = await db
        .select()
        .from(staffMembers)
        .where(eq(staffMembers.badgeId, badgeId))
        .limit(1);

      if (!staff) {
        throw AuthErrors.invalidCredentials();
      }

      if (!staff.isActive) {
        throw AuthErrors.accountDisabled();
      }

      const valid = await comparePin(pin, staff.pinHash);
      if (!valid) {
        throw AuthErrors.invalidCredentials();
      }

      const token = signToken(
        { userId: staff.id, userType: 'staff', areaId: staff.areaId ?? undefined },
        '90d',
      );

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);

      await db.insert(sessions).values({
        userId: staff.id,
        userType: 'staff',
        tokenHash: sha256(token),
        deviceFingerprint: deviceInfo?.fingerprint ?? null,
        expiresAt,
      });

      // Update device token if provided
      if (deviceInfo) {
        await db
          .update(staffMembers)
          .set({ deviceInfo: deviceInfo as Record<string, unknown> })
          .where(eq(staffMembers.id, staff.id));
      }

      res.json({
        success: true,
        data: {
          token,
          expiresIn: '90d',
          user: {
            id: staff.id,
            badgeId: staff.badgeId,
            fullName: staff.fullName,
            rank: staff.rank,
            designation: staff.designation,
            sectorId: staff.sectorId,
            areaId: staff.areaId,
          },
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
// POST /api/auth/logout
// ============================================================
router.post(
  '/logout',
  verifyAnyToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = extractTokenFromHeader(req.headers.authorization);
      const tokenHash = sha256(token);

      await db
        .delete(sessions)
        .where(eq(sessions.tokenHash, tokenHash));

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
// POST /api/auth/change-password (DSP only)
// ============================================================
router.post(
  '/change-password',
  verifyDspToken,
  validate(ChangePasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const dspId = req.dsp!.id;

      const [dsp] = await db
        .select()
        .from(dspUsers)
        .where(eq(dspUsers.id, dspId))
        .limit(1);

      if (!dsp) {
        throw AuthErrors.tokenInvalid();
      }

      const valid = await comparePassword(currentPassword, dsp.passwordHash);
      if (!valid) {
        throw AuthErrors.wrongPassword();
      }

      const newHash = await hashPassword(newPassword);
      await db
        .update(dspUsers)
        .set({ passwordHash: newHash })
        .where(eq(dspUsers.id, dspId));

      // Invalidate all other sessions
      const currentToken = extractTokenFromHeader(req.headers.authorization);
      const currentHash = sha256(currentToken);

      await db
        .delete(sessions)
        .where(
          and(
            eq(sessions.userId, dspId),
            eq(sessions.userType, 'dsp'),
          ),
        );

      // Re-create current session
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      await db.insert(sessions).values({
        userId: dspId,
        userType: 'dsp',
        tokenHash: currentHash,
        expiresAt,
      });

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
// POST /api/auth/change-pin (Staff only)
// ============================================================
router.post(
  '/change-pin',
  verifyStaffToken,
  validate(ChangePinSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPin, newPin } = req.body;
      const staffId = req.staff!.id;

      const [staff] = await db
        .select()
        .from(staffMembers)
        .where(eq(staffMembers.id, staffId))
        .limit(1);

      if (!staff) {
        throw AuthErrors.tokenInvalid();
      }

      const valid = await comparePin(currentPin, staff.pinHash);
      if (!valid) {
        throw AuthErrors.wrongPin();
      }

      const newHash = await hashPin(newPin);
      await db
        .update(staffMembers)
        .set({ pinHash: newHash })
        .where(eq(staffMembers.id, staffId));

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
// GET /api/auth/me
// ============================================================
router.get(
  '/me',
  verifyAnyToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let profile: Record<string, unknown> | null = null;
      let refreshedToken: string | undefined;

      // Check if token needs refresh (expires within 7 days)
      const token = extractTokenFromHeader(req.headers.authorization);
      const payload = verifyToken(token);
      if (payload.exp) {
        const daysUntilExpiry = (payload.exp * 1000 - Date.now()) / (1000 * 60 * 60 * 24);
        if (daysUntilExpiry < 7) {
          const expiresIn = payload.userType === 'staff' ? '90d' : '30d';
          refreshedToken = signToken(
            { userId: payload.userId, userType: payload.userType, areaId: payload.areaId },
            expiresIn,
          );
        }
      }

      if (req.dsp) {
        const [dsp] = await db
          .select()
          .from(dspUsers)
          .where(eq(dspUsers.id, req.dsp.id))
          .limit(1);
        if (dsp) {
          const { passwordHash, ...rest } = dsp;
          profile = rest;
        }
      } else if (req.staff) {
        const [staff] = await db
          .select()
          .from(staffMembers)
          .where(eq(staffMembers.id, req.staff.id))
          .limit(1);
        if (staff) {
          const { pinHash, ...rest } = staff;
          profile = rest;
        }
      } else if (req.admin) {
        const [admin] = await db
          .select()
          .from(adminUsers)
          .where(eq(adminUsers.id, req.admin.id))
          .limit(1);
        if (admin) {
          const { passwordHash, ...rest } = admin;
          profile = rest;
        }
      }

      res.json({
        success: true,
        data: {
          profile,
          ...(refreshedToken ? { refreshedToken } : {}),
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
// POST /api/auth/admin/login
// ============================================================
const AdminLoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

router.post(
  '/admin/login',
  validate(AdminLoginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { username, password } = req.body;

      // Find admin by username (case-insensitive)
      const [admin] = await db
        .select()
        .from(adminUsers)
        .where(sql`LOWER(${adminUsers.username}) = LOWER(${username})`)
        .limit(1);

      if (!admin) {
        throw AuthErrors.invalidCredentials();
      }

      if (!admin.isActive) {
        throw AuthErrors.accountDisabled();
      }

      const valid = await comparePassword(password, admin.passwordHash);
      if (!valid) {
        throw AuthErrors.invalidCredentials();
      }

      const token = signToken(
        { userId: admin.id, userType: 'admin' },
        '8h',
      );

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 8);

      await db.insert(sessions).values({
        userId: admin.id,
        userType: 'admin',
        tokenHash: sha256(token),
        deviceFingerprint: null,
        expiresAt,
      });

      res.json({
        success: true,
        data: {
          token,
          expiresIn: '8h',
          user: {
            id: admin.id,
            username: admin.username,
            fullName: admin.fullName,
            isSuperAdmin: admin.isSuperAdmin,
          },
        },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

export const authRouter = router;
