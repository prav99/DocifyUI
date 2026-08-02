import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { usePageMeta } from '../seo.js';

/* Public status page — self-monitored. A health sample lands every five
   minutes and every figure below is computed from those recorded samples.
   Nothing on this page is estimated or entered by hand. */

/* An uptime percentage above 100 is arithmetically impossible, so it can only
   ever be a bug (duplicate samplers, a bad denominator). Rendering it as fact
   on the one page whose job is to prove we are trustworthy would be worse than
   rendering nothing: anything outside 0–100, or not a finite number, is shown
   as unavailable rather than quietly clamped into looking plausible. */
function uptimeText(v) {
  if (v == null) return { text: '—', suspect: false };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return { text: 'unavailable', suspect: true };
  return { text: (Math.round(n * 10) / 10) + '%', suspect: false };
}

/* The third element says what the check actually proves. `database` runs a real
   query; the others are answered by the process serving this page, so they
   confirm reachability and configuration rather than an end-to-end round trip.
   Saying so is the difference between a status page and a green light. */
const COMPONENT_LABELS = {
  api: ['API', 'Application and REST API', 'answering this request'],
  database: ['Database', 'Primary data store', 'live query on each check'],
  aiGeneration: ['AI generation', 'Document generation engine', 'credentials present — not a live model call'],
  webhooks: ['Webhooks', 'Git and Jira event receiver', 'mounted in this process']
};

