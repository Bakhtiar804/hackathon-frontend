import { formatApiError } from '../api/client.js';
import { pct } from '../lib/format.js';
import { cloneElement, useContext, useEffect, useId, useRef, useState } from 'react';
import { ValidationContext } from '../context/ValidationContext.js';

export function Banner({ error, ok, children, className = '' }) {
  if (error) return <div role="alert" className={`banner error ${className}`}>{formatApiError(error)}{error.requestId && <div className="small">Support reference: {error.requestId}</div>}</div>;
  if (ok) return <div role="status" className={`banner ok ${className}`}>{ok}</div>;
  if (!children) return null;
  return <div className={`banner ${className}`}>{children}</div>;
}

export function LoadState({ state }) {
  if (state.loading) return <div className="banner" role="status">Loading workspace records…</div>;
  if (state.loadError) return <div className="stack"><Banner error={state.loadError} /><button className="btn secondary" onClick={state.retry}>Try again</button></div>;
  return null;
}

export function Field({ label, name, apiField, error: suppliedError, children }) {
  const [revealed, setRevealed] = useState(false);
  const password = children.props.type === 'password';
  const generatedId = useId();
  const id = children.props.id || generatedId;
  const fieldName = children.props.name || name || String(label).replace(/\s*\(.*?\)/g, '').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+(.)/g, (_, letter) => letter.toUpperCase()).replace(/^./, letter => letter.toLowerCase());
  const { errors = {} } = useContext(ValidationContext) || {};
  const error = suppliedError || errors[fieldName] || errors[id];
  const rules = {
    companyName: { required: true, maxLength: 2000 }, name: { required: true, maxLength: 2000 }, email: { required: true },
    workspaceSlug: { minLength: 3, maxLength: 63, pattern: '[a-z0-9]+(?:\\-[a-z0-9]+)*', 'data-pattern-message': 'Use lowercase letters and numbers, separated by single hyphens.' },
    code: { required: true, maxLength: 30, pattern: '[A-Za-z0-9_\\-]{1,30}', 'data-pattern-message': 'Use up to 30 letters, numbers, underscores or hyphens.' },
    basicSalary: { required: true, min: 0.01, max: 10000000000, step: '0.01' }, phone: { maxLength: 40 }, address: { maxLength: 500 }, emergencyContact: { maxLength: 200 },
    reason: { required: true, maxLength: 2000 }, title: { required: true, maxLength: 2000 }, body: { required: true, maxLength: 2000 }, comment: { maxLength: 2000 },
    timezone: { required: true }, officeStart: { required: true, type: 'time' }, officeEnd: { required: true, type: 'time' },
    graceMinutes: { min: 0, max: 120, step: 1 }, halfDayHours: { min: 0, max: 24, step: 'any', 'data-exclusive-min': true }, officeLatitude: { min: -90, max: 90 }, officeLongitude: { min: -180, max: 180 }, geofenceRadius: { min: 0, max: 10000, step: 'any', 'data-exclusive-min': true },
  }[fieldName] || {};
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={password ? 'password-control' : 'control-wrap'}>{cloneElement(children, { ...rules, ...children.props, type: password ? revealed ? 'text' : 'password' : children.props.type || rules.type, 'data-password': password || undefined, id, name: fieldName, 'data-api-field': apiField || children.props['data-api-field'], 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-error` : children.props['aria-describedby'], placeholder: children.props.placeholder ?? (children.type === 'input' && !['password', 'number', 'date', 'time'].includes(children.props.type) ? `Enter ${String(label).toLowerCase()}` : undefined) })}
      {password && <button type="button" className="password-eye" aria-label={`${revealed ? 'Hide' : 'Show'} ${String(label).toLowerCase()}`} aria-pressed={revealed} aria-controls={id} onMouseDown={event => event.preventDefault()} onClick={() => setRevealed(value => !value)}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{revealed && <path d="m3 3 18 18"/>}</svg></button>}</div>
      {error && <span className="field-error" id={`${id}-error`} role="alert">{error}</span>}
    </div>
  );
}

export function Pill({ children, kind }) {
  return <span className={`pill ${kind || ''}`}>{typeof children === 'string' ? children.replaceAll('_', ' ') : children}</span>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Kpi({ label, value }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

export function Bars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.value) || 0));
  if (!rows.length) return <Empty>No data yet.</Empty>;
  return (
    <div className="bars">
      {rows.map((row) => (
        <div className="bar-row" key={row.label}>
          <span>{row.label}</span>
          <div className="bar">
            <span style={{ width: `${(Number(row.value) / max) * 100}%` }} />
          </div>
          <span>{row.display ?? row.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Trend({ points }) {
  if (!points?.length) return <Empty>No trend yet.</Empty>;
  const max = Math.max(1, ...points.map((p) => p.expectedDays || 0));
  return (
    <div className="row" style={{ alignItems: 'end', minHeight: 120 }}>
      {points.map((p) => {
        const present = (p.present || 0) + (p.late || 0) + (p.open || 0) + (p.missing_checkout || 0) + 0.5 * (p.half_day || 0);
        const h = ((p.expectedDays || 0) / max) * 100;
        return (
          <div key={p.date} title={`${p.date}: ${present}/${p.expectedDays}`} style={{ flex: 1, minWidth: 8 }}>
            <div
              style={{
                height: `${Math.max(0, h)}px`,
                background: 'var(--accent)',
                opacity: p.expectedDays ? 0.35 + 0.65 * (present / (p.expectedDays || 1)) : 0.2,
                borderRadius: 6,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function Pager({ page, total, limit, onPage }) {
  const [busy, setBusy] = useState(false);
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 20)));
  const change = async next => {
    if (busy) return;
    setBusy(true);
    try { await onPage(next); }
    finally { setBusy(false); }
  };
  return (
      <nav className="pager" aria-label="Pagination" aria-busy={busy}>
      <button className="btn secondary" type="button" disabled={busy || page <= 1} onClick={() => change(page - 1)}>
        Previous
      </button>
      <span className="muted small">
        Page {page} of {pages} · {total || 0} records
      </span>
      <button className="btn secondary" type="button" disabled={busy || page >= pages} onClick={() => change(page + 1)}>
        Next
      </button>
      </nav>
  );
}

export function Modal({ title, children, onClose }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className="card modal" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <h3 id={titleId} className="serif" style={{ margin: 0 }}>{title}</h3>
      <button className="btn ghost" type="button" onClick={onClose}>Close</button>
    </div>
    <div className="stack" style={{ marginTop: 12 }}>{children}</div>
  </dialog>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function percentRows(obj) {
  return Object.entries(obj || {}).map(([label, value]) => ({ label, value, display: typeof value === 'number' && value <= 100 ? pct(value) : value }));
}
