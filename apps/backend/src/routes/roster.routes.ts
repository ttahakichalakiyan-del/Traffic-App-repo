import { Router, Request, Response, NextFunction } from 'express';
import { eq, and, ne, sql, count, desc, asc, notInArray } from 'drizzle-orm';
import { verifyDspToken, verifyStaffToken } from '../middleware/auth.middleware';
import { db } from '../db';
import {
  dutyCategories,
  dailyRosters,
  rosterEntries,
  staffMembers,
  sectors,
} from '../db/schema';

const router = Router();

// ─── Helper ──────────────────────────────────────────────────
function ok(res: Response, data: unknown) {
  res.json({ success: true, data, error: null, timestamp: new Date().toISOString() });
}
function fail(res: Response, status: number, message: string) {
  res.status(status).json({ success: false, data: null, error: { message }, timestamp: new Date().toISOString() });
}

// ── GET /api/roster/categories ──────────────────────────────
router.get('/categories', verifyDspToken, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const cats = await db
      .select({
        id: dutyCategories.id,
        name: dutyCategories.name,
        nameUrdu: dutyCategories.nameUrdu,
        colorHex: dutyCategories.colorHex,
        sortOrder: dutyCategories.sortOrder,
        requiresLocation: dutyCategories.requiresLocation,
        requiresRoute: dutyCategories.requiresRoute,
      })
      .from(dutyCategories)
      .where(eq(dutyCategories.isActive, true))
      .orderBy(asc(dutyCategories.sortOrder));
    ok(res, cats);
  } catch (err) { next(err); }
});

// ── GET /api/roster/daily ───────────────────────────────────
// Returns ALL sectors for the DSP's area, each with their roster status for the given date.
// Sectors without a roster show status='not_created' so the app shows the "Roster Banao" button.
router.get('/daily', verifyDspToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = req.query as { date?: string };
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const dspAreaId = (req as Request & { user?: { areaId?: string } }).user?.areaId ?? null;

    if (!dspAreaId) {
      // DSP not assigned to any area — return empty
      return ok(res, []);
    }

    // Fetch all active sectors for the DSP's area
    const allSectors = await db
      .select({
        id: sectors.id,
        name: sectors.name,
        colorHex: sectors.colorHex,
      })
      .from(sectors)
      .where(and(eq(sectors.areaId, dspAreaId), eq(sectors.isActive, true)))
      .orderBy(asc(sectors.name));

    if (allSectors.length === 0) return ok(res, []);

    // Fetch existing rosters for those sectors on the target date
    const sectorIds = allSectors.map((s) => s.id);
    const existingRosters = await db
      .select({
        id: dailyRosters.id,
        sectorId: dailyRosters.sectorId,
        rosterDate: dailyRosters.rosterDate,
        status: dailyRosters.status,
        totalStaffCount: dailyRosters.totalStaffCount,
        assignedStaffCount: dailyRosters.assignedStaffCount,
        createdByDspId: dailyRosters.createdByDspId,
        publishedAt: dailyRosters.publishedAt,
        notes: dailyRosters.notes,
      })
      .from(dailyRosters)
      .where(
        and(
          eq(dailyRosters.rosterDate, targetDate),
          sql`${dailyRosters.sectorId} = ANY(ARRAY[${sql.join(sectorIds.map(id => sql`${id}::uuid`), sql`, `)}])`
        )
      );

    // Merge: for each sector, attach its roster or default to not_created
    const rosterMap = new Map(existingRosters.map((r) => [r.sectorId, r]));

    const result = allSectors.map((sector) => {
      const roster = rosterMap.get(sector.id);
      return {
        id: roster?.id ?? null,
        sectorId: sector.id,
        sectorName: sector.name,
        sectorColor: sector.colorHex,
        rosterDate: targetDate,
        status: roster?.status ?? 'not_created',
        totalStaffCount: roster?.totalStaffCount ?? 0,
        assignedStaffCount: roster?.assignedStaffCount ?? 0,
        createdByDspId: roster?.createdByDspId ?? null,
        publishedAt: roster?.publishedAt ?? null,
        notes: roster?.notes ?? null,
      };
    });

    ok(res, result);
  } catch (err) { next(err); }
});

