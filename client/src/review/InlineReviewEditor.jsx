import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { toast } from '../store.jsx';
import { DiffView } from '../pages/History.jsx';
import {
  buildBlocks, assembleDocument, resolvedLines, reviewStats, STATUS, SOURCE,
  ACTIONS, STYLE_GUIDES, applyTransform, instructionToLocal, auditEntry,
  TAG_FOR_STATUS, TAG_FOR_SOURCE, DEFAULT_CONFIG, uid, looksLikeCode
} from './engine.js';

/* =====================================================================
   InlineReviewEditor — the hybrid inline editing experience for the
   Standardize › Review & export step.

   Reviewers select any span (word → section) and accept, reject, edit,
   or AI-rewrite it. Manual and AI edits share one block model, so the
   unified diff, change list, version history and audit trail all stay in
   sync. Nothing is applied until Save + Approve. Carbon-aligned visuals.
   ===================================================================== */

const linesToText = (ls) => (ls || []).join('\n');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

// Character offset of (container,off) within root, matching model text length
// (blocks render current text as a single pre-wrap node, so newlines count).
function offsetWithin(root, container, off) {
  try {
    const r = document.createRange();
    r.setStart(root, 0);
    r.setEnd(container, off);
    return r.toString().length;
  } catch { return 0; }
}

