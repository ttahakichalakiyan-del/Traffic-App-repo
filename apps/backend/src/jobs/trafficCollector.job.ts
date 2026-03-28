import { eq, and, gte, sql } from 'drizzle-orm';
import { db } from '../db/index';
import { areas, trafficSnapshots, alerts } from '../db/schema';
import { emitToArea } from '../socket/index';

const HERE_API_BASE = 'https://data.traffic.hereapi.com/v7/flow';

interface HereFlowResult {
  results?: Array<{
    location: {
      shape: { links: Array<{ points: Array<{ lat: number; lng: number }> }> };
      description?: string;
    };
    currentFlow: {
      speed: number;
      freeFlow: number;
      jamFactor: number;
      confidence: number;
    };
  }>;
}

function jamFactorToLevel(jamFactor: number): number {
  if (jamFactor < 2) return 0;
  if (jamFactor < 5) return 1;
  if (jamFactor < 8) return 2;
  return 3;
}

export async function runTrafficCollector(): Promise<void> {
  const apiKey = process.env.HERE_API_KEY;
  if (!apiKey) {
    console.warn('[Traffic] HERE_API_KEY not set — skipping collection');
    return;
  }

  try {
    // 1. Get all active areas with bounding box
    const activeAreas = await db
      .select({
        id: areas.id,
        name: areas.name,
        minLng: sql<number>`ST_XMin(${areas.boundary}::geometry)`,
        minLat: sql<number>`ST_YMin(${areas.boundary}::geometry)`,
        maxLng: sql<number>`ST_XMax(${areas.boundary}::geometry)`,
        maxLat: sql<number>`ST_YMax(${areas.boundary}::geometry)`,
      })
      .from(areas)
      .where(eq(areas.isActive, true));

    let totalSegments = 0;

    for (const area of activeAreas) {
      try {
        // 2. Fetch traffic data from HERE Maps
        const bbox = `${area.minLng},${area.minLat},${area.maxLng},${area.maxLat}`;
        const url = `${HERE_API_BASE}?in=bbox:${bbox}&apiKey=${apiKey}`;

        const response = await fetch(url, {
          signal: AbortSignal.timeout(15000),
        });

        if (response.status === 429) {
          console.warn(`[Traffic] Rate limited for area ${area.name}, skipping`);
          continue;
        }

        if (!response.ok) {
          console.error(`[Traffic] HERE API ${response.status} for area ${area.name}`);
          continue;
        }

        const data = (await response.json()) as HereFlowResult;
        if (!data.results || data.results.length === 0) continue;

        // 3. Parse and insert
        const now = new Date();
        const snapshots: Array<{
          areaId: string;
          segmentId: string;
          roadName: string | null;
          lat: number;
          lng: number;
          congestionLevel: number;
          speedKmh: number;
          jamFactor: number;
          dataSource: string;
          timestamp: Date;
        }> = [];

        for (let i = 0; i < data.results.length; i++) {
          const result = data.results[i];
          const flow = result.currentFlow;
          const points = result.location.shape?.links?.[0]?.points;
          if (!points || points.length === 0) continue;

          const midPoint = points[Math.floor(points.length / 2)];

          snapshots.push({
            areaId: area.id,
            segmentId: `here_${area.id}_${i}`,
            roadName: result.location.description ?? null,
            lat: midPoint.lat,
            lng: midPoint.lng,
            congestionLevel: jamFactorToLevel(flow.jamFactor),
            speedKmh: flow.speed,
            jamFactor: flow.jamFactor,
            dataSource: 'here_maps',
            timestamp: now,
          });
        }

        // 4. Bulk insert
        if (snapshots.length > 0) {
          await db.insert(trafficSnapshots).values(snapshots);
          totalSegments += snapshots.length;
        }

        // 5. Check for heavy congestion alerts
        const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
        const heavySegments = snapshots.filter((s) => s.jamFactor > 8);

        for (const seg of heavySegments) {
          // Check if alert already exists for this road in last 30 min
          const existing = await db
            .select({ id: alerts.id })
            .from(alerts)
            .where(
              and(
                eq(alerts.areaId, area.id),
                eq(alerts.isActive, true),
                gte(alerts.detectedAt, thirtyMinAgo),
              ),
            )
            .limit(1);

          if (existing.length === 0) {
            const [newAlert] = await db
              .insert(alerts)
              .values({
                areaId: area.id,
                lat: seg.lat,
                lng: seg.lng,
                roadName: seg.roadName,
                alertType: 'congestion',
                severity: 3,
                description: `Heavy congestion detected (jam factor ${seg.jamFactor.toFixed(1)})`,
                isActive: true,
              })
              .returning();

            emitToArea(area.id, 'alert:new', newAlert);
          }
        }
      } catch (areaErr) {
        console.error(`[Traffic] Failed for area ${area.name}:`, areaErr);
      }
    }

    if (totalSegments > 0) {
      console.log(
        `[Traffic] Collected for ${activeAreas.length} areas, ${totalSegments} segments`,
      );
    }
  } catch (err) {
    console.error('[Traffic] Collector job failed:', err);
  }
}
