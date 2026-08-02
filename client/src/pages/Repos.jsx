import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { toast } from '../store.jsx';
import { usePageMeta } from '../seo.js';

/* Workflow handoff: pages that send users here append ?return=<path>. Newly
   connected repos are stashed so the originating page can auto-select them. */
const NEW_REPO_KEY = 'docify_new_repos';

/* ================= Repository hub =================
   Central management for every connected repository plus reusable
   documentation rule sets. Enterprise-scalable: compact data table,
   server-side search/filters/pagination, bulk actions, side panels,
   effective-configuration preview with layer provenance. */

const PROVIDER_TAG = { github: 'GH', gitlab: 'GL', bitbucket: 'BB' };
const fmtDate = (iso) => { try { return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } };

/* Provider probes report raw transport codes. A status line has to say what the
   customer can DO about it — "HTTP 404" on its own is not an answer. Messages
   that already carry an explanation (they contain an em dash) are left alone. */
function humanError(msg) {
  const s = String(msg || '').trim();
  if (!s) return '';
  const m = s.match(/HTTP (\d{3})/);
  if (!m || s.includes('—')) return s;
  const code = m[1];
  const said = code === '404' ? 'not found — check the owner/name spelling, or connect an account that can see it if it is private'
    : code === '401' || code === '403' ? 'access denied — reconnect the provider account, or check that it can reach this repository'
    : code === '429' ? 'rate limited by the provider — connecting an account raises the limit; try again shortly'
    : code.startsWith('5') ? 'the provider is unavailable right now — try again shortly'
    : 'the provider rejected the request (' + code + ')';
  return s.replace(/HTTP \d{3}/, said);
}

function StatusDot({ status, msg }) {
  const color = status === 'connected' ? 'var(--support-success, #24a148)'
    : status === 'error' ? 'var(--support-error, #da1e28)' : '#8d8d8d';
  const reason = status === 'error' ? humanError(msg) : '';
  const label = status === 'connected' ? 'Connected' : status === 'error' ? 'Error' : 'Not checked yet';
  return <span className="repostatus" title={reason || label}><span style={{ background: color }} />{label}</span>;
}

/* Switch control: a div needs the keyboard behaviour a checkbox gets for free. */
function Toggle({ on, onChange, className, children }) {
  const flip = () => onChange(!on);
  return (
    <div className={(className ? className + ' ' : '') + 'toggle' + (on ? ' on' : '')}
      role="switch" aria-checked={on} tabIndex={0} onClick={flip}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } }}>
      <span className="track" /><span className="body01">{children}</span>
    </div>
  );
}

/* ---------------- Side panel (shared) ---------------- */
function Panel({ open, onClose, title, children, wide }) {
  const bodyRef = useRef(null);
  // Inline arrow props change identity every render, so the latest handler is
  // read through a ref — otherwise the effect would re-run and steal focus
  // back from whatever field the user is typing in.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    const restore = document.activeElement;
    document.addEventListener('keydown', onKey);
    if (bodyRef.current) bodyRef.current.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      if (restore && restore.focus) restore.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="hubpanel-wrap" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'hubpanel' + (wide ? ' hubpanel--wide' : '')}>
        <div className="hubpanel-head">
          <h3 className="h02">{title}</h3>
          <button className="mclose" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="hubpanel-body" ref={bodyRef} tabIndex={-1}>{children}</div>
      </div>
    </div>
  );
}

/* ---------------- Add repositories panel ---------------- */
function AddReposPanel({ open, onClose, ruleSets, onAdded, stashNew }) {
  const [provider, setProvider] = useState('github');
  const [repos, setRepos] = useState('');
  const [ruleSetId, setRuleSetId] = useState('');
  const [verify, setVerify] = useState(true);
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      const d = await api('/hub/repositories', { method: 'POST', body: { provider, repos, ruleSetId, verify } });
      toast('success', d.added + ' repositor' + (d.added === 1 ? 'y' : 'ies') + ' added',
        d.skipped.length ? d.skipped.length + ' already connected: ' + d.skipped.slice(0, 3).join(', ') + (d.skipped.length > 3 ? '…' : '') : 'Available in every workflow immediately.');
      if (stashNew && d.repositories.length) stashNew(d.repositories);
      setRepos('');
      onAdded();
      onClose();
    } catch (e) { toast('error', 'Could not add repositories', humanError(e.message)); }
    finally { setBusy(false); }
  }

  return (
    <Panel open={open} onClose={onClose} title="Connect repositories">
      <div className="field">
        <label htmlFor="hub-provider">Provider</label>
        <select id="hub-provider" className="select" value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="github">GitHub</option>
          <option value="gitlab">GitLab</option>
          <option value="bitbucket">Bitbucket</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="hub-repos">Repositories — one per line, owner/name or full URL</label>
        <textarea id="hub-repos" className="textarea mono" rows={6} style={{ fontSize: 13 }}
          placeholder={'acme/payments-api\nacme/developer-docs\nhttps://github.com/acme/cli'}
          value={repos} onChange={(e) => setRepos(e.target.value)} />
        <span className="helper">Bulk-paste up to 200 at once. Private repositories use your connected {provider} source for access.</span>
      </div>
      <div className="field">
        <label htmlFor="hub-ruleset">Documentation rule set</label>
        <select id="hub-ruleset" className="select" value={ruleSetId} onChange={(e) => setRuleSetId(e.target.value)}>
          <option value="">Default rule set</option>
          {ruleSets.map((rs) => <option key={rs.id} value={rs.id}>{rs.name}</option>)}
        </select>
      </div>
      <Toggle on={verify} onChange={setVerify}>Verify connections now (slower for large batches)</Toggle>
      <div className="row mt6">
        <button className="btn btn--primary btn--center" disabled={busy || !repos.trim()} onClick={add}>
          {busy ? 'Connecting…' : 'Connect'}
        </button>
        <button className="btn btn--ghost btn--center" onClick={onClose}>Cancel</button>
      </div>
    </Panel>
  );
}

