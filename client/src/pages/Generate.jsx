import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, download } from '../api.js';
import { useFlow, toast } from '../store.jsx';
import { IcCheck, PreviewFrame, HelpLink } from '../ui.jsx';

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
  if (gen.previewLayout && gen.previewLayout !== 'document') {
    // Blueprint-managed artifact layout — cover table and TOC do not apply.
    const names = { article: 'Article layout', cards: 'Card layout', changelog: 'Changelog layout', onepager: 'One-pager layout' };
    add(names[gen.previewLayout] || gen.previewLayout + ' layout', 'tag--teal');
  } else {
    add(oc.coverPage === false ? 'No cover block' : 'Cover block');
    add(oc.toc === false ? 'No contents' : 'Contents' + (Number(oc.tocDepth) >= 2 ? ' (deep)' : ''));
  }
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
        <div className="row row--between" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h1 className="h04">Generating {done && gen.title ? gen.title.toLowerCase() : 'your document'}</h1>
          <HelpLink topic="generate" />
        </div>
        <p className="body01 t2 mt3">
          From <span className="mono">{gen.repo}</span> → {(gen.formats && gen.formats.length ? gen.formats : [gen.format]).map((f) => f.toUpperCase()).join(' · ')}
          {gen.docTypes.length > 1 ? ' · ' + gen.docTypes.length + ' documents, each previewed separately' : ''}
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

/* =========================================================================
   Preview grid: one independent cell per (document type × output format).
   Server returns outputs keyed "type::format", each with its own title,
   content, format-true preview HTML, and error state. Nothing is shared, so
   no document's content can appear inside another's tab.
   ========================================================================= */
const XMLSTRUCT = ['dita', 'docbook'];
const RAWHTML = ['html', 'htmlsnip', 'email', 'epub'];

function FormatPreview({ gen, out, view }) {
  const oc = gen.output || {};
  const f = out.format;
  if (out.error) {
    return (
      <div className="tile mt5" style={{ padding: 24, borderLeft: '3px solid var(--support-error)' }}>
        <p className="h01">{out.name} preview failed</p>
        <p className="body01 t2 mt2">{out.error} — every other output is unaffected. Regenerate to retry this one.</p>
      </div>
    );
  }
  if (!out.content) {
    return <div className="tile mt5" style={{ padding: 24 }}><p className="body01 t2">Preparing {out.name} output…</p></div>;
  }
  if (view === 'source') {
    return <pre className="codeblock prevsrc mt5" dangerouslySetInnerHTML={{ __html: highlight(out.content, f) }} />;
  }
  const pageBits = (oc.paperSize || 'A4') + ' · page numbers ' + (oc.pageNumbers === false ? 'off' : 'on')
    + (oc.headerText ? ' · header “' + oc.headerText + '”' : '')
    + (oc.footerText ? ' · footer “' + oc.footerText + '”' : '');
  if (f === 'pdf') {
    return (
      <div className="prevframe prevframe--pdf mt5">
        <div className="prevpagebar prevpagebar--pdf">PDF page preview · {pageBits}</div>
        <PreviewFrame title={out.title + ' — PDF preview'} html={out.preview} />
      </div>
    );
  }
  if (f === 'word') {
    return (
      <div className="prevframe prevframe--word mt5">
        <div className="prevpagebar prevpagebar--word">Word (.docx) preview · {pageBits}</div>
        <PreviewFrame title={out.title + ' — Word preview'} html={out.preview} />
      </div>
    );
  }
  if (f === 'markdown') {
    // Rendered Markdown — GitHub-style flow, not a paginated page.
    return (
      <div className="prevframe prevframe--md mt5">
        <div className="prevpagebar prevpagebar--md">Rendered Markdown · headings, lists, code, tables, quotes — switch to Source for raw .md</div>
        <PreviewFrame title={out.title + ' — Markdown preview'} html={out.preview} />
      </div>
    );
  }
  if (RAWHTML.includes(f)) {
    return (
      <div className="prevframe mt5">
        <div className="prevpagebar">Rendered {out.name} — exactly the markup you download</div>
        <PreviewFrame title={out.title + ' — ' + out.name + ' preview'} html={out.preview} />
      </div>
    );
  }
  if (XMLSTRUCT.includes(f)) {
    return (
      <div className="mt5">
        <div className="prevpagebar prevpagebar--xml">Structured {out.name} — element tree with readable formatting</div>
        <pre className="codeblock prevsrc prevsrc--struct" dangerouslySetInnerHTML={{ __html: highlight(out.content, f) }} />
      </div>
    );
  }
  return (
    <div className="prevframe mt5">
      <div className="prevpagebar">Rendered {out.name} preview</div>
      <PreviewFrame title={out.title + ' preview'} html={out.preview || out.content} />
    </div>
  );
}

