import React from 'react';
import { DemoShell, TitleSlate, CountTo, Cursor, Callout } from '../demoKit.jsx';

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
export function NextPointer({ target, kicker, title }) {
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
      <TitleSlate kicker="COMPLETE AUTOMATION"
        title="Your code changes. Your documentation updates automatically."
        sub="From merged pull request to verified, published documentation — no human in the loop until approval." />
    )
  },
  {
    label: 'Connect & configure', dur: 6500, sfx: 'click',
    vo: 'Connect GitHub, GitLab, or Bitbucket once — then set the rules: branch, triggers, and the quality bar.',
    cues: [{ at: 3700, sfx: 'type' }, { at: 4300, sfx: 'type' }, { at: 5800, sfx: 'pop' }],
    render: (beat) => (
      <div>
        <p className="h01 mb5">One connection. One configuration.</p>
        <div className={'demo-row demo-pick'}>
          <span className="rdot" />
          <span style={{ fontWeight: 600 }}>GitHub</span>
          <span className="demo-branch mono">acme/payments-api · read-only</span>
          <span className="demo-pickcheck check">✓ connected</span>
        </div>
        {beat >= 9 && (
          <div className="demo-yaml mono" style={{ marginTop: 12 }}>
            {['branch: main · triggers: push + merged PRs', 'documents: API reference · update in place', 'quality-gate: ≥ 85 · auto-fix: on'].map((l, i) => (
              <div key={l} className="demo-yline" style={{ animationDelay: (0.1 + i * 0.55) + 's' }}>{l}</div>
            ))}
          </div>
        )}
        {beat >= 15 && <p className="helper mt5 demo-yline">Saved. From this moment the pipeline owns the documentation.</p>}
        <Cursor steps={[{ x: 10, y: 26, at: 300 }, { x: 44, y: 32, at: 1100, click: true }, { x: 32, y: 58, at: 3600 }, { x: 38, y: 74, at: 5100, click: true }]} />
      </div>
    )
  },
  {
    label: 'Merge → update', dur: 6500, sfx: 'click',
    vo: 'A pull request merges. Docify updates the right section of the document it holds — never a duplicate, and never a write to your repository.',
    cues: [{ at: 600, sfx: 'notify' }, { at: 1700, sfx: 'process' }, { at: 3200, sfx: 'pop' }],
    render: (beat) => (
      <div>
        <div className="demo-loop" style={{ paddingBottom: 14 }}>
          <span className="demo-loopbox">PR #214 merged</span>
          <span className="demo-looparrow">→</span>
          {beat >= 4 && <span className="demo-loopbox demo-yline">webhook · 1.2s</span>}
          {beat >= 5 && <span className="demo-looparrow">→</span>}
          {beat >= 6 && <span className="mono demo-yline">docs updated</span>}
        </div>
        {beat >= 8 && (
          <div className="demo-issue" style={{ borderLeftColor: 'var(--support-success)' }}>
            <div className="row row--between" style={{ flexWrap: 'wrap' }}>
              <p className="h01">payments-developer-guide.md → § Authentication</p>
              {beat >= 12 && <span className="tag tag--green demo-yline">93% match</span>}
            </div>
            {beat >= 14 && <p className="helper mt2 demo-yline">Placed into the best-matching section of the existing document. The other 41 pages untouched. Version v7 created. Docify updates the document it holds — it never writes to your repository.</p>}
          </div>
        )}
      </div>
    )
  },
  {
    label: 'Verify & notify', dur: 6000, sfx: 'success',
    vo: 'Validated, gate-checked, published — and your team is notified.',
    cues: [{ at: 400, sfx: 'process' }, { at: 1900, sfx: 'pop' }, { at: 4400, sfx: 'notify' }],
    render: (beat) => (
      <div>
        <Pipe gap={1.4} steps={['Content, links & style validated', 'Quality gate cleared: 92 ≥ 85 ✓', 'Published · team notified ✉']} />
        {beat >= 4 && (
          <div className="demo-loop mt5">
            <span className="mono">merge</span>
            <span className="demo-looparrow">→</span>
            <span className="demo-loopbox">document updated</span>
            <span className="demo-looparrow">→</span>
            {beat >= 8 && <span className="check demo-loopcheck" style={{ animationDelay: '0.05s' }}>92 · gate ✓ · published</span>}
          </div>
        )}
        <Callout x={56} y={72} at={3800} tone="green">no human in the loop — until approval</Callout>
      </div>
    )
  },
  {
    label: 'Up next', dur: 6000, sfx: 'chime',
    vo: 'Your code changes. Your documentation updates automatically. Next — human review.',
    cues: [{ at: 400, sfx: 'pop' }, { at: 3400, sfx: 'whoosh' }],
    render: (beat) => (
      <div>
        <div style={{ padding: '4px 0 10px' }}>
          <span className="jd-verdict">Your code changes. Your documentation updates automatically.</span>
        </div>
        {beat >= 8 && (
          <NextPointer target="film-review" kicker="HUMAN REVIEW"
            title="AI proposes. Your team decides — see the review workflow" />
        )}
      </div>
    )
  }
];

