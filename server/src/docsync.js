/* ================= Doc sync: AI-maintained existing documentation =================
   Implements the "Intelligent Documentation Synchronization & Auto-Insertion" PRD:

   1. Upload an existing document  → parsed into a structured outline + semantic
      profile (terminology, style, glossary) with a visible parsing/indexing pipeline.
   2. Commits arrive (webhook-shaped mock feed, or user-simulated) → only the
      changed portion is documented.
   3. Semantic section matching     → every section of the REAL document is scored
      against the change signal; the best anchor wins, with ranked alternates.
   4. A side-by-side diff + AI reasoning (why this section, confidence, commit,
      files) is queued for human review.
   5. Approve applies the splice to the document body, preserving heading
      hierarchy, and cuts an immutable version. Reject discards. Edit-then-approve
      applies the reviewer's text.
   6. Every version can be compared and restored.

   Mounted behind requireAuth in api.js: all routes are per-user. */
import { Router } from 'express';
import { prisma } from './db.js';
import { evaluateCommit, loadRepoConfig, DEFAULT_CONFIG, SAMPLE_YAML, SAMPLE_INSTRUCTIONS } from './adapters/relevance.js';
import { fetchRepoFile } from './adapters/repofiles.js';
import { matchSurroundingStyle } from './adapters/styleguide.js';
import { freshToken } from './auth.js';

export const syncRouter = Router();

