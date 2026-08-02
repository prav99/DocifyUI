import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, download } from '../api.js';
import { useFlow, toast } from '../store.jsx';
import { IcCheck, PreviewFrame, HelpLink } from '../ui.jsx';
import posthog from '../posthog.js';

/* Smoothly eased progress: snaps up to the real backend % quickly, then gently
   creeps within a long-running stage so the bar always feels alive — the
   backend % stays the source of truth (the creep never passes it by much). */
function useSmoothProgress(backendPct, running, done) {
  const [disp, setDisp] = useState(0);
  const val = useRef(0);
  useEffect(() => {
    // A finished run must read 100% immediately. Easing up from 4% while the
    // header says "Generation complete" makes a working product look broken —
    // fast template runs finish before the animation has left the gate.
    if (done) { val.current = 100; setDisp(100); return undefined; }
    const id = setInterval(() => {
      const target = done ? 100 : backendPct;
      const ceiling = done ? 100 : Math.min(97, backendPct + 20);
      let v = val.current;
      if (v < target) v += Math.max(0.6, (target - v) * 0.16);
      else if (running && v < ceiling) v += 0.15;
      v = Math.max(0, Math.min(100, Math.min(v, ceiling)));
      if (Math.abs(v - val.current) > 0.001) { val.current = v; setDisp(v); }
      if (done && v >= 100) clearInterval(id);
    }, 80);
    return () => clearInterval(id);
  }, [backendPct, running, done]);
  return disp;
}

/* A once-a-second clock, so elapsed time is live without the poll driving it. */
function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + 's';
  return Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's';
}

/* Elapsed wall-clock for the whole run and for the stage currently executing.
   Both are measured, not estimated.

   There is deliberately NO "time remaining" here. The backend moves the
   percentage at real work boundaries, and one of those stages (writing the
   sections) is a model call that dominates the run — so any rate extrapolated
   from the fast stages before it produces a countdown that is confidently
   wrong. Elapsed time is a number we can stand behind; a made-up ETA is not. */
function useRunTiming(gen, running) {
  const now = useNow(running);
  const runStart = useRef(null);
  const stageStart = useRef(null);
  const lastStep = useRef(null);
  const genId = gen ? gen.id : null;
  const step = gen ? gen.step || 0 : 0;

  useEffect(() => { runStart.current = null; lastStep.current = null; stageStart.current = null; }, [genId]);
  useEffect(() => {
    if (!running) return;
    if (runStart.current == null) runStart.current = Date.now();
    if (lastStep.current !== step) { lastStep.current = step; stageStart.current = Date.now(); }
  }, [running, step]);

  if (!running || runStart.current == null) return { elapsed: null, stageElapsed: null };
  return {
    elapsed: now - runStart.current,
    stageElapsed: stageStart.current == null ? null : now - stageStart.current
  };
}

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

/* ---------- What this run actually produced ----------
   Everything here is read back from the generation the server returned:
   `output.scopeWarning` is the pipeline's own explanation (files excluded by
   scope, an empty branch, a branch fallback), and `grounded` is true only when
   the run produced AI-written sections rather than blueprint structure.
   Nothing is inferred — if the server recorded no reason, we say that instead
   of guessing one. */
