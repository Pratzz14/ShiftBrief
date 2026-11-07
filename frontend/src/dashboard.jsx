import { useState } from 'react';
import { Dialog, LoadState, formatDate, useResource } from './ui';
import { ReviewReport } from './reports';
import { Badge, Empty, Icon, Metrics, PageTitle, ShiftWhen, Table } from './operations-ui';
import { shiftWindow } from './shift-time';

const faulted = (machine) => ['Not Working', 'Has Issues'].includes(machine.latest?.status);
const unresolved = (metrics) => metrics.report_issues + metrics.machines['Not Working'] + metrics.machines['Has Issues'];
const reportKey = (entry) => entry.shift_id + '/' + entry.worker_id;
const machineCount = ({ machines }) => Object.values(machines).reduce((total, count) => total + count, 0);
const reportLabel = (entry) => entry.late ? 'Submitted late' : entry.status;

function groupShifts(activity, now) {
  const shifts = new Map();
  for (const entry of activity) {
    if (!shifts.has(entry.shift_id)) {
      shifts.set(entry.shift_id, { ...entry, ...shiftWindow(entry, now), assignments: [] });
    }
    shifts.get(entry.shift_id).assignments.push(entry);
  }
  return [...shifts.values()];
}

function Refresh({ onClick }) {
  return <button className="secondary icon-action" type="button" onClick={onClick} aria-label="Refresh overview" title="Refresh overview">
    <Icon name="refresh" />
  </button>;
}

function FollowUp({ issues, faults, onReview, onMachines }) {
  const [filter, setFilter] = useState('');
  const showIssues = filter !== 'Machine faults';
  const showFaults = filter !== 'Worker reports';
  return <section className="card">
    <div className="panel-heading">
      <h2>Follow-up queue ({issues.length + faults.length})</h2>
      <select aria-label="Issue type" value={filter} onChange={(event) => setFilter(event.target.value)}>
        <option value="">All issues</option><option>Worker reports</option><option>Machine faults</option>
      </select>
    </div>
    {!(showIssues && issues.length) && !(showFaults && faults.length) && <Empty>No open issues in this view.</Empty>}
    {showIssues && issues.length > 0 && <ul className="issue-list">
      {issues.map((entry) => <li key={reportKey(entry)}>
        <div className="issue-meta"><Badge>Worker report</Badge><small>{formatDate(entry.submitted_at)}</small></div>
        <strong>{entry.worker_name}{entry.machine_name ? ' · ' + entry.machine_name : ''}</strong>
        <p className="note">{entry.open_issue}</p>
        <button type="button" className="secondary compact" onClick={() => onReview(entry)}>Review report</button>
      </li>)}
    </ul>}
    {showFaults && faults.length > 0 && <ul className="issue-list">
      {faults.map((machine) => <li key={machine.id}>
        <div className="issue-meta"><Badge>Machine fault</Badge><small>{formatDate(machine.latest.recorded_at)}</small></div>
        <strong>{machine.name} · {machine.latest.status}</strong>
        <p className="note">{machine.latest.note}</p>
        <small>Reported by {machine.latest.worker_email}. Clears when marked Working.</small>
        {onMachines && <button type="button" className="secondary compact" onClick={() => onMachines(machine.id)}>Open machine</button>}
      </li>)}
    </ul>}
  </section>;
}

