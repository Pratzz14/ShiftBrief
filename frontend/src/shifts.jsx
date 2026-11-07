import { useId, useState } from 'react';
import { Dialog, Form, LoadState, formatDate, useResource, write } from './ui';
import { WorkerReport, summaryText } from './reports';
import { Badge, Empty, Icon, Metrics, PageTitle, ShiftWhen, Table } from './operations-ui';
import { shiftWindow, useClock } from './shift-time';

const localZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayMs = 24 * 60 * 60 * 1000;
const pendingSummaries = (shifts) => shifts.some((shift) => shift.report_analysis_state === 'pending');

function toTimestamp(value) {
  const date = new Date(value);
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  if (!Number.isFinite(date.getTime()) || localTime.toISOString().slice(0, 16) !== value) {
    throw new Error('Enter a valid local start and end time.');
  }
  return date.toISOString();
}

function localShiftTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function weeklyOccurrences({ first_date, last_date, start_time, end_time, weekdays: selectedDays }) {
  if (!selectedDays.length) throw new Error('Select at least one weekday.');
  if (start_time === end_time) throw new Error('Choose different start and end times.');
  const first = Date.parse(first_date + 'T00:00:00Z');
  const last = Date.parse(last_date + 'T00:00:00Z');
  if (last < first || last - first >= 366 * dayMs) {
    throw new Error('Select a date range of up to 366 days.');
  }
  const overnight = end_time < start_time;
  const occurrences = [];
  // Walk calendar dates in UTC, then interpret each shift time in the browser's time zone.
  for (let day = first; day <= last; day += dayMs) {
    const date = new Date(day);
    if (!selectedDays.includes(String(date.getUTCDay()))) continue;
    const startDate = date.toISOString().slice(0, 10);
    const endDate = new Date(day + (overnight ? dayMs : 0)).toISOString().slice(0, 10);
    try {
      occurrences.push({
        starts_at: toTimestamp(startDate + 'T' + start_time),
        ends_at: toTimestamp(endDate + 'T' + end_time),
      });
    } catch {
      throw new Error('A shift time is unavailable in your time zone for ' + startDate + '.');
    }
  }
  if (!occurrences.length) throw new Error('No selected weekdays fall within this date range.');
  return occurrences;
}

function QuestionFields({ question }) {
  const promptId = useId();
  return (
    <>
      <div className="field">
        <label htmlFor={promptId}>Question text</label>
        <textarea id={promptId} name="prompt" defaultValue={question?.prompt ?? ''} maxLength={500} required />
      </div>
      <label className="choice">
        <input name="required" type="checkbox" defaultChecked={question?.required ?? true} />
        Required by default
      </label>
    </>
  );
}

