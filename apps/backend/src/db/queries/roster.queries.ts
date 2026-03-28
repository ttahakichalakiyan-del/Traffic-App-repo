import { eq, and, desc, gte, sql, lte } from 'drizzle-orm';
import { db } from '../index';
import {
  dailyRosters,
  rosterEntries,
  staffMembers,
  dutyCategories,
  sectors,
} from '../schema';
import type {
  DailyRoster,
  RosterEntry,
  StaffMember,
  DutyCategory,
} from '../schema';

// ============================================================
// Types
// ============================================================

export interface RosterSummary {
  sector_id: string;
  sector_name: string;
  sector_color: string;
  roster_id: string | null;
  status: string;
  published_at: Date | null;
  total_staff: number;
  assigned_count: number;
  unassigned_count: number;
  category_breakdown: Array<{ name: string; count: number }>;
  unassigned_staff: Array<{
    staff_id: string;
    badge_id: string;
    full_name: string;
    rank: string | null;
  }>;
}

export interface RosterWithEntries {
  roster: DailyRoster;
  sectorName: string;
  sectorColor: string | null;
  entries: Array<{
    entry: RosterEntry;
    staff: StaffMember;
    dutyCategory: DutyCategory | null;
  }>;
}

export interface RosterHistory {
  date: string;
  sectors: Array<{
    sectorId: string;
    sectorName: string;
    status: string;
    assignedCount: number;
    totalCount: number;
  }>;
}

export interface AssignStaffParams {
  rosterId: string;
  staffId: string;
  categoryId: string;
  location?: string;
  notes?: string;
  shiftStart?: string;
  shiftEnd?: string;
}

export interface AssignResult {
  success: boolean;
  entry_id?: string;
  error?: string;
}

export interface PublishResult {
  success: boolean;
  unassigned_staff_count?: number;
  warning?: string | null;
  error?: string;
}

export interface Hotspot {
  location: string;
  usage_count: number;
  categories: string[];
}

export interface SuggestResult {
  found: boolean;
  previousRosterId?: string;
  previousDate?: string;
  entryCount?: number;
}

// ============================================================
// Queries
// ============================================================

export async function getRosterSummary(
  dspId: string,
  date: string,
): Promise<RosterSummary[]> {
  const result = await db.execute<{ get_roster_summary: RosterSummary[] }>(
    sql`SELECT get_roster_summary(${dspId}::uuid, ${date}::date) AS get_roster_summary`,
  );
  const row = result.rows[0];
  return row?.get_roster_summary ?? [];
}

export async function getRosterDetail(rosterId: string): Promise<RosterWithEntries> {
  const [rosterResult] = await db
    .select({
      roster: dailyRosters,
      sectorName: sectors.name,
      sectorColor: sectors.colorHex,
    })
    .from(dailyRosters)
    .innerJoin(sectors, eq(dailyRosters.sectorId, sectors.id))
    .where(eq(dailyRosters.id, rosterId))
    .limit(1);

  if (!rosterResult) {
    throw new Error('ROSTER_NOT_FOUND');
  }

  const entries = await db
    .select({
      entry: rosterEntries,
      staff: staffMembers,
      dutyCategory: dutyCategories,
    })
    .from(rosterEntries)
    .innerJoin(staffMembers, eq(rosterEntries.staffId, staffMembers.id))
    .leftJoin(dutyCategories, eq(rosterEntries.dutyCategoryId, dutyCategories.id))
    .where(eq(rosterEntries.rosterId, rosterId))
    .orderBy(dutyCategories.sortOrder, staffMembers.fullName);

  return {
    roster: rosterResult.roster,
    sectorName: rosterResult.sectorName,
    sectorColor: rosterResult.sectorColor,
    entries,
  };
}

export async function getRosterHistory(
  dspId: string,
  days: number,
): Promise<RosterHistory[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  const rows = await db
    .select({
      rosterDate: dailyRosters.rosterDate,
      sectorId: sectors.id,
      sectorName: sectors.name,
      status: dailyRosters.status,
      assignedCount: dailyRosters.assignedStaffCount,
      totalCount: dailyRosters.totalStaffCount,
    })
    .from(dailyRosters)
    .innerJoin(sectors, eq(dailyRosters.sectorId, sectors.id))
    .where(
      and(
        eq(sectors.dspUserId, dspId),
        gte(dailyRosters.rosterDate, startDateStr),
      ),
    )
    .orderBy(desc(dailyRosters.rosterDate));

  const grouped = new Map<string, RosterHistory>();
  for (const row of rows) {
    const dateKey = row.rosterDate;
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, { date: dateKey, sectors: [] });
    }
    grouped.get(dateKey)!.sectors.push({
      sectorId: row.sectorId,
      sectorName: row.sectorName,
      status: row.status,
      assignedCount: row.assignedCount ?? 0,
      totalCount: row.totalCount ?? 0,
    });
  }
  return Array.from(grouped.values());
}