function Preview({ gen }) {
  const docTypes = gen.docTypes || [];
  const formats = gen.formats && gen.formats.length ? gen.formats : [gen.format];
  const names = gen.docTypeNames || {};
  const outputs = gen.outputs || {};

  const [doc, setDoc] = useState(docTypes[0]);
  const [fmt, setFmt] = useState(formats[0]);
  const [view, setView] = useState('rendered');
  const [dl, setDl] = useState(false);

  // Selection is validated against what the server actually returned, so
  // changing the generation can never leave a tab pointing at a stale cell.
  const activeDoc = docTypes.includes(doc) ? doc : docTypes[0];
  const activeFmt = formats.includes(fmt) ? fmt : formats[0];
  const key = activeDoc + '::' + activeFmt;
  const out = outputs[key] || {
    key, docType: activeDoc, docTypeName: names[activeDoc] || activeDoc,
    format: activeFmt, name: String(activeFmt).toUpperCase(),
    title: gen.title, content: gen.content, preview: gen.preview, error: null
  };
  const { chips, accent } = buildChips(gen);

  async function dlActive() {
    setDl(true);
    try {
      await download('/generations/' + gen.id + '/download?fmt=' + activeFmt + '&doc=' + activeDoc);
      toast('success', 'Download started', out.title + ' · ' + out.name);
    } catch (e) { toast('error', 'Download failed', e.message); }
    finally { setDl(false); }
  }

  const cellErr = (d, f) => (outputs[d + '::' + f] || {}).error;
  const docHasError = (d) => formats.some((f) => cellErr(d, f));

  return (
    <div>
      <div className="row row--between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h2 className="h02">Preview</h2>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div className="seg" style={{ width: 220 }}>
            <button className={view === 'rendered' ? 'on' : ''} onClick={() => setView('rendered')}>Rendered</button>
            <button className={view === 'source' ? 'on' : ''} onClick={() => setView('source')}>Source</button>
          </div>
          <button className="btn btn--ghost" disabled={dl || !!out.error} onClick={dlActive}>
            {dl ? 'Preparing…' : 'Download ' + out.name}
          </button>
        </div>
      </div>

      {docTypes.length > 1 && (
        <div className="prevtabs prevtabs--doc mt4" role="tablist" aria-label="Document previews">
          {docTypes.map((d) => (
            <button key={d} role="tab" aria-selected={d === activeDoc}
              className={'prevtab' + (d === activeDoc ? ' on' : '') + (docHasError(d) ? ' err' : '')}
              onClick={() => setDoc(d)}>
              {names[d] || d}{docHasError(d) ? ' ⚠' : ''}
            </button>
          ))}
        </div>
      )}

      {formats.length > 1 && (
        <div className="prevtabs prevtabs--fmt mt3" role="tablist" aria-label="Output format previews">
          {formats.map((f) => (
            <button key={f} role="tab" aria-selected={f === activeFmt}
              className={'prevtab prevtab--sm' + (f === activeFmt ? ' on' : '') + (cellErr(activeDoc, f) ? ' err' : '')}
              onClick={() => setFmt(f)}>
              {(outputs[activeDoc + '::' + f] || {}).name || f.toUpperCase()}{cellErr(activeDoc, f) ? ' ⚠' : ''}
            </button>
          ))}
        </div>
      )}

      <p className="helper mt3">
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{out.title || names[activeDoc]}</span>
        {' · '}{out.name} output
      </p>

      {gen.grounded === false && (
        <div className="mt3" style={{ background: '#fff8e1', border: '1px solid #f1c21b', borderLeft: '3px solid #f1c21b', padding: '10px 14px', fontSize: 13, lineHeight: 1.5 }}>
          <strong>Sample structure shown.</strong> AI grounding was not active for this run, so the content
          below demonstrates the document structure rather than your repository&rsquo;s actual code.
          Repository-grounded generation activates automatically when AI generation is enabled on the server.
        </div>
      )}

      <div className="row mt2" style={{ flexWrap: 'wrap', gap: 6 }}>
        {chips.map((c, i) => <span key={c.label + i} className={'tag ' + c.cls}>{c.label}</span>)}
        {accent && (
          <span className="tag tag--outline">
            <span style={{ width: 10, height: 10, background: accent, display: 'inline-block' }} />Accent
          </span>
        )}
      </div>

      {/* key forces a clean remount per cell — no state reuse across tabs */}
      <FormatPreview key={key + ':' + view} gen={gen} out={out} view={view} />
    </div>
  );
}
