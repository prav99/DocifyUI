import React, { useEffect, useState } from 'react';
import { getCatalog } from '../api.js';
import { useFlow, toast } from '../store.jsx';
import { NavBar, IcCheck } from '../ui.jsx';

const PLACEHOLDER = 'Provide any additional instructions for document generation. You can specify the content to include, preferred document structure, formatting requirements, target audience, sections to generate, or upload a reference file.';

const SKILL_TEMPLATE = [
  '# DocGen Skill',
  '',
  'Configure how DocGen writes your documents. Every directive below is',
  'applied at generation time — edit freely.',
  '',
  'tone: plain and direct',
  'audience: platform engineers integrating the API',
  '',
  '## Sections',
  '- Overview',
  '- Authentication',
  '- Quick start',
  '- Endpoints',
  '- Error handling',
  '- FAQ',
  '',
  '## Rules',
  '- Use "API key" — never "token" — outside code samples.',
  '- Every section must open with a one-sentence summary.',
  '- Include at least one curl example per endpoint.',
  '- Keep paragraphs under four sentences.',
  ''
].join('\n');

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

  function readSkill(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (file.size > 60000) return toast('error', 'File too large', 'SKILL.md must be under 60 KB');
    const reader = new FileReader();
    reader.onload = () => {
      setFlow({ skillName: file.name, skillContent: String(reader.result || ''), genId: null });
      toast('success', 'Skill loaded', file.name + ' will shape every document in this run');
    };
    reader.onerror = () => toast('error', 'Could not read file', 'Try again or use a plain .md file');
    reader.readAsText(file);
  }

  function downloadSkillTemplate() {
    const blob = new Blob([SKILL_TEMPLATE], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SKILL.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
                {d.standard ? <div className="mt3"><span className="tag tag--outline">{d.standard}</span></div> : null}
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

          <div className="fileup mt5" style={{ borderColor: flow.skillName ? 'var(--support-success)' : 'var(--button-primary)' }}>
            <div className="row row--between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <p className="label01 t2">SKILL FILE · SKILL.MD</p>
              {flow.skillName
                ? <span className="tag tag--green">Skill loaded ✓</span>
                : <span className="tag tag--blue">Recommended</span>}
            </div>
            <p className="helper mt2">
              Teach DocGen exactly how you want documents written: your preferred sections, tone, target
              audience, and terminology rules. Upload a SKILL.md and every document in this run follows it —
              the outline, the wording rules, all of it.
            </p>
            {flow.skillName ? (
              <div className="row mt3" style={{ flexWrap: 'wrap' }}>
                <span className="filechip">
                  {flow.skillName}
                  <button aria-label="Remove skill" onClick={() => setFlow({ skillName: '', skillContent: '', genId: null })}>✕</button>
                </span>
                <span className="helper">{Math.max(1, Math.round((flow.skillContent || '').length / 1024))} KB · applied to this run</span>
              </div>
            ) : (
              <div className="row mt3" style={{ flexWrap: 'wrap' }}>
                <label className="btn btn--primary btn--field" style={{ cursor: 'pointer' }}>
                  Upload SKILL.md
                  <input type="file" accept=".md,.markdown,.txt" style={{ display: 'none' }} onChange={(e) => readSkill(e.target)} />
                </label>
                <button className="linkbtn" onClick={downloadSkillTemplate}>Download the SKILL.md template</button>
              </div>
            )}
          </div>

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
