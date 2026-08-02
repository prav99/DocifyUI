import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { api, setToken, getToken, onSessionExpired, TOKEN_KEY } from './api.js';

/* ---------------- Toasts (module-level pub/sub) ---------------- */
let pushToast = null;
export function toast(kind, title, sub) {
  if (pushToast) pushToast({ kind, title, sub, id: Math.random().toString(36).slice(2) });
}
export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const timers = new Set();
    const push = (t) => {
      setItems((xs) => [...xs, t]);
      const id = setTimeout(() => {
        timers.delete(id);
        setItems((xs) => xs.filter((x) => x.id !== t.id));
      }, 5000);
      timers.add(id);
    };
    pushToast = push;
    return () => {
      timers.forEach(clearTimeout);
      if (pushToast === push) pushToast = null;
    };
  }, []);
  return (
    <div id="toasts">
      {items.map((t) => (
        <div key={t.id} className={'toast toast--' + t.kind}>
          <div>
            <div className="ttitle">{t.title}</div>
            {t.sub ? <div className="tsub">{t.sub}</div> : null}
          </div>
          <button className="tclose" aria-label="Close"
            onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}>✕</button>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Auth ---------------- */
const AuthCtx = createContext(null);
export function useAuth() { return useContext(AuthCtx); }

// One /auth/me probe per page load, however many times the provider mounts.
let bootProbe = null;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    if (getToken()) {
      // A signed-out visitor holding a stale token legitimately 401s here, so
      // this probe opts out of the session-expiry redirect: clearing the token
      // is enough, and the route guard handles anyone on a protected page.
      const probe = bootProbe || (bootProbe = api('/auth/me', { ignore401: true }));
      probe
        .then((d) => { if (alive) setUser(d.user); })
        .catch(() => setToken(null))
        .finally(() => { bootProbe = null; if (alive) setReady(true); });
    } else {
      setReady(true);
    }
    return () => { alive = false; };
  }, []);

  // The server rejected our token mid-workflow. Drop the user here and the
  // route guard sends them to sign-in with the page they were on. The wizard
  // keeps its owner stamp, so signing back in as the same account resumes it
  // and signing in as another wipes it.
  useEffect(() => onSessionExpired(() => {
    setUser(null);
    toast('info', 'Session expired', 'Sign in again to pick up where you left off');
  }), []);

  // The token lives in localStorage, which every tab shares. When another tab
  // signs in or out, this tab must follow it instead of carrying on as the
  // previous account.
  useEffect(() => {
    const sync = (e) => {
      if (e.storageArea && e.storageArea !== window.localStorage) return;
      // A null key means the whole store was cleared.
      if (e.key !== null && e.key !== TOKEN_KEY) return;
      const next = (e.key === null ? null : e.newValue) || null;
      if (next === getToken()) return;
      setToken(next);
      if (!next) { setUser(null); return; }
      api('/auth/me', { ignore401: true })
        .then((d) => setUser(d.user))
        .catch(() => { setToken(null); setUser(null); });
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const login = useCallback((token, u) => { setToken(token); setUser(u); }, []);
  const logout = useCallback(() => {
    // The wizard is per-tab state built under the account being signed out —
    // clear the stored copy and the live one together, or the next person to
    // sign in on this tab inherits it.
    clearFlowStorage();
    if (resetFlow) resetFlow();
    setToken(null);
    setUser(null);
  }, []);
  const refresh = useCallback(() => api('/auth/me').then((d) => setUser(d.user)).catch(() => {}), []);

  const value = useMemo(() => ({ user, ready, login, logout, refresh }), [user, ready, login, logout, refresh]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/* ---------------- Generation flow state (persists across refresh) ---------------- */
const FLOW_KEY = 'docgen_flow';
const defaultFlow = {
  owner: '',
  provider: null, repo: null,
  sources: [], srcCfg: {},
  jiraUrl: '', jiraConnected: false,
  waitlisted: {},
  track: 'technical', docTypes: [],
  briefAudience: '', briefEmphasis: '', briefTone: 'Plain & direct',
  instructions: '', files: [],
  skillName: '', skillContent: '',
  outputCfg: {},
  format: 'dita',
  genId: null,
  billing: 'annual', plan: 'team'
};

function clearFlowStorage() {
  try { sessionStorage.removeItem(FLOW_KEY); } catch { /* ignore */ }
}

// Set by FlowProvider so logout can drop the live wizard state too.
let resetFlow = null;

const FlowCtx = createContext(null);
export function useFlow() { return useContext(FlowCtx); }

export function FlowProvider({ children }) {
  const { user, ready } = useAuth();
  const [flow, setFlowState] = useState(() => {
    try {
      const raw = sessionStorage.getItem(FLOW_KEY);
      return raw ? { ...defaultFlow, ...JSON.parse(raw) } : defaultFlow;
    } catch { return defaultFlow; }
  });

  const setFlow = useCallback((patch) => {
    setFlowState((f) => {
      const next = { ...f, ...(typeof patch === 'function' ? patch(f) : patch) };
      try { sessionStorage.setItem(FLOW_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => {
    resetFlow = () => setFlowState(defaultFlow);
    return () => { resetFlow = null; };
  }, []);

  // The flow is per-tab (sessionStorage) while the token is shared by every tab
  // (localStorage), so a tab can end up signed in as someone else than the
  // account the flow was built under. Stamping the owner is the only way to
  // tell — work started signed out (a plan picked on /pricing) is adopted by
  // whoever signs in, but one account's wizard never carries into another's.
  useEffect(() => {
    if (!ready || !user) return;
    const uid = String(user.id);
    setFlowState((f) => {
      if ((f.owner || '') === uid) return f;
      const next = f.owner ? { ...defaultFlow, owner: uid } : { ...f, owner: uid };
      try { sessionStorage.setItem(FLOW_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [ready, user]);

  const value = useMemo(() => ({ flow, setFlow }), [flow, setFlow]);
  return <FlowCtx.Provider value={value}>{children}</FlowCtx.Provider>;
}
