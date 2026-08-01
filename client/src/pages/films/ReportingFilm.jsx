import React from 'react';
import { DemoShell, TitleSlate, CountTo, Cursor, Callout } from '../../demoKit.jsx';
import { NextPointer } from '../demos.jsx';

/* =========================================================================
   FILM 04 — Management Reporting (~30s)
   "A management-ready quality report, in one click."
   One data source → preset → headline scores → findings & verdict → export.
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

/* [name, value, beatGate, hint] — beatGate = narration word index at which
   the card is named, so each score mounts exactly as the VO says it. */
const REPORT_SCORES = [
  ['Overall quality', 92, 7, 'gate ≥ 85 cleared'],
  ['AI readiness', 88, 9, 'discoverable by AI search'],
  ['LLM readiness', 90, 12, 'cited accurately by assistants']
];

const REPORTING_SCENES = [
  {
    label: 'Hook', dur: 4500, sfx: 'whoosh',
    vo: 'Status decks about documentation are documentation work too. Here is the quality report that writes itself.',
    render: () => (
      <TitleSlate kicker="MANAGEMENT REPORTING"
        title="A management-ready quality report, in one click."
        sub="The full AI Quality Report — scores, findings, applied fixes, and a publish decision — exported as PDF, HTML, or PowerPoint." />
    )
  },
  {
    label: 'Pick a preset', dur: 6500, sfx: 'click',
    vo: 'Choose a preset — executive summary, full audit, or technical — from the same data source every time.',
    cues: [{ at: 950, sfx: 'pop' }, { at: 1650, sfx: 'pop' }],
    render: (beat) => (
      <div>
        <p className="h01 mb5">One report. Three presets.</p>
        <div className={'demo-row demo-pick'}>
          <span className="rdot" />
          <span style={{ fontWeight: 600 }}>AI Quality Report</span>
          <span className="demo-branch mono">acme/payments-api · run #87</span>
          <span className="demo-pickcheck check">✓ latest run</span>
        </div>
        <div className="mt5">
          <Chips items={['Executive summary', 'Full audit', 'Technical']} on={0} delayBase={0.9} />
        </div>
        {/* lands as the VO says "same data source" (word 12) */}
        {beat >= 12 && <p className="helper mt5 demo-yline">One data source underneath — the numbers match in every format.</p>}
        {/* pointer picks the Executive preset as it is narrated */}
        <Cursor steps={[{ x: 74, y: 16, at: 350 }, { x: 20, y: 54, at: 1150 }, { x: 20, y: 54, at: 1800, click: true }]} />
      </div>
    )
  },
  {
    label: 'Headline scores', dur: 6500, sfx: 'click',
    vo: 'The headline scores managers ask for — overall ninety-two, AI readiness eighty-eight, LLM readiness ninety — counted from real checks.',
    cues: [{ at: 2650, sfx: 'pop' }, { at: 3450, sfx: 'pop' }, { at: 4550, sfx: 'pop' }],
    render: (beat) => (
      <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
        {REPORT_SCORES.map(([n, v, g, h]) => (beat >= g && (
          <div key={n} className="score score--good demo-yline" style={{ flex: 1, minWidth: 150 }}>
            <span className="label01 t2">{n}</span>
            <span className="num"><CountTo from={0} to={v} delay={250} dur={1600} /></span>
            <span className="helper">{h}</span>
          </div>
        )))}
        <Callout x={62} y={8} at={5100} tone="green">counted from run #87 — not estimates</Callout>
      </div>
    )
  },
  {
    label: 'Findings & export', dur: 7000, sfx: 'success',
    vo: 'Findings, applied fixes, and remaining risks roll up to one publish-readiness decision — then export as PDF, HTML, or PowerPoint.',
    cues: [{ at: 5100, sfx: 'notify' }, { at: 5500, sfx: 'notify' }, { at: 5900, sfx: 'notify' }],
    render: (beat) => (
      <div>
        <div className="demo-issue" style={{ borderLeftColor: 'var(--support-success)' }}>
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">7 findings · 5 fixes applied · 2 remaining risks</p>
            {/* verdict tag lands on "publish-readiness decision" (word 11) */}
            {beat >= 11 && <span className="tag tag--green demo-yline">✓ publish-ready</span>}
          </div>
          <p className="helper mt2">Executive summary, score breakdown, broken-link analysis, and style compliance — assembled from one data source.</p>
        </div>
        {/* download chips roll in as "then export" (word 13) is narrated */}
        {beat >= 13 && (
          <div className="row mt5" style={{ flexWrap: 'wrap', gap: 8 }}>
            {['payments-api-quality-2026-08-01.pdf', 'payments-api-quality-2026-08-01.html', 'payments-api-quality-2026-08-01.pptx'].map((f, i) => (
              <span key={f} className="demo-chip" style={{ animationDelay: (0.05 + i * 0.4) + 's', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>⬇ {f}</span>
            ))}
          </div>
        )}
      </div>
    )
  },
  {
    label: 'Up next', dur: 6000, sfx: 'chime',
    vo: 'A management-ready quality report, in one click. Next — one catalogue for every repository you document.',
    cues: [{ at: 3050, sfx: 'whoosh' }],
    render: (beat) => (
      <div>
        <div style={{ padding: '4px 0 10px' }}>
          <span className="jd-verdict">A management-ready quality report, in one click.</span>
        </div>
        {/* pointer card appears exactly on "Next" (word 8) */}
        {beat >= 8 && (
          <div className="demo-yline">
            <NextPointer target="film-connect" kicker="CONNECT"
              title="One catalogue for every repository you document" />
          </div>
        )}
      </div>
    )
  }
];

export function ReportingDemo() {
  return <DemoShell name="management reporting" crumb="docify / reporting / quality-export" scenes={REPORTING_SCENES}
    posterMeta={{ kicker: 'MANAGEMENT REPORTING', title: 'A management-ready quality report, in one click.', sub: 'Overall 92, findings, applied fixes, and a publish-readiness decision — exported as PDF, HTML, and PowerPoint. In 30 seconds.', mins: '30 sec' }} />;
}
