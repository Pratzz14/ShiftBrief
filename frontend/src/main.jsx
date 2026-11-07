import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, Form } from './ui';
import { MachinePanel } from './machines';
import { ShiftPanel } from './shifts';
import { DepartmentDashboard, PlantDashboard } from './dashboard';
import './styles.css';

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
              <li key={member.id}>{member.email} <small>{member.department_name}</small></li>
            ))}
          </ul>
        ) : <p>No {accountType}s have been added yet.</p>}
      </section>
    </>
  );
}

function Workspace({ account, onExpired }) {
  const [page, setPage] = useState(account.role === 'worker' ? 'machines' : 'dashboard');
  const isManager = account.role === 'manager';
  const isOwner = account.role === 'owner';
  const pages = isOwner
    ? [['dashboard', 'Plant overview'], ['staff', 'Departments and managers']]
    : [['machines', 'Machines'], ['shifts', isManager ? 'Shift assignments' : 'My Shifts']];
  if (isManager) {
    pages.unshift(['dashboard', 'Dashboard']);
    pages.push(['staff', 'Workers']);
  }

  return (
    <>
      <nav className="workspace-nav" aria-label="Operations workspace">
        {pages.map(([id, label]) => (
          <button type="button" className="secondary" key={id}
            aria-current={page === id ? 'page' : undefined} onClick={() => setPage(id)}>{label}</button>
        ))}
      </nav>
      {page === 'dashboard' && (isOwner
        ? <PlantDashboard onExpired={onExpired} />
        : <DepartmentDashboard departmentId={account.department_id} canResolve onExpired={onExpired} />)}
      {page === 'machines' && <MachinePanel isManager={isManager} onExpired={onExpired} />}
      {page === 'shifts' && <ShiftPanel isManager={isManager} onExpired={onExpired} />}
      {page === 'staff' && <AccessPanel account={account} onExpired={onExpired} />}
    </>
  );
}

function App() {
  const [account, setAccount] = useState(null);
  const [ownerExists, setOwnerExists] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

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
    try {
      await api('/auth/logout', { method: 'POST' });
      setAccount(null);
    } catch (error) {
      setError(error.message);
    }
  }

  if (loading) return <main><p role="status">Loading ShiftBrief...</p></main>;
  if (account) return (
    <main>
      <header>
        <div>
          <p className="brand">ShiftBrief</p>
          <h1>{roles[account.role]}</h1>
          <p>{account.email}{account.department_name && ' / ' + account.department_name}</p>
        </div>
        <button className="secondary" onClick={signOut}>Sign out</button>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      <Workspace key={account.id} account={account} onExpired={expireSession} />
    </main>
  );

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
        </Form>
      </section>
    </main>
  );
}

document.title = 'ShiftBrief | Operations';
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
