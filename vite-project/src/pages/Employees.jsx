import { departmentName, departmentUnits } from '../lib/departments.js';
import { Form } from '../components/Form.jsx';
import { usePageLoad } from '../lib/usePageLoad.js';
import { LoadState } from '../components/ui.jsx';
import { useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Banner, Empty, Field, Modal, Pager, Pill } from '../components/ui.jsx';
import { todayISO, unitName } from '../lib/format.js';
import { CopySecret } from '../components/CopySecret.jsx';

const blank = {
  code: '',
  email: '',
  name: '',
  departmentId: '',
  designationId: '',
  joiningDate: '',
  status: 'probation',
  basicSalary: '',
  phone: '',
  address: '',
  gender: 'unspecified',
  emergencyContact: '',
};
const emptyFilters = { search: '', departmentId: '', designationId: '', status: '', sort: 'name' };

export default function Employees() {
  const { user } = useAuth();
  const hr = user.role === 'HR';
  const [org, setOrg] = useState({ units: [] });
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(emptyFilters);
  const appliedFilters = useRef(emptyFilters);
  const requestVersion = useRef(0);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ ...blank, joiningDate: todayISO() });
  const [error, setError] = useState(null);
  const [secret, setSecret] = useState(null);
  const [csv, setCsv] = useState('');
  const [dry, setDry] = useState(null);

  const query = (selected = appliedFilters.current) => ({
    page,
    limit: 20,
    sort: selected.sort,
    ...(selected.search.trim() && { search: selected.search.trim() }),
    ...(selected.departmentId && { departmentId: selected.departmentId }),
    ...(selected.designationId && { designationId: selected.designationId }),
    ...(selected.status && { status: selected.status }),
  });

  const load = async (p = page, selected = appliedFilters.current) => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
    const data = await api('/employees', { query: { ...query(selected), page: p } });
    if (version !== requestVersion.current) return;
    const lastPage = Math.max(1, Math.ceil((data.total || 0) / 20));
    if (p > lastPage) return await load(lastPage, selected);
    appliedFilters.current = { ...selected };
    setItems(data.items || []);
    setTotal(data.total || 0);
    setPage(data.page || p);
    } finally { if (version === requestVersion.current) setLoading(false); }
  };

  const initial = usePageLoad(async () => {
    await Promise.all([load(1), ...(user.role !== 'Employee' ? [api('/organization', { cacheMs: 30000 }).then(setOrg)] : [])]);
  });

  if (user.role === 'Employee') return <Navigate to="/profile" replace />;

  const departments = departmentUnits(org.units).filter(u => u.active);
  const designations = org.units.filter((u) => u.kind === 'designation' && u.active);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="brand-kicker">Directory</div>
          <h1>Employees</h1>
          <p className="muted">Find your people and manage employee profiles. New employees receive a temporary password for their first sign-in.</p>
        </div>
      </div>
      <LoadState state={initial} />
      <Banner error={error} />
      <Form
        className="card filter-bar"
        aria-label="Employee directory filters"
        style={{ marginBottom: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          await load(1, filters).catch(setError);
        }}
      >
        <Field label="Search employees" name="search"><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Starting letters of name, code or email" maxLength={100} /></Field>
        <Field label="Department filter" name="departmentId"><select value={filters.departmentId} onChange={(e) => setFilters({ ...filters, departmentId: e.target.value })}>
          <option value="">All departments</option>
          {departmentUnits(org.units).map((u) => (
            <option key={u._id} value={u._id}>
              {departmentName(u.name) || u.name}{u.active ? '' : ' (inactive)'}
            </option>
          ))}
        </select></Field>
        <Field label="Designation filter" name="designationId"><select value={filters.designationId} onChange={e => setFilters({ ...filters, designationId: e.target.value })}><option value="">All designations</option>{org.units.filter(u => u.kind === 'designation').map(u => <option key={u._id} value={u._id}>{u.name}{u.active ? '' : ' (inactive)'}</option>)}</select></Field>
        <Field label="Employment status" name="status"><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option>
          {['active', 'probation', 'inactive', 'exited'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select></Field>
        <Field label="Sort by" name="sort"><select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
          <option value="name">Name</option>
          <option value="code">Code</option>
          <option value="joiningDate">Joining date</option>
          <option value="-name">Name desc</option>
          <option value="-joiningDate">Joining desc</option>
        </select></Field>
        <button className="btn secondary" type="submit">
          Filter
        </button>
        <button className="btn ghost" type="button" onClick={async () => { setFilters(emptyFilters); await load(1, emptyFilters).catch(setError); }}>Clear filters</button>
        {hr && (
          <button
            className="btn secondary"
            type="button"
            onClick={async () => {
              try {
                const text = await api('/employees/export', {
                  query: { ...query(), page: undefined, limit: undefined },
                  responseType: 'text',
                });
                const blob = new Blob([text], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'employees.csv';
                a.click();
                URL.revokeObjectURL(url);
              } catch (err) {
                setError(err);
              }
            }}
          >
            Export CSV
          </button>
        )}
      </Form>
      <p className="muted small" role="status">{loading ? 'Loading employees…' : `${total} matching employee${total === 1 ? '' : 's'}`}</p>
      <div className="card table-wrap" aria-busy={loading}>
        {items.length ? (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Email</th>
                <th>Department</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e._id}>
                  <td>{e.code}</td>
                  <td>{e.name}</td>
                  <td>{e.email}</td>
                  <td>{unitName(org.units, e.departmentId)}</td>
                  <td>
                    <Pill>{e.status}</Pill>
                  </td>
                  <td>
                    <Link to={`/employees/${e._id}`}>Open 360</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>{initial.loading ? "Loading…" : initial.loadError ? "Records could not be loaded." : "No employees match these filters."}</Empty>
        )}
      </div>
      <Pager page={page} total={total} limit={20} onPage={(p) => load(p).catch(setError)} />

      {hr && (
        <div className="grid cols-2" style={{ marginTop: 16 }}>
          <Form
            className="card form"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
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
                if (form.phone) body.phone = form.phone;
                if (form.address) body.address = form.address;
                if (form.emergencyContact) body.emergencyContact = form.emergencyContact;
                const data = await api('/employees', { method: 'POST', body });
                setSecret({ email: data.user.email, temporaryPassword: data.temporaryPassword });
                setForm({ ...blank, joiningDate: todayISO(), departmentId: form.departmentId, designationId: form.designationId });
                await load();
              } catch (err) {
                setError(err);
              }
            }}
          >
            <h3 className="serif">Register employee</h3>
            {(!departments.length || !designations.length) && <Banner>Ask your Admin to create an active department and designation in Organization before registering employees.</Banner>}
            <Field label="Code">
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </Field>
            <Field label="Name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Department" name="departmentId">
              <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} required>
                <option value="">Select</option>
                {departments.map((u) => (
                  <option key={u._id} value={u._id}>
                    {departmentName(u.name)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Designation" name="designationId">
              <select value={form.designationId} onChange={(e) => setForm({ ...form, designationId: e.target.value })} required>
                <option value="">Select</option>
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
            <Field label="Status">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option>probation</option>
                <option>active</option>
                <option>inactive</option>
              </select>
            </Field>
            <Field label="Basic salary (PKR)">
              <input type="number" step="0.01" min="0.01" value={form.basicSalary} onChange={(e) => setForm({ ...form, basicSalary: e.target.value })} required />
            </Field>
            <Field label="Gender">
              <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option>unspecified</option>
                <option>female</option>
                <option>male</option>
                <option>other</option>
              </select>
            </Field>
            <Field label="Phone (optional)">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Address (optional)">
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <button className="btn" type="submit">
              Register
            </button>
          </Form>
          <Form
            className="card form"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setDry(null);
              try {
                const data = await api('/employees/import', { method: 'POST', body: { csv, dryRun: true } });
                setDry(data);
              } catch (err) {
                setError(err);
                setDry(err.errors ? { errors: err.errors, valid: false } : null);
              }
            }}
          >
            <h3 className="serif">CSV import</h3>
            <p className="muted small">Required CSV headers: code,email,name,departmentId,designationId,joiningDate,basicSalary. Use active unit IDs, ISO dates and salary in PKR. Check the file before importing.</p>
            <Field label="CSV contents" name="csv"><textarea value={csv} onChange={(e) => { setCsv(e.target.value); setDry(null); }} placeholder="Paste CSV" required maxLength={900000} /></Field>
            <div className="row">
              <button className="btn secondary" type="submit">
                Dry run
              </button>
              <button
                className="btn"
                type="button"
                disabled={!dry?.valid}
                onClick={async () => {
                  setError(null);
                  try {
                    const data = await api('/employees/import', { method: 'POST', body: { csv, dryRun: false } });
                    setSecret({ email: `${data.imported} imported`, temporaryPassword: (data.items || []).map((i) => `${i.user.email}: ${i.temporaryPassword}`).join('\n') });
                    setDry(null);
                    setCsv('');
                    await load();
                  } catch (err) {
                    setError(err);
                  }
                }}
              >
                Import
              </button>
            </div>
            {dry && (
              <div>
                <p>
                  {dry.valid ? 'All rows valid' : 'Fix errors before import'} · {dry.rowCount || dry.errors?.length || 0} rows
                </p>
                {(dry.errors || []).map((err, i) => (
                  <div key={i} className="muted small">
                    Row {err.row} · {err.field} · {err.reason}
                  </div>
                ))}
              </div>
            )}
          </Form>
        </div>
      )}
      {secret && (
        <Modal title="Temporary credentials" onClose={() => setSecret(null)}>
          <p>
            {secret.email}
            <br />
            <code style={{ whiteSpace: 'pre-wrap' }}>{secret.temporaryPassword}</code>
          </p>
          <CopySecret value={secret.temporaryPassword} />
        </Modal>
      )}
    </div>
  );
}
