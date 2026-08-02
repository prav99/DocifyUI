import React, { useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/* Repository intelligence, shown under a chosen repository in the wizard.
   Everything here is rendered from GET /hub/intel — nothing is assumed and
   nothing is invented. The endpoint fails soft (200 + an empty profile), so
   the only correct behaviour for a missing, partial, or failed profile is to
   render nothing at all: this panel is additive and must never become an
   error state, a retry prompt, or a blocker in the middle of the flow. */

const MAX_SIGNALS = 4;   // a wall of findings reads as noise, not help
const MAX_CHIPS = 8;
const MAX_SPEC_OFFERS = 2;

// The contract lists these as arrays; be liberal about whether the server
// sends plain strings or objects, and drop anything that isn't usable.
function names(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const x of list) {
    const v = typeof x === 'string' ? x : x && typeof x === 'object' ? (x.name || x.label || x.id) : '';
    const s = String(v || '').trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

function paths(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const x of list) {
    const v = typeof x === 'string' ? x : x && typeof x === 'object' ? (x.path || x.file || x.name) : '';
    const s = String(v || '').trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

function Signal({ sig }) {
  const warn = sig.level === 'warn';
  const amber = 'var(--support-warning-text, #8e6a00)';
  const detail = String(sig.detail || '').trim();
  const evidence = String(sig.evidence || '').trim();
  const head = (
    <>
      <span aria-hidden="true" style={{ color: warn ? amber : 'var(--text-placeholder)' }}>{warn ? '⚠' : '·'}</span>
      {' '}
      <b style={{ fontWeight: 600, color: warn ? amber : 'var(--text-primary)' }}>{sig.title}</b>
      {detail ? <span style={{ color: 'var(--text-secondary)' }}> — {detail}</span> : null}
    </>
  );
  // Only offer a disclosure when there is something behind it; an empty
  // expander implies evidence the server never sent.
  if (!evidence) return <p className="helper" style={{ marginTop: 4, lineHeight: 1.5 }}>{head}</p>;
  return (
    <details style={{ marginTop: 4 }}>
      <summary className="helper" style={{ cursor: 'pointer', lineHeight: 1.5 }} title={evidence}>{head}</summary>
      <p className="helper mono" style={{ margin: '4px 0 0 16px', fontSize: 11.5, wordBreak: 'break-word' }}>{evidence}</p>
    </details>
  );
}

export default function RepoInsights({ provider, repo, branch, isSpecAdded, onAddSpec }) {
  const [profile, setProfile] = useState(null);
  const [adding, setAdding] = useState('');
  // Monotonic request id: a repository switched mid-flight must not have the
  // previous repository's answer land in this panel.
  const seq = useRef(0);

  useEffect(() => {
    setProfile(null);
    if (!provider || !repo) return undefined;
    const mine = ++seq.current;
    // Never on page load, and never on every keystroke of a repository change.
    const t = setTimeout(() => {
      api('/hub/intel?provider=' + encodeURIComponent(provider) +
        '&repo=' + encodeURIComponent(repo) +
        '&branch=' + encodeURIComponent(branch || ''))
        .then((d) => { if (seq.current === mine) setProfile(d && typeof d === 'object' ? d : {}); })
        .catch(() => { if (seq.current === mine) setProfile({}); });
    }, 400);
    return () => { clearTimeout(t); seq.current += 1; };
  }, [provider, repo, branch]);

  if (!profile) return null; // still debouncing or in flight — stay silent
  // A soft-failed analysis (ok:false) may still carry a "could not analyse"
  // signal. Rendering it would show a failure reason under a "Detected
  // automatically from the files" footer — a self-contradiction. Treat it as
  // empty, exactly as DocType does.
  if (profile.ok === false) return null;

  const languages = names(profile.languages);
  const frameworks = names(profile.frameworks);
  const managers = names(profile.packageManagers);
  // Normalise once, so the path shown to the customer is exactly the path sent
  // to /openapi/inspect and stored on the source.
  const specs = [...new Set(paths(profile.apiSpecs).map((s) => s.replace(/^\/+/, '')))].filter(Boolean);
  const signals = (Array.isArray(profile.signals) ? profile.signals : [])
    .filter((s) => s && typeof s === 'object' && String(s.title || '').trim())
    .slice(0, MAX_SIGNALS);

  const chips = [...languages, ...frameworks, ...managers];
  if (profile.isMonorepo) {
    const n = Array.isArray(profile.workspaces) ? profile.workspaces.length : 0;
    chips.unshift(n ? 'Monorepo · ' + n + ' package' + (n > 1 ? 's' : '') : 'Monorepo');
  }
  const shown = chips.slice(0, MAX_CHIPS);
  const hiddenChips = chips.length - shown.length;

  // profile.branch is the branch the analysis actually READ (the server
  // resolves the real default when the requested one is empty or wrong). The
  // spec lives on that branch, so fetching it against the requested branch
  // would 404 on any repo whose default is not "main".
  const specSource = (path) => ({ provider, repo, branch: profile.branch || branch || 'main', path });
  const offers = onAddSpec
    ? specs.filter((s) => !(isSpecAdded && isSpecAdded(specSource(s))))
    : [];

  // An empty profile is the documented soft-failure. Render nothing.
  if (!shown.length && !signals.length && !offers.length) return null;

  async function add(path) {
    setAdding(path);
    try { await onAddSpec(specSource(path)); }
    finally { setAdding(''); }
  }

  return (
    <div className="mt3" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
      <p className="helper" style={{ color: 'var(--text-secondary)' }}>
        Detected in <b className="mono" style={{ fontSize: 11.5 }}>{repo}</b>
      </p>

      {shown.length > 0 && (
        <div className="row mt2" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {shown.map((c) => <span key={c} className="tag tag--outline">{c}</span>)}
          {hiddenChips > 0 ? <span className="helper">+{hiddenChips} more</span> : null}
        </div>
      )}

      {signals.length > 0 && (
        <div className="mt2">
          {signals.map((s, i) => <Signal key={s.id || i} sig={s} />)}
        </div>
      )}

      {offers.slice(0, MAX_SPEC_OFFERS).map((path) => (
        <div key={path} className="row mt3" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="helper">
            API specification found at <b className="mono" style={{ fontSize: 11.5 }}>{path}</b>
          </span>
          <button type="button" className="btn btn--tertiary btn--sm btn--center"
            disabled={!!adding} onClick={() => add(path)}>
            {adding === path ? 'Reading spec…' : 'Add this spec as a source'}
          </button>
        </div>
      ))}
      {offers.length > MAX_SPEC_OFFERS && (
        <p className="helper mt2">
          {offers.length - MAX_SPEC_OFFERS} further specification{offers.length - MAX_SPEC_OFFERS > 1 ? 's' : ''} found —
          add {offers.length - MAX_SPEC_OFFERS > 1 ? 'them' : 'it'} from the API specification source.
        </p>
      )}

      <p className="helper mt3" style={{ color: 'var(--text-placeholder)' }}>
        Detected automatically from the files in this repository. It is a quick scan, so it can miss
        things, and it is not a judgement about your code. Docify only reads your repository — it never changes it.
      </p>
    </div>
  );
}
