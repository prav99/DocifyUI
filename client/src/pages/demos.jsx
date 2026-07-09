import React from 'react';
import { DemoShell, TitleSlate, CountTo } from '../demoKit.jsx';

/* =========================================================================
   The three homepage marketing films — ~30 seconds each, one use case each.
   Built on DemoShell: voiceover, captions, ambient score, per-scene SFX.
   Structure per film: hook → setup → demo → proof → close + up-next pointer.

   1. AutomationDemo — "Your code changes. Your documentation updates automatically."
   2. GenerateDemo   — "Turn complex source content into professional documentation in minutes."
   3. AICompatDemo   — "Documentation people understand — and AI can discover."
   Full production plan: design/FILMS-30S-PLAN.md
   ========================================================================= */

/* ---------- Up-next pointer: elegant cross-navigation between films ---------- */
function NextPointer({ target, kicker, title }) {
  const go = () => {
    const el = document.getElementById(target);
    if (el) el.scrollIntoView({ block: 'center' });
  };
  return (
    <div style={{ padding: '8px 0' }}>
      <p className="label01 t2 mb3">UP NEXT</p>
      <button className="nextcard" onClick={go}>
        <span>
          <span className="nextcard-kicker mono">{kicker}</span>
          <span className="nextcard-title">{title}</span>
        </span>
        <span className="nextcard-arrow" aria-hidden="true">→</span>
      </button>
    </div>
  );
}

/* ---------- small shared scene atoms ---------- */
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

const Chips = ({ items, on, delayBase = 0.1 }) => (
  <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
    {items.map((c, i) => (
      <span key={c} className={'demo-chip' + (i === on ? ' demo-chipon' : '')}
        style={{ animationDelay: (delayBase + i * 0.35) + 's' }}>{c}</span>
    ))}
  </div>
);

/* =========================================================================
   FILM 01 — End-to-End Documentation Automation (~30s)
   ========================================================================= */
const AUTO_SCENES = [
  {
    label: 'Hook', dur: 4500, sfx: 'whoosh',
    vo: 'Every merge changes the truth. Here is how your documentation keeps up — automatically.',
    render: () => (
      <TitleSlate kicker="FILM 01 · COMPLETE AUTOMATION"
        title="Your code changes. Your documentation updates automatically."
        sub="From merged pull request to verified, published documentation — no human in the loop until approval." />
    )
  },
  {
    label: 'Connect & configure', dur: 6500, sfx: 'click',
    vo: 'Connect GitHub, GitLab, or Bitbucket once — then set the rules: branch, triggers, and the quality bar.',
    render: () => (
      <div>
        <p className="h01 mb5">One connection. One configuration.</p>
        <div className={'demo-row demo-pick'}>
          <span className="rdot" />
          <span style={{ fontWeight: 600 }}>GitHub</span>
          <span className="demo-branch mono">acme/payments-api · read-only</span>
          <span className="demo-pickcheck check">✓ connected</span>
        </div>
        <div className="demo-yaml mono" style={{ marginTop: 12 }}>
          {['branch: main · triggers: push + merged PRs', 'documents: API reference · update in place', 'quality-gate: ≥ 85 · auto-fix: on'].map((l, i) => (
            <div key={l} className="demo-yline" style={{ animationDelay: (0.6 + i * 0.55) + 's' }}>{l}</div>
          ))}
        </div>
        <p className="helper mt5 demo-late">Saved. From this moment the pipeline owns the documentation.</p>
      </div>
    )
  },
  {
    label: 'Merge → update', dur: 6500, sfx: 'click',
    vo: 'A pull request merges. DocGen updates the right section of your existing docs — never a duplicate.',
    render: () => (
      <div>
        <div className="demo-loop" style={{ paddingBottom: 14 }}>
          <span className="demo-loopbox">PR #214 merged</span>
          <span className="demo-looparrow">→</span>
          <span className="demo-loopbox">webhook · 1.2s</span>
          <span className="demo-looparrow">→</span>
          <span className="mono">docs updated</span>
        </div>
        <div className="demo-issue" style={{ borderLeftColor: 'var(--support-success)' }}>
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">payments-developer-guide.md → § Authentication</p>
            <span className="tag tag--green">93% match</span>
          </div>
          <p className="helper mt2">Placed into the best-matching section of the existing document. The other 41 pages untouched. Version v7 created.</p>
        </div>
      </div>
    )
  },
  {
    label: 'Verify & notify', dur: 6000, sfx: 'success',
    vo: 'Validated, gate-checked, published — and your team is notified.',
    render: () => (
      <div>
        <Pipe gap={1.0} steps={['Content, links & style validated', 'Quality gate cleared: 92 ≥ 85 ✓', 'Published · team notified ✉']} />
        <div className="demo-loop mt5">
          <span className="mono">merge</span>
          <span className="demo-looparrow">→</span>
          <span className="demo-loopbox">document updated</span>
          <span className="demo-looparrow">→</span>
          <span className="check demo-loopcheck">92 · gate ✓ · published</span>
        </div>
      </div>
    )
  },
  {
    label: 'Up next', dur: 6000, sfx: 'chime',
    vo: 'Your code changes. Your documentation updates automatically. Next — AI readiness.',
    render: () => (
      <div>
        <div style={{ padding: '4px 0 10px' }}>
          <span className="jd-verdict">Your code changes. Your documentation updates automatically.</span>
        </div>
        <NextPointer target="film-ai" kicker="FILM 03 · AI READINESS"
          title="See how Docify checks your documentation for AI Readiness" />
      </div>
    )
  }
];

