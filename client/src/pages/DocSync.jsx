import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { toast } from '../store.jsx';
import { Modal, NavBar, Notif } from '../ui.jsx';
import { usePageMeta } from '../seo.js';

/* =========================================================================
   Doc sync — AI-maintained existing documentation.
   Upload a baseline document once; every repository change is documented,
   semantically placed into the right section, reviewed as a side-by-side
   diff with AI reasoning, and versioned on approval.
   ========================================================================= */

const fmtDate = (d) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/* ---------- Confidence meter ---------- */
function ConfMeter({ n, wide }) {
  const cls = n >= 80 ? '' : n >= 60 ? ' warn' : ' bad';
  return (
    <span className={'confmeter' + cls} style={wide ? { minWidth: 200 } : undefined} title={'Placement confidence ' + n + '%'}>
      <span className="track"><span className="fill" style={{ width: n + '%' }} /></span>
      <span className="pct">{n}%</span>
    </span>
  );
}

function KindTag({ kind }) {
  return kind === 'insert-new'
    ? <span className="tag tag--purple">new sub-section</span>
    : <span className="tag tag--blue">update section</span>;
}

function StatusTag({ status }) {
  const m = { pending: ['tag--amber', 'Awaiting review'], approved: ['tag--green', 'Approved'], rejected: ['tag--red', 'Rejected'] };
  const [cls, label] = m[status] || ['tag--gray', status];
  return <span className={'tag ' + cls}>{label}</span>;
}

/* ---------- Line diff marking (which lines changed between the panes) ---------- */
function markDiff(before, after) {
  const counts = new Map();
  after.forEach((l) => counts.set(l, (counts.get(l) || 0) + 1));
  const leftCls = before.map((l) => {
    const c = counts.get(l) || 0;
    if (c > 0) { counts.set(l, c - 1); return ''; }
    return 'del';
  });
  const counts2 = new Map();
  before.forEach((l) => counts2.set(l, (counts2.get(l) || 0) + 1));
  const rightCls = after.map((l) => {
    const c = counts2.get(l) || 0;
    if (c > 0) { counts2.set(l, c - 1); return ''; }
    return 'add';
  });
  return { leftCls, rightCls };
}

/* ---------- Side-by-side diff viewer ---------- */
function DiffViewer({ diff, kind, leftTitle = 'Current document', rightTitle = 'After this update' }) {
  const before = diff.before || [];
  const after = diff.after || [];
  const context = diff.context || [];
  const start = diff.startLine || 1;
  const { leftCls, rightCls } = markDiff(before, after);
  const cap = 400;
  return (
    <div className="diffwrap">
      <div className="diffhead"><div>{leftTitle}</div><div>{rightTitle}</div></div>
      <div className="diffbody">
        <div className="diffpane">
          {kind === 'insert-new' ? (
            <>
              {context.map((l, i) => (
                <div key={i} className="dline dline--ctx">
                  <span className="dnum">{start - context.length + i + 1}</span>
                  <span className="dtext">{l || ' '}</span>
                </div>
              ))}
              <div className="dline dline--pad"><span className="dnum">·</span><span className="dtext t2" style={{ fontStyle: 'italic' }}>content inserted after this point — nothing removed</span></div>
            </>
          ) : before.slice(0, cap).map((l, i) => (
            <div key={i} className={'dline' + (leftCls[i] === 'del' ? ' dline--del' : '')}>
              <span className="dnum">{start + i}</span>
              <span className="dtext">{l || ' '}</span>
            </div>
          ))}
        </div>
        <div className="diffpane">
          {after.slice(0, cap).map((l, i) => (
            <div key={i} className={'dline' + (rightCls[i] === 'add' ? ' dline--add' : '')}>
              <span className="dnum">{start + i}</span>
              <span className="dtext">{l || ' '}</span>
            </div>
          ))}
        </div>
      </div>
      {(before.length > cap || after.length > cap) && (
        <p className="helper" style={{ padding: '8px 16px' }}>Showing the first {cap} lines of each pane.</p>
      )}
    </div>
  );
}

