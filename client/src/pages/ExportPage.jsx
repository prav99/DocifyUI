import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, download, getCatalog } from '../api.js';
import { useFlow, toast } from '../store.jsx';
import { NavBar, PreviewFrame, HelpLink, Notif } from '../ui.jsx';
import { buildChips } from './Generate.jsx';
import posthog from '../posthog.js';

/* The three presets are not cosmetic: server-side (adapters/report.js
   REPORT_PRESETS) each one selects a different set of sections, and the
   descriptions below name exactly those sections so the choice is honest. */
const PRESET_LABEL = { executive: 'Executive summary', full: 'Full audit report', technical: 'Technical quality report' };
const PRESETS = [
  ['executive', 'Executive summary', 'Cover, summary, scores, and the recommendation — no finding-by-finding detail.'],
  ['full', 'Full audit report', 'Everything: summary, scores, assistant estimates, rubric findings, link and style findings, applied fixes, recommendation.'],
  ['technical', 'Technical quality report', 'Everything except the executive summary — straight to scores, findings, links, style, and fixes.']
];

export default function ExportPage() {
  const nav = useNavigate();
  const { flow } = useFlow();
  const [gen, setGen] = useState(null);
  const [report, setReport] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [showPrev, setShowPrev] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);   // AI quality report format menu
  const [busyFmt, setBusyFmt] = useState(null);        // format currently generating
  const [preset, setPreset] = useState('full');        // executive | full | technical
  const [cfgOpen, setCfgOpen] = useState(false);       // preset configuration popover
  const [copied, setCopied] = useState(false);         // share-link confirmation
  const [loadErr, setLoadErr] = useState('');          // document fetch failed — not "still loading"
  const [reportErr, setReportErr] = useState('');

  useEffect(() => {
    if (!flow.genId) { nav('/dashboard'); return; }
    let alive = true;
    // Fetched fresh on arrival, so every applied fix is already in what we show.
    api('/generations/' + flow.genId)
      .then((d) => { if (alive) { setGen(d.generation); setLoadErr(''); } })
      .catch((e) => { if (alive) setLoadErr(e.message || 'Request failed'); });
    api('/generations/' + flow.genId + '/quality')
      .then((d) => { if (alive) { setReport(d.report); setReportErr(''); } })
      .catch((e) => { if (alive) setReportErr(e.message || 'Request failed'); });
    getCatalog().then((c) => { if (alive) setCatalog(c); }).catch(() => { /* format labels degrade to the raw id */ });
    return () => { alive = false; };
  }, [flow.genId, nav]);

  if (loadErr && !gen) {
    return (
      <div className="page">
        <h1 className="h04">Export</h1>
        <div className="mt6">
          <Notif kind="error" title="This document could not be loaded">
            {loadErr}. Nothing has been lost — open it again from the Documents tab, or retry from the dashboard.
          </Notif>
        </div>
        <button className="btn btn--tertiary mt5" onClick={() => nav('/history')}>Open Documents<span className="ico">→</span></button>
      </div>
    );
  }
  if (!gen) return <div className="page"><p className="body01 t2">Loading your document…</p></div>;

  const fmtDefn = catalog ? (catalog.formats[gen.track] || []).find((f) => f.id === gen.format) : null;
  const dt = catalog ? (catalog.doctypes[gen.track] || []).find((x) => x.id === gen.docTypes[0]) : null;
  const { chips, accent } = buildChips(gen);
  const overall = report ? (report.overall != null ? report.overall : report.aiScore) : gen.score;
  const gatePassed = report ? !!report.gatePassed : gen.score >= 85;
  const verdict = report ? report.verdict : null;
  const fixedCount = report ? report.fixedCount : 0;
  const totalIssues = report ? (report.issues || []).length : 0;

  async function dl(kind, fmt) {
    try {
      const name = await download('/generations/' + gen.id + '/download' + (kind === 'report' ? '?kind=report&fmt=' + fmt : ''));
      posthog.capture('document_downloaded', {
        format: gen.format,
        quality_score: overall,
        gate_passed: gatePassed,
      });
      toast('success', 'Download started', name);
    } catch (e) {
      posthog.captureException(e, { event: 'document_download_error', format: gen.format });
      toast('error', 'Download failed', e.message);
    }
  }

  // Real share: the report is URL-addressable at /quality/:genId, so copying
  // that link actually gives a teammate the document. Clipboard access can be
  // denied (insecure origin, permission), so failure is reported honestly
  // rather than swallowed behind a success message.
  async function copyReportLink() {
    const url = window.location.origin + '/quality/' + gen.id;
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(url);
      else throw new Error('clipboard unavailable');
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast('success', 'Link copied', 'Opens this report when signed in to this account.');
    } catch {
      toast('info', 'Copy the link manually', url);
    }
  }

  // AI quality report — one data source, three formats, chosen preset.
  async function dlReport(fmt) {
    setMenuOpen(false); setBusyFmt(fmt);
    try {
      const name = await download('/generations/' + gen.id + '/download?kind=report&fmt=' + fmt + '&preset=' + preset);
      posthog.capture('quality_report_downloaded', {
        report_format: fmt,
        report_preset: preset,
        quality_score: overall,
      });
      toast('success', 'Quality report ready', name);
    } catch (e) {
      posthog.captureException(e, { event: 'quality_report_download_error', report_format: fmt });
      toast('error', 'Report generation failed', e.message + ' — try again');
    }
    finally { setBusyFmt(null); }
  }

  return (
    <>
      <div className="page">
        <div className="row row--between" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h1 className="h04">Export</h1>
          <HelpLink topic="export" />
        </div>
        <p className="body01 t2 mt3">
          {typeof overall === 'number' ? 'Overall score ' + overall + ' / 100' : 'Not scored yet'}
          {verdict ? ' · ' + verdict : ''} — every download below is built from the
          latest corrected content, so the fixes you applied are already in.
        </p>

        {/* What you're downloading — full configuration summary */}
        <div className="tile tile--white mt7" style={{ padding: 24 }}>
          <div className="row row--between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h2 className="h02">What you&apos;re downloading</h2>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {verdict && <span className={'tag ' + (gatePassed ? 'tag--green' : 'tag--amber')}>{verdict}</span>}
              {fixedCount > 0 && <span className="tag tag--green">{fixedCount} of {totalIssues} fixes applied ✓</span>}
            </div>
          </div>
          <p className="mono mt5" style={{ fontSize: 15 }}>{gen.title}</p>
          <div className="row mt3" style={{ flexWrap: 'wrap', gap: 6 }}>
            {fmtDefn && <span className="tag tag--blue">{fmtDefn.name}</span>}
            {dt && dt.standard && <span className="tag tag--outline">{dt.standard}</span>}
            {chips.map((c, i) => <span key={c.label + i} className={'tag ' + c.cls}>{c.label}</span>)}
            {accent && (
              <span className="tag tag--outline">
                <span style={{ width: 10, height: 10, background: accent, display: 'inline-block' }} />Accent
              </span>
            )}
          </div>
          <div className="row mt5" style={{ flexWrap: 'wrap' }}>
            <button className="linkbtn" onClick={() => setShowPrev((v) => !v)}>
              {showPrev ? 'Hide final preview' : 'Show final preview'}
            </button>
            <span className="helper">— rendered from exactly the content you are about to download</span>
          </div>
          {showPrev && (
            <div className="prevframe mt5">
              <PreviewFrame title="Final document preview" html={gen.preview || gen.content} />
            </div>
          )}
        </div>

        <div className="grid2 mt5" style={{ alignItems: 'start' }}>
          <div className="tile tile--white" style={{ padding: 24 }}>
            <h2 className="h02 mb5">Downloads</h2>
            <div className="stack">
              <p className="label01 t2" style={{ margin: 0 }}>
                The document{fixedCount > 0 ? ' — with every applied fix already in it' : ''}
              </p>
              <button className="btn btn--primary" style={{ width: '100%' }} onClick={() => dl('doc')}>
                Download {fmtDefn ? fmtDefn.name : gen.format.toUpperCase()}<span className="ico">↓</span>
              </button>
              <p className="label01 t2" style={{ margin: '10px 0 0' }}>A report on this document&apos;s quality</p>
              <div className="qr-split" onKeyDown={(e) => { if (e.key === 'Escape') { setMenuOpen(false); setCfgOpen(false); } }}>
                <button className="btn btn--tertiary qr-split-main" disabled={!report || !!busyFmt}
                  aria-haspopup="menu" aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((o) => !o)}>
                  {busyFmt ? 'Generating ' + busyFmt.toUpperCase() + ' report…'
                    : report ? 'Download quality report' : reportErr ? 'Quality report unavailable' : 'Preparing report…'}
                  <span className="ico">▾</span>
                </button>
                {(menuOpen || cfgOpen) && <div className="qr-scrim" onClick={() => { setMenuOpen(false); setCfgOpen(false); }} />}
                {menuOpen && (
                  <div className="qr-menu" role="menu">
                    <p className="helper" role="presentation" style={{ padding: '6px 12px 2px' }}>Preset: {PRESET_LABEL[preset]}</p>
                    <button className="qr-mi" role="menuitem" onClick={() => dlReport('pdf')}>PDF report<span className="helper">Management-ready, printable</span></button>
                    <button className="qr-mi" role="menuitem" onClick={() => dlReport('html')}>HTML report<span className="helper">Self-contained, responsive</span></button>
                    <button className="qr-mi" role="menuitem" onClick={() => dlReport('pptx')}>PowerPoint presentation<span className="helper">Executive slide deck</span></button>
                    <div className="qr-sep" />
                    <button className="qr-mi" role="menuitem" onClick={() => { setMenuOpen(false); setCfgOpen(true); }}>Configure report…<span className="helper">Change which sections are included</span></button>
                  </div>
                )}
                {cfgOpen && (
                  <div className="qr-cfg-pop" role="dialog" aria-label="Configure report">
                    <div className="row row--between" style={{ alignItems: 'baseline' }}>
                      <b className="body01">Report preset</b>
                      <button className="linkbtn" onClick={() => setCfgOpen(false)}>Done</button>
                    </div>
                    {PRESETS.map(([id, label, desc]) => (
                      <label key={id} className={'qr-preset' + (preset === id ? ' is-on' : '')}>
                        <input type="radio" name="qrpreset" checked={preset === id} onChange={() => setPreset(id)} />
                        <span><b>{label}</b><span className="helper" style={{ display: 'block' }}>{desc}</span></span>
                      </label>
                    ))}
                    <div className="qr-sep" />
                    <p className="helper" style={{ margin: '2px 0 8px' }}>Download {PRESET_LABEL[preset]} as:</p>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn--tertiary btn--sm btn--center" disabled={!!busyFmt} onClick={() => dlReport('pdf')}>PDF</button>
                      <button className="btn btn--tertiary btn--sm btn--center" disabled={!!busyFmt} onClick={() => dlReport('html')}>HTML</button>
                      <button className="btn btn--tertiary btn--sm btn--center" disabled={!!busyFmt} onClick={() => dlReport('pptx')}>PowerPoint</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p className="helper mt5">
              {PRESET_LABEL[preset]}: {(PRESETS.find(([id]) => id === preset) || [, , ''])[2]} PDF, HTML, and
              PowerPoint are rendered from one model, so the numbers cannot differ between them. Scores come
              from the deterministic quality rubric, and the assistant figures are modelled estimates of
              AI-search readiness — not a ranking guarantee.
            </p>
            {reportErr && !report && (
              <div className="mt5">
                <Notif kind="warning" title="The quality report is not available for this document">
                  {reportErr}. The document downloads above are unaffected.
                </Notif>
              </div>
            )}
          </div>
          <div className="tile tile--white" style={{ padding: 24 }}>
            <h2 className="h02 mb5">Keep it current</h2>
            <p className="body01 t2">Documents drift the moment code merges. Regenerate automatically on every merge to main and gate publishing on the quality score.</p>
            <button className="btn btn--tertiary mt5" onClick={() => nav('/automation')}>
              Set up auto-regenerate on merge<span className="ico">→</span>
            </button>
            <div className="divider" style={{ margin: '24px 0' }} />
            <h2 className="h02 mb3">Link to this report</h2>
            {/* This used to claim it emailed a link while sending nothing.
                Every report is scoped to the account that generated it, so the
                link only opens for THIS account — promising teammates could
                open it would replace one false claim with another. To hand the
                report to someone else, download it below and send the file. */}
            <p className="helper mb5">Copies a direct link to this quality report. It opens when you are signed in to this account — to give it to someone else, download the report above and send the file.</p>
            <button className="btn btn--tertiary btn--field" onClick={copyReportLink}>
              {copied ? 'Link copied ✓' : 'Copy quality report link'}
            </button>
          </div>
        </div>
      </div>
      <NavBar back="/quality" next="/pricing" />
    </>
  );
}
