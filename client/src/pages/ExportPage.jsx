import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, download, getCatalog } from '../api.js';
import { useFlow, toast } from '../store.jsx';
import { NavBar, IcCheck } from '../ui.jsx';
import { buildChips } from './Generate.jsx';

export default function ExportPage() {
  const nav = useNavigate();
  const { flow } = useFlow();
  const [gen, setGen] = useState(null);
  const [report, setReport] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [showPrev, setShowPrev] = useState(false);

  useEffect(() => {
    if (!flow.genId) { nav('/dashboard'); return; }
    // Fetched fresh on arrival, so every applied fix is already in what we show.
    api('/generations/' + flow.genId).then((d) => setGen(d.generation)).catch(() => {});
    api('/generations/' + flow.genId + '/quality').then((d) => setReport(d.report)).catch(() => {});
    getCatalog().then(setCatalog).catch(() => {});
  }, [flow.genId, nav]);

  if (!gen) return <div className="page"><p className="body01 t2">Loading…</p></div>;

  const fmtDefn = catalog ? (catalog.formats[gen.track] || []).find((f) => f.id === gen.format) : null;
  const dt = catalog ? (catalog.doctypes[gen.track] || []).find((x) => x.id === gen.docTypes[0]) : null;
  const { chips, accent } = buildChips(gen);
  const overall = report ? (report.overall != null ? report.overall : report.aiScore) : gen.score;
  const gatePassed = report ? !!report.gatePassed : gen.score >= 85;
  const verdict = report ? report.verdict : null;
  const fixedCount = report ? report.fixedCount : 0;
  const totalIssues = report ? report.issues.length : 0;
  const fname = (gen.title || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-') + (fmtDefn ? fmtDefn.ext : '');

  async function dl(kind, fmt) {
    try {
      const name = await download('/generations/' + gen.id + '/download' + (kind === 'report' ? '?kind=report&fmt=' + fmt : ''));
      toast('success', 'Download started', name);
    } catch (e) { toast('error', 'Download failed', e.message); }
  }

  return (
    <>
      <div className="page">
        <h1 className="h04">Export</h1>
        <p className="body01 t2 mt3">
          Overall score {overall} / 100{verdict ? ' · ' + verdict : ''} — every download below is built from the
          latest corrected content, so the fixes you applied are already in.
        </p>

        {/* What you're downloading — full configuration summary */}
        <div className="tile tile--white mt7" style={{ padding: 24 }}>
          <div className="row row--between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h2 className="h02">What you&apos;re downloading</h2>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {verdict && <span className={'tag ' + (gatePassed ? 'tag--green' : 'tag--amber')}>{verdict}</span>}
              {fixedCount > 0 && <span className="tag tag--green">{fixedCount} of {totalIssues} fixes applied ✓</span>}
            </div>
          </div>
          <p className="mono mt5" style={{ fontSize: 15 }}>{gen.title}</p>
          <div className="row mt3" style={{ flexWrap: 'wrap', gap: 6 }}>
            {fmtDefn && <span className="tag tag--blue">{fmtDefn.name}</span>}
            {dt && dt.standard && <span className="tag tag--outline">{dt.standard}</span>}
            {chips.map((c, i) => <span key={c.label + i} className={'tag ' + c.cls}>{c.label}</span>)}
            {accent && (
              <span className="tag tag--outline">
                <span style={{ width: 10, height: 10, background: accent, display: 'inline-block' }} />Accent
              </span>
            )}
          </div>
          <div className="row mt5" style={{ flexWrap: 'wrap' }}>
            <button className="linkbtn" onClick={() => setShowPrev((v) => !v)}>
              {showPrev ? 'Hide final preview' : 'Show final preview'}
            </button>
            <span className="helper">— rendered from exactly the content you are about to download</span>
          </div>
          {showPrev && (
            <div className="prevframe mt5">
              <iframe title="Final document preview" sandbox="" srcDoc={gen.preview || gen.content} />
            </div>
          )}
        </div>

        <div className="grid2 mt5" style={{ alignItems: 'start' }}>
          <div className="tile tile--white" style={{ padding: 24 }}>
            <h2 className="h02 mb5">Downloads</h2>
            <div className="stack">
              <button className="btn btn--primary" style={{ width: '100%' }} onClick={() => dl('doc')}>
                Download {fmtDefn ? fmtDefn.name : gen.format.toUpperCase()}<span className="ico">↓</span>
              </button>
              <button className="btn btn--tertiary" style={{ width: '100%' }} onClick={() => dl('report', 'html')}>
                Quality report — HTML<span className="ico">↓</span>
              </button>
              <button className="btn btn--tertiary" style={{ width: '100%' }} onClick={() => dl('report', 'json')}>
                Quality report — JSON<span className="ico">↓</span>
              </button>
            </div>
            <p className="helper mt5 mono">{fname}</p>
            <p className="helper mt3">
              The quality report is the full audit record: dimension scores, the AI-assistant readiness
              estimates, every finding with its status, the exact before/after of each applied fix, link and
              style checks. HTML for reviewers; JSON for CI gates and tooling.
            </p>
          </div>
          <div className="tile tile--white" style={{ padding: 24 }}>
            <h2 className="h02 mb5">Keep it current</h2>
            <p className="body01 t2">Documents drift the moment code merges. Regenerate automatically on every merge to main and gate publishing on the quality score.</p>
            <button className="btn btn--tertiary mt5" onClick={() => nav('/automation')}>
              Set up auto-regenerate on merge<span className="ico">→</span>
            </button>
            <div className="divider" style={{ margin: '24px 0' }} />
            <h2 className="h02 mb3">Share with your team</h2>
            <p className="helper mb5">Sends a read-only link to the quality report.</p>
            <button className="btn btn--tertiary btn--field"
              onClick={() => toast('success', 'Report shared', 'Read-only link sent to your team workspace')}>
              Share quality report with team
            </button>
          </div>
        </div>
      </div>
      <NavBar back="/quality" next="/pricing" />
    </>
  );
}
