import React from 'react';
import { DemoShell, TitleSlate, CountTo } from '../../demoKit.jsx';
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
    render: () => (
      <div>
        <p className="h01 mb5">Connect your providers — once</p>
        {[['GitHub', 'org · acme-corp'], ['GitLab', 'group · platform-eng'], ['Bitbucket', 'workspace · acme-mobile']].map(([p, d], i) => (
          <div key={p} className="demo-row" style={{ animationDelay: (0.15 + i * 0.35) + 's' }}>
            <span className="rdot" />
            <span style={{ fontWeight: 600 }}>{p}</span>
            <span className="demo-branch mono">{d}</span>
            <span className="demo-pickcheck check" style={{ animationDelay: (1.1 + i * 0.6) + 's', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <HealthDot /> healthy · connected
            </span>
          </div>
        ))}
        <p className="helper mt5 demo-late" style={{ animationDelay: '3.2s' }}>Read-only OAuth · public and private repositories · add as many accounts, orgs, groups, and workspaces as you need.</p>
      </div>
    )
  },
  {
    label: 'Sync organisations', dur: 6500, sfx: 'click',
    vo: 'Docify syncs each organisation and pulls every repository, public or private, into the catalogue — forty-three in this workspace.',
    render: () => (
      <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
        <div className="score score--good" style={{ minWidth: 170 }}>
          <span className="label01 t2">Repositories in catalogue</span>
          <span className="num"><CountTo from={0} to={43} delay={1400} dur={2600} /></span>
          <span className="helper">3 providers · public + private</span>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <Pipe gap={1.1} steps={['Syncing acme-corp (GitHub) · 24 repositories', 'Syncing platform-eng (GitLab) · 11 repositories', 'Syncing acme-mobile (Bitbucket) · 8 repositories']} />
        </div>
      </div>
    )
  },
  {
    label: 'One catalogue', dur: 7000, sfx: 'success',
    vo: 'Search one catalogue and reuse it everywhere — generation, automation, and Standardize — while access stays read-only and source is never stored.',
    render: () => (
      <div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className="demo-chip demo-chipon mono" style={{ animationDelay: '0.1s', fontSize: 12 }}>⌕ payments</span>
          <span className="helper demo-late" style={{ animationDelay: '1.1s' }}>3 of 43 repositories</span>
        </div>
        <div className="mt5">
          {[['acme/payments-api', 'GitHub · private'], ['platform-eng/payments-gateway', 'GitLab · private'], ['acme-mobile/payments-sdk', 'Bitbucket · public']].map(([r, meta], i) => (
            <div key={r} className="demo-row" style={{ animationDelay: (0.5 + i * 0.3) + 's' }}>
              <span className="mono" style={{ fontSize: 13 }}>{r}</span>
              <span className="demo-branch mono">{meta}</span>
              <span className="tag tag--green" style={{ marginLeft: 'auto' }}>read-only</span>
            </div>
          ))}
        </div>
        <p className="helper mt5 demo-late" style={{ animationDelay: '2.6s' }}>Source is never stored. The same catalogue powers generation, automation, and Standardize.</p>
      </div>
    )
  },
  {
    label: 'Up next', dur: 6000, sfx: 'chime',
    vo: 'One place for every repository you document. Next — watch source content become professional documentation.',
    render: () => (
      <div>
        <div style={{ padding: '4px 0 10px' }}>
          <span className="jd-verdict">One catalogue. Every repository. Read-only.</span>
        </div>
        <NextPointer target="film-generate" kicker="GENERATE ON DEMAND"
          title="Watch source content become professional documentation" />
      </div>
    )
  }
];

export function ConnectDemo() {
  return <DemoShell name="connect your ecosystem" crumb="docify / repositories / connect" scenes={CONNECT_SCENES}
    posterMeta={{ kicker: 'CONNECT YOUR ECOSYSTEM', title: 'One place for every repository you document.', sub: 'GitHub, GitLab, and Bitbucket — every account, org, and workspace in one searchable, read-only catalogue, with health at a glance. In 30 seconds.', mins: '30 sec' }} />;
}
