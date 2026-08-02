import React, { useEffect, useState } from 'react';
import { getCatalog } from '../api.js';
import { useFlow, toast } from '../store.jsx';
import { NavBar, IcCheck, HelpLink } from '../ui.jsx';

const PLACEHOLDER = 'Provide any additional instructions for document generation. You can specify the content to include, preferred document structure, formatting requirements, target audience, sections to generate, or upload a reference file.';

const SKILL_TEMPLATE = [
  '# Docify Skill',
  '',
  'Configure how Docify writes your documents. Every directive below is',
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

// Reference files are held as { name, text }. Sessions started before their
// contents were read may still hold bare filenames in sessionStorage.
const refFiles = (f) => (f.files || [])
  .map((x) => (typeof x === 'string' ? { name: x, text: '' } : x))
  .filter((x) => x && x.name);

// Reference text travels to the generator inside the instructions, which the
// server compiles into the writing policy with a 4,000-character budget
// (adapters/styleguide.js). Reading more than that would promise more than the
// model ever sees.
const REF_MAX_CHARS = 4000;
const REF_TEXT_RE = /\.(md|markdown|txt|text|rst|adoc|asciidoc|json|ya?ml|csv|tsv|html?|xml|toml|ini|ts|tsx|js|jsx|py|go|rb|java|sql)$/i;

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, text: String(r.result || '') });
    r.onerror = () => reject(new Error(file.name));
    r.readAsText(file);
  });
}

