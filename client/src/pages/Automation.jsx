import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getCatalog } from '../api.js';
import { useFlow, toast } from '../store.jsx';
import { NavBar, ScoreTag, IcCheck, HelpLink } from '../ui.jsx';

/* =====================================================================
   Auto-regenerate on merge — the orchestration module.
   Views: profile list (management dashboard) → 6-step wizard → profile
   detail (webhook, simulations, run history, effectiveness trends).
   ===================================================================== */

const WIZ_STEPS = ['Repository', 'Branch', 'Triggers', 'Documents', 'Quality checks', 'Publish & notify'];

const DEFAULT_CFG = {
  provider: 'github', repo: '',
  branch: 'main',
  events: { push: true, mergedPr: true }, pathFilter: '',
  jira: { enabled: false, site: '', projectKey: '', requireIssue: false },
  track: 'technical', docTypes: ['api'], format: 'markdown',
  templateFrom: 'latest', updatePolicy: 'place', versioning: 'semver-patch',
  gate: 85, minAssistant: 0, autoFix: true, requireApproval: false,
  publishTo: 'workspace', notifyEmail: '', notifyOn: { success: true, blocked: true, failure: true }
};

const OUTCOME_TAG = {
  published: ['tag--green', 'Published'],
  held: ['tag--red', 'Gate blocked'],
  'awaiting-approval': ['tag--amber', 'Awaiting approval'],
  skipped: ['tag--gray', 'Filtered out']
};

const TRIGGER_LABEL = { webhook: 'Merge (webhook)', simulate: 'Simulated merge', manual: 'Manual run' };

