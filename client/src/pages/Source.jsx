import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getCatalog } from '../api.js';
import { useFlow, useAuth, toast } from '../store.jsx';
import { NavBar, Modal, SrcMark, IcCheck } from '../ui.jsx';

export default function Source() {
  const nav = useNavigate();
  const { flow, setFlow } = useFlow();
  const { user } = useAuth();
  const [catalog, setCatalog] = useState(null);
  const [repos, setRepos] = useState([]);
  const [waitlistFor, setWaitlistFor] = useState(null); // source object
  const [wlEmail, setWlEmail] = useState(user ? user.email : '');
  const [jiraUrl, setJiraUrl] = useState(flow.jiraUrl || '');
  const [jiraToken, setJiraToken] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { getCatalog().then(setCatalog); }, []);
  useEffect(() => {
    if (flow.provider === 'github') api('/repos').then((d) => setRepos(d.repos)).catch(() => {});
  }, [flow.provider]);

  if (!catalog) return <div className="page"><p className="body01 t2">Loading…</p></div>;

  function pick(s) {
    if (!s.avail) {
      if (flow.waitlisted[s.id]) return toast('info', 'Already on the list', 'We will email you when ' + s.name + ' support ships');
      setWaitlistFor(s);
      return;
    }
    setFlow({ provider: s.id, repo: s.id === 'github' ? flow.repo : null });
  }

  async function joinWaitlist() {
    if (!wlEmail.includes('@')) return toast('error', 'Enter a valid email', 'We need an address to notify you');
    try {
      await api('/waitlist', { method: 'POST', body: { email: wlEmail, provider: waitlistFor.id } });
      setFlow((f) => ({ waitlisted: { ...f.waitlisted, [waitlistFor.id]: true } }));
      toast('success', 'Added to waitlist', 'We will email ' + wlEmail + ' at launch');
      setWaitlistFor(null);
    } catch (e) { toast('error', 'Could not join waitlist', e.message); }
  }

  async function connectJira() {
    if (!jiraUrl.trim() || !jiraToken.trim()) return toast('error', 'Missing details', 'Instance URL and API token are both required');
    setBusy(true);
    try {
      await api('/sources', { method: 'POST', body: { provider: 'jira', detail: jiraUrl.trim(), token: jiraToken.trim() } });
      setFlow({ jiraUrl: jiraUrl.trim(), jiraConnected: true });
      toast('success', 'Jira connected', jiraUrl.trim());
    } catch (e) { toast('error', 'Jira connection failed', e.message); }
    finally { setBusy(false); }
  }

  async function next() {
    setBusy(true);
    try {
      if (flow.provider !== 'jira') {
        await api('/sources', {
          method: 'POST',
          body: { provider: flow.provider, detail: flow.provider === 'github' ? flow.repo : '' }
        });
      }
      nav('/doctype');
    } catch (e) { toast('error', 'Could not save source', e.message); }
    finally { setBusy(false); }
  }

  const ready =
    flow.provider === 'gitlab' || flow.provider === 'bitbucket' ||
    (flow.provider === 'github' && !!flow.repo) ||
    (flow.provider === 'jira' && flow.jiraConnected);
  const note = !flow.provider ? 'Select a source to continue'
    : flow.provider === 'github' && !flow.repo ? 'Select a repository to continue'
    : flow.provider === 'jira' && !flow.jiraConnected ? 'Connect Jira to continue' : null;

  return (
    <>
      <div className="page">
        <h1 className="h04">Where does your source of truth live?</h1>
        <p className="body01 t2 mt3">DocGen reads structure, comments, and history from your source to draft documentation. Pick one to start — you can add more later in Settings.</p>

        <div className="grid4 mt7">
          {catalog.sources.map((s) => (
            <div key={s.id}
              className={'tile tile--click' + (flow.provider === s.id ? ' tile--selected' : '') + (s.avail ? '' : ' tile--disabled')}
              onClick={() => pick(s)}>
              <div className="row row--between">
                <SrcMark id={s.id} />
                {!s.avail
                  ? (flow.waitlisted[s.id]
                    ? <span className="tag tag--green">You&apos;re on the list ✓</span>
                    : <span className="tag tag--gray">Coming soon</span>)
                  : (user && user.oauthProvider === s.id ? <span className="tag tag--green">Authorized at signup</span> : null)}
              </div>
              <p className="h01 mt5">{s.name}</p>
              <p className="helper mt2">{s.desc}</p>
            </div>
          ))}
        </div>

        {flow.provider === 'github' && (
          <div className="mt7">
            <h2 className="h02 mb3">Pick a repository</h2>
            <p className="helper mb5">Showing repositories readable by your GitHub authorization.</p>
            <div style={{ border: '1px solid var(--border-subtle)' }}>
              {repos.map((r) => (
                <div key={r.name} className={'radioline' + (flow.repo === r.name ? ' on' : '')}
                  onClick={() => setFlow({ repo: r.name })}>
                  <span className="rdot" />
                  <span className="mono" style={{ fontSize: 13 }}>{r.name}</span>
                  <span className="tag tag--outline">{r.branch}</span>
                  <span className="helper">{r.lang}</span>
                  <span className="helper" style={{ marginLeft: 'auto' }}>updated {r.updated}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {flow.provider === 'jira' && (
          <div className="mt7 tile tile--white" style={{ maxWidth: 560, padding: 24 }}>
            <h2 className="h02">Connect Jira</h2>
            <p className="helper mt2">Jira uses an API token instead of OAuth. Generate one from your Atlassian account settings.</p>
            <div className="field mt5">
              <label htmlFor="jiraUrl">Instance URL</label>
              <input id="jiraUrl" className="input" placeholder="https://yourteam.atlassian.net"
                value={jiraUrl} onChange={(e) => setJiraUrl(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="jiraToken">API token</label>
              <input id="jiraToken" className="input" type="password" placeholder="Paste token"
                value={jiraToken} onChange={(e) => setJiraToken(e.target.value)} />
            </div>
            {flow.jiraConnected
              ? <div className="row"><IcCheck /><span className="body01">Connected to {flow.jiraUrl || 'your instance'}</span></div>
              : <button className="btn btn--tertiary btn--field" disabled={busy} onClick={connectJira}>Connect Jira</button>}
          </div>
        )}
      </div>

      <Modal open={!!waitlistFor} onClose={() => setWaitlistFor(null)}>
        {waitlistFor && (
          <>
            <div className="mhead">
              <div>
                <p className="label01 t2">WAITLIST</p>
                <h2 className="h03 mt2">{waitlistFor.name} support is coming</h2>
              </div>
              <button className="mclose" onClick={() => setWaitlistFor(null)} aria-label="Close">✕</button>
            </div>
            <div className="mbody">
              <p className="body01 t2">We&apos;ll email you the moment {waitlistFor.name} support ships — this also helps us prioritize what to build next.</p>
              <div className="field mt6">
                <label htmlFor="wlEmail">Work email</label>
                <input id="wlEmail" className="input" type="email" placeholder="you@company.com"
                  value={wlEmail} onChange={(e) => setWlEmail(e.target.value)} />
              </div>
            </div>
            <div className="mfoot">
              <button className="btn btn--ghost btn--center" onClick={() => setWaitlistFor(null)}>Cancel</button>
              <button className="btn btn--primary" onClick={joinWaitlist}>Notify me</button>
            </div>
          </>
        )}
      </Modal>

      <NavBar back="/signup" disabled={!ready || busy} note={note} onNext={next} nextLabel="Continue" />
    </>
  );
}
