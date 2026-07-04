import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getCatalog } from '../api.js';
import { useFlow, toast } from '../store.jsx';
import { NavBar, ScoreTag, IcCheck } from '../ui.jsx';

/* =====================================================================
   Auto-regenerate on merge — the orchestration module.
   Views: profile list (management dashboard) → 6-step wizard → profile
   detail (webhook, simulations, run history, effectiveness trends).
   ===================================================================== */

const WIZ_STEPS = ['Repository', 'Branch', 'Merge triggers', 'Documents', 'AI quality & ranking', 'Publish & notify'];

const DEFAULT_CFG = {
  provider: 'github', repo: '',
  branch: 'main',
  events: { push: true, mergedPr: true }, pathFilter: '',
  track: 'technical', docTypes: ['api'], format: 'markdown',
  templateFrom: 'latest', updatePolicy: 'auto', versioning: 'semver-patch',
  gate: 85, minAssistant: 0, autoFix: true, requireApproval: false,
  publishTo: 'workspace', notifyEmail: '', notifyOn: { success: true, blocked: true, failure: true }
};

const POLICY_DESC = {
  auto: 'DocGen analyzes each merge — release metadata creates a version, mapped file changes refresh impacted sections, routine merges update in place. Never a duplicate.',
  update: 'Always update the mapped document in place.',
  create: 'Always create a new document per merge.',
  version: 'Every merge produces a new version of the mapped document.'
};

const OUTCOME_TAG = {
  published: ['tag--green', 'Published'],
  held: ['tag--red', 'Gate blocked'],
  'awaiting-approval': ['tag--amber', 'Awaiting approval']
};

const TRIGGER_LABEL = { webhook: 'Merge (webhook)', simulate: 'Simulated merge', manual: 'Manual run' };

function fmtWhen(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

/* ---------------- Toggle row ---------------- */
function Tog({ on, label, sub, onClick }) {
  return (
    <div className={'toggle' + (on ? ' on' : '')} onClick={onClick} style={{ alignItems: 'flex-start' }}>
      <span className="track" style={{ marginTop: 2 }} />
      <span>
        <span className="body01" style={{ display: 'block' }}>{label}</span>
        {sub && <span className="helper">{sub}</span>}
      </span>
    </div>
  );
}

/* ---------------- Live pipeline preview: builds itself as you configure ---------------- */
function PipelinePreview({ cfg, step, name }) {
  const blocks = [
    {
      steps: [0, 1, 2], label: 'ON MERGE',
      lines: [
        cfg.repo || '· choose a repository',
        'branch ' + cfg.branch,
        [cfg.events.push && 'pushes', cfg.events.mergedPr && 'merged PRs'].filter(Boolean).join(' + ') || '⚠ no trigger events enabled',
        cfg.pathFilter ? 'paths: ' + cfg.pathFilter : null
      ]
    },
    {
      steps: [3], label: 'GENERATE OR UPDATE',
      lines: [
        cfg.docTypes.length ? cfg.docTypes.join(', ') : '· choose document types',
        (cfg.format ? cfg.format.toUpperCase() : '· format') + ' · policy: ' + cfg.updatePolicy +
          (cfg.updatePolicy === 'auto' || cfg.updatePolicy === 'version' ? ' · ' + cfg.versioning : '')
      ]
    },
    {
      steps: [4], label: 'JUDGE & RANK',
      lines: [
        'quality gate ≥ ' + cfg.gate + (cfg.minAssistant ? ' · AI rank ≥ ' + cfg.minAssistant + '%' : ''),
        (cfg.autoFix ? 'auto-fix every finding' : 'fixes stay manual') + (cfg.requireApproval ? ' · human approval' : '')
      ]
    },
    {
      steps: [5], label: 'PUBLISH & NOTIFY',
      lines: [
        cfg.publishTo === 'workspace' ? 'workspace + export center' : 'export center only',
        'notify ' + (cfg.notifyEmail || 'account email') + ' · ' +
          [cfg.notifyOn.success && 'published', cfg.notifyOn.blocked && 'blocked', cfg.notifyOn.failure && 'failed'].filter(Boolean).join(', ')
      ]
    }
  ];
  return (
    <aside className="piperail">
      <p className="label01" style={{ color: '#78a9ff' }}>YOUR PIPELINE — LIVE PREVIEW</p>
      <p className="h01 mt2" style={{ color: '#ffffff' }}>{name}</p>
      {blocks.map((b, k) => (
        <React.Fragment key={b.label}>
          {k > 0 && <div className="pr-arrow">↓</div>}
          <div className={'pr-block' + (b.steps.includes(step) ? ' on' : '')}>
            <span className="pr-label mono">{b.label}</span>
            {b.lines.filter(Boolean).map((l) => <span key={l} className="pr-line">{l}</span>)}
          </div>
        </React.Fragment>
      ))}
      <p className="helper mt3" style={{ color: '#8d8d8d' }}>
        This exact flow executes on every merge — updating live as you configure.
      </p>
    </aside>
  );
}

/* Carbon-style slider with a live mono readout */
function Slider({ id, label, min, max, value, onChange, suffix = '' }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="rngrow">
        <input id={id} className="rng" type="range" min={min} max={max} value={value}
          onChange={(e) => onChange(Number(e.target.value))} />
        <span className="rngval mono">{value}{suffix}</span>
      </div>
    </div>
  );
}

