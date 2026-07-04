import React from 'react';
import { useNavigate } from 'react-router-dom';
import { NavBar } from '../ui.jsx';

/* ---------- Illustrations (geometric, enterprise design language) ---------- */

function HeroVisual() {
  return (
    <svg className="illus herovis" viewBox="0 0 480 360" fill="none" aria-hidden="true">
      {/* pipeline rail */}
      <line x1="40" y1="60" x2="40" y2="300" stroke="#393939" strokeWidth="2" />
      <circle className="pulse" cx="40" cy="70" r="7" fill="#0f62fe" />
      <circle className="pulse pd2" cx="40" cy="180" r="7" fill="#4589ff" />
      <circle className="pulse pd3" cx="40" cy="290" r="7" fill="#42be65" />
      <line x1="47" y1="70" x2="96" y2="70" stroke="#393939" strokeWidth="2" />
      <line x1="47" y1="180" x2="96" y2="180" stroke="#393939" strokeWidth="2" />
      <line x1="47" y1="290" x2="96" y2="290" stroke="#393939" strokeWidth="2" />
      {/* source card */}
      <rect x="96" y="42" width="150" height="56" fill="#262626" stroke="#393939" strokeWidth="1.5" />
      <rect x="112" y="58" width="16" height="16" fill="#0f62fe" />
      <rect x="138" y="58" width="92" height="6" fill="#525252" />
      <rect x="138" y="72" width="60" height="6" fill="#393939" />
      {/* document */}
      <rect x="96" y="122" width="230" height="180" fill="#1f1f1f" stroke="#393939" strokeWidth="1.5" />
      <rect x="118" y="146" width="120" height="10" fill="#f4f4f4" />
      <rect x="118" y="168" width="186" height="5" fill="#525252" />
      <rect x="118" y="180" width="160" height="5" fill="#525252" />
      <rect x="118" y="200" width="70" height="7" fill="#4589ff" />
      <rect x="118" y="214" width="186" height="5" fill="#393939" />
      <rect x="118" y="226" width="150" height="5" fill="#393939" />
      <rect x="118" y="246" width="70" height="7" fill="#4589ff" />
      <rect x="118" y="260" width="170" height="5" fill="#393939" />
      <rect x="118" y="272" width="130" height="5" fill="#393939" />
      {/* score chip */}
      <g className="floaty">
        <rect x="296" y="106" width="128" height="64" fill="#161616" stroke="#42be65" strokeWidth="2" />
        <text x="312" y="134" fill="#42be65" fontFamily="IBM Plex Mono, monospace" fontSize="22">98/100</text>
        <text x="312" y="154" fill="#8d8d8d" fontFamily="IBM Plex Sans, sans-serif" fontSize="11">quality gate passed</text>
      </g>
      {/* check shield */}
      <path d="M392 210l28 12v26c0 20-12 32-28 40-16-8-28-20-28-40v-26l28-12z" fill="#161616" stroke="#0f62fe" strokeWidth="2" />
      <path className="drawcheck" d="M380 244l9 9 17-17" stroke="#42be65" strokeWidth="3" fill="none" />
      {/* format chips */}
      <rect x="344" y="300" width="44" height="20" fill="#262626" stroke="#393939" />
      <text x="352" y="314" fill="#c6c6c6" fontFamily="IBM Plex Mono, monospace" fontSize="10">DITA</text>
      <rect x="394" y="300" width="36" height="20" fill="#262626" stroke="#393939" />
      <text x="402" y="314" fill="#c6c6c6" fontFamily="IBM Plex Mono, monospace" fontSize="10">PDF</text>
      <rect x="436" y="300" width="32" height="20" fill="#262626" stroke="#393939" />
      <text x="443" y="314" fill="#c6c6c6" fontFamily="IBM Plex Mono, monospace" fontSize="10">MD</text>
    </svg>
  );
}

