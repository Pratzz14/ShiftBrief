import hashlib
import json
import os
import secrets
import sqlite3
import time
from collections.abc import Iterator
from contextlib import asynccontextmanager, closing
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import AwareDatetime, BaseModel, ConfigDict, EmailStr, Field, StringConstraints, model_validator

DATABASE = Path(os.getenv("SHIFTBRIEF_DB", Path(__file__).with_name("shiftbrief.sqlite3")))
COOKIE_NAME = "shiftbrief_session"
SESSION_SECONDS = 8 * 60 * 60
SECURE_COOKIE = os.getenv("SHIFTBRIEF_SECURE_COOKIE") == "1"
Role = Literal["owner", "manager", "worker"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE
);
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'worker')),
    department_id INTEGER REFERENCES departments(id),
    CHECK ((role = 'owner') = (department_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_owner ON accounts(role) WHERE role = 'owner';
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS machines (
    id INTEGER PRIMARY KEY,
    department_id INTEGER NOT NULL REFERENCES departments(id),
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
);
CREATE INDEX IF NOT EXISTS machines_department ON machines(department_id, archived);
CREATE TABLE IF NOT EXISTS machine_updates (
    id INTEGER PRIMARY KEY,
    machine_id INTEGER NOT NULL REFERENCES machines(id),
    worker_id INTEGER NOT NULL REFERENCES accounts(id),
    status TEXT NOT NULL CHECK (status IN ('Working', 'Not Working', 'Has Issues')),
    note TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    CHECK (status = 'Working' OR length(trim(note)) > 0)
);
CREATE INDEX IF NOT EXISTS machine_updates_machine ON machine_updates(machine_id, id);
CREATE TABLE IF NOT EXISTS reporting_questions (
    id INTEGER PRIMARY KEY,
    department_id INTEGER NOT NULL REFERENCES departments(id),
    prompt TEXT NOT NULL,
    required INTEGER NOT NULL CHECK (required IN (0, 1))
);
CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY,
    department_id INTEGER NOT NULL REFERENCES departments(id),
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    questions TEXT NOT NULL,
    CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS shifts_department ON shifts(department_id, starts_at);
CREATE TABLE IF NOT EXISTS shift_workers (
    shift_id INTEGER NOT NULL REFERENCES shifts(id),
    worker_id INTEGER NOT NULL REFERENCES accounts(id),
    PRIMARY KEY (shift_id, worker_id)
);
CREATE INDEX IF NOT EXISTS shift_workers_worker ON shift_workers(worker_id, shift_id);
CREATE TABLE IF NOT EXISTS deleted_shifts (
    shift_id INTEGER PRIMARY KEY REFERENCES shifts(id)
);
"""


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@asynccontextmanager
async def lifespan(_: FastAPI):
    with closing(connect()) as connection:
        connection.executescript(SCHEMA)
    yield


app = FastAPI(title="ShiftBrief", lifespan=lifespan)


@app.middleware("http")
async def protect_api(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        # Browser cross-origin requests cannot attach this header without CORS permission.
        if request.method not in {"GET", "HEAD", "OPTIONS"} and request.headers.get(
            "X-ShiftBrief-Request"
        ) != "1":
            return JSONResponse({"detail": "Missing request header."}, status_code=403)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response
    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def invalid_input(_: Request, exc: RequestValidationError):
    # Validation errors must not echo submitted credentials.
    errors = [{"field": error["loc"][-1], "message": error["msg"]} for error in exc.errors()]
    return JSONResponse({"detail": errors}, status_code=422)


def get_db() -> Iterator[sqlite3.Connection]:
    with closing(connect()) as connection:
        yield connection


DB = Annotated[sqlite3.Connection, Depends(get_db)]


class Login(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class NewAccount(Login):
    password: str = Field(min_length=12, max_length=128)


class NewManager(NewAccount):
    department_id: int = Field(gt=0)


class DepartmentName(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class Department(DepartmentName):
    id: int


class Account(BaseModel):
    id: int
    email: str
    role: Role
    department_id: int | None
    department_name: str | None


ACCOUNT_QUERY = """
SELECT accounts.*, departments.name AS department_name
FROM accounts LEFT JOIN departments ON departments.id = accounts.department_id
"""


def password_digest(password: str, salt: bytes) -> str:
    return hashlib.scrypt(
        password.encode(), salt=salt, n=2**17, r=8, p=1, maxmem=256 * 1024**2
    ).hex()


def insert_account(db: DB, data: NewAccount, role: Role, department_id: int | None):
    salt = secrets.token_bytes(16)
    stored_hash = f"{salt.hex()}:{password_digest(data.password, salt)}"
    try:
        with db:
            cursor = db.execute(
                "INSERT INTO accounts(email, password_hash, role, department_id) VALUES (?, ?, ?, ?)",
                (data.email.casefold(), stored_hash, role, department_id),
            )
    except sqlite3.IntegrityError as exc:
        if role == "owner" and owner_exists(db):
            raise HTTPException(409, "The plant owner account already exists.") from exc
        if exc.sqlite_errorname == "SQLITE_CONSTRAINT_UNIQUE":
            raise HTTPException(409, "An account already uses that email.") from exc
        raise
    return dict(db.execute(ACCOUNT_QUERY + " WHERE accounts.id = ?", (cursor.lastrowid,)).fetchone())


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(db: DB, request: Request, response: Response, account_id: int) -> None:
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    previous = request.cookies.get(COOKIE_NAME, "")
    with db:
        db.execute(
            "DELETE FROM sessions WHERE expires_at <= ? OR token_hash = ?",
            (now, token_digest(previous)),
        )
        db.execute(
            "INSERT INTO sessions VALUES (?, ?, ?)",
            (token_digest(token), account_id, now + SESSION_SECONDS),
        )
    response.set_cookie(
        COOKIE_NAME, token, max_age=SESSION_SECONDS, httponly=True,
        secure=SECURE_COOKIE, samesite="strict", path="/api",
    )


def current_account(request: Request, db: DB) -> Account:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        row = db.execute(
            ACCOUNT_QUERY + """
            JOIN sessions ON sessions.account_id = accounts.id
            WHERE sessions.token_hash = ? AND sessions.expires_at > ?
            """,
            (token_digest(token), int(time.time())),
        ).fetchone()
        if row:
            return Account.model_validate(dict(row))
    raise HTTPException(401, "Sign in to continue.")


SignedIn = Annotated[Account, Depends(current_account)]


def owner_only(account: SignedIn) -> Account:
    if account.role != "owner":
        raise HTTPException(403, "Plant owner access is required.")
    return account


def manager_only(account: SignedIn) -> Account:
    if account.role != "manager":
        raise HTTPException(403, "Department manager access is required.")
    return account


Owner = Annotated[Account, Depends(owner_only)]
Manager = Annotated[Account, Depends(manager_only)]


def owner_exists(db: DB) -> bool:
    return db.execute("SELECT 1 FROM accounts WHERE role = 'owner'").fetchone() is not None


@app.get("/api/auth/setup")
def setup_status(db: DB) -> dict[str, bool]:
    return {"owner_exists": owner_exists(db)}


@app.post("/api/auth/signup", response_model=Account, status_code=201)
def signup(data: NewAccount, request: Request, response: Response, db: DB):
    if owner_exists(db):
        raise HTTPException(409, "The plant owner account already exists.")
    account = insert_account(db, data, "owner", None)
    start_session(db, request, response, account["id"])
    return account


@app.post("/api/auth/login", response_model=Account)
def login(data: Login, request: Request, response: Response, db: DB):
    row = db.execute(ACCOUNT_QUERY + " WHERE accounts.email = ?", (data.email.casefold(),)).fetchone()
    salt, expected = row["password_hash"].split(":") if row else ("00" * 16, "0" * 128)
    supplied = password_digest(data.password, bytes.fromhex(salt))
    if not secrets.compare_digest(supplied, expected) or row is None:
        raise HTTPException(401, "Invalid email or password.")
    start_session(db, request, response, row["id"])
    return dict(row)


@app.get("/api/auth/me")
def me(account: SignedIn) -> Account:
    return account


@app.post("/api/auth/logout", status_code=204)
def logout(request: Request, db: DB) -> Response:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        with db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_digest(token),))
    response = Response(status_code=204)
    response.delete_cookie(
        COOKIE_NAME, path="/api", httponly=True, secure=SECURE_COOKIE, samesite="strict"
    )
    return response


@app.get("/api/departments")
def departments(db: DB, _: Owner) -> list[Department]:
    rows = db.execute("SELECT id, name FROM departments ORDER BY name").fetchall()
    return [Department.model_validate(dict(row)) for row in rows]


@app.post("/api/departments", status_code=201)
def create_department(data: DepartmentName, db: DB, _: Owner) -> Department:
    try:
        with db:
            cursor = db.execute("INSERT INTO departments(name) VALUES (?)", (data.name,))
    except sqlite3.IntegrityError as exc:
        if exc.sqlite_errorname == "SQLITE_CONSTRAINT_UNIQUE":
            raise HTTPException(409, "That department already exists.") from exc
        raise
    return Department(id=cursor.lastrowid, name=data.name)


@app.post("/api/managers", response_model=Account, status_code=201)
def create_manager(data: NewManager, db: DB, _: Owner):
    if db.execute("SELECT 1 FROM departments WHERE id = ?", (data.department_id,)).fetchone() is None:
        raise HTTPException(404, "Department not found.")
    return insert_account(db, data, "manager", data.department_id)


@app.post("/api/workers", response_model=Account, status_code=201)
def create_worker(data: NewAccount, db: DB, manager: Manager):
    return insert_account(db, data, "worker", manager.department_id)


@app.get("/api/staff")
def staff(db: DB, account: SignedIn) -> list[Account]:
    if account.role == "owner":
        rows = db.execute(ACCOUNT_QUERY + " WHERE accounts.role = 'manager' ORDER BY accounts.email")
    elif account.role == "manager":
        rows = db.execute(
            ACCOUNT_QUERY + " WHERE accounts.role = 'worker' AND accounts.department_id = ? ORDER BY accounts.email",
            (account.department_id,),
        )
    else:
        raise HTTPException(403, "Staff administration access is required.")
    return [Account.model_validate(dict(row)) for row in rows]


class MachineName(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


MachineStatus = Literal["Working", "Not Working", "Has Issues"]


class MachineUpdateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: MachineStatus
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] = ""

    @model_validator(mode="after")
    def require_condition_note(self):
        if self.status != "Working" and not self.note:
            raise ValueError("A condition note is required for this status.")
        return self


class MachineUpdate(MachineUpdateInput):
    id: int
    worker_email: str
    recorded_at: datetime


class Machine(MachineName):
    id: int
    archived: bool
    latest: MachineUpdate | None


class MachineHistory(Machine):
    updates: list[MachineUpdate]


def machine_reader(account: SignedIn) -> Account:
    if account.role not in {"manager", "worker"}:
        raise HTTPException(403, "Department staff access is required.")
    return account


def worker_only(account: SignedIn) -> Account:
    if account.role != "worker":
        raise HTTPException(403, "Worker access is required.")
    return account


DepartmentStaff = Annotated[Account, Depends(machine_reader)]
Worker = Annotated[Account, Depends(worker_only)]

MACHINE_QUERY = """
SELECT m.id, m.name, m.archived, u.id AS update_id, u.status, u.note,
       u.recorded_at, a.email AS worker_email
FROM machines m
LEFT JOIN machine_updates u ON u.id = (
    SELECT id FROM machine_updates WHERE machine_id = m.id ORDER BY id DESC LIMIT 1
)
LEFT JOIN accounts a ON a.id = u.worker_id
"""


def machine_from_row(row: sqlite3.Row) -> Machine:
    latest = None
    if row["update_id"] is not None:
        latest = MachineUpdate(
            id=row["update_id"], status=row["status"], note=row["note"],
            recorded_at=row["recorded_at"], worker_email=row["worker_email"],
        )
    return Machine(id=row["id"], name=row["name"], archived=row["archived"], latest=latest)


@app.get("/api/machines")
def list_machines(db: DB, account: DepartmentStaff) -> list[Machine]:
    rows = db.execute(
        MACHINE_QUERY + " WHERE m.department_id = ? AND (? OR m.archived = 0)"
        " ORDER BY m.archived, m.name COLLATE NOCASE, m.id",
        (account.department_id, account.role == "manager"),
    )
    return [machine_from_row(row) for row in rows]


@app.post("/api/machines", status_code=201)
def register_machine(data: MachineName, db: DB, account: Manager) -> Machine:
    with db:
        cursor = db.execute(
            "INSERT INTO machines (department_id, name) VALUES (?, ?)",
            (account.department_id, data.name),
        )
    return Machine(id=cursor.lastrowid, name=data.name, archived=False, latest=None)


@app.get("/api/machines/{machine_id}")
def machine_history(machine_id: int, db: DB, account: DepartmentStaff) -> MachineHistory:
    # Read the register and its history from one database snapshot.
    with db:
        db.execute("BEGIN")
        row = db.execute(
            MACHINE_QUERY + " WHERE m.id = ? AND m.department_id = ? AND (? OR m.archived = 0)",
            (machine_id, account.department_id, account.role == "manager"),
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Machine not found.")
        updates = db.execute(
            """SELECT u.id, u.status, u.note, u.recorded_at, a.email AS worker_email
               FROM machine_updates u JOIN accounts a ON a.id = u.worker_id
               WHERE u.machine_id = ? ORDER BY u.id DESC""",
            (machine_id,),
        ).fetchall()
    return MachineHistory(
        **machine_from_row(row).model_dump(),
        updates=[MachineUpdate.model_validate(dict(update)) for update in updates],
    )


@app.patch("/api/machines/{machine_id}", status_code=204)
def edit_machine(machine_id: int, data: MachineName, db: DB, account: Manager) -> None:
    with db:
        result = db.execute(
            "UPDATE machines SET name = ? WHERE id = ? AND department_id = ? AND archived = 0",
            (data.name, machine_id, account.department_id),
        )
        if not result.rowcount:
            raise HTTPException(404, "Active machine not found.")


@app.post("/api/machines/{machine_id}/archive", status_code=204)
def archive_machine(machine_id: int, db: DB, account: Manager) -> None:
    with db:
        result = db.execute(
            "UPDATE machines SET archived = 1 WHERE id = ? AND department_id = ?",
            (machine_id, account.department_id),
        )
        if not result.rowcount:
            raise HTTPException(404, "Machine not found.")


@app.post("/api/machines/{machine_id}/updates", status_code=201)
def record_machine_update(
    machine_id: int, data: MachineUpdateInput, db: DB, account: Worker,
) -> MachineUpdate:
    with db:
        db.execute("BEGIN IMMEDIATE")
        recorded_at = datetime.now(UTC)
        result = db.execute(
            """INSERT INTO machine_updates (machine_id, worker_id, status, note, recorded_at)
               SELECT id, ?, ?, ?, ? FROM machines
               WHERE id = ? AND department_id = ? AND archived = 0""",
            (account.id, data.status, data.note, recorded_at.isoformat(), machine_id, account.department_id),
        )
        if not result.rowcount:
            raise HTTPException(404, "Active machine not found.")
    return MachineUpdate(
        id=result.lastrowid, **data.model_dump(), worker_email=account.email, recorded_at=recorded_at,
    )


class QuestionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    required: bool


class Question(QuestionInput):
    id: int


class SelectedQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int = Field(gt=0)
    required: bool


class ShiftTime(BaseModel):
    model_config = ConfigDict(extra="forbid")

    starts_at: AwareDatetime
    ends_at: AwareDatetime

    @model_validator(mode="after")
    def validate_times(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("The shift must end after it starts.")
        return self


class AssignmentSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    worker_ids: list[Annotated[int, Field(gt=0)]] = Field(min_length=1, max_length=200)
    questions: list[SelectedQuestion] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def validate_assignment(self):
        if len(set(self.worker_ids)) != len(self.worker_ids):
            raise ValueError("Select each worker once.")
        if len({question.id for question in self.questions}) != len(self.questions):
            raise ValueError("Select each reporting question once.")
        return self


class NewShift(AssignmentSelection, ShiftTime):
    pass


class ShiftBatch(AssignmentSelection):
    occurrences: list[ShiftTime] = Field(min_length=1, max_length=366)

    @model_validator(mode="after")
    def validate_occurrences(self):
        if len({shift.starts_at for shift in self.occurrences}) != len(self.occurrences):
            raise ValueError("Each shift must have a distinct start time.")
        return self


class AssignedWorker(BaseModel):
    id: int
    email: str


class Shift(BaseModel):
    id: int
    starts_at: datetime
    ends_at: datetime
    questions: list[Question]
    workers: list[AssignedWorker]


@app.get("/api/reporting-questions")
def reporting_questions(db: DB, account: Manager) -> list[Question]:
    rows = db.execute(
        "SELECT id, prompt, required FROM reporting_questions WHERE department_id = ? ORDER BY id",
        (account.department_id,),
    )
    return [Question.model_validate(dict(row)) for row in rows]


@app.post("/api/reporting-questions", status_code=201)
def create_reporting_question(data: QuestionInput, db: DB, account: Manager) -> Question:
    with db:
        cursor = db.execute(
            "INSERT INTO reporting_questions (department_id, prompt, required) VALUES (?, ?, ?)",
            (account.department_id, data.prompt, data.required),
        )
    return Question(id=cursor.lastrowid, **data.model_dump())


@app.patch("/api/reporting-questions/{question_id}")
def edit_reporting_question(question_id: int, data: QuestionInput, db: DB, account: Manager) -> Question:
    with db:
        cursor = db.execute(
            "UPDATE reporting_questions SET prompt = ?, required = ? WHERE id = ? AND department_id = ?",
            (data.prompt, data.required, question_id, account.department_id),
        )
        if not cursor.rowcount:
            raise HTTPException(404, "Reporting question not found.")
    return Question(id=question_id, **data.model_dump())


def save_assignments(
    data: AssignmentSelection, occurrences: list[ShiftTime], db: DB, account: Manager,
    *, existing_id: int | None = None,
) -> list[Shift]:
    shifts = []
    with db:
        db.execute("BEGIN IMMEDIATE")
        saved_questions = []
        if existing_id is not None:
            existing = find_department_shift(existing_id, db, account)
            saved_questions = json.loads(existing["questions"])
        workers = {
            row["id"]: AssignedWorker.model_validate(dict(row))
            for row in db.execute(
                "SELECT id, email FROM accounts WHERE department_id = ? AND role = 'worker'",
                (account.department_id,),
            )
        }
        if any(worker_id not in workers for worker_id in data.worker_ids):
            raise HTTPException(422, "All assigned workers must belong to your department.")
        prompts = {
            row["id"]: row["prompt"]
            for row in db.execute(
                "SELECT id, prompt FROM reporting_questions WHERE department_id = ?",
                (account.department_id,),
            )
        }
        # Existing selections retain their saved wording even if the library has changed.
        prompts.update({question["id"]: question["prompt"] for question in saved_questions})
        if any(question.id not in prompts for question in data.questions):
            raise HTTPException(422, "All reporting questions must belong to your department.")
        questions = [
            Question(id=question.id, prompt=prompts[question.id], required=question.required)
            for question in data.questions
        ]
        snapshot = json.dumps([question.model_dump() for question in questions])
        assigned_workers = [workers[worker_id] for worker_id in data.worker_ids]
        for occurrence in occurrences:
            starts_at = occurrence.starts_at.astimezone(UTC)
            ends_at = occurrence.ends_at.astimezone(UTC)
            values = (
                starts_at.isoformat(timespec="microseconds"),
                ends_at.isoformat(timespec="microseconds"),
                snapshot,
            )
            if existing_id is None:
                cursor = db.execute(
                    "INSERT INTO shifts (department_id, starts_at, ends_at, questions) VALUES (?, ?, ?, ?)",
                    (account.department_id, *values),
                )
                shift_id = cursor.lastrowid
            else:
                shift_id = existing_id
                db.execute(
                    "UPDATE shifts SET starts_at = ?, ends_at = ?, questions = ? WHERE id = ?",
                    (*values, shift_id),
                )
                db.execute("DELETE FROM shift_workers WHERE shift_id = ?", (shift_id,))
            db.executemany(
                "INSERT INTO shift_workers (shift_id, worker_id) VALUES (?, ?)",
                [(shift_id, worker_id) for worker_id in data.worker_ids],
            )
            shifts.append(Shift(
                id=shift_id, starts_at=starts_at, ends_at=ends_at,
                questions=questions, workers=assigned_workers,
            ))
    return shifts


@app.post("/api/shifts", status_code=201)
def assign_shift(data: NewShift, db: DB, account: Manager) -> Shift:
    return save_assignments(data, [data], db, account)[0]


@app.post("/api/shifts/batch", status_code=201)
def assign_shift_batch(data: ShiftBatch, db: DB, account: Manager) -> list[Shift]:
    return save_assignments(data, data.occurrences, db, account)


def find_department_shift(shift_id: int, db: DB, account: Account) -> sqlite3.Row:
    row = db.execute(
        """SELECT questions FROM shifts WHERE id = ? AND department_id = ?
           AND NOT EXISTS (SELECT 1 FROM deleted_shifts WHERE shift_id = shifts.id)""",
        (shift_id, account.department_id),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Shift not found.")
    return row


@app.patch("/api/shifts/{shift_id}")
def edit_shift(shift_id: int, data: NewShift, db: DB, account: Manager) -> Shift:
    return save_assignments(data, [data], db, account, existing_id=shift_id)[0]


@app.delete("/api/shifts/{shift_id}", status_code=204)
def delete_shift(shift_id: int, db: DB, account: Manager) -> None:
    with db:
        db.execute("BEGIN IMMEDIATE")
        find_department_shift(shift_id, db, account)
        db.execute("INSERT INTO deleted_shifts (shift_id) VALUES (?)", (shift_id,))


@app.get("/api/shifts")
def list_shifts(db: DB, account: DepartmentStaff) -> list[Shift]:
    rows = db.execute(
        """SELECT s.id, s.starts_at, s.ends_at, s.questions, a.id AS worker_id, a.email
           FROM shifts s JOIN shift_workers sw ON sw.shift_id = s.id
           JOIN accounts a ON a.id = sw.worker_id
           WHERE s.department_id = ? AND (? OR sw.worker_id = ?)
             AND NOT EXISTS (SELECT 1 FROM deleted_shifts WHERE shift_id = s.id)
           ORDER BY s.starts_at DESC, s.id DESC, a.email""",
        (account.department_id, account.role == "manager", account.id),
    )
    shifts: dict[int, Shift] = {}
    for row in rows:
        shift_id = row["id"]
        if shift_id not in shifts:
            shifts[shift_id] = Shift(
                id=shift_id, starts_at=row["starts_at"], ends_at=row["ends_at"],
                questions=json.loads(row["questions"]), workers=[],
            )
        shifts[shift_id].workers.append(AssignedWorker(id=row["worker_id"], email=row["email"]))
    return list(shifts.values())
