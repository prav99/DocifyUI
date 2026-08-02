import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFlow } from '../store.jsx';
import { NavBar, Notif, Score, ScoreTag, HelpLink } from '../ui.jsx';

const fmtDay = (iso) => { try { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString(); } catch { return '—'; } };
const PLAN_NAME = { free: 'Free', starter: 'Starter', team: 'Team', enterprise: 'Enterprise' };
const PROVIDER_NAME = { github: 'GitHub', gitlab: 'GitLab', bitbucket: 'Bitbucket' };

/* The same threshold ScoreTag paints green in ui.jsx — a document at or above
   it reads as publish-ready everywhere else in the product, so the dashboard
   must not draw the attention line somewhere different. */
const GOOD_SCORE = 85;

/* The server caps GET /history at 200 rows and GET /generations at 50. Counts
   derived from them are exact below the cap and must say so above it — an
   understated total presented as a total is a false number. */
const HISTORY_CAP = 200;
const GENS_CAP = 50;

const RUN_TAG = {
  queued: ['tag--gray', 'Queued'],
  running: ['tag--blue', 'Running'],
  failed: ['tag--red', 'Failed'],
  complete: ['tag--green', 'Complete']
};

/* Each tile owns exactly one endpoint so a single failure degrades one number
   instead of blanking the page. */
const ENDPOINTS = [
  ['gens', '/generations', (d) => d.generations || []],
  ['docs', '/history', (d) => d.documents || []],
  ['profiles', '/profiles', (d) => d.profiles || []],
  ['sync', '/sync/overview', (d) => d || {}],
  ['billing', '/billing', (d) => d || {}],
  ['conns', '/connections', (d) => d.connections || {}],
  ['repos', '/hub/repositories?per=10', (d) => d || { total: 0 }]
];

