import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFlow, toast } from '../store.jsx';
import { NavBar, Notif, Score, IcCheck, IcInfo } from '../ui.jsx';

export default function Quality() {
  const nav = useNavigate();
  const { flow } = useFlow();
  const [tab, setTab] = useState('overview');
  const [report, setReport] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!flow.genId) { nav('/dashboard'); return; }
    api('/generations/' + flow.genId + '/quality')
      .then((d) => setReport(d.report))
      .catch((e) => toast('error', 'Could not load report', e.message));
  }, [flow.genId, nav]);

  if (!report) return <div className="page"><p className="body01 t2">Loading quality report…</p></div>;

  async function applyFix(issueId) {
    try {
      const d = await api('/quality/' + report.id + '/fix', { method: 'POST', body: { issueId } });
      setReport(d.report);
      toast('success', 'Fix applied', 'AI-readiness score is now ' + d.report.aiScore + ' / 100');
    } catch (e) { toast('error', 'Could not apply fix', e.message); }
  }

  async function recheck() {
    setChecking(true);
    try {
      const d = await api('/quality/' + report.id + '/recheck', { method: 'POST' });
      setReport(d.report);
      toast('info', 'AI judge re-confirmed', 'Score verified at ' + d.report.aiScore + ' / 100 against the enterprise guideline set');
    } catch (e) { toast('error', 'Re-check failed', e.message); }
    finally { setChecking(false); }
  }

  const ai = report.aiScore;
  const verdict = report.remaining <= 1 ? ['AI-consumable', 'tag--green']
    : report.remaining <= 3 ? ['Mostly consumable', 'tag--amber']
    : ['Needs work before publishing', 'tag--red'];

  return (
    <>
      <div className="page">
        <h1 className="h04">Quality review</h1>
        <p className="body01 t2 mt3">{report.title} · generated just now</p>

        <div className="tabs mt7">
          {[['overview', 'Overview'], ['links', 'Broken links'], ['style', 'Style guide'], ['ai', 'Check AI consumability']].map(([id, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        {tab === 'overview' && (
          <>
            <div className="grid3">
              <Score label="Overall score" num={Math.min(100, Math.round((ai + 92 + 86) / 3))} helper="Weighted across all checks" kind={ai >= 85 ? 'good' : 'warn'} />
              <Score label="Broken links" num={report.links.length} helper="Of 47 links checked" kind="warn" />
              <Score label="AI-readiness score" num={ai} helper="LLM-judge evaluation" kind={ai >= 85 ? 'good' : 'warn'} />
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
              <Score label="AI-readiness score" num={ai} helper="+6 per resolved issue, cap 100" kind={ai >= 85 ? 'good' : 'warn'} />
              <Score label="Issues remaining" num={report.remaining} helper="Across both categories" kind="info" />
              <Score label="Fixes applied" num={report.fixedCount} helper="Applied to the working draft" kind="good" />
            </div>

            <div className="row row--between mt7" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div className="row">
                <IcInfo />
                <span className="body01">Evaluated by LLM judge, aligned to enterprise documentation guidelines</span>
                <span className={'tag ' + verdict[1]}>{verdict[0]}</span>
              </div>
              <button className="btn btn--tertiary btn--field" disabled={checking} onClick={recheck}>
                {checking ? 'Re-evaluating…' : 'Re-check with AI judge'}
              </button>
            </div>

            {['LLM readiness', 'Consumability'].map((cat) => (
              <div key={cat}>
                <h2 className="h02 mt7 mb3">{cat}</h2>
                <p className="helper mb5">
                  {cat === 'LLM readiness'
                    ? 'Whether AI systems can find, summarize, and cite this document.'
                    : 'Whether individual sections hold up when retrieved out of context.'}
                </p>
                {report.issues.filter((i) => i.cat === cat).map((iss) => (
                  <div key={iss.id} className={'issue' + (iss.fixed ? ' fixed' : '')}>
                    <div className="row row--between">
                      <div className="row">{iss.fixed ? <IcCheck /> : null}<p className="h01">{iss.title}</p></div>
                      <span className={'tag ' + (iss.fixed ? 'tag--green' : 'tag--amber')}>{iss.fixed ? 'Fixed' : 'Open'}</span>
                    </div>
                    <p className="body01 mt3 t2">{iss.body}</p>
                    <p className="ifix"><b>Suggested fix:</b> {iss.fix}</p>
                    {!iss.fixed && (
                      <button className="btn btn--primary btn--sm mt5" onClick={() => applyFix(iss.id)}>Apply fix</button>
                    )}
                  </div>
                ))}
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
