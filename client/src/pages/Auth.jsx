import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api, setToken } from '../api.js';
import { useAuth, useFlow, toast } from '../store.jsx';
import { IcCheck, SrcMark, HelpLink } from '../ui.jsx';
import { usePageMeta } from '../seo.js';
import { SUPPORT_EMAIL, supportMailto } from '../config.js';

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
  usePageMeta({
    title: 'Start Free — Create Your Account',
    description: 'Sign up with GitHub, GitLab, or Bitbucket in one step. Your first verified document is about three minutes away. Free plan, no credit card required.',
    path: '/signup'
  });
  const nav = useNavigate();
  const loc = useLocation();
  const { login } = useAuth();
  // Where the user was headed before the auth wall (e.g. /automation from the
  // landing page). Honored after login, signup, and OAuth alike.
  const dest = (loc.state && loc.state.from) || '';
  const [authMode, setAuthMode] = useState('signup'); // signup | login — one page, both doors
  const [mode, setMode] = useState('oauth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(''); // verification code sent to this address
  const [otp, setOtp] = useState('');
  const [needOtp, setNeedOtp] = useState(false); // login path: account exists but is unverified

  // Entry points: TopBar "Login" arrives as /signup#login; the email
  // verification link arrives as #verified=1|0 (redirected from /login).
  useEffect(() => {
    const raw = window.location.hash.slice(1);
    if (!raw) return;
    const h = new URLSearchParams(raw);
    if (raw === 'login' || h.get('verified') !== null) setAuthMode('login');
    const v = h.get('verified');
    if (v === '1') toast('success', 'Email verified', 'Your account is active — log in below');
    if (v === '0') toast('error', 'Verification link invalid', 'It may have expired — sign up again or resend');
    window.history.replaceState(null, '', '/signup');
  }, []);

  const validEmail = /.+@.+\..+/.test(email);
  const strength =
    (password.length >= 8 ? 1 : 0) +
    (/[A-Z]/.test(password) && /[a-z]/.test(password) ? 1 : 0) +
    (/\d|[^A-Za-z0-9]/.test(password) ? 1 : 0);
  const strengthLabel = password.length === 0 ? '' : strength <= 1 ? 'Weak' : strength === 2 ? 'Good' : 'Strong';
  const canSubmit = validEmail && password.length >= 8 && !busy;
  const providers = useProviders();

  async function oauth(provider) {
    const label = provider.charAt(0).toUpperCase() + provider.slice(1);
    // Real OAuth configured? Hand the browser to the provider's consent screen.
    if (providers[provider]) {
      // Full-page redirect loses router state — stash the destination.
      if (dest) { try { sessionStorage.setItem('authDest', dest); } catch { /* ignore */ } }
      window.location.href = '/api/auth/oauth/' + provider;
      return;
    }
    // Not configured on the server: do NOT fabricate a session. Tell the user
    // honestly instead of silently signing them in as a placeholder account.
    // Real OAuth turns on once GITHUB/GITLAB/BITBUCKET_CLIENT_ID + _SECRET are
    // set in the deployment environment (see docs/OAUTH-SETUP.md).
    toast('error', label + ' sign-in isn’t available yet',
      label + ' OAuth has not been configured on the server. Use email sign-up below, or ask an administrator to connect ' + label + '.');
  }

  async function emailSignup() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const d = await api('/auth/signup', { method: 'POST', body: { email, password } });
      if (d.pendingVerification) {
        // Corporate flow with SMTP configured: verify before first login.
        setSentTo(d.email);
        toast('success', 'Almost there', 'Verification email sent to ' + d.email);
        return;
      }
      login(d.token, d.user);
      toast('success', 'Account created', 'Welcome to Docify');
      nav(dest || '/source');
    } catch (e) { toast('error', 'Signup failed', e.message); }
    finally { setBusy(false); }
  }

  async function resend() {
    try {
      await api('/auth/resend', { method: 'POST', body: { email: sentTo } });
      setOtp('');
      toast('info', 'New code sent', 'Check ' + sentTo + ' (and its spam folder)');
    } catch { toast('error', 'Could not resend', 'Try again in a moment'); }
  }

  async function verifyOtp() {
    if (!/^\d{6}$/.test(otp.trim())) return toast('error', 'Enter the 6-digit code', 'Exactly six digits, from the email we sent');
    setBusy(true);
    try {
      const d = await api('/auth/verify-otp', { method: 'POST', body: { email: sentTo, code: otp.trim() } });
      login(d.token, d.user);
      toast('success', 'Account activated', 'Welcome to Docify');
      nav(dest || '/source');
    } catch (e) { toast('error', 'Verification failed', e.message); }
    finally { setBusy(false); }
  }

  /* ---- Log-in mode ---- */
  async function loginSubmit() {
    setBusy(true);
    try {
      const d = await api('/auth/login', { method: 'POST', body: { email, password } });
      login(d.token, d.user);
      toast('success', 'Logged in', 'Welcome back');
      nav(dest || '/dashboard');
    } catch (e) {
      if (e.message.indexOf('Verify your email') === 0) {
        setNeedOtp(true);
        try { await api('/auth/resend', { method: 'POST', body: { email } }); } catch { /* ignore */ }
        toast('info', 'Verification needed', 'We sent a fresh 6-digit code to ' + email);
      } else {
        toast('error', 'Login failed', e.message);
      }
    }
    finally { setBusy(false); }
  }

  async function loginVerifyOtp() {
    if (!/^\d{6}$/.test(otp.trim())) return toast('error', 'Enter the 6-digit code', 'Exactly six digits, from the email we sent');
    setBusy(true);
    try {
      const d = await api('/auth/verify-otp', { method: 'POST', body: { email, code: otp.trim() } });
      login(d.token, d.user);
      toast('success', 'Verified and logged in', 'Welcome to Docify');
      nav(dest || '/dashboard');
    } catch (e) { toast('error', 'Verification failed', e.message); }
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
        {authMode === 'login' ? (
          <>
            <div className="row row--between" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
              <h2 className="h04">Welcome back</h2>
              <HelpLink topic="login" />
            </div>
            <p className="body01 t2 mt3">Log in to reach your dashboard, documents, and pipelines.</p>
            <div className="mt6">
              <div className="field">
                <label htmlFor="liEmail">Email</label>
                <input id="liEmail" className="input" type="email" placeholder="you@company.com"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loginSubmit()} />
              </div>
              <div className="field">
                <label htmlFor="liPass">Password</label>
                <input id="liPass" className="input" type="password" placeholder="••••••••"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loginSubmit()} />
              </div>
              <button className="btn btn--primary" style={{ width: '100%' }} disabled={busy} onClick={loginSubmit}>
                Log in<span className="ico">→</span>
              </button>
              {needOtp && (
                <div className="tile mt5" style={{ padding: 16 }}>
                  <p className="h01">Enter the verification code</p>
                  <p className="helper mt2">Sent to {email} · expires in 10 minutes</p>
                  <div className="row mt3" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
                    <input className="input mono" inputMode="numeric" maxLength={6} placeholder="000000"
                      style={{ letterSpacing: 6, fontSize: 18, width: 170 }}
                      value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => e.key === 'Enter' && loginVerifyOtp()} aria-label="Verification code" />
                    <button className="btn btn--primary btn--field" disabled={busy} onClick={loginVerifyOtp}>Verify &amp; log in</button>
                  </div>
                  <p className="helper mt3"><button className="linkbtn" onClick={loginSubmit}>Resend code</button></p>
                </div>
              )}
              <div className="divider" style={{ margin: '24px 0' }} />
              <p className="label01 t2 mb3">OR CONTINUE WITH A CODE HOST</p>
              <div className="stack">
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
              </div>
              <p className="helper mt5">Demo account: demo@acme.dev / demo1234 (seeded with history)</p>
            </div>
            <div className="divider" style={{ margin: '32px 0 16px' }} />
            <p className="body01">
              New here? <a onClick={() => { setAuthMode('signup'); setNeedOtp(false); }}>Start free instead</a>
              {' · '}
              <a onClick={() => nav('/')}>Back to home</a>
            </p>
            <p className="helper mt3">
              Trouble signing in? <a onClick={() => nav('/contact')}>Contact support</a> or email{' '}
              <a href={supportMailto('Login help')}>{SUPPORT_EMAIL}</a>.
            </p>
          </>
        ) : (
          <>
        <div className="row row--between" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h2 className="h04">Create your account</h2>
          <HelpLink topic="login" />
        </div>
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
        ) : sentTo ? (
          <div className="mt6 tile" style={{ padding: 24 }}>
            <div className="row"><IcCheck /><p className="h02">Enter your verification code</p></div>
            <p className="body01 t2 mt3">
              We emailed a 6-digit code to <span className="mono">{sentTo}</span>. Enter it below to
              activate your account — the code expires in 10 minutes.
            </p>
            <div className="row mt5" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
              <div className="field" style={{ marginBottom: 0, width: 200 }}>
                <label htmlFor="otpCode">Verification code</label>
                <input id="otpCode" className="input mono" inputMode="numeric" maxLength={6}
                  placeholder="000000" style={{ letterSpacing: 6, fontSize: 18 }}
                  value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && verifyOtp()} />
              </div>
              <button className="btn btn--primary btn--field" disabled={busy} onClick={verifyOtp}>
                Activate account<span className="ico">→</span>
              </button>
            </div>
            <div className="row mt5" style={{ flexWrap: 'wrap' }}>
              <button className="linkbtn" onClick={resend}>Resend code</button>
              <span className="helper">·</span>
              <button className="linkbtn" onClick={() => { setSentTo(''); setOtp(''); }}>Wrong address? Start over</button>
            </div>
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
          Already have an account? <a onClick={() => setAuthMode('login')}>Log in</a>
          {' · '}
          <a onClick={() => nav('/')}>Back to home</a>
        </p>
        <p className="helper mt3">
          Free plan, no credit card required. By creating an account you agree to the{' '}
          <a onClick={() => nav('/legal/terms')}>Terms of Service</a> and{' '}
          <a onClick={() => nav('/legal/privacy')}>Privacy Policy</a>.
        </p>
        <p className="helper mt3">
          Need a hand? <a onClick={() => nav('/contact')}>Contact support</a> or email{' '}
          <a href={supportMailto('Signup help')}>{SUPPORT_EMAIL}</a>.
        </p>
          </>
        )}
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
        let stashed = '';
        try { stashed = sessionStorage.getItem('authDest') || ''; sessionStorage.removeItem('authDest'); } catch { /* ignore */ }
        nav(stashed || '/source');
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

// The standalone /login page is gone — the signup page hosts both modes.
// This redirect keeps old links working, including the email-verification
// links the server sends (/login#verified=1).
export function LoginRedirect() {
  const nav = useNavigate();
  useEffect(() => {
    const hash = window.location.hash && window.location.hash !== '#' ? window.location.hash : '#login';
    nav('/signup' + hash, { replace: true });
  }, [nav]);
  return null;
}
