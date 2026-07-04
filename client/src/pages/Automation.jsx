import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFlow, toast } from '../store.jsx';
import { NavBar, ScoreTag } from '../ui.jsx';

const TRIGGER_LABEL = { webhook: 'Merge (webhook)', simulate: 'Simulated merge', manual: 'Manual run' };

export default function Automation() {
  const nav = useNavigate();
  const { setFlow } = useFlow();
  const [data, setData] = useState(null);
  const [branchInfo, setBranchInfo] = useState(null); // real branches from the code host
  const [customBr, setCustomBr] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [running, setRunning] = useState(false);
  const pollRef = useRef(null);

  async function load() {
    const d = await api('/automation');
    setData(d);
    return d;
  }
  useEffect(() => {
    load().catch(() => {});
    api('/automation/branches').then(setBranchInfo).catch(() => {});
    return () => clearTimeout(pollRef.current);
  }, []);

  // While any run is in flight, poll until it settles so the score appears live.
  useEffect(() => {
    if (!data) return undefined;
    const active = (data.automation.runs || []).some((r) => r.status === 'running');
    if (!active) { setRunning(false); return undefined; }
    pollRef.current = setTimeout(() => { load().catch(() => {}); }, 1500);
    return () => clearTimeout(pollRef.current);
  }, [data]);

  if (!data) return <div className="page"><p className="body01 t2">Loading…</p></div>;
  const auto = data.automation;
  const runs = auto.runs || [];
  const origin = window.location.origin.replace(':5173', ':4000');
  const hookUrl = origin + data.webhookUrl;

  async function save(patch, msg) {
    try {
      const d = await api('/automation', { method: 'PUT', body: patch });
      setData((cur) => ({ ...cur, automation: d.automation, snippet: d.snippet }));
      if (msg) toast('success', msg[0], msg[1]);
      if (typeof patch.enabled === 'boolean') {
        toast(patch.enabled ? 'success' : 'info',
          'Auto-regenerate ' + (patch.enabled ? 'enabled' : 'disabled'),
          patch.enabled ? 'Docs regenerate on every merge to ' + d.automation.branch : 'Manual generation only');
      }
    } catch (e) { toast('error', 'Could not save', e.message); }
  }

  async function copy(text, what) {
    try { await navigator.clipboard.writeText(text); toast('success', 'Copied', what); }
    catch { toast('error', 'Copy failed', 'Clipboard unavailable — select the text manually'); }
  }

  async function rotate() {
    try {
      const d = await api('/automation/rotate-secret', { method: 'POST' });
      setData((cur) => ({ ...cur, automation: d.automation }));
      setShowSecret(true);
      toast('success', 'Secret rotated', 'Update the secret in your repository webhook settings');
    } catch (e) { toast('error', 'Rotation failed', e.message); }
  }

  async function simulate() {
    if (running) return;
    setRunning(true);
    try {
      const d = await api('/automation/run', { method: 'POST', body: { trigger: 'simulate' } });
      if (d.run.status === 'skipped') {
        toast('info', 'Nothing to regenerate', 'Generate a document once — automation reuses your latest configuration as the template.');
        setRunning(false);
      } else {
        toast('success', 'Merge simulated', 'Pipeline running — watch the run appear below');
      }
      await load();
    } catch (e) { setRunning(false); toast('error', 'Could not start run', e.message); }
  }

  function openReport(genId) {
    setFlow({ genId });
    nav('/quality');
  }

  return (
    <>
      <div className="page">
        <h1 className="h04">Auto-regenerate on merge</h1>
        <p className="body01 t2 mt3" style={{ maxWidth: 720 }}>
          Every merge to your watched branch regenerates the documentation from your latest
          configuration, re-runs the AI judge, and enforces the quality gate — publishing is
          blocked when the score drops below it.
        </p>

        <div className="grid2 mt7" style={{ alignItems: 'start' }}>
          {/* ---- Trigger & gate ---- */}
          <div className="tile tile--white" style={{ padding: 24 }}>
            <h2 className="h02 mb5">Trigger</h2>
            <div className={'toggle' + (auto.enabled ? ' on' : '')} onClick={() => save({ enabled: !auto.enabled })}>
              <span className="track" />
              <span className="body01">Auto-regenerate on merge to {auto.branch}</span>
            </div>
            <div className="field mt6">
              <label htmlFor="brSel">Watch branch</label>
              {(() => {
                const real = branchInfo ? branchInfo.branches : ['main'];
                // The saved value always appears in the list (marked if it is a
                // pattern), so switching back to a real branch is one click.
                const opts = [...new Set([auto.branch, ...real])];
                if (customBr) {
                  return (
                    <input id="brSel" className="input" defaultValue={auto.branch.includes('*') ? auto.branch : ''}
                      placeholder="e.g. release/*" autoFocus
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        setCustomBr(false);
                        if (v && v !== auto.branch) save({ branch: v });
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} />
                  );
                }
                return (
                  <select id="brSel" className="select" value={auto.branch}
                    onChange={(e) => (e.target.value === '__custom' ? setCustomBr(true) : save({ branch: e.target.value }))}>
                    {opts.map((b) => (
                      <option key={b} value={b}>{b + (b.includes('*') ? '  — pattern (no such branch yet)' : '')}</option>
                    ))}
                    <option value="__custom">Custom pattern…</option>
                  </select>
                );
              })()}
              <p className="helper mt2">
                {branchInfo && branchInfo.live
                  ? 'Branches loaded live from ' + branchInfo.provider + ' · ' + branchInfo.repo
                  : branchInfo
                    ? 'Showing known branches for ' + (branchInfo.repo || 'your template') + ' — connect a code host with access to list all of them, or type a pattern.'
                    : 'Loading branches…'}
              </p>
            </div>
            <div className="field">
              <label htmlFor="gateIn">Quality gate (0–100)</label>
              <input id="gateIn" className="input" type="number" min="0" max="100" defaultValue={auto.gate}
                onBlur={(e) => {
                  const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  if (v !== auto.gate) save({ gate: v }, ['Quality gate updated', 'Runs below ' + v + ' are marked blocked']);
                }} />
            </div>
            <p className="helper">Runs scoring below the gate are marked <b>Gate blocked</b> — the content is generated but held for review, never auto-published.</p>

            <div className="divider" style={{ margin: '20px 0' }} />
            <h2 className="h02 mb3">Template</h2>
            {data.template ? (
              <>
                <p className="body01">{data.template.title}</p>
                <div className="row mt3" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <span className="tag tag--blue">{data.template.format.toUpperCase()}</span>
                  <span className="tag tag--gray">{data.template.repo}</span>
                  {data.template.skillName && <span className="tag tag--green">Skill: {data.template.skillName}</span>}
                </div>
                <p className="helper mt3">Each run regenerates this document — your most recent completed generation, including every output option and skill you configured.</p>
              </>
            ) : (
              <p className="helper">No completed generation yet. Generate a document once — automation then reuses that exact configuration on every merge.</p>
            )}
            <button className="btn btn--primary btn--field mt5" disabled={running || !auto.enabled} onClick={simulate}>
              {running ? 'Running…' : 'Simulate a merge now'}
            </button>
            {!auto.enabled && <p className="helper mt2">Enable the trigger above to run.</p>}
          </div>

          {/* ---- Webhook ---- */}
          <div className="tile tile--white" style={{ padding: 24 }}>
            <h2 className="h02 mb3">Repository webhook</h2>
            <p className="helper mb5">Point your repository at this endpoint and DocGen regenerates on every real merge — no CI required.</p>
            <p className="label01 t2 mb2">PAYLOAD URL</p>
            <div className="row" style={{ gap: 8 }}>
              <span className="mono" style={{ fontSize: 12.5, wordBreak: 'break-all', flex: 1 }}>{hookUrl}</span>
              <button className="btn btn--tertiary btn--sm" onClick={() => copy(hookUrl, 'Webhook URL')}>Copy</button>
            </div>
            <p className="label01 t2 mb2 mt5">SECRET</p>
            <div className="row" style={{ gap: 8 }}>
              <span className="mono" style={{ fontSize: 12.5, flex: 1 }}>{showSecret ? auto.secret : '•'.repeat(24)}</span>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowSecret((v) => !v)}>{showSecret ? 'Hide' : 'Reveal'}</button>
              <button className="btn btn--tertiary btn--sm" onClick={() => copy(auto.secret, 'Webhook secret')}>Copy</button>
              <button className="btn btn--ghost btn--sm" onClick={rotate}>Rotate</button>
            </div>
            <div className="mt5">
              {[
                ['GitHub', 'Repo → Settings → Webhooks → Add webhook. Content type application/json, paste the secret — events: Pushes (or Pull requests, merged PRs are handled).'],
                ['GitLab', 'Project → Settings → Webhooks. Paste the URL, use the secret as the Secret token — trigger: Push events.'],
                ['Bitbucket', 'Repo → Settings → Webhooks. Append ?token=<secret> to the URL — trigger: Repository push.']
              ].map(([p, how]) => (
                <p key={p} className="helper mt3"><b>{p}</b> — {how}</p>
              ))}
            </div>

            <div className="divider" style={{ margin: '20px 0' }} />
            <div className="row row--between mb3">
              <h2 className="h02">CI alternative · GitHub Actions</h2>
              <button className="btn btn--tertiary btn--sm" onClick={() => copy(data.snippet, 'Paste into .github/workflows/docgen.yml')}>Copy</button>
            </div>
            <div className="codeblock" style={{ fontSize: 11 }}>{data.snippet}</div>
            <p className="helper mt3">Generated from your live settings — branch <span className="mono">{auto.branch}</span>, gate <span className="mono">{auto.gate}</span>{data.template ? ', format ' + data.template.format : ''}. Add <span className="mono">DOCGEN_API_KEY</span> to repository secrets.</p>
          </div>
        </div>

        {/* ---- Run history ---- */}
        <h2 className="h02 mt7 mb3">Run history</h2>
        {runs.length === 0 ? (
          <p className="helper">No runs yet. Simulate a merge above, or push to <span className="mono">{auto.branch}</span> with the webhook configured.</p>
        ) : (
          <div className="runtable">
            <div className="runrow runrow--head">
              <span>When</span><span>Trigger</span><span>Commit</span><span>Branch</span><span>Score</span><span>Gate ≥ {auto.gate}</span><span />
            </div>
            {runs.map((r) => (
              <div key={r.id} className="runrow">
                <span className="helper">{new Date(r.at).toLocaleString()}</span>
                <span>{TRIGGER_LABEL[r.trigger] || r.trigger}</span>
                <span className="mono" style={{ fontSize: 12 }}>{r.commit ? String(r.commit).slice(0, 7) : '—'}</span>
                <span className="mono" style={{ fontSize: 12 }}>{r.branch}</span>
                <span>
                  {r.status === 'running' ? <span className="tag tag--blue">Running…</span>
                    : r.status === 'skipped' ? <span className="tag tag--gray">Skipped</span>
                    : r.status === 'failed' ? <span className="tag tag--red">Failed</span>
                    : <ScoreTag n={r.score} />}
                </span>
                <span>
                  {r.status === 'complete' && (r.gatePassed
                    ? <span className="tag tag--green">Passed ✓</span>
                    : <span className="tag tag--red">Gate blocked</span>)}
                  {r.status === 'skipped' && <span className="helper">{r.note || ''}</span>}
                </span>
                <span>
                  {r.genId && r.status === 'complete' && (
                    <button className="linkbtn" onClick={() => openReport(r.genId)}>View report →</button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <NavBar back="/dashboard" next="/settings" />
    </>
  );
}
