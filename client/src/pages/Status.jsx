import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { usePageMeta } from '../seo.js';

/* Public status page — self-monitored. A health sample lands every five
   minutes; missing samples count AGAINST uptime, so the numbers can only be
   as good as reality. */

const COMPONENT_LABELS = {
  api: ['API', 'Application and REST API'],
  database: ['Database', 'Primary data store'],
  aiGeneration: ['AI generation', 'Document generation engine'],
  webhooks: ['Webhooks', 'Git and Jira event receiver']
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
    const load = () => api('/status').then((d) => { if (alive) setS(d); })
      .catch((e) => { if (alive) setErr(e.message); });
    load();
    const t = setInterval(load, 60000); // live page: refresh every minute
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (err) {
    return (
      <div className="page page--narrow">
        <h1 className="h04">Docify status</h1>
        <div className="notconn mt6" style={{ borderLeftColor: 'var(--support-error)' }}>
          <div>
            <p className="body01"><b>Status information is currently unreachable</b></p>
            <p className="helper mt2">That usually means we are having a bad moment too. Try again shortly.</p>
          </div>
        </div>
      </div>
    );
  }
  if (!s) return <div className="page page--narrow"><p className="body01 t2">Checking all systems…</p></div>;

  const fmtDate = (iso) => { try { return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };

  return (
    <div className="page page--narrow" style={{ maxWidth: 860 }}>
      <h1 className="h04">Docify status</h1>
      <p className="body01 t2 mt3">Live component health and uptime, sampled every five minutes. Gaps in monitoring count as downtime — these numbers cannot flatter us.</p>

      <div className={'statusbanner mt6' + (s.ok ? '' : ' statusbanner--down')} role="status">
        <span className="conndot" style={{ background: s.ok ? '#24a148' : 'var(--support-error, #da1e28)', width: 12, height: 12 }} />
        <b>{s.ok ? 'All systems operational' : 'Service disruption — we are on it'}</b>
        <span className="helper" style={{ marginLeft: 'auto' }}>checked {fmtDate(s.generatedAt)}</span>
      </div>

      <div className="stack mt5" style={{ gap: 8 }}>
        {Object.entries(COMPONENT_LABELS).map(([key, [name, desc]]) => {
          const c = s.components[key] || { ok: true };
          return (
            <div key={key} className="pickblock">
              <div className="pickrow">
                <span className="pickrow-sel">
                  <b>{name}</b>
                  <span className="reporow-meta">{desc}{c.latencyMs != null ? ' · ' + c.latencyMs + ' ms' : ''}{c.note ? ' · ' + c.note : ''}</span>
                </span>
                {c.ok
                  ? <span className="tag tag--green" style={{ marginLeft: 'auto' }}>Operational</span>
                  : <span className="tag tag--red" style={{ marginLeft: 'auto' }}>Down</span>}
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="h02 mt7">Uptime</h2>
      <div className="row mt4" style={{ gap: 12, flexWrap: 'wrap' }}>
        {[['24h', 'Last 24 hours'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days']].map(([k, label]) => (
          <div key={k} className="tile tile--white" style={{ padding: '14px 22px', minWidth: 150 }}>
            <p className="label01 t2">{label.toUpperCase()}</p>
            <p className="h03 mt2" style={{ color: s.uptime[k] == null ? 'var(--text-secondary)' : s.uptime[k] >= 99.5 ? 'var(--support-success)' : s.uptime[k] >= 98 ? '#b28600' : 'var(--support-error)' }}>
              {s.uptime[k] == null ? '—' : s.uptime[k] + '%'}
            </p>
          </div>
        ))}
      </div>

      <p className="label01 t2 mt6">LAST 90 DAYS</p>
      <div className="updays mt3" aria-label="Daily status, last 90 days">
        {s.days.map((d) => (
          <span key={d.date} className={'upday upday--' + d.state} title={d.date + ' — ' + (d.state === 'ok' ? 'operational' : d.state === 'partial' ? 'partial disruption' : d.state === 'down' ? 'downtime' : 'no data')} />
        ))}
      </div>
      <p className="helper mt2">
        {s.monitoringSince ? 'Monitoring since ' + fmtDate(s.monitoringSince) + '. ' : ''}
        Grey squares predate monitoring.
      </p>

      <h2 className="h02 mt7">Incidents — last 30 days</h2>
      {s.incidents.length === 0 ? (
        <p className="body01 t2 mt3">No incidents recorded.</p>
      ) : (
        <div className="stack mt3" style={{ gap: 8 }}>
          {s.incidents.map((i, k) => (
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
