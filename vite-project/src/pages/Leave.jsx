import { departmentName, departmentUnits } from '../lib/departments.js';
import { Form } from '../components/Form.jsx';
import { usePageLoad } from '../lib/usePageLoad.js';
import { LoadState } from '../components/ui.jsx';
import { useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Banner, Empty, Field, Pager, Pill } from '../components/ui.jsx';
import { currentPolicy, todayISO } from '../lib/format.js';
import { loadPeople, personLabel } from '../lib/people.js';

export default function Leave() {
  const { user } = useAuth();
  const staff = user.role === 'Admin' || user.role === 'HR';
  const canApply = user.role === 'Employee' || (user.role === 'HR' && user.employeeId);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [state, setState] = useState(staff ? 'pending' : '');
  const [departmentId, setDepartmentId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const applied = useRef({ state: staff ? 'pending' : '' });
  const requestVersion = useRef(0);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [balance, setBalance] = useState(null);
  const [people, setPeople] = useState(new Map());
  const [error, setError] = useState(null);
  const [ok, setOk] = useState('');
  const [org, setOrg] = useState(user.workspace ? { company: user.workspace, units: user.workspace.units || [] } : null);
  const [form, setForm] = useState({ type: '', start: todayISO(), end: todayISO(), reason: '' });
  const [smart, setSmart] = useState('');
  const [proposal, setProposal] = useState(null);
  const [comment, setComment] = useState('');
  const policyTypes = (currentPolicy(org?.company)?.leaveTypes || []).filter((t) => t.active);
  const types = policyTypes.length
    ? policyTypes
    : (balance?.types || []).filter((t) => t.active !== false).map((t) => ({ name: t.type }));

  const query = (p, selected) => ({
    page: p,
    limit: 20,
    ...selected,
  });

  const load = async (p = 1, selected = applied.current) => {
    const version = ++requestVersion.current;
    const data = await api('/leaves', { query: query(p, selected) });
    if (version !== requestVersion.current) return;
    const lastPage = Math.max(1, Math.ceil((data.total || 0) / 20));
    if (p > lastPage) return load(lastPage, selected);
    applied.current = { ...selected };
    setRows(data.items || []);
    setTotal(data.total || 0);
    setPage(data.page || p);
    if (canApply) {
      setBalance(await api('/leaves/balances/me', { query: { year: Number(todayISO().slice(0, 4)) } }));
    }
  };

  const initial = usePageLoad(async () => {
    await Promise.all([load(1), ...(staff ? [api('/organization', { cacheMs: 30000 }).then(setOrg), loadPeople().then(setPeople)] : [])]);
  });

  const apply = async (body) => {
    setError(null);
    if (!body.type || !body.start || !body.end || !body.reason?.trim()) throw new Error('Choose a leave type, both dates and a reason before submitting.');
    if (body.end < body.start) throw new Error('The end date must be on or after the start date.');
    await api('/leaves', { method: 'POST', body });
    setOk('Leave submitted. Pending does not reserve quota until approval.');
    setProposal(null);
    await load(page);
  };

  const decide = async (id, decision) => {
    if (!comment.trim()) {
      setError({ message: 'HR must comment on every decision.' });
      document.getElementById('leave-comment')?.focus();
      return;
    }
    await api(`/leaves/${id}/decision`, { method: 'POST', body: { decision, comment: comment.trim() } });
    setComment('');
    await load(page);
  };

  const own = (row) => row.employeeId === user.employeeId;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="brand-kicker">Leave</div>
          <h1>{staff ? 'Approval inbox' : 'My leave'}</h1>
          <p className="muted">Leave counts working days only. Requests must fit your balance and cannot overlap. HR reviews requests from other employees.</p>
        </div>
      </div>
      <LoadState state={initial} />
      <Banner error={error} ok={ok} />
      {user.role === 'HR' && !user.employeeId && <Banner>Ask your Admin to link your employee profile in Users before requesting your own leave.</Banner>}
      {balance && (
        <div className="grid kpis" style={{ marginBottom: 16 }}>
          {(balance.types || []).map((t) => (
            <div className="card kpi" key={t.type}>
              <div className="label">{t.type}</div>
              <div className="value">{t.remaining === null ? '∞' : t.remaining}</div>
              <div className="muted small">
                used {t.used} / quota {t.quota ?? 'unlimited'}
              </div>
            </div>
          ))}
        </div>
      )}
      <Form
        className="card filter-bar"
        style={{ marginBottom: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          await load(1, { ...(from && { from }), ...(to && { to }), ...(state && { state }), ...(staff && departmentId && { departmentId }), ...(staff && employeeId && { employeeId }) }).catch(setError);
        }}
      >
        <Field label="From" name="from"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)}  /></Field>
        <Field label="To" name="to"><input type="date" value={to} onChange={(e) => setTo(e.target.value)}  /></Field>
        <Field label="Request status" name="state"><select value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">All states</option>
          {['pending', 'approved', 'rejected', 'cancelled'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select></Field>
        {staff && (
          <Field label="Department" name="departmentId"><select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">All departments</option>
            {departmentUnits(org?.units)
              .map((u) => (
                <option key={u._id} value={u._id}>
                  {departmentName(u.name) || u.name}
                </option>
              ))}
          </select></Field>
        )}
        {staff && <Field label="Employee filter" name="employeeId"><select value={employeeId} onChange={e => setEmployeeId(e.target.value)}><option value="">All employees</option>{[...people.values()].map(person => <option key={person._id} value={person._id}>{person.name} · {person.code}</option>)}</select></Field>}
        <button className="btn secondary" type="submit">Filter</button>
        <button className="btn ghost" type="button" onClick={async () => { setFrom(''); setTo(''); setState(''); setDepartmentId(''); setEmployeeId(''); setError(null); await load(1, {}).catch(setError); }}>Clear filters</button>
      </Form>
      <div className="card table-wrap">
        {rows.length ? (
          <table>
            <thead>
              <tr>
                {staff && <th>Employee</th>}
                <th>Type</th>
                <th>Dates</th>
                <th>Days</th>
                <th>Reason</th>
                <th>State</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  {staff && <td>{personLabel(people, r.employeeId)}</td>}
                  <td>{r.type}</td>
                  <td>
                    {r.start} → {r.end}
                  </td>
                  <td>{r.days?.length || 0}</td>
                  <td>{r.reason}</td>
                  <td>
                    <Pill kind={r.state}>{r.state}</Pill>
                  </td>
                  <td className="row">
                    {canApply && own(r) && r.start > todayISO(currentPolicy(org?.company)?.timezone) && (r.state === 'pending' || r.state === 'approved') && (
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() =>
                          api(`/leaves/${r._id}/cancel`, { method: 'POST', body: {} })
                            .then(() => load(page))
                            .catch(setError)
                        }
                      >
                        Cancel
                      </button>
                    )}
                    {user.role === 'HR' && r.state === 'pending' && !own(r) && (
                      <>
                        <button className="btn" type="button" onClick={() => decide(r._id, 'approved').catch(setError)}>
                          Approve
                        </button>
                        <button className="btn danger" type="button" onClick={() => decide(r._id, 'rejected').catch(setError)}>
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>{initial.loading ? "Loading…" : initial.loadError ? "Records could not be loaded." : "No leave requests."}</Empty>
        )}
      </div>
      {user.role === 'HR' && (
        <Field label="Comment on every decision" name="comment" error={!comment.trim() && error?.message === 'HR must comment on every decision.' ? 'Enter a comment before making a decision.' : null}>
          <input id="leave-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Explain your decision" />
        </Field>
      )}
      <Pager page={page} total={total} limit={20} onPage={(p) => load(p).catch(setError)} />

      {canApply && (
        <div className="grid cols-2" style={{ marginTop: 16 }}>
          <Form id="leave-application"
            className="card form"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              try {
                await apply({ type: form.type, start: form.start, end: form.end, reason: form.reason.trim() });
              } catch (err) {
                setError(err);
              }
            }}
          >
            <h3 className="serif">Apply for leave</h3>
            <Field label="Type">
              <select required value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="">{types.length ? 'Select leave type' : 'No available leave types'}</option>
                {types.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start">
              <input type="date" min={todayISO()} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} required />
            </Field>
            <Field label="End">
              <input type="date" min={form.start} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} required />
            </Field>
            <Field label="Reason">
              <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
            </Field>
            <button className="btn" type="submit">
              Submit
            </button>
          </Form>
          <Form
            className="card form"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              try {
                const data = await api('/ai/smart-leave', { method: 'POST', body: { message: smart } });
                if (data.fallback) {
                  setProposal(null);
                  setOk(data.message || 'Assistant unavailable. Use the ordinary form.');
                } else {
                  setProposal(data);
                  setForm({ type: data.proposal.type, start: data.proposal.start, end: data.proposal.end, reason: data.proposal.reason });
                }
              } catch (err) {
                setError(err);
                setOk('Smart leave failed. Use the ordinary form.');
              }
            }}
          >
            <h3 className="serif">Smart leave</h3>
            <p className="muted small">Describe the time off in plain words. The assistant never saves — you confirm the form.</p>
            <Field label="Describe your time off" name="message"><textarea
              value={smart}
              onChange={(e) => setSmart(e.target.value)}
              placeholder="Need next Monday and Tuesday off for my sister’s wedding"
              required maxLength={2000}
            /></Field>
            <button className="btn secondary" type="submit">
              Propose
            </button>
            {proposal?.proposal && (
              <div className="banner ai">
                <div className="brand-kicker">{proposal.label || 'AI-generated'}</div>
                <p>
                  {form.type} · {form.start} → {form.end}
                  <br />
                  {form.reason}
                </p>
                <p className="small">Review or edit the Apply for leave form, then confirm to submit.</p>
                <button className="btn" type="submit" form="leave-application"                >
                  Confirm and submit
                </button>
              </div>
            )}
          </Form>
        </div>
      )}
    </div>
  );
}
