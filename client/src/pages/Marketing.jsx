import React, { useEffect, useState } from 'react';
import { getCatalog } from '../api.js';
import { toast } from '../store.jsx';
import { NavBar, SrcMark } from '../ui.jsx';

export function Features() {
  const blocks = [
    { tag: 'SOURCE', title: 'Connect once, read forever', body: 'OAuth to GitHub, GitLab, or Bitbucket at signup — the same grant powers generation. Jira connects with an API token for changelog and release-note pipelines. Access is read-only: repository contents and commit history, nothing more, and your source code is never stored.' },
    { tag: 'GENERATE', title: 'From repo to draft in minutes', body: 'DocGen parses repo structure, extracts code comments and OpenAPI-style annotations, and drafts topic-based sections. Choose technical documentation — API references, user guides, installation guides — or marketing material like release announcements and feature one-pagers. Output in DITA, PDF, Word, or Markdown.' },
    { tag: 'VERIFY', title: 'A quality gate, not a spellcheck', body: 'Every generation runs through link verification, style-guide compliance derived from IBM Style conventions, and an LLM-judge AI-consumability review: short descriptions, search-optimized titles, metadata keywords, unambiguous references, and example coverage. Each finding ships with a concrete one-click fix.' },
    { tag: 'AUTOMATE', title: 'Docs that never go stale', body: 'A GitHub Actions snippet regenerates documentation on every merge to main and blocks publishing when the quality score drops below your gate. Writers review diffs instead of rewriting pages.' }
  ];
  return (
    <>
      <div className="page">
        <h1 className="h04">Features</h1>
        <p className="body01 t2 mt3" style={{ maxWidth: 640 }}>Every stage of the pipeline, in the order your team will use it.</p>
        <div className="stack mt7">
          {blocks.map((b) => (
            <div key={b.tag} className="tile tile--white" style={{ padding: 24 }}>
              <p className="label01 mono t2">{b.tag}</p>
              <h2 className="h03 mt3">{b.title}</h2>
              <p className="body01 t2 mt3" style={{ maxWidth: 720 }}>{b.body}</p>
            </div>
          ))}
        </div>
      </div>
      <NavBar back="/" next="/signup" nextLabel="Start free" />
    </>
  );
}

export function Integrations() {
  const [catalog, setCatalog] = useState(null);
  useEffect(() => { getCatalog().then(setCatalog); }, []);
  const srcs = ['GitHub', 'GitLab', 'Bitbucket', 'Jira'];
  const fmts = ['DITA', 'PDF', 'Word', 'Markdown'];
  const soon = catalog ? catalog.sources.filter((s) => !s.avail) : [];
  return (
    <>
      <div className="page">
        <h1 className="h04">Integrations</h1>
        <p className="body01 t2 mt3">Every supported source works with every supported format. No partial matrices, no asterisks.</p>
        <table className="matrix mt7">
          <thead>
            <tr><th>SOURCE</th>{fmts.map((f) => <th key={f}>{f}</th>)}</tr>
          </thead>
          <tbody>
            {srcs.map((s) => (
              <tr key={s}><td>{s}</td>{fmts.map((f) => <td key={f}><span className="check">✓</span></td>)}</tr>
            ))}
          </tbody>
        </table>
        <h2 className="h02 mt9 mb3">Coming soon</h2>
        <p className="helper mb5">Join a waitlist from the source-selection screen — it directly shapes our roadmap order.</p>
        <div className="grid4">
          {soon.map((s) => (
            <div key={s.id} className="tile">
              <div className="row row--between"><SrcMark id={s.id} /><span className="tag tag--gray">Coming soon</span></div>
              <p className="h01 mt5">{s.name}</p>
              <p className="helper mt2">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
      <NavBar back="/" next="/signup" nextLabel="Start free" />
    </>
  );
}

export function Customers() {
  const quotes = [
    { q: 'We regenerate the API reference on every merge now. What used to be a 3-day post-release scramble is a 4-minute pipeline step, and the quality gate catches broken links before customers do.', n: 'Head of Documentation', c: 'Series C fintech, 40-person eng team', s: '11 hours saved per release' },
    { q: 'The AI-consumability check was the surprise. Our docs now answer correctly inside our customers’ AI assistants because every section is self-contained and titled for real queries.', n: 'Platform Engineering Lead', c: 'Developer tools company', s: 'AI-readiness 71 to 96 in one sprint' },
    { q: 'Two writers support nine product teams. DocGen drafts, we edit. The style-guide findings alone replaced our entire manual review checklist.', n: 'Technical Writing Manager', c: 'Enterprise SaaS, 300 employees', s: '2.3 hours saved per document' }
  ];
  return (
    <>
      <div className="page">
        <h1 className="h04">Customer proof</h1>
        <p className="body01 t2 mt3">Measured in hours returned to writing teams.</p>
        <div className="grid3 mt7" style={{ alignItems: 'stretch' }}>
          {quotes.map((x) => (
            <div key={x.s} className="tile tile--white" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
              <span className="tag tag--teal">{x.s}</span>
              <p className="body01 mt5" style={{ flex: 1 }}>&ldquo;{x.q}&rdquo;</p>
              <p className="h01 mt6">{x.n}</p>
              <p className="helper mt2">{x.c}</p>
            </div>
          ))}
        </div>
      </div>
      <NavBar back="/" next="/signup" nextLabel="Start free" />
    </>
  );
}

export function Docs() {
  const cats = [
    { t: 'Getting started', items: ['Connect your first source', 'Generate an API reference', 'Read a quality report'] },
    { t: 'Quality pipeline', items: ['How the LLM judge scores AI readiness', 'Style profiles and custom rules', 'Link verification behavior'] },
    { t: 'Automation', items: ['GitHub Actions setup', 'Quality gates in CI', 'Webhook events'] },
    { t: 'Account & billing', items: ['Roles and permissions', 'Plans and invoicing', 'SSO configuration (Enterprise)'] }
  ];
  return (
    <>
      <div className="page">
        <h1 className="h04">Docs &amp; help center</h1>
        <div className="field mt7" style={{ maxWidth: 480 }}>
          <label htmlFor="docSearch">Search</label>
          <input id="docSearch" className="input" placeholder="Search guides, e.g. quality gate" />
        </div>
        <div className="grid4 mt6">
          {cats.map((c) => (
            <div key={c.t} className="tile">
              <p className="h01 mb3">{c.t}</p>
              {c.items.map((it) => (
                <p key={it} className="body01 mt3">
                  <a onClick={() => toast('info', 'Demo build', 'Article stubs are not included in this build')}>{it}</a>
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>
      <NavBar back="/" />
    </>
  );
}
