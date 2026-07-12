/* =====================================================================
   Review engine — framework-agnostic core for the hybrid inline editor.

   Responsibilities (all pure, unit-testable with Node):
     • lineDiff            LCS line diff (shared shape with History.jsx)
     • buildBlocks         before/after  ->  ordered context/change blocks
     • assembleDocument    blocks + per-block decisions  ->  final text
     • TRANSFORMS          deterministic local rewrites (the "AI quick
                           actions" that run instantly in the browser)
     • STYLE_GUIDES        named guides -> transform pipelines
     • applyTransform      run one action (with inline code / URL / md
                           syntax protection so prose edits never corrupt
                           code blocks, links, or formatting)
     • audit / ids         helpers for the unified audit trail

   Nothing here touches React or the DOM, so the same code powers the
   editor, the server fallback (mirrored in docsync.js), and the tests.
   ===================================================================== */

/* ---------------- ids ---------------- */
let _seq = 0;
export const uid = (p = 'r') => p + '_' + Date.now().toString(36) + '_' + (_seq++).toString(36);

/* ---------------- line diff (LCS) ---------------- */
export function lineDiff(aText, bText) {
  const a = String(aText == null ? '' : aText).split('\n');
  const b = String(bText == null ? '' : bText).split('\n');
  if (a.length * b.length > 4_000_000) return [{ type: 'del', lines: a }, { type: 'add', lines: b }];
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let jj = m - 1; jj >= 0; jj--)
      dp[i][jj] = a[i] === b[jj] ? dp[i + 1][jj + 1] + 1 : Math.max(dp[i + 1][jj], dp[i][jj + 1]);
  const ops = [];
  const push = (type, line) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.lines.push(line);
    else ops.push({ type, lines: [line] });
  };
  let i = 0, jj = 0;
  while (i < n && jj < m) {
    if (a[i] === b[jj]) { push('same', a[i]); i++; jj++; }
    else if (dp[i + 1][jj] >= dp[i][jj + 1]) { push('del', a[i]); i++; }
    else { push('add', b[jj]); jj++; }
  }
  while (i < n) push('del', a[i++]);
  while (jj < m) push('add', b[jj++]);
  return ops;
}

/* ---------------- block model ----------------
   A block is the unit of review. Two kinds:
     context : unchanged text (still selectable + manually editable)
     change  : a hunk the correction proposed
                 mod  (before -> after)   add (insertion)   del (removal)

   Each change block carries its own status/source/history/comments so the
   user can accept, reject, edit or rewrite it independently. */
export const STATUS = { PENDING: 'pending', ACCEPTED: 'accepted', REJECTED: 'rejected' };
export const SOURCE = { AI: 'ai', MANUAL: 'manual', STYLEGUIDE: 'styleguide', RESTORED: 'restored', ACCEPTED: 'accepted-suggestion' };

export function buildBlocks(before, after) {
  const ops = lineDiff(before, after);
  const blocks = [];
  for (let k = 0; k < ops.length; k++) {
    const o = ops[k];
    if (o.type === 'same') { blocks.push({ id: uid('ctx'), type: 'context', lines: o.lines.slice() }); continue; }
    if (o.type === 'del') {
      const next = ops[k + 1];
      if (next && next.type === 'add') { // del+add -> modification
        blocks.push(changeBlock('mod', o.lines.slice(), next.lines.slice()));
        k++;
      } else blocks.push(changeBlock('del', o.lines.slice(), []));
    } else { // lone add
      blocks.push(changeBlock('add', [], o.lines.slice()));
    }
  }
  return blocks;
}

function changeBlock(kind, before, after) {
  return {
    id: uid('chg'),
    type: 'change',
    kind,                         // mod | add | del
    before,                       // original lines
    after,                        // proposed / current lines (the editable surface)
    baseAfter: after.slice(),     // the model's first proposal, for "restore original suggestion"
    status: STATUS.PENDING,       // pending until the reviewer decides
    source: SOURCE.AI,            // who produced the current `after`
    edited: false,
    guide: null,
    instruction: null,
    history: [],                  // [{ after:[], source, at }]
    comments: []                  // [{ id, text, author, at, resolved }]
  };
}

