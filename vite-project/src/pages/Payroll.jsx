import { Field } from '../components/ui.jsx';
import { Form } from '../components/Form.jsx';
import { usePageLoad } from '../lib/usePageLoad.js';
import { LoadState } from '../components/ui.jsx';
import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Banner, Empty, Pill } from '../components/ui.jsx';
import { currentPolicy, formatStamp, money, monthISO } from '../lib/format.js';
import { asList } from '../lib/people.js';

export default function Payroll() {
  const { user } = useAuth();
  const [runs, setRuns] = useState([]);
  const [open, setOpen] = useState(null);
  const [month, setMonth] = useState(monthISO());
  const [error, setError] = useState(null);
  const [ok, setOk] = useState('');
  const [timezone, setTimezone] = useState(null);

  const load = async () => {
    setRuns(asList(await api('/payroll')));
  };

  const initial = usePageLoad(async () => {
    await Promise.all([load(), api('/organization', { cacheMs: 30000 }).then(org => setTimezone(currentPolicy(org.company)?.timezone || 'Asia/Karachi'))]);
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="brand-kicker">Payroll Lite</div>
          <h1>Monthly runs</h1>
          <p className="muted">
            Prepare monthly payroll and publish payslips after month-end. Finalized payroll is locked.
          </p>
        </div>
        {user.role === 'HR' && (
          <Form
            className="row"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              try {
                const run = await api('/payroll', { method: 'POST', body: { month } });
                setOpen(run);
                setOk(`Draft ${run.month} generated`);
                await load();
              } catch (err) {
                setError(err);
              }
            }}
          >
            <Field label="Payroll month" name="month"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} required  /></Field>
            <button className="btn" type="submit">
              Generate draft
            </button>
          </Form>
        )}
      </div>
      <LoadState state={initial} />
      <Banner error={error} ok={ok} />
      <div className="card table-wrap">
        {runs.length ? (
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>State</th>
                <th>Generated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r._id}>
                  <td>{r.month}</td>
                  <td>
                    <Pill kind={r.state}>{r.state}</Pill>
                  </td>
                  <td>{formatStamp(r.generatedAt, timezone || undefined)}</td>
                  <td>
                    <button className="btn secondary" type="button" onClick={() => api(`/payroll/${r._id}`).then(setOpen).catch(setError)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>{initial.loading ? "Loading…" : initial.loadError ? "Records could not be loaded." : "No payroll runs yet."}</Empty>
        )}
      </div>
      {open && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 className="serif">
              {open.month} · {open.state}
            </h3>
            {user.role === 'Admin' && open.state === 'draft' && (
              <button
                className="btn"
                type="button"
                disabled={!timezone || open.month >= monthISO(timezone)}
                title={!timezone || open.month >= monthISO(timezone) ? 'Payroll can only be finalized after the month ends.' : 'Publish payslips'}
                onClick={async () => {
                  setError(null);
                  try {
                    if (!timezone || open.month >= monthISO(timezone)) throw new Error('Wait until the month has ended before finalizing payroll.');
                    const run = await api(`/payroll/${open._id}/finalize`, { method: 'POST', body: {} });
                    setOpen(run);
                    setOk('Payroll finalized and payslips published');
                    await load();
                  } catch (err) {
                    setError(err.status === 409 ? new Error(`${err.message}. Ask HR to regenerate the draft using the latest records, then review it again.`) : err);
                  }
                }}
              >
                Finalize
              </button>
            )}
          </div>
          {open.state === 'draft' && timezone && open.month >= monthISO(timezone) && <Banner>Payroll can be finalized after this month ends. You can review the draft now.</Banner>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Gross</th>
                  <th>Deductions</th>
                  <th>Tax</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {(open.slips || []).map((s) => (
                  <tr key={s.employeeId}>
                    <td>
                      {s.employeeCode} {s.employeeName}
                    </td>
                    <td>{money(s.grossMinor)}</td>
                    <td>{money(s.deductionsMinor)}</td>
                    <td>{money(s.taxMinor)}</td>
                    <td>{money(s.netMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
