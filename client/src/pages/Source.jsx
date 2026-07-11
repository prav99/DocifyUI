import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getCatalog } from '../api.js';
import { useFlow, useAuth, toast } from '../store.jsx';
import { NavBar, Modal, SrcMark, IcCheck, HelpLink, RepoHubCta } from '../ui.jsx';

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
// Optional generation scope, validated live against the provider.
const SCOPE = {
  jira: { label: 'Focus on specific issues (optional)', ph: 'e.g. KAN-1, KAN-7' },
  confluence: { label: 'Focus on a specific page (optional)', ph: 'Paste a page URL or ID' },
  notion: { label: 'Focus on a specific page (optional)', ph: 'Paste a page or database link' }
};

export default function Source() {
  const nav = useNavigate();
  const { flow, setFlow } = useFlow();
  const { user } = useAuth();
  const [catalog, setCatalog] = useState(null);
  const [lists, setLists] = useState({}); // provider -> repo/project list
  const [waitlistFor, setWaitlistFor] = useState(null);
  const [wlEmail, setWlEmail] = useState(user ? user.email : '');
  const [busy, setBusy] = useState(false);
  const [hubRepos, setHubRepos] = useState(null); // Repository hub: connect once, use everywhere
  const [hosts, setHosts] = useState({}); // per code host: { loading, connected, repos, reason }
  const [oauthAvail, setOauthAvail] = useState({}); // which hosts have real OAuth configured
  const [addOther, setAddOther] = useState({}); // per host: show owner/name input
  const [otherVal, setOtherVal] = useState({}); // per host: owner/name draft

  const sources = flow.sources || [];
  const cfg = flow.srcCfg || {};
  const setCfg = (id, patch) =>
    setFlow((f) => ({ srcCfg: { ...(f.srcCfg || {}), [id]: { ...((f.srcCfg || {})[id] || {}), ...patch } } }));

  useEffect(() => { getCatalog().then(setCatalog); }, []);
  useEffect(() => { api('/auth/providers').then(setOauthAvail).catch(() => {}); }, []);
  useEffect(() => {
    api('/hub/repositories?per=100&enabled=true')
      .then((d) => setHubRepos(d.repositories))
      .catch(() => setHubRepos([]));
  }, []);

  // Returning from the Repository hub with a fresh connection? Auto-select it
  // so the user lands exactly where they left off — repo already chosen.
  useEffect(() => {
    if (!hubRepos) return;
    try {
      const stash = JSON.parse(sessionStorage.getItem('docify_new_repos') || 'null');
      if (!Array.isArray(stash) || !stash.length) return;
      sessionStorage.removeItem('docify_new_repos');
      const first = stash[0];
      if ((flow.sources || []).includes(first.provider)) {
        setFlow((f) => ({
          srcCfg: {
            ...(f.srcCfg || {}),
            [first.provider]: { ...((f.srcCfg || {})[first.provider] || {}), sel: first.repo, custom: false, fromHub: true }
          }
        }));
        toast('success', first.repo + ' connected and selected', 'Your workflow continues right where you left off.');
      }
    } catch { /* convenience only */ }
  }, [hubRepos]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Code hosts: load connection status + the real repository list together.
  // The server answers connected:false with an EMPTY list when no valid OAuth
  // token is on file — unconnected providers never show repositories.
  useEffect(() => {
    sources
      .filter((p) => KIND[p] === 'picker' && hosts[p] === undefined)
      .forEach((p) => {
        setHosts((h) => ({ ...h, [p]: { loading: true, connected: false, repos: [] } }));
        api('/repos?provider=' + p)
          .then((d) => setHosts((h) => ({ ...h, [p]: { loading: false, connected: d.connected !== false, repos: d.repos || [], reason: d.reason || '' } })))
          .catch((e) => setHosts((h) => ({ ...h, [p]: { loading: false, connected: false, repos: [], reason: e.message } })));
      });
  }, [sources, hosts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trust guard: a selection is only valid while the account can still access
  // it. If the provider is disconnected, the token expired, or permission was
  // removed, clear the stale selection (hub-verified and public picks stay).
  useEffect(() => {
    sources.filter((p) => KIND[p] === 'picker').forEach((p) => {
      const st = hosts[p];
      const c = cfg[p] || {};
      if (!st || st.loading || !c.sel || c.custom || c.fromHub) return;
      if (!st.connected || !(st.repos || []).some((r) => r.name === c.sel)) {
        setCfg(p, { sel: '' });
        toast('info', 'Selection cleared', c.sel + ' is no longer accessible from your ' + p + ' account.');
      }
    });
  }, [hosts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Token sources (Jira, Confluence, Notion): load pick-lists once connected.
  useEffect(() => {
    sources
      .filter((p) => lists[p] === undefined && PICK_AFTER[p] && (cfg[p] || {}).connected)
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

  // Hand the browser to the provider's consent screen; the flow (selections,
  // progress) is already persisted in sessionStorage, and /oauth/complete
  // returns the user straight back here with the new connection live.
  function connectHost(p) {
    const name = byId(p) ? byId(p).name : p;
    if (!oauthAvail[p]) {
      return toast('error', name + ' connection isn’t available yet',
        name + ' OAuth is not configured on the server. You can still document any public repository below.');
    }
    try { sessionStorage.setItem('authDest', '/source'); } catch { /* best effort */ }
    window.location.href = '/api/auth/oauth/' + p;
  }

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

  // Validate the optional scope (issue IDs / page link) against the provider.
  async function checkScope(id) {
    const c = cfg[id] || {};
    if (!(c.scopeInput || '').trim()) return setCfg(id, { scope: '', scopeLabel: '' });
    setBusy(true);
    try {
      const d = await api('/sources/scope', { method: 'POST', body: { provider: id, value: c.scopeInput.trim() } });
      setCfg(id, { scope: d.scope, scopeLabel: d.label });
      toast('success', 'Scope verified', d.label);
    } catch (e) {
      setCfg(id, { scope: '', scopeLabel: '' });
      toast('error', 'Could not verify', e.message);
    }
    finally { setBusy(false); }
  }

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

  const hostIds = sources.filter((id) => KIND[id] === 'picker');
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
      // Per-source generation scope ("KAN-1 — Fix checkout timeout", a page…)
      // travels with the flow so generation can focus on exactly those items.
      const srcScope = {};
      for (const id of sources) {
        const c = cfg[id] || {};
        if (c.scope && c.scopeLabel) srcScope[id] = { scope: c.scope, label: c.scopeLabel };
        else if (c.sel && PICK_AFTER[id]) srcScope[id] = { scope: c.sel, label: PICK_AFTER[id] + ' ' + c.sel };
      }
      setFlow({ provider: primary || sources[0], repo: pc.sel || pc.url || null, srcScope });
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
              {hostIds.length > 0 && (() => {
                // ONE panel for every code host: connection chips, an honest
                // repository list (connected accounts only), compact selection.
                const readyCount = hostIds.filter((p) => !!(cfg[p] || {}).sel).length;
                const loadingHosts = hostIds.filter((p) => !hosts[p] || hosts[p].loading);
                const settled = hostIds.filter((p) => hosts[p] && !hosts[p].loading);
                const unconnected = settled.filter((p) => !hosts[p].connected);
                const hubByProv = {};
                (hubRepos || []).forEach((r) => { (hubByProv[r.provider] = hubByProv[r.provider] || []).push(r); });
                // Options per host: the account's real list + hub-verified
                // entries. Under an unconnected provider only PUBLIC hub
                // entries qualify — those need no account to read.
                const optionsFor = (p) => {
                  const st = hosts[p];
                  const out = ((st && st.connected && st.repos) || []).map((r) =>
                    ({ name: r.name, branch: r.branch, priv: r.private, updated: r.updated, hub: false }));
                  (hubByProv[p] || []).forEach((r) => {
                    if (!(st && st.connected) && r.visibility !== 'public') return;
                    if (!out.some((x) => x.name === r.repo)) {
                      out.push({ name: r.repo, branch: r.branch, hub: true, ruleSetName: r.ruleSetName });
                    }
                  });
                  return out;
                };
                const addByName = (p) => {
                  const v = (otherVal[p] || '').trim();
                  if (!/^[\w.-]+\/[\w.-]+$/.test(v)) {
                    return toast('error', 'Use the owner/name format', 'For example expressjs/express — any public repository works.');
                  }
                  setCfg(p, { sel: v, custom: true, fromHub: false });
                  setAddOther((o) => ({ ...o, [p]: false }));
                  setOtherVal((o) => ({ ...o, [p]: '' }));
                };
                return (
                  <div className="srccard" style={{ borderLeftColor: readyCount === hostIds.length ? 'var(--support-success)' : 'var(--support-warning)' }}>
                    <div className="row row--between" style={{ flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <p className="h01">Select repositories</p>
                        <p className="helper mt2">Only repositories your connected accounts can access are listed.</p>
                      </div>
                      {readyCount === hostIds.length ? <span className="tag tag--green">Ready ✓</span> : <span className="tag tag--amber">Needs setup</span>}
                    </div>

                    <div className="connrow mt5">
                      {hostIds.map((p) => {
                        const st = hosts[p] || {};
                        const on = !!st.connected;
                        return (
                          <span key={p} className={'connchip' + (on ? ' connchip--on' : '')}>
                            <span className="conndot" aria-hidden="true" />
                            {byId(p).name} · {!hosts[p] || st.loading ? 'Checking…' : on ? 'Connected' : 'Not connected'}
                          </span>
                        );
                      })}
                      <button type="button" className="linkbtn" style={{ marginLeft: 'auto' }}
                        onClick={() => nav('/repos?return=' + encodeURIComponent('/source'))}>
                        Manage repositories
                      </button>
                    </div>

                    {unconnected.map((p) => (
                      <div key={p} className="notconn mt4">
                        <div>
                          <p className="body01"><b>{byId(p).name} is not connected</b></p>
                          <p className="helper mt2">{hosts[p].reason || 'Connect ' + byId(p).name + ' to browse and select repositories.'}</p>
                        </div>
                        <button type="button" className="btn btn--tertiary btn--sm btn--center" onClick={() => connectHost(p)}>
                          {hosts[p].reason ? 'Reconnect' : 'Connect'} {byId(p).name}
                        </button>
                      </div>
                    ))}

                    {loadingHosts.map((p) => (
                      <p key={p} className="helper mt4">Checking {byId(p).name}…</p>
                    ))}

                    {settled.map((p) => {
                      const c = cfg[p] || {};
                      const st = hosts[p];
                      const opts = optionsFor(p);
                      if (!st.connected && !opts.length && !c.sel && !addOther[p]) {
                        // Fully unconnected host: the connect block above is the
                        // state; offer only the compact public-repo escape hatch.
                        return (
                          <p key={p} className="helper mt3">
                            <button type="button" className="linkbtn" onClick={() => setAddOther((o) => ({ ...o, [p]: true }))}>
                              ＋ Or document a public {byId(p).name} repository by owner/name
                            </button>
                          </p>
                        );
                      }
                      // Organisation groups keep long lists navigable and make
                      // picking from another org a one-scroll job.
                      const orgs = {};
                      opts.forEach((r) => {
                        const org = r.name.split('/')[0] || 'other';
                        (orgs[org] = orgs[org] || []).push(r);
                      });
                      const info = opts.find((r) => r.name === c.sel);
                      return (
                        <div key={p} className="pickblock mt4">
                          <div className="pickrow">
                            <span className={'provtag prov--' + p}>{byId(p).name}</span>
                            {c.sel ? (
                              <>
                                <span className="pickrow-sel">
                                  <IcCheck />
                                  <b>{c.sel}</b>
                                  <span className="reporow-meta">
                                    {info
                                      ? [info.branch, info.priv !== undefined ? (info.priv ? 'Private' : 'Public') : '', info.hub && info.ruleSetName ? info.ruleSetName : ''].filter(Boolean).join(' · ')
                                      : c.custom ? 'Public repository' : ''}
                                  </span>
                                </span>
                                <button type="button" className="linkbtn" onClick={() => setCfg(p, { sel: '', custom: false, fromHub: false })}>Change</button>
                              </>
                            ) : opts.length ? (
                              <select className="select" style={{ flex: '1 1 260px', maxWidth: 440 }} value=""
                                aria-label={'Choose a ' + byId(p).name + ' repository'}
                                onChange={(e) => {
                                  const r = opts.find((x) => x.name === e.target.value);
                                  setCfg(p, { sel: e.target.value, custom: false, fromHub: !!(r && r.hub) });
                                }}>
                                <option value="" disabled>Choose a repository…</option>
                                {Object.keys(orgs).sort().map((org) => (
                                  <optgroup key={org} label={org}>
                                    {orgs[org].map((r) => (
                                      <option key={r.name} value={r.name}>
                                        {[r.name, r.branch, r.hub && r.ruleSetName ? r.ruleSetName : ''].filter(Boolean).join(' · ')}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            ) : (
                              <span className="helper">
                                {st.connected
                                  ? 'No repositories found — check your permissions or connect another account.'
                                  : 'Not connected — add a public repository below, or connect above.'}
                              </span>
                            )}
                          </div>
                          {!c.sel && (
                            addOther[p] ? (
                              <div className="row mt3" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                                <input className="input" style={{ flex: '1 1 220px', maxWidth: 320 }}
                                  placeholder="owner/name — e.g. expressjs/express" autoFocus
                                  aria-label={byId(p).name + ' repository by owner/name'}
                                  value={otherVal[p] || ''}
                                  onChange={(e) => setOtherVal((o) => ({ ...o, [p]: e.target.value }))}
                                  onKeyDown={(e) => { if (e.key === 'Enter') addByName(p); }} />
                                <button type="button" className="btn btn--tertiary btn--sm btn--center" onClick={() => addByName(p)}>Add</button>
                                <button type="button" className="linkbtn" onClick={() => setAddOther((o) => ({ ...o, [p]: false }))}>Cancel</button>
                              </div>
                            ) : (
                              <p className="mt2">
                                <button type="button" className="linkbtn" style={{ fontSize: 12.5 }}
                                  onClick={() => setAddOther((o) => ({ ...o, [p]: true }))}>
                                  ＋ Repository from another organisation or any public repository
                                </button>
                              </p>
                            )
                          )}
                        </div>
                      );
                    })}

                    <RepoHubCta label="Can’t find the repository you need?" action="Connect or manage repositories" style={{ marginTop: 16 }} />
                  </div>
                );
              })()}
              {sources.filter((id) => KIND[id] !== 'picker').map((id) => {
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
                            {SCOPE[id] && (
                              <div className="field mt5" style={{ maxWidth: 520, marginBottom: 0 }}>
                                <label htmlFor={'scope-' + id}>{SCOPE[id].label}</label>
                                <div className="row" style={{ flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                                  <input id={'scope-' + id} className="input" style={{ flex: '1 1 280px' }}
                                    placeholder={SCOPE[id].ph} value={c.scopeInput || ''}
                                    onChange={(e) => setCfg(id, { scopeInput: e.target.value, scope: '', scopeLabel: '' })}
                                    onKeyDown={(e) => { if (e.key === 'Enter') checkScope(id); }} />
                                  <button className="btn btn--tertiary btn--field" disabled={busy} onClick={() => checkScope(id)}>Verify</button>
                                </div>
                                {c.scopeLabel
                                  ? <p className="helper mt2" style={{ color: 'var(--support-success)' }}>✓ {c.scopeLabel} — generation will focus here</p>
                                  : <p className="helper mt2">Leave empty to use the whole {PICK_AFTER[id].toLowerCase()}.</p>}
                              </div>
                            )}
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