/* ---------- Sample document (lets anyone try the flow without a file) ---------- */
const SAMPLE_DOC = `# Payments Platform — Developer Guide

This guide covers integrating the Acme payments API: authentication, core
endpoints, error handling, and operational limits.

## Getting started

Create a workspace, generate an API key from **Settings → API keys**, and make
your first request against the sandbox environment.

## Authentication

Every request carries a bearer token in the \`Authorization\` header. API keys
are created per environment; sandbox keys never work against production.

## Endpoints

### Charges

Create and retrieve charges with \`POST /v1/charges\` and \`GET /v1/charges/:id\`.
Amounts are integer minor units (cents).

### Customers

Customers group charges and payment methods. Create with \`POST /v1/customers\`.

## Errors

The API uses conventional HTTP status codes: \`4xx\` for request problems and
\`5xx\` for platform faults. Retry only idempotent requests.

## Rate limits

Requests are rate-limited per API key. When throttled you receive
\`429 Too Many Requests\` — respect the \`Retry-After\` header before retrying.

## Webhooks

Subscribe to events from **Settings → Webhooks**. Deliveries are retried with
exponential backoff for 24 hours.

## Configuration

Runtime behaviour is tuned through environment variables documented in
\`.env.example\`. Restart workers after changing them.
`;

/* HTML exports (Confluence/Notion) → text the outline parser understands. */
function htmlToText(html) {
  let s = String(html);
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (m, lv, t) => '\n' + '#'.repeat(Number(lv)) + ' ' + t.replace(/<[^>]+>/g, '').trim() + '\n');
  s = s.replace(/<(?:p|div|li|tr|br)[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------- Upload panel ---------- */
function UploadPanel({ onUploaded }) {
  const [repo, setRepo] = useState('acme/payments-api');
  const [branch, setBranch] = useState('main');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const fileRef = useRef(null);

  const send = useCallback(async (name, format, content) => {
    setBusy(true);
    try {
      const d = await api('/sync/documents', { method: 'POST', body: { name, format, content, repo, branch } });
      toast('success', 'Document received', 'Parsing structure and building the semantic index…');
      onUploaded(d.document);
    } catch (e) {
      toast('error', 'Upload failed', e.message);
    } finally { setBusy(false); }
  }, [repo, branch, onUploaded]);

  const handleFile = useCallback((file) => {
    if (!file) return;
    const name = file.name || 'document';
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (['pdf', 'docx', 'doc'].includes(ext)) {
      toast('warning', ext.toUpperCase() + ' extraction is coming next', 'For now export the document as Markdown, HTML, or plain text and upload that.');
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      toast('error', 'File too large', 'Documents up to 1.5 MB of text are supported.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const isHtml = ['html', 'htm'].includes(ext) || /^\s*</.test(raw.slice(0, 200));
      const content = isHtml ? htmlToText(raw) : raw;
      const format = isHtml ? 'html' : ext === 'txt' ? 'text' : 'markdown';
      send(name, format, content);
    };
    reader.onerror = () => toast('error', 'Could not read file', 'Try again or use a different export.');
    reader.readAsText(file);
  }, [send]);

  return (
    <div className="tile tile--white" style={{ padding: 24 }}>
      <h3 className="h02">Upload existing documentation</h3>
      <p className="body01 t2 mt3" style={{ maxWidth: 640 }}>
        Your document becomes the project baseline. The engine parses its headings, hierarchy, terminology and
        style — then places every future repository change into the right section automatically.
      </p>
      <div className="grid2 mt5">
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="sync-repo">Mapped repository</label>
          <input id="sync-repo" className="input" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repository" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="sync-branch">Branch</label>
          <input id="sync-branch" className="input" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
        </div>
      </div>
      <div
        className={'sync-drop mt5' + (over ? ' over' : '')}
        onClick={() => fileRef.current && fileRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handleFile(e.dataTransfer.files && e.dataTransfer.files[0]); }}
        role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current && fileRef.current.click(); } }}
        aria-label="Upload a documentation file"
      >
        <input ref={fileRef} type="file" accept=".md,.markdown,.mdx,.txt,.text,.html,.htm,.rst,.adoc" onChange={(e) => { handleFile(e.target.files && e.target.files[0]); e.target.value = ''; }} />
        <p className="body01"><b>Drag a file here</b> or click to browse</p>
        <p className="helper mt2">Markdown · plain text · HTML (Confluence / Notion export) — PDF &amp; Word extraction coming next</p>
      </div>
      <div className="row mt5" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn--tertiary btn--field" disabled={busy}
          onClick={() => send('payments-developer-guide.md', 'markdown', SAMPLE_DOC)}>
          Try with a sample document
        </button>
        <span className="helper">1,000+ page documents are supported — only the outline is indexed for placement.</span>
      </div>
    </div>
  );
}

