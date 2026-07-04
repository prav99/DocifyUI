import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getCatalog } from '../api.js';
import { useFlow, toast } from '../store.jsx';
import { NavBar, Notif } from '../ui.jsx';

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

  const Tog = ({ k, label, help }) => (
    <div className="optrow">
      <div className={'toggle' + (oc[k] ? ' on' : '')} onClick={() => setOut(k, !oc[k])}>
        <span className="track" /><span className="body01">{label}</span>
      </div>
      {help ? <span className="helper">{help}</span> : null}
    </div>
  );
  const Txt = ({ k, label, ph }) => (
    <div className="optrow">
      <label className="label01 t2" htmlFor={'out-' + k}>{label}</label>
      <input id={'out-' + k} className="input" placeholder={ph || ''} defaultValue={oc[k]}
        onInput={(e) => setOut(k, e.target.value)} />
    </div>
  );
  const Sel = ({ k, label, options }) => (
    <div className="optrow">
      <label className="label01 t2" htmlFor={'out-' + k}>{label}</label>
      <select id={'out-' + k} className="select" value={String(oc[k])}
        onChange={(e) => setOut(k, isNaN(Number(e.target.value)) || e.target.value === '' ? e.target.value : Number(e.target.value))}>
        {options.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
      </select>
    </div>
  );
  const AccItem = ({ id, title, sub, children }) => (
    <div className={'acc-item' + (open[id] ? ' open' : '')}>
      <button className="acc-btn" onClick={() => toggleAcc(id)} aria-expanded={!!open[id]}>
        <span>{title}<span className="helper" style={{ fontWeight: 400, marginLeft: 12 }}>{sub}</span></span>
        <span className="acc-chev">▾</span>
      </button>
      {open[id] ? <div className="acc-body">{children}</div> : null}
    </div>
  );

  const list = catalog.formats[flow.track] || [];
  const cur = list.find((f) => f.id === flow.format) || null;
  const unsupported = cur && !cur.ok;

  async function generate() {
    setBusy(true);
    try {
      const d = await api('/generations', {
        method: 'POST',
        body: {
          repo: flow.repo || flow.provider, branch: 'main', track: flow.track,
          docTypes: flow.docTypes, format: flow.format,
          instructions: flow.instructions, files: flow.files, provider: flow.provider || 'github',
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
        <h1 className="h04">Choose an output format</h1>
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
      </div>
      <NavBar back="/doctype"
        nextLabel={unsupported ? 'Pick a supported format to continue' : 'Generate document'}
        disabled={unsupported || !flow.format || busy}
        note={unsupported ? null : cur ? 'Output: ' + cur.name : null}
        onNext={generate} />
    </>
  );
}
