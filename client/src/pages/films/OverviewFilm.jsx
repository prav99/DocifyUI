import React from 'react';
import { DemoShell, TitleSlate, CountTo } from '../../demoKit.jsx';
import { NextPointer } from '../demos.jsx';

/* =========================================================================
   MASTER FILM — The 90-Second Overview (~86s)
   The single hero demo for the merged problem/solution section.
   Act I (scenes 1–4): the invisible tax — drift, hours, release friction.
   Act II (scenes 5–8): Docify — read-only connect, AI writes, humans
   approve, docs stay in sync. HONESTY: Docify never writes to customer
   repos and never opens PRs — it updates the hosted/exported docs on merge.
   ========================================================================= */

/* local copies of the scene atoms (not exported from demos.jsx) */
const Chips = ({ items, on, delayBase = 0.1 }) => (
  <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
    {items.map((c, i) => (
      <span key={c} className={'demo-chip' + (i === on ? ' demo-chipon' : '')}
        style={{ animationDelay: (delayBase + i * 0.35) + 's' }}>{c}</span>
    ))}
  </div>
);

/* the hours engineering loses to manual docs — scene 3 data */
const COST_ROWS = [
  ['Explain auth over chat', '40 min', 'tag--amber'],
  ['Rewrite the quickstart by hand', '3 hrs', 'tag--red'],
  ['Answer the same question — again', '25 min', 'tag--amber'],
  ['Reverse-engineer the webhook flow', '6.5 hrs', 'tag--red']
];

