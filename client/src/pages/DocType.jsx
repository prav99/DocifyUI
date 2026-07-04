import React, { useEffect, useState } from 'react';
import { getCatalog } from '../api.js';
import { useFlow } from '../store.jsx';
import { NavBar, IcCheck } from '../ui.jsx';

const PLACEHOLDER = 'Provide any additional instructions for document generation. You can specify the content to include, preferred document structure, formatting requirements, target audience, sections to generate, or upload a reference file.';

export default function DocType() {
  const { flow, setFlow } = useFlow();
  const [catalog, setCatalog] = useState(null);
  useEffect(() => { getCatalog().then(setCatalog); }, []);
  if (!catalog) return <div className="page"><p className="body01 t2">Loading…</p></div>;

  const types = catalog.doctypes[flow.track] || [];

  function setTrack(t) {
    if (flow.track === t) return;
    setFlow({ track: t, docTypes: [], format: t === 'technical' ? 'dita' : 'pdf', genId: null });
  }
  function toggleType(id) {
    setFlow((f) => ({
      docTypes: f.docTypes.includes(id) ? f.docTypes.filter((x) => x !== id) : [...f.docTypes, id],
      genId: null
    }));
  }
  function addFiles(input) {
    const names = Array.from(input.files).map((f) => f.name);
    setFlow((f) => ({ files: [...f.files, ...names] }));
    input.value = '';
  }

  const count = flow.docTypes.length;

  return (
    <>
      <div className="page">
        <h1 className="h04">What should DocGen produce?</h1>
        <p className="body01 t2 mt3">Pick a track, then select one or more document types. Selections generate together as a set.</p>

        <div className="row mt7" style={{ gap: 0 }}>
          <button className={'chip' + (flow.track === 'technical' ? ' on' : '')} style={{ height: 40 }}
            onClick={() => setTrack('technical')}>Technical documentation</button>
          <button className={'chip' + (flow.track === 'marketing' ? ' on' : '')} style={{ height: 40 }}
            onClick={() => setTrack('marketing')}>Marketing material</button>
        </div>

        <div className="grid3 mt6">
          {types.map((d) => {
            const on = flow.docTypes.includes(d.id);
            return (
              <div key={d.id} className={'tile tile--click cbtile' + (on ? ' tile--selected' : '')}
                onClick={() => toggleType(d.id)}>
                <span className="cb">{on ? <IcCheck c="#ffffff" /> : null}</span>
                <div className="row">
                  <p className="h01">{d.name}</p>
                  {d.common ? <span className="tag tag--blue">Most common</span> : null}
                </div>
                <p className="helper mt2">{d.desc}</p>
              </div>
            );
          })}
        </div>

        {flow.track === 'marketing' && (
          <div className="tile tile--white mt7" style={{ padding: 24, maxWidth: 720 }}>
            <h2 className="h02">Brief</h2>
            <p className="helper mt2">Two answers and a tone — that&apos;s all the marketing generator needs.</p>
            <div className="field mt5">
              <label htmlFor="brAud">Who is this for?</label>
              <input id="brAud" className="input" placeholder="e.g. platform engineers evaluating payment APIs"
                defaultValue={flow.briefAudience} onInput={(e) => setFlow({ briefAudience: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="brEmp">What&apos;s the one thing to emphasize?</label>
              <input id="brEmp" className="input" placeholder="e.g. idempotent retries now built in"
                defaultValue={flow.briefEmphasis} onInput={(e) => setFlow({ briefEmphasis: e.target.value })} />
            </div>
            <p className="label01 t2 mb3">Tone</p>
            <div className="row">
              {['Plain & direct', 'Confident', 'Playful'].map((t) => (
                <button key={t} className={'chip' + (flow.briefTone === t ? ' on' : '')}
                  onClick={() => setFlow({ briefTone: t })}>{t}</button>
              ))}
            </div>
          </div>
        )}

        <div className="tile tile--white mt7" style={{ padding: 24 }}>
          <h2 className="h02">Additional instructions</h2>
          <p className="helper mt2">Optional. Anything you write here is applied across every selected document type in this run.</p>
          <textarea className="textarea mt5" rows={5} placeholder={PLACEHOLDER}
            defaultValue={flow.instructions} onInput={(e) => setFlow({ instructions: e.target.value })} />
          <div className="fileup mt5">
            <p className="label01 t2">Reference files</p>
            <p className="helper mt2">Style guides, existing docs, or templates. Max 5 MB per file: .pdf, .docx, .md, .txt</p>
            <label className="btn btn--tertiary btn--field mt3" style={{ cursor: 'pointer' }}>
              Add files
              <input type="file" multiple style={{ display: 'none' }} onChange={(e) => addFiles(e.target)} />
            </label>
            <div>
              {flow.files.map((f, i) => (
                <span key={f + i} className="filechip">
                  {f}
                  <button aria-label="Remove"
                    onClick={() => setFlow((fl) => ({ files: fl.files.filter((_, k) => k !== i) }))}>✕</button>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <NavBar back="/source" next="/format" disabled={count === 0}
        note={count === 0 ? 'Select at least one document type' : count + ' type' + (count > 1 ? 's' : '') + ' selected'} />
    </>
  );
}
