/* =====================================================================
   AI Quality Report — export generators (HTML · PDF · PowerPoint)

   ONE data source, three renderers. buildReportModel() normalizes the
   Step-5 quality report (serializeReport output) into a management-ready
   model; every format renders from that exact model, so the overall
   score, dimension scores, finding counts, fix status, link and style
   results, and publish-readiness are identical across PDF, HTML and PPTX.

   Presets (executive / full / technical) only change which SECTIONS are
   included and the depth — never the numbers.
   ===================================================================== */
import PDFDocument from 'pdfkit';
import PptxGenJS from 'pptxgenjs';

/* ---------- shared helpers ---------- */
const escX = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const COL = { brand: '#0f62fe', ok: '#24a148', warn: '#8e6a00', warnBg: '#fcf4d6', bad: '#da1e28', ink: '#161616', mut: '#525252', line: '#e0e0e0', panel: '#f4f4f4' };
const scoreColor = (n, gate = 85) => (n >= gate ? COL.ok : n >= 70 ? COL.warn : COL.bad);
const riskLevel = (n, gate = 85) => (n >= gate ? 'Low' : n >= 70 ? 'Medium' : 'High');

/* ---------- presets: which sections, how deep ---------- */
export const REPORT_PRESETS = {
  executive: { label: 'Executive summary', sections: ['cover', 'exec', 'scores', 'recommendation'] },
  full: { label: 'Full audit report', sections: ['cover', 'exec', 'scores', 'assistants', 'judge', 'links', 'style', 'fixes', 'recommendation'] },
  technical: { label: 'Technical quality report', sections: ['cover', 'scores', 'assistants', 'judge', 'links', 'style', 'fixes', 'recommendation'] }
};
const presetOf = (p) => REPORT_PRESETS[p] || REPORT_PRESETS.full;
const has = (preset, s) => presetOf(preset).sections.includes(s);

/* ---------- traceable, professional file names ---------- */
export function traceableReportName(meta = {}, fmt = 'pdf', preset = 'full') {
  const ext = ({ pdf: 'pdf', html: 'html', pptx: 'pptx', json: 'json' })[fmt] || fmt;
  const repo = slug((meta.repo || 'docifyui').split('/').pop());
  const kind = preset === 'executive' ? 'ai-quality-executive-summary' : 'ai-quality-report';
  const id = meta.pr ? slug(meta.pr)
    : meta.commit ? String(meta.commit).slice(0, 7)
      : meta.version ? 'v' + meta.version
        : new Date().toISOString().slice(0, 10);
  return [repo, kind, id].filter(Boolean).join('-') + '.' + ext;
}

/* ---------- the single normalized model every format renders ---------- */
export function buildReportModel(ser, meta = {}) {
  const gate = ser.gate || 85;
  const dims = (ser.dimensions || []).map((d) => ({
    id: d.id, name: d.name, score: d.score, weight: Math.round((d.weight || 0) * 100),
    open: d.open, total: d.total, desc: d.desc || '', pass: d.score >= gate
  }));
  const byId = Object.fromEntries(dims.map((d) => [d.id, d]));
  const dimScore = (id) => (byId[id] ? byId[id].score : ser.overall);
  const assistants = (ser.assistants || []).map((a) => ({
    name: a.name, score: a.score, probability: a.probability != null ? a.probability : a.score,
    ready: a.ready, heldBackBy: a.heldBackBy || ''
  }));
  const aiReadiness = assistants.length
    ? Math.round(assistants.reduce((s, a) => s + a.probability, 0) / assistants.length) : ser.overall;
  const issues = (ser.issues || []).map((i) => ({
    title: i.title || i.id || 'Finding', cat: i.cat || '', dim: i.dim || '', target: i.target || '',
    body: i.body || '', fix: i.fix || '', before: i.before || '', after: i.after || '', fixed: !!i.fixed,
    severity: i.fixed ? 'Resolved' : (i.dim === 'llm' || i.dim === 'completeness' ? 'High' : 'Medium')
  }));
  const fixed = issues.filter((i) => i.fixed);
  const open = issues.filter((i) => !i.fixed);
  const strengths = [...dims].sort((a, b) => b.score - a.score).filter((d) => d.score >= gate)
    .slice(0, 3).map((d) => d.name + ' (' + d.score + ')');
  const risks = [...dims].sort((a, b) => a.score - b.score).filter((d) => d.score < gate || d.open > 0)
    .slice(0, 3).map((d) => d.name + ' (' + d.score + (d.open ? ', ' + d.open + ' open' : '') + ')');
  const nextAction = ser.gatePassed
    ? 'Publish — the document meets the quality gate and is ready for AI retrieval.'
    : (open.length > 0
      ? 'Resolve ' + open.length + ' open finding' + (open.length === 1 ? '' : 's') + ', then re-run the AI quality review.'
      : 'Review the flagged dimensions before publishing.');
  return {
    meta: {
      title: meta.title || ser.title || 'Document',
      repo: meta.repo || '', branch: meta.branch || '', commit: meta.commit || '', pr: meta.pr || '',
      docType: meta.docType || '', format: String(meta.format || '').toUpperCase(),
      version: meta.version || null,
      reviewStatus: meta.reviewStatus || (ser.gatePassed ? 'Publish-ready' : 'Review recommended'),
      reviewer: meta.reviewer || '', generatedAt: new Date().toISOString(), gate
    },
    score: {
      overall: ser.overall, verdict: ser.verdict, gate, gatePassed: ser.gatePassed,
      aiSearchReadiness: dimScore('llm'), llmReadiness: dimScore('llm'), aiReadiness,
      dims
    },
    assistants,
    exec: {
      overall: ser.overall, verdict: ser.verdict, gatePassed: ser.gatePassed,
      strengths: strengths.length ? strengths : ['—'],
      risks: risks.length ? risks : ['No dimension below the gate'],
      findingsTotal: issues.length, fixesApplied: fixed.length, unresolved: open.length,
      gateResult: ser.gatePassed ? 'Passed (≥ ' + gate + ')' : 'Not met (< ' + gate + ')',
      aiReadiness: aiReadiness + '% average across ChatGPT, Claude and Gemini',
      nextAction
    },
    findings: issues,
    links: { items: (ser.links || []).map((l) => ({ url: l.url, file: l.file, status: l.status, why: l.why })), total: (ser.links || []).length },
    style: { items: (ser.style || []).map((s) => ({ t: s.t, pass: !!s.pass, d: s.d })), fails: (ser.style || []).filter((s) => !s.pass).length },
    fixes: { applied: fixed.length, open: open.length, items: fixed },
    recommendation: {
      publishReady: ser.gatePassed,
      blocking: open.filter((i) => i.severity === 'High').map((i) => i.title).slice(0, 6),
      nextSteps: ser.gatePassed
        ? ['Publish or export the document in the required formats.', 'Set up auto-regenerate on merge to keep it current.']
        : ['Resolve the open findings listed in this report.', 'Re-run the AI quality review to revalidate.', 'Confirm the quality gate passes, then approve and publish.'],
      approvalStatus: meta.reviewStatus || (ser.gatePassed ? 'Publish-ready' : 'Pending review'),
      reviewer: meta.reviewer || '', date: new Date().toISOString().slice(0, 10)
    }
  };
}

