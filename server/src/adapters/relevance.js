/* ================= Relevance engine: customer-facing change filtering =========
   Implements design/RELEVANCE-FILTERING-ARCHITECTURE.md.

   Guiding principle: document behavior, not code. A change is documented only
   if it alters something a user can see, call, configure, or be broken by.

   Pipeline (cheap → expensive):
     stage 0  repo configuration      docify.yaml · .docifyignore · instructions.md
     stage 1  deterministic filters   paths, commit type, lockfiles, test-only
     stage 2  surface extraction      which USER-VISIBLE surface did this touch?
     stage 3  impact scoring          Claude when available; explainable heuristic otherwise
     verdict  document | review | skip  (thresholds from config)

   Every decision carries { stage, eliminatedBy | rationale } so the product can
   show WHY — nothing is filtered silently. Pure functions; no DB access here. */

import yaml from 'js-yaml';
import { fetchRepoFile } from './repofiles.js';

/* ------------------------------- Defaults -------------------------------- */
export const DEFAULT_CONFIG = {
  version: 1,
  product: { name: '', audience: '', terminology: [] },
  scan: {
    include: [],                       // empty = everything
    exclude: [
      '**/*.lock', '**/package-lock.json', '**/yarn.lock', '**/pnpm-lock.yaml',
      '**/go.sum', '**/Cargo.lock', '**/poetry.lock',
      '**/node_modules/**', '**/dist/**', '**/build/**', '**/vendor/**',
      '**/.github/**', '**/.circleci/**'
    ]
  },
  rules: {
    ignore_commit_types: ['chore', 'refactor', 'test', 'style', 'ci', 'build'],
    ignore_dependency_updates: true,
    ignore_comment_only_changes: true,
    ignore_formatting_only_changes: true,
    document_only: null,               // e.g. ['public_api','cli','configuration']
    always_document_paths: []
  },
  thresholds: { auto_document: 80, review_below: 80, discard_below: 40 }
};

const SURFACE_IDS = ['public_api', 'http_api', 'cli', 'configuration', 'error_messages', 'webhooks', 'ui', 'auth'];

/* ---------------------------- Config handling ---------------------------- */
function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

// Deep merge user config over defaults; arrays replace, objects merge.
export function mergeConfig(user) {
  const out = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  if (!isObj(user)) return out;
  for (const k of ['product', 'scan', 'rules', 'thresholds']) {
    if (isObj(user[k])) {
      for (const [kk, vv] of Object.entries(user[k])) {
        if (vv !== undefined && vv !== null) out[k][kk] = vv;
      }
    }
  }
  return out;
}

// Validate + normalize a parsed config; returns { config, errors[] }.
export function validateConfig(raw) {
  const errors = [];
  const cfg = mergeConfig(raw);
  const arr = (v, path) => {
    if (v == null) return [];
    if (!Array.isArray(v)) { errors.push(path + ' must be a list'); return []; }
    return v.map(String);
  };
  cfg.scan.include = arr(cfg.scan.include, 'scan.include');
  cfg.scan.exclude = arr(cfg.scan.exclude, 'scan.exclude');
  cfg.rules.ignore_commit_types = arr(cfg.rules.ignore_commit_types, 'rules.ignore_commit_types').map((t) => t.toLowerCase());
  cfg.rules.always_document_paths = arr(cfg.rules.always_document_paths, 'rules.always_document_paths');
  if (cfg.rules.document_only != null) {
    cfg.rules.document_only = arr(cfg.rules.document_only, 'rules.document_only').map((s) => s.toLowerCase());
    const bad = cfg.rules.document_only.filter((s) => !SURFACE_IDS.includes(s));
    if (bad.length) errors.push('rules.document_only contains unknown surfaces: ' + bad.join(', '));
  }
  for (const k of ['auto_document', 'review_below', 'discard_below']) {
    const n = Number(cfg.thresholds[k]);
    if (!Number.isFinite(n) || n < 0 || n > 100) { errors.push('thresholds.' + k + ' must be 0–100'); cfg.thresholds[k] = DEFAULT_CONFIG.thresholds[k]; }
    else cfg.thresholds[k] = Math.round(n);
  }
  if (cfg.thresholds.discard_below > cfg.thresholds.auto_document) {
    errors.push('thresholds.discard_below cannot exceed thresholds.auto_document');
    cfg.thresholds.discard_below = DEFAULT_CONFIG.thresholds.discard_below;
  }
  return { config: cfg, errors };
}

