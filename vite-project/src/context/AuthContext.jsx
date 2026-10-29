import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, getToken, setToken } from '../api/client.js';
import { setCompanyTimezone } from '../lib/format.js';

const AuthContext = createContext(null);
const ROLES = ['Admin', 'HR', 'Employee'];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [setupRequired, setSetupRequired] = useState(null);
  const [workspaceCreationAvailable, setWorkspaceCreationAvailable] = useState(false);
  const [startupError, setStartupError] = useState(null);
  const [startupMessage, setStartupMessage] = useState('Checking system status…');
  const [sessionVersion, setSessionVersion] = useState(0);
  const generation = useRef(0);

  const clearSession = useCallback(() => {
    generation.current += 1;
    setToken(null);
    setCompanyTimezone(null);
    setUser(null);
    setSessionVersion((v) => v + 1);
  }, []);

  const refreshSetup = useCallback(async () => {
    const status = await api('/setup-status', {
      token: null,
      onRetry: (attempt) =>
        setStartupMessage(`Connection check timed out. Retrying (${attempt}/2)…`),
    });
    if (typeof status?.initializationRequired !== 'boolean')
      throw new Error('Unable to verify system status. Please retry.');
    setSetupRequired(status.initializationRequired);
    setWorkspaceCreationAvailable(status.workspaceCreationAvailable === true);
    return status.initializationRequired;
  }, []);

  const refreshMe = useCallback(async () => {
    const token = getToken();
    const version = generation.current;
    if (!token) return null;
    const me = await api('/auth/me', { token });
    if (!ROLES.includes(me?.role))
      throw new Error('Your account has an unsupported role. Contact your administrator.');
    if (version === generation.current && token === getToken()) {
      setCompanyTimezone(me.workspace?.timezone || me.timezone);
      setUser(me);
    }
    return me;
  }, []);

  const initialize = useCallback(async () => {
    setReady(false);
    setStartupError(null);
    setStartupMessage('Checking system status…');
    try {
      const [status, session] = await Promise.allSettled([
        refreshSetup(),
        getToken() ? refreshMe() : Promise.resolve(null),
      ]);
      if (session.status === 'rejected' && session.reason.status === 401) clearSession();
      if (status.status === 'rejected') throw status.reason;
      if (session.status === 'rejected' && session.reason.status !== 401) throw session.reason;
    } catch (err) {
      if (err.status === 401) clearSession();
      else setStartupError(err);
    } finally {
      setReady(true);
    }
  }, [clearSession, refreshMe, refreshSetup]);

  useEffect(() => {
    const onUnauthorized = () => clearSession();
    const onForbidden = () => { refreshMe().catch(() => {}); };
    const onStorage = (event) => {
      if (event.key === 'hcm_token' || event.key === null) {
        generation.current += 1;
        setUser(null);
        setSessionVersion((v) => v + 1);
        void initialize();
      }
    };
    window.addEventListener('hcm:unauthorized', onUnauthorized);
    window.addEventListener('hcm:forbidden', onForbidden);
    window.addEventListener('storage', onStorage);
    let active = true;
    Promise.resolve().then(() => { if (active) void initialize(); });
    return () => {
      active = false;
      window.removeEventListener('hcm:unauthorized', onUnauthorized);
      window.removeEventListener('hcm:forbidden', onForbidden);
      window.removeEventListener('storage', onStorage);
    };
  }, [clearSession, initialize, refreshMe]);

  const login = async (email, password, workspaceSlug) => {
    const data = await api('/auth/login', {
      method: 'POST',
      body: { email, password, ...(workspaceCreationAvailable && workspaceSlug ? { workspaceSlug } : {}) },
      token: null,
    });
    if (!data?.token || !ROLES.includes(data.user?.role))
      throw new Error('Unable to sign in. Please contact your administrator.');
    clearSession();
    setToken(data.token);
    setCompanyTimezone(data.user?.workspace?.timezone || data.user?.timezone);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    const token = getToken();
    clearSession();
    if (token) {
      try {
        await api('/auth/logout', { method: 'POST', body: {}, token, timeoutMs: 5000 });
      } catch { /* local logout already done */ }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        ready,
        setupRequired,
        workspaceCreationAvailable,
        setSetupRequired,
        startupError,
        startupMessage,
        initialize,
        login,
        logout,
        clearSession,
        refreshMe,
        sessionVersion,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