const j = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- Document parsing (same grammar the placement engine uses) --- */
export function parseOutline(content) {
  const text = String(content || '');
  const lines = text.split(/\r?\n/);
  const sections = [];
  lines.forEach((ln, i) => {
    let m = ln.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);               // markdown ATX
    if (m) { sections.push({ level: m[1].length, title: m[2].trim(), line: i + 1 }); return; }
    m = ln.match(/^\s*(\d+(?:\.\d+)*)\.?\s+([A-Z][^.].{2,80})$/); // numbered "2.4 Token rotation"
    if (m) { sections.push({ level: (m[1].match(/\./g) || []).length + 1, num: m[1], title: m[2].trim(), line: i + 1 }); return; }
    if (/^={3,}\s*$/.test(ln) && lines[i - 1] && lines[i - 1].trim() && !/^[#\d]/.test(lines[i - 1])) {
      sections.push({ level: 1, title: lines[i - 1].trim(), line: i });                 // setext H1
    } else if (/^-{3,}\s*$/.test(ln) && lines[i - 1] && lines[i - 1].trim() && !/^\s*[-*+]\s/.test(lines[i - 1]) && !/^[#\d]/.test(lines[i - 1])) {
      sections.push({ level: 2, title: lines[i - 1].trim(), line: i });                 // setext H2
    }
  });
  const seen = new Set();
  const out = sections
    .filter((s) => s.title && s.title.length <= 120 && !seen.has(s.line) && seen.add(s.line))
    .sort((a, b) => a.line - b.line);
  return { sections: out, lines: lines.length, chars: text.length, pagesEst: Math.max(1, Math.round(lines.length / 45)) };
}

/* ---------------- Semantic understanding of the uploaded document ------------- */
const STOP = new Set(('the a an and or of to in for is are was be with on at by this that it its from as if then else ' +
  'when your you we our their can may must should will would has have had not no do does done use used using into over ' +
  'more most other some such than too very s t just also each any all new set get per via both once out off own same ' +
  'only after before between never every here there now against').split(' '));

export function semanticProfile(content, sections) {
  const text = String(content || '');
  const tokens = (text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).filter((t) => !STOP.has(t));
  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
  const terms = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([term, count]) => ({ term, count }));
  // Glossary candidates: repeated Capitalized multi-word phrases (product / concept names).
  const caps = text.match(/\b[A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)+\b/g) || [];
  const capFreq = new Map();
  for (const c of caps) capFreq.set(c, (capFreq.get(c) || 0) + 1);
  const glossary = [...capFreq.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([term]) => term);
  const headingStyle = sections.some((s) => s.num) ? 'numbered (2.4 style)' : 'markdown headings';
  const avgSection = sections.length > 1
    ? Math.round((sections[sections.length - 1].line - sections[0].line) / (sections.length - 1)) : 0;
  const codey = (text.match(/```/g) || []).length / 2;
  const tone = /\bwe recommend|please|you should\b/i.test(text) ? 'guiding, second person'
    : codey > 3 ? 'reference, code-heavy' : 'descriptive, neutral';
  return { terms, glossary, headingStyle, avgSectionLines: avgSection, codeBlocks: Math.floor(codey), tone };
}

/* ---------------- Change-signal → section scoring (semantic matching) --------- */
const SECTION_SIGNAL = [
  ['Authentication', /auth|token|oauth|credential|secret|\bkey\b|login|session|\bjwt\b|scope|signature|hmac/i],
  ['Errors', /error|exception|status\s?code|\b4\d\d\b|\b5\d\d\b|failure|retry|envelope/i],
  ['Endpoints', /endpoint|route|controller|handler|charge|payment|refund|request|response|param|\bapi\b|paginat/i],
  ['Rate limits', /rate|limit|throttle|quota|budget|\brpm\b/i],
  ['Configuration', /config|env|setting|deploy|flag|\boption\b|variable|timeout|dependenc|upgrade|version/i],
  ['Webhooks', /webhook|callback|event|notify|subscription/i],
  ['Overview', /readme|overview|intro|getting.?started|docs?\//i]
];

const confFrom = (score, total) => {
  const dom = score / (total || 1), str = Math.min(1, score / 12);
  return Math.round(Math.min(97, Math.max(42, 34 + 40 * str + 26 * dom)));
};

function scoreOutline(sections, signal, files = []) {
  const sigTokens = [...new Set((signal.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 2))];
  const sigSet = new Set(sigTokens);
  // Changed file paths are the strongest placement signal a commit carries:
  // src/auth/scopes.js says "authentication" louder than any prose does.
  const fileTokens = [...new Set(files.join('/').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !['src', 'lib', 'test', 'tests', 'spec', 'docs', 'json', 'yaml', 'yml'].includes(t)))];
  return sections.map((s, idx) => {
    const titleTokens = (s.title.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 2);
    let score = 0;
    for (const t of titleTokens) {
      if (sigSet.has(t)) score += 3;
      // Stemmed / prefix similarity: "auth" ↔ "authentication", "config" ↔ "configuration".
      else if (t.length >= 4 && sigTokens.some((g) => g.length >= 4 && (t.startsWith(g) || g.startsWith(t)))) score += 2;
      if (t.length >= 4 && fileTokens.some((g) => g.length >= 3 && (t.startsWith(g) || g.startsWith(t)))) score += 3;
    }
    // Concept bridge: a canonical topic present in BOTH the heading and the
    // change signal — weighted by how often the signal hits the topic.
    for (const [, re] of SECTION_SIGNAL) {
      if (re.test(s.title)) {
        const hits = (signal.match(new RegExp(re.source, 'gi')) || []).length;
        if (hits) score += 4 + Math.min(4, hits);
      }
    }
    // The document's own title (first level-1 heading) is almost never the
    // right home for a change — heavily damp it so real sections win.
    if (idx === 0 && (s.level || 1) === 1) score = Math.floor(score * 0.25);
    return { ...s, idx, score };
  });
}

const pageOf = (line, totalLines, pagesEst) => Math.max(1, Math.round((line / Math.max(1, totalLines)) * (pagesEst || 1)) || 1);

function titleFromMessage(message) {
  const raw = String(message || '')
    .replace(/\b[A-Z][A-Z0-9]+-\d+\b/g, '')
    .replace(/^\s*(feat|fix|chore|docs|refactor|perf|test|build)(\([^)]*\))?:\s*/i, '')
    .trim();
  const t = (raw.split(/[.\n]/)[0] || '').trim();
  if (!t) return 'Change details';
  return t.charAt(0).toUpperCase() + t.slice(1, 70);
}

/* ---------------- Mock commit feed (swap for the GitHub webhook in production) -
   Deterministic, ordered like a real repo history. Each entry carries the merge
   metadata the engine analyzes plus a documentation payload for the changed
   portion only. */
export const COMMIT_FEED = [
  {
    sha: '9f2c1ab', author: 'Meera Krishnan', message: 'PAY-231 feat(auth): rotate API keys automatically every 90 days',
    files: ['src/auth/keys.js', 'src/auth/middleware.js', 'docs/openapi.yaml'], adds: 184, dels: 42, mode: 'append',
    body: [
      'API keys created after this release are rotated automatically every 90 days.',
      'Thirty days before expiry the platform emails the key owner and exposes',
      '`expires_at` on `GET /v1/keys`. Requests signed with a key inside its 7-day',
      'grace window succeed but return the header `X-Key-Rotation: due`.',
      '',
      '| Field | Description |',
      '|---|---|',
      '| `expires_at` | ISO-8601 expiry of the active key |',
      '| `rotated_from` | ID of the key this one replaced |'
    ]
  },
  {
    sha: 'a3f9c02', author: 'Sofia Marques', message: 'chore(deps): bump lodash from 4.17.20 to 4.17.21',
    files: ['package.json', 'package-lock.json'], adds: 14, dels: 14, mode: 'append',
    body: ['Dependency maintenance: lodash upgraded to 4.17.21. No behavior change for API consumers.']
  },
  {
    sha: '4b81d3e', author: 'Daniel Osei', message: 'feat(api): add POST /v1/refunds for partial and full refunds',
    files: ['src/routes/refunds.js', 'src/models/refund.js', 'test/refunds.test.js'], adds: 412, dels: 8, mode: 'insert',
    body: [
      'Create a refund against a settled charge. Partial refunds are supported by',
      'passing an `amount` lower than the original charge; omitting `amount`',
      'refunds the full remaining balance.',
      '',
      '```http',
      'POST /v1/refunds',
      '{ "charge": "ch_29aXk", "amount": 1500, "reason": "requested_by_customer" }',
      '```',
      '',
      'Refunds are asynchronous: the response returns `status: "pending"` and the',
      '`refund.settled` webhook fires when funds move.'
    ]
  },
  {
    sha: 'c7d09f4', author: 'Sofia Marques', message: 'fix(rate-limit): raise default API quota to 600 requests per minute',
    files: ['src/middleware/ratelimit.js', 'config/defaults.json'], adds: 31, dels: 17, mode: 'replace',
    body: [
      'The default quota is **600 requests per minute** per API key (previously 300).',
      'Burst traffic above the quota receives `429 Too Many Requests` with a',
      '`Retry-After` header. Sustained limits can be raised per workspace from the',
      'billing console; enterprise plans support dedicated throughput pools.'
    ]
  },
  {
    sha: 'd81e4b7', author: 'Meera Krishnan', message: 'refactor(core): extract retry logic into lib/retry.js helper',
    files: ['src/lib/retry.js', 'src/core/http.js', 'test/retry.test.js'], adds: 88, dels: 74, mode: 'append',
    body: ['Internal restructuring of retry handling. Behavior is unchanged; no user-visible effect.']
  },
  {
    sha: 'e5a77c2', author: 'Meera Krishnan', message: 'feat(errors): standardize error envelope with machine-readable code field',
    files: ['src/lib/errors.js', 'src/routes/index.js'], adds: 96, dels: 61, mode: 'append',
    body: [
      'Every non-2xx response now shares one envelope:',
      '',
      '```json',
      '{ "error": { "code": "charge_already_refunded", "message": "…", "doc_url": "…" } }',
      '```',
      '',
      'The `code` field is stable and machine-readable — branch on it instead of',
      'parsing `message`, which may change between releases.'
    ]
  },
  {
    sha: '1d3f8b9', author: 'Daniel Osei', message: 'feat(webhooks): verify callback signatures with HMAC-SHA256',
    files: ['src/webhooks/verify.js', 'src/webhooks/dispatch.js'], adds: 143, dels: 12, mode: 'insert',
    body: [
      'Every webhook delivery is now signed. The `X-Signature-256` header carries an',
      'HMAC-SHA256 of the raw request body computed with your endpoint secret.',
      '',
      '```js',
      'const expected = "sha256=" + hmacSha256(endpointSecret, rawBody);',
      'if (!timingSafeEqual(expected, req.headers["x-signature-256"])) reject(401);',
      '```',
      '',
      'Rotate endpoint secrets from **Settings → Webhooks**; both secrets stay valid',
      'for 24 hours during rotation.'
    ]
  },
  {
    sha: '7c20e9a', author: 'Daniel Osei', message: 'test(webhooks): add signature verification integration tests',
    files: ['test/webhooks/verify.int.test.js', 'test/fixtures/payloads.json'], adds: 132, dels: 0, mode: 'append',
    body: ['Adds integration coverage for webhook signature verification. Test-only change.']
  },
  {
    sha: 'a09e6d1', author: 'Sofia Marques', message: 'fix(api): cursor-based pagination for GET /v1/charges',
    files: ['src/routes/charges.js', 'docs/openapi.yaml'], adds: 58, dels: 23, mode: 'append',
    body: [
      'List endpoints now paginate with an opaque cursor instead of page numbers.',
      'Pass `limit` (max 100) and the `next_cursor` returned by the previous call:',
      '',
      '```http',
      'GET /v1/charges?limit=50&cursor=eyJpZCI6ImNoXzI5YVhrIn0',
      '```',
      '',
      'Cursors are stable across inserts, so exports never skip or duplicate rows.'
    ]
  },
  {
    sha: 'f4c2e80', author: 'Meera Krishnan', message: 'chore(config): add WEBHOOK_TIMEOUT_MS and PROXY_URL environment variables',
    files: ['config/defaults.json', 'src/env.js', '.env.example'], adds: 22, dels: 4, mode: 'append',
    body: [
      'Two new environment variables tune outbound delivery:',
      '',
      '| Variable | Default | Purpose |',
      '|---|---|---|',
      '| `WEBHOOK_TIMEOUT_MS` | `5000` | Abort webhook deliveries that exceed this budget |',
      '| `PROXY_URL` | — | Route all outbound HTTP through a corporate proxy |'
    ]
  },
  {
    sha: '73b5a1c', author: 'Daniel Osei', message: 'PAY-260 feat(auth): scoped API keys with least-privilege permissions',
    files: ['src/auth/scopes.js', 'src/auth/middleware.js'], adds: 208, dels: 35, mode: 'insert',
    body: [
      'API keys can now carry scopes. A key created with `charges:read` can list and',
      'retrieve charges but receives `403 insufficient_scope` on writes.',
      '',
      'Available scopes: `charges:read`, `charges:write`, `refunds:write`,',
      '`webhooks:manage`, `keys:manage`. Unscoped legacy keys keep full access until',
      'rotated, after which a scope set is required.'
    ]
  }
];