/* small formatting helpers shared by renderers */
const metaLine = (m) => [
  m.repo && ('Repository: ' + m.repo), m.branch && ('Branch: ' + m.branch),
  m.pr && ('PR: ' + m.pr), m.commit && ('Commit: ' + String(m.commit).slice(0, 7)),
  m.version && ('Version: v' + m.version), m.docType && ('Type: ' + m.docType),
  m.format && ('Format: ' + m.format)
].filter(Boolean);

/* =====================================================================
   HTML — self-contained, responsive, print-friendly, navigable
   ===================================================================== */
export function renderReportHtml(model, opts = {}) {
  const preset = opts.preset || 'full';
  const m = model.meta; const sc = model.score; const ex = model.exec;
  const vColor = sc.gatePassed ? COL.ok : sc.overall >= 70 ? COL.warn : COL.bad;
  const chip = (t, c) => '<span class="chip" style="background:' + c + '1a;color:' + c + '">' + escX(t) + '</span>';
  const bar = (n) => '<span class="bar"><span class="bar-f" style="width:' + Math.max(2, n) + '%;background:' + scoreColor(n, sc.gate) + '"></span></span>';
  const sec = [];
  const nav = [];
  const add = (id, title, html) => { nav.push('<a href="#' + id + '">' + escX(title) + '</a>'); sec.push('<section id="' + id + '"><h2>' + escX(title) + '</h2>' + html + '</section>'); };

  // cover / header
  const cover =
    '<div class="cover">' +
    '<div class="brand"><span class="logo">Docify</span><span class="rt">AI Quality Report</span></div>' +
    '<h1>' + escX(m.title) + '</h1>' +
    '<div class="meta">' + metaLine(m).map((x) => '<span>' + escX(x) + '</span>').join('') + '</div>' +
    '<div class="cover-score"><div class="ring" style="--c:' + vColor + '">' + sc.overall + '<small>/100</small></div>' +
    '<div><div class="verdict" style="color:' + vColor + '">' + escX(sc.verdict) + '</div>' +
    '<div class="muted">Review status: ' + escX(m.reviewStatus) + ' · Quality gate ≥ ' + sc.gate + ' · Generated ' + m.generatedAt.slice(0, 10) + '</div></div></div>' +
    '</div>';

  if (has(preset, 'exec')) {
    add('exec', 'Executive summary',
      '<div class="cards">' +
      '<div class="card"><span class="k">Overall score</span><span class="v" style="color:' + vColor + '">' + ex.overall + '</span></div>' +
      '<div class="card"><span class="k">Publish-readiness</span><span class="v">' + escX(ex.gatePassed ? 'Ready' : 'Not ready') + '</span></div>' +
      '<div class="card"><span class="k">Findings</span><span class="v">' + ex.findingsTotal + '</span></div>' +
      '<div class="card"><span class="k">Fixes applied</span><span class="v">' + ex.fixesApplied + '</span></div>' +
      '<div class="card"><span class="k">Unresolved</span><span class="v">' + ex.unresolved + '</span></div>' +
      '<div class="card"><span class="k">Quality gate</span><span class="v">' + escX(ex.gateResult) + '</span></div>' +
      '</div>' +
      '<div class="two"><div><h3>Key strengths</h3><ul>' + ex.strengths.map((s) => '<li>' + escX(s) + '</li>').join('') + '</ul></div>' +
      '<div><h3>Main risks</h3><ul>' + ex.risks.map((s) => '<li>' + escX(s) + '</li>').join('') + '</ul></div></div>' +
      '<p class="callout"><b>AI-readiness:</b> ' + escX(ex.aiReadiness) + '</p>' +
      '<p class="callout next"><b>Recommended next action:</b> ' + escX(ex.nextAction) + '</p>');
  }

  if (has(preset, 'scores')) {
    const keyScores = [
      ['Overall quality', sc.overall], ['AI Search Readiness', sc.aiSearchReadiness], ['LLM readiness', sc.llmReadiness],
      ...sc.dims.map((d) => [d.name, d.score])
    ];
    add('scores', 'Score overview',
      '<table class="scores"><thead><tr><th>Dimension</th><th>Score</th><th></th><th>Weight</th><th>Open</th><th>Status</th></tr></thead><tbody>' +
      sc.dims.map((d) => '<tr><td>' + escX(d.name) + '<div class="muted sm">' + escX(d.desc) + '</div></td><td class="num">' + d.score + '</td><td class="barcell">' + bar(d.score) + '</td><td class="num">' + d.weight + '%</td><td class="num">' + d.open + '</td><td>' + chip(d.pass ? 'Pass' : 'Review', d.pass ? COL.ok : COL.warn) + '</td></tr>').join('') +
      '</tbody></table>');
  }

  if (has(preset, 'assistants') && model.assistants.length) {
    add('assistants', 'AI assistant readiness',
      '<p class="muted">Modeled from the dimension scores and each assistant’s retrieval profile. No live calls are made to third-party assistants.</p>' +
      '<table><thead><tr><th>Assistant</th><th>Score</th><th>Likelihood</th><th>Status</th><th>Held back by</th></tr></thead><tbody>' +
      model.assistants.map((a) => '<tr><td>' + escX(a.name) + '</td><td class="num">' + a.score + '</td><td class="num">' + a.probability + '%</td><td>' + chip(a.ready ? 'Likely to land' : 'At risk', a.ready ? COL.ok : COL.warn) + '</td><td>' + escX(a.heldBackBy || '—') + '</td></tr>').join('') +
      '</tbody></table>');
  }

  if (has(preset, 'judge')) {
    add('judge', 'AI judge review',
      '<div class="tools"><input id="ffilter" placeholder="Filter findings…" oninput="fF(this.value)"/><span class="muted">' + model.findings.length + ' findings</span></div>' +
      model.findings.map((i) =>
        '<details class="finding" data-t="' + escX((i.title + ' ' + i.cat + ' ' + i.body).toLowerCase()) + '"' + (i.fixed ? '' : ' open') + '>' +
        '<summary>' + chip(i.fixed ? 'Resolved' : i.severity + ' · Open', i.fixed ? COL.ok : (i.severity === 'High' ? COL.bad : COL.warn)) +
        ' <b>' + escX(i.title) + '</b> <span class="muted sm">' + escX(i.cat) + (i.target ? ' · ' + escX(i.target) : '') + '</span></summary>' +
        '<p>' + escX(i.body) + '</p>' +
        (i.fixed && (i.before || i.after)
          ? (i.before ? '<div class="del">− ' + escX(i.before) + '</div>' : '') + (i.after ? '<div class="ins">+ ' + escX(i.after) + '</div>' : '')
          : '<p class="muted"><b>Suggested fix:</b> ' + escX(i.fix) + '</p>') +
        '</details>').join(''));
  }

  if (has(preset, 'links')) {
    add('links', 'Broken-link analysis',
      '<p class="muted">' + model.links.total + ' issue' + (model.links.total === 1 ? '' : 's') + ' flagged.</p>' +
      (model.links.total === 0 ? '<p class="ok-note">✓ No broken links detected.</p>' :
        '<table><thead><tr><th>URL</th><th>Location</th><th>Status</th><th>Recommended correction</th></tr></thead><tbody>' +
        model.links.items.map((l) => '<tr><td><code>' + escX(l.url) + '</code></td><td>' + escX(l.file) + '</td><td>' + chip(escX(l.status), COL.bad) + '</td><td>' + escX(l.why) + '</td></tr>').join('') +
        '</tbody></table>'));
  }

  if (has(preset, 'style')) {
    add('style', 'Style-guide compliance',
      '<p class="muted">' + (model.style.items.length - model.style.fails) + ' passed · ' + model.style.fails + ' to review.</p>' +
      '<table><thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead><tbody>' +
      model.style.items.map((s) => '<tr><td>' + escX(s.t) + '</td><td>' + chip(s.pass ? 'Pass' : 'Review', s.pass ? COL.ok : COL.warn) + '</td><td>' + escX(s.d) + '</td></tr>').join('') +
      '</tbody></table>');
  }

  if (has(preset, 'fixes')) {
    add('fixes', 'Fixes & change summary',
      '<div class="cards"><div class="card"><span class="k">Applied</span><span class="v">' + model.fixes.applied + '</span></div>' +
      '<div class="card"><span class="k">Still open</span><span class="v">' + model.fixes.open + '</span></div></div>' +
      (model.fixes.items.length === 0 ? '<p class="muted">No fixes applied.</p>' :
        model.fixes.items.map((i) => '<div class="fix"><b>' + escX(i.title) + '</b> <span class="muted sm">' + escX(i.target) + '</span>' +
          (i.before ? '<div class="del">− ' + escX(i.before) + '</div>' : '') + (i.after ? '<div class="ins">+ ' + escX(i.after) + '</div>' : '') + '</div>').join('')));
  }

  const rec = model.recommendation;
  add('recommendation', 'Final recommendation',
    '<div class="verdict-box" style="border-color:' + vColor + '"><b style="color:' + vColor + '">' + (rec.publishReady ? 'PUBLISH-READY' : 'NOT PUBLISH-READY') + '</b>' +
    '<div class="muted">Approval status: ' + escX(rec.approvalStatus) + (rec.reviewer ? ' · Reviewer: ' + escX(rec.reviewer) : '') + ' · ' + escX(rec.date) + '</div></div>' +
    (rec.blocking.length ? '<h3>Blocking issues</h3><ul>' + rec.blocking.map((b) => '<li>' + escX(b) + '</li>').join('') + '</ul>' : '') +
    '<h3>Recommended next steps</h3><ol>' + rec.nextSteps.map((s) => '<li>' + escX(s) + '</li>').join('') + '</ol>');

  const css = `
:root{--ink:${COL.ink};--mut:${COL.mut};--line:${COL.line};--brand:${COL.brand}}
*{box-sizing:border-box}body{font-family:'IBM Plex Sans',-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);margin:0;line-height:1.5;background:#fff}
.wrap{display:flex;max-width:1180px;margin:0 auto}
nav{position:sticky;top:0;align-self:flex-start;width:230px;padding:24px 16px;height:100vh;overflow:auto;border-right:1px solid var(--line)}
nav b{font-size:12px;letter-spacing:.4px;color:var(--mut);text-transform:uppercase}
nav a{display:block;padding:7px 10px;color:var(--ink);text-decoration:none;border-radius:6px;font-size:14px}
nav a:hover{background:${COL.panel}}
main{flex:1;padding:32px 40px;min-width:0}
h1{font-size:30px;margin:.2em 0}h2{font-size:21px;margin:1.6em 0 .6em;padding-bottom:6px;border-bottom:2px solid var(--line)}h3{font-size:15px;margin:1.2em 0 .4em}
.cover{padding:24px 0 8px;border-bottom:3px solid var(--brand)}
.brand{display:flex;align-items:baseline;gap:12px}.logo{font-weight:700;font-size:22px;color:var(--brand)}.rt{color:var(--mut);letter-spacing:.5px;text-transform:uppercase;font-size:13px}
.meta{display:flex;flex-wrap:wrap;gap:8px 18px;color:var(--mut);font-size:13px;margin:6px 0 16px}
.cover-score{display:flex;align-items:center;gap:20px;margin:8px 0 4px}
.ring{width:96px;height:96px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:32px;font-family:'IBM Plex Mono',monospace;border:6px solid var(--c);color:var(--c)}.ring small{font-size:11px;color:var(--mut)}
.verdict{font-size:20px;font-weight:600}
.muted{color:var(--mut)}.sm{font-size:12px}
.cards{display:flex;flex-wrap:wrap;gap:12px;margin:8px 0}
.card{flex:1;min-width:130px;background:${COL.panel};border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:2px}
.card .k{font-size:12px;color:var(--mut)}.card .v{font-size:24px;font-family:'IBM Plex Mono',monospace}
.two{display:grid;grid-template-columns:1fr 1fr;gap:20px}.two ul{margin:.2em 0;padding-left:18px}
.callout{background:${COL.panel};border-left:3px solid var(--brand);padding:10px 14px;border-radius:0 6px 6px 0}.callout.next{border-color:${COL.ok}}
.chip{display:inline-block;padding:1px 9px;border-radius:12px;font-size:12px;font-weight:600;white-space:nowrap}
table{width:100%;border-collapse:collapse;margin:8px 0;font-size:14px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:var(--mut)}
.num{text-align:right;font-family:'IBM Plex Mono',monospace}.barcell{width:120px}
.bar{display:inline-block;width:110px;height:8px;background:${COL.line};border-radius:4px;overflow:hidden;vertical-align:middle}.bar-f{display:block;height:100%}
code{font-family:'IBM Plex Mono',monospace;font-size:12px;background:${COL.panel};padding:1px 5px;border-radius:4px}
.finding{border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin:8px 0}.finding summary{cursor:pointer;list-style:none}.finding summary::-webkit-details-marker{display:none}
.del{color:#a2191f;background:#fff1f1;padding:3px 8px;border-radius:4px;display:block;margin:4px 0;font-size:13px;text-decoration:line-through}
.ins{color:#0e6027;background:#defbe6;padding:3px 8px;border-radius:4px;display:block;margin:2px 0;font-size:13px}
.fix{border-left:3px solid var(--line);padding:6px 12px;margin:10px 0}
.ok-note{color:#0e6027;font-weight:600}
.verdict-box{border:2px solid;border-radius:8px;padding:14px 16px;margin:8px 0}.verdict-box b{font-size:18px}
.tools{display:flex;gap:12px;align-items:center;margin:6px 0}.tools input{flex:1;max-width:320px;padding:8px 12px;border:1px solid var(--line);border-radius:6px;font:inherit}
@media(max-width:820px){.wrap{flex-direction:column}nav{position:static;width:auto;height:auto;border-right:0;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:4px}main{padding:20px}.two{grid-template-columns:1fr}}
@media print{nav{display:none}main{padding:0}.finding{break-inside:avoid}section{break-inside:avoid}a[href]:after{content:''}}
`;
  const js = "function fF(q){q=(q||'').toLowerCase();document.querySelectorAll('.finding').forEach(function(el){el.style.display=el.getAttribute('data-t').indexOf(q)>=0?'':'none';});}";
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>' +
    '<title>AI Quality Report — ' + escX(m.title) + '</title><style>' + css + '</style></head><body>' +
    '<div class="wrap"><nav><b>Contents</b>' + nav.join('') + '</nav><main>' + cover + sec.join('') +
    '<p class="muted sm" style="margin-top:32px;border-top:1px solid ' + COL.line + ';padding-top:12px">Produced by the Docify AI quality auditor · ' + escX(m.generatedAt) + ' · All formats of this report share one data source.</p>' +
    '</main></div><script>' + js + '</script></body></html>';
}

