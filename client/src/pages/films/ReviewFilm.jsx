import React from 'react';
import { DemoShell, TitleSlate, CountTo } from '../../demoKit.jsx';
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
    render: () => (
      <div>
        <div className="demo-loop" style={{ paddingBottom: 14 }}>
          <span className="demo-loopbox">PR #221 merged</span>
          <span className="demo-looparrow">→</span>
          <span className="demo-loopbox">docs run · 41s</span>
          <span className="demo-looparrow">→</span>
          <span className="mono">3 proposed changes</span>
        </div>
        <div className="demo-issue">
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">payments-developer-guide.md → § Webhooks · proposal 1 of 3</p>
            <span className="demo-branch mono">current: v7</span>
          </div>
          <div className="mono" style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.9 }}>
            <div className="demo-yline" style={{ animationDelay: '0.7s', ...DEL }}>- Webhook deliveries are retried every 60 seconds.</div>
            <div className="demo-yline" style={{ animationDelay: '1.3s', ...ADD }}>+ Webhook deliveries back off: 1 min, 5 min, 30 min — six attempts.</div>
          </div>
          <p className="helper mt2 demo-late">Scoped to two lines of one section — the other 41 pages are not in your review.</p>
        </div>
        <div className="mt5">
          <Chips items={['Accept', 'Reject', 'Rewrite', 'Edit', 'Comment']} on={-1} delayBase={2.6} />
        </div>
      </div>
    )
  },
  {
    label: 'Accept & reject', dur: 6500, sfx: 'click',
    vo: 'One click per decision: accept the accurate change, reject the noisy one — nothing lands without your judgement.',
    render: () => (
      <div>
        <p className="h01 mb5">Three proposals. One-click decisions.</p>
        <div className="demo-issue" style={{ borderLeftColor: 'var(--support-success)' }}>
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">§ Webhooks — retry schedule corrected</p>
            <span className="tag tag--green demo-late" style={{ animationDelay: '1.6s' }}>
              ✓ accepted · <CountTo from={0} to={96} delay={1900} dur={900} />% match
            </span>
          </div>
          <p className="helper mt2">Verified against PR #221 — the docs now say what the code does.</p>
        </div>
        <div className="demo-issue" style={{ animationDelay: '2.4s', borderLeftColor: 'var(--support-error)' }}>
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">§ Rate limits — wording-only change</p>
            <span className="demo-late mono" style={{ animationDelay: '4.1s', background: '#ffd7d9', color: '#a2191f', padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>✕ rejected</span>
          </div>
          <p className="helper mt2">No behaviour changed — the reviewer keeps the original wording.</p>
        </div>
      </div>
    )
  },
  {
    label: 'Rewrite & publish', dur: 7000, sfx: 'success',
    vo: 'Not quite right? Ask AI to rewrite the span, then approve and publish — version eight, fully audited.',
    render: () => (
      <div>
        <div className="demo-issue" style={{ borderLeftColor: 'var(--support-info)' }}>
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">§ Error handling — selected span → Rewrite with AI</p>
            <span className="demo-branch mono">style: plain & direct</span>
          </div>
          <div className="mono" style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.9 }}>
            <div className="demo-yline" style={{ animationDelay: '0.6s', ...DEL }}>before · Errors may be surfaced in a variety of ways depending on context.</div>
            <div className="demo-yline" style={{ animationDelay: '1.8s', ...ADD }}>after · Every error returns a code, a message, and a retriable flag.</div>
          </div>
        </div>
        <div className="demo-loop mt5">
          <span className="demo-loopbox">Approve & publish</span>
          <span className="demo-looparrow">→</span>
          <span className="demo-loopbox">v8 created</span>
          <span className="demo-looparrow">→</span>
          <span className="check demo-loopcheck">audit · 2 accepted (1 rewritten) · 1 rejected · s.chen</span>
        </div>
      </div>
    )
  },
  {
    label: 'Up next', dur: 6000, sfx: 'chime',
    vo: 'AI proposes. Your team decides. Next — rebuilding any document to one house standard.',
    render: () => (
      <div>
        <div style={{ padding: '4px 0 10px' }}>
          <span className="jd-verdict">AI proposes. Your team decides.</span>
        </div>
        <NextPointer target="film-standardize" kicker="STANDARDIZE AT SCALE"
          title="Rebuild any document to one house standard" />
      </div>
    )
  }
];

export function ReviewDemo() {
  return <DemoShell name="human review" crumb="docify / review / proposed-changes" scenes={REVIEW_SCENES}
    posterMeta={{ kicker: 'HUMAN CONTROL', title: 'AI proposes. Your team decides.', sub: 'A scoped diff, one accept, one reject, one AI rewrite — then Approve & publish creates v8 with a full audit trail. In 30 seconds.', mins: '30 sec' }} />;
}
