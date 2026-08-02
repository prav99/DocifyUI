import React, { useEffect, useMemo, useState } from 'react';
import { api, getCatalog } from '../api.js';
import { useFlow, toast } from '../store.jsx';
import { NavBar, IcCheck, HelpLink } from '../ui.jsx';

const PLACEHOLDER = 'Provide any additional instructions for document generation. You can specify the content to include, preferred document structure, formatting requirements, target audience, sections to generate, or upload a reference file.';

const SKILL_TEMPLATE = [
  '# Docify Skill',
  '',
  'Configure how Docify writes your documents. Every directive below is',
  'applied at generation time — edit freely.',
  '',
  'tone: plain and direct',
  'audience: platform engineers integrating the API',
  '',
  '## Sections',
  '- Overview',
  '- Authentication',
  '- Quick start',
  '- Endpoints',
  '- Error handling',
  '- FAQ',
  '',
  '## Rules',
  '- Use "API key" — never "token" — outside code samples.',
  '- Every section must open with a one-sentence summary.',
  '- Include at least one curl example per endpoint.',
  '- Keep paragraphs under four sentences.',
  ''
].join('\n');

// Reference files are held as { name, text }. Sessions started before their
// contents were read may still hold bare filenames in sessionStorage.
const refFiles = (f) => (f.files || [])
  .map((x) => (typeof x === 'string' ? { name: x, text: '' } : x))
  .filter((x) => x && x.name);

// Reference text travels to the generator inside the instructions, which the
// server compiles into the writing policy with a 4,000-character budget
// (adapters/styleguide.js). Reading more than that would promise more than the
// model ever sees.
const REF_MAX_CHARS = 4000;
const REF_TEXT_RE = /\.(md|markdown|txt|text|rst|adoc|asciidoc|json|ya?ml|csv|tsv|html?|xml|toml|ini|ts|tsx|js|jsx|py|go|rb|java|sql)$/i;

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, text: String(r.result || '') });
    r.onerror = () => reject(new Error(file.name));
    r.readAsText(file);
  });
}

/* ---------------- Repository-aware suggestions ----------------
   Every hint below is a plain rule over the repository profile the server
   computes from the repository's own files (GET /hub/intel) — no model, no
   judgement. The rule and the evidence it fired on are both shown, and nothing
   is ever pre-selected, so a wrong guess is visible instead of silent. */

const HOSTS = ['github', 'gitlab', 'bitbucket'];

// Profile fields arrive from another service and can also come back out of
// sessionStorage, so shape is treated as untrusted: anything that is not a
// usable string is dropped rather than rendered.
const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v])
  .map((x) => {
    if (typeof x === 'string') return x;
    if (x && typeof x === 'object') return String(x.name || x.id || x.label || x.path || x.file || '');
    return '';
  })
  .map((s) => s.trim())
  .filter(Boolean);

const PROFILE_KEYS = ['languages', 'frameworks', 'apiSpecs', 'hasReadme', 'isMonorepo',
  'workspaces', 'services', 'deployment', 'hasTests', 'hasCi', 'signals'];

function normalizeProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw.profile && typeof raw.profile === 'object' ? raw.profile : raw;
  // A failed analysis comes back as a fully-empty profile (ok:false): every
  // list empty, hasReadme:false. Trusting it would let "hasReadme === false"
  // read as "this repository has no README" when the truth is only that Docify
  // could not read the tree — a claim the files never made. Only `=== false`,
  // so a flow-stored profile that omits `ok` still counts.
  if (p.ok === false) return null;
  // An object with none of the documented fields is not a profile — showing
  // hints derived from it would be inventing them.
  if (!PROFILE_KEYS.some((k) => p[k] !== undefined)) return null;
  return p;
}

const evidence = (items) => {
  const shown = items.slice(0, 2).map((s) => (s.length > 42 ? s.slice(0, 41) + '…' : s));
  const rest = items.length - shown.length;
  return shown.join(', ') + (rest > 0 ? ' +' + rest + ' more' : '');
};

