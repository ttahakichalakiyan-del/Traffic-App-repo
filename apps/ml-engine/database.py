import psycopg2
import os
from typing import List, Dict, Any
from dotenv import load_dotenv

load_dotenv()


def get_db_connection():
    return psycopg2.connect(os.getenv("DATABASE_URL"))


def fetch_traffic_history(area_id: str, days: int = 7) -> List[Dict]:
    """Fetch historical traffic snapshots for an area over the last N days."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                segment_id,
                road_name,
                ST_X(location_point)  AS lng,
                ST_Y(location_point)  AS lat,
                congestion_level,
                speed_kmh,
                jam_factor,
                timestamp,
                EXTRACT(DOW  FROM timestamp) AS day_of_week,
                EXTRACT(HOUR FROM timestamp) AS hour
            FROM traffic_snapshots
            WHERE area_id = %s
              AND timestamp >= NOW() - INTERVAL %s
              AND segment_id IS NOT NULL
            ORDER BY timestamp ASC
            """,
            (area_id, f"{int(days)} days"),
        )
        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]
    finally:
        conn.close()


def fetch_all_active_areas() -> List[Dict]:
    """Return all active areas with bounding-box coordinates."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, name,
                ST_XMin(boundary) AS min_lng,
                ST_YMin(boundary) AS min_lat,
                ST_XMax(boundary) AS max_lng,
                ST_YMax(boundary) AS max_lat
            FROM areas
            WHERE is_active = true
            """
        )
        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]
    finally:
        conn.close()


def get_data_age_days(area_id: str) -> int:
    """Return the number of distinct calendar days of traffic data for an area."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT COUNT(DISTINCT DATE(timestamp))
            FROM traffic_snapshots
            WHERE area_id = %s
            """,
            (area_id,),
        )
        result = cur.fetchone()
        return int(result[0]) if result else 0
    finally:
        conn.close()


def bulk_insert_predictions(predictions: List[Dict]) -> int:
    """Delete existing predictions for the same area+date, then bulk insert new ones."""
    if not predictions:
        return 0

    conn = get_db_connection()
    try:
        cur = conn.cursor()

        area_id = predictions[0]["area_id"]
        predicted_date = predictions[0]["predicted_date"]

        # Remove stale predictions for this area+date so we get a clean slate
        cur.execute(
            "DELETE FROM predictions WHERE area_id = %s AND predicted_date = %s",
            (area_id, predicted_date),
        )

        from psycopg2.extras import execute_values

        execute_values(
            cur,
            """
            INSERT INTO predictions
                (area_id, road_name, lat, lng, location_point,
                 predicted_date, time_window_start, time_window_end,
                 day_of_week, confidence, historical_occurrences, model_version)
            VALUES %s
            """,
            [
                (
                    p["area_id"],
                    p["road_name"],
                    p["lat"],
                    p["lng"],
                    f"SRID=4326;POINT({p['lng']} {p['lat']})",
                    p["predicted_date"],
                    p["time_window_start"],
                    p["time_window_end"],
                    p["day_of_week"],
                    p["confidence"],
                    p["historical_occurrences"],
                    p["model_version"],
                )
                for p in predictions
            ],
        )
        conn.commit()
        return len(predictions)
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def fetch_actual_traffic_for_date(area_id: str, date: str) -> List[Dict]:
    """Aggregate actual traffic congestion data for a specific date."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                segment_id,
                road_name,
                AVG(congestion_level)  AS avg_congestion,
                MAX(congestion_level)  AS max_congestion,
                EXTRACT(HOUR FROM timestamp) AS hour
            FROM traffic_snapshots
            WHERE area_id = %s AND DATE(timestamp) = %s
            GROUP BY segment_id, road_name, EXTRACT(HOUR FROM timestamp)
            """,
            (area_id, date),
        )
        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]
    finally:
        conn.close()