export function AutomationDemo() {
  return <DemoShell name="complete automation" crumb="docgen / automation / on-merge" scenes={AUTO_SCENES}
    posterMeta={{ kicker: 'COMPLETE AUTOMATION', title: 'Your code changes. Your documentation updates automatically.', sub: 'A pull request merges — and verified, published documentation follows. The whole loop in 30 seconds.', mins: '30 sec' }} />;
}

/* =========================================================================
   FILM 03 — AI Readiness (~30s)
   ========================================================================= */
/* The dimensions Docify actually scores (QUALITY_CONFIG in adapters/llm.js).
   Readiness is derived from these — nothing queries an AI platform — so the
   film may only show dimensions the product really computes. */
const DIMS = [
  ['LLM readiness — titles, descriptions, metadata', 42, 90],
  ['Readability', 51, 92],
  ['Completeness', 66, 88]
];

const AICOMPAT_SCENES = [
  {
    label: 'Hook', dur: 4500, sfx: 'whoosh',
    vo: 'Your next reader may be an AI assistant. Is your documentation ready for it?',
    render: () => (
      <TitleSlate kicker="AI READINESS"
        title="Readable by people. Structured for AI."
        sub="Score any document for AI search readiness — a modeled signal, not a ranking promise — see what holds it back, and fix it before you publish." />
    )
  },
  {
    label: 'Analyse', dur: 6000, sfx: 'click',
    // Docify reads the document, not the assistants. Naming ChatGPT/Gemini/
    // Claude/Copilot as things it inspects would be a claim the code cannot make.
    vo: 'Docify scores your documentation for AI search readiness — a modeled signal, computed from the document itself.',
    cues: [{ at: 300, sfx: 'process' }, { at: 2100, sfx: 'pop' }, { at: 3700, sfx: 'pop' }],
    render: () => (
      <div>
        <Pipe gap={1.6} steps={['Reading structure, sections & metadata', 'Modelling retrieval readiness from the document', 'Scoring readiness · listing the recommended fixes']} />
        <p className="helper mt5 demo-late">Nothing is sent to any AI platform. Readiness is modeled from the document’s own quality dimensions — never a guarantee of how a platform will rank or cite it.</p>
      </div>
    )
  },
  {
    label: 'Score & findings', dur: 7000, sfx: 'click',
    vo: 'The AI readiness score shows what holds a document back — its titles, descriptions, metadata, readability, and completeness.',
    cues: [{ at: 600, sfx: 'pop' }, { at: 3400, sfx: 'pop' }, { at: 5100, sfx: 'pop' }],
    render: (beat) => (
      <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
        <div className="score score--warn" style={{ minWidth: 180 }}>
          <span className="label01 t2">AI Search Readiness</span>
          <span className="num"><CountTo from={0} to={62} delay={500} dur={2200} /></span>
          <span className="helper">below the 85 target · modeled signal</span>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          {beat >= 8 && DIMS.map(([n, v], i) => (
            <div key={n} className="demo-mrow demo-mrow--light" style={{ animationDelay: (0.1 + i * 0.85) + 's', gridTemplateColumns: '210px 1fr 44px' }}>
              <span className="demo-mname" style={{ color: 'var(--text-primary)' }}>{n}</span>
              <span className="demo-mbar" style={{ background: 'var(--border-subtle)' }}>
                <span className="demo-mfill" style={{ width: v + '%', animationDelay: (0.45 + i * 0.85) + 's', background: 'var(--support-warning)' }} />
              </span>
              <span className="demo-mpct mono" style={{ color: 'var(--text-primary)' }}>{v}</span>
            </div>
          ))}
        </div>
        <Callout x={62} y={22} at={5000} tone="amber">sample document — largest gap: titles &amp; metadata</Callout>
      </div>
    )
  },
  {
    label: 'Fix & climb', dur: 6500, sfx: 'success',
    vo: 'Apply the recommendations — and in this sample document the modeled score climbs from sixty-two to ninety-one.',
    cues: [{ at: 3000, sfx: 'pop' }, { at: 5200, sfx: 'chime' }],
    render: (beat) => (
      <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
        <div className="score score--good" style={{ minWidth: 180 }}>
          <span className="label01 t2">AI Search Readiness</span>
          <span className="num">{beat >= 7 ? <CountTo from={62} to={91} delay={200} dur={2400} /> : 62}</span>
          {beat >= 10 && <span className="helper demo-yline">▲ +29 in this sample document</span>}
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          {/* the fixes the readiness checks really emit (adapters/llm.js judge) */}
          {[['Add a short description under the title', '+11'], ['Rewrite the title around real queries', '+9'], ['Add metadata keywords', '+7']].map(([f, g], i) => (
            <div key={f} className="demo-issue" style={{ animationDelay: (0.4 + i * 1.2) + 's' }}>
              <div className="row row--between" style={{ flexWrap: 'wrap' }}>
                <p className="h01">{f}</p>
                <span className="tag tag--green">✓ applied {g}</span>
              </div>
            </div>
          ))}
          <p className="helper mt3 demo-late">Illustrative example. The gains are the modeled score recomputed after each fix — not a measured change in any AI platform’s behaviour.</p>
        </div>
        <Cursor steps={[{ x: 52, y: 16, at: 300 }, { x: 87, y: 22, at: 1000, click: true }, { x: 87, y: 50, at: 2400, click: true }, { x: 16, y: 38, at: 4300 }]} />
      </div>
    )
  },
  {
    label: 'Up next', dur: 6000, sfx: 'chime',
    vo: 'Documentation people can understand — and structured for AI to find. Next — documents, versions, and approvals.',
    cues: [{ at: 400, sfx: 'pop' }, { at: 3600, sfx: 'whoosh' }],
    render: (beat) => (
      <div>
        <div style={{ padding: '4px 0 10px' }}>
          <span className="jd-verdict">Documentation people understand — and structured for AI to find.</span>
        </div>
        {beat >= 9 && (
          <NextPointer target="film-docs" kicker="DOCUMENTS & VERSIONS"
            title="Every version, approval, and audit trail — in one lookup" />
        )}
      </div>
    )
  }
];

