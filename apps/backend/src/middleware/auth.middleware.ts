import { Request, Response, NextFunction } from 'express';
import { eq, and } from 'drizzle-orm';
import { extractTokenFromHeader, verifyToken } from '../lib/jwt';
import { AppError, AuthErrors } from '../lib/errors';
import { db } from '../db/index';
import { dspUsers, staffMembers, adminUsers, areas, sectors } from '../db/schema';

export async function verifyDspToken(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    const payload = verifyToken(token);

    if (payload.userType !== 'dsp') {
      throw AuthErrors.unauthorized();
    }

    const [dsp] = await db
      .select()
      .from(dspUsers)
      .where(eq(dspUsers.id, payload.userId))
      .limit(1);

    if (!dsp) {
      throw AuthErrors.tokenInvalid();
    }
    if (!dsp.isActive) {
      throw AuthErrors.accountDisabled();
    }

    // Find assigned area
    const [area] = await db
      .select({ id: areas.id })
      .from(areas)
      .where(and(eq(areas.dspUserId, dsp.id), eq(areas.isActive, true)))
      .limit(1);

    req.dsp = {
      id: dsp.id,
      username: dsp.username,
      fullName: dsp.fullName,
      areaId: area?.id ?? null,
    };

    next();
  } catch (err) {
    next(err);
  }
}

export async function verifyStaffToken(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    const payload = verifyToken(token);

    if (payload.userType !== 'staff') {
      throw AuthErrors.unauthorized();
    }

    const [staff] = await db
      .select()
      .from(staffMembers)
      .where(eq(staffMembers.id, payload.userId))
      .limit(1);

    if (!staff) {
      throw AuthErrors.tokenInvalid();
    }
    if (!staff.isActive) {
      throw AuthErrors.accountDisabled();
    }

    req.staff = {
      id: staff.id,
      badgeId: staff.badgeId,
      fullName: staff.fullName,
      sectorId: staff.sectorId,
      areaId: staff.areaId,
    };

    next();
  } catch (err) {
    next(err);
  }
}

export async function verifyAdminToken(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    const payload = verifyToken(token);

    if (payload.userType !== 'admin') {
      throw AuthErrors.unauthorized();
    }

    const [admin] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, payload.userId))
      .limit(1);

    if (!admin) {
      throw AuthErrors.tokenInvalid();
    }
    if (!admin.isActive) {
      throw AuthErrors.accountDisabled();
    }

    req.admin = {
      id: admin.id,
      username: admin.username,
      isSuperAdmin: admin.isSuperAdmin ?? false,
    };

    next();
  } catch (err) {
    next(err);
  }
}

export async function optionalDspToken(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.headers.authorization) {
      return next();
    }

    const token = extractTokenFromHeader(req.headers.authorization);
    const payload = verifyToken(token);

    if (payload.userType !== 'dsp') {
      return next();
    }

    const [dsp] = await db
      .select()
      .from(dspUsers)
      .where(eq(dspUsers.id, payload.userId))
      .limit(1);

    if (dsp && dsp.isActive) {
      const [area] = await db
        .select({ id: areas.id })
        .from(areas)
        .where(and(eq(areas.dspUserId, dsp.id), eq(areas.isActive, true)))
        .limit(1);

      req.dsp = {
        id: dsp.id,
        username: dsp.username,
        fullName: dsp.fullName,
        areaId: area?.id ?? null,
      };
    }

    next();
  } catch {
    // Token invalid — continue without auth
    next();
  }
}

/**
 * Combined middleware: accepts DSP OR Staff token.
 * Sets whichever payload is valid.
 */
export async function verifyAnyToken(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    const payload = verifyToken(token);

    if (payload.userType === 'dsp') {
      const [dsp] = await db
        .select()
        .from(dspUsers)
        .where(eq(dspUsers.id, payload.userId))
        .limit(1);
      if (!dsp || !dsp.isActive) throw AuthErrors.tokenInvalid();

      const [area] = await db
        .select({ id: areas.id })
        .from(areas)
        .where(and(eq(areas.dspUserId, dsp.id), eq(areas.isActive, true)))
        .limit(1);

      req.dsp = {
        id: dsp.id,
        username: dsp.username,
        fullName: dsp.fullName,
        areaId: area?.id ?? null,
      };
    } else if (payload.userType === 'staff') {
      const [staff] = await db
        .select()
        .from(staffMembers)
        .where(eq(staffMembers.id, payload.userId))
        .limit(1);
      if (!staff || !staff.isActive) throw AuthErrors.tokenInvalid();

      req.staff = {
        id: staff.id,
        badgeId: staff.badgeId,
        fullName: staff.fullName,
        sectorId: staff.sectorId,
        areaId: staff.areaId,
      };
    } else if (payload.userType === 'admin') {
      const [admin] = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.id, payload.userId))
        .limit(1);
      if (!admin || !admin.isActive) throw AuthErrors.tokenInvalid();

      req.admin = {
        id: admin.id,
        username: admin.username,
        isSuperAdmin: admin.isSuperAdmin ?? false,
      };
    } else {
      throw AuthErrors.tokenInvalid();
    }

    next();
  } catch (err) {
    next(err);
  }
}
