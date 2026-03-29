import { Router, Request, Response, NextFunction } from 'express';
import { eq, and, desc, sql } from 'drizzle-orm';
import { verifyDspToken } from '../middleware/auth.middleware';
import { db } from '../db';
import {
  staffMembers,
  sectors,
  rosterEntries,
  dailyRosters,
  dutyCategories,
} from '../db/schema';

const router = Router();

// ── Helper ─────────────────────────────────────────────────
function ok(res: Response, data: unknown) {
  res.json({ success: true, data, error: null, timestamp: new Date().toISOString() });
}

// ── GET /api/staff ──────────────────────────────────────────
// All active staff for DSP's area with latest location + today's duty
router.get('/', verifyDspToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // areaId from verifyDspToken middleware (req.dsp) — query param as fallback
    const dspAreaId = req.dsp?.areaId ?? (req.query.areaId as string | undefined);

    if (!dspAreaId) {
      return ok(res, []);
    }

    const today = new Date().toISOString().slice(0, 10);

    const staff = await db
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
        sectorName: sectors.name,
        sectorColor: sectors.colorHex,
        // Latest location (correlated subqueries — avoids complex lateral join)
        lat: sql<number | null>`(
          SELECT sl.lat FROM staff_locations sl
          WHERE sl.staff_id = ${staffMembers.id}
          ORDER BY sl.timestamp DESC LIMIT 1
        )`,
        lng: sql<number | null>`(
          SELECT sl.lng FROM staff_locations sl
          WHERE sl.staff_id = ${staffMembers.id}
          ORDER BY sl.timestamp DESC LIMIT 1
        )`,
        accuracy: sql<number | null>`(
          SELECT sl.accuracy FROM staff_locations sl
          WHERE sl.staff_id = ${staffMembers.id}
          ORDER BY sl.timestamp DESC LIMIT 1
        )`,
        batteryLevel: sql<number | null>`(
          SELECT sl.battery_level FROM staff_locations sl
          WHERE sl.staff_id = ${staffMembers.id}
          ORDER BY sl.timestamp DESC LIMIT 1
        )`,
        // Today's duty from roster
        dutyCategory: sql<string | null>`(
          SELECT dc.name FROM roster_entries re
          JOIN daily_rosters dr ON re.roster_id = dr.id
          JOIN duty_categories dc ON re.duty_category_id = dc.id
          WHERE re.staff_id = ${staffMembers.id} AND dr.roster_date = ${today}
          LIMIT 1
        )`,
        dutyCategoryUrdu: sql<string | null>`(
          SELECT dc.name_urdu FROM roster_entries re
          JOIN daily_rosters dr ON re.roster_id = dr.id
          JOIN duty_categories dc ON re.duty_category_id = dc.id
          WHERE re.staff_id = ${staffMembers.id} AND dr.roster_date = ${today}
          LIMIT 1
        )`,
        dutyLocation: sql<string | null>`(
          SELECT re.duty_location FROM roster_entries re
          JOIN daily_rosters dr ON re.roster_id = dr.id
          WHERE re.staff_id = ${staffMembers.id} AND dr.roster_date = ${today}
          LIMIT 1
        )`,
        beatRoute: sql<string | null>`(
          SELECT re.beat_route FROM roster_entries re
          JOIN daily_rosters dr ON re.roster_id = dr.id
          WHERE re.staff_id = ${staffMembers.id} AND dr.roster_date = ${today}
          LIMIT 1
        )`,
        shiftStart: sql<string | null>`(
          SELECT re.shift_start FROM roster_entries re
          JOIN daily_rosters dr ON re.roster_id = dr.id
          WHERE re.staff_id = ${staffMembers.id} AND dr.roster_date = ${today}
          LIMIT 1
        )`,
        shiftEnd: sql<string | null>`(
          SELECT re.shift_end FROM roster_entries re
          JOIN daily_rosters dr ON re.roster_id = dr.id
          WHERE re.staff_id = ${staffMembers.id} AND dr.roster_date = ${today}
          LIMIT 1
        )`,
      })
      .from(staffMembers)
      .leftJoin(sectors, eq(staffMembers.sectorId, sectors.id))
      .where(
        and(
          eq(staffMembers.areaId, dspAreaId),
          eq(staffMembers.isActive, true),
        ),
      )
      .orderBy(staffMembers.fullName);

    return ok(res, staff);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/staff/:staffId ─────────────────────────────────
