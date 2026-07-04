import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getCatalog } from '../api.js';
import { useFlow, useAuth, toast } from '../store.jsx';
import { NavBar, Modal, SrcMark, IcCheck } from '../ui.jsx';

// How each source gets configured.
const KIND = {
  github: 'picker', gitlab: 'picker', bitbucket: 'picker',
  openapi: 'url', jira: 'tokenurl', confluence: 'tokenurl', notion: 'token'
};
const PICKER_LABEL = { github: 'Repository', gitlab: 'Project', bitbucket: 'Repository' };

export default function Source() {
  const nav = useNavigate();
  const { flow, setFlow } = useFlow();
  const { user } = useAuth();
  const [catalog, setCatalog] = useState(null);
  const [lists, setLists] = useState({}); // provider -> repo/project list
  const [waitlistFor, setWaitlistFor] = useState(null);
  const [wlEmail, setWlEmail] = useState(user ? user.email : '');
  const [busy, setBusy] = useState(false);

  const sources = flow.sources || [];
  const cfg = flow.srcCfg || {};

  useEffect(() => { getCatalog().then(setCatalog); }, []);

  // Lazily load pick-lists for every selected code source.
  useEffect(() => {
    sources
      .filter((p) => KIND[p] === 'picker' && lists[p] === undefined)
      .forEach((p) => {
        setLists((l) => ({ ...l, [p]: null })); // mark loading
        api('/repos?provider=' + p)
          .then((d) => setLists((l) => ({ ...l, [p]: d.repos })))
          .catch(() => setLists((l) => ({ ...l, [p]: [] })));
      });
  }, [sources]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!catalog) return <div className="page"><p className="body01 t2">Loading…</p></div>;

  const byId = (id) => catalog.sources.find((x) => x.id === id);
  const setCfg = (id, patch) =>
    setFlow((f) => ({ srcCfg: { ...(f.srcCfg || {}), [id]: { ...((f.srcCfg || {})[id] || {}), ...patch } } }));

  function toggle(s) {
    if (!s.avail) {
      if (flow.waitlisted[s.id]) return toast('info', 'Already on the list', 'We will email you when ' + s.name + ' support ships');
      setWaitlistFor(s);
      return;
    }
    setFlow((f) => ({
      sources: (f.sources || []).includes(s.id)
        ? (f.sources || []).filter((x) => x !== s.id)
        : [...(f.sources || []), s.id]
    }));
  }

  const isReady = (id) => {
    const c = cfg[id] || {};
    if (KIND[id] === 'picker') return !!c.sel;
    if (KIND[id] === 'url') return /^https?:\/\/.+/.test(c.url || '');
    return !!c.connected;
  };

  async function connectToken(id) {
    const c = cfg[id] || {};
    const needsUrl = KIND[id] === 'tokenurl';
    if ((needsUrl && !(c.url || '').trim()) || !(c.token || '').trim()) {
      return toast('error', 'Missing details', needsUrl ? 'Instance URL and API token are both required' : 'A token is required');
    }
    setBusy(true);
    try {
      await api('/sources', { method: 'POST', body: { provider: id, detail: (c.url || '').trim(), token: (c.token || '').trim() } });
      setCfg(id, { connected: true, token: '' }); // never keep the token in browser state
      toast('success', byId(id).name + ' connected', c.url || 'Token accepted');
    } catch (e) { toast('error', 'Connection failed', e.message); }
    finally { setBusy(false); }
  }

  const allReady = sources.length > 0 && sources.every(isReady);
  const pending = sources.filter((id) => !isReady(id)).map((id) => byId(id).name);
  const primary = sources.find((id) => KIND[id] === 'picker' || KIND[id] === 'url');

  async function next() {
    setBusy(true);
    try {
      for (const id of sources) {
        const c = cfg[id] || {};
        if (KIND[id] === 'picker') await api('/sources', { method: 'POST', body: { provider: id, detail: c.sel } });
        if (KIND[id] === 'url') await api('/sources', { method: 'POST', body: { provider: id, detail: (c.url || '').trim() } });
      }
      const pc = cfg[primary] || {};
      setFlow({ provider: primary || sources[0], repo: pc.sel || pc.url || null });
      nav('/doctype');
    } catch (e) { toast('error', 'Could not save sources', e.message); }
    finally { setBusy(false); }
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

  return (
    <>
      <div className="page">
        <h1 className="h04">Where does your source of truth live?</h1>
        <p className="body01 t2 mt3">Select every source you want DocGen to read — combine a repository with Jira for changelogs, or a spec with Confluence pages. Configure each one below.</p>

        <div className="grid4 mt7">
          {catalog.sources.map((s) => {
            const on = sources.includes(s.id);
            return (
              <div key={s.id}
                className={'tile tile--click cbtile' + (on ? ' tile--selected' : '') + (s.avail ? '' : ' tile--disabled')}
                onClick={() => toggle(s)}>
                <span className="cb">{on ? <IcCheck c="#ffffff" /> : null}</span>
                <div className="row row--between" style={{ paddingRight: 8 }}>
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
            );
          })}
        </div>

        {sources.length > 0 && (
          <div className="mt7">
            <div className="row row--between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <h2 className="h02">Configure your sources</h2>
              <span className="helper">{sources.filter(isReady).length} of {sources.length} ready</span>
            </div>
            <p className="helper mt2 mb5">Each source needs one detail. The first code source becomes the primary input for generation.</p>
            <div className="stack">
              {sources.map((id) => {
                const s = byId(id);
                const c = cfg[id] || {};
                const ready = isReady(id);
                return (
                  <div key={id} className="srccard" style={{ borderLeftColor: ready ? 'var(--support-success)' : 'var(--support-warning)' }}>
                    <div className="row row--between" style={{ flexWrap: 'wrap', gap: 12 }}>
                      <div className="row">
                        <SrcMark id={id} />
                        <div>
                          <p className="h01">
                            {s.name}
                            {primary === id && sources.length > 1 ? <span className="tag tag--blue" style={{ marginLeft: 8 }}>Primary</span> : null}
                          </p>
                          <p className="helper">
                            {KIND[id] === 'picker' ? 'Pick the ' + PICKER_LABEL[id].toLowerCase() + ' to document'
                              : KIND[id] === 'url' ? 'Point DocGen at your spec'
                              : 'Authenticate with a token'}
                          </p>
                        </div>
                      </div>
                      {ready ? <span className="tag tag--green">Ready ✓</span> : <span className="tag tag--amber">Needs setup</span>}
                    </div>

                    <div className="mt5">
                      {KIND[id] === 'picker' && (
                        <div className="field" style={{ maxWidth: 520, marginBottom: 0 }}>
                          <label htmlFor={'sel-' + id}>{PICKER_LABEL[id]}</label>
                          <select id={'sel-' + id} className="select" value={c.sel || ''} onChange={(e) => setCfg(id, { sel: e.target.value })}>
                            <option value="" disabled>
                              {lists[id] === null || lists[id] === undefined ? 'Loading…' : 'Choose a ' + PICKER_LABEL[id].toLowerCase() + '…'}
                            </option>
                            {(lists[id] || []).map((r) => (
                              <option key={r.name} value={r.name}>
                                {r.name} · {r.branch}{r.updated ? ' · updated ' + r.updated : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {KIND[id] === 'url' && (
                        <div className="field" style={{ maxWidth: 520, marginBottom: 0 }}>
                          <label htmlFor={'url-' + id}>Spec URL</label>
                          <input id={'url-' + id} className="input" placeholder="https://api.acme.dev/openapi.json"
                            value={c.url || ''} onChange={(e) => setCfg(id, { url: e.target.value })} />
                        </div>
                      )}

                      {(KIND[id] === 'tokenurl' || KIND[id] === 'token') && (
                        c.connected ? (
                          <div className="row"><IcCheck /><span className="body01">Connected{c.url ? ' to ' + c.url : ''}</span></div>
                        ) : (
                          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
                            {KIND[id] === 'tokenurl' && (
                              <div className="field" style={{ flex: '1 1 240px', marginBottom: 0 }}>
                                <label htmlFor={'iu-' + id}>Instance URL</label>
                                <input id={'iu-' + id} className="input" placeholder="https://yourteam.atlassian.net"
                                  value={c.url || ''} onChange={(e) => setCfg(id, { url: e.target.value })} />
                              </div>
                            )}
                            <div className="field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                              <label htmlFor={'tk-' + id}>{id === 'notion' ? 'Integration token' : 'API token'}</label>
                              <input id={'tk-' + id} className="input" type="password" placeholder="Paste token"
                                value={c.token || ''} onChange={(e) => setCfg(id, { token: e.target.value })} />
                            </div>
                            <button className="btn btn--tertiary btn--field" disabled={busy} onClick={() => connectToken(id)}>Connect</button>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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

      <NavBar back="/signup" disabled={!allReady || busy}
        note={sources.length === 0 ? 'Select at least one source'
          : !allReady ? 'Finish setup: ' + pending.join(', ')
          : sources.length + ' source' + (sources.length > 1 ? 's' : '') + ' ready'}
        onNext={next} nextLabel="Continue" />
    </>
  );
}