function QuestionLibrary({ questions, onSave }) {
  const [editing, setEditing] = useState(null);
  return (
    <section className="card">
      <h2>Reporting question library</h2>
      <Form label="Add reusable question" clear onSubmit={(data) => onSave(data)}>
        <QuestionFields />
      </Form>
      {questions.length ? (
        <ul className="record-list">
          {questions.map((question) => (
            <li key={question.id}>
              {editing === question.id ? (
                <>
                  <Form label="Save question" onSubmit={async (data) => {
                    await onSave(data, question.id);
                    setEditing(null);
                  }}>
                    <QuestionFields question={question} />
                  </Form>
                  <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel edit</button>
                </>
              ) : (
                <>
                  <p className="note">{question.prompt}</p>
                  <small>{question.required ? 'Required by default' : 'Optional by default'}</small>
                  <button type="button" className="secondary" onClick={() => setEditing(question.id)}>Edit question</button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : <p>No reusable questions yet.</p>}
    </section>
  );
}

function AssignmentForm({ workers, questions, onAssign, shift }) {
  const [workerIds, setWorkerIds] = useState(() => shift?.workers.map(({ id }) => id) ?? []);
  const [selectedQuestions, setSelectedQuestions] = useState(() => Object.fromEntries(
    (shift?.questions ?? []).map(({ id, required }) => [id, required]),
  ));
  const [weekly, setWeekly] = useState(false);
  const originalStart = localShiftTime(shift?.starts_at);
  const originalEnd = localShiftTime(shift?.ends_at);

  function toggleWorker(id, checked) {
    setWorkerIds((current) => checked ? [...current, id] : current.filter((workerId) => workerId !== id));
  }

  function selectQuestion(question, checked) {
    setSelectedQuestions((current) => {
      const next = { ...current };
      if (checked) next[question.id] = question.required;
      else delete next[question.id];
      return next;
    });
  }

  return (
    <section>
      {!workers.length ? <p>Add a worker from the Workers page to assign a shift.</p> : (
        <Form label={shift ? 'Save changes' : weekly ? 'Create weekly schedule' : 'Assign shift'} clear={!shift}
          onSubmit={async (data, formData) => {
          if (!workerIds.length) throw new Error('Select at least one worker.');
          const timing = weekly ? {
            occurrences: weeklyOccurrences({ ...data, weekdays: formData.getAll('weekday') }),
          } : {
            starts_at: shift && data.starts_at === originalStart ? shift.starts_at : toTimestamp(data.starts_at),
            ends_at: shift && data.ends_at === originalEnd ? shift.ends_at : toTimestamp(data.ends_at),
          };
          await onAssign({
            ...timing,
            description: data.description,
            worker_ids: workerIds,
            questions: questions.filter((question) => Object.hasOwn(selectedQuestions, question.id))
              .map(({ id }) => ({ id, required: selectedQuestions[id] })),
          });
          if (!shift) {
            setWorkerIds([]);
            setSelectedQuestions({});
          }
        }}>
          <p>Enter times in your device time zone ({localZone}).</p>
          {!shift && <label className="choice">
            <input type="checkbox" checked={weekly} onChange={(event) => setWeekly(event.target.checked)} />
            Repeat weekly
          </label>}
          {weekly ? (
            <>
              <label>First date<input name="first_date" type="date" required /></label>
              <label>Last date<input name="last_date" type="date" required /></label>
              <fieldset className="choices">
                <legend>Repeat on</legend>
                {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                  <label className="choice" key={day}>
                    <input type="checkbox" name="weekday" value={day} />{weekdays[day]}
                  </label>
                ))}
              </fieldset>
              <label>Start time<input name="start_time" type="time" required /></label>
              <label>End time<input name="end_time" type="time" required /></label>
              <small>An end time earlier than the start time falls on the following day.</small>
            </>
          ) : (
            <>
              <label>Shift start<input name="starts_at" type="datetime-local" defaultValue={originalStart} required /></label>
              <label>Shift end<input name="ends_at" type="datetime-local" defaultValue={originalEnd} required /></label>
            </>
          )}
          <fieldset className="choices">
            <legend>Assign workers</legend>
            {workers.map((worker) => (
              <label key={worker.id} className="choice">
                <input type="checkbox" checked={workerIds.includes(worker.id)}
                  onChange={(event) => toggleWorker(worker.id, event.target.checked)} />
                {worker.display_name || worker.email}
              </label>
            ))}
          </fieldset>
          <label>Shift description (optional)
            <textarea name="description" defaultValue={shift?.description ?? ''} maxLength={2000}
              placeholder="Add planned work, checks, and handover instructions." />
          </label>
          <fieldset className="choices">
            <legend>Reporting questions</legend>
            {questions.length === 0 && <p>Add questions in the library to include them in a shift.</p>}
            {questions.map((question) => (
              <div key={question.id}>
                <label className="choice">
                  <input type="checkbox" checked={Object.hasOwn(selectedQuestions, question.id)}
                    onChange={(event) => selectQuestion(question, event.target.checked)} />
                  {question.prompt}
                </label>
                {Object.hasOwn(selectedQuestions, question.id) && (
                  <label className="choice nested-choice">
                    <input type="checkbox" checked={selectedQuestions[question.id]}
                      onChange={(event) => {
                        const required = event.target.checked;
                        setSelectedQuestions((current) => ({ ...current, [question.id]: required }));
                      }} />
                    Required for this shift
                  </label>
                )}
              </div>
            ))}
          </fieldset>
        </Form>
      )}
    </section>
  );
}

const isSubmitted = (shift) => ['Submitted', 'Late'].includes(shift.report_status);
const isOverdue = (shift) => shift.phase === 'Completed' && !isSubmitted(shift);
const reportLabel = (shift) => shift.report_status === 'Late' ? 'Submitted late'
  : isOverdue(shift) ? 'Report overdue' : shift.report_status;
const describe = (shift) => shift.description || 'No shift description provided.';

function ReportAction({ shift, onAction, primary = false }) {
  const label = isSubmitted(shift) ? 'View report' : shift.report_status === 'Draft' ? 'Continue draft'
    : shift.phase === 'Upcoming' ? 'Draft report' : 'Start report';
  return <button type="button" className={primary && !isSubmitted(shift) ? '' : 'secondary compact'}
    onClick={() => onAction({ shift, action: 'report' })}>
    {primary && <Icon name="report" />}{label}
  </button>;
}

function WorkerShifts({ shifts, now, onAction }) {
  const [showUpcoming, setShowUpcoming] = useState(false);
  const today = shifts.filter((shift) => shift.today).reverse();
  const future = shifts.filter((shift) => shift.phase === 'Upcoming').reverse();
  const past = shifts.filter((shift) => shift.phase === 'Completed').sort(
    (a, b) => Date.parse(b.ends_at) - Date.parse(a.ends_at) || b.id - a.id,
  );
  const next = future[0];
  const overdue = past.filter(isOverdue).length;
  return <>
    <PageTitle title="My shifts" subtitle="See your assignments, record your work, and catch up on handover." now={now} />
    <Metrics items={[
      ['In progress', today.filter((shift) => shift.phase === 'In progress').length],
      ['Today', today.length], ['Reports overdue', overdue, null, overdue > 0],
    ]} />
    <div className="ops-split worker-split">
      <section className="card">
        <h2>Today’s shifts</h2>
        {today.length ? <ul className="today-list">{today.map((shift) => <li key={shift.id}>
          <div className="today-top"><ShiftWhen shift={shift} /><Badge>{shift.phase}</Badge></div>
          <div className="today-bottom"><div><strong>Shift description</strong>
            <p className="note table-note">{describe(shift)}</p></div>
            <ReportAction shift={shift} onAction={onAction} primary /></div>
          {shift.report_status !== 'Pending' || isOverdue(shift) ? <Badge>{reportLabel(shift)}</Badge> : null}
        </li>)}</ul> : <Empty>No assignments overlap today.</Empty>}
      </section>
      <section className="card">
        <h2>Next shift</h2>
        {next ? <>
          <ShiftWhen shift={next} />
          <p className="note">{describe(next)}</p>
          <ReportAction shift={next} onAction={onAction} />
          {future.length > 1 && <div className="upcoming-toggle">
            <button type="button" className="text-action" aria-expanded={showUpcoming} aria-controls="later-shifts"
              onClick={() => setShowUpcoming(!showUpcoming)}>{showUpcoming ? 'Hide' : 'Show'} later shifts ({future.length - 1})</button>
            <div id="later-shifts" hidden={!showUpcoming}>{showUpcoming && <Table columns={['Shift', 'Report']} rows={future.slice(1)}
              label="Later shifts" render={(shift) => <tr key={shift.id}><th scope="row"><ShiftWhen shift={shift} />
                <p className="note table-note">{describe(shift)}</p></th><td><ReportAction shift={shift} onAction={onAction} /></td></tr>} />}</div>
          </div>}
        </> : <Empty>No upcoming shifts scheduled.</Empty>}
      </section>
    </div>
    <section className="card worker-history">
      <h2>Past shifts</h2>
      <Table columns={['Shift', 'Description', 'Report', 'Action']} rows={past} label="My past shifts"
        empty="Your completed assignments will appear here." render={(shift) => <tr role="row" key={shift.id}>
          <th scope="row" role="rowheader"><ShiftWhen shift={shift} /></th><td className="note" role="cell">{describe(shift)}</td>
          <td role="cell"><Badge>{reportLabel(shift)}</Badge>
            {isSubmitted(shift) && <p className="note table-note">
              {summaryText(shift.report_summary, shift.report_analysis_state)}</p>}</td>
          <td role="cell"><ReportAction shift={shift} onAction={onAction} primary={isOverdue(shift)} /></td>
        </tr>} />
    </section>
  </>;
}

function Schedule({ shifts, onAction }) {
  const [filter, setFilter] = useState('Today and upcoming');
  const rows = shifts.filter((shift) => filter === 'All shifts' || (filter === 'Completed'
    ? shift.phase === 'Completed' : shift.today || shift.phase === 'Upcoming'));
  if (filter === 'Today and upcoming') rows.reverse();
  return <section className="card">
    <div className="panel-heading"><h2>Scheduled shifts</h2>
      <select aria-label="Shift date filter" value={filter} onChange={(event) => setFilter(event.target.value)}>
        <option>Today and upcoming</option><option>Completed</option><option>All shifts</option>
      </select></div>
    <Table key={filter} columns={['Shift', 'Assignment', 'Status', 'Actions']} rows={rows} label="Scheduled shifts"
      empty="No shifts match this view." render={(shift) => <tr key={shift.id}>
        <th scope="row"><ShiftWhen shift={shift} /></th>
        <td><strong>{shift.workers.map((worker) => worker.display_name || worker.email).join(', ')}</strong>
          <p className="note table-note">{describe(shift)}</p>
          {!!shift.questions.length && <details><summary>{shift.questions.length} reporting questions</summary>
            <ol>{shift.questions.map((question) => <li className="note" key={question.id}>
              {question.prompt} <small>{question.required ? 'Required' : 'Optional'}</small>
            </li>)}</ol></details>}</td>
        <td><Badge>{shift.phase}</Badge></td>
        <td>{shift.locked ? <small>Locked after report submission</small> : <div className="row-actions">
          <button type="button" className="secondary compact" onClick={() => onAction({ shift, action: 'edit' })}>Edit shift</button>
          <button type="button" className="secondary compact" onClick={() => onAction({ shift, action: 'delete' })}>Delete shift</button>
        </div>}</td>
      </tr>} />
  </section>;
}

export function ShiftPanel({ isManager, initialAssign, onExpired }) {
  const shifts = useResource('/shifts', onExpired, pendingSummaries);
  const workers = useResource(isManager ? '/staff' : null, onExpired);
  const questions = useResource(isManager ? '/reporting-questions' : null, onExpired);
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(initialAssign ? { action: 'assign' } : null);
  const now = useClock();
  const assignments = shifts.data?.map((shift) => ({ ...shift, ...shiftWindow(shift, now) }));

  function saveToList(saved) {
    const ids = new Set(saved.map(({ id }) => id));
    shifts.setData((current) => [...saved, ...current.filter(({ id }) => !ids.has(id))].sort(
      (a, b) => new Date(b.starts_at) - new Date(a.starts_at) || b.id - a.id,
    ));
  }

  async function saveQuestion({ prompt, required }, id) {
    const saved = await write(id ? '/reporting-questions/' + id : '/reporting-questions',
      id ? 'PATCH' : 'POST', { prompt, required: Boolean(required) }, onExpired);
    questions.setData((current) => id
      ? current.map((question) => question.id === id ? saved : question)
      : [...current, saved]);
    setNotice(id ? 'Reporting question saved.' : 'Reporting question added.');
  }

  async function assign(data) {
    const weekly = Boolean(data.occurrences);
    const result = await write(weekly ? '/shifts/batch' : '/shifts', 'POST', data, onExpired);
    const created = weekly ? result : [result];
    saveToList(created);
    setDialog(null);
    setNotice(weekly ? 'Weekly schedule created (' + created.length + ' shifts).' : 'Shift assigned.');
  }

  return (
    <>
      {isManager && (
        <PageTitle title="Shift assignments" subtitle="Schedule work and manage reporting questions." now={now}
          action={<button type="button" onClick={() => setDialog({ action: 'assign' })}>Assign shift</button>} />
      )}
      {notice && <p className="ops-notice" role="status">{notice}</p>}
      {!shifts.data ? <LoadState resource={shifts} label="shifts" /> : isManager ? (
        <>
          <Schedule shifts={assignments} onAction={setDialog} />
          <details className="question-disclosure"><summary>Manage reporting questions</summary>
            {questions.data ? <QuestionLibrary questions={questions.data} onSave={saveQuestion} />
              : <LoadState resource={questions} label="reporting questions" />}
          </details>
        </>
      ) : <WorkerShifts shifts={assignments} now={now} onAction={setDialog} />}
      {dialog && (
        <Dialog title={{ assign: 'Assign a shift', edit: 'Edit shift', delete: 'Delete shift', report: 'Shift report' }[dialog.action]}
          dismissLabel={dialog.action === 'report' ? 'Close report' : 'Cancel'}
          onDismiss={() => setDialog(null)}>
          {dialog.action === 'assign' ? (
            workers.data && questions.data && shifts.data
              ? <AssignmentForm workers={workers.data} questions={questions.data} onAssign={assign} />
              : <LoadState resource={!workers.data ? workers : !questions.data ? questions : shifts} label="shift options" />
          ) : dialog.action === 'edit' ? (
            workers.data && questions.data ? (
              <AssignmentForm shift={dialog.shift} workers={workers.data}
                questions={[
                  ...dialog.shift.questions,
                  ...questions.data.filter(({ id }) => !dialog.shift.questions.some((question) => question.id === id)),
                ]}
                onAssign={async (data) => {
                  const saved = await write('/shifts/' + dialog.shift.id, 'PATCH', data, onExpired);
                  saveToList([saved]);
                  setDialog((current) => current === dialog ? null : current);
                  setNotice('Shift updated.');
                }} />
            ) : <LoadState resource={!workers.data ? workers : questions} label="shift options" />
          ) : dialog.action === 'report' ? (
            <WorkerReport shiftId={dialog.shift.id} onExpired={onExpired} onSave={(report) => {
              shifts.setData((current) => current.map((shift) => shift.id === report.shift_id
                ? { ...shift, report_status: report.status, report_summary: report.submitted_at ? report.summary : null,
                  report_analysis_state: report.analysis_state } : shift));
            }} />
          ) : (
            <Form label="Confirm delete" onSubmit={async () => {
              await write('/shifts/' + dialog.shift.id, 'DELETE', undefined, onExpired);
              shifts.setData((current) => current.filter(({ id }) => id !== dialog.shift.id));
              setDialog((current) => current === dialog ? null : current);
              setNotice('Shift deleted.');
            }}>
              <p>Delete the shift from {formatDate(dialog.shift.starts_at)} to {formatDate(dialog.shift.ends_at)}?</p>
            </Form>
          )}
        </Dialog>
      )}
    </>
  );
}