/* =====================================================================
   PDF — pdfkit. Cover, contents + bookmarks, page numbers, headers/
   footers, scorecards, tables, section hierarchy. No headless browser.
   ===================================================================== */
const hexToRgb = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export function renderReportPdf(model, opts = {}) {
  const preset = opts.preset || 'full';
  const m = model.meta; const sc = model.score;
  const doc = new PDFDocument({ size: 'A4', margin: 54, bufferPages: true, info: { Title: 'AI Quality Report — ' + m.title, Author: 'Docify' } });
  const chunks = [];
  const done = new Promise((resolve, reject) => { doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  const L = doc.page.margins.left; const R = doc.page.width - doc.page.margins.right; const W = R - L;
  const contents = [];
  const H2 = (t) => {
    if (doc.y > doc.page.height - 160) doc.addPage();
    contents.push({ t, p: doc.bufferedPageRange().count });
    try { doc.outline.addItem(t); } catch { /* ignore */ }
    doc.moveDown(0.6).fillColor(COL.ink).font('Helvetica-Bold').fontSize(15).text(t);
    doc.moveTo(L, doc.y + 2).lineTo(R, doc.y + 2).strokeColor(COL.line).lineWidth(1).stroke();
    doc.moveDown(0.6).font('Helvetica').fontSize(10).fillColor(COL.ink);
  };
  const P = (t, o = {}) => doc.font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(o.size || 10).fillColor(o.color || COL.ink).text(t, { width: W, ...o });
  const chipPdf = (label, color, x, y) => {
    const w = doc.widthOfString(label) + 12; const [r, g, b] = hexToRgb(color);
    doc.save().roundedRect(x, y, w, 15, 7).fillColor(color).opacity(0.14).fill().restore();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(color).text(label, x + 6, y + 3.5); doc.fillColor(COL.ink);
    return w;
  };
  const scoreBar = (label, n, y) => {
    doc.font('Helvetica').fontSize(9).fillColor(COL.ink).text(label, L, y, { width: 160 });
    const bx = L + 170; const bw = W - 220;
    doc.roundedRect(bx, y + 1, bw, 9, 2).fillColor(COL.line).fill();
    doc.roundedRect(bx, y + 1, Math.max(3, bw * n / 100), 9, 2).fillColor(scoreColor(n, sc.gate)).fill();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COL.ink).text(String(n), R - 34, y, { width: 34, align: 'right' });
    return y + 16;
  };
  const table = (headers, rows, widths) => {
    const colX = []; let x = L; widths.forEach((w) => { colX.push(x); x += w * W; });
    const row = (cells, opt = {}) => {
      const startY = doc.y; let maxH = 0;
      cells.forEach((c, i) => { const w = widths[i] * W - 8; doc.font(opt.head ? 'Helvetica-Bold' : 'Helvetica').fontSize(opt.head ? 8 : 9); maxH = Math.max(maxH, doc.heightOfString(String(c), { width: w })); });
      if (startY + maxH > doc.page.height - 70) { doc.addPage(); }
      const y0 = doc.y;
      cells.forEach((c, i) => { const w = widths[i] * W - 8; doc.font(opt.head ? 'Helvetica-Bold' : 'Helvetica').fontSize(opt.head ? 8 : 9).fillColor(opt.head ? COL.mut : COL.ink).text(String(c), colX[i], y0, { width: w }); });
      doc.y = y0 + maxH + 6;
      doc.moveTo(L, doc.y - 3).lineTo(R, doc.y - 3).strokeColor(COL.line).lineWidth(0.5).stroke();
    };
    row(headers, { head: true }); rows.forEach((r) => row(r));
    doc.moveDown(0.4);
  };

  /* cover */
  doc.rect(0, 0, doc.page.width, 6).fillColor(COL.brand).fill();
  doc.font('Helvetica-Bold').fontSize(22).fillColor(COL.brand).text('Docify', L, 70);
  doc.font('Helvetica').fontSize(11).fillColor(COL.mut).text('AI QUALITY REPORT', L, 100);
  doc.font('Helvetica-Bold').fontSize(24).fillColor(COL.ink).text(m.title, L, 140, { width: W });
  doc.moveDown(0.5).font('Helvetica').fontSize(10).fillColor(COL.mut);
  metaLine(m).forEach((x) => doc.text(x));
  const cy = doc.y + 24; const vColor = sc.gatePassed ? COL.ok : sc.overall >= 70 ? COL.warn : COL.bad;
  doc.save().lineWidth(6).strokeColor(vColor).circle(L + 46, cy + 46, 42).stroke().restore();
  doc.font('Helvetica-Bold').fontSize(30).fillColor(vColor).text(String(sc.overall), L + 12, cy + 30, { width: 68, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(16).fillColor(vColor).text(sc.verdict, L + 110, cy + 24);
  doc.font('Helvetica').fontSize(10).fillColor(COL.mut).text('Review status: ' + m.reviewStatus + '   |   Quality gate ≥ ' + sc.gate + '   |   Generated ' + m.generatedAt.slice(0, 10), L + 110, cy + 48, { width: W - 110 });
  doc.addPage();

  /* exec */
  if (has(preset, 'exec')) {
    const ex = model.exec; H2('Executive summary');
    let y = doc.y; const cards = [['Overall', ex.overall], ['Fixes applied', ex.fixesApplied], ['Unresolved', ex.unresolved], ['Findings', ex.findingsTotal]];
    const cw = W / 4;
    cards.forEach((c, i) => { doc.roundedRect(L + i * cw, y, cw - 8, 46, 4).fillColor(COL.panel).fill(); doc.font('Helvetica').fontSize(8).fillColor(COL.mut).text(c[0], L + i * cw + 8, y + 7); doc.font('Helvetica-Bold').fontSize(18).fillColor(COL.ink).text(String(c[1]), L + i * cw + 8, y + 20); });
    doc.y = y + 58; doc.fillColor(COL.ink);
    P('Publish-readiness: ' + (ex.gatePassed ? 'Ready' : 'Not ready') + '  ·  Quality gate: ' + ex.gateResult + '  ·  AI-readiness: ' + ex.aiReadiness, { size: 10 });
    doc.moveDown(0.4); P('Key strengths', { bold: true, size: 11 }); ex.strengths.forEach((s) => P('•  ' + s));
    doc.moveDown(0.2); P('Main risks', { bold: true, size: 11 }); ex.risks.forEach((s) => P('•  ' + s));
    doc.moveDown(0.3); doc.roundedRect(L, doc.y, W, 0.1, 0);
    P('Recommended next action: ' + ex.nextAction, { bold: true, size: 10, color: COL.brand });
  }

  /* scores */
  if (has(preset, 'scores')) {
    H2('Score overview');
    let y = doc.y;
    y = scoreBar('Overall quality', sc.overall, y);
    y = scoreBar('AI Search Readiness', sc.aiSearchReadiness, y);
    y = scoreBar('LLM readiness', sc.llmReadiness, y);
    sc.dims.forEach((d) => { if (y > doc.page.height - 90) { doc.addPage(); y = doc.y; } y = scoreBar(d.name, d.score, y); });
    doc.y = y + 6;
    table(['Dimension', 'Score', 'Weight', 'Open', 'Status'],
      sc.dims.map((d) => [d.name, String(d.score), d.weight + '%', String(d.open), d.pass ? 'Pass' : 'Review']),
      [0.4, 0.14, 0.16, 0.14, 0.16]);
  }

  if (has(preset, 'assistants') && model.assistants.length) {
    H2('AI assistant readiness');
    table(['Assistant', 'Score', 'Likelihood', 'Status', 'Held back by'],
      model.assistants.map((a) => [a.name, String(a.score), a.probability + '%', a.ready ? 'Likely' : 'At risk', a.heldBackBy || '—']),
      [0.24, 0.13, 0.17, 0.16, 0.3]);
  }

  if (has(preset, 'judge')) {
    H2('AI judge review');
    model.findings.forEach((i) => {
      if (doc.y > doc.page.height - 120) doc.addPage();
      const cw = chipPdf(i.fixed ? 'RESOLVED' : (i.severity.toUpperCase() + ' · OPEN'), i.fixed ? COL.ok : (i.severity === 'High' ? COL.bad : COL.warn), L, doc.y);
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(COL.ink).text(i.title, L + cw + 8, doc.y, { width: W - cw - 8 });
      doc.font('Helvetica').fontSize(8).fillColor(COL.mut).text(i.cat + (i.target ? ' · ' + i.target : ''), { width: W });
      doc.font('Helvetica').fontSize(9.5).fillColor(COL.ink).text(i.body, { width: W });
      if (i.fixed && (i.before || i.after)) {
        if (i.before) doc.font('Helvetica').fontSize(9).fillColor('#a2191f').text('− ' + i.before, { width: W });
        if (i.after) doc.font('Helvetica').fontSize(9).fillColor('#0e6027').text('+ ' + i.after, { width: W });
      } else if (i.fix) { doc.font('Helvetica-Oblique').fontSize(9).fillColor(COL.mut).text('Suggested fix: ' + i.fix, { width: W }); }
      doc.fillColor(COL.ink).moveDown(0.5);
    });
  }

  if (has(preset, 'links')) {
    H2('Broken-link analysis');
    if (model.links.total === 0) P('✓ No broken links detected.', { color: COL.ok, bold: true });
    else table(['URL', 'Location', 'Status', 'Correction'], model.links.items.map((l) => [l.url, l.file, l.status, l.why]), [0.3, 0.2, 0.15, 0.35]);
  }
  if (has(preset, 'style')) {
    H2('Style-guide compliance');
    table(['Check', 'Status', 'Detail'], model.style.items.map((s) => [s.t, s.pass ? 'Pass' : 'Review', s.d]), [0.3, 0.14, 0.56]);
  }
  if (has(preset, 'fixes')) {
    H2('Fixes & change summary');
    P('Applied: ' + model.fixes.applied + '   ·   Still open: ' + model.fixes.open, { bold: true });
    doc.moveDown(0.3);
    model.fixes.items.forEach((i) => {
      if (doc.y > doc.page.height - 100) doc.addPage();
      P(i.title + (i.target ? '  (' + i.target + ')' : ''), { bold: true, size: 9.5 });
      if (i.before) doc.font('Helvetica').fontSize(9).fillColor('#a2191f').text('− ' + i.before, { width: W });
      if (i.after) doc.font('Helvetica').fontSize(9).fillColor('#0e6027').text('+ ' + i.after, { width: W });
      doc.fillColor(COL.ink).moveDown(0.3);
    });
  }

  /* recommendation */
  const rec = model.recommendation; H2('Final recommendation');
  doc.roundedRect(L, doc.y, W, 30, 4).lineWidth(1.5).strokeColor(vColor).stroke();
  doc.font('Helvetica-Bold').fontSize(13).fillColor(vColor).text(rec.publishReady ? 'PUBLISH-READY' : 'NOT PUBLISH-READY', L + 10, doc.y + 8);
  doc.y += 38; doc.fillColor(COL.ink);
  P('Approval status: ' + rec.approvalStatus + (rec.reviewer ? '  ·  Reviewer: ' + rec.reviewer : '') + '  ·  ' + rec.date, { size: 9, color: COL.mut });
  if (rec.blocking.length) { doc.moveDown(0.3); P('Blocking issues', { bold: true, size: 11 }); rec.blocking.forEach((b) => P('•  ' + b)); }
  doc.moveDown(0.3); P('Recommended next steps', { bold: true, size: 11 });
  rec.nextSteps.forEach((s, i) => P((i + 1) + '.  ' + s));

  /* footers + page numbers + contents page refs */
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(8).fillColor(COL.mut);
    doc.text('Docify · AI Quality Report · ' + m.title, L, doc.page.height - 34, { width: W - 80, lineBreak: false });
    doc.text('Page ' + (i + 1) + ' of ' + range.count, R - 80, doc.page.height - 34, { width: 80, align: 'right', lineBreak: false });
    if (i > 0) doc.text('Confidential', L, 28, { width: W, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}

/* =====================================================================
   PowerPoint — pptxgenjs. Executive deck, NOT screenshots.
   ===================================================================== */
export function renderReportPptx(model, opts = {}) {
  const preset = opts.preset || 'full';
  const m = model.meta; const sc = model.score; const ex = model.exec;
  const p = new PptxGenJS();
  p.defineLayout({ name: 'W', width: 13.333, height: 7.5 }); p.layout = 'W';
  const BR = '0F62FE'; const INK = '161616'; const MUT = '525252'; const OK = '24A148'; const WN = '8E6A00'; const BAD = 'DA1E28'; const PANEL = 'F4F4F4';
  const vHex = sc.gatePassed ? OK : sc.overall >= 70 ? WN : BAD;
  const bar = (h) => String(h).replace('#', '');
  const foot = (s) => s.addText('Docify · AI Quality Report · Confidential', { x: 0.4, y: 7.05, w: 12.5, fontSize: 9, color: MUT });
  const title = (s, t, sub) => { s.addText(t, { x: 0.5, y: 0.35, w: 12.3, fontSize: 26, bold: true, color: INK }); if (sub) s.addText(sub, { x: 0.5, y: 1.0, w: 12.3, fontSize: 13, color: MUT }); s.addShape(p.ShapeType.line, { x: 0.5, y: 1.45, w: 12.3, h: 0, line: { color: 'E0E0E0', width: 1 } }); };

  // 1 title
  let s = p.addSlide(); s.background = { color: 'FFFFFF' };
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.18, fill: { color: BR } });
  s.addText('Docify', { x: 0.6, y: 0.7, fontSize: 22, bold: true, color: BR });
  s.addText('AI QUALITY REPORT', { x: 0.6, y: 1.25, fontSize: 14, color: MUT, charSpacing: 2 });
  s.addText(m.title, { x: 0.6, y: 2.2, w: 12, fontSize: 36, bold: true, color: INK });
  s.addText(metaLine(m).join('    ·    '), { x: 0.6, y: 3.5, w: 12, fontSize: 13, color: MUT });
  s.addText([{ text: String(sc.overall), options: { fontSize: 54, bold: true, color: vHex } }, { text: ' /100  ' + sc.verdict, options: { fontSize: 20, color: vHex } }], { x: 0.6, y: 4.4, w: 12 });
  s.addText('Review status: ' + m.reviewStatus + '   ·   Quality gate ≥ ' + sc.gate + '   ·   Generated ' + m.generatedAt.slice(0, 10), { x: 0.6, y: 5.6, w: 12, fontSize: 12, color: MUT });

  // 2 exec summary
  if (has(preset, 'exec')) {
    s = p.addSlide(); title(s, 'Executive summary');
    const cards = [['Overall', ex.overall], ['Publish-ready', ex.gatePassed ? 'Yes' : 'No'], ['Findings', ex.findingsTotal], ['Fixes applied', ex.fixesApplied], ['Unresolved', ex.unresolved], ['Quality gate', ex.gatePassed ? 'Pass' : 'Fail']];
    cards.forEach((c, i) => { const x = 0.5 + (i % 3) * 4.2; const y = 1.8 + Math.floor(i / 3) * 1.5; s.addShape(p.ShapeType.roundRect, { x, y, w: 3.9, h: 1.3, fill: { color: PANEL }, rectRadius: 0.08 }); s.addText(c[0], { x: x + 0.2, y: y + 0.15, fontSize: 12, color: MUT }); s.addText(String(c[1]), { x: x + 0.2, y: y + 0.5, fontSize: 26, bold: true, color: INK }); });
    s.addText('Recommended next action', { x: 0.5, y: 5.0, fontSize: 13, bold: true, color: BR });
    s.addText(ex.nextAction, { x: 0.5, y: 5.4, w: 12.3, fontSize: 15, color: INK }); foot(s);
  }

  // 3 score breakdown (bar chart)
  if (has(preset, 'scores')) {
    s = p.addSlide(); title(s, 'Score breakdown by dimension', 'Overall ' + sc.overall + ' · AI Search Readiness ' + sc.aiSearchReadiness + ' · gate ≥ ' + sc.gate);
    const labels = sc.dims.map((d) => d.name); const vals = sc.dims.map((d) => d.score);
    s.addChart(p.ChartType.bar, [{ name: 'Score', labels, values: vals }], {
      x: 0.5, y: 1.7, w: 8.4, h: 5.2, barDir: 'bar', showValue: true, dataLabelColor: '333333', dataLabelFontSize: 11,
      chartColors: sc.dims.map((d) => bar(scoreColor(d.score, sc.gate))), valAxisMinVal: 0, valAxisMaxVal: 100, showLegend: false, catAxisLabelFontSize: 11
    });
    s.addText('Strengths', { x: 9.2, y: 1.8, fontSize: 14, bold: true, color: OK });
    s.addText(ex.strengths.map((t) => '• ' + t).join('\n'), { x: 9.2, y: 2.25, w: 3.6, fontSize: 12, color: INK });
    s.addText('Risks', { x: 9.2, y: 4.2, fontSize: 14, bold: true, color: BAD });
    s.addText(ex.risks.map((t) => '• ' + t).join('\n'), { x: 9.2, y: 4.65, w: 3.6, fontSize: 12, color: INK }); foot(s);
  }

  // 4 AI readiness
  if (has(preset, 'assistants') && model.assistants.length) {
    s = p.addSlide(); title(s, 'AI & LLM readiness', 'Modeled from dimension scores — no live third-party calls');
    const rows = [[{ text: 'Assistant', options: { bold: true } }, { text: 'Score', options: { bold: true } }, { text: 'Likelihood', options: { bold: true } }, { text: 'Status', options: { bold: true } }]]
      .concat(model.assistants.map((a) => [a.name, String(a.score), a.probability + '%', a.ready ? 'Likely to land' : 'At risk']));
    s.addTable(rows, { x: 0.5, y: 1.9, w: 8, fontSize: 14, color: INK, border: { type: 'solid', color: 'E0E0E0', pt: 1 }, fill: { color: 'FFFFFF' } });
    s.addText('LLM readiness', { x: 9.0, y: 2.0, fontSize: 13, color: MUT });
    s.addText(String(sc.llmReadiness), { x: 9.0, y: 2.4, fontSize: 40, bold: true, color: bar(scoreColor(sc.llmReadiness, sc.gate)) });
    s.addText('AI Search Readiness', { x: 9.0, y: 3.8, fontSize: 13, color: MUT });
    s.addText(String(sc.aiSearchReadiness), { x: 9.0, y: 4.2, fontSize: 40, bold: true, color: bar(scoreColor(sc.aiSearchReadiness, sc.gate)) }); foot(s);
  }

  // 5 key findings
  if (has(preset, 'judge')) {
    s = p.addSlide(); title(s, 'Critical & high-priority findings', model.findings.length + ' findings · ' + ex.unresolved + ' unresolved');
    const top = [...model.findings].sort((a, b) => (a.fixed - b.fixed) || (a.severity === 'High' ? -1 : 1)).slice(0, 7);
    const rows = [[{ text: 'Finding', options: { bold: true } }, { text: 'Area', options: { bold: true } }, { text: 'Status', options: { bold: true } }]]
      .concat(top.map((i) => [i.title, i.cat, i.fixed ? 'Resolved' : i.severity + ' · Open']));
    s.addTable(rows, { x: 0.5, y: 1.9, w: 12.3, fontSize: 13, color: INK, colW: [7, 3.3, 2], border: { type: 'solid', color: 'E0E0E0', pt: 1 } }); foot(s);
  }

  // 6 links + style
  if (has(preset, 'links') || has(preset, 'style')) {
    s = p.addSlide(); title(s, 'Link health & style compliance');
    s.addText('Broken links', { x: 0.5, y: 1.8, fontSize: 15, bold: true, color: INK });
    s.addText(model.links.total === 0 ? '✓ No broken links detected.' : model.links.total + ' link issue(s) — see appendix / PDF for detail.', { x: 0.5, y: 2.25, w: 6, fontSize: 13, color: model.links.total === 0 ? OK : BAD });
    s.addText('Style guide', { x: 6.9, y: 1.8, fontSize: 15, bold: true, color: INK });
    s.addText((model.style.items.length - model.style.fails) + ' checks passed · ' + model.style.fails + ' to review.', { x: 6.9, y: 2.25, w: 6, fontSize: 13, color: model.style.fails ? WN : OK }); foot(s);
  }

  // 7 fixes applied (before/after)
  if (has(preset, 'fixes')) {
    s = p.addSlide(); title(s, 'Fixes applied', model.fixes.applied + ' applied · ' + model.fixes.open + ' still open');
    const items = model.fixes.items.slice(0, 4);
    if (!items.length) s.addText('No fixes applied.', { x: 0.5, y: 2, fontSize: 14, color: MUT });
    items.forEach((i, idx) => { const y = 1.9 + idx * 1.25; s.addText(i.title, { x: 0.5, y, w: 12, fontSize: 13, bold: true, color: INK }); if (i.before) s.addText('− ' + i.before, { x: 0.7, y: y + 0.4, w: 12, fontSize: 11, color: 'A2191F' }); if (i.after) s.addText('+ ' + i.after, { x: 0.7, y: y + 0.75, w: 12, fontSize: 11, color: '0E6027' }); }); foot(s);
  }

  // 8 recommendation
  s = p.addSlide(); title(s, 'Publish-readiness decision');
  s.addShape(p.ShapeType.roundRect, { x: 0.5, y: 1.9, w: 12.3, h: 1.1, fill: { color: vHex, transparency: 88 }, line: { color: vHex, width: 1.5 }, rectRadius: 0.08 });
  s.addText(model.recommendation.publishReady ? 'PUBLISH-READY' : 'NOT PUBLISH-READY', { x: 0.7, y: 2.15, fontSize: 24, bold: true, color: vHex });
  s.addText('Approval: ' + model.recommendation.approvalStatus + (model.recommendation.reviewer ? '  ·  Reviewer: ' + model.recommendation.reviewer : '') + '  ·  ' + model.recommendation.date, { x: 0.5, y: 3.3, w: 12, fontSize: 13, color: MUT });
  s.addText('Recommended next steps', { x: 0.5, y: 3.9, fontSize: 15, bold: true, color: INK });
  s.addText(model.recommendation.nextSteps.map((t, i) => (i + 1) + '. ' + t).join('\n'), { x: 0.5, y: 4.35, w: 12, fontSize: 15, color: INK, lineSpacingMultiple: 1.3 }); foot(s);

  return p.write('nodebuffer');
}

export default { buildReportModel, renderReportHtml, renderReportPdf, renderReportPptx, traceableReportName, REPORT_PRESETS };
