import { usePageLoad } from '../lib/usePageLoad.js';
import { LoadState } from '../components/ui.jsx';
import { useState } from 'react';
import { api } from '../api/client.js';
import { Banner, Empty, Pager, Pill } from '../components/ui.jsx';
import { formatStamp } from '../lib/format.js';

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(null);

  const load = async (p = 1) => {
    const data = await api('/notifications', { query: { page: p, limit: 20 } });
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
          <div className="brand-kicker">Inbox</div>
          <h1>Notifications</h1>
          <p className="muted">Created when leave or attendance decisions land, and when payroll is published.</p>
        </div>
      </div>
      <LoadState state={initial} />
      <Banner error={error} />
      <div className="stack">
        {items.length ? (
          items.map((n) => (
            <div className="card row" key={n._id} style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{n.title}</strong>
                <div className="muted small">{formatStamp(n.createdAt)}</div>
              </div>
              {n.readAt ? (
                <Pill kind="approved">Read</Pill>
              ) : (
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => api(`/notifications/${n._id}/read`, { method: 'POST', body: {} }).then(() => { window.dispatchEvent(new Event('hcm:notifications')); return load(page); }).catch(setError)}
                >
                  Mark read
                </button>
              )}
            </div>
          ))
        ) : (
          <Empty>{initial.loading ? "Loading…" : initial.loadError ? "Records could not be loaded." : "No notifications."}</Empty>
        )}
      </div>
      <Pager page={page} total={total} limit={20} onPage={(p) => load(p).catch(setError)} />
    </div>
  );
}
