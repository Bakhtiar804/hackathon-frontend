import { Form } from '../components/Form.jsx';
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Banner, Field } from '../components/ui.jsx';

export default function Login() {
  const { user, login, workspaceCreationAvailable } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const [password, setPassword] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState(location.state?.workspaceSlug || '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={user.mustChangePassword ? '/change-password' : '/'} replace />;

  return (
    <div className="auth-shell">
      <Form
        className="auth-card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const next = await login(email.trim().toLowerCase(), password, workspaceSlug.trim().toLowerCase());
            navigate(next.mustChangePassword ? '/change-password' : '/', { replace: true });
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
          <div className="brand-kicker" style={{ marginTop: 10 }}>HCM Lite</div>
          <h1 className="serif" style={{ margin: '4px 0 0' }}>Sign in</h1>
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
            Welcome back. Enter your credentials to continue.
          </p>
        </div>

        <div className="auth-divider" />

        <Banner ok={location.state?.message} />
        <Banner error={error} />
        {workspaceCreationAvailable && <Field label="Workspace address" name="workspaceSlug"><input value={workspaceSlug} onChange={e => setWorkspaceSlug(e.target.value)} autoComplete="organization" placeholder="acme-team" /></Field>}

        <Field label="Email" name="email">
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            autoFocus={!email}
          />
        </Field>

        <Field label="Password" name="password">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            required
          />
        </Field>

        <button className="btn btn-full" disabled={busy} type="submit">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="muted small" style={{ textAlign: 'center', marginTop: 4 }}>
          Forgot your password? Contact your HR or Admin.
        </p>
        <nav aria-label="Account access"><Link to="/setup">Create Workspace</Link> · <Link to="/login">Sign in</Link></nav>
      </Form>
    </div>
  );
}