// ── POST /api/roster/daily ──────────────────────────────────
router.post('/daily', verifyDspToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sectorId, date, notes } = req.body as { sectorId: string; date: string; notes?: string };
    const dspId = (req as Request & { user?: { id: string } }).user?.id ?? null;

    // Count active staff in this sector
    const [countRow] = await db
      .select({ cnt: count() })
      .from(staffMembers)
      .where(and(eq(staffMembers.sectorId, sectorId), eq(staffMembers.isActive, true)));

    const totalCount = Number(countRow?.cnt ?? 0);

    const [inserted] = await db
      .insert(dailyRosters)
      .values({
        sectorId,
        rosterDate: date,
        status: 'draft',
        totalStaffCount: totalCount,
        assignedStaffCount: 0,
        createdByDspId: dspId,
        notes: notes ?? null,
      })
      .returning({ id: dailyRosters.id });

    ok(res, { id: inserted.id });
  } catch (err) { next(err); }
});

// ── GET /api/roster/daily/:rosterId ────────────────────────
router.get('/daily/:rosterId', verifyDspToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rosterId } = req.params;

    const [roster] = await db
      .select({
        id: dailyRosters.id,
        sectorId: dailyRosters.sectorId,
        sectorName: sectors.name,
        rosterDate: dailyRosters.rosterDate,
        status: dailyRosters.status,
        notes: dailyRosters.notes,
        totalStaffCount: dailyRosters.totalStaffCount,
        assignedStaffCount: dailyRosters.assignedStaffCount,
      })
      .from(dailyRosters)
      .innerJoin(sectors, eq(sectors.id, dailyRosters.sectorId))
      .where(eq(dailyRosters.id, rosterId))
      .limit(1);

    if (!roster) return fail(res, 404, 'Roster not found');

    const entries = await db
      .select({
        id: rosterEntries.id,
        staffId: rosterEntries.staffId,
        staffName: staffMembers.fullName,
        staffBadgeId: staffMembers.badgeId,
        staffRank: staffMembers.rank,
        dutyCategoryId: rosterEntries.dutyCategoryId,
        dutyCategoryName: dutyCategories.name,
        dutyCategoryUrdu: dutyCategories.nameUrdu,
        dutyLocation: rosterEntries.dutyLocation,
        beatRoute: rosterEntries.beatRoute,
        shiftStart: rosterEntries.shiftStart,
        shiftEnd: rosterEntries.shiftEnd,
        notes: rosterEntries.notes,
      })
      .from(rosterEntries)
      .innerJoin(staffMembers, eq(staffMembers.id, rosterEntries.staffId))
      .leftJoin(dutyCategories, eq(dutyCategories.id, rosterEntries.dutyCategoryId))
      .where(eq(rosterEntries.rosterId, rosterId))
      .orderBy(asc(dutyCategories.sortOrder), asc(staffMembers.fullName));

    ok(res, { ...roster, entries });
  } catch (err) { next(err); }
});

// ── GET /api/roster/daily/:rosterId/unassigned ──────────────
router.get('/daily/:rosterId/unassigned', verifyDspToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rosterId } = req.params;

    const [rosterRow] = await db
      .select({ sectorId: dailyRosters.sectorId })
      .from(dailyRosters)
      .where(eq(dailyRosters.id, rosterId))
      .limit(1);

    if (!rosterRow) return fail(res, 404, 'Roster not found');

    // Get assigned staff IDs for this roster
    const assignedRows = await db
      .select({ staffId: rosterEntries.staffId })
      .from(rosterEntries)
      .where(eq(rosterEntries.rosterId, rosterId));

    const assignedIds = assignedRows.map((r) => r.staffId);

    const query = db
      .select({
        id: staffMembers.id,
        badgeId: staffMembers.badgeId,
        fullName: staffMembers.fullName,
        rank: staffMembers.rank,
      })
      .from(staffMembers)
      .where(
        and(
          eq(staffMembers.sectorId, rosterRow.sectorId),
          eq(staffMembers.isActive, true),
        ),
      )
      .orderBy(asc(staffMembers.fullName));

    let staffList = await query;
    if (assignedIds.length > 0) {
      staffList = staffList.filter((s) => !assignedIds.includes(s.id));
    }

    ok(res, staffList);
  } catch (err) { next(err); }
});