export async function createRoster(
  sectorId: string,
  date: string,
  dspId: string,
): Promise<DailyRoster> {
  const [roster] = await db
    .insert(dailyRosters)
    .values({
      sectorId,
      rosterDate: date,
      createdByDspId: dspId,
      status: 'draft',
    })
    .returning();
  return roster;
}

export async function assignStaffToDuty(params: AssignStaffParams): Promise<AssignResult> {
  const result = await db.execute<{ assign_staff_to_duty: AssignResult }>(
    sql`SELECT assign_staff_to_duty(
      ${params.rosterId}::uuid,
      ${params.staffId}::uuid,
      ${params.categoryId}::uuid,
      ${params.location ?? null}::varchar,
      ${params.notes ?? null}::varchar,
      ${params.shiftStart ?? null}::time,
      ${params.shiftEnd ?? null}::time
    ) AS assign_staff_to_duty`,
  );
  return result.rows[0]?.assign_staff_to_duty ?? { success: false, error: 'UNKNOWN' };
}

export async function publishRoster(
  rosterId: string,
  dspId: string,
): Promise<PublishResult> {
  const result = await db.execute<{ publish_roster: PublishResult }>(
    sql`SELECT publish_roster(${rosterId}::uuid, ${dspId}::uuid) AS publish_roster`,
  );
  return result.rows[0]?.publish_roster ?? { success: false, error: 'UNKNOWN' };
}

export async function getUnassignedStaff(
  rosterId: string,
): Promise<
  Array<{
    staff_id: string;
    badge_id: string;
    full_name: string;
    rank: string | null;
    designation: string | null;
  }>
> {
  const result = await db.execute<{
    staff_id: string;
    badge_id: string;
    full_name: string;
    rank: string | null;
    designation: string | null;
  }>(sql`SELECT * FROM get_unassigned_staff(${rosterId}::uuid)`);
  return result.rows;
}

export async function getRosterHotspots(dspId: string): Promise<Hotspot[]> {
  const result = await db.execute<{ get_roster_hotspots: Hotspot[] | null }>(
    sql`SELECT get_roster_hotspots(${dspId}::uuid) AS get_roster_hotspots`,
  );
  return result.rows[0]?.get_roster_hotspots ?? [];
}

export async function getRosterForDate(
  sectorId: string,
  date: string,
): Promise<DailyRoster | null> {
  const result = await db
    .select()
    .from(dailyRosters)
    .where(
      and(
        eq(dailyRosters.sectorId, sectorId),
        eq(dailyRosters.rosterDate, date),
      ),
    )
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function suggestRosterFromPreviousWeek(
  sectorId: string,
  date: string,
): Promise<SuggestResult> {
  const targetDate = new Date(date);
  const previousWeekDate = new Date(targetDate);
  previousWeekDate.setDate(previousWeekDate.getDate() - 7);
  const prevDateStr = previousWeekDate.toISOString().split('T')[0];

  const prevRoster = await db
    .select()
    .from(dailyRosters)
    .where(
      and(
        eq(dailyRosters.sectorId, sectorId),
        eq(dailyRosters.rosterDate, prevDateStr),
        eq(dailyRosters.status, 'published'),
      ),
    )
    .limit(1);

  if (prevRoster.length === 0) {
    return { found: false };
  }

  const entryCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(rosterEntries)
    .where(eq(rosterEntries.rosterId, prevRoster[0].id));

  return {
    found: true,
    previousRosterId: prevRoster[0].id,
    previousDate: prevDateStr,
    entryCount: entryCount[0]?.count ?? 0,
  };
}

export async function copyRosterFromPrevious(
  newRosterId: string,
  previousRosterId: string,
): Promise<number> {
  const prevEntries = await db
    .select()
    .from(rosterEntries)
    .where(eq(rosterEntries.rosterId, previousRosterId));

  if (prevEntries.length === 0) return 0;

  const newEntries = prevEntries.map((entry) => ({
    rosterId: newRosterId,
    staffId: entry.staffId,
    dutyCategoryId: entry.dutyCategoryId,
    dutyLocation: entry.dutyLocation,
    beatRoute: entry.beatRoute,
    shiftStart: entry.shiftStart,
    shiftEnd: entry.shiftEnd,
    notes: entry.notes,
  }));

  await db.insert(rosterEntries).values(newEntries);
  return newEntries.length;
}