/* ---------------- Placement + diff for one commit against one document -------- */
function sectionRange(sections, idx, totalLines) {
  const s = sections[idx];
  let end = totalLines;
  for (let k = idx + 1; k < sections.length; k++) {
    if (sections[k].level <= s.level) { end = sections[k].line - 1; break; }
  }
  return { start: s.line, end }; // 1-based inclusive heading line … last line of section body
}

export function buildUpdate(doc, commit) {
  const sections = j(doc.sections, []);
  if (!sections.length) return null;
  const lines = String(doc.content || '').split(/\r?\n/);
  const signal = [commit.message, commit.files.join(' '), commit.body.join(' ').slice(0, 300)].join(' ');
  const scored = scoreOutline(sections, signal, commit.files).sort((a, b) => b.score - a.score || a.line - b.line);
  const total = scored.reduce((s, x) => s + x.score, 0) || 1;
  let best = scored[0];
  if (best.score === 0) {
    // Nothing matches — append under the last broad section instead of the title.
    const broad = [...sections].reverse().find((s) => (s.level || 1) <= 2) || sections[sections.length - 1];
    best = scored.find((s) => s.line === broad.line) || best;
  }
  const wantInsert = commit.mode === 'insert' || best.score < 6;
  const kind = wantInsert ? 'insert-new' : 'update-existing';
  const page = pageOf(best.line, lines.length, Math.max(1, Math.round(lines.length / 45)));
  const subTitle = titleFromMessage(commit.message);
  const anchorPath = wantInsert ? best.title + ' ▸ ' + subTitle : best.title;
  const range = sectionRange(sections, best.idx, lines.length);

  const matched = [...new Set((signal.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((t) => t.length > 3 && best.title.toLowerCase().includes(t)))].slice(0, 6);
  const topics = SECTION_SIGNAL.filter(([, re]) => re.test(best.title) && re.test(signal)).map(([n]) => n);

  // STYLE MATCHING: the new lines are conformed to the conventions of the
  // section they are spliced into — list markers, heading case, bold-lead
  // bullets, and safe terminology — so the insert reads like the same author
  // wrote it, not like a bot dropped in templated phrasing.
  const surrounding = lines.slice(Math.max(0, range.start - 1), Math.min(lines.length, range.end));
  const styledBody = matchSurroundingStyle(commit.body, surrounding, null);

  const snippet = styledBody.join('\n');
  let diff;
  if (kind === 'update-existing') {
    const before = lines.slice(range.start - 1, range.end);
    const heading = before[0];
    const bodyLines = before.slice(1);
    const after = commit.mode === 'replace'
      ? [heading, '', ...styledBody]
      : [heading, ...bodyLines.filter((l, i) => !(i === bodyLines.length - 1 && !l.trim())), '', ...styledBody];
    diff = { startLine: range.start, before, after };
  } else {
    const level = Math.min(6, (best.level || 1) + 1);
    let heading;
    if (best.num) {
      // Numbered documents get a correctly numbered child: "2.4" gains "2.4.3".
      let maxChild = 0;
      const depth = (best.num.match(/\./g) || []).length + 1;
      for (let k = best.idx + 1; k < sections.length; k++) {
        const s = sections[k];
        if ((s.level || 1) <= (best.level || 1)) break;
        if (s.num && s.num.startsWith(best.num + '.') && (s.num.match(/\./g) || []).length === depth) {
          maxChild = Math.max(maxChild, Number(s.num.split('.').pop()) || 0);
        }
      }
      heading = best.num + '.' + (maxChild + 1) + ' ' + subTitle;
    } else {
      heading = '#'.repeat(level) + ' ' + subTitle;
    }
    const after = ['', heading, '', ...styledBody];
    const context = lines.slice(Math.max(0, range.end - 2), range.end);
    diff = { startLine: range.end, before: [], after, context };
  }

  const candidates = scored.slice(0, 4).map((s) => ({
    title: s.title, level: s.level || 1, line: s.line,
    page: pageOf(s.line, lines.length, Math.max(1, Math.round(lines.length / 45))),
    confidence: confFrom(s.score, total)
  }));
  const confidence = confFrom(best.score, total);
  const fromDemoFeed = COMMIT_FEED.some((c) => c.sha === commit.sha);
  const reasoning = {
    demo: fromDemoFeed, // provenance: built-in sample feed, fictional author
    why: kind === 'update-existing'
      ? 'The change maps to “' + best.title + '” (p.' + page + ') — its heading and body share the strongest vocabulary with this commit, so that section is updated in place.'
      : 'No existing section fully covers this change — a new “' + subTitle + '” sub-section is spliced under “' + best.title + '” (p.' + page + '), the closest matching parent.',
    semantic: 'Scored every one of the document’s ' + sections.length + ' sections against the commit message, changed file paths, and generated content. '
      + (topics.length ? 'Shared concepts: ' + topics.join(', ') + '. ' : '')
      + (matched.length ? 'Overlapping terms: ' + matched.join(', ') + '.' : 'Match driven by concept-level similarity rather than exact term overlap.'),
    signals: { terms: matched, concepts: topics, filesConsidered: commit.files.length },
    style: 'The insert was conformed to this section’s conventions — list markers, heading case, and bold-lead patterns were sampled from the surrounding text so the update reads like the same author.',
    candidates
  };

  return {
    commit: commit.sha, message: commit.message, author: commit.author, branch: doc.branch || 'main',
    files: JSON.stringify(commit.files), kind,
    anchor: JSON.stringify({ title: best.title, anchorPath, line: best.line, page, level: best.level || 1 }),
    confidence, reasoning: JSON.stringify(reasoning), diff: JSON.stringify(diff), snippet
  };
}

/* ---------------- Apply an approved update to the live document ---------------- */
export function applyUpdate(doc, upd, snippetOverride) {
  const lines = String(doc.content || '').split(/\r?\n/);
  const sections = parseOutline(doc.content).sections;
  const anchor = j(upd.anchor, {});
  const diff = j(upd.diff, {});
  // Re-locate the anchor by title — earlier approvals may have shifted line numbers.
  let idx = sections.findIndex((s) => s.title === anchor.title);
  if (idx < 0) idx = sections.findIndex((s) => s.line === anchor.line);
  if (idx < 0) idx = 0;
  const range = sectionRange(sections, idx, lines.length);
  const body = snippetOverride != null && snippetOverride.trim() !== '' ? snippetOverride.split(/\r?\n/) : null;

  let next;
  if (upd.kind === 'update-existing') {
    const heading = lines[range.start - 1];
    const stored = j(upd.diff, {});
    const after = body ? [heading, '', ...body] : (stored.after || [heading]);
    after[0] = heading; // never lose the live heading text
    next = [...lines.slice(0, range.start - 1), ...after, ...lines.slice(range.end)];
  } else {
    const stored = diff.after || [];
    const heading = stored[1] || ('### ' + String(anchor.anchorPath || 'Update').split(' ▸ ').pop());
    const after = body ? ['', heading, '', ...body] : stored;
    next = [...lines.slice(0, range.end), ...after, ...lines.slice(range.end)];
  }
  return next.join('\n');
}

/* ---------------- Async parsing pipeline (progress the UI can watch) ---------- */
async function runParsePipeline(docId) {
  const stages = [[12, 350], [34, 500], [55, 550], [78, 500], [92, 400]];
  try {
    for (const [pct, ms] of stages) {
      await sleep(ms);
      const row = await prisma.syncDoc.findUnique({ where: { id: docId } });
      if (!row) return;
      await prisma.syncDoc.update({
        where: { id: docId },
        data: { progress: pct, status: pct < 50 ? 'parsing' : 'indexing' }
      });
    }
    const row = await prisma.syncDoc.findUnique({ where: { id: docId } });
    if (!row) return;
    const parsed = parseOutline(row.content);
    if (!parsed.sections.length) {
      await prisma.syncDoc.update({
        where: { id: docId },
        data: { status: 'failed', progress: 100, error: 'No headings found — synchronization needs section headings (Markdown #, ##, or numbered 2.4 style).' }
      });
      return;
    }
    const profile = semanticProfile(row.content, parsed.sections);
    await prisma.syncDoc.update({
      where: { id: docId },
      data: {
        status: 'ready', progress: 100,
        sections: JSON.stringify(parsed.sections.slice(0, 2000)),
        profile: JSON.stringify({ ...profile, lines: parsed.lines, chars: parsed.chars, pagesEst: parsed.pagesEst })
      }
    });
    await prisma.syncVersion.create({
      data: { docId, number: 1, source: 'upload', summary: 'Baseline uploaded — ' + parsed.sections.length + ' sections, ~' + parsed.pagesEst + ' pages', content: row.content }
    });
  } catch (e) {
    console.error('parse pipeline failed', e);
    await prisma.syncDoc.update({ where: { id: docId }, data: { status: 'failed', error: 'Parsing failed unexpectedly — try re-uploading.' } }).catch(() => {});
  }
}

/* ---------------- Serialization ---------------- */
function serializeDoc(d, { withContent = false } = {}) {
  return {
    id: d.id, name: d.name, format: d.format, repo: d.repo, branch: d.branch,
    docsProvider: d.docsProvider || '', docsRepo: d.docsRepo || '',
    docsBranch: d.docsBranch || '', docsPath: d.docsPath || '',
    status: d.status, progress: d.progress, error: d.error, cursor: d.cursor,
    sections: j(d.sections, []), profile: j(d.profile, {}),
    createdAt: d.createdAt, updatedAt: d.updatedAt,
    ...(withContent ? { content: d.content } : {})
  };
}

function serializeUpdate(u, docName) {
  return {
    id: u.id, docId: u.docId, docName: docName || undefined,
    commit: u.commit, message: u.message, author: u.author, branch: u.branch,
    files: j(u.files, []), kind: u.kind, anchor: j(u.anchor, {}),
    confidence: u.confidence, reasoning: j(u.reasoning, {}), diff: j(u.diff, {}),
    snippet: u.snippet, status: u.status, decidedAt: u.decidedAt,
    versionNumber: u.versionNumber, createdAt: u.createdAt
  };
}

const ownDoc = async (req, res) => {
  const row = await prisma.syncDoc.findFirst({ where: { id: req.params.id, userId: req.uid } });
  if (!row) res.status(404).json({ error: 'Document not found' });
  return row;
};

/* ================================ Routes ================================ */

// Overview for the dashboard + doc-sync header.
syncRouter.get('/overview', async (req, res) => {
  const docs = await prisma.syncDoc.findMany({ where: { userId: req.uid } });
  const updates = await prisma.syncUpdate.findMany({ where: { userId: req.uid } });
  const pending = updates.filter((u) => u.status === 'pending');
  const approved = updates.filter((u) => u.status === 'approved');
  const decided = updates.filter((u) => u.status !== 'pending');
  const lastSync = updates.length ? updates.map((u) => u.createdAt).sort().pop() : null;
  const filteredOut = await prisma.relevanceDecision.count({ where: { userId: req.uid, verdict: 'skip', overridden: false } }).catch(() => 0);
  res.json({
    docs: docs.length, ready: docs.filter((d) => d.status === 'ready').length,
    pending: pending.length, approved: approved.length,
    rejected: updates.filter((u) => u.status === 'rejected').length,
    avgConfidence: updates.length ? Math.round(updates.reduce((a, u) => a + u.confidence, 0) / updates.length) : 0,
    placementAccuracy: decided.length ? Math.round(100 * approved.length / decided.length) : null,
    filteredOut,
    lastSync
  });
});

// The mock commit feed a mapped repository exposes (for the timeline + pickers).
syncRouter.get('/feed', (req, res) => {
  res.json({ commits: COMMIT_FEED.map(({ body, ...c }) => c) });
});

syncRouter.get('/documents', async (req, res) => {
  const rows = await prisma.syncDoc.findMany({ where: { userId: req.uid }, orderBy: { createdAt: 'asc' } });
  res.json({ documents: rows.map((d) => serializeDoc(d)) });
});

syncRouter.post('/documents', async (req, res) => {
  const { name = '', format = 'markdown', content = '', repo = '', branch = 'main' } = req.body || {};
  if (!String(content).trim()) return res.status(400).json({ error: 'Upload a document with readable text content' });
  if (String(content).length > 1_500_000) return res.status(400).json({ error: 'Document exceeds the 1.5 MB text limit — split it or trim exports' });
  const row = await prisma.syncDoc.create({
    data: {
      userId: req.uid,
      name: String(name || 'document.md').slice(0, 140),
      format: String(format || 'markdown').slice(0, 30),
      repo: String(repo || '').slice(0, 140),
      branch: String(branch || 'main').slice(0, 80),
      content: String(content),
      status: 'parsing', progress: 4
    }
  });
  runParsePipeline(row.id).catch((e) => console.error('parse pipeline', e));
  res.status(201).json({ document: serializeDoc(row) });
});

/* Docs that live in a SEPARATE repository from the code: import the baseline
   straight from the docs repo (owner/name + path + branch), while commits are
   watched on the code repository. No copy-paste, no export step. */
syncRouter.post('/documents/import', async (req, res) => {
  const b = req.body || {};
  const provider = ['github', 'gitlab', 'bitbucket'].includes(String(b.provider)) ? String(b.provider) : 'github';
  const docsRepo = String(b.docsRepo || '').trim();
  const docsBranch = String(b.docsBranch || 'main').trim() || 'main';
  const docsPath = String(b.docsPath || '').trim().replace(/^\/+/, '');
  const codeRepo = String(b.codeRepo || '').trim();
  const codeBranch = String(b.codeBranch || 'main').trim() || 'main';
  if (!/^[\w.-]+\/[\w.-]+$/.test(docsRepo)) return res.status(400).json({ error: 'Docs repository must be owner/name — e.g. acme/developer-docs' });
  if (!docsPath) return res.status(400).json({ error: 'Provide the path of the document inside the docs repository — e.g. docs/api-guide.md' });
  if (!/\.(md|markdown|mdx|txt|text|html|htm|rst|adoc)$/i.test(docsPath)) {
    return res.status(400).json({ error: 'Supported file types: Markdown, plain text, HTML, reStructuredText, AsciiDoc' });
  }

  let token = '';
  try {
    const src = await prisma.source.findFirst({ where: { userId: req.uid, provider } });
    if (src && src.token) token = await freshToken(src);
  } catch { /* public-repo fallback */ }
  const content = await fetchRepoFile(provider, docsRepo, docsBranch, docsPath, token);
  if (content == null) {
    return res.status(400).json({ error: 'Could not read ' + docsPath + ' from ' + docsRepo + '@' + docsBranch + ' — check the repository, branch, and path (private repos need the source connected).' });
  }
  if (!String(content).trim()) return res.status(400).json({ error: 'The file is empty — nothing to index.' });
  if (String(content).length > 1_500_000) return res.status(400).json({ error: 'Document exceeds the 1.5 MB text limit — split it or trim exports' });

  const ext = (docsPath.split('.').pop() || '').toLowerCase();
  const format = ['html', 'htm'].includes(ext) ? 'html' : ['txt', 'text'].includes(ext) ? 'text' : 'markdown';
  const row = await prisma.syncDoc.create({
    data: {
      userId: req.uid,
      name: docsPath.split('/').pop().slice(0, 140),
      format,
      repo: (codeRepo || docsRepo).slice(0, 140),
      branch: codeBranch.slice(0, 80),
      docsProvider: provider, docsRepo: docsRepo.slice(0, 140),
      docsBranch: docsBranch.slice(0, 80), docsPath: docsPath.slice(0, 300),
      content: String(content),
      status: 'parsing', progress: 4
    }
  });
  runParsePipeline(row.id).catch((e) => console.error('parse pipeline', e));
  res.status(201).json({ document: serializeDoc(row) });
});

syncRouter.get('/documents/:id', async (req, res) => {
  const row = await ownDoc(req, res);
  if (!row) return;
  const versions = await prisma.syncVersion.findMany({ where: { docId: row.id }, orderBy: { number: 'desc' } });
  res.json({
    document: serializeDoc(row, { withContent: true }),
    versions: versions.map((v) => ({ id: v.id, number: v.number, source: v.source, commit: v.commit, summary: v.summary, createdAt: v.createdAt }))
  });
});

syncRouter.put('/documents/:id', async (req, res) => {
  const row = await ownDoc(req, res);
  if (!row) return;
  const { name, repo, branch } = req.body || {};
  const data = {};
  if (typeof name === 'string' && name.trim()) data.name = name.trim().slice(0, 140);
  if (typeof repo === 'string') data.repo = repo.trim().slice(0, 140);
  if (typeof branch === 'string' && branch.trim()) data.branch = branch.trim().slice(0, 80);
  const updated = await prisma.syncDoc.update({ where: { id: row.id }, data });
  res.json({ document: serializeDoc(updated) });
});

syncRouter.delete('/documents/:id', async (req, res) => {
  const row = await ownDoc(req, res);
  if (!row) return;
  await prisma.syncDoc.delete({ where: { id: row.id } });
  res.json({ ok: true });
});

/* ---------------- Relevance context (config + instructions per repo) -------
   Loaded once per request; real repos read docify.yaml / .docifyignore /
   .docify/instructions.md from the repository, everything else uses defaults.
   Never throws — filtering must degrade gracefully, not block syncing. */
async function relevanceContext(userId, repo, branch, provider = 'github') {
  // Unified rules engine: rule sets from the repository hub + repo docify.yaml,
  // resolved through the same path generation and automation use.
  try {
    const { resolveEffectiveConfig } = await import('./repohub.js');
    return await resolveEffectiveConfig(userId, provider, repo || '', branch || 'main', {});
  } catch (e) {
    console.error('relevanceContext:', e.message);
  }
  // Legacy fallback: repo files only.
  try {
    if (repo && repo.includes('/')) {
      let token = '';
      try {
        const src = await prisma.source.findFirst({ where: { userId, provider } });
        if (src && src.token) token = await freshToken(src);
      } catch { /* unauthenticated public fetch */ }
      return await loadRepoConfig(provider, repo, branch || 'main', token);
    }
  } catch (e) {
    console.error('relevanceContext fallback:', e.message);
  }
  return { config: DEFAULT_CONFIG, instructions: '', sources: { yaml: false, ignoreFile: false, instructions: false }, errors: [] };
}

// Evaluate one commit and persist the decision. Returns the decision row.
async function recordDecision(userId, doc, commit, decision) {
  return prisma.relevanceDecision.create({
    data: {
      userId, docId: doc ? doc.id : '',
      provider: 'github', repo: (doc && doc.repo) || '',
      sha: String(commit.sha || ''), message: String(commit.message || '').slice(0, 300),
      author: String(commit.author || ''), files: JSON.stringify(commit.files || []),
      payload: JSON.stringify(commit).slice(0, 20000),
      verdict: decision.verdict, score: decision.score,
      category: decision.category, rationale: String(decision.rationale || '').slice(0, 500),
      stage: decision.stage, eliminatedBy: decision.eliminatedBy || '',
      surfaces: JSON.stringify(decision.surfaces || [])
    }
  }).catch((e) => { console.error('recordDecision:', e.message); return null; });
}

// Pull the next unseen commits from the mapped repository, filter them through
// the relevance engine, and queue AI updates only for customer-facing changes.
syncRouter.post('/documents/:id/sync', async (req, res) => {
  const row = await ownDoc(req, res);
  if (!row) return;
  if (row.status !== 'ready') return res.status(400).json({ error: 'Document is still being parsed — try again in a moment' });
  const batch = Math.min(3, Math.max(1, Number(req.body && req.body.batch) || 2));
  const next = COMMIT_FEED.slice(row.cursor, row.cursor + batch);
  if (!next.length) return res.json({ created: 0, done: true, message: 'Documentation is up to date with the repository — no new commits.' });
  const ctx = await relevanceContext(req.uid, row.repo, row.branch);
  const created = [];
  const filtered = [];
  for (const commit of next) {
    const decision = await evaluateCommit(commit, ctx);
    await recordDecision(req.uid, row, commit, decision);
    if (decision.verdict === 'skip') {
      filtered.push({ sha: commit.sha, message: commit.message, rationale: decision.rationale, eliminatedBy: decision.eliminatedBy });
      continue;
    }
    const built = buildUpdate(row, commit);
    if (!built) continue;
    // Borderline relevance travels with the update so the review queue can flag it.
    const reasoning = j(built.reasoning, {});
    reasoning.relevance = { verdict: decision.verdict, score: decision.score, rationale: decision.rationale, engine: decision.engine };
    built.reasoning = JSON.stringify(reasoning);
    const u = await prisma.syncUpdate.create({ data: { userId: req.uid, docId: row.id, ...built } });
    created.push(serializeUpdate(u, row.name));
  }
  await prisma.syncDoc.update({ where: { id: row.id }, data: { cursor: row.cursor + next.length } });
  res.json({
    created: created.length, updates: created, filtered,
    remaining: Math.max(0, COMMIT_FEED.length - row.cursor - next.length)
  });
});

// Simulate a custom commit (what the webhook would deliver) against a document.
syncRouter.post('/documents/:id/simulate', async (req, res) => {
  const row = await ownDoc(req, res);
  if (!row) return;
  if (row.status !== 'ready') return res.status(400).json({ error: 'Document is still being parsed — try again in a moment' });
  const b = req.body || {};
  const message = String(b.message || '').trim();
  if (!message) return res.status(400).json({ error: 'A commit message is required' });
  const files = String(b.files || '').split(/[\s,]+/).filter(Boolean).slice(0, 20);
  const commit = {
    sha: 'sim' + Date.now().toString(36).slice(-4),
    author: 'You (simulated)', message, files: files.length ? files : ['src/app.js'],
    adds: 0, dels: 0, mode: 'append',
    body: [
      titleFromMessage(message) + '.',
      '',
      'Generated from the simulated merge “' + message.slice(0, 90) + '”' + (files.length ? ' touching ' + files.slice(0, 3).join(', ') + (files.length > 3 ? '…' : '') : '') + '.',
      'This documents only the changed portion of the repository — the rest of the document is untouched.'
    ]
  };
  // Simulated merges run through the same relevance gate as real ones.
  const ctx = await relevanceContext(req.uid, row.repo, row.branch);
  const decision = await evaluateCommit(commit, ctx);
  await recordDecision(req.uid, row, commit, decision);
  if (decision.verdict === 'skip') {
    return res.status(200).json({
      filtered: true,
      decision: { score: decision.score, rationale: decision.rationale, eliminatedBy: decision.eliminatedBy },
      message: 'The relevance engine classified this change as internal — it was logged in Filtered out instead of the review queue.'
    });
  }
  const built = buildUpdate(row, commit);
  if (!built) return res.status(400).json({ error: 'The document has no sections to place into' });
  const reasoning = j(built.reasoning, {});
  reasoning.relevance = { verdict: decision.verdict, score: decision.score, rationale: decision.rationale, engine: decision.engine };
  built.reasoning = JSON.stringify(reasoning);
  const u = await prisma.syncUpdate.create({ data: { userId: req.uid, docId: row.id, ...built } });
  res.status(201).json({ update: serializeUpdate(u, row.name) });
});

/* ---------------- Relevance: decisions audit + overrides + config ---------- */

// The "Filtered out" audit trail (and full decision history).
syncRouter.get('/relevance/decisions', async (req, res) => {
  const where = { userId: req.uid };
  if (req.query.verdict && ['document', 'review', 'skip'].includes(String(req.query.verdict))) {
    where.verdict = String(req.query.verdict);
  }
  const rows = await prisma.relevanceDecision.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({
    decisions: rows.map((d) => ({
      id: d.id, docId: d.docId, repo: d.repo, sha: d.sha, message: d.message, author: d.author,
      files: j(d.files, []), verdict: d.verdict, score: d.score, category: d.category,
      rationale: d.rationale, stage: d.stage, eliminatedBy: d.eliminatedBy,
      surfaces: j(d.surfaces, []), overridden: d.overridden,
      demo: COMMIT_FEED.some((c) => c.sha === d.sha), // sample-feed provenance
      createdAt: d.createdAt
    }))
  });
});

// "Document this anyway" — human override creates the update the engine skipped
// and records the correction (future few-shot signal for the classifier).
syncRouter.post('/relevance/decisions/:id/override', async (req, res) => {
  const d = await prisma.relevanceDecision.findFirst({ where: { id: req.params.id, userId: req.uid } });
  if (!d) return res.status(404).json({ error: 'Decision not found' });
  if (d.overridden) return res.status(400).json({ error: 'Already documented' });
  const doc = d.docId ? await prisma.syncDoc.findFirst({ where: { id: d.docId, userId: req.uid } }) : null;
  if (!doc) return res.status(400).json({ error: 'The document this change belonged to no longer exists' });
  const commit = j(d.payload, null);
  if (!commit || !commit.sha) return res.status(400).json({ error: 'Original change payload unavailable' });
  if (!Array.isArray(commit.body) || !commit.body.length) {
    commit.body = ['Documented by reviewer override: ' + titleFromMessage(commit.message) + '.'];
  }
  const built = buildUpdate(doc, commit);
  if (!built) return res.status(400).json({ error: 'The document has no sections to place into' });
  const reasoning = j(built.reasoning, {});
  reasoning.relevance = { verdict: 'override', score: d.score, rationale: 'Reviewer overrode the filter: ' + d.rationale, engine: d.stage };
  built.reasoning = JSON.stringify(reasoning);
  const u = await prisma.syncUpdate.create({ data: { userId: req.uid, docId: doc.id, ...built } });
  await prisma.relevanceDecision.update({ where: { id: d.id }, data: { overridden: true, verdict: 'document' } });
  res.status(201).json({ update: serializeUpdate(u, doc.name) });
});

// Effective relevance configuration for a repository (defaults + repo files).
syncRouter.get('/relevance/config', async (req, res) => {
  const repo = String(req.query.repo || '');
  const branch = String(req.query.branch || 'main');
  const provider = ['github', 'gitlab', 'bitbucket'].includes(String(req.query.provider)) ? String(req.query.provider) : 'github';
  const ctx = await relevanceContext(req.uid, repo, branch, provider);
  res.json({
    repo, provider,
    config: ctx.config, sources: ctx.sources, errors: ctx.errors,
    hasInstructions: Boolean(ctx.instructions),
    samples: { yaml: SAMPLE_YAML, instructions: SAMPLE_INSTRUCTIONS }
  });
});

syncRouter.get('/updates', async (req, res) => {
  const where = { userId: req.uid };
  if (req.query.status && ['pending', 'approved', 'rejected'].includes(String(req.query.status))) where.status = String(req.query.status);
  if (req.query.docId) where.docId = String(req.query.docId);
  const rows = await prisma.syncUpdate.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200, include: { doc: { select: { name: true } } } });
  res.json({ updates: rows.map((u) => serializeUpdate(u, u.doc && u.doc.name)) });
});