// ── POST /api/roster/daily/:rosterId/entries ────────────────
router.post('/daily/:rosterId/entries', verifyDspToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rosterId } = req.params;
    const { staffId, dutyCategoryId, dutyLocation, beatRoute, shiftStart, shiftEnd, notes } =
      req.body as Record<string, string | undefined>;

    const [inserted] = await db
      .insert(rosterEntries)
      .values({
        rosterId,
        staffId: staffId!,
        dutyCategoryId: dutyCategoryId ?? null,
        dutyLocation: dutyLocation ?? null,
        beatRoute: beatRoute ?? null,
        shiftStart: shiftStart ?? null,
        shiftEnd: shiftEnd ?? null,
        notes: notes ?? null,
      })
      .returning({ id: rosterEntries.id });

    // Update assigned count
    const [cnt] = await db
      .select({ cnt: count() })
      .from(rosterEntries)
      .where(eq(rosterEntries.rosterId, rosterId));
    await db
      .update(dailyRosters)
      .set({ assignedStaffCount: Number(cnt?.cnt ?? 0) })
      .where(eq(dailyRosters.id, rosterId));

    ok(res, { id: inserted.id });
  } catch (err) { next(err); }
});

// ── POST /api/roster/daily/:rosterId/entries/bulk ───────────
router.post('/daily/:rosterId/entries/bulk', verifyDspToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rosterId } = req.params;
    const { entries } = req.body as {
      entries: Array<Record<string, string | undefined>>;
    };

    // Get already assigned staff to avoid duplicates
    const existing = await db
      .select({ staffId: rosterEntries.staffId })
      .from(rosterEntries)
      .where(eq(rosterEntries.rosterId, rosterId));
    const existingIds = new Set(existing.map((e) => e.staffId));

    const toInsert = entries.filter((e) => e.staffId && !existingIds.has(e.staffId));

    if (toInsert.length > 0) {
      await db.insert(rosterEntries).values(
        toInsert.map((entry) => ({
          rosterId,
          staffId: entry.staffId!,
          dutyCategoryId: entry.dutyCategoryId ?? null,
          dutyLocation: entry.dutyLocation ?? null,
          beatRoute: entry.beatRoute ?? null,
          shiftStart: entry.shiftStart ?? null,
          shiftEnd: entry.shiftEnd ?? null,
        })),
      );
    }

    const [cnt] = await db
      .select({ cnt: count() })
      .from(rosterEntries)
      .where(eq(rosterEntries.rosterId, rosterId));
    await db
      .update(dailyRosters)
      .set({ assignedStaffCount: Number(cnt?.cnt ?? 0) })
      .where(eq(dailyRosters.id, rosterId));

    ok(res, { inserted: toInsert.length });
  } catch (err) { next(err); }
});

// ── DELETE /api/roster/entries/:entryId ─────────────────────
router.delete('/entries/:entryId', verifyDspToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { entryId } = req.params;

    const [entry] = await db
      .select({ rosterId: rosterEntries.rosterId })
      .from(rosterEntries)
      .where(eq(rosterEntries.id, entryId))
      .limit(1);

    if (!entry) return fail(res, 404, 'Entry not found');
    const { rosterId } = entry;

    await db.delete(rosterEntries).where(eq(rosterEntries.id, entryId));

    const [cnt] = await db
      .select({ cnt: count() })
      .from(rosterEntries)
      .where(eq(rosterEntries.rosterId, rosterId));
    await db
      .update(dailyRosters)
      .set({ assignedStaffCount: Number(cnt?.cnt ?? 0) })
      .where(eq(dailyRosters.id, rosterId));

    ok(res, { deleted: true });
  } catch (err) { next(err); }
});