/* ---------------- Effective configuration preview ---------------- */
function EffectiveConfigPanel({ repo, onClose }) {
  const [eff, setEff] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!repo) return undefined;
    let live = true;
    setEff(null); setError('');
    api('/hub/effective-config?repoId=' + repo.id)
      .then((d) => { if (live) setEff(d); })
      .catch((e) => { if (live) setError(humanError(e.message)); });
    // Resolution reads the repository over the network — a slow answer for a
    // repo the user already closed must never land in the open panel.
    return () => { live = false; };
  }, [repo]);
  const c = eff && eff.config;
  return (
    <Panel open={!!repo} onClose={onClose} title={'Effective configuration — ' + (repo ? repo.repo : '')} wide>
      {error && <p className="body01" style={{ color: 'var(--support-error)' }}>{error}</p>}
      {!eff && !error && <p className="body01 t2">Resolving layers…</p>}
      {eff && (
        <>
          <p className="label01 t2 mb3">CONFIGURATION LAYERS (LOWEST FIRST)</p>
          <div className="stack" style={{ gap: 6 }}>
            {eff.layers.map((l, i) => (
              <div key={i} className="efflayer">
                <span className={'tag ' + (l.applied ? 'tag--green' : 'tag--gray')}>{l.applied ? 'applied' : 'not set'}</span>
                <span className="body01">
                  {l.layer === 'defaults' && 'Built-in defaults'}
                  {l.layer === 'rule_set' && ('Rule set' + (l.name ? ': ' + l.name : '') + (l.override ? ' (workflow override)' : ''))}
                  {l.layer === 'repository_files' && ('Repository files' + (l.sources ? ' — ' + ['yaml', 'ignoreFile', 'instructions'].filter((k) => l.sources[k]).map((k) => k === 'yaml' ? 'docify.yaml' : k === 'ignoreFile' ? '.docifyignore' : 'instructions.md').join(', ') : ''))}
                </span>
              </div>
            ))}
          </div>
          {c && (
            <>
              <p className="label01 t2 mb3 mt6">FINAL RULES THAT WILL APPLY</p>
              <p className="body01 t2">
                Ignores commit types <span className="mono">{c.rules.ignore_commit_types.join(', ') || 'none'}</span>
                {c.rules.ignore_dependency_updates ? ' · skips dependency updates' : ''}
                {' · documents at impact ≥ ' + c.thresholds.auto_document}
                {' · discards below ' + c.thresholds.discard_below}
                {c.rules.document_only && c.rules.document_only.length ? ' · only surfaces: ' + c.rules.document_only.join(', ') : ''}
              </p>
              <p className="body01 t2 mt2">Included paths: <span className="mono">
                {c.scan.include.length
                  ? c.scan.include.slice(0, 6).join(', ') + (c.scan.include.length > 6 ? ' +' + (c.scan.include.length - 6) + ' more' : '')
                  : 'every path (no include filter)'}
              </span></p>
              <p className="body01 t2 mt2">Excluded paths: <span className="mono">
                {c.scan.exclude.length
                  ? c.scan.exclude.slice(0, 6).join(', ') + (c.scan.exclude.length > 6 ? ' +' + (c.scan.exclude.length - 6) + ' more' : '')
                  : 'none'}
              </span></p>
              {c.product.audience && <p className="body01 t2 mt2">Audience: {c.product.audience}</p>}
              {eff.instructions && (
                <>
                  <p className="label01 t2 mb3 mt6">AI INSTRUCTIONS</p>
                  <pre className="effpre">{eff.instructions.slice(0, 1200)}</pre>
                </>
              )}
              {eff.errors.length > 0 && <p className="body01 mt4" style={{ color: 'var(--support-error)' }}>Issues: {eff.errors.join(' · ')}</p>}
            </>
          )}
        </>
      )}
    </Panel>
  );
}

/* ---------------- Rule set editor panel ---------------- */
const SURFACES = ['public_api', 'http_api', 'cli', 'configuration', 'error_messages', 'webhooks', 'ui', 'auth'];
const COMMIT_TYPES = ['chore', 'refactor', 'test', 'style', 'ci', 'build', 'docs', 'perf'];
/* Mirrors DEFAULT_CONFIG in server/src/adapters/relevance.js. A rule set that
   defines nothing still runs with these, so the editor shows them rather than
   an empty box that implies "nothing is filtered". */
const DEFAULT_IGNORE_TYPES = ['chore', 'refactor', 'test', 'style', 'ci', 'build'];
const DEFAULT_EXCLUDE = [
  '**/*.lock', '**/package-lock.json', '**/yarn.lock', '**/pnpm-lock.yaml',
  '**/go.sum', '**/Cargo.lock', '**/poetry.lock',
  '**/node_modules/**', '**/dist/**', '**/build/**', '**/vendor/**',
  '**/.github/**', '**/.circleci/**'
];
const globLines = (s) => s.split(/\n+/).map((x) => x.trim()).filter(Boolean);
const numOr = (v, fb) => (v === undefined || v === null || v === '' ? fb : Number(v));

