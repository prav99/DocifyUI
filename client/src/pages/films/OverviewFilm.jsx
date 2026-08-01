import React from 'react';
import { DemoShell, TitleSlate, CountTo } from '../../demoKit.jsx';
import { NextPointer } from '../demos.jsx';

/* =========================================================================
   MASTER FILM — The Complete Overview (~2½ min, 12 scenes)
   The single hero demo for the merged problem/solution section.
   Act I  (scenes 1–4):  the invisible tax — drift, hours, release friction.
   Act II (scenes 5–8):  Docify — read-only connect, AI writes, the full
                         merge → analyze → validate → route pipeline.
   Act III (scenes 9–12): trust the workflow, the ROI math, quality proof,
                         outcomes. HONESTY: Docify never writes to customer
   repos and never opens PRs — it updates the hosted/exported docs on merge.
   ROI numbers match the landing estimator ($95/hr, 11 hrs/release) and are
   labeled as an illustrative example — no fabricated customer results.
   ========================================================================= */

/* ---------- local copies of the scene atoms (not exported from demos.jsx) ---------- */
const Chips = ({ items, on, delayBase = 0.1 }) => (
  <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
    {items.map((c, i) => (
      <span key={c} className={'demo-chip' + (i === on ? ' demo-chipon' : '')}
        style={{ animationDelay: (delayBase + i * 0.35) + 's' }}>{c}</span>
    ))}
  </div>
);

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

