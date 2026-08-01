import React from 'react';
import { DemoShell, TitleSlate, CountTo, Cursor, Callout } from '../../demoKit.jsx';
import { NextPointer } from '../demos.jsx';

/* =========================================================================
   FILM 04 — Documents & Versions (~30s)
   "Which version is live, and who approved it?" becomes a lookup.
   Structure per film: hook → setup → demo → proof → close + up-next pointer.
   ========================================================================= */

/* local copy of the shared pipeline atom (not exported from demos.jsx) */
const Pipe = ({ steps, gap = 1.7 }) => (
  <div>
    {steps.map((s, i) => (
      <div key={s} className="demo-pipe" style={{ animationDelay: (i * gap) + 's' }}>
        <span className="sicon">
          <span className="demo-spinhold" style={{ animationDelay: (i * gap + gap * 0.8) + 's' }}><span className="spin" /></span>
          <span className="check demo-pipecheck" style={{ animationDelay: (i * gap + gap * 0.85) + 's' }}>✓</span>
        </span>
        {s}
      </div>
    ))}
  </div>
);

const DOCS_SCENES = [
  {
    label: 'Hook', dur: 4500, sfx: 'whoosh',
    vo: 'Which version is live, and who approved it? In Docify, that answer is a lookup — not archaeology.',
    render: () => (
      <TitleSlate kicker="DOCUMENTS & HISTORY"
        title="“Which version is live, and who approved it?” becomes a lookup."
        sub="Every document with its score, approval state, full version history, side-by-side compare, one-click restore, and audit trail — in one place." />
    )
  },
  {
    label: 'Documents at a glance', dur: 6500, sfx: 'click',
    vo: 'The Documents dashboard shows every document with its quality score, live version, and approval state — at a glance.',
    cues: [{ at: 1500, sfx: 'pop' }, { at: 3500, sfx: 'pop' }, { at: 5300, sfx: 'pop' }],
    render: (beat) => (
      <div>
        <p className="h01 mb5">Documents — score, version, approval</p>
        <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
          <div className="score score--good" style={{ minWidth: 150 }}>
            <span className="label01 t2">Documents tracked</span>
            <span className="num"><CountTo from={0} to={24} delay={500} dur={2400} /></span>
            <span className="helper">each with score & approval state</span>
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            {/* rows land as the narration names score → version → approval */}
            <div className={'demo-row demo-pick'}>
              <span className="rdot" />
              <span className="mono" style={{ fontSize: 13 }}>payments-developer-guide.md</span>
              <span className="demo-branch mono">v7 · live</span>
              {beat >= 9 && <span className="tag tag--green">92</span>}
              {beat >= 14 && <span className="demo-pickcheck check" style={{ animationDelay: '0.05s' }}>✓ approved</span>}
            </div>
            {beat >= 10 && (
              <div className="demo-row">
                <span className="mono" style={{ fontSize: 13 }}>checkout-api-reference.md</span>
                <span className="demo-branch mono">v12 · live</span>
                <span className="tag tag--green">88</span>
              </div>
            )}
            {beat >= 12 && (
              <div className="demo-row">
                <span className="mono" style={{ fontSize: 13 }}>webhooks-integration-guide.md</span>
                <span className="demo-branch mono">v3 · in review</span>
                <span className="tag tag--outline">74</span>
              </div>
            )}
            <p className="helper mt3 demo-late">One row opened. The archaeology starts — and ends — here.</p>
          </div>
        </div>
      </div>
    )
  },
  {
    label: 'History & compare', dur: 6500, sfx: 'click',
    vo: 'Expand one document: the full version history — then a side-by-side compare showing exactly which line changed.',
    cues: [{ at: 2100, sfx: 'pop' }, { at: 4600, sfx: 'type' }, { at: 5200, sfx: 'type' }],
    render: (beat) => (
      <div>
        {/* the pointer expands the doc row exactly as "Expand one document" is spoken */}
        <Cursor steps={[{ x: 20, y: 7, at: 300 }, { x: 44, y: 10, at: 900, click: true }]} />
        <p className="h01 mb5">payments-developer-guide.md — version history</p>
        <div className="demo-yaml mono">
          {['v7 · Jul 21 · M. Chen · PR #214 · live',
            'v6 · Jul 18 · A. Osei · clarity & link fixes',
            'v5 · Jul 02 · M. Chen · added § Webhooks'].map((l, i) => (
            beat >= 5 + i && <div key={l} className="demo-yline" style={{ animationDelay: '0.05s' }}>{l}</div>
          ))}
        </div>
        {beat >= 10 && (
          <div className="demo-issue" style={{ marginTop: 12, borderLeftColor: 'var(--support-info)', animationDelay: '0.05s' }}>
            <div className="row row--between" style={{ flexWrap: 'wrap' }}>
              <p className="h01">Compare v6 → v7 · § Authentication</p>
              {beat >= 15 && <span className="tag tag--green">1 line changed</span>}
            </div>
            <div className="mono" style={{ fontSize: 12, lineHeight: 1.9, marginTop: 8 }}>
              <div className="demo-yline" style={{ color: 'var(--support-error)', animationDelay: '0.5s' }}>− Access tokens expire after 60 minutes.</div>
              <div className="demo-yline" style={{ color: 'var(--support-success)', animationDelay: '1.1s' }}>+ Access tokens expire after 30 minutes — refresh via /oauth/token.</div>
            </div>
          </div>
        )}
      </div>
    )
  },
  {
    label: 'Restore & approvals', dur: 6500, sfx: 'success',
    vo: 'The audit trail names who drafted, reviewed, and approved — and restore snapshots the current version before reverting.',
    cues: [{ at: 400, sfx: 'process' }, { at: 2900, sfx: 'pop' }, { at: 5200, sfx: 'notify' }],
    render: (beat) => (
      <div>
        {/* the pointer travels to Restore v6 and clicks as "restore" is narrated */}
        <Cursor steps={[{ x: 58, y: 22, at: 2400 }, { x: 14, y: 66, at: 3900, click: true }]} />
        <Pipe gap={0.95} steps={[
          'Draft — M. Chen · Jul 02, 09:41',
          'Review — A. Osei · Jul 18, 14:06',
          'Approved — S. Winters · Jul 21, 10:12',
          'Published — pipeline · Jul 21, 10:14'
        ]} />
        {beat >= 10 && (
          <div className="demo-loop mt5">
            <span className="demo-loopbox">Restore v6</span>
            <span className="demo-looparrow">→</span>
            <span className="demo-loopbox">v7 snapshotted</span>
            <span className="demo-looparrow">→</span>
            <span className="check demo-loopcheck">v8 live · nothing lost</span>
          </div>
        )}
        {beat >= 12 && <Callout x={44} y={56} at={300} tone="green">non-destructive — v7 stays in history</Callout>}
        <p className="helper mt3 demo-late">Approved content feeds automation — the pipeline builds on the version your team signed off.</p>
      </div>
    )
  },
  {
    label: 'Up next', dur: 6000, sfx: 'chime',
    vo: 'Versions, approvals, restore — one lookup, and automation always builds on the approved version. Next — management reporting.',
    cues: [{ at: 1700, sfx: 'pop' }, { at: 4700, sfx: 'whoosh' }],
    render: (beat) => (
      <div>
        <div style={{ padding: '4px 0 10px' }}>
          {beat >= 4 && <span className="jd-verdict">“Which version is live, and who approved it?” — a lookup.</span>}
        </div>
        {beat >= 12 && (
          <NextPointer target="film-reporting" kicker="MANAGEMENT REPORTING"
            title="The AI Quality Report, exported in one click" />
        )}
      </div>
    )
  }
];

export function DocumentsDemo() {
  return <DemoShell name="documents & versions" crumb="docify / documents / versions" scenes={DOCS_SCENES}
    posterMeta={{ kicker: 'DOCUMENTS & HISTORY', title: '“Which version is live, and who approved it?” becomes a lookup.', sub: 'Version history, side-by-side compare, one-click restore, and the full approval audit trail — in 30 seconds.', mins: '30 sec' }} />;
}
