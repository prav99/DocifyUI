import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFlow, toast } from '../store.jsx';
import { NavBar, Notif, Score, IcCheck, IcInfo, HelpLink } from '../ui.jsx';

const CAT_DESC = {
  'LLM readiness': 'Whether AI systems can find, summarize, and cite this document.',
  'Readability': 'Clarity and structure when sections are read on their own.',
  'Completeness': 'Prerequisites, limitations, and examples are all present.',
  'Consistency': 'One term, one meaning — no duplicated content.',
  'Consumability': 'Whether individual sections hold up when retrieved out of context.'
};

// Eases a percentage from its previous value to the new one — the visible
// "your chances just went up" moment after each fix.
function AnimPct({ value }) {
  const [v, setV] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return undefined;
    let raf;
    const t0 = performance.now();
    const dur = 900;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      setV(Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{v}</>;
}

function Gauge({ score, gate, potential }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const potPct = potential != null ? Math.max(0, Math.min(100, potential)) / 100 : null;
  const color = score >= gate ? '#24a148' : score >= 70 ? '#f1c21b' : '#da1e28';
  return (
    <svg width="140" height="140" viewBox="0 0 120 120" aria-label={'Overall score ' + score}>
      <circle cx="60" cy="60" r={r} stroke="#e0e0e0" strokeWidth="10" fill="none" />
      {potPct != null && potPct > pct && (
        <circle cx="60" cy="60" r={r} stroke="#a6c8ff" strokeWidth="10" fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - potPct)} opacity="0.55"
          transform="rotate(-90 60 60)" style={{ transition: 'stroke-dashoffset .6s cubic-bezier(0.2,0,0.38,0.9)' }} />
      )}
      <circle cx="60" cy="60" r={r} stroke={color} strokeWidth="10" fill="none"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 60 60)" style={{ transition: 'stroke-dashoffset .6s cubic-bezier(0.2,0,0.38,0.9)' }} />
      <text x="60" y="58" textAnchor="middle" fontSize="26" fontFamily="IBM Plex Mono, monospace" fill="#161616"><AnimPct value={score} /></text>
      <text x="60" y="78" textAnchor="middle" fontSize="10" fill="#525252" letterSpacing="1">OVERALL</text>
    </svg>
  );
}

