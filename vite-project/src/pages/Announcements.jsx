import { Form } from '../components/Form.jsx';
import { usePageLoad } from '../lib/usePageLoad.js';
import { LoadState } from '../components/ui.jsx';
import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Banner, Empty, Field, Pager } from '../components/ui.jsx';
import { formatStamp } from '../lib/format.js';

export default function Announcements() {
  const { user } = useAuth();
  const canPost = user.role === 'Admin' || user.role === 'HR';
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState(null);
  const [ok, setOk] = useState('');

  const load = async (p = 1) => {
    const data = await api('/announcements', { query: { page: p, limit: 20 } });
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
          <div className="brand-kicker">Comms</div>
          <h1>Announcements</h1>
          <p className="muted">Updates and news from your organization.</p>
        </div>
      </div>
      <LoadState state={initial} />
      <Banner error={error} ok={ok} />
      {canPost && (
        <Form
          className="card form"
          style={{ marginBottom: 16 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await api('/announcements', { method: 'POST', body: { title: title.trim(), body: body.trim() } });
              setTitle('');
              setBody('');
              setOk('Announcement published.');
              await load(1);
            } catch (err) {
              setError(err);
            }
          }}
        >
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <Field label="Body">
            <textarea value={body} onChange={(e) => setBody(e.target.value)} required />
          </Field>
          <button className="btn" type="submit">
            Post
          </button>
        </Form>
      )}
      <div className="stack">
        {items.length ? (
          items.map((a) => (
            <article className="card" key={a._id}>
              <h3 className="serif" style={{ marginTop: 0 }}>
                {a.title}
              </h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{a.body}</p>
              <div className="muted small">{formatStamp(a.createdAt)}</div>
            </article>
          ))
        ) : (
          <Empty>{initial.loading ? "Loading…" : initial.loadError ? "Records could not be loaded." : "No announcements yet."}</Empty>
        )}
      </div>
      <Pager page={page} total={total} limit={20} onPage={(p) => load(p).catch(setError)} />
    </div>
  );
}