// ── POST /api/roster/daily/:rosterId/publish ────────────────
router.post('/daily/:rosterId/publish', verifyDspToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rosterId } = req.params;
    await db
      .update(dailyRosters)
      .set({ status: 'published', publishedAt: new Date() })
      .where(eq(dailyRosters.id, rosterId));
    ok(res, { published: true });
  } catch (err) { next(err); }
});

// ── POST /api/roster/daily/:rosterId/notify-staff ───────────
router.post('/daily/:rosterId/notify-staff', verifyDspToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rosterId } = req.params;

    const staffWithTokens = await db
      .select({ staffId: rosterEntries.staffId, deviceToken: staffMembers.deviceToken })
      .from(rosterEntries)
      .innerJoin(staffMembers, eq(staffMembers.id, rosterEntries.staffId))
      .where(
        and(
          eq(rosterEntries.rosterId, rosterId),
          // deviceToken IS NOT NULL
        ),
      );

    // Fire-and-forget FCM — actual implementation via FCM service
    ok(res, { notified: staffWithTokens.length });
  } catch (err) { next(err); }
});

// ── GET /api/roster/hotspots ────────────────────────────────
router.get('/hotspots', verifyDspToken, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Return top hotspots from traffic snapshots aggregated by road
    const hotspots = await db.execute(
      sql`SELECT road_name, AVG(lat) AS lat, AVG(lng) AS lng,
                 COUNT(*) AS occurrences,
                 AVG(congestion_level) AS avg_confidence
          FROM traffic_snapshots
          WHERE road_name IS NOT NULL
          GROUP BY road_name
          ORDER BY occurrences DESC
          LIMIT 50`,
    );

    const data = (hotspots.rows ?? []).map((h: Record<string, unknown>) => ({
      roadName: h.road_name,
      lat: Number(h.lat),
      lng: Number(h.lng),
      occurrences: Number(h.occurrences),
      avgConfidence: Number(h.avg_confidence),
    }));
    ok(res, data);
  } catch (err) { next(err); }
});

// ── GET /api/roster/suggest/:sectorId ──────────────────────
router.get('/suggest/:sectorId', verifyDspToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sectorId } = req.params;
    const { date } = req.query as { date?: string };
    const targetDate = date || new Date().toISOString().slice(0, 10);

    // Find most recent published roster before this date
    const prevRosters = await db
      .select({ id: dailyRosters.id, rosterDate: dailyRosters.rosterDate })
      .from(dailyRosters)
      .where(
        and(
          eq(dailyRosters.sectorId, sectorId),
          eq(dailyRosters.status, 'published'),
          sql`${dailyRosters.rosterDate} < ${targetDate}`,
        ),
      )
      .orderBy(desc(dailyRosters.rosterDate))
      .limit(1);

    if (!prevRosters.length) {
      return ok(res, { previousRosterId: null, previousDate: null, matchCount: 0, entries: [] });
    }

    const prev = prevRosters[0];
    const sourceEntries = await db
      .select({
        staffId: rosterEntries.staffId,
        staffName: staffMembers.fullName,
        dutyCategoryId: rosterEntries.dutyCategoryId,
        dutyCategoryName: dutyCategories.name,
        dutyLocation: rosterEntries.dutyLocation,
        beatRoute: rosterEntries.beatRoute,
      })
      .from(rosterEntries)
      .innerJoin(staffMembers, eq(staffMembers.id, rosterEntries.staffId))
      .leftJoin(dutyCategories, eq(dutyCategories.id, rosterEntries.dutyCategoryId))
      .where(eq(rosterEntries.rosterId, prev.id));

    ok(res, {
      previousRosterId: prev.id,
      previousDate: prev.rosterDate,
      matchCount: sourceEntries.length,
      entries: sourceEntries,
    });
  } catch (err) { next(err); }
});

