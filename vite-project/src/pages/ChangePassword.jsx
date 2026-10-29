import { Form } from '../components/Form.jsx';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { passwordError } from '../lib/password.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Banner, Field } from '../components/ui.jsx';

export default function ChangePassword() {
  const { user, logout, clearSession } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!user) return <Navigate to="/login" replace />;

  const isForced = user.mustChangePassword;

  return (
    <div className="auth-shell">
      <Form
        className="auth-card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const invalid = passwordError(newPassword);
            if (invalid) throw new Error(invalid);
            if (newPassword !== confirmPassword)
              throw new Error('New passwords do not match. Please re-enter them.');
            if (newPassword === currentPassword)
              throw new Error('New password must be different from your current password.');
            await api('/auth/change-password', {
              method: 'POST',
              body: { currentPassword, newPassword },
            });
            setCurrent('');
            setNew('');
            setConfirm('');
            clearSession();
            navigate('/login', {
              replace: true,
              state: {
                email: user.email,
                workspaceSlug: user.workspace?.slug,
                message: 'Password updated successfully. Please sign in with your new password.',
              },
            });
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <div className="auth-logo">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <rect width="36" height="36" rx="10" fill="var(--accent)" />
              <path d="M10 26V14a8 8 0 0 1 16 0v12" stroke="var(--on-accent)" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="18" cy="22" r="3" fill="var(--on-accent)" />
            </svg>
          </div>
          <div className="brand-kicker" style={{ marginTop: 10 }}>Security</div>
          <h1 className="serif" style={{ margin: '4px 0 0' }}>
            {isForced ? 'Set your password' : 'Change password'}
          </h1>
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
            {isForced
              ? 'You are using a temporary password. Please set a new one to continue.'
              : 'Choose a strong password. You will sign in again after saving.'}
          </p>
        </div>

        <div className="auth-divider" />

        {isForced && (
          <div className="banner" style={{ background: 'color-mix(in srgb, var(--warn) 12%, var(--surface-2))', borderColor: 'color-mix(in srgb, var(--warn) 40%, var(--line))' }}>
            <strong style={{ color: 'var(--warn)' }}>Action required</strong>
            <br />
            <span className="muted small">
              Your account was created with a temporary password. Set a permanent one to access the system.
            </span>
          </div>
        )}

        <Banner error={error} />

        <Field label="Current / temporary password" name="currentPassword">
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoFocus
          />
        </Field>

        <Field label="New password" name="newPassword">
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            minLength={12}
            required
          />
        </Field>

        <Field label="Confirm new password" name="confirmPassword">
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </Field>
        <p className="muted small" style={{ marginTop: -6 }}>
          Minimum 12 characters, maximum 72 bytes.
        </p>

        <button className="btn btn-full" disabled={busy} type="submit">
          {busy ? 'Saving…' : 'Update password & sign in again'}
        </button>

        <button
          className="btn ghost"
          type="button"
          style={{ textAlign: 'center' }}
          onClick={async () => {
            const pendingLogout = logout();
            navigate('/login', { replace: true });
            await pendingLogout;
          }}
        >
          Sign out
        </button>
      </Form>
    </div>
  );
}