export function DepartmentDashboard({ departmentId, mode = 'manager', onExpired, onAssign, onMachines }) {
  const dashboard = useResource('/departments/' + departmentId + '/dashboard', onExpired);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  if (!dashboard.data) return <LoadState resource={dashboard} label="department overview" />;

  const { department, as_of, machines, activity, metrics } = dashboard.data;
  const now = Date.parse(as_of);
  const shifts = groupShifts(activity, now);
  const today = shifts.filter((shift) => shift.today);
  const search = query.trim().toLowerCase();
  const past = activity.filter((entry) => Date.parse(entry.ends_at) <= now
    && [entry.description, entry.summary, entry.worker_name, entry.worker_email, formatDate(entry.starts_at)]
      .some((value) => value?.toLowerCase().includes(search)))
    .sort((a, b) => Date.parse(b.ends_at) - Date.parse(a.ends_at) || b.shift_id - a.shift_id);
  const faults = machines.filter(faulted);
  const issues = activity.filter((entry) => entry.open_issue)
    .sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at));
  const manager = mode === 'manager';

  return <>
    <PageTitle title={mode === 'worker' ? 'Department handover' : 'Department overview'} subtitle={department.name}
      now={now} action={<><Refresh onClick={dashboard.retry} />
        {onAssign && <button type="button" onClick={onAssign}>Assign shift</button>}</>} />
    <Metrics items={[
      ['Machines working', metrics.machines.Working + ' / ' + machineCount(metrics), 'machines'],
      ['Reports due', metrics.due, 'report'],
      ['Reports overdue', metrics.overdue, 'alert', metrics.overdue > 0],
      ['Open issues', unresolved(metrics), 'flag'],
    ]} />
    <div className="ops-split manager-split">
      <section className="card">
        <h2>Today’s shifts</h2>
        <Table columns={['Shift', 'Assignment', 'Reports']} rows={today} label="Today's department shifts"
          empty="No department shifts overlap today." render={(shift) => (
            <tr key={shift.shift_id}>
              <th scope="row"><ShiftWhen shift={shift} /><Badge>{shift.phase}</Badge></th>
              <td><strong>{shift.assignments.map((entry) => entry.worker_name).join(', ')}</strong>
                <p className="note table-note">{shift.description || 'No shift description provided.'}</p></td>
              <td><ul className="report-state-list">{shift.assignments.map((entry) => (
                <li key={entry.worker_id}>
                  {shift.assignments.length > 1 && <small>{entry.worker_name}</small>}
                  {entry.submitted_at ? <button type="button" className="badge-action" onClick={() => setSelected(entry)}
                    aria-label={'Review report by ' + entry.worker_name}><Badge>{reportLabel(entry)}</Badge></button>
                    : <Badge>{reportLabel(entry)}</Badge>}
                </li>
              ))}</ul></td>
            </tr>
          )} />
      </section>
      <FollowUp issues={issues} faults={faults} onReview={setSelected} onMachines={onMachines} />
    </div>
    <section className="card">
      <div className="panel-heading"><h2>Past shift descriptions</h2>
        <input type="search" aria-label="Search past shift descriptions" placeholder="Search past shifts" value={query}
          onChange={(event) => setQuery(event.target.value)} /></div>
      <Table key={search} columns={['Shift', 'Description', 'Worker report summary', 'Actions']} rows={past}
        label="Past shift descriptions" empty={search ? 'No past shifts match your search.' : 'No completed shifts yet.'}
        render={(entry) => <tr key={reportKey(entry)}>
          <th scope="row"><ShiftWhen shift={entry} /><small>{entry.worker_name}</small></th>
          <td className="note">{entry.description || 'No shift description provided.'}</td>
          <td>{entry.submitted_at ? <p className="note table-note">{entry.summary || 'No summary provided.'}</p>
            : <Badge>Overdue</Badge>}</td>
          <td>{entry.submitted_at && <button className="secondary compact" type="button" onClick={() => setSelected(entry)}>Review</button>}</td>
        </tr>} />
    </section>
    {selected && <Dialog title="Report review" dismissLabel="Close report" onDismiss={() => setSelected(null)}>
      <ReviewReport departmentId={departmentId} entry={selected} canResolve={manager} onExpired={onExpired} onResolve={() => {
        dashboard.setData((current) => ({
          ...current,
          metrics: { ...current.metrics, report_issues: Math.max(0, current.metrics.report_issues - 1) },
          activity: current.activity.map((entry) => reportKey(entry) === reportKey(selected)
            ? { ...entry, open_issue: null } : entry),
        }));
      }} />
    </Dialog>}
  </>;
}

