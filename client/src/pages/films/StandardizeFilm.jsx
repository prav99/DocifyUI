import React from 'react';
import { DemoShell, TitleSlate, CountTo } from '../../demoKit.jsx';
import { NextPointer } from '../demos.jsx';

/* =========================================================================
   FILM 04 — Standardize at Scale (~30s)
   "Inconsistency is rework on an instalment plan." Three legacy documents,
   one house standard, every change a reviewable diff, nothing unapproved.
   ========================================================================= */

/* local copy of the Chips scene atom (not exported from demos.jsx) */
const Chips = ({ items, on, delayBase = 0.1 }) => (
  <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
    {items.map((c, i) => (
      <span key={c} className={'demo-chip' + (i === on ? ' demo-chipon' : '')}
        style={{ animationDelay: (delayBase + i * 0.35) + 's' }}>{c}</span>
    ))}
  </div>
);

/* [file, provenance, consistency before, consistency after] */
const LEGACY_DOCS = [
  ['payments-integration-guide.md', '2019 · J. Moreau', 58, 89],
  ['webhooks-reference.md', '2021 · platform team', 63, 91],
  ['merchant-onboarding.md', '2023 · S. Adeyemi', 71, 93]
];

const STD_SCENES = [
  {
    label: 'Hook', dur: 4500, sfx: 'whoosh',
    vo: 'Documentation written by many authors drifts apart. Here is how it becomes one house standard — every change reviewed.',
    render: () => (
      <TitleSlate kicker="STANDARDIZE AT SCALE"
        title="Written by anyone, in any state — rebuilt to one house standard."
        sub="Three legacy documents, one style guide, and every change delivered as a reviewable diff. Nothing publishes unapproved." />
    )
  },
  {
    label: 'Docs & standard', dur: 6500, sfx: 'click',
    vo: 'Select the legacy documents, then choose the standard — your house style guide, Microsoft, or Google.',
    render: () => (
      <div>
        <p className="h01 mb5">Three authors. Three eras. One standard.</p>
        <div>
          {LEGACY_DOCS.map(([f, meta, before]) => (
            <div key={f} className="demo-row">
              <span className="mono" style={{ fontSize: 13 }}>{f}</span>
              <span className="demo-branch mono">{meta}</span>
              <span className="mono" style={{ marginLeft: 'auto', color: 'var(--support-warning)', fontWeight: 600 }}>
                consistency {before}
              </span>
            </div>
          ))}
        </div>
        <div className="mt5">
          <Chips items={['Docify house style', 'Microsoft', 'Google', 'Custom rules']} on={0} delayBase={1.6} />
        </div>
        <p className="helper mt5 demo-late">Style guides, terminology rules, and org & repo rules apply together.</p>
      </div>
    )
  },
  {
    label: 'Rebuild & rescore', dur: 7000, sfx: 'click',
    vo: 'Docify rebuilds each document against the chosen standard — and every consistency score climbs into the nineties.',
    render: () => (
      <div>
        <p className="h01 mb5">Rebuilt to the Docify house style</p>
        {LEGACY_DOCS.map(([f, meta, before, after], i) => (
          <div key={f} className="demo-mrow demo-mrow--light"
            style={{ animationDelay: (0.4 + i * 0.55) + 's', gridTemplateColumns: '218px 1fr 96px' }}>
            <span className="demo-mname mono" style={{ color: 'var(--text-primary)', fontSize: 12.5 }}>{f}</span>
            <span className="demo-mbar" style={{ background: 'var(--border-subtle)' }}>
              <span className="demo-mfill" style={{ width: after + '%', animationDelay: (0.8 + i * 0.55) + 's' }} />
            </span>
            <span className="demo-mpct mono" style={{ color: 'var(--text-primary)' }}>
              {before} → <CountTo from={before} to={after} delay={900 + i * 550} dur={2000} />
            </span>
          </div>
        ))}
        <p className="helper mt5 demo-late">14 terminology fixes · tone: plain & direct · structure aligned to template.</p>
      </div>
    )
  },
  {
    label: 'Diff & approve', dur: 6500, sfx: 'success',
    vo: 'Every change lands as a reviewable diff in the queue — nothing publishes until a person approves.',
    render: () => (
      <div>
        <div className="demo-yaml mono">
          {[
            ['@@ payments-integration-guide.md · § Error handling', 'var(--code-text)'],
            ['- In case of the request failing, retry may be attempted.', '#ff8389'],
            ['+ If the request fails, retry with exponential backoff.', '#42be65'],
            ['+ terminology: "merchant ID" — replaces MID, merchant-id', '#42be65']
          ].map(([l, c], i) => (
            <div key={l} className="demo-yline" style={{ animationDelay: (0.3 + i * 0.55) + 's', color: c }}>{l}</div>
          ))}
        </div>
        <div className="demo-loop mt5">
          <span className="demo-loopbox">3 proposals</span>
          <span className="demo-looparrow">→</span>
          <span className="demo-loopbox">review queue</span>
          <span className="demo-looparrow">→</span>
          <span className="check demo-loopcheck">approved · v4 published · 0 unapproved</span>
        </div>
      </div>
    )
  },
  {
    label: 'Up next', dur: 6000, sfx: 'chime',
    vo: 'One house standard across every page, and nothing ships unreviewed. Next — AI readiness.',
    render: () => (
      <div>
        <div style={{ padding: '4px 0 10px' }}>
          <span className="jd-verdict">One standard. Every page. Nothing unreviewed.</span>
        </div>
        <NextPointer target="film-ai" kicker="AI READINESS"
          title="See how Docify checks documentation for AI readiness" />
      </div>
    )
  }
];

export function StandardizeDemo() {
  return <DemoShell name="standardize at scale" crumb="docify / standardize / house-style" scenes={STD_SCENES}
    posterMeta={{ kicker: 'STANDARDIZE AT SCALE', title: 'Inconsistency is rework on an instalment plan — retire it.', sub: 'Three legacy docs rebuilt to one house style — 58→89, 63→91, 71→93 — every change a reviewable diff. In 30 seconds.', mins: '30 sec' }} />;
}
