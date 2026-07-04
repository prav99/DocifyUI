import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, getToken } from './api.js';

/* ---------------- Toasts (module-level pub/sub) ---------------- */
let pushToast = null;
export function toast(kind, title, sub) {
  if (pushToast) pushToast({ kind, title, sub, id: Math.random().toString(36).slice(2) });
}
export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    pushToast = (t) => {
      setItems((xs) => [...xs, t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 5000);
    };
    return () => { pushToast = null; };
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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    if (getToken()) {
      api('/auth/me')
        .then((d) => { if (alive) setUser(d.user); })
        .catch(() => setToken(null))
        .finally(() => { if (alive) setReady(true); });
    } else {
      setReady(true);
    }
    return () => { alive = false; };
  }, []);

  const login = useCallback((token, u) => { setToken(token); setUser(u); }, []);
  const logout = useCallback(() => { setToken(null); setUser(null); }, []);
  const refresh = useCallback(() => api('/auth/me').then((d) => setUser(d.user)).catch(() => {}), []);

  return <AuthCtx.Provider value={{ user, ready, login, logout, refresh }}>{children}</AuthCtx.Provider>;
}

/* ---------------- Generation flow state (persists across refresh) ---------------- */
const FLOW_KEY = 'docgen_flow';
const defaultFlow = {
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

const FlowCtx = createContext(null);
export function useFlow() { return useContext(FlowCtx); }

export function FlowProvider({ children }) {
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

  return <FlowCtx.Provider value={{ flow, setFlow }}>{children}</FlowCtx.Provider>;
}