function WorkerRoster({ departmentId, onExpired }) {
  const roster = useResource('/departments/' + departmentId + '/roster', onExpired);
  if (!roster.data) return <LoadState resource={roster} label="worker roster" />;
  return <Table columns={['Worker', 'Current and upcoming shifts']} rows={roster.data} label="Worker roster"
    empty="No workers assigned to this department." render={(worker) => <tr key={worker.id}>
      <th scope="row">{worker.name}</th>
      <td>{worker.shifts.length ? <details className="roster-details">
        <summary>{worker.shifts.length} scheduled {worker.shifts.length === 1 ? 'shift' : 'shifts'}</summary>
        <ul>{worker.shifts.map((shift) => <li key={shift.id}><ShiftWhen shift={shift} /></li>)}</ul>
      </details> : 'No upcoming shifts'}</td>
    </tr>} />;
}

export function PlantDashboard({ onExpired, onAccess }) {
  const plant = useResource('/dashboard', onExpired);
  const [selected, setSelected] = useState(null);
  const [expanded, setExpanded] = useState(null);
  if (selected !== null) return <>
    <button type="button" className="secondary section-gap" onClick={() => { plant.retry(); setSelected(null); }}>Back to plant overview</button>
    <DepartmentDashboard departmentId={selected} mode="owner" onExpired={onExpired} />
  </>;
  if (!plant.data) return <LoadState resource={plant} label="plant overview" />;

  const { company_name, departments, as_of } = plant.data;
  const totals = departments.reduce((totals, { metrics }) => ({
    working: totals.working + metrics.machines.Working,
    machines: totals.machines + machineCount(metrics),
    overdue: totals.overdue + metrics.overdue,
    issues: totals.issues + unresolved(metrics),
  }), { working: 0, machines: 0, overdue: 0, issues: 0 });
  const rosterDepartment = departments.find(({ id }) => id === expanded);

  return <>
    <PageTitle title="Plant overview" subtitle={company_name} now={Date.parse(as_of)} action={<>
      <Refresh onClick={plant.retry} /><button type="button" onClick={onAccess}>Manage access</button>
    </>} />
    <Metrics items={[
      ['Departments', departments.length, 'overview'],
      ['Machines working', totals.working + ' / ' + totals.machines, 'machines'],
      ['Reports overdue', totals.overdue, 'alert', totals.overdue > 0],
      ['Open issues', totals.issues, 'flag'],
    ]} />
    <section className="card section-gap">
      <h2>Department performance</h2>
      <p className="panel-description">Machine status, reports, and open issues by department.</p>
      <Table columns={['Department', 'Managers', 'Working machines', 'Due', 'Overdue', 'Open issues', 'Actions']}
        rows={departments} label="Department performance" empty="No departments yet. Use Manage access to add one."
        render={({ id, name, metrics, managers }) => {
          const count = machineCount(metrics);
          return <tr key={id}><th scope="row">{name}</th><td>{managers.join(', ') || 'Unassigned'}</td>
            <td>{metrics.machines.Working} of {count}{count > 0 && ' (' + Math.round(metrics.machines.Working * 100 / count) + '%)'}</td>
            <td>{metrics.due}</td><td>{metrics.overdue > 0 ? <span className="ops-badge" data-tone="urgent">{metrics.overdue}</span> : 0}</td>
            <td>{unresolved(metrics)}</td>
            <td><button type="button" className="text-action" aria-label={'Open department: ' + name} onClick={() => setSelected(id)}>
              Open department <Icon name="arrow" /></button></td></tr>;
        }} />
    </section>
    <section className="card">
      <h2>Company structure</h2>
      <p className="panel-description">Select a department to see its worker roster and scheduled shifts.</p>
      {departments.length ? <div className="company-layout">
        <div>
          <strong className="company-name"><Icon name="machines" />{company_name}</strong>
          <ul className="company-tree">{departments.map(({ id, name }) => <li key={id}>
            <button type="button" className="secondary" aria-expanded={expanded === id} aria-controls="department-roster"
              onClick={() => setExpanded(expanded === id ? null : id)}>{name}</button>
          </li>)}</ul>
        </div>
        <div id="department-roster">
          <h3>{rosterDepartment ? rosterDepartment.name + ' roster' : 'Department roster'}</h3>
          {rosterDepartment ? <WorkerRoster key={expanded} departmentId={expanded} onExpired={onExpired} />
            : <Empty>Choose a department to view its roster.</Empty>}
        </div>
      </div> : <Empty>No departments to display.</Empty>}
    </section>
  </>;
}
