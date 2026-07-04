import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, toast } from '../store.jsx';
import { NavBar } from '../ui.jsx';

export function Signup() {
  const nav = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function oauth(provider) {
    setBusy(true);
    try {
      const d = await api('/auth/signup', { method: 'POST', body: { provider } });
      login(d.token, d.user);
      toast('success', 'Account created', provider.charAt(0).toUpperCase() + provider.slice(1) + ' connected as a source');
      nav('/source');
    } catch (e) { toast('error', 'Signup failed', e.message); }
    finally { setBusy(false); }
  }

  async function emailSignup() {
    if (!email.includes('@')) return toast('error', 'Enter a valid email', 'A work email is required to create an account');
    if (password.length < 8) return toast('error', 'Password too short', 'Use at least 8 characters');
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
    <>
      <div className="page">
        <h1 className="h04">Create your account</h1>
        <p className="body01 t2 mt3" style={{ maxWidth: 620 }}>
          Using GitHub, GitLab, or Bitbucket to sign in also authorizes that source — one step instead of two.
        </p>
        <div className="grid2 mt7" style={{ alignItems: 'start' }}>
          <div className="tile tile--white" style={{ padding: 24 }}>
            <div className="row row--between">
              <h2 className="h02">Continue with your code host</h2>
              <span className="tag tag--blue">Fastest — connects your source too</span>
            </div>
            <div className="stack mt6">
              <button className="btn btn--secondary btn--center" style={{ width: '100%' }} disabled={busy} onClick={() => oauth('github')}>Continue with GitHub</button>
              <button className="btn btn--secondary btn--center" style={{ width: '100%' }} disabled={busy} onClick={() => oauth('gitlab')}>Continue with GitLab</button>
              <button className="btn btn--secondary btn--center" style={{ width: '100%' }} disabled={busy} onClick={() => oauth('bitbucket')}>Continue with Bitbucket</button>
            </div>
            <p className="helper mt6">We only request read access to repository contents and commit history. We never store your source code.</p>
          </div>

          <div className="tile tile--white" style={{ padding: 24 }}>
            <div className="row row--between">
              <h2 className="h02">Sign up with email</h2>
              <span className="tag tag--gray">Confluence, Notion, Azure DevOps</span>
            </div>
            <p className="body01 t2 mt3">If your source is not in the OAuth row, start here — you can connect any source afterward.</p>
            <div className="field mt6">
              <label htmlFor="suEmail">Work email</label>
              <input id="suEmail" className="input" type="email" placeholder="you@company.com"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="suPass">Password (8+ characters)</label>
              <input id="suPass" className="input" type="password" placeholder="••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn btn--primary" style={{ width: '100%' }} disabled={busy} onClick={emailSignup}>
              Create account with email<span className="ico">→</span>
            </button>
            <p className="helper mt5">Free plan, no credit card.</p>
          </div>
        </div>
        <p className="body01 mt6">Already have an account? <a onClick={() => nav('/login')}>Log in</a></p>
      </div>
      <NavBar back="/" />
    </>
  );
}

export function Login() {
  const nav = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(provider) {
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
