import React from 'react';
import { DemoShell, TitleSlate, CountTo, Cursor, Callout } from '../../demoKit.jsx';
import { NextPointer } from '../demos.jsx';

/* =========================================================================
   FILM 04 — Human Review (~30s)
   "AI proposes. Your team decides." — section #review
   Scoped diffs instead of whole-document re-reads: accept one, reject one,
   AI-rewrite one span, then Approve & publish → v8 + audit trail.
   ========================================================================= */

/* local copy of the Chips atom (not exported from demos.jsx) */
const Chips = ({ items, on, delayBase = 0.1 }) => (
  <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
    {items.map((c, i) => (
      <span key={c} className={'demo-chip' + (i === on ? ' demo-chipon' : '')}
        style={{ animationDelay: (delayBase + i * 0.35) + 's' }}>{c}</span>
    ))}
  </div>
);

/* diff-line styles — same literals as the IlluReview SVG */
const DEL = { background: '#fff1f1', color: '#a2191f', padding: '2px 8px' };
const ADD = { background: '#defbe6', color: '#0e6027', padding: '2px 8px' };

const REVIEW_SCENES = [
  {
    label: 'Hook', dur: 4500, sfx: 'whoosh',
    vo: 'Unreviewed automation is risk. Re-reading whole documents is waste. Here is review that costs minutes, not afternoons.',
    render: () => (
      <TitleSlate kicker="HUMAN CONTROL"
        title="AI proposes. Your team decides."
        sub="Every automatic change arrives as a scoped diff — accept, reject, or rewrite in place, then publish with a full audit trail." />
    )
  },
  {
    label: 'Proposed diff', dur: 6500, sfx: 'click',
    vo: 'Every automatic change arrives as a proposal — a scoped diff, so reviewers read what changed, not the whole document.',
    cues: [{ at: 300, sfx: 'process' }, { at: 2700, sfx: 'pop' }, { at: 3300, sfx: 'type' }, { at: 3900, sfx: 'type' }],
    render: (beat) => (
      <div>
        <div className="demo-loop" style={{ paddingBottom: 14 }}>
          <span className="demo-loopbox">PR #221 merged</span>
          <span className="demo-looparrow">→</span>
          <span className="demo-loopbox">docs run · 41s</span>
          <span className="demo-looparrow">→</span>
          <span className="mono">3 proposed changes</span>
        </div>
        {beat >= 7 && <div className="demo-issue">
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">payments-developer-guide.md → § Webhooks · proposal 1 of 3</p>
            <span className="demo-branch mono">current: v7</span>
          </div>
          <div className="mono" style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.9 }}>
            <div className="demo-yline" style={{ animationDelay: '0.4s', ...DEL }}>- Webhook deliveries are retried every 60 seconds.</div>
            <div className="demo-yline" style={{ animationDelay: '1.0s', ...ADD }}>+ Webhook deliveries back off: 1 min, 5 min, 30 min — six attempts.</div>
          </div>
          {beat >= 13 && <p className="helper mt2 demo-late" style={{ animationDelay: '0.05s' }}>Scoped to two lines of one section — the other 41 pages are not in your review.</p>}
        </div>}
        <div className="mt5">
          <Chips items={['Accept', 'Reject', 'Rewrite', 'Edit', 'Comment']} on={-1} delayBase={3.9} />
        </div>
      </div>
    )
  },
  {
    label: 'Accept & reject', dur: 6500, sfx: 'click',
    vo: 'One click per decision: accept the accurate change, reject the noisy one — nothing lands without your judgement.',
    cues: [{ at: 900, sfx: 'pop' }, { at: 2300, sfx: 'pop' }],
    render: (beat) => (
      <div>
        <Cursor steps={[
          { x: 34, y: 12, at: 300 },
          { x: 78, y: 27, at: 1100 },
          { x: 78, y: 27, at: 1800, click: true },
          { x: 80, y: 63, at: 2800 },
          { x: 80, y: 63, at: 3400, click: true }
        ]} />
        <p className="h01 mb5">Three proposals. One-click decisions.</p>
        <div className="demo-issue" style={{ borderLeftColor: 'var(--support-success)' }}>
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">§ Webhooks — retry schedule corrected</p>
            {beat >= 5 && <span className="tag tag--green demo-late" style={{ animationDelay: '0.05s' }}>
              ✓ accepted · placement <CountTo from={0} to={96} delay={250} dur={900} />%
            </span>}
          </div>
          {/* the matcher scores where a change belongs, not whether it is
              correct — only the reviewer decides that. */}
          <p className="helper mt2">Drafted from PR #221 and read against it by the reviewer, who accepted it.</p>
        </div>
        <div className="demo-issue" style={{ animationDelay: '2.2s', borderLeftColor: 'var(--support-error)' }}>
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">§ Rate limits — wording-only change</p>
            {beat >= 9 && <span className="demo-late mono" style={{ animationDelay: '0.05s', background: '#ffd7d9', color: '#a2191f', padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>✕ rejected</span>}
          </div>
          <p className="helper mt2">No behaviour changed — the reviewer keeps the original wording.</p>
        </div>
        <Callout x={56} y={82} at={4700} tone="blue">both decisions logged — reviewer + timestamp</Callout>
      </div>
    )
  },
  {
    label: 'Rewrite & publish', dur: 7000, sfx: 'success',
    vo: 'Not quite right? Ask AI to rewrite the span, then approve and publish — version eight, fully audited.',
    cues: [{ at: 2750, sfx: 'type' }, { at: 3200, sfx: 'type' }, { at: 4900, sfx: 'notify' }],
    render: (beat) => (
      <div>
        <Cursor steps={[
          { x: 66, y: 34, at: 400 },
          { x: 42, y: 34, at: 2200 },
          { x: 18, y: 74, at: 3600 },
          { x: 18, y: 74, at: 4400, click: true }
        ]} />
        <div className="demo-issue" style={{ borderLeftColor: 'var(--support-info)' }}>
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">§ Error handling — selected span → Rewrite with AI</p>
            <span className="demo-branch mono">style: plain & direct</span>
          </div>
          <div className="mono" style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.9 }}>
            <div className="demo-yline" style={{ animationDelay: '0.6s', ...DEL }}>before · Errors may be surfaced in a variety of ways depending on context.</div>
            {beat >= 7 && <div className="demo-yline" style={{ animationDelay: '0.1s', ...ADD }}>after · Every error returns a code, a message, and a retriable flag.</div>}
          </div>
        </div>
        {beat >= 11 && <div className="demo-loop mt5">
          <span className="demo-loopbox">Approve & publish</span>
          <span className="demo-looparrow">→</span>
          <span className="demo-loopbox">v8 created</span>
          <span className="demo-looparrow">→</span>
          {beat >= 16 && <span className="check demo-loopcheck" style={{ animationDelay: '0.1s' }}>audit · 2 accepted (1 rewritten) · 1 rejected · s.chen</span>}
        </div>}
      </div>
    )
  },
  {
    label: 'Up next', dur: 6000, sfx: 'chime',
    vo: 'AI proposes. Your team decides. Next — rebuilding any document to one house standard.',
    cues: [{ at: 400, sfx: 'pop' }, { at: 3000, sfx: 'whoosh' }],
    render: (beat) => (
      <div>
        <div style={{ padding: '4px 0 10px' }}>
          <span className="jd-verdict">AI proposes. Your team decides.</span>
        </div>
        {beat >= 8 && <NextPointer target="film-standardize" kicker="STANDARDIZE AT SCALE"
          title="Rebuild any document to one house standard" />}
      </div>
    )
  }
];

export function ReviewDemo() {
  return <DemoShell name="human review" crumb="docify / review / proposed-changes" scenes={REVIEW_SCENES}
    posterMeta={{ kicker: 'HUMAN CONTROL', title: 'AI proposes. Your team decides.', sub: 'A scoped diff, one accept, one reject, one AI rewrite — then Approve & publish creates v8 with a full audit trail. In 30 seconds.', mins: '30 sec' }} />;
}
