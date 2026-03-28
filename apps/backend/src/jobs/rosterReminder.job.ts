import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/index';
import { areas, sectors, dailyRosters, dspUsers } from '../db/schema';
import { sendRosterReminderToDsp } from '../services/fcm.service';

/**
 * Roster Reminder Job
 * Schedule: '0 20 * * *' (8:00 PM daily, Asia/Karachi)
 *
 * Checks if tomorrow's roster is incomplete for any sector.
 * Sends push notification reminders to the area DSP.
 */
export async function runRosterReminder(): Promise<void> {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Find all active areas with their DSP
    const activeAreas = await db
      .select({
        id: areas.id,
        name: areas.name,
        dspUserId: areas.dspUserId,
      })
      .from(areas)
      .where(eq(areas.isActive, true));

    let remindersCount = 0;

    for (const area of activeAreas) {
      if (!area.dspUserId) continue;

      // Get all active sectors in this area
      const areaSectors = await db
        .select({ id: sectors.id, name: sectors.name })
        .from(sectors)
        .where(and(eq(sectors.areaId, area.id), eq(sectors.isActive, true)));

      if (areaSectors.length === 0) continue;

      // Check which sectors don't have a published roster for tomorrow
      const incompleteSectors: string[] = [];

      for (const sector of areaSectors) {
        const [roster] = await db
          .select({ id: dailyRosters.id, status: dailyRosters.status })
          .from(dailyRosters)
          .where(
            and(
              eq(dailyRosters.sectorId, sector.id),
              eq(dailyRosters.rosterDate, tomorrowStr),
            ),
          )
          .limit(1);

        if (!roster || roster.status !== 'published') {
          incompleteSectors.push(sector.name);
        }
      }

      if (incompleteSectors.length > 0) {
        await sendRosterReminderToDsp(area.dspUserId, incompleteSectors);
        remindersCount++;
        console.log(
          `[RosterReminder] Area "${area.name}": ${incompleteSectors.length} sectors incomplete for ${tomorrowStr}`,
        );
      }
    }

    if (remindersCount > 0) {
      console.log(`[RosterReminder] Sent ${remindersCount} reminders for ${tomorrowStr}`);
    }
  } catch (err) {
    console.error('[RosterReminder] Job failed:', err);
  }
}
