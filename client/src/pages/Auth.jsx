import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';
import { useAuth, useFlow, toast } from '../store.jsx';
import { IcCheck, SrcMark } from '../ui.jsx';

// Detect which providers have REAL OAuth configured on the server.
function useProviders() {
  const [prov, setProv] = useState({ github: false });
  useEffect(() => {
    api('/auth/providers').then(setProv).catch(() => {});
  }, []);
  return prov;
}

const PROVIDERS = [
  { id: 'github', mark: 'GH', name: 'Continue with GitHub', sub: 'Most teams start here' },
  { id: 'gitlab', mark: 'GL', name: 'Continue with GitLab', sub: 'Cloud or self-managed' },
  { id: 'bitbucket', mark: 'BB', name: 'Continue with Bitbucket', sub: 'Atlassian workspaces' }
];

const VALUE_POINTS = [
  'One authorization — sign-in and source access in a single step',
  'Read-only scope: repository contents and commit history, nothing more',
  'Your source code is never stored'
];

export function Signup() {
  const nav = useNavigate();
  const { login } = useAuth();
  const { setFlow } = useFlow();
  const [mode, setMode] = useState('oauth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const validEmail = /.+@.+\..+/.test(email);
  const strength =
    (password.length >= 8 ? 1 : 0) +
    (/[A-Z]/.test(password) && /[a-z]/.test(password) ? 1 : 0) +
    (/\d|[^A-Za-z0-9]/.test(password) ? 1 : 0);
  const strengthLabel = password.length === 0 ? '' : strength <= 1 ? 'Weak' : strength === 2 ? 'Good' : 'Strong';
  const canSubmit = validEmail && password.length >= 8 && !busy;
  const providers = useProviders();

  async function oauth(provider) {
    // Real OAuth configured? Hand the browser to the provider's consent screen.
    if (providers[provider]) {
      window.location.href = '/api/auth/oauth/' + provider;
      return;
    }
    setBusy(true);
    try {
      const d = await api('/auth/signup', { method: 'POST', body: { provider } });
      login(d.token, d.user);
      // Carry the clicked provider straight into the source page, pre-selected.
      setFlow((f) => ({
        autoSrc: true,
        sources: (f.sources || []).includes(provider) ? f.sources : [...(f.sources || []), provider]
      }));
      toast('success', 'Account created', provider.charAt(0).toUpperCase() + provider.slice(1) + ' connected as a source');
      nav('/source');
    } catch (e) { toast('error', 'Signup failed', e.message); }
    finally { setBusy(false); }
  }

  async function emailSignup() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const d = await api('/auth/signup', { method: 'POST', body: { email, password } });
      login(d.token, d.user);
      toast('success', 'Account created', 'Welcome to DocGen');
      nav('/source');
    } catch (e) { toast('error', 'Signup failed', e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="authsplit">
      <aside className="authleft">
        <div className="gridlines" />
        <div style={{ position: 'relative' }}>
          <p className="eyebrow mb3">START FREE</p>
          <h1 className="h03" style={{ color: '#fff', maxWidth: 380 }}>
            Your first verified document is about three minutes away.
          </h1>
          <div className="stack mt7" style={{ maxWidth: 400 }}>
            {VALUE_POINTS.map((v) => (
              <div key={v} className="row" style={{ alignItems: 'flex-start' }}>
                <span style={{ marginTop: 2 }}><IcCheck c="#42be65" /></span>
                <span className="body01 t2">{v}</span>
              </div>
            ))}
          </div>
          <div className="termlog mt7" style={{ maxWidth: 400 }}>
            <div style={{ animationDelay: '.2s' }}>$ docgen generate --repo acme/payments-api</div>
            <div style={{ animationDelay: '.9s' }}><span className="okmark">✓</span> parsed 214 files</div>
            <div style={{ animationDelay: '1.6s' }}><span className="okmark">✓</span> drafted 6 sections</div>
            <div style={{ animationDelay: '2.3s' }}><span className="okmark">✓</span> quality gate passed — 96/100</div>
            <div style={{ animationDelay: '3s' }}>→ api-reference.dita ready</div>
          </div>
        </div>
      </aside>

      <section className="authright">
        <h2 className="h04">Create your account</h2>
        <p className="body01 t2 mt3">
          Signing in with a code host also authorizes that source — one step instead of two.
        </p>

        <div className="seg mt6" role="tablist">
          <button role="tab" className={mode === 'oauth' ? 'on' : ''} onClick={() => setMode('oauth')}>
            With a code host
          </button>
          <button role="tab" className={mode === 'email' ? 'on' : ''} onClick={() => setMode('email')}>
            With email
          </button>
        </div>

        {mode === 'oauth' ? (
          <div className="stack mt6">
            {PROVIDERS.map((p) => (
              <button key={p.id} className="provbtn" disabled={busy} onClick={() => oauth(p.id)}>
                <SrcMark id={p.id} />
                <span>
                  <span className="h01" style={{ display: 'block' }}>{p.name}</span>
                  <span className="helper">{p.sub}</span>
                </span>
                <span className="parrow">→</span>
              </button>
            ))}
            <p className="helper">
              We only request read access to repository contents and commit history. We never store your source code.
            </p>
          </div>
        ) : (
          <div className="mt6">
            <div className="field">
              <label htmlFor="suEmail">Work email</label>
              <div className="fieldwrap">
                <input id="suEmail" className="input" type="email" placeholder="you@company.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} />
                {validEmail && <span className="vico"><IcCheck /></span>}
              </div>
            </div>
            <div className="field">
              <label htmlFor="suPass">Password (8+ characters)</label>
              <div className="fieldwrap">
                <input id="suPass" className="input" type="password" placeholder="••••••••"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && emailSignup()} />
                {password.length >= 8 && <span className="vico"><IcCheck /></span>}
              </div>
              <div className="strength" aria-hidden="true">
                <span className={strength >= 1 ? 's' + strength : ''} />
                <span className={strength >= 2 ? 's' + strength : ''} />
                <span className={strength >= 3 ? 's' + strength : ''} />
              </div>
              {strengthLabel && <p className="helper mt2">Password strength: {strengthLabel}</p>}
            </div>
            <button className="btn btn--primary" style={{ width: '100%' }} disabled={!canSubmit} onClick={emailSignup}>
              Create account with email<span className="ico">→</span>
            </button>
            <p className="helper mt5">
              On Confluence, Notion, or Azure DevOps? Start here — you can connect any source afterward.
            </p>
          </div>
        )}

        <div className="divider" style={{ margin: '32px 0 16px' }} />
        <p className="body01">
          Already have an account? <a onClick={() => nav('/login')}>Log in</a>
          {' · '}
          <a onClick={() => nav('/')}>Back to home</a>
        </p>
        <p className="helper mt3">Free plan, no credit card required.</p>
      </section>
    </div>
  );
}