// Dependency-style tokens are matched as whole words, not substrings: a naive
// "gin" substring would also fire on "login", inventing a framework the
// manifest never listed.
const wordsOf = (s) => s.toLowerCase().split(/[^a-z0-9.+#]+/).filter(Boolean);
const byWord = (items, tokens) => items.filter((s) => wordsOf(s).some((w) => tokens.includes(w)));

const API_FRAMEWORKS = ['express', 'fastify', 'koa', 'nest', 'nestjs', 'hapi', 'django', 'drf', 'flask',
  'fastapi', 'rails', 'sinatra', 'spring', 'laravel', 'gin', 'echo', 'chi', 'actix', 'axum', 'phoenix',
  'aspnet', 'graphql', 'grpc'];
const CLI_TOKENS = ['cli', 'commander', 'clap', 'cobra', 'argparse', 'yargs', 'oclif', 'typer'];
const LIB_TOKENS = ['library', 'sdk'];

// Returns { suggestions, notes }. `notes` are honest cautions about grounding,
// not recommendations — they never select anything.
function buildSuggestions(p, flow) {
  const out = [];
  const notes = [];
  const add = (id, why) => { if (!out.some((s) => s.id === id)) out.push({ id, why }); };

  const specs = asList(p.apiSpecs);
  const frameworks = asList(p.frameworks);
  const signals = asList(p.signals);
  const deployment = asList(p.deployment);
  const workspaces = asList(p.workspaces);
  const services = asList(p.services);

  if (specs.length) {
    add('api', 'because ' + (specs.length > 1 ? specs.length + ' API specifications were' : 'an API specification was')
      + ' found (' + evidence(specs) + ')');
  } else {
    const fw = byWord(frameworks, API_FRAMEWORKS);
    if (fw.length) add('api', 'because a server framework was detected (' + evidence(fw) + ')');
  }

  const cli = byWord(frameworks.concat(signals), CLI_TOKENS);
  const lib = byWord(frameworks.concat(signals), LIB_TOKENS);
  // A CLI parser next to a web framework usually means a frozen dependency
  // list (pip freeze pulls typer in with FastAPI) or an app with a helper
  // script — "this scans as a command-line tool" would be a wrong claim there,
  // so the CLI hint stays quiet whenever a server framework was detected.
  const webFw = byWord(frameworks, API_FRAMEWORKS);
  if ((cli.length || lib.length) && !webFw.length) {
    const what = cli.length ? 'a command-line tool' : 'a library';
    const found = evidence(cli.length ? cli : lib);
    add('quickstart', 'because this scans as ' + what + ' (' + found + '), which readers try before they read');
    add('userguide', 'because this scans as ' + what + ' (' + found + ')');
  }

  // `deployment` is the server's own evidence-backed detection (Dockerfile,
  // k8s manifests, Helm, Terraform, Vercel, Netlify, …). Trust it directly
  // rather than re-filtering it through a token list here — that only dropped
  // real deploy configs the server had already confirmed.
  if (deployment.length) {
    add('install', 'because deployment configuration was found (' + evidence(deployment) + ')');
    add('admin', 'because deployment configuration was found (' + evidence(deployment) + ')');
  }

  // hasReadme:false only means "absent" when the whole tree was listed. On a
  // truncated listing the README may simply be in the part the provider did
  // not return — the same gate the server applies to its no_readme signal.
  if (p.hasReadme === false && p.treeComplete === true) {
    add('userguide', 'because there is no README — nothing in the repository explains it in prose yet');
    notes.push('No README was found. Docify grounds documents on the files it reads, so a repository with no prose '
      + 'gives it less to work from — the instructions box below is the fastest way to supply that context.');
  }

  const jira = (flow.jiraIssues || []).length;
  if (jira) add('relnotes', 'because you selected ' + jira + ' Jira issue' + (jira > 1 ? 's' : '') + ' as a source');

  if (p.isMonorepo === true) {
    const parts = workspaces.length ? workspaces : services;
    notes.push('This looks like a monorepo' + (parts.length ? ' (' + evidence(parts) + ')' : '')
      + '. One run documents one repository, not one package — name the package or path you want in the instructions below.');
  }

  return { suggestions: out.slice(0, 4), notes };
}

// A profile carried in the flow is reused only when it is unambiguously this
// repository's — a leftover profile from a previously chosen repository would
// produce confident, wrong hints. Nothing is written back to the flow here for
// the same reason: a cache with no ownership stamp is worse than a refetch.
function storedProfileFor(flow) {
  const raw = flow.repoProfile;
  if (!raw || typeof raw !== 'object') return null;
  const p = raw.profile && typeof raw.profile === 'object' ? raw.profile : raw;
  // repo AND provider AND branch: "foo/bar" exists on more than one host, and
  // two branches of one repository can profile differently — a partial match
  // would produce confident hints about the wrong tree.
  const tag = (k) => String(p[k] || raw[k] || '');
  if (tag('repo') !== String(flow.repo || '')) return null;
  if (tag('provider') && flow.provider && tag('provider') !== String(flow.provider)) return null;
  if (tag('branch') && flow.branch && tag('branch') !== String(flow.branch)) return null;
  return normalizeProfile(raw);
}

// The Source step may already hold the profile in the flow; reuse it rather
// than paying for a second scan. A missing or failing profile is not an error
// state on this step — the hint simply does not appear.
function useRepoProfile(flow) {
  const stored = useMemo(() => storedProfileFor(flow), [flow.repoProfile, flow.repo]); // eslint-disable-line react-hooks/exhaustive-deps
  const provider = String(flow.provider || '');
  const repo = String(flow.repo || '');
  const branch = String(flow.branch || '');
  const [profile, setProfile] = useState(stored);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (stored) { setProfile(stored); setLoading(false); return; }
    if (!repo || !HOSTS.includes(provider)) { setProfile(null); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    const q = '/hub/intel?provider=' + encodeURIComponent(provider) + '&repo=' + encodeURIComponent(repo)
      + (branch ? '&branch=' + encodeURIComponent(branch) : '');
    api(q)
      .then((d) => { if (alive) setProfile(normalizeProfile(d)); })
      .catch(() => { if (alive) setProfile(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [stored, provider, repo, branch]);
  return { profile, loading };
}

export default function DocType() {
  const { flow, setFlow } = useFlow();
  const [catalog, setCatalog] = useState(null);
  const [catErr, setCatErr] = useState('');
  const [reload, setReload] = useState(0);
  const [reading, setReading] = useState(false);
  const [fwOpen, setFwOpen] = useState(null); // doc type id with expanded framework
  useEffect(() => {
    let alive = true;
    setCatErr('');
    getCatalog()
      .then((c) => { if (alive) setCatalog(c); })
      .catch((e) => { if (alive) setCatErr(e.message || 'Could not load the document catalogue'); });
    return () => { alive = false; };
  }, [reload]);
  const { profile, loading: intelLoading } = useRepoProfile(flow);
  if (catErr) {
    return (
      <div className="page">
        <div className="genfail" role="alert">
          <b>Could not load document types.</b> <span>{catErr}</span>
          <button className="btn btn--tertiary btn--sm btn--center" style={{ marginLeft: 12 }}
            onClick={() => setReload((n) => n + 1)}>Try again</button>
        </div>
      </div>
    );
  }
  if (!catalog) {
    return (
      <div className="page" aria-busy="true">
        <h1 className="h04">What should Docify produce?</h1>
        <p className="body01 t2 mt3" role="status">Loading document types…</p>
        <div className="grid3 mt7" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="tile" style={{ minHeight: 116 }}>
              <div className="skel w60" /><div className="skel w90" /><div className="skel w80" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const types = catalog.doctypes[flow.track] || [];

  function setTrack(t) {
    if (flow.track === t) return;
    setFlow({ track: t, docTypes: [], format: t === 'technical' ? 'dita' : 'pdf', genId: null });
  }
  function toggleType(id) {
    setFlow((f) => ({
      docTypes: f.docTypes.includes(id) ? f.docTypes.filter((x) => x !== id) : [...f.docTypes, id],
      genId: null
    }));
  }
  async function addFiles(input) {
    const picked = Array.from(input.files || []);
    input.value = '';
    if (!picked.length) return;
    // Read in the browser, so only text formats work here — a PDF or .docx
    // would arrive as mojibake, which is worse than refusing it.
    const isText = (f) => REF_TEXT_RE.test(f.name) || String(f.type || '').startsWith('text/');
    const rejected = picked.filter((f) => !isText(f));
    const usable = picked.filter(isText);
    if (rejected.length) {
      toast('error', 'Text files only',
        rejected.map((f) => f.name).join(', ') + ' — reference files are read in your browser, so PDF and Word are not supported here.');
    }
    if (!usable.length) return;
    setReading(true);
    let read;
    try {
      read = await Promise.all(usable.map(readAsText));
    } catch (e) {
      setReading(false);
      return toast('error', 'Could not read file', e.message + ' — try a plain .md or .txt file');
    }
    setReading(false);
    const existing = refFiles(flow);
    let used = existing.reduce((n, x) => n + x.text.length, 0);
    const added = [];
    let trimmed = false;
    for (const r of read) {
      const room = REF_MAX_CHARS - used;
      if (room <= 0) { trimmed = true; break; }
      const text = r.text.slice(0, room);
      if (text.length < r.text.length) trimmed = true;
      added.push({ name: r.name, text });
      used += text.length;
    }
    if (!added.length) {
      return toast('info', 'Reference limit reached',
        'Reference text and your typed instructions share ' + REF_MAX_CHARS.toLocaleString() + ' characters. Remove a file to add another.');
    }
    setFlow({ files: [...existing, ...added], genId: null });
    if (trimmed) {
      toast('info', 'Reference text trimmed',
        'Only the first ' + REF_MAX_CHARS.toLocaleString() + ' characters in total are attached — the rest was left out.');
    } else {
      toast('success', added.length + (added.length > 1 ? ' reference files added' : ' reference file added'),
        'Their text is sent with your instructions for every document in this run.');
    }
  }

  function readSkill(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (file.size > 60000) return toast('error', 'File too large', 'SKILL.md must be under 60 KB');
    const reader = new FileReader();
    reader.onload = () => {
      setFlow({ skillName: file.name, skillContent: String(reader.result || ''), genId: null });
      toast('success', 'Skill loaded', file.name + ' will shape every document in this run');
    };
    reader.onerror = () => toast('error', 'Could not read file', 'Try again or use a plain .md file');
    reader.readAsText(file);
  }

  function downloadSkillTemplate() {
    const blob = new Blob([SKILL_TEMPLATE], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SKILL.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const count = flow.docTypes.length;
  const refs = refFiles(flow);

  // A suggestion is only offered when this track actually sells that document
  // type, so the panel can never point at something the grid below does not
  // contain.
  const advice = profile ? buildSuggestions(profile, flow) : { suggestions: [], notes: [] };
  const suggestions = advice.suggestions
    .map((s) => ({ ...s, def: types.find((t) => t.id === s.id) }))
    .filter((s) => s.def);
  const suggestedIds = new Set(suggestions.map((s) => s.id));
  const unpicked = suggestions.filter((s) => !flow.docTypes.includes(s.id)).map((s) => s.id);
  const applyAll = () => {
    if (!unpicked.length) return;
    setFlow((f) => ({ docTypes: [...f.docTypes, ...unpicked.filter((id) => !f.docTypes.includes(id))], genId: null }));
  };

  return (
    <>
      <div className="page">
        <div className="row row--between" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h1 className="h04">What should Docify produce?</h1>
          <HelpLink topic="doctype" />
        </div>
        <p className="body01 t2 mt3">Pick a track, then select one or more document types. Selections generate together as a set.</p>

        <div className="row mt7" style={{ gap: 0 }}>
          <button className={'chip' + (flow.track === 'technical' ? ' on' : '')} style={{ height: 40 }}
            onClick={() => setTrack('technical')}>Technical documentation</button>
          <button className={'chip' + (flow.track === 'marketing' ? ' on' : '')} style={{ height: 40 }}
            onClick={() => setTrack('marketing')}>Marketing material</button>
        </div>

        {intelLoading && (
          <p className="helper mt6" role="status">Reading {flow.repo || 'your repository'} to suggest document types…</p>
        )}

        {!intelLoading && suggestions.length > 0 && (
          <section className="tile tile--white mt6" aria-labelledby="sugHead"
            style={{ padding: 20, maxWidth: 860, borderLeft: '3px solid var(--link-primary)' }}>
            <div className="row row--between" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
              <h2 className="h02" id="sugHead">Suggested for this repository</h2>
              {flow.repo ? <span className="tag tag--outline">{flow.repo}</span> : null}
            </div>
            <p className="helper mt2">
              Matched by rule from what Docify found in the repository — specs, dependencies, and configuration
              files. It is a starting point, not a verdict: nothing is selected until you select it.
            </p>
            <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {suggestions.map((s) => {
                const on = flow.docTypes.includes(s.id);
                return (
                  <li key={s.id} className="row row--between" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <span className="body01" style={{ flex: '1 1 320px' }}>
                      <b>{s.def.name}</b> <span className="helper">— {s.why}</span>
                    </span>
                    <button className="btn btn--tertiary btn--sm" aria-pressed={on}
                      onClick={() => toggleType(s.id)}>
                      {on ? 'Selected ✓' : 'Add ' + s.def.name}
                    </button>
                  </li>
                );
              })}
            </ul>
            {unpicked.length > 1 && (
              <button className="btn btn--secondary btn--sm mt5" onClick={applyAll}>
                Select all {unpicked.length} suggestions
              </button>
            )}
            {advice.notes.map((n) => (
              <p key={n} className="helper mt5" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>{n}</p>
            ))}
          </section>
        )}

        {!intelLoading && suggestions.length === 0 && advice.notes.length > 0 && (
          <div className="mt6" style={{ maxWidth: 860 }}>
            {advice.notes.map((n) => <p key={n} className="helper">{n}</p>)}
          </div>
        )}

        {types.length === 0 && (
          <p className="body01 t2 mt6">No document types are available for this track right now. Switch tracks, or reload the page.</p>
        )}

        <div className="grid3 mt6">
          {types.map((d) => {
            const on = flow.docTypes.includes(d.id);
            return (
              <div key={d.id} className={'tile tile--click cbtile' + (on ? ' tile--selected' : '')}
                role="checkbox" aria-checked={on} tabIndex={0}
                aria-label={d.name + ' — ' + d.desc + (suggestedIds.has(d.id) ? ' (suggested for this repository)' : '')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleType(d.id); } }}
                onClick={() => toggleType(d.id)}>
                <span className="cb">{on ? <IcCheck c="#ffffff" /> : null}</span>
                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <p className="h01">{d.name}</p>
                  {d.common ? <span className="tag tag--blue">Most common</span> : null}
                  {suggestedIds.has(d.id) ? <span className="tag tag--teal">Suggested</span> : null}
                </div>
                <p className="helper mt2">{d.desc}</p>
                {d.standard ? <div className="mt3"><span className="tag tag--outline">{d.standard}</span></div> : null}
                {d.framework && (
                  <>
                    {/* The tile's own key handler calls preventDefault, which
                        swallows Space on this button and toggles the document
                        type instead — the key event must stop at the button. */}
                    <button className="fwlink" aria-expanded={fwOpen === d.id}
                      onKeyDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); setFwOpen(fwOpen === d.id ? null : d.id); }}>
                      {fwOpen === d.id ? 'Hide standard framework' : 'Standard framework →'}
                    </button>
                    {fwOpen === d.id && (
                      <div className="fwpanel" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <p className="fwrow"><b>Purpose</b> {d.framework.purpose}</p>
                        <p className="fwrow"><b>Audience</b> {d.framework.audience}</p>
                        <p className="fwrow"><b>Tone</b> {d.framework.tone}</p>
                        <p className="fwrow"><b>Outline</b> {d.framework.outline.map((o) => o.name + (o.req ? '' : ' (optional)')).join(' · ')}</p>
                        <p className="fwrow"><b>Rules</b></p>
                        <ul className="fwrules">
                          {d.framework.rules.map((r) => <li key={r}>{r}</li>)}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {flow.track === 'marketing' && (
          <div className="tile tile--white mt7" style={{ padding: 24, maxWidth: 720 }}>
            <h2 className="h02">Brief</h2>
            <p className="helper mt2">Two answers and a tone — that&apos;s all the marketing generator needs.</p>
            <div className="field mt5">
              <label htmlFor="brAud">Who is this for?</label>
              <input id="brAud" className="input" placeholder="e.g. platform engineers evaluating payment APIs"
                defaultValue={flow.briefAudience} onInput={(e) => setFlow({ briefAudience: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="brEmp">What&apos;s the one thing to emphasize?</label>
              <input id="brEmp" className="input" placeholder="e.g. idempotent retries now built in"
                defaultValue={flow.briefEmphasis} onInput={(e) => setFlow({ briefEmphasis: e.target.value })} />
            </div>
            <p className="label01 t2 mb3">Tone</p>
            <div className="row">
              {['Plain & direct', 'Confident', 'Playful'].map((t) => (
                <button key={t} className={'chip' + (flow.briefTone === t ? ' on' : '')}
                  onClick={() => setFlow({ briefTone: t })}>{t}</button>
              ))}
            </div>
          </div>
        )}

        <div className="tile tile--white composer mt7">
          <div className="composer-top">
            <div className="row row--between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <h2 className="h02">Customize the generation</h2>
              {flow.skillName
                ? <span className="tag tag--green">Skill active ✓</span>
                : <span className="tag tag--blue">SKILL.md recommended</span>}
            </div>
            <p className="helper mt2">
              Optional — one place for everything. Write instructions, attach a SKILL.md to control
              sections, tone and terminology, or add reference files: their text is read here and sent with your typed
              instructions, which share about {REF_MAX_CHARS.toLocaleString()} characters per run. Applies to every
              document in this run.
            </p>
            <textarea className="composer-ta" rows={4} placeholder={PLACEHOLDER}
              defaultValue={flow.instructions} onInput={(e) => setFlow({ instructions: e.target.value })} />
          </div>

          {(flow.skillName || refs.length > 0) && (
            <div className="composer-chips">
              {flow.skillName && (
                <span className="filechip filechip--skill">
                  <IcCheck />
                  {flow.skillName} · {Math.max(1, Math.round((flow.skillContent || '').length / 1024))} KB
                  <button aria-label="Remove skill" onClick={() => setFlow({ skillName: '', skillContent: '', genId: null })}>✕</button>
                </span>
              )}
              {refs.map((f, i) => (
                <span key={f.name + i} className="filechip">
                  {f.name}{f.text ? ' · ' + f.text.length.toLocaleString() + ' chars' : ''}
                  <button aria-label="Remove"
                    onClick={() => setFlow((fl) => ({ files: refFiles(fl).filter((_, k) => k !== i), genId: null }))}>✕</button>
                </span>
              ))}
            </div>
          )}

          <div className="composer-bar">
            <label className="attachbtn" title="Controls sections, tone, audience, and terminology rules">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M9 1H3v14h10V5L9 1zm0 1.5L11.5 5H9V2.5zM5 8h6v1H5V8zm0 3h6v1H5v-1z"/></svg>
              {flow.skillName ? 'Replace SKILL.md' : 'Attach SKILL.md'}
              <input type="file" accept=".md,.markdown,.txt" style={{ display: 'none' }} onChange={(e) => readSkill(e.target)} />
            </label>
            <label className="attachbtn" title={'Style guides, existing docs, or templates — text files, read here and sent with your instructions (' + REF_MAX_CHARS.toLocaleString() + ' characters in total)'}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M10.6 2.6a2.5 2.5 0 0 1 3.5 3.5l-7 7a4 4 0 0 1-5.7-5.6L7.8 1l.9.9-6.4 6.5a2.7 2.7 0 0 0 3.9 3.8l7-7a1.2 1.2 0 0 0-1.7-1.7L5.3 9.7a.3.3 0 0 0 .4.4L11 4.8l.9.9-5.3 5.3a1.6 1.6 0 0 1-2.2-2.2l6.2-6.2z"/></svg>
              {reading ? 'Reading…' : 'Add reference files'}
              <input type="file" multiple accept=".md,.markdown,.txt,.text,.rst,.adoc,.asciidoc,.json,.yaml,.yml,.csv,.tsv,.html,.htm,.xml,.toml,.ini,text/*"
                style={{ display: 'none' }} disabled={reading} onChange={(e) => addFiles(e.target)} />
            </label>
            <button className="linkbtn" style={{ fontSize: 13, padding: '0 8px' }} onClick={downloadSkillTemplate}>SKILL.md template</button>
            <span style={{ flex: 1 }} />
            <span className="helper">Text files · .md · .txt · .yaml · .json</span>
          </div>
        </div>
      </div>
      <NavBar back="/source" next="/format" disabled={count === 0}
        note={count === 0 ? 'Select at least one document type' : count + ' type' + (count > 1 ? 's' : '') + ' selected'} />
    </>
  );
}