/* animated dollar counter — CountTo with locale formatting for $1,045 */
const CountMoney = ({ to, delay = 1200, dur = 2400 }) => {
  const [v, setV] = React.useState(0);
  React.useEffect(() => {
    let raf;
    const d = setTimeout(() => {
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(d); if (raf) cancelAnimationFrame(raf); };
  }, [to, delay, dur]);
  return <>{v.toLocaleString('en-US')}</>;
};

/* the hours engineering loses to manual docs — scene 3 data */
const COST_ROWS = [
  ['Explain auth over chat', '40 min', 'tag--amber'],
  ['Rewrite the quickstart by hand', '3 hrs', 'tag--red'],
  ['Answer the same question — again', '25 min', 'tag--amber'],
  ['Reverse-engineer the webhook flow', '6.5 hrs', 'tag--red']
];

/* quality dimensions — scene 11 (reuses the AI-readiness bar motif) */
const QUALITY_DIMS = [
  ['Structure', 94],
  ['Clarity', 91],
  ['Completeness', 89]
];

const OVERVIEW_SCENES = [
  {
    label: 'Hook', dur: 10000, sfx: 'whoosh',
    vo: 'Every team pays it — the hours spent writing, fixing, and re-explaining documentation by hand. This is the complete overview of getting them back.',
    render: () => (
      <TitleSlate kicker="THE COMPLETE OVERVIEW"
        title="Manual documentation: the invisible tax."
        sub="Stale pages, repeated explanations, releases waiting on writing — every sprint pays it. The whole story — the pain, the workflow, the return — in two and a half minutes." />
    )
  },
  {
    label: 'Docs drift', dur: 12000, sfx: 'click',
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
    label: 'The hours', dur: 12000, sfx: 'click',
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
    label: 'Release hold', dur: 12000, sfx: 'click',
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
    label: 'Enter Docify', dur: 11000, sfx: 'whoosh',
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
    label: 'Generate', dur: 12500, sfx: 'click',
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
    label: 'Merge detected', dur: 14000, sfx: 'click',
    vo: 'A developer merges pull request two twenty-one. Docify detects it in seconds, reads the diff, and decides which document — with zero human effort.',
    render: () => (
      <div>
        <div className="demo-loop" style={{ paddingBottom: 14 }}>
          <span className="demo-loopbox">Developer merges PR #221</span>
          <span className="demo-looparrow">→</span>
          <span className="demo-loopbox">Docify detects · webhook · 1.2s</span>
          <span className="demo-looparrow">→</span>
          <span className="mono">AI analyzes the diff</span>
        </div>
        <Pipe gap={1.6} steps={[
          'Reading the diff · 3 files changed',
          'Relevance: customer-facing change ✓',
          'Target: payments-guide.md § Webhooks'
        ]} />
        <p className="helper mt5 demo-late" style={{ animationDelay: '5.4s' }}>Detection and analysis run on their own — nobody filed a ticket, nobody was asked to write.</p>
      </div>
    )
  },
  {
    label: 'Validated & published', dur: 14000, sfx: 'success',
    vo: 'The section updates in place, clears the quality gate and link checks, then follows your policy — publish automatically, or hold for team approval.',
    render: () => (
      <div>
        <div className="demo-issue" style={{ borderLeftColor: 'var(--support-success)' }}>
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">payments-guide.md → § Webhooks · updated in place</p>
            <span className="tag tag--green demo-late" style={{ animationDelay: '1.2s' }}>gate 92 ≥ 85 ✓</span>
          </div>
          <p className="helper mt2">Only the affected section changed — the other 41 pages untouched. Docify never writes to your repository — it updates the hosted documentation.</p>
        </div>
        <div className="mt3">
          <Pipe gap={1.1} steps={['Content, links & style validated', 'Quality gate cleared: 92 ≥ 85 ✓']} />
        </div>
        <div className="demo-loop mt3">
          <span className="mono">your policy</span>
          <span className="demo-looparrow">→</span>
          <span className="demo-loopbox">auto-publish</span>
          <span className="mono" style={{ padding: '0 4px' }}>or</span>
          <span className="demo-loopbox">hold for approval</span>
          <span className="demo-looparrow">→</span>
          <span className="check demo-loopcheck">published · v8 · team notified ✉</span>
        </div>
        <p className="helper mt3 demo-late" style={{ animationDelay: '4.2s' }}>Routing is configurable — each team chooses auto-publish or required approval, per document.</p>
      </div>
    )
  },
  {
    label: 'Trust the workflow', dur: 13000, sfx: 'chime',
    vo: 'Once your team trusts the gate and the approval flow, hand-maintained documentation simply ends. Merge your code — the documentation follows.',
    render: () => (
      <div>
        <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <p className="label01 t2 mb3">BEFORE — every sprint</p>
            {['Write new docs by hand', 'Update docs after every merge', 'Answer doc questions in chat'].map((t, i) => (
              <div key={t} className="demo-issue" style={{ animationDelay: (0.2 + i * 0.5) + 's', padding: '10px 16px', marginBottom: 8 }}>
                <p className="h01" style={{ textDecoration: 'line-through', opacity: 0.55 }}>{t}</p>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <p className="label01 t2 mb3">AFTER — with Docify</p>
            <div className="demo-issue" style={{ animationDelay: '1.9s', borderLeftColor: 'var(--support-success)', padding: '10px 16px' }}>
              <div className="row row--between" style={{ flexWrap: 'wrap' }}>
                <p className="h01">Review a diff</p>
                <span className="tag tag--green mono">~5 min</span>
              </div>
            </div>
            <p className="helper mt2 demo-late" style={{ animationDelay: '2.6s' }}>The only doc task left on the list.</p>
          </div>
        </div>
        <div style={{ padding: '12px 0 4px' }}>
          <span className="jd-verdict">Merge your code. The documentation follows.</span>
        </div>
      </div>
    )
  },
  {
    label: 'The savings', dur: 15000, sfx: 'click',
    vo: 'The math: manual documentation takes three people and eleven hours per release. With Docify — four minutes of generation, forty-five minutes of review, published the same day.',
    render: () => (
      <div>
        <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
          <div className="score score--bad" style={{ flex: 1, minWidth: 210 }}>
            <span className="label01 t2">MANUAL · per release</span>
            <span className="num"><CountTo from={0} to={11} delay={600} dur={2000} /><span style={{ fontSize: 18, fontWeight: 600 }}> hrs</span></span>
            <span className="helper">3 people involved · ~$<CountMoney to={1045} delay={900} dur={2200} /> at $95/hr · published days later</span>
          </div>
          <div className="score score--good" style={{ flex: 1, minWidth: 210 }}>
            <span className="label01 t2">DOCIFY · per release</span>
            <span className="num"><CountTo from={0} to={45} delay={1500} dur={2000} /><span style={{ fontSize: 18, fontWeight: 600 }}> min</span></span>
            <span className="helper">generation 4 min · human review ~$<CountMoney to={71} delay={1800} dur={2000} /> · published same day</span>
          </div>
        </div>
        <div className="mt5">
          {[
            ['Manual effort', 100, 'var(--support-error)', '11h'],
            ['Docify · generation', 4, 'var(--support-info)', '4m'],
            ['Docify · human review', 7, 'var(--support-success)', '45m']
          ].map(([n, v, c, t], i) => (
            <div key={n} className="demo-mrow demo-mrow--light" style={{ animationDelay: (2.6 + i * 0.5) + 's', gridTemplateColumns: '210px 1fr 44px' }}>
              <span className="demo-mname" style={{ color: 'var(--text-primary)' }}>{n}</span>
              <span className="demo-mbar" style={{ background: 'var(--border-subtle)' }}>
                <span className="demo-mfill" style={{ width: v + '%', animationDelay: (2.9 + i * 0.5) + 's', background: c }} />
              </span>
              <span className="demo-mpct mono" style={{ color: 'var(--text-primary)' }}>{t}</span>
            </div>
          ))}
        </div>
        <div className="row mt3" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className="demo-chip demo-chipon" style={{ animationDelay: '4.4s' }}>≈ 93% less effort per release</span>
          <span className="helper demo-late" style={{ animationDelay: '4.8s' }}>Illustrative example at $95/hr and 11 hrs per release — model your own numbers with the estimator below.</span>
        </div>
      </div>
    )
  },
  {
    label: 'Quality proven', dur: 13000, sfx: 'click',
    vo: 'Every publish is scored across structure, clarity, and completeness, gated at eighty-five, and checked for AI readiness — a modeled signal, always improvable.',
    render: () => (
      <div>
        <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
          <div className="score score--good" style={{ minWidth: 180 }}>
            <span className="label01 t2">Quality score</span>
            <span className="num"><CountTo from={0} to={92} delay={600} dur={2200} /></span>
            <span className="helper">gated at ≥ 85 on every publish</span>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            {QUALITY_DIMS.map(([n, v], i) => (
              <div key={n} className="demo-mrow demo-mrow--light" style={{ animationDelay: (0.5 + i * 0.5) + 's', gridTemplateColumns: '210px 1fr 44px' }}>
                <span className="demo-mname" style={{ color: 'var(--text-primary)' }}>{n}</span>
                <span className="demo-mbar" style={{ background: 'var(--border-subtle)' }}>
                  <span className="demo-mfill" style={{ width: v + '%', animationDelay: (0.8 + i * 0.5) + 's', background: 'var(--support-success)' }} />
                </span>
                <span className="demo-mpct mono" style={{ color: 'var(--text-primary)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="demo-issue mt5" style={{ animationDelay: '2.6s' }}>
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">AI Search Readiness</p>
            <span className="tag tag--green mono">88</span>
          </div>
          <p className="helper mt2">A modeled signal — simulated AI retrieval, not a guarantee of any platform's behavior. Scored, gated, and improvable on every publish.</p>
        </div>
      </div>
    )
  },
  {
    label: 'Outcomes', dur: 13000, sfx: 'chime',
    vo: 'Docs ship with the release. Hours come back every sprint. Every publish gated. Each step has its own thirty-second chapter — take the full tour.',
    render: () => (
      <div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, paddingBottom: 12 }}>
          {['Docs ship with the release', 'Hours back every sprint', 'Always current', 'Quality gate ≥ 85 on every publish', '≈ 93% less effort'].map((c, i) => (
            <span key={c} className="demo-chip demo-chipon" style={{ animationDelay: (0.1 + i * 0.4) + 's' }}>{c}</span>
          ))}
        </div>
        <div style={{ padding: '4px 0 12px' }}>
          <span className="jd-verdict">Documentation that stays in sync with your code.</span>
        </div>
        <NextPointer target="film-connect" kicker="THE FULL TOUR"
          title="Every step has its own 30-second chapter — explore the full tour" />
      </div>
    )
  }
];

export function OverviewFilm() {
  return <DemoShell name="the complete overview" crumb="docify / overview / complete" scenes={OVERVIEW_SCENES}
    posterMeta={{
      kicker: 'THE COMPLETE OVERVIEW',
      title: 'Documentation that stays in sync with your code.',
      sub: 'The pain of manual docs, the automated merge-to-publish workflow, the ROI math, and the quality proof — the whole Docify story in 2.5 minutes.',
      mins: '2½ min'
    }} />;
}
