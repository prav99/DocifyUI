import React from 'react';
import { DemoShell, TitleSlate, CountTo } from '../demoKit.jsx';

/* =========================================================================
   The three homepage product films. Each is a self-playing, narrated
   walkthrough built on DemoShell — voiceover, captions, ambient score,
   scene-by-scene progress, playable controls.

   1. AutomationDemo  — "Your code changes. Your documentation updates automatically."
   2. GenerateDemo    — "Turn complex technical input into professional documentation in minutes."
   3. AICompatDemo    — "Documentation people understand and AI systems trust."
   ========================================================================= */

/* ---------- Up-next pointer: elegant cross-navigation between films ---------- */
function NextPointer({ target, kicker, title }) {
  const go = () => {
    const el = document.getElementById(target);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

const PickRows = ({ title, rows, pick, note }) => (
  <div>
    <p className="h01 mb5">{title}</p>
    {rows.map((r, i) => (
      <div key={r} className={'demo-row' + (i === pick ? ' demo-pick' : '')}>
        <span className="rdot" />
        <span className="mono" style={{ fontSize: 13 }}>{r}</span>
        {i === pick && <span className="demo-pickcheck check">✓ selected</span>}
      </div>
    ))}
    {note && <p className="helper mt5 demo-late">{note}</p>}
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
   FILM 1 — Complete Documentation Automation
   ========================================================================= */
const AUTO_SCENES = [
  {
    label: 'Intro', dur: 7500,
    vo: 'Watch what happens when documentation becomes part of your pipeline. One setup. Then, every time your code changes, your documentation updates automatically.',
    render: () => (
      <TitleSlate kicker="FILM 01 · COMPLETE AUTOMATION"
        title="Your code changes. Your documentation updates automatically."
        sub="From a merged pull request to verified, published documentation — with no human in the loop until approval." />
    )
  },
  {
    label: 'Connect', dur: 8500,
    vo: 'It starts with one connection. GitHub, GitLab, or Bitbucket — a single read-only grant. Your source code is never stored.',
    render: () => (
      <div>
        <p className="h01 mb5">Connect your code host</p>
        {['GitHub', 'GitLab', 'Bitbucket'].map((r, i) => (
          <div key={r} className={'demo-row' + (i === 0 ? ' demo-pick' : '')}>
            <span className="rdot" />
            <span style={{ fontWeight: 600 }}>{r}</span>
            <span className="demo-branch mono">OAuth · read-only</span>
            {i === 0 && <span className="demo-pickcheck check">✓ connected</span>}
          </div>
        ))}
        <p className="helper mt5 demo-late">acme/payments-api · branch main — repositories listed instantly after one authorization.</p>
      </div>
    )
  },
  {
    label: 'Configure', dur: 9500,
    vo: 'Configure the workflow once: which branch to watch, which merges count, which documents to maintain, and the quality bar nothing may ship below.',
    render: () => (
      <div>
        <p className="h01 mb5">Automation pipeline — six steps, one wizard</p>
        <div className="demo-yaml mono">
          {['repository: acme/payments-api', 'branch: main', 'triggers: push + merged PRs', 'documents: API reference · Markdown', 'update-policy: place into existing doc', 'quality-gate: ≥ 85 · auto-fix: on'].map((l, i) => (
            <div key={l} className="demo-yline" style={{ animationDelay: (i * 0.55) + 's' }}>{l}</div>
          ))}
        </div>
        <p className="helper mt5 demo-late">Saved. From this moment the pipeline owns the documentation.</p>
      </div>
    )
  },
  {
    label: 'Merge lands', dur: 8500,
    vo: 'A developer merges a pull request. The webhook fires within seconds — DocGen reads the commits, the changed files, and the pull-request context.',
    render: () => (
      <div>
        <p className="h01 mb5">Merge detected on main</p>
        <div className="demo-loop" style={{ paddingBottom: 16 }}>
          <span className="demo-loopbox">PR #214 merged</span>
          <span className="demo-looparrow">→</span>
          <span className="mono">9f2c1ab</span>
          <span className="demo-looparrow">→</span>
          <span className="demo-loopbox">webhook · 1.2s</span>
        </div>
        <div className="demo-yaml mono" style={{ marginTop: 12 }}>
          {['message: "feat(auth): rotate API keys every 90 days"', 'files: src/auth/keys.js · src/auth/middleware.js', 'context: PR title, description, linked issue'].map((l, i) => (
            <div key={l} className="demo-yline" style={{ animationDelay: (0.8 + i * 0.6) + 's' }}>{l}</div>
          ))}
        </div>
      </div>
    )
  },
  {
    label: 'Analyse & write', dur: 10000,
    vo: 'It documents only what changed — analysing the diff, drafting the affected sections, and leaving everything else untouched.',
    render: () => (
      <Pipe steps={['Analysing changed files and commit context', 'Identifying affected documentation sections', 'Drafting updated content from the real code', 'Preserving structure, links, and terminology']} />
    )
  },
  {
    label: 'Update in place', dur: 9500,
    vo: 'Here is the part that keeps documentation clean: the change is placed into the existing document, at the best-matching section. No duplicates. Ever.',
    render: () => (
      <div>
        <p className="h01 mb5">Placed into your existing document</p>
        <div className="demo-issue" style={{ borderLeftColor: 'var(--support-success)' }}>
          <div className="row row--between" style={{ flexWrap: 'wrap' }}>
            <p className="h01">payments-developer-guide.md → § Authentication</p>
            <span className="tag tag--green">93% match</span>
          </div>
          <p className="helper mt2">Updated that section in place — the other 41 pages untouched. Version v7 created, restorable any time.</p>
        </div>
        <p className="helper mt5 demo-late">Semantic placement scores every section of your document against the change — never a standalone duplicate file.</p>
      </div>
    )
  },
  {
    label: 'Validate', dur: 9000,
    vo: 'The pipeline validates its own work before anything ships — content checks, link checks, style checks. This run clears the gate at ninety-two.',
    render: () => (
      <div>
        <Pipe gap={1.5} steps={['Content validated: completeness & accuracy', 'Links validated: every reference resolves', 'Style validated: terminology & guide compliance']} />
        <div className="demo-loop mt5">
          <span className="mono">validation</span>
          <span className="demo-looparrow">→</span>
          <span className="check demo-loopcheck">92 · gate ≥ 85 ✓</span>
        </div>
      </div>
    )
  },
  {
    label: 'Shipped', dur: 9000,
    vo: 'Done. The documentation is published, the team is notified, and the full run is recorded — trigger, commit, score, and outcome. Your code changed. Your documentation updated automatically.',
    render: () => (
      <div>
        <p className="h01 mb5">Published & notified</p>
        <div className="demo-loop">
          <span className="mono">merge</span>
          <span className="demo-looparrow">→</span>
          <span className="demo-loopbox">document updated</span>
          <span className="demo-looparrow">→</span>
          <span className="check demo-loopcheck">92 · gate ✓ · published</span>
        </div>
        <div className="demo-issue mt5" style={{ borderLeftColor: 'var(--support-info)' }}>
          <p className="h01">✉ Notification sent</p>
          <p className="helper mt2">"API reference updated from PR #214 — scored 92/100, published to workspace." Every run auditable in history.</p>
        </div>
      </div>
    )
  },
  {
    label: 'Up next', dur: 7000,
    vo: 'That is automation, end to end. Up next: see how DocGen evaluates your documentation for AI readiness.',
    render: () => (
      <NextPointer target="film-ai" kicker="FILM 03 · AI READINESS"
        title="See how DocGen evaluates your documentation for AI Readiness" />
    )
  }
];

export function AutomationDemo() {
  return <DemoShell name="complete automation" crumb="docgen / automation / on-merge" scenes={AUTO_SCENES}
    posterMeta={{ kicker: 'FILM 01 · COMPLETE AUTOMATION', title: 'Your code changes. Your documentation updates automatically.', sub: 'A pull request merges — and verified, published documentation follows. The whole loop, end to end.', mins: '~1½ min' }} />;
}

/* =========================================================================
   FILM 2 — AI Compatibility & AI Search Readiness
   ========================================================================= */
const DIMS = [
  ['Clarity & structure', 88, 96], ['Semantic relevance', 74, 93], ['Factual quality', 81, 94],
  ['Metadata & descriptions', 42, 90], ['Entity coverage', 66, 88], ['Question–answer coverage', 51, 92],
  ['Source credibility', 79, 91], ['Citation potential', 58, 95]
];

const AICOMPAT_SCENES = [
  {
    label: 'Intro', dur: 7500,
    vo: 'Your next customer may never read your documentation. Their AI assistant will. This is the AI Compatibility dashboard — where you find out if machines can understand, trust, and cite what you publish.',
    render: () => (
      <TitleSlate kicker="FILM 03 · AI COMPATIBILITY"
        title="Documentation people understand — and AI systems trust."
        sub="Analyse any document for AI search readiness, see exactly what holds it back, and fix it before you publish." />
    )
  },
  {
    label: 'Analyse', dur: 8500,
    vo: 'Open the dashboard and DocGen analyses your existing documentation automatically — the way ChatGPT, Claude, Gemini, and Copilot will read it.',
    render: () => (
      <Pipe gap={1.5} steps={['Reading document structure and sections', 'Simulating AI retrieval across platforms', 'Scoring nine readiness dimensions', 'Compiling strengths, gaps, and fixes']} />
    )
  },
  {
    label: 'Readiness score', dur: 9000,
    vo: 'The verdict arrives as one number: the AI Search Readiness Score. This document scores sixty-two. Understandable to humans — but machines are struggling with it.',
    render: () => (
      <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
        <div className="score score--warn" style={{ minWidth: 190 }}>
          <span className="label01 t2">AI Search Readiness</span>
          <span className="num"><CountTo from={0} to={62} delay={700} dur={2800} /></span>
          <span className="helper">needs work before AI platforms cite it</span>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="demo-issue">
            <p className="h01">What machines see</p>
            <p className="helper mt2">Strong prose, weak signals: missing short descriptions, thin metadata, sections that don't stand alone when quoted.</p>
          </div>
        </div>
      </div>
    )
  },
  {
    label: 'Dimensions', dur: 11000,
    vo: 'The score decomposes into nine dimensions — clarity, semantic relevance, factual quality, metadata, entity coverage, question and answer coverage, credibility, and citation potential. Green is ready. Amber is costing you visibility.',
    render: () => (
      <div>
        {DIMS.slice(0, 6).map(([n, v], i) => (
          <div key={n} className="demo-mrow demo-mrow--light" style={{ animationDelay: (0.2 + i * 0.5) + 's', gridTemplateColumns: '210px 1fr 44px' }}>
            <span className="demo-mname" style={{ color: 'var(--text-primary)' }}>{n}</span>
            <span className="demo-mbar" style={{ background: 'var(--border-subtle)' }}>
              <span className="demo-mfill" style={{ width: v + '%', animationDelay: (0.5 + i * 0.5) + 's', background: v >= 75 ? 'var(--support-success)' : 'var(--support-warning)' }} />
            </span>
            <span className="demo-mpct mono" style={{ color: 'var(--text-primary)' }}>{v}</span>
          </div>
        ))}
      </div>
    )
  },
  {
    label: 'Recommendations', dur: 10000,
    vo: 'Every weakness arrives as an action: add short descriptions machines can quote. Cover the questions users actually ask. Strengthen metadata. Each fix shows its projected gain — before you apply it.',
    render: () => (
      <div>
        {[['Add 160-character section descriptions', '+11'], ['Add question-form headings for top user intents', '+9'], ['Complete metadata & canonical entities', '+7']].map(([f, g], i) => (
          <div key={f} className="demo-issue" style={{ animationDelay: (i * 0.9) + 's' }}>
            <div className="row row--between" style={{ flexWrap: 'wrap' }}>
              <p className="h01">{f}</p>
              <span className="tag tag--blue">{g} readiness</span>
            </div>
          </div>
        ))}
        <p className="helper mt3 demo-late">Apply individually — or apply all and re-score.</p>
      </div>
    )
  },
  {
    label: 'Improved', dur: 10500,
    vo: 'Apply the improvements, and the score climbs from sixty-two to ninety-one. The same knowledge — now structured so ChatGPT, Claude, Gemini, and Copilot can find it, trust it, and cite it.',
    render: () => (
      <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
        <div className="score score--good" style={{ minWidth: 190 }}>
          <span className="label01 t2">AI Search Readiness</span>
          <span className="num"><CountTo from={62} to={91} delay={900} dur={3200} /></span>
          <span className="helper">▲ +29 after applied fixes</span>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          {DIMS.slice(3, 6).map(([n, v, v2], i) => (
            <div key={n} className="demo-mrow" style={{ animationDelay: (0.5 + i * 0.7) + 's', gridTemplateColumns: '210px 1fr 44px 64px' }}>
              <span className="demo-mname" style={{ color: 'var(--text-primary)' }}>{n}</span>
              <span className="demo-mbar" style={{ background: 'var(--border-subtle)' }}>
                <span className="demo-mfill" style={{ width: v2 + '%', animationDelay: (0.8 + i * 0.7) + 's' }} />
              </span>
              <span className="demo-mpct mono" style={{ color: 'var(--text-primary)' }}>{v2}</span>
              <span className="demo-mdelta" style={{ animationDelay: (1.6 + i * 0.7) + 's' }}>+{v2 - v}</span>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    label: 'Trusted', dur: 8000,
    vo: 'Create documentation people can understand — and AI systems can trust. That is AI compatibility, built into every document DocGen touches.',
    render: () => (
      <div style={{ padding: '16px 0' }}>
        <span className="jd-verdict">AI-ready · cleared to publish</span>
        <p className="helper mt5">Readiness re-checked on every regeneration — so it never silently decays.</p>
      </div>
    )
  },
  {
    label: 'Up next', dur: 7000,
    vo: 'That is AI readiness. Up next: explore the complete document generation workflow.',
    render: () => (
      <NextPointer target="film-generate" kicker="FILM 02 · GENERATE ON DEMAND"
        title="Explore the complete document-generation workflow" />
    )
  }
];

export function AICompatDemo() {
  return <DemoShell name="AI compatibility" crumb="docgen / quality / ai-compatibility" scenes={AICOMPAT_SCENES}
    posterMeta={{ kicker: 'FILM 03 · AI COMPATIBILITY', title: 'Documentation people understand — and AI systems trust.', sub: 'The AI Search Readiness Score: nine dimensions, exact fixes, and one document climbing from 62 to 91.', mins: '~1¼ min' }} />;
}

/* =========================================================================
   FILM 3 — Standard Documentation Generation Workflow
   ========================================================================= */
const GEN_SCENES = [
  {
    label: 'Intro', dur: 7000,
    vo: 'Not everything starts with a merge. Here is the standard workflow — turning complex technical input into professional documentation, in minutes.',
    render: () => (
      <TitleSlate kicker="FILM 02 · GENERATE ON DEMAND"
        title="Complex technical input → professional documentation, in minutes."
        sub="Pick a source, pick a document, pick a format — DocGen writes it from the truth, then proves its quality." />
    )
  },
  {
    label: 'Pick source', dur: 9000,
    vo: 'Start a new project and choose where the truth lives: a repository, Jira, uploaded files, an API specification, or cloud storage.',
    render: () => (
      <PickRows title="Select a source" pick={1}
        rows={['GitHub · GitLab · Bitbucket', 'acme/payments-api (GitHub)', 'Jira project · uploaded files · OpenAPI spec']}
        note="Sources combine — repository code plus a Jira project plus an API spec, in one document." />
    )
  },
  {
    label: 'Choose document', dur: 9500,
    vo: 'Choose what to produce — an API reference, a user guide, an installation guide, release notes — each held to an open documentation standard.',
    render: () => (
      <div>
        <p className="h01 mb5">Document type</p>
        <Chips items={['API reference', 'User guide', 'Install & setup', 'Quick start', 'Release notes']} on={0} />
        <p className="helper mt5 demo-late">API reference selected — held to the OpenAPI 3.1 standard, structured by the Diátaxis framework.</p>
      </div>
    )
  },
  {
    label: 'Format & audience', dur: 9500,
    vo: 'Pick the output format — DITA, Markdown, HTML, PDF, or Word — then the audience, the writing style, and the level of detail. The same content, tuned to its readers.',
    render: () => (
      <div>
        <p className="h01 mb5">Output & audience</p>
        <Chips items={['DITA', 'Markdown', 'HTML', 'PDF', 'Word']} on={1} />
        <div className="row mt5" style={{ flexWrap: 'wrap', gap: 8 }}>
          {['Audience: developers', 'Style: plain & direct', 'Detail: standard'].map((c, i) => (
            <span key={c} className="demo-chip demo-chipon" style={{ animationDelay: (2.2 + i * 0.5) + 's' }}>{c}</span>
          ))}
        </div>
        <p className="helper mt5 demo-late">Plus 25 output options — cover, table of contents, watermark, legal blocks — honored in every format.</p>
      </div>
    )
  },
  {
    label: 'Generate', dur: 10000,
    vo: 'DocGen collects the source information, shows you what it found, and writes every section from it — structure, comments, commit history, and API annotations.',
    render: () => (
      <Pipe steps={['Collecting source: 214 files · 41 endpoints · 12 models', 'Mapping sections to the OpenAPI standard', 'Drafting content from the real code', 'Rendering preview + all export formats']} />
    )
  },
  {
    label: 'Review & verify', dur: 10000,
    vo: 'Preview it. Edit anything. Then let the quality checks run — completeness, readability, links, and style. This draft scores ninety-four.',
    render: () => (
      <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
        <div className="score score--good" style={{ minWidth: 170 }}>
          <span className="label01 t2">Quality score</span>
          <span className="num"><CountTo from={0} to={94} delay={700} dur={3000} /></span>
          <span className="helper">six quality dimensions checked</span>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="demo-issue">
            <div className="row row--between" style={{ flexWrap: 'wrap' }}>
              <p className="h01">Editable preview — every section traced to source</p>
              <span className="tag tag--green">2 fixes auto-applied</span>
            </div>
            <p className="helper mt2">One remaining suggestion with a declared gain; apply it or publish as-is.</p>
          </div>
        </div>
      </div>
    )
  },
  {
    label: 'Export', dur: 9000,
    vo: 'Download it, export it, or publish it to your workspace — DITA, Markdown, HTML, PDF, and Word from the same verified content. Minutes, not weeks.',
    render: () => (
      <div>
        <p className="h01 mb5">Export center</p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {['payments-api-reference.dita', 'payments-api-reference.md', 'payments-api-reference.pdf', 'payments-api-reference.docx'].map((f, i) => (
            <span key={f} className="demo-chip" style={{ animationDelay: (0.2 + i * 0.5) + 's', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>⬇ {f}</span>
          ))}
        </div>
        <div className="demo-loop mt5">
          <span className="mono">source</span>
          <span className="demo-looparrow">→</span>
          <span className="demo-loopbox">generate + verify</span>
          <span className="demo-looparrow">→</span>
          <span className="check demo-loopcheck">professional documentation ✓</span>
        </div>
      </div>
    )
  },
  {
    label: 'Up next', dur: 7000,
    vo: 'That is the standard workflow. Up next: discover how DocGen automates documentation after every code change.',
    render: () => (
      <NextPointer target="film-automation" kicker="FILM 01 · AUTOMATION"
        title="Discover how DocGen automates documentation after every code change" />
    )
  }
];

export function GenerateDemo() {
  return <DemoShell name="standard generation" crumb="docgen / generate / new-project" scenes={GEN_SCENES}
    posterMeta={{ kicker: 'FILM 02 · GENERATE ON DEMAND', title: 'Complex technical input → professional documentation, in minutes.', sub: 'Source, document type, format, audience — then generation, verification, and export.', mins: '~1¼ min' }} />;
}
