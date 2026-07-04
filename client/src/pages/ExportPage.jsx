import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, download } from '../api.js';
import { useFlow, toast } from '../store.jsx';
import { NavBar } from '../ui.jsx';

export default function ExportPage() {
  const nav = useNavigate();
  const { flow } = useFlow();
  const [gen, setGen] = useState(null);

  useEffect(() => {
    if (!flow.genId) { nav('/dashboard'); return; }
    api('/generations/' + flow.genId).then((d) => setGen(d.generation)).catch(() => {});
  }, [flow.genId, nav]);

  if (!gen) return <div className="page"><p className="body01 t2">Loading…</p></div>;

  async function dl(kind) {
    try {
      const name = await download('/generations/' + gen.id + '/download' + (kind === 'report' ? '?kind=report' : ''));
      toast('success', 'Download started', name);
    } catch (e) { toast('error', 'Download failed', e.message); }
  }

  return (
    <>
      <div className="page">
        <h1 className="h04">Export</h1>
        <p className="body01 t2 mt3">Quality gate passed at {gen.score} / 100 AI-readiness. Download your output or wire it into CI so it never goes stale.</p>
        <div className="grid2 mt7" style={{ alignItems: 'start' }}>
          <div className="tile tile--white" style={{ padding: 24 }}>
            <h2 className="h02 mb5">Downloads</h2>
            <div className="stack">
              <button className="btn btn--primary" style={{ width: '100%' }} onClick={() => dl('doc')}>
                Download {gen.format.toUpperCase()}<span className="ico">↓</span>
              </button>
              <button className="btn btn--tertiary" style={{ width: '100%' }} onClick={() => dl('report')}>
                Download quality report<span className="ico">↓</span>
              </button>
            </div>
            <p className="helper mt5 mono">{gen.title} · generated today</p>
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