// Landing pad after the provider redirects back: token arrives in the URL hash.
export function OAuthComplete() {
  const nav = useNavigate();
  const { login } = useAuth();
  const { setFlow } = useFlow();
  const [err, setErr] = useState('');
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const token = h.get('token');
    const error = h.get('error');
    const prov = h.get('provider') || 'github';
    const provName = prov.charAt(0).toUpperCase() + prov.slice(1);
    window.history.replaceState(null, '', '/oauth/complete'); // don't leave the token in history
    if (error) { setErr(error); return; }
    if (!token) { nav('/signup'); return; }
    setToken(token);
    api('/auth/me')
      .then((d) => {
        login(token, d.user);
        setFlow((f) => ({
          autoSrc: true,
          sources: (f.sources || []).includes(prov) ? f.sources : [...(f.sources || []), prov]
        }));
        toast('success', provName + ' connected', 'Authorized as a read-only source');
        nav('/source');
      })
      .catch(() => setErr('Could not complete sign-in — please try again.'));
  }, [nav, login]);
  return (
    <div className="page page--narrow">
      {err ? (
        <>
          <h1 className="h04">Sign-in didn&apos;t complete</h1>
          <p className="body01 t2 mt3">{err}</p>
          <p className="body01 mt5"><a onClick={() => nav('/signup')}>← Back to signup</a></p>
        </>
      ) : (
        <p className="body01 t2">Completing sign-in…</p>
      )}
    </div>
  );
}

export function Login() {
  const nav = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const providers = useProviders();

  async function submit(provider) {
    if (provider === 'github' && providers.github) {
      window.location.href = '/api/auth/oauth/github';
      return;
    }
    setBusy(true);
    try {
      const body = provider ? { provider } : { email, password };
      const d = await api('/auth/login', { method: 'POST', body });
      login(d.token, d.user);
      toast('success', 'Logged in', 'Welcome back');
      nav('/dashboard');
    } catch (e) { toast('error', 'Login failed', e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="page page--narrow">
      <h1 className="h04">Log in</h1>
      <p className="body01 t2 mt3">Welcome back. Log in to reach your dashboard.</p>
      <div className="tile tile--white mt7" style={{ padding: 24 }}>
        <div className="field">
          <label htmlFor="liEmail">Email</label>
          <input id="liEmail" className="input" type="email" placeholder="demo@acme.dev"
            value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        <div className="field">
          <label htmlFor="liPass">Password</label>
          <input id="liPass" className="input" type="password" placeholder="demo1234"
            value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        <button className="btn btn--primary" style={{ width: '100%' }} disabled={busy} onClick={() => submit()}>
          Log in<span className="ico">→</span>
        </button>
        <div className="divider" style={{ margin: '24px 0' }} />
        <button className="btn btn--secondary btn--center" style={{ width: '100%' }} disabled={busy} onClick={() => submit('github')}>
          Continue with GitHub
        </button>
      </div>
      <p className="helper mt5">Demo account: demo@acme.dev / demo1234 (seeded with history)</p>
      <p className="body01 mt6">New here? <a onClick={() => nav('/signup')}>Start free instead</a></p>
      <p className="body01 mt3"><a onClick={() => nav('/')}>← Back to home</a></p>
    </div>
  );
}
