import React from 'react';
import { useNavigate } from 'react-router-dom';
import { NavBar } from '../ui.jsx';

export default function Landing() {
  const nav = useNavigate();
  return (
    <>
      <div className="page">
        <div className="hero">
          <p className="label01 t2 mono mb3">DOCUMENTATION AUTOMATION FOR SOFTWARE TEAMS</p>
          <h1 className="h06" style={{ maxWidth: 760 }}>Docs that update themselves, and pass quality review before you do.</h1>
          <p className="body02 t2 mt5" style={{ maxWidth: 640 }}>
            DocGen generates API references, user guides, and release content directly from your repositories
            and issue trackers — then verifies every output for broken links, style compliance, and AI
            consumability before it ships.
          </p>
          <div className="row mt7">
            <button className="btn btn--primary" onClick={() => nav('/signup')}>Start free<span className="ico">→</span></button>
            <button className="btn btn--tertiary" onClick={() => nav('/features')}>See how it works</button>
          </div>
        </div>

        <div className="divider" />
        <h2 className="h03 mb6">Three steps. No manual formatting.</h2>
        <div className="threestep">
          <div className="tile">
            <p className="label01 mono t2">01 · SOURCE</p>
            <p className="h02 mt3">Connect a source</p>
            <p className="body01 t2 mt3">GitHub, GitLab, Bitbucket, or Jira. Read-only access to contents and commit history — we never store your source code.</p>
          </div>
          <div className="arrow">→</div>
          <div className="tile">
            <p className="label01 mono t2">02 · GENERATE</p>
            <p className="h02 mt3">Generate the document</p>
            <p className="body01 t2 mt3">Pick a document type and output format — DITA, PDF, Word, Markdown. Drafted from code, comments, and commits in under 3 minutes.</p>
          </div>
          <div className="arrow">→</div>
          <div className="tile">
            <p className="label01 mono t2">03 · VERIFY</p>
            <p className="h02 mt3">Pass quality review</p>
            <p className="body01 t2 mt3">Broken links, style-guide compliance, and an LLM-judge AI-readiness score — with one-click fixes before you publish.</p>
          </div>
        </div>

        <div className="divider" />
        <p className="label01 t2 mb5">SOURCES AND FORMATS</p>
        <div className="logorow">
          <span>GitHub</span><span>GitLab</span><span>Bitbucket</span><span>Jira</span>
          <span>·</span>
          <span>DITA</span><span>PDF</span><span>Word</span><span>Markdown</span>
        </div>

        <div className="divider" />
        <div className="grid3">
          <div className="tile--white tile"><p className="h04 mono">2.1 hrs</p><p className="body01 t2 mt3">Average writer time saved per generated document, measured across pilot teams.</p></div>
          <div className="tile--white tile"><p className="h04 mono">94%</p><p className="body01 t2 mt3">Of generated documents pass style-guide review on first run after applying suggested fixes.</p></div>
          <div className="tile--white tile"><p className="h04 mono">0</p><p className="body01 t2 mt3">Broken links shipped by teams using the quality gate in CI. The pipeline blocks them.</p></div>
        </div>
      </div>
      <NavBar next="/signup" nextLabel="Start free" note="No credit card required" />
    </>
  );
}