/* The text that a block contributes to the final document, given its
   decision. Rejected -> keep original. Everything else -> current after.
   (A pending block still previews its proposal; the final Approve is the
   single explicit publish step, so nothing is applied silently.) */
export function resolvedLines(b) {
  if (b.type === 'context') return b.lines;
  if (b.status === STATUS.REJECTED) return b.before;
  return b.after;
}

export function assembleDocument(blocks) {
  const out = [];
  for (const b of blocks) out.push(...resolvedLines(b));
  return out.join('\n');
}

/* Counts for the header / progress. */
export function reviewStats(blocks) {
  const ch = blocks.filter((b) => b.type === 'change');
  return {
    total: ch.length,
    pending: ch.filter((b) => b.status === STATUS.PENDING).length,
    accepted: ch.filter((b) => b.status === STATUS.ACCEPTED).length,
    rejected: ch.filter((b) => b.status === STATUS.REJECTED).length,
    edited: ch.filter((b) => b.edited).length
  };
}

/* =====================================================================
   Text transforms — deterministic, instant, offline.
   Every transform is (text) -> string. They protect code + links so a
   prose rewrite can never mangle a fenced block, an inline `token`, a
   URL, or markdown syntax.
   ===================================================================== */

const WORDY = [
  [/\bin order to\b/gi, 'to'], [/\bin the event that\b/gi, 'if'],
  [/\bdue to the fact that\b/gi, 'because'], [/\bfor the purpose of\b/gi, 'to'],
  [/\bin the process of\b/gi, ''], [/\bat this point in time\b/gi, 'now'],
  [/\bwith regard to\b/gi, 'about'], [/\bwith respect to\b/gi, 'about'],
  [/\bin terms of\b/gi, 'for'], [/\bthe majority of\b/gi, 'most'],
  [/\ba large number of\b/gi, 'many'], [/\ba number of\b/gi, 'several'],
  [/\bis able to\b/gi, 'can'], [/\bare able to\b/gi, 'can'],
  [/\bhas the ability to\b/gi, 'can'], [/\bprior to\b/gi, 'before'],
  [/\bsubsequent to\b/gi, 'after'], [/\bin addition,?\b/gi, 'also'],
  [/\bas a means to\b/gi, 'to'], [/\bin spite of the fact that\b/gi, 'although']
];
const FILLER = [/\bvery\s+/gi, /\breally\s+/gi, /\bactually\s+/gi, /\bbasically\s+/gi, /\bsimply\s+/gi, /\bquite\s+/gi, /\brather\s+/gi];
const SIMPLE = {
  utilize: 'use', utilizes: 'use', utilized: 'used', leverage: 'use', leverages: 'uses',
  facilitate: 'help', endeavor: 'try', commence: 'start', terminate: 'end', demonstrate: 'show',
  sufficient: 'enough', additional: 'more', approximately: 'about', subsequently: 'then',
  methodology: 'method', functionality: 'features', aforementioned: 'this', numerous: 'many',
  ascertain: 'find out', initiate: 'start', regarding: 'about'
};
const PROFESSIONAL = {
  "don't": 'do not', "can't": 'cannot', "won't": 'will not', "it's": 'it is', "you're": 'you are',
  "we're": 'we are', "they're": 'they are', "isn't": 'is not', "aren't": 'are not', "doesn't": 'does not',
  "didn't": 'did not', "wasn't": 'was not', "weren't": 'were not', "shouldn't": 'should not', "wouldn't": 'would not'
};
const TECHNICAL = { get: 'retrieve', gets: 'retrieves', make: 'create', makes: 'creates', send: 'submit', sends: 'submits', 'set up': 'configure', 'turn on': 'enable', 'turn off': 'disable', check: 'validate', checks: 'validates' };
const MISSPELL = { teh: 'the', recieve: 'receive', seperate: 'separate', occured: 'occurred', definately: 'definitely', wich: 'which', adress: 'address', enviroment: 'environment', compatability: 'compatibility', existant: 'existent', occassionally: 'occasionally', accomodate: 'accommodate', neccessary: 'necessary' };

