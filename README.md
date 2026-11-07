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

Open the [public homepage](http://127.0.0.1:5173/) to see the product overview, features, and illustrative pricing. The homepage also runs with the API stopped.

Open the [operations app](http://127.0.0.1:5173/app) to sign in or set up the plant owner account. The Vite server proxies API requests to FastAPI on port 8000. When serving a production build, serve the frontend entry document at both `/` and `/app`.

## Account setup

1. Create the Plant Owner account using an email and a password of at least 12 characters.
2. As the owner, create a department. Create a manager account with an email, an initial password, and the selected department.
3. Sign in as the manager and create worker accounts. Workers automatically belong to the manager's department.
4. Sign in as a worker with the credentials set by the manager.

## Department operations

- In **Machines**, managers can register and rename machines. Workers see active machines in their department and can record a status. A condition note is required for **Not Working** or **Has Issues**. Select a machine to see who updated it and when. Managers can still view the history of previously archived machines.
- In **Shift assignments**, managers can add and edit reusable questions, then schedule a shift for one or more workers. Set each selected question as required or optional for that shift. Workers can view their assignments and saved questions under **My Shifts**. Later edits to the question library leave existing assignments intact.
- Choose **Repeat weekly** to create individual shifts for selected weekdays in an inclusive date range of up to 366 days. An end time earlier than the start time creates an overnight shift. Each occurrence gets the same workers and reporting questions.
- Use **Edit shift** or **Delete shift** on an individual scheduled shift, including a weekly occurrence, until its first report is submitted.
- In **My Shifts**, workers can save one draft per assigned shift, answer its reporting questions, summarize their activity, and flag an issue with an optional machine link. Submission opens at shift start and requires all mandatory answers. Submitted reports are read-only, with a late label for reports submitted after shift end.
- The manager **Dashboard** shows machine status, upcoming shifts, outstanding reports, and recent submissions. In **Follow-up**, managers resolve report issues with a note. Machine faults remain visible until a worker records **Working**.
- The owner **Plant overview** shows totals across departments and links to read-only department dashboards. Availability is the percentage of active machines marked **Working**. Machines awaiting their first status update have a separate count.
- Shift times are entered and displayed in the browser's time zone and stored in UTC. Use the device time zone shown on the assignment form when entering a shift.

Accounts and sessions persist in the local SQLite database at `backend/shiftbrief.sqlite3`. Set `SHIFTBRIEF_DB` before starting the API to use a different file. Sessions expire after eight hours and signing out revokes the current session.

Complete the first-owner setup on a trusted local connection. If serving behind HTTPS, set `SHIFTBRIEF_SECURE_COOKIE=1` and serve the frontend and API from the same origin.
