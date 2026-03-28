import cron from 'node-cron';
import { lt } from 'drizzle-orm';
import { db } from '../db/index';
import { sessions } from '../db/schema';
import { runStalenessCheck } from './stalenessChecker.job';
import { runTrafficCollector } from './trafficCollector.job';
import { runRosterReminder } from './rosterReminder.job';
import { runDataCleanup } from './dataCleanup.job';

const TIMEZONE = 'Asia/Karachi';

export function startCronJobs(): void {
  // ── Staleness checker: every 60 seconds ──────────────
  cron.schedule('* * * * *', async () => {
    await runStalenessCheck();
  });
  console.log('[Cron] Staleness checker: every 60 seconds');

  // ── Session cleanup: every hour ──────────────────────
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await db
        .delete(sessions)
        .where(lt(sessions.expiresAt, new Date()))
        .returning({ id: sessions.id });
      if (result.length > 0) {
        console.log(`[Cron] Cleaned ${result.length} expired sessions`);
      }
    } catch (err) {
      console.error('[Cron] Session cleanup failed:', err);
    }
  });
  console.log('[Cron] Session cleanup: every hour');

  // ── Traffic collector: every 5 minutes ───────────────
  cron.schedule('*/5 * * * *', async () => {
    await runTrafficCollector();
  }, { timezone: TIMEZONE });
  console.log('[Cron] Traffic collector: every 5 minutes');

  // ── Roster reminder: 8:00 PM daily ──────────────────
  cron.schedule('0 20 * * *', async () => {
    await runRosterReminder();
  }, { timezone: TIMEZONE });
  console.log('[Cron] Roster reminder: daily at 8:00 PM PKT');

  // ── Data cleanup: 2:00 AM daily ─────────────────────
  cron.schedule('0 2 * * *', async () => {
    await runDataCleanup();
  }, { timezone: TIMEZONE });
  console.log('[Cron] Data cleanup: daily at 2:00 AM PKT');

  console.log('[Cron] All 5 scheduled jobs started');
}
