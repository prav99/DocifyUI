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

/* ================= Jira issue picker =================
   Jira is NOT a repository: the user selects ISSUES — directly, via search,
   or whole epics / sprints / releases / JQL — and those issues become the
   source material for generation. */
const JIRA_MODES = [
  ['issues', 'Issue keys'], ['search', 'Search'], ['epic', 'Epic'],
  ['sprint', 'Sprint'], ['release', 'Release'], ['jql', 'JQL']
];

function JiraIssuePicker({ cfg, patch, project }) {
  const issues = cfg.issues || [];
  const [mode, setMode] = useState('issues');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null); // found issues awaiting selection
  const [checked, setChecked] = useState({});
  const [invalid, setInvalid] = useState([]); // [{key, reason}]
  const [epics, setEpics] = useState(null);
  const [versions, setVersions] = useState(null);

  // Epic and release choices load lazily per mode.
  useEffect(() => {
    if (mode === 'epic' && epics === null) {
      api('/jira/epics?project=' + encodeURIComponent(project || '')).then((d) => setEpics(d.epics)).catch(() => setEpics([]));
    }
    if (mode === 'release' && versions === null) {
      api('/jira/versions?project=' + encodeURIComponent(project || '')).then((d) => setVersions(d.versions)).catch(() => setVersions([]));
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const addIssues = (list) => {
    const have = new Set(issues.map((i) => i.key));
    const fresh = list.filter((i) => !have.has(i.key));
    if (fresh.length) patch({ issues: [...issues, ...fresh.map((i) => ({ key: i.key, summary: i.summary || '' }))] });
    const dup = list.length - fresh.length;
    if (dup) toast('info', dup + ' duplicate' + (dup > 1 ? 's' : '') + ' skipped', 'Already in your selection.');
    setResults(null); setChecked({}); setInput('');
  };

  async function addKeys() {
    const keys = input.split(/[\s,;]+/).filter(Boolean);
    if (!keys.length) return;
    setBusy(true); setInvalid([]);
    try {
      const d = await api('/jira/validate', { method: 'POST', body: { keys } });
      const ok = d.results.filter((r) => r.ok);
      const bad = d.results.filter((r) => !r.ok);
      if (ok.length) addIssues(ok);
      setInvalid(bad);
    } catch (e) { toast('error', 'Validation failed', e.message); }
    finally { setBusy(false); }
  }

  async function run() {
    setBusy(true); setInvalid([]); setResults(null); setChecked({});
    try {
      const d = mode === 'search'
        ? await api('/jira/search?q=' + encodeURIComponent(input) + '&project=' + encodeURIComponent(project || ''))
        : await api('/jira/resolve', { method: 'POST', body: { mode, value: input, project: project || '' } });
      setResults(d.issues || []);
    } catch (e) { toast('error', 'Could not fetch issues', e.message); }
    finally { setBusy(false); }
  }

  const go = () => (mode === 'issues' ? addKeys() : run());
  const nChecked = Object.values(checked).filter(Boolean).length;

  return (
    <div className="field mt5" style={{ maxWidth: 680, marginBottom: 0 }}>
      <label>Source issues</label>
      <p className="helper">
        Selected issues become the source material for generation — summaries, descriptions,
        acceptance criteria, comments, and linked issues are all read.
      </p>

      <div className="row mt3" style={{ gap: 6, flexWrap: 'wrap' }}>
        {JIRA_MODES.map(([id, l]) => (
          <button key={id} type="button" className={'chip' + (mode === id ? ' on' : '')}
            onClick={() => { setMode(id); setResults(null); setInvalid([]); setInput(''); }}>{l}</button>
        ))}
      </div>

      <div className="row mt3" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {mode === 'epic' && (
          epics === null ? <span className="helper">Loading epics…</span> : epics.length ? (
            <select className="select" style={{ flex: '1 1 240px', maxWidth: 360 }} value={input}
              onChange={(e) => setInput(e.target.value)} aria-label="Choose an epic">
              <option value="" disabled>Choose an epic…</option>
              {epics.map((ep) => <option key={ep.key} value={ep.key}>{ep.key} — {ep.summary}</option>)}
            </select>
          ) : (
            <input className="input" style={{ flex: '1 1 220px', maxWidth: 320 }}
              placeholder="Epic key — e.g. DOC-100" value={input}
              onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} />
          )
        )}
        {mode === 'release' && (
          versions === null ? <span className="helper">Loading releases…</span> : versions.length ? (
            <select className="select" style={{ flex: '1 1 240px', maxWidth: 360 }} value={input}
              onChange={(e) => setInput(e.target.value)} aria-label="Choose a release">
              <option value="" disabled>Choose a release / fix version…</option>
              {versions.map((v) => <option key={v.name} value={v.name}>{v.name}{v.released ? ' (released)' : ''}</option>)}
            </select>
          ) : (
            <input className="input" style={{ flex: '1 1 220px', maxWidth: 320 }}
              placeholder="Fix version — e.g. 2.4.0" value={input}
              onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} />
          )
        )}
        {(mode === 'issues' || mode === 'search' || mode === 'sprint' || mode === 'jql') && (
          <input className="input" style={{ flex: '1 1 280px', maxWidth: 420 }}
            placeholder={mode === 'issues' ? 'DOC-101, DOC-102 — paste keys, comma or line separated'
              : mode === 'search' ? 'Search by key, title, label, assignee…'
              : mode === 'sprint' ? 'Sprint name — leave empty for the active sprint'
              : 'JQL — e.g. project = DOC AND status = Done AND updated >= -14d'}
            aria-label={'Jira ' + mode + ' input'} value={input}
            onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} />
        )}
        <button type="button" className="btn btn--tertiary btn--sm btn--center" disabled={busy} onClick={go}>
          {busy ? 'Working…' : mode === 'issues' ? 'Validate & add' : mode === 'search' ? 'Search' : mode === 'jql' ? 'Run query' : 'Fetch issues'}
        </button>
      </div>

      {invalid.length > 0 && (
        <div className="mt2">
          {invalid.map((r) => (
            <p key={r.key} className="helper" style={{ color: 'var(--support-error, #da1e28)' }}>✕ {r.key} — {r.reason}</p>
          ))}
        </div>
      )}

      {results && (results.length === 0 ? (
        <p className="helper mt3">No issues matched. Try another {mode === 'jql' ? 'query' : mode}.</p>
      ) : (
        <div className="jiraresults mt3">
          {results.map((r) => (
            <label key={r.key} className="jirarow">
              <input type="checkbox" checked={!!checked[r.key]}
                onChange={(e) => setChecked((c) => ({ ...c, [r.key]: e.target.checked }))} />
              <b className="mono">{r.key}</b>
              <span className="jirarow-sum">{r.summary}</span>
              <span className="reporow-meta">{[r.type, r.status].filter(Boolean).join(' · ')}</span>
            </label>
          ))}
          <div className="row" style={{ gap: 12, padding: '10px 14px', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--tertiary btn--sm btn--center" disabled={!nChecked}
              onClick={() => addIssues(results.filter((r) => checked[r.key]))}>
              Add selected ({nChecked})
            </button>
            <button type="button" className="linkbtn" onClick={() => addIssues(results)}>Add all {results.length}</button>
            <button type="button" className="linkbtn" onClick={() => { setResults(null); setChecked({}); }}>Cancel</button>
          </div>
        </div>
      ))}

      {issues.length > 0 && (
        <div className="mt4">
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {issues.map((i) => (
              <span key={i.key} className="iskey" title={i.summary}>
                <b>{i.key}</b>
                {i.summary ? <span className="iskey-sum">{i.summary.length > 34 ? i.summary.slice(0, 34) + '…' : i.summary}</span> : null}
                <button type="button" aria-label={'Remove ' + i.key}
                  onClick={() => patch({ issues: issues.filter((x) => x.key !== i.key) })}>✕</button>
              </span>
            ))}
          </div>
          <p className="helper mt2">
            {issues.length} issue{issues.length > 1 ? 's' : ''} selected as source material.
            {' '}<button type="button" className="linkbtn" onClick={() => patch({ issues: [] })}>Clear all</button>
          </p>
        </div>
      )}
    </div>
  );
}

/* ================= Shared: multi-select results + chips ================= */
function ResultList({ results, checked, setChecked, onAdd, onCancel, empty }) {
  const n = Object.values(checked).filter(Boolean).length;
  if (!results) return null;
  if (!results.length) return <p className="helper mt3">{empty}</p>;
  return (
    <div className="jiraresults mt3">
      {results.map((r) => (
        <label key={r.id || r.key} className="jirarow">
          <input type="checkbox" checked={!!checked[r.id || r.key]}
            onChange={(e) => setChecked((c) => ({ ...c, [r.id || r.key]: e.target.checked }))} />
          <span className="jirarow-sum"><b>{r.title}</b></span>
          <span className="reporow-meta">{[r.kind, r.space, r.updated].filter(Boolean).join(' · ')}</span>
        </label>
      ))}
      <div className="row" style={{ gap: 12, padding: '10px 14px', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn--tertiary btn--sm btn--center" disabled={!n}
          onClick={() => onAdd(results.filter((r) => checked[r.id || r.key]))}>Add selected ({n})</button>
        <button type="button" className="linkbtn" onClick={() => onAdd(results)}>Add all {results.length}</button>
        <button type="button" className="linkbtn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function SelChips({ items, onRemove, onClear, noun }) {
  if (!items.length) return null;
  return (
    <div className="mt4">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {items.map((i) => (
          <span key={i.id} className="iskey" title={i.title}>
            <span className="iskey-sum" style={{ color: '#0043ce' }}>{i.title.length > 38 ? i.title.slice(0, 38) + '…' : i.title}</span>
            <button type="button" aria-label={'Remove ' + i.title} onClick={() => onRemove(i.id)}>✕</button>
          </span>
        ))}
      </div>
      <p className="helper mt2">
        {items.length} {noun}{items.length > 1 ? 's' : ''} selected as source material.
        {' '}<button type="button" className="linkbtn" onClick={onClear}>Clear all</button>
      </p>
    </div>
  );
}

/* ================= Notion picker: pages & databases ================= */
function NotionPicker({ cfg, patch }) {
  const items = cfg.items || [];
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [checked, setChecked] = useState({});

  async function search() {
    setBusy(true); setResults(null); setChecked({});
    try {
      const d = await api('/notion/search?q=' + encodeURIComponent(q));
      setResults(d.items || []);
    } catch (e) { toast('error', 'Notion search failed', e.message); }
    finally { setBusy(false); }
  }
  const add = (list) => {
    const have = new Set(items.map((i) => i.id));
    const fresh = list.filter((i) => !have.has(i.id));
    if (fresh.length) patch({ items: [...items, ...fresh.map((i) => ({ id: i.id, title: i.title, kind: i.kind }))] });
    const dup = list.length - fresh.length;
    if (dup) toast('info', dup + ' duplicate' + (dup > 1 ? 's' : '') + ' skipped', 'Already selected.');
    setResults(null); setChecked({});
  };

  return (
    <div className="field mt5" style={{ maxWidth: 680, marginBottom: 0 }}>
      <label>Source pages &amp; databases</label>
      <p className="helper">
        Selected pages become the source material — headings, text, lists, tables, code blocks,
        and database rows are all read. Only pages shared with your integration appear.
      </p>
      <div className="row mt3" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" style={{ flex: '1 1 280px', maxWidth: 420 }}
          placeholder="Search by title — leave empty for recent pages"
          aria-label="Search Notion pages" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} />
        <button type="button" className="btn btn--tertiary btn--sm btn--center" disabled={busy} onClick={search}>
          {busy ? 'Searching…' : q.trim() ? 'Search' : 'Browse recent'}
        </button>
      </div>
      <ResultList results={results} checked={checked} setChecked={setChecked} onAdd={add}
        onCancel={() => { setResults(null); setChecked({}); }}
        empty="Nothing found — is the page shared with your integration? (Page → ⋯ → Connections)" />
      <SelChips items={items} noun="item"
        onRemove={(id) => patch({ items: items.filter((x) => x.id !== id) })}
        onClear={() => patch({ items: [] })} />
      {items.length > 0 && (
        <p className="mt2">
          <label className="row" style={{ gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!cfg.includeChildren}
              onChange={(e) => patch({ includeChildren: e.target.checked })} />
            Include child pages of the selected pages
          </label>
        </p>
      )}
    </div>
  );
}

/* ================= Confluence picker: spaces, pages, CQL ================= */
function ConfluencePicker({ cfg, patch, space }) {
  const items = cfg.items || [];
  const [mode, setMode] = useState('browse'); // browse | search | cql
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [checked, setChecked] = useState({});

  async function run() {
    setBusy(true); setResults(null); setChecked({});
    try {
      const params = mode === 'cql'
        ? 'cql=' + encodeURIComponent(q)
        : 'q=' + encodeURIComponent(mode === 'search' ? q : '') + '&space=' + encodeURIComponent(space || '');
      const d = await api('/confluence/search?' + params);
      setResults(d.pages || []);
    } catch (e) { toast('error', 'Could not fetch pages', e.message); }
    finally { setBusy(false); }
  }
  const add = (list) => {
    const have = new Set(items.map((i) => i.id));
    const fresh = list.filter((i) => !have.has(i.id));
    if (fresh.length) patch({ items: [...items, ...fresh.map((i) => ({ id: i.id, title: i.title, space: i.space }))] });
    const dup = list.length - fresh.length;
    if (dup) toast('info', dup + ' duplicate' + (dup > 1 ? 's' : '') + ' skipped', 'Already selected.');
    setResults(null); setChecked({});
  };

  return (
    <div className="field mt5" style={{ maxWidth: 680, marginBottom: 0 }}>
      <label>Source pages</label>
      <p className="helper">
        Selected pages become the source material — body, headings, tables, code macros, and labels
        are all read. Pages from multiple spaces can be combined.
      </p>
      <div className="row mt3" style={{ gap: 6, flexWrap: 'wrap' }}>
        {[['browse', 'Browse space'], ['search', 'Search'], ['cql', 'CQL']].map(([id, l]) => (
          <button key={id} type="button" className={'chip' + (mode === id ? ' on' : '')}
            onClick={() => { setMode(id); setResults(null); setQ(''); }}>{l}</button>
        ))}
      </div>
      <div className="row mt3" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {mode !== 'browse' && (
          <input className="input" style={{ flex: '1 1 280px', maxWidth: 420 }}
            placeholder={mode === 'search' ? 'Search pages by title or text…' : 'CQL — e.g. space = ENG AND label = "api" order by lastmodified desc'}
            aria-label={'Confluence ' + mode} value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') run(); }} />
        )}
        {mode === 'browse' && (
          <span className="helper">{space ? 'Latest pages in ' + space.split(' ')[0] : 'Pick a space above, or use Search / CQL.'}</span>
        )}
        <button type="button" className="btn btn--tertiary btn--sm btn--center" disabled={busy} onClick={run}>
          {busy ? 'Working…' : mode === 'browse' ? 'List pages' : mode === 'cql' ? 'Run query' : 'Search'}
        </button>
      </div>
      <ResultList results={results} checked={checked} setChecked={setChecked} onAdd={add}
        onCancel={() => { setResults(null); setChecked({}); }}
        empty="No pages matched — restricted pages are never listed." />
      <SelChips items={items} noun="page"
        onRemove={(id) => patch({ items: items.filter((x) => x.id !== id) })}
        onClear={() => patch({ items: [] })} />
      {items.length > 0 && (
        <p className="mt2">
          <label className="row" style={{ gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!cfg.includeChildren}
              onChange={(e) => patch({ includeChildren: e.target.checked })} />
            Include child pages of the selected pages
          </label>
        </p>
      )}
    </div>
  );
}

/* ================= OpenAPI / Swagger picker: specs + endpoint tree ================= */
function OpenApiPicker({ cfg, patch }) {
  const specs = cfg.specs || [];
  const [method, setMethod] = useState('url'); // url | paste | repo
  const [inp, setInp] = useState({ url: '', text: '', repo: '', path: '', branch: 'main' });
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // { summary, source } awaiting endpoint choice
  const [opsChecked, setOpsChecked] = useState({});
  const set = (k, v) => setInp((x) => ({ ...x, [k]: v }));

  const srcLabel = (s) => s.url ? s.url : s.text ? 'pasted specification' : s.repo + '/' + s.path;

  async function inspect() {
    const source = method === 'url' ? { url: inp.url.trim() }
      : method === 'paste' ? { text: inp.text }
      : { provider: 'github', repo: inp.repo.trim(), branch: inp.branch.trim() || 'main', path: inp.path.trim().replace(/^\//, '') };
    if (method === 'repo' && (!source.repo || !source.path)) {
      return toast('error', 'Repository and file path are required', 'e.g. acme/payments-api and openapi/openapi.yaml');
    }
    const dupe = specs.some((s) => JSON.stringify(s.source) === JSON.stringify(source));
    if (dupe) return toast('info', 'Already added', 'That specification is in your list.');
    setBusy(true);
    try {
      const d = await api('/openapi/inspect', { method: 'POST', body: source });
      const all = {};
      d.summary.operations.forEach((o) => { all[o.key] = true; });
      setOpsChecked(all);
      setPending({ summary: d.summary, source });
    } catch (e) { toast('error', 'Could not read the specification', e.message); }
    finally { setBusy(false); }
  }

  function addPending() {
    const { summary, source } = pending;
    const selected = summary.operations.filter((o) => opsChecked[o.key]).map((o) => o.key);
    if (!selected.length) return toast('error', 'Select at least one endpoint', 'Or add the whole specification.');
    const errors = summary.issues.filter((i) => i.level === 'error').length;
    patch({
      specs: [...specs, {
        uid: Math.random().toString(36).slice(2, 9),
        source, title: summary.title, version: summary.version, specVersion: summary.specVersion,
        endpoints: summary.endpoints,
        ops: selected.length === summary.operations.length ? 'all' : selected,
        opsCount: selected.length,
        findings: summary.issues.length, errors
      }]
    });
    setPending(null); setOpsChecked({});
    setInp({ url: '', text: '', repo: '', path: '', branch: 'main' });
  }

  // Group pending operations by tag for the tree view.
  const groups = {};
  if (pending) pending.summary.operations.forEach((o) => { (groups[o.tags[0]] = groups[o.tags[0]] || []).push(o); });
  const nChecked = Object.values(opsChecked).filter(Boolean).length;

  return (
    <div style={{ maxWidth: 720 }}>
      <p className="helper">
        Add one or more API specifications — the selected endpoints become the source material
        (parameters, request/response schemas, and authentication are all read).
      </p>

      {specs.length > 0 && (
        <div className="stack mt4" style={{ gap: 8 }}>
          {specs.map((s) => (
            <div key={s.uid} className="pickblock">
              <div className="pickrow">
                <span className="provtag">{(s.specVersion || '').startsWith('2') ? 'Swagger' : 'OpenAPI'}</span>
                <span className="pickrow-sel">
                  <IcCheck />
                  <b>{s.title}{s.version ? ' v' + s.version : ''}</b>
                  <span className="reporow-meta">
                    {(s.ops === 'all' ? s.endpoints + ' endpoints' : s.opsCount + ' of ' + s.endpoints + ' endpoints')}
                    {' · ' + srcLabel(s.source)}
                  </span>
                </span>
                {s.errors > 0
                  ? <span className="tag tag--red">{s.errors} error{s.errors > 1 ? 's' : ''}</span>
                  : s.findings > 0
                    ? <span className="tag tag--amber">{s.findings} finding{s.findings > 1 ? 's' : ''}</span>
                    : <span className="tag tag--green">Valid ✓</span>}
                <button type="button" className="linkbtn"
                  onClick={() => patch({ specs: specs.filter((x) => x.uid !== s.uid) })}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!pending && (
        <>
          <div className="row mt4" style={{ gap: 6, flexWrap: 'wrap' }}>
            {[['url', 'From URL'], ['paste', 'Paste spec'], ['repo', 'From repository']].map(([id, l]) => (
              <button key={id} type="button" className={'chip' + (method === id ? ' on' : '')}
                onClick={() => setMethod(id)}>{l}</button>
            ))}
          </div>
          <div className="mt3">
            {method === 'url' && (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input className="input" style={{ flex: '1 1 300px', maxWidth: 460 }}
                  placeholder="https://api.acme.dev/openapi.json — JSON or YAML"
                  aria-label="Specification URL" value={inp.url}
                  onChange={(e) => set('url', e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') inspect(); }} />
                <button type="button" className="btn btn--tertiary btn--sm btn--center" disabled={busy} onClick={inspect}>
                  {busy ? 'Reading…' : 'Inspect'}
                </button>
              </div>
            )}
            {method === 'paste' && (
              <div>
                <textarea className="textarea mono" rows={6} style={{ fontSize: 12.5, maxWidth: 640 }}
                  placeholder={'openapi: 3.0.0\ninfo:\n  title: Payments API\n  version: 1.2.0\npaths:\n  /payments: …'}
                  aria-label="Paste specification" value={inp.text} onChange={(e) => set('text', e.target.value)} />
                <button type="button" className="btn btn--tertiary btn--sm btn--center mt2" disabled={busy} onClick={inspect}>
                  {busy ? 'Reading…' : 'Inspect'}
                </button>
              </div>
            )}
            {method === 'repo' && (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: '1 1 180px', maxWidth: 240, marginBottom: 0 }}>
                  <label>Repository (owner/name)</label>
                  <input className="input" placeholder="acme/payments-api" value={inp.repo} onChange={(e) => set('repo', e.target.value)} />
                </div>
                <div className="field" style={{ flex: '1 1 200px', maxWidth: 280, marginBottom: 0 }}>
                  <label>File path</label>
                  <input className="input" placeholder="openapi/openapi.yaml" value={inp.path} onChange={(e) => set('path', e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') inspect(); }} />
                </div>
                <div className="field" style={{ flex: '0 1 110px', marginBottom: 0 }}>
                  <label>Branch</label>
                  <input className="input" placeholder="main" value={inp.branch} onChange={(e) => set('branch', e.target.value)} />
                </div>
                <button type="button" className="btn btn--tertiary btn--sm btn--center" disabled={busy} onClick={inspect}>
                  {busy ? 'Reading…' : 'Inspect'}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {pending && (
        <div className="pickblock mt4">
          <div className="pickrow">
            <span className="provtag">{(pending.summary.specVersion || '').startsWith('2') ? 'Swagger' : 'OpenAPI'}</span>
            <span className="pickrow-sel">
              <b>{pending.summary.title}{pending.summary.version ? ' v' + pending.summary.version : ''}</b>
              <span className="reporow-meta">
                {pending.summary.specVersion} · {pending.summary.endpoints} endpoints
                {pending.summary.schemas.length ? ' · ' + pending.summary.schemas.length + ' schemas' : ''}
                {pending.summary.securitySchemes.length ? ' · auth: ' + pending.summary.securitySchemes.join(', ') : ''}
              </span>
            </span>
          </div>
          {pending.summary.issues.length > 0 && (
            <details className="mt2">
              <summary className="helper" style={{ cursor: 'pointer' }}>
                ⚠ {pending.summary.issues.length} validation finding{pending.summary.issues.length > 1 ? 's' : ''}
              </summary>
              <div className="mt2">
                {pending.summary.issues.slice(0, 12).map((i, k) => (
                  <p key={k} className="helper" style={i.level === 'error' ? { color: 'var(--support-error, #da1e28)' } : undefined}>
                    {i.level === 'error' ? '✕' : '·'} {i.msg}
                  </p>
                ))}
              </div>
            </details>
          )}
          <p className="helper mt3">
            Choose the endpoints to document — {nChecked} of {pending.summary.operations.length} selected.
            {' '}<button type="button" className="linkbtn" onClick={() => {
              const all = {}; pending.summary.operations.forEach((o) => { all[o.key] = true; }); setOpsChecked(all);
            }}>All</button>
            {' · '}<button type="button" className="linkbtn" onClick={() => setOpsChecked({})}>None</button>
            {' · '}<button type="button" className="linkbtn" onClick={() => {
              const next = {}; pending.summary.operations.forEach((o) => { if (!o.deprecated) next[o.key] = true; }); setOpsChecked(next);
            }}>All except deprecated</button>
          </p>
          <div className="jiraresults mt2" style={{ maxHeight: 300 }}>
            {Object.entries(groups).map(([tag, ops]) => (
              <div key={tag}>
                <label className="jirarow" style={{ background: 'var(--layer-01, #f4f4f4)' }}>
                  <input type="checkbox"
                    checked={ops.every((o) => opsChecked[o.key])}
                    onChange={(e) => setOpsChecked((c) => {
                      const next = { ...c };
                      ops.forEach((o) => { next[o.key] = e.target.checked; });
                      return next;
                    })} />
                  <b>{tag}</b>
                  <span className="reporow-meta">{ops.length} operation{ops.length > 1 ? 's' : ''}</span>
                </label>
                {ops.map((o) => (
                  <label key={o.key} className="jirarow" style={{ paddingLeft: 34 }}>
                    <input type="checkbox" checked={!!opsChecked[o.key]}
                      onChange={(e) => setOpsChecked((c) => ({ ...c, [o.key]: e.target.checked }))} />
                    <b className="mono" style={{ fontSize: 12 }}>{o.method}</b>
                    <span className="jirarow-sum">{o.path}{o.deprecated ? ' (deprecated)' : ''}</span>
                    <span className="reporow-meta">{o.summary.slice(0, 46)}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="row mt3" style={{ gap: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--tertiary btn--sm btn--center" onClick={addPending}>
              Add specification ({nChecked} endpoint{nChecked !== 1 ? 's' : ''})
            </button>
            <button type="button" className="linkbtn" onClick={() => { setPending(null); setOpsChecked({}); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Source() {
  const nav = useNavigate();
  const { flow, setFlow } = useFlow();
  const { user } = useAuth();
  const [catalog, setCatalog] = useState(null);
  const [lists, setLists] = useState({}); // provider -> repo/project list
  const [waitlistFor, setWaitlistFor] = useState(null);
  const [wlEmail, setWlEmail] = useState(user ? user.email : '');
  const [busy, setBusy] = useState(false);
  const [cat, setCat] = useState(null); // the unified catalogue: providers + aggregated repos
  const [adding, setAdding] = useState({}); // per host: '' | 'list' | 'name' — the add-another chooser
  const [otherVal, setOtherVal] = useState({}); // per host: owner/name draft

  const sources = flow.sources || [];
  const cfg = flow.srcCfg || {};
  const setCfg = (id, patch) =>
    setFlow((f) => ({ srcCfg: { ...(f.srcCfg || {}), [id]: { ...((f.srcCfg || {})[id] || {}), ...patch } } }));

  useEffect(() => { getCatalog().then(setCatalog); }, []);
  // ONE source of truth: the unified catalogue built from everything the user
  // configured on the Repository Connections page (accounts, organisations,
  // groups, workspaces, individually added repositories). This page never
  // configures connections — it only consumes.
  useEffect(() => {
    api('/hub/catalogue')
      .then(setCat)
      .catch(() => setCat({ providers: {}, orgs: [], repos: [] }));
  }, []);

  // Returning from Repository Connections with fresh repos? Auto-select the
  // first one so the user lands exactly where they left off — repo chosen.
  useEffect(() => {
    if (!cat) return;
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
  }, [cat]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Trust guard: a selection is only valid while it is still in the catalogue.
  // If a provider was disconnected, an organisation removed, or permission
  // lost, the stale selection is cleared (explicit public picks stay).
  useEffect(() => {
    if (!cat) return;
    sources.filter((p) => KIND[p] === 'picker').forEach((p) => {
      const c = cfg[p] || {};
      const ok = (name, custom) => custom || cat.repos.some((r) => r.provider === p && r.name === name);
      const patch = {};
      if (c.sel && !ok(c.sel, c.custom)) {
        patch.sel = '';
        toast('info', 'Selection cleared', c.sel + ' is no longer available in your repository catalogue.');
      }
      const extra = (c.extra || []).filter((e) => ok(e.repo, e.custom));
      if (extra.length !== (c.extra || []).length) patch.extra = extra;
      if (Object.keys(patch).length) setCfg(p, patch);
    });
  }, [cat]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // All connection management lives on ONE page. Workflows only link to it.
  const goConnections = () => nav('/repos?return=' + encodeURIComponent('/source'));

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
    // OpenAPI/Swagger: at least one inspected specification (legacy
    // URL-verified state still counts).
    if (KIND[id] === 'url') return (c.specs || []).length > 0 || !!c.verified;
    // Item-based sources: selected items make them ready (a project/space
    // pick alone still counts, for whole-scope documentation).
    if (id === 'jira') return !!c.connected && ((c.issues || []).length > 0 || !!c.sel);
    if (id === 'notion') return !!c.connected && ((c.items || []).length > 0 || !!c.sel);
    if (id === 'confluence') return !!c.connected && ((c.items || []).length > 0 || !!c.sel);
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
      // Every non-repository source resolves to concrete selected items whose
      // full content is fetched server-side during generation.
      const srcScope = {};
      let jiraIssues = [];
      let openapiSpecs = [];
      let notionPages = [];
      let notionChildren = false;
      let confluencePages = [];
      let confluenceChildren = false;
      for (const id of sources) {
        const c = cfg[id] || {};
        if (id === 'jira' && (c.issues || []).length) {
          jiraIssues = c.issues.map((i) => i.key);
          srcScope[id] = {
            scope: jiraIssues.join(', '),
            label: jiraIssues.length + ' Jira issue' + (jiraIssues.length > 1 ? 's' : '') + ': ' + jiraIssues.join(', ')
          };
        } else if (id === 'openapi' && (c.specs || []).length) {
          openapiSpecs = c.specs.map((s) => ({ source: s.source, ops: s.ops === 'all' ? null : s.ops, title: s.title }));
          const eps = c.specs.reduce((n, s) => n + (s.ops === 'all' ? s.endpoints : s.opsCount), 0);
          srcScope[id] = {
            scope: c.specs.map((s) => s.title).join(', '),
            label: c.specs.length + ' API spec' + (c.specs.length > 1 ? 's' : '') + ' · ' + eps + ' endpoints'
          };
        } else if (id === 'notion' && (c.items || []).length) {
          notionPages = c.items.map((i) => ({ id: i.id, title: i.title, kind: i.kind }));
          notionChildren = !!c.includeChildren;
          srcScope[id] = {
            scope: c.items.map((i) => i.title).join(', '),
            label: c.items.length + ' Notion item' + (c.items.length > 1 ? 's' : '') + (notionChildren ? ' + child pages' : '')
          };
        } else if (id === 'confluence' && (c.items || []).length) {
          confluencePages = c.items.map((i) => ({ id: i.id, title: i.title }));
          confluenceChildren = !!c.includeChildren;
          srcScope[id] = {
            scope: c.items.map((i) => i.title).join(', '),
            label: c.items.length + ' Confluence page' + (c.items.length > 1 ? 's' : '') + (confluenceChildren ? ' + child pages' : '')
          };
        } else if (c.scope && c.scopeLabel) srcScope[id] = { scope: c.scope, label: c.scopeLabel };
        else if (c.sel && PICK_AFTER[id]) srcScope[id] = { scope: c.sel, label: PICK_AFTER[id] + ' ' + c.sel };
      }
      // Additional repositories (beyond the primary per host) travel with the
      // flow — each one gets its own generation with identical settings.
      const extraRepos = [];
      for (const id of hostIds) {
        ((cfg[id] || {}).extra || []).forEach((e) => extraRepos.push({ provider: id, repo: e.repo }));
        // A second host's primary is also documented separately from the flow's
        // primary repository.
        if (primary !== id && (cfg[id] || {}).sel) extraRepos.push({ provider: id, repo: cfg[id].sel });
      }
      setFlow({
        provider: primary || sources[0],
        repo: pc.sel || pc.url || ((pc.specs || [])[0] ? pc.specs[0].title : null),
        srcScope, extraRepos, jiraIssues,
        openapiSpecs, notionPages, notionChildren, confluencePages, confluenceChildren
      });
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
                // ONE panel for every code host — a pure CONSUMER of the
                // unified catalogue. Connecting accounts, organisations,
                // groups, and workspaces happens only on Repository Connections.
                const readyCount = hostIds.filter((p) => !!(cfg[p] || {}).sel).length;
                const loading = !cat;
                const provs = (cat && cat.providers) || {};
                const optionsFor = (p) => (cat ? cat.repos.filter((r) => r.provider === p) : []);
                const anyRepos = hostIds.some((p) => optionsFor(p).length > 0);
                // First pick per host becomes the primary; every further pick is
                // an EXTRA repository that gets its own generation with the
                // same settings when the user hits Generate.
                const addRepo = (p, repo, { hub = false, custom = false } = {}) => {
                  const c = cfg[p] || {};
                  const extra = c.extra || [];
                  if (repo === c.sel || extra.some((e) => e.repo === repo)) {
                    return toast('info', 'Already selected', repo + ' is already in your selection.');
                  }
                  if (!c.sel) setCfg(p, { sel: repo, custom, fromHub: hub });
                  else setCfg(p, { extra: [...extra, { repo, fromHub: hub, custom }] });
                  setAdding((a) => ({ ...a, [p]: '' }));
                  setOtherVal((o) => ({ ...o, [p]: '' }));
                };
                // Lightweight escape hatch — selecting a public repository is
                // repo SELECTION, not connection management, so it may stay.
                const addByName = (p) => {
                  const v = (otherVal[p] || '').trim();
                  if (!/^[\w.-]+\/[\w.-]+$/.test(v)) {
                    return toast('error', 'Use the owner/name format', 'For example expressjs/express — any public repository works.');
                  }
                  addRepo(p, v, { custom: true });
                };
                return (
                  <div className="srccard" style={{ borderLeftColor: readyCount === hostIds.length ? 'var(--support-success)' : 'var(--support-warning)' }}>
                    <div className="row row--between" style={{ flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <p className="h01">Select repositories</p>
                        <p className="helper mt2">Your unified catalogue — everything configured in Repository Connections.</p>
                      </div>
                      {readyCount === hostIds.length ? <span className="tag tag--green">Ready ✓</span> : <span className="tag tag--amber">Needs setup</span>}
                    </div>

                    <div className="connrow mt5">
                      {hostIds.map((p) => {
                        const pv = provs[p] || {};
                        const n = optionsFor(p).length;
                        return (
                          <span key={p} className={'connchip' + (pv.connected || n ? ' connchip--on' : '')}>
                            <span className="conndot" aria-hidden="true" />
                            {byId(p).name} · {loading ? 'Loading…'
                              : pv.connected ? 'Connected' + (pv.account ? ' as ' + pv.account : '') + ' · ' + n + ' repos'
                              : n ? n + ' repos' : 'Not connected'}
                          </span>
                        );
                      })}
                      <button type="button" className="linkbtn" style={{ marginLeft: 'auto' }} onClick={goConnections}>
                        Repository Connections
                      </button>
                    </div>

                    {loading ? (
                      <p className="helper mt5">Loading your repository catalogue…</p>
                    ) : !anyRepos ? (
                      <div className="notconn mt5">
                        <div>
                          <p className="body01"><b>No repositories available</b></p>
                          <p className="helper mt2">
                            Connect GitHub, GitLab, or Bitbucket repositories from the Repository Connections
                            page before continuing. Your progress here is saved.
                          </p>
                        </div>
                        <button type="button" className="btn btn--primary btn--sm btn--center" onClick={goConnections}>
                          Go to Repository Connections
                        </button>
                      </div>
                    ) : null}

                    {!loading && hostIds.map((p) => {
                      const c = cfg[p] || {};
                      const opts = optionsFor(p);
                      const mode = adding[p] || '';
                      if (!opts.length && !c.sel && !mode) {
                        // Nothing in the catalogue for this host: the empty
                        // state above guides to Connections; keep only the
                        // compact public-repo escape hatch.
                        return (
                          <p key={p} className="helper mt3">
                            <button type="button" className="linkbtn" onClick={() => setAdding((a) => ({ ...a, [p]: 'name' }))}>
                              ＋ Or document a public {byId(p).name} repository by owner/name
                            </button>
                          </p>
                        );
                      }
                      const picked = [c.sel, ...(c.extra || []).map((e) => e.repo)].filter(Boolean);
                      const remaining = opts.filter((r) => !picked.includes(r.name));
                      // Organisation groups keep long lists navigable — every
                      // connected org/group/workspace appears as its own group.
                      const orgs = {};
                      remaining.forEach((r) => {
                        const org = r.org || r.name.split('/')[0] || 'other';
                        (orgs[org] = orgs[org] || []).push(r);
                      });
                      const metaFor = (name, custom) => {
                        const i = opts.find((r) => r.name === name);
                        return i
                          ? [i.branch, i.private == null ? '' : (i.private ? 'Private' : 'Public'), i.ruleSetName || ''].filter(Boolean).join(' · ')
                          : custom ? 'Public repository' : '';
                      };
                      const chooser = (
                        <select className="select" style={{ flex: '1 1 260px', maxWidth: 440 }} value=""
                          aria-label={'Choose a ' + byId(p).name + ' repository'}
                          onChange={(e) => {
                            const r = opts.find((x) => x.name === e.target.value);
                            addRepo(p, e.target.value, { hub: !!(r && r.source === 'hub') });
                          }}>
                          <option value="" disabled>Choose a repository…</option>
                          {Object.keys(orgs).sort().map((org) => (
                            <optgroup key={org} label={org}>
                              {orgs[org].map((r) => (
                                <option key={r.name} value={r.name}>
                                  {[r.name, r.branch, r.ruleSetName || ''].filter(Boolean).join(' · ')}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      );
                      const nameInput = (
                        <div className="row mt3" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                          <input className="input" style={{ flex: '1 1 220px', maxWidth: 320 }}
                            placeholder="owner/name — e.g. expressjs/express" autoFocus
                            aria-label={byId(p).name + ' public repository by owner/name'}
                            value={otherVal[p] || ''}
                            onChange={(e) => setOtherVal((o) => ({ ...o, [p]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') addByName(p); }} />
                          <button type="button" className="btn btn--tertiary btn--sm btn--center" onClick={() => addByName(p)}>Add</button>
                          <button type="button" className="linkbtn" onClick={() => setAdding((a) => ({ ...a, [p]: '' }))}>Cancel</button>
                        </div>
                      );
                      return (
                        <div key={p} className="pickblock mt4">
                          <div className="pickrow">
                            <span className={'provtag prov--' + p}>{byId(p).name}</span>
                            {c.sel ? (
                              <>
                                <span className="pickrow-sel">
                                  <IcCheck />
                                  <b>{c.sel}</b>
                                  <span className="reporow-meta">{metaFor(c.sel, c.custom)}</span>
                                </span>
                                <button type="button" className="linkbtn"
                                  onClick={() => setCfg(p, { sel: '', custom: false, fromHub: false, extra: [] })}>Change</button>
                              </>
                            ) : opts.length ? chooser : (
                              <span className="helper">No {byId(p).name} repositories in your catalogue yet.</span>
                            )}
                          </div>
                          {(c.extra || []).map((e) => (
                            <div key={e.repo} className="pickrow mt2">
                              <span className={'provtag prov--' + p}>{byId(p).name}</span>
                              <span className="pickrow-sel">
                                <IcCheck />
                                <b>{e.repo}</b>
                                <span className="reporow-meta">{metaFor(e.repo, e.custom)}</span>
                              </span>
                              <button type="button" className="linkbtn"
                                onClick={() => setCfg(p, { extra: (c.extra || []).filter((x) => x.repo !== e.repo) })}>Remove</button>
                            </div>
                          ))}
                          {c.sel && (c.extra || []).length > 0 && (
                            <p className="helper mt2">Each additional repository gets its own generation with the same settings.</p>
                          )}
                          {mode === 'name' ? nameInput
                            : mode === 'list' ? (
                              <div className="row mt3" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                                {remaining.length ? chooser : <span className="helper">Every catalogue repository is selected.</span>}
                                <button type="button" className="linkbtn" onClick={() => setAdding((a) => ({ ...a, [p]: 'name' }))}>
                                  Use a public repository (owner/name)
                                </button>
                                <button type="button" className="linkbtn" onClick={() => setAdding((a) => ({ ...a, [p]: '' }))}>Cancel</button>
                              </div>
                            ) : (
                              <p className="mt2">
                                <button type="button" className="linkbtn" style={{ fontSize: 12.5 }}
                                  onClick={() => setAdding((a) => ({ ...a, [p]: c.sel ? 'list' : 'name' }))}>
                                  {c.sel ? '＋ Add another repository' : '＋ Use a public repository instead'}
                                </button>
                              </p>
                            )}
                        </div>
                      );
                    })}

                    <RepoHubCta label="Can’t find the repository you need?" action="Open Repository Connections" style={{ marginTop: 16 }} />
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
                        <OpenApiPicker cfg={c} patch={(pp) => setCfg(id, pp)} />
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
                            {id !== 'notion' && (
                              <div className="field mt5" style={{ maxWidth: 520, marginBottom: 0 }}>
                                <label htmlFor={'pick-' + id}>{PICK_AFTER[id]}{id === 'confluence' ? ' (scopes browsing below)' : ''}</label>
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
                                    The account may not have access to any {PICK_AFTER[id].toLowerCase()}s yet.
                                    {' '}<button className="linkbtn" onClick={() => reloadList(id)}>Reload list</button>
                                  </p>
                                )}
                              </div>
                            )}
                            {id === 'jira' && (
                              <JiraIssuePicker cfg={c} patch={(pp) => setCfg(id, pp)} project={c.sel || ''} />
                            )}
                            {id === 'notion' && (
                              <NotionPicker cfg={c} patch={(pp) => setCfg(id, pp)} />
                            )}
                            {id === 'confluence' && (
                              <ConfluencePicker cfg={c} patch={(pp) => setCfg(id, pp)} space={c.sel || ''} />
                            )}
                            {SCOPE[id] && !['jira', 'confluence', 'notion'].includes(id) && (
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
