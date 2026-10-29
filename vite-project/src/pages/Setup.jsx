import { Form } from '../components/Form.jsx';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { passwordError } from '../lib/password.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Banner, Field } from '../components/ui.jsx';

export default function Setup() {
  const { setSetupRequired, setupRequired, workspaceCreationAvailable, clearSession } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (setupRequired === false && !workspaceCreationAvailable) return <div className="auth-shell"><div className="auth-card stack"><h1>Create Workspace</h1><p>This service already has a company. Creating a separate workspace requires deploying the workspace backend update and migrating the existing records first.</p><p>Existing accounts can sign in with their email and password.</p><nav aria-label="Account access"><Link to="/setup">Create Workspace</Link> · <Link to="/login">Sign in</Link></nav></div></div>;

  return (
    <div className="auth-shell">
      <Form
        className="auth-card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const invalid = passwordError(password);
            if (invalid) throw new Error(invalid);
            if (password !== confirmation)
              throw new Error('Passwords do not match. Please enter the same password in both fields.');
            const created = await api(workspaceCreationAvailable ? '/workspaces' : '/setup', {
              method: 'POST',
              body: {
                companyName: companyName.trim(),
                email: email.trim().toLowerCase(),
                password,
                ...(workspaceCreationAvailable ? { workspaceSlug: workspaceSlug.trim().toLowerCase() } : {}),
              },
              token: null,
            });
            setSetupRequired(false);
            clearSession();
            setPassword('');
            setConfirmation('');
            navigate('/login', {
              replace: true,
              state: {
                email: email.trim().toLowerCase(),
                workspaceSlug: created.workspace?.slug,
                message: 'Your company is ready. Sign in with your Admin account.',
              },
            });
          } catch (err) {
            if (err.status === 409 && !workspaceCreationAvailable) {
              setSetupRequired(false);
              navigate('/login', { replace: true, state: { message: 'A company already exists. Sign in with its Admin account.' } });
              return;
            }
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        {/* Logo / Brand */}
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <div className="auth-logo">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <rect width="36" height="36" rx="10" fill="var(--accent)" />
              <path d="M10 26V14a8 8 0 0 1 16 0v12" stroke="var(--on-accent)" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="18" cy="22" r="3" fill="var(--on-accent)" />
            </svg>
          </div>
          <div className="brand-kicker" style={{ marginTop: 10 }}>First-time setup</div>
          <h1 className="serif" style={{ margin: '4px 0 0' }}>
            Create Workspace
          </h1>
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
            Create your company and its first Admin account.
          </p>
        </div>

        <div className="auth-divider" />

        <Banner error={error} />
        {workspaceCreationAvailable && <Field label="Workspace address" name="workspaceSlug"><input value={workspaceSlug} onChange={e => setWorkspaceSlug(e.target.value)} required placeholder="acme-team" /></Field>}

        <Field label="Company name">
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Acme Corporation"
            required
            maxLength={200}
            autoFocus
          />
        </Field>

        <Field label="Admin email" name="email">
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@company.com"
            required
          />
        </Field>

        <Field label="Admin password" name="password">
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={12}
            required
          />
        </Field>
        <p className="muted small" style={{ marginTop: -6 }}>
          Minimum 12 characters, maximum 72 bytes.
        </p>

        <Field label="Confirm password" name="confirmation">
          <input
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            required
          />
        </Field>

        <button className="btn btn-full" disabled={busy} type="submit">
          {busy ? 'Setting up…' : 'Create workspace'}
        </button>
        <nav aria-label="Account access"><Link to="/setup">Create Workspace</Link> · <Link to="/login">Sign in</Link></nav>
      </Form>
    </div>
  );
}