/* ---------- One document card ---------- */
function DocCard({ doc, onChanged, onSynced }) {
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyParsing = doc.status === 'parsing' || doc.status === 'indexing';
  const p = doc.profile || {};

  async function syncNow() {
    setBusy(true);
    try {
      const d = await api('/sync/documents/' + doc.id + '/sync', { method: 'POST', body: { batch: 2 } });
      if (d.created > 0) {
        toast('success', d.created + ' AI update' + (d.created > 1 ? 's' : '') + ' queued', 'Open the review queue to compare and approve.');
        onSynced();
      } else {
        toast('info', 'Up to date', d.message || 'No new commits on ' + (doc.repo || 'the repository') + '.');
      }
      onChanged();
    } catch (e) { toast('error', 'Sync failed', e.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    try {
      await api('/sync/documents/' + doc.id, { method: 'DELETE' });
      toast('info', 'Document removed', doc.name);
      setDelOpen(false);
      onChanged();
    } catch (e) { toast('error', 'Delete failed', e.message); }
  }

  return (
    <div className={'syncdoc syncdoc--' + (doc.status === 'ready' ? 'ready' : doc.status === 'failed' ? 'failed' : 'busy')}>
      <div className="row row--between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p className="h01 mono" style={{ fontWeight: 600 }}>{doc.name}</p>
          <p className="helper mt2">
            {doc.repo ? doc.repo + ' · ' + doc.branch : 'No repository mapped'} · uploaded {fmtDate(doc.createdAt)}
          </p>
        </div>
        {doc.status === 'ready' && <span className="tag tag--green">Indexed</span>}
        {busyParsing && <span className="tag tag--blue">{doc.status === 'parsing' ? 'Parsing structure…' : 'Building semantic index…'}</span>}
        {doc.status === 'failed' && <span className="tag tag--red">Failed</span>}
      </div>

      {busyParsing && (
        <div>
          <div className="syncprog"><div style={{ width: doc.progress + '%' }} /></div>
          <p className="helper mt2">{doc.progress}% — extracting headings, hierarchy, cross-references and terminology</p>
        </div>
      )}

      {doc.status === 'failed' && <Notif kind="error" title="Could not parse this document">{doc.error}</Notif>}

      {doc.status === 'ready' && (
        <>
          <div className="row" style={{ flexWrap: 'wrap', gap: 16 }}>
            <span className="body01"><b>{doc.sections.length}</b> <span className="t2">sections</span></span>
            <span className="body01"><b>~{p.pagesEst || 1}</b> <span className="t2">pages</span></span>
            <span className="body01"><b>{(p.lines || 0).toLocaleString()}</b> <span className="t2">lines</span></span>
            <span className="body01"><b>{p.headingStyle || '—'}</b></span>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button className="btn btn--primary btn--sm btn--center" onClick={syncNow} disabled={busy}>
              {busy ? 'Checking…' : 'Check for new commits'}
            </button>
            <button className="btn btn--tertiary btn--sm btn--center" onClick={() => setOutlineOpen(true)}>Structure &amp; understanding</button>
            <button className="btn btn--ghost btn--sm btn--center" onClick={() => setSimOpen(true)}>Simulate a commit</button>
            <button className="btn btn--ghost btn--sm btn--center" style={{ color: 'var(--support-error)' }} onClick={() => setDelOpen(true)}>Remove</button>
          </div>
        </>
      )}

      {/* Outline + semantic understanding */}
      <Modal open={outlineOpen} onClose={() => setOutlineOpen(false)}>
        <div className="mhead">
          <div>
            <h3 className="h02">What the AI understood</h3>
            <p className="helper mt2">{doc.name}</p>
          </div>
          <button className="mclose" aria-label="Close" onClick={() => setOutlineOpen(false)}>✕</button>
        </div>
        <div className="mbody">
          <p className="label01 t2 mb3">DOCUMENT STRUCTURE ({doc.sections.length} SECTIONS)</p>
          <div className="outline">
            {doc.sections.map((s, i) => (
              <div key={i} className="oline">
                <span className="onum">L{s.line}</span>
                <span style={{ paddingLeft: (s.level - 1) * 14 }}>{s.num ? s.num + ' ' : ''}{s.title}</span>
              </div>
            ))}
          </div>
          <p className="label01 t2 mb3 mt5">SEMANTIC PROFILE</p>
          <p className="body01"><span className="t2">Writing style:</span> {p.tone || '—'} · {p.headingStyle}</p>
          {p.terms && p.terms.length > 0 && (
            <p className="body01 mt3"><span className="t2">Core terminology:</span>{' '}
              {p.terms.slice(0, 8).map((t) => t.term).join(', ')}</p>
          )}
          {p.glossary && p.glossary.length > 0 && (
            <p className="body01 mt3"><span className="t2">Glossary candidates:</span> {p.glossary.join(', ')}</p>
          )}
          <p className="helper mt5">Future updates match against these sections and vocabulary — insertions inherit the document’s own style.</p>
        </div>
      </Modal>

      <SimulateModal open={simOpen} onClose={() => setSimOpen(false)} doc={doc} onCreated={() => { setSimOpen(false); onSynced(); onChanged(); }} />

      {/* Delete confirm */}
      <Modal open={delOpen} onClose={() => setDelOpen(false)}>
        <div className="mhead">
          <h3 className="h02">Remove {doc.name}?</h3>
          <button className="mclose" aria-label="Close" onClick={() => setDelOpen(false)}>✕</button>
        </div>
        <div className="mbody">
          <p className="body01 t2">This deletes the baseline, its versions, and any pending updates. Approved changes already exported elsewhere are unaffected.</p>
        </div>
        <div className="mfoot">
          <button className="btn btn--ghost btn--center" onClick={() => setDelOpen(false)}>Cancel</button>
          <button className="btn btn--primary btn--center" style={{ background: 'var(--button-danger)' }} onClick={remove}>Remove document</button>
        </div>
      </Modal>
    </div>
  );
}

function SimulateModal({ open, onClose, doc, onCreated }) {
  const [message, setMessage] = useState('feat(auth): add single sign-on with SAML');
  const [files, setFiles] = useState('src/auth/saml.js, src/auth/middleware.js');
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      await api('/sync/documents/' + doc.id + '/simulate', { method: 'POST', body: { message, files } });
      toast('success', 'Update queued for review', 'The engine placed the change — check the review queue.');
      onCreated();
    } catch (e) { toast('error', 'Simulation failed', e.message); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose}>
      <div className="mhead">
        <div>
          <h3 className="h02">Simulate a commit</h3>
          <p className="helper mt2">Exercises the exact pipeline a GitHub webhook triggers.</p>
        </div>
        <button className="mclose" aria-label="Close" onClick={onClose}>✕</button>
      </div>
      <div className="mbody">
        <div className="field">
          <label htmlFor="sim-msg">Commit message</label>
          <input id="sim-msg" className="input" value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="sim-files">Changed files (comma-separated)</label>
          <input id="sim-files" className="input mono" style={{ fontSize: 13 }} value={files} onChange={(e) => setFiles(e.target.value)} />
        </div>
      </div>
      <div className="mfoot">
        <button className="btn btn--ghost btn--center" onClick={onClose}>Cancel</button>
        <button className="btn btn--primary btn--center" disabled={busy || !message.trim()} onClick={run}>{busy ? 'Placing…' : 'Run placement'}</button>
      </div>
    </Modal>
  );
}