export function AICompatDemo() {
  return <DemoShell name="AI readiness" crumb="docgen / quality / ai-readiness" scenes={AICOMPAT_SCENES}
    posterMeta={{ kicker: 'AI READINESS', title: 'Readable by people. Structured for AI.', sub: 'The AI Search Readiness Score — a modeled signal — the recommended fixes, and a sample document climbing from 62 to 91. In 30 seconds.', mins: '30 sec' }} />;
}

/* =========================================================================
   FILM 02 — Standard Document Generation (~30s)
   ========================================================================= */
const GEN_SCENES = [
  {
    label: 'Hook', dur: 4500, sfx: 'whoosh',
    vo: 'One workflow, start to finish. Watch complex source content become professional documentation, in minutes.',
    render: () => (
      <TitleSlate kicker="GENERATE ON DEMAND"
        title="Complex source content → professional documentation, in minutes."
        sub="Pick a source, a document, a format — Docify writes it from the source you chose, then scores it against six quality dimensions." />
    )
  },
  {
    label: 'Source & document', dur: 6500, sfx: 'click',
    vo: 'Pick where the truth lives — a repository, tickets, files, or an API spec — and choose your document.',
    cues: [{ at: 2500, sfx: 'pop' }, { at: 5200, sfx: 'pop' }],
    render: (beat) => (
      <div>
        <p className="h01 mb5">Select a source & document type</p>
        <div className={'demo-row demo-pick'}>
          <span className="rdot" />
          <span className="mono" style={{ fontSize: 13 }}>acme/payments-api (GitHub)</span>
          <span className="demo-pickcheck check">✓ selected</span>
        </div>
        <p className="helper mt5 demo-late">Sources combine — code plus Jira plus an OpenAPI spec, in one document.</p>
        {beat >= 13 && (
          <div className="mt5">
            <Chips items={['API reference', 'User guide', 'Install & setup', 'Release notes']} on={0} delayBase={0.05} />
          </div>
        )}
        <Cursor steps={[{ x: 10, y: 26, at: 300 }, { x: 42, y: 31, at: 1000, click: true }, { x: 24, y: 72, at: 5000 }, { x: 13, y: 76, at: 5700, click: true }]} />
      </div>
    )
  },
  {
    label: 'Format & audience', dur: 6000, sfx: 'click',
    vo: 'Choose DITA, Markdown, HTML, PDF, or Word — tuned to your audience and style.',
    cues: [{ at: 700, sfx: 'pop' }, { at: 1600, sfx: 'pop' }, { at: 3900, sfx: 'click' }],
    render: (beat) => (
      <div>
        <p className="h01 mb5">Output & audience</p>
        {beat >= 1 && <Chips items={['DITA', 'Markdown', 'HTML', 'PDF', 'Word']} on={1} delayBase={0.05} />}
        <p className="helper mt5 demo-late">Plus 25 output options — cover, table of contents, watermark — honored in every format.</p>
        {beat >= 10 && (
          <div className="row mt5" style={{ flexWrap: 'wrap', gap: 8 }}>
            {['Audience: developers', 'Style: plain & direct', 'Detail: standard'].map((c, i) => (
              <span key={c} className="demo-chip demo-chipon" style={{ animationDelay: (0.1 + i * 0.5) + 's' }}>{c}</span>
            ))}
          </div>
        )}
      </div>
    )
  },
  {
    label: 'Generate & verify', dur: 7000, sfx: 'success',
    vo: 'Docify writes every section from the real source, previews it, and scores its quality — ninety-four in this example.',
    cues: [{ at: 400, sfx: 'process' }, { at: 1900, sfx: 'type' }, { at: 2600, sfx: 'type' }, { at: 4800, sfx: 'pop' }],
    render: () => (
      <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
        <div className="score score--good" style={{ minWidth: 170 }}>
          <span className="label01 t2">Quality score</span>
          <span className="num"><CountTo from={0} to={94} delay={3400} dur={2200} /></span>
          <span className="helper">six quality dimensions checked</span>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <Pipe gap={1.55} steps={['Collecting source: 214 files · 41 endpoints', 'Drafting every section from the real code', 'Editable preview · quality checks passed']} />
        </div>
      </div>
    )
  },
  {
    label: 'Up next', dur: 6000, sfx: 'chime',
    vo: 'Download, export, or publish. Professional documentation in minutes. Next — automation after every code change.',
    cues: [{ at: 300, sfx: 'pop' }, { at: 700, sfx: 'pop' }, { at: 1100, sfx: 'pop' }, { at: 3600, sfx: 'whoosh' }],
    render: (beat) => (
      <div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, paddingBottom: 12 }}>
          {['payments-api-reference.md', 'payments-api-reference.pdf', 'payments-api-reference.docx'].map((f, i) => (
            <span key={f} className="demo-chip" style={{ animationDelay: (0.1 + i * 0.4) + 's', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>⬇ {f}</span>
          ))}
        </div>
        {beat >= 9 && (
          <NextPointer target="film-automation" kicker="AUTOMATION"
            title="Discover how Docify automates documentation after every code change" />
        )}
      </div>
    )
  }
];

export function GenerateDemo() {
  return <DemoShell name="standard generation" crumb="docgen / generate / new-project" scenes={GEN_SCENES}
    posterMeta={{ kicker: 'GENERATE ON DEMAND', title: 'Complex source content → professional documentation, in minutes.', sub: 'Source, document type, format, audience — then generation, scoring, and export. In 30 seconds.', mins: '30 sec' }} />;
}
