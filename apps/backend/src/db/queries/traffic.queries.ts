import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../index';
import { trafficSnapshots, alerts } from '../schema';
import type { TrafficSnapshot, Alert, NewTrafficSnapshot, NewAlert } from '../schema';

// ============================================================
// Types
// ============================================================

export type CreateTrafficInput = Omit<NewTrafficSnapshot, 'id' | 'locationPoint'>;

export type CreateAlertInput = Omit<NewAlert, 'id' | 'detectedAt' | 'resolvedAt' | 'isActive'>;

// ============================================================
// Queries
// ============================================================

export async function getLatestTrafficByArea(
  areaId: string,
  limit: number = 50,
): Promise<TrafficSnapshot[]> {
  return db
    .select()
    .from(trafficSnapshots)
    .where(eq(trafficSnapshots.areaId, areaId))
    .orderBy(desc(trafficSnapshots.timestamp))
    .limit(limit);
}

export async function getActiveAlerts(areaId: string): Promise<Alert[]> {
  return db
    .select()
    .from(alerts)
    .where(
      and(
        eq(alerts.areaId, areaId),
        eq(alerts.isActive, true),
      ),
    )
    .orderBy(desc(alerts.detectedAt));
}

export async function createAlert(data: CreateAlertInput): Promise<Alert> {
  const [alert] = await db
    .insert(alerts)
    .values({
      ...data,
      isActive: true,
    })
    .returning();
  return alert;
}

export async function resolveAlert(alertId: string, dspId: string): Promise<void> {
  await db
    .update(alerts)
    .set({
      isActive: false,
      resolvedAt: new Date(),
      acknowledgedByDspId: dspId,
    })
    .where(eq(alerts.id, alertId));
}

export async function bulkInsertTrafficSnapshots(
  snapshots: CreateTrafficInput[],
): Promise<void> {
  if (snapshots.length === 0) return;

  const values = snapshots.map((s) => ({
    ...s,
    locationPoint:
      s.lat != null && s.lng != null
        ? sql`ST_SetSRID(ST_MakePoint(${s.lng}, ${s.lat}), 4326)`
        : undefined,
  }));

  // Use raw SQL for PostGIS point generation
  for (const snapshot of snapshots) {
    await db.insert(trafficSnapshots).values({
      areaId: snapshot.areaId,
      segmentId: snapshot.segmentId,
      roadName: snapshot.roadName,
      lat: snapshot.lat,
      lng: snapshot.lng,
      congestionLevel: snapshot.congestionLevel,
      speedKmh: snapshot.speedKmh,
      jamFactor: snapshot.jamFactor,
      dataSource: snapshot.dataSource,
      timestamp: snapshot.timestamp,
    });
  }
}
