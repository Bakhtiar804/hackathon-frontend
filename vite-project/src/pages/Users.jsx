import { departmentName, departmentUnits } from '../lib/departments.js';
import { Form } from '../components/Form.jsx';
import { usePageLoad } from '../lib/usePageLoad.js';
import { LoadState } from '../components/ui.jsx';
import { useState } from 'react';
import { api } from '../api/client.js';
import { Banner, Empty, Field, Modal, Pager, Pill } from '../components/ui.jsx';
import { todayISO } from '../lib/format.js';
import { CopySecret } from '../components/CopySecret.jsx';

export default function Users() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [secret, setSecret] = useState(null);
  const [org, setOrg] = useState(null);
  const [link, setLink] = useState(null);

  const load = async (p = page) => {
    const data = await api('/users', { query: { page: p, limit: 20 } });
    setItems(data.items || []);
    setTotal(data.total || 0);
    setPage(data.page || p);
  };

  const initial = usePageLoad(async () => {
    const [, organization] = await Promise.all([load(1), api("/organization", { cacheMs: 30000 })]);
    setOrg(organization);

  });

  const act = async (id, action) => {
    setError(null);
    try {
      const data = await api(`/users/${id}/${action}`, { method: 'POST', body: {} });
      if (data.temporaryPassword) setSecret({ email: data.user.email, temporaryPassword: data.temporaryPassword, note: 'Show this once. It is not stored in the browser.' });
      await load();
    } catch (err) {
      setError(err);
    }
  };

  const departments = departmentUnits(org?.units).filter(u => u.active);
  const designations = (org?.units || []).filter((u) => u.kind === 'designation' && u.active);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="brand-kicker">Logins</div>
          <h1>HR and employee accounts</h1>
          <p className="muted">Admin creates HR logins. Employees are created when HR registers them. Deactivate immediately revokes sessions.</p>
        </div>
        <Form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              const data = await api('/users/hr', { method: 'POST', body: { email: email.trim() } });
              setSecret({ email: data.user.email, temporaryPassword: data.temporaryPassword, note: 'Give this temporary password to HR. They must change it on first sign-in.' });
              setEmail('');
              await load();
            } catch (err) {
              setError(err);
            }
          }}
        >
          <Field label="HR email" name="email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="HR email" required  /></Field>
          <button className="btn" type="submit">
            Create HR login
          </button>
        </Form>
      </div>
      <LoadState state={initial} />
      <Banner error={error} />
      <div className="card table-wrap">
        {items.length ? (
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Must change</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id || u._id}>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>
                    <Pill kind={u.active ? 'approved' : 'rejected'}>{u.active ? 'active' : 'inactive'}</Pill>
                  </td>
                  <td>{u.mustChangePassword ? 'Yes' : 'No'}</td>
                  <td className="row">
                    {u.role !== 'Admin' && <>
                    <button className="btn secondary" type="button" onClick={() => act(u.id || u._id, 'reset')}>
                      Reset
                    </button>
                    {u.active ? (
                      <button className="btn danger" type="button" onClick={() => act(u.id || u._id, 'deactivate')}>
                        Deactivate
                      </button>
                    ) : (
                      <button className="btn secondary" type="button" onClick={() => act(u.id || u._id, 'activate')}>
                        Activate
                      </button>
                    )}
                    {u.role === 'HR' && !u.employeeId && (
                      <button className="btn" type="button" onClick={() => setLink({ ...u, id: u.id || u._id })}>
                        Link profile
                      </button>
                    )}
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>{initial.loading ? "Loading…" : initial.loadError ? "Records could not be loaded." : "No users yet."}</Empty>
        )}
      </div>
      <Pager page={page} total={total} limit={20} onPage={(p) => load(p).catch(setError)} />
      {secret && (
        <Modal title="Temporary password" onClose={() => setSecret(null)}>
          <p>
            {secret.email}: <code>{secret.temporaryPassword}</code>
          </p>
          <p className="muted">{secret.note}</p>
          <CopySecret value={secret.temporaryPassword} />
        </Modal>
      )}
      {link && (
        <Modal title={`Link HR profile for ${link.email}`} onClose={() => setLink(null)}>
          <LinkForm
            user={link}
            departments={departments}
            designations={designations}
            onDone={async () => {
              setLink(null);
              await load();
            }}
            onError={setError}
          />
        </Modal>
      )}
    </div>
  );
}

function LinkForm({ user, departments, designations, onDone, onError }) {
  const [form, setForm] = useState({
    code: '',
    email: user.email,
    name: '',
    departmentId: departments[0]?._id || '',
    designationId: designations[0]?._id || '',
    joiningDate: todayISO(),
    status: 'active',
    basicSalary: '',
    gender: 'unspecified',
  });
  return (
    <Form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const body = {
            code: form.code.trim(),
            email: form.email.trim(),
            name: form.name.trim(),
            departmentId: form.departmentId,
            designationId: form.designationId,
            joiningDate: form.joiningDate,
            status: form.status,
            basicSalary: Number(form.basicSalary),
            gender: form.gender,
          };
          await api(`/users/${user.id}/employee-profile`, { method: 'POST', body });
          await onDone();
        } catch (err) {
          onError(err);
        }
      }}
    >
      {(!departments.length || !designations.length) && <Banner>Create an active department and designation in Organization before linking this profile.</Banner>}
      <Field label="HR email" name="email"><input type="email" value={user.email} readOnly /></Field>
      <Field label="Employee code" name="code">
        <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
      </Field>
      <Field label="Name">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </Field>
      <Field label="Department" name="departmentId">
        <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} required>
          {departments.map((u) => (
            <option key={u._id} value={u._id}>
              {departmentName(u.name) || u.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Designation" name="designationId">
        <select value={form.designationId} onChange={(e) => setForm({ ...form, designationId: e.target.value })} required>
          {designations.map((u) => (
            <option key={u._id} value={u._id}>
              {u.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Joining date" name="joiningDate">
        <input type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} required />
      </Field>
      <Field label="Basic salary (PKR)">
        <input type="number" min="0.01" step="0.01" value={form.basicSalary} onChange={(e) => setForm({ ...form, basicSalary: e.target.value })} required />
      </Field>
      <button className="btn" type="submit">
        Create linked profile
      </button>
    </Form>
  );
}
