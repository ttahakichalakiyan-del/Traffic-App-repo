"""
Manual integration test for the CTPL ML Engine.

Usage:
    cd apps/ml-engine
    python test_predictor.py

Prerequisites:
    - .env file present with DATABASE_URL, BACKEND_URL, INTERNAL_API_KEY
    - Database must be reachable
"""
import sys
import os
from dotenv import load_dotenv

load_dotenv()

from predictor import TrafficPredictor
from database import fetch_all_active_areas, get_data_age_days
from datetime import datetime


def separator(title: str) -> None:
    print(f"\n{'─' * 50}")
    print(f"  {title}")
    print("─" * 50)


def test_ml_engine() -> None:
    print("=" * 50)
    print("  CTPL ML Engine — Integration Test")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)

    predictor = TrafficPredictor()

    # ── 1. Check database connectivity & areas ──────────────────
    separator("1. Database / Areas")
    try:
        areas = fetch_all_active_areas()
        print(f"  Areas found: {len(areas)}")
        for area in areas:
            days = get_data_age_days(area["id"])
            tag = "✅ READY" if days >= TrafficPredictor.MIN_DATA_DAYS else f"⚠  NEED MORE DATA ({days}/{TrafficPredictor.MIN_DATA_DAYS} days)"
            print(f"    • {area['name']:<30} {tag}")
    except Exception as exc:
        print(f"  ❌ DB connection failed: {exc}")
        print("     → Check DATABASE_URL in .env")
        sys.exit(1)

    if not areas:
        print("  No active areas found — seed data first, then re-run.")
        return

    # ── 2. Dry-run predictions (no DB writes) ───────────────────
    separator("2. Dry-Run Predictions (no DB writes)")
    try:
        results = predictor.run_for_all_areas(dry_run=True)
        for r in results:
            status = r["status"]
            count  = r.get("count", 0)
            error  = r.get("error", "")
            icon   = "✅" if status == "success" else ("⚠ " if "data" in status else "❌")
            detail = f"{count} prediction(s)" if status == "success" else error
            print(f"    {icon} Area {r.get('areaId', 'unknown')[:8]}…  "
                  f"[{status}]  {detail}")
    except Exception as exc:
        print(f"  ❌ Dry-run failed: {exc}")

    # ── 3. Accuracy tracker ─────────────────────────────────────
    separator("3. Accuracy Tracker (last 3 days)")
    try:
        from accuracy_tracker import AccuracyTracker
        tracker = AccuracyTracker()
        report = tracker.get_report(days=3)
        for area_report in report:
            pct = area_report["overallAccuracyPercent"]
            icon = "✅" if pct >= 60 else ("⚠ " if pct >= 40 else "❌")
            print(f"    {icon} {area_report['areaName']:<30} "
                  f"overall accuracy: {pct:.1f}%")
            for daily in area_report["dailyAccuracy"]:
                if daily.get("accuracy") is not None:
                    print(f"        {daily['date']}  "
                          f"{daily['predictions']:3d} predictions  "
                          f"{daily['accurate']:3d} accurate  "
                          f"({daily['accuracyPercent']:.1f}%)")
                else:
                    print(f"        {daily['date']}  no predictions on record")
    except Exception as exc:
        print(f"  ❌ Accuracy tracker failed: {exc}")

    # ── 4. Health-check struct ──────────────────────────────────
    separator("4. Predictor State After Run")
    print(f"    last_run_time        : {predictor.last_run_time}")
    print(f"    predictions_today    : {predictor.predictions_today_count}")
    print(f"    model_version        : {predictor.MODEL_VERSION}")
    print(f"    MIN_DATA_DAYS        : {predictor.MIN_DATA_DAYS}")
    print(f"    MIN_CONFIDENCE       : {predictor.MIN_CONFIDENCE}")

    print("\n" + "=" * 50)
    print("  Test complete.")
    print("=" * 50 + "\n")


if __name__ == "__main__":
    test_ml_engine()