export default function Quality() {
  const nav = useNavigate();
  const { flow } = useFlow();
  const [tab, setTab] = useState('ai');
  const [report, setReport] = useState(null);
  const [checking, setChecking] = useState(false);
  const [fixing, setFixing] = useState({}); // issueId -> step index while the fix runs
  const [deltas, setDeltas] = useState({}); // assistantId -> probability gain since last fix
  const [dimFilter, setDimFilter] = useState('all'); // filter findings by dimension
  const [statusFilter, setStatusFilter] = useState('all'); // all | open | fixed
  const [blendOpen, setBlendOpen] = useState(null); // assistantId with expanded retrieval profile
  const [fixingAll, setFixingAll] = useState(false);
  const prevProbs = useRef({});
  const fixAllStop = useRef(false);

  useEffect(() => {
    if (!report || !report.assistants) return;
    const d = {};
    report.assistants.forEach((a) => {
      const pv = prevProbs.current[a.id];
      const cur = a.probability != null ? a.probability : a.score;
      if (pv != null && cur > pv) d[a.id] = cur - pv;
      prevProbs.current[a.id] = cur;
    });
    if (Object.keys(d).length) {
      setDeltas(d);
      const t = setTimeout(() => setDeltas({}), 2600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [report]);

  useEffect(() => {
    if (!flow.genId) { nav('/dashboard'); return; }
    api('/generations/' + flow.genId + '/quality')
      .then((d) => setReport(d.report))
      .catch((e) => toast('error', 'Could not load report', e.message));
  }, [flow.genId, nav]);

  if (!report) return <div className="page"><p className="body01 t2">Loading quality report…</p></div>;

  const FIX_STEPS = ['Locating the issue', 'Rewriting the content', 'Re-rendering every format', 'Re-scoring with the judge'];

  async function applyFix(issueId, opts = {}) {
    if (fixing[issueId] != null) return;
    const prevOverall = report.overall != null ? report.overall : report.aiScore;
    setFixing((f) => ({ ...f, [issueId]: 0 }));
    const stepper = setInterval(() => {
      setFixing((f) => (typeof f[issueId] === 'number' && f[issueId] < FIX_STEPS.length - 1
        ? { ...f, [issueId]: f[issueId] + 1 } : f));
    }, 550);
    try {
      // Run the real fix while the progress plays; hold long enough to be seen.
      const [d] = await Promise.all([
        api('/quality/' + report.id + '/fix', { method: 'POST', body: { issueId } }),
        new Promise((r) => setTimeout(r, FIX_STEPS.length * 550 + 250))
      ]);
      clearInterval(stepper);
      setFixing((f) => { const n = { ...f }; delete n[issueId]; return n; });
      setReport(d.report);
      const newOverall = d.report.overall != null ? d.report.overall : d.report.aiScore;
      if (!opts.quietToast) {
        toast('success', 'Fixed in the document', 'Content re-rendered · overall ' + prevOverall + ' → ' + newOverall);
      }
      return d.report;
    } catch (e) {
      clearInterval(stepper);
      setFixing((f) => { const n = { ...f }; delete n[issueId]; return n; });
      toast('error', 'Could not apply fix', e.message);
      throw e;
    }
  }

  // Applies every remaining fix, one after another, with the same live
  // animation per issue — the whole dashboard re-scores after each one.
  async function fixAll() {
    if (fixingAll) { fixAllStop.current = true; return; }
    const open = report.issues.filter((i) => !i.fixed);
    if (!open.length) return;
    const prevOverall = report.overall != null ? report.overall : report.aiScore;
    setFixingAll(true);
    fixAllStop.current = false;
    let last = report;
    try {
      for (const iss of open) {
        if (fixAllStop.current) break;
        last = await applyFix(iss.id, { quietToast: true });
      }
      const newOverall = last.overall != null ? last.overall : last.aiScore;
      toast('success', fixAllStop.current ? 'Stopped' : 'All fixes applied',
        'Overall ' + prevOverall + ' → ' + newOverall + ' · content and every export regenerated');
    } catch { /* per-fix toast already shown */ }
    finally { setFixingAll(false); fixAllStop.current = false; }
  }

  // Jump from a dimension card straight to its findings.
  function drillInto(d) {
    if (d.id === 'links') { setTab('links'); return; }
    if (d.id === 'style') { setTab('style'); return; }
    setDimFilter(d.id);
    setStatusFilter('all');
    setTab('ai');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function recheck() {
    setChecking(true);
    try {
      const d = await api('/quality/' + report.id + '/recheck', { method: 'POST' });
      setReport(d.report);
      toast('info', 'AI judge re-confirmed', 'Overall score verified at ' + (d.report.overall != null ? d.report.overall : d.report.aiScore) + ' / 100 against the enterprise guideline set');
    } catch (e) { toast('error', 'Re-check failed', e.message); }
    finally { setChecking(false); }
  }

  const ai = report.aiScore;
  const overall = report.overall != null ? report.overall : ai;
  const dims = report.dimensions || [];
  const assistants = report.assistants || [];
  const gate = report.gate || 85;
  const potential = report.potential || null;
  const openCount = report.issues.filter((i) => !i.fixed).length;
  // Dimensions that actually have judge findings, for the filter chips.
  const dimChips = dims.filter((d) => !['links', 'style'].includes(d.id) && report.issues.some((i) => i.dim === d.id));
  const visibleIssues = report.issues
    .filter((i) => dimFilter === 'all' || i.dim === dimFilter)
    .filter((i) => statusFilter === 'all' || (statusFilter === 'open' ? !i.fixed : i.fixed));
  const verdictLabel = report.verdict || (report.remaining <= 1 ? 'AI-consumable' : report.remaining <= 3 ? 'Mostly consumable' : 'Needs work');
  const verdictCls = report.gatePassed ? 'tag--green' : overall >= 70 ? 'tag--amber' : 'tag--red';

  return (
    <>
      <div className="page">
        <div className="row row--between" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h1 className="h04">AI quality review</h1>
          <HelpLink topic="quality" />
        </div>
        <p className="body01 t2 mt3">{report.title} · generated just now</p>

        <div className="judgeband mt7">
          <div>
            <p className="eyebrow mb3">LLM-AS-A-JUDGE</p>
            <h2 className="h03" style={{ color: '#fff' }}>Verified for AI consumption, not just human review</h2>
            <p className="body01 mt3" style={{ color: '#c6c6c6', maxWidth: 560 }}>
              An LLM judge cross-examines this document against an enterprise documentation rubric,
              so it answers correctly in chat assistants, search, and retrieval pipelines.
            </p>
            <div className="row mt5" style={{ flexWrap: 'wrap' }}>
              {['Structure', 'Titles', 'Metadata', 'Clarity', 'Examples'].map((c) => (
                <span key={c} className="tag tag--darkoutline">{c}</span>
              ))}
            </div>
          </div>
          <div className="judgescore">
            <span className="label01" style={{ color: '#8d8d8d' }}>OVERALL SCORE</span>
            <span className="mono" style={{ fontSize: 44, lineHeight: 1.2 }}><AnimPct value={overall} /></span>
            <span className={'tag ' + verdictCls}>{verdictLabel}</span>
          </div>
        </div>

        <div className="tabs mt6">
          {[['ai', 'AI judge review'], ['overview', 'Scores'], ['links', 'Broken links'], ['style', 'Style guide']].map(([id, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        {tab === 'overview' && (
          <>
            <div className="qhero">
              <div className="qgauge tile tile--white">
                <Gauge score={overall} gate={gate} potential={potential ? potential.overall : null} />
                <span className={'tag ' + verdictCls}>{verdictLabel}</span>
                <p className="helper mt2" style={{ textAlign: 'center' }}>
                  Publish gate ≥ {gate} · {report.fixedCount} fix{report.fixedCount === 1 ? '' : 'es'} applied · {report.remaining} open
                </p>
                {potential && potential.overall > overall && (
                  <p className="helper mt2" style={{ textAlign: 'center' }}>
                    <span style={{ color: 'var(--interactive)' }}>◌ Potential {potential.overall}</span> if all open findings are fixed
                  </p>
                )}
              </div>
              <div className="dimgrid">
                {dims.map((d) => {
                  const cls = d.score >= gate ? 'ok' : d.score >= 70 ? 'warn' : 'bad';
                  const clickable = d.open > 0;
                  return (
                    <div key={d.id} className={'dimcard' + (clickable ? ' dimcard--click' : '')} title={d.desc}
                      role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? () => drillInto(d) : undefined}
                      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drillInto(d); } } : undefined}>
                      <div className="row row--between">
                        <span className="h01">{d.name}</span>
                        <span className="mono" style={{ fontSize: 15 }}><AnimPct value={d.score} /></span>
                      </div>
                      <div className="dimbar"><div className={'dimfill dimfill--' + cls} style={{ width: d.score + '%' }} /></div>
                      <span className="helper">weight {Math.round(d.weight * 100)}% · {d.open} open{d.total ? ' of ' + d.total + ' checks' : ''}</span>
                      {clickable && <span className="dimlink">View {d.open} finding{d.open > 1 ? 's' : ''} →</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            <h2 className="h02 mt7 mb3">Will this land in AI assistants?</h2>
            <p className="helper mb5">
              Modeled from your dimension scores and each assistant&apos;s retrieval profile — blends and the
              ≥ {report.assistantGate || 85} threshold are configurable server-side. No live calls are made to
              third-party assistants; this is a labeled estimate, recomputed on every fix so it can never
              disagree with the report above.
            </p>
            <div className="asstgrid">
              {assistants.map((a) => (
                <div key={a.id} className="asstcard asstcard--click"
                  style={{ borderTopColor: a.ready ? 'var(--support-success)' : 'var(--support-warning)' }}
                  role="button" tabIndex={0}
                  onClick={() => setBlendOpen(blendOpen === a.id ? null : a.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBlendOpen(blendOpen === a.id ? null : a.id); } }}>
                  <div className="row row--between">
                    <span className="h01">{a.name}</span>
                    {a.ready ? <span className="tag tag--green">Likely to land ✓</span> : <span className="tag tag--amber">At risk</span>}
                  </div>
                  <p className="mono" style={{ fontSize: 28, marginTop: 8 }}><AnimPct value={a.score} /><span className="helper"> /100</span></p>
                  {a.probability != null && (
                    <p className="helper mt2">≈ {a.probability}% chance to be retrieved &amp; cited</p>
                  )}
                  <p className="helper mt2">
                    {a.ready
                      ? 'Clears the readiness threshold for retrieval and citation.'
                      : 'Held back by: ' + (a.heldBackBy || 'open findings') + '. Apply the fixes to clear it.'}
                  </p>
                  <span className="dimlink">{blendOpen === a.id ? 'Hide retrieval profile' : 'What ' + a.name + ' weighs →'}</span>
                  {blendOpen === a.id && a.blend && (
                    <div className="asstblend" onClick={(e) => e.stopPropagation()}>
                      {a.blend.map((b) => (
                        <div key={b.dim} className="blendrow">
                          <span style={{ minWidth: 130 }}>{b.name}</span>
                          <div className="blendbar"><div style={{ width: b.pct + '%' }} /></div>
                          <span className="mono" style={{ minWidth: 34, textAlign: 'right' }}>{b.pct}%</span>
                          <span className="mono t2" style={{ minWidth: 56, textAlign: 'right' }}>yours {b.score}</span>
                        </div>
                      ))}
                      <p className="helper mt3">How this assistant weighs each quality dimension when deciding what to retrieve and cite — next to your current score on that dimension.</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <h2 className="h02 mt7 mb3">How this report is produced</h2>
            <div className="qpipe">
              {[
                ['01', 'Input', 'Generated document · style profile · optional PRDs and code summaries'],
                ['02', 'Analysis', 'NLP checks · rule-based style validation · LLM judge · link engine'],
                ['03', 'Scoring', 'Weighted dimension scores, issues, and one-click fix suggestions'],
                ['04', 'Human in the loop', 'You review and apply or dismiss each fix — nothing publishes itself']
              ].map(([n, t, d2], i, arr) => (
                <React.Fragment key={n}>
                  <div className="qstage">
                    <span className="label01 mono t2">{n}</span>
                    <span className="h01">{t}</span>
                    <span className="helper">{d2}</span>
                  </div>
                  {i < arr.length - 1 ? <span className="qarrow">→</span> : null}
                </React.Fragment>
              ))}
            </div>

            <h2 className="h02 mt7 mb3">Annotated preview</h2>
            <p className="helper mb5">A sample of the generated content with findings marked inline. Green — correct terminology. Amber — broken link. Blue — well-chunked for AI retrieval.</p>
            <div className="annot">
              {'## Authentication\n\nAll requests require a '}
              <span className="an-good">bearer token</span>
              {' issued from the developer\nconsole. Tokens scope to a single project and expire after\n12 hours. See the '}
              <span className="an-warn">token rotation guide</span>
              <span className="antag antag--warn">404 — broken link</span>
              {' for rotation policy.\n\n'}
              <span className="an-ai">{'## Create a charge\n\nSend a POST request to /v1/charges with amount, currency,\nand source. The response returns a charge object with a\nstatus of pending, succeeded, or failed.'}</span>
              <span className="antag antag--ai">Self-contained — retrieval-ready</span>
              {'\n\nRefunds are issued against a '}
              <span className="an-good">charge ID</span>
              <span className="antag antag--good">consistent term</span>
              {', never against raw\ncard details.'}
            </div>
          </>
        )}

        {tab === 'links' && (
          <>
            <p className="body01 t2 mb5">{report.links.length} of 47 links failed verification. Fix targets at the source, or let auto-regenerate re-link on next merge.</p>
            {report.links.map((r) => (
              <div key={r.url} className="issue" style={{ borderLeftColor: 'var(--support-error)' }}>
                <div className="row row--between">
                  <span className="mono" style={{ fontSize: 13 }}>{r.url}</span>
                  <span className={'tag ' + (r.status === '404' ? 'tag--red' : 'tag--amber')}>{r.status}</span>
                </div>
                <p className="helper mt2">{r.file}</p>
                <p className="body01 mt3">{r.why}</p>
              </div>
            ))}
            <div className="mt6">
              <Notif kind="info">Link integrity is checked on every generation and on every merge when automation is on.</Notif>
            </div>
          </>
        )}

        {tab === 'style' && (
          <>
            <p className="body01 t2 mb5">Checked against your default style profile (enterprise editorial rules). {report.style.filter((s) => !s.pass).length} findings need review, {report.style.filter((s) => s.pass).length} checks pass.</p>
            {report.style.map((r) => (
              <div key={r.t} className="issue" style={{ borderLeftColor: r.pass ? 'var(--support-success)' : 'var(--support-warning)' }}>
                <div className="row row--between">
                  <p className="h01">{r.t}</p>
                  <span className={'tag ' + (r.pass ? 'tag--green' : 'tag--amber')}>{r.pass ? 'Pass' : 'Review'}</span>
                </div>
                <p className="body01 mt3 t2">{r.d}</p>
              </div>
            ))}
          </>
        )}

        {tab === 'ai' && (
          <>
            <div className="grid3">
              <Score label="LLM-readiness dimension" num={ai} helper="Recomputed live from open findings" kind={ai >= 85 ? 'good' : 'warn'} />
              <Score label="Issues remaining" num={report.remaining} helper="Across both categories" kind="info" />
              <Score label="Fixes applied" num={report.fixedCount} helper="Applied to the working draft" kind="good" />
            </div>

            <div className="row row--between mt7" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div className="row">
                <IcInfo />
                <span className="body01">Evaluated by LLM judge, aligned to enterprise documentation guidelines</span>
                <span className={'tag ' + verdictCls}>{verdictLabel}</span>
              </div>
              <div className="row">
                {openCount > 0 && (
                  <button className="btn btn--primary btn--field" onClick={fixAll}>
                    {fixingAll ? 'Stop after this fix' : 'Fix all ' + openCount + ' remaining' + (potential && potential.overall > overall ? ' · +' + (potential.overall - overall) + ' pts' : '')}
                  </button>
                )}
                <button className="btn btn--tertiary btn--field" disabled={checking || fixingAll} onClick={recheck}>
                  {checking ? 'Re-evaluating…' : 'Re-check with AI judge'}
                </button>
              </div>
            </div>

            {/* ---- THE MOAT: live ranking outlook across AI models ---- */}
            {assistants.length > 0 && (
              <div className="moat mt6">
                <p className="eyebrow" style={{ color: '#78a9ff' }}>THE DOCGEN DIFFERENCE</p>
                <h2 className="h02 mt2" style={{ color: '#ffffff' }}>Ranking outlook across AI models</h2>
                <p className="helper mt2" style={{ color: '#c6c6c6', maxWidth: 640 }}>
                  Estimated chance this document is retrieved and cited by each model — recomputed the moment
                  a fix lands. Modeled from your quality dimensions (configurable server-side); capped below
                  100% because certainty would be a false claim.
                </p>
                <div className="moatgrid mt5">
                  {assistants.map((a) => {
                    const prob = a.probability != null ? a.probability : a.score;
                    const pot = potential ? (potential.assistants.find((p) => p.id === a.id) || {}).probability : null;
                    return (
                      <div key={a.id} className="moatcard">
                        <div className="row row--between">
                          <span className="h01" style={{ color: '#ffffff' }}>{a.name}</span>
                          {deltas[a.id] > 0 && <span className="tag tag--green moatdelta">+{deltas[a.id]} pts</span>}
                        </div>
                        <p className="moatpct mono">
                          <AnimPct value={prob} /><span className="moatpctsign">%</span>
                          {pot != null && pot > prob && <span className="moatpot mono">→ {pot}%</span>}
                        </p>
                        <div className="moatbar">
                          {pot != null && pot > prob && <div className="ghost" style={{ width: pot + '%' }} />}
                          <div className={a.ready ? 'ok' : ''} style={{ width: prob + '%' }} />
                        </div>
                        <span className="helper" style={{ color: '#8d8d8d' }}>
                          {a.ready ? 'Above the readiness threshold'
                            : pot != null && pot > prob ? 'Reaches ' + pot + '% once the open findings are fixed'
                            : 'Apply fixes below to raise this'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="judgenotes mt6">
              <p className="label01 t2">JUDGE NOTES</p>
              <p className="body01 mt3" style={{ fontStyle: 'italic' }}>
                {report.remaining > 0
                  ? 'Structure and terminology are strong. Resolve the ' + report.remaining + ' open finding' + (report.remaining > 1 ? 's' : '') + ' — short descriptions and search-optimized titles carry the most retrieval weight.'
                  : 'All rubric criteria satisfied. Sections are self-contained, titled for real queries, and retrieval-ready.'}
              </p>
            </div>

            {/* Filter the findings by dimension and status */}
            <div className="qfilter mt7">
              <span className="label01 t2">SHOW</span>
              <button className={'fchip' + (dimFilter === 'all' ? ' on' : '')} onClick={() => setDimFilter('all')}>
                All findings ({report.issues.length})
              </button>
              {dimChips.map((d) => (
                <button key={d.id} className={'fchip' + (dimFilter === d.id ? ' on' : '')} onClick={() => setDimFilter(dimFilter === d.id ? 'all' : d.id)}>
                  {d.name} ({report.issues.filter((i) => i.dim === d.id).length})
                </button>
              ))}
              <span className="qfiltersep" />
              {[['all', 'Any status'], ['open', 'Open'], ['fixed', 'Fixed']].map(([id, label]) => (
                <button key={id} className={'fchip' + (statusFilter === id ? ' on' : '')} onClick={() => setStatusFilter(id)}>{label}</button>
              ))}
            </div>
            {visibleIssues.length === 0 && (
              <p className="body01 t2 mt5">No findings match this filter — try All findings.</p>
            )}

            {[...new Set(visibleIssues.map((i) => i.cat))].map((cat) => (
              <div key={cat}>
                <h2 className="h02 mt7 mb3">{cat}</h2>
                <p className="helper mb5">{CAT_DESC[cat] || 'Findings from the LLM judge.'}</p>
                {visibleIssues.filter((i) => i.cat === cat).map((iss) => {
                  const step = fixing[iss.id];
                  const inFlight = typeof step === 'number';
                  return (
                    <div key={iss.id} className={'issue' + (iss.fixed ? ' fixed' : '')}>
                      <div className="row row--between">
                        <div className="row">{iss.fixed ? <IcCheck /> : null}<p className="h01">{iss.title}</p></div>
                        <div className="row">
                          {!iss.fixed && !inFlight && iss.gain > 0 && (
                            <span className="tag tag--blue" title="Projected overall score gain when this fix is applied">+{iss.gain} overall</span>
                          )}
                          <span className={'tag ' + (iss.fixed ? 'tag--green' : inFlight ? 'tag--blue' : 'tag--amber')}>
                            {iss.fixed ? 'Fixed' : inFlight ? 'Fixing…' : 'Open'}
                          </span>
                        </div>
                      </div>
                      <p className="body01 mt3 t2">{iss.body}</p>
                      <p className="ifix"><b>Suggested fix:</b> {iss.fix}</p>

                      {inFlight && (
                        <div className="fixprog mt5">
                          {FIX_STEPS.map((s, i) => (
                            <div key={s} className={'genstep ' + (i < step ? 'done' : i === step ? 'doing' : 'todo')} style={{ padding: '6px 0' }}>
                              <span className="sicon">
                                {i < step ? <IcCheck /> : i === step ? <span className="spin" /> : <span className="dotcircle" />}
                              </span>
                              {s}
                            </div>
                          ))}
                        </div>
                      )}

                      {iss.fixed && (iss.before || iss.after) && (
                        <div className="fixdiff mt5">
                          {iss.target ? <p className="label01 t2">{iss.target}</p> : null}
                          {iss.before ? <p className="diff-del mono">− {iss.before}</p> : null}
                          {iss.after ? <p className="diff-add mono">+ {iss.after}</p> : null}
                          <p className="helper mt2">Applied to the document — content, preview, and all export formats were regenerated.</p>
                        </div>
                      )}

                      {!iss.fixed && !inFlight && (
                        <button className="btn btn--primary btn--sm mt5" disabled={fixingAll} onClick={() => applyFix(iss.id)}>
                          Apply fix{iss.gain > 0 ? ' · +' + iss.gain : ''}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="mt6">
              <Notif kind="info">Link integrity is evaluated separately — see the Broken links tab. It does not affect the AI-readiness score.</Notif>
            </div>
          </>
        )}
      </div>
      <NavBar back="/generate" next="/export" nextLabel="Continue to export" />
    </>
  );
}
