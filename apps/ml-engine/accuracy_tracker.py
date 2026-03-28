"""
Accuracy Tracker — compares yesterday's (and earlier) predictions
against actual observed traffic data to measure model performance.
"""
from database import get_db_connection, fetch_actual_traffic_for_date
from datetime import date, timedelta
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)


class AccuracyTracker:
    """Calculate how accurate past predictions were vs actual congestion data."""

    def calculate_accuracy_for_date(
        self, area_id: str, prediction_date: str
    ) -> Dict:
        """
        For a single area + date, compare every prediction >= 0.5 confidence
        against actual traffic snapshots and return hit/miss stats.
        """
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT road_name, time_window_start, time_window_end,
                       confidence, historical_occurrences
                FROM predictions
                WHERE area_id = %s
                  AND predicted_date = %s
                  AND confidence >= 0.5
                """,
                (area_id, prediction_date),
            )
            predictions = cur.fetchall()

            if not predictions:
                return {
                    "date": prediction_date,
                    "predictions": 0,
                    "accurate": 0,
                    "accuracy": None,
                }

            actual = fetch_actual_traffic_for_date(area_id, prediction_date)

            accurate_count = 0
            for pred in predictions:
                road_name, window_start, window_end, confidence, _ = pred

                # Parse window hours (handles both time objects and "HH:MM:SS" strings)
                ws_str = str(window_start)
                we_str = str(window_end)
                ws_hour = int(ws_str.split(":")[0])
                we_hour = int(we_str.split(":")[0])

                # A prediction is "accurate" when actual congestion was heavy
                # (avg >= 2 on 0-3 scale) in the predicted road+window
                hit = any(
                    str(a.get("road_name", "")) == str(road_name)
                    and ws_hour <= int(float(a.get("hour", -1))) < we_hour
                    and float(a.get("avg_congestion") or 0) >= 2.0
                    for a in actual
                )
                if hit:
                    accurate_count += 1

            accuracy = accurate_count / len(predictions)
            return {
                "date": prediction_date,
                "areaId": area_id,
                "predictions": len(predictions),
                "accurate": accurate_count,
                "accuracy": round(accuracy, 3),
                "accuracyPercent": round(accuracy * 100, 1),
            }
        finally:
            conn.close()

    def get_report(
        self,
        area_id: Optional[str] = None,
        days: int = 7,
    ) -> List[Dict]:
        """
        Return an accuracy report for the last `days` days.
        If `area_id` is given, restrict to that area; otherwise all active areas.
        """
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            if area_id:
                cur.execute(
                    "SELECT id, name FROM areas WHERE id = %s",
                    (area_id,),
                )
            else:
                cur.execute(
                    "SELECT id, name FROM areas WHERE is_active = true ORDER BY name"
                )
            areas = cur.fetchall()
        finally:
            conn.close()

        report: List[Dict] = []
        for area_id_row, area_name in areas:
            daily_list: List[Dict] = []
            total_predictions = 0
            total_accurate = 0

            for offset in range(1, days + 1):
                check_date = (date.today() - timedelta(days=offset)).isoformat()
                daily = self.calculate_accuracy_for_date(area_id_row, check_date)
                daily_list.append(daily)
                total_predictions += daily.get("predictions", 0)
                total_accurate += daily.get("accurate", 0)

            overall = (
                round(total_accurate / total_predictions, 3)
                if total_predictions > 0
                else 0.0
            )
            report.append(
                {
                    "areaId": area_id_row,
                    "areaName": area_name,
                    "dailyAccuracy": daily_list,
                    "overallAccuracy": overall,
                    "overallAccuracyPercent": round(overall * 100, 1),
                }
            )

        return report