function RunOutcome({ gen }) {
  const warn = ((gen.output || {}).scopeWarning || '').trim();
  const grounded = gen.grounded !== false;
  const isRepo = typeof gen.repo === 'string' && gen.repo.includes('/');
  const mono = { overflowWrap: 'anywhere' };

  if (grounded && !warn) {
    return (
      <p className="helper mt5" style={{ overflowWrap: 'anywhere' }}>
        Source-grounded — the sections below were written from your source material, not from the
        document blueprint.
        {isRepo ? <> Read from <span className="mono" style={mono}>{gen.repo}</span>
          {gen.branch ? <> on branch <span className="mono" style={mono}>{gen.branch}</span></> : null}.</> : null}
      </p>
    );
  }

  const heading = grounded
    ? 'One thing to know about this run'
    : 'This document shows the blueprint structure, not your source content';

  return (
    <div className="mt5" role="note" style={{
      background: '#fff8e1', border: '1px solid #f1c21b', borderLeft: '3px solid #f1c21b',
      padding: '12px 16px', fontSize: 13, lineHeight: 1.55, overflowWrap: 'anywhere'
    }}>
      <strong>{heading}</strong>
      {warn ? <p className="mt2" style={{ margin: '6px 0 0' }}>{warn}</p> : null}
      {!grounded && !warn && (
        <p className="mt2" style={{ margin: '6px 0 0' }}>
          No AI-written sections were produced for this run, so what you see below is the standardized
          structure for this document type rather than content from your sources. The server did not
          record a reason for this run.
        </p>
      )}
      {!grounded && warn && (
        <p className="mt2" style={{ margin: '6px 0 0' }}>
          Because of this, the document below is the standardized structure for this document type
          rather than content from your sources.
        </p>
      )}
      {isRepo && (
        <p className="helper mt2" style={{ margin: '6px 0 0' }}>
          Branch read: <span className="mono" style={mono}>{gen.branch || 'default'}</span> ·
          repository <span className="mono" style={mono}>{gen.repo}</span>
        </p>
      )}
    </div>
  );
}

