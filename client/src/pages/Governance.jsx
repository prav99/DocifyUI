import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, download, getToken } from '../api.js';
import { toast } from '../store.jsx';
import { HelpLink } from '../ui.jsx';
import { DiffView } from './History.jsx';
import InlineReviewEditor from '../review/InlineReviewEditor.jsx';
import { usePageMeta } from '../seo.js';

/* =====================================================================
   Documentation Governance — a dedicated end-to-end workspace for taking
   EXISTING documentation and fully correcting its structure, voice,
   terminology, formatting, and completeness.

     Select documents → Choose style & type → Analyze & correct →
     Review, approve, download

   Built on the same engine as Doc sync (documents, versions, review
   queue) — governance jobs are review-queue proposals, so nothing ever
   changes without explicit approval, and every approval creates a
   version you can roll back.
   ===================================================================== */

const GUIDES = [
  ['docify', 'Docify Professional', 'The default. Clear, professional, globally readable.'],
  ['ibm', 'Enterprise classic', 'Strict clarity, formal register, rigorous procedures, translation-ready.'],
  ['microsoft', 'Microsoft-style', 'Warm but crisp, contractions welcome, sentence case everywhere.'],
  ['google', 'Google dev-docs style', 'Second person, present tense, standard American spelling.'],
  ['apple', 'Minimal consumer', 'Short sentences, zero jargon, benefit-first phrasing.'],
  ['atlassian', 'Team-docs style', 'Friendly, direct, example-heavy.'],
  ['marketing', 'Marketing content', 'Benefit-led and energetic — numbers over adjectives.']
];

const GUIDE_CONTROLS = ['Voice and tone', 'Sentence structure', 'Heading hierarchy', 'Terminology', 'Procedural writing', 'Notes and warnings', 'Global readability', 'Translation readiness'];

const DOC_TYPES = [
  ['userguide', 'User guide'], ['api', 'API reference'], ['install', 'Installation & setup'],
  ['quickstart', 'Quick start'], ['troubleshoot', 'Troubleshooting & FAQ'],
  ['relnotes', 'Release notes'], ['admin', 'Admin & configuration']
];

const RUN_STEPS = ['Reading the document', 'Rebuilding sections in one voice', 'Merging duplicated passages', 'Normalizing terminology and formatting', 'Scoring writing consistency'];

const scoreColor = (n) => (n == null ? 'var(--text-secondary)' : n >= 85 ? 'var(--support-success)' : n >= 65 ? '#b28600' : 'var(--support-error)');

