"""Apply the Postgres schema and optionally import a quiesced SQLite database."""
import argparse
import os
import sqlite3
from contextlib import closing
from pathlib import Path

import psycopg
from psycopg import sql
from dotenv import load_dotenv

TABLES = (
    "departments", "accounts", "machines", "machine_updates", "reporting_questions",
    "shifts", "shift_workers", "deleted_shifts", "automation_jobs", "shift_reports",
    "report_resolutions",
)


def import_snapshot(db, source: Path):
    with closing(sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)) as original:
        with closing(sqlite3.connect(":memory:")) as snapshot:
            original.backup(snapshot)
            snapshot.row_factory = sqlite3.Row
            if snapshot.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("SQLite integrity check failed.")
            if snapshot.execute("PRAGMA foreign_key_check").fetchone():
                raise RuntimeError("SQLite has invalid foreign keys.")
            if not snapshot.execute("SELECT 1 FROM accounts WHERE role = 'owner'").fetchone():
                raise RuntimeError("SQLite has no Plant Owner account.")
            for table in (*TABLES, "sessions", "draft_jobs"):
                if db.execute(sql.SQL("SELECT 1 FROM {} LIMIT 1").format(sql.Identifier(table))).fetchone():
                    raise RuntimeError("Import requires an empty ShiftBrief schema.")
            for table in TABLES:
                copy_table(db, snapshot, table)


def copy_table(db, snapshot, table):
    rows = [dict(row) for row in snapshot.execute(f'SELECT * FROM "{table}"')]
    if table == "automation_jobs":
        rows = [row for row in rows if row["kind"] == "analysis"]
        for row in rows:
            row["claim"] = None
            row["payload"] = ""
            if row["state"] == "pending":
                row["state"] = "unavailable"
    if table == "shift_reports":
        for row in rows:
            if "notes" not in row:
                row["notes"] = ""
                if row["submitted_at"] is None:
                    row["notes"], row["summary"] = row["summary"], ""
    if rows:
        columns = tuple(rows[0])
        query = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
            sql.Identifier(table),
            sql.SQL(", ").join(map(sql.Identifier, columns)),
            sql.SQL(", ").join(sql.Placeholder() for _ in columns),
        )
        with db.cursor() as cursor:
            cursor.executemany(query, [tuple(row.get(column, "") for column in columns) for row in rows])
        if "id" in columns:
            next_id = max(row["id"] for row in rows) + 1
            sequence = db.execute("SELECT pg_get_serial_sequence(%s, 'id')", (table,)).fetchone()[0]
            if sequence:
                db.execute(sql.SQL("ALTER SEQUENCE {} RESTART WITH {}").format(
                    sql.Identifier("shiftbrief", table + "_id_seq"), sql.Literal(next_id),
                ))
    count = db.execute(sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(table))).fetchone()[0]
    if count != len(rows):
        raise RuntimeError(f"Row count mismatch in {table}.")
    print(f"{table}: {count}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--import-sqlite", type=Path)
    parser.add_argument("--dry-run", action="store_true", help="Roll back schema and data changes")
    parser.add_argument("--runtime-role", required=True, help="Pre-created restricted Postgres login role")
    args = parser.parse_args()
    load_dotenv(interpolate=False)
    url = os.getenv("SHIFTBRIEF_MIGRATION_DATABASE_URL")
    if not url:
        parser.error("Set SHIFTBRIEF_MIGRATION_DATABASE_URL in the local environment.")
    role = sql.Identifier(args.runtime_role)
    try:
        with psycopg.connect(url, connect_timeout=5, autocommit=True) as db, db.transaction(force_rollback=args.dry_run):
            db.execute("SELECT pg_advisory_xact_lock(628173002)")
            db.execute("CREATE SCHEMA IF NOT EXISTS shiftbrief")
            db.execute("REVOKE ALL ON SCHEMA shiftbrief FROM PUBLIC")
            db.execute("SET LOCAL search_path TO shiftbrief")
            db.execute(Path(__file__).with_name("postgres_v1.sql").read_text(encoding="utf8"))
            db.execute(sql.SQL("GRANT USAGE ON SCHEMA shiftbrief TO {}").format(role))
            db.execute(sql.SQL("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA shiftbrief TO {}").format(role))
            db.execute(sql.SQL("REVOKE INSERT, UPDATE, DELETE ON schema_version FROM {}").format(role))
            db.execute(sql.SQL("GRANT USAGE ON ALL SEQUENCES IN SCHEMA shiftbrief TO {}").format(role))
            if args.import_sqlite:
                import_snapshot(db, args.import_sqlite)
    except psycopg.Error as error:
        raise SystemExit(f"Postgres migration failed ({type(error).__name__}, SQLSTATE {error.sqlstate}).") from None


if __name__ == "__main__":
    main()
