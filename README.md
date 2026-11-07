# ShiftBrief

ShiftBrief is a shift handover app for a single plant. Managers schedule work and define what workers need to report. Workers record machine conditions and submit shift reports. Department teams can see what happened and what still needs follow-up, while the plant owner can compare departments.

The public homepage is at `/`. The signed-in operations workspace is at `/app`.

## Features

| Workspace | What you can do |
| --- | --- |
| **Plant owner** | Create departments and manager accounts. Compare machine conditions and report coverage across departments. Drill into read-only department dashboards, rosters, and worker schedules. |
| **Department manager** | Add workers and register machines. Schedule one-time, weekly, and overnight shifts for one or more workers. Add shift instructions and choose reusable required or optional questions. Review reports and resolve flagged issues. |
| **Worker** | See today's assignments, the next shift, and shift history. Type or record a shift update, review answers, save a draft, and submit a report. Record machine conditions and read the department handover. |

- **Shift reports** use the questions saved with each assignment. With draft generation enabled, one update can fill blank answers, suggest notes, ask for clarification, and highlight issues. Workers review and edit the result before submitting.
- **Report rules** allow drafts before a shift starts. Submission requires all required answers and opens at shift start. Reports submitted at or after the scheduled end are marked late. Submitted reports are read-only and can include unanswered optional clarifications.
- **Machine history** tracks who recorded each condition and when. The available conditions are **Working**, **Has Issues**, and **Not Working**. A note is required for the last two.
- **Follow-up** collects open machine faults and report issues. Recording **Working** clears a machine fault. Managers close report issues with a resolution note.
- **Scheduling** supports editing or deleting individual occurrences until the first report for that shift is submitted. Shift times are stored in UTC. The workspace displays them and groups today's shifts in the browser's time zone, including overnight shifts that overlap today.

## Local setup

Use **Python 3.12** and **Node.js 22.12 or later on the Node 22 line**. Run the commands from the repository root. Scheduling, manual reports, and dashboards work without provider keys.

### 1. Install dependencies and start the API

In PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

On macOS or Linux, use `python3.12 -m venv .venv` and replace `.\.venv\Scripts\python.exe` with `./.venv/bin/python`.

The API creates and opens the SQLite database on startup. Check [API health](http://127.0.0.1:8000/api/health) for `{"status":"ok"}`.

### 2. Start the frontend

In a second terminal, from the repository root:

```sh
npm --prefix frontend ci
npm --prefix frontend run dev
```

Open the [operations workspace](http://127.0.0.1:5173/app) or the [public homepage](http://127.0.0.1:5173/). Vite forwards `/api` requests to the backend on port 8000.

### 3. Set up the first plant

1. Open the workspace on a trusted local connection and create the first **Plant Owner** account. New accounts require a password of at least 12 characters.
2. As the owner, open **Departments and managers**, create a department, and add its manager.
3. Sign in as that manager. Add a worker in **Workers**, register a machine in **Machines**, and create an assignment in **Shift assignments**. Add reporting questions if the shift needs them.
4. Sign in as the worker and open **My shifts**. Open the assignment, enter a shift update or answer the questions directly, then save a draft or submit once the shift starts.
5. Sign back in as the manager to review the submission and check the **Follow-up queue** in **Department overview**.

## Optional voice and draft generation

Create a `.env` file in the repository root and replace the placeholders for the features you want. The file is ignored by Git. The backend reads it on startup, and existing environment variables take precedence. Restart the API after changing these settings.

```dotenv
SHIFTBRIEF_VOICE_ENABLED=1
ELEVENLABS_API_KEY=your_elevenlabs_api_key

SHIFTBRIEF_AI_ENABLED=1
GEMINI_API_KEY=your_gemini_api_key
# Optional override for a Gemini model that supports structured output
# SHIFTBRIEF_GEMINI_MODEL=gemini-3.1-flash-lite
```

| Feature | How it works |
| --- | --- |
| **Voice input** | Select the mic beside **Shift update** and stop when finished. The transcript appears in the editable update field. Recordings are limited to three minutes in the browser. Microphone access requires localhost or HTTPS and browser permission. |
| **Generate draft** | Type or dictate an update, then select **Generate draft**. Review suggested answers, complete required questions, and add any confirmed issue details to your notes before submitting. |
| **Submitted report analysis** | The backend saves the report first, then generates an activity summary and looks for open issues. The original report remains available if analysis fails. Eligible reports can show **Generate AI summary** or **Retry AI analysis**. |

ElevenLabs Scribe v2 receives audio when a worker stops a recording. ShiftBrief does not store the recording. Gemini receives the update and assigned questions when the worker requests a draft, and receives the confirmed answers, question prompts, notes, and manual flag for submitted report analysis. Verify the provider setup with synthetic reports before sending plant data. [ElevenLabs transcription and retention settings](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)

## Build and serve from one address

After installing the dependencies, build the frontend, stop any development API already using port 8000, then start the API again:

```powershell
npm --prefix frontend run build
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open the [built operations workspace](http://127.0.0.1:8000/app). FastAPI serves the built React assets, the public homepage, and the workspace when `frontend/dist` is present at startup.

## Data and checks

- The React frontend uses Vite. The FastAPI backend stores accounts, sessions, shifts, reports, and machine records in SQLite. The default database is `backend/shiftbrief.sqlite3`. Set `SHIFTBRIEF_DB` to use a different file.
- When serving over HTTPS, keep the frontend and API on the same origin and set `SHIFTBRIEF_SECURE_COOKIE=1`. Give the database a persistent location and include it in your backup process.
- Run `npm --prefix frontend test` for shift time tests and `npm --prefix frontend run build` to verify the frontend build.

See the [functional review](docs/functional-review.md) for operational limits and rollout considerations.