export default function Governance() {
  usePageMeta({
    title: 'Standardize — rebuild existing docs to one clean standard',
    description: 'Analyze existing documentation, fix structure and terminology, apply a style guide, review every change, and export — end to end.'
  });
  const nav = useNavigate();
  // Workspace state survives a refresh: current step, selection, and style
  // settings persist in this browser session.
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem('docify_gov') || '{}'); } catch { return {}; } })();
  const [step, setStep] = useState(saved.step || 0);

  // Step 1 — documents
  const [docs, setDocs] = useState(null);
  const [sel, setSel] = useState(saved.sel || {});
  const [addMode, setAddMode] = useState(''); // '' | upload | paste | repo
  const [paste, setPaste] = useState({ name: 'document.md', text: '' });
  const [imp, setImp] = useState({ provider: 'github', repo: '', branch: 'main', path: '' });
  const [addBusy, setAddBusy] = useState(false);

  // Step 2 — style & type
  const [guide, setGuide] = useState(saved.guide || 'docify');
  const [docType, setDocType] = useState(saved.docType || 'userguide');
  const [notes, setNotes] = useState(saved.notes || '');

  useEffect(() => {
    try { sessionStorage.setItem('docify_gov', JSON.stringify({ step, sel, guide, docType, notes })); }
    catch { /* persistence is a convenience */ }
  }, [step, sel, guide, docType, notes]);

  // Step 3 — analysis + correction run
  const [analyses, setAnalyses] = useState({}); // docId -> analysis | {error}
  const [run, setRun] = useState(null); // { idx, stage, total, results: [{docId,name,scores,error}] }

  // Step 4 — proposals
  const [proposals, setProposals] = useState(null);
  const [actBusy, setActBusy] = useState('');
  const [showDiff, setShowDiff] = useState(''); // proposal id whose changes are expanded inline
  const [editing, setEditing] = useState(null); // proposal object open in the hybrid inline editor

  const loadDocs = () => api('/sync/documents').then((d) => setDocs(d.documents || [])).catch(() => setDocs([]));
  useEffect(() => { loadDocs(); }, []);

  const ready = (docs || []).filter((d) => d.status === 'ready');
  const selIds = Object.keys(sel).filter((id) => sel[id]);
  const selDocs = ready.filter((d) => sel[d.id]);

  /* ---------------- Step 1 helpers ---------------- */
  async function addPaste() {
    if (!paste.text.trim()) return toast('error', 'Paste some content first', 'Markdown, plain text, or HTML all work.');
    setAddBusy(true);
    try {
      await api('/sync/documents', { method: 'POST', body: { name: paste.name || 'document.md', format: 'markdown', content: paste.text } });
      toast('success', 'Document added', 'Parsing structure — it will be selectable in a few seconds.');
      setPaste({ name: 'document.md', text: '' });
      setAddMode('');
      setTimeout(loadDocs, 2500);
      setTimeout(loadDocs, 6000);
    } catch (e) { toast('error', 'Could not add document', e.message); }
    finally { setAddBusy(false); }
  }

  async function addUpload(file) {
    if (!file) return;
    if (file.size > 15_000_000) return toast('error', 'File too large', 'The limit is 15 MB per file — split it or trim the export.');
    setAddBusy(true);
    try {
      // Send the raw file to the server, which extracts text from PDF, Word,
      // HTML, RTF, Markdown, and text/code formats (binary formats can't be
      // read as text in the browser).
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/sync/documents/upload', {
        method: 'POST',
        headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {},
        body: fd
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed (' + res.status + ')');
      const chars = data.extractedChars ? data.extractedChars.toLocaleString() + ' characters extracted — ' : '';
      toast('success', file.name + ' added', chars + 'parsing structure, it will be selectable in a few seconds.');
      setAddMode('');
      setTimeout(loadDocs, 2500);
      setTimeout(loadDocs, 6000);
    } catch (e) { toast('error', 'Upload failed', e.message); }
    finally { setAddBusy(false); }
  }

  async function addImport() {
    if (!/^[\w.-]+\/[\w.-]+$/.test(imp.repo) || !imp.path.trim()) {
      return toast('error', 'Repository and file path are required', 'e.g. acme/developer-docs and docs/user-guide.md');
    }
    setAddBusy(true);
    try {
      await api('/sync/documents/import', {
        method: 'POST',
        body: { provider: imp.provider, docsRepo: imp.repo.trim(), docsBranch: imp.branch.trim() || 'main', docsPath: imp.path.trim(), codeRepo: imp.repo.trim(), codeBranch: imp.branch.trim() || 'main' }
      });
      toast('success', 'Imported from ' + imp.repo, 'Parsing structure — it will be selectable in a few seconds.');
      setAddMode('');
      setTimeout(loadDocs, 2500);
      setTimeout(loadDocs, 6000);
    } catch (e) { toast('error', 'Import failed', e.message); }
    finally { setAddBusy(false); }
  }

  /* ---------------- Step 3: analyze, then correct ---------------- */
  useEffect(() => {
    if (step !== 2) return;
    // Re-run when the documents list finishes loading (restored sessions
    // land on this step before the list arrives).
    selDocs.forEach((d) => {
      if (analyses[d.id]) return;
      api('/sync/documents/' + d.id + '/analyze', { method: 'POST', body: { docType } })
        .then((a) => setAnalyses((x) => ({ ...x, [d.id]: a })))
        .catch((e) => setAnalyses((x) => ({ ...x, [d.id]: { error: e.message } })));
    });
  }, [step, docs]); // eslint-disable-line react-hooks/exhaustive-deps

  async function correctAll() {
    const results = [];
    setRun({ idx: 0, elapsed: 0, total: selDocs.length, results });
    for (let i = 0; i < selDocs.length; i++) {
      const d = selDocs[i];
      setRun((r) => ({ ...r, idx: i, elapsed: 0 }));
      // Elapsed-seconds ticker: the visible percentage creeps toward — but
      // never reaches — the current document's share, so the bar cannot claim
      // completion while the AI is still writing.
      const tick = setInterval(() => setRun((r) => (r ? { ...r, elapsed: r.elapsed + 1 } : r)), 1000);
      try {
        const out = await Promise.race([
          api('/sync/documents/' + d.id + '/standardize', { method: 'POST', body: { docType, guide, notes } }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('__timeout__')), 240000))
        ]);
        results.push({ docId: d.id, name: d.name, scores: out.scores, updateId: out.update && out.update.id });
      } catch (e) {
        results.push({
          docId: d.id, name: d.name,
          error: e.message === '__timeout__'
            ? 'Still rebuilding in the background — the proposal will appear in Review & export when ready'
            : e.message,
          soft: e.message === '__timeout__'
        });
      } finally { clearInterval(tick); }
      setRun((r) => (r ? { ...r, results: [...results] } : r));
    }
    setRun((r) => (r ? { ...r, idx: selDocs.length } : r));
    const ok = results.filter((x) => !x.error).length;
    toast(ok ? 'success' : 'info', ok + ' of ' + selDocs.length + ' proposals ready',
      ok === selDocs.length ? 'Review, approve, and export in the final step.'
        : 'Documents still rebuilding will appear in Review & export automatically.');
    await loadProposals();
    setStep(3);
    setRun(null); // free the stepper again
  }

  /* ---------------- Step 4: proposals ---------------- */
  async function loadProposals() {
    try {
      const q = await api('/sync/updates');
      setProposals((q.updates || []).filter((u) => u.kind === 'restructure'));
    } catch { setProposals([]); }
  }
  useEffect(() => { if (step === 3 && proposals === null) loadProposals(); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(u, action) {
    setActBusy(u.id);
    try {
      await api('/sync/updates/' + u.id + '/' + action, { method: 'POST' });
      toast(action === 'approve' ? 'success' : 'info',
        action === 'approve' ? 'Approved — document updated' : 'Proposal dismissed',
        action === 'approve' ? 'The corrected version is now the live document; the previous version is kept in history.' : 'The document is unchanged.');
      await loadProposals();
      loadDocs();
    } catch (e) { toast('error', 'Action failed', e.message); }
    finally { setActBusy(''); }
  }

  const STEPS = ['Documents', 'Style & type', 'Analyze & correct', 'Review & export'];

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="row row--between" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h1 className="h04">Standardize</h1>
        <HelpLink topic="governance" />
      </div>
      <p className="body01 t2 mt3" style={{ maxWidth: 720 }}>
        Take documentation you already have — written by anyone, in any state — and fully correct its
        structure, voice, terminology, and formatting against a style guide. Every change is a reviewable
        proposal; nothing is published without your approval.
      </p>

      <div className="wizhead mt6">
        {STEPS.map((s, i) => (
          <button key={s} className={'wizstep' + (i === step ? ' on' : i < step ? ' done' : '')}
            onClick={() => { if (!run) setStep(i); }}
            title={run ? 'Wait for the current correction run to finish' : undefined}>
            <span className="wiznum mono">{i < step ? '✓' : i + 1}</span>{s}
          </button>
        ))}
      </div>

      {/* ---------------- Step 1: Documents ---------------- */}
      {step === 0 && (
        <div className="mt6">
          {docs === null ? <p className="body01 t2">Loading documents…</p> : (
            <>
              {ready.length === 0 && (
                <div className="notconn">
                  <div>
                    <p className="body01"><b>No documents yet</b></p>
                    <p className="helper mt2">Add one below — upload a file, paste content, or import from a repository. Documents already in Doc sync appear here automatically.</p>
                  </div>
                </div>
              )}
              {ready.length > 0 && (
                <>
                  <p className="helper mb3">{selIds.length} of {ready.length} selected — governance runs on every selected document with the same style settings.</p>
                  <div className="jiraresults" style={{ maxHeight: 340 }}>
                    {ready.map((d) => (
                      <label key={d.id} className="jirarow">
                        <input type="checkbox" checked={!!sel[d.id]} onChange={(e) => setSel((x) => ({ ...x, [d.id]: e.target.checked }))} />
                        <b className="mono" style={{ fontSize: 12.5 }}>{d.name}</b>
                        <span className="jirarow-sum reporow-meta">
                          {(d.sections || []).length} sections · {(d.profile && d.profile.pagesEst) || 1} pages
                          {d.docsRepo ? ' · from ' + d.docsRepo : d.repo ? ' · watches ' + d.repo : ''}
                        </span>
                        <span className="provtag">{(d.name.split('.').pop() || 'md').toUpperCase()}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}

              <div className="row mt5" style={{ gap: 6, flexWrap: 'wrap' }}>
                {[['upload', '＋ Upload a file'], ['paste', '＋ Paste content'], ['repo', '＋ Import from repository']].map(([id, l]) => (
                  <button key={id} type="button" className={'chip' + (addMode === id ? ' on' : '')}
                    onClick={() => setAddMode(addMode === id ? '' : id)}>{l}</button>
                ))}
                <span className="helper" style={{ marginLeft: 'auto' }}>PDF, Word (.docx), HTML, Markdown, RTF, and text/code files — 15 MB max</span>
              </div>
              {addMode === 'upload' && (
                <div className="pickblock mt3">
                  <input type="file" aria-label="Upload a document" disabled={addBusy}
                    accept=".pdf,.doc,.docx,.docm,.rtf,.odt,.html,.htm,.xhtml,.md,.markdown,.mdx,.txt,.text,.rst,.adoc,.asciidoc,.csv,.tsv,.json,.yaml,.yml,.xml,.dita,.tex,.log,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/html,text/plain,text/markdown"
                    onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; addUpload(f); }} />
                  <p className="helper mt2">The file is read as text and parsed into sections. Binary PDF needs conversion to text or Markdown first.</p>
                </div>
              )}
              {addMode === 'paste' && (
                <div className="pickblock mt3">
                  <div className="field" style={{ maxWidth: 320 }}>
                    <label>File name</label>
                    <input className="input" value={paste.name} onChange={(e) => setPaste((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Content</label>
                    <textarea className="textarea mono" rows={7} style={{ fontSize: 12.5 }} value={paste.text}
                      onChange={(e) => setPaste((p) => ({ ...p, text: e.target.value }))} placeholder="# My messy doc…" />
                  </div>
                  <button className="btn btn--tertiary btn--sm btn--center mt3" disabled={addBusy} onClick={addPaste}>{addBusy ? 'Adding…' : 'Add document'}</button>
                </div>
              )}
              {addMode === 'repo' && (
                <div className="pickblock mt3">
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="field" style={{ flex: '0 1 130px', marginBottom: 0 }}>
                      <label>Host</label>
                      <select className="select" value={imp.provider} onChange={(e) => setImp((x) => ({ ...x, provider: e.target.value }))}>
                        <option value="github">GitHub</option><option value="gitlab">GitLab</option><option value="bitbucket">Bitbucket</option>
                      </select>
                    </div>
                    <div className="field" style={{ flex: '1 1 180px', maxWidth: 240, marginBottom: 0 }}>
                      <label>Repository</label>
                      <input className="input" placeholder="acme/developer-docs" value={imp.repo} onChange={(e) => setImp((x) => ({ ...x, repo: e.target.value }))} />
                    </div>
                    <div className="field" style={{ flex: '1 1 200px', maxWidth: 280, marginBottom: 0 }}>
                      <label>File path</label>
                      <input className="input" placeholder="docs/user-guide.md" value={imp.path} onChange={(e) => setImp((x) => ({ ...x, path: e.target.value }))} />
                    </div>
                    <div className="field" style={{ flex: '0 1 110px', marginBottom: 0 }}>
                      <label>Branch</label>
                      <input className="input" value={imp.branch} onChange={(e) => setImp((x) => ({ ...x, branch: e.target.value }))} />
                    </div>
                    <button className="btn btn--tertiary btn--sm btn--center" disabled={addBusy} onClick={addImport}>{addBusy ? 'Importing…' : 'Import'}</button>
                  </div>
                  <p className="helper mt2">Notion and Confluence pages can be brought in via the Source step of a generation; their content is normalized the same way.</p>
                </div>
              )}

              <div className="row mt6" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn--primary btn--field" disabled={!selIds.length} onClick={() => setStep(1)}>
                  Continue with {selIds.length || 'no'} document{selIds.length === 1 ? '' : 's'} →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------------- Step 2: Style & type ---------------- */}
      {step === 1 && (
        <div className="mt6">
          <p className="label01 t2 mb3">STYLE GUIDE</p>
          <div className="grid4" style={{ gap: 12 }}>
            {GUIDES.map(([id, name, desc]) => (
              <div key={id} className={'tile tile--click' + (guide === id ? ' tile--selected' : '')} onClick={() => setGuide(id)}>
                <p className="h01">{name}</p>
                <p className="helper mt2">{desc}</p>
              </div>
            ))}
          </div>
          <details className="pubrepo mt3">
            <summary>What a style guide controls</summary>
            <ul className="body01 t2 mt2" style={{ paddingLeft: 20, lineHeight: 1.8 }}>
              {GUIDE_CONTROLS.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <p className="helper mt2">Your organization profile (Settings → Writing style: terminology, prohibited words, policy notes) applies on top of any guide and always wins.</p>
          </details>

          <div className="grid2 mt6">
            <div className="field">
              <label htmlFor="gv-type">Document type (decides the target structure)</label>
              <select id="gv-type" className="select" value={docType} onChange={(e) => setDocType(e.target.value)}>
                {DOC_TYPES.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="gv-notes">Instructions for this run (optional)</label>
              <input id="gv-notes" className="input" placeholder="e.g. Keep the FAQ section exactly as it is"
                value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="row mt6" style={{ justifyContent: 'space-between' }}>
            <button className="btn btn--ghost btn--field" onClick={() => setStep(0)}>← Back</button>
            <button className="btn btn--primary btn--field" onClick={() => { setAnalyses({}); setStep(2); }}>Analyze {selIds.length} document{selIds.length === 1 ? '' : 's'} →</button>
          </div>
        </div>
      )}

      {/* ---------------- Step 3: Analyze & correct ---------------- */}
      {step === 2 && (
        <div className="mt6">
          {selDocs.length === 0 && (
            <div className="notconn">
              <div>
                <p className="body01"><b>No documents selected yet</b></p>
                <p className="helper mt2">Pick one or more documents in step 1 — analysis runs on your selection with the style settings from step 2.</p>
              </div>
              <button className="btn btn--tertiary btn--sm btn--center" onClick={() => setStep(0)}>Go to step 1</button>
            </div>
          )}
          {selDocs.map((d) => {
            const a = analyses[d.id];
            return (
              <div key={d.id} className="pickblock mt3">
                <div className="row row--between" style={{ flexWrap: 'wrap', gap: 10 }}>
                  <b className="mono" style={{ fontSize: 13 }}>{d.name}</b>
                  {!a ? <span className="helper">Analyzing…</span>
                    : a.error ? <span className="tag tag--red">{a.error}</span>
                    : <span className="row" style={{ gap: 8 }}>
                        {[['overall', 'Consistency'], ['terminology', 'Terms'], ['structure', 'Structure'], ['voice', 'Voice']].map(([k, l]) => (
                          <span key={k} className="tag tag--outline" style={{ color: scoreColor(a.audit.scores[k]) }}>{l} {a.audit.scores[k]}</span>
                        ))}
                      </span>}
                </div>
                {a && !a.error && (
                  <div className="grid2 mt3" style={{ gap: 20 }}>
                    <div>
                      <p className="label01 t2">CURRENT STRUCTURE ({a.current.length})</p>
                      <div className="mt2" style={{ maxHeight: 170, overflowY: 'auto' }}>
                        {a.current.slice(0, 30).map((s, i) => (
                          <p key={i} className="helper" style={{ paddingLeft: (s.level - 1) * 12 }}>{s.title}</p>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="label01 t2">RECOMMENDED ({DOC_TYPES.find(([id]) => id === docType)[1].toUpperCase()})</p>
                      <div className="mt2" style={{ maxHeight: 170, overflowY: 'auto' }}>
                        {a.recommended.map((r, i) => (
                          <p key={i} className="helper">
                            {r.present ? '✓ ' : <span style={{ color: 'var(--support-error)' }}>＋ </span>}{r.title}
                            {!r.present && <span className="reporow-meta"> — will be added from existing content where possible</span>}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {a && !a.error && a.audit.findings.length > 0 && (
                  <details className="pubrepo mt3">
                    <summary>{a.audit.findings.length} writing finding{a.audit.findings.length > 1 ? 's' : ''}</summary>
                    <div className="mt2">
                      {a.audit.findings.slice(0, 10).map((f, i) => (
                        <p key={i} className="helper">· {f.kind}: “{f.detected}” → “{f.preferred}” ({f.occurrences}×) — {f.action}</p>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })}

          {run && (() => {
            // Honest progress: within the current document the fraction creeps
            // asymptotically toward ~95% (elapsed / (elapsed + 40s)) — it can
            // slow down, but it can never claim "done" before the server does.
            const inFlight = run.idx < run.total;
            const perDoc = inFlight ? Math.min(0.95, run.elapsed / (run.elapsed + 40)) : 0;
            const pct = Math.min(100, Math.round(((run.idx + perDoc) / run.total) * 100));
            const stageIdx = Math.min(Math.floor(run.elapsed / 8), RUN_STEPS.length - 1);
            return (
              <div className="pickblock mt5" style={{ borderLeft: '3px solid #0f62fe' }}>
                <div className="row row--between" style={{ flexWrap: 'wrap', gap: 10 }}>
                  <p className="body01"><b>Correcting document {Math.min(run.idx + 1, run.total)} of {run.total}</b>
                    {inFlight && <span className="t2"> — {selDocs[run.idx] ? selDocs[run.idx].name : ''}</span>}
                  </p>
                  <p className="h02" style={{ color: '#0f62fe' }}>{pct}%</p>
                </div>
                <div className="syncprog mt3"><div style={{ width: pct + '%' }} /></div>
                <p className="helper mt2">
                  {inFlight
                    ? RUN_STEPS[stageIdx] + '… · ' + run.elapsed + 's elapsed — large documents take 1–3 minutes'
                    : 'Finishing…'}
                  {' · you can leave this page — proposals land in the review queue either way'}
                </p>
                {run.results.map((r) => (
                  <p key={r.docId} className="helper mt2">
                    {r.error ? (r.soft ? '⏳ ' : '✕ ') + r.name + ' — ' + r.error
                      : '✓ ' + r.name + (r.scores ? ' — consistency ' + r.scores.before.overall + ' → ' + r.scores.after.overall : '')}
                  </p>
                ))}
              </div>
            );
          })()}

          <div className="row mt6" style={{ justifyContent: 'space-between' }}>
            <button className="btn btn--ghost btn--field" disabled={!!run} onClick={() => setStep(1)}>← Back</button>
            <button className="btn btn--primary btn--field" disabled={!!run || !selDocs.length || selDocs.some((d) => !analyses[d.id])}
              onClick={correctAll}>
              Correct {selDocs.length} document{selDocs.length === 1 ? '' : 's'} →
            </button>
          </div>
        </div>
      )}

      {/* ---------------- Step 4: Review & export ---------------- */}
      {step === 3 && editing && (
        <div className="mt6">
          <InlineReviewEditor
            proposal={editing}
            onClose={() => setEditing(null)}
            onApproved={() => { setEditing(null); loadProposals(); }} />
        </div>
      )}
      {step === 3 && !editing && (
        <div className="mt6">
          {proposals === null ? <p className="body01 t2">Loading proposals…</p> : (
            <>
              {proposals.length === 0 && <p className="body01 t2">No standardization proposals yet — run a correction in the previous step.</p>}
              {proposals.map((u) => {
                const reasoning = typeof u.reasoning === 'string' ? JSON.parse(u.reasoning || '{}') : (u.reasoning || {});
                const sc = reasoning.scores || {};
                return (
                  <div key={u.id} className="pickblock mt3">
                    <div className="row row--between" style={{ flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <b className="mono" style={{ fontSize: 13 }}>{u.docName}</b>
                        {reasoning.simulated && <span className="tag tag--gray" style={{ marginLeft: 8 }} title="The AI engine is not configured on this deployment. The document was structured deterministically; open the editor to refine sections. Per-selection rewrites run in preview mode.">Structured without AI</span>}
                        <p className="helper mt2">
                          {sc.before && sc.after
                            ? <>Writing consistency <b style={{ color: scoreColor(sc.before.overall) }}>{sc.before.overall}</b> → <b style={{ color: scoreColor(sc.after.overall) }}>{sc.after.overall}</b> · terms {sc.before.terminology}→{sc.after.terminology} · structure {sc.before.structure}→{sc.after.structure}</>
                            : u.message}
                          {' · '}{u.status === 'pending' ? 'awaiting your approval' : u.status}
                        </p>
                      </div>
                      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                        {u.status === 'pending' && (
                          <>
                            <button className="btn btn--primary btn--sm btn--center" onClick={() => setEditing(u)}>Review &amp; edit</button>
                            <button className="btn btn--tertiary btn--sm btn--center" disabled={actBusy === u.id} onClick={() => act(u, 'approve')}>Approve all</button>
                            <button className="btn btn--ghost btn--sm btn--center" disabled={actBusy === u.id} onClick={() => act(u, 'reject')}>Dismiss</button>
                          </>
                        )}
                        {u.status === 'approved' && (
                          <button className="btn btn--tertiary btn--sm btn--center" onClick={() => download('/sync/documents/' + u.docId + '/download').catch((e) => toast('error', 'Download failed', e.message))}>
                            Download corrected file
                          </button>
                        )}
                        <button className="linkbtn" onClick={() => setShowDiff(showDiff === u.id ? '' : u.id)}>
                          {showDiff === u.id ? 'Hide changes' : 'View changes'}
                        </button>
                      </div>
                    </div>
                    {showDiff === u.id && (() => {
                      const d = typeof u.diff === 'string' ? JSON.parse(u.diff || '{}') : (u.diff || {});
                      return (
                        <div className="mt3">
                          <DiffView
                            before={(d.before || []).join('\n')}
                            after={(d.after || []).join('\n')}
                            labels="red = original document · green = corrected version" />
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
              <p className="helper mt5">
                Approving replaces the live document (the previous version is kept — restore any time from Doc sync → Versions).
                Corrected documents stay saved on the Docify server; downloads are built from the latest approved state.
                Publishing back to a repository requires write access, which Docify deliberately does not request — download and commit the file yourself.
              </p>
              <div className="row mt5" style={{ justifyContent: 'space-between' }}>
                <button className="btn btn--ghost btn--field" onClick={() => setStep(2)}>← Back</button>
                <button className="btn btn--tertiary btn--field" onClick={() => { setSel({}); setRun(null); setProposals(null); setAnalyses({}); setStep(0); loadDocs(); }}>Start a new governance run</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
