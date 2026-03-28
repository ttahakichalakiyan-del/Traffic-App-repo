from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from predictor import TrafficPredictor
from scheduler import start_scheduler
from accuracy_tracker import AccuracyTracker
from database import get_db_connection
from datetime import datetime
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="CTPL ML Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("BACKEND_URL", "*")],
    allow_methods=["*"],
    allow_headers=["*"],
)

predictor = TrafficPredictor()
accuracy_tracker = AccuracyTracker()


# ── Global exception handlers ──────────────────────────────────────────────

@app.exception_handler(psycopg2.OperationalError)
@app.exception_handler(psycopg2.DatabaseError)
async def db_error_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=503,
        content={
            "success": False,
            "error": "database_unavailable",
            "detail": str(exc).split("\n")[0],
            "hint": "Check DATABASE_URL in .env",
        },
    )


@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": type(exc).__name__,
            "detail": str(exc),
        },
    )


@app.get("/health")
def health():
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "last_prediction_run": predictor.last_run_time,
        "predictions_today": predictor.predictions_today_count,
        "model_version": "1.0.0",
    }


@app.post("/run-predictions")
def run_predictions(
    dry_run: bool = False,
    x_internal_key: str = Header(default=None),
):
    # Validate internal key
    expected_key = os.getenv("INTERNAL_API_KEY")
    if expected_key and x_internal_key != expected_key:
        raise HTTPException(status_code=401, detail="Invalid internal key")

    try:
        result = predictor.run_for_all_areas(dry_run=dry_run)
        return {
            "success": True,
            "dry_run": dry_run,
            "results": result,
            "timestamp": datetime.now().isoformat(),
        }
    except psycopg2.OperationalError as exc:
        raise HTTPException(status_code=503, detail=f"Database unavailable: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/accuracy-report")
def accuracy_report(area_id: str = None, days: int = 7):
    try:
        report = accuracy_tracker.get_report(area_id=area_id, days=days)
        return {"success": True, "data": report}
    except psycopg2.OperationalError as exc:
        raise HTTPException(status_code=503, detail=f"Database unavailable: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/areas-summary")
def areas_summary():
    try:
        conn = get_db_connection()
    except psycopg2.OperationalError as exc:
        raise HTTPException(status_code=503, detail=f"Database unavailable: {exc}")

    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT a.id, a.name,
                COUNT(DISTINCT DATE(ts.timestamp)) AS data_days,
                COUNT(ts.id)                        AS total_snapshots,
                MAX(ts.timestamp)                   AS last_snapshot
            FROM areas a
            LEFT JOIN traffic_snapshots ts ON ts.area_id = a.id
            WHERE a.is_active = true
            GROUP BY a.id, a.name
            ORDER BY a.name
            """
        )
        rows = cur.fetchall()
        return {
            "success": True,
            "data": [
                {
                    "areaId": r[0],
                    "areaName": r[1],
                    "dataDays": r[2],
                    "totalSnapshots": r[3],
                    "lastSnapshot": r[4].isoformat() if r[4] else None,
                }
                for r in rows
            ],
        }
    except psycopg2.DatabaseError as exc:
        raise HTTPException(status_code=503, detail=f"Database error: {exc}")
    finally:
        conn.close()


if __name__ == "__main__":
    start_scheduler()
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8001")))