function IlluSource() {
  return (
    <svg className="illus" viewBox="0 0 400 260" fill="none" aria-hidden="true">
      <rect x="24" y="32" width="168" height="64" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1.5" />
      <rect x="40" y="50" width="20" height="20" fill="#0f62fe" />
      <rect x="70" y="50" width="100" height="7" fill="#c6c6c6" />
      <rect x="70" y="66" width="70" height="7" fill="#e0e0e0" />
      <rect x="24" y="112" width="168" height="64" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1.5" />
      <rect x="40" y="130" width="20" height="20" fill="#4589ff" />
      <rect x="70" y="130" width="100" height="7" fill="#c6c6c6" />
      <rect x="70" y="146" width="84" height="7" fill="#e0e0e0" />
      <rect x="24" y="192" width="168" height="48" fill="#f4f4f4" />
      <rect x="40" y="208" width="120" height="7" fill="#c6c6c6" />
      {/* connection */}
      <path d="M192 104 h56 v40 h48" stroke="#0f62fe" strokeWidth="2" strokeDasharray="6 4" />
      <circle cx="296" cy="144" r="5" fill="#0f62fe" />
      {/* lock = read only */}
      <rect x="288" y="60" width="88" height="64" fill="#ffffff" stroke="#0f62fe" strokeWidth="2" />
      <rect x="316" y="84" width="32" height="26" fill="#edf5ff" stroke="#0f62fe" strokeWidth="2" />
      <path d="M322 84v-8a10 10 0 0 1 20 0v8" stroke="#0f62fe" strokeWidth="2" fill="none" />
      <text x="296" y="146" fill="#525252" fontFamily="IBM Plex Mono, monospace" fontSize="10" />
      <text x="288" y="150" fill="#525252" fontFamily="IBM Plex Mono, monospace" fontSize="11">read-only</text>
      <rect x="288" y="168" width="88" height="40" fill="#f4f4f4" />
      <rect x="300" y="182" width="64" height="6" fill="#c6c6c6" />
      <rect x="300" y="194" width="44" height="6" fill="#e0e0e0" />
    </svg>
  );
}

function IlluGenerate() {
  return (
    <svg className="illus" viewBox="0 0 400 260" fill="none" aria-hidden="true">
      {/* code panel */}
      <rect x="24" y="40" width="150" height="180" fill="#262626" />
      <rect x="40" y="60" width="60" height="6" fill="#3ddbd9" />
      <rect x="40" y="76" width="100" height="6" fill="#525252" />
      <rect x="52" y="92" width="88" height="6" fill="#525252" />
      <rect x="52" y="108" width="64" height="6" fill="#be95ff" />
      <rect x="40" y="124" width="90" height="6" fill="#525252" />
      <rect x="40" y="152" width="72" height="6" fill="#3ddbd9" />
      <rect x="52" y="168" width="96" height="6" fill="#525252" />
      <rect x="40" y="184" width="80" height="6" fill="#525252" />
      {/* transform arrow */}
      <path d="M174 130h44m0 0-10-10m10 10-10 10" stroke="#0f62fe" strokeWidth="2.5" />
      {/* document out */}
      <rect x="230" y="36" width="146" height="188" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1.5" />
      <rect x="248" y="56" width="84" height="10" fill="#161616" />
      <rect x="248" y="78" width="110" height="5" fill="#c6c6c6" />
      <rect x="248" y="89" width="94" height="5" fill="#c6c6c6" />
      <rect x="248" y="108" width="48" height="7" fill="#0f62fe" />
      <rect x="248" y="122" width="110" height="5" fill="#e0e0e0" />
      <rect x="248" y="133" width="102" height="5" fill="#e0e0e0" />
      <rect x="248" y="152" width="48" height="7" fill="#0f62fe" />
      <rect x="248" y="166" width="106" height="5" fill="#e0e0e0" />
      <rect x="248" y="177" width="88" height="5" fill="#e0e0e0" />
      <rect x="248" y="196" width="110" height="16" fill="#f4f4f4" />
      <rect x="256" y="201" width="64" height="6" fill="#8d8d8d" />
    </svg>
  );
}

