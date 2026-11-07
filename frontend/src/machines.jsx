import { useState } from 'react';
import { Form, LoadState, formatDate, useResource, write } from './ui';

function MachineDetails({ id, isManager, onChange, onExpired }) {
  const history = useResource('/machines/' + id, onExpired);
  const [status, setStatus] = useState('Working');
  const [notice, setNotice] = useState('');
  const machine = history.data;
  if (!machine) return <LoadState resource={history} label="machine history" />;

  return (
    <section className="card">
      <h2>{machine.name}</h2>
      <p>{machine.archived ? 'Archived / ' : ''}{machine.status}</p>
      {!machine.archived && isManager && (
        <Form label="Save machine name" onSubmit={async ({ name }) => {
          await write('/machines/' + id, 'PATCH', { name }, onExpired);
          history.setData((current) => ({ ...current, name: name.trim() }));
          onChange((current) => ({ ...current, name: name.trim() }));
          setNotice('Machine name saved.');
        }}>
          <label>Machine name<input name="name" defaultValue={machine.name} maxLength={100} required /></label>
        </Form>
      )}
      {!machine.archived && (
        <Form label="Record status" clear onSubmit={async (data) => {
          const entry = await write('/machines/' + id + '/updates', 'POST', data, onExpired);
          history.setData((current) => ({
            ...current, status: entry.status, latest: entry, updates: [entry, ...current.updates],
          }));
          onChange((current) => ({
            ...current, status: entry.status, latest: entry,
            recent_updates: [entry, ...current.recent_updates].slice(0, 3),
          }));
          setStatus('Working');
          setNotice('Machine status recorded.');
        }}>
          <div className="field">
            <label htmlFor="machine-status">Machine status</label>
            <select id="machine-status" name="status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option>Working</option><option>Not Working</option><option>Has Issues</option>
            </select>
          </div>
          <label>Condition note {status === 'Working' ? '(optional)' : '(required)'}
            <textarea name="note" maxLength={2000} required={status !== 'Working'} />
          </label>
        </Form>
      )}
      {notice && <p role="status">{notice}</p>}
      <h3>Status history</h3>
      {machine.updates.length ? (
        <ol className="record-list">
          {machine.updates.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.status}</strong>
              <small>{entry.worker_email} / <time dateTime={entry.recorded_at}>{formatDate(entry.recorded_at)}</time></small>
              {entry.note && <p className="note">{entry.note}</p>}
            </li>
          ))}
        </ol>
      ) : <p>No status updates yet.</p>}
    </section>
  );
}

export function MachinePanel({ isManager, initialMachine = null, onExpired }) {
  const machines = useResource('/machines', onExpired);
  const [selected, setSelected] = useState(initialMachine);
  const [notice, setNotice] = useState('');
  if (!machines.data) return <LoadState resource={machines} label="machines" />;

  return (
    <div className="panels">
      <section className="card">
        <h2>Department machines</h2>
        {!isManager && <p>Select a machine to report an issue or update its condition.</p>}
        {isManager && (
          <Form label="Register machine" clear onSubmit={async (data) => {
            const machine = await write('/machines', 'POST', data, onExpired);
            machines.setData((current) => [...current, machine]);
            setSelected(machine.id);
            setNotice('Machine registered.');
          }}>
            <label>New machine name<input name="name" maxLength={100} required /></label>
          </Form>
        )}
        {notice && <p role="status">{notice}</p>}
        {machines.data.length ? (
          <ul className="record-list">
            {machines.data.map((machine) => (
              <li key={machine.id}>
                <button type="button" className="secondary record-button" aria-pressed={selected === machine.id}
                  onClick={() => { setSelected(machine.id); setNotice(''); }}>
                  {machine.name}
                  <small>{machine.archived ? 'Archived / ' : ''}{machine.status}</small>
                </button>
                {machine.recent_updates.length > 0 && (
                  <div className="machine-recent">
                    <strong>Recent status changes</strong>
                    <ul>
                      {machine.recent_updates.map((entry) => (
                        <li key={entry.id}>
                          <span>{entry.status}</span>
                          <time dateTime={entry.recorded_at}>{formatDate(entry.recorded_at)}</time>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : <p>No machines to show.</p>}
      </section>
      {selected !== null && (
        <MachineDetails key={selected} id={selected} isManager={isManager} onExpired={onExpired}
          onChange={(update) => machines.setData((current) => current.map(
            (machine) => machine.id === selected ? update(machine) : machine,
          ))} />
      )}
    </div>
  );
}
