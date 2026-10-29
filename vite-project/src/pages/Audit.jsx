import { Field } from '../components/ui.jsx';
import { Form } from '../components/Form.jsx';
import { usePageLoad } from '../lib/usePageLoad.js';
import { LoadState } from '../components/ui.jsx';
import { useRef, useState } from 'react';
import { api } from '../api/client.js';
import { Banner, Empty, Modal, Pager } from '../components/ui.jsx';
import { formatStamp, monthStart, todayISO } from '../lib/format.js';

export default function Audit() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayISO());
  const applied = useRef({ from: monthStart(), to: todayISO() });
  const requestVersion = useRef(0);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  const load = async (p = 1, selected = applied.current) => {
    const version = ++requestVersion.current;
    setError(null);
    const data = await api('/audit-logs', { query: { ...selected, page: p, limit: 20 } });
    if (version !== requestVersion.current) return;
    applied.current = { ...selected };
    setItems(data.items || []);
    setTotal(data.total || 0);
    setPage(data.page || p);
  };

  const initial = usePageLoad(async () => {
    await load(1);
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="brand-kicker">Security</div>
          <h1>Audit log</h1>
          <p className="muted">A permanent history of important workspace changes.</p>
        </div>
        <Form
          className="filter-bar"
          onSubmit={async (e) => {
            e.preventDefault();
            await load(1, { from, to }).catch(setError);
          }}
        >
          <Field label="From" name="from"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)}  /></Field>
          <Field label="To" name="to"><input type="date" value={to} onChange={(e) => setTo(e.target.value)}  /></Field>
          <button className="btn secondary" type="submit">
            Filter
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
                <th>When</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Actor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a._id}>
                  <td>{formatStamp(a.createdAt)}</td>
                  <td>{a.action}</td>
                  <td>
                    {a.entity} {a.entityId}
                  </td>
                  <td>{a.actorId}</td>
                  <td>
                    <button className="btn ghost" type="button" onClick={() => setOpen(a)}>
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>{initial.loading ? "Loading…" : initial.loadError ? "Records could not be loaded." : "No audit events in this range."}</Empty>
        )}
      </div>
      <Pager page={page} total={total} limit={20} onPage={(p) => load(p).catch(setError)} />
      {open && <Modal title="Change details" onClose={() => setOpen(null)}>
        <h4>Before</h4><AuditValues value={open.before} />
        <h4>After</h4><AuditValues value={open.after} />
      </Modal>}
    </div>
  );
}

function AuditValues({ value }) {
  if (value == null) return <p className="muted">No values recorded.</p>;
  if (typeof value !== 'object') return <span>{String(value)}</span>;
  if (Array.isArray(value)) return <ul>{value.map((item, i) => <li key={i}><AuditValues value={item} /></li>)}</ul>;
  return <dl className="audit-values">{Object.entries(value).filter(([key]) => !['lock','revision','__v','passwordHash','token','authorization'].includes(key)).map(([key, item]) => <div key={key}><dt>{key.replace(/([A-Z])/g, ' $1').replaceAll('_', ' ')}</dt><dd><AuditValues value={item} /></dd></div>)}</dl>;
}