function IlluVerify() {
  return (
    <svg className="illus" viewBox="0 0 400 260" fill="none" aria-hidden="true">
      {/* report card */}
      <rect x="24" y="32" width="220" height="196" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1.5" />
      <rect x="24" y="32" width="220" height="36" fill="#f4f4f4" />
      <rect x="40" y="46" width="96" height="8" fill="#161616" />
      <rect x="40" y="88" width="150" height="6" fill="#c6c6c6" />
      <rect x="40" y="104" width="170" height="6" fill="#defbe6" stroke="#24a148" strokeWidth="1" />
      <rect x="40" y="120" width="130" height="6" fill="#c6c6c6" />
      <rect x="40" y="136" width="160" height="6" fill="#fdf0c0" stroke="#f1c21b" strokeWidth="1" />
      <rect x="40" y="152" width="145" height="6" fill="#c6c6c6" />
      <rect x="40" y="168" width="170" height="6" fill="#d0e2ff" stroke="#0043ce" strokeWidth="1" />
      <rect x="40" y="184" width="120" height="6" fill="#c6c6c6" />
      <rect x="40" y="200" width="150" height="6" fill="#c6c6c6" />
      {/* gauge */}
      <circle cx="322" cy="106" r="54" stroke="#e0e0e0" strokeWidth="10" fill="none" />
      <path d="M322 52a54 54 0 0 1 51 71" stroke="#24a148" strokeWidth="10" fill="none" />
      <text x="300" y="112" fill="#161616" fontFamily="IBM Plex Mono, monospace" fontSize="20">96</text>
      <text x="292" y="130" fill="#525252" fontFamily="IBM Plex Sans, sans-serif" fontSize="10">AI-ready</text>
      {/* fix chip */}
      <rect x="270" y="180" width="104" height="32" fill="#0f62fe" />
      <text x="284" y="200" fill="#ffffff" fontFamily="IBM Plex Sans, sans-serif" fontSize="12">Apply fix</text>
    </svg>
  );
}

function IlluAutomate() {
  return (
    <svg className="illus" viewBox="0 0 400 260" fill="none" aria-hidden="true">
      {/* merge node */}
      <circle cx="60" cy="70" r="10" fill="#0f62fe" />
      <circle cx="60" cy="190" r="10" fill="#8d8d8d" />
      <path d="M60 80v40a40 40 0 0 0 40 40h20" stroke="#8d8d8d" strokeWidth="2.5" fill="none" />
      <path d="M60 180v-20" stroke="#8d8d8d" strokeWidth="2.5" />
      <text x="82" y="66" fill="#525252" fontFamily="IBM Plex Mono, monospace" fontSize="11">merge → main</text>
      {/* pipeline box */}
      <rect x="130" y="140" width="120" height="44" fill="#161616" />
      <text x="146" y="166" fill="#ffffff" fontFamily="IBM Plex Mono, monospace" fontSize="11">docgen run</text>
      <path d="M250 162h44" stroke="#0f62fe" strokeWidth="2.5" />
      {/* gate */}
      <rect x="294" y="134" width="82" height="56" fill="#ffffff" stroke="#24a148" strokeWidth="2" />
      <path d="M312 162l10 10 20-20" stroke="#24a148" strokeWidth="3" fill="none" />
      <text x="300" y="206" fill="#525252" fontFamily="IBM Plex Mono, monospace" fontSize="10">gate ≥ 85</text>
      {/* loop back */}
      <path d="M335 134V96a26 26 0 0 0-26-26H92" stroke="#c6c6c6" strokeWidth="2" strokeDasharray="6 4" fill="none" />
      <path d="M100 62l-10 8 10 8" stroke="#c6c6c6" strokeWidth="2" fill="none" />
    </svg>
  );
}

