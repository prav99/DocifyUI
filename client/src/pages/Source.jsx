import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getCatalog } from '../api.js';
import { useFlow, useAuth, toast } from '../store.jsx';
import { NavBar, Modal, SrcMark, IcCheck, HelpLink } from '../ui.jsx';

// How each source gets configured.
const KIND = {
  github: 'picker', gitlab: 'picker', bitbucket: 'picker',
  openapi: 'url', jira: 'tokenurl', confluence: 'tokenurl', notion: 'token'
};
const PICKER_LABEL = { github: 'Repository', gitlab: 'Project', bitbucket: 'Repository' };
// After a token connect, these sources offer a real pick-list from their API.
const PICK_AFTER = { jira: 'Project', confluence: 'Space', notion: 'Database or page' };
const NEEDS_EMAIL = { jira: true, confluence: true };
// Where to create the credential each token source needs.
const TOKEN_HINT = {
  jira: 'Create an API token at id.atlassian.com → Security → API tokens',
  confluence: 'Create an API token at id.atlassian.com → Security → API tokens',
  notion: 'Create an internal integration at notion.so/profile/integrations, then share your pages with it (Page → ⋯ → Connections)'
};
const URL_PLACEHOLDER = { jira: 'yourteam.atlassian.net', confluence: 'yourteam.atlassian.net' };

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

  // The provider chosen at sign-in is already authorized — pre-select it once,
  // so the user lands here with only the repository dropdown left to fill.
  useEffect(() => {
    if (user && user.oauthProvider && !flow.autoSrc) {
      setFlow((f) => ({
        autoSrc: true,
        sources: (f.sources || []).includes(user.oauthProvider)
          ? f.sources
          : [...(f.sources || []), user.oauthProvider]
      }));
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazily load pick-lists: code hosts immediately, token sources once connected.
  useEffect(() => {
    sources
      .filter((p) => lists[p] === undefined &&
        (KIND[p] === 'picker' || (PICK_AFTER[p] && (cfg[p] || {}).connected)))
      .forEach((p) => {
        setLists((l) => ({ ...l, [p]: null })); // mark loading
        api('/repos?provider=' + p)
          .then((d) => setLists((l) => ({ ...l, [p]: d.repos })))
          .catch((e) => {
            setLists((l) => ({ ...l, [p]: [] }));
            toast('error', 'Could not load list', e.message);
          });
      });
  }, [sources, cfg, lists]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (KIND[id] === 'url') return !!c.verified;
    return !!c.connected && (PICK_AFTER[id] ? !!c.sel : true);
  };

  async function connectToken(id) {
    const c = cfg[id] || {};
    const needsUrl = KIND[id] === 'tokenurl';
    if ((needsUrl && !(c.url || '').trim()) || !(c.token || '').trim() || (NEEDS_EMAIL[id] && !(c.email || '').trim())) {
      return toast('error', 'Missing details',
        NEEDS_EMAIL[id] ? 'Site URL, account email, and API token are all required' : 'A token is required');
    }
    setBusy(true);
    try {
      // The server verifies these credentials against the provider's API before saving.
      const d = await api('/sources', {
        method: 'POST',
        body: { provider: id, detail: (c.url || '').trim(), token: (c.token || '').trim(), email: (c.email || '').trim() }
      });
      // never keep the token in browser state; keep the normalized site + account
      setCfg(id, { connected: true, token: '', info: d.info || null, url: (d.info && d.info.site) || c.url });
      setLists((l) => ({ ...l, [id]: undefined })); // (re)load the pick-list
      toast('success', byId(id).name + ' connected',
        d.info && d.info.account ? 'Verified as ' + d.info.account : 'Credentials verified' + (c.url ? ' against ' + c.url : ''));
    } catch (e) { toast('error', 'Connection failed', e.message); }
    finally { setBusy(false); }
  }

  // Disconnect a token source so the user can re-enter credentials.
  async function disconnect(id) {
    setBusy(true);
    try {
      await api('/sources/' + id, { method: 'DELETE' });
      setCfg(id, { connected: false, sel: '', info: null, token: '' });
      setLists((l) => ({ ...l, [id]: undefined }));
      toast('info', byId(id).name + ' disconnected', 'Enter new credentials to reconnect');
    } catch (e) { toast('error', 'Could not disconnect', e.message); }
    finally { setBusy(false); }
  }

  const reloadList = (id) => setLists((l) => ({ ...l, [id]: undefined }));

  async function validateSpec(id) {
    const c = cfg[id] || {};
    let url = (c.url || '').trim();
    if (!url) return toast('error', 'Enter a spec URL', 'The address of your OpenAPI or Swagger spec — JSON or YAML');
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url; // be forgiving about the scheme
    setBusy(true);
    try {
      const d = await api('/sources', { method: 'POST', body: { provider: id, detail: url } });
      setCfg(id, { verified: true, info: d.info, url });
      toast('success', 'Spec verified', d.info
        ? d.info.title + (d.info.version ? ' v' + d.info.version : '') + ' · ' + d.info.endpoints + ' endpoints · ' + String(d.info.format || '').toUpperCase()
        : url);
    } catch (e) {
      setCfg(id, { verified: false, info: null });
      toast('error', 'Spec validation failed', e.message);
    }
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
        // Token and spec sources were already saved (and verified) at connect time.
        if (KIND[id] === 'picker') await api('/sources', { method: 'POST', body: { provider: id, detail: c.sel } });
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
        <div className="row row--between" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h1 className="h04">Where does your source of truth live?</h1>
          <HelpLink topic="source" />
        </div>
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
                        <div style={{ maxWidth: 520 }}>
                          <div className="field" style={{ marginBottom: 0 }}>
                            <label htmlFor={'sel-' + id}>{PICKER_LABEL[id]}</label>
                            <select id={'sel-' + id} className="select" value={c.custom ? '' : (c.sel || '')} onChange={(e) => setCfg(id, { sel: e.target.value, custom: false })}>
                              <option value="" disabled>
                                {lists[id] === null || lists[id] === undefined ? 'Loading…' : 'Choose a ' + PICKER_LABEL[id].toLowerCase() + '…'}
                              </option>
                              {(lists[id] || []).map((r) => (
                                <option key={r.name} value={r.name}>
                                  {[r.name, r.branch, r.updated ? 'updated ' + r.updated : ''].filter(Boolean).join(' · ')}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="field mt3" style={{ marginBottom: 0 }}>
                            <label htmlFor={'custom-' + id}>Or any public {PICKER_LABEL[id].toLowerCase()} (owner/name)</label>
                            <input id={'custom-' + id} className="input" placeholder="e.g. expressjs/express"
                              value={c.custom ? (c.sel || '') : ''}
                              onChange={(e) => setCfg(id, { sel: e.target.value.trim(), custom: true })} />
                          </div>
                        </div>
                      )}

                      {KIND[id] === 'url' && (
                        c.verified ? (
                          <div className="row" style={{ flexWrap: 'wrap' }}>
                            <IcCheck />
                            <span className="body01">
                              {c.info ? c.info.title + (c.info.version ? ' v' + c.info.version : '') + ' · ' + c.info.endpoints + ' endpoints' : 'Spec verified'}
                            </span>
                            <button className="linkbtn" onClick={() => setCfg(id, { verified: false, info: null })}>Change</button>
                          </div>
                        ) : (
                          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
                            <div className="field" style={{ flex: '1 1 300px', marginBottom: 0 }}>
                              <label htmlFor={'url-' + id}>Spec URL (JSON or YAML)</label>
                              <input id={'url-' + id} className="input" placeholder="https://api.acme.dev/openapi.json"
                                value={c.url || ''} onChange={(e) => setCfg(id, { url: e.target.value })}
                                onKeyDown={(e) => { if (e.key === 'Enter') validateSpec(id); }} />
                            </div>
                            <button className="btn btn--tertiary btn--field" disabled={busy} onClick={() => validateSpec(id)}>
                              {busy ? 'Validating…' : 'Validate spec'}
                            </button>
                          </div>
                        )
                      )}

                      {(KIND[id] === 'tokenurl' || KIND[id] === 'token') && (
                        c.connected ? (
                          <div>
                            <div className="row" style={{ flexWrap: 'wrap' }}>
                              <IcCheck />
                              <span className="body01">
                                {c.info && c.info.account ? 'Connected as ' + c.info.account : 'Credentials verified'}
                                {c.url ? ' · ' + c.url : ''}
                              </span>
                              <button className="linkbtn" disabled={busy} onClick={() => disconnect(id)}>Change credentials</button>
                            </div>
                            <div className="field mt5" style={{ maxWidth: 520, marginBottom: 0 }}>
                              <label htmlFor={'pick-' + id}>{PICK_AFTER[id]}</label>
                              <select id={'pick-' + id} className="select" value={c.sel || ''} onChange={(e) => setCfg(id, { sel: e.target.value })}>
                                <option value="" disabled>
                                  {lists[id] === null || lists[id] === undefined ? 'Loading from ' + s.name + '…'
                                    : (lists[id] || []).length === 0 ? 'Nothing found — check access, then reload'
                                    : 'Choose a ' + PICK_AFTER[id].toLowerCase() + '…'}
                                </option>
                                {(lists[id] || []).map((r) => (
                                  <option key={r.name} value={r.name}>
                                    {[r.name, r.updated ? 'updated ' + r.updated : ''].filter(Boolean).join(' · ')}
                                  </option>
                                ))}
                              </select>
                              {Array.isArray(lists[id]) && lists[id].length === 0 && (
                                <p className="helper mt2">
                                  {id === 'notion'
                                    ? 'Share at least one page or database with your integration (Page → ⋯ → Connections), then reload.'
                                    : 'The account may not have access to any ' + PICK_AFTER[id].toLowerCase() + 's yet.'}
                                  {' '}<button className="linkbtn" onClick={() => reloadList(id)}>Reload list</button>
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
                              {KIND[id] === 'tokenurl' && (
                                <div className="field" style={{ flex: '1 1 220px', marginBottom: 0 }}>
                                  <label htmlFor={'iu-' + id}>Site URL</label>
                                  <input id={'iu-' + id} className="input" placeholder={URL_PLACEHOLDER[id] || 'https://…'}
                                    value={c.url || ''} onChange={(e) => setCfg(id, { url: e.target.value })} />
                                </div>
                              )}
                              {NEEDS_EMAIL[id] && (
                                <div className="field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                                  <label htmlFor={'em-' + id}>Account email</label>
                                  <input id={'em-' + id} className="input" type="email" placeholder="you@company.com"
                                    value={c.email || ''} onChange={(e) => setCfg(id, { email: e.target.value })} />
                                </div>
                              )}
                              <div className="field" style={{ flex: '1 1 180px', marginBottom: 0 }}>
                                <label htmlFor={'tk-' + id}>{id === 'notion' ? 'Integration token' : 'API token'}</label>
                                <input id={'tk-' + id} className="input" type="password" placeholder="Paste token"
                                  value={c.token || ''} onChange={(e) => setCfg(id, { token: e.target.value })} />
                              </div>
                              <button className="btn btn--tertiary btn--field" disabled={busy} onClick={() => connectToken(id)}>
                                {busy ? 'Verifying…' : 'Connect'}
                              </button>
                            </div>
                            {TOKEN_HINT[id] && <p className="helper mt2">{TOKEN_HINT[id]}</p>}
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