export function AutomationDemo() {
  return <DemoShell name="complete automation" crumb="docgen / automation / on-merge" scenes={AUTO_SCENES}
    posterMeta={{ kicker: 'FILM 01 · COMPLETE AUTOMATION', title: 'Your code changes. Your documentation updates automatically.', sub: 'A pull request merges — and verified, published documentation follows. The whole loop in 30 seconds.', mins: '30 sec' }} />;
}

/* =========================================================================
   FILM 03 — AI Readiness (~30s)
   ========================================================================= */
const DIMS = [
  ['Metadata & descriptions', 42, 90],
  ['Question–answer coverage', 51, 92],
  ['Entity coverage', 66, 88]
];

const AICOMPAT_SCENES = [
  {
    label: 'Hook', dur: 4500, sfx: 'whoosh',
    vo: 'Your next reader may be an AI assistant. Is your documentation ready for it?',
    render: () => (
      <TitleSlate kicker="FILM 03 · AI READINESS"
        title="Readable by people. Discoverable by AI."
        sub="Analyse any document for AI search readiness, see exactly what holds it back, and fix it before you publish." />
    )
  },
  {
    label: 'Analyse', dur: 6000, sfx: 'click',
    vo: 'Docify analyses your documentation the way ChatGPT, Gemini, Claude, and Copilot actually read it.',
    render: () => (
      <Pipe gap={1.2} steps={['Reading structure, sections & metadata', 'Simulating AI retrieval across platforms', 'Scoring readiness · compiling exact fixes']} />
    )
  },
  {
    label: 'Score & findings', dur: 7000, sfx: 'click',
    vo: 'The AI readiness score shows exactly what holds you back — metadata, entities, and answer coverage.',
    render: () => (
      <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
        <div className="score score--warn" style={{ minWidth: 180 }}>
          <span className="label01 t2">AI Search Readiness</span>
          <span className="num"><CountTo from={0} to={62} delay={500} dur={2200} /></span>
          <span className="helper">needs work before AI platforms cite it</span>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          {DIMS.map(([n, v], i) => (
            <div key={n} className="demo-mrow demo-mrow--light" style={{ animationDelay: (0.4 + i * 0.5) + 's', gridTemplateColumns: '210px 1fr 44px' }}>
              <span className="demo-mname" style={{ color: 'var(--text-primary)' }}>{n}</span>
              <span className="demo-mbar" style={{ background: 'var(--border-subtle)' }}>
                <span className="demo-mfill" style={{ width: v + '%', animationDelay: (0.7 + i * 0.5) + 's', background: 'var(--support-warning)' }} />
              </span>
              <span className="demo-mpct mono" style={{ color: 'var(--text-primary)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    label: 'Fix & climb', dur: 6500, sfx: 'success',
    vo: 'Apply the recommendations — and watch it climb from sixty-two to ninety-one.',
    render: () => (
      <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
        <div className="score score--good" style={{ minWidth: 180 }}>
          <span className="label01 t2">AI Search Readiness</span>
          <span className="num"><CountTo from={62} to={91} delay={900} dur={2600} /></span>
          <span className="helper">▲ +29 after applied fixes</span>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          {[['Add 160-character section descriptions', '+11'], ['Add question-form headings', '+9'], ['Complete metadata & entities', '+7']].map(([f, g], i) => (
            <div key={f} className="demo-issue" style={{ animationDelay: (i * 0.6) + 's' }}>
              <div className="row row--between" style={{ flexWrap: 'wrap' }}>
                <p className="h01">{f}</p>
                <span className="tag tag--green">✓ applied {g}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    label: 'Up next', dur: 6000, sfx: 'chime',
    vo: 'Documentation people can understand — and AI can discover. Next — the complete generation workflow.',
    render: () => (
      <div>
        <div style={{ padding: '4px 0 10px' }}>
          <span className="jd-verdict">Documentation people understand — and AI can discover.</span>
        </div>
        <NextPointer target="film-generate" kicker="FILM 02 · GENERATE ON DEMAND"
          title="Explore the complete document-generation workflow" />
      </div>
    )
  }
];

export function AICompatDemo() {
  return <DemoShell name="AI readiness" crumb="docgen / quality / ai-readiness" scenes={AICOMPAT_SCENES}
    posterMeta={{ kicker: 'FILM 03 · AI READINESS', title: 'Readable by people. Discoverable by AI.', sub: 'The AI Search Readiness Score, the exact fixes, and one document climbing from 62 to 91 — in 30 seconds.', mins: '30 sec' }} />;
}

/* =========================================================================
   FILM 02 — Standard Document Generation (~30s)
   ========================================================================= */
const GEN_SCENES = [
  {
    label: 'Hook', dur: 4500, sfx: 'whoosh',
    vo: 'Weeks of writing — or one workflow. Watch complex source content become professional documentation, in minutes.',
    render: () => (
      <TitleSlate kicker="FILM 02 · GENERATE ON DEMAND"
        title="Complex source content → professional documentation, in minutes."
        sub="Pick a source, a document, a format — DocGen writes it from the truth, then proves its quality." />
    )
  },
  {
    label: 'Source & document', dur: 6500, sfx: 'click',
    vo: 'Pick where the truth lives — a repository, tickets, files, or an API spec — and choose your document.',
    render: () => (
      <div>
        <p className="h01 mb5">Select a source & document type</p>
        <div className={'demo-row demo-pick'}>
          <span className="rdot" />
          <span className="mono" style={{ fontSize: 13 }}>acme/payments-api (GitHub)</span>
          <span className="demo-pickcheck check">✓ selected</span>
        </div>
        <div className="mt5">
          <Chips items={['API reference', 'User guide', 'Install & setup', 'Release notes']} on={0} delayBase={0.9} />
        </div>
        <p className="helper mt5 demo-late">Sources combine — code plus Jira plus an OpenAPI spec, in one document.</p>
      </div>
    )
  },
  {
    label: 'Format & audience', dur: 6000, sfx: 'click',
    vo: 'Choose DITA, Markdown, HTML, PDF, or Word — tuned to your audience and style.',
    render: () => (
      <div>
        <p className="h01 mb5">Output & audience</p>
        <Chips items={['DITA', 'Markdown', 'HTML', 'PDF', 'Word']} on={1} />
        <div className="row mt5" style={{ flexWrap: 'wrap', gap: 8 }}>
          {['Audience: developers', 'Style: plain & direct', 'Detail: standard'].map((c, i) => (
            <span key={c} className="demo-chip demo-chipon" style={{ animationDelay: (1.9 + i * 0.45) + 's' }}>{c}</span>
          ))}
        </div>
        <p className="helper mt5 demo-late">Plus 25 output options — cover, table of contents, watermark — honored in every format.</p>
      </div>
    )
  },
  {
    label: 'Generate & verify', dur: 7000, sfx: 'success',
    vo: 'DocGen writes every section from the real source, previews it, and proves its quality — ninety-four.',
    render: () => (
      <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
        <div className="score score--good" style={{ minWidth: 170 }}>
          <span className="label01 t2">Quality score</span>
          <span className="num"><CountTo from={0} to={94} delay={2600} dur={2400} /></span>
          <span className="helper">six quality dimensions checked</span>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <Pipe gap={1.1} steps={['Collecting source: 214 files · 41 endpoints', 'Drafting every section from the real code', 'Editable preview · quality checks passed']} />
        </div>
      </div>
    )
  },
  {
    label: 'Up next', dur: 6000, sfx: 'chime',
    vo: 'Download, export, or publish. Professional documentation in minutes. Next — automation after every code change.',
    render: () => (
      <div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, paddingBottom: 12 }}>
          {['payments-api-reference.md', 'payments-api-reference.pdf', 'payments-api-reference.docx'].map((f, i) => (
            <span key={f} className="demo-chip" style={{ animationDelay: (0.1 + i * 0.4) + 's', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>⬇ {f}</span>
          ))}
        </div>
        <NextPointer target="film-automation" kicker="FILM 01 · AUTOMATION"
          title="Discover how Docify automates documentation after every code change" />
      </div>
    )
  }
];

export function GenerateDemo() {
  return <DemoShell name="standard generation" crumb="docgen / generate / new-project" scenes={GEN_SCENES}
    posterMeta={{ kicker: 'FILM 02 · GENERATE ON DEMAND', title: 'Complex source content → professional documentation, in minutes.', sub: 'Source, document type, format, audience — then generation, verification, and export. In 30 seconds.', mins: '30 sec' }} />;
}