export default function Status() {
  usePageMeta({
    title: 'Status — Docify uptime and reliability',
    description: 'Live component health, uptime history, and incident log for Docify.'
  });
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => api('/status').then((d) => { if (alive) { setS(d); setErr(''); } })
      .catch((e) => { if (alive) setErr(e.message || 'Request failed'); });
    load();
    const t = setInterval(load, 60000); // live page: refresh every minute
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (err && !s) {
    return (
      <div className="page page--narrow">
        <h1 className="h04">Docify status</h1>
        <div className="notconn mt6" style={{ borderLeftColor: 'var(--support-error)' }}>
          <div>
            <p className="body01"><b>Status information is currently unreachable</b></p>
            <p className="helper mt2">{err} — that usually means we are having a bad moment too. This page retries every minute.</p>
            <p className="helper mt2">
              External monitors can poll <span className="mono">GET /api/health</span> directly.
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (!s) return <div className="page page--narrow"><p className="body01 t2">Checking all systems…</p></div>;

  const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  // Every collection is defaulted: a partial payload must degrade to "no data",
  // never to a crashed page or an invented reading.
  const components = s.components || {};
  const uptime = s.uptime || {};
  const days = Array.isArray(s.days) ? s.days : [];
  const incidents = Array.isArray(s.incidents) ? s.incidents : [];
  const noData = days.filter((d) => d.state === 'none').length;

  return (
    <div className="page page--narrow" style={{ maxWidth: 860 }}>
      <h1 className="h04">Docify status</h1>
      <p className="body01 t2 mt3">
        Live component health and uptime, sampled every five minutes by the running service. Every figure
        on this page is computed from those recorded samples — none of it is estimated, rounded up, or
        entered by hand, and periods we did not observe are shown as gaps rather than counted as uptime.
      </p>

      <div className={'statusbanner mt6' + (s.ok ? '' : ' statusbanner--down')} role="status">
        <span className="conndot" style={{ background: s.ok ? '#24a148' : 'var(--support-error, #da1e28)', width: 12, height: 12 }} />
        <b>{s.ok ? 'All systems operational' : 'Service disruption — we are on it'}</b>
        <span className="helper" style={{ marginLeft: 'auto' }}>checked {fmtDate(s.generatedAt)}</span>
      </div>

      {err && (
        <p className="helper mt3" style={{ color: 'var(--support-error)' }}>
          The last refresh failed ({err}) — the readings below are from {fmtDate(s.generatedAt)}.
        </p>
      )}

      <div className="stack mt5" style={{ gap: 8 }}>
        {Object.entries(COMPONENT_LABELS).map(([key, [name, desc, method]]) => {
          const c = components[key];
          // A component the API did not report on is unknown, not healthy.
          const reported = c && typeof c.ok === 'boolean';
          return (
            <div key={key} className="pickblock">
              <div className="pickrow">
                <span className="pickrow-sel">
                  <b>{name}</b>
                  <span className="reporow-meta">
                    {desc} · {method}
                    {c && c.latencyMs != null ? ' · ' + c.latencyMs + ' ms' : ''}
                    {c && c.note ? ' · ' + c.note : ''}
                  </span>
                </span>
                {!reported
                  ? <span className="tag tag--outline" style={{ marginLeft: 'auto' }}>No data</span>
                  : c.ok
                    ? <span className="tag tag--green" style={{ marginLeft: 'auto' }}>Operational</span>
                    : <span className="tag tag--red" style={{ marginLeft: 'auto' }}>Down</span>}
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="h02 mt7">Uptime</h2>
      <div className="row mt4" style={{ gap: 12, flexWrap: 'wrap' }}>
        {[['24h', 'Last 24 hours'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days']].map(([k, label]) => {
          const u = uptimeText(uptime[k]);
          const n = Number(uptime[k]);
          const colour = u.suspect || uptime[k] == null ? 'var(--text-secondary)'
            : n >= 99.5 ? 'var(--support-success)' : n >= 98 ? '#b28600' : 'var(--support-error)';
          return (
            <div key={k} className="tile tile--white" style={{ padding: '14px 22px', minWidth: 150 }}>
              <p className="label01 t2">{label.toUpperCase()}</p>
              <p className={u.suspect ? 'body01 mt2' : 'h03 mt2'} style={{ color: colour }}>{u.text}</p>
            </div>
          );
        })}
      </div>
      {['24h', '7d', '30d'].some((k) => uptimeText(uptime[k]).suspect) && (
        <p className="helper mt3" style={{ color: 'var(--support-error)' }}>
          One or more windows returned a figure outside 0–100%, which is not a possible uptime. We are
          showing it as unavailable rather than publishing a number we know to be wrong.
        </p>
      )}

      <p className="label01 t2 mt6">LAST 90 DAYS</p>
      <div className="updays mt3" role="img"
        aria-label={'Daily status for the last 90 days: ' + days.filter((d) => d.state === 'ok').length + ' operational, '
          + days.filter((d) => d.state === 'partial').length + ' partial, '
          + days.filter((d) => d.state === 'down').length + ' with downtime, ' + noData + ' with no recorded samples'}>
        {days.map((d) => (
          <span key={d.date} className={'upday upday--' + d.state} title={d.date + ' — ' + (d.state === 'ok' ? 'operational' : d.state === 'partial' ? 'partial disruption' : d.state === 'down' ? 'downtime' : 'no health samples recorded')} />
        ))}
      </div>
      {days.length === 0 && <p className="body01 t2 mt3">No daily history recorded yet.</p>}
      <p className="helper mt2">
        {s.monitoringSince
          ? 'Earliest health sample we still hold: ' + fmtDate(s.monitoringSince) + '. '
          : 'No health samples have been recorded yet. '}
        Grey squares are days with no recorded samples — either before monitoring started or a period we
        did not observe. They are never counted as operational.
      </p>

      <h2 className="h02 mt7">Incidents — last 30 days</h2>
      {incidents.length === 0 ? (
        <p className="body01 t2 mt3">
          No incidents recorded{s.monitoringSince ? '' : ' — monitoring has not collected any samples yet'}.
        </p>
      ) : (
        <div className="stack mt3" style={{ gap: 8 }}>
          {incidents.map((i, k) => (
            <div key={k} className="notconn" style={{ borderLeftColor: 'var(--support-error)' }}>
              <div>
                <p className="body01"><b>Service degraded</b></p>
                <p className="helper mt2">{fmtDate(i.start)} → {fmtDate(i.end)} · approx. {i.approxMinutes} minutes</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="helper mt7">
        External monitors can poll <span className="mono">GET /api/health</span> — it returns HTTP 200 when
        healthy and 503 during a disruption.
      </p>
    </div>
  );
}