syncRouter.get('/updates/:id', async (req, res) => {
  const u = await prisma.syncUpdate.findFirst({ where: { id: req.params.id, userId: req.uid }, include: { doc: { select: { name: true } } } });
  if (!u) return res.status(404).json({ error: 'Update not found' });
  res.json({ update: serializeUpdate(u, u.doc && u.doc.name) });
});

// Edit the generated content before approving.
syncRouter.put('/updates/:id', async (req, res) => {
  const u = await prisma.syncUpdate.findFirst({ where: { id: req.params.id, userId: req.uid } });
  if (!u) return res.status(404).json({ error: 'Update not found' });
  if (u.status !== 'pending') return res.status(400).json({ error: 'Only pending updates can be edited' });
  const snippet = String((req.body || {}).snippet || '');
  if (!snippet.trim()) return res.status(400).json({ error: 'Content cannot be empty' });
  // Rebuild the "after" pane so the diff always shows what approval will apply.
  const diff = j(u.diff, {});
  const bodyLines = snippet.split(/\r?\n/);
  if (u.kind === 'update-existing') {
    const heading = (diff.before && diff.before[0]) || '';
    diff.after = [heading, '', ...bodyLines];
  } else {
    const heading = (diff.after || [])[1] || '### Update'; // stored shape: ['', heading, '', …body]
    diff.after = ['', heading, '', ...bodyLines];
  }
  const updated = await prisma.syncUpdate.update({
    where: { id: u.id },
    data: { snippet, diff: JSON.stringify(diff) }
  });
  res.json({ update: serializeUpdate(updated) });
});

