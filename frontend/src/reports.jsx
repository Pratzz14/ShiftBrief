import { useId, useState } from 'react';
import { Icon } from './operations-ui';
import { ReportVoice } from './report-voice';
import { Form, LoadState, formatDate, useResource, write } from './ui';

const analysisPending = (report) => report.analysis_state === 'pending';
const UPDATE_LIMIT = 12000;

export function summaryText(summary, state) {
  if (state === 'pending') return 'Preparing AI summary…';
  if (state === 'disabled') return 'AI summaries are disabled on this server.';
  if (state === 'ready') return 'An AI summary has not been generated for this report.';
  if (state === 'unavailable') return 'AI analysis could not finish. The original report is still available.';
  return summary || 'No summary available.';
}

export function ReportFindings({ findings, showEvidence = false, label = 'AI findings' }) {
  if (!findings.length) return null;
  return <>
    {label && <strong>{label}</strong>}
    <ul>
      {findings.map(({ description, excerpt }) => <li key={description}>
        {description}
        {showEvidence && <p className="note"><q>{excerpt}</q></p>}
      </li>)}
    </ul>
  </>;
}

export function ReportDetails({ report, onAnalyze }) {
  const canAnalyze = onAnalyze && ['ready', 'unavailable'].includes(report.analysis_state);
  return (
    <div className="report-details">
      {report.worker_email && <p>{report.worker_email}</p>}
      <p>{formatDate(report.starts_at)} to {formatDate(report.ends_at)}</p>
      {report.description && <><h3>Shift description</h3><p className="note">{report.description}</p></>}
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
      {report.notes && <><h3>Worker notes</h3><p className="note">{report.notes}</p></>}
      {Object.keys(report.clarifications).length > 0 && <>
        <h3>Clarifications</h3>
        <dl>
          {report.questions.filter(({ id }) => report.clarifications[id]).map(({ id, prompt }) => (
            <div key={id}>
              <dt>{prompt}</dt>
              <dd className="note">{report.clarifications[id]}</dd>
            </div>
          ))}
        </dl>
      </>}
      {report.worker_update && <details>
        <summary>Original shift update</summary>
        <p className="note">{report.worker_update}</p>
      </details>}
      <h3>{report.analysis_state ? 'AI activity summary' : 'Activity summary'}</h3>
      <p className="note" role="status">{summaryText(report.summary, report.analysis_state)}</p>
      {canAnalyze && <Form label={report.analysis_state === 'ready' ? 'Generate AI summary' : 'Retry AI analysis'}
        onSubmit={onAnalyze} />}
      {(report.issue || report.ai_findings.length > 0) && (
        <>
          <h3>Report follow-up</h3>
          {report.issue && <>
            <strong>Worker flag{report.machine_name ? ' · ' + report.machine_name : ''}</strong>
            <p className="note">{report.issue}</p>
          </>}
          <ReportFindings findings={report.ai_findings} showEvidence />
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

function ReportEditor({ report, machines, onSave, onReload, generateDraft, transcribe }) {
  const updateId = useId();
  const [flagged, setFlagged] = useState(Boolean(report.issue));
  const [pending, setPending] = useState(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [error, setError] = useState(null);
  const [generationError, setGenerationError] = useState(null);
  const [notesError, setNotesError] = useState(null);
  const [notice, setNotice] = useState('');
  const [update, setUpdate] = useState(report.worker_update);
  const [answers, setAnswers] = useState(report.answers);
  const [notes, setNotes] = useState(report.notes);
  const [clarifications, setClarifications] = useState(report.clarifications);
  const [draft, setDraft] = useState(null);
  const requiredQuestions = report.questions.filter(({ required }) => required);
  const answeredRequired = requiredQuestions.filter(({ id }) => answers[id]?.trim()).length;
  const unconfirmedExcerpts = [...new Set(draft?.findings.map(({ excerpt }) => excerpt))].filter((excerpt) =>
    !notes.includes(excerpt) && !Object.values(answers).some((answer) => answer.includes(excerpt)));

  function addNotes(text) {
    const combined = [notes.trim(), text].filter(Boolean).join('\n\n');
    if (combined.length > 4000) {
      setNotesError('Shorten your shift notes before adding more text.');
      return;
    }
    setNotes(combined);
    setNotesError(null);
  }

  function changeUpdate(text) {
    setUpdate(text);
    setDraft(null);
    setNotice('');
    setGenerationError(null);
  }

  async function generate() {
    setError(null);
    setGenerationError(null);
    setNotice('');
    setDraft(null);
    setPending('generate');
    try {
      const result = await generateDraft(update);
      setAnswers((previous) => {
        const next = { ...previous };
        for (const [id, answer] of Object.entries(result.answers)) {
          if (!next[id]?.trim()) next[id] = answer;
        }
        return next;
      });
      setClarifications(result.clarifications);
      if (!notes.trim()) setNotes(result.notes);
      setDraft(result);
    } catch (error) {
      setGenerationError(error);
    } finally {
      setPending(null);
    }
  }

  async function save(event) {
    event.preventDefault();
    if (voiceBusy) return;
    const submit = event.nativeEvent.submitter?.value === 'submit';
    const fields = new FormData(event.currentTarget);
    setError(null);
    setNotice('');
    if (flagged && !fields.get('issue').trim()) {
      setError(new Error('Describe the issue you are flagging.'));
      return;
    }
    if (submit && report.questions.some(({ id, required }) => required && !answers[id]?.trim())) {
      setError(new Error('Answer all required questions before submitting.'));
      return;
    }
    setPending('save');
    try {
      await onSave({
        revision: report.revision,
        answers,
        notes,
        worker_update: update,
        clarifications,
        issue: flagged ? fields.get('issue') : '',
        machine_id: flagged && fields.get('machine') ? Number(fields.get('machine')) : null,
      }, submit);
      if (!submit) setNotice('Draft saved.');
    } catch (error) {
      setError(error);
    } finally {
      setPending(null);
    }
  }

  return (
    <form className="report-editor" onSubmit={save}>
      <fieldset disabled={Boolean(pending)}>
        <div className="report-context">
          <p><Icon name="clock" /> {formatDate(report.starts_at)} to {formatDate(report.ends_at)}</p>
          {report.description && <p className="note">{report.description}</p>}
        </div>
        <section className="report-section report-update">
          <div className="report-update-grid">
            <label htmlFor={updateId}>Shift update</label>
            {transcribe && <ReportVoice transcribe={transcribe} onBusyChange={setVoiceBusy} onTranscript={(text) => {
              const combined = [update.trim(), text].filter(Boolean).join('\n\n');
              if (combined.length > UPDATE_LIMIT) {
                throw new Error('The transcript would exceed the update limit. Shorten the text and retry.');
              }
              changeUpdate(combined);
            }} />}
            <textarea id={updateId} value={update} maxLength={UPDATE_LIMIT} disabled={voiceBusy} rows={4}
              placeholder="Describe what you completed, what you checked, and what needs attention."
              onChange={(event) => changeUpdate(event.target.value)} />
          </div>
          <div className="report-update-actions">
            {report.questions.length > 0 && <details>
              <summary>Assigned questions ({report.questions.length})</summary>
              <ul>{report.questions.map(({ id, prompt, required }) => (
                <li key={id}>{prompt}{required ? ' (required)' : ' (optional)'}</li>
              ))}</ul>
            </details>}
            {generateDraft && <button type="button" disabled={voiceBusy || !update.trim()} onClick={generate}>
              {pending === 'generate' ? 'Generating draft…' : 'Generate draft'}
            </button>}
          </div>
          {pending === 'generate' && <p role="status">Preparing suggested answers…</p>}
          {draft && <p role="status">Draft generated. Review the answers and complete any required fields.</p>}
          {generationError && <p className="error" role="alert">{generationError.message}</p>}
          {generationError?.status === 409 && <button type="button" className="secondary" onClick={onReload}>
            Reload report
          </button>}
        </section>
        {report.questions.length > 0 && <section className="report-section">
          <div className="report-section-heading">
            <h3>Review answers</h3>
            {requiredQuestions.length > 0 && <small>{answeredRequired}/{requiredQuestions.length} required answered</small>}
          </div>
          {report.questions.map(({ id, prompt, required }) => {
            const clarification = !answers[id]?.trim() && clarifications[id];
            const clarificationId = updateId + '-clarification-' + id;
            return <div key={id} className="report-question">
              <label htmlFor={updateId + '-' + id}>{prompt}{' '}
                <span className="report-question-tag">{required ? 'Required' : 'Optional'}</span>
              </label>
              <textarea id={updateId + '-' + id} maxLength={4000} value={answers[id] ?? ''}
                aria-describedby={clarification ? clarificationId : undefined}
                onChange={(event) => setAnswers({ ...answers, [id]: event.target.value })} />
              {clarification && <small className="report-clarification" id={clarificationId}>
                Clarification needed: {clarification}
              </small>}
            </div>;
          })}
        </section>}
        <section className="report-section">
          <h3>Notes and follow-up</h3>
          {draft?.findings.length > 0 && <div className="report-issue-preview">
            <h4><Icon name="flag" /> Issues to review</h4>
            <ReportFindings findings={draft.findings} showEvidence label={null} />
            {unconfirmedExcerpts.length > 0 && <button type="button" className="secondary"
              onClick={() => addNotes(unconfirmedExcerpts.join('\n'))}>Add issue details to notes</button>}
          </div>}
          <label>Shift notes (optional)<textarea name="notes" maxLength={4000} value={notes}
            onChange={(event) => { setNotes(event.target.value); setNotesError(null); }} /></label>
          {notesError && <p className="error" role="alert">{notesError}</p>}
          {draft?.notes && !notes.includes(draft.notes) && <details>
            <summary>Suggested shift notes</summary>
            <p className="note">{draft.notes}</p>
            <button type="button" className="secondary" onClick={() => addNotes(draft.notes)}>
              Add suggested notes
            </button>
          </details>}
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
        </section>
        <footer className="report-editor-footer">
          {notice && <p role="status">{notice}</p>}
          {error && <p className="error" role="alert">{error.message}</p>}
          <div className="report-footer-row">
            <small>Submit once the shift starts. Reports are late after it ends.</small>
            <div className="report-footer-actions">
              <button type="submit" value="draft" className="secondary" disabled={voiceBusy}>Save draft</button>
              <button type="submit" value="submit" disabled={voiceBusy}>Submit report</button>
              {error?.status === 409 && <button type="button" className="secondary" onClick={onReload}>Reload report</button>}
            </div>
          </div>
        </footer>
      </fieldset>
    </form>
  );
}

export function WorkerReport({ shiftId, onExpired, onSave }) {
  const path = '/shifts/' + shiftId + '/report';
  const report = useResource(path, onExpired, analysisPending);
  const machines = useResource('/machines', onExpired);
  if (!report.data) return <LoadState resource={report} label="report" />;
  if (report.data.submitted_at) return <ReportDetails report={report.data} onAnalyze={async () => {
    const saved = await write(path + '/analyze', 'POST', undefined, onExpired);
    report.setData(() => saved);
    onSave(saved);
  }} />;
  if (!machines.data) return <LoadState resource={machines} label="machines" />;
  return (
    <ReportEditor key={report.data.revision} report={report.data} machines={machines.data} onReload={report.retry}
      generateDraft={report.data.draft_generation_enabled ? async (worker_update) => {
        const response = await write(path + '/generate-draft', 'POST',
          { revision: report.data.revision, worker_update }, onExpired);
        if (!response.job_id) return response;
        const deadline = Date.now() + 300000;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const job = await write(path + '/draft-jobs/' + response.job_id, 'GET', undefined, onExpired);
          if (job.state === 'complete') return job.result;
          if (job.state === 'unavailable') break;
        }
        throw new Error('Could not generate a draft. Try again or enter answers manually.');
      } : null}
      transcribe={report.data.voice_enabled ? (audio) =>
        write(path + '/transcribe?revision=' + encodeURIComponent(report.data.revision), 'POST', audio, onExpired) : null}
      onSave={async (data, submit) => {
        const saved = await write(submit ? path + '/submit' : path, submit ? 'POST' : 'PUT', data, onExpired);
        report.setData((current) => ({ ...current, ...saved }));
        onSave(saved);
      }} />
  );
}

export function ReviewReport({ departmentId, entry, canResolve, onExpired, onResolve, onAnalysisQueued }) {
  const { shift_id, worker_id } = entry;
  const report = useResource('/departments/' + departmentId + '/reports/' + shift_id + '/' + worker_id,
    onExpired, analysisPending);
  if (!report.data) return <LoadState resource={report} label="submitted report" />;
  return (
    <>
      <ReportDetails report={report.data} onAnalyze={canResolve ? async () => {
        const saved = await write('/reports/' + shift_id + '/' + worker_id + '/analyze', 'POST', undefined, onExpired);
        report.setData(() => saved);
        onAnalysisQueued();
      } : undefined} />
      {canResolve && (report.data.issue || report.data.ai_findings.length > 0)
        && !report.data.resolution && !analysisPending(report.data) && (
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