export const looksLikeCode = (t) => /^\s*```/.test(t) || /^\s{4,}\S/.test(t) || /^\s*(GET|POST|PUT|DELETE|PATCH)\s+\//.test(t) || /^\s*(curl|npm|yarn|pip|git|cd|export)\b/.test(t);

// Protect inline code, links, and bare URLs while a transform runs on prose.
function protect(text, fn) {
  const stash = [];
  let s = String(text)
    .replace(/`[^`]*`/g, (m) => { stash.push(m); return ' ' + (stash.length - 1) + ' '; })
    .replace(/\[[^\]]*\]\([^)]*\)/g, (m) => { stash.push(m); return ' ' + (stash.length - 1) + ' '; })
    .replace(/\bhttps?:\/\/\S+/g, (m) => { stash.push(m); return ' ' + (stash.length - 1) + ' '; });
  s = fn(s);
  return s.replace(/ (\d+) /g, (_, i) => stash[+i]);
}

// Apply a word/phrase map to prose only (keeps markdown heading/list prefix intact).
function withPrefix(line, fn) {
  const m = String(line).match(/^(\s*(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+)?)([\s\S]*)$/);
  const prefix = m ? m[1] : '';
  const body = m ? m[2] : String(line);
  return prefix + fn(body);
}

function mapWords(text, map, { caseInsensitive = true } = {}) {
  let s = text;
  for (const [from, to] of Object.entries(map)) {
    const re = new RegExp('\\b' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', caseInsensitive ? 'gi' : 'g');
    s = s.replace(re, (m) => (m[0] === m[0].toUpperCase() && to ? to[0].toUpperCase() + to.slice(1) : to));
  }
  return s;
}

const collapseSpaces = (s) => s.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').replace(/([.,;:!?])(?=[^\s.,;:!?)"'\]])/g, '$1 ').trim();
const capSentences = (s) => s.replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase());

/* Each transform is line-aware and code-safe: fenced ``` blocks are skipped
   as a unit (state tracked across lines), and so are indented / command lines. */
