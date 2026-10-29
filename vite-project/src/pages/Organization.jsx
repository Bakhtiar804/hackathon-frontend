import { Form } from '../components/Form.jsx';
import { usePageLoad } from '../lib/usePageLoad.js';
import { LoadState } from '../components/ui.jsx';
import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Banner, Field, Pill } from '../components/ui.jsx';
import { WEEKDAYS, currentPolicy, futureEffectiveDate, todayISO, tomorrowISO } from '../lib/format.js';
import { DEPARTMENTS, departmentName } from '../lib/departments.js';

const emptyType = { name: 'annual', quota: 14, paid: true, active: true };

export default function Organization() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState('');
  const [name, setName] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(tomorrowISO());
  const [policy, setPolicy] = useState(null);
  const [unitKind, setUnitKind] = useState('department');
  const [unitName, setUnitName] = useState('');
  const [rename, setRename] = useState({});
  const admin = user.role === 'Admin';

  const load = async () => {
    const org = await api('/organization', { cacheMs: 30000 });
    setData(org);
    const current = currentPolicy(org.company);
    setName(org.company.name);
    setPolicy(JSON.parse(JSON.stringify(current)));
    const lastDate = new Date(`${org.company.policies.at(-1).effectiveDate}T12:00:00Z`);
    lastDate.setUTCDate(lastDate.getUTCDate() + 1);
    setEffectiveDate([tomorrowISO(current?.timezone), lastDate.toISOString().slice(0, 10)].sort().at(-1));
  };

  const initial = usePageLoad(async () => {
    await load();
  });

  const savePolicy = async (e) => {
    e.preventDefault();
    setError(null);
    setOk('');
    try {
      const body = {
        name: name.trim(),
        effectiveDate,
        policy: {
          timezone: policy.timezone,
          officeStart: policy.officeStart,
          officeEnd: policy.officeEnd,
          graceMinutes: Number(policy.graceMinutes),
          halfDayHours: Number(policy.halfDayHours),
          weekendDays: policy.weekendDays,
          officeLatitude: Number(policy.officeLatitude),
          officeLongitude: Number(policy.officeLongitude),
          geofenceRadius: Number(policy.geofenceRadius),
          leaveTypes: policy.leaveTypes.map((t) => ({
            name: t.name,
            quota: t.paid ? Number(t.quota) : null,
            paid: Boolean(t.paid),
            active: t.active !== false,
          })),
          holidays: (policy.holidays || []).map((h) => ({ date: h.date, name: h.name, active: h.active !== false })),
        },
      };
      await api('/organization', { method: 'PUT', body });
      setOk('New policy version saved. It applies to new records from its effective date.');
      await load();
    } catch (err) {
      setError(err);
    }
  };

  if (!data || initial.loading || initial.loadError) return <LoadState state={initial} />;
  if (!policy) return <Banner>No company policy is effective yet. Contact your administrator to review the scheduled policy dates.</Banner>;
  const effectivePolicy = currentPolicy(data.company);
  const scheduled = data.company.policies.filter(version => version.effectiveDate > todayISO(effectivePolicy?.timezone));

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="brand-kicker">Organization</div>
          <h1>{data.company.name}</h1>
          <p className="muted">
            Manage working hours, leave and team structure. Policy changes start on the date you choose.
          </p>
        </div>
      </div>
      <LoadState state={initial} />
      <Banner error={error} ok={ok} />
      <p className="muted small">Current policy: effective {effectivePolicy.effectiveDate} · {effectivePolicy.timezone} · {effectivePolicy.officeStart}–{effectivePolicy.officeEnd}.</p>
      {scheduled.length > 0 && <details className="card" open style={{ marginBottom: 16 }}>
        <summary>Scheduled policy versions ({scheduled.length})</summary>
        <p className="muted small">These versions are saved. They become active on their effective dates.</p>
        {scheduled.map(version => <div className="row" key={version.effectiveDate} style={{ justifyContent: 'space-between', marginTop: 8 }}><span>{version.effectiveDate} · {version.timezone} · {version.officeStart}–{version.officeEnd} · grace {version.graceMinutes} min</span>{admin && <button className="btn secondary" type="button" onClick={() => { setPolicy(JSON.parse(JSON.stringify(version))); setOk(`Using the saved ${version.effectiveDate} policy as the draft for a new version.`); }}>Use as draft</button>}</div>)}
      </details>}
      <Form className="card stack" onSubmit={savePolicy} style={{ marginBottom: 16 }}>
        <div className="grid form two">
          <Field label="Company name" name="name">
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={!admin} required />
          </Field>
          <Field label="Effective date of this version" name="effectiveDate">
            <input type="date" min={futureEffectiveDate(data.company.policies.at(-1)?.effectiveDate, currentPolicy(data.company)?.timezone)} value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} disabled={!admin} required />
          </Field>
          <Field label="Timezone" name="timezone" apiField="policy.timezone">
            <input value={policy.timezone} onChange={(e) => setPolicy({ ...policy, timezone: e.target.value })} disabled={!admin} />
          </Field>
          <Field label="Office start" name="officeStart" apiField="policy.officeStart">
            <input value={policy.officeStart} onChange={(e) => setPolicy({ ...policy, officeStart: e.target.value })} disabled={!admin} />
          </Field>
          <Field label="Office end" name="officeEnd" apiField="policy.officeEnd">
            <input value={policy.officeEnd} onChange={(e) => setPolicy({ ...policy, officeEnd: e.target.value })} disabled={!admin} />
          </Field>
          <Field label="Grace minutes" name="graceMinutes" apiField="policy.graceMinutes">
            <input type="number" value={policy.graceMinutes} onChange={(e) => setPolicy({ ...policy, graceMinutes: e.target.value })} disabled={!admin} />
          </Field>
          <Field label="Half-day hours" name="halfDayHours" apiField="policy.halfDayHours">
            <input type="number" value={policy.halfDayHours} onChange={(e) => setPolicy({ ...policy, halfDayHours: e.target.value })} disabled={!admin} />
          </Field>
          <Field label="Office latitude" name="officeLatitude" apiField="policy.officeLatitude">
            <input type="number" step="any" value={policy.officeLatitude} onChange={(e) => setPolicy({ ...policy, officeLatitude: e.target.value })} disabled={!admin} />
          </Field>
          <Field label="Office longitude" name="officeLongitude" apiField="policy.officeLongitude">
            <input type="number" step="any" value={policy.officeLongitude} onChange={(e) => setPolicy({ ...policy, officeLongitude: e.target.value })} disabled={!admin} />
          </Field>
          <Field label="Geofence radius (m)" name="geofenceRadius" apiField="policy.geofenceRadius">
            <input type="number" value={policy.geofenceRadius} onChange={(e) => setPolicy({ ...policy, geofenceRadius: e.target.value })} disabled={!admin} />
          </Field>
        </div>
        <div>
          <strong>Weekend</strong>
          <div className="row" style={{ marginTop: 8 }}>
            {WEEKDAYS.map((d) => (
              <label key={d.value} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  disabled={!admin}
                  checked={policy.weekendDays.includes(d.value)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...policy.weekendDays, d.value]
                      : policy.weekendDays.filter((x) => x !== d.value);
                    setPolicy({ ...policy, weekendDays: next.sort((a, b) => a - b) });
                  }}
                />
                {d.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Leave types</strong>
            {admin && (
              <button className="btn secondary" type="button" onClick={() => setPolicy({ ...policy, leaveTypes: [...policy.leaveTypes, { ...emptyType, name: '' }] })}>
                Add type
              </button>
            )}
          </div>
          {policy.leaveTypes.map((t, i) => (
            <div className="grid form two" key={i} style={{ marginTop: 8 }}>
              <Field label="Name (lowercase)" name={`policy.leaveTypes.${i}.name`}>
                <input required maxLength={31} pattern="[a-z][a-z_]{1,30}" readOnly={data.company.policies.at(-1).leaveTypes.some(original => original.name === t.name)} value={t.name} disabled={!admin} onChange={(e) => {
                  const leaveTypes = [...policy.leaveTypes];
                  leaveTypes[i] = { ...t, name: e.target.value };
                  setPolicy({ ...policy, leaveTypes });
                }} />
              </Field>
              <Field label="Quota (blank if unpaid)" name={`policy.leaveTypes.${i}.quota`}>
                <input
                  type="number"
                  min="0" step="1" required={t.paid}
                  value={t.quota ?? ''}
                  disabled={!admin || !t.paid}
                  onChange={(e) => {
                    const leaveTypes = [...policy.leaveTypes];
                    leaveTypes[i] = { ...t, quota: e.target.value === '' ? null : Number(e.target.value) };
                    setPolicy({ ...policy, leaveTypes });
                  }}
                />
              </Field>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  disabled={!admin}
                  checked={t.paid}
                  onChange={(e) => {
                    const leaveTypes = [...policy.leaveTypes];
                    leaveTypes[i] = { ...t, paid: e.target.checked, quota: e.target.checked ? t.quota || 0 : null };
                    setPolicy({ ...policy, leaveTypes });
                  }}
                />
                Paid
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  disabled={!admin}
                  checked={t.active !== false}
                  onChange={(e) => {
                    const leaveTypes = [...policy.leaveTypes];
                    leaveTypes[i] = { ...t, active: e.target.checked };
                    setPolicy({ ...policy, leaveTypes });
                  }}
                />
                Active
              </label>
            </div>
          ))}
        </div>
        <div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Public holidays</strong>
            {admin && (
              <button
                className="btn secondary"
                type="button"
                onClick={() => setPolicy({ ...policy, holidays: [...(policy.holidays || []), { date: todayISO(), name: 'Public holiday', active: true }] })}
              >
                Add holiday
              </button>
            )}
          </div>
          {(policy.holidays || []).map((h, i) => (
            <div className="row" key={i} style={{ marginTop: 8 }}>
              <Field label="Holiday date" name={`policy.holidays.${i}.date`}><input type="date" required disabled={!admin} value={h.date} onChange={(e) => {
                const holidays = [...policy.holidays];
                holidays[i] = { ...h, date: e.target.value };
                setPolicy({ ...policy, holidays });
              }} /></Field>
              <Field label="Holiday name" name={`policy.holidays.${i}.name`}><input required maxLength={2000} disabled={!admin} value={h.name} onChange={(e) => {
                const holidays = [...policy.holidays];
                holidays[i] = { ...h, name: e.target.value };
                setPolicy({ ...policy, holidays });
              }} /></Field>
              {admin && (
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={h.active !== false}
                    onChange={(e) => {
                      const holidays = [...policy.holidays];
                      holidays[i] = { ...h, active: e.target.checked };
                      setPolicy({ ...policy, holidays });
                    }}
                  />
                  Active
                </label>
              )}
            </div>
          ))}
        </div>
        {admin && (
          <button className="btn" type="submit">
            Publish policy version
          </button>
        )}
      </Form>

      <section className="card stack" style={{ marginBottom: 16 }} aria-label="Supported department catalog"><div className="page-head" style={{ margin: 0 }}><div><h3 className="serif">Your six departments</h3><p className="muted small">Employee department choices are limited to this list.</p></div>{admin && <button className="btn secondary" type="button" onClick={async () => { setError(null); try { await api('/organization/departments/configure', { method: 'POST', body: {} }); setOk('The six departments are ready. Existing employee references were preserved.'); await load(); } catch (err) { setError(err.status === 404 ? new Error('Deploy the updated backend to enable department configuration. Existing records have not been changed.') : err); } }}>Set up all departments</button>}</div><div className="row">{DEPARTMENTS.map(name => <Pill key={name}>{name}</Pill>)}</div></section>
      <div className="grid cols-2">
        {['department', 'designation'].map((kind) => (
          <div className="card" key={kind}>
            <h3 className="serif" style={{ textTransform: 'capitalize' }}>
              {kind}s
            </h3>
            {(data.units || []).filter((u) => u.kind === kind && (kind !== 'department' || departmentName(u.name))).map((u) => (
              <div className="row" key={u._id} style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span>
                  {kind === 'department' ? departmentName(u.name) : u.name} <Pill kind={u.active ? 'approved' : 'rejected'}>{u.active ? 'active' : 'inactive'}</Pill>
                </span>
                {admin && (
                  <Form className="row" onSubmit={async () => {
                    setError(null);
                    try {
                      await api(`/organization/units/${u._id}`, { method: 'PATCH', body: { name: (rename[u._id] ?? u.name).trim() } });
                      setOk('Unit name updated.');
                      await load();
                    } catch (err) { setError(err); }
                  }}>
                    <Field label={`Rename ${u.name}`} name="name">{kind === 'department' ? <select value={rename[u._id] ?? departmentName(u.name)} onChange={e => setRename({ ...rename, [u._id]: e.target.value })}>{DEPARTMENTS.map(name => <option key={name}>{name}</option>)}</select> : <input required maxLength={2000} value={rename[u._id] ?? u.name} onChange={e => setRename({ ...rename, [u._id]: e.target.value })} />}</Field>
                    <button className="btn secondary" type="submit">Rename</button>
                    <button className="btn secondary" type="button" onClick={async () => {
                      setError(null);
                      try { await api(`/organization/units/${u._id}`, { method: 'PATCH', body: { active: !u.active } }); setOk('Unit status updated.'); await load(); }
                      catch (err) { setError(err); }
                    }}>{u.active ? 'Deactivate' : 'Activate'}</button>
                    <button className="btn danger" type="button" onClick={async () => {
                      setError(null);
                      try { await api(`/organization/units/${u._id}`, { method: 'DELETE' }); setOk('Unit deleted.'); await load(); }
                      catch (err) { setError(err); }
                    }}>Delete</button>
                  </Form>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      {admin && (
        <Form
          className="card row"
          style={{ marginTop: 16 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await api('/organization/units', { method: 'POST', body: { kind: unitKind, name: unitName.trim() } });
              setUnitName('');
              await load();
            } catch (err) {
              setError(err);
            }
          }}
        >
          <Field label="Unit type" name="kind"><select value={unitKind} onChange={(e) => { setUnitKind(e.target.value); setUnitName(''); }}>
            <option value="department">Department</option>
            <option value="designation">Designation</option>
          </select></Field>
          <Field label="Unit name" name="name">{unitKind === 'department' ? <select value={unitName} onChange={e => setUnitName(e.target.value)} required><option value="">Choose department</option>{DEPARTMENTS.map(name => <option key={name} value={name} disabled={data.units.some(unit => unit.kind === 'department' && departmentName(unit.name) === name)}>{name}</option>)}</select> : <input maxLength={2000} value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="Name" required />}</Field>
          <button className="btn" type="submit">
            Add unit
          </button>
        </Form>
      )}
    </div>
  );
}
