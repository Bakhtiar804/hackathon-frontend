import { departmentName, departmentUnits } from '../lib/departments.js';
import { Field } from '../components/ui.jsx';
import { Form } from '../components/Form.jsx';
import { usePageLoad } from '../lib/usePageLoad.js';
import { LoadState } from '../components/ui.jsx';
import { useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Link } from 'react-router-dom';
import { Banner, Bars, Empty, Kpi, Pill, Trend } from '../components/ui.jsx';
import { currentPolicy, formatStamp, money, monthStart, pct, todayISO, unitName } from '../lib/format.js';
import { leaveTypeRows, mapRows } from '../lib/people.js';

export default function Dashboard() {
  const { user } = useAuth();
  const [org, setOrg] = useState(user.workspace ? { company: user.workspace, units: user.workspace.units || [] } : null);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayISO());
  const [departmentId, setDepartmentId] = useState('');
  const applied = useRef({ from: monthStart(), to: todayISO() });
  const requestVersion = useRef(0);
  const [data, setData] = useState(null);
  const [periodData, setPeriodData] = useState(null);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState(null);
  const policy = currentPolicy(org?.company);
  const units = org?.units || [];
  const staff = user.role === 'Admin' || user.role === 'HR';

  const load = async (selected = applied.current) => {
    const version = ++requestVersion.current;
    setError(null);
    setSummary(null);
    try {
      const organization = staff && !org ? api('/organization', { cacheMs: 30000 }).then(setOrg) : Promise.resolve();
      const today = todayISO();
      const period = user.role === 'Admin' ? { from: `${today.slice(0, 4)}-01-01`, to: today } : user.role === 'HR' ? { from: today, to: today } : null;
      if (period && selected.departmentId) period.departmentId = selected.departmentId;
      const samePeriod = period && period.from === selected.from && period.to === selected.to;
      const [, context, next] = await Promise.all([
        organization,
        period && !samePeriod ? api('/dashboard', { query: period }) : Promise.resolve(null),
        api('/dashboard', { query: selected }),
      ]);
      if (version !== requestVersion.current) return;
      applied.current = { ...selected };
      setData(next);
      setPeriodData(samePeriod ? next : context);
    } catch (err) {
      setError(err);
      throw err;
    }
  };

  const initial = usePageLoad(async () => {
    await load();

  });

  const punch = async (kind) => {
    setError(null);
    try {
      setCheck(await api(`/attendance/${kind}`, { method: 'POST', body: {} }));
      await load();
    } catch (err) {
      setError(err);
    }
  };

  const summarize = async () => {
    setBusy(true);
    setError(null);
    try {
      const filters = { from, to };
      if (departmentId) filters.departmentId = departmentId;
      await load(filters);
      setSummary(await api('/ai/summary', { method: 'POST', body: { filters } }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const canPunch = user.role === 'Employee' || (user.role === 'HR' && user.employeeId);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="brand-kicker">{user.role} dashboard</div>
          <h1>Today’s picture</h1>
          <p className="muted">Your people, attendance and leave at a glance. Choose a date range up to today.</p>
        </div>
        <Form
          className="filter-bar"
          onSubmit={async (e) => {
            e.preventDefault();
            if (e.nativeEvent.submitter?.value === 'summary') await summarize();
            else await load({ from, to, ...(staff && departmentId ? { departmentId } : {}) }).catch(setError);
          }}
        >
          <Field label="From" name="from"><input type="date" max={todayISO()} value={from} onChange={(e) => setFrom(e.target.value)} required /></Field>
          <Field label="To" name="to"><input type="date" max={todayISO()} value={to} onChange={(e) => setTo(e.target.value)} required /></Field>
          {staff && (
            <Field label="Department" name="departmentId"><select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">All departments</option>
              {departmentUnits(units).map((u) => (
                <option key={u._id} value={u._id}>
                  {departmentName(u.name) || u.name}{u.active ? '' : ' (inactive)'}
                </option>
              ))}
            </select></Field>
          )}
          <button className="btn ghost" type="button" onClick={async () => { const selected = { from: monthStart(), to: todayISO() }; setFrom(selected.from); setTo(selected.to); setDepartmentId(''); await load(selected).catch(setError); }}>This month</button>
          <button className="btn secondary" type="submit">
            Apply
          </button>
          {staff && (
            <button className="btn" type="submit" name="action" value="summary" disabled={busy}>
              {busy ? 'Summarizing…' : 'Summarize'}
            </button>
          )}
        </Form>
      </div>
      <LoadState state={initial} />
      <Banner error={error} />
      {canPunch && (
        <div className="card row" style={{ marginBottom: 16 }}>
          <strong>Web check-in / out</strong>
          <span className="muted small">Your check-in and check-out times are recorded automatically.</span>
          <button className="btn" type="button" onClick={() => punch('check-in')}>
            Check in
          </button>
          <button className="btn secondary" type="button" onClick={() => punch('check-out')}>
            Check out
          </button>
          {check && (
            <Pill kind={check.status}>
              {check.status} {check.late ? '· late' : ''}
            </Pill>
          )}
        </div>
      )}
      {summary && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="brand-kicker">{summary.label || 'AI-generated'}</div>
          {summary.fallback ? (
            <Banner>{summary.message || summary.answer || 'Assistant unavailable. Use the dashboard numbers above.'}</Banner>
          ) : (
            <ul>
              {(summary.bullets || []).map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!data ? (
        <Empty>{initial.loadError || error ? 'Dashboard could not be loaded. Please retry.' : 'Loading dashboard…'}</Empty>
      ) : (
        <div className="stack">
          <div className="grid kpis">
            {staff ? (
              <>
                <Kpi label="Headcount" value={data.headcount ?? 0} />
                {user.role === 'Admin' && <><Kpi label="Attrition YTD" value={pct(periodData?.attritionPercent)} /><Kpi label="Attrition in range" value={pct(data.attritionPercent)} /></>}
                {user.role === 'HR' && <Kpi label="Present today" value={periodData?.attendance?.present ?? 0} />}
                {user.role === 'HR' && <Kpi label="On leave today" value={periodData?.attendance?.on_leave ?? 0} />}
                {user.role === 'HR' && <Kpi label="Late today" value={periodData?.attendance?.lateFlags ?? periodData?.attendance?.late ?? 0} />}
                <Kpi label="Attendance rate" value={pct(data.attendanceRate)} />
                <Kpi label="Late %" value={pct(data.latePercent)} />
                <Kpi label="Absenteeism" value={pct(data.absenteeismPercent)} />
                <Kpi label="Pending approvals" value={data.pendingApprovals ?? 0} />
                {user.role === 'Admin' && <Kpi label="Payroll cost (gross)" value={money(data.payroll?.grossMinor)} />}
                {user.role === 'Admin' && <Kpi label="Average gross" value={money(data.averageGrossMinor)} />}
              </>
            ) : (
              <>
                <Kpi label="Hours this range" value={(data.hoursWorked ?? 0).toFixed(1)} />
                <Kpi label="Hours this week" value={data.weeklyHoursWorked == null ? '—' : `${Number(data.weeklyHoursWorked).toFixed(1)} / ${data.weeklyTargetHours ?? 40} h`} />
                <Kpi label="Weekly target" value={data.weeklyTargetHours == null ? '—' : `${data.weeklyTargetHours} h`} />
                <Kpi label="Late count" value={data.attendance?.lateFlags ?? 0} />
                <Kpi label="Last payslip" value={data.lastPayslip ? `${data.lastPayslip.month} · ${money(data.lastPayslip.netMinor)}` : 'None'} />
              </>
            )}
          </div>
          {user.role === 'Employee' && data.leaveBalance && (
            <div className="card">
              <h3 className="serif">Leave remaining</h3>
              <div className="row">
                {(data.leaveBalance.types || []).map((t) => (
                  <Kpi key={t.type} label={t.type} value={t.remaining === null ? 'Unlimited' : t.remaining} />
                ))}
              </div>
            </div>
          )}
          {user.role === 'Employee' && <div className="card row" style={{ justifyContent: 'space-between' }}><span>Questions about your attendance, leave balance or company policy?</span><Link className="btn secondary" to="/assistant">Ask my assistant</Link><Link className="btn secondary" to="/payslips">My payslips</Link></div>}
          <div className="grid cols-2">
            <div className="card">
              <h3 className="serif">Attendance trend</h3>
              <Trend points={data.trend || []} />
            </div>
            <div className="card">
              <h3 className="serif">Absenteeism by department</h3>
              <Bars
                rows={(data.byDepartment || []).map((d) => ({
                  label: unitName(units, d.departmentId),
                  value: d.absenteeismPercent ?? 0,
                  display: `${pct(d.absenteeismPercent)} · ${d.headcount || 0} people`,
                }))}
              />
            </div>
          </div>
          {staff && (
            <div className="grid cols-2">
              <div className="card"><h3 className="serif">Headcount by department</h3><Bars rows={(data.byDepartment || []).map(dept => ({ label: unitName(units, dept.departmentId), value: dept.headcount ?? 0 }))} /></div>
              <div className="card"><h3 className="serif">Average gross by department</h3><Bars rows={(data.byDepartment || []).filter(dept => dept.averageGrossMinor != null).map(dept => ({ label: unitName(units, dept.departmentId), value: dept.averageGrossMinor, display: money(dept.averageGrossMinor) }))} /></div>
              <div className="card table-wrap"><h3 className="serif">Leave utilization by type</h3><Utilization rows={data.leaveUtilizationByType || []} /></div>
              <div className="card table-wrap"><h3 className="serif">Leave utilization by department</h3><Utilization rows={(data.byDepartment || []).flatMap(dept => (dept.leaveUtilizationByType || []).map(type => ({ ...type, department: unitName(units, dept.departmentId) })))} departments /></div>
            </div>
          )}
          {staff && (
            <div className="grid cols-2">
              <div className="card">
                <h3 className="serif">Leave by type</h3>
                <Bars rows={leaveTypeRows(data.leaveByType)} />
              </div>
              <div className="card">
                <h3 className="serif">Top late-comers</h3>
                {(data.lateComers || []).length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Late days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lateComers.map((p) => (
                        <tr key={p.employeeId}>
                          <td>{p.name}</td>
                          <td>{p.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <Empty>No late flags in this range.</Empty>
                )}
              </div>
            </div>
          )}
          {user.role === 'Admin' && (
            <div className="grid cols-2">
              <div className="card table-wrap"><h3 className="serif">Payroll by month</h3>{Object.keys(data.payroll?.byMonth || {}).length ? <table><thead><tr><th>Month</th><th>Gross</th><th>Net</th></tr></thead><tbody>{Object.entries(data.payroll.byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, totals]) => <tr key={month}><td>{month}</td><td>{money(totals.grossMinor)}</td><td>{money(totals.netMinor)}</td></tr>)}</tbody></table> : <Empty>No published payroll in this range.</Empty>}</div>
              <div className="card">
                <h3 className="serif">Payroll cost by department</h3>
                <Bars
                  rows={mapRows(data.payroll?.byDepartment, (row) => row.grossMinor ?? row).map((row) => ({
                    label: unitName(units, row.label) === '—' ? row.label : unitName(units, row.label),
                    value: row.value,
                    display: money(row.value),
                  }))}
                />
                {Object.keys(data.payroll?.byDepartment || {}).length > 0 && <div className="table-wrap"><table><thead><tr><th>Department</th><th>Gross</th><th>Net</th></tr></thead><tbody>{Object.entries(data.payroll.byDepartment).map(([id, totals]) => <tr key={id}><td>{unitName(units, id) === '—' ? id : unitName(units, id)}</td><td>{money(totals.grossMinor)}</td><td>{money(totals.netMinor)}</td></tr>)}</tbody></table></div>}
              </div>
              <div className="card">
                <h3 className="serif">Average salary by designation</h3>
                <Bars
                  rows={mapRows(data.salaryByDesignation, (row) => row.averageGrossMinor ?? row.grossMinor ?? row).map((row) => ({
                    label: unitName(units, row.label) === '—' ? row.label : unitName(units, row.label),
                    value: row.value,
                    display: money(row.value),
                  }))}
                />
              </div>
              <div className="card">
                <h3 className="serif">Gender / tenure</h3>
                <Bars rows={Object.entries(data.gender || {}).map(([label, value]) => ({ label, value }))} />
                <Bars rows={Object.entries(data.tenure || {}).map(([label, value]) => ({ label: ({ under1Year: 'Under 1 year', oneToThreeYears: '1–3 years', over3Years: 'Over 3 years' })[label] || label, value }))} />
              </div>
              <div className="card">
                <h3 className="serif">Audit feed</h3>
                {(data.auditFeed || []).length ? (
                  <ul>
                    {(data.auditFeed || []).map((a) => (
                      <li key={a._id}>
                        {a.action} · {a.entity} · {formatStamp(a.createdAt, policy?.timezone)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>No audit events yet.</Empty>
                )}
              </div>
            </div>
          )}
          <div className="card">
            <h3 className="serif">Announcements</h3>
            {(data.announcements || []).length ? (
              (data.announcements || []).map((a) => (
                <div key={a._id} className="stack" style={{ marginBottom: 12 }}>
                  <strong>{a.title}</strong>
                  <div className="muted">{a.body}</div>
                </div>
              ))
            ) : (
              <Empty>No announcements.</Empty>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Utilization({ rows, departments = false }) {
  if (!rows.length) return <Empty>No leave utilization data in this range.</Empty>;
  return <table><thead><tr>{departments && <th>Department</th>}<th>Type</th><th>Used days</th><th>Quota</th><th>Utilization</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.department || ''}-${row.type}-${index}`}>{departments && <td>{row.department}</td>}<td>{row.type}</td><td>{row.used}</td><td>{row.quota === null ? 'Unlimited' : row.quota}</td><td>{row.percent == null ? '—' : pct(row.percent)}</td></tr>)}</tbody></table>;
}
