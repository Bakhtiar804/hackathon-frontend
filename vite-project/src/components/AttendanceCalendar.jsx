import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { todayISO, formatTime } from '../lib/format.js';
import { Field, LoadState, Pill } from './ui.jsx';

export function AttendanceCalendar({ employeeId, timezone }) {
  const [month, setMonth] = useState(todayISO(timezone).slice(0, 7));
  const [records, setRecords] = useState([]);
  const [loadedMonth, setLoadedMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [year, number] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const offset = (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;
  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true); setLoadError(null);
      try {
        const data = await api('/attendance', { query: { from: `${month}-01`, to: `${month}-${String(days).padStart(2, '0')}`, employeeId, limit: 100, page: 1 } });
        if (active) { setRecords(data.items || []); setLoadedMonth(month); }
      } catch (error) { if (active) setLoadError(error); }
      finally { if (active) setLoading(false); }
    });
    return () => { active = false; };
  }, [month, days, employeeId, attempt]);
  const byDate = new Map(records.map(record => [record.date, record]));
  return <section className="card attendance-calendar" aria-label="My attendance calendar">
    <div className="page-head"><div><h2>My attendance calendar</h2><p className="muted small">Saved attendance only · {timezone}. Empty dates are not marked absent.</p></div>
      <Field label="Calendar month" name="calendarMonth"><input type="month" value={month} max={todayISO(timezone).slice(0, 7)} onChange={event => { if (event.target.value && event.target.value <= todayISO(timezone).slice(0, 7)) setMonth(event.target.value); }} /></Field>
    </div>
    <LoadState state={{ loading, loadError, retry: () => setAttempt(value => value + 1) }} />
    {!loading && !loadError && loadedMonth === month && <div className="calendar-grid" role="list" aria-label={`Attendance for ${month}`}>
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day} className="calendar-heading" aria-hidden="true">{day}</div>)}
      {Array.from({ length: offset }, (_, index) => <div key={`space-${index}`} aria-hidden="true" />)}
      {Array.from({ length: days }, (_, index) => {
        const date = `${month}-${String(index + 1).padStart(2, '0')}`;
        const record = byDate.get(date);
        return <div key={date} role="listitem" aria-label={`${date}: ${record?.status?.replaceAll('_', ' ') || 'No saved record'}`} className={`calendar-day ${date === todayISO(timezone) ? 'calendar-today' : ''}`}>
          <time dateTime={date}>{index + 1}</time>
          {record ? <><Pill kind={record.status}>{({ missing_checkout: 'No checkout', half_day: 'Half day', on_leave: 'Leave' })[record.status] || record.status}</Pill><span className="small">{formatTime(record.checkIn, timezone)} – {formatTime(record.checkOut, timezone)}</span>{record.late && record.status !== 'late' && <span className="small">Late arrival</span>}</> : <span className="muted small">—</span>}
        </div>;
      })}
    </div>}
  </section>;
}
