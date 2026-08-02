import React from 'react';
import { DemoShell, TitleSlate, CountTo, Cursor, Callout } from '../../demoKit.jsx';
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

   MOTION: scenes are beat-synchronized — render(beat) receives the number
   of narrated words already spoken, and key reveals gate on the exact word
   (word counts documented per scene). Muted playback advances a synthetic
   beat (~380ms/word) so nothing stalls.
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

/* the hours engineering loses to manual docs — scene 3 data.
   4th column: the narrated beat (word index in the vo) each row lands on. */
const COST_ROWS = [
  ['Explain auth over chat', '40 min', 'tag--amber', 6],
  ['Rewrite the quickstart by hand', '3 hrs', 'tag--red', 10],
  ['Answer the same question — again', '25 min', 'tag--amber', 13],
  ['Reverse-engineer the webhook flow', '6.5 hrs', 'tag--red', 17]
];

/* quality dimensions — scene 11. 3rd column: narrated beat per dimension. */
const QUALITY_DIMS = [
  ['Structure', 94, 6],
  ['Clarity', 91, 7],
  ['Completeness', 89, 9]
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
    /* beats: Your1 docs2 drift3 … Payments8 guide9 four10 months11 old12
       Meanwhile13 three14 … merged18 The19 gap20 only21 widens22 */
    label: 'Docs drift', dur: 12000, sfx: 'click',
    vo: 'Your docs drift the moment code moves. Payments guide: four months old. Meanwhile, three pull requests just merged. The gap only widens.',
    cues: [{ at: 1200, sfx: 'pop' }, { at: 5000, sfx: 'pop' }, { at: 6600, sfx: 'notify' }],
    render: (beat) => (
      <div>
        {beat >= 3 && (
          <div className="demo-issue" style={{ animationDelay: '0.05s' }}>
            <div className="row row--between" style={{ flexWrap: 'wrap' }}>
              <p className="h01">payments-guide.md</p>
              {beat >= 10 && <span className="tag tag--amber demo-yline" style={{ animationDelay: '0.05s' }}>last updated 4 months ago</span>}
            </div>
            <p className="helper mt2 demo-late" style={{ animationDelay: '3s' }}>Still describes the old retry schedule, the old auth flow, the old error codes.</p>
          </div>
        )}
        {beat >= 14 && (
          <div className="demo-loop mt5">
            {['PR #198 merged', 'PR #204 merged', 'PR #214 merged'].map((p, i) => (
              <React.Fragment key={p}>
                <span className="demo-loopbox demo-yline" style={{ animationDelay: (0.05 + i * 0.5) + 's' }}>{p}</span>
                <span className="demo-looparrow">→</span>
              </React.Fragment>
            ))}
            {beat >= 19 && <span className="demo-late mono" style={{ animationDelay: '0.1s', color: 'var(--support-error)', fontWeight: 600, fontSize: 13 }}>docs updated: 0</span>}
          </div>
        )}
        <p className="helper mt5 demo-late" style={{ animationDelay: '7.4s' }}>Every merge widens the gap between what the code does and what the docs say.</p>
      </div>
    )
  },
  {
    /* beats: So1 … documentation5 Explaining6 … chat9 Rewriting10 … quickstart12
       Answering13 … again17 Eleven18 hours19 this20 release21 alone22 */
    label: 'The hours', dur: 12000, sfx: 'click',
    vo: 'So engineers become the documentation. Explaining auth over chat. Rewriting the quickstart. Answering the same question again. Eleven hours — this release alone.',
    cues: [{ at: 2100, sfx: 'pop' }, { at: 3450, sfx: 'pop' }, { at: 4450, sfx: 'pop' }, { at: 6300, sfx: 'notify' }],
    render: (beat) => (
      <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
        <div className="score score--bad" style={{ minWidth: 180 }}>
          <span className="label01 t2">Engineering hours · this release</span>
          <span className="num">{beat >= 18 ? <CountTo from={0} to={11} delay={250} dur={1900} /> : '0'}</span>
          {beat >= 18 && <span className="helper demo-late" style={{ animationDelay: '1.9s' }}>spent being the documentation</span>}
          <span className="helper demo-late" style={{ animationDelay: '9s' }}>Illustrative example — the landing estimator’s default of 11 hrs per release.</span>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          {COST_ROWS.map(([task, time, tone, gate]) => beat >= gate && (
            <div key={task} className="demo-issue" style={{ animationDelay: '0.05s', padding: '10px 16px', marginBottom: 8 }}>
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
    /* beats: And1 … checklist9 item10 docs11 updated12 The13 code14 is15 ready16
       The17 launch18 waits19 on20 the21 writing22 */
    label: 'Release hold', dur: 12000, sfx: 'click',
    vo: 'And at release time, everything queues behind one checklist item: docs updated? The code is ready. The launch waits on the writing.',
    cues: [{ at: 600, sfx: 'click' }, { at: 2200, sfx: 'click' }, { at: 3950, sfx: 'notify' }, { at: 6300, sfx: 'pop' }],
    render: (beat) => (
      <div>
        <p className="h01 mb5">Release 2.4 — launch checklist</p>
        <div className="demo-issue" style={{ animationDelay: '0.4s', borderLeftColor: 'var(--support-success)', padding: '10px 16px', marginBottom: 8 }}>
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">Build & unit tests</p><span className="tag tag--green">✓ passed</span>
          </div>
        </div>
        <div className="demo-issue" style={{ animationDelay: '2s', borderLeftColor: 'var(--support-success)', padding: '10px 16px', marginBottom: 8 }}>
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">Security review</p><span className="tag tag--green">✓ passed</span>
          </div>
        </div>
        {beat >= 11 && (
          <div className="demo-issue" style={{ animationDelay: '0.05s', borderLeftColor: 'var(--support-error)' }}>
            <div className="row row--between" style={{ flexWrap: 'wrap' }}>
              <p className="h01">Docs updated?</p><span className="tag tag--red">⏳ blocked — waiting on engineering</span>
            </div>
          </div>
        )}
        {beat >= 17 && (
          <div className="demo-loop mt5">
            <span className="mono demo-yline" style={{ animationDelay: '0.05s' }}>ship 2.4</span>
            <span className="demo-looparrow">→</span>
            <span className="demo-loopbox demo-yline" style={{ animationDelay: '0.4s', background: '#a2191f' }}>HOLD</span>
            <span className="demo-looparrow">→</span>
            <span className="demo-late mono" style={{ animationDelay: '1.6s', color: 'var(--support-error)' }}>slipping to Thursday</span>
          </div>
        )}
      </div>
    )
  },
  {
    /* beats: Docify1 ends2 the3 tax4 Connect5 your6 repository7 read-only8
       AI9 writes10 … itself16 Your17 team18 approves19 every20 word21 */
    label: 'Enter Docify', dur: 11000, sfx: 'whoosh',
    vo: 'Docify ends the tax. Connect your repository read-only. AI writes the documentation from the code itself. Your team approves every word.',
    cues: [{ at: 1800, sfx: 'pop' }, { at: 3200, sfx: 'pop' }, { at: 6100, sfx: 'chime' }],
    render: (beat) => (
      <div>
        <p className="label01 t2 mb3 mono" style={{ letterSpacing: 2, color: 'var(--support-info)' }}>ENTER DOCIFY</p>
        <div style={{ padding: '2px 0 14px' }}>
          <span className="jd-verdict" style={{ background: '#edf5ff', color: '#0043ce', borderLeftColor: 'var(--button-primary)' }}>
            Connect read-only. AI writes from the code. Humans approve.
          </span>
        </div>
        <div className="demo-loop">
          {beat >= 5 && <>
            <span className="demo-loopbox demo-yline" style={{ animationDelay: '0.05s' }}>your repo · read-only</span>
            <span className="demo-looparrow">→</span>
          </>}
          {beat >= 9 && <>
            <span className="demo-loopbox demo-yline" style={{ animationDelay: '0.05s' }}>AI drafts from source</span>
            <span className="demo-looparrow">→</span>
          </>}
          {beat >= 17 && <span className="check demo-loopcheck" style={{ animationDelay: '0.1s' }}>human approves · publish</span>}
        </div>
        <p className="helper mt5 demo-late" style={{ animationDelay: '7s' }}>Docify reads your repository — it never writes to it.</p>
      </div>
    )
  },
  {
    /* beats: Point1 … repo5 and6 generate7 eleven8 document9 types10 … release15
       notes16 every17 section18 drafted19 … source22 scoring23 ninety-four24
       Cursor rides the narration: arrives on the repo row and clicks as
       "repo … generate" is spoken, then drifts toward the draft and score. */
    label: 'Generate', dur: 12500, sfx: 'click',
    vo: 'Point it at a repo and generate — eleven document types, from API references to release notes — every section drafted from real source, scoring ninety-four here.',
    cues: [{ at: 5800, sfx: 'type' }, { at: 6400, sfx: 'type' }, { at: 8300, sfx: 'chime' }],
    render: (beat) => (
      <div>
        <Cursor steps={[
          { x: 12, y: 78, at: 350 },
          { x: 46, y: 13, at: 1150 },
          { x: 46, y: 13, at: 1800, click: true },
          { x: 28, y: 34, at: 3600 },
          { x: 76, y: 64, at: 8400 }
        ]} />
        <div className={'demo-row demo-pick'}>
          <span className="rdot" />
          <span className="mono" style={{ fontSize: 13 }}>acme/payments-api (GitHub) · read-only</span>
          <span className="demo-pickcheck check">✓ connected</span>
        </div>
        {beat >= 8 && (
          <div className="mt3">
            {/* the real catalogue (DOCTYPES in server/src/catalog.js) — 11 in
                total, so only types Docify actually generates appear here */}
            <Chips items={['API reference', 'User guide', 'Install & setup', 'Quick start', 'Troubleshooting & FAQ', 'Release notes', '+ 5 more']} on={0} delayBase={0.1} />
          </div>
        )}
        <div className="row mt5" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
          {beat >= 17 && (
            <div className="demo-yaml mono" style={{ minWidth: 240 }}>
              {['# Payments API reference', '## Authentication — bearer tokens · 24 h expiry', '## Webhooks — retries: 1 min, 5 min, 30 min', '## Errors — code · message · retriable flag'].map((l, i) => (
                <div key={l} className="demo-yline" style={{ animationDelay: (0.1 + i * 0.55) + 's' }}>{l}</div>
              ))}
            </div>
          )}
          {beat >= 23 && (
            <div className="score score--good demo-yline" style={{ minWidth: 160, animationDelay: '0.05s' }}>
              <span className="label01 t2">Quality score</span>
              <span className="num"><CountTo from={0} to={94} delay={250} dur={2000} /></span>
              <span className="helper">six dimensions checked</span>
            </div>
          )}
        </div>
      </div>
    )
  },
  {
    /* beats: A1 developer2 merges3 … twenty-one7 Docify8 detects9 … seconds12
       reads13 the14 diff15 and16 decides17 which18 document19 … effort23 —
       the merge chain assembles box by box exactly as narrated. */
    label: 'Merge detected', dur: 14000, sfx: 'click',
    vo: 'A developer merges pull request two twenty-one. Docify detects it in seconds, reads the diff, and decides which document — with zero human effort.',
    cues: [{ at: 700, sfx: 'notify' }, { at: 4600, sfx: 'process' }, { at: 7600, sfx: 'pop' }],
    render: (beat) => (
      <div>
        <div className="demo-loop" style={{ paddingBottom: 14 }}>
          {beat >= 2 && <span className="demo-loopbox demo-yline" style={{ animationDelay: '0.05s' }}>Developer merges PR #221</span>}
          {beat >= 8 && <>
            <span className="demo-looparrow">→</span>
            <span className="demo-loopbox demo-yline" style={{ animationDelay: '0.05s' }}>Docify detects · webhook · 1.2s</span>
          </>}
          {beat >= 13 && <>
            <span className="demo-looparrow">→</span>
            <span className="mono demo-yline" style={{ animationDelay: '0.05s' }}>AI analyzes the diff</span>
          </>}
        </div>
        {beat >= 13 && (
          <Pipe gap={1.4} steps={[
            'Reading the diff · 3 files changed',
            'Relevance: customer-facing change ✓',
            'Target: payments-guide.md § Webhooks'
          ]} />
        )}
        <p className="helper mt5 demo-late" style={{ animationDelay: '9.8s' }}>Detection and analysis run on their own — nobody filed a ticket, nobody was asked to write.</p>
      </div>
    )
  },
  {
    /* beats: The1 section2 updates3 in4 place5 clears6 the7 quality8 gate9
       and10 link11 checks12 then13 follows14 your15 policy16 publish17
       automatically18 or19 hold20 for21 team22 approval23 — the routing split
       assembles on its narrated words; the cursor lands the approval click. */
    label: 'Validated & published', dur: 14000, sfx: 'success',
    vo: 'The section updates in place, clears the quality gate and link checks, then follows your policy — publish automatically, or hold for team approval.',
    cues: [{ at: 2900, sfx: 'pop' }, { at: 4900, sfx: 'pop' }, { at: 8600, sfx: 'notify' }],
    render: (beat) => (
      <div>
        <Cursor steps={[
          { x: 82, y: 22, at: 2600 },
          { x: 22, y: 68, at: 5200 },
          { x: 55, y: 72, at: 7200 },
          { x: 55, y: 72, at: 7800, click: true }
        ]} />
        <div className="demo-issue" style={{ borderLeftColor: 'var(--support-success)' }}>
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">payments-guide.md → § Webhooks · updated in place</p>
            {beat >= 8 && <span className="tag tag--green demo-yline" style={{ animationDelay: '0.05s' }}>gate 92 ≥ 85 ✓</span>}
          </div>
          <p className="helper mt2">Only the affected section changed — the other 41 pages untouched. Docify never writes to your repository — it updates the hosted documentation.</p>
        </div>
        <Callout x={58} y={26} at={3200} tone="green">gate cleared at 92 — threshold is 85</Callout>
        {beat >= 6 && (
          <div className="mt3">
            <Pipe gap={1.1} steps={['Content, links & style validated', 'Quality gate cleared: 92 ≥ 85 ✓']} />
          </div>
        )}
        <div className="demo-loop mt3">
          {beat >= 14 && <>
            <span className="mono demo-yline" style={{ animationDelay: '0.05s' }}>your policy</span>
            <span className="demo-looparrow">→</span>
          </>}
          {beat >= 17 && <span className="demo-loopbox demo-yline" style={{ animationDelay: '0.05s' }}>auto-publish</span>}
          {beat >= 19 && <>
            <span className="mono" style={{ padding: '0 4px' }}>or</span>
            <span className="demo-loopbox demo-yline" style={{ animationDelay: '0.05s' }}>hold for approval</span>
          </>}
          {beat >= 23 && <>
            <span className="demo-looparrow">→</span>
            <span className="check demo-loopcheck" style={{ animationDelay: '0.3s' }}>published · v8 · team notified ✉</span>
          </>}
        </div>
        <p className="helper mt3 demo-late" style={{ animationDelay: '10.2s' }}>Routing is configurable — each team chooses auto-publish or required approval, per document.</p>
      </div>
    )
  },
  {
    /* beats: Once1 … flow10 hand-maintained11 documentation12 simply13 ends14
       Merge15 your16 code17 the18 documentation19 follows20 */
    label: 'Trust the workflow', dur: 13000, sfx: 'chime',
    vo: 'Once your team trusts the gate and the approval flow, hand-maintained documentation simply ends. Merge your code — the documentation follows.',
    cues: [{ at: 800, sfx: 'pop' }, { at: 1800, sfx: 'pop' }, { at: 4500, sfx: 'pop' }, { at: 5300, sfx: 'notify' }],
    render: (beat) => (
      <div>
        <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <p className="label01 t2 mb3">BEFORE — every sprint</p>
            {['Write new docs by hand', 'Update docs after every merge', 'Answer doc questions in chat'].map((t, i) => (
              <div key={t} className="demo-issue" style={{ animationDelay: (0.3 + i * 1) + 's', padding: '10px 16px', marginBottom: 8 }}>
                <p className="h01" style={{ textDecoration: 'line-through', opacity: 0.55 }}>{t}</p>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <p className="label01 t2 mb3">AFTER — with Docify (illustrative)</p>
            {beat >= 13 && (
              <div className="demo-issue" style={{ animationDelay: '0.05s', borderLeftColor: 'var(--support-success)', padding: '10px 16px' }}>
                <div className="row row--between" style={{ flexWrap: 'wrap' }}>
                  <p className="h01">Review a diff</p>
                  <span className="tag tag--green mono">~5 min</span>
                </div>
              </div>
            )}
            <p className="helper mt2 demo-late" style={{ animationDelay: '7.6s' }}>The only doc task left on the list.</p>
          </div>
        </div>
        <div style={{ padding: '12px 0 4px' }}>
          {beat >= 15 && <span className="jd-verdict" style={{ animationDelay: '0.05s' }}>Merge your code. The documentation follows.</span>}
        </div>
      </div>
    )
  },
  {
    /* beats: The1 math2 manual3 documentation4 takes5 three6 people7 and8
       eleven9 hours10 per11 release12 With13 Docify14 four15 minutes16 of17
       generation18 forty-five19 minutes20 of21 review22 published23 … day26 —
       each ROI tile mounts on its narrated side; its counter runs so the
       number lands as the narration names it. */
    label: 'The savings', dur: 15000, sfx: 'click',
    vo: 'The math: manual documentation takes three people and eleven hours per release. With Docify — four minutes of generation, forty-five minutes of review, published the same day.',
    cues: [{ at: 1100, sfx: 'pop' }, { at: 4600, sfx: 'pop' }, { at: 8300, sfx: 'process' }, { at: 11200, sfx: 'success' }],
    render: (beat) => (
      <div>
        <Callout x={46} y={40} at={5600} tone="amber">illustrative example — $95/hr · 11 hrs per release</Callout>
        <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
          {beat >= 3 && (
            <div className="score score--bad demo-yline" style={{ flex: 1, minWidth: 210, animationDelay: '0.05s' }}>
              <span className="label01 t2">MANUAL · per release</span>
              <span className="num"><CountTo from={0} to={11} delay={600} dur={2000} /><span style={{ fontSize: 18, fontWeight: 600 }}> hrs</span></span>
              <span className="helper">3 people involved · ~$<CountMoney to={1045} delay={800} dur={2000} /> at $95/hr · published days later</span>
            </div>
          )}
          {beat >= 13 && (
            <div className="score score--good demo-yline" style={{ flex: 1, minWidth: 210, animationDelay: '0.05s' }}>
              <span className="label01 t2">DOCIFY · per release</span>
              <span className="num"><CountTo from={0} to={45} delay={900} dur={2000} /><span style={{ fontSize: 18, fontWeight: 600 }}> min</span></span>
              <span className="helper">generation 4 min · human review ~$<CountMoney to={71} delay={1200} dur={2000} /> · published same day</span>
            </div>
          )}
        </div>
        {beat >= 23 && (
          <div className="mt5">
            {[
              ['Manual effort', 100, 'var(--support-error)', '11h'],
              ['Docify · generation', 4, 'var(--support-info)', '4m'],
              ['Docify · human review', 7, 'var(--support-success)', '45m']
            ].map(([n, v, c, t], i) => (
              <div key={n} className="demo-mrow demo-mrow--light" style={{ animationDelay: (0.1 + i * 0.5) + 's', gridTemplateColumns: '210px 1fr 44px' }}>
                <span className="demo-mname" style={{ color: 'var(--text-primary)' }}>{n}</span>
                <span className="demo-mbar" style={{ background: 'var(--border-subtle)' }}>
                  <span className="demo-mfill" style={{ width: v + '%', animationDelay: (0.4 + i * 0.5) + 's', background: c }} />
                </span>
                <span className="demo-mpct mono" style={{ color: 'var(--text-primary)' }}>{t}</span>
              </div>
            ))}
          </div>
        )}
        <div className="row mt3" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className="demo-chip demo-chipon" style={{ animationDelay: '11s' }}>≈ 93% less effort per release</span>
          <span className="helper demo-late" style={{ animationDelay: '11.8s' }}>Illustrative example at $95/hr and 11 hrs per release — model your own numbers with the estimator below.</span>
        </div>
      </div>
    )
  },
  {
    /* beats: Every1 publish2 is3 scored4 across5 structure6 clarity7 and8
       completeness9 gated10 at11 eighty-five12 and13 checked14 for15 AI16
       readiness17 … improvable22 — each dimension bar lands on its word. */
    label: 'Quality proven', dur: 13000, sfx: 'click',
    vo: 'Every publish is scored across structure, clarity, and completeness, gated at eighty-five, and checked for AI readiness — a modeled signal, always improvable.',
    cues: [{ at: 2000, sfx: 'pop' }, { at: 3050, sfx: 'pop' }, { at: 5600, sfx: 'notify' }],
    render: (beat) => (
      <div>
        <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
          <div className="score score--good" style={{ minWidth: 180 }}>
            <span className="label01 t2">Quality score</span>
            <span className="num"><CountTo from={0} to={92} delay={500} dur={2200} /></span>
            <span className="helper">gated at ≥ 85 on every publish</span>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            {QUALITY_DIMS.map(([n, v, gate]) => beat >= gate && (
              <div key={n} className="demo-mrow demo-mrow--light" style={{ animationDelay: '0.05s', gridTemplateColumns: '210px 1fr 44px' }}>
                <span className="demo-mname" style={{ color: 'var(--text-primary)' }}>{n}</span>
                <span className="demo-mbar" style={{ background: 'var(--border-subtle)' }}>
                  <span className="demo-mfill" style={{ width: v + '%', animationDelay: '0.35s', background: 'var(--support-success)' }} />
                </span>
                <span className="demo-mpct mono" style={{ color: 'var(--text-primary)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        {beat >= 16 && (
          <div className="demo-issue mt5" style={{ animationDelay: '0.05s' }}>
            <div className="row row--between" style={{ flexWrap: 'wrap' }}>
              <p className="h01">AI Search Readiness</p>
              <span className="tag tag--green mono">88</span>
            </div>
            <p className="helper mt2 demo-late" style={{ animationDelay: '1.5s' }}>A modeled signal, computed from the document’s own quality dimensions — nothing is sent to an AI platform, and no ranking or citation is guaranteed. Scored and improvable on every publish.</p>
          </div>
        )}
      </div>
    )
  },
  {
    /* beats: Docs1 ship2 … release5 Hours6 … sprint10 Every11 publish12
       gated13 Each14 step15 … chapter20 take21 the22 full23 tour24 —
       outcome chips land one per narrated claim; the tour pointer is the
       final payoff on "take the full tour". */
    label: 'Outcomes', dur: 13000, sfx: 'chime',
    vo: 'Docs ship with the release. Hours come back every sprint. Every publish gated. Each step has its own thirty-second chapter — take the full tour.',
    cues: [{ at: 600, sfx: 'pop' }, { at: 2100, sfx: 'pop' }, { at: 3800, sfx: 'pop' }, { at: 7600, sfx: 'success' }],
    render: (beat) => (
      <div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, paddingBottom: 12 }}>
          {[
            ['Docs ship with the release', 1],
            ['Hours back every sprint', 6],
            ['Updated on every merge', 10],
            ['Quality gate ≥ 85 on every publish', 11],
            ['≈ 93% less effort — illustrative', 13]
          ].map(([c, gate]) => beat >= gate && (
            <span key={c} className="demo-chip demo-chipon" style={{ animationDelay: '0.05s' }}>{c}</span>
          ))}
        </div>
        <p className="helper demo-late" style={{ animationDelay: '5.5s' }}>Scripted demonstration with sample data. The effort figures come from the illustrative example above ($95/hr, 11 hrs per release), not from measured customer results.</p>
        <div style={{ padding: '4px 0 12px' }}>
          {beat >= 13 && <span className="jd-verdict" style={{ animationDelay: '0.3s' }}>Documentation that stays in sync with your code.</span>}
        </div>
        {beat >= 21 && (
          <NextPointer target="film-connect" kicker="THE FULL TOUR"
            title="Every step has its own 30-second chapter — explore the full tour" />
        )}
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
