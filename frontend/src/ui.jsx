import { useEffect, useId, useRef, useState } from 'react';

export async function api(path, { method = 'GET', data, signal } = {}) {
  const response = await fetch('/api' + path, {
    method,
    signal,
    headers: {
      ...(method !== 'GET' && { 'X-ShiftBrief-Request': '1' }),
      ...(data && { 'Content-Type': 'application/json' }),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  if (response.status === 204) return null;
  const body = await response.json();
  if (!response.ok) {
    const message = Array.isArray(body.detail)
      ? body.detail.map(({ field, message }) => field + ' - ' + message).join(' ')
      : body.detail;
    throw Object.assign(new Error(message || 'The request failed.'), { status: response.status });
  }
  return body;
}

export function Form({ children, label, onSubmit, clear = false }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setError('');
    setPending(true);
    try {
      const formData = new FormData(form);
      await onSubmit(Object.fromEntries(formData), formData);
      if (clear) form.reset();
    } catch (error) {
      setError(error.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <fieldset disabled={pending}>
        {children}
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit">{pending ? 'Please wait...' : label}</button>
      </fieldset>
    </form>
  );
}

export function Dialog({ title, children, onDismiss, dismissLabel = 'Close' }) {
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
      <button type="button" className="secondary" onClick={onDismiss}>{dismissLabel}</button>
    </dialog>
  );
}

export function useResource(path, onExpired) {
  const [state, setState] = useState({ data: null, error: '' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api(path, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setState({ data, error: '' });
    }).catch((error) => {
      if (controller.signal.aborted) return;
      if (error.status === 401) onExpired();
      else setState({ data: null, error: error.message });
    });
    return () => controller.abort();
  }, [path, onExpired, attempt]);

  return {
    ...state,
    setData: (update) => setState((previous) => ({ ...previous, data: update(previous.data) })),
    retry: () => {
      setState({ data: null, error: '' });
      setAttempt((previous) => previous + 1);
    },
  };
}

export function LoadState({ resource, label }) {
  if (!resource.error) return <p role="status">Loading {label}...</p>;
  return (
    <div>
      <p className="error" role="alert">{resource.error}</p>
      <button type="button" className="secondary" onClick={resource.retry}>Try again</button>
    </div>
  );
}

export async function write(path, method, data, onExpired) {
  try {
    return await api(path, { method, data });
  } catch (error) {
    if (error.status === 401) onExpired();
    throw error;
  }
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export const formatDate = (value) => dateFormat.format(new Date(value));