/* ---------- Page ---------- */

const FEATURES = [
  {
    eyebrow: '01 · SOURCE', title: 'Connect once, read forever',
    body: 'Authorize GitHub, GitLab, or Bitbucket at signup — the same grant powers generation. Jira connects with an API token for changelog and release-note pipelines. Access is read-only: repository contents and commit history, nothing more. Your source code is never stored.',
    illu: <IlluSource />
  },
  {
    eyebrow: '02 · GENERATE', title: 'From repo to draft in minutes',
    body: 'DocGen parses repo structure, extracts code comments and API annotations, and drafts topic-based sections. Choose technical documentation — API references, user guides, installation guides — or marketing material like release announcements. Output in DITA, PDF, Word, or Markdown.',
    illu: <IlluGenerate />
  },
  {
    eyebrow: '03 · VERIFY', title: 'A quality gate, not a spellcheck',
    body: 'Every generation runs through link verification, style-guide compliance, and an LLM-judge AI-consumability review: short descriptions, search-optimized titles, metadata keywords, unambiguous references, and example coverage. Each finding ships with a concrete one-click fix.',
    illu: <IlluVerify />
  },
  {
    eyebrow: '04 · AUTOMATE', title: 'Docs that never go stale',
    body: 'A CI snippet regenerates documentation on every merge to main and blocks publishing when the quality score drops below your gate. Writers review diffs instead of rewriting pages.',
    illu: <IlluAutomate />
  }
];

const QUOTES = [
  { q: 'We regenerate the API reference on every merge now. What used to be a 3-day post-release scramble is a 4-minute pipeline step, and the quality gate catches broken links before customers do.', n: 'Head of Documentation', c: 'Series C fintech, 40-person eng team', s: '11 hours saved per release' },
  { q: 'The AI-consumability check was the surprise. Our docs now answer correctly inside our customers’ AI assistants because every section is self-contained and titled for real queries.', n: 'Platform Engineering Lead', c: 'Developer tools company', s: 'AI-readiness 71 to 96 in one sprint' },
  { q: 'Two writers support nine product teams. DocGen drafts, we edit. The style-guide findings alone replaced our entire manual review checklist.', n: 'Technical Writing Manager', c: 'Enterprise SaaS, 300 employees', s: '2.3 hours saved per document' }
];

const SRCS = ['GitHub', 'GitLab', 'Bitbucket', 'Jira'];
const FMTS = ['DITA', 'PDF', 'Word', 'Markdown'];

