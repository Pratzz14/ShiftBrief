"""Connection and transaction conventions shared by SQLite and Postgres."""
import os
import sqlite3
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env", interpolate=False)

HOSTED = os.getenv("SHIFTBRIEF_HOSTED") == "1"
DATABASE_URL = os.getenv("SHIFTBRIEF_DATABASE_URL", "").strip()
if not HOSTED and not DATABASE_URL:
    DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
IntegrityError = (sqlite3.IntegrityError, psycopg.IntegrityError)


class Postgres:
    def __init__(self, url: str):
        self.connection = psycopg.connect(
            url, autocommit=True, row_factory=dict_row, connect_timeout=5,
        )
        try:
            self.connection.execute("SET search_path TO shiftbrief")
            self.connection.execute("SET statement_timeout TO 5000")
        except BaseException:
            self.connection.close()
            raise

    def execute(self, sql, params=()):
        return self.connection.execute(sql.replace("?", "%s"), params)

    def executemany(self, sql, params):
        with self.connection.cursor() as cursor:
            cursor.executemany(sql.replace("?", "%s"), params)

    def __enter__(self):
        self.transaction = self.connection.transaction()
        self.transaction.__enter__()
        return self

    def __exit__(self, *args):
        return self.transaction.__exit__(*args)

    def close(self):
        self.connection.close()


def begin_write(db):
    if isinstance(db, Postgres):
        # Preserve SQLite's serialization of cross-table write invariants.
        db.execute("SELECT pg_advisory_xact_lock(628173002)")
    else:
        db.execute("BEGIN IMMEDIATE")


def insert_id(db, sql, params):
    if isinstance(db, Postgres):
        row = db.execute(sql + " RETURNING id", params).fetchone()
        return row["id"] if row else None
    cursor = db.execute(sql, params)
    return cursor.lastrowid if cursor.rowcount else None