export default function DocType() {
  const { flow, setFlow } = useFlow();
  const [catalog, setCatalog] = useState(null);
  const [catErr, setCatErr] = useState('');
  const [reload, setReload] = useState(0);
  const [reading, setReading] = useState(false);
  const [fwOpen, setFwOpen] = useState(null); // doc type id with expanded framework
  useEffect(() => {
    let alive = true;
    setCatErr('');
    getCatalog()
      .then((c) => { if (alive) setCatalog(c); })
      .catch((e) => { if (alive) setCatErr(e.message || 'Could not load the document catalogue'); });
    return () => { alive = false; };
  }, [reload]);
  if (catErr) {
    return (
      <div className="page">
        <div className="genfail">
          <b>Could not load document types.</b> <span>{catErr}</span>
          <button className="btn btn--tertiary btn--sm btn--center" style={{ marginLeft: 12 }}
            onClick={() => setReload((n) => n + 1)}>Try again</button>
        </div>
      </div>
    );
  }
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
  async function addFiles(input) {
    const picked = Array.from(input.files || []);
    input.value = '';
    if (!picked.length) return;
    // Read in the browser, so only text formats work here — a PDF or .docx
    // would arrive as mojibake, which is worse than refusing it.
    const isText = (f) => REF_TEXT_RE.test(f.name) || String(f.type || '').startsWith('text/');
    const rejected = picked.filter((f) => !isText(f));
    const usable = picked.filter(isText);
    if (rejected.length) {
      toast('error', 'Text files only',
        rejected.map((f) => f.name).join(', ') + ' — reference files are read in your browser, so PDF and Word are not supported here.');
    }
    if (!usable.length) return;
    setReading(true);
    let read;
    try {
      read = await Promise.all(usable.map(readAsText));
    } catch (e) {
      setReading(false);
      return toast('error', 'Could not read file', e.message + ' — try a plain .md or .txt file');
    }
    setReading(false);
    const existing = refFiles(flow);
    let used = existing.reduce((n, x) => n + x.text.length, 0);
    const added = [];
    let trimmed = false;
    for (const r of read) {
      const room = REF_MAX_CHARS - used;
      if (room <= 0) { trimmed = true; break; }
      const text = r.text.slice(0, room);
      if (text.length < r.text.length) trimmed = true;
      added.push({ name: r.name, text });
      used += text.length;
    }
    if (!added.length) {
      return toast('info', 'Reference limit reached',
        'Reference text and your typed instructions share ' + REF_MAX_CHARS.toLocaleString() + ' characters. Remove a file to add another.');
    }
    setFlow({ files: [...existing, ...added], genId: null });
    if (trimmed) {
      toast('info', 'Reference text trimmed',
        'Only the first ' + REF_MAX_CHARS.toLocaleString() + ' characters in total are attached — the rest was left out.');
    } else {
      toast('success', added.length + (added.length > 1 ? ' reference files added' : ' reference file added'),
        'Their text is sent with your instructions for every document in this run.');
    }
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
  const refs = refFiles(flow);

  return (
    <>
      <div className="page">
        <div className="row row--between" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h1 className="h04">What should Docify produce?</h1>
          <HelpLink topic="doctype" />
        </div>
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
                role="checkbox" aria-checked={on} tabIndex={0}
                aria-label={d.name + ' — ' + d.desc}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleType(d.id); } }}
                onClick={() => toggleType(d.id)}>
                <span className="cb">{on ? <IcCheck c="#ffffff" /> : null}</span>
                <div className="row">
                  <p className="h01">{d.name}</p>
                  {d.common ? <span className="tag tag--blue">Most common</span> : null}
                </div>
                <p className="helper mt2">{d.desc}</p>
                {d.standard ? <div className="mt3"><span className="tag tag--outline">{d.standard}</span></div> : null}
                {d.framework && (
                  <>
                    <button className="fwlink" onClick={(e) => { e.stopPropagation(); setFwOpen(fwOpen === d.id ? null : d.id); }}>
                      {fwOpen === d.id ? 'Hide standard framework' : 'Standard framework →'}
                    </button>
                    {fwOpen === d.id && (
                      <div className="fwpanel" onClick={(e) => e.stopPropagation()}>
                        <p className="fwrow"><b>Purpose</b> {d.framework.purpose}</p>
                        <p className="fwrow"><b>Audience</b> {d.framework.audience}</p>
                        <p className="fwrow"><b>Tone</b> {d.framework.tone}</p>
                        <p className="fwrow"><b>Outline</b> {d.framework.outline.map((o) => o.name + (o.req ? '' : ' (optional)')).join(' · ')}</p>
                        <p className="fwrow"><b>Rules</b></p>
                        <ul className="fwrules">
                          {d.framework.rules.map((r) => <li key={r}>{r}</li>)}
                        </ul>
                      </div>
                    )}
                  </>
                )}
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

        <div className="tile tile--white composer mt7">
          <div className="composer-top">
            <div className="row row--between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <h2 className="h02">Customize the generation</h2>
              {flow.skillName
                ? <span className="tag tag--green">Skill active ✓</span>
                : <span className="tag tag--blue">SKILL.md recommended</span>}
            </div>
            <p className="helper mt2">
              Optional — one place for everything. Write instructions, attach a SKILL.md to control
              sections, tone and terminology, or add reference files: their text is read here and sent with your typed
              instructions, which share about {REF_MAX_CHARS.toLocaleString()} characters per run. Applies to every
              document in this run.
            </p>
            <textarea className="composer-ta" rows={4} placeholder={PLACEHOLDER}
              defaultValue={flow.instructions} onInput={(e) => setFlow({ instructions: e.target.value })} />
          </div>

          {(flow.skillName || refs.length > 0) && (
            <div className="composer-chips">
              {flow.skillName && (
                <span className="filechip filechip--skill">
                  <IcCheck />
                  {flow.skillName} · {Math.max(1, Math.round((flow.skillContent || '').length / 1024))} KB
                  <button aria-label="Remove skill" onClick={() => setFlow({ skillName: '', skillContent: '', genId: null })}>✕</button>
                </span>
              )}
              {refs.map((f, i) => (
                <span key={f.name + i} className="filechip">
                  {f.name}{f.text ? ' · ' + f.text.length.toLocaleString() + ' chars' : ''}
                  <button aria-label="Remove"
                    onClick={() => setFlow((fl) => ({ files: refFiles(fl).filter((_, k) => k !== i), genId: null }))}>✕</button>
                </span>
              ))}
            </div>
          )}

          <div className="composer-bar">
            <label className="attachbtn" title="Controls sections, tone, audience, and terminology rules">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M9 1H3v14h10V5L9 1zm0 1.5L11.5 5H9V2.5zM5 8h6v1H5V8zm0 3h6v1H5v-1z"/></svg>
              {flow.skillName ? 'Replace SKILL.md' : 'Attach SKILL.md'}
              <input type="file" accept=".md,.markdown,.txt" style={{ display: 'none' }} onChange={(e) => readSkill(e.target)} />
            </label>
            <label className="attachbtn" title={'Style guides, existing docs, or templates — text files, read here and sent with your instructions (' + REF_MAX_CHARS.toLocaleString() + ' characters in total)'}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M10.6 2.6a2.5 2.5 0 0 1 3.5 3.5l-7 7a4 4 0 0 1-5.7-5.6L7.8 1l.9.9-6.4 6.5a2.7 2.7 0 0 0 3.9 3.8l7-7a1.2 1.2 0 0 0-1.7-1.7L5.3 9.7a.3.3 0 0 0 .4.4L11 4.8l.9.9-5.3 5.3a1.6 1.6 0 0 1-2.2-2.2l6.2-6.2z"/></svg>
              {reading ? 'Reading…' : 'Add reference files'}
              <input type="file" multiple accept=".md,.markdown,.txt,.text,.rst,.adoc,.asciidoc,.json,.yaml,.yml,.csv,.tsv,.html,.htm,.xml,.toml,.ini,text/*"
                style={{ display: 'none' }} disabled={reading} onChange={(e) => addFiles(e.target)} />
            </label>
            <button className="linkbtn" style={{ fontSize: 13, padding: '0 8px' }} onClick={downloadSkillTemplate}>SKILL.md template</button>
            <span style={{ flex: 1 }} />
            <span className="helper">Text files · .md · .txt · .yaml · .json</span>
          </div>
        </div>
      </div>
      <NavBar back="/source" next="/format" disabled={count === 0}
        note={count === 0 ? 'Select at least one document type' : count + ' type' + (count > 1 ? 's' : '') + ' selected'} />
    </>
  );
}
