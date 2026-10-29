import { Form } from '../components/Form.jsx';
import { usePageLoad } from '../lib/usePageLoad.js';
import { LoadState } from '../components/ui.jsx';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Banner, Empty, Field, Pill } from '../components/ui.jsx';
import { currentPolicy, employmentStatus, formatStamp, futureEffectiveDate, money, todayISO, tomorrowISO, unitName } from '../lib/format.js';
import { departmentName, departmentUnits } from '../lib/departments.js';

export default function Employee360() {
  const { id } = useParams();
  const { user } = useAuth();
  const [pack, setPack] = useState(null);
  const [org, setOrg] = useState({ company: user.workspace, units: user.workspace?.units || [] });
  const [metadataError, setMetadataError] = useState(null);
  const requestVersion = useRef({ value: 0 });
  const [error, setError] = useState(null);
  const [ok, setOk] = useState('');
  const [edit, setEdit] = useState({});
  const [salary, setSalary] = useState({ basicSalary: '', effectiveDate: tomorrowISO() });
  const hr = user.role === 'HR';
  const allowed = user.role !== 'Employee' || id === 'me' || id === user.employeeId;
  useEffect(() => {
    const state = requestVersion.current;
    state.value++;
    return () => { state.value++; };
  }, [id]);

  const loadOrganization = async () => {
    setMetadataError(null);
    try { setOrg(await api('/organization', { cacheMs: 30000 })); }
    catch (err) { setMetadataError(err); }
  };

  const load = async () => {
    if (!allowed) return;
    const version = ++requestVersion.current.value;
    const data = await api(`/employees/${id}`);
    if (version !== requestVersion.current.value) return;
    if (!data?.employee?._id) throw new Error('The service returned an incomplete employee profile. Please retry.');
    setPack({ ...data, requestedId: id });
    const e = data.employee;
    setEdit({
      name: e.name,
      departmentId: e.departmentId,
      designationId: e.designationId,
      phone: e.phone || '',
      address: e.address || '',
      emergencyContact: e.emergencyContact || '',
      gender: e.gender || 'unspecified',
      status: e.status,
      exitDate: e.exitDate || '',
      effectiveDate: futureEffectiveDate(e.employmentHistory?.at(-1)?.effectiveDate),
    });
    setSalary(previous => ({ ...previous, effectiveDate: futureEffectiveDate(e.salaryHistory?.at(-1)?.effectiveDate) }));

  };

  const initial = usePageLoad(async () => {
    
        if (allowed && user.role !== 'Employee') void loadOrganization();
        await load();
      
  }, id);

  if (!allowed) return <Navigate to="/profile" replace />;
  if (initial.loading || initial.loadError || !pack || pack.requestedId !== id) return <div className="stack"><Link to={user.role === 'Employee' ? '/' : '/employees'}>← Back to {user.role === 'Employee' ? 'dashboard' : 'employees'}</Link><LoadState state={initial} /></div>;
  const e = pack.employee;
  const profileTimezone = pack.timezone || user.workspace?.timezone || user.timezone || currentPolicy(org.company)?.timezone;
  const department = unitName(org.units, e.departmentId) !== '—' ? unitName(org.units, e.departmentId) : departmentName(pack.job?.departmentName) || pack.job?.departmentName || '—';
  const designation = unitName(org.units, e.designationId) !== '—' ? unitName(org.units, e.designationId) : pack.job?.designationName || '—';

  return (
    <div>
      <div className="page-head profile-hero">
        <div className="profile-avatar" aria-hidden="true">{e.name?.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</div>
        <div>
          <div className="brand-kicker">Employee 360</div>
          <h1>{e.name}</h1>
          <p className="muted">
            {e.code} · {e.email} · {department} / {designation}
          </p>
        </div>
        <Pill>{employmentStatus(e, profileTimezone)}</Pill>
        <Link className="btn secondary" to={user.role === 'Employee' ? '/' : '/employees'}>← Back</Link>
      </div>
      <div className="profile-facts"><div><span>Employee code</span><strong>{e.code || '—'}</strong></div><div><span>Department</span><strong>{department}</strong></div><div><span>Designation</span><strong>{designation}</strong></div><div><span>Joined</span><strong>{e.joiningDate || '—'}</strong></div></div>
      {metadataError && <div className="banner"><span>Profile loaded. Department/designation options could not be refreshed.</span><button className="btn secondary" type="button" onClick={loadOrganization}>Retry job options</button></div>}
      <LoadState state={initial} />
      <Banner error={error} ok={ok} />
      <div className="grid cols-2">
        <Form
          className="card form"
          onSubmit={async (ev) => {
            ev.preventDefault();
            setError(null);
            setOk('');
            try {
              const values = hr
                ? {
                    name: edit.name.trim(),
                    departmentId: edit.departmentId,
                    designationId: edit.designationId,
                    phone: edit.phone,
                    address: edit.address,
                    emergencyContact: edit.emergencyContact,
                    gender: edit.gender,
                    status: edit.status,
                    effectiveDate: edit.effectiveDate,
                    ...(edit.exitDate ? { exitDate: edit.exitDate } : {}),
                  }
                : { phone: edit.phone, address: edit.address };
              const body = Object.fromEntries(Object.entries(values).filter(([key, value]) => key !== 'effectiveDate' && value !== (e[key] ?? '')));
              if ('status' in body || 'exitDate' in body) {
                if (edit.effectiveDate <= todayISO()) throw new Error('Choose a future effective date for the employment change.');
                body.effectiveDate = edit.effectiveDate;
              }
              if (edit.status === 'exited' && !edit.exitDate) throw new Error('Enter an exit date for an exited employee.');
              if (!Object.keys(body).length) { setOk('No changes to save.'); return; }
              await api(`/employees/${e._id}`, { method: 'PATCH', body });
              setOk('Saved');
              await load();
            } catch (err) {
              setError(err);
            }
          }}
        >
          <h3 className="serif">Details</h3>{String(user.employeeId) === String(e._id) && <Link to="/profile">Update your profile securely</Link>}
          {hr && (
            <>
              <Field label="Name">
                <input value={edit.name} onChange={(ev) => setEdit({ ...edit, name: ev.target.value })} />
              </Field>
              <Field label="Department" name="departmentId">
                <select value={edit.departmentId} onChange={(ev) => setEdit({ ...edit, departmentId: ev.target.value })}>
                  {!departmentUnits(org.units).some(unit => unit._id === edit.departmentId) && <option value={edit.departmentId}>{unitName(org.units, edit.departmentId)} (current)</option>}
                  {departmentUnits(org.units).filter(unit => unit.active || unit._id === edit.departmentId).map((u) => (
                    <option key={u._id} value={u._id}>
                      {departmentName(u.name)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Designation" name="designationId">
                <select value={edit.designationId} onChange={(ev) => setEdit({ ...edit, designationId: ev.target.value })}>
                  {org.units.filter((u) => u.kind === 'designation').map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select value={edit.status} onChange={(ev) => setEdit({ ...edit, status: ev.target.value })}>
                  <option>active</option>
                  <option>probation</option>
                  <option>inactive</option>
                  <option>exited</option>
                </select>
              </Field>
              <p className="muted small">This form includes the latest scheduled status. Status changes take effect on the future date below.</p>
              <Field label="Exit date (required if exited)" name="exitDate">
                <input type="date" required={edit.status === 'exited'} min={e.joiningDate} value={edit.exitDate} onChange={(ev) => setEdit({ ...edit, exitDate: ev.target.value })} />
              </Field>
              <Field label="Effective date for status change" name="effectiveDate">
                <input type="date" disabled={edit.status === e.status && edit.exitDate === (e.exitDate || '')} min={futureEffectiveDate(e.employmentHistory?.at(-1)?.effectiveDate)} value={edit.effectiveDate} onChange={(ev) => setEdit({ ...edit, effectiveDate: ev.target.value })} />
              </Field>
              <Field label="Gender">
                <select value={edit.gender} onChange={(ev) => setEdit({ ...edit, gender: ev.target.value })}>
                  <option>unspecified</option>
                  <option>female</option>
                  <option>male</option>
                  <option>other</option>
                </select>
              </Field>
              <Field label="Emergency contact">
                <input value={edit.emergencyContact} onChange={(ev) => setEdit({ ...edit, emergencyContact: ev.target.value })} />
              </Field>
            </>
          )}
          <Field label="Phone">
            <input value={edit.phone} disabled={!hr || String(user.employeeId) === String(e._id)} onChange={(ev) => setEdit({ ...edit, phone: ev.target.value })} />
          </Field>
          <Field label="Address">
            <input value={edit.address} disabled={!hr && user.role !== 'Employee'} onChange={(ev) => setEdit({ ...edit, address: ev.target.value })} />
          </Field>
          {hr && String(user.employeeId) !== String(e._id) && (
            <button className="btn" type="submit">
              Save
            </button>
          )}
        </Form>
        <div className="stack">
          {(hr || user.role === 'Admin') && (
            <Form
              className="card form"
              onSubmit={async (ev) => {
                ev.preventDefault();
                if (!hr) return;
                setError(null);
                try {
                  await api(`/employees/${e._id}/salary`, {
                    method: 'PUT',
                    body: { effectiveDate: salary.effectiveDate, basicSalary: Number(salary.basicSalary) },
                  });
                  setOk('Salary version added');
                  await load();
                } catch (err) {
                  setError(err);
                }
              }}
            >
              <h3 className="serif">Salary structure</h3>
              <p className="muted small">Gross includes basic salary, housing allowance (40%) and medical allowance (10%). Scheduled changes apply from their effective date.</p>
              <Field label="Effective date" name="effectiveDate">
                <input type="date" disabled={!hr} min={futureEffectiveDate(e.salaryHistory?.at(-1)?.effectiveDate)} value={salary.effectiveDate} onChange={(ev) => setSalary({ ...salary, effectiveDate: ev.target.value })} required />
              </Field>
              {hr && (
                <>
                  <Field label="Basic salary (PKR)">
                    <input type="number" step="0.01" value={salary.basicSalary} onChange={(ev) => setSalary({ ...salary, basicSalary: ev.target.value })} required />
                  </Field>
                  <button className="btn" type="submit">
                    Add salary version
                  </button>
                </>
              )}
              <p>Current basic salary: <strong>{money((e.salaryHistory || []).filter(s => s.effectiveDate <= todayISO()).at(-1)?.basicMinor)}</strong></p>
              <ul>
                {(e.salaryHistory || []).map((s) => (
                  <li key={s.effectiveDate}>
                    {s.effectiveDate}: {money(s.basicMinor)} basic {s.effectiveDate > todayISO() ? '· Scheduled' : ''}
                  </li>
                ))}
              </ul>
            </Form>
          )}
          <div className="card">
            <h3 className="serif">Recent attendance</h3>
            {(pack.attendance || []).length ? (
              (pack.attendance || []).map((a) => (
                <div key={a._id} className="row">
                  <span>{a.date}</span>
                  <Pill kind={a.status}>{a.status}</Pill>
                  <span className="muted small">{formatStamp(a.checkIn)}</span>
                </div>
              ))
            ) : (
              <Empty>No attendance yet.</Empty>
            )}
          </div>
          <div className="card">
            <h3 className="serif">Leave</h3>
            {(pack.leaves || []).length ? (
              (pack.leaves || []).map((l) => (
                <div key={l._id} className="row">
                  <span>
                    {l.type} {l.start} → {l.end}
                  </span>
                  <Pill kind={l.state}>{l.state}</Pill>
                </div>
              ))
            ) : (
              <Empty>{initial.loading ? "Loading…" : initial.loadError ? "Records could not be loaded." : "No leave requests."}</Empty>
            )}
          </div>
          <div className="card">
            <h3 className="serif">Payslips</h3>
            <Link to="/payslips">View payslips and download PDFs</Link>
            {(pack.payslips || []).length ? (
              (pack.payslips || []).map((s) => (
                <div key={`${s.runId}-${s.month}`}>
                  {s.month} · {money(s.netMinor)} · {s.state || 'Published'}
                </div>
              ))
            ) : (
              <Empty>{initial.loading ? "Loading…" : initial.loadError ? "Records could not be loaded." : "No published payslips."}</Empty>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
