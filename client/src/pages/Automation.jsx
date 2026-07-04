import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { toast } from '../store.jsx';
import { NavBar } from '../ui.jsx';

export default function Automation() {
  const [auto, setAuto] = useState(null);
  const [snippet, setSnippet] = useState('');

  useEffect(() => {
    api('/automation').then((d) => { setAuto(d.automation); setSnippet(d.snippet); }).catch(() => {});
  }, []);

  if (!auto) return <div className="page"><p className="body01 t2">Loading…</p></div>;

  async function save(patch) {
    try {
      const d = await api('/automation', { method: 'PUT', body: patch });
      setAuto(d.automation);
      if (typeof patch.enabled === 'boolean') {
        toast(patch.enabled ? 'success' : 'info',
          'Auto-regenerate ' + (patch.enabled ? 'enabled' : 'disabled'),
          patch.enabled ? 'Docs regenerate on every merge to ' + d.automation.branch : 'Manual generation only');
      }
    } catch (e) { toast('error', 'Could not save', e.message); }
  }

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      toast('success', 'Snippet copied', 'Paste into .github/workflows/docgen.yml');
    } catch {
      toast('error', 'Copy failed', 'Clipboard unavailable — select the text manually');
    }
  }

  return (
    <>
      <div className="page">
        <h1 className="h04">Automation</h1>
        <p className="body01 t2 mt3">Regenerate documentation on every merge, and block publishing when the quality score drops below your gate.</p>
        <div className="grid2 mt7" style={{ alignItems: 'start' }}>
          <div className="tile tile--white" style={{ padding: 24 }}>
            <h2 className="h02 mb5">Trigger</h2>
            <div className={'toggle' + (auto.enabled ? ' on' : '')} onClick={() => save({ enabled: !auto.enabled })}>
              <span className="track" />
              <span className="body01">Auto-regenerate on merge to main</span>
            </div>
            <div className="field mt6">
              <label htmlFor="brSel">Watch branch</label>
              <select id="brSel" className="select" value={auto.branch} onChange={(e) => save({ branch: e.target.value })}>
                <option value="main">main</option>
                <option value="develop">develop</option>
                <option value="release/*">release/*</option>
              </select>
            </div>
            <p className="helper">Quality gate: {auto.gate} — publishing is blocked below this score.</p>
          </div>

          <div className="tile tile--white" style={{ padding: 24 }}>
            <div className="row row--between mb5">
              <h2 className="h02">CI snippet · GitHub Actions</h2>
              <button className="btn btn--tertiary btn--sm" onClick={copySnippet}>Copy snippet</button>
            </div>
            <div className="codeblock" style={{ fontSize: 11.5 }}>{snippet}</div>
            <p className="helper mt3">Add <span className="mono">DOCGEN_API_KEY</span> to your repository secrets first.</p>
          </div>
        </div>
      </div>
      <NavBar back="/dashboard" next="/settings" />
    </>
  );
}