/* ---------------- The 6-step wizard ---------------- */
function Wizard({ existing, catalog, onDone }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(existing ? existing.name : 'Documentation pipeline');
  const [cfg, setCfg] = useState(existing ? { ...DEFAULT_CFG, ...existing.config } : { ...DEFAULT_CFG });
  const [repos, setRepos] = useState(null);
  const [branches, setBranches] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));

  useEffect(() => {
    setRepos(null);
    api('/repos?provider=' + cfg.provider).then((d) => setRepos(d.repos || [])).catch(() => setRepos([]));
  }, [cfg.provider]);

  useEffect(() => {
    if (step !== 1 || !cfg.repo) return;
    setBranches(null);
    api('/automation/branches?repo=' + encodeURIComponent(cfg.repo))
      .then(setBranches).catch(() => setBranches({ branches: ['main'], live: false }));
  }, [step, cfg.repo]);

  const types = (catalog.doctypes[cfg.track] || []);
  const formats = (catalog.formats[cfg.track] || []).filter((f) => f.ok);
  const canNext = step === 0 ? !!cfg.repo : step === 3 ? cfg.docTypes.length > 0 && !!cfg.format : true;

  async function saveProfile() {
    setSaving(true);
    try {
      const body = { name, config: cfg };
      const d = existing
        ? await api('/profiles/' + existing.id, { method: 'PUT', body })
        : await api('/profiles', { method: 'POST', body });
      toast('success', existing ? 'Pipeline updated' : 'Pipeline created',
        name + ' — automation runs on every merge to ' + cfg.branch);
      onDone(d.profile);
    } catch (e) { toast('error', 'Could not save', e.message); setSaving(false); }
  }

  return (
    <div>
      <button className="linkbtn" onClick={() => onDone(null)}>← All pipelines</button>
      <h1 className="h04 mt3">{existing ? 'Edit: ' + existing.name : 'New automation pipeline'}</h1>
      <p className="body01 t2 mt3">Configure once — every merge then executes these six steps automatically.</p>

      <div className="wizhead mt6">
        {WIZ_STEPS.map((s, i) => (
          <button key={s} className={'wizstep' + (i === step ? ' on' : i < step ? ' done' : '')} onClick={() => setStep(i)}>
            <span className="wiznum mono">{i < step ? '✓' : i + 1}</span>{s}
          </button>
        ))}
      </div>

      <div className="wizgrid mt5">
      <div className="tile tile--white" style={{ padding: 24 }}>
        {step === 0 && (
          <>
            <h2 className="h02 mb2">Step 1 · Connect repository</h2>
            <p className="helper mb5">The repository this pipeline watches. Documents it produces are mapped to this repo.</p>
            <p className="label01 t2 mb3">CODE HOST</p>
            <div className="row">
              {['github', 'gitlab', 'bitbucket'].map((p) => (
                <button key={p} className={'chip' + (cfg.provider === p ? ' on' : '')}
                  onClick={() => set({ provider: p, repo: '' })}>{p === 'github' ? 'GitHub' : p === 'gitlab' ? 'GitLab' : 'Bitbucket'}</button>
              ))}
            </div>
            <div className="field mt5">
              <label htmlFor="wzrepo">Repository</label>
              {repos === null ? <p className="helper">Loading repositories…</p> : (
                <select id="wzrepo" className="select" value={cfg.repo} onChange={(e) => set({ repo: e.target.value })}>
                  <option value="">Select a repository…</option>
                  {repos.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
                </select>
              )}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="h02 mb2">Step 2 · Select branch</h2>
            <p className="helper mb5">Merges to this branch trigger the pipeline. Patterns like <span className="mono">release/*</span> are supported.</p>
            <div className="field">
              <label htmlFor="wzbr">Watch branch</label>
              <select id="wzbr" className="select" value={branches && branches.branches.includes(cfg.branch) ? cfg.branch : '__pat'}
                onChange={(e) => { if (e.target.value !== '__pat') set({ branch: e.target.value }); }}>
                {(branches ? branches.branches : ['main']).map((b) => <option key={b} value={b}>{b}</option>)}
                <option value="__pat">{cfg.branch.includes('*') ? cfg.branch + ' (pattern)' : 'Custom pattern…'}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="wzpat">Or a custom pattern</label>
              <input id="wzpat" className="input" placeholder="e.g. release/*" defaultValue={cfg.branch.includes('*') ? cfg.branch : ''}
                onBlur={(e) => { const v = e.target.value.trim(); if (v) set({ branch: v }); }} />
            </div>
            <p className="helper">{branches ? (branches.live ? 'Branches loaded live from ' + branches.provider + ' · ' + branches.repo : 'Showing known branches — type a pattern for anything else.') : 'Loading branches…'}</p>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="h02 mb2">Step 3 · Merge triggers</h2>
            <p className="helper mb5">Which events run the pipeline, and which file changes count.</p>
            <div className="stack">
              <Tog on={cfg.events.push} label="Direct pushes / merges to the branch"
                sub="GitHub, GitLab, and Bitbucket push events"
                onClick={() => set({ events: { ...cfg.events, push: !cfg.events.push } })} />
              <Tog on={cfg.events.mergedPr} label="Merged pull requests"
                sub="Fires only when a PR is merged — not on open or sync"
                onClick={() => set({ events: { ...cfg.events, mergedPr: !cfg.events.mergedPr } })} />
            </div>
            <div className="field mt5">
              <label htmlFor="wzpath">Path filter (optional)</label>
              <input id="wzpath" className="input" placeholder="e.g. src/, api/  — comma separated; empty = all changes"
                defaultValue={cfg.pathFilter} onBlur={(e) => set({ pathFilter: e.target.value.trim() })} />
            </div>
            <p className="helper">When set, merges whose changed files match none of these paths are ignored.</p>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="h02 mb2">Step 4 · Documents to generate or update</h2>
            <p className="helper mb5">What this pipeline maintains, and how it avoids duplicates.</p>
            <div className="row mb5" style={{ gap: 0 }}>
              {[['technical', 'Technical documentation'], ['marketing', 'Marketing material']].map(([t, l]) => (
                <button key={t} className={'chip' + (cfg.track === t ? ' on' : '')}
                  onClick={() => set({ track: t, docTypes: [], format: '' })}>{l}</button>
              ))}
            </div>
            <p className="label01 t2 mb3">DOCUMENT TYPES</p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {types.map((d) => (
                <button key={d.id} className={'chip' + (cfg.docTypes.includes(d.id) ? ' on' : '')}
                  onClick={() => set({ docTypes: cfg.docTypes.includes(d.id) ? cfg.docTypes.filter((x) => x !== d.id) : [...cfg.docTypes, d.id] })}>
                  {d.name}
                </button>
              ))}
            </div>
            <div className="grid2 mt5">
              <div className="field">
                <label htmlFor="wzfmt">Output format</label>
                <select id="wzfmt" className="select" value={cfg.format} onChange={(e) => set({ format: e.target.value })}>
                  <option value="">Select…</option>
                  {formats.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="wztpl">Options &amp; skill template</label>
                <select id="wztpl" className="select" value={cfg.templateFrom} onChange={(e) => set({ templateFrom: e.target.value })}>
                  <option value="latest">Reuse my latest generation&apos;s configuration</option>
                  <option value="defaults">Standard defaults</option>
                </select>
              </div>
            </div>
            <div className="grid2">
              <div className="field">
                <label htmlFor="wzpol">Update policy</label>
                <select id="wzpol" className="select" value={cfg.updatePolicy} onChange={(e) => set({ updatePolicy: e.target.value })}>
                  <option value="auto">Intelligent (recommended)</option>
                  <option value="update">Always update in place</option>
                  <option value="version">Always new version</option>
                  <option value="create">Always new document</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="wzver">Versioning strategy</label>
                <select id="wzver" className="select" value={cfg.versioning} onChange={(e) => set({ versioning: e.target.value })}>
                  <option value="semver-patch">SemVer — bump patch (2.4.0 → 2.4.1)</option>
                  <option value="semver-minor">SemVer — bump minor (2.4.0 → 2.5.0)</option>
                  <option value="date">Date-based (2026.07.04)</option>
                </select>
              </div>
            </div>
            <p className="helper">{POLICY_DESC[cfg.updatePolicy]}</p>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="h02 mb2">Step 5 · AI quality &amp; ranking checks</h2>
            <p className="helper mb5">Every run is judged across six dimensions and ranked against ChatGPT, Claude, and Gemini. These thresholds decide what publishes.</p>
            <Slider id="wzgate" label="Quality gate — overall score required to publish" min={0} max={100}
              value={cfg.gate} onChange={(v) => set({ gate: v })} />
            <Slider id="wzrank" label="Minimum AI ranking estimate across ChatGPT, Claude, Gemini (0 = off)" min={0} max={97}
              value={cfg.minAssistant} onChange={(v) => set({ minAssistant: v })} suffix="%" />
            <div className="stack mt3">
              <Tog on={cfg.autoFix} label="Auto-apply the judge's fixes"
                sub="Every suggested fix is applied and the document re-rendered before thresholds are checked"
                onClick={() => set({ autoFix: !cfg.autoFix })} />
              <Tog on={cfg.requireApproval} label="Require human approval before publishing"
                sub="Runs that clear the thresholds wait for your approval in the run history"
                onClick={() => set({ requireApproval: !cfg.requireApproval })} />
            </div>
            <p className="helper mt3">Runs below either threshold are marked <b>Gate blocked</b> — content is generated and kept for review, never auto-published.</p>
          </>
        )}

        {step === 5 && (
          <>
            <h2 className="h02 mb2">Step 6 · Publishing &amp; notifications</h2>
            <div className="grid2 mt5">
              <div className="field">
                <label htmlFor="wzpub">Publish destination</label>
                <select id="wzpub" className="select" value={cfg.publishTo} onChange={(e) => set({ publishTo: e.target.value })}>
                  <option value="workspace">Workspace — dashboard &amp; export center</option>
                  <option value="export">Export center only</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="wzmail">Notification email</label>
                <input id="wzmail" className="input" placeholder="defaults to your account email"
                  defaultValue={cfg.notifyEmail} onBlur={(e) => set({ notifyEmail: e.target.value.trim() })} />
              </div>
            </div>
            <p className="label01 t2 mb3">NOTIFY ON</p>
            <div className="stack">
              <Tog on={cfg.notifyOn.success} label="Published" sub="A run cleared every check and shipped"
                onClick={() => set({ notifyOn: { ...cfg.notifyOn, success: !cfg.notifyOn.success } })} />
              <Tog on={cfg.notifyOn.blocked} label="Gate blocked / awaiting approval" sub="A run needs your attention"
                onClick={() => set({ notifyOn: { ...cfg.notifyOn, blocked: !cfg.notifyOn.blocked } })} />
              <Tog on={cfg.notifyOn.failure} label="Run failed" sub="The pipeline itself errored"
                onClick={() => set({ notifyOn: { ...cfg.notifyOn, failure: !cfg.notifyOn.failure } })} />
            </div>
            <div className="field mt5">
              <label htmlFor="wzname">Pipeline name</label>
              <input id="wzname" className="input" defaultValue={name} onBlur={(e) => setName(e.target.value.trim() || 'Documentation pipeline')} />
            </div>
          </>
        )}

        <div className="row row--between mt6">
          <button className="btn btn--ghost btn--center" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>← Back</button>
          {step < 5
            ? <button className="btn btn--primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next<span className="ico">→</span></button>
            : <button className="btn btn--primary" disabled={saving} onClick={saveProfile}>{saving ? 'Saving…' : existing ? 'Save changes' : 'Create pipeline'}<span className="ico">✓</span></button>}
        </div>
      </div>
      <PipelinePreview cfg={cfg} step={step} name={name} />
      </div>
    </div>
  );
}

/* ---------------- Profile detail: webhook, simulations, runs, trends ---------------- */
function Detail({ id, onBack, onEdit }) {
  const nav = useNavigate();
  const { setFlow } = useFlow();
  const [p, setP] = useState(null);
  const [ins, setIns] = useState(null);
  const [showSecret, setShowSecret] = useState(false);
  const pollRef = useRef(null);

  async function load() {
    const d = await api('/profiles/' + id);
    setP(d.profile);
    api('/profiles/' + id + '/insights').then(setIns).catch(() => {});
    return d.profile;
  }
  useEffect(() => { load().catch(() => {}); return () => clearTimeout(pollRef.current); }, [id]);
  useEffect(() => {
    if (!p) return undefined;
    if (!(p.runs || []).some((r) => r.status === 'running')) return undefined;
    pollRef.current = setTimeout(() => load().catch(() => {}), 1500);
    return () => clearTimeout(pollRef.current);
  }, [p]);

  if (!p) return <p className="body01 t2">Loading…</p>;
  const cfg = p.config;
  const origin = window.location.origin.replace(':5173', ':4000');
  const hookUrl = origin + '/api/webhooks/git/' + p.id;

  async function copy(text, what) {
    try { await navigator.clipboard.writeText(text); toast('success', 'Copied', what); }
    catch { toast('error', 'Copy failed', 'Select the text manually'); }
  }
  async function simulate(kind) {
    const bodies = {
      routine: { simulate: true, message: 'fix: typo in handler' },
      impact: { simulate: true, message: 'feat: new token rotation', files: ['src/auth/token.js', 'src/errors/handler.js'] },
      release: { simulate: true, message: 'release v3.0.0' }
    };
    try {
      await api('/profiles/' + p.id + '/run', { method: 'POST', body: bodies[kind] });
      toast('success', 'Merge simulated', 'Watch the run appear below — the engine decides create / update / version / sections');
      load();
    } catch (e) { toast('error', 'Could not start run', e.message); }
  }
  async function approve(runId) {
    try {
      await api('/profiles/' + p.id + '/runs/' + runId + '/approve', { method: 'POST' });
      toast('success', 'Approved & published', 'The run outcome is now Published');
      load();
    } catch (e) { toast('error', 'Approval failed', e.message); }
  }
  async function rotate() {
    try { await api('/profiles/' + p.id + '/rotate-secret', { method: 'POST' }); setShowSecret(true); toast('success', 'Secret rotated', 'Update it in your repository webhook settings'); load(); }
    catch (e) { toast('error', 'Rotation failed', e.message); }
  }
  function openReport(genId) { setFlow({ genId }); nav('/quality'); }

  const series = ins ? ins.series : [];

  return (
    <div>
      <button className="linkbtn" onClick={onBack}>← All pipelines</button>
      <div className="row row--between mt3" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="row">
          <h1 className="h04">{p.name}</h1>
          <span className={'tag ' + (p.status === 'active' ? 'tag--green' : 'tag--gray')}>{p.status === 'active' ? 'Active' : 'Paused'}</span>
        </div>
        <div className="row">
          <button className="btn btn--tertiary btn--sm" onClick={() => onEdit(p)}>Edit</button>
          <button className="btn btn--ghost btn--sm" onClick={async () => { await api('/profiles/' + p.id, { method: 'PUT', body: { status: p.status === 'active' ? 'paused' : 'active' } }); load(); }}>
            {p.status === 'active' ? 'Pause' : 'Resume'}
          </button>
        </div>
      </div>
      <div className="row mt3" style={{ flexWrap: 'wrap', gap: 6 }}>
        <span className="tag tag--gray">{cfg.repo || 'no repository'}</span>
        <span className="tag tag--gray">merge → {cfg.branch}</span>
        <span className="tag tag--blue">{cfg.docTypes.join(', ')} · {String(cfg.format).toUpperCase()}</span>
        <span className="tag tag--outline">policy: {cfg.updatePolicy}</span>
        <span className="tag tag--outline">gate ≥ {cfg.gate}{cfg.minAssistant ? ' · rank ≥ ' + cfg.minAssistant + '%' : ''}</span>
        {cfg.autoFix && <span className="tag tag--green">auto-fix</span>}
        {cfg.requireApproval && <span className="tag tag--amber">approval required</span>}
      </div>

      <div className="grid2 mt6" style={{ alignItems: 'start' }}>
        <div className="tile tile--white" style={{ padding: 24 }}>
          <h2 className="h02 mb3">Repository webhook</h2>
          <p className="label01 t2 mb2">PAYLOAD URL</p>
          <div className="row" style={{ gap: 8 }}>
            <span className="mono" style={{ fontSize: 12, wordBreak: 'break-all', flex: 1 }}>{hookUrl}</span>
            <button className="btn btn--tertiary btn--sm" onClick={() => copy(hookUrl, 'Webhook URL')}>Copy</button>
          </div>
          <p className="label01 t2 mb2 mt5">SECRET</p>
          <div className="row" style={{ gap: 8 }}>
            <span className="mono" style={{ fontSize: 12, flex: 1 }}>{showSecret ? p.secret : '•'.repeat(24)}</span>
            <button className="btn btn--ghost btn--sm" onClick={() => setShowSecret((v) => !v)}>{showSecret ? 'Hide' : 'Reveal'}</button>
            <button className="btn btn--tertiary btn--sm" onClick={() => copy(p.secret, 'Webhook secret')}>Copy</button>
            <button className="btn btn--ghost btn--sm" onClick={rotate}>Rotate</button>
          </div>
          <p className="helper mt3"><b>GitHub</b> — Settings → Webhooks: JSON content type, paste the secret · <b>GitLab</b> — secret as Secret token · <b>Bitbucket</b> — append <span className="mono">?token=&lt;secret&gt;</span>.</p>
          <div className="divider" style={{ margin: '16px 0' }} />
          <h2 className="h02 mb3">Simulate a merge</h2>
          <p className="helper mb3">Exercises the exact webhook path — including the create / update / version / sections decision.</p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn--tertiary btn--sm" onClick={() => simulate('routine')}>Routine merge</button>
            <button className="btn btn--tertiary btn--sm" onClick={() => simulate('impact')}>Auth + error files changed</button>
            <button className="btn btn--tertiary btn--sm" onClick={() => simulate('release')}>Release merge (v3.0.0)</button>
          </div>
        </div>

        <div className="tile tile--white" style={{ padding: 24 }}>
          <h2 className="h02 mb3">Effectiveness</h2>
          {ins && ins.summary.runs > 0 ? (
            <>
              <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
                <div><p className="metricsm mono">{ins.summary.publishRate}%</p><p className="helper">publish rate</p></div>
                <div><p className="metricsm mono">{p.stats.avgOverall ?? '—'}</p><p className="helper">avg overall</p></div>
                <div><p className="metricsm mono">{ins.summary.overallTrend >= 0 ? '+' + ins.summary.overallTrend : ins.summary.overallTrend}</p><p className="helper">score trend</p></div>
              </div>
              <p className="label01 t2 mt5 mb2">OVERALL SCORE PER RUN</p>
              <div className="insbars">
                {series.map((s, i) => (
                  <div key={i} className="insbar" title={fmtWhen(s.at) + ' · ' + s.overall + ' · ' + s.action}
                    style={{ height: Math.max(8, s.overall) + '%', background: s.outcome === 'published' ? 'var(--support-success)' : 'var(--support-warning)' }} />
                ))}
              </div>
              {ins.summary.latest && (
                <p className="helper mt3">
                  Latest AI ranking — ChatGPT <b>{ins.summary.latest.chatgpt}%</b> · Claude <b>{ins.summary.latest.claude}%</b> · Gemini <b>{ins.summary.latest.gemini}%</b>
                </p>
              )}
            </>
          ) : <p className="helper">No completed runs yet — simulate a merge to see trends.</p>}
        </div>
      </div>

      <h2 className="h02 mt7 mb3">Run history</h2>
      {(p.runs || []).length === 0 ? (
        <p className="helper">No runs yet. Simulate a merge above, or push to <span className="mono">{cfg.branch}</span> with the webhook configured.</p>
      ) : (
        <div className="stack">
          {p.runs.map((r) => {
            const [cls, label] = OUTCOME_TAG[r.outcome] || [];
            return (
              <div key={r.id} className="prun">
                <div className="prun-top">
                  <span className="helper" style={{ minWidth: 150 }}>{fmtWhen(r.at)}</span>
                  <span className="body01">{TRIGGER_LABEL[r.trigger] || r.trigger}</span>
                  <span className="tag tag--blue">{r.action}{r.version ? ' → v' + r.version : ''}</span>
                  {r.status === 'running' && <span className="tag tag--blue">Running…</span>}
                  {r.status === 'failed' && <span className="tag tag--red">Failed</span>}
                  {r.status === 'complete' && <ScoreTag n={r.overall} />}
                  {r.status === 'complete' && cls && <span className={'tag ' + cls}>{label}</span>}
                  <span style={{ flex: 1 }} />
                  {r.outcome === 'awaiting-approval' && (
                    <button className="btn btn--primary btn--sm" onClick={() => approve(r.id)}>Approve &amp; publish</button>
                  )}
                  {r.genId && r.status === 'complete' && (
                    <button className="linkbtn" onClick={() => openReport(r.genId)}>View report →</button>
                  )}
                </div>
                <p className="helper mt2">
                  {r.commit ? String(r.commit).slice(0, 7) + ' on ' + r.branch + ' · ' : ''}{r.reason}
                  {r.holdWhy ? ' — held: ' + r.holdWhy : ''}
                  {r.error ? ' — ' + r.error : ''}
                </p>
                {r.status === 'complete' && r.assistants && (
                  <p className="helper mt2">AI ranking: ChatGPT {r.assistants.chatgpt}% · Claude {r.assistants.claude}% · Gemini {r.assistants.gemini}%</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Main: management dashboard ---------------- */
export default function Automation() {
  const [profiles, setProfiles] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [view, setView] = useState({ mode: 'list' });

  async function load() {
    const d = await api('/profiles');
    setProfiles(d.profiles);
    return d.profiles;
  }
  useEffect(() => { load().catch(() => {}); getCatalog().then(setCatalog).catch(() => {}); }, []);

  async function act(p, action) {
    try {
      if (action === 'toggle') {
        await api('/profiles/' + p.id, { method: 'PUT', body: { status: p.status === 'active' ? 'paused' : 'active' } });
        toast('info', p.status === 'active' ? 'Pipeline paused' : 'Pipeline resumed', p.name);
      } else if (action === 'clone') {
        await api('/profiles/' + p.id + '/clone', { method: 'POST' });
        toast('success', 'Pipeline cloned', 'The copy starts paused — edit and resume it when ready');
      } else if (action === 'delete') {
        if (!window.confirm('Delete "' + p.name + '"? Its webhook stops working immediately.')) return;
        await api('/profiles/' + p.id, { method: 'DELETE' });
        toast('info', 'Pipeline deleted', p.name);
      } else if (action === 'run') {
        await api('/profiles/' + p.id + '/run', { method: 'POST', body: { simulate: true } });
        toast('success', 'Run started', 'Open the pipeline to watch it execute');
      }
      load();
    } catch (e) { toast('error', 'Action failed', e.message); }
  }

  if (!profiles || !catalog) return <div className="page"><p className="body01 t2">Loading…</p></div>;

  return (
    <>
      <div className="page">
        {view.mode === 'wizard' && (
          <Wizard existing={view.profile || null} catalog={catalog}
            onDone={(saved) => { setView(saved ? { mode: 'detail', id: saved.id } : { mode: 'list' }); load(); }} />
        )}
        {view.mode === 'detail' && (
          <Detail id={view.id} onBack={() => { setView({ mode: 'list' }); load(); }}
            onEdit={(p) => setView({ mode: 'wizard', profile: p })} />
        )}
        {view.mode === 'list' && (
          <>
            <div className="row row--between" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h1 className="h04">Auto-regenerate on merge</h1>
                <p className="body01 t2 mt3" style={{ maxWidth: 700 }}>
                  Reusable automation pipelines: a merge lands, the saved profile executes — generate or
                  update the mapped documents, judge them, rank them against ChatGPT, Claude, and Gemini,
                  then publish or hold. Configure once; it runs forever.
                </p>
              </div>
              <button className="btn btn--primary" onClick={() => setView({ mode: 'wizard' })}>
                New automation pipeline<span className="ico">+</span>
              </button>
            </div>

            {profiles.length === 0 ? (
              <div className="tile tile--white mt7" style={{ padding: 32, maxWidth: 720 }}>
                <h2 className="h02">No pipelines yet</h2>
                <p className="body01 t2 mt3">
                  Create your first pipeline: six steps — repository, branch, triggers, documents,
                  AI thresholds, publishing — and every merge afterwards keeps your documentation
                  current, judged, and ranked automatically.
                </p>
                <button className="btn btn--primary mt5" onClick={() => setView({ mode: 'wizard' })}>
                  Start the wizard<span className="ico">→</span>
                </button>
              </div>
            ) : (
              <div className="profgrid mt7">
                {profiles.map((p) => {
                  const last = p.stats.lastRun;
                  return (
                    <div key={p.id} className="profcard">
                      <div className="row row--between">
                        <p className="h01">{p.name}</p>
                        <span className={'tag ' + (p.status === 'active' ? 'tag--green' : 'tag--gray')}>{p.status === 'active' ? 'Active' : 'Paused'}</span>
                      </div>
                      <p className="helper mt2">{p.config.repo || 'no repository'} · merge → {p.config.branch} · {String(p.config.format).toUpperCase()} · gate ≥ {p.config.gate}</p>
                      <div className="row mt3" style={{ gap: 16 }}>
                        <span className="helper"><b>{p.stats.total}</b> runs</span>
                        <span className="helper"><b>{p.stats.published}</b> published</span>
                        <span className="helper"><b>{p.stats.held}</b> held</span>
                        {p.stats.avgOverall != null && <span className="helper">avg <b>{p.stats.avgOverall}</b></span>}
                      </div>
                      {last && (
                        <p className="helper mt2">
                          Last: {fmtWhen(last.at)} — {last.action} · {last.status === 'complete' ? (last.outcome || '') + (last.overall ? ' at ' + last.overall : '') : last.status}
                        </p>
                      )}
                      <div className="row mt5" style={{ flexWrap: 'wrap' }}>
                        <button className="btn btn--primary btn--sm" onClick={() => setView({ mode: 'detail', id: p.id })}>Open</button>
                        <button className="btn btn--tertiary btn--sm" disabled={p.status !== 'active'} onClick={() => act(p, 'run')}>Run now</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => act(p, 'toggle')}>{p.status === 'active' ? 'Pause' : 'Resume'}</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => act(p, 'clone')}>Clone</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => act(p, 'delete')}>Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      <NavBar back="/dashboard" next="/settings" />
    </>
  );
}
