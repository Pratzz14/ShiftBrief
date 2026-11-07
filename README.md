# ShiftBrief

ShiftBrief provides a machine register, shift assignments, worker reports, issue follow-up, and operations dashboards for one plant.

## Run locally

Use Python 3.12 and Node.js 22.12 or later on the Node 22 line. From the repository root, start the API in PowerShell.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload
```

In a separate terminal, start the React app.

```powershell
cd frontend
npm install
npm run dev
```

Open the [public homepage](http://127.0.0.1:5173/) to see the product overview, features, and per-plant pricing. The homepage also runs with the API stopped.

Open the [operations app](http://127.0.0.1:5173/app) to sign in or set up the plant owner account. The Vite server proxies API requests to FastAPI on port 8000. When serving a production build, serve the frontend entry document at both `/` and `/app`.

To run the built app from a single local address, build the frontend before starting the API:

```powershell
npm --prefix frontend run build
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1
```

Open [ShiftBrief operations](http://127.0.0.1:8000/app). The API serves the homepage, app, and frontend assets when `frontend/dist` is present at startup. `GET /api/health` checks that the API can read its database. Run `npm --prefix frontend test` for the shift time tests.

## Account setup

1. Create the Plant Owner account using an email and a password of at least 12 characters.
2. As the owner, create a department. Create a manager account with an email, an initial password, and the selected department.
3. Sign in as the manager and create worker accounts. Workers automatically belong to the manager's department.
4. Sign in as a worker with the credentials set by the manager.

## Department operations

- In **Machines**, managers can register and rename machines. Managers and workers can record a status for active machines in their department. Machines start as **Working** until the first recorded update. A condition note is required for **Not Working** or **Has Issues**. The machine list shows the three most recent updates with their dates and times. Select a machine for the full history with authors and notes. Managers can still view the history of previously archived machines.
- In **Shift assignments**, managers can schedule a shift for one or more workers and add a description with the planned work, checks, or handover instructions. Add or edit reusable reporting questions under **Manage reporting questions** and set each selected question as required or optional. Later edits to the question library leave existing assignments intact.
- Choose **Repeat weekly** to create individual shifts for selected weekdays in an inclusive date range of up to 366 days. An end time earlier than the start time creates an overnight shift. Each occurrence gets the same workers and reporting questions.
- Use **Edit shift** or **Delete shift** on an individual scheduled shift, including a weekly occurrence, until its first report is submitted.
- In **My shifts**, workers can see all assignments that overlap today, the next shift, and completed shifts. A completed shift from earlier today appears in today's schedule and in history. Workers can save one draft per assigned shift, answer its reporting questions, add optional shift notes, and manually flag an issue with an optional machine link. Submission opens at shift start and requires all mandatory answers. Submitted reports are read-only and marked late if submitted at or after the scheduled end.
- **Department overview** shows today's shifts, per-worker reporting status, machine condition, and a searchable history with the assignment description alongside the submitted activity summary. Workers see this information in **Department handover**. Each active machine marked **Not Working** or **Has Issues** automatically appears as one open issue in the **Follow-up queue**. Further status updates keep the same machine issue open until a manager or worker records **Working**. Managers close report issues with a resolution note.

## Report analysis

- To enable AI analysis, set `SHIFTBRIEF_AI_ENABLED=1` and provide a server-side `GEMINI_API_KEY`. The default model is `gemini-3.1-flash-lite`. Set `SHIFTBRIEF_GEMINI_MODEL` to use a different Gemini model that supports structured output. Test with synthetic reports before enabling processing of plant data.
- Gemini receives the submitted answers, their question prompts, optional notes, and any manual flag. It generates the activity summary and identifies problems that still need follow-up. A report has one follow-up item that combines its manual flag and any AI findings. Managers can close it with one resolution once analysis finishes. Reports and manual flags are saved immediately and remain available if analysis fails.
- In local PowerShell, stop the API and restart it from the same terminal where you set the key. The prompt below hides the key as you enter it.

  ```powershell
  $env:SHIFTBRIEF_AI_ENABLED = '1'
  $env:GEMINI_API_KEY = Read-Host 'Gemini API key' -MaskInput
  .\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload
  ```

- New reports with text are analyzed automatically when Gemini is enabled. For a report submitted while AI was disabled, open it and choose **Generate AI summary**. If a previous attempt failed, choose **Retry AI analysis**. The submitting worker or a manager in the same department can start this from the report view.
- **Plant overview** compares departments and links to their read-only dashboards. The owner can browse department rosters and workers' scheduled shifts. The working machine count uses all active machines as its denominator.
- Shift times are stored in UTC and entered and displayed in the browser's time zone. **Today** uses the browser's calendar day, including overnight shifts that overlap it. Use the device time zone shown on the assignment form when entering a shift. Use the refresh button for a new department or plant snapshot.

Accounts and sessions persist in the local SQLite database at `backend/shiftbrief.sqlite3`. Set `SHIFTBRIEF_DB` before starting the API to use a different file. Sessions expire after eight hours and signing out revokes the current session.

Complete the first-owner setup on a trusted local connection. If serving behind HTTPS, set `SHIFTBRIEF_SECURE_COOKIE=1` and serve the frontend and API from the same origin.

See the [functional review](docs/functional-review.md) for the role workflows and known gaps before a wider rollout.