function perProseLine(text, fn) {
  let inFence = false;
  return String(text).split('\n').map((ln) => {
    if (/^\s*```/.test(ln)) { inFence = !inFence; return ln; }
    if (inFence || !ln.trim() || looksLikeCode(ln)) return ln;
    return withPrefix(ln, (body) => protect(body, fn));
  }).join('\n');
}

// Case-preserving wordy-phrase reduction: "In order to" -> "To", "in order to" -> "to".
function reduceWordy(s) {
  let r = s;
  for (const [re, to] of WORDY) r = r.replace(re, (m) => (to && /^[A-Z]/.test(m) ? to.charAt(0).toUpperCase() + to.slice(1) : to));
  for (const re of FILLER) r = r.replace(re, '');
  return r;
}

export const TRANSFORMS = {
  concise: (t) => perProseLine(t, (s) => collapseSpaces(reduceWordy(s))),
  shorten: (t) => TRANSFORMS.concise(t),
  simplify: (t) => perProseLine(t, (s) => collapseSpaces(mapWords(s, SIMPLE))),
  professional: (t) => perProseLine(t, (s) => collapseSpaces(mapWords(s, PROFESSIONAL)).replace(/!+/g, '.')),
  technical: (t) => perProseLine(t, (s) => collapseSpaces(mapWords(s, TECHNICAL))),
  customerFriendly: (t) => perProseLine(t, (s) => collapseSpaces(mapWords(s, { 'the user': 'you', users: 'you', 'the customer': 'you', 'one can': 'you can', 'one should': 'you should' }))),
  grammar: (t) => perProseLine(t, (s) => capSentences(collapseSpaces(mapWords(s, MISSPELL)))),
  grammarSpelling: (t) => TRANSFORMS.grammar(t),
  activeVoice: (t) => perProseLine(t, (s) => s
    .replace(/\b([A-Za-z][\w-]*) (?:is|are|was|were) (\w+ed) by (the )?([A-Za-z][\w -]*?)([.,;:]|$)/g,
      (_m, obj, verb, _the, agent, end) => `${agent.trim()} ${verb.replace(/ed$/, 's')} ${obj}${end}`)),
  removeRepetition: (t) => perProseLine(t, (s) => s.replace(/\b(\w+)(\s+\1\b)+/gi, '$1')),
  expand: (t) => perProseLine(t, (s) => s.replace(/([.!?])?\s*$/, (m, p) => (p || '.') + '')) // expansion is model-only; local pass is a no-op clarity tidy
};

/* Human labels + which actions need the model (server) vs run locally. */
export const ACTIONS = {
  improveClarity: { label: 'Improve clarity', local: 'grammar', ai: true },
  concise: { label: 'Make concise', local: 'concise' },
  shorten: { label: 'Shorten', local: 'shorten' },
  expand: { label: 'Expand explanation', local: 'expand', ai: true },
  simplify: { label: 'Simplify language', local: 'simplify' },
  grammar: { label: 'Fix grammar & spelling', local: 'grammar' },
  activeVoice: { label: 'Convert to active voice', local: 'activeVoice' },
  removeRepetition: { label: 'Remove repetition', local: 'removeRepetition' },
  professional: { label: 'Make more professional', local: 'professional' },
  customerFriendly: { label: 'Make customer-focused', local: 'customerFriendly' },
  technical: { label: 'Make more technical', local: 'technical' },
  tone: { label: 'Change tone', ai: true },
  rewrite: { label: 'Rewrite', ai: true }
};

/* =====================================================================
   Style guides — named pipelines. Descriptions mirror the app's guides.
   Naming a guide "Microsoft-style" describes an influence, not an
   endorsement (surfaced in the UI as a disclaimer).
   ===================================================================== */
export const STYLE_GUIDES = [
  { id: 'docify', name: 'Docify Professional', scope: 'active', pipeline: ['grammar', 'concise'], note: 'Clear, professional, globally readable.' },
  { id: 'enterprise', name: 'Enterprise classic', scope: 'org', pipeline: ['professional', 'grammar'], note: 'Formal register, translation-ready.' },
  { id: 'microsoft', name: 'Microsoft-style', scope: 'preset', pipeline: ['customerFriendly', 'grammar', 'concise'], note: 'Warm, crisp, second person.' },
  { id: 'google', name: 'Google dev-docs style', scope: 'preset', pipeline: ['activeVoice', 'customerFriendly', 'concise'], note: 'Second person, present tense, active voice.' },
  { id: 'ibm', name: 'IBM documentation style', scope: 'preset', pipeline: ['professional', 'grammar', 'concise'], note: 'Precise, task-oriented, consistent terminology.' },
  { id: 'minimal', name: 'Minimal consumer', scope: 'preset', pipeline: ['simplify', 'concise', 'customerFriendly'], note: 'Short sentences, zero jargon.' },
  { id: 'concise', name: 'Concise', scope: 'preset', pipeline: ['concise', 'removeRepetition'], note: 'Shortest faithful version.' }
];

export function runPipeline(pipeline, text) {
  return (pipeline || []).reduce((acc, id) => (TRANSFORMS[id] ? TRANSFORMS[id](acc) : acc), text);
}

/* Apply one editor action locally. Returns { text, simulated }.
   `simulated` = true when the action really wants the model but we ran a
   local approximation (no key / offline / server declined). */
export function applyTransform(actionId, text, opts = {}) {
  if (actionId === 'styleGuide') {
    const g = STYLE_GUIDES.find((x) => x.id === opts.guide) || STYLE_GUIDES[0];
    return { text: runPipeline(g.pipeline, text), simulated: false, guide: g.id };
  }
  const a = ACTIONS[actionId];
  if (a && a.local && TRANSFORMS[a.local]) {
    const out = TRANSFORMS[a.local](text);
    return { text: out, simulated: !!a.ai }; // ai:true means the "real" version would come from the model
  }
  // Actions with no local implementation (rewrite, tone, custom instruction)
  // get a best-effort local cleanup and are flagged simulated.
  return { text: TRANSFORMS.grammar(TRANSFORMS.concise(text)), simulated: true };
}

/* Custom-instruction heuristics: map a few common intents onto pipelines so
   "make this concise for release notes" does something sensible offline. */
export function instructionToLocal(instruction, text) {
  const s = String(instruction || '').toLowerCase();
  const pipe = [];
  if (/beginner|simpl|plain|non-technical|easy/.test(s)) pipe.push('simplify');
  if (/concise|short|trim|tighten/.test(s)) pipe.push('concise');
  if (/active voice/.test(s)) pipe.push('activeVoice');
  if (/professional|formal/.test(s)) pipe.push('professional');
  if (/customer|user-facing|friendly/.test(s)) pipe.push('customerFriendly');
  if (/technical|precise/.test(s)) pipe.push('technical');
  if (/grammar|spelling|typo/.test(s)) pipe.push('grammar');
  if (!pipe.length) pipe.push('grammar', 'concise');
  return { text: runPipeline(pipe, text), simulated: true, pipeline: pipe };
}

/* ---------------- audit trail ---------------- */
export function auditEntry({ blockId, type, action, before, after, source, guide, instruction, author }) {
  return {
    id: uid('aud'), blockId, type, action: action || null,
    before: before == null ? null : String(before),
    after: after == null ? null : String(after),
    source: source || SOURCE.MANUAL, guide: guide || null,
    instruction: instruction || null, author: author || 'you',
    at: new Date().toISOString()
  };
}

export const TAG_FOR_SOURCE = {
  [SOURCE.AI]: ['tag--purple', 'AI'],
  [SOURCE.MANUAL]: ['tag--blue', 'Manual'],
  [SOURCE.STYLEGUIDE]: ['tag--teal', 'Style guide'],
  [SOURCE.RESTORED]: ['tag--gray', 'Restored'],
  [SOURCE.ACCEPTED]: ['tag--green', 'Accepted']
};
export const TAG_FOR_STATUS = {
  [STATUS.PENDING]: ['tag--amber', 'Proposed'],
  [STATUS.ACCEPTED]: ['tag--green', 'Accepted'],
  [STATUS.REJECTED]: ['tag--red', 'Rejected']
};

/* Default editor configuration — everything is toggleable end to end. */
export const DEFAULT_CONFIG = {
  toolbarActions: ['rewrite', 'improveClarity', 'concise', 'grammar', 'simplify', 'tone', 'styleGuide', 'manual', 'accept', 'reject', 'comment'],
  moreActions: ['expand', 'activeVoice', 'removeRepetition', 'professional', 'customerFriendly', 'technical'],
  contextMenu: ['rewrite', 'styleGuide', 'instruction', 'terminology', 'customerFriendly', 'technical', 'concise', 'explain', 'restore', 'history', 'comment'],
  rewriteQuickActions: ['improveClarity', 'shorten', 'expand', 'simplify', 'professional', 'customerFriendly', 'technical', 'grammar', 'removeRepetition', 'activeVoice'],
  alternatives: ['concise', 'customerFriendly', 'technical'],   // max 2–3 shown
  styleGuides: STYLE_GUIDES.map((g) => g.id),
  enableSideBySide: true,
  enableAudit: true,
  enableComments: true,
  confirmBulkOverLines: 40,           // warn before bulk edits above this size
  warnRewriteOverChars: 6000,         // warn before rewriting very large selections
  defaultDecision: STATUS.PENDING     // initial state of model-proposed blocks
};
