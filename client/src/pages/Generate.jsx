import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFlow, toast } from '../store.jsx';
import { IcCheck } from '../ui.jsx';

export default function Generate() {
  const nav = useNavigate();
  const { flow } = useFlow();
  const [gen, setGen] = useState(null);
  const doneToasted = useRef(false);

  useEffect(() => {
    if (!flow.genId) { nav('/format'); return; }
    let alive = true;
    let timer = null;
    async function poll() {
      try {
        const d = await api('/generations/' + flow.genId);
        if (!alive) return;
        setGen(d.generation);
        if (d.generation.status === 'complete') {
          if (!doneToasted.current) {
            doneToasted.current = true;
            toast('success', 'Document generated', (d.generation.title || 'Document') + ' is ready for quality review');
          }
          return; // stop polling
        }
        if (d.generation.status === 'failed') return;
        timer = setTimeout(poll, 700);
      } catch {
        timer = setTimeout(poll, 1500);
      }
    }
    poll();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [flow.genId, nav]);

  if (!gen) return <div className="page"><p className="body01 t2">Loading…</p></div>;

  const done = gen.status === 'complete';
  const steps = gen.steps || [];

  return (
    <>
      <div className="page">
        <h1 className="h04">Generating {done && gen.title ? gen.title.toLowerCase() : 'your document'}</h1>
        <p className="body01 t2 mt3">
          From <span className="mono">{gen.repo}</span> → {gen.format.toUpperCase()}
          {gen.docTypes.length > 1 ? ' · ' + gen.docTypes.length + ' documents in this set' : ''}
        </p>
        <div className="grid2 mt7" style={{ alignItems: 'start' }}>
          <div className="tile tile--white" style={{ padding: 24 }}>
            <h2 className="h02 mb5">Pipeline</h2>
            <div>
              {steps.map((s, i) => {
                const cls = done || i < gen.step ? 'done' : i === gen.step && gen.status === 'running' ? 'doing' : 'todo';
                return (
                  <div key={s} className={'genstep ' + cls}>
                    <span className="sicon">
                      {cls === 'done' ? <IcCheck /> : cls === 'doing' ? <span className="spin" /> : <span className="dotcircle" />}
                    </span>
                    {s}
                  </div>
                );
              })}
            </div>
            {gen.status === 'failed' && <p className="body01 mt5" style={{ color: 'var(--support-error)' }}>Generation failed — go back and retry.</p>}
          </div>
          <div>
            {done ? <Preview gen={gen} /> : (
              <div className="tile" style={{ padding: 24 }}>
                <h2 className="h02 mb5">Preview</h2>
                <p className="body01 t2">The live preview appears here when the pipeline finishes.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="navbar">
        <div className="inner">
          <button className="btn btn--ghost btn--center" onClick={() => nav('/format')}>← Back</button>
          <div className="row">
            <span className="navnote">{done ? 'Generation complete' : 'Generating…'}</span>
            <button className="btn btn--primary" disabled={!done} onClick={() => nav('/quality')}>
              View quality report<span className="ico">→</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Preview({ gen }) {
  const fmt = gen.format;
  if (fmt === 'pdf' || fmt === 'word') {
    const fname = (gen.title || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-') + (fmt === 'pdf' ? '.pdf' : '.docx');
    return (
      <div>
        <h2 className="h02 mb5">Preview · {fmt === 'pdf' ? 'PDF' : 'Word'}</h2>
        <div className="paper">
          <p className="label01 t2 mono">ACME · PAYMENTS PLATFORM</p>
          <h3 className="h03 mt5">{gen.title}</h3>
          <p className="helper mt2">Generated from {gen.repo} · v2.4.0</p>
          <p className="h01 mt7">1. Overview</p>
          <div className="skel w90" /><div className="skel" /><div className="skel w60" />
          <p className="h01 mt6">2. Authentication</p>
          <div className="skel w80" /><div className="skel w90" /><div className="skel w60" />
          <p className="h01 mt6">3. Endpoints</p>
          <div className="skel" /><div className="skel w80" />
          <div className="row row--between mt7" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
            <span className="helper mono">{fname}</span><span className="helper">14 pages</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div>
      <h2 className="h02 mb5">Preview · {fmt === 'dita' ? 'DITA' : 'Markdown'}</h2>
      <div className="codeblock">{gen.content}</div>
    </div>
  );
}
