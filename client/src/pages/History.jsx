import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, download } from '../api.js';
import { toast } from '../store.jsx';
import { HelpLink } from '../ui.jsx';
import { usePageMeta } from '../seo.js';

/* =====================================================================
   Import History — the single source of truth for every generated
   document: searchable table, full version history, side-by-side diff,
   approval workflow (Draft → Under review → Approved → Published), and
   the gate the automation pipeline respects.
   ===================================================================== */

const APPROVAL_TAG = {
  draft: ['tag--gray', 'Draft'],
  review: ['tag--amber', 'Under review'],
  approved: ['tag--green', 'Approved'],
  published: ['tag--blue', 'Published']
};

/* Keyed by the state the server reports AFTER the change, never by the
   transition that was requested. */
const APPROVAL_TOAST = {
  draft: ['Back to draft', 'It is no longer approved or published.'],
  review: ['Sent for review', 'It is now waiting for a review decision.'],
  approved: ['Approved', 'Publish it when you are ready for your pipeline to distribute it.'],
  published: ['Published', 'This version is now the one your pipeline distributes.']
};

const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

/* ---------------- Line diff: LCS-based, with collapse + jump ---------------- */
function lineDiff(aText, bText) {
  const a = String(aText || '').split('\n');
  const b = String(bText || '').split('\n');
  // Guard: very large documents fall back to a plain block comparison.
  if (a.length * b.length > 4_000_000) {
    return [{ type: 'del', lines: a }, { type: 'add', lines: b }];
  }
  const n = a.length; const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let jj = m - 1; jj >= 0; jj--) {
      dp[i][jj] = a[i] === b[jj] ? dp[i + 1][jj + 1] + 1 : Math.max(dp[i + 1][jj], dp[i][jj + 1]);
    }
  }
  const ops = [];
  let i = 0; let jj = 0;
  const push = (type, line) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.lines.push(line);
    else ops.push({ type, lines: [line] });
  };
  while (i < n && jj < m) {
    if (a[i] === b[jj]) { push('same', a[i]); i++; jj++; }
    else if (dp[i + 1][jj] >= dp[i][jj + 1]) { push('del', a[i]); i++; }
    else { push('add', b[jj]); jj++; }
  }
  while (i < n) { push('del', a[i]); i++; }
  while (jj < m) { push('add', b[jj]); jj++; }
  return ops;
}

