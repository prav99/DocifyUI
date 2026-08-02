import React from 'react';
import { DemoShell, TitleSlate, CountTo, Cursor, Callout } from '../../demoKit.jsx';
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
    /* vo word map: Select(1) the(2) legacy(3) documents(4) then(5) choose(6)
       the(7) standard(8) your(9) house(10) style(11) guide(12) Microsoft(13)
       or(14) Google(15) — chips mount on "standard", chip lights on "house". */
    vo: 'Select the legacy documents, then choose the standard — your house style guide, Microsoft, or Google.',
    cues: [{ at: 400, sfx: 'pop' }, { at: 1100, sfx: 'pop' }, { at: 1800, sfx: 'pop' }],
    render: (beat) => (
      <div>
        <p className="h01 mb5">Three authors. Three eras. One standard.</p>
        <div>
          {LEGACY_DOCS.map(([f, meta, before], i) => (
            <div key={f} className="demo-row" style={{ animationDelay: (0.3 + i * 0.7) + 's' }}>
              <span className="mono" style={{ fontSize: 13 }}>{f}</span>
              <span className="demo-branch mono">{meta}</span>
              <span className="mono" style={{ marginLeft: 'auto', color: 'var(--support-warning)', fontWeight: 600 }}>
                consistency {before}
              </span>
            </div>
          ))}
        </div>
        <div className="mt5">
          {beat >= 8 && (
            <Chips items={['Docify house style', 'Microsoft', 'Google', 'Custom rules']}
              on={beat >= 10 ? 0 : -1} delayBase={0.05} />
          )}
        </div>
        <p className="helper mt5 demo-late">Style guides, terminology rules, and org & repo rules apply together.</p>
        <Cursor steps={[
          { x: 46, y: 26, at: 600 },
          { x: 44, y: 44, at: 1700 },
          { x: 16, y: 66, at: 3500, click: true }
        ]} />
      </div>
    )
  },
  {
    label: 'Rebuild & rescore', dur: 7000, sfx: 'click',
    /* vo word map: Docify(1) rebuilds(2) each(3) document(4) against(5) the(6)
       chosen(7) standard(8) and(9) every(10) consistency(11) score(12)
       climbs(13)… — rows mount on beats 2/4/6, all climbs gate on "score". */
    vo: 'Docify rebuilds each document against the chosen standard — and in this example every consistency score climbs into the nineties.',
    cues: [{ at: 600, sfx: 'process' }, { at: 4700, sfx: 'pop' }, { at: 5600, sfx: 'pop' }],
    render: (beat) => (
      <div>
        <p className="h01 mb5">Rebuilt to the Docify house style</p>
        {LEGACY_DOCS.map(([f, meta, before, after], i) => (
          beat >= 2 + i * 2 && (
            <div key={f} className="demo-mrow demo-mrow--light"
              style={{ gridTemplateColumns: '218px 1fr 96px' }}>
              <span className="demo-mname mono" style={{ color: 'var(--text-primary)', fontSize: 12.5 }}>{f}</span>
              <span className="demo-mbar" style={{ background: 'var(--border-subtle)' }}>
                {beat >= 12 && <span className="demo-mfill" style={{ width: after + '%', animationDelay: (i * 0.45) + 's' }} />}
              </span>
              <span className="demo-mpct mono" style={{ color: 'var(--text-primary)' }}>
                {before}{beat >= 12 && <> → <CountTo from={before} to={after} delay={150 + i * 450} dur={1600} /></>}
              </span>
            </div>
          )
        ))}
        <Callout x={58} y={22} at={5700} tone="green">sample documents — all three now 89+</Callout>
        <p className="helper mt5 demo-late">14 terminology fixes · tone: plain &amp; direct · structure aligned to template. Sample figures — your own documents score on their own content.</p>
      </div>
    )
  },
  {
    label: 'Diff & approve', dur: 6500, sfx: 'success',
    /* vo word map: Every(1) change(2) lands(3) as(4) a(5) reviewable(6)
       diff(7) in(8) the(9) queue(10) nothing(11) publishes(12) until(13)
       a(14) person(15) approves(16) — diff lines on "reviewable", pipeline
       on "queue", approved check held for "approves". */
    vo: 'Every change lands as a reviewable diff in the queue — nothing publishes until a person approves.',
    cues: [{ at: 2400, sfx: 'type' }, { at: 3000, sfx: 'type' }, { at: 3700, sfx: 'pop' }, { at: 5900, sfx: 'notify' }],
    render: (beat) => (
      <div>
        <div className="demo-yaml mono">
          <div className="demo-yline" style={{ animationDelay: '0.3s', color: 'var(--code-text)' }}>
            @@ payments-integration-guide.md · § Error handling
          </div>
          {beat >= 6 && [
            ['- In case of the request failing, retry may be attempted.', '#ff8389', 0],
            ['+ If the request fails, retry with exponential backoff.', '#42be65', 0.45],
            ['+ terminology: "merchant ID" — replaces MID, merchant-id', '#42be65', 0.9]
          ].map(([l, c, d]) => (
            <div key={l} className="demo-yline" style={{ animationDelay: d + 's', color: c }}>{l}</div>
          ))}
        </div>
        {beat >= 9 && (
          <div className="demo-loop mt5">
            <span className="demo-loopbox">3 proposals</span>
            <span className="demo-looparrow">→</span>
            <span className="demo-loopbox">review queue</span>
            <span className="demo-looparrow">→</span>
            {beat >= 15 && <span className="check demo-loopcheck">approved · v4 published · 0 unapproved</span>}
          </div>
        )}
      </div>
    )
  },
  {
    label: 'Up next', dur: 6000, sfx: 'chime',
    /* vo word map: …unreviewed(10) Next(11) — pointer card held for "Next". */
    vo: 'One house standard across every page, and nothing ships unreviewed. Next — AI readiness.',
    cues: [{ at: 4200, sfx: 'whoosh' }],
    render: (beat) => (
      <div>
        <div style={{ padding: '4px 0 10px' }}>
          <span className="jd-verdict">One standard. Every page. Nothing unreviewed.</span>
        </div>
        {beat >= 11 && (
          <NextPointer target="film-ai" kicker="AI READINESS"
            title="See how Docify checks documentation for AI readiness" />
        )}
      </div>
    )
  }
];

export function StandardizeDemo() {
  return <DemoShell name="standardize at scale" crumb="docify / standardize / house-style" scenes={STD_SCENES}
    posterMeta={{ kicker: 'STANDARDIZE AT SCALE', title: 'Inconsistency is rework on an instalment plan — retire it.', sub: 'Three sample legacy docs rebuilt to one house style — 58→89, 63→91, 71→93 in this example — every change a reviewable diff. In 30 seconds.', mins: '30 sec' }} />;
}
