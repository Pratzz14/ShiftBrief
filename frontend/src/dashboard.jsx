import { useState } from 'react';
import { Dialog, LoadState, formatDate, useResource } from './ui';
import { ReviewReport } from './reports';

const statuses = ['Working', 'Not Working', 'Has Issues', 'Awaiting first update'];
const emptyMetrics = { machines: Object.fromEntries(statuses.map((status) => [status, 0])), due: 0, overdue: 0, report_issues: 0 };
const faulted = (status) => status === 'Not Working' || status === 'Has Issues';
const machineStatus = (machine) => machine.latest?.status ?? 'Awaiting first update';
const unavailable = ({ machines }) => machines['Not Working'] + machines['Has Issues'];
const unresolved = (metrics) => metrics.report_issues + unavailable(metrics);
const reportKey = (entry) => entry.shift_id + '/' + entry.worker_id;

function availability({ machines }) {
  const active = statuses.reduce((total, status) => total + machines[status], 0);
  return active ? new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 })
    .format(machines.Working / active) : '—';
}

function Metrics({ metrics }) {
  return (
    <dl className="dashboard-metrics">
      {[
        ['Machine availability', availability(metrics)],
        ...statuses.map((status) => [status, metrics.machines[status]]),
        ['Unavailable machines', unavailable(metrics)],
        ['Due reports', metrics.due],
        ['Overdue reports', metrics.overdue],
        ['Unresolved issues', unresolved(metrics)],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}

function StatusFilter({ label, options, value, onChange }) {
  return (
    <label>{label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Records({ items, itemKey, empty, render }) {
  return items.length ? (
    <ul className="record-list">{items.map((item) => <li key={itemKey(item)}>{render(item)}</li>)}</ul>
  ) : <p>{empty}</p>;
}

function shiftTime({ starts_at, ends_at }) {
  return <small>{formatDate(starts_at)} to {formatDate(ends_at)}</small>;
}

export function DepartmentDashboard({ departmentId, canResolve, onExpired }) {
  const dashboard = useResource('/departments/' + departmentId + '/dashboard', onExpired);
  const [from, setFrom] = useState('');
  const [through, setThrough] = useState('');
  const [machineFilter, setMachineFilter] = useState('');
  const [outstandingFilter, setOutstandingFilter] = useState('');
  const [submissionFilter, setSubmissionFilter] = useState('');
  const [issueFilter, setIssueFilter] = useState('');
  const [selected, setSelected] = useState(null);
  if (!dashboard.data) return <LoadState resource={dashboard} label="department dashboard" />;

  const { department, as_of, metrics, machines, activity } = dashboard.data;
  const invalidRange = Boolean(from && through && from > through);
  const start = from ? new Date(from + 'T00:00:00') : -Infinity;
  const end = through ? new Date(through + 'T00:00:00') : Infinity;
  if (through) end.setDate(end.getDate() + 1);
  function inRange(value) {
    const date = new Date(value);
    return invalidRange || (date >= start && date < end);
  }

  const upcoming = new Map();
  const outstanding = [];
  const submissions = [];
  const reportIssues = [];
  for (const entry of activity) {
    if (entry.status === 'Upcoming') {
      if (inRange(entry.starts_at)) {
        if (!upcoming.has(entry.shift_id)) upcoming.set(entry.shift_id, { ...entry, workers: [] });
        upcoming.get(entry.shift_id).workers.push(entry.worker_email);
      }
    } else if (entry.status === 'Submitted') {
      const status = entry.late ? 'Late' : 'On time';
      if (inRange(entry.submitted_at) && (!submissionFilter || status === submissionFilter)) submissions.push(entry);
      if (entry.open_issue) reportIssues.push(entry);
    } else if (inRange(entry.ends_at) && (!outstandingFilter || entry.status === outstandingFilter)) {
      outstanding.push(entry);
    }
  }
  outstanding.sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at));
  submissions.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  const faults = machines.filter((machine) => faulted(machineStatus(machine)));
  const visibleMachines = machines.filter((machine) => !machineFilter || machineStatus(machine) === machineFilter);
  const reviewButton = (entry) => (
    <button type="button" className="secondary record-button" aria-pressed={selected !== null && reportKey(selected) === reportKey(entry)}
      onClick={() => setSelected(entry)}>
      {entry.worker_email}<small>{entry.late ? 'Submitted late' : 'Submitted'} · {formatDate(entry.submitted_at)}</small>
    </button>
  );

  return (
    <>
      <section className="card section-gap">
        <div className="dashboard-heading">
          <h2>{department.name} dashboard</h2>
          <button type="button" className="secondary" onClick={dashboard.retry}>Refresh dashboard</button>
        </div>
        <Metrics metrics={metrics} />
        <small>Updated {formatDate(as_of)}</small>
      </section>
      <section className="card section-gap">
        <h2>Follow-up</h2>
        <StatusFilter label="Issue type" options={['Report issues', 'Machine faults']} value={issueFilter} onChange={setIssueFilter} />
        {issueFilter !== 'Machine faults' && (
          <div>
            <h3>Flagged report issues</h3>
            <Records items={reportIssues} itemKey={reportKey} empty="No open report issues." render={(entry) => (
              <>
                {reviewButton(entry)}
                {entry.machine_name && <small>Machine · {entry.machine_name}</small>}
                <p className="note">{entry.open_issue}</p>
              </>
            )} />
          </div>
        )}
        {issueFilter !== 'Report issues' && (
          <div>
            <h3>Machine faults</h3>
            <Records items={faults} itemKey={({ id }) => id} empty="No active machine faults." render={(machine) => (
              <>
                <strong>{machine.name} · {machine.latest.status}</strong>
                <small>{machine.latest.worker_email} · {formatDate(machine.latest.recorded_at)}</small>
                <p className="note">{machine.latest.note}</p>
              </>
            )} />
          </div>
        )}
      </section>
      {selected && (
        <Dialog title="Report review" dismissLabel="Close report" onDismiss={() => setSelected(null)}>
          <ReviewReport key={reportKey(selected)} departmentId={departmentId} entry={selected}
            canResolve={canResolve} onExpired={onExpired} onResolve={() => {
              const key = reportKey(selected);
              dashboard.setData((current) => ({
                ...current,
                metrics: { ...current.metrics, report_issues: current.metrics.report_issues - 1 },
                activity: current.activity.map((entry) => reportKey(entry) === key
                  ? { ...entry, open_issue: null } : entry),
              }));
            }} />
        </Dialog>
      )}
      <section className="card section-gap">
        <h2>Activity dates</h2>
        <div className="dashboard-dates">
          <label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>Through<input type="date" value={through} onChange={(event) => setThrough(event.target.value)} /></label>
        </div>
        {invalidRange && <p role="alert" className="error">Choose a through date on or after the from date. Showing all dates.</p>}
        <small>Dates use your device’s time zone. Counts and follow-up show current conditions.</small>
      </section>
      <div className="panels">
        <section className="card">
          <h2>Machines</h2>
          <StatusFilter label="Machine status" options={statuses} value={machineFilter} onChange={setMachineFilter} />
          <Records items={visibleMachines} itemKey={({ id }) => id} empty="No matching machines." render={(machine) => (
            <><strong>{machine.name}</strong><small>{machineStatus(machine)}</small></>
          )} />
        </section>
        <section className="card">
          <h2>Upcoming shifts</h2>
          <Records items={[...upcoming.values()]} itemKey={({ shift_id }) => shift_id} empty="No upcoming shifts in this range." render={(entry) => (
            <><strong>{entry.workers.join(', ')}</strong>{shiftTime(entry)}</>
          )} />
        </section>
        <section className="card">
          <h2>Due and overdue reports</h2>
          <StatusFilter label="Outstanding report status" options={['Due', 'Overdue']} value={outstandingFilter} onChange={setOutstandingFilter} />
          <Records items={outstanding} itemKey={reportKey} empty="No matching outstanding reports." render={(entry) => (
            <><strong>{entry.worker_email} · {entry.status}</strong>{shiftTime(entry)}</>
          )} />
        </section>
        <section className="card">
          <h2>Recent submissions</h2>
          <StatusFilter label="Submission timing" options={['On time', 'Late']} value={submissionFilter} onChange={setSubmissionFilter} />
          <Records items={submissions} itemKey={reportKey} empty="No matching submissions." render={reviewButton} />
        </section>
      </div>
    </>
  );
}

export function PlantDashboard({ onExpired }) {
  const plant = useResource('/dashboard', onExpired);
  const [selected, setSelected] = useState(null);
  if (selected !== null) return (
    <>
      <button type="button" className="secondary section-gap" onClick={() => { plant.retry(); setSelected(null); }}>Back to plant overview</button>
      <DepartmentDashboard departmentId={selected} canResolve={false} onExpired={onExpired} />
    </>
  );
  if (!plant.data) return <LoadState resource={plant} label="plant overview" />;

  const { departments } = plant.data;
  const total = { ...emptyMetrics, machines: { ...emptyMetrics.machines } };
  for (const { metrics } of departments) {
    for (const status of statuses) total.machines[status] += metrics.machines[status];
    total.due += metrics.due;
    total.overdue += metrics.overdue;
    total.report_issues += metrics.report_issues;
  }

  return (
    <>
      <section className="card section-gap">
        <div className="dashboard-heading">
          <h2>Plant overview</h2>
          <button type="button" className="secondary" onClick={plant.retry}>Refresh overview</button>
        </div>
        <Metrics metrics={total} />
      </section>
      <section className="card">
        <h2>Departments</h2>
        <Records items={departments} itemKey={({ id }) => id} empty="No departments yet." render={({ id, name, metrics }) => (
          <button type="button" className="secondary record-button" onClick={() => setSelected(id)}>
            {name}
            <small>{availability(metrics)} available · {metrics.machines['Awaiting first update']} awaiting first update</small>
            <small>{unavailable(metrics)} unavailable · {unresolved(metrics)} unresolved · {metrics.overdue} overdue</small>
          </button>
        )} />
      </section>
    </>
  );
}
