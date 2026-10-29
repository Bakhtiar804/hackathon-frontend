import { Form } from '../components/Form.jsx';
import { usePageLoad } from '../lib/usePageLoad.js';
import { LoadState } from '../components/ui.jsx';
import { useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Banner, Empty, Field, Pager, Pill } from '../components/ui.jsx';
import { currentPolicy, policyFor, formatTime, localDateTime, todayISO } from '../lib/format.js';
import { loadPeople, personLabel } from '../lib/people.js';
import { AttendanceCalendar } from '../components/AttendanceCalendar.jsx';

export default function Attendance() {
  const { user } = useAuth();
  const staff = user.role === 'Admin' || user.role === 'HR';
  const canPunch = user.role === 'Employee' || (user.role === 'HR' && user.employeeId);
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [employeeId, setEmployeeId] = useState('');
  const applied = useRef({ from: todayISO(), to: todayISO(), employeeId: '' });
  const requestVersion = useRef(0);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [corrections, setCorrections] = useState([]);
  const [correctionPage, setCorrectionPage] = useState(1);
  const [correctionTotal, setCorrectionTotal] = useState(0);
  const [correctionState, setCorrectionState] = useState(user.role === 'HR' ? 'pending' : '');
  const appliedCorrectionState = useRef(user.role === 'HR' ? 'pending' : '');
  const [people, setPeople] = useState(new Map());
  const [error, setError] = useState(null);
  const [ok, setOk] = useState('');
  const [org, setOrg] = useState(user.workspace ? { company: user.workspace, units: user.workspace.units || [] } : null);
  const [form, setForm] = useState({ date: todayISO(), checkIn: '09:00', checkOut: '18:00', reason: '' });
  const [comment, setComment] = useState('');
  const tz = currentPolicy(org?.company)?.timezone || rows.at(-1)?.policySnapshot?.timezone || 'Asia/Karachi';
  const correctionTimezone = policyFor(org?.company, form.date)?.timezone || tz;

  const load = async (p = 1, selected = applied.current) => {
    const version = ++requestVersion.current;
    const data = await api('/attendance', { query: { ...selected, page: p, limit: 20 } });
    if (version !== requestVersion.current) return;
    applied.current = { ...selected };
    setRows(data.items || []);
    setTotal(data.total || 0);
    setPage(data.page || p);
    await loadCorrections(correctionPage);
  };

  const loadCorrections = async (p, selectedState = appliedCorrectionState.current) => {
    const corr = await api('/attendance/corrections', { query: { page: p, limit: 20, ...(selectedState && { state: selectedState }), ...(staff && applied.current.employeeId ? { employeeId: applied.current.employeeId } : {}) } });
    const lastPage = Math.max(1, Math.ceil((corr.total || 0) / 20));
    if (p > lastPage) return loadCorrections(lastPage, selectedState);
    appliedCorrectionState.current = selectedState;
    setCorrections(corr.items || []);
    setCorrectionPage(corr.page || p);
    setCorrectionTotal(corr.total || 0);
  };

  const initial = usePageLoad(async () => {
    await Promise.all([load(1), ...(staff ? [api('/organization', { cacheMs: 30000 }).then(setOrg), loadPeople().then(setPeople)] : [])]);
  });

  const decide = async (id, decision) => {
    if (!comment.trim()) {
      setError({ message: 'HR must comment on every decision.' });
      document.getElementById('correction-comment')?.focus();
      return;
    }
    await api(`/attendance/corrections/${id}/decision`, {
      method: 'POST',
      body: { decision, comment: comment.trim() },
    });
    setComment('');
    await load(page);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="brand-kicker">Attendance</div>
          <h1>{staff ? 'Daily board' : 'My calendar'}</h1>
          <p className="muted">
            Check in and out to record your working hours. Late arrivals and half days follow your company’s policy.
          </p>
        </div>
        {canPunch && (
          <div className="row">
            <button
              className="btn"
              type="button"
              onClick={() =>
                api('/attendance/check-in', { method: 'POST', body: {} })
                  .then(() => { setOk('Attendance updated. Select today to view your latest record.'); return load(page); })
                  .catch(setError)
              }
            >
              Check in
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() =>
                api('/attendance/check-out', { method: 'POST', body: {} })
                  .then(() => { setOk('Check-out saved.'); return load(page); })
                  .catch(setError)
              }
            >
              Check out
            </button>
          </div>
        )}
      </div>
      <LoadState state={initial} />
      <Banner error={error} ok={ok} />
      <p className="muted small">Times shown in {tz}.</p>
      {user.role === 'HR' && !user.employeeId && <Banner>Ask your Admin to link your employee profile in Users to enable your own check-in, corrections and leave.</Banner>}
      {canPunch && <AttendanceCalendar employeeId={user.employeeId} timezone={tz} key={`${user.employeeId}-${tz}-${ok}`} />}
      <Form
        className="card filter-bar"
        style={{ marginBottom: 16 }}
        validate={(_form, button) => button?.value === 'reconcile' && to >= todayISO(tz) ? { to: 'Choose a completed date before today to reconcile attendance.' } : {}}
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            if (e.nativeEvent.submitter?.value === 'reconcile') {
              const data = await api('/attendance/reconcile', { method: 'POST', body: { from, to } });
              setOk(`Updated ${data.changed} past attendance records.`);
            }
            await load(1, { from, to, ...(staff && employeeId ? { employeeId } : {}) });
          } catch (err) { setError(err); }
        }}
      >
        <Field label="From" name="from"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required /></Field>
        <Field label="To" name="to"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} required /></Field>
        {staff && <Field label="Employee filter" name="employeeId"><select value={employeeId} onChange={e => setEmployeeId(e.target.value)}><option value="">All employees</option>{[...people.values()].map(person => <option key={person._id} value={person._id}>{person.name} · {person.code}</option>)}</select></Field>}
        <button className="btn secondary" type="submit">
          Load
        </button>
        {staff && (
          <button
            className="btn"
            type="submit" name="action" value="reconcile"
          >
            Reconcile range
          </button>
        )}
        <button className="btn ghost" type="button" onClick={async () => { const day = todayISO(tz); setFrom(day); setTo(day); setEmployeeId(''); setError(null); await load(1, { from: day, to: day }).catch(setError); }}>Today</button>
      </Form>
      <div className="card table-wrap">
        {rows.length ? (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>In</th>
                <th>Out</th>
                <th>Status</th>
                <th>Late</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  <td>{r.date}</td>
                  <td>{personLabel(people, r.employeeId)}</td>
                  <td>{formatTime(r.checkIn, tz)}</td>
                  <td>{formatTime(r.checkOut, tz)}</td>
                  <td>
                    <Pill kind={r.status}>{r.status}</Pill>
                  </td>
                  <td>{r.late ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>{initial.loading ? "Loading…" : initial.loadError ? "Records could not be loaded." : "No attendance rows for this range."}</Empty>
        )}
      </div>
      <Pager page={page} total={total} limit={20} onPage={(p) => load(p).catch(setError)} />

      {canPunch && (
        <Form data-timezone={correctionTimezone}
          className="card form"
          style={{ marginTop: 16 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await api('/attendance/corrections', {
                method: 'POST',
                body: {
                  date: form.date,
                  checkIn: localDateTime(form.date, form.checkIn, correctionTimezone),
                  checkOut: localDateTime(form.date, form.checkOut, correctionTimezone),
                  reason: form.reason.trim(),
                },
              });
              setOk('Correction requested');
              setForm({ ...form, reason: '' });
              await load(page);
            } catch (err) {
              setError(err);
            }
          }}
        >
          <h3 className="serif">Request a correction</h3>
          <p className="muted small">HR reviews your correction before it updates your attendance.</p>
          <div className="grid form two">
            <Field label="Date">
              <input type="date" max={todayISO(correctionTimezone)} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </Field>
            <Field label="Reason">
              <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
            </Field>
            <Field label="Check in">
              <input type="time" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} required />
            </Field>
            <Field label="Check out">
              <input type="time" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} required />
            </Field>
          </div>
          <button className="btn" type="submit">
            Submit request
          </button>
        </Form>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="serif">{user.role === 'HR' ? 'Correction inbox' : 'Correction history'}</h3>
        <Form className="filter-bar" onSubmit={async () => { setError(null); await loadCorrections(1, correctionState).catch(setError); }}>
          <Field label="Correction status" name="state"><select value={correctionState} onChange={event => setCorrectionState(event.target.value)}><option value="">All corrections</option>{['pending', 'approved', 'rejected'].map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
          <button className="btn secondary" type="submit">Filter corrections</button>
        </Form>
        {user.role === 'HR' && (
          <Field label="Comment required on every decision" name="comment" error={!comment.trim() && error?.message === 'HR must comment on every decision.' ? 'Enter a comment before making a decision.' : null}>
            <input id="correction-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Decision comment" />
          </Field>
        )}
        {corrections.length ? (
          corrections.map((c) => (
            <div className="row" key={c._id} style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <span>
                {personLabel(people, c.employeeId)} · {c.date} · {c.reason} <Pill kind={c.state}>{c.state}</Pill>
              </span>
              {user.role === 'HR' && c.state === 'pending' && c.employeeId !== user.employeeId && (
                <span className="row">
                  <button className="btn" type="button" onClick={() => decide(c._id, 'approved').catch(setError)}>
                    Approve
                  </button>
                  <button className="btn danger" type="button" onClick={() => decide(c._id, 'rejected').catch(setError)}>
                    Reject
                  </button>
                </span>
              )}
            </div>
          ))
        ) : (
          <Empty>{initial.loading ? "Loading…" : initial.loadError ? "Records could not be loaded." : "No correction requests."}</Empty>
        )}
      </div>
      <Pager page={correctionPage} total={correctionTotal} limit={20} onPage={(p) => loadCorrections(p).catch(setError)} />
    </div>
  );
}