export default function InlineReviewEditor({ proposal, config: cfgProp, onClose, onApproved, onApprove: onApproveProp, onSaveContent, onRequestChanges, approveLabel = 'Approve & publish', saveLabel = 'Save review', backLabel = 'Back to queue', footerNote }) {
  const config = useMemo(() => ({ ...DEFAULT_CONFIG, ...(cfgProp || {}) }), [cfgProp]);
  const diff = useMemo(() => (typeof proposal.diff === 'string' ? JSON.parse(proposal.diff || '{}') : (proposal.diff || {})), [proposal]);
  const beforeText = useMemo(() => linesToText(diff.before || []), [diff]);
  const proposedText = useMemo(() => linesToText(diff.after || []), [diff]);

  const [blocks, setBlocks] = useState(() => buildBlocks(beforeText, proposedText));
  const [mode, setMode] = useState('inline');          // inline | split
  const [panel, setPanel] = useState('changes');        // changes | audit | comments | null
  const [audit, setAudit] = useState([]);
  const [sel, setSel] = useState(null);                 // selection target
  const [menu, setMenu] = useState(null);               // right-click menu {x,y,target}
  const [pop, setPop] = useState(null);                 // rewrite popover {x,y,target}
  const [preview, setPreview] = useState(null);         // inline preview {target, original, results:[{label,text,simulated,guide}], idx, loading, editing}
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [live, setLive] = useState('');                 // aria-live announcement

  const past = useRef([]);       // undo stack of {blocks, audit}
  const future = useRef([]);     // redo stack
  const editorRef = useRef(null);
  const busyKey = useRef('');    // prevents overlapping rewrites on same target

  const stats = useMemo(() => reviewStats(blocks), [blocks]);
  const currentText = useMemo(() => assembleDocument(blocks), [blocks]);

  /* ---------------- history (undo/redo) ---------------- */
  const snapshot = useCallback(() => {
    past.current.push({ blocks: clone(blocks), audit: clone(audit) });
    if (past.current.length > 100) past.current.shift();
    future.current = [];
  }, [blocks, audit]);

  const undo = useCallback(() => {
    if (!past.current.length) return;
    future.current.push({ blocks: clone(blocks), audit: clone(audit) });
    const s = past.current.pop();
    setBlocks(s.blocks); setAudit(s.audit); setPreview(null); setLive('Undid last change');
  }, [blocks, audit]);

  const redo = useCallback(() => {
    if (!future.current.length) return;
    past.current.push({ blocks: clone(blocks), audit: clone(audit) });
    const s = future.current.pop();
    setBlocks(s.blocks); setAudit(s.audit); setPreview(null); setLive('Redid change');
  }, [blocks, audit]);

  const pushAudit = useCallback((e) => setAudit((a) => [e, ...a]), []);

  /* ---------------- selection capture ---------------- */
  const clearUi = useCallback(() => { setSel(null); setMenu(null); setPop(null); }, []);

  const readSelection = useCallback(() => {
    const s = window.getSelection();
    if (!s || s.rangeCount === 0 || s.isCollapsed) { setSel(null); return; }
    const root = editorRef.current;
    if (!root) return;
    const range = s.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    const startEl = elWithUid(range.startContainer);
    const endEl = elWithUid(range.endContainer);
    if (!startEl || !endEl) { setSel(null); return; }
    const text = s.toString();
    if (!text.trim()) { setSel(null); return; }
    const rect = (range.getBoundingClientRect ? range.getBoundingClientRect() : null) || { top: 120, left: 200, height: 0 };
    if (startEl === endEl) {
      const start = offsetWithin(startEl, range.startContainer, range.startOffset);
      const end = offsetWithin(startEl, range.endContainer, range.endOffset);
      setSel({ kind: 'range', blockId: startEl.dataset.uid, start: Math.min(start, end), end: Math.max(start, end), text, rect, editable: startEl.dataset.editable === '1' });
    } else {
      // multi-block: collect covered editable block ids in DOM order
      const ids = [];
      root.querySelectorAll('[data-uid][data-editable="1"]').forEach((el) => {
        if (!range.intersectsNode || range.intersectsNode(el)) ids.push(el.dataset.uid);
      });
      setSel({ kind: 'blocks', ids, text, rect, editable: ids.length > 0 });
    }
  }, []);

  useEffect(() => {
    const onUp = () => setTimeout(readSelection, 0);
    const onKey = (e) => { if (e.shiftKey || e.key === 'ArrowLeft' || e.key === 'ArrowRight') setTimeout(readSelection, 0); };
    const onScroll = () => setSel((p) => (p ? null : p));
    document.addEventListener('mouseup', onUp);
    document.addEventListener('keyup', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => { document.removeEventListener('mouseup', onUp); document.removeEventListener('keyup', onKey); window.removeEventListener('scroll', onScroll, true); };
  }, [readSelection]);

  // global keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (meta && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      else if (e.key === 'Escape') { setMenu(null); setPop(null); setPreview(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  /* ---------------- block mutation primitives ---------------- */
  const updateBlock = useCallback((id, fn) => {
    setBlocks((bs) => bs.map((b) => (b.id === id ? fn(clone(b)) : b)));
  }, []);

  const replaceBlockWith = useCallback((id, newBlocks) => {
    setBlocks((bs) => { const i = bs.findIndex((b) => b.id === id); if (i < 0) return bs; return [...bs.slice(0, i), ...newBlocks, ...bs.slice(i + 1)]; });
  }, []);

  // Replace [start,end] inside a block's *current* text with newText, producing
  // tracked change block(s). Works for context (splits) and change blocks.
  const applyRangeEdit = useCallback((blockId, start, end, newText, meta) => {
    snapshot();
    const b = blocks.find((x) => x.id === blockId);
    if (!b) return;
    const cur = linesToText(resolvedLines(b));
    const a = clamp(start, 0, cur.length), z = clamp(end, a, cur.length);
    const selectedOld = cur.slice(a, z);
    const nextText = cur.slice(0, a) + newText + cur.slice(z);
    if (b.type === 'context') {
      const pre = cur.slice(0, a), post = cur.slice(z);
      const parts = [];
      if (pre) parts.push({ id: uid('ctx'), type: 'context', lines: pre.split('\n') });
      parts.push({
        id: uid('chg'), type: 'change', kind: 'mod',
        before: selectedOld.split('\n'), after: newText.split('\n'), baseAfter: selectedOld.split('\n'),
        status: STATUS.ACCEPTED, source: meta.source, edited: true, guide: meta.guide || null, instruction: meta.instruction || null,
        history: [{ after: selectedOld.split('\n'), source: SOURCE.AI, at: new Date().toISOString() }], comments: []
      });
      if (post) parts.push({ id: uid('ctx'), type: 'context', lines: post.split('\n') });
      replaceBlockWith(blockId, parts);
    } else {
      updateBlock(blockId, (bl) => {
        bl.history = [{ after: bl.after.slice(), source: bl.source, at: new Date().toISOString() }, ...(bl.history || [])].slice(0, 20);
        bl.after = nextText.split('\n');
        bl.status = STATUS.ACCEPTED; bl.edited = true; bl.source = meta.source;
        if (meta.guide) bl.guide = meta.guide; if (meta.instruction) bl.instruction = meta.instruction;
        return bl;
      });
    }
    pushAudit(auditEntry({ blockId, type: meta.type, action: meta.action, before: selectedOld, after: newText, source: meta.source, guide: meta.guide, instruction: meta.instruction }));
    setLive((meta.source === SOURCE.MANUAL ? 'Manual edit applied' : 'Rewrite applied') + '. Diff updated.');
  }, [blocks, snapshot, replaceBlockWith, updateBlock, pushAudit]);

  const setStatus = useCallback((id, status) => {
    snapshot();
    updateBlock(id, (b) => { b.status = status; if (status === STATUS.ACCEPTED && b.source === SOURCE.AI) b.source = SOURCE.ACCEPTED; return b; });
    const b = blocks.find((x) => x.id === id);
    pushAudit(auditEntry({ blockId: id, type: 'decision', action: status, before: linesToText(b?.before), after: linesToText(b?.after), source: b?.source }));
    setLive('Change ' + status);
  }, [blocks, snapshot, updateBlock, pushAudit]);

  const restoreBlock = useCallback((id) => {
    snapshot();
    updateBlock(id, (b) => { b.history = [{ after: b.after.slice(), source: b.source, at: new Date().toISOString() }, ...(b.history || [])]; b.after = b.baseAfter.slice(); b.edited = false; b.source = SOURCE.RESTORED; b.status = STATUS.PENDING; return b; });
    pushAudit(auditEntry({ blockId: id, type: 'restore', action: 'restore-suggestion', source: SOURCE.RESTORED }));
    setLive('Restored the original AI suggestion');
  }, [snapshot, updateBlock, pushAudit]);

  /* ---------------- rewrite orchestration ---------------- */
  // returns { text, simulated, guide } — local when possible, else server, else local fallback
  const runOne = useCallback(async (text, opts) => {
    const { actionId, guide, instruction } = opts;
    // style guide / custom instruction / ai-only actions → server (fallback local)
    const localAction = actionId && ACTIONS[actionId] && ACTIONS[actionId].local && !ACTIONS[actionId].ai;
    if (localAction && !guide && !instruction) {
      const r = applyTransform(actionId, text);
      return { text: r.text, simulated: r.simulated, guide: null };
    }
    if (guide) { // style guide: local pipeline is deterministic + instant, but let server refine if key present
      try {
        const r = await api('/sync/rewrite', { method: 'POST', body: { text, guide } });
        return { text: r.text, simulated: r.simulated, guide };
      } catch { const r = applyTransform('styleGuide', text, { guide }); return { text: r.text, simulated: true, guide }; }
    }
    if (instruction) {
      try { const r = await api('/sync/rewrite', { method: 'POST', body: { text, instruction } }); return { text: r.text, simulated: r.simulated }; }
      catch { const r = instructionToLocal(instruction, text); return { text: r.text, simulated: true }; }
    }
    try { const r = await api('/sync/rewrite', { method: 'POST', body: { text, action: actionId || 'rewrite' } }); return { text: r.text, simulated: r.simulated }; }
    catch { const r = applyTransform(actionId || 'rewrite', text); return { text: r.text, simulated: true }; }
  }, []);

  const openPreview = useCallback(async (target, opts) => {
    const text = target.text != null ? target.text : selText(blocks, target);
    if (!text || !text.trim()) { toast('info', 'Select some text first'); return; }
    if (text.length > config.warnRewriteOverChars && !window.confirm('This selection is large (' + text.length + ' characters). Rewrite it anyway?')) return;
    const key = target.blockId + ':' + (target.start || 0) + ':' + (opts.actionId || opts.guide || 'instr');
    if (busyKey.current === key) return; busyKey.current = key;
    setPop(null); setMenu(null);
    setPreview({ target, original: text, results: [], idx: 0, loading: true, opts });
    setBusy(true); setLive('Generating rewrite…');
    try {
      const label = opts.guide ? (STYLE_GUIDES.find((g) => g.id === opts.guide) || {}).name : (ACTIONS[opts.actionId] || {}).label || 'Custom';
      const r = await runOne(text, opts);
      setPreview((p) => (p && p.target === target ? { ...p, loading: false, results: [{ label, ...r }] } : p));
      setLive('Rewrite ready. Review, then accept or reject.');
    } catch (e) {
      setPreview(null); toast('error', 'Rewrite failed', e.message);
    } finally { setBusy(false); busyKey.current = ''; }
  }, [blocks, config.warnRewriteOverChars, runOne]);

  const compareStyles = useCallback(async () => {
    if (!preview) return;
    setPreview((p) => ({ ...p, loading: true }));
    setBusy(true);
    try {
      const text = preview.original;
      const alts = config.alternatives.slice(0, 3);
      const results = [];
      for (const id of alts) { const r = await runOne(text, { actionId: id }); results.push({ label: (ACTIONS[id] || {}).label || id, ...r }); }
      setPreview((p) => ({ ...p, loading: false, results, idx: 0 }));
      setLive(results.length + ' alternatives ready. Use left/right to compare.');
    } finally { setBusy(false); }
  }, [preview, config.alternatives, runOne]);

  const updateWholeBlock = useCallback((blockId, newText, meta) => {
    snapshot();
    const b = blocks.find((x) => x.id === blockId); const old = linesToText(resolvedLines(b));
    updateBlock(blockId, (bl) => {
      bl.history = [{ after: bl.after ? bl.after.slice() : bl.lines.slice(), source: bl.source || SOURCE.AI, at: new Date().toISOString() }, ...(bl.history || [])];
      if (bl.type === 'context') { // convert context → change
        return { id: bl.id, type: 'change', kind: 'mod', before: bl.lines.slice(), after: newText.split('\n'), baseAfter: bl.lines.slice(), status: STATUS.ACCEPTED, source: meta.source, edited: true, guide: meta.guide || null, instruction: meta.instruction || null, history: [], comments: [] };
      }
      bl.after = newText.split('\n'); bl.status = STATUS.ACCEPTED; bl.edited = true; bl.source = meta.source; if (meta.guide) bl.guide = meta.guide; return bl;
    });
    pushAudit(auditEntry({ blockId, type: meta.type, action: meta.action, before: old, after: newText, source: meta.source, guide: meta.guide, instruction: meta.instruction }));
  }, [blocks, snapshot, updateBlock, pushAudit]);

  // apply an async transform to each covered block independently (multi-block selection / bulk)
  const applyToBlocks = useCallback(async (ids, opts, meta) => {
    snapshot();
    for (const id of ids) {
      const b = blocks.find((x) => x.id === id); if (!b) continue;
      const text = linesToText(resolvedLines(b));
      if (!text.trim()) continue;
      const r = await runOne(text, opts);
      // eslint-disable-next-line no-loop-func
      setBlocks((bs) => bs.map((x) => {
        if (x.id !== id) return x; const bl = clone(x);
        if (bl.type === 'context') return { id: bl.id, type: 'change', kind: 'mod', before: bl.lines.slice(), after: r.text.split('\n'), baseAfter: bl.lines.slice(), status: STATUS.ACCEPTED, source: meta.source, edited: true, guide: r.guide || null, instruction: meta.instruction || null, history: [], comments: [] };
        bl.history = [{ after: bl.after.slice(), source: bl.source, at: new Date().toISOString() }, ...(bl.history || [])];
        bl.after = r.text.split('\n'); bl.status = STATUS.ACCEPTED; bl.edited = true; bl.source = meta.source; bl.guide = r.guide || bl.guide; return bl;
      }));
      pushAudit(auditEntry({ blockId: id, type: meta.type, action: meta.action, before: text, after: r.text, source: meta.source, guide: r.guide, instruction: meta.instruction }));
    }
    setLive('Applied to ' + ids.length + ' block' + (ids.length === 1 ? '' : 's'));
  }, [blocks, snapshot, runOne, pushAudit]);

  const acceptPreview = useCallback(() => {
    if (!preview || !preview.results.length) return;
    const chosen = preview.results[preview.idx];
    const t = preview.target;
    const meta = { type: 'rewrite', action: preview.opts.actionId || (preview.opts.guide ? 'styleGuide' : 'instruction'), source: preview.opts.guide ? SOURCE.STYLEGUIDE : SOURCE.AI, guide: chosen.guide || preview.opts.guide || null, instruction: preview.opts.instruction || null };
    if (t.kind === 'range') applyRangeEdit(t.blockId, t.start, t.end, chosen.text, meta);
    else if (t.kind === 'block') updateWholeBlock(t.blockId, chosen.text, meta);
    else if (t.kind === 'blocks') applyToBlocks(t.ids, { actionId: preview.opts.actionId, guide: preview.opts.guide, instruction: preview.opts.instruction }, meta);
    setPreview(null); clearUi();
  }, [preview, applyRangeEdit, updateWholeBlock, applyToBlocks, clearUi]);

  /* ---------------- manual editing ---------------- */
  const [manual, setManual] = useState(null); // {target, text}
  const openManual = useCallback((target) => {
    const text = target.text != null ? target.text : selText(blocks, target);
    setManual({ target, text }); setPop(null); setMenu(null); setSel(null);
  }, [blocks]);
  const commitManual = useCallback(() => {
    if (!manual) return;
    const t = manual.target; const meta = { type: 'manual', action: 'manual-edit', source: SOURCE.MANUAL };
    if (t.kind === 'range') applyRangeEdit(t.blockId, t.start, t.end, manual.text, meta);
    else updateWholeBlock(t.blockId, manual.text, meta);
    setManual(null);
  }, [manual, applyRangeEdit, updateWholeBlock]);

  /* ---------------- comments ---------------- */
  const addComment = useCallback((blockId, text) => {
    if (!text || !text.trim()) return;
    updateBlock(blockId, (b) => { b.comments = [...(b.comments || []), { id: uid('cm'), text: text.trim(), author: 'you', at: new Date().toISOString(), resolved: false }]; return b; });
    pushAudit(auditEntry({ blockId, type: 'comment', action: 'add-comment', after: text, source: SOURCE.MANUAL }));
    setLive('Comment added');
  }, [updateBlock, pushAudit]);

  /* ---------------- bulk actions ---------------- */
  const bulk = useCallback(async (kind) => {
    const changed = blocks.filter((b) => b.type === 'change');
    const affectedLines = changed.reduce((s, b) => s + Math.max(b.before.length, b.after.length), 0);
    if (affectedLines > config.confirmBulkOverLines && !window.confirm('This affects ~' + affectedLines + ' lines across ' + changed.length + ' changes. Continue?')) return;
    if (kind === 'accept-all') { snapshot(); setBlocks((bs) => bs.map((b) => (b.type === 'change' && b.status === STATUS.PENDING ? { ...b, status: STATUS.ACCEPTED, source: b.source === SOURCE.AI ? SOURCE.ACCEPTED : b.source } : b))); setLive('Accepted all proposed changes'); }
    else if (kind === 'reject-ai') { snapshot(); setBlocks((bs) => bs.map((b) => (b.type === 'change' && (b.source === SOURCE.AI || b.source === SOURCE.ACCEPTED) && !b.edited ? { ...b, status: STATUS.REJECTED } : b))); setLive('Rejected all unedited AI changes'); }
    else if (kind === 'apply-guide-unresolved') {
      const ids = blocks.filter((b) => b.type === 'change' && b.status === STATUS.PENDING).map((b) => b.id);
      await applyToBlocks(ids, { guide: config.styleGuides[0] }, { type: 'styleguide', action: 'apply-guide', source: SOURCE.STYLEGUIDE, guide: config.styleGuides[0] });
    }
  }, [blocks, config, snapshot, applyToBlocks]);

  const acceptSection = useCallback((idx) => {
    snapshot();
    setBlocks((bs) => {
      const out = bs.map((b) => ({ ...b }));
      for (let i = idx; i < out.length; i++) { if (i > idx && isHeading(out[i])) break; if (out[i].type === 'change' && out[i].status === STATUS.PENDING) { out[i].status = STATUS.ACCEPTED; if (out[i].source === SOURCE.AI) out[i].source = SOURCE.ACCEPTED; } }
      return out;
    });
    setLive('Accepted all changes in section');
  }, [snapshot]);

  /* ---------------- save + approve ---------------- */
  const saveReview = useCallback(async () => {
    setBusy(true);
    try {
      if (onSaveContent) await onSaveContent(currentText.split('\n'), audit, stats);
      else await api('/sync/updates/' + proposal.id + '/content', { method: 'PUT', body: { after: currentText.split('\n'), audit, stats } });
      setSaved(true); toast('success', onSaveContent ? 'Draft saved' : 'Review saved', onSaveContent ? 'Your edits are kept — return anytime to finish and approve.' : 'Your edited version is stored on the proposal. Approve to publish it as a new version.');
    } catch (e) { toast('error', 'Save failed', e.message); } finally { setBusy(false); }
  }, [proposal.id, currentText, audit, stats, onSaveContent]);

  const approve = useCallback(async () => {
    if (stats.pending > 0 && !window.confirm(stats.pending + ' change' + (stats.pending === 1 ? '' : 's') + ' are still marked Proposed (not explicitly accepted). They will be included as shown. Approve and publish?')) return;
    setBusy(true);
    try {
      if (onApproveProp) {
        const r = await onApproveProp(currentText.split('\n'), audit, stats);
        onApproved && onApproved(r);
      } else {
        await api('/sync/updates/' + proposal.id + '/content', { method: 'PUT', body: { after: currentText.split('\n'), audit, stats } });
        const r = await api('/sync/updates/' + proposal.id + '/approve', { method: 'POST', body: {} });
        toast('success', 'Approved — document updated', 'Published as version v' + (r.version || '?') + '. Previous version kept in Doc sync → Versions.');
        onApproved && onApproved(r);
      }
    } catch (e) { toast('error', 'Approve failed', e.message); } finally { setBusy(false); }
  }, [proposal.id, currentText, audit, stats, onApproved, onApproveProp]);

  // Optional third outcome (automation review): send the run back without
  // publishing. The reviewer's in-progress edits ride along so nothing is lost.
  const requestChanges = useCallback(async () => {
    if (!onRequestChanges) return;
    const reason = window.prompt('Describe the changes needed. The run will be marked “Changes requested” and will not publish:', '');
    if (reason === null) return;
    setBusy(true);
    try { await onRequestChanges(reason, currentText.split('\n'), audit, stats); }
    catch (e) { toast('error', 'Request changes failed', e.message); } finally { setBusy(false); }
  }, [onRequestChanges, currentText, audit, stats]);

  /* ---------------- render ---------------- */
  const canRewrite = sel && sel.editable;
  return (
    <div className="rvx" ref={editorRef} onContextMenu={(e) => onContext(e, editorRef, blocks, setMenu)}>
      <div aria-live="polite" className="rvx-sr">{live}</div>

      <ReviewHeader proposal={proposal} stats={stats} mode={mode} setMode={setMode} panel={panel} setPanel={setPanel}
        onUndo={undo} onRedo={redo} canUndo={past.current.length > 0} canRedo={future.current.length > 0}
        onBulk={bulk} onClose={onClose} config={config} backLabel={backLabel} />

      <div className="rvx-body">
        <div className="rvx-doc-wrap">
          {mode === 'inline' ? (
            <div className="rvx-doc" role="group" aria-label="Corrected document — select any text to edit">
              {blocks.map((b, i) => b.type === 'context'
                ? <ContextBlock key={b.id} block={b} />
                : <ChangeBlock key={b.id} block={b} idx={i} onStatus={setStatus} onRestore={restoreBlock}
                    onRewrite={(t) => setPop({ target: t, rect: t.rect })} onManual={openManual}
                    onComment={addComment} onAcceptSection={() => acceptSection(i)} />)}
            </div>
          ) : (
            <div className="rvx-split">
              <DiffView before={beforeText} after={currentText} labels="left = original · right = your reviewed version" />
              <p className="helper mt3">Editing happens in Inline mode. Switch back to Inline to select and rewrite; this view stays in sync with every change.</p>
            </div>
          )}
        </div>

        {panel && <SidePanel which={panel} blocks={blocks} audit={audit} onJump={jumpToBlock} onStatus={setStatus} config={config} />}
      </div>

      {/* floating contextual toolbar */}
      {sel && !preview && !manual && (
        <FloatingToolbar sel={sel} config={config}
          onAction={(id) => handleToolbarAction(id, sel, { openPreview, setPop, openManual, setStatus, addComment, applyToBlocks })}
        />
      )}

      {/* rewrite popover */}
      {pop && (
        <RewritePopover pop={pop} config={config}
          onQuick={(id) => openPreview(pop.target, { actionId: id })}
          onGuide={(g) => openPreview(pop.target, { guide: g })}
          onInstruction={(text) => openPreview(pop.target, { instruction: text })}
          onClose={() => setPop(null)} />
      )}

      {/* right-click menu */}
      {menu && (
        <ContextMenu menu={menu} config={config}
          onPick={(id, extra) => handleMenuPick(id, menu.target, extra, { openPreview, openManual, setStatus, restoreBlock, addComment, setPanel })}
          onClose={() => setMenu(null)} />
      )}

      {/* inline preview */}
      {preview && (
        <PreviewCard preview={preview} onAccept={acceptPreview} onReject={() => setPreview(null)}
          onTryAgain={() => openPreview(preview.target, preview.opts)} onCompare={compareStyles}
          onPick={(idx) => setPreview((p) => ({ ...p, idx }))}
          onEdit={(text) => setPreview((p) => ({ ...p, results: p.results.map((r, k) => (k === p.idx ? { ...r, text } : r)) }))} />
      )}

      {/* manual edit */}
      {manual && (
        <ManualEditor manual={manual} onChange={(text) => setManual((m) => ({ ...m, text }))} onCommit={commitManual} onCancel={() => setManual(null)} />
      )}

      <ReviewFooter saved={saved} busy={busy} stats={stats} onSave={saveReview} onApprove={approve} onClose={onClose}
        onRequestChanges={onRequestChanges ? requestChanges : null} approveLabel={approveLabel} saveLabel={saveLabel} note={footerNote} />
    </div>
  );

  function jumpToBlock(id) {
    const el = editorRef.current && editorRef.current.querySelector('[data-uid="' + id + '"]');
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

/* ============================ helpers ============================ */
function elWithUid(node) {
  let n = node && node.nodeType === 3 ? node.parentNode : node;
  while (n && n !== document.body) { if (n.dataset && n.dataset.uid) return n; n = n.parentNode; }
  return null;
}
function isHeading(b) { const l = (b.type === 'context' ? b.lines : b.after) || []; return /^\s*#{1,6}\s/.test(l[0] || ''); }
function selText(blocks, target) {
  if (target.text != null) return target.text;
  if (target.kind === 'block') { const b = blocks.find((x) => x.id === target.blockId); return b ? linesToText(resolvedLines(b)) : ''; }
  return '';
}
function onContext(e, ref, blocks, setMenu) {
  const el = elWithUid(e.target);
  if (!el || !ref.current.contains(el)) return;
  e.preventDefault();
  const s = window.getSelection();
  const text = s && !s.isCollapsed ? s.toString() : '';
  let target;
  if (text && text.trim()) {
    const range = s.getRangeAt(0); const startEl = elWithUid(range.startContainer);
    if (startEl === elWithUid(range.endContainer)) {
      const start = offsetWithin(startEl, range.startContainer, range.startOffset);
      const end = offsetWithin(startEl, range.endContainer, range.endOffset);
      target = { kind: 'range', blockId: startEl.dataset.uid, start: Math.min(start, end), end: Math.max(start, end), text, editable: startEl.dataset.editable === '1' };
    } else target = { kind: 'block', blockId: el.dataset.uid, editable: el.dataset.editable === '1' };
  } else target = { kind: 'block', blockId: el.dataset.uid, editable: el.dataset.editable === '1' };
  setMenu({ x: e.clientX, y: e.clientY, target });
}

function handleToolbarAction(id, sel, h) {
  const target = sel;
  if (id === 'rewrite') return h.setPop({ target, rect: sel.rect });
  if (id === 'manual') return h.openManual(target);
  if (id === 'accept') return sel.blockId && h.setStatus(sel.blockId, STATUS.ACCEPTED);
  if (id === 'reject') return sel.blockId && h.setStatus(sel.blockId, STATUS.REJECTED);
  if (id === 'comment') { const t = window.prompt('Add a review comment'); if (t && sel.blockId) h.addComment(sel.blockId, t); return; }
  if (id === 'styleGuide') return h.setPop({ target, rect: sel.rect, tab: 'guide' });
  // a quick transform action
  if (sel.kind === 'blocks') return h.applyToBlocks(sel.ids, { actionId: id }, { type: 'rewrite', action: id, source: SOURCE.AI });
  return h.openPreview(target, { actionId: id });
}

function handleMenuPick(id, target, extra, h) {
  switch (id) {
    case 'rewrite': return h.openPreview(target, { actionId: 'rewrite' });
    case 'styleGuide': return h.openPreview(target, { guide: extra || 'docify' });
    case 'instruction': { const t = window.prompt('Tell AI how to rewrite this'); if (t) h.openPreview(target, { instruction: t }); return; }
    case 'terminology': return h.openPreview(target, { instruction: 'Replace terminology with the approved product terms and keep everything else identical.' });
    case 'customerFriendly': return h.openPreview(target, { actionId: 'customerFriendly' });
    case 'technical': return h.openPreview(target, { actionId: 'technical' });
    case 'concise': return h.openPreview(target, { actionId: 'concise' });
    case 'explain': { const b = target.blockId; toast('info', 'Explanation', 'This span is being reviewed. Use Rewrite to propose a change or Comment to leave a note.'); return; }
    case 'restore': return target.blockId && h.restoreBlock(target.blockId);
    case 'history': return h.setPanel('audit');
    case 'comment': { const t = window.prompt('Add a review comment'); if (t && target.blockId) h.addComment(target.blockId, t); return; }
    default: return null;
  }
}

/* ============================ subcomponents ============================ */
const linesJoin = (ls) => (ls || []).join('\n');

function ReviewHeader({ proposal, stats, mode, setMode, panel, setPanel, onUndo, onRedo, canUndo, canRedo, onBulk, onClose, config, backLabel = 'Back to queue' }) {
  const sc = (proposal.reasoning && (typeof proposal.reasoning === 'string' ? JSON.parse(proposal.reasoning) : proposal.reasoning).scores) || {};
  return (
    <div className="rvx-head">
      <div className="row row--between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
          <button className="linkbtn" onClick={onClose}>← {backLabel}</button>
          <b className="mono" style={{ fontSize: 13 }}>{proposal.docName}</b>
          <span className="helper">{stats.total} changes · {stats.accepted} accepted · {stats.rejected} rejected · {stats.pending} proposed · {stats.edited} edited</span>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <div className="rvx-seg" role="tablist" aria-label="Diff mode">
            <button role="tab" aria-selected={mode === 'inline'} className={'rvx-seg-btn' + (mode === 'inline' ? ' is-on' : '')} onClick={() => setMode('inline')}>Inline</button>
            <button role="tab" aria-selected={mode === 'split'} className={'rvx-seg-btn' + (mode === 'split' ? ' is-on' : '')} onClick={() => setMode('split')} disabled={!config.enableSideBySide}>Side-by-side</button>
          </div>
          <button className="btn btn--ghost btn--sm btn--center" onClick={onUndo} disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo">↶ Undo</button>
          <button className="btn btn--ghost btn--sm btn--center" onClick={onRedo} disabled={!canRedo} title="Redo (⌘⇧Z)" aria-label="Redo">↷ Redo</button>
        </div>
      </div>
      <div className="row row--between mt3" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn--ghost btn--sm btn--center" onClick={() => onBulk('accept-all')}>Accept all proposed</button>
          <button className="btn btn--ghost btn--sm btn--center" onClick={() => onBulk('reject-ai')}>Reject all AI changes</button>
          <button className="btn btn--ghost btn--sm btn--center" onClick={() => onBulk('apply-guide-unresolved')}>Apply style guide to unresolved</button>
        </div>
        <div className="rvx-seg" role="tablist" aria-label="Side panel">
          {['changes', 'audit', 'comments'].map((p) => (
            <button key={p} role="tab" aria-selected={panel === p} className={'rvx-seg-btn' + (panel === p ? ' is-on' : '')} onClick={() => setPanel(panel === p ? null : p)}>{p[0].toUpperCase() + p.slice(1)}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContextBlock({ block }) {
  return <div className="rvx-para" data-uid={block.id} data-editable="1" style={{ whiteSpace: 'pre-wrap' }}>{linesJoin(block.lines)}</div>;
}

function ChangeBlock({ block, onStatus, onRestore, onRewrite, onManual, onComment, onAcceptSection }) {
  const [statusCls, statusLbl] = TAG_FOR_STATUS[block.status] || TAG_FOR_STATUS[STATUS.PENDING];
  const [srcCls, srcLbl] = TAG_FOR_SOURCE[block.source] || TAG_FOR_SOURCE[SOURCE.AI];
  const cur = linesJoin(resolvedLines(block));
  const showWas = block.status !== STATUS.REJECTED && block.kind !== 'add' && block.before.length;
  const showProposed = block.status === STATUS.REJECTED && block.after.length;
  const cls = 'rvx-change rvx-change--' + block.status + (block.kind === 'add' ? ' rvx-change--add' : '') + (block.kind === 'del' ? ' rvx-change--del' : '');
  return (
    <div className={cls}>
      <div className="rvx-change-bar" contentEditable={false}>
        <span className={'tag ' + statusCls}>{statusLbl}</span>
        <span className={'tag ' + srcCls}>{srcLbl}</span>
        {block.edited && <span className="tag tag--outline">Edited</span>}
        {block.guide && <span className="tag tag--outline">{(STYLE_GUIDES.find((g) => g.id === block.guide) || {}).name || block.guide}</span>}
        {block.comments && block.comments.length > 0 && <span className="tag tag--gray">💬 {block.comments.length}</span>}
        <span className="rvx-change-actions">
          <button className="rvx-mini" onClick={() => onStatus(block.id, STATUS.ACCEPTED)} title="Accept">Accept</button>
          <button className="rvx-mini" onClick={() => onStatus(block.id, STATUS.REJECTED)} title="Reject">Reject</button>
          <button className="rvx-mini" onClick={() => onRewrite({ kind: 'block', blockId: block.id, editable: true, text: cur, rect: null })} title="Rewrite this block">Rewrite</button>
          <button className="rvx-mini" onClick={() => onManual({ kind: 'block', blockId: block.id, text: cur })} title="Edit manually">Edit</button>
          <button className="rvx-mini" onClick={() => onRestore(block.id)} title="Restore original suggestion">Restore</button>
          <button className="rvx-mini" onClick={() => { const t = window.prompt('Comment on this change'); if (t) onComment(block.id, t); }} title="Comment">Comment</button>
          <button className="rvx-mini" onClick={onAcceptSection} title="Accept all changes in this section">Accept section</button>
        </span>
      </div>
      {/* Removed / "was" line — decorative marker via CSS ::before, not part of selectable text. */}
      {showWas ? <div className="rvx-was" data-mark="−" aria-label={'removed: ' + linesJoin(block.before)}>{linesJoin(block.before)}</div> : null}
      {block.kind === 'del' && block.status !== STATUS.REJECTED
        ? <div className="rvx-para rvx-removed" data-editable="0" aria-label="removed">(removed)</div>
        : <div className={'rvx-para ' + (block.status === STATUS.REJECTED ? 'rvx-kept' : 'rvx-added')} data-uid={block.id} data-editable="1"
            data-mark={block.status === STATUS.REJECTED ? '=' : '+'} aria-label={(block.status === STATUS.REJECTED ? 'original kept: ' : 'added: ') + cur} style={{ whiteSpace: 'pre-wrap' }}>{cur}</div>}
      {showProposed ? <div className="rvx-was rvx-was--proposed" data-mark="✕" aria-label={'rejected proposal: ' + linesJoin(block.after)}>{linesJoin(block.after)}</div> : null}
      {block.comments && block.comments.map((c) => <div key={c.id} className="rvx-comment">💬 {c.text} <span className="helper">— {c.author}</span></div>)}
    </div>
  );
}

function FloatingToolbar({ sel, config, onAction }) {
  const rect = sel.rect || { top: 120, left: 200, height: 0 };
  const top = clamp(rect.top - 46, 8, window.innerHeight - 60);
  const left = clamp(rect.left, 8, window.innerWidth - 380);
  const [more, setMore] = useState(false);
  const labelFor = (id) => ({ rewrite: 'Rewrite', manual: 'Edit', accept: 'Accept', reject: 'Reject', comment: 'Comment', styleGuide: 'Style guide' }[id] || (ACTIONS[id] || {}).label || id);
  return (
    <div className="rvx-toolbar" style={{ top, left }} role="toolbar" aria-label="Editing actions" onMouseDown={(e) => e.preventDefault()}>
      {config.toolbarActions.map((id) => <button key={id} className="rvx-tb-btn" onClick={() => onAction(id)}>{labelFor(id)}</button>)}
      <div className="rvx-tb-more">
        <button className="rvx-tb-btn" aria-haspopup="true" aria-expanded={more} onClick={() => setMore((m) => !m)}>More ▾</button>
        {more && <div className="rvx-menu" role="menu">{config.moreActions.map((id) => <button key={id} role="menuitem" className="rvx-menu-item" onClick={() => { setMore(false); onAction(id); }}>{(ACTIONS[id] || {}).label || id}</button>)}</div>}
      </div>
    </div>
  );
}

function RewritePopover({ pop, config, onQuick, onGuide, onInstruction, onClose }) {
  const rect = pop.rect || { top: 140, left: 220 };
  const top = clamp((rect.top || 140) + 8, 8, window.innerHeight - 380);
  const left = clamp((rect.left || 220), 8, window.innerWidth - 340);
  const [instr, setInstr] = useState('');
  const [tab, setTab] = useState(pop.tab || 'quick');
  return (
    <>
      <div className="rvx-scrim" onClick={onClose} />
      <div className="rvx-pop" style={{ top, left }} role="dialog" aria-label="Rewrite options">
        <div className="rvx-pop-tabs">
          {['quick', 'guide', 'custom'].map((t) => <button key={t} className={'rvx-pop-tab' + (tab === t ? ' is-on' : '')} onClick={() => setTab(t)}>{t === 'quick' ? 'Quick' : t === 'guide' ? 'Style guide' : 'Custom'}</button>)}
        </div>
        {tab === 'quick' && <div className="rvx-pop-grid">
          {config.rewriteQuickActions.map((id) => <button key={id} className="rvx-pop-item" onClick={() => onQuick(id)}>{(ACTIONS[id] || {}).label || id}</button>)}
        </div>}
        {tab === 'guide' && <div className="rvx-pop-list">
          <p className="helper mb3">Rewrite in a named style. Names describe an influence, not an endorsement.</p>
          {config.styleGuides.map((gid) => { const g = STYLE_GUIDES.find((x) => x.id === gid); return g ? <button key={gid} className="rvx-pop-row" onClick={() => onGuide(gid)}><b>{g.name}</b><span className="helper">{g.note}</span></button> : null; })}
        </div>}
        {tab === 'custom' && <div className="rvx-pop-custom">
          <label className="helper" htmlFor="rvx-instr">Tell AI how to rewrite this</label>
          <textarea id="rvx-instr" className="rvx-instr" rows={3} value={instr} onChange={(e) => setInstr(e.target.value)} placeholder="e.g. Make this suitable for beginners. Convert to a numbered procedure. Use approved product terminology." />
          <div className="rvx-chip-row">{['Make this suitable for beginners', 'Rewrite as a procedure', 'Remove internal details', 'Make suitable for release notes'].map((s) => <button key={s} className="chip" onClick={() => setInstr(s)}>{s}</button>)}</div>
          <button className="btn btn--primary btn--sm btn--center mt3" disabled={!instr.trim()} onClick={() => onInstruction(instr.trim())}>Rewrite with instruction</button>
        </div>}
      </div>
    </>
  );
}

function ContextMenu({ menu, config, onPick, onClose }) {
  const top = clamp(menu.y, 8, window.innerHeight - 340);
  const left = clamp(menu.x, 8, window.innerWidth - 260);
  const [guideOpen, setGuideOpen] = useState(false);
  const LABEL = { rewrite: 'Rewrite selected text', styleGuide: 'Rewrite with a style guide', instruction: 'Enter a custom instruction', terminology: 'Replace terminology', customerFriendly: 'Make customer-friendly', technical: 'Make more technical', concise: 'Make more concise', explain: 'Explain this content', restore: 'Restore previous version', history: 'View change history', comment: 'Add review comment' };
  return (
    <>
      <div className="rvx-scrim" onClick={onClose} />
      <div className="rvx-ctx" style={{ top, left }} role="menu" aria-label="Selection actions">
        {config.contextMenu.map((id) => id === 'styleGuide' ? (
          <div key={id} className="rvx-ctx-sub">
            <button role="menuitem" className="rvx-ctx-item" onClick={() => setGuideOpen((o) => !o)}>{LABEL[id]} ▸</button>
            {guideOpen && <div className="rvx-ctx-guides">{config.styleGuides.map((gid) => { const g = STYLE_GUIDES.find((x) => x.id === gid); return g ? <button key={gid} className="rvx-ctx-item" onClick={() => onPick('styleGuide', gid)}>{g.name}</button> : null; })}</div>}
          </div>
        ) : <button key={id} role="menuitem" className="rvx-ctx-item" onClick={() => onPick(id)}>{LABEL[id] || id}</button>)}
      </div>
    </>
  );
}

function PreviewCard({ preview, onAccept, onReject, onTryAgain, onCompare, onPick, onEdit }) {
  const cur = preview.results[preview.idx];
  const [editing, setEditing] = useState(false);
  return (
    <div className="rvx-preview" role="dialog" aria-label="Proposed rewrite preview">
      <div className="row row--between mb3" style={{ gap: 8 }}>
        <b className="body01">Proposed rewrite {preview.results.length > 1 ? '(' + (preview.idx + 1) + '/' + preview.results.length + ')' : ''}</b>
        <div className="row" style={{ gap: 6 }}>
          {cur && cur.simulated && <span className="tag tag--amber" title="Generated locally — set ANTHROPIC_API_KEY for model rewrites">AI · simulated</span>}
          {cur && !cur.simulated && cur.label && <span className="tag tag--purple">{cur.label}</span>}
        </div>
      </div>
      {preview.loading ? <p className="helper">Generating…</p> : (
        <>
          <div className="rvx-prev-grid">
            <div><div className="helper mb2">Original</div><div className="rvx-prev-old">{preview.original}</div></div>
            <div><div className="helper mb2">Proposed{cur && cur.label ? ' · ' + cur.label : ''}</div>
              {editing
                ? <textarea className="rvx-instr" rows={Math.min(10, (cur.text.match(/\n/g) || []).length + 2)} value={cur.text} onChange={(e) => onEdit(e.target.value)} />
                : <div className="rvx-prev-new">{cur ? cur.text : ''}</div>}
            </div>
          </div>
          {preview.results.length > 1 && <div className="rvx-chip-row mt3">{preview.results.map((r, k) => <button key={k} className={'chip' + (k === preview.idx ? ' chip--on' : '')} onClick={() => onPick(k)}>{r.label}{r.simulated ? ' ·sim' : ''}</button>)}</div>}
          <div className="row mt3" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn--primary btn--sm btn--center" onClick={onAccept}>Accept</button>
            <button className="btn btn--ghost btn--sm btn--center" onClick={onReject}>Reject</button>
            <button className="btn btn--ghost btn--sm btn--center" onClick={onTryAgain}>Try again</button>
            <button className="btn btn--ghost btn--sm btn--center" onClick={() => setEditing((e) => !e)}>{editing ? 'Done editing' : 'Edit result'}</button>
            <button className="btn btn--ghost btn--sm btn--center" onClick={onCompare}>Compare styles</button>
          </div>
        </>
      )}
    </div>
  );
}

function ManualEditor({ manual, onChange, onCommit, onCancel }) {
  return (
    <div className="rvx-preview" role="dialog" aria-label="Manual edit">
      <b className="body01">Edit manually</b>
      <p className="helper mb3">Your edit is tracked in the same diff and audit trail as AI changes.</p>
      <textarea className="rvx-instr" autoFocus rows={Math.min(12, (manual.text.match(/\n/g) || []).length + 3)} value={manual.text} onChange={(e) => onChange(e.target.value)} />
      <div className="row mt3" style={{ gap: 8 }}>
        <button className="btn btn--primary btn--sm btn--center" onClick={onCommit}>Apply edit</button>
        <button className="btn btn--ghost btn--sm btn--center" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function SidePanel({ which, blocks, audit, onJump, onStatus, config }) {
  const changes = blocks.filter((b) => b.type === 'change');
  return (
    <aside className="rvx-side" aria-label={which + ' panel'}>
      {which === 'changes' && (
        <>
          <div className="rvx-side-head">Changes ({changes.length})</div>
          {changes.length === 0 && <p className="helper">No changes — the document already matches the standard.</p>}
          {changes.map((b) => { const [sc, sl] = TAG_FOR_STATUS[b.status]; return (
            <button key={b.id} className="rvx-side-row" onClick={() => onJump(b.id)}>
              <span className={'tag ' + sc}>{sl}</span>
              <span className="rvx-side-text">{(linesJoin(b.after) || linesJoin(b.before)).slice(0, 80) || '(empty)'}</span>
            </button>); })}
        </>
      )}
      {which === 'audit' && config.enableAudit && (
        <>
          <div className="rvx-side-head">Audit trail ({audit.length})</div>
          {audit.length === 0 && <p className="helper">Every edit — who, what, which style guide or instruction, and when — will appear here.</p>}
          {audit.map((a) => (
            <div key={a.id} className="rvx-audit">
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <span className={'tag ' + (TAG_FOR_SOURCE[a.source] || TAG_FOR_SOURCE[SOURCE.MANUAL])[0]}>{(TAG_FOR_SOURCE[a.source] || TAG_FOR_SOURCE[SOURCE.MANUAL])[1]}</span>
                <span className="helper">{a.action || a.type}</span>
                <span className="helper">· {new Date(a.at).toLocaleTimeString()}</span>
              </div>
              {a.guide && <div className="helper">guide: {a.guide}</div>}
              {a.instruction && <div className="helper">“{a.instruction}”</div>}
              {a.after != null && <div className="rvx-audit-diff">{String(a.after).slice(0, 120)}</div>}
            </div>
          ))}
        </>
      )}
      {which === 'comments' && (
        <>
          <div className="rvx-side-head">Comments</div>
          {changes.filter((b) => b.comments && b.comments.length).length === 0 && <p className="helper">No comments yet. Select text → Add comment, or use a change's Comment button.</p>}
          {changes.filter((b) => b.comments && b.comments.length).map((b) => (
            <div key={b.id} className="rvx-audit">
              <button className="rvx-side-text" onClick={() => onJump(b.id)}>{(linesJoin(b.after) || '(change)').slice(0, 60)}</button>
              {b.comments.map((c) => <div key={c.id} className="helper">💬 {c.text}</div>)}
            </div>
          ))}
        </>
      )}
    </aside>
  );
}

function ReviewFooter({ saved, busy, stats, onSave, onApprove, onClose, onRequestChanges, approveLabel = 'Approve & publish', saveLabel = 'Save review', note }) {
  return (
    <div className="rvx-foot">
      <p className="helper" style={{ margin: 0, maxWidth: 620 }}>
        {note || 'Approving replaces the live document and cuts a new version (the previous one is kept in Doc sync → Versions).'}
        {stats.pending > 0 ? ' ' + stats.pending + ' change' + (stats.pending === 1 ? '' : 's') + ' still proposed.' : ' All changes reviewed.'}
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn--ghost btn--field" onClick={onClose}>Close</button>
        {onRequestChanges && <button className="btn btn--tertiary btn--field" onClick={onRequestChanges} disabled={busy}>Request changes</button>}
        <button className="btn btn--tertiary btn--field" onClick={onSave} disabled={busy}>{saved ? 'Saved ✓' : saveLabel}</button>
        <button className="btn btn--primary btn--field" onClick={onApprove} disabled={busy}>{approveLabel}</button>
      </div>
    </div>
  );
}
