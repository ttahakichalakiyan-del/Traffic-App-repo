import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { db } from '../index';
import { predictions, trafficSnapshots } from '../schema';
import type { Prediction, NewPrediction } from '../schema';

// ============================================================
// Types
// ============================================================

export type CreatePredictionInput = Omit<NewPrediction, 'id' | 'createdAt' | 'locationPoint'>;

export interface AccuracyResult {
  [key: string]: unknown;
  predicted_date: string;
  road_name: string | null;
  predicted_confidence: number | null;
  actual_congestion_level: number | null;
  had_actual_data: boolean;
}

// ============================================================
// Queries
// ============================================================

export async function getTomorrowPredictions(areaId: string): Promise<Prediction[]> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  return db
    .select()
    .from(predictions)
    .where(
      and(
        eq(predictions.areaId, areaId),
        eq(predictions.predictedDate, tomorrowStr),
        gte(predictions.confidence, 0.5),
      ),
    )
    .orderBy(desc(predictions.confidence));
}

export async function bulkInsertPredictions(
  newPredictions: CreatePredictionInput[],
): Promise<void> {
  if (newPredictions.length === 0) return;

  // Group by area_id + predicted_date to delete existing
  const deleteKeys = new Set<string>();
  for (const p of newPredictions) {
    if (p.areaId) {
      deleteKeys.add(`${p.areaId}|${p.predictedDate}`);
    }
  }

  // Delete existing predictions for same area+date combos
  for (const key of deleteKeys) {
    const [areaId, predictedDate] = key.split('|');
    await db
      .delete(predictions)
      .where(
        and(
          eq(predictions.areaId, areaId),
          eq(predictions.predictedDate, predictedDate),
        ),
      );
  }

  // Bulk insert
  await db.insert(predictions).values(
    newPredictions.map((p) => ({
      areaId: p.areaId,
      roadName: p.roadName,
      lat: p.lat,
      lng: p.lng,
      predictedDate: p.predictedDate,
      timeWindowStart: p.timeWindowStart,
      timeWindowEnd: p.timeWindowEnd,
      dayOfWeek: p.dayOfWeek,
      confidence: p.confidence,
      historicalOccurrences: p.historicalOccurrences,
      modelVersion: p.modelVersion,
    })),
  );
}

export async function getPredictionAccuracy(
  areaId: string,
  days: number,
): Promise<AccuracyResult[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];
  const todayStr = new Date().toISOString().split('T')[0];

  const result = await db.execute<AccuracyResult>(sql`
    SELECT
      p.predicted_date::text AS predicted_date,
      p.road_name,
      p.confidence AS predicted_confidence,
      ts.congestion_level AS actual_congestion_level,
      CASE WHEN ts.id IS NOT NULL THEN true ELSE false END AS had_actual_data
    FROM predictions p
    LEFT JOIN LATERAL (
      SELECT ts2.id, ts2.congestion_level
      FROM traffic_snapshots ts2
      WHERE ts2.area_id = p.area_id
        AND ts2.road_name = p.road_name
        AND ts2.timestamp::date = p.predicted_date
        AND ts2.timestamp::time BETWEEN p.time_window_start AND p.time_window_end
      ORDER BY ts2.timestamp DESC
      LIMIT 1
    ) ts ON true
    WHERE p.area_id = ${areaId}
      AND p.predicted_date >= ${startDateStr}::date
      AND p.predicted_date < ${todayStr}::date
    ORDER BY p.predicted_date DESC, p.confidence DESC
  `);

  return result.rows;
}