syncRouter.post('/updates/:id/approve', async (req, res) => {
  const u = await prisma.syncUpdate.findFirst({ where: { id: req.params.id, userId: req.uid } });
  if (!u) return res.status(404).json({ error: 'Update not found' });
  if (u.status !== 'pending') return res.status(400).json({ error: 'Update was already ' + u.status });
  const doc = await prisma.syncDoc.findUnique({ where: { id: u.docId } });
  if (!doc) return res.status(404).json({ error: 'Document no longer exists' });

  const nextContent = applyUpdate(doc, u, (req.body || {}).snippet);
  const parsed = parseOutline(nextContent);
  const profile = semanticProfile(nextContent, parsed.sections);
  const last = await prisma.syncVersion.findFirst({ where: { docId: doc.id }, orderBy: { number: 'desc' } });
  const number = (last ? last.number : 0) + 1;
  const anchor = j(u.anchor, {});

  await prisma.syncDoc.update({
    where: { id: doc.id },
    data: {
      content: nextContent,
      sections: JSON.stringify(parsed.sections.slice(0, 2000)),
      profile: JSON.stringify({ ...profile, lines: parsed.lines, chars: parsed.chars, pagesEst: parsed.pagesEst })
    }
  });
  await prisma.syncVersion.create({
    data: {
      docId: doc.id, number, source: 'ai-update', commit: u.commit,
      summary: (u.kind === 'update-existing' ? 'Updated “' : 'Inserted under “') + (anchor.title || 'section') + '” — ' + u.message.slice(0, 90),
      content: nextContent
    }
  });
  const updated = await prisma.syncUpdate.update({
    where: { id: u.id },
    data: { status: 'approved', decidedAt: new Date(), versionNumber: number }
  });
  res.json({ update: serializeUpdate(updated), version: number });
});

