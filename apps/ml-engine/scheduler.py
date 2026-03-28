"""
APScheduler background scheduler.
Runs the nightly prediction job every day at 20:00 PKT (Asia/Karachi).
"""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import requests
import os
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def run_nightly_predictions() -> None:
    """Trigger the /run-predictions endpoint on ourselves, then notify the backend."""
    logger.info(f"[Scheduler] Nightly prediction job started at {datetime.now()}")
    port = int(os.getenv("PORT", "8001"))
    ml_url = f"http://localhost:{port}"

    try:
        response = requests.post(
            f"{ml_url}/run-predictions",
            headers={"X-Internal-Key": os.getenv("INTERNAL_API_KEY", "")},
            timeout=300,  # Prophet training can take a few minutes
        )
        response.raise_for_status()
        result = response.json()
        total = sum(r.get("count", 0) for r in result.get("results", []))
        logger.info(f"[Scheduler] Prediction job complete — {total} prediction(s) written")

        # Notify the backend so it can invalidate its prediction cache
        backend_url = os.getenv("BACKEND_URL")
        if backend_url:
            try:
                notify_resp = requests.post(
                    f"{backend_url}/api/internal/predictions-updated",
                    headers={"X-Internal-Key": os.getenv("INTERNAL_API_KEY", "")},
                    json={
                        "count": total,
                        "timestamp": datetime.now().isoformat(),
                    },
                    timeout=10,
                )
                notify_resp.raise_for_status()
                logger.info("[Scheduler] Backend notified of new predictions")
            except Exception as notify_err:
                logger.warning(f"[Scheduler] Backend notification failed: {notify_err}")

    except Exception as exc:
        logger.error(f"[Scheduler] Prediction job FAILED: {exc}", exc_info=True)


def start_scheduler() -> BackgroundScheduler:
    """
    Create and start the APScheduler instance.
    Returns the scheduler so the caller can shut it down gracefully if needed.
    """
    scheduler = BackgroundScheduler(timezone="Asia/Karachi")

    scheduler.add_job(
        run_nightly_predictions,
        trigger=CronTrigger(hour=20, minute=0, timezone="Asia/Karachi"),
        id="nightly_predictions",
        name="Nightly Traffic Predictions",
        replace_existing=True,
        max_instances=1,  # Prevent overlapping runs
        misfire_grace_time=600,  # Allow up to 10-min late start
    )

    scheduler.start()
    logger.info(
        "[Scheduler] Started — nightly predictions will run at 20:00 PKT"
    )
    return scheduler
