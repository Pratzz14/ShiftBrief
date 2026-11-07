import { useState } from 'react';
import { Form, LoadState, formatDate, useResource, write } from './ui';

export function ReportDetails({ report }) {
  return (
    <div className="report-details">
      {report.worker_email && <p>{report.worker_email}</p>}
      <p>{formatDate(report.starts_at)} to {formatDate(report.ends_at)}</p>
      <p><strong>{report.status === 'Late' ? 'Submitted late' : 'Submitted'}</strong> · {formatDate(report.submitted_at)}</p>
      {report.questions.length > 0 && (
        <dl>
          {report.questions.map(({ id, prompt }) => (
            <div key={id}>
              <dt>{prompt}</dt>
              <dd className="note">{report.answers[id] || 'No answer'}</dd>
            </div>
          ))}
        </dl>
      )}
      <h3>Activity summary</h3>
      <p className="note">{report.summary || 'No summary provided.'}</p>
      {report.issue && (
        <>
          <h3>Flagged issue</h3>
          {report.machine_name && <p>Machine · {report.machine_name}</p>}
          <p className="note">{report.issue}</p>
          {report.resolution ? (
            <>
              <p><strong>Resolved</strong> · {report.resolution.manager_email} · {formatDate(report.resolution.resolved_at)}</p>
              <p className="note">{report.resolution.note}</p>
            </>
          ) : <p>Open</p>}
        </>
      )}
    </div>
  );
}

function ReportEditor({ report, machines, onSave, onReload }) {
  const [flagged, setFlagged] = useState(Boolean(report.issue));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');

  async function save(event) {
    event.preventDefault();
    const submit = event.nativeEvent.submitter?.value === 'submit';
    const fields = new FormData(event.currentTarget);
    const answers = Object.fromEntries(report.questions.map(({ id }) => [id, fields.get('question-' + id)]));
    setError(null);
    setNotice('');
    if (flagged && !fields.get('issue').trim()) {
      setError(new Error('Describe the issue you are flagging.'));
      return;
    }
    if (submit && report.questions.some(({ id, required }) => required && !answers[id].trim())) {
      setError(new Error('Answer all required questions before submitting.'));
      return;
    }
    setPending(true);
    try {
      await onSave({
        revision: report.revision,
        answers,
        summary: fields.get('summary'),
        issue: flagged ? fields.get('issue') : '',
        machine_id: flagged && fields.get('machine') ? Number(fields.get('machine')) : null,
      }, submit);
      if (!submit) setNotice('Draft saved.');
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save}>
      <fieldset disabled={pending}>
        <p>{formatDate(report.starts_at)} to {formatDate(report.ends_at)}</p>
        <p>Submission opens at shift start. Reports submitted after shift end are marked late.</p>
        {report.questions.map(({ id, prompt, required }) => (
          <label key={id}>{prompt} {required ? '(required to submit)' : '(optional)'}
            <textarea name={'question-' + id} maxLength={4000} defaultValue={report.answers[id]} />
          </label>
        ))}
        <label>Activity summary (optional)<textarea name="summary" maxLength={4000} defaultValue={report.summary} /></label>
        <label className="check-option">
          <input type="checkbox" checked={flagged} onChange={(event) => setFlagged(event.target.checked)} />
          Flag an issue
        </label>
        <div hidden={!flagged}>
          <label>Issue description<textarea name="issue" maxLength={2000} defaultValue={report.issue} /></label>
          <label>Linked machine (optional)
            <select name="machine" defaultValue={report.machine_id ?? ''}>
              <option value="">No machine</option>
              {machines.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        </div>
        {notice && <p role="status">{notice}</p>}
        {error && <p className="error" role="alert">{error.message}</p>}
        <div className="shift-actions">
          <button type="submit" value="draft" className="secondary">Save draft</button>
          <button type="submit" value="submit">Submit report</button>
          {error?.status === 409 && <button type="button" className="secondary" onClick={onReload}>Reload report</button>}
        </div>
      </fieldset>
    </form>
  );
}

export function WorkerReport({ shiftId, onExpired, onSave }) {
  const path = '/shifts/' + shiftId + '/report';
  const report = useResource(path, onExpired);
  const machines = useResource('/machines', onExpired);
  if (!report.data) return <LoadState resource={report} label="report" />;
  if (report.data.submitted_at) return <ReportDetails report={report.data} />;
  if (!machines.data) return <LoadState resource={machines} label="machines" />;
  return (
    <ReportEditor report={report.data} machines={machines.data} onReload={report.retry} onSave={async (data, submit) => {
      const saved = await write(submit ? path + '/submit' : path, submit ? 'POST' : 'PUT', data, onExpired);
      report.setData(() => saved);
      onSave(saved);
    }} />
  );
}

export function ReviewReport({ departmentId, entry, canResolve, onExpired, onResolve }) {
  const { shift_id, worker_id } = entry;
  const report = useResource('/departments/' + departmentId + '/reports/' + shift_id + '/' + worker_id, onExpired);
  if (!report.data) return <LoadState resource={report} label="submitted report" />;
  return (
    <>
      <ReportDetails report={report.data} />
      {canResolve && report.data.issue && !report.data.resolution && (
        <Form label="Resolve report issue" onSubmit={async ({ note }) => {
          await write('/reports/' + shift_id + '/' + worker_id + '/resolve', 'POST', { note }, onExpired);
          onResolve();
          report.retry();
        }}>
          <label>Resolution note<textarea name="note" required maxLength={2000} /></label>
        </Form>
      )}
    </>
  );
}