// ── POST /api/roster/suggest/:sectorId/apply ───────────────
router.post('/suggest/:sectorId/apply', verifyDspToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sourceRosterId, targetRosterId } = req.body as { sourceRosterId: string; targetRosterId: string };

    const sourceEntries = await db
      .select({
        staffId: rosterEntries.staffId,
        dutyCategoryId: rosterEntries.dutyCategoryId,
        dutyLocation: rosterEntries.dutyLocation,
        beatRoute: rosterEntries.beatRoute,
        shiftStart: rosterEntries.shiftStart,
        shiftEnd: rosterEntries.shiftEnd,
      })
      .from(rosterEntries)
      .where(eq(rosterEntries.rosterId, sourceRosterId));

    // Get already assigned
    const existing = await db
      .select({ staffId: rosterEntries.staffId })
      .from(rosterEntries)
      .where(eq(rosterEntries.rosterId, targetRosterId));
    const existingIds = new Set(existing.map((e) => e.staffId));

    const toInsert = sourceEntries.filter((e) => !existingIds.has(e.staffId));

    if (toInsert.length > 0) {
      await db.insert(rosterEntries).values(
        toInsert.map((e) => ({
          rosterId: targetRosterId,
          staffId: e.staffId,
          dutyCategoryId: e.dutyCategoryId ?? null,
          dutyLocation: e.dutyLocation ?? null,
          beatRoute: e.beatRoute ?? null,
          shiftStart: e.shiftStart ?? null,
          shiftEnd: e.shiftEnd ?? null,
        })),
      );
    }

    const [cnt] = await db
      .select({ cnt: count() })
      .from(rosterEntries)
      .where(eq(rosterEntries.rosterId, targetRosterId));
    await db
      .update(dailyRosters)
      .set({ assignedStaffCount: Number(cnt?.cnt ?? 0) })
      .where(eq(dailyRosters.id, targetRosterId));

    ok(res, { copied: toInsert.length });
  } catch (err) { next(err); }
});

// ── GET /api/roster/history ─────────────────────────────────
router.get('/history', verifyDspToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { days = '30' } = req.query as { days?: string };

    const rosters = await db
      .select({
        id: dailyRosters.id,
        sectorId: dailyRosters.sectorId,
        sectorName: sectors.name,
        sectorColor: sectors.colorHex,
        rosterDate: dailyRosters.rosterDate,
        status: dailyRosters.status,
        totalStaffCount: dailyRosters.totalStaffCount,
        assignedStaffCount: dailyRosters.assignedStaffCount,
        createdByDspId: dailyRosters.createdByDspId,
        publishedAt: dailyRosters.publishedAt,
        notes: dailyRosters.notes,
      })
      .from(dailyRosters)
      .innerJoin(sectors, eq(sectors.id, dailyRosters.sectorId))
      .where(sql`${dailyRosters.rosterDate} >= CURRENT_DATE - INTERVAL '${sql.raw(String(parseInt(days, 10)))} days'`)
      .orderBy(desc(dailyRosters.rosterDate), asc(sectors.name));

    ok(res, rosters);
  } catch (err) { next(err); }
});