/* ---------- Review queue: master list + detail with reasoning and diff ---------- */
function ReviewQueue({ pending, onDecided, refresh }) {
  const [selId, setSelId] = useState(pending[0] ? pending[0].id : null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pending.find((u) => u.id === selId)) setSelId(pending[0] ? pending[0].id : null);
  }, [pending, selId]);
  const sel = pending.find((u) => u.id === selId) || null;
  // Seed the editor with the FULL post-update section body (not just the AI
  // snippet) so editing never silently drops the section's existing prose.
  const editSeed = (u) => u.kind === 'update-existing'
    ? ((u.diff.after || []).slice(1).join('\n').replace(/^\n+/, ''))
    : u.snippet;
  useEffect(() => { setEditing(false); setDraft(sel ? editSeed(sel) : ''); }, [selId]); // eslint-disable-line

  if (!pending.length) {
    return (
      <div className="sync-empty">
        <p className="h03">Review queue is clear</p>
        <p className="body01 t2 mt3" style={{ maxWidth: 520, margin: '8px auto 0' }}>
          When commits land on your mapped repository, the engine documents each change, finds the right
          section of your document, and queues it here for approval.
        </p>
      </div>
    );
  }

  async function decide(action) {
    if (!sel) return;
    setBusy(true);
    try {
      if (action === 'approve') {
        const body = editing && draft.trim() !== editSeed(sel) ? { snippet: draft } : {};
        const d = await api('/sync/updates/' + sel.id + '/approve', { method: 'POST', body });
        toast('success', 'Applied to ' + (sel.docName || 'document'), 'Version v' + d.version + ' created — restorable any time.');
      } else {
        await api('/sync/updates/' + sel.id + '/reject', { method: 'POST' });
        toast('info', 'Update rejected', 'Nothing was changed in your document.');
      }
      onDecided();
    } catch (e) { toast('error', 'Action failed', e.message); refresh(); }
    finally { setBusy(false); }
  }

  async function saveEdit() {
    if (!sel || !draft.trim()) return;
    setBusy(true);
    try {
      await api('/sync/updates/' + sel.id, { method: 'PUT', body: { snippet: draft } });
      toast('success', 'Content updated', 'The diff below reflects your edit.');
      setEditing(false);
      refresh();
    } catch (e) { toast('error', 'Save failed', e.message); }
    finally { setBusy(false); }
  }

  const r = sel ? sel.reasoning : {};
  return (
    <div className="queue">
      <div className="qlist" role="listbox" aria-label="Pending documentation updates">
        {pending.map((u) => (
          <button key={u.id} className={'qitem' + (u.id === selId ? ' on' : '')} onClick={() => setSelId(u.id)}
            role="option" aria-selected={u.id === selId}>
            <span className="qmsg">{u.message}</span>
            <span className="qmeta">
              <span className="mono">{u.commit}</span>
              <span>→ {u.anchor.anchorPath || u.anchor.title}</span>
            </span>
            <span className="qmeta"><KindTag kind={u.kind} /><ConfMeter n={u.confidence} /></span>
          </button>
        ))}
      </div>

      {sel && (
        <div className="stack" style={{ minWidth: 0 }}>
          <div className="tile tile--white" style={{ padding: 20 }}>
            <div className="row row--between" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 className="h02">{sel.message}</h3>
                <p className="helper mt2">
                  <span className="mono">{sel.commit}</span> · {sel.author} · {sel.branch} · {sel.docName} · {fmtDate(sel.createdAt)}
                </p>
              </div>
              <KindTag kind={sel.kind} />
            </div>
            <div className="ctlfiles">{sel.files.map((f) => <span key={f}>{f}</span>)}</div>
          </div>

          <div className="reason">
            <span className="rkick">AI REASONING</span>
            <div className="rrow"><span className="rlabel">Target location</span>
              <span className="body01"><b>{sel.anchor.anchorPath || sel.anchor.title}</b>{sel.anchor.page ? <span className="t2"> · page {sel.anchor.page} · line {sel.anchor.line}</span> : null}</span></div>
            <div className="rrow"><span className="rlabel">Confidence</span><ConfMeter n={sel.confidence} wide /></div>
            <div className="rrow"><span className="rlabel">Why here</span><span className="body01">{r.why}</span></div>
            <div className="rrow"><span className="rlabel">How it matched</span><span className="body01 t2">{r.semantic}</span></div>
            {r.candidates && r.candidates.length > 1 && (
              <div>
                <p className="label01 t2 mb3">RANKED CANDIDATE SECTIONS</p>
                <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {r.candidates.map((c, i) => (
                    <div key={i} className={'candrow' + (i === 0 ? ' best' : '')}>
                      <span>{c.title}<span className="t2"> · p.{c.page}</span></span>
                      <span className="row" style={{ gap: 10 }}>
                        {i === 0 && <span className="tag tag--blue">selected</span>}
                        <ConfMeter n={c.confidence} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {editing ? (
            <div className="tile tile--white" style={{ padding: 20 }}>
              <div className="row row--between mb3">
                <h4 className="h01">Edit generated content</h4>
                <span className="helper">Markdown — the heading and placement stay as decided</span>
              </div>
              <textarea className="editbox" value={draft} onChange={(e) => setDraft(e.target.value)} rows={10} aria-label="Edit generated content" />
              <div className="row mt5">
                <button className="btn btn--primary btn--sm btn--center" onClick={saveEdit} disabled={busy || !draft.trim()}>Save changes</button>
                <button className="btn btn--ghost btn--sm btn--center" onClick={() => { setEditing(false); setDraft(editSeed(sel)); }}>Cancel</button>
              </div>
            </div>
          ) : (
            <DiffViewer diff={sel.diff} kind={sel.kind} />
          )}

          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn--primary" onClick={() => decide('approve')} disabled={busy || editing}>
              Approve &amp; apply<span className="ico">✓</span>
            </button>
            <button className="btn btn--tertiary" onClick={() => { setEditing(true); setDraft(editSeed(sel)); }} disabled={busy || editing}>
              Edit content
            </button>
            <button className="btn btn--ghost" style={{ color: 'var(--support-error)' }} onClick={() => decide('reject')} disabled={busy}>
              Reject
            </button>
            <span className="navnote">Approval splices the change into the document and cuts a new version.</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Commit timeline ---------- */
function Timeline({ onOpenQueue }) {
  const [tl, setTl] = useState(null);
  useEffect(() => { api('/sync/timeline').then((d) => setTl(d.timeline)).catch(() => setTl([])); }, []);
  if (!tl) return <p className="body01 t2">Loading…</p>;
  if (!tl.length) {
    return (
      <div className="sync-empty">
        <p className="h03">No synchronized commits yet</p>
        <p className="body01 t2 mt3">Upload a document and check for new commits — every commit will appear here with the documentation it produced.</p>
      </div>
    );
  }
  return (
    <div className="ctl">
      {tl.map((c) => {
        const allDone = c.updates.every((u) => u.status !== 'pending');
        return (
          <div key={c.commit + c.at} className={'ctlitem' + (allDone ? ' ctlitem--done' : '')}>
            <div className="ctlcard">
              <div className="row row--between" style={{ flexWrap: 'wrap', gap: 8 }}>
                <p className="body01"><b>{c.message}</b></p>
                <span className="helper">{fmtDate(c.at)}</span>
              </div>
              <p className="helper mt2">
                <span className="mono">{c.commit}</span> · {c.author} · {c.branch}
                {c.adds || c.dels ? <span> · <span style={{ color: 'var(--support-success)' }}>+{c.adds}</span> <span style={{ color: 'var(--support-error)' }}>−{c.dels}</span></span> : null}
              </p>
              <div className="ctlfiles">{c.files.map((f) => <span key={f}>{f}</span>)}</div>
              <div className="mt5" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {c.updates.map((u) => (
                  <div key={u.id} className="row row--between" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <span className="body01 t2">
                      → <b style={{ color: 'var(--text-primary)' }}>{u.anchor.anchorPath || u.anchor.title}</b> in {u.docName}
                      {u.versionNumber ? <span className="tag tag--outline" style={{ marginLeft: 8 }}>v{u.versionNumber}</span> : null}
                    </span>
                    <span className="row" style={{ gap: 10 }}>
                      <ConfMeter n={u.confidence} />
                      <StatusTag status={u.status} />
                      {u.status === 'pending' && <button className="linkbtn" onClick={onOpenQueue}>Review</button>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Version history ---------- */
function Versions({ docs }) {
  const ready = docs.filter((d) => d.status === 'ready');
  const [docId, setDocId] = useState(ready[0] ? ready[0].id : null);
  const [data, setData] = useState(null);
  const [compare, setCompare] = useState(null); // {version, content}
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!docId && ready[0]) setDocId(ready[0].id); }, [docs]); // eslint-disable-line
  const load = useCallback(() => {
    if (!docId) return;
    api('/sync/documents/' + docId).then(setData).catch(() => setData(null));
  }, [docId]);
  useEffect(() => { setData(null); load(); }, [docId, load]);

  if (!ready.length) {
    return (
      <div className="sync-empty">
        <p className="h03">No versions yet</p>
        <p className="body01 t2 mt3">Upload a document — the baseline becomes v1, and every approved update cuts a new restorable version.</p>
      </div>
    );
  }

  async function restore(n) {
    setBusy(true);
    try {
      await api('/sync/documents/' + docId + '/restore/' + n, { method: 'POST' });
      toast('success', 'Restored v' + n, 'The document body now matches v' + n + ' — recorded as a new version.');
      load();
    } catch (e) { toast('error', 'Restore failed', e.message); }
    finally { setBusy(false); }
  }

  async function openCompare(v) {
    try {
      const d = await api('/sync/versions/' + v.id);
      setCompare({ version: d.version, current: data.document.content });
    } catch (e) { toast('error', 'Could not load version', e.message); }
  }

  const versions = data ? data.versions : null;
  const latest = versions && versions.length ? versions[0].number : 0;
  const srcTag = { upload: ['tag--blue', 'Baseline upload'], 'ai-update': ['tag--green', 'AI update'], restore: ['tag--amber', 'Restore'], edit: ['tag--gray', 'Manual edit'] };

  return (
    <div>
      {ready.length > 1 && (
        <div className="field" style={{ maxWidth: 420 }}>
          <label htmlFor="verdoc">Document</label>
          <select id="verdoc" className="select" value={docId || ''} onChange={(e) => setDocId(e.target.value)}>
            {ready.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      )}
      {!versions ? <p className="body01 t2">Loading…</p> : (
        <table className="dtable">
          <thead><tr><th>VERSION</th><th>SOURCE</th><th>SUMMARY</th><th>COMMIT</th><th>CREATED</th><th></th></tr></thead>
          <tbody>
            {versions.map((v) => {
              const [cls, label] = srcTag[v.source] || ['tag--gray', v.source];
              return (
                <tr key={v.id} className="vrow">
                  <td className="mono">v{v.number}{v.number === latest && <span className="tag tag--outline" style={{ marginLeft: 8 }}>current</span>}</td>
                  <td><span className={'tag ' + cls}>{label}</span></td>
                  <td style={{ maxWidth: 380 }}>{v.summary}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{v.commit || '—'}</td>
                  <td className="t2">{fmtDate(v.createdAt)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="linkbtn" onClick={() => openCompare(v)}>Compare</button>
                    {v.number !== latest && <button className="linkbtn" disabled={busy} onClick={() => restore(v.number)} style={{ marginLeft: 12 }}>Restore</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {compare && (
        <Modal open onClose={() => setCompare(null)}>
          <div className="mhead">
            <div>
              <h3 className="h02">v{compare.version.number} vs current</h3>
              <p className="helper mt2">{compare.version.summary}</p>
            </div>
            <button className="mclose" aria-label="Close" onClick={() => setCompare(null)}>✕</button>
          </div>
          <div className="mbody" style={{ maxWidth: '100%' }}>
            <DiffViewer
              diff={{ startLine: 1, before: compare.version.content.split(/\r?\n/), after: compare.current.split(/\r?\n/) }}
              kind="update-existing"
              leftTitle={'v' + compare.version.number}
              rightTitle="Current"
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================================ Page ================================ */
export default function DocSync() {
  usePageMeta({
    title: 'Doc sync — keep existing documentation current automatically',
    description: 'Upload your existing documentation once. Every commit is documented, semantically placed into the right section, reviewed as a diff, and versioned.'
  });
  const nav = useNavigate();
  const [tab, setTab] = useState('documents');
  const [docs, setDocs] = useState(null);
  const [pending, setPending] = useState([]);
  const [overview, setOverview] = useState(null);
  const autoSynced = useRef(new Set());

  const loadDocs = useCallback(() => api('/sync/documents').then((d) => setDocs(d.documents)).catch(() => setDocs([])), []);
  const loadPending = useCallback(() => api('/sync/updates?status=pending').then((d) => setPending(d.updates)).catch(() => setPending([])), []);
  const loadOverview = useCallback(() => api('/sync/overview').then(setOverview).catch(() => {}), []);
  const refreshAll = useCallback(() => { loadDocs(); loadPending(); loadOverview(); }, [loadDocs, loadPending, loadOverview]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  // Poll while any document is parsing/indexing; auto-run the first sync when
  // a fresh document becomes ready, so updates appear without extra clicks.
  useEffect(() => {
    if (!docs || !docs.some((d) => d.status === 'parsing' || d.status === 'indexing')) return undefined;
    const t = setInterval(async () => {
      try {
        const d = await api('/sync/documents');
        setDocs(d.documents);
        for (const doc of d.documents) {
          if (doc.status === 'ready' && doc.cursor === 0 && !autoSynced.current.has(doc.id)) {
            autoSynced.current.add(doc.id);
            toast('success', 'Document indexed', doc.sections.length + ' sections mapped — checking the repository for recent commits…');
            try {
              const s = await api('/sync/documents/' + doc.id + '/sync', { method: 'POST', body: { batch: 2 } });
              if (s.created > 0) toast('info', s.created + ' updates queued for review', 'The AI placed each change — approve them in the review queue.');
            } catch { /* manual sync still available */ }
            refreshAll();
          }
        }
      } catch { /* transient */ }
    }, 1100);
    return () => clearInterval(t);
  }, [docs, refreshAll]);

  if (!docs) return <div className="page"><p className="body01 t2">Loading…</p></div>;

  const o = overview || {};
  const tabs = [
    ['documents', 'Documents' + (docs.length ? ' (' + docs.length + ')' : '')],
    ['queue', 'Review queue' + (pending.length ? ' (' + pending.length + ')' : '')],
    ['timeline', 'Commit timeline'],
    ['versions', 'Version history']
  ];

  return (
    <>
      <div className="page">
        <div className="row row--between" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="h04">Doc sync</h1>
            <p className="body01 t2 mt3" style={{ maxWidth: 660 }}>
              Keep the documentation you already have continuously current. The AI understands your document,
              understands each commit, and splices updates into exactly the right section — you stay in control
              with review, confidence scores, and versioning.
            </p>
          </div>
          {pending.length > 0 && (
            <button className="btn btn--primary btn--field" onClick={() => setTab('queue')}>
              Review {pending.length} pending update{pending.length > 1 ? 's' : ''}<span className="ico">→</span>
            </button>
          )}
        </div>

        <div className="statgrid mt7">
          <div className="score score--info"><span className="label01 t2">Documents indexed</span><span className="num">{o.ready ?? docs.filter((d) => d.status === 'ready').length}</span><span className="helper">Baselines the AI maintains</span></div>
          <div className={'score ' + (pending.length ? 'score--warn' : 'score--good')}><span className="label01 t2">Pending updates</span><span className="num">{pending.length}</span><span className="helper">Awaiting your review</span></div>
          <div className="score score--good"><span className="label01 t2">Avg placement confidence</span><span className="num">{o.avgConfidence ? o.avgConfidence + '%' : '—'}</span><span className="helper">Across all AI placements</span></div>
          <div className="score score--good"><span className="label01 t2">Placement acceptance</span><span className="num">{o.placementAccuracy != null ? o.placementAccuracy + '%' : '—'}</span><span className="helper">{o.lastSync ? 'Last sync ' + fmtDate(o.lastSync) : 'Approved ÷ reviewed'}</span></div>
        </div>

        <div className="tabs mt7" role="tablist">
          {tabs.map(([id, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        {tab === 'documents' && (
          <div className="stack">
            <UploadPanel onUploaded={() => { loadDocs(); }} />
            {docs.length === 0 ? (
              <div className="sync-empty">
                <p className="h03">No documentation uploaded yet</p>
                <p className="body01 t2 mt3" style={{ maxWidth: 520, margin: '8px auto 0' }}>
                  Teams with hundreds of existing pages don’t start over — upload what you have and the AI
                  keeps it current from every commit onward. Try the sample document to see the full loop.
                </p>
              </div>
            ) : docs.map((d) => (
              <DocCard key={d.id} doc={d} onChanged={refreshAll} onSynced={() => { loadPending(); loadOverview(); }} />
            ))}
          </div>
        )}

        {tab === 'queue' && <ReviewQueue pending={pending} onDecided={refreshAll} refresh={loadPending} />}
        {tab === 'timeline' && <Timeline onOpenQueue={() => setTab('queue')} />}
        {tab === 'versions' && <Versions docs={docs} />}
      </div>
      <NavBar back="/dashboard" note="Nothing changes in your document without your approval." next="/automation" nextLabel="Automation" />
    </>
  );
}
