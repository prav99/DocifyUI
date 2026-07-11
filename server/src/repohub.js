/* ================= Repository hub: connect once, use everywhere =================
   One central registry of repositories (GitHub / GitLab / Bitbucket, public or
   private) plus reusable documentation RULE SETS. Every workflow — normal
   generation, automation pipelines, and Doc sync — resolves its effective
   configuration through this module, so rules are defined once and inherited:

     built-in defaults  →  assigned rule set  →  repo docify.yaml  →  workflow override

   Mounted behind requireAuth in api.js at /api/hub. */
import { Router } from 'express';
import { prisma } from './db.js';
import { freshToken } from './auth.js';
import { DEFAULT_CONFIG, mergeConfig, validateConfig, loadRepoConfig } from './adapters/relevance.js';

export const hubRouter = Router();

const j = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
const PROVIDERS = ['github', 'gitlab', 'bitbucket'];
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

/* ------------------------- Provider metadata check ------------------------ */
// Fetch repo metadata (existence, visibility, default branch). Never throws.
async function probeRepo(provider, repo, token) {
  const H = { 'User-Agent': 'DocGen' };
  if (token) H.Authorization = 'Bearer ' + token;
  try {
    let r, d;
    if (provider === 'gitlab') {
      r = await fetch('https://gitlab.com/api/v4/projects/' + encodeURIComponent(repo), { headers: H });
      if (!r.ok) return { ok: false, msg: 'HTTP ' + r.status };
      d = await r.json();
      return { ok: true, visibility: d.visibility === 'public' ? 'public' : 'private', branch: d.default_branch || 'main' };
    }
    if (provider === 'bitbucket') {
      r = await fetch('https://api.bitbucket.org/2.0/repositories/' + repo, { headers: H });
      if (!r.ok) return { ok: false, msg: 'HTTP ' + r.status };
      d = await r.json();
      return { ok: true, visibility: d.is_private ? 'private' : 'public', branch: (d.mainbranch && d.mainbranch.name) || 'main' };
    }
    r = await fetch('https://api.github.com/repos/' + repo, { headers: H });
    if (!r.ok) return { ok: false, msg: 'HTTP ' + r.status };
    d = await r.json();
    return { ok: true, visibility: d.private ? 'private' : 'public', branch: d.default_branch || 'main' };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
}

async function userToken(userId, provider) {
  try {
    const src = await prisma.source.findFirst({ where: { userId, provider } });
    if (src && src.token) return await freshToken(src);
  } catch { /* unauthenticated fallback */ }
  return '';
}

/* --------------------------- Built-in rule sets --------------------------- */
const STARTER_RULESETS = [
  {
    name: 'Customer-facing documentation',
    description: 'The balanced default: filters internal noise (deps, tests, refactors), documents everything users can see, call, or configure.',
    isDefault: true,
    config: {},
    instructions: ''
  },
  {
    name: 'Public API only',
    description: 'Strictest scope: only changes touching the public API, HTTP surface, or configuration produce documentation.',
    config: { rules: { document_only: ['public_api', 'http_api', 'configuration'] }, thresholds: { auto_document: 85, discard_below: 50 } },
    instructions: '## Document\n- Only externally callable APIs, endpoints, and configuration\n\n## Never document\n- UI-only changes, internal tooling, experiments'
  },
  {
    name: 'Internal engineering docs',
    description: 'Permissive: documents most changes including internals — for engineering handbooks and runbooks.',
    config: { rules: { ignore_commit_types: ['style', 'ci'] }, thresholds: { auto_document: 60, discard_below: 20 } },
    instructions: '## Audience\n- Internal engineers; implementation details are welcome'
  }
];

async function ensureStarterRuleSets(userId) {
  const count = await prisma.ruleSet.count({ where: { userId } });
  if (count > 0) return;
  for (const rs of STARTER_RULESETS) {
    await prisma.ruleSet.create({
      data: {
        userId, name: rs.name, description: rs.description,
        config: JSON.stringify(rs.config), instructions: rs.instructions,
        isDefault: !!rs.isDefault
      }
    }).catch(() => {});
  }
}

/* ----------------------- Effective configuration ---------------------------
   THE single resolution path used by every workflow. Layers, lowest first:
   1. built-in defaults   2. assigned (or default) rule set
   3. repository docify.yaml / .docifyignore / instructions.md
   4. explicit workflow override rule set (ruleSetId argument)               */
export async function resolveEffectiveConfig(userId, provider, repo, branch = 'main', { ruleSetId = '' } = {}) {
  const layers = [{ layer: 'defaults', applied: true }];
  let merged = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  let instructions = '';

  // Layer 2 — rule set: workflow override wins, else the repo's assignment,
  // else the user's default rule set.
  let rs = null;
  try {
    if (ruleSetId) rs = await prisma.ruleSet.findFirst({ where: { id: ruleSetId, userId } });
    if (!rs && repo) {
      const row = await prisma.repository.findFirst({ where: { userId, provider, repo } });
      if (row && row.ruleSetId) rs = await prisma.ruleSet.findFirst({ where: { id: row.ruleSetId, userId } });
    }
    if (!rs) rs = await prisma.ruleSet.findFirst({ where: { userId, isDefault: true } });
  } catch { /* rule sets are optional */ }
  if (rs) {
    merged = mergeConfig(j(rs.config, {}));
    if (rs.instructions) instructions = rs.instructions;
    layers.push({ layer: 'rule_set', name: rs.name, id: rs.id, applied: true, override: Boolean(ruleSetId) });
  } else {
    layers.push({ layer: 'rule_set', applied: false });
  }

  // Layer 3 — repository files (docify.yaml wins over the rule set for the
  // keys it defines; instructions are concatenated).
  let repoSources = { yaml: false, ignoreFile: false, instructions: false };
  let errors = [];
  if (repo && REPO_RE.test(repo)) {
    try {
      const token = await userToken(userId, provider);
      const rc = await loadRepoConfig(provider, repo, branch, token);
      repoSources = rc.sources;
      errors = rc.errors;
      if (rc.sources.yaml || rc.sources.ignoreFile) {
        // Overlay repo-defined keys on top of the rule-set-merged config.
        const overlay = rc.config;
        for (const k of ['scan', 'rules', 'thresholds', 'product']) {
          for (const [kk, vv] of Object.entries(overlay[k] || {})) {
            const isDefaultVal = JSON.stringify(DEFAULT_CONFIG[k][kk]) === JSON.stringify(vv);
            if (!isDefaultVal) merged[k][kk] = vv;
          }
        }
      }
      if (rc.instructions) instructions = [instructions, rc.instructions].filter(Boolean).join('\n\n');
      layers.push({ layer: 'repository_files', applied: rc.sources.yaml || rc.sources.ignoreFile || rc.sources.instructions, sources: rc.sources });
    } catch (e) {
      layers.push({ layer: 'repository_files', applied: false, error: e.message });
    }
  }

  const { config: finalConfig, errors: vErrors } = validateConfig(merged);
  return { config: finalConfig, instructions, layers, sources: repoSources, errors: [...errors, ...vErrors], ruleSet: rs ? { id: rs.id, name: rs.name } : null };
}

/* ------------------------------ Serializers ------------------------------- */
function serializeRepo(r, ruleSetNames = {}) {
  return {
    id: r.id, provider: r.provider, repo: r.repo, org: r.org, branch: r.branch,
    visibility: r.visibility, status: r.status, statusMsg: r.statusMsg,
    enabled: r.enabled, ruleSetId: r.ruleSetId,
    ruleSetName: r.ruleSetId ? (ruleSetNames[r.ruleSetId] || '') : '',
    lastCheck: r.lastCheck, createdAt: r.createdAt
  };
}

function serializeRuleSet(rs, usage = {}) {
  return {
    id: rs.id, name: rs.name, description: rs.description,
    config: j(rs.config, {}), instructions: rs.instructions,
    isDefault: rs.isDefault, version: rs.version,
    reposUsing: usage[rs.id] || 0,
    createdAt: rs.createdAt, updatedAt: rs.updatedAt
  };
}

/* ------------------------------ Repositories ------------------------------ */
// List with server-side search/filter/pagination — stays fast at hundreds.
hubRouter.get('/repositories', async (req, res) => {
  const where = { userId: req.uid };
  if (PROVIDERS.includes(String(req.query.provider))) where.provider = String(req.query.provider);
  if (['connected', 'unchecked', 'error'].includes(String(req.query.status))) where.status = String(req.query.status);
  if (req.query.enabled === 'true') where.enabled = true;
  if (req.query.enabled === 'false') where.enabled = false;
  if (req.query.org) where.org = String(req.query.org);
  if (req.query.ruleSetId) where.ruleSetId = String(req.query.ruleSetId);
  if (req.query.q) where.repo = { contains: String(req.query.q) };
  const page = Math.max(1, Number(req.query.page) || 1);
  const per = Math.min(100, Math.max(10, Number(req.query.per) || 25));
  const [total, rows, ruleSets, orgsRaw] = await Promise.all([
    prisma.repository.count({ where }),
    prisma.repository.findMany({ where, orderBy: [{ org: 'asc' }, { repo: 'asc' }], skip: (page - 1) * per, take: per }),
    prisma.ruleSet.findMany({ where: { userId: req.uid }, select: { id: true, name: true } }),
    prisma.repository.findMany({ where: { userId: req.uid }, select: { org: true }, distinct: ['org'] })
  ]);
  const names = Object.fromEntries(ruleSets.map((r) => [r.id, r.name]));
  res.json({
    total, page, per,
    orgs: orgsRaw.map((o) => o.org).filter(Boolean).sort(),
    repositories: rows.map((r) => serializeRepo(r, names))
  });
});

// Add one or many. Accepts owner/name, full URLs, one per line. Validation is
// LAZY by default (instant bulk import); pass verify=true to probe now.
hubRouter.post('/repositories', async (req, res) => {
  const b = req.body || {};
  const provider = PROVIDERS.includes(String(b.provider)) ? String(b.provider) : 'github';
  const verify = Boolean(b.verify);
  const raw = Array.isArray(b.repos) ? b.repos : String(b.repos || b.repo || '').split(/[\n,]+/);
  const wanted = [...new Set(raw
    .map((s) => String(s).trim()
      .replace(/^https?:\/\/(www\.)?(github\.com|gitlab\.com|bitbucket\.org)\//i, '')
      .replace(/\.git$/i, '').replace(/\/+$/, ''))
    .filter((s) => REPO_RE.test(s)))].slice(0, 200);
  if (!wanted.length) return res.status(400).json({ error: 'Provide at least one repository as owner/name or a full URL' });

  const token = verify ? await userToken(req.uid, provider) : '';
  const added = [];
  const skipped = [];
  for (const repo of wanted) {
    const exists = await prisma.repository.findFirst({ where: { userId: req.uid, provider, repo } });
    if (exists) { skipped.push(repo); continue; }
    let meta = { visibility: 'unknown', branch: String(b.branch || 'main'), status: 'unchecked', statusMsg: '' };
    if (verify) {
      const p = await probeRepo(provider, repo, token);
      meta = p.ok
        ? { visibility: p.visibility, branch: p.branch, status: 'connected', statusMsg: '' }
        : { visibility: 'unknown', branch: String(b.branch || 'main'), status: 'error', statusMsg: p.msg };
    }
    const row = await prisma.repository.create({
      data: {
        userId: req.uid, provider, repo, org: repo.split('/')[0],
        branch: meta.branch, visibility: meta.visibility,
        status: meta.status, statusMsg: meta.statusMsg,
        ruleSetId: String(b.ruleSetId || ''),
        lastCheck: verify ? new Date() : null
      }
    });
    added.push(serializeRepo(row));
  }
  res.status(201).json({ added: added.length, skipped, repositories: added });
});

// Bulk + single updates: enable/disable, assign rule set, change branch.
hubRouter.patch('/repositories', async (req, res) => {
  const b = req.body || {};
  const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
  if (!ids.length) return res.status(400).json({ error: 'Provide repository ids' });
  const data = {};
  if (typeof b.enabled === 'boolean') data.enabled = b.enabled;
  if (typeof b.ruleSetId === 'string') data.ruleSetId = b.ruleSetId;
  if (typeof b.branch === 'string' && b.branch.trim()) data.branch = b.branch.trim().slice(0, 80);
  if (!Object.keys(data).length) return res.status(400).json({ error: 'Nothing to update' });
  const out = await prisma.repository.updateMany({ where: { id: { in: ids }, userId: req.uid }, data });
  res.json({ updated: out.count });
});

hubRouter.delete('/repositories', async (req, res) => {
  const ids = Array.isArray((req.body || {}).ids) ? req.body.ids.map(String) : [];
  if (!ids.length) return res.status(400).json({ error: 'Provide repository ids' });
  const out = await prisma.repository.deleteMany({ where: { id: { in: ids }, userId: req.uid } });
  res.json({ removed: out.count });
});

// Health check — probe the provider, refresh visibility/branch/status.
hubRouter.post('/repositories/:id/check', async (req, res) => {
  const row = await prisma.repository.findFirst({ where: { id: req.params.id, userId: req.uid } });
  if (!row) return res.status(404).json({ error: 'Repository not found' });
  const token = await userToken(req.uid, row.provider);
  const p = await probeRepo(row.provider, row.repo, token);
  const updated = await prisma.repository.update({
    where: { id: row.id },
    data: p.ok
      ? { status: 'connected', statusMsg: '', visibility: p.visibility, branch: row.branch || p.branch, lastCheck: new Date() }
      : { status: 'error', statusMsg: p.msg || 'unreachable', lastCheck: new Date() }
  });
  res.json({ repository: serializeRepo(updated) });
});

/* -------------------------------- Rule sets ------------------------------- */
hubRouter.get('/rulesets', async (req, res) => {
  await ensureStarterRuleSets(req.uid);
  const [rows, repos] = await Promise.all([
    prisma.ruleSet.findMany({ where: { userId: req.uid }, orderBy: { createdAt: 'asc' } }),
    prisma.repository.findMany({ where: { userId: req.uid }, select: { ruleSetId: true } })
  ]);
  const usage = {};
  for (const r of repos) if (r.ruleSetId) usage[r.ruleSetId] = (usage[r.ruleSetId] || 0) + 1;
  res.json({ ruleSets: rows.map((rs) => serializeRuleSet(rs, usage)) });
});

hubRouter.post('/rulesets', async (req, res) => {
  const b = req.body || {};
  if (!String(b.name || '').trim()) return res.status(400).json({ error: 'A rule set needs a name' });
  const { errors } = validateConfig(b.config || {});
  if (errors.length) return res.status(400).json({ error: 'Configuration issues: ' + errors.join(' · ') });
  const row = await prisma.ruleSet.create({
    data: {
      userId: req.uid, name: String(b.name).trim().slice(0, 80),
      description: String(b.description || '').slice(0, 300),
      config: JSON.stringify(b.config || {}),
      instructions: String(b.instructions || '').slice(0, 8000)
    }
  });
  res.status(201).json({ ruleSet: serializeRuleSet(row) });
});

hubRouter.put('/rulesets/:id', async (req, res) => {
  const row = await prisma.ruleSet.findFirst({ where: { id: req.params.id, userId: req.uid } });
  if (!row) return res.status(404).json({ error: 'Rule set not found' });
  const b = req.body || {};
  const data = { version: row.version + 1 };
  if (typeof b.name === 'string' && b.name.trim()) data.name = b.name.trim().slice(0, 80);
  if (typeof b.description === 'string') data.description = b.description.slice(0, 300);
  if (typeof b.instructions === 'string') data.instructions = b.instructions.slice(0, 8000);
  if (b.config && typeof b.config === 'object') {
    const { errors } = validateConfig(b.config);
    if (errors.length) return res.status(400).json({ error: 'Configuration issues: ' + errors.join(' · ') });
    data.config = JSON.stringify(b.config);
  }
  if (typeof b.isDefault === 'boolean' && b.isDefault) {
    await prisma.ruleSet.updateMany({ where: { userId: req.uid }, data: { isDefault: false } });
    data.isDefault = true;
  }
  const updated = await prisma.ruleSet.update({ where: { id: row.id }, data });
  res.json({ ruleSet: serializeRuleSet(updated) });
});

hubRouter.post('/rulesets/:id/duplicate', async (req, res) => {
  const row = await prisma.ruleSet.findFirst({ where: { id: req.params.id, userId: req.uid } });
  if (!row) return res.status(404).json({ error: 'Rule set not found' });
  const copy = await prisma.ruleSet.create({
    data: {
      userId: req.uid, name: (row.name + ' (copy)').slice(0, 80),
      description: row.description, config: row.config, instructions: row.instructions
    }
  });
  res.status(201).json({ ruleSet: serializeRuleSet(copy) });
});

hubRouter.delete('/rulesets/:id', async (req, res) => {
  const row = await prisma.ruleSet.findFirst({ where: { id: req.params.id, userId: req.uid } });
  if (!row) return res.status(404).json({ error: 'Rule set not found' });
  if (row.isDefault) return res.status(400).json({ error: 'The default rule set cannot be deleted — mark another as default first' });
  await prisma.repository.updateMany({ where: { userId: req.uid, ruleSetId: row.id }, data: { ruleSetId: '' } });
  await prisma.ruleSet.delete({ where: { id: row.id } });
  res.json({ ok: true });
});

/* --------------------- Effective configuration preview -------------------- */
// The exact configuration a workflow will apply — with layer provenance.
hubRouter.get('/effective-config', async (req, res) => {
  let provider = String(req.query.provider || 'github');
  let repo = String(req.query.repo || '');
  let branch = String(req.query.branch || 'main');
  if (req.query.repoId) {
    const row = await prisma.repository.findFirst({ where: { id: String(req.query.repoId), userId: req.uid } });
    if (!row) return res.status(404).json({ error: 'Repository not found' });
    provider = row.provider; repo = row.repo; branch = row.branch;
  }
  const eff = await resolveEffectiveConfig(req.uid, provider, repo, branch, { ruleSetId: String(req.query.ruleSetId || '') });
  res.json({ provider, repo, branch, ...eff });
});
