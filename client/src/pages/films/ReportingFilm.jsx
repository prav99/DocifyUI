import React from 'react';
import { DemoShell, TitleSlate, CountTo } from '../../demoKit.jsx';
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

const REPORT_SCORES = [
  ['Overall quality', 92, 400, 'gate ≥ 85 cleared'],
  ['AI readiness', 88, 900, 'discoverable by AI search'],
  ['LLM readiness', 90, 1400, 'cited accurately by assistants']
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
    render: () => (
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
        <p className="helper mt5 demo-late">One data source underneath — the numbers match in every format.</p>
      </div>
    )
  },
  {
    label: 'Headline scores', dur: 6500, sfx: 'click',
    vo: 'The headline scores managers ask for — overall ninety-two, AI readiness eighty-eight, LLM readiness ninety — counted from real checks.',
    render: () => (
      <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
        {REPORT_SCORES.map(([n, v, d, h]) => (
          <div key={n} className="score score--good" style={{ flex: 1, minWidth: 150 }}>
            <span className="label01 t2">{n}</span>
            <span className="num"><CountTo from={0} to={v} delay={d} dur={2000} /></span>
            <span className="helper">{h}</span>
          </div>
        ))}
      </div>
    )
  },
  {
    label: 'Findings & export', dur: 7000, sfx: 'success',
    vo: 'Findings, applied fixes, and remaining risks roll up to one publish-readiness decision — then export as PDF, HTML, or PowerPoint.',
    render: () => (
      <div>
        <div className="demo-issue" style={{ borderLeftColor: 'var(--support-success)' }}>
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">7 findings · 5 fixes applied · 2 remaining risks</p>
            <span className="tag tag--green">✓ publish-ready</span>
          </div>
          <p className="helper mt2">Executive summary, score breakdown, broken-link analysis, and style compliance — assembled from one data source.</p>
        </div>
        <div className="row mt5" style={{ flexWrap: 'wrap', gap: 8 }}>
          {['payments-api-quality-2026-08-01.pdf', 'payments-api-quality-2026-08-01.html', 'payments-api-quality-2026-08-01.pptx'].map((f, i) => (
            <span key={f} className="demo-chip" style={{ animationDelay: (1.6 + i * 0.45) + 's', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>⬇ {f}</span>
          ))}
        </div>
      </div>
    )
  },
  {
    label: 'Up next', dur: 6000, sfx: 'chime',
    vo: 'A management-ready quality report, in one click. Next — one catalogue for every repository you document.',
    render: () => (
      <div>
        <div style={{ padding: '4px 0 10px' }}>
          <span className="jd-verdict">A management-ready quality report, in one click.</span>
        </div>
        <NextPointer target="film-connect" kicker="CONNECT"
          title="One catalogue for every repository you document" />
      </div>
    )
  }
];

export function ReportingDemo() {
  return <DemoShell name="management reporting" crumb="docify / reporting / quality-export" scenes={REPORTING_SCENES}
    posterMeta={{ kicker: 'MANAGEMENT REPORTING', title: 'A management-ready quality report, in one click.', sub: 'Overall 92, findings, applied fixes, and a publish-readiness decision — exported as PDF, HTML, and PowerPoint. In 30 seconds.', mins: '30 sec' }} />;
}
