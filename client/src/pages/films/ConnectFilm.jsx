import React from 'react';
import { DemoShell, TitleSlate, CountTo, Cursor, Callout } from '../../demoKit.jsx';
import { NextPointer } from '../demos.jsx';

/* =========================================================================
   FILM 04 — Connect Your Ecosystem (~30s)
   "One place for every repository you document."
   Hook → connect providers → sync organisations → one catalogue → up next.
   ========================================================================= */

/* local copy of the shared Pipe atom (not exported from demos.jsx) */
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

const HealthDot = () => (
  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--support-success)', display: 'inline-block', flex: 'none' }} />
);

const CONNECT_SCENES = [
  {
    label: 'Hook', dur: 4500, sfx: 'whoosh',
    vo: 'Documentation starts with finding the source. Connect your providers once — and every repository you document lives in one place.',
    render: () => (
      <TitleSlate kicker="CONNECT YOUR ECOSYSTEM"
        title="One place for every repository you document."
        sub="GitHub, GitLab, and Bitbucket into one searchable catalogue — connection health at a glance, read-only, source never stored." />
    )
  },
  {
    label: 'Connect providers', dur: 6500, sfx: 'click',
    vo: 'Connect GitHub, GitLab, and Bitbucket — accounts, organisations, groups, and workspaces — with connection health visible at a glance.',
    cues: [{ at: 800, sfx: 'pop' }, { at: 1300, sfx: 'pop' }, { at: 2000, sfx: 'pop' }],
    // Each provider row mounts on its narrated name (GitHub=word 2, GitLab=3,
    // Bitbucket=5); health checks land together on "connection health" (word 12).
    render: (beat) => (
      <div>
        <p className="h01 mb5">Connect your providers — once</p>
        {[['GitHub', 'org · acme-corp', 2], ['GitLab', 'group · platform-eng', 3], ['Bitbucket', 'workspace · acme-mobile', 5]].map(([p, d, b], i) => (
          beat >= b && (
            <div key={p} className="demo-row" style={{ animationDelay: '0.05s' }}>
              <span className="rdot" />
              <span style={{ fontWeight: 600 }}>{p}</span>
              <span className="demo-branch mono">{d}</span>
              {beat >= 12 && (
                <span className="demo-pickcheck check" style={{ animationDelay: (0.05 + i * 0.25) + 's', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <HealthDot /> healthy · connected
                </span>
              )}
            </div>
          )
        ))}
        <p className="helper mt5 demo-late" style={{ animationDelay: '4.4s' }}>Read-only OAuth · public and private repositories · add as many accounts, orgs, groups, and workspaces as you need.</p>
      </div>
    )
  },
  {
    label: 'Sync organisations', dur: 6500, sfx: 'click',
    vo: 'Docify syncs each organisation and pulls every repository, public or private, into the catalogue — forty-three in this workspace.',
    cues: [{ at: 300, sfx: 'process' }, { at: 3000, sfx: 'pop' }, { at: 5000, sfx: 'pop' }],
    // Counter starts on "repository" (word 8) so 43 lands as "forty-three" is
    // narrated; the sync pipe is spread across the scene; late callout payoff.
    render: (beat) => (
      <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
        <div className="score score--good" style={{ minWidth: 170 }}>
          <span className="label01 t2">Repositories in catalogue</span>
          <span className="num">{beat >= 8 ? <CountTo from={0} to={43} delay={100} dur={2200} /> : 0}</span>
          <span className="helper">3 providers · public + private</span>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <Pipe gap={1.6} steps={['Syncing acme-corp (GitHub) · 24 repositories', 'Syncing platform-eng (GitLab) · 11 repositories', 'Syncing acme-mobile (Bitbucket) · 8 repositories']} />
        </div>
        <Callout x={10} y={70} at={5000} tone="green">3 / 3 organisations synced</Callout>
      </div>
    )
  },
  {
    label: 'One catalogue', dur: 7000, sfx: 'success',
    vo: 'Search one catalogue and reuse it everywhere — generation, automation, and Standardize — while access stays read-only and source is never stored.',
    cues: [{ at: 1400, sfx: 'type' }, { at: 1750, sfx: 'type' }, { at: 2400, sfx: 'pop' }],
    // Cursor clicks the search field, the payments filter "types" in, results
    // pop on "reuse it" (word 6); the never-stored line lands on "source" (17).
    render: (beat) => (
      <div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className="demo-chip demo-chipon mono" style={{ animationDelay: '0.1s', fontSize: 12 }}>⌕ payments</span>
          {beat >= 7 && <span className="helper demo-late" style={{ animationDelay: '0.05s' }}>3 of 43 repositories</span>}
        </div>
        <div className="mt5">
          {[['acme/payments-api', 'GitHub · private'], ['platform-eng/payments-gateway', 'GitLab · private'], ['acme-mobile/payments-sdk', 'Bitbucket · public']].map(([r, meta], i) => (
            beat >= 6 && (
              <div key={r} className="demo-row" style={{ animationDelay: (0.05 + i * 0.3) + 's' }}>
                <span className="mono" style={{ fontSize: 13 }}>{r}</span>
                <span className="demo-branch mono">{meta}</span>
                <span className="tag tag--green" style={{ marginLeft: 'auto' }}>read-only</span>
              </div>
            )
          ))}
        </div>
        {beat >= 17 && <p className="helper mt5 demo-late" style={{ animationDelay: '0.05s' }}>Source is never stored. The same catalogue powers generation, automation, and Standardize.</p>}
        <Cursor steps={[{ x: 30, y: 42, at: 300 }, { x: 14, y: 15, at: 1150, click: true }, { x: 44, y: 54, at: 3600 }]} />
      </div>
    )
  },
  {
    label: 'Up next', dur: 6000, sfx: 'chime',
    vo: 'One place for every repository you document. Next — watch source content become professional documentation.',
    cues: [{ at: 3100, sfx: 'whoosh' }],
    // The up-next pointer mounts exactly on the narrated "Next" (word 8).
    render: (beat) => (
      <div>
        <div style={{ padding: '4px 0 10px' }}>
          <span className="jd-verdict">One catalogue. Every repository. Read-only.</span>
        </div>
        {beat >= 8 && (
          <NextPointer target="film-generate" kicker="GENERATE ON DEMAND"
            title="Watch source content become professional documentation" />
        )}
      </div>
    )
  }
];

export function ConnectDemo() {
  return <DemoShell name="connect your ecosystem" crumb="docify / repositories / connect" scenes={CONNECT_SCENES}
    posterMeta={{ kicker: 'CONNECT YOUR ECOSYSTEM', title: 'One place for every repository you document.', sub: 'GitHub, GitLab, and Bitbucket — every account, org, and workspace in one searchable, read-only catalogue, with health at a glance. In 30 seconds.', mins: '30 sec' }} />;
}
