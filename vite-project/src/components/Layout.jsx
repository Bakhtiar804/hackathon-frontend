import { useEffect, useState, useSyncExternalStore } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, hasPendingWrites, subscribeWrites } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
const mobileMedia = window.matchMedia('(max-width: 900px)');
const subscribeMobile = (listener) => { mobileMedia.addEventListener('change', listener); return () => mobileMedia.removeEventListener('change', listener); };

const NAV = {
  Admin: [
    ['/', 'Dashboard'],
    ['/organization', 'Organization'],
    ['/users', 'Users'],
    ['/employees', 'Employees'],
    ['/attendance', 'Attendance'],
    ['/leave', 'Leave'],
    ['/payroll', 'Payroll'],
    ['/payslips', 'Payslips'],
    ['/announcements', 'Announcements'],
    ['/audit', 'Audit log'],
    ['/assistant', 'AI assistant'],
  ],
  HR: [
    ['/', 'Dashboard'],
    ['/organization', 'Organization'],
    ['/employees', 'Employees'],
    ['/attendance', 'Attendance'],
    ['/leave', 'Leave'],
    ['/payroll', 'Payroll'],
    ['/payslips', 'Payslips'],
    ['/announcements', 'Announcements'],
    ['/assistant', 'AI assistant'],
  ],
  Employee: [
    ['/', 'Dashboard'],
    ['/attendance', 'Attendance'],
    ['/leave', 'Leave'],
    ['/payslips', 'Payslips'],
    ['/announcements', 'Announcements'],
    ['/assistant', 'AI assistant'],
  ],
};

export function Layout() {
  const { user, logout, refreshMe } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const compact = useSyncExternalStore(subscribeMobile, () => mobileMedia.matches);
  const [unread, setUnread] = useState(0);
  const saving = useSyncExternalStore(subscribeWrites, hasPendingWrites);
  const links = [...(NAV[user?.role] || [])];
  const section = location.pathname === '/profile' ? 'My profile' : location.pathname.startsWith('/employees/') ? 'Employee 360' : links.find(([path]) => path === location.pathname)?.[1] || 'Workspace';
  const timezone = user.workspace?.timezone || user.timezone || 'Asia/Karachi';
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date());


  useEffect(() => {
    let cancelled = false;
    const updateUnread = async () => {
      try {
        const data = await api('/notifications', { query: { page: 1, limit: 20 } });
        if (!cancelled) setUnread((data.items || []).filter((n) => !n.readAt).length);
      } catch {
        if (!cancelled) setUnread(0);
      }
    };
    void updateUnread();
    window.addEventListener('hcm:notifications', updateUnread);
    return () => {
      cancelled = true;
      window.removeEventListener('hcm:notifications', updateUnread);
    };
  }, []);

  useEffect(() => {
    const refresh = () => { refreshMe().catch(() => {}); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refreshMe]);

  const toggleTheme = () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('hcm_theme', next);
  };

  return (
    <div className="app">
      {compact && open && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
      <aside id="workspace-navigation" inert={compact && !open} className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-kicker">HCM Lite</span>
          <strong className="serif">{user.workspace?.name || 'People ops'}</strong>
          {user.workspace?.slug && <span className="muted small">{user.workspace.slug}</span>}
        </div>
        <nav className="nav" onClick={() => setOpen(false)}>
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot"><NavLink to="/profile" aria-label="Profile" className="account-link" onClick={() => setOpen(false)}><span className="header-avatar" aria-hidden="true">{(user.displayName || user.email)?.[0]?.toUpperCase()}</span><span><strong>Profile</strong><span className="muted small">Your account settings</span></span><span aria-hidden="true">↗</span></NavLink>
          <div className="muted small">
            {user?.email}
            <br />
            {user?.role}
          </div>
          <button className="btn secondary" type="button" onClick={toggleTheme}>
            Toggle theme
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={async () => {
              const pendingLogout = logout();
              navigate('/login', { state: { workspaceSlug: user.workspace?.slug } });
              await pendingLogout;
            }}
          >
            Log out
          </button>
        </div>
      </aside>
      <div>
        <header className="topbar workspace-header">
          <button className="btn secondary menu-toggle" aria-expanded={open} aria-controls="workspace-navigation" type="button" onClick={() => setOpen((v) => !v)}>
            Menu
          </button>
          <div className="header-copy"><span className="brand-kicker">{user.workspace?.name || 'HCM Lite workspace'}</span><strong>{section}</strong><span className="muted small">Welcome back · {user.role} portal</span></div>
          <div className="header-actions"><time className="header-date">{date}</time><NavLink className="btn secondary" to="/assistant" aria-label="Open AI assistant"><span aria-hidden="true">✦</span> Ask AI</NavLink><NavLink to="/notifications" className="header-notifications" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg><span>Notifications</span>{unread > 0 && <b className="notification-count">{unread}</b>}</NavLink><NavLink to="/profile" className="header-avatar" title="My profile" aria-label="Open my profile">{(user.displayName || user.email)?.[0]?.toUpperCase() || 'U'}</NavLink></div>
        </header>
        <main className="main">
          {saving && <div className="banner saving" role="status">Working on your request… Please wait.</div>}
          <fieldset className="page-fields" disabled={saving} aria-busy={saving}><Outlet /></fieldset>
        </main>
      </div>
    </div>
  );
}
