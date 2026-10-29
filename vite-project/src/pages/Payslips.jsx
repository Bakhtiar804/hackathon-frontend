import { usePageLoad } from '../lib/usePageLoad.js';
import { LoadState } from '../components/ui.jsx';
import { useState } from 'react';
import { api } from '../api/client.js';
import { Banner, Empty, Pill } from '../components/ui.jsx';
import { money } from '../lib/format.js';
import { asList } from '../lib/people.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Payslips() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const initial = usePageLoad(async () => {
    setItems(asList(await api("/payslips")));

  });

  const download = async (runId, employeeId, month) => {
    if (downloading) return;
    setDownloading(true);
    setError(null);
    try {
      const blob = await api(`/payslips/${runId}/${employeeId}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip-${month}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err);
    } finally { setDownloading(false); }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="brand-kicker">Payslips</div>
          <h1>{user.role === 'Employee' ? 'Published slips' : 'Payslips'}</h1>
          <p className="muted">{user.role === 'Employee' ? 'View published payslips and download a PDF for your records.' : 'Review draft or published payslips. Only finalized payroll is published to employees.'}</p>
        </div>
      </div>
      <LoadState state={initial} />
      <Banner error={error} />
      <div className="card table-wrap">
        {items.length ? (
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Employee</th>
                <th>Net</th>
                <th>State</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={`${s.runId}-${s.employeeId}`}>
                  <td>{s.month}</td>
                  <td>
                    {s.employeeCode} {s.employeeName}
                  </td>
                  <td>{money(s.netMinor)}</td>
                  <td>
                    <Pill kind={s.state}>{s.state}</Pill>
                  </td>
                  <td className="row">
                    <button className="btn secondary" type="button" onClick={() => api(`/payslips/${s.runId}/${s.employeeId}`).then(setOpen).catch(setError)}>
                      View
                    </button>
                    <button className="btn" disabled={downloading} type="button" onClick={() => download(s.runId, s.employeeId, s.month)}>
                      {downloading ? 'Downloading…' : 'PDF'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>{initial.loading ? "Loading…" : initial.loadError ? "Records could not be loaded." : "No published payslips."}</Empty>
        )}
      </div>
      {open && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 className="serif">
            {open.employeeName} · {open.month}
          </h3>
          <p>
            Basic {money(open.basicMinor)} · HRA {money(open.hraMinor)} · Medical {money(open.medicalMinor)} · Gross {money(open.grossMinor)} · Tax {money(open.taxMinor)} · Net {money(open.netMinor)}
          </p>
          <div className="table-wrap"><table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Reason</th>
                <th>Per day</th>
              </tr>
            </thead>
            <tbody>
              {(open.breakdown || []).map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>{d.reason}</td>
                  <td>{money(d.perDayMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
