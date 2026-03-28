import { lt, and, eq } from 'drizzle-orm';
import { db } from '../db/index';
import { staffLocations, trafficSnapshots, alerts, sessions } from '../db/schema';

/**
 * Data Cleanup Job
 * Schedule: '0 2 * * *' (2:00 AM daily, Asia/Karachi)
 *
 * Cleans up old data to keep the database lean:
 * - staff_locations older than 7 days
 * - traffic_snapshots older than 30 days
 * - resolved alerts older than 90 days
 * - expired sessions
 */
export async function runDataCleanup(): Promise<void> {
  const now = new Date();

  try {
    // 1. Delete staff locations older than 7 days
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const locResult = await db
      .delete(staffLocations)
      .where(lt(staffLocations.timestamp, sevenDaysAgo))
      .returning({ id: staffLocations.id });
    if (locResult.length > 0) {
      console.log(`[DataCleanup] Deleted ${locResult.length} old staff locations (>7 days)`);
    }

    // 2. Delete traffic snapshots older than 30 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const snapResult = await db
      .delete(trafficSnapshots)
      .where(lt(trafficSnapshots.timestamp, thirtyDaysAgo))
      .returning({ id: trafficSnapshots.id });
    if (snapResult.length > 0) {
      console.log(`[DataCleanup] Deleted ${snapResult.length} old traffic snapshots (>30 days)`);
    }

    // 3. Delete resolved alerts older than 90 days
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const alertResult = await db
      .delete(alerts)
      .where(
        and(
          eq(alerts.isActive, false),
          lt(alerts.detectedAt, ninetyDaysAgo),
        ),
      )
      .returning({ id: alerts.id });
    if (alertResult.length > 0) {
      console.log(`[DataCleanup] Deleted ${alertResult.length} old resolved alerts (>90 days)`);
    }

    // 4. Delete expired sessions
    const sessResult = await db
      .delete(sessions)
      .where(lt(sessions.expiresAt, now))
      .returning({ id: sessions.id });
    if (sessResult.length > 0) {
      console.log(`[DataCleanup] Deleted ${sessResult.length} expired sessions`);
    }

    console.log('[DataCleanup] Cleanup complete');
  } catch (err) {
    console.error('[DataCleanup] Job failed:', err);
  }
}