const OVERVIEW_SCENES = [
  {
    label: 'Hook', dur: 10000, sfx: 'whoosh',
    vo: 'Every team pays it — the hours spent writing, fixing, and re-explaining documentation by hand. This is the ninety-second overview of getting them back.',
    render: () => (
      <TitleSlate kicker="THE 90-SECOND OVERVIEW"
        title="Manual documentation: the invisible tax."
        sub="Stale pages, repeated explanations, releases waiting on writing — every sprint pays it. Here is the whole story, and the way out, in ninety seconds." />
    )
  },
  {
    label: 'Docs drift', dur: 11000, sfx: 'click',
    vo: 'Your docs drift the moment code moves. Payments guide: four months old. Meanwhile, three pull requests just merged. The gap only widens.',
    render: () => (
      <div>
        <div className="demo-issue">
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">payments-guide.md</p>
            <span className="tag tag--amber">last updated 4 months ago</span>
          </div>
          <p className="helper mt2">Still describes the old retry schedule, the old auth flow, the old error codes.</p>
        </div>
        <div className="demo-loop mt5">
          {['PR #198 merged', 'PR #204 merged', 'PR #214 merged'].map((p, i) => (
            <React.Fragment key={p}>
              <span className="demo-loopbox demo-yline" style={{ animationDelay: (0.8 + i * 0.6) + 's' }}>{p}</span>
              <span className="demo-looparrow">→</span>
            </React.Fragment>
          ))}
          <span className="demo-late mono" style={{ animationDelay: '2.8s', color: 'var(--support-error)', fontWeight: 600, fontSize: 13 }}>docs updated: 0</span>
        </div>
        <p className="helper mt5 demo-late" style={{ animationDelay: '3.6s' }}>Every merge widens the gap between what the code does and what the docs say.</p>
      </div>
    )
  },
  {
    label: 'The hours', dur: 11000, sfx: 'click',
    vo: 'So engineers become the documentation. Explaining auth over chat. Rewriting the quickstart. Answering the same question again. Eleven hours — this release alone.',
    render: () => (
      <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
        <div className="score score--bad" style={{ minWidth: 180 }}>
          <span className="label01 t2">Engineering hours · this release</span>
          <span className="num"><CountTo from={0} to={11} delay={800} dur={2800} /></span>
          <span className="helper">spent being the documentation</span>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          {COST_ROWS.map(([task, time, tone], i) => (
            <div key={task} className="demo-issue" style={{ animationDelay: (0.3 + i * 0.6) + 's', padding: '10px 16px', marginBottom: 8 }}>
              <div className="row row--between" style={{ flexWrap: 'wrap' }}>
                <p className="h01">{task}</p>
                <span className={'tag ' + tone + ' mono'}>{time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    label: 'Release hold', dur: 11000, sfx: 'click',
    vo: 'And at release time, everything queues behind one checklist item: docs updated? The code is ready. The launch waits on the writing.',
    render: () => (
      <div>
        <p className="h01 mb5">Release 2.4 — launch checklist</p>
        <div className="demo-issue" style={{ borderLeftColor: 'var(--support-success)', padding: '10px 16px', marginBottom: 8 }}>
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">Build & unit tests</p><span className="tag tag--green">✓ passed</span>
          </div>
        </div>
        <div className="demo-issue" style={{ animationDelay: '0.8s', borderLeftColor: 'var(--support-success)', padding: '10px 16px', marginBottom: 8 }}>
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">Security review</p><span className="tag tag--green">✓ passed</span>
          </div>
        </div>
        <div className="demo-issue" style={{ animationDelay: '1.4s', borderLeftColor: 'var(--support-error)' }}>
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">Docs updated?</p><span className="tag tag--red">⏳ blocked — waiting on engineering</span>
          </div>
        </div>
        <div className="demo-loop mt5">
          <span className="mono">ship 2.4</span>
          <span className="demo-looparrow">→</span>
          <span className="demo-loopbox" style={{ background: '#a2191f' }}>HOLD</span>
          <span className="demo-looparrow">→</span>
          <span className="demo-late mono" style={{ animationDelay: '2.8s', color: 'var(--support-error)' }}>slipping to Thursday</span>
        </div>
      </div>
    )
  },
  {
    label: 'Enter Docify', dur: 10000, sfx: 'whoosh',
    vo: 'Docify ends the tax. Connect your repository read-only. AI writes the documentation from the code itself. Your team approves every word.',
    render: () => (
      <div>
        <p className="label01 t2 mb3 mono" style={{ letterSpacing: 2, color: 'var(--support-info)' }}>ENTER DOCIFY</p>
        <div style={{ padding: '2px 0 14px' }}>
          <span className="jd-verdict" style={{ background: '#edf5ff', color: '#0043ce', borderLeftColor: 'var(--button-primary)' }}>
            Connect read-only. AI writes from the code. Humans approve.
          </span>
        </div>
        <div className="demo-loop">
          <span className="demo-loopbox">your repo · read-only</span>
          <span className="demo-looparrow">→</span>
          <span className="demo-loopbox">AI drafts from source</span>
          <span className="demo-looparrow">→</span>
          <span className="check demo-loopcheck">human approves · publish</span>
        </div>
        <p className="helper mt5 demo-late" style={{ animationDelay: '3.2s' }}>Docify reads your repository — it never writes to it.</p>
      </div>
    )
  },
  {
    label: 'Generate', dur: 11500, sfx: 'click',
    vo: 'Point it at a repo and generate — eleven document types, from API references to runbooks — every section drafted from real source, scoring ninety-four.',
    render: () => (
      <div>
        <div className={'demo-row demo-pick'}>
          <span className="rdot" />
          <span className="mono" style={{ fontSize: 13 }}>acme/payments-api (GitHub) · read-only</span>
          <span className="demo-pickcheck check">✓ connected</span>
        </div>
        <div className="mt3">
          <Chips items={['API reference', 'User guide', 'Install & setup', 'Release notes', 'Architecture', 'Runbook', '+ 5 more']} on={0} delayBase={0.7} />
        </div>
        <div className="row mt5" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
          <div className="demo-yaml mono" style={{ minWidth: 240 }}>
            {['# Payments API reference', '## Authentication — bearer tokens · 24 h expiry', '## Webhooks — retries: 1 min, 5 min, 30 min', '## Errors — code · message · retriable flag'].map((l, i) => (
              <div key={l} className="demo-yline" style={{ animationDelay: (2.2 + i * 0.5) + 's' }}>{l}</div>
            ))}
          </div>
          <div className="score score--good" style={{ minWidth: 160 }}>
            <span className="label01 t2">Quality score</span>
            <span className="num"><CountTo from={0} to={94} delay={4200} dur={2200} /></span>
            <span className="helper">six dimensions checked</span>
          </div>
        </div>
      </div>
    )
  },
  {
    label: 'Stay current', dur: 11500, sfx: 'success',
    vo: 'Then it stays current. A merge fires a webhook, the affected section updates in place, clears the quality gate, and a human approves — version eight, published.',
    render: () => (
      <div>
        <div className="demo-loop" style={{ paddingBottom: 14 }}>
          <span className="demo-loopbox">PR #221 merged</span>
          <span className="demo-looparrow">→</span>
          <span className="demo-loopbox">webhook · 1.2s</span>
          <span className="demo-looparrow">→</span>
          <span className="mono">§ Webhooks updated in place</span>
        </div>
        <div className="demo-issue" style={{ borderLeftColor: 'var(--support-success)' }}>
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">payments-guide.md → § Webhooks</p>
            <span className="tag tag--green demo-late" style={{ animationDelay: '1.4s' }}>gate 92 ≥ 85 ✓</span>
          </div>
          <p className="helper mt2">Only the affected section changed — the other 41 pages untouched. Docify never writes to your repository — it updates the hosted documentation.</p>
        </div>
        <div className="demo-loop mt5">
          <span className="demo-loopbox">Human review → Approve</span>
          <span className="demo-looparrow">→</span>
          <span className="check demo-loopcheck">published · v8 · team notified ✉</span>
        </div>
      </div>
    )
  },
  {
    label: 'Outcomes', dur: 10000, sfx: 'chime',
    vo: 'Docs ship with the release. Hours come back every sprint. Quality gated on every publish. Documentation that stays in sync with your code.',
    render: () => (
      <div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, paddingBottom: 12 }}>
          {['Docs ship with the release', 'Hours back every sprint', 'Always current', 'Quality gate ≥ 85 on every publish'].map((c, i) => (
            <span key={c} className="demo-chip demo-chipon" style={{ animationDelay: (0.1 + i * 0.4) + 's' }}>{c}</span>
          ))}
        </div>
        <div style={{ padding: '4px 0 12px' }}>
          <span className="jd-verdict">Documentation that stays in sync with your code.</span>
        </div>
        <NextPointer target="film-connect" kicker="THE FULL TOUR"
          title="Explore every workflow — 8 chapters, 30 seconds each" />
      </div>
    )
  }
];

export function OverviewFilm() {
  return <DemoShell name="the 90-second overview" crumb="docify / overview / 90-seconds" scenes={OVERVIEW_SCENES}
    posterMeta={{
      kicker: 'THE 90-SECOND OVERVIEW',
      title: 'Manual documentation is a tax. Here is the refund.',
      sub: 'The drift, the lost hours, the release friction — then Docify: connect read-only, AI writes from the code, humans approve, docs stay in sync. The whole story in 90 seconds.',
      mins: '90 sec'
    }} />;
}
