import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { Layout } from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Setup from './pages/Setup.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Organization from './pages/Organization.jsx';
import Users from './pages/Users.jsx';
import Employees from './pages/Employees.jsx';
import Employee360 from './pages/Employee360.jsx';
import Attendance from './pages/Attendance.jsx';
import Leave from './pages/Leave.jsx';
import Payroll from './pages/Payroll.jsx';
import Payslips from './pages/Payslips.jsx';
import Announcements from './pages/Announcements.jsx';
import Notifications from './pages/Notifications.jsx';
import Audit from './pages/Audit.jsx';
import Assistant from './pages/Assistant.jsx';
import Profile from './pages/Profile.jsx';
import { Banner } from './components/ui.jsx';

function Guard({ roles, children }) {
  const { user, ready, setupRequired } = useAuth();
  if (!ready) return <div className="auth-shell"><div className="auth-card stack"><p className="muted">Loading…</p></div></div>;
  if (setupRequired) return <Navigate to="/setup" replace />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { ready, startupError, startupMessage, initialize, clearSession, sessionVersion } = useAuth();

  if (!ready) {
    return (
      <div className="auth-shell" role="status">
        <div className="auth-card stack" style={{ textAlign: 'center' }}>
          {/* Animated logo */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
            <svg width="44" height="44" viewBox="0 0 36 36" fill="none" aria-hidden="true" className="startup-spin">
              <rect width="36" height="36" rx="10" fill="var(--accent)" />
              <path d="M10 26V14a8 8 0 0 1 16 0v12" stroke="var(--on-accent)" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="18" cy="22" r="3" fill="var(--on-accent)" />
            </svg>
          </div>
          <h1 className="serif" style={{ margin: 0 }}>HCM Lite</h1>
          <p className="muted">{startupMessage}</p>
          <p className="muted small">
            The service may take up to a minute to wake up on first load. Your saved sign-in is preserved.
          </p>
        </div>
      </div>
    );
  }

  if (startupError) {
    return (
      <div className="auth-shell">
        <div className="auth-card stack" style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
            <svg width="44" height="44" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <rect width="36" height="36" rx="10" fill="var(--danger)" />
              <path d="M18 10v10M18 24v2" stroke="var(--on-accent)" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="serif" style={{ margin: 0 }}>Cannot connect</h1>
          <Banner error={startupError} />
          {startupError.url && (
            <details>
              <summary className="muted small" style={{ cursor: 'pointer' }}>Connection details</summary>
              <p className="small muted" style={{ overflowWrap: 'anywhere', textAlign: 'left', marginTop: 8 }}>
                App: {window.location.origin}<br />
                Service: {startupError.url}<br />
                {startupError.kind === 'timeout'
                  ? 'The service did not respond within 75 seconds.'
                  : "The service may be blocking this app's origin in its CORS settings."}
              </p>
            </details>
          )}
          <button className="btn btn-full" onClick={initialize}>Try again</button>
          <button
            className="btn ghost"
            onClick={() => { clearSession(); void initialize(); }}
          >
            Sign out and retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <Routes key={sessionVersion}>
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/change-password" element={<ChangePassword />} />
      <Route
        element={
          <Guard>
            <Layout />
          </Guard>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route
          path="/organization"
          element={
            <Guard roles={['Admin', 'HR']}>
              <Organization />
            </Guard>
          }
        />
        <Route
          path="/users"
          element={
            <Guard roles={['Admin']}>
              <Users />
            </Guard>
          }
        />
        <Route path="/employees" element={<Employees />} />
        <Route path="/employees/:id" element={<Employee360 />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/leave" element={<Leave />} />
        <Route
          path="/payroll"
          element={
            <Guard roles={['Admin', 'HR']}>
              <Payroll />
            </Guard>
          }
        />
        <Route path="/payslips" element={<Payslips />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route
          path="/audit"
          element={
            <Guard roles={['Admin']}>
              <Audit />
            </Guard>
          }
        />
        <Route path="/assistant" element={<Assistant />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