// Load configuration from the repository. Never throws; always returns a
// usable config plus which sources were found and any validation errors.
export async function loadRepoConfig(provider, repo, branch = 'main', token = '') {
  const sources = { yaml: false, ignoreFile: false, instructions: false };
  let raw = null;
  const errors = [];
  const y1 = await fetchRepoFile(provider, repo, branch, 'docify.yaml', token);
  const y2 = y1 == null ? await fetchRepoFile(provider, repo, branch, '.docify/config.yaml', token) : null;
  const text = y1 != null ? y1 : y2;
  if (text != null) {
    sources.yaml = true;
    try { raw = yaml.load(text); } catch (e) { errors.push('docify.yaml parse error: ' + e.message); }
  }
  const { config, errors: vErrors } = validateConfig(raw);
  errors.push(...vErrors);

  const ig = await fetchRepoFile(provider, repo, branch, '.docifyignore', token);
  if (ig != null) {
    sources.ignoreFile = true;
    const lines = ig.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    config.scan.exclude.push(...lines.map((l) => (l.includes('*') || l.includes('/') ? l : '**/' + l + '/**')));
  }

  let instructions = await fetchRepoFile(provider, repo, branch, '.docify/instructions.md', token);
  if (instructions != null) {
    sources.instructions = true;
    instructions = String(instructions).slice(0, 8000);
  }
  return { config, instructions: instructions || '', sources, errors };
}

/* ------------------------------ Glob matching ---------------------------- */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '(?:.*)'; i++; if (glob[i + 1] === '/') i++; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('.+^${}()|[]\\'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp('^(?:' + re + ')$');
}

