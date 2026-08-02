import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFlow } from '../store.jsx';
import { NavBar, Notif, Score, ScoreTag, HelpLink } from '../ui.jsx';

const fmtDay = (iso) => { try { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString(); } catch { return '—'; } };

export default function Dashboard() {
  const nav = useNavigate();
  const { setFlow } = useFlow();
  const [gens, setGens] = useState(null);
  const [profiles, setProfiles] = useState(null);
  const [sync, setSync] = useState(null);
  // A failed fetch must never look like "you have no documents" — an empty
  // account and an unreachable API are different facts and are shown as such.
  const [errs, setErrs] = useState({});
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let alive = true;
    const fail = (key, e) => { if (alive) setErrs((x) => ({ ...x, [key]: e.message || 'Request failed' })); };
    const ok = (key) => { if (alive) setErrs((x) => (x[key] ? { ...x, [key]: '' } : x)); };
    api('/generations').then((d) => { if (alive) { setGens(d.generations || []); ok('gens'); } })
      .catch((e) => { if (alive) setGens([]); fail('gens', e); });
    api('/profiles').then((d) => { if (alive) { setProfiles(d.profiles || []); ok('profiles'); } })
      .catch((e) => { if (alive) setProfiles([]); fail('profiles', e); });
    api('/sync/overview').then((d) => { if (alive) { setSync(d || {}); ok('sync'); } })
      .catch((e) => { if (alive) setSync({}); fail('sync', e); });
    return () => { alive = false; };
  }, [reloads]);

  if (!gens) return <div className="page"><p className="body01 t2">Loading your dashboard…</p></div>;

  const complete = gens.filter((g) => g.status === 'complete');
  // Scores are only present once a generation has been judged; a null must not
  // poison the average into NaN.
  const scored = complete.filter((g) => typeof g.score === 'number');
  const avg = scored.length ? Math.round(scored.reduce((a, g) => a + g.score, 0) / scored.length) : 0;
  const low = scored.find((g) => g.score < 70);
  const failedLoads = Object.entries(errs).filter(([, v]) => v);

  function openReport(g) {
    setFlow({ genId: g.id });
    nav('/quality');
  }

  return (
    <>
      <div className="page">
        <div className="row row--between" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div className="row" style={{ alignItems: 'baseline', gap: 16 }}>
              <h1 className="h04">Dashboard</h1>
              <HelpLink topic="dashboard" />
            </div>
            <p className="body01 t2 mt3">Recent generations across your connected sources.</p>
          </div>
          <div className="row">
            <button className="btn btn--tertiary btn--field" onClick={() => nav('/automation')}>Automation</button>
            <button className="btn btn--tertiary btn--field" onClick={() => nav('/settings')}>Team &amp; settings</button>
            <button className="btn btn--primary btn--field" onClick={() => nav('/source')}>New generation<span className="ico">+</span></button>
          </div>
        </div>

        {failedLoads.length > 0 && (
          <div className="mt6">
            <Notif kind="error" title="Some of this page could not be loaded">
              {failedLoads.map(([, v]) => v).join(' · ')} — the tiles below only show what loaded successfully.{' '}
              <button className="linkbtn" onClick={() => setReloads((n) => n + 1)}>Try again</button>
            </Notif>
          </div>
        )}

        <div className="grid4 mt7">
          <Score label="Documents total" num={errs.gens ? '—' : complete.length}
            helper={errs.gens ? 'Could not be loaded' : 'Across all repositories'} kind={errs.gens ? 'warn' : 'good'} />
          <Score label="Avg quality score" num={errs.gens ? '—' : scored.length ? avg : '—'}
            helper={errs.gens ? 'Could not be loaded' : scored.length ? 'All completed generations' : 'No scored documents yet'}
            kind={!errs.gens && scored.length && avg >= 85 ? 'good' : 'warn'} />
          <Score label="Automation pipelines"
            num={errs.profiles ? '—' : profiles === null ? '…' : profiles.filter((p) => p.status === 'active').length}
            helper={errs.profiles ? 'Could not be loaded'
              : profiles && profiles.some((p) => p.status === 'active')
                ? 'Active — regenerating on every merge'
                : 'Create one — docs that maintain themselves'}
            kind={profiles && !errs.profiles && profiles.some((p) => p.status === 'active') ? 'good' : 'warn'} />
          <Score label="Doc sync updates"
            num={errs.sync ? '—' : sync === null ? '…' : (sync.pending ?? 0)}
            helper={errs.sync ? 'Could not be loaded'
              : sync && sync.ready
                ? (sync.pending ? 'Pending your review in Doc sync' : sync.ready + ' document' + (sync.ready > 1 ? 's' : '') + ' fully in sync')
                : 'Upload an existing doc to keep it in sync'}
            kind={sync && sync.pending && !errs.sync ? 'warn' : 'good'} />
        </div>

        {sync && sync.pending > 0 && (
          <div className="mt6">
            <Notif kind="info" title={sync.pending + ' AI documentation update' + (sync.pending > 1 ? 's' : '') + ' awaiting review'}>
              Commits were documented and placed into your existing documentation.{' '}
              <button className="linkbtn" onClick={() => nav('/sync')}>Open the review queue →</button>
            </Notif>
          </div>
        )}

        <h2 className="h02 mt7 mb5">Recent generations</h2>
        {errs.gens ? (
          <div className="tile" style={{ padding: 24 }}>
            <p className="body01"><b>Your generations could not be loaded</b></p>
            <p className="helper mt2">{errs.gens}. This is a loading problem, not an empty account — nothing has been lost.</p>
            <button className="btn btn--tertiary mt5" onClick={() => setReloads((n) => n + 1)}>Retry<span className="ico">↻</span></button>
          </div>
        ) : complete.length === 0 ? (
          <div className="tile" style={{ padding: 24 }}>
            <p className="body01 t2">
              {gens.length === 0
                ? 'No documents yet. Start your first generation — it takes about a minute.'
                : 'Nothing finished yet — your first generation is still running. It appears here the moment it completes.'}
            </p>
            <button className="btn btn--primary mt5" onClick={() => nav('/source')}>New generation<span className="ico">→</span></button>
          </div>
        ) : (
          <table className="dtable">
            <thead>
              <tr><th>REPOSITORY</th><th>BRANCH</th><th>DOCUMENT</th><th>FORMAT</th><th>GENERATED</th><th>QUALITY</th><th></th></tr>
            </thead>
            <tbody>
              {complete.map((g) => (
                <tr key={g.id}>
                  <td className="mono" style={{ fontSize: 13 }}>{g.repo || '—'}</td>
                  <td>{g.branch ? <span className="tag tag--outline">{g.branch}</span> : <span className="helper">—</span>}</td>
                  <td>{g.title || 'Untitled'}</td>
                  <td>{String(g.format || '').toUpperCase() || '—'}</td>
                  <td className="t2">{fmtDay(g.createdAt)}</td>
                  <td>{typeof g.score === 'number' ? <ScoreTag n={g.score} /> : <span className="helper">Not scored</span>}</td>
                  <td><button className="linkbtn" onClick={() => openReport(g)}>View report</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {low && (
          <div className="mt6">
            <Notif kind="warning" title="One document needs attention">
              {low.repo} scored {low.score} — open its report to apply the suggested fixes before publishing.
            </Notif>
          </div>
        )}
      </div>
      <NavBar next="/automation" nextLabel="Automation" />
    </>
  );
}
