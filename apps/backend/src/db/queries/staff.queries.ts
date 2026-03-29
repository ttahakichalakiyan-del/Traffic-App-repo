import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { db } from '../index';
import {
  staffMembers,
  staffLocations,
  rosterEntries,
  dailyRosters,
  dutyCategories,
  sectors,
} from '../schema';
import type { StaffMember, StaffLocation, RosterEntry } from '../schema';

// ============================================================
// Types
// ============================================================

export interface StaffWithLocation {
  [key: string]: unknown;
  staff_id: string;
  badge_id: string;
  full_name: string;
  rank: string | null;
  designation: string | null;
  phone: string | null;
  device_token: string | null;
  is_on_duty: boolean | null;
  last_seen_at: Date | null;
  area_id: string | null;
  sector_id: string | null;
  sector_name: string | null;
  sector_color: string | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  battery_level: number | null;
  last_ping_at: Date | null;
  minutes_since_ping: number | null;
  is_location_stale: boolean | null;
  duty_category_id: string | null;
  duty_category_name: string | null;
  todays_duty_location: string | null;
  beat_route: string | null;
  shift_start: string | null;
  shift_end: string | null;
}

export interface StaffDetail {
  staff: StaffMember;
  recentLocations: StaffLocation[];
  recentRosterEntries: Array<{
    entry: RosterEntry;
    categoryName: string | null;
    rosterDate: string;
  }>;
}

export type OnDutyStaff = StaffWithLocation;

// ============================================================
// Queries
// ============================================================

export async function getStaffByArea(areaId: string): Promise<StaffWithLocation[]> {
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({
      staff_id: staffMembers.id,
      badge_id: staffMembers.badgeId,
      full_name: staffMembers.fullName,
      rank: staffMembers.rank,
      designation: staffMembers.designation,
      phone: staffMembers.phone,
      device_token: staffMembers.deviceToken,
      is_on_duty: staffMembers.isOnDuty,
      last_seen_at: staffMembers.lastSeenAt,
      area_id: staffMembers.areaId,
      sector_id: staffMembers.sectorId,
      sector_name: sectors.name,
      sector_color: sectors.colorHex,
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
      battery_level: sql<number | null>`(
        SELECT sl.battery_level FROM staff_locations sl
        WHERE sl.staff_id = ${staffMembers.id}
        ORDER BY sl.timestamp DESC LIMIT 1
      )`,
      last_ping_at: sql<Date | null>`(
        SELECT sl.timestamp FROM staff_locations sl
        WHERE sl.staff_id = ${staffMembers.id}
        ORDER BY sl.timestamp DESC LIMIT 1
      )`,
      minutes_since_ping: sql<number | null>`(
        SELECT EXTRACT(EPOCH FROM (NOW() - sl.timestamp)) / 60
        FROM staff_locations sl
        WHERE sl.staff_id = ${staffMembers.id}
        ORDER BY sl.timestamp DESC LIMIT 1
      )`,
      is_location_stale: sql<boolean | null>`(
        SELECT (NOW() - sl.timestamp) > INTERVAL '5 minutes'
        FROM staff_locations sl
        WHERE sl.staff_id = ${staffMembers.id}
        ORDER BY sl.timestamp DESC LIMIT 1
      )`,
      duty_category_id: sql<string | null>`(
        SELECT re.duty_category_id FROM roster_entries re
        JOIN daily_rosters dr ON re.roster_id = dr.id
        WHERE re.staff_id = ${staffMembers.id} AND dr.roster_date = ${today}
        LIMIT 1
      )`,
      duty_category_name: sql<string | null>`(
        SELECT dc.name FROM roster_entries re
        JOIN daily_rosters dr ON re.roster_id = dr.id
        JOIN duty_categories dc ON re.duty_category_id = dc.id
        WHERE re.staff_id = ${staffMembers.id} AND dr.roster_date = ${today}
        LIMIT 1
      )`,
      todays_duty_location: sql<string | null>`(
        SELECT re.duty_location FROM roster_entries re
        JOIN daily_rosters dr ON re.roster_id = dr.id
        WHERE re.staff_id = ${staffMembers.id} AND dr.roster_date = ${today}
        LIMIT 1
      )`,
      beat_route: sql<string | null>`(
        SELECT re.beat_route FROM roster_entries re
        JOIN daily_rosters dr ON re.roster_id = dr.id
        WHERE re.staff_id = ${staffMembers.id} AND dr.roster_date = ${today}
        LIMIT 1
      )`,
      shift_start: sql<string | null>`(
        SELECT re.shift_start::text FROM roster_entries re
        JOIN daily_rosters dr ON re.roster_id = dr.id
        WHERE re.staff_id = ${staffMembers.id} AND dr.roster_date = ${today}
        LIMIT 1
      )`,
      shift_end: sql<string | null>`(
        SELECT re.shift_end::text FROM roster_entries re
        JOIN daily_rosters dr ON re.roster_id = dr.id
        WHERE re.staff_id = ${staffMembers.id} AND dr.roster_date = ${today}
        LIMIT 1
      )`,
    })
    .from(staffMembers)
    .leftJoin(sectors, eq(staffMembers.sectorId, sectors.id))
    .where(and(eq(staffMembers.areaId, areaId), eq(staffMembers.isActive, true)));

  return rows as unknown as StaffWithLocation[];
}

