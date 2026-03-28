"""
Traffic Prediction Engine — uses Prophet for time-series forecasting
combined with frequency-based analysis for congestion hot-spot prediction.
"""
from prophet import Prophet
import pandas as pd
import numpy as np
from datetime import date, timedelta, datetime
from typing import List, Dict, Optional
from database import (
    fetch_traffic_history,
    fetch_all_active_areas,
    get_data_age_days,
    bulk_insert_predictions,
)
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# 7 time-windows that cover a full day (hours are half-open intervals [start, end))
TIME_WINDOWS = [
    (5,  7),   # Early morning
    (7,  9),   # Morning rush
    (9,  12),  # Late morning
    (12, 14),  # Lunch
    (14, 17),  # Afternoon
    (17, 20),  # Evening rush
    (20, 23),  # Night
]


class PredictionResult:
    def __init__(
        self,
        status: str,
        count: int = 0,
        area_id: str = None,
        error: str = None,
    ):
        self.status = status
        self.count = count
        self.area_id = area_id
        self.error = error

    def to_dict(self) -> Dict:
        return {
            "status": self.status,
            "count": self.count,
            "areaId": self.area_id,
            "error": self.error,
        }


class TrafficPredictor:
    """Generates next-day congestion predictions for every active area."""

    MIN_DATA_DAYS = 7       # Minimum distinct calendar days required
    MIN_CONFIDENCE = 0.50   # Discard predictions below this threshold
    MODEL_VERSION = "1.0.0"

    def __init__(self):
        self.last_run_time: Optional[str] = None
        self.predictions_today_count: int = 0

    # ── Public API ─────────────────────────────────────────────

    def run_for_all_areas(self, dry_run: bool = False) -> List[Dict]:
        areas = fetch_all_active_areas()
        logger.info(f"Running predictions for {len(areas)} area(s)  dry_run={dry_run}")

        results = []
        for area in areas:
            try:
                result = self.run_for_area(area["id"], area["name"], dry_run)
                results.append(result.to_dict())
                logger.info(
                    f"  Area '{area['name']}': {result.status}  "
                    f"({result.count} predictions)"
                )
            except Exception as exc:
                logger.error(f"  Area '{area['name']}' FAILED: {exc}", exc_info=True)
                results.append(
                    PredictionResult(
                        status="error",
                        area_id=area["id"],
                        error=str(exc),
                    ).to_dict()
                )

        self.last_run_time = datetime.now().isoformat()
        self.predictions_today_count = sum(r.get("count", 0) for r in results)
        return results

    def run_for_area(
        self,
        area_id: str,
        area_name: str,
        dry_run: bool = False,
    ) -> PredictionResult:
        # ── 1. Guard: enough historical data? ──────────────────
        data_days = get_data_age_days(area_id)
        if data_days < self.MIN_DATA_DAYS:
            logger.info(
                f"  '{area_name}': {data_days} days of data "
                f"(need {self.MIN_DATA_DAYS}) — skipping"
            )
            return PredictionResult(
                status="insufficient_data",
                area_id=area_id,
                error=f"Need {self.MIN_DATA_DAYS} days, have {data_days}",
            )

        # ── 2. Fetch last 7 days of snapshots ──────────────────
        snapshots = fetch_traffic_history(area_id, days=7)
        if not snapshots:
            return PredictionResult(status="no_data", area_id=area_id)

        # ── 3. Group by road segment ────────────────────────────
        segments = self._group_by_segment(snapshots)

        tomorrow = date.today() + timedelta(days=1)
        tomorrow_dow = tomorrow.weekday()  # 0=Mon … 6=Sun

        predictions: List[Dict] = []

        for segment_id, data in segments.items():
            if len(data) < 10:  # too sparse — skip
                continue

            # Only look at same day-of-week to be calendar-aware
            same_dow = [d for d in data if int(d["day_of_week"]) == tomorrow_dow]
            if len(same_dow) < 2:
                continue

            road_name = data[0].get("road_name") or segment_id
            lat = data[0].get("lat") or 31.5204
            lng = data[0].get("lng") or 74.3587

            # ── 4. Evaluate each time window ───────────────────
            for win_start, win_end in TIME_WINDOWS:
                window_data = [
                    d for d in same_dow
                    if win_start <= int(d["hour"]) < win_end
                ]
                if not window_data:
                    continue

                heavy_count = sum(
                    1 for d in window_data
                    if (d.get("congestion_level") or 0) >= 2
                )
                freq_conf = heavy_count / len(window_data)

                # Skip windows that are rarely congested — saves Prophet calls
                if freq_conf < 0.3:
                    continue

                prophet_conf = self._prophet_confidence(data, tomorrow, win_start)

                # Weighted blend: frequency is more reliable with sparse data
                final_conf = (freq_conf * 0.6) + (prophet_conf * 0.4)

                if final_conf >= self.MIN_CONFIDENCE:
                    predictions.append(
                        {
                            "area_id": area_id,
                            "road_name": road_name,
                            "lat": float(lat),
                            "lng": float(lng),
                            "predicted_date": tomorrow.isoformat(),
                            "time_window_start": f"{win_start:02d}:00:00",
                            "time_window_end":   f"{win_end:02d}:00:00",
                            "day_of_week": tomorrow_dow,
                            "confidence": round(final_conf, 3),
                            "historical_occurrences": heavy_count,
                            "model_version": self.MODEL_VERSION,
                        }
                    )

        logger.info(
            f"  '{area_name}': {len(predictions)} prediction(s) generated"
        )

        if not dry_run and predictions:
            bulk_insert_predictions(predictions)

        return PredictionResult(
            status="success",
            count=len(predictions),
            area_id=area_id,
        )

    # ── Helpers ────────────────────────────────────────────────

    def _group_by_segment(self, snapshots: List[Dict]) -> Dict[str, List[Dict]]:
        """Group snapshot rows by road-segment identifier."""
        groups: Dict[str, List[Dict]] = {}
        for snap in snapshots:
            key = snap.get("segment_id") or snap.get("road_name") or "unknown"
            groups.setdefault(key, []).append(snap)
        return groups

    def _prophet_confidence(
        self,
        data: List[Dict],
        target_date: date,
        target_hour: int,
    ) -> float:
        """
        Fit a Prophet model on all available data for this segment,
        then return a [0, 1] confidence for the target date + hour.
        Returns 0.5 (neutral) on any failure so the caller can still
        use the frequency component.
        """
        try:
            df = (
                pd.DataFrame(
                    [
                        {
                            "ds": pd.to_datetime(d["timestamp"]),
                            "y": float(d.get("congestion_level") or 0),
                        }
                        for d in data
                    ]
                )
                .sort_values("ds")
                .drop_duplicates("ds")
                .reset_index(drop=True)
            )

            if len(df) < 5:
                return 0.5

            model = Prophet(
                weekly_seasonality=True,
                daily_seasonality=True,
                changepoint_prior_scale=0.05,
                seasonality_prior_scale=10,
                uncertainty_samples=0,   # Disable Monte-Carlo → much faster
            )
            # Suppress verbose Stan output
            import logging as _logging
            _logging.getLogger("prophet").setLevel(_logging.WARNING)
            _logging.getLogger("cmdstanpy").setLevel(_logging.WARNING)

            model.fit(df)

            future = model.make_future_dataframe(periods=48, freq="h")
            forecast = model.predict(future)

            target_ts = pd.Timestamp(
                f"{target_date.isoformat()} {target_hour:02d}:00:00"
            )
            pred_row = forecast[forecast["ds"] == target_ts]

            if pred_row.empty:
                forecast = forecast.copy()
                forecast["_diff"] = (forecast["ds"] - target_ts).abs()
                pred_row = forecast.nsmallest(1, "_diff")

            if pred_row.empty:
                return 0.5

            yhat = float(pred_row["yhat"].iloc[0])
            # Congestion scale 0-3 → normalise to probability [0, 1]
            return float(np.clip(yhat / 3.0, 0.0, 1.0))

        except Exception as exc:
            logger.warning(f"Prophet model failed: {exc}")
            return 0.5  # Fall back to frequency-only confidence