syncRouter.post('/updates/:id/reject', async (req, res) => {
  const u = await prisma.syncUpdate.findFirst({ where: { id: req.params.id, userId: req.uid } });
  if (!u) return res.status(404).json({ error: 'Update not found' });
  if (u.status !== 'pending') return res.status(400).json({ error: 'Update was already ' + u.status });
  const updated = await prisma.syncUpdate.update({ where: { id: u.id }, data: { status: 'rejected', decidedAt: new Date() } });
  res.json({ update: serializeUpdate(updated) });
});

// Full content of one version (compare view).
syncRouter.get('/versions/:id', async (req, res) => {
  const v = await prisma.syncVersion.findUnique({ where: { id: req.params.id }, include: { doc: { select: { userId: true, name: true } } } });
  if (!v || v.doc.userId !== req.uid) return res.status(404).json({ error: 'Version not found' });
  res.json({ version: { id: v.id, number: v.number, source: v.source, commit: v.commit, summary: v.summary, createdAt: v.createdAt, content: v.content, docName: v.doc.name } });
});

syncRouter.post('/documents/:id/restore/:number', async (req, res) => {
  const row = await ownDoc(req, res);
  if (!row) return;
  const num = Number(req.params.number);
  const v = await prisma.syncVersion.findFirst({ where: { docId: row.id, number: num } });
  if (!v) return res.status(404).json({ error: 'Version v' + num + ' not found' });
  const last = await prisma.syncVersion.findFirst({ where: { docId: row.id }, orderBy: { number: 'desc' } });
  const nextNum = (last ? last.number : 0) + 1;
  const parsed = parseOutline(v.content);
  const profile = semanticProfile(v.content, parsed.sections);
  await prisma.syncDoc.update({
    where: { id: row.id },
    data: {
      content: v.content,
      sections: JSON.stringify(parsed.sections.slice(0, 2000)),
      profile: JSON.stringify({ ...profile, lines: parsed.lines, chars: parsed.chars, pagesEst: parsed.pagesEst })
    }
  });
  const created = await prisma.syncVersion.create({
    data: { docId: row.id, number: nextNum, source: 'restore', summary: 'Restored from v' + num, content: v.content }
  });
  res.json({ ok: true, version: { number: created.number, source: created.source, summary: created.summary, createdAt: created.createdAt } });
});

// Commit timeline: every synchronized commit with its updates and review status.
syncRouter.get('/timeline', async (req, res) => {
  const rows = await prisma.syncUpdate.findMany({
    where: { userId: req.uid }, orderBy: { createdAt: 'desc' }, take: 200,
    include: { doc: { select: { name: true } } }
  });
  const byCommit = new Map();
  for (const u of rows) {
    const key = u.commit;
    if (!byCommit.has(key)) {
      const meta = COMMIT_FEED.find((c) => c.sha === u.commit);
      byCommit.set(key, {
        commit: u.commit, message: u.message, author: u.author, branch: u.branch,
        files: j(u.files, []), adds: meta ? meta.adds : 0, dels: meta ? meta.dels : 0,
        // Truth about provenance: commits from the built-in demo feed are
        // SAMPLE data with fictional authors — the UI labels them clearly.
        demo: Boolean(meta),
        at: u.createdAt, updates: []
      });
    }
    byCommit.get(key).updates.push({
      id: u.id, docName: u.doc && u.doc.name, kind: u.kind, status: u.status,
      confidence: u.confidence, anchor: j(u.anchor, {}), versionNumber: u.versionNumber
    });
  }
  res.json({ timeline: [...byCommit.values()] });
});