export default function Landing() {
  const nav = useNavigate();
  return (
    <>
      {/* Hero */}
      <section className="heroband">
        <div className="gridlines" />
        <div className="heroinner">
          <div>
            <p className="eyebrow mb3">DOCUMENTATION AUTOMATION FOR SOFTWARE TEAMS</p>
            <h1 className="display">Release-ready documentation, engineered from your codebase.</h1>
            <p className="lead t2 mt5" style={{ maxWidth: 560 }}>
              DocGen generates API references, user guides, and release content directly from your
              repositories — then verifies every output for broken links, style compliance, and AI
              consumability before it ships.
            </p>
            <div className="row mt7" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn--primary" onClick={() => nav('/signup')}>Start free<span className="ico">→</span></button>
              <button className="btn btn--ghostdark" onClick={() => nav('/pricing')}>View pricing</button>
            </div>
            <p className="helper mt6" style={{ color: '#8d8d8d' }}>
              Read-only access · your source code is never stored · no credit card required
            </p>
          </div>
          <HeroVisual />
        </div>
      </section>

      {/* Logos strip */}
      <div className="page" style={{ paddingBottom: 0, paddingTop: 32 }}>
        <div className="row row--between" style={{ flexWrap: 'wrap', gap: 16 }}>
          <p className="label01 t2">WORKS WITH</p>
          <div className="logorow">
            {SRCS.map((s) => <span key={s}>{s}</span>)}
            <span>·</span>
            {FMTS.map((f) => <span key={f}>{f}</span>)}
          </div>
        </div>
        <div className="divider" style={{ marginBottom: 0 }} />
      </div>

      {/* Feature rows */}
      <div className="page" style={{ paddingTop: 16, paddingBottom: 24 }}>
        {FEATURES.map((f, i) => (
          <div key={f.eyebrow} className="featrow">
            {i % 2 === 0 ? <div className="illuwrap">{f.illu}</div> : null}
            <div>
              <p className="eyebrow eyebrow--blue mb3">{f.eyebrow}</p>
              <h2 className="feathead">{f.title}</h2>
              <p className="lead t2 mt5" style={{ maxWidth: 480 }}>{f.body}</p>
            </div>
            {i % 2 === 1 ? <div className="illuwrap">{f.illu}</div> : null}
          </div>
        ))}
      </div>

      {/* Metrics band */}
      <section className="metricband">
        <div className="page" style={{ padding: '0 24px' }}>
          <div className="grid3">
            <div><p className="metricnum">2.1 hrs</p><p className="body01 t2 mt3">Average writer time saved per generated document, measured across pilot teams.</p></div>
            <div><p className="metricnum">94%</p><p className="body01 t2 mt3">Of generated documents pass style-guide review on first run after applying suggested fixes.</p></div>
            <div><p className="metricnum">0</p><p className="body01 t2 mt3">Broken links shipped by teams using the quality gate in CI. The pipeline blocks them.</p></div>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <div className="page" style={{ paddingBottom: 24 }}>
        <h2 className="feathead">Every source, every format</h2>
        <p className="lead t2 mt3">No partial matrices, no asterisks. Supported means fully supported.</p>
        <table className="matrix mt6">
          <thead>
            <tr><th>SOURCE</th>{FMTS.map((f) => <th key={f}>{f}</th>)}</tr>
          </thead>
          <tbody>
            {SRCS.map((s) => (
              <tr key={s}><td>{s}</td>{FMTS.map((f) => <td key={f}><span className="check">✓</span></td>)}</tr>
            ))}
          </tbody>
        </table>
        <div className="row mt5" style={{ flexWrap: 'wrap' }}>
          <span className="helper">Coming soon:</span>
          <div className="soonchips">
            {['OpenAPI / Swagger', 'Confluence', 'Notion', 'Azure DevOps'].map((s) => (
              <span key={s} className="tag tag--gray">{s}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Testimonials */}
      <div className="page" style={{ paddingTop: 8, paddingBottom: 24 }}>
        <h2 className="feathead mb6">Measured in hours returned to writing teams</h2>
        <div className="grid3" style={{ alignItems: 'stretch' }}>
          {QUOTES.map((x) => (
            <div key={x.s} className="tile tile--white" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
              <span className="tag tag--teal">{x.s}</span>
              <p className="body01 mt5" style={{ flex: 1 }}>&ldquo;{x.q}&rdquo;</p>
              <p className="h01 mt6">{x.n}</p>
              <p className="helper mt2">{x.c}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Final CTA */}
      <section className="ctaband">
        <div style={{ maxWidth: 1056, margin: '0 auto', padding: '0 24px' }}>
          <h2 className="h04" style={{ color: '#fff', maxWidth: 560 }}>Your next release ships with its documentation already done.</h2>
          <div className="row mt6">
            <button className="btn btn--primary" onClick={() => nav('/signup')}>Start free<span className="ico">→</span></button>
            <button className="btn btn--ghostdark" onClick={() => nav('/docs')}>Read the docs</button>
          </div>
        </div>
      </section>
      <div style={{ height: 80 }} />

      <NavBar next="/signup" nextLabel="Start free" note="No credit card required" />
    </>
  );
}