function RuleSetPanel({ open, ruleSet, onClose, onSaved }) {
  const editing = ruleSet && ruleSet.id;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ignoreTypes, setIgnoreTypes] = useState(DEFAULT_IGNORE_TYPES);
  const [ignoreDeps, setIgnoreDeps] = useState(true);
  const [documentOnly, setDocumentOnly] = useState([]);
  const [autoDoc, setAutoDoc] = useState(80);
  const [discard, setDiscard] = useState(40);
  const [audience, setAudience] = useState('');
  const [include, setInclude] = useState('');
  const [exclude, setExclude] = useState('');
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  // A save replaces the whole stored config, so keys this editor does not
  // expose (product.name, always_document_paths, review_below, …) are carried
  // forward instead of being silently dropped.
  const baseConfig = useRef({});

  useEffect(() => {
    if (!open) return;
    const c = (ruleSet && ruleSet.config) || {};
    baseConfig.current = c;
    setName(ruleSet ? ruleSet.name || '' : '');
    setDescription(ruleSet ? ruleSet.description || '' : '');
    setIgnoreTypes((c.rules && c.rules.ignore_commit_types) || DEFAULT_IGNORE_TYPES);
    setIgnoreDeps(c.rules ? c.rules.ignore_dependency_updates !== false : true);
    setDocumentOnly((c.rules && c.rules.document_only) || []);
    setAutoDoc(numOr(c.thresholds && c.thresholds.auto_document, 80));
    setDiscard(numOr(c.thresholds && c.thresholds.discard_below, 40));
    setAudience((c.product && c.product.audience) || '');
    setInclude(((c.scan && c.scan.include) || []).join('\n'));
    setExclude(((c.scan && c.scan.exclude) || DEFAULT_EXCLUDE).join('\n'));
    setInstructions(ruleSet ? ruleSet.instructions || '' : '');
  }, [open, ruleSet]);

  const toggleIn = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function saveRuleSet() {
    const auto = numOr(autoDoc, NaN);
    const disc = numOr(discard, NaN);
    if (![auto, disc].every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) {
      return toast('error', 'Thresholds must be between 0 and 100', 'Impact scores are on a 0–100 scale.');
    }
    if (disc > auto) {
      return toast('error', 'Discard threshold is above the auto-document threshold',
        'Nothing could ever be documented. Lower "Discard below" under ' + auto + '.');
    }
    setBusy(true);
    const base = baseConfig.current || {};
    // Every field is written explicitly — an omitted key means "inherit the
    // default", so an emptied list would silently come back on the next load.
    const config = {
      ...base,
      product: { ...(base.product || {}), audience: audience.trim() },
      scan: { ...(base.scan || {}), include: globLines(include), exclude: globLines(exclude) },
      rules: {
        ...(base.rules || {}),
        ignore_commit_types: ignoreTypes,
        ignore_dependency_updates: ignoreDeps,
        document_only: documentOnly.length ? documentOnly : null
      },
      thresholds: { ...(base.thresholds || {}), auto_document: auto, discard_below: disc }
    };
    try {
      if (editing) await api('/hub/rulesets/' + ruleSet.id, { method: 'PUT', body: { name, description, config, instructions } });
      else await api('/hub/rulesets', { method: 'POST', body: { name, description, config, instructions } });
      toast('success', editing ? 'Rule set updated' : 'Rule set created', name);
      onSaved();
      onClose();
    } catch (e) { toast('error', 'Save failed', humanError(e.message)); }
    finally { setBusy(false); }
  }

  return (
    <Panel open={open} onClose={onClose} title={editing ? 'Edit rule set' : 'New rule set'} wide>
      <div className="grid2">
        <div className="field">
          <label htmlFor="rs-name">Name</label>
          <input id="rs-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Public API documentation" />
        </div>
        <div className="field">
          <label htmlFor="rs-desc">Description</label>
          <input id="rs-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this rule set is for" />
        </div>
      </div>

      <p className="label01 t2 mb3 mt4">IGNORE COMMIT TYPES</p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {COMMIT_TYPES.map((t) => (
          <button key={t} type="button" className={'chipbtn' + (ignoreTypes.includes(t) ? ' on' : '')}
            aria-pressed={ignoreTypes.includes(t)} onClick={() => toggleIn(ignoreTypes, setIgnoreTypes, t)}>{t}</button>
        ))}
      </div>

      <Toggle className="mt5" on={ignoreDeps} onChange={setIgnoreDeps}>Skip dependency-only updates (lockfiles, manifests)</Toggle>

      <p className="label01 t2 mb3 mt5">DOCUMENT ONLY THESE SURFACES <span style={{ fontWeight: 400 }}>(empty = all customer-facing)</span></p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {SURFACES.map((s) => (
          <button key={s} type="button" className={'chipbtn' + (documentOnly.includes(s) ? ' on' : '')}
            aria-pressed={documentOnly.includes(s)} onClick={() => toggleIn(documentOnly, setDocumentOnly, s)}>{s}</button>
        ))}
      </div>

      <div className="grid2 mt5">
        <div className="field">
          <label htmlFor="rs-auto">Auto-document at impact ≥</label>
          <input id="rs-auto" className="input" type="number" min="0" max="100" value={autoDoc} onChange={(e) => setAutoDoc(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rs-discard">Discard below</label>
          <input id="rs-discard" className="input" type="number" min="0" max="100" value={discard} onChange={(e) => setDiscard(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="rs-aud">Audience</label>
        <input id="rs-aud" className="input" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="developers integrating the API" />
      </div>
      <div className="grid2">
        <div className="field">
          <label htmlFor="rs-in">Included paths (globs, one per line)</label>
          <textarea id="rs-in" className="textarea mono" rows={3} style={{ fontSize: 13 }} value={include}
            onChange={(e) => setInclude(e.target.value)} placeholder={'packages/api/**\nservices/billing/**'} />
          <span className="helper">
            Leave empty to scan the whole repository. With patterns here, only matching files are read,
            and a change that touches nothing inside them is filtered out — the monorepo control.
          </span>
        </div>
        <div className="field">
          <label htmlFor="rs-ex">Excluded paths (globs, one per line)</label>
          <textarea id="rs-ex" className="textarea mono" rows={3} style={{ fontSize: 13 }} value={exclude}
            onChange={(e) => setExclude(e.target.value)} placeholder={'internal/**\n**/*_test.*'} />
          <span className="helper">Exclusions win: a path matching both lists is left out.</span>
        </div>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="rs-ins">AI instructions (judgment layer — like a CLAUDE.md for your docs)</label>
        <textarea id="rs-ins" className="textarea" rows={5} value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={'## Document\n- Anything an API caller can see\n\n## Never document\n- The labs/ directory'} />
      </div>
      <div className="row mt6">
        <button className="btn btn--primary btn--center" disabled={busy || !name.trim()} onClick={saveRuleSet}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create rule set'}
        </button>
        <button className="btn btn--ghost btn--center" onClick={onClose}>Cancel</button>
      </div>
    </Panel>
  );
}

/* ---------------- Connections tab: the single source of truth ---------------- */
// Every provider connection — OAuth accounts, organisations, GitLab groups,
// Bitbucket workspaces — is configured HERE and only here. Workflow pages
// consume the resulting unified catalogue and never show connection UI.
const ORG_NOUN = { github: 'organisation', gitlab: 'group', bitbucket: 'workspace' };
const PROVIDER_NAME = { github: 'GitHub', gitlab: 'GitLab', bitbucket: 'Bitbucket' };
const TABS = [['conn', 'Connections'], ['repos', 'Managed repositories'], ['rules', 'Rule sets']];

function ConnectionsTab({ returnTo }) {
  const [conns, setConns] = useState(null);
  const [oauthAvail, setOauthAvail] = useState({});
  const [orgs, setOrgs] = useState([]);
  const [draft, setDraft] = useState({}); // provider -> org name being typed
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    // Failing silently here would paint every provider as "No account
    // connected" — the one state a user must never be shown by mistake.
    api('/connections')
      .then((d) => setConns(d.connections))
      .catch((e) => { setConns({}); setError(humanError(e.message)); });
    api('/hub/orgs').then((d) => setOrgs(d.orgs)).catch((e) => setError(humanError(e.message)));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api('/auth/providers').then(setOauthAvail).catch(() => {}); }, []);

  const oauth = (p) => {
    if (!oauthAvail[p]) {
      return toast('error', PROVIDER_NAME[p] + ' sign-in isn’t configured yet',
        'You can still connect ' + ORG_NOUN[p] + 's and public repositories below.');
    }
    try { sessionStorage.setItem('authDest', '/repos' + (returnTo ? '?return=' + encodeURIComponent(returnTo) : '')); } catch { /* best effort */ }
    window.location.href = '/api/auth/oauth/' + p;
  };

  const disconnect = async (p) => {
    setBusy(p);
    try {
      await api('/sources/' + p, { method: 'DELETE' });
      toast('info', PROVIDER_NAME[p] + ' account disconnected', 'Organisation connections and hub repositories are kept.');
      load();
    } catch (e) { toast('error', 'Could not disconnect', humanError(e.message)); }
    finally { setBusy(''); }
  };

  const addOrg = async (p) => {
    const org = (draft[p] || '').trim();
    if (!org) return;
    setBusy(p + ':add');
    try {
      const d = await api('/hub/orgs', { method: 'POST', body: { provider: p, org } });
      toast('success', org + ' connected', d.repos + ' repositor' + (d.repos === 1 ? 'y' : 'ies') + ' now available in every workflow.');
      setDraft((x) => ({ ...x, [p]: '' }));
      load();
    } catch (e) { toast('error', 'Could not connect ' + org, humanError(e.message)); }
    finally { setBusy(''); }
  };

  const syncOrg = async (o) => {
    setBusy(o.id);
    try { await api('/hub/orgs/' + o.id + '/sync', { method: 'POST' }); load(); }
    catch (e) { toast('error', 'Sync failed', humanError(e.message)); }
    finally { setBusy(''); }
  };

  const removeOrg = async (o) => {
    if (!window.confirm('Disconnect ' + o.org + '? Its repositories leave your catalogue — repositories added individually are kept.')) return;
    setBusy(o.id);
    try {
      await api('/hub/orgs/' + o.id, { method: 'DELETE' });
      toast('info', o.org + ' disconnected', 'Its repositories no longer appear in the catalogue.');
      load();
    } catch (e) { toast('error', 'Remove failed', humanError(e.message)); }
    finally { setBusy(''); }
  };

  if (!conns) return <p className="body01 t2 mt6" role="status">Loading connections…</p>;

  return (
    <div className="conngrid mt6">
      {error && (
        <div className="conncard" style={{ borderLeft: '3px solid var(--support-error)' }}>
          <p className="body01"><b>Could not load your connections</b></p>
          <p className="helper mt2">{error}</p>
          <button className="btn btn--tertiary btn--sm btn--center mt3" onClick={load}>Retry</button>
        </div>
      )}
      {['github', 'gitlab', 'bitbucket'].map((p) => {
        const c = conns[p] || {};
        const myOrgs = orgs.filter((o) => o.provider === p);
        return (
          <div key={p} className="conncard">
            <div className="row row--between" style={{ flexWrap: 'wrap', gap: 10 }}>
              <div className="row" style={{ gap: 10 }}>
                <span className={'provtag prov--' + p}>{PROVIDER_NAME[p]}</span>
                <span className={'connchip' + (c.connected ? ' connchip--on' : '')} style={{ border: 'none', padding: 0, background: 'none' }}>
                  <span className="conndot" aria-hidden="true" />
                  {c.connected ? 'Connected' + (c.account ? ' as ' + c.account : '') : c.expired ? 'Session expired' : 'No account connected'}
                </span>
              </div>
              <span className="row" style={{ gap: 12 }}>
                {c.connected
                  ? <button className="linkbtn" disabled={busy === p} onClick={() => disconnect(p)}>Disconnect</button>
                  : null}
                <button className="btn btn--tertiary btn--sm btn--center" onClick={() => oauth(p)}>
                  {c.connected ? 'Reauthenticate' : c.expired ? 'Reconnect account' : 'Connect account'}
                </button>
              </span>
            </div>
            <p className="helper mt3">
              The account grants access to its own and member repositories. Add {ORG_NOUN[p]}s below to
              aggregate more repositories — public ones need no account.
            </p>

            {myOrgs.length > 0 && (
              <ul className="orglist mt4">
                {myOrgs.map((o) => (
                  <li key={o.id} className="orgrow">
                    <span className="orgrow-name"><b>{o.org}</b></span>
                    <span className="reporow-meta">
                      {o.status === 'error' ? '⚠ ' + (humanError(o.statusMsg) || 'unreachable') : o.repoCount + ' repositories'}
                      {o.lastSync ? ' · synced ' + fmtDate(o.lastSync) : ''}
                    </span>
                    <span className="row" style={{ gap: 10, marginLeft: 'auto' }}>
                      <button className="linkbtn" disabled={busy === o.id} onClick={() => syncOrg(o)}>{busy === o.id ? 'Syncing…' : 'Sync'}</button>
                      <button className="linkbtn" disabled={busy === o.id} onClick={() => removeOrg(o)}>Remove</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="row mt4" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input className="input" style={{ flex: '1 1 200px', maxWidth: 280 }}
                placeholder={'Add a ' + ORG_NOUN[p] + ' — e.g. ' + (p === 'github' ? 'vercel' : p === 'gitlab' ? 'gitlab-org' : 'atlassian')}
                aria-label={'Connect a ' + PROVIDER_NAME[p] + ' ' + ORG_NOUN[p]}
                value={draft[p] || ''}
                onChange={(e) => setDraft((x) => ({ ...x, [p]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') addOrg(p); }} />
              <button className="btn btn--tertiary btn--sm btn--center" disabled={busy === p + ':add'} onClick={() => addOrg(p)}>
                {busy === p + ':add' ? 'Validating…' : 'Connect ' + ORG_NOUN[p]}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================================ Page ================================ */
export default function Repos() {
  usePageMeta({
    title: 'Repository connections — connect once, use everywhere',
    description: 'The central integration hub: GitHub, GitLab, and Bitbucket accounts, organisations, groups, and workspaces — one unified repository catalogue with reusable documentation rule sets for every workflow.'
  });
  const nav = useNavigate();
  const loc = useLocation();
  const returnTo = new URLSearchParams(loc.search).get('return') || '';
  // Workflow visitors come here to CONNECT something — land them on that tab.
  const [tab, setTab] = useState(returnTo ? 'conn' : 'repos');
  // Roving tabindex: one stop in the tab order, arrow keys move between tabs.
  const tabRefs = useRef({});
  const onTabKey = (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? TABS.length - 1
      : e.key === 'Home' ? 'first' : e.key === 'End' ? 'last' : null;
    if (step === null) return;
    e.preventDefault();
    const i = TABS.findIndex(([id]) => id === tab);
    const next = step === 'first' ? TABS[0][0]
      : step === 'last' ? TABS[TABS.length - 1][0]
      : TABS[(i + step) % TABS.length][0];
    setTab(next);
    const el = tabRefs.current[next];
    if (el) el.focus();
  };

  // Stash newly connected repos so the originating workflow can auto-select them.
  const stashNew = (repos) => {
    try { sessionStorage.setItem(NEW_REPO_KEY, JSON.stringify(repos.map((r) => ({ provider: r.provider, repo: r.repo })))); }
    catch { /* selection convenience only */ }
  };

  // repositories state
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [qTerm, setQTerm] = useState(''); // debounced — one request per pause, not per keystroke
  const [provider, setProvider] = useState('');
  const [status, setStatus] = useState('');
  const [org, setOrg] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState({});
  const [addOpen, setAddOpen] = useState(false);
  const [effRepo, setEffRepo] = useState(null);
  const [busyRow, setBusyRow] = useState('');

  // rule sets state
  const [ruleSets, setRuleSets] = useState([]);
  const [rsError, setRsError] = useState('');
  const [rsLoaded, setRsLoaded] = useState(false);
  const [rsBusy, setRsBusy] = useState('');
  const [rsPanel, setRsPanel] = useState(null); // null | {} (new) | ruleSet (edit)

  // Filters change faster than the network answers; only the newest request is
  // allowed to paint, so a slow early response can't overwrite a fresh one.
  const reqSeq = useRef(0);
  const loadRepos = useCallback(() => {
    setError('');
    const seq = ++reqSeq.current;
    const params = new URLSearchParams();
    if (qTerm) params.set('q', qTerm);
    if (provider) params.set('provider', provider);
    if (status) params.set('status', status);
    if (org) params.set('org', org);
    params.set('page', String(page));
    params.set('per', '25');
    api('/hub/repositories?' + params.toString())
      .then((d) => { if (seq === reqSeq.current) setData(d); })
      .catch((e) => {
        if (seq !== reqSeq.current) return;
        setError(humanError(e.message));
        setData({ repositories: [], total: 0, page: 1, per: 25, orgs: [] });
      });
  }, [qTerm, provider, status, org, page]);

  const loadRuleSets = useCallback(() => {
    setRsError('');
    api('/hub/rulesets')
      .then((d) => { setRuleSets(d.ruleSets); setRsLoaded(true); })
      .catch((e) => { setRsError(humanError(e.message)); setRsLoaded(true); });
  }, []);

  useEffect(() => { loadRepos(); }, [loadRepos]);
  useEffect(() => { loadRuleSets(); }, [loadRuleSets]);
  useEffect(() => {
    const t = setTimeout(() => { setQTerm(q); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const rows = (data && data.repositories) || [];
  const total = (data && data.total) || 0;
  const pages = Math.max(1, Math.ceil(total / 25));
  const selIds = Object.keys(selected).filter((id) => selected[id]);
  const allSelected = rows.length > 0 && rows.every((r) => selected[r.id]);

  const bulk = async (body, label) => {
    try {
      await api('/hub/repositories', { method: 'PATCH', body: { ids: selIds, ...body } });
      toast('success', label, selIds.length + ' repositor' + (selIds.length === 1 ? 'y' : 'ies') + ' updated');
      setSelected({});
      loadRepos();
      loadRuleSets(); // usage counts change with assignments
    } catch (e) { toast('error', 'Bulk action failed', humanError(e.message)); }
  };

  const removeSel = async () => {
    if (!window.confirm('Remove ' + selIds.length + ' repositor' + (selIds.length === 1 ? 'y' : 'ies')
      + ' from your catalogue? Nothing in the repositor' + (selIds.length === 1 ? 'y' : 'ies') + ' itself changes.')) return;
    try {
      await api('/hub/repositories', { method: 'DELETE', body: { ids: selIds } });
      toast('info', 'Removed', selIds.length + ' repositor' + (selIds.length === 1 ? 'y' : 'ies') + ' disconnected');
      setSelected({});
      loadRepos();
    } catch (e) { toast('error', 'Remove failed', humanError(e.message)); }
  };

  const checkOne = async (r) => {
    setBusyRow(r.id);
    try {
      await api('/hub/repositories/' + r.id + '/check', { method: 'POST' });
      loadRepos();
    } catch (e) { toast('error', 'Check failed', humanError(e.message)); }
    finally { setBusyRow(''); }
  };

  const assignRuleSet = async (r, ruleSetId) => {
    try {
      await api('/hub/repositories', { method: 'PATCH', body: { ids: [r.id], ruleSetId } });
      loadRepos();
      loadRuleSets(); // usage counts change with assignments
    } catch (e) { toast('error', 'Assignment failed', humanError(e.message)); }
  };

  const summary = useMemo(() => {
    if (!selIds.length) return '';
    const provs = [...new Set(rows.filter((r) => selected[r.id]).map((r) => r.provider))];
    return selIds.length + ' selected across ' + provs.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(', ');
  }, [selIds, rows, selected]);

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      {returnTo && (
        <div className="returnbar" role="status">
          <span className="body01">You came from a workflow — <b>your progress is saved</b>. Connect what you need, then head back.</span>
          <button className="btn btn--primary btn--sm btn--center" onClick={() => nav(returnTo)}>
            ← Return to workflow
          </button>
        </div>
      )}
      <div className="row row--between" style={{ flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="h04">Repository connections</h1>
          <p className="body01 t2 mt3" style={{ maxWidth: 680 }}>
            The single place to connect accounts, organisations, groups, and workspaces. Everything
            connected here flows into one catalogue used by generation, automation, and Doc sync.
          </p>
        </div>
        <button className="btn btn--primary btn--field" onClick={() => setAddOpen(true)}>
          Add repositories<span className="ico">+</span>
        </button>
      </div>

      <div className="tabs mt6" role="tablist" aria-label="Repository hub sections" onKeyDown={onTabKey}>
        {TABS.map(([id, label]) => (
          <button key={id} id={'hubtab-' + id} className={tab === id ? 'on' : ''}
            role="tab" aria-selected={tab === id} aria-controls={'hubpanel-' + id}
            tabIndex={tab === id ? 0 : -1} ref={(el) => { tabRefs.current[id] = el; }}
            onClick={() => setTab(id)}>
            {label}
            {id === 'repos' && total ? ' (' + total + ')' : ''}
            {id === 'rules' && ruleSets.length ? ' (' + ruleSets.length + ')' : ''}
          </button>
        ))}
      </div>

      {tab === 'conn' && (
        <div id="hubpanel-conn" role="tabpanel" aria-labelledby="hubtab-conn">
          <ConnectionsTab returnTo={returnTo} />
        </div>
      )}

      {tab === 'repos' && (
        <div id="hubpanel-repos" role="tabpanel" aria-labelledby="hubtab-repos">
          {/* Toolbar: search + filters + bulk actions */}
          <div className="hubbar mt5">
            <input className="input hubsearch" placeholder="Search repositories…" value={q}
              onChange={(e) => setQ(e.target.value)} aria-label="Search repositories" />
            <select className="select" value={provider} onChange={(e) => { setProvider(e.target.value); setPage(1); }} aria-label="Filter by provider">
              <option value="">All providers</option>
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
              <option value="bitbucket">Bitbucket</option>
            </select>
            <select className="select" value={org} onChange={(e) => { setOrg(e.target.value); setPage(1); }} aria-label="Filter by organization">
              <option value="">All organizations</option>
              {(data ? data.orgs : []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status">
              <option value="">Any status</option>
              <option value="connected">Connected</option>
              <option value="unchecked">Not checked</option>
              <option value="error">Error</option>
            </select>
          </div>

          {selIds.length > 0 && (
            <div className="hubbulk">
              <span className="body01"><b>{summary}</b></span>
              <button className="btn btn--tertiary btn--sm btn--center" onClick={() => bulk({ enabled: true }, 'Enabled')}>Enable</button>
              <button className="btn btn--tertiary btn--sm btn--center" onClick={() => bulk({ enabled: false }, 'Disabled')}>Disable</button>
              {/* Controlled on the placeholder: uncontrolled, it displayed
                  "Default rule set" as if that were the current assignment and
                  picking it fired no change at all. */}
              <select className="select" style={{ maxWidth: 240 }} value="__" aria-label="Assign rule set to selection"
                onChange={(e) => { if (e.target.value !== '__') bulk({ ruleSetId: e.target.value }, 'Rule set assigned'); }}>
                <option value="__" disabled>Assign rule set…</option>
                <option value="">Default rule set</option>
                {ruleSets.map((rs) => <option key={rs.id} value={rs.id}>{rs.name}</option>)}
              </select>
              <button className="btn btn--ghost btn--sm btn--center" style={{ color: 'var(--support-error)' }} onClick={removeSel}>Remove</button>
            </div>
          )}

          {/* The table */}
          {!data && !error && <p className="body01 t2 mt6" role="status">Loading repositories…</p>}
          {error && (
            <div className="sync-empty mt6">
              <p className="h03">Could not load repositories</p>
              <p className="body01 t2 mt3">{error}</p>
              <button className="btn btn--tertiary btn--sm btn--center mt5" onClick={loadRepos}>Retry</button>
            </div>
          )}
          {data && !error && rows.length === 0 && (
            <div className="sync-empty mt6">
              <p className="h03">{q || provider || status || org ? 'No repositories match these filters' : 'No repositories connected yet'}</p>
              <p className="body01 t2 mt3" style={{ maxWidth: 520, margin: '8px auto 0' }}>
                {q || provider || status || org
                  ? 'Clear the search or filters to see everything.'
                  : 'Connect your first repositories — paste a list of owner/name or URLs and they become available to every workflow at once.'}
              </p>
              {!(q || provider || status || org) && (
                <button className="btn btn--primary btn--center mt5" onClick={() => setAddOpen(true)}>Connect repositories</button>
              )}
            </div>
          )}
          {rows.length > 0 && (
            <div className="hubtable-wrap mt4">
              <table className="hubtable">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>
                      <input type="checkbox" checked={allSelected} aria-label="Select all on this page"
                        onChange={() => {
                          const next = { ...selected };
                          rows.forEach((r) => { next[r.id] = !allSelected; });
                          setSelected(next);
                        }} />
                    </th>
                    <th>Repository</th>
                    <th>Provider</th>
                    <th>Visibility</th>
                    <th>Branch</th>
                    <th>Rule set</th>
                    <th>Status</th>
                    <th>Last checked</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={r.enabled ? '' : 'muted'}>
                      <td><input type="checkbox" checked={!!selected[r.id]} aria-label={'Select ' + r.repo}
                        onChange={() => setSelected({ ...selected, [r.id]: !selected[r.id] })} /></td>
                      <td>
                        <span className="mono" style={{ fontWeight: 600 }}>{r.repo}</span>
                        {!r.enabled && <span className="tag tag--gray" style={{ marginLeft: 8 }}>disabled</span>}
                      </td>
                      <td><span className={'provtag prov--' + r.provider}>{PROVIDER_TAG[r.provider] || r.provider}</span></td>
                      <td className="t2">{r.visibility}</td>
                      <td className="mono t2">{r.branch}</td>
                      <td>
                        <select className="select select--slim" value={r.ruleSetId} aria-label={'Rule set for ' + r.repo}
                          onChange={(e) => assignRuleSet(r, e.target.value)}>
                          <option value="">Default</option>
                          {ruleSets.map((rs) => <option key={rs.id} value={rs.id}>{rs.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <StatusDot status={r.status} msg={r.statusMsg} />
                        {r.status === 'error' && r.statusMsg
                          ? <span className="helper" style={{ display: 'block', maxWidth: 220 }}>{humanError(r.statusMsg)}</span>
                          : null}
                      </td>
                      <td className="t2">{r.lastCheck ? fmtDate(r.lastCheck) : '—'}</td>
                      <td>
                        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          <button className="linkbtn" disabled={busyRow === r.id} onClick={() => checkOne(r)}>
                            {busyRow === r.id ? 'Checking…' : 'Check'}
                          </button>
                          <button className="linkbtn" onClick={() => setEffRepo(r)}>Rules</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <div className="row mt4" style={{ justifyContent: 'space-between' }}>
              <span className="helper">Page {page} of {pages} · {total} repositories</span>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn--ghost btn--sm btn--center" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                <button className="btn btn--ghost btn--sm btn--center" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'rules' && (
        <div id="hubpanel-rules" role="tabpanel" aria-labelledby="hubtab-rules">
          <div className="row row--between mt5" style={{ flexWrap: 'wrap', gap: 12 }}>
            <p className="body01 t2" style={{ maxWidth: 640 }}>
              A rule set defines what gets documented and what gets filtered — assign it to one repository,
              many, or make it your default. Repositories can still refine rules with their own docify.yaml.
            </p>
            <button className="btn btn--tertiary btn--field" onClick={() => setRsPanel({})}>New rule set<span className="ico">+</span></button>
          </div>
          {!rsLoaded && <p className="body01 t2 mt6" role="status">Loading rule sets…</p>}
          {rsError && (
            <div className="sync-empty mt6">
              <p className="h03">Could not load rule sets</p>
              <p className="body01 t2 mt3">{rsError}</p>
              <button className="btn btn--tertiary btn--sm btn--center mt5" onClick={loadRuleSets}>Retry</button>
            </div>
          )}
          {rsLoaded && !rsError && ruleSets.length === 0 && (
            <div className="sync-empty mt6">
              <p className="h03">No rule sets yet</p>
              <p className="body01 t2 mt3" style={{ maxWidth: 520, margin: '8px auto 0' }}>
                Without one, repositories run on the built-in defaults. Create a rule set to scope which
                paths are read and which changes are worth documenting.
              </p>
              <button className="btn btn--primary btn--center mt5" onClick={() => setRsPanel({})}>New rule set</button>
            </div>
          )}
          <div className="stack mt4">
            {ruleSets.map((rs) => (
              <div key={rs.id} className="ruleset-row">
                <div style={{ minWidth: 0 }}>
                  <p className="h01">{rs.name}
                    {rs.isDefault && <span className="tag tag--blue" style={{ marginLeft: 8 }}>default</span>}
                    <span className="helper" style={{ marginLeft: 10 }}>v{rs.version} · used by {rs.reposUsing} repositor{rs.reposUsing === 1 ? 'y' : 'ies'}</span>
                  </p>
                  <p className="body01 t2 mt2">{rs.description || '—'}</p>
                </div>
                <div className="row" style={{ gap: 8, flexShrink: 0 }}>
                  {!rs.isDefault && (
                    <button className="linkbtn" disabled={rsBusy === rs.id} onClick={async () => {
                      setRsBusy(rs.id);
                      try { await api('/hub/rulesets/' + rs.id, { method: 'PUT', body: { isDefault: true } }); loadRuleSets(); }
                      catch (e) { toast('error', 'Failed', humanError(e.message)); }
                      finally { setRsBusy(''); }
                    }}>Make default</button>
                  )}
                  <button className="linkbtn" disabled={rsBusy === rs.id} onClick={async () => {
                    setRsBusy(rs.id);
                    try { await api('/hub/rulesets/' + rs.id + '/duplicate', { method: 'POST' }); loadRuleSets(); toast('success', 'Duplicated', rs.name + ' (copy)'); }
                    catch (e) { toast('error', 'Failed', humanError(e.message)); }
                    finally { setRsBusy(''); }
                  }}>Duplicate</button>
                  <button className="btn btn--tertiary btn--sm btn--center" onClick={() => setRsPanel(rs)}>Edit</button>
                  {!rs.isDefault && (
                    <button className="linkbtn" style={{ color: 'var(--support-error)' }} disabled={rsBusy === rs.id} onClick={async () => {
                      if (!window.confirm('Delete "' + rs.name + '"? '
                        + (rs.reposUsing ? rs.reposUsing + ' repositor' + (rs.reposUsing === 1 ? 'y falls' : 'ies fall') + ' back to your default rule set.'
                          : 'No repository uses it.'))) return;
                      setRsBusy(rs.id);
                      try { await api('/hub/rulesets/' + rs.id, { method: 'DELETE' }); loadRuleSets(); loadRepos(); toast('info', 'Rule set deleted', rs.name); }
                      catch (e) { toast('error', 'Delete failed', humanError(e.message)); }
                      finally { setRsBusy(''); }
                    }}>Delete</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="helper mt5">
            Where these apply: normal generation scopes repository files and injects instructions;
            automation pipelines gate every merge; Doc sync filters every commit. One definition, everywhere.
          </p>
        </div>
      )}

      <AddReposPanel open={addOpen} onClose={() => setAddOpen(false)} ruleSets={ruleSets} onAdded={() => { loadRepos(); }} stashNew={returnTo ? stashNew : null} />
      <EffectiveConfigPanel repo={effRepo} onClose={() => setEffRepo(null)} />
      <RuleSetPanel open={rsPanel !== null} ruleSet={rsPanel && rsPanel.id ? rsPanel : null}
        onClose={() => setRsPanel(null)} onSaved={() => { loadRuleSets(); loadRepos(); }} />

      <div className="row mt7">
        <button className="btn btn--ghost btn--center" onClick={() => nav('/dashboard')}>← Dashboard</button>
        <span className="navnote">Repositories connected here appear in the Source step, Automation wizard, and Doc sync.</span>
      </div>
    </div>
  );
}