function matchesAny(path, globs) {
  return globs.some((g) => {
    try { return globToRegExp(g).test(path) || globToRegExp(g).test(path.replace(/^\.\//, '')); }
    catch { return false; }
  });
}

// Does a file path fall inside the configured documentation scope?
// Used by generation to scope which repository files feed the AI.
export function passesScan(path, cfg) {
  const c = cfg || DEFAULT_CONFIG;
  if (c.scan.exclude.length && matchesAny(path, c.scan.exclude)) return false;
  if (c.scan.include.length && !matchesAny(path, c.scan.include)) return false;
  return true;
}

/* -------------------------- Stage 1: hard filters ------------------------- */
const LOCKFILES = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|go\.sum|cargo\.lock|poetry\.lock|gemfile\.lock|composer\.lock)$/i;
const MANIFESTS = /(^|\/)(package\.json|go\.mod|cargo\.toml|pyproject\.toml|requirements[^/]*\.txt|gemfile|composer\.json)$/i;
const TESTPATH = /(^|\/)(tests?|__tests__|spec|testdata|e2e|fixtures)(\/|$)|\.(test|spec)\.[a-z]+$|_test\.[a-z]+$/i;

export function commitType(message) {
  const m = String(message || '').match(/(?:^|\s)(feat|fix|perf|docs|chore|refactor|test|style|ci|build|revert)(?:\([^)]*\))?!?:/i);
  return m ? m[1].toLowerCase() : '';
}

/* ------------------------- Stage 2: surface extraction -------------------- */
const SURFACE_DETECTORS = [
  ['http_api',       /(^|\/)(openapi|swagger)[^/]*\.(ya?ml|json)$|(^|\/)(routes?|controllers?|handlers?|endpoints?)(\/|\.)/i, /endpoint|route|\bapi\b|request|response|paginat|refund|charge/i],
  ['public_api',     /(^|\/)(api|sdk|public|exports?)(\/|\.)|(^|\/)index\.(ts|js|py|go)$/i, /public api|export|signature|deprecat|breaking/i],
  ['cli',            /(^|\/)(cli|cmd|bin|commands?)(\/|\.)/i, /\bcli\b|command|flag|--[a-z-]{2,}/i],
  ['configuration',  /(^|\/)(config|settings|env)[^/]*(\/|\.)|\.env\.example$|(^|\/)defaults\.(json|ya?ml)$/i, /config|environment variable|env var|setting|default|timeout|quota|limit/i],
  ['error_messages', /(^|\/)(errors?|exceptions?)(\/|\.)/i, /error (code|message|envelope)|exception|status code|\b4\d\d\b|\b5\d\d\b/i],
  ['webhooks',       /(^|\/)(webhooks?|callbacks?|events?)(\/|\.)/i, /webhook|callback|signature|hmac|event/i],
  ['auth',           /(^|\/)(auth|oauth|identity|sessions?)(\/|\.)/i, /auth|token|api key|oauth|scope|permission|credential/i],
  ['ui',             /(^|\/)(components?|pages?|views?|screens?)(\/|\.)|\.(css|scss|vue|svelte)$/i, /button|screen|page|\bui\b|modal|banner|label/i]
];

export function extractSurfaces(commit) {
  const files = commit.files || [];
  const msg = String(commit.message || '');
  const surfaces = [];
  const evidence = {};
  for (const [id, pathRe, msgRe] of SURFACE_DETECTORS) {
    const hits = files.filter((f) => pathRe.test(f));
    const msgHit = msgRe.test(msg);
    if (hits.length || msgHit) {
      surfaces.push(id);
      evidence[id] = { files: hits.slice(0, 5), message: msgHit };
    }
  }
  return { surfaces, evidence };
}

/* ------------------------ Stage 3a: heuristic scoring --------------------- */
const TYPE_BASE = { feat: 78, fix: 62, perf: 45, docs: 32, revert: 55, chore: 25, refactor: 25, test: 20, style: 20, ci: 20, build: 22 };
const SURFACE_BONUS = { public_api: 18, http_api: 18, cli: 15, webhooks: 15, configuration: 14, error_messages: 12, auth: 12, ui: 10 };

export function heuristicScore(commit, surfaces) {
  const type = commitType(commit.message);
  let score = TYPE_BASE[type] ?? 50;
  let top = '';
  for (const s of surfaces) {
    score += SURFACE_BONUS[s] || 6;
    if (!top || (SURFACE_BONUS[s] || 0) > (SURFACE_BONUS[top] || 0)) top = s;
  }
  if (!surfaces.length) score -= 15;
  score = Math.max(2, Math.min(96, Math.round(score)));
  const category = top || 'general_change';
  const rationale = (type ? 'Commit type "' + type + '"' : 'No conventional-commit type')
    + (surfaces.length
      ? '; touches user-visible surface' + (surfaces.length > 1 ? 's' : '') + ': ' + surfaces.join(', ') + '.'
      : '; no user-visible surface detected in the changed paths or message.');
  return { score, category, rationale, confidence: surfaces.length ? 'medium' : 'low', engine: 'heuristic' };
}

/* --------------------------- Stage 3b: AI scoring ------------------------- */
async function classifyWithAI(commit, surfaces, evidence, cfg, instructions, key) {
  const sys = 'You judge whether a merged code change is CUSTOMER-FACING (needs customer documentation) or INTERNAL. '
    + 'Score 0-100: 90+ breaking change or new user capability; 70-89 visible behavior/parameter/config change; '
    + '40-69 edge-case visible; below 40 internal only. Respond with STRICT JSON only: '
    + '{"customer_impact":<int>,"category":"<one of ' + SURFACE_IDS.join('|') + '|general_change|internal>",'
    + '"summary":"<=140 chars","rationale":"<=200 chars","confidence":"high|medium|low"}';
  const user = [
    'Product: ' + (cfg.product.name || 'unknown') + (cfg.product.audience ? ' · audience: ' + cfg.product.audience : ''),
    'Commit message: ' + String(commit.message || '').slice(0, 300),
    'Changed files: ' + (commit.files || []).slice(0, 25).join(', '),
    'Detected surfaces: ' + (surfaces.join(', ') || 'none') + ' ' + JSON.stringify(evidence).slice(0, 500),
    commit.body && commit.body.length ? 'Change summary: ' + commit.body.join(' ').slice(0, 500) : '',
    instructions ? 'Repository documentation instructions:\n' + instructions.slice(0, 2500) : ''
  ].filter(Boolean).join('\n');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: 300, temperature: 0,
      system: sys, messages: [{ role: 'user', content: user }]
    })
  });
  if (!r.ok) throw new Error('classifier HTTP ' + r.status);
  const data = await r.json();
  const text = (((data || {}).content || [])[0] || {}).text || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('classifier returned no JSON');
  const out = JSON.parse(m[0]);
  const score = Math.max(0, Math.min(100, Math.round(Number(out.customer_impact))));
  if (!Number.isFinite(score)) throw new Error('classifier returned no score');
  return {
    score,
    category: String(out.category || 'general_change').slice(0, 40),
    rationale: String(out.rationale || out.summary || '').slice(0, 300),
    confidence: ['high', 'medium', 'low'].includes(out.confidence) ? out.confidence : 'medium',
    engine: 'ai'
  };
}