function Step({ n, done, unknown, title, body, action, onAction }) {
  return (
    <li className="row" style={{ alignItems: 'flex-start', gap: 14, padding: '14px 0', borderTop: '1px solid var(--border-subtle)' }}>
      <span aria-hidden="true" style={{
        flex: 'none', width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center',
        fontSize: 13, fontFamily: "'IBM Plex Mono', monospace",
        background: done ? 'var(--support-success)' : 'var(--layer-01)',
        color: done ? '#fff' : 'var(--text-secondary)',
        border: done ? 'none' : '1px solid var(--border-subtle)'
      }}>{done ? '✓' : n}</span>
      <span style={{ flex: '1 1 240px', minWidth: 0 }}>
        <p className="body01"><b>{title}</b>{done && <span className="tag tag--green" style={{ marginLeft: 8 }}>done</span>}
          {unknown && <span className="tag tag--gray" style={{ marginLeft: 8 }}>could not check</span>}</p>
        <p className="helper mt2">{body}</p>
      </span>
      {action && (
        <button className={'btn btn--sm btn--center ' + (done ? 'btn--ghost' : 'btn--primary')} onClick={onAction}>
          {action}
        </button>
      )}
    </li>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const { setFlow } = useFlow();
  // A failed fetch must never look like "you have no documents" — an empty
  // account and an unreachable API are different facts and are shown as such.
  const [data, setData] = useState({});
  const [errs, setErrs] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    Promise.all(ENDPOINTS.map(([key, path, pick]) =>
      api(path).then((d) => [key, pick(d), '']).catch((e) => [key, undefined, e.message || 'Request failed'])
    )).then((res) => {
      if (!alive) return;
      setData(Object.fromEntries(res.filter((r) => r[1] !== undefined).map((r) => [r[0], r[1]])));
      setErrs(Object.fromEntries(res.map((r) => [r[0], r[2]])));
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [reloads]);

  const gens = data.gens || [];
  const docs = data.docs || [];
  const profiles = data.profiles || [];
  const sync = data.sync || {};
  const billing = data.billing || {};
  const conns = data.conns || {};
  const repoTotal = (data.repos && data.repos.total) || 0;

  const view = useMemo(() => {
    const scored = docs.filter((d) => typeof d.score === 'number');
    const usage = (billing.usage && billing.usage.documents) || null;
    return {
      running: gens.filter((g) => g.status === 'running' || g.status === 'queued'),
      failed: gens.filter((g) => g.status === 'failed'),
      inReview: docs.filter((d) => d.approval === 'review'),
      lowScore: scored.filter((d) => d.score < GOOD_SCORE),
      scored,
      avg: scored.length ? Math.round(scored.reduce((a, d) => a + d.score, 0) / scored.length) : null,
      activePipes: profiles.filter((p) => p.status === 'active'),
      brokenPipes: profiles.filter((p) => p.stats && p.stats.lastRun && p.stats.lastRun.status === 'failed'),
      expired: Object.keys(conns).filter((p) => conns[p] && conns[p].expired),
      usage,
      docsCapped: docs.length >= HISTORY_CAP,
      gensCapped: gens.length >= GENS_CAP
    };
  }, [gens, docs, profiles, conns, billing]);

  if (!loaded) return <div className="page"><p className="body01 t2" role="status">Loading your dashboard…</p></div>;

  const failedLoads = Object.keys(errs).filter((k) => errs[k]);
  // A brand new account: nothing generated and nothing in the document store.
  // Only claim it when both of those actually answered.
  const isNew = !errs.gens && !errs.docs && gens.length === 0 && docs.length === 0;
  const sourceKnown = !errs.conns || !errs.repos;
  const hasSource = Object.keys(conns).some((p) => conns[p] && conns[p].connected) || repoTotal > 0;
  const planName = PLAN_NAME[billing.plan] || 'current';

  const { usage } = view;
  const quotaPct = usage && usage.limit ? usage.used / usage.limit : 0;
  const quotaLeft = usage && usage.limit != null ? Math.max(0, usage.limit - usage.used) : null;

  const reviewParts = [];
  if (!errs.docs) reviewParts.push(view.inReview.length + ' document' + (view.inReview.length === 1 ? '' : 's') + ' in review');
  if (!errs.sync) reviewParts.push((sync.pending || 0) + ' doc-sync update' + (sync.pending === 1 ? '' : 's'));
  const reviewCount = (errs.docs ? 0 : view.inReview.length) + (errs.sync ? 0 : (sync.pending || 0));
  if (errs.docs) reviewParts.push('document approvals could not be loaded');
  if (errs.sync) reviewParts.push('the doc-sync queue could not be loaded');

  function openReport(g) {
    setFlow({ genId: g.id });
    nav('/quality');
  }
  function track(g) {
    setFlow({ genId: g.id });
    nav('/generate');
  }

  const recent = gens.slice(0, 8);

  return (
    <>
      <div className="page">
        <div className="row row--between" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div className="row" style={{ alignItems: 'baseline', gap: 16 }}>
              <h1 className="h04">Dashboard</h1>
              <HelpLink topic="dashboard" />
            </div>
            <p className="body01 t2 mt3">
              {isNew ? 'Three steps to your first documentation set.' : 'What needs your attention, across every connected source.'}
            </p>
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn--tertiary btn--field" onClick={() => nav('/history')}>Documents</button>
            <button className="btn btn--tertiary btn--field" onClick={() => nav('/automation')}>Automation</button>
            <button className="btn btn--primary btn--field" onClick={() => nav('/source')}>New generation<span className="ico">+</span></button>
          </div>
        </div>

        {failedLoads.length > 0 && (
          <div className="mt6">
            <Notif kind="error" title="Some of this page could not be loaded">
              {[...new Set(failedLoads.map((k) => errs[k]))].join(' · ')} — everything below shows only what loaded
              successfully, and anything unavailable reads “—” rather than zero.{' '}
              <button className="linkbtn" onClick={() => setReloads((n) => n + 1)}>Try again</button>
            </Notif>
          </div>
        )}

        {isNew ? (
          <>
            <div className="tile mt6" style={{ padding: '4px 24px 20px' }}>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                <Step n={1} done={sourceKnown && hasSource} unknown={!sourceKnown}
                  title="Connect a repository"
                  body={sourceKnown && hasSource
                    ? (repoTotal ? repoTotal + ' repositor' + (repoTotal === 1 ? 'y is' : 'ies are') + ' in your catalogue.' : 'A provider account is connected.')
                    : sourceKnown
                      ? 'Sign in to GitHub, GitLab, or Bitbucket, or paste public repositories. Docify only ever reads — it never writes to your repository and never opens pull requests.'
                      : 'Your connections could not be loaded, so this step could not be checked. Open Repository connections to see the real state.'}
                  action={sourceKnown && hasSource ? 'Manage' : 'Connect'}
                  onAction={() => nav('/repos')} />
                <Step n={2} done={false}
                  title="Generate your first document"
                  body={sourceKnown && hasSource
                    ? 'Pick a repository, choose a document type and format, and Docify reads the code and writes the documentation. About a minute.'
                    : 'Available as soon as a source is connected — the wizard will offer to connect one on the way through.'}
                  action="Start" onAction={() => nav('/source')} />
                <Step n={3} done={false}
                  title="Keep it up to date automatically"
                  body="An automation pipeline regenerates documentation on every merge; Doc sync places the changes into documentation you already have. Set this up once your first document looks right."
                  action="Automation" onAction={() => nav('/automation')} />
              </ol>
            </div>
            <p className="helper mt4">
              {usage
                ? 'Your ' + planName + ' plan includes ' + (usage.limit == null ? 'unlimited documents' : usage.limit + ' documents a month')
                  + (usage.limit == null ? '.' : (usage.used ? ' — ' + usage.used + ' used so far.' : ' — none used yet.'))
                : 'Nothing is charged to your plan until a generation completes.'}
            </p>
          </>
        ) : (
          <>
            <div className="grid4 mt7">
              <Score label="Documents this month"
                num={errs.billing || !usage ? '—' : usage.used}
                helper={errs.billing || !usage ? 'Could not be loaded'
                  : usage.limit == null ? 'No monthly cap on the ' + planName + ' plan'
                    : 'of ' + usage.limit + ' included in ' + planName + (billing.usage.resetsOn ? ' · resets ' + billing.usage.resetsOn : '')}
                kind={errs.billing || !usage || usage.limit == null ? 'good'
                  : quotaLeft === 0 ? 'bad' : quotaPct >= 0.8 ? 'warn' : 'good'} />

              <Score label="Awaiting your review"
                num={errs.docs && errs.sync ? '—' : reviewCount}
                helper={errs.docs && errs.sync ? 'Could not be loaded'
                  : reviewCount === 0 && !errs.docs && !errs.sync ? 'Nothing is waiting on you'
                    : reviewParts.join(' · ')}
                kind={reviewCount > 0 ? 'warn' : 'good'} />

              <Score label={'Documents scoring under ' + GOOD_SCORE}
                num={errs.docs ? '—' : view.lowScore.length}
                helper={errs.docs ? 'Could not be loaded'
                  : !view.scored.length ? 'No scored documents yet'
                    : 'of ' + view.scored.length + ' scored' + (view.docsCapped ? ' (' + HISTORY_CAP + ' most recent)' : '')
                      + (view.avg != null ? ' · average ' + view.avg : '')}
                kind={errs.docs ? 'warn' : view.lowScore.length ? 'warn' : 'good'} />

              <Score label="Automation pipelines"
                num={errs.profiles ? '—' : view.activePipes.length}
                helper={errs.profiles ? 'Could not be loaded'
                  : view.brokenPipes.length
                    ? view.brokenPipes.length + ' pipeline' + (view.brokenPipes.length === 1 ? '' : 's') + ' failed on the last run'
                    : view.activePipes.length ? 'Active — regenerating on every merge'
                      : profiles.length ? profiles.length + ' created, none active' : 'Create one — docs that maintain themselves'}
                kind={errs.profiles ? 'warn' : view.brokenPipes.length ? 'bad' : view.activePipes.length ? 'good' : 'warn'} />
            </div>

            <div className="stack mt6">
              {view.expired.length > 0 && (
                <Notif kind="error" title={view.expired.map((p) => PROVIDER_NAME[p] || p).join(' and ') + ' needs reconnecting'}>
                  The access token has expired, so private repositories on {view.expired.length === 1 ? 'it' : 'them'} cannot
                  be read until you sign in again.{' '}
                  <button className="linkbtn" onClick={() => nav('/repos')}>Reconnect →</button>
                </Notif>
              )}

              {view.failed.length > 0 && (
                <Notif kind="warning" title={view.failed.length + ' generation' + (view.failed.length === 1 ? '' : 's') + ' failed'}>
                  {/* stageDetail is the reason the server recorded when the
                      pipeline threw — showing it beats "something went wrong". */}
                  {view.failed.length === 1 && view.failed[0].stageDetail
                    ? (view.failed[0].repo || 'A generation') + ' — ' + view.failed[0].stageDetail
                    : 'No document was delivered. Each failed run is listed below.'}{' '}
                  <button className="linkbtn" onClick={() => nav('/source')}>Try again →</button>
                </Notif>
              )}

              {view.running.length > 0 && (
                <Notif kind="info" title={view.running.length + ' generation' + (view.running.length === 1 ? ' is' : 's are') + ' still running'}>
                  They appear as completed documents the moment they finish.{' '}
                  <button className="linkbtn" onClick={() => track(view.running[0])}>Track progress →</button>
                </Notif>
              )}

              {!errs.sync && sync.pending > 0 && (
                <Notif kind="info" title={sync.pending + ' documentation update' + (sync.pending > 1 ? 's' : '') + ' awaiting review'}>
                  Commits were documented and placed into documentation you already had — nothing is distributed
                  until you approve it.{' '}
                  <button className="linkbtn" onClick={() => nav('/sync')}>Open the review queue →</button>
                </Notif>
              )}

              {!errs.docs && view.inReview.length > 0 && (
                <Notif kind="info" title={view.inReview.length + ' document' + (view.inReview.length === 1 ? '' : 's') + ' waiting on a review decision'}>
                  Approve or send back to draft — the automation approval gate treats only approved documents as
                  publishable.{' '}
                  <button className="linkbtn" onClick={() => nav('/history')}>Review them →</button>
                </Notif>
              )}

              {usage && usage.limit != null && quotaLeft === 0 && (
                <Notif kind="warning" title="You have used every document included this month">
                  New generations will be refused until {billing.usage.resetsOn || 'your quota resets'}.{' '}
                  <button className="linkbtn" onClick={() => nav('/pricing')}>See plans →</button>
                </Notif>
              )}
              {usage && usage.limit != null && quotaLeft > 0 && quotaPct >= 0.8 && (
                <Notif kind="warning" title={quotaLeft + ' document' + (quotaLeft === 1 ? '' : 's') + ' left this month'}>
                  Your {planName} plan includes {usage.limit} a month, resetting {billing.usage.resetsOn || 'at the start of next month'}.{' '}
                  <button className="linkbtn" onClick={() => nav('/pricing')}>See plans →</button>
                </Notif>
              )}
            </div>

            <div className="row row--between mt7 mb5" style={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
              <h2 className="h02">Recent activity</h2>
              <span className="helper">
                {errs.gens ? '' : 'Latest ' + recent.length + ' of your ' + (view.gensCapped ? GENS_CAP + ' most recent' : gens.length) + ' generations · '}
                <button className="linkbtn" style={{ fontSize: 12 }} onClick={() => nav('/history')}>All documents →</button>
              </span>
            </div>

            {errs.gens ? (
              <div className="tile" style={{ padding: 24 }}>
                <p className="body01"><b>Your generations could not be loaded</b></p>
                <p className="helper mt2">{errs.gens}. This is a loading problem, not an empty account — nothing has been lost.</p>
                <button className="btn btn--tertiary mt5" onClick={() => setReloads((n) => n + 1)}>Retry<span className="ico">↻</span></button>
              </div>
            ) : recent.length === 0 ? (
              <div className="tile" style={{ padding: 24 }}>
                <p className="body01 t2">
                  No generations in this account yet — your {docs.length} stored document{docs.length === 1 ? '' : 's'} came
                  from elsewhere. Start a generation to add to them.
                </p>
                <button className="btn btn--primary mt5" onClick={() => nav('/source')}>New generation<span className="ico">→</span></button>
              </div>
            ) : (
              <table className="dtable">
                <thead>
                  <tr><th>REPOSITORY</th><th>BRANCH</th><th>DOCUMENT</th><th>FORMAT</th><th>STATUS</th><th>GENERATED</th><th>QUALITY</th><th></th></tr>
                </thead>
                <tbody>
                  {recent.map((g) => {
                    const [tagCls, tagLabel] = RUN_TAG[g.status] || ['tag--gray', g.status || 'unknown'];
                    return (
                      <tr key={g.id}>
                        <td className="mono" style={{ fontSize: 13 }}>{g.repo || '—'}</td>
                        <td>{g.branch ? <span className="tag tag--outline">{g.branch}</span> : <span className="helper">—</span>}</td>
                        <td>
                          {g.title || (g.status === 'complete' ? 'Untitled' : (g.docTypes || []).join(', ') || 'Untitled')}
                          {g.status === 'failed' && g.stageDetail
                            ? <span className="helper" style={{ display: 'block', maxWidth: 260, whiteSpace: 'normal' }}>{g.stageDetail}</span>
                            : null}
                        </td>
                        <td>{String(g.format || '').toUpperCase() || '—'}</td>
                        <td><span className={'tag ' + tagCls}>{tagLabel}</span></td>
                        <td className="t2">{fmtDay(g.createdAt)}</td>
                        <td>{typeof g.score === 'number' ? <ScoreTag n={g.score} /> : <span className="helper">{g.status === 'complete' ? 'Not scored' : '—'}</span>}</td>
                        <td>
                          {g.status === 'complete' ? <button className="linkbtn" onClick={() => openReport(g)}>View report</button>
                            : g.status === 'failed' ? <button className="linkbtn" onClick={() => nav('/source')}>Start again</button>
                              : <button className="linkbtn" onClick={() => track(g)}>Track</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {!errs.docs && view.lowScore.length > 0 && (
              <div className="mt6">
                <Notif kind="warning"
                  title={view.lowScore.length === 1
                    ? 'One document scores under ' + GOOD_SCORE
                    : view.lowScore.length + ' documents score under ' + GOOD_SCORE}>
                  Lowest is {view.lowScore.reduce((a, d) => (d.score < a.score ? d : a)).repo || 'a document'} at{' '}
                  {Math.min(...view.lowScore.map((d) => d.score))}. Open a report to apply the suggested fixes before publishing.{' '}
                  <button className="linkbtn" onClick={() => nav('/history')}>See the documents →</button>
                </Notif>
              </div>
            )}
          </>
        )}
      </div>
      <NavBar next="/automation" nextLabel="Automation" />
    </>
  );
}
