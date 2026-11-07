import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, Form } from './ui';
import { MachinePanel } from './machines';
import { ShiftPanel } from './shifts';
import { DepartmentDashboard, PlantDashboard } from './dashboard';
import { Icon, PageTitle } from './operations-ui';
import './styles.css';
import './operations.css';

const roles = { owner: 'Plant Owner', manager: 'Department Manager', worker: 'Worker' };

function Credentials({ creating }) {
  return (
    <>
      <label>Email address
        <input name="email" type="email" autoComplete={creating ? 'off' : 'username'} required />
      </label>
      <label>Password
        <input name="password" type="password" minLength={creating ? 12 : 1} maxLength={128}
          autoComplete={creating ? 'new-password' : 'current-password'} required />
      </label>
      {creating && <small>Use at least 12 characters.</small>}
    </>
  );
}

function AccessPanel({ account, onExpired }) {
  const [departments, setDepartments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const isOwner = account.role === 'owner';

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    Promise.all([
      api('/staff', options),
      isOwner ? api('/departments', options) : [],
    ]).then(([members, groups]) => {
      if (controller.signal.aborted) return;
      setStaff(members);
      setDepartments(groups);
      setLoading(false);
    }).catch((error) => {
      if (controller.signal.aborted) return;
      if (error.status === 401) onExpired();
      else {
        setError(error.message);
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, [isOwner, attempt, onExpired]);

  async function create(path, data) {
    setNotice('');
    try {
      return await api(path, { method: 'POST', data });
    } catch (error) {
      if (error.status === 401) onExpired();
      throw error;
    }
  }

  const accountType = isOwner ? 'manager' : 'worker';

  if (loading) return <p role="status">Loading access settings...</p>;
  if (error) return (
    <section className="card">
      <p className="error" role="alert">{error}</p>
      <button onClick={() => {
        setError('');
        setLoading(true);
        setAttempt(attempt + 1);
      }}>Try again</button>
    </section>
  );

  return (
    <>
      <div className="panels">
        {isOwner && (
          <section className="card">
            <h2>Departments</h2>
            <Form label="Create department" clear onSubmit={async (data) => {
              const department = await create('/departments', data);
              setDepartments((current) => [...current, department]);
              setNotice('Department created.');
            }}>
              <label>Department name
                <input name="name" maxLength={100} required />
              </label>
            </Form>
            {departments.length > 0 && (
              <ul>{departments.map((department) => <li key={department.id}>{department.name}</li>)}</ul>
            )}
          </section>
        )}
        <section className="card">
          <h2>Add a {accountType}</h2>
          {isOwner && departments.length === 0 ? (
            <p>Create a department before adding a manager.</p>
          ) : (
            <Form label={'Create ' + accountType + ' account'} clear onSubmit={async (data) => {
              if (isOwner) data.department_id = Number(data.department_id);
              const member = await create(isOwner ? '/managers' : '/workers', data);
              setStaff((current) => [...current, member]);
              setNotice('Account created for ' + member.email + '.');
            }}>
              <Credentials creating />
              <label>Full name (optional)
                <input name="display_name" autoComplete="off" maxLength={100} />
              </label>
              {isOwner && (
                <div className="field">
                  <label htmlFor="manager-department">Department</label>
                  <select id="manager-department" name="department_id" defaultValue="" required>
                    <option value="" disabled>Select a department</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>{department.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </Form>
          )}
        </section>
      </div>
      <p role="status">{notice}</p>
      <section className="card">
        <h2>{isOwner ? 'Department managers' : 'Department workers'}</h2>
        {staff.length ? (
          <ul className="staff-list">
            {staff.map((member) => (
              <li key={member.id}><strong>{member.display_name || member.email}</strong>
                <small>{[member.display_name && member.email, member.department_name].filter(Boolean).join(' · ')}</small></li>
            ))}
          </ul>
        ) : <p>No {accountType}s have been added yet.</p>}
      </section>
    </>
  );
}

function Workspace({ account, onExpired, onSignOut, error, signingOut }) {
  const isManager = account.role === 'manager';
  const isOwner = account.role === 'owner';
  const [view, setView] = useState({ page: account.role === 'worker' ? 'shifts' : 'dashboard' });
  const { page } = view;
  const pages = isOwner
    ? [['dashboard', 'Plant overview', 'overview'], ['staff', 'Departments and managers', 'staff']]
    : isManager
      ? [['dashboard', 'Department overview', 'overview'], ['shifts', 'Shift assignments', 'shifts'],
        ['machines', 'Machines', 'machines'], ['staff', 'Workers', 'staff']]
      : [['shifts', 'My shifts', 'shifts'], ['dashboard', 'Department handover', 'report'], ['machines', 'Machine issues', 'machines']];
  const name = account.display_name || account.email;
  const initials = name.split(/[\s._@-]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');

  return (
    <div className="operations">
      <aside className="ops-sidebar">
        <a className="ops-wordmark" href="/"><span><Icon name="mark" /></span>ShiftBrief</a>
        <nav className="ops-nav" aria-label="Operations workspace">
          {pages.map(([id, label, icon]) => (
            <button type="button" key={id} aria-current={page === id ? 'page' : undefined}
              onClick={() => setView({ page: id })}><Icon name={icon} /><span>{label}</span></button>
          ))}
        </nav>
        <div className="ops-profile"><span className="ops-avatar" aria-hidden="true">{initials}</span>
          <div><strong title={name}>{name}</strong><small>{roles[account.role]}</small></div></div>
      </aside>
      <div className="ops-body">
        <div className="ops-toolbar">
          <div><strong>{roles[account.role]}</strong>
            {account.department_name && <span>Department: {account.department_name}</span>}
            {isOwner && <span>All departments</span>}</div>
          <button className="text-action" type="button" onClick={onSignOut} disabled={signingOut}>
            <Icon name="exit" />{signingOut ? 'Signing out…' : 'Sign out'}</button>
        </div>
        <main className="ops-content">
          {error && <p className="error" role="alert">{error}</p>}
          {page === 'dashboard' && (isOwner
            ? <PlantDashboard onExpired={onExpired} onAccess={() => setView({ page: 'staff' })} />
            : <DepartmentDashboard departmentId={account.department_id} mode={account.role} onExpired={onExpired}
              onAssign={isManager ? () => setView({ page: 'shifts', assign: true }) : undefined}
              onMachines={(machine) => setView({ page: 'machines', machine })} />)}
          {page === 'machines' && <>
            <PageTitle title={isManager ? 'Machines' : 'Machine issues'} subtitle={account.department_name} />
            <MachinePanel isManager={isManager} initialMachine={view.machine} onExpired={onExpired} />
          </>}
          {page === 'shifts' && <ShiftPanel isManager={isManager} initialAssign={view.assign} onExpired={onExpired} />}
          {page === 'staff' && <>
            <PageTitle title={isOwner ? 'Departments and managers' : 'Workers'} subtitle={account.department_name} />
            <AccessPanel account={account} onExpired={onExpired} />
          </>}
        </main>
      </div>
    </div>
  );
}

function App() {
  const [account, setAccount] = useState(null);
  const [ownerExists, setOwnerExists] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);

  const expireSession = useCallback(() => {
    setAccount(null);
    setError('Your session expired. Sign in again.');
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    Promise.all([
      api('/auth/me', options).catch((error) => {
        if (error.status === 401) return null;
        throw error;
      }),
      api('/auth/setup', options),
    ]).then(([session, setup]) => {
      if (controller.signal.aborted) return;
      setAccount(session);
      setOwnerExists(setup.owner_exists);
      setLoading(false);
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setError(error.message);
      setLoading(false);
    });
    return () => controller.abort();
  }, [attempt]);

  async function signOut() {
    setError('');
    setSigningOut(true);
    try {
      await api('/auth/logout', { method: 'POST' });
      setAccount(null);
    } catch (error) {
      setError(error.message);
    } finally {
      setSigningOut(false);
    }
  }

  if (loading) return <main><p role="status">Loading ShiftBrief...</p></main>;
  if (account) return <Workspace key={account.id} account={account} onExpired={expireSession}
    onSignOut={signOut} error={error} signingOut={signingOut} />;

  return (
    <main className="auth">
      <section className="card">
        <p className="brand">ShiftBrief</p>
        <h1>{ownerExists ? 'Sign in' : 'Create the plant owner account'}</h1>
        {error && <p className="error" role="alert">{error}</p>}
        {error && !account && (
          <button className="secondary" onClick={() => {
            setError('');
            setLoading(true);
            setAttempt(attempt + 1);
          }}>Reload access settings</button>
        )}
        <Form label={ownerExists ? 'Sign in' : 'Create owner account'} onSubmit={async (data) => {
          const session = await api(ownerExists ? '/auth/login' : '/auth/signup', { method: 'POST', data });
          setError('');
          setOwnerExists(true);
          setAccount(session);
        }}>
          <Credentials creating={!ownerExists} />
          {!ownerExists && (
            <label>Company name (optional)
              <input name="display_name" autoComplete="organization" maxLength={100} />
            </label>
          )}
        </Form>
      </section>
    </main>
  );
}

document.title = 'ShiftBrief | Operations';
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
