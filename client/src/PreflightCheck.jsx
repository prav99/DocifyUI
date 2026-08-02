import React, { useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/* Pre-run check, shown on the last step before Generate.

   Renders ONLY what POST /generations/preflight returned. That endpoint runs
   the same branch → file list → scope resolution the real pipeline runs, so
   every line here is a statement about the run that is about to happen — not
   a guess from the document type. Costs no quota and makes no model call.

   The panel is advisory by design: it never disables Generate (the server
   re-enforces every refusal at POST /generations), and it makes no claim the
   response cannot back — when the check itself could not run, the server says
   so and this panel repeats that instead of pretending the repository is
   empty. A transport failure renders nothing at all: this is an additive
   panel, and it must never become an error state in the middle of the flow. */

const LEVELS = {
  error: { icon: '✕', color: 'var(--support-error, #da1e28)', weight: 600 },
  warning: { icon: '⚠', color: 'var(--support-warning-text, #8e6a00)', weight: 600 },
  info: { icon: '·', color: 'var(--text-secondary)', weight: 600 }
};

export default function PreflightCheck({ body, extraRepoCount = 0, paused = false }) {
  const [data, setData] = useState(null);
  // Monotonic request id: options changed mid-flight must never let a stale
  // answer describe the current selection.
  const seq = useRef(0);
  const key = JSON.stringify(body);

  useEffect(() => {
    if (paused) return undefined;
    const mine = ++seq.current;
    setData(null);
    // Debounced: this fires when the selection settles, not on every click,
    // and the endpoint is rate limited per user.
    const t = setTimeout(() => {
      api('/generations/preflight', { method: 'POST', body })
        .then((d) => { if (seq.current === mine) setData(d && typeof d === 'object' ? d : null); })
        .catch(() => { if (seq.current === mine) setData(null); });
    }, 500);
    return () => { clearTimeout(t); seq.current += 1; };
  }, [key, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;

  const warnings = (Array.isArray(data.warnings) ? data.warnings : [])
    .filter((w) => w && typeof w === 'object' && String(w.title || '').trim());
  const src = data.sources || {};
  const q = data.quota || {};
  const hasRepo = typeof body.repo === 'string' && body.repo.includes('/');

  // The positive facts are only stated when the check that produces them ran.
  const facts = [];
  if (hasRepo && data.repoChecked && src.repositoryFiles > 0) {
    facts.push(src.repositoryFiles + ' file' + (src.repositoryFiles === 1 ? '' : 's') + ' from ' +
      body.repo + ' on “' + (data.branchUsed || body.branch) + '” would reach the AI');
  }
  const conn = [
    [src.jiraIssues, 'Jira issue'], [src.openApiSpecs, 'API spec'],
    [src.notionPages, 'Notion page'], [src.confluencePages, 'Confluence page']
  ].filter(([n]) => n > 0);
  for (const [n, name] of conn) facts.push(n + ' ' + name + (n === 1 ? '' : 's'));
  if (q.remaining != null && data.documentsRequested) {
    facts.push('this run uses ' + data.documentsRequested + ' of the ' + q.remaining +
      ' document' + (q.remaining === 1 ? '' : 's') + ' left this month');
  }

  if (!warnings.length && !facts.length) return null;

  return (
    <div className="mt6" role="status" aria-label="Pre-run check"
      style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12, maxWidth: 720 }}>
      <p className="helper" style={{ color: 'var(--text-secondary)' }}>
        <b style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Pre-run check</b>
        {' '}— the same source resolution the run itself uses, done just now. It costs nothing and never blocks Generate.
      </p>

      {facts.length > 0 && (
        <p className="helper mt2" style={{ lineHeight: 1.5 }}>
          {warnings.some((w) => w.level === 'error') ? null
            : <span aria-hidden="true" style={{ color: 'var(--support-success, #198038)' }}>✓ </span>}
          {facts.join(' · ')}.
        </p>
      )}

      {warnings.map((w, i) => {
        const lv = LEVELS[w.level] || LEVELS.info;
        return (
          <p key={w.id || i} className="helper mt2" style={{ lineHeight: 1.5 }}>
            <span aria-hidden="true" style={{ color: lv.color }}>{lv.icon}</span>
            {' '}
            <b style={{ fontWeight: lv.weight, color: w.level === 'info' ? 'var(--text-primary)' : lv.color }}>{w.title}</b>
            {w.detail ? <span style={{ color: 'var(--text-secondary)' }}> — {w.detail}</span> : null}
          </p>
        );
      })}

      {extraRepoCount > 0 && (
        <p className="helper mt2" style={{ color: 'var(--text-placeholder)' }}>
          Checked the primary repository only — the {extraRepoCount} additional
          repositor{extraRepoCount === 1 ? 'y' : 'ies'} selected at the Source step
          {extraRepoCount === 1 ? ' is' : ' are'} resolved when
          {extraRepoCount === 1 ? ' its run starts' : ' their runs start'}.
        </p>
      )}
    </div>
  );
}
