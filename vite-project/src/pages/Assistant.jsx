import { Field } from '../components/ui.jsx';
import { Form } from '../components/Form.jsx';
import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Banner } from '../components/ui.jsx';

const PROMPTS = {
  Admin: [
    'Is mahine attendance rate kya hai?',
    'How many active employees are in the company?',
    'What is this month’s attendance rate?',
    'Summarize payroll cost this month.',
    'What is the late grace rule?',
  ],
  HR: [
    'Engineering mein kitne active employees hain?',
    'How many active employees are in Engineering?',
    'Who came late most often this month?',
    'What is this month’s attendance rate?',
    'How are half days treated in payroll?',
  ],
  Employee: [
    'Meri sick leave kitni baqi hai?',
    'How many sick leaves do I have left this year?',
    'What is the office start time and grace period?',
    'How is monthly tax calculated?',
    'What is my colleague’s salary?',
  ],
};

export default function Assistant() {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [log, setLog] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const chips = PROMPTS[user.role] || PROMPTS.Employee;

  const send = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setLog((l) => [...l, { role: 'user', text: trimmed }]);
    setMessage('');
    try {
      const data = await api('/ai/chat', { method: 'POST', body: { message: trimmed } });
      setLog((l) => [
        ...l,
        {
          role: 'assistant',
          text: data.fallback ? data.message || data.answer : data.answer,
          label: data.label || 'AI-generated',
          toolsUsed: data.toolsUsed,
        },
      ]);
    } catch (err) {
      setError(err);
      setMessage(trimmed);
      setLog((l) => [
        ...l,
        { role: 'assistant', text: err.message || 'The assistant is unavailable. Try the dashboard or ordinary forms.', label: 'AI-generated' },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="brand-kicker">AI assistant</div>
          <h1>Ask about your workspace</h1>
          <p className="muted">
            Answers use {user.role === 'Employee' ? 'your own records and company policy' : 'the workspace records available to you'}.
            Ask about attendance, leave and payroll policies. You can ask up to 20 questions per hour.
          </p>
        </div>
      </div>
      <Banner error={error} />
      <div className="card stack">
        <div className="row">
          {chips.map((chip) => (
            <button key={chip} className="btn secondary" type="button" disabled={busy} onClick={() => send(chip)}>
              {chip}
            </button>
          ))}
        </div>
        <div className="chat">
          {log.map((item, i) => (
            <div key={i} className={`bubble ${item.role}`}>
              {item.role !== 'user' && <div className="brand-kicker">{item.label || 'AI-generated'}</div>}
              <div style={{ whiteSpace: 'pre-wrap' }}>{item.text}</div>
              {item.toolsUsed?.length > 0 && <div className="muted small" style={{ marginTop: 8 }}>Based on saved records: {[...new Set(item.toolsUsed)].map(name => ({ get_headcount: 'headcount', get_attendance_summary: 'attendance', get_late_comers: 'late arrivals', get_leave_summary: 'leave requests', get_my_leave_balance: 'your leave balance', get_payroll_summary: 'published payroll', search_employees: 'employee directory' })[name]).filter(Boolean).join(', ')}.</div>}
            </div>
          ))}
        </div>
        <Form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault();
            await send(message);
          }}
        >
          <Field label="Your question" name="message"><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ask a data or policy question" required maxLength={2000} /></Field>
          <button className="btn" disabled={busy} type="submit">
            {busy ? 'Thinking…' : 'Send'}
          </button>
        </Form>
      </div>
    </div>
  );
}
