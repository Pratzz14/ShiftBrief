# ShiftBrief functional review

ShiftBrief supports the core handover for one plant: the owner creates departments and manager accounts; a manager adds workers and machines, then schedules assignments; workers record machine condition and submit reports; a manager follows up; the owner can monitor departments without changing operational records.

| Area | Findings and resulting behavior |
| --- | --- |
| Public homepage and setup | The homepage now links to the workspace. First owner setup, scoped account creation, sign-in, and sign-out use the existing SQLite-backed session flow. A built frontend can now run on the same origin as the API. |
| Assignment and reporting | Assignments previously held times, workers, and reporting questions, but no space for instructions. Managers can now describe the planned work on single, repeated, and edited shifts. Existing shifts keep their records and start with an empty description. Question snapshots and submitted-shift locks are preserved. |
| Worker workflow | Today's assignments, the next shift, and completed shifts are distinct. History shows the manager's description and the submitted report summary; drafts stay private. An overdue report can still be submitted and is identified as late. |
| Department workflow | The overview surfaces today's coverage, report status, faults, and flagged reports. Completed shifts can be searched by description, summary, worker, or displayed date. Managers resolve report issues. Managers and workers can clear a machine fault by recording Working. |
| Plant workflow | The department comparison surfaces machine and reporting counts without needing to traverse the company structure. Roster expansion and department drill-down remain available. Drill-down is read-only for the owner; workers cannot access another department. |

The role concepts and implemented screens use a shared navy sidebar, light canvas, date and action bar, white panels, and text-labeled status colors. The owner screen uses actual machine condition and report counts. It leaves out the concept's uptime and issue-rate examples because the app does not calculate those measures. Assignment and report content comes from the database.

Remaining rollout decisions:

- **Account lifecycle:** account creation is supported, but password reset, account deactivation, and changing a worker's department are not available from the app.
- **Scheduling policy:** the app accepts overlapping assignments. It does not enforce staffing rules or send shift and overdue reminders. Calendar grouping follows the viewing device's time zone; a plant-wide time zone would make grouping uniform across remote viewers.
- **Machine lifecycle and issue tracking:** managers can register and rename machines and read existing archived records. There is no archive or restore action in the UI. Faults reflect the latest recorded condition; there is no separate maintenance ticket with an assignee or due date.
- **Deployment and data:** SQLite suits this single-plant setup. Use a persistent volume, define a backup and restore process, and verify access and sign-in protections before exposing the app to a wider network. Dashboard and roster endpoints currently return all matching records; monitor history size and add server-side paging if it becomes a bottleneck.