export function DiffView({ before, after, labels }) {
  const ops = useMemo(() => lineDiff(before, after), [before, after]);
  const [open, setOpen] = useState({}); // expanded collapsed blocks
  const changeIdx = ops.map((o, k) => (o.type !== 'same' ? k : -1)).filter((k) => k >= 0);
  const [cursor, setCursor] = useState(0);
  const jump = (dir) => {
    if (!changeIdx.length) return;
    const next = (cursor + dir + changeIdx.length) % changeIdx.length;
    setCursor(next);
    const el = document.getElementById('diff-op-' + changeIdx[next]);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const added = ops.filter((o) => o.type === 'add').reduce((s, o) => s + o.lines.length, 0);
  const removed = ops.filter((o) => o.type === 'del').reduce((s, o) => s + o.lines.length, 0);
  return (
    <div>
      <div className="row row--between mb3" style={{ flexWrap: 'wrap', gap: 10 }}>
        <span className="helper">
          <span style={{ color: 'var(--support-success)' }}>+{added}</span> added ·{' '}
          <span style={{ color: 'var(--support-error)' }}>−{removed}</span> removed · {changeIdx.length} change block{changeIdx.length === 1 ? '' : 's'}
          {labels ? ' · ' + labels : ''}
        </span>
        <span className="row" style={{ gap: 8 }}>
          <button className="btn btn--ghost btn--sm btn--center" onClick={() => jump(-1)}>↑ Previous</button>
          <button className="btn btn--ghost btn--sm btn--center" onClick={() => jump(1)}>↓ Next change</button>
        </span>
      </div>
      <div className="diffwrap">
        {ops.map((o, k) => {
          if (o.type === 'same') {
            if (o.lines.length > 8 && !open[k]) {
              return (
                <div key={k} id={'diff-op-' + k} className="diffline diffline--fold" onClick={() => setOpen((x) => ({ ...x, [k]: true }))}>
                  ⋯ {o.lines.length} unchanged lines — click to expand
                </div>
              );
            }
            return o.lines.map((l, li) => <div key={k + '-' + li} className="diffline">{l || ' '}</div>);
          }
          return (
            <div key={k} id={'diff-op-' + k}>
              {o.lines.map((l, li) => (
                <div key={li} className={'diffline diffline--' + o.type}>{(o.type === 'add' ? '+ ' : '− ') + (l || '')}</div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- The page ---------------- */
export default function History() {
  usePageMeta({
    title: 'Documents — versions, reviews & approvals',
    description: 'Every generated document with full version history, inline comparison, and an approval workflow before publishing.'
  });
  const [rows, setRows] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [q, setQ] = useState('');
  const [provider, setProvider] = useState('');
  const [approval, setApproval] = useState('');
  const [openId, setOpenId] = useState('');
  const [versions, setVersions] = useState({}); // id -> {current, versions}
  const [diff, setDiff] = useState(null); // { rowId, title, before, after, labels } — rendered INLINE in the expanded row
  const [busy, setBusy] = useState('');
  const { id: routeId } = useParams();
  const nav = useNavigate();

  const load = () => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (provider) p.set('provider', provider);
    if (approval) p.set('approval', approval);
    // An unreachable API and an account with no documents look identical if a
    // failure is swallowed into an empty list — keep them distinguishable.
    return api('/history?' + p.toString())
      .then((d) => { setRows(d.documents || []); setLoadErr(''); })
      .catch((e) => { setRows([]); setLoadErr(e.message || 'Request failed'); });
  };
  // Typing in the search box must not fire a request per keystroke.
  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [q, provider, approval]); // eslint-disable-line react-hooks/exhaustive-deps

  // `force` re-reads after a mutation; without it a cached timeline would
  // survive a restore or a status change and show stale version counts.
  const loadVersions = async (id, force = false) => {
    if (!id || (versions[id] && !force)) return;
    try {
      const d = await api('/history/' + id + '/versions');
      setVersions((v) => ({ ...v, [id]: d }));
    } catch (e) { toast('error', 'Could not load versions', e.message); }
  };
  // The URL drives which document is expanded: /history/:id opens that document,
  // so a refresh keeps it open and the link is shareable.
  useEffect(() => { setOpenId(routeId || ''); if (routeId) loadVersions(routeId); }, [routeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const openRow = (id) => { nav(openId === id ? '/history' : '/history/' + id); };

  const setStatus = async (id, to) => {
    // Reverting a live document to draft withdraws it from the automation
    // approval gate — confirm before undoing an approval or a publish, and
    // state exactly what stops happening.
    if (to === 'draft') {
      const cur = (rows || []).find((x) => x.id === id);
      const from = cur && cur.approval;
      if (from === 'published' || from === 'approved') {
        const was = (APPROVAL_TAG[from] || [])[1];
        const consequence = from === 'published'
          ? 'Your automation pipeline stops distributing this version until it is approved and published again.'
          : 'Its approval is cleared until it is approved again.';
        if (!window.confirm('Send this document back to draft? It is currently ' + was + '. ' + consequence)) return;
      }
    }
    setBusy(id + to);
    try {
      const r = await api('/history/' + id + '/status', { method: 'POST', body: { to } });
      // The transition we ASKED for is an intent; the state the server stored
      // is the fact. Reporting the intent is how a message can end up
      // describing a different transition from the one that actually landed.
      const now = (r && r.approval) || to;
      const [title, detail] = APPROVAL_TOAST[now] || ['Status updated', 'This document is now “' + now + '”.'];
      // Patch the row from the response before refetching, so the workflow
      // buttons re-render against the real state even if the list reload is
      // slow or fails outright.
      setRows((rs) => (rs || []).map((x) => (x.id === id
        ? { ...x, approval: now, approvedAt: (r && r.approvedAt) || null, approvalLog: ((r && r.approvalLog) || x.approvalLog || []).slice(-8) }
        : x)));
      const filteredOut = approval && approval !== now;
      toast('success', title, filteredOut ? detail + ' It no longer matches the “' + (APPROVAL_TAG[approval] || [])[1] + '” filter, so it has left this list.' : detail);
      await load();
      await loadVersions(id, true);
    } catch (e) { toast('error', 'Status change failed', e.message); }
    finally { setBusy(''); }
  };

  const restore = async (id, v) => {
    // Restore rewrites the live document. It is reversible (the current copy is
    // snapshotted first) but it also drops the document back to draft, so the
    // confirmation states both — and the extra consequence when it is live.
    const cur = (rows || []).find((x) => x.id === id);
    const from = cur && cur.approval;
    const liveNote = from === 'published'
      ? ' It is currently Published, so restoring returns it to draft and your pipeline stops distributing it until you approve and publish again.'
      : from === 'approved'
        ? ' It is currently Approved, so restoring returns it to draft and clears that approval.'
        : '';
    if (!window.confirm('Restore v' + v.version + '? It becomes the live document as a fresh draft. '
      + 'The current content is saved as a new version first, so nothing is lost.' + liveNote)) return;
    setBusy(id + 'restore');
    try {
      await api('/history/' + id + '/restore', { method: 'POST', body: { versionId: v.id } });
      toast('success', 'Version ' + v.version + ' restored', 'The current state was snapshotted first — nothing was lost. The restored document is a fresh draft.');
      // A restore rewrites the current content and adds a version, so any open
      // comparison is now against text that no longer exists.
      setDiff(null);
      // Keep this document open (it's already at /history/:id) and refresh its
      // versions in place after the restore.
      setOpenId(id);
      await load();
      await loadVersions(id, true);
    } catch (e) { toast('error', 'Restore failed', e.message); }
    finally { setBusy(''); }
  };

  const doDownload = async (path, what) => {
    try { toast('success', 'Download started', await download(path)); }
    catch (e) { toast('error', what + ' download failed', e.message); }
  };

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <div className="row row--between" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h1 className="h04">Documents</h1>
        <HelpLink topic="history" />
      </div>
      <p className="body01 t2 mt3" style={{ maxWidth: 720 }}>
        Every generated document, its full version history, and its approval state. Compare any two
        versions, restore older ones, and approve before anything is treated as publishable — the
        automation approval gate reads exactly these statuses.
      </p>

      <div className="hubbar mt6">
        <input className="input hubsearch" placeholder="Search by title or repository…" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Search documents" />
        <select className="select select--slim" value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Provider filter">
          <option value="">All providers</option>
          <option value="github">GitHub</option><option value="gitlab">GitLab</option><option value="bitbucket">Bitbucket</option>
        </select>
        <select className="select select--slim" value={approval} onChange={(e) => setApproval(e.target.value)} aria-label="Status filter">
          <option value="">All statuses</option>
          <option value="draft">Draft</option><option value="review">Under review</option>
          <option value="approved">Approved</option><option value="published">Published</option>
        </select>
        {rows && <span className="helper" style={{ marginLeft: 'auto' }}>{rows.length} document{rows.length === 1 ? '' : 's'}</span>}
      </div>

      {rows === null ? <p className="body01 t2 mt6">Loading documents…</p> : loadErr ? (
        <div className="notconn mt6" style={{ borderLeftColor: 'var(--support-error)' }}>
          <div>
            <p className="body01"><b>Your documents could not be loaded</b></p>
            <p className="helper mt2">{loadErr}. Nothing has been lost — this is a loading problem, not an empty account.</p>
            <button className="btn btn--tertiary btn--sm btn--center mt3" onClick={load}>Retry</button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="notconn mt6">
          <div>
            <p className="body01"><b>{q || provider || approval ? 'No documents match these filters' : 'No documents yet'}</b></p>
            <p className="helper mt2">
              {q || provider || approval
                ? 'Clear the search and filters to see everything in this account.'
                : 'Generated documents appear here automatically — run a generation to create the first one.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="hubtable-wrap mt5">
          <table className="hubtable">
            <thead>
              <tr>
                <th>DOCUMENT</th><th>REPOSITORY</th><th>TYPE · FORMAT</th><th>SOURCE</th>
                <th>SCORE</th><th>VERSIONS</th><th>STATUS</th><th>GENERATED</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const [cls, label] = APPROVAL_TAG[r.approval] || APPROVAL_TAG.draft;
                const vd = versions[r.id];
                return (
                  <React.Fragment key={r.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => openRow(r.id)}>
                      <td><b>{r.title || 'Untitled'}</b></td>
                      <td><span className={'provtag prov--' + r.provider}>{r.provider}</span> <span className="mono" style={{ fontSize: 12 }}>{r.repo}</span></td>
                      <td>{(r.docTypes || []).join(', ')} · {String(r.format || '').toUpperCase()}</td>
                      <td>{r.source}</td>
                      <td style={{ color: r.score >= 85 ? 'var(--support-success)' : r.score >= 70 ? '#b28600' : 'var(--support-error)' }}>
                        <b>{typeof r.score === 'number' ? r.score : '—'}</b>
                      </td>
                      <td>v{r.versions}</td>
                      <td><span className={'tag ' + cls}>{label}</span></td>
                      <td className="helper">{fmtDate(r.createdAt)}</td>
                      {/* The row is clickable, but a click target must also be
                          reachable and operable from the keyboard. */}
                      <td>
                        <button className="linkbtn" aria-expanded={openId === r.id} aria-controls={'doc-detail-' + r.id}
                          aria-label={(openId === r.id ? 'Collapse ' : 'Expand ') + (r.title || 'this document')}
                          onClick={(e) => { e.stopPropagation(); openRow(r.id); }}>
                          {openId === r.id ? '▲' : '▼'}
                        </button>
                      </td>
                    </tr>
                    {openId === r.id && (
                      <tr id={'doc-detail-' + r.id}>
                        <td colSpan={9} style={{ background: 'var(--layer-01, #f4f4f4)', padding: '16px 20px' }}>
                          {!vd ? <p className="helper">Loading version history…</p> : (
                            <>
                              <div className="row row--between" style={{ flexWrap: 'wrap', gap: 10 }}>
                                <p className="label01 t2">VERSION TIMELINE ({vd.versions.length + 1})</p>
                                {/* Each button is gated on the CURRENT state, so the
                                    set on screen is always the set of transitions
                                    that are legal right now. */}
                                <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                                  <span className="helper" style={{ alignSelf: 'center' }}>Now: <b>{label}</b></span>
                                  {r.approval !== 'review' && <button className="btn btn--ghost btn--sm btn--center" disabled={!!busy} onClick={() => setStatus(r.id, 'review')}>{busy === r.id + 'review' ? 'Sending…' : 'Send for review'}</button>}
                                  {(r.approval === 'review' || r.approval === 'draft') && <button className="btn btn--tertiary btn--sm btn--center" disabled={!!busy} onClick={() => setStatus(r.id, 'approved')}>{busy === r.id + 'approved' ? 'Approving…' : 'Approve'}</button>}
                                  {r.approval === 'approved' && <button className="btn btn--primary btn--sm btn--center" disabled={!!busy} onClick={() => setStatus(r.id, 'published')}>{busy === r.id + 'published' ? 'Publishing…' : 'Publish'}</button>}
                                  {(r.approval === 'approved' || r.approval === 'published') && <button className="btn btn--ghost btn--sm btn--center" disabled={!!busy} onClick={() => setStatus(r.id, 'draft')}>{busy === r.id + 'draft' ? 'Reverting…' : 'Back to draft'}</button>}
                                  <button className="btn btn--tertiary btn--sm btn--center" disabled={!!busy}
                                    onClick={() => doDownload('/generations/' + r.id + '/download?fmt=' + encodeURIComponent(r.format) + (r.docTypes && r.docTypes[0] ? '&doc=' + encodeURIComponent(r.docTypes[0]) : ''), 'Document')}>
                                    Download current
                                  </button>
                                </span>
                              </div>
                              <div className="mt3">
                                {[...vd.versions].reverse().map((v) => (
                                  <div key={v.id} className="row" style={{ gap: 12, flexWrap: 'wrap', padding: '7px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                                    <b className="mono" style={{ fontSize: 12 }}>v{v.version}</b>
                                    <span className="helper">{fmtDate(v.createdAt)} · score {v.score}{v.note ? ' · ' + v.note : ''}</span>
                                    <span className="row" style={{ gap: 10, marginLeft: 'auto' }}>
                                      <button className="linkbtn" onClick={() => setDiff(
                                        diff && diff.rowId === r.id && diff.v === v.version ? null : {
                                          rowId: r.id, v: v.version,
                                          title: 'v' + v.version + ' → current (v' + (vd.versions.length + 1) + ')',
                                          before: v.content, after: vd.current.content,
                                          labels: 'red = only in v' + v.version + ' · green = only in current'
                                        })}>
                                        {diff && diff.rowId === r.id && diff.v === v.version ? 'Hide comparison' : 'Compare with current'}
                                      </button>
                                      <button className="linkbtn" disabled={!!busy}
                                        onClick={() => doDownload('/history/' + r.id + '/versions/' + v.id + '/download', 'Version ' + v.version)}>Download</button>
                                      <button className="linkbtn" disabled={!!busy} onClick={() => restore(r.id, v)}>
                                        {busy === r.id + 'restore' ? 'Restoring…' : 'Restore'}
                                      </button>
                                    </span>
                                  </div>
                                ))}
                                <div className="row" style={{ gap: 12, flexWrap: 'wrap', padding: '7px 0' }}>
                                  <b className="mono" style={{ fontSize: 12 }}>v{vd.versions.length + 1}</b>
                                  <span className="helper">current · score {vd.current.score} · {label}</span>
                                </div>
                              </div>
                              {diff && diff.rowId === r.id && (
                                <div className="mt4">
                                  <div className="row row--between mb2" style={{ flexWrap: 'wrap', gap: 8 }}>
                                    <p className="label01 t2">COMPARISON — {diff.title}</p>
                                    <button className="linkbtn" onClick={() => setDiff(null)}>Close</button>
                                  </div>
                                  <DiffView before={diff.before} after={diff.after} labels={diff.labels} />
                                </div>
                              )}
                              {vd.versions.length === 0 && (
                                <p className="helper mt3">
                                  Only one version so far — comparison unlocks the first time this document is
                                  regenerated (the outgoing copy is saved automatically).
                                </p>
                              )}
                              {r.approvalLog && r.approvalLog.length > 0 && (
                                <details className="pubrepo mt3">
                                  <summary>Approval history ({r.approvalLog.length})</summary>
                                  <div className="mt2">
                                    {[...r.approvalLog].reverse().map((l, k) => (
                                      <p key={k} className="helper">· {fmtDate(l.at)} — {l.from} → <b>{l.to}</b> by {l.by}{l.note ? ' — “' + l.note + '”' : ''}</p>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
