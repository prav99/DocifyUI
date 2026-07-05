import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getCatalog } from '../api.js';
import { useFlow, toast } from '../store.jsx';
import { NavBar, Notif, HelpLink } from '../ui.jsx';

// Mirrors DEFAULT_OUTPUT on the server (server/src/adapters/llm.js).
const OUT_DEFAULTS = {
  coverPage: true, title: '', subtitle: '', company: '', trademark: '',
  author: '', version: '', docId: '', classification: 'none',
  showDate: true, dateFormat: 'iso',
  toc: true, tocDepth: 2, numberedHeadings: false,
  aboutSection: false, revisionHistory: false, glossary: false, includeExamples: true,
  watermark: '', draftBanner: false, headerText: '', footerText: '',
  pageNumbers: true, paperSize: 'A4', accentColor: '#0f62fe',
  copyright: '', disclaimer: ''
};

const ACCENTS = [
  ['#0f62fe', 'Blue'], ['#007d79', 'Teal'], ['#6929c4', 'Purple'], ['#393939', 'Gray']
];

export default function Format() {
  const nav = useNavigate();
  const { flow, setFlow } = useFlow();
  const [catalog, setCatalog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({ cover: true });
  useEffect(() => { getCatalog().then(setCatalog); }, []);
  if (!catalog) return <div className="page"><p className="body01 t2">Loading…</p></div>;

  const oc = { ...OUT_DEFAULTS, ...(flow.outputCfg || {}) };
  const setOut = (k, v) => setFlow((f) => ({ outputCfg: { ...(f.outputCfg || {}), [k]: v }, genId: null }));
  const toggleAcc = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  // Plain render helpers (NOT components): keeps the DOM stable across
  // re-renders so text inputs never lose focus while typing.
  const tog = (k, label, help) => (
    <div className="optrow" key={k}>
      <div className={'toggle' + (oc[k] ? ' on' : '')} onClick={() => setOut(k, !oc[k])}>
        <span className="track" /><span className="body01">{label}</span>
      </div>
      {help ? <span className="helper">{help}</span> : null}
    </div>
  );
  const txt = (k, label, ph) => (
    <div className="optrow" key={k}>
      <label className="label01 t2" htmlFor={'out-' + k}>{label}</label>
      <input id={'out-' + k} className="input" placeholder={ph || ''} defaultValue={oc[k]}
        onInput={(e) => setOut(k, e.target.value)} />
    </div>
  );
  const sel = (k, label, options) => (
    <div className="optrow" key={k}>
      <label className="label01 t2" htmlFor={'out-' + k}>{label}</label>
      <select id={'out-' + k} className="select" value={String(oc[k])}
        onChange={(e) => setOut(k, isNaN(Number(e.target.value)) || e.target.value === '' ? e.target.value : Number(e.target.value))}>
        {options.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
      </select>
    </div>
  );
  const accItem = (id, title, sub, body) => (
    <div className={'acc-item' + (open[id] ? ' open' : '')} key={id}>
      <button className="acc-btn" onClick={() => toggleAcc(id)} aria-expanded={!!open[id]}>
        <span>{title}<span className="helper" style={{ fontWeight: 400, marginLeft: 12 }}>{sub}</span></span>
        <span className="acc-chev">▾</span>
      </button>
      {open[id] ? <div className="acc-body">{body}</div> : null}
    </div>
  );

  const list = catalog.formats[flow.track] || [];
  const cur = list.find((f) => f.id === flow.format) || null;
  const unsupported = cur && !cur.ok;

  async function generate() {
    setBusy(true);
    try {
      // Focused source items chosen at the Source step (Jira issues, a
      // Confluence page, a Notion page) steer generation via instructions.
      const scopeNote = Object.entries(flow.srcScope || {})
        .map(([p, s]) => p.charAt(0).toUpperCase() + p.slice(1) + ': ' + s.label)
        .join('; ');
      const instructions = [scopeNote && 'Focus on these source items — ' + scopeNote + '.', flow.instructions]
        .filter(Boolean).join('\n');
      const d = await api('/generations', {
        method: 'POST',
        body: {
          repo: flow.repo || flow.provider, branch: 'main', track: flow.track,
          docTypes: flow.docTypes, format: flow.format,
          instructions, files: flow.files, provider: flow.provider || 'github',
          skillName: flow.skillName || '', skill: flow.skillContent || '',
          brief: { audience: flow.briefAudience || '', emphasis: flow.briefEmphasis || '', tone: flow.briefTone || '' },
          output: { ...OUT_DEFAULTS, ...(flow.outputCfg || {}) }
        }
      });
      setFlow({ genId: d.generation.id });
      nav('/generate');
    } catch (e) { toast('error', 'Could not start generation', e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="page">
        <div className="row row--between" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h1 className="h04">Choose an output format</h1>
          <HelpLink topic="format" />
        </div>
        <p className="body01 t2 mt3">Formats differ by track. Everything on the roadmap is listed — items marked coming soon are visible so you can tell us they matter.</p>

        <div className="grid4 mt7">
          {list.map((f) => (
            <div key={f.id} className={'tile tile--click' + (flow.format === f.id ? ' tile--selected' : '')}
              onClick={() => setFlow({ format: f.id, genId: null })}>
              <div className="row row--between">
                <p className="h01">{f.name}</p>
                {f.ok ? null : <span className="tag tag--gray">Coming soon</span>}
              </div>
              <p className="helper mt2">{f.desc}</p>
            </div>
          ))}
        </div>

        {unsupported && (
          <div className="mt6">
            <Notif kind="warning" title="Format not yet supported">
              This output format is not currently supported. We will add support for it in a future release.
            </Notif>
          </div>
        )}

        {/* ---- Output options ---- */}
        <div className="mt7">
          <div className="row row--between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h2 className="h02">Output options</h2>
            <button className="linkbtn" onClick={() => { setFlow({ outputCfg: {}, genId: null }); toast('info', 'Options reset', 'Back to the defaults'); }}>
              Reset to defaults
            </button>
          </div>
          <p className="helper mt2 mb5">
            Applied to every document in this run. Page setup (paper size, headers, page numbers) applies to
            paginated formats; branding and structure apply everywhere.
          </p>

          <div className="acc">
            {accItem('cover', 'Cover & identity', 'title, organization, classification, date', <>
              {tog('coverPage', 'Cover block', 'Document information table under the title')}
              {txt('title', 'Title override', 'Leave blank to use the document type')}
              {txt('subtitle', 'Subtitle', 'e.g. Integration guide for the v2 platform')}
              {txt('company', 'Company / product name', 'e.g. Acme Corp')}
              {txt('trademark', 'Trademark line', 'e.g. Acme™, DocGen®')}
              {txt('author', 'Author / department', 'e.g. Platform Documentation')}
              {txt('version', 'Version label', 'e.g. 2.4.0')}
              {txt('docId', 'Document ID', 'e.g. DOC-2026-014')}
              {sel('classification', 'Classification', [
                ['none', 'None'], ['public', 'Public'], ['internal', 'Internal'],
                ['confidential', 'Confidential'], ['restricted', 'Restricted']
              ])}
              {tog('showDate', 'Show date')}
              {sel('dateFormat', 'Date format', [
                ['iso', 'ISO 8601 (2026-07-04)'], ['long', 'Long (July 4, 2026)']
              ])}
            </>)}

            {accItem('structure', 'Structure', 'contents, numbering, appendices', <>
              {tog('toc', 'Table of contents')}
              {sel('tocDepth', 'Contents depth', [[1, 'Sections only'], [2, 'Sections + subsections']])}
              {tog('numberedHeadings', 'Numbered headings', '1. Overview, 2. Authentication, …')}
              {tog('aboutSection', 'About this document', 'Purpose and convention, up front')}
              {tog('revisionHistory', 'Revision history table')}
              {tog('glossary', 'Glossary')}
              {tog('includeExamples', 'Include code examples', 'Off replaces examples with a note')}
            </>)}

            {accItem('page', 'Page & branding', 'watermark, headers, paper, accent', <>
              {txt('watermark', 'Watermark text', 'e.g. CONFIDENTIAL, DRAFT — blank for none')}
              {tog('draftBanner', 'Draft banner', 'A DRAFT notice at the very top')}
              {txt('headerText', 'Page header', 'e.g. Acme Payments · API reference')}
              {txt('footerText', 'Page footer', 'e.g. acme.dev/docs')}
              {tog('pageNumbers', 'Page numbers', 'Paginated formats only')}
              {sel('paperSize', 'Paper size', [['A4', 'A4'], ['Letter', 'US Letter']])}
              <div className="optrow" key="accent">
                <span className="label01 t2">Accent color (web outputs)</span>
                <div className="row">
                  {ACCENTS.map(([hex, name]) => (
                    <button key={hex} className={'colorchip' + (oc.accentColor === hex ? ' on' : '')}
                      style={{ background: hex }} title={name} aria-label={name}
                      onClick={() => setOut('accentColor', hex)} />
                  ))}
                </div>
              </div>
            </>)}

            {accItem('legal', 'Legal', 'copyright, disclaimer', <>
              {txt('copyright', 'Copyright line', 'Blank = auto from company + current year')}
              <div className="optrow" key="disclaimer" style={{ gridColumn: '1 / -1' }}>
                <label className="label01 t2" htmlFor="out-disclaimer">Disclaimer / legal notice</label>
                <textarea id="out-disclaimer" className="textarea" rows={3}
                  placeholder="e.g. This document is provided as-is without warranty of any kind…"
                  defaultValue={oc.disclaimer} onInput={(e) => setOut('disclaimer', e.target.value)} />
              </div>
            </>)}
          </div>
        </div>
      </div>
      <NavBar back="/doctype"
        nextLabel={unsupported ? 'Pick a supported format to continue' : 'Generate document'}
        disabled={unsupported || !flow.format || busy}
        note={unsupported ? null : cur ? 'Output: ' + cur.name : null}
        onNext={generate} />
    </>
  );
}
