import { eq, and, lt, sql } from 'drizzle-orm';
import { db } from '../db/index';
import { staffMembers } from '../db/schema';
import { emitToArea } from '../socket/index';

/**
 * Checks for stale staff locations every 60 seconds.
 * - Emits 'staff:went_offline' for staff unseen > 3 minutes
 * - Auto-sets is_on_duty = false for staff unseen > 30 minutes
 */
export async function runStalenessCheck(): Promise<void> {
  try {
    const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000);
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

    // Find stale staff (on duty but not seen for > 3 minutes)
    const staleStaff = await db
      .select({
        id: staffMembers.id,
        fullName: staffMembers.fullName,
        lastSeenAt: staffMembers.lastSeenAt,
        areaId: staffMembers.areaId,
        sectorId: staffMembers.sectorId,
      })
      .from(staffMembers)
      .where(
        and(
          eq(staffMembers.isOnDuty, true),
          eq(staffMembers.isActive, true),
          lt(staffMembers.lastSeenAt, threeMinAgo),
        ),
      );

    for (const staff of staleStaff) {
      // Emit stale warning to DSP
      if (staff.areaId) {
        emitToArea(staff.areaId, 'staff:went_offline', {
          staffId: staff.id,
          fullName: staff.fullName,
          lastSeen: staff.lastSeenAt?.toISOString() ?? null,
        });
      }

      // Auto-end duty if unseen > 30 minutes
      if (staff.lastSeenAt && staff.lastSeenAt < thirtyMinAgo) {
        await db
          .update(staffMembers)
          .set({ isOnDuty: false })
          .where(eq(staffMembers.id, staff.id));

        console.log(
          `[Staleness] Auto-ended duty for ${staff.fullName} (last seen ${staff.lastSeenAt.toISOString()})`,
        );
      }
    }

    if (staleStaff.length > 0) {
      console.log(`[Staleness] ${staleStaff.length} stale staff detected`);
    }
  } catch (err) {
    console.error('[Staleness] Check failed:', err);
  }
}
