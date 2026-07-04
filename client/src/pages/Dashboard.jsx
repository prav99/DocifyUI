import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFlow } from '../store.jsx';
import { NavBar, Notif, Score, ScoreTag } from '../ui.jsx';

export default function Dashboard() {
  const nav = useNavigate();
  const { setFlow } = useFlow();
  const [gens, setGens] = useState(null);
  const [auto, setAuto] = useState(null);

  useEffect(() => {
    api('/generations').then((d) => setGens(d.generations)).catch(() => setGens([]));
    api('/automation').then((d) => setAuto(d.automation)).catch(() => {});
  }, []);

  if (!gens) return <div className="page"><p className="body01 t2">Loading…</p></div>;

  const complete = gens.filter((g) => g.status === 'complete');
  const avg = complete.length ? Math.round(complete.reduce((a, g) => a + g.score, 0) / complete.length) : 0;
  const low = complete.find((g) => g.score < 70);

  function openReport(g) {
    setFlow({ genId: g.id });
    nav('/quality');
  }

  return (
    <>
      <div className="page">
        <div className="row row--between" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="h04">Dashboard</h1>
            <p className="body01 t2 mt3">Recent generations across your connected sources.</p>
          </div>
          <div className="row">
            <button className="btn btn--tertiary btn--field" onClick={() => nav('/automation')}>Automation</button>
            <button className="btn btn--tertiary btn--field" onClick={() => nav('/settings')}>Team &amp; settings</button>
            <button className="btn btn--primary btn--field" onClick={() => nav('/source')}>New generation<span className="ico">+</span></button>
          </div>
        </div>

        <div className="grid3 mt7">
          <Score label="Documents total" num={complete.length} helper="Across all repositories" kind="good" />
          <Score label="Avg quality score" num={avg} helper="All completed generations" kind={avg >= 85 ? 'good' : 'warn'} />
          <Score label="Automation" num={auto && auto.enabled ? 'On' : 'Off'} helper="Regenerate on merge to main" kind={auto && auto.enabled ? 'good' : 'warn'} />
        </div>

        <h2 className="h02 mt7 mb5">Recent generations</h2>
        {complete.length === 0 ? (
          <div className="tile" style={{ padding: 24 }}>
            <p className="body01 t2">No documents yet. Start your first generation — it takes about a minute.</p>
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
                  <td className="mono" style={{ fontSize: 13 }}>{g.repo}</td>
                  <td><span className="tag tag--outline">{g.branch}</span></td>
                  <td>{g.title}</td>
                  <td>{g.format.toUpperCase()}</td>
                  <td className="t2">{new Date(g.createdAt).toLocaleDateString()}</td>
                  <td><ScoreTag n={g.score} /></td>
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
      <NavBar back="/checkout" next="/automation" />
    </>
  );
}