function fmtWhen(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

/* ---------------- Collapsible "Advanced" section: keeps the main path clean ---------------- */
function Adv({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="acc mt6">
      <div className={'acc-item' + (open ? ' open' : '')}>
        <button type="button" className="acc-btn" onClick={() => setOpen((o) => !o)}>
          {title}<span className="acc-chev">▾</span>
        </button>
        {open && <div style={{ padding: '4px 8px 20px' }}>{children}</div>}
      </div>
    </div>
  );
}

/* ---------------- Radio row with a one-line explanation ---------------- */
function RadioRow({ on, label, sub, tag, onClick }) {
  return (
    <div className={'radioline' + (on ? ' on' : '')} onClick={onClick} role="radio" aria-checked={on}
      style={{ alignItems: 'flex-start' }}>
      <span className="rdot" style={{ marginTop: 2 }} />
      <span>
        <span className="body01" style={{ display: 'block', fontWeight: on ? 600 : 400 }}>
          {label}{tag && <span className="tag tag--blue" style={{ marginLeft: 8, verticalAlign: 'middle' }}>{tag}</span>}
        </span>
        <span className="helper">{sub}</span>
      </span>
    </div>
  );
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
        cfg.pathFilter ? 'paths: ' + cfg.pathFilter : null,
        cfg.jira && cfg.jira.enabled
          ? 'trace → Jira ' + (cfg.jira.projectKey ? cfg.jira.projectKey + '-###' : 'issue key') + ' → commit'
          : null
      ]
    },
    {
      steps: [3], label: cfg.updatePolicy === 'place' || cfg.updatePolicy === 'auto' ? 'PLACE INTO EXISTING DOC' : 'GENERATE OR UPDATE',
      lines: [
        cfg.docTypes.length ? cfg.docTypes.join(', ') : '· choose document types',
        (cfg.format ? cfg.format.toUpperCase() : '· format') + ' · policy: ' + cfg.updatePolicy +
          (cfg.updatePolicy === 'auto' || cfg.updatePolicy === 'version' ? ' · ' + cfg.versioning : ''),
        cfg.updatePolicy === 'place' || cfg.updatePolicy === 'auto'
          ? '⤷ splice at best-matching section' : null
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

  const existingDoc = existing && existing.config && existing.config.sourceDoc;
  const [srcName, setSrcName] = useState(existingDoc ? existingDoc.name : '');
  const [srcInfo, setSrcInfo] = useState(existingDoc ? { sections: (existingDoc.sections || []).length, pagesEst: existingDoc.pagesEst } : null);
  const [srcPending, setSrcPending] = useState(null);
  const [srcRemove, setSrcRemove] = useState(false);
  const wzFileRef = useRef(null);

  async function onWzFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!/\.(md|markdown|mdx|txt|text)$/i.test(f.name)) {
      toast('error', 'Unsupported file', 'Upload .md or .txt for now — PDF, Word, and Confluence/Notion coming next');
      if (wzFileRef.current) wzFileRef.current.value = '';
      return;
    }
    const content = await f.text();
    const format = /\.(md|markdown|mdx)$/i.test(f.name) ? 'markdown' : 'text';
    setSrcPending({ name: f.name, format, content });
    setSrcName(f.name); setSrcInfo(null); setSrcRemove(false);
    toast('info', 'Document ready', f.name + ' — indexed when you save the pipeline');
    if (wzFileRef.current) wzFileRef.current.value = '';
  }
  function removeWzDoc() { setSrcPending(null); setSrcName(''); setSrcInfo(null); setSrcRemove(true); }

  useEffect(() => {
    setRepos(null);
    api('/repos?provider=' + cfg.provider).then((d) => setRepos(d.repos || [])).catch(() => setRepos([]));
  }, [cfg.provider]);

  // Reusable documentation rule sets (repository hub) — pipeline override.
  const [ruleSets, setRuleSets] = useState(null);
  useEffect(() => {
    api('/hub/rulesets').then((d) => setRuleSets(d.ruleSets)).catch(() => setRuleSets([]));
  }, []);

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
      const pid = d.profile.id;
      if (srcPending) {
        try { await api('/profiles/' + pid + '/source-doc', { method: 'POST', body: srcPending }); }
        catch (e) { toast('error', 'Document not indexed', e.message); }
      } else if (srcRemove && existingDoc) {
        try { await api('/profiles/' + pid + '/source-doc', { method: 'DELETE' }); } catch (e) { /* non-fatal */ }
      }
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
                <select id="wzrepo" className="select" value={repos.some((r) => r.name === cfg.repo) ? cfg.repo : ''}
                  onChange={(e) => set({ repo: e.target.value })}>
                  <option value="">Select a repository…</option>
                  {repos.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
                </select>
              )}
            </div>
            <div className="field">
              <label htmlFor="wzrepocustom">Or any public repository (owner/name)</label>
              <input id="wzrepocustom" className="input" placeholder="e.g. expressjs/express"
                value={repos && repos.some((r) => r.name === cfg.repo) ? '' : cfg.repo}
                onChange={(e) => set({ repo: e.target.value.trim() })} />
              <p className="helper">Public repositories work without connecting an account — documentation is generated from their real source files.</p>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="wzrules">Documentation rule set</label>
              {ruleSets === null ? <p className="helper">Loading rule sets…</p> : (
                <select id="wzrules" className="select" value={cfg.ruleSetId || ''}
                  onChange={(e) => set({ ruleSetId: e.target.value })}>
                  <option value="">Repository default (from the hub, or your default rule set)</option>
                  {ruleSets.map((rs) => <option key={rs.id} value={rs.id}>{rs.name}</option>)}
                </select>
              )}
              <p className="helper">
                The relevance engine gates every merge with these rules — internal-only changes are
                filtered before any documentation is generated. Manage rule sets on the Repositories page.
              </p>
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
            <h2 className="h02 mb2">Step 3 · When should docs update?</h2>
            <p className="helper mb5">Pick what triggers a documentation update. Most teams keep both on.</p>
            <div className="stack">
              <Tog on={cfg.events.push} label="When code is pushed"
                sub="Any push to the watched branch"
                onClick={() => set({ events: { ...cfg.events, push: !cfg.events.push } })} />
              <Tog on={cfg.events.mergedPr} label="When a pull request is merged"
                sub="Only completed merges — never open or draft PRs"
                onClick={() => set({ events: { ...cfg.events, mergedPr: !cfg.events.mergedPr } })} />
            </div>
            {!cfg.events.push && !cfg.events.mergedPr && (
              <p className="helper mt3" style={{ color: 'var(--support-error)' }}>Both triggers are off — this pipeline will only run manually.</p>
            )}

            <Adv title="Advanced — watch specific folders, link Jira issues" defaultOpen={!!cfg.pathFilter || cfg.jira.enabled}>
              <div className="field">
                <label htmlFor="wzpath">Only react to changes in these folders</label>
                <input id="wzpath" className="input" placeholder="src/, api/ — leave empty to watch everything"
                  defaultValue={cfg.pathFilter} onBlur={(e) => set({ pathFilter: e.target.value.trim() })} />
              </div>
              <div className="stack">
                <Tog on={cfg.jira.enabled} label="Tag each update with its Jira issue"
                  sub={<>Reads the issue key from the commit or branch — e.g. <span className="mono">KAN-42</span></>}
                  onClick={() => set({ jira: { ...cfg.jira, enabled: !cfg.jira.enabled } })} />
              </div>
              {cfg.jira.enabled && (
                <>
                  <div className="grid2 mt5">
                    <div className="field">
                      <label htmlFor="wzjkey">Jira project key (optional)</label>
                      <input id="wzjkey" className="input" placeholder="e.g. KAN"
                        defaultValue={cfg.jira.projectKey}
                        onBlur={(e) => set({ jira: { ...cfg.jira, projectKey: e.target.value.trim().toUpperCase() } })} />
                    </div>
                    <div className="field">
                      <label htmlFor="wzjsite">Jira site URL (optional)</label>
                      <input id="wzjsite" className="input" placeholder="https://yourteam.atlassian.net"
                        defaultValue={cfg.jira.site}
                        onBlur={(e) => set({ jira: { ...cfg.jira, site: e.target.value.trim() } })} />
                    </div>
                  </div>
                  <div className="stack">
                    <Tog on={cfg.jira.requireIssue} label="Skip commits that have no Jira issue"
                      sub="They are held for review instead of documented"
                      onClick={() => set({ jira: { ...cfg.jira, requireIssue: !cfg.jira.requireIssue } })} />
                  </div>
                </>
              )}
            </Adv>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="h02 mb2">Step 4 · What should it maintain?</h2>
            <p className="helper mb5">Choose the documents this pipeline keeps up to date.</p>

            <p className="label01 t2 mb3">KIND OF DOCUMENTATION</p>
            <div className="row mb3" style={{ gap: 0 }}>
              {[['technical', 'Technical documentation'], ['marketing', 'Marketing material']].map(([t, l]) => (
                <button key={t} className={'chip' + (cfg.track === t ? ' on' : '')}
                  onClick={() => set({ track: t, docTypes: [], format: ((catalog.formats[t] || []).filter((f) => f.ok)[0] || {}).id || 'markdown' })}>{l}</button>
              ))}
            </div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {types.map((d) => (
                <button key={d.id} className={'chip' + (cfg.docTypes.includes(d.id) ? ' on' : '')}
                  onClick={() => set({ docTypes: cfg.docTypes.includes(d.id) ? cfg.docTypes.filter((x) => x !== d.id) : [...cfg.docTypes, d.id] })}>
                  {d.name}
                </button>
              ))}
            </div>
            {cfg.docTypes.length === 0 && <p className="helper mt2">Pick at least one document type.</p>}

            <p className="label01 t2 mb3 mt6">WHEN A CHANGE ARRIVES</p>
            <div style={{ border: '1px solid var(--border-subtle)' }} role="radiogroup" aria-label="Update behaviour">
              <RadioRow on={cfg.updatePolicy === 'place'} tag="recommended"
                label="Update my existing document"
                sub="Each change is placed into the best-matching section — one document stays current, no duplicates."
                onClick={() => set({ updatePolicy: 'place' })} />
              <RadioRow on={cfg.updatePolicy === 'auto'}
                label="Update my document, and version releases"
                sub="Same as above, but release merges (v2.4.0 etc.) also snapshot a new version."
                onClick={() => set({ updatePolicy: 'auto' })} />
              <RadioRow on={cfg.updatePolicy === 'version'}
                label="New version on every merge"
                sub="Keeps a full published history — the document is re-issued each time."
                onClick={() => set({ updatePolicy: 'version' })} />
              <RadioRow on={cfg.updatePolicy === 'create'}
                label="New standalone document each merge"
                sub="No shared document — every merge produces its own file."
                onClick={() => set({ updatePolicy: 'create' })} />
              {cfg.updatePolicy === 'update' && (
                <RadioRow on label="Rewrite the whole document each merge (legacy)"
                  sub="This pipeline was saved with the older policy — pick any option above to change it."
                  onClick={() => {}} />
              )}
            </div>

            {(cfg.updatePolicy === 'place' || cfg.updatePolicy === 'auto') && (
              <>
                <p className="label01 t2 mb2 mt6">YOUR EXISTING DOCUMENT <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span></p>
                <p className="helper mb3">Upload it once and changes land in the right section of <i>your</i> document. Markdown or text — only the outline is stored, never the body.</p>
                <input ref={wzFileRef} type="file" accept=".md,.markdown,.mdx,.txt,.text" style={{ display: 'none' }} onChange={onWzFile} />
                {srcName ? (
                  <div className="prun">
                    <div className="prun-top">
                      <span className="body01" style={{ fontWeight: 600 }}>{srcName}</span>
                      {srcInfo ? <span className="helper">{srcInfo.sections} sections · ~{srcInfo.pagesEst} pages</span> : <span className="tag tag--blue">indexed on save</span>}
                      <span style={{ flex: 1 }} />
                      <button className="btn btn--ghost btn--sm" onClick={() => wzFileRef.current && wzFileRef.current.click()}>Replace</button>
                      <button className="btn btn--ghost btn--sm" onClick={removeWzDoc}>Remove</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn btn--tertiary" onClick={() => wzFileRef.current && wzFileRef.current.click()}>Upload document<span className="ico">↑</span></button>
                )}
              </>
            )}

            <Adv title="Advanced — output format, version numbering, template">
              <div className="grid2">
                <div className="field">
                  <label htmlFor="wzfmt">Output format</label>
                  <select id="wzfmt" className="select" value={cfg.format} onChange={(e) => set({ format: e.target.value })}>
                    <option value="">Select…</option>
                    {formats.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="wzver">Version numbering</label>
                  <select id="wzver" className="select" value={cfg.versioning} onChange={(e) => set({ versioning: e.target.value })}>
                    <option value="semver-patch">Small steps — 2.4.0 → 2.4.1</option>
                    <option value="semver-minor">Bigger steps — 2.4.0 → 2.5.0</option>
                    <option value="date">By date — 2026.07.08</option>
                  </select>
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="wztpl">Generation settings</label>
                <select id="wztpl" className="select" value={cfg.templateFrom} onChange={(e) => set({ templateFrom: e.target.value })}>
                  <option value="latest">Reuse my last generation&apos;s settings</option>
                  <option value="defaults">Standard defaults</option>
                </select>
              </div>
            </Adv>
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

/* ---------------- Contextual placement studio ----------------
   Preview where a change would be spliced into the developer's existing
   document — against its real section outline, with confidence and ranked
   alternatives. The document itself is uploaded in the setup wizard (Step 4). */
function PlacementStudio({ profile, onEdit }) {
  const cfg = profile.config;
  const src = cfg.sourceDoc;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState((cfg.jira && cfg.jira.projectKey ? cfg.jira.projectKey + '-42 ' : '') + 'feat: rotate signing keys on refresh');
  const [files, setFiles] = useState('src/auth/token.js');
  const [pv, setPv] = useState(null);
  const [sel, setSel] = useState(0);

  async function findLoc() {
    setBusy(true);
    try {
      const body = { message: msg, files: files ? files.split(',').map((s) => s.trim()).filter(Boolean) : [] };
      const d = await api('/profiles/' + profile.id + '/placement/preview', { method: 'POST', body });
      setPv(d); setSel(0);
    } catch (e) { toast('error', 'Preview failed', e.message); }
    setBusy(false);
  }

  const cands = pv && pv.placement && pv.placement.candidates ? pv.placement.candidates : null;
  const P = pv ? pv.placement : null;
  const chosen = cands ? cands[sel] : null;

  return (
    <div className="tile tile--white mt7" style={{ padding: 24 }}>
      <div className="row row--between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <h2 className="h02">Contextual placement</h2>
        <span className="tag tag--outline">no standalone duplicates</span>
      </div>
      <p className="helper mt2" style={{ maxWidth: 720 }}>
        On each merge, DocGen documents only the change and splices it into the best-matching section of your uploaded
        document — you review one location instead of scrolling a long file. Preview a placement below.
      </p>

      {src ? (
        <div className="prun mt5">
          <div className="prun-top">
            <span className="body01" style={{ fontWeight: 600 }}>{src.name}</span>
            <span className="tag tag--green">indexed</span>
            <span className="helper">{(src.sections || []).length} sections · ~{src.pagesEst} pages · {src.format}</span>
            <span style={{ flex: 1 }} />
            <button className="btn btn--ghost btn--sm" onClick={() => onEdit && onEdit(profile)}>Change in setup</button>
          </div>
        </div>
      ) : (
        <div className="tile mt5" style={{ padding: 20, border: '1px dashed var(--border-strong)' }}>
          <p className="body01" style={{ fontWeight: 600 }}>No document uploaded yet</p>
          <p className="helper mt2">Add the document to place into during setup — Edit this pipeline, then Step 4 · Documents. Markdown (.md) or text (.txt) today; PDF, Word, and Confluence/Notion coming next.</p>
          <button className="btn btn--tertiary mt3" onClick={() => onEdit && onEdit(profile)}>Add a document in setup<span className="ico">→</span></button>
        </div>
      )}

      {src && (
        <>
          <div className="divider" style={{ margin: '18px 0' }} />
          <p className="label01 t2 mb3">PREVIEW A PLACEMENT</p>
          <div className="grid2">
            <div className="field">
              <label htmlFor="pvmsg">Commit message</label>
              <input id="pvmsg" className="input" value={msg} onChange={(e) => setMsg(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pvfiles">Changed files (optional)</label>
              <input id="pvfiles" className="input" value={files} onChange={(e) => setFiles(e.target.value)} />
            </div>
          </div>
          <button className="btn btn--primary" disabled={busy} onClick={findLoc}>{busy ? 'Finding…' : 'Find location'}<span className="ico">→</span></button>

          {P && (
            <div className="grid2 mt5" style={{ alignItems: 'start' }}>
              <div className="tile" style={{ padding: 16 }}>
                <p className="label01 t2 mb2">CHOSEN LOCATION</p>
                <p className="body01" style={{ fontWeight: 600 }}>{(chosen && chosen.title) || P.anchorPath}</p>
                <p className="helper mt2">
                  {P.docName ? 'in ' + P.docName + ' · ' : ''}
                  {(chosen ? chosen.page : P.page) ? 'p.' + (chosen ? chosen.page : P.page) + ' · ' : ''}
                  {(chosen ? chosen.mode : P.mode) === 'insert-new' ? 'new sub-section' : 'update in place'}
                </p>
                <div style={{ height: 6, background: 'var(--border-subtle)', marginTop: 10 }}>
                  <div style={{ height: 6, width: (chosen ? chosen.confidence : P.confidence) + '%', background: 'var(--button-primary)' }} />
                </div>
                <p className="helper mt2">{(chosen ? chosen.confidence : P.confidence)}% match{pv.jira && pv.jira.matched ? ' · ' + pv.jira.issue + ' → commit' : ''}</p>
                <p className="helper mt3">{P.reason}</p>
              </div>
              <div className="tile" style={{ padding: 16 }}>
                <p className="label01 t2 mb2">OTHER CANDIDATES</p>
                {cands ? cands.map((c, i) => (
                  <div key={i} className="prun" style={{ cursor: 'pointer', marginBottom: 8, padding: 10, ...(i === sel ? { outline: '2px solid var(--button-primary)', outlineOffset: '-2px' } : {}) }} onClick={() => setSel(i)}>
                    <div className="row row--between"><span className="body01" style={{ fontSize: 13 }}>{c.title}</span><span className="mono helper">{c.confidence}%</span></div>
                    <div style={{ height: 4, background: 'var(--border-subtle)', marginTop: 6 }}><div style={{ height: 4, width: c.confidence + '%', background: 'var(--button-primary)' }} /></div>
                    <p className="helper mt2">p.{c.page} · {c.mode === 'insert-new' ? 'new sub-section' : 'update in place'}</p>
                  </div>
                )) : <p className="helper">Best match shown. Upload a document with more headings to see ranked alternatives.</p>}
              </div>
            </div>
          )}
        </>
      )}
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
    const jkey = (cfg.jira && cfg.jira.projectKey) || 'KAN';
    const bodies = {
      routine: { simulate: true, message: 'fix: typo in handler' },
      impact: { simulate: true, message: 'feat: new token rotation', files: ['src/auth/token.js', 'src/errors/handler.js'] },
      release: { simulate: true, message: 'release v3.0.0' },
      jira: { simulate: true, message: jkey + '-42 feat: rotate signing keys on refresh', files: ['src/auth/token.js'], branch: 'feature/' + jkey + '-42-key-rotation' }
    };
    try {
      await api('/profiles/' + p.id + '/run', { method: 'POST', body: bodies[kind] });
      toast('success', 'Merge simulated', 'Watch the run appear below — the engine resolves the issue, then places the change in the right section');
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
        <span className="tag tag--outline">policy: {cfg.updatePolicy === 'place' ? 'contextual placement' : cfg.updatePolicy}</span>
        <span className="tag tag--outline">gate ≥ {cfg.gate}{cfg.minAssistant ? ' · rank ≥ ' + cfg.minAssistant + '%' : ''}</span>
        {cfg.autoFix && <span className="tag tag--green">auto-fix</span>}
        {cfg.requireApproval && <span className="tag tag--amber">approval required</span>}
        {cfg.jira && cfg.jira.enabled && <span className="tag tag--blue">Jira {cfg.jira.projectKey ? cfg.jira.projectKey + '-*' : 'linked'}{cfg.jira.requireIssue ? ' · required' : ''}</span>}
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
            <button className="btn btn--tertiary btn--sm" onClick={() => simulate('jira')}>Jira-linked merge ({(cfg.jira && cfg.jira.projectKey) || 'KAN'}-42)</button>
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

      <PlacementStudio profile={p} onEdit={onEdit} />

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
                  <span className="tag tag--blue">{r.action === 'place' && r.placement ? 'place → ' + r.placement.anchor : r.action}{r.version ? ' → v' + r.version : ''}</span>
                  {r.jira && r.jira.matched && <span className="tag tag--outline">{r.jira.issue}</span>}
                  {r.status === 'running' && <span className="tag tag--blue">Running…</span>}
                  {r.status === 'failed' && <span className="tag tag--red">Failed</span>}
                  {r.status === 'complete' && <ScoreTag n={r.overall} />}
                  {r.status === 'complete' && cls && <span className={'tag ' + cls}>{label}</span>}
                  {r.status === 'complete' && r.grounded === false && <span className="tag tag--red">Template fallback</span>}
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
                  {r.groundedWhy ? ' — ⚠ ' + r.groundedWhy : ''}
                  {r.error ? ' — ' + r.error : ''}
                </p>
                {r.placement && (
                  <p className="helper mt2">
                    ⤷ Placed at <b>{r.placement.anchorPath}</b> · {r.placement.mode === 'insert-new' ? 'new sub-section spliced in' : 'section updated in place'} · <b>{r.placement.confidence}%</b> match
                  </p>
                )}
                {r.jira && r.jira.matched && (
                  <p className="helper mt2">
                    Traceability: <b>{r.jira.issue}</b> → commit <span className="mono">{r.jira.commit || (r.commit ? String(r.commit).slice(0, 7) : '—')}</span> · resolved via {r.jira.source}
                  </p>
                )}
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
  const nav = useNavigate();
  const [profiles, setProfiles] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [view, setView] = useState({ mode: 'list' });

  async function load() {
    const d = await api('/profiles');
    setProfiles(d.profiles);
    return d.profiles;
  }
  useEffect(() => { load().catch(() => {}); getCatalog().then(setCatalog).catch(() => {}); }, []);
  // Live status: while any pipeline has a run in flight, poll so the card
  // flips to published/held without a manual refresh.
  useEffect(() => {
    if (!profiles || !profiles.some((p) => (p.runs || []).some((r) => r.status === 'running'))) return undefined;
    const t = setTimeout(() => load().catch(() => {}), 1500);
    return () => clearTimeout(t);
  }, [profiles]);

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
                <div className="row" style={{ alignItems: 'baseline', gap: 16 }}>
                  <h1 className="h04">Auto-regenerate on merge</h1>
                  <HelpLink topic="automation" />
                </div>
                <p className="body01 t2 mt3" style={{ maxWidth: 720 }}>
                  Reusable automation pipelines: a merge lands, its Jira issue is resolved to the exact commit,
                  and DocGen documents only that change — then finds where it belongs in your existing
                  documentation and splices it into the right section. No standalone duplicates. Every update is
                  judged, ranked against ChatGPT, Claude, and Gemini, then published or held. Configure once; it runs forever.
                </p>
              </div>
              <button className="btn btn--primary" onClick={() => setView({ mode: 'wizard' })}>
                New automation pipeline<span className="ico">+</span>
              </button>
            </div>

            <div className="syncnote mt5" role="note">
              <strong>Prefer to approve every change first?</strong>&nbsp;Use{' '}
              <a href="/sync" onClick={(e) => { e.preventDefault(); nav('/sync'); }}>Doc sync</a> — each AI rewrite
              waits in a review queue as a side-by-side diff with reasoning, and nothing touches your document until
              you approve it. Automation here can also hold runs for approval: set &ldquo;Require approval&rdquo; in
              the wizard&rsquo;s publish step.
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
