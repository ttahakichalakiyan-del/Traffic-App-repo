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
  const result = await db.execute<StaffWithLocation>(
    sql`SELECT * FROM v_on_duty_staff WHERE area_id = ${areaId}`,
  );
  return result.rows;
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
