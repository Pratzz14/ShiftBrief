"""Heroku worker entry point."""
import asyncio
from contextlib import closing

from . import automation
from .database import DATABASE_URL
from .main import connect


def check():
    if not DATABASE_URL:
        raise SystemExit("SHIFTBRIEF_DATABASE_URL is required.")
    with closing(connect()) as db:
        if not db.execute("SELECT 1 FROM schema_version WHERE version = 1").fetchone():
            raise SystemExit("Apply the ShiftBrief Postgres migration first.")


if __name__ == "__main__":
    import sys

    check()
    if sys.argv[1:] != ["--check"]:
        if not automation.ANALYSIS_ENABLED:
            raise SystemExit("Configure Gemini and enable ShiftBrief AI before starting the worker.")
        asyncio.run(automation.run_jobs(connect))