export async function getStaffDetail(staffId: string): Promise<StaffDetail> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [staffResult, locationsResult, entriesResult] = await Promise.all([
    db
      .select()
      .from(staffMembers)
      .where(eq(staffMembers.id, staffId))
      .limit(1),
    db
      .select()
      .from(staffLocations)
      .where(
        and(
          eq(staffLocations.staffId, staffId),
          gte(staffLocations.timestamp, oneDayAgo),
        ),
      )
      .orderBy(desc(staffLocations.timestamp))
      .limit(200),
    db
      .select({
        entry: rosterEntries,
        categoryName: dutyCategories.name,
        rosterDate: dailyRosters.rosterDate,
      })
      .from(rosterEntries)
      .innerJoin(dailyRosters, eq(rosterEntries.rosterId, dailyRosters.id))
      .leftJoin(dutyCategories, eq(rosterEntries.dutyCategoryId, dutyCategories.id))
      .where(
        and(
          eq(rosterEntries.staffId, staffId),
          gte(dailyRosters.rosterDate, sevenDaysAgo.toISOString().split('T')[0]),
        ),
      )
      .orderBy(desc(dailyRosters.rosterDate)),
  ]);

  if (staffResult.length === 0) {
    throw new Error('STAFF_NOT_FOUND');
  }

  return {
    staff: staffResult[0],
    recentLocations: locationsResult,
    recentRosterEntries: entriesResult,
  };
}

export async function getOnDutyStaff(areaId: string): Promise<OnDutyStaff[]> {
  const result = await db.execute<OnDutyStaff>(
    sql`SELECT * FROM v_on_duty_staff WHERE area_id = ${areaId} AND is_on_duty = true`,
  );
  return result.rows;
}

export async function updateStaffSector(staffId: string, sectorId: string): Promise<void> {
  await db
    .update(staffMembers)
    .set({ sectorId })
    .where(eq(staffMembers.id, staffId));
}

export async function getStaffMyDuty(
  staffId: string,
  date: string,
): Promise<RosterEntry | null> {
  const result = await db
    .select({ entry: rosterEntries })
    .from(rosterEntries)
    .innerJoin(dailyRosters, eq(rosterEntries.rosterId, dailyRosters.id))
    .where(
      and(
        eq(rosterEntries.staffId, staffId),
        eq(dailyRosters.rosterDate, date),
        eq(dailyRosters.status, 'published'),
      ),
    )
    .limit(1);

  return result.length > 0 ? result[0].entry : null;
}
