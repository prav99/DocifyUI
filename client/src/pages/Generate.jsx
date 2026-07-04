import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFlow, toast } from '../store.jsx';
import { IcCheck, PreviewFrame } from '../ui.jsx';

/* ---------- Source-view syntax highlighting (escape first, then wrap) ---------- */
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function hlXml(src) {
  return escHtml(src)
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tk-com">$1</span>')
    .replace(/(&lt;\/?)([\w:-]+)/g, '$1<span class="tk-tag">$2</span>')
    .replace(/([\w-]+)=(&quot;[^&]*?&quot;)/g, '<span class="tk-attr">$1</span>=<span class="tk-str">$2</span>');
}

function hlMd(src) {
  return escHtml(src)
    .replace(/^(#{1,6} .*)$/gm, '<span class="tk-h">$1</span>')
    .replace(/^(&gt;.*)$/gm, '<span class="tk-q">$1</span>')
    .replace(/^(\|.*)$/gm, '<span class="tk-tbl">$1</span>')
    .replace(/^(```.*)$/gm, '<span class="tk-fence">$1</span>')
    .replace(/(\*\*[^*\n]+\*\*)/g, '<span class="tk-b">$1</span>')
    .replace(/(`[^`\n]+`)/g, '<span class="tk-code">$1</span>');
}

const XMLISH = ['dita', 'docbook', 'html', 'epub', 'htmlsnip', 'email'];
function highlight(src, format) {
  return XMLISH.includes(format) ? hlXml(src) : hlMd(src);
}

/* ---------- Chips: every choice the user made, visible on the preview ---------- */
export function buildChips(gen) {
  const oc = gen.output || {};
  const chips = [];
  const add = (label, cls) => chips.push({ label, cls: cls || 'tag--gray' });
  if (gen.skillName) add('Skill: ' + gen.skillName, 'tag--green');
  const org = [oc.company, oc.trademark].filter(Boolean).join(' ');
  if (org) add(org, 'tag--blue');
  if (oc.classification && oc.classification !== 'none') add(String(oc.classification).toUpperCase(), 'tag--red');
  if (oc.watermark) add('Watermark: ' + String(oc.watermark).toUpperCase(), 'tag--amber');
  if (oc.draftBanner) add('DRAFT banner', 'tag--amber');
  add(oc.coverPage === false ? 'No cover block' : 'Cover block');
  add(oc.toc === false ? 'No contents' : 'Contents' + (Number(oc.tocDepth) >= 2 ? ' (deep)' : ''));
  if (oc.numberedHeadings) add('Numbered headings');
  if (oc.showDate === false) add('Date hidden');
  if (oc.aboutSection) add('About section');
  if (oc.revisionHistory) add('Revision history');
  if (oc.glossary) add('Glossary');
  if (oc.includeExamples === false) add('Examples omitted', 'tag--amber');
  if (oc.author) add('Author: ' + oc.author);
  if (oc.docId) add('ID: ' + oc.docId);
  if (['pdf', 'word'].includes(gen.format)) {
    add((oc.paperSize || 'A4') + ' · page numbers ' + (oc.pageNumbers === false ? 'off' : 'on'));
  }
  if (oc.disclaimer) add('Disclaimer');
  if ((oc.copyright && oc.copyright.trim()) || org) add('Copyright line');
  if (gen.brief && (gen.brief.audience || gen.brief.emphasis)) add('Brief applied', 'tag--teal');
  return { chips, accent: oc.accentColor && oc.accentColor !== '#0f62fe' ? oc.accentColor : null };
}

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
      <div className="page" style={{ maxWidth: 1200 }}>
        <h1 className="h04">Generating {done && gen.title ? gen.title.toLowerCase() : 'your document'}</h1>
        <p className="body01 t2 mt3">
          From <span className="mono">{gen.repo}</span> → {gen.format.toUpperCase()}
          {gen.docTypes.length > 1 ? ' · ' + gen.docTypes.length + ' documents in this set' : ''}
        </p>
        <div className="genlayout mt7">
          <div className="tile tile--white" style={{ padding: 24, alignSelf: 'start' }}>
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
                <p className="body01 t2">The rendered preview appears here when the pipeline finishes — with every option you configured applied.</p>
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
  const [view, setView] = useState('rendered');
  const oc = gen.output || {};
  const { chips, accent } = buildChips(gen);

  return (
    <div>
      <div className="row row--between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h2 className="h02">Preview · {gen.format.toUpperCase()}</h2>
        <div className="seg" style={{ width: 220 }}>
          <button className={view === 'rendered' ? 'on' : ''} onClick={() => setView('rendered')}>Rendered</button>
          <button className={view === 'source' ? 'on' : ''} onClick={() => setView('source')}>Source</button>
        </div>
      </div>

      <div className="row mt3" style={{ flexWrap: 'wrap', gap: 6 }}>
        {chips.map((c, i) => <span key={c.label + i} className={'tag ' + c.cls}>{c.label}</span>)}
        {accent && (
          <span className="tag tag--outline">
            <span style={{ width: 10, height: 10, background: accent, display: 'inline-block' }} />Accent
          </span>
        )}
      </div>

      {view === 'rendered' ? (
        <div className="prevframe mt5">
          {['pdf', 'word'].includes(gen.format) && (
            <div className="prevpagebar">
              Paginated export preview · {(oc.paperSize || 'A4')} · page numbers {oc.pageNumbers === false ? 'off' : 'on'}
              {oc.headerText ? ' · header “' + oc.headerText + '”' : ''}
              {oc.footerText ? ' · footer “' + oc.footerText + '”' : ''}
            </div>
          )}
          {['dita', 'docbook'].includes(gen.format) && (
            <div className="prevpagebar">Rendered from the {gen.format === 'dita' ? 'DITA topic' : 'DocBook article'} — switch to Source for the exact markup</div>
          )}
          <PreviewFrame title="Document preview" html={gen.preview || gen.content} />
        </div>
      ) : (
        <pre className="codeblock prevsrc mt5" dangerouslySetInnerHTML={{ __html: highlight(gen.content, gen.format) }} />
      )}
    </div>
  );
}
