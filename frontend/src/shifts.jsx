import { useEffect, useId, useRef, useState } from 'react';
import { Form, LoadState, formatDate, useResource, write } from './ui';

const localZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayMs = 24 * 60 * 60 * 1000;

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
    <section className={shift ? undefined : 'card'}>
      {!shift && <h2>Assign a shift</h2>}
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
                {worker.email}
              </label>
            ))}
          </fieldset>
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

function ShiftDialog({ title, children, onDismiss }) {
  const dialog = useRef(null);
  const headingId = useId();

  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal();
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby={headingId} className="shift-dialog"
      onCancel={(event) => { event.preventDefault(); onDismiss(); }}>
      <h2 id={headingId}>{title}</h2>
      {children}
      <button type="button" className="secondary" onClick={onDismiss}>Cancel</button>
    </dialog>
  );
}

function ShiftList({ shifts, isManager, onAction }) {
  return (
    <section className="card">
      <h2>{isManager ? 'Scheduled shifts' : 'My Shifts'}</h2>
      {shifts.length ? (
        <ul className="record-list">
          {shifts.map((shift) => (
            <li key={shift.id}>
              <strong>
                <time dateTime={shift.starts_at}>{formatDate(shift.starts_at)}</time>
                {' to '}
                <time dateTime={shift.ends_at}>{formatDate(shift.ends_at)}</time>
              </strong>
              {isManager && <small>{shift.workers.map((worker) => worker.email).join(', ')}</small>}
              {shift.questions.length ? (
                <ol>
                  {shift.questions.map((question) => (
                    <li key={question.id} className="note">
                      {question.prompt} <small>{question.required ? 'Required' : 'Optional'}</small>
                    </li>
                  ))}
                </ol>
              ) : <p>No reporting questions for this shift.</p>}
              {isManager && (
                <div className="shift-actions">
                  <button type="button" className="secondary" onClick={() => onAction({ shift, action: 'edit' })}>Edit shift</button>
                  <button type="button" className="secondary" onClick={() => onAction({ shift, action: 'delete' })}>Delete shift</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : <p>No shifts assigned yet.</p>}
    </section>
  );
}

export function ShiftPanel({ isManager, onExpired }) {
  const shifts = useResource('/shifts', onExpired);
  const workers = useResource(isManager ? '/staff' : null, onExpired);
  const questions = useResource(isManager ? '/reporting-questions' : null, onExpired);
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);

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
    setNotice(weekly ? 'Weekly schedule created (' + created.length + ' shifts).' : 'Shift assigned.');
  }

  return (
    <>
      {notice && <p role="status">{notice}</p>}
      {isManager && (
        <div className="panels section-gap">
          {workers.data && questions.data && shifts.data ? (
            <AssignmentForm workers={workers.data} questions={questions.data} onAssign={assign} />
          ) : !workers.data ? <LoadState resource={workers} label="workers" /> : null}
          {questions.data
            ? <QuestionLibrary questions={questions.data} onSave={saveQuestion} />
            : <LoadState resource={questions} label="reporting questions" />}
        </div>
      )}
      {shifts.data ? <ShiftList shifts={shifts.data} isManager={isManager} onAction={setDialog} /> : <LoadState resource={shifts} label="shifts" />}
      {dialog && (
        <ShiftDialog title={dialog.action === 'edit' ? 'Edit shift' : 'Delete shift'}
          onDismiss={() => setDialog(null)}>
          {dialog.action === 'edit' ? (
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
        </ShiftDialog>
      )}
    </>
  );
}