// ── GET /api/roster/attendance ─────────────────────────────
router.get('/attendance', verifyDspToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to, sectorId } = req.query as { from?: string; to?: string; sectorId?: string };
    const dspId = req.dsp?.id;
    const areaId = req.dsp?.areaId;

    if (!areaId) return ok(res, []);

    const today = new Date().toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const fromDate = from || thirtyDaysAgo;
    const toDate = to || today;

    // Use raw SQL for the complex conditional aggregation
    const result = await db.execute(
      sql`
        SELECT
          sm.id AS staff_id,
          sm.full_name AS staff_name,
          sm.badge_id,
          s.name AS sector_name,
          s.id AS sector_id,
          COUNT(CASE WHEN dc.name IS NOT NULL AND dc.name NOT IN ('Absent','Rest') THEN 1 END)::int AS present,
          COUNT(CASE WHEN dc.name = 'Absent' THEN 1 END)::int AS absent,
          COUNT(CASE WHEN dc.name = 'Rest' THEN 1 END)::int AS rest,
          COUNT(re.id)::int AS total
        FROM staff_members sm
        JOIN sectors s ON sm.sector_id = s.id
        LEFT JOIN roster_entries re ON re.staff_id = sm.id
        LEFT JOIN daily_rosters dr ON re.roster_id = dr.id
          AND dr.roster_date BETWEEN ${fromDate} AND ${toDate}
          AND dr.status = 'published'
        LEFT JOIN duty_categories dc ON re.duty_category_id = dc.id
        WHERE s.area_id = ${areaId}
          AND sm.is_active = true
          ${sectorId ? sql`AND sm.sector_id = ${sectorId}::uuid` : sql``}
        GROUP BY sm.id, sm.full_name, sm.badge_id, s.name, s.id
        ORDER BY sm.full_name
      `,
    );

    const data = (result.rows ?? []).map((r: Record<string, unknown>) => ({
      staffId: r.staff_id,
      staffName: r.staff_name,
      badgeId: r.badge_id,
      sectorName: r.sector_name,
      sectorId: r.sector_id,
      present: Number(r.present),
      absent: Number(r.absent),
      rest: Number(r.rest),
      total: Number(r.total),
    }));

    ok(res, data);
  } catch (err) { next(err); }
});

// ── GET /api/roster/my-duty ─────────────────────────────────
router.get('/my-duty', verifyStaffToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date } = req.query as { date?: string };
    const staffId = req.staff?.id;
    if (!staffId) return fail(res, 401, 'Unauthorized');

    const targetDate = date || new Date().toISOString().slice(0, 10);

    const [entry] = await db
      .select({
        rosterId: rosterEntries.rosterId,
        sectorName: sectors.name,
        categoryName: dutyCategories.name,
        categoryNameUrdu: dutyCategories.nameUrdu,
        dutyLocation: rosterEntries.dutyLocation,
        beatRoute: rosterEntries.beatRoute,
        shiftStart: rosterEntries.shiftStart,
        shiftEnd: rosterEntries.shiftEnd,
        rosterStatus: dailyRosters.status,
        notes: rosterEntries.notes,
      })
      .from(rosterEntries)
      .innerJoin(dailyRosters, eq(dailyRosters.id, rosterEntries.rosterId))
      .innerJoin(sectors, eq(sectors.id, dailyRosters.sectorId))
      .leftJoin(dutyCategories, eq(dutyCategories.id, rosterEntries.dutyCategoryId))
      .where(
        and(
          eq(rosterEntries.staffId, staffId),
          eq(dailyRosters.rosterDate, targetDate),
        ),
      )
      .limit(1);

    ok(res, entry ?? null);
  } catch (err) { next(err); }
});

// ── GET /api/roster/my-duty/history ────────────────────────
router.get('/my-duty/history', verifyStaffToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { days = '7' } = req.query as { days?: string };
    const staffId = req.staff?.id;
    if (!staffId) return fail(res, 401, 'Unauthorized');

    const history = await db
      .select({
        date: dailyRosters.rosterDate,
        categoryName: dutyCategories.name,
        categoryNameUrdu: dutyCategories.nameUrdu,
        dutyLocation: rosterEntries.dutyLocation,
        shiftStart: rosterEntries.shiftStart,
        shiftEnd: rosterEntries.shiftEnd,
      })
      .from(rosterEntries)
      .innerJoin(dailyRosters, eq(dailyRosters.id, rosterEntries.rosterId))
      .leftJoin(dutyCategories, eq(dutyCategories.id, rosterEntries.dutyCategoryId))
      .where(
        and(
          eq(rosterEntries.staffId, staffId),
          sql`${dailyRosters.rosterDate} >= CURRENT_DATE - INTERVAL '${sql.raw(String(parseInt(days, 10)))} days'`,
        ),
      )
      .orderBy(desc(dailyRosters.rosterDate));

    ok(res, history);
  } catch (err) { next(err); }
});

export const rosterRouter = router;