export default function Generate() {
  const nav = useNavigate();
  const { flow } = useFlow();
  const [gen, setGen] = useState(null);
  const [pollErr, setPollErr] = useState('');
  const [resume, setResume] = useState(0);
  const doneToasted = useRef(false);

  useEffect(() => {
    if (!flow.genId) { nav('/format'); return undefined; }
    let alive = true;
    let timer = null;
    let fails = 0;
    setPollErr('');
    async function poll() {
      try {
        const d = await api('/generations/' + flow.genId);
        if (!alive) return;
        fails = 0;
        setGen(d.generation);
        if (d.generation.status === 'complete') {
          if (!doneToasted.current) {
            doneToasted.current = true;
            posthog.capture('generation_completed', {
              format: d.generation.format,
              doc_type_count: (d.generation.docTypes || []).length,
            });
            toast('success', 'Document generated', (d.generation.title || 'Document') + ' is ready for quality review');
          }
          return; // stop polling
        }
        if (d.generation.status === 'failed') {
          posthog.capture('generation_failed', {
            format: d.generation.format,
            stage: d.generation.stage || undefined,
          });
          return;
        }
        timer = setTimeout(poll, 700);
      } catch (e) {
        // Bounded retry with backoff, and never after unmount: an endpoint that
        // stays down used to leave a 1.5s loop hammering the API for the rest
        // of the session, on a page the user had already navigated away from.
        if (!alive) return;
        fails += 1;
        if (fails > 5) { setPollErr(e.message || 'Could not reach the server'); return; }
        timer = setTimeout(poll, Math.min(8000, 1500 * Math.pow(2, fails - 1)));
      }
    }
    poll();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [flow.genId, nav, resume]);

  const gRunning = gen ? (gen.status === 'running' || gen.status === 'queued') && !pollErr : !pollErr;
  const gDone = gen ? gen.status === 'complete' : false;
  const displayPct = useSmoothProgress(gen ? (gen.progress || 0) : 0, gRunning, gDone);
  const { elapsed, stageElapsed } = useRunTiming(gen, gRunning);

  if (!gen) {
    return (
      <div className="page" aria-live="polite">
        {pollErr ? (
          <div className="genfail">
            <b>Could not load this generation.</b> <span>{pollErr}</span>
            <button className="btn btn--tertiary btn--sm btn--center" style={{ marginLeft: 12 }}
              onClick={() => setResume((n) => n + 1)}>Try again</button>
            <button className="btn btn--tertiary btn--sm btn--center" onClick={() => nav('/format')}>← Back</button>
          </div>
        ) : (
          <>
            <h1 className="h04">Generating your document</h1>
            <p className="body01 t2 mt3">Loading this run…</p>
            <div className="tile tile--white mt6" style={{ padding: 24 }} aria-hidden="true">
              <div className="genprev-skel" style={{ padding: 0 }}>
                <div className="skel w60" style={{ height: 18 }} />
                <div className="skel w90" /><div className="skel w80" /><div className="skel" />
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  const done = gen.status === 'complete';
  const failed = gen.status === 'failed';
  const running = gen.status === 'running' || gen.status === 'queued';
  const steps = gen.steps || [];
  const activeStep = gen.step || 0;
  const stageLabel = done ? 'Generation complete' : (steps[activeStep] || gen.stage || 'Starting…');
  // The pipeline moves the percentage at real work boundaries, so a stage can
  // legitimately sit still for a while. Saying how long it has been there is
  // measured reassurance; it is not a prediction of when it will end.
  const slowStage = running && !pollErr && stageElapsed != null && stageElapsed > 25000;
  // A run that failed before writing any content had its reserved document
  // handed back by the server (releaseDocumentQuota); one that failed after
  // delivering content did not, so only claim the refund when it applies.
  const refunded = failed && !gen.content;

  return (
    <>
      <div className="page" style={{ maxWidth: 1200 }}>
        <div className="row row--between" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h1 className="h04">Generating {done && gen.title ? gen.title.toLowerCase() : 'your document'}</h1>
          <HelpLink topic="generate" />
        </div>
        <p className="body01 t2 mt3" style={{ overflowWrap: 'anywhere' }}>
          From <span className="mono">{gen.repo}</span>
          {gen.branch && String(gen.repo || '').includes('/') ? <> @ <span className="mono">{gen.branch}</span></> : null}
          {' → '}{(gen.formats && gen.formats.length ? gen.formats : [gen.format]).map((f) => f.toUpperCase()).join(' · ')}
          {gen.docTypes.length > 1 ? ' · ' + gen.docTypes.length + ' documents, each previewed separately' : ''}
        </p>

        {!failed && (
          <div className="genprog mt6">
            <div className="genprog-head">
              <span className="genprog-title" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                {stageLabel} <b>{Math.round(displayPct)}%</b>
              </span>
              <span className="genprog-meta" style={{ minWidth: 0, overflowWrap: 'anywhere' }} aria-live="polite">
                {done ? 'All ' + steps.length + ' stages finished'
                  : <>Step {Math.min(activeStep + 1, steps.length)} of {steps.length}
                    {gen.stageDetail ? ' · ' + gen.stageDetail : ''}
                    {elapsed != null ? ' · ' + fmtDuration(elapsed) + ' elapsed' : ''}</>}
              </span>
            </div>
            <div className="genprog-track" role="progressbar" aria-valuenow={Math.round(displayPct)}
              aria-valuemin={0} aria-valuemax={100} aria-label="Generation progress">
              <div className={'genprog-fill' + (done ? ' is-done' : '')} style={{ width: displayPct + '%' }} />
            </div>
            {slowStage && (
              <p className="helper" style={{ marginTop: 8 }}>
                This stage has been running for {fmtDuration(stageElapsed)}. Stages advance when real work
                finishes rather than on a timer, so a long one is normal — this page keeps updating, and
                you can leave it and reopen the document later from Documents.
              </p>
            )}
          </div>
        )}
        {pollErr && !failed && !done && (
          <div className="genfail mt6" role="alert">
            <b>Progress updates stopped.</b>
            <span>{pollErr} — the run may still be finishing on the server, but this page is no longer being updated.</span>
            <button className="btn btn--tertiary btn--sm btn--center" style={{ marginLeft: 12 }}
              onClick={() => setResume((n) => n + 1)}>Resume updates</button>
          </div>
        )}
        {failed && (
          <div className="tile tile--white mt6" role="alert"
            style={{ padding: 24, borderLeft: '3px solid var(--support-error)', overflowWrap: 'anywhere' }}>
            <h2 className="h02">Generation failed</h2>
            <p className="body01 mt3">{gen.stageDetail || 'The server did not record a reason for this failure.'}</p>
            <p className="helper mt3">
              Failed at step {Math.min(activeStep + 1, steps.length || 1)} of {steps.length || 1}
              {steps[activeStep] ? ' · ' + steps[activeStep] : ''}
              {elapsed != null ? ' · after ' + fmtDuration(elapsed) : ''}
            </p>
            {refunded && (
              <p className="helper mt2">
                Nothing was delivered, so the document reserved for this run was returned to your monthly
                allowance.
              </p>
            )}
            <div className="row mt5" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn--primary btn--center" onClick={() => nav('/format')}>
                Change the options and run it again<span className="ico">→</span>
              </button>
              <button className="btn btn--tertiary btn--center" onClick={() => setResume((n) => n + 1)}>
                Check the status again
              </button>
              <button className="btn btn--ghost btn--center" onClick={() => nav('/history')}>Open Documents</button>
            </div>
          </div>
        )}
        {done && <RunOutcome gen={gen} />}

        <div className="genlayout mt7">
          <div className="tile tile--white" style={{ padding: 24, alignSelf: 'start' }}>
            <h2 className="h02 mb5">Pipeline</h2>
            <div>
              {steps.map((s, i) => {
                const state = done || i < activeStep ? 'done' : (i === activeStep && running) ? 'doing' : 'todo';
                return (
                  <div key={s + i} className={'genstep ' + state}>
                    <span className="sicon">
                      {state === 'done' ? <IcCheck /> : state === 'doing' ? <span className="spin" /> : <span className="dotcircle" />}
                    </span>
                    <span className="genstep-txt" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                      {s}
                      {state === 'doing' && gen.stageDetail ? <span className="genstep-sub">{gen.stageDetail}</span> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            {done ? (
              <>
                <Preview gen={gen} />
                <div className="synccta mt5">
                  <div>
                    <p className="h01">This document is current today. Keep it that way.</p>
                    <p className="body01 t2 mt2">
                      <strong>Doc sync</strong> turns a set of changes to <span className="mono">{gen.repo}</span> into a
                      proposed section-level rewrite — you see the exact diff with the placement reasoning, and{' '}
                      <strong>nothing publishes until you approve it</strong>. Every approval is versioned, so you can
                      roll back any change.
                    </p>
                  </div>
                  <button className="btn btn--primary" onClick={() => nav('/sync')}>
                    Review-first updates<span className="ico">→</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="tile tile--white genprev">
                <div className="genprev-head" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <h2 className="h02" style={{ margin: 0 }}>Preview</h2>
                  {/* The dot tracks the run, not the preview: the document is
                      rendered once at the end, so calling this a live build
                      would describe something that is not happening. */}
                  {running && !pollErr && <span className="genprev-live"><span className="genprev-dot" /> run in progress</span>}
                </div>
                {gen.preview ? (
                  <>
                    <p className="helper" style={{ padding: '10px 20px 0' }}>
                      The previous version of this document. It is replaced when this run finishes.
                    </p>
                    <div className="genprev-frame"><PreviewFrame html={gen.preview} title="Previous version of this document" /></div>
                  </>
                ) : (
                  <>
                    <p className="helper" style={{ padding: '10px 20px 0' }}>
                      {failed ? 'This run produced no document.'
                        : 'The document is rendered once the sections are written — it appears here at the “Preparing preview” stage.'}
                    </p>
                    <div className="genprev-skel" aria-hidden="true">
                      <div className="skel w60" style={{ height: 18 }} />
                      <div className="skel w90" /><div className="skel w80" /><div className="skel" />
                      <div className="skel w90" style={{ marginTop: 22 }} /><div className="skel w60" /><div className="skel w80" />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="navbar">
        <div className="inner">
          <button className="btn btn--ghost btn--center" onClick={() => nav('/format')}>← Back</button>
          <div className="row">
            <span className="navnote">{done ? 'Generation complete' : failed ? 'Generation failed' : pollErr ? 'Updates paused' : 'Generating… ' + Math.round(displayPct) + '%'}</span>
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
  // The server withholds the text of a format the plan does not include, so
  // the cell exists but is empty. Say why, rather than showing "Preparing…"
  // for something that will never arrive.
  if (out.locked) {
    return (
      <div className="tile mt5" style={{ padding: 24, borderLeft: '3px solid var(--support-warning)' }}>
        <p className="h01">{out.name} is not included in your plan</p>
        <p className="body01 t2 mt2">
          This document was generated, but {out.name} output is a paid export format — its content is not
          sent to the browser and it cannot be downloaded on your current plan.
        </p>
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
      const name = await download('/generations/' + gen.id + '/download?fmt=' + activeFmt + '&doc=' + activeDoc);
      toast('success', 'Download started', name || (out.title + ' · ' + out.name));
    } catch (e) { toast('error', 'Download failed', e.message); }
    finally { setDl(false); }
  }

  const cellErr = (d, f) => (outputs[d + '::' + f] || {}).error;
  const docHasError = (d) => formats.some((f) => cellErr(d, f));

  // Left/Right move between tabs, Home/End jump to the ends — the pattern a
  // screen-reader user expects from role="tablist", and the only way to reach
  // the other previews without a mouse in a compact viewport.
  const tabKeys = (list, current, set) => (e) => {
    const i = list.indexOf(current);
    let n = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % list.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = list.length - 1;
    if (n == null) return;
    e.preventDefault();
    set(list[n]);
    const el = e.currentTarget.querySelectorAll('[role="tab"]')[n];
    if (el) el.focus();
  };

  return (
    <div style={{ minWidth: 0 }}>
      <div className="row row--between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h2 className="h02">Preview</h2>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div className="seg" style={{ width: 220, maxWidth: '100%' }} role="group" aria-label="Preview mode">
            <button aria-pressed={view === 'rendered'} className={view === 'rendered' ? 'on' : ''} onClick={() => setView('rendered')}>Rendered</button>
            <button aria-pressed={view === 'source'} className={view === 'source' ? 'on' : ''} onClick={() => setView('source')}>Source</button>
          </div>
          <button className="btn btn--ghost" disabled={dl || !!out.error || !!out.locked} onClick={dlActive}>
            {dl ? 'Preparing…' : out.locked ? out.name + ' not in your plan' : 'Download ' + out.name + (out.ext || '')}
          </button>
        </div>
      </div>

      {docTypes.length > 1 && (
        <div className="prevtabs prevtabs--doc mt4" role="tablist" aria-label="Document previews"
          onKeyDown={tabKeys(docTypes, activeDoc, setDoc)}>
          {docTypes.map((d) => (
            <button key={d} role="tab" aria-selected={d === activeDoc} tabIndex={d === activeDoc ? 0 : -1}
              aria-controls="preview-panel"
              className={'prevtab' + (d === activeDoc ? ' on' : '') + (docHasError(d) ? ' err' : '')}
              onClick={() => setDoc(d)}>
              {names[d] || d}{docHasError(d) ? ' ⚠' : ''}
            </button>
          ))}
        </div>
      )}

      {formats.length > 1 && (
        <div className="prevtabs prevtabs--fmt mt3" role="tablist" aria-label="Output format previews"
          onKeyDown={tabKeys(formats, activeFmt, setFmt)}>
          {formats.map((f) => {
            const cell = outputs[activeDoc + '::' + f] || {};
            return (
              <button key={f} role="tab" aria-selected={f === activeFmt} tabIndex={f === activeFmt ? 0 : -1}
                aria-controls="preview-panel"
                className={'prevtab prevtab--sm' + (f === activeFmt ? ' on' : '') + (cell.error ? ' err' : '')}
                onClick={() => setFmt(f)}>
                {cell.name || f.toUpperCase()}{cell.error ? ' ⚠' : cell.locked ? ' 🔒' : ''}
              </button>
            );
          })}
        </div>
      )}

      <p className="helper mt3" style={{ overflowWrap: 'anywhere' }}>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{out.title || names[activeDoc]}</span>
        {' · '}{out.name} output{out.ext ? ' (' + out.ext + ')' : ''}
      </p>

      <div className="row mt2" style={{ flexWrap: 'wrap', gap: 6 }}>
        {chips.map((c, i) => <span key={c.label + i} className={'tag ' + c.cls}>{c.label}</span>)}
        {accent && (
          <span className="tag tag--outline">
            <span style={{ width: 10, height: 10, background: accent, display: 'inline-block' }} />Accent
          </span>
        )}
      </div>

      {/* key forces a clean remount per cell — no state reuse across tabs */}
      <div id="preview-panel" role="tabpanel" tabIndex={-1} aria-label={(out.title || 'Document') + ' — ' + out.name} style={{ minWidth: 0 }}>
        <FormatPreview key={key + ':' + view} gen={gen} out={out} view={view} />
      </div>
    </div>
  );
}