// Single staff detail with duty history (last 7 days)
router.get('/:staffId', verifyDspToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { staffId } = req.params;
    const today = new Date().toISOString().slice(0, 10);

    const [member] = await db
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
        deviceInfo: staffMembers.deviceInfo,
        createdAt: staffMembers.createdAt,
        updatedAt: staffMembers.updatedAt,
        sectorName: sectors.name,
        sectorColor: sectors.colorHex,
        lat: sql<number | null>`(
          SELECT sl.lat FROM staff_locations sl
          WHERE sl.staff_id = ${staffMembers.id}
          ORDER BY sl.timestamp DESC LIMIT 1
        )`,
        lng: sql<number | null>`(
          SELECT sl.lng FROM staff_locations sl
          WHERE sl.staff_id = ${staffMembers.id}
          ORDER BY sl.timestamp DESC LIMIT 1
        )`,
        accuracy: sql<number | null>`(
          SELECT sl.accuracy FROM staff_locations sl
          WHERE sl.staff_id = ${staffMembers.id}
          ORDER BY sl.timestamp DESC LIMIT 1
        )`,
        batteryLevel: sql<number | null>`(
          SELECT sl.battery_level FROM staff_locations sl
          WHERE sl.staff_id = ${staffMembers.id}
          ORDER BY sl.timestamp DESC LIMIT 1
        )`,
        dutyCategory: sql<string | null>`(
          SELECT dc.name FROM roster_entries re
          JOIN daily_rosters dr ON re.roster_id = dr.id
          JOIN duty_categories dc ON re.duty_category_id = dc.id
          WHERE re.staff_id = ${staffMembers.id} AND dr.roster_date = ${today}
          LIMIT 1
        )`,
        dutyCategoryUrdu: sql<string | null>`(
          SELECT dc.name_urdu FROM roster_entries re
          JOIN daily_rosters dr ON re.roster_id = dr.id
          JOIN duty_categories dc ON re.duty_category_id = dc.id
          WHERE re.staff_id = ${staffMembers.id} AND dr.roster_date = ${today}
          LIMIT 1
        )`,
        dutyLocation: sql<string | null>`(
          SELECT re.duty_location FROM roster_entries re
          JOIN daily_rosters dr ON re.roster_id = dr.id
          WHERE re.staff_id = ${staffMembers.id} AND dr.roster_date = ${today}
          LIMIT 1
        )`,
        beatRoute: sql<string | null>`(
          SELECT re.beat_route FROM roster_entries re
          JOIN daily_rosters dr ON re.roster_id = dr.id
          WHERE re.staff_id = ${staffMembers.id} AND dr.roster_date = ${today}
          LIMIT 1
        )`,
        shiftStart: sql<string | null>`(
          SELECT re.shift_start FROM roster_entries re
          JOIN daily_rosters dr ON re.roster_id = dr.id
          WHERE re.staff_id = ${staffMembers.id} AND dr.roster_date = ${today}
          LIMIT 1
        )`,
        shiftEnd: sql<string | null>`(
          SELECT re.shift_end FROM roster_entries re
          JOIN daily_rosters dr ON re.roster_id = dr.id
          WHERE re.staff_id = ${staffMembers.id} AND dr.roster_date = ${today}
          LIMIT 1
        )`,
      })
      .from(staffMembers)
      .leftJoin(sectors, eq(staffMembers.sectorId, sectors.id))
      .where(eq(staffMembers.id, staffId));

    if (!member) {
      return res.status(404).json({
        success: false,
        data: null,
        error: { message: 'Staff not found' },
        timestamp: new Date().toISOString(),
      });
    }

    // Last 7 days duty history
    const dutyHistory = await db
      .select({
        date: dailyRosters.rosterDate,
        category: dutyCategories.name,
        categoryUrdu: dutyCategories.nameUrdu,
        location: rosterEntries.dutyLocation,
        shiftStart: rosterEntries.shiftStart,
        shiftEnd: rosterEntries.shiftEnd,
      })
      .from(rosterEntries)
      .innerJoin(dailyRosters, eq(rosterEntries.rosterId, dailyRosters.id))
      .leftJoin(dutyCategories, eq(rosterEntries.dutyCategoryId, dutyCategories.id))
      .where(eq(rosterEntries.staffId, staffId))
      .orderBy(desc(dailyRosters.rosterDate))
      .limit(7);

    return ok(res, { ...member, dutyHistory });
  } catch (err) {
    next(err);
  }
});

export const staffRouter = router;