/* ------------------------------ The evaluator ----------------------------- */
// evaluateCommit(commit, { config, instructions }) → decision
// commit: { sha, message, author, files[], adds, dels, body? }
// decision: { verdict, score, category, rationale, stage, eliminatedBy,
//             surfaces[], confidence, engine }
export async function evaluateCommit(commit, { config, instructions = '' } = {}) {
  const cfg = config || DEFAULT_CONFIG;
  const files = (commit.files || []).map(String);
  const type = commitType(commit.message);
  const skip = (eliminatedBy, rationale) => ({
    verdict: 'skip', score: 0, category: 'internal', rationale,
    stage: 'rules', eliminatedBy, surfaces: [], confidence: 'high', engine: 'rules'
  });

  // Overrides first: explicitly protected paths always reach scoring.
  const forced = files.some((f) => matchesAny(f, cfg.rules.always_document_paths));

  const { surfaces, evidence } = extractSurfaces(commit);
  const strongSurface = surfaces.some((s) => ['public_api', 'http_api', 'cli', 'configuration', 'webhooks'].includes(s));

  if (!forced) {
    // Path scope
    if (files.length && cfg.scan.exclude.length && files.every((f) => matchesAny(f, cfg.scan.exclude))) {
      return skip('scan.exclude', 'Every changed file is excluded by the repository scan rules.');
    }
    if (files.length && cfg.scan.include.length && !files.some((f) => matchesAny(f, cfg.scan.include))) {
      return skip('scan.include', 'No changed file falls inside the configured documentation scope.');
    }
    // Dependency updates: lockfile/manifest-only diffs.
    if (cfg.rules.ignore_dependency_updates && files.length &&
        files.every((f) => LOCKFILES.test(f) || MANIFESTS.test(f))) {
      return skip('dependency_update', 'Only dependency manifests / lockfiles changed — no customer-visible behavior.');
    }
    // Test-only changes.
    if (files.length && files.every((f) => TESTPATH.test(f))) {
      return skip('test_only', 'Only test files changed — internal quality work, nothing customer-facing.');
    }
    // Conventional-commit type — a demotion, not a veto: a "refactor" that
    // still touches a strong user surface goes on to scoring.
    if (type && cfg.rules.ignore_commit_types.includes(type) && !strongSurface) {
      return skip('commit_type:' + type, 'Commit type "' + type + '" is configured as internal and no user-visible surface was touched.');
    }
    // document_only: if configured, require one of the listed surfaces.
    if (Array.isArray(cfg.rules.document_only) && cfg.rules.document_only.length &&
        !surfaces.some((s) => cfg.rules.document_only.includes(s))) {
      return skip('document_only', 'None of the configured documentable surfaces (' + cfg.rules.document_only.join(', ') + ') were touched.');
    }
  }

  // Stage 3 — impact scoring. Claude when available; heuristic fallback keeps
  // the pipeline fully functional (and explainable) without a key.
  let verdictInfo;
  const key = process.env.ANTHROPIC_API_KEY;
  if (key && process.env.RELEVANCE_AI !== 'off') {
    try {
      verdictInfo = await classifyWithAI(commit, surfaces, evidence, cfg, instructions, key);
    } catch (e) {
      console.error('relevance classifier fell back to heuristic:', e.message);
      verdictInfo = heuristicScore(commit, surfaces);
    }
  } else {
    verdictInfo = heuristicScore(commit, surfaces);
  }
  if (forced && verdictInfo.score < cfg.thresholds.auto_document) {
    verdictInfo.score = Math.max(verdictInfo.score, cfg.thresholds.auto_document);
    verdictInfo.rationale = 'Path is listed in always_document_paths. ' + verdictInfo.rationale;
  }

  const t = cfg.thresholds;
  const verdict = verdictInfo.score >= t.auto_document ? 'document'
    : verdictInfo.score >= t.discard_below ? 'review' : 'skip';
  return {
    verdict,
    score: verdictInfo.score,
    category: verdictInfo.category,
    rationale: verdictInfo.rationale,
    stage: verdictInfo.engine,
    eliminatedBy: verdict === 'skip' ? 'impact_below_threshold' : '',
    surfaces, confidence: verdictInfo.confidence, engine: verdictInfo.engine
  };
}

/* Starter files surfaced in the UI so teams can copy them into their repo. */
export const SAMPLE_YAML = `# docify.yaml — controls what Docify documents from this repository
version: 1

product:
  name: Your Product
  audience: "developers integrating the API"

scan:
  exclude:
    - "internal/**"
    - "**/*_test.*"
    - "scripts/**"

rules:
  ignore_commit_types: [chore, refactor, test, style, ci, build]
  ignore_dependency_updates: true
  always_document_paths:
    - "openapi/**"

thresholds:
  auto_document: 80   # ≥ 80 → documented automatically
  discard_below: 40   # < 40 → skipped (visible in Filtered out)
`;

export const SAMPLE_INSTRUCTIONS = `# Docify instructions for this repository

## Document
- Anything that changes what an API caller sends or receives
- New configuration options, changed defaults, changed limits
- Error codes a customer could encounter

## Never document
- Internal tooling, experiments, and anything under labs/
- Performance tuning that does not change behavior

## Voice
- Second person, present tense
- Our customers are backend developers
`;
