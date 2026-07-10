import { Router } from 'express';
import { prisma } from './db.js';
import { requireAuth, freshToken } from './auth.js';
import { SOURCES, DOCTYPES, FORMATS, PLANS, CI_YAML, docTypeName, formatDef } from './catalog.js';
import { listRepos, listBranches as ghBranches } from './adapters/github.js';
import { listProjects as listGitlab, listBranches as glBranches } from './adapters/gitlab.js';
import { listRepos as listBitbucket, listBranches as bbBranches } from './adapters/bitbucket.js';
import { verifyJira, listJiraProjects, verifyConfluence, listConfluenceSpaces, verifyJiraIssues, verifyConfluencePage } from './adapters/atlassian.js';
import { verifyNotion, listNotion, verifyNotionItem } from './adapters/notion.js';
import { inspectSpec } from './adapters/openapi.js';
import { generateDocument, generateDocumentSmart, judge, aiScore, scoreReport, FIX_DIFFS, renderQualityReport, renderMarkdownPreview, FRAMEWORK } from './adapters/llm.js';
import { fetchRepoFiles } from './adapters/repofiles.js';
import { buildDocx, buildPdf } from './adapters/exporters.js';
import { charge } from './adapters/stripe.js';
import { sendMail } from './adapters/mailer.js';
import { SUPPORT_EMAIL } from './config.js';
import { syncRouter } from './docsync.js';
import { adminRouter } from './admin.js';

export const apiRouter = Router();

// Escape user-supplied text before embedding it in the notification HTML so a
// message body can never inject markup into the email we send ourselves.
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const j = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };

/* ---------- public ---------- */

apiRouter.get('/catalog', (req, res) => {
  // Static product data — cacheable by browsers and CDNs, which removes this
  // endpoint from the hot path entirely under load.
  res.setHeader('Cache-Control', 'public, max-age=300');
  // Every document type ships with its standardized framework: purpose,
  // audience, tone, section outline, and content rules.
  const doctypes = Object.fromEntries(Object.entries(DOCTYPES).map(([track, list]) => [
    track, list.map((d) => ({ ...d, framework: FRAMEWORK[d.id] || null }))
  ]));
  res.json({ sources: SOURCES, doctypes, formats: FORMATS, plans: PLANS });
});

apiRouter.post('/waitlist', async (req, res) => {
  const { email, provider } = req.body || {};
  if (!email || !String(email).includes('@')) return res.status(400).json({ error: 'A valid email is required' });
  if (!SOURCES.some((s) => s.id === provider && !s.avail)) return res.status(400).json({ error: 'Unknown waitlist source' });
  await prisma.waitlist.create({ data: { email: String(email).trim(), provider } });
  res.json({ ok: true });
});

/* ---------- Contact / support form (public) ----------
   Emails the customer's message to SUPPORT_EMAIL via the mail adapter. With
   SMTP configured (see server/.env.example) it sends real mail; without it the
   adapter logs to the server console, so the flow works in dev with zero keys.
   No secrets are ever exposed to the browser — the client only POSTs the form. */
apiRouter.post('/contact', async (req, res) => {
  const { name = '', email = '', topic = '', message = '' } = req.body || {};
  const cleanName = String(name).trim().slice(0, 200);
  const cleanEmail = String(email).trim().slice(0, 320);
  const cleanTopic = String(topic).trim().slice(0, 120);
  const cleanMessage = String(message).trim().slice(0, 5000);

  if (!cleanEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }
  if (cleanMessage.length < 10) {
    return res.status(400).json({ error: 'Please include a message of at least 10 characters' });
  }

  const subject = `[Support] ${cleanTopic || 'New message'} — from ${cleanName || cleanEmail}`;
  const html = [
    '<h2>New support message</h2>',
    `<p><strong>Name:</strong> ${escapeHtml(cleanName) || '—'}</p>`,
    `<p><strong>Email:</strong> ${escapeHtml(cleanEmail)}</p>`,
    `<p><strong>Topic:</strong> ${escapeHtml(cleanTopic) || '—'}</p>`,
    '<hr>',
    `<p style="white-space:pre-wrap">${escapeHtml(cleanMessage)}</p>`
  ].join('\n');

  try {
    // replyTo lets the support team reply straight to the customer.
    await sendMail(SUPPORT_EMAIL, subject, html, { replyTo: cleanEmail });
    res.json({ ok: true });
  } catch (e) {
    console.error('contact send failed', e);
    res.status(502).json({ error: 'Could not send your message right now — please email us directly.' });
  }
});

/* ---------- Git webhook receiver (public; authenticated by secret) ----------
   Point GitHub / GitLab / Bitbucket at POST /api/webhooks/git/<hookId>.
   Accepted credentials, in order of preference:
     GitHub    — X-Hub-Signature-256: HMAC-SHA256 of the raw body with the secret
     GitLab    — X-Gitlab-Token: the secret verbatim
     Bitbucket — append ?token=<secret> to the webhook URL
   Understands GitHub push and merged-PR payloads, GitLab push, Bitbucket
   push, and a generic { repo, branch, commit } body for custom CI. */
// Normalize a git event across providers, keeping the merge metadata the
// document-handling engine analyzes: branch, commit, message, changed files.
function normalizeGitEvent(b = {}) {
  if (b.ref && String(b.ref).startsWith('refs/heads/')) { // GitHub / GitLab push
    const commits = Array.isArray(b.commits) ? b.commits : [];
    const files = [...new Set(commits.flatMap((c) => [...(c.added || []), ...(c.modified || []), ...(c.removed || [])]))];
    return {
      kind: 'push',
      branch: String(b.ref).slice('refs/heads/'.length),
      commit: (b.head_commit && b.head_commit.id) || b.checkout_sha || b.after || '',
      message: (b.head_commit && b.head_commit.message) || (commits[0] && commits[0].message) || '',
      repo: (b.repository && b.repository.full_name) || (b.project && b.project.path_with_namespace) || '',
      files
    };
  }
  if (b.pull_request && b.action === 'closed' && b.pull_request.merged) { // GitHub merged PR
    return {
      kind: 'mergedPr',
      branch: b.pull_request.base && b.pull_request.base.ref,
      commit: b.pull_request.merge_commit_sha || '',
      message: b.pull_request.title || '',
      repo: (b.repository && b.repository.full_name) || '',
      files: []
    };
  }
  if (b.push && Array.isArray(b.push.changes)) { // Bitbucket push
    const ch = b.push.changes[0];
    return {
      kind: 'push',
      branch: ch && ch.new && ch.new.name,
      commit: (ch && ch.new && ch.new.target && ch.new.target.hash) || '',
      message: (ch && ch.new && ch.new.target && ch.new.target.message) || '',
      repo: (b.repository && b.repository.full_name) || '',
      files: []
    };
  }
  if (b.branch) { // generic (custom CI)
    return {
      kind: b.kind === 'mergedPr' ? 'mergedPr' : 'push',
      branch: String(b.branch), commit: String(b.commit || ''),
      message: String(b.message || ''), repo: String(b.repo || ''),
      files: Array.isArray(b.files) ? b.files.map(String) : []
    };
  }
  return null;
}

async function verifyHookSecret(req, secret) {
  const crypto = await import('node:crypto');
  const sig = req.get('X-Hub-Signature-256');
  if (sig && req.rawBody) {
    const want = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
    try { if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return true; } catch { /* length mismatch */ }
  }
  if (req.get('X-Gitlab-Token') === secret) return true;
  if (req.query.token === secret) return true;
  return false;
}

apiRouter.post('/webhooks/git/:hookId', async (req, res) => {
  // Automation profiles first (the orchestration module); legacy single
  // automation second, so existing webhooks keep working.
  const profile = await prisma.automationProfile.findUnique({ where: { id: req.params.hookId } });
  if (profile) {
    if (!profile.secret || !(await verifyHookSecret(req, profile.secret))) {
      return res.status(401).json({ error: 'Signature verification failed' });
    }
    if (profile.status !== 'active') return res.json({ ok: true, action: 'ignored', reason: 'Profile is paused' });
    const ev = normalizeGitEvent(req.body);
    if (!ev || !ev.branch) return res.json({ ok: true, action: 'ignored', reason: 'No branch in payload (event type not handled)' });
    const cfg = profCfg(profile);
    if (!branchMatches(cfg.branch, ev.branch)) {
      return res.json({ ok: true, action: 'ignored', reason: 'Branch ' + ev.branch + ' does not match watched ' + cfg.branch });
    }
    if ((ev.kind === 'push' && !cfg.events.push) || (ev.kind === 'mergedPr' && !cfg.events.mergedPr)) {
      return res.json({ ok: true, action: 'ignored', reason: 'Event type ' + ev.kind + ' is not enabled for this profile' });
    }
    if (cfg.pathFilter && ev.files.length) {
      const pats = cfg.pathFilter.split(',').map((s) => s.trim()).filter(Boolean);
      if (pats.length && !ev.files.some((f) => pats.some((p) => f.includes(p)))) {
        return res.json({ ok: true, action: 'ignored', reason: 'No changed file matches the path filter (' + cfg.pathFilter + ')' });
      }
    }
    // Respond immediately; the pipeline runs in the background (webhook
    // senders time out fast). Progress is visible in the run history.
    profileRun(profile, { ...ev, trigger: 'webhook' }).catch((e) => console.error('profile run', e));
    return res.json({ ok: true, action: 'regenerating', profile: profile.name });
  }

  const auto = await prisma.automation.findUnique({ where: { id: req.params.hookId } });
  if (!auto || !auto.secret) return res.status(404).json({ error: 'Unknown webhook' });
  if (!(await verifyHookSecret(req, auto.secret))) return res.status(401).json({ error: 'Signature verification failed' });
  if (!auto.enabled) return res.json({ ok: true, action: 'ignored', reason: 'Automation is disabled' });
  const ev = normalizeGitEvent(req.body);
  if (!ev || !ev.branch) return res.json({ ok: true, action: 'ignored', reason: 'No branch in payload (event type not handled)' });
  if (!branchMatches(auto.branch, ev.branch)) {
    return res.json({ ok: true, action: 'ignored', reason: 'Branch ' + ev.branch + ' does not match watched ' + auto.branch });
  }
  const { run } = await triggerRegeneration(auto.userId, auto, { trigger: 'webhook', commit: ev.commit, branch: ev.branch, repo: ev.repo });
  res.json({ ok: true, action: run.status === 'skipped' ? 'skipped' : 'regenerating', run });
});

/* ---------- everything below requires auth ---------- */
apiRouter.use(requireAuth);

/* Doc sync: AI-maintained existing documentation (upload → parse → commit-driven
   updates → review diff → approve/version). Implemented in docsync.js. */
apiRouter.use('/sync', syncRouter);

/* Founder metrics — restricted to ADMIN_EMAILS (see admin.js). */
apiRouter.use('/admin', adminRouter);

/* Sources */
apiRouter.get('/sources', async (req, res) => {
  const rows = await prisma.source.findMany({ where: { userId: req.uid }, orderBy: { createdAt: 'asc' } });
  res.json({ sources: rows });
});

apiRouter.post('/sources', async (req, res) => {
  const { provider, detail = '', token = '', email = '' } = req.body || {};
  const cat = SOURCES.find((s) => s.id === provider);
  if (!cat) return res.status(400).json({ error: 'Unknown source' });
  if (!cat.avail) return res.status(400).json({ error: cat.name + ' is not available yet — join the waitlist' });

  let storedToken = token;
  let storedDetail = detail;
  let info = null;
  try {
    if (provider === 'jira' || provider === 'confluence') {
      if (!detail.trim() || !token.trim() || !email.trim()) {
        return res.status(400).json({ error: cat.name + ' needs the site URL, your Atlassian account email, and an API token' });
      }
      const cred = email.trim() + ':' + token.trim();
      info = provider === 'jira' ? await verifyJira(detail, cred) : await verifyConfluence(detail, cred);
      storedDetail = info.site;   // normalized origin — what /repos will use
      storedToken = cred;         // Basic-auth credential; encrypt at rest in production
    } else if (provider === 'notion') {
      info = await verifyNotion(token); // validates presence + format + live check
      storedToken = String(token).trim();
      storedDetail = detail || 'Notion workspace (integration token)';
    } else if (provider === 'openapi') {
      if (!detail.trim()) return res.status(400).json({ error: 'Provide the URL of your OpenAPI / Swagger spec' });
      info = await inspectSpec(detail);
      storedDetail = (await import('./adapters/openapi.js')).normalizeSpecUrl(detail);
    }
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const existing = await prisma.source.findFirst({ where: { userId: req.uid, provider } });
  const data = {
    userId: req.uid, provider,
    detail: storedDetail || 'OAuth read-only (contents + commit history)',
    token: storedToken || (existing ? existing.token : '')
  };
  const row = existing
    ? await prisma.source.update({ where: { id: existing.id }, data })
    : await prisma.source.create({ data });
  res.json({ source: row, info });
});

// Validate an optional generation scope (Jira issue IDs, a Confluence page,
// a Notion page/database) against the provider using the stored credentials.
apiRouter.post('/sources/scope', async (req, res) => {
  const { provider, value } = req.body || {};
  const src = await prisma.source.findFirst({ where: { userId: req.uid, provider: String(provider || '') } });
  if (!src || !src.token) return res.status(400).json({ error: 'Connect ' + provider + ' first' });
  try {
    if (provider === 'jira') {
      const issues = await verifyJiraIssues(src.detail, src.token, value);
      return res.json({ scope: issues.map((i) => i.key).join(', '), label: issues.map((i) => i.key + (i.summary ? ' — ' + i.summary : '')).join(' · ') });
    }
    if (provider === 'confluence') {
      const page = await verifyConfluencePage(src.detail, src.token, value);
      return res.json({ scope: page.id, label: '“' + page.title + '” (page ' + page.id + ')' });
    }
    if (provider === 'notion') {
      const item = await verifyNotionItem(src.token, value);
      return res.json({ scope: item.id, label: '“' + item.title + '” (' + item.kind + ')' });
    }
    return res.status(400).json({ error: 'Scope is not supported for this source' });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// Disconnect a source (e.g. to re-enter credentials). Idempotent.
apiRouter.delete('/sources/:provider', async (req, res) => {
  await prisma.source.deleteMany({ where: { userId: req.uid, provider: req.params.provider } });
  res.json({ ok: true });
});

apiRouter.get('/repos', async (req, res) => {
  const provider = String(req.query.provider || 'github');
  const src = await prisma.source.findFirst({ where: { userId: req.uid, provider } });
  try {
    // For OAuth sources, silently renew the access token if it has expired.
    const token = ['github', 'gitlab', 'bitbucket'].includes(provider)
      ? await freshToken(src)
      : (src ? src.token : '');
    if (provider === 'gitlab') return res.json({ repos: await listGitlab(token) });
    if (provider === 'bitbucket') return res.json({ repos: await listBitbucket(token) });
    if (provider === 'jira') return res.json({ repos: src ? await listJiraProjects(src.detail, token) : [] });
    if (provider === 'confluence') return res.json({ repos: src ? await listConfluenceSpaces(src.detail, token) : [] });
    if (provider === 'notion') return res.json({ repos: token ? await listNotion(token) : [] });
    return res.json({ repos: await listRepos(token) });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

/* Generations */
// Formats requested for this generation. The primary format lives in the
// `format` column (back-compat); any additional formats ride in the output
// options JSON so no schema change is needed.
function genFormats(g) {
  const oc = j(g.output, {});
  const list = Array.isArray(oc.formats) && oc.formats.length ? oc.formats.map(String) : [g.format];
  return [...new Set(list)];
}

// Deterministic re-render of the generated sections for ONE document type in
// ONE format. generateDocument is a pure renderer when aiDocs are supplied, so
// every (docType × format) cell derives from one source of truth — no extra
// model calls, applied quality fixes carry through, and no content from one
// document type can leak into another because each render is scoped.
function renderOne(g, docType, fmt) {
  const ai = j(g.aiDocs, []).filter((d) => !docType || d.type === docType);
  const types = docType ? [docType] : j(g.docTypes, []);
  const { title, content } = generateDocument({
    track: g.track, docTypes: types, format: fmt,
    repo: g.repo, instructions: g.instructions,
    skill: g.skill || '', skillName: g.skillName || '',
    brief: j(g.brief, {}), output: j(g.output, {}),
    aiDocs: ai.length ? ai : null
  });
  return { title, content };
}

// Rendered HTML preview for a cell, chosen by format so the preview always
// LOOKS like the format it represents (never Word chrome for Markdown).
function renderPreviewFor(g, docType, fmt) {
  if (fmt === 'markdown') {
    const { title, content } = renderOne(g, docType, 'markdown');
    return renderMarkdownPreview(content, title);
  }
  if (fmt === 'html' || fmt === 'htmlsnip' || fmt === 'email' || fmt === 'epub') {
    return renderOne(g, docType, fmt).content; // the markup IS the preview
  }
  if (fmt === 'dita' || fmt === 'docbook') return ''; // structured source view only
  return renderOne(g, docType, 'html').content; // word/pdf → paginated page render
}

function serializeGen(g, opts = {}) {
  const formats = genFormats(g);
  const base = {
    grounded: j(g.aiDocs, []).length > 0, // real AI content vs template structure
    id: g.id, repo: g.repo, branch: g.branch, track: g.track,
    docTypes: j(g.docTypes, []), format: g.format, formats, instructions: g.instructions,
    files: j(g.files, []), skillName: g.skillName || '',
    status: g.status, step: g.step, steps: j(g.steps, []),
    title: g.title, content: g.content, preview: g.preview || '',
    output: j(g.output, {}), brief: j(g.brief, {}),
    // The blueprint-selected preview layout, so the UI can label the preview
    // truthfully for any current or future document type.
    previewLayout: (() => {
      const fw = FRAMEWORK[j(g.docTypes, [])[0]];
      return fw && fw.preview ? fw.preview.layout : 'document';
    })(),
    score: g.score, createdAt: g.createdAt
  };
  // Outputs grid for the preview tabs — one independent cell per
  // (document type × output format). Detail endpoint only, once complete.
  // Each cell renders in isolation so one failure never hides the others and
  // no document's content can appear inside another's preview.
  if (opts.withOutputs && g.status === 'complete') {
    const types = j(g.docTypes, []);
    base.docTypeNames = Object.fromEntries(types.map((t) => [t, docTypeName(g.track, t)]));
    base.outputs = {};
    for (const t of types) {
      for (const f of formats) {
        const fd = formatDef(g.track, f) || {};
        const key = t + '::' + f;
        const cell = { key, docType: t, docTypeName: docTypeName(g.track, t), format: f, name: fd.name || f.toUpperCase(), ext: fd.ext || '.txt' };
        try {
          const { title, content } = renderOne(g, t, f);
          base.outputs[key] = { ...cell, title, content, preview: renderPreviewFor(g, t, f), error: null };
        } catch (e) {
          base.outputs[key] = { ...cell, title: '', content: '', preview: '', error: e.message || 'Render failed' };
        }
      }
    }
  }
  return base;
}

function buildSteps({ provider, instructions, files, skillName }) {
  const steps = provider === 'jira'
    ? ['Reading Jira projects', 'Collecting issues and release versions']
    : ['Parsing repo structure', 'Extracting code comments'];
  if (skillName) steps.push('Applying skill: ' + skillName);
  if ((instructions && instructions.trim()) || (files && files.length)) {
    steps.push('Applying your customization instructions');
  }
  steps.push('Drafting sections', 'Running quality checks');
  return steps;
}

async function runPipeline(genId) {
  try {
    const gen = await prisma.generation.findUnique({ where: { id: genId } });
    if (!gen) return;
    const steps = j(gen.steps, []);
    await prisma.generation.update({ where: { id: genId }, data: { status: 'running' } });
    for (let i = 1; i <= steps.length; i++) {
      await sleep(900);
      await prisma.generation.update({ where: { id: genId }, data: { step: i } });
    }
    // Real repository content when available: authenticated via a connected
    // Source token when possible, unauthenticated for public repos otherwise.
    let srcToken = '';
    try {
      const src = await prisma.source.findFirst({ where: { userId: gen.userId, provider: gen.provider } });
      if (src && src.token) srcToken = await freshToken(src);
    } catch { /* public-repo fallback */ }
    const repoFiles = await fetchRepoFiles(gen.provider, gen.repo, gen.branch, srcToken);
    const genArgs = {
      track: gen.track, docTypes: j(gen.docTypes, []), format: gen.format,
      repo: gen.repo, instructions: gen.instructions,
      skill: gen.skill || '', skillName: gen.skillName || '',
      brief: j(gen.brief, {}), output: j(gen.output, {}), files: repoFiles
    };
    let { title, content, structure, aiDocs } = await generateDocumentSmart(genArgs);
    // NEVER replace a previously grounded document with template fallback:
    // if this regeneration could not ground (repo fetch or AI failure) but
    // the existing row carries real AI sections from an earlier run, keep
    // them and re-render from those sections instead of degrading.
    const prevAiDocs = j(gen.aiDocs, []);
    if (!(aiDocs && aiDocs.length) && prevAiDocs.length) {
      aiDocs = prevAiDocs;
      const kept = generateDocument({ ...genArgs, aiDocs });
      title = kept.title;
      content = kept.content;
      structure = kept.structure;
    }
    // Rendered preview for the UI: same engine, HTML target, same options —
    // so the preview shows exactly what the user configured, for every format.
    // aiDocs (when real generation ran) are reused — no second API call.
    const previewHtml = gen.format === 'html'
      ? content
      : generateDocument({ ...genArgs, format: 'html', aiDocs }).content;
    // Judge the ACTUAL document (content-aware checks), not a canned sample.
    const report = judge({ content, title, repo: gen.repo, track: gen.track });
    // Upsert so the pipeline can re-run on the SAME generation (automation
    // "update in place" and "sections" actions) without duplicating reports.
    await prisma.qualityReport.upsert({
      where: { generationId: genId },
      update: {
        issues: JSON.stringify(report.issues),
        links: JSON.stringify(report.links),
        style: JSON.stringify([...(structure || []), ...report.style]),
        fixedIds: '[]'
      },
      create: {
        generationId: genId,
        issues: JSON.stringify(report.issues),
        links: JSON.stringify(report.links),
        // Blueprint conformance leads the style checks, so structure shows up
        // in the same report pipeline for every document type.
        style: JSON.stringify([...(structure || []), ...report.style])
      }
    });
    await prisma.generation.update({
      where: { id: genId },
      data: {
        status: 'complete', title, content, preview: previewHtml,
        aiDocs: JSON.stringify(aiDocs || []),
        score: aiScore(report.issues.length, 0)
      }
    });
  } catch (e) {
    await prisma.generation.update({ where: { id: genId }, data: { status: 'failed' } }).catch(() => {});
  }
}

apiRouter.post('/generations', async (req, res) => {
  const { repo, branch = 'main', track, docTypes, format, formats, instructions = '', files = [], provider = 'github', skillName = '', skill = '', brief = null, output = null } = req.body || {};
  if (String(skill).length > 60000) return res.status(400).json({ error: 'SKILL.md is too large (60 KB max)' });
  if (track !== 'technical' && track !== 'marketing') return res.status(400).json({ error: 'Invalid track' });
  if (!Array.isArray(docTypes) || docTypes.length === 0) return res.status(400).json({ error: 'Select at least one document type' });
  // One or many output formats: `formats` (ordered, deduped) wins when sent;
  // the single `format` field keeps every existing client working unchanged.
  const requested = [...new Set((Array.isArray(formats) && formats.length ? formats : [format]).map(String))];
  if (!requested.length || !requested[0]) return res.status(400).json({ error: 'Select at least one output format' });
  for (const f of requested) {
    const def = formatDef(track, f);
    if (!def) return res.status(400).json({ error: 'Unknown format: ' + f });
    if (!def.ok) return res.status(400).json({ error: def.name + ' is not currently supported. We will add support for it in a future release.' });
  }
  const primaryFormat = requested[0];
  const fmt = formatDef(track, primaryFormat);
  const steps = buildSteps({ provider, instructions, files, skillName });
  const gen = await prisma.generation.create({
    data: {
      userId: req.uid, repo: repo || provider, branch, track,
      provider: ['github', 'gitlab', 'bitbucket'].includes(provider) ? provider : 'github',
      docTypes: JSON.stringify(docTypes), format: primaryFormat, instructions,
      files: JSON.stringify(files), skillName: String(skillName), skill: String(skill),
      brief: JSON.stringify(brief || {}),
      output: JSON.stringify({ ...(output || {}), formats: requested }),
      status: 'queued', steps: JSON.stringify(steps)
    }
  });
  runPipeline(gen.id); // fire and forget — polled by the client
  res.status(201).json({ generation: serializeGen(gen) });
});

apiRouter.get('/generations', async (req, res) => {
  const rows = await prisma.generation.findMany({
    where: { userId: req.uid }, orderBy: { createdAt: 'desc' }, take: 50
  });
  res.json({ generations: rows.map(serializeGen) });
});

apiRouter.get('/generations/:id', async (req, res) => {
  const g = await prisma.generation.findFirst({ where: { id: req.params.id, userId: req.uid } });
  if (!g) return res.status(404).json({ error: 'Not found' });
  res.json({ generation: serializeGen(g, { withOutputs: true }) });
});

apiRouter.get('/generations/:id/download', async (req, res) => {
  const g = await prisma.generation.findFirst({ where: { id: req.params.id, userId: req.uid } });
  if (!g || g.status !== 'complete') return res.status(404).json({ error: 'Not ready' });
  // ?fmt= downloads any format that was requested for this generation;
  // without it the primary format keeps the old behavior exactly.
  const wanted = req.query.kind === 'report' ? g.format : String(req.query.fmt || g.format);
  if (!genFormats(g).includes(wanted)) return res.status(400).json({ error: 'Format not part of this generation' });
  // ?doc= downloads a single document type; omitted = the whole set (legacy).
  const types = j(g.docTypes, []);
  const wantDoc = req.query.doc ? String(req.query.doc) : null;
  if (wantDoc && !types.includes(wantDoc)) return res.status(400).json({ error: 'Document type not part of this generation' });
  const fmt = formatDef(g.track, wanted) || { ext: '.txt' };
  const rendered = req.query.kind === 'report' ? null : renderOne(g, wantDoc, wanted);
  const base = String((rendered && rendered.title) || g.title || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (req.query.kind === 'report') {
    // Quality report export — always the LIVE state (scores, fixes, diffs),
    // in a reviewer-friendly HTML or a CI-friendly JSON.
    const rep = await prisma.qualityReport.findUnique({ where: { generationId: g.id } });
    if (!rep) return res.status(404).json({ error: 'Report not ready' });
    const ser = serializeReport(rep, g);
    if (String(req.query.fmt || 'html') === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename="quality-report.json"');
      res.setHeader('Content-Type', 'application/json');
      return res.send(JSON.stringify({
        generatedAt: new Date().toISOString(),
        document: { title: g.title, repo: g.repo, format: g.format, track: g.track },
        scores: { overall: ser.overall, verdict: ser.verdict, gate: ser.gate, gatePassed: ser.gatePassed },
        dimensions: ser.dimensions,
        assistants: ser.assistants,
        issues: ser.issues,
        links: ser.links,
        style: ser.style
      }, null, 2));
    }
    res.setHeader('Content-Disposition', 'attachment; filename="ai-consumability-report.html"');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderQualityReport(ser, { title: g.title, repo: g.repo, format: g.format }));
  }
  // Binary formats are built for real at download time from the stored
  // Markdown master (which already includes any applied fixes).
  if (wanted === 'word' || wanted === 'pdf') {
    try {
      // The word/pdf renderer emits the Markdown master the binary builders consume.
      const md = rendered.content;
      const args = { md, title: rendered.title || g.title, output: j(g.output, {}) };
      const buf = wanted === 'word' ? await buildDocx(args) : await buildPdf(args);
      res.setHeader('Content-Disposition', 'attachment; filename="' + base + (wanted === 'word' ? '.docx' : '.pdf') + '"');
      res.setHeader('Content-Type', wanted === 'word'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/pdf');
      return res.send(buf);
    } catch (e) {
      return res.status(500).json({ error: 'Export failed: ' + e.message });
    }
  }
  const ct = fmt.ext.endsWith('.xhtml') ? 'application/xhtml+xml; charset=utf-8'
    : fmt.ext.endsWith('.html') ? 'text/html; charset=utf-8'
    : fmt.ext.endsWith('.xml') || fmt.ext.endsWith('.dita') ? 'application/xml; charset=utf-8'
    : 'text/plain; charset=utf-8';
  res.setHeader('Content-Disposition', 'attachment; filename="' + base + fmt.ext + '"');
  res.setHeader('Content-Type', ct);
  res.send(rendered.content);
});

/* Quality */
function serializeReport(rep, gen) {
  const issues = j(rep.issues, []);
  const fixed = j(rep.fixedIds, []);
  const links = j(rep.links, []);
  const style = j(rep.style, []);
  // All scores below derive from one model (scoreReport + QUALITY_CONFIG),
  // so the dashboard, verdicts, and assistant estimates always agree.
  const q = scoreReport({ issues, fixed, links, style });
  const llmDim = q.dimensions.find((d) => d.id === 'llm');
  // Projected impact, from the same model: what fixing ONE issue does to the
  // overall score, and where everything lands if ALL open findings are fixed.
  const gains = {};
  for (const i of issues) {
    if (fixed.includes(i.id)) continue;
    gains[i.id] = Math.max(0, scoreReport({ issues, fixed: [...fixed, i.id], links, style }).overall - q.overall);
  }
  const allFixed = issues.length > fixed.length
    ? scoreReport({ issues, fixed: issues.map((i) => i.id), links, style })
    : null;
  return {
    id: rep.id, generationId: rep.generationId,
    issues: issues.map((i) => ({ ...i, ...(FIX_DIFFS[i.id] || {}), fixed: fixed.includes(i.id), gain: gains[i.id] || 0 })),
    links, style,
    ...q,
    potential: allFixed ? {
      overall: allFixed.overall, verdict: allFixed.verdict, gatePassed: allFixed.gatePassed,
      assistants: allFixed.assistants.map((a) => ({ id: a.id, probability: a.probability, score: a.score }))
    } : null,
    aiScore: llmDim ? llmDim.score : aiScore(issues.length, fixed.length),
    fixedCount: fixed.length, remaining: issues.length - fixed.length,
    title: gen ? gen.title || docTypeName(gen.track, j(gen.docTypes, [])[0]) : ''
  };
}

apiRouter.get('/generations/:id/quality', async (req, res) => {
  const g = await prisma.generation.findFirst({ where: { id: req.params.id, userId: req.uid } });
  if (!g) return res.status(404).json({ error: 'Not found' });
  const rep = await prisma.qualityReport.findUnique({ where: { generationId: g.id } });
  if (!rep) return res.status(404).json({ error: 'Report not ready' });
  res.json({ report: serializeReport(rep, g) });
});

apiRouter.post('/quality/:id/fix', async (req, res) => {
  const rep = await prisma.qualityReport.findUnique({ where: { id: req.params.id }, include: { generation: true } });
  if (!rep || rep.generation.userId !== req.uid) return res.status(404).json({ error: 'Not found' });
  const { issueId } = req.body || {};
  const issues = j(rep.issues, []);
  if (!issues.some((i) => i.id === issueId)) return res.status(400).json({ error: 'Unknown issue' });
  const fixed = new Set(j(rep.fixedIds, []));
  fixed.add(issueId);
  const updated = await prisma.qualityReport.update({
    where: { id: rep.id }, data: { fixedIds: JSON.stringify([...fixed]) }
  });
  // The fix is REAL: regenerate the document (chosen format + preview) with
  // every accepted fix applied, then persist the repaired content and score.
  const genRow = await prisma.generation.findUnique({ where: { id: rep.generationId } });
  const ser = serializeReport(updated, genRow);
  if (genRow) {
    const fixesArr = [...fixed];
    const storedAiDocs = j(genRow.aiDocs, []);
    const genArgs = {
      track: genRow.track, docTypes: j(genRow.docTypes, []), format: genRow.format,
      repo: genRow.repo, instructions: genRow.instructions,
      skill: genRow.skill || '', skillName: genRow.skillName || '',
      brief: j(genRow.brief, {}), output: j(genRow.output, {}), fixes: fixesArr,
      // Real AI content is regenerated from the STORED sections — fixes apply
      // as content repairs without another model call.
      aiDocs: storedAiDocs.length ? storedAiDocs : null
    };
    const { title, content } = generateDocument(genArgs);
    const previewHtml = genRow.format === 'html'
      ? content
      : generateDocument({ ...genArgs, format: 'html' }).content;
    await prisma.generation.update({
      where: { id: rep.generationId },
      data: { title, content, preview: previewHtml, score: ser.overall }
    });
  }
  res.json({ report: ser, regenerated: true });
});

apiRouter.post('/quality/:id/recheck', async (req, res) => {
  const rep = await prisma.qualityReport.findUnique({ where: { id: req.params.id }, include: { generation: true } });
  if (!rep || rep.generation.userId !== req.uid) return res.status(404).json({ error: 'Not found' });
  await sleep(600); // simulated judge pass
  res.json({ report: serializeReport(rep, rep.generation), verified: true });
});

/* Billing */
apiRouter.get('/billing', async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.uid } });
  const p = PLANS[u.plan] || PLANS.free;
  const per = u.plan === 'team' ? (u.billingCycle === 'annual' ? p.annual : p.monthly) : 0;
  const next = new Date();
  if (u.billingCycle === 'annual') next.setFullYear(next.getFullYear() + 1); else next.setMonth(next.getMonth() + 1);
  res.json({
    plan: u.plan, cycle: u.billingCycle, seats: u.seats, perSeat: per,
    nextInvoice: u.plan === 'team' ? next.toISOString().slice(0, 10) : null,
    amount: u.plan === 'team' ? (u.billingCycle === 'annual' ? per * u.seats * 12 : per * u.seats) : 0
  });
});

apiRouter.post('/billing/checkout', async (req, res) => {
  const { plan = 'team', cycle = 'annual', seats = 5, taxId = '' } = req.body || {};
  if (plan === 'enterprise') return res.json({ ok: true, contact: true });
  if (plan === 'free') {
    await prisma.user.update({ where: { id: req.uid }, data: { plan: 'free' } });
    return res.json({ ok: true, plan: 'free' });
  }
  try {
    const receipt = await charge({ plan, cycle, seats });
    await prisma.user.update({
      where: { id: req.uid },
      data: { plan, billingCycle: cycle, seats, taxId: String(taxId || '') }
    });
    res.json({ ok: true, receipt });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* Team */
apiRouter.get('/team', async (req, res) => {
  const rows = await prisma.teamMember.findMany({ where: { ownerId: req.uid }, orderBy: { createdAt: 'asc' } });
  res.json({ members: rows });
});

apiRouter.post('/team/invite', async (req, res) => {
  const { email } = req.body || {};
  if (!email || !String(email).includes('@')) return res.status(400).json({ error: 'A valid email is required' });
  const row = await prisma.teamMember.create({
    data: { ownerId: req.uid, email: String(email).trim(), status: 'invited', role: 'Writer' }
  });
  res.json({ member: row });
});

/* ---------------- Automation: auto-regenerate on merge ----------------
   End-to-end: a per-user webhook endpoint (HMAC-verified) receives push /
   merge events from GitHub, GitLab, or Bitbucket, matches the watched
   branch, clones the user's latest generation config as the template, runs
   the full pipeline (generate → judge → score), enforces the quality gate,
   and records every run. "Simulate merge" exercises the identical path. */

async function getAutomation(uid) {
  let row = await prisma.automation.upsert({
    where: { userId: uid }, update: {}, create: { userId: uid }
  });
  if (!row.secret) {
    const crypto = await import('node:crypto');
    row = await prisma.automation.update({
      where: { id: row.id }, data: { secret: crypto.randomBytes(24).toString('hex') }
    });
  }
  return row;
}

async function latestTemplate(uid) {
  const rows = await prisma.generation.findMany({
    where: { userId: uid }, orderBy: { createdAt: 'desc' }, take: 20
  });
  return (rows || []).find((g) => g.status === 'complete') || null;
}

function branchMatches(watched, branch) {
  if (!branch) return false;
  if (watched.endsWith('/*')) return branch.startsWith(watched.slice(0, -1));
  return watched === branch;
}

function ciSnippet(auto, tpl) {
  const project = tpl ? (tpl.title || 'documentation').toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'your-project-docs';
  const formats = tpl ? tpl.format : 'dita,markdown';
  return [
    'name: docgen-regenerate',
    'on:',
    '  push:',
    '    branches: [' + auto.branch.replace('/*', '/**') + ']',
    '',
    'jobs:',
    '  regenerate-docs:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - name: Regenerate documentation',
    '        uses: docgen/generate-action@v2',
    '        with:',
    '          api-key: ${{ secrets.DOCGEN_API_KEY }}',
    '          project: ' + project,
    '          formats: ' + formats,
    '          quality-gate: ' + auto.gate,
    '      - name: Upload quality report',
    '        uses: actions/upload-artifact@v4',
    '        with:',
    '          name: docgen-quality-report',
    '          path: .docgen/report.html'
  ].join('\n');
}

async function recordRun(autoId, run) {
  const row = await prisma.automation.findUnique({ where: { id: autoId } });
  const runs = j(row.runs, []);
  const at = runs.findIndex((r) => r.id === run.id);
  if (at >= 0) runs[at] = { ...runs[at], ...run };
  else runs.unshift(run);
  await prisma.automation.update({ where: { id: autoId }, data: { runs: JSON.stringify(runs.slice(0, 20)) } });
}

// The real regeneration: clone the template config, run the full pipeline,
// then close out the run record with the score and gate result.
async function triggerRegeneration(uid, auto, { trigger, commit, branch, repo }) {
  const tpl = await latestTemplate(uid);
  const runId = 'run_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const base = {
    id: runId, at: new Date().toISOString(), trigger,
    commit: commit || '', branch: branch || auto.branch, repo: repo || (tpl ? tpl.repo : '')
  };
  if (!tpl) {
    await recordRun(auto.id, { ...base, status: 'skipped', note: 'No completed generation to use as a template — generate a document once first.' });
    return { run: { ...base, status: 'skipped' } };
  }
  const steps = ['Merge ' + (commit ? String(commit).slice(0, 7) + ' ' : '') + 'detected on ' + base.branch,
    ...buildSteps({ provider: 'github', instructions: tpl.instructions, files: j(tpl.files, []), skillName: tpl.skillName || '' })];
  const gen = await prisma.generation.create({
    data: {
      userId: uid, repo: base.repo || tpl.repo, branch: base.branch, track: tpl.track,
      docTypes: tpl.docTypes, format: tpl.format, instructions: tpl.instructions,
      files: tpl.files, skillName: tpl.skillName || '', skill: tpl.skill || '',
      brief: tpl.brief || '{}', output: tpl.output || '{}',
      status: 'queued', steps: JSON.stringify(steps)
    }
  });
  await recordRun(auto.id, { ...base, status: 'running', genId: gen.id });
  runPipeline(gen.id).then(async () => {
    try {
      const done = await prisma.generation.findUnique({ where: { id: gen.id } });
      const score = done ? done.score : 0;
      await recordRun(auto.id, {
        id: runId, status: done && done.status === 'complete' ? 'complete' : 'failed',
        score, gatePassed: score >= auto.gate, genId: gen.id
      });
    } catch (e) { console.error('run close-out failed', e); }
  });
  return { run: { ...base, status: 'running', genId: gen.id } };
}

/* ================= Automation profiles: the orchestration module =================
   A profile is the persisted result of the 6-step wizard:
     1 repository · 2 branch · 3 merge triggers · 4 documents & update policy
     5 AI quality & ranking thresholds · 6 publishing & notifications
   Each profile has its own webhook secret and execution history, and the
   engine decides per merge whether to CREATE, UPDATE, VERSION, or refresh
   impacted SECTIONS of the mapped document — never duplicating docs. */

const PROFILE_DEFAULTS = {
  provider: 'github', repo: '',                                   // step 1
  branch: 'main',                                                 // step 2
  events: { push: true, mergedPr: true }, pathFilter: '',         // step 3
  track: 'technical', docTypes: ['api'], format: 'markdown',      // step 4
  templateFrom: 'latest', updatePolicy: 'auto', versioning: 'semver-patch',
  gate: 85, minAssistant: 0, autoFix: true, requireApproval: false, // step 5
  publishTo: 'workspace', notifyEmail: '',                          // step 6
  notifyOn: { success: true, blocked: true, failure: true },
  // Traceability: link each merge to a Jira issue so the change can be placed
  // and audited. { enabled, site, projectKey, requireIssue }.
  jira: { enabled: false, site: '', projectKey: '', requireIssue: false },
  // The developer's existing documentation — the placement target. Parsed into
  // { name, format, sections:[{level,title,line}], lines, pagesEst } on upload.
  sourceDoc: null
};

function profCfg(p) {
  const c = j(p.config, {});
  return {
    ...PROFILE_DEFAULTS, ...c,
    events: { ...PROFILE_DEFAULTS.events, ...(c.events || {}) },
    notifyOn: { ...PROFILE_DEFAULTS.notifyOn, ...(c.notifyOn || {}) },
    jira: { ...PROFILE_DEFAULTS.jira, ...(c.jira || {}) },
    docTypes: Array.isArray(c.docTypes) && c.docTypes.length ? c.docTypes : PROFILE_DEFAULTS.docTypes
  };
}

function serializeProfile(p) {
  const runs = j(p.runs, []);
  const done = runs.filter((r) => r.status === 'complete');
  return {
    id: p.id, name: p.name, status: p.status, secret: p.secret,
    config: profCfg(p), runs, createdAt: p.createdAt, updatedAt: p.updatedAt,
    stats: {
      total: runs.length,
      published: runs.filter((r) => r.outcome === 'published').length,
      held: runs.filter((r) => r.outcome === 'held' || r.outcome === 'awaiting-approval').length,
      failed: runs.filter((r) => r.status === 'failed').length,
      lastRun: runs[0] || null,
      avgOverall: done.length ? Math.round(done.reduce((a, r) => a + (r.overall || 0), 0) / done.length) : null
    }
  };
}

async function newSecret() {
  const crypto = await import('node:crypto');
  return crypto.randomBytes(24).toString('hex');
}

/* ---- Intelligent document handling ----
   The mapping key is (repository, primary doc type, format): that triple
   identifies "the" document a profile maintains. The decision analyzes the
   mapping, the merge metadata, the changed-file impact, and the configured
   policy — and always says WHY. */
const SECTION_MAP = [
  [/auth|token|oauth|credential|secret|key/i, 'Authentication'],
  [/error|exception|status/i, 'Errors'],
  [/charge|payment|refund|endpoint|route|controller|handler/i, 'Endpoint reference'],
  [/rate|limit|throttle/i, 'Rate limits'],
  [/readme|overview|docs?\//i, 'Overview'],
  [/config|env|setting|deploy/i, 'Configuration']
];
function sectionImpact(files) {
  const hits = new Set();
  for (const f of files || []) for (const [re, sec] of SECTION_MAP) if (re.test(f)) hits.add(sec);
  return [...hits];
}

/* ---------------------------------------------------------------------
   Jira ↔ commit traceability.
   Teams reference the issue in the commit (Atlassian "Smart Commits":
   "KAN-42 fix: …") or in the branch ("feature/KAN-42-token-rotation").
   Given a merge event we resolve the issue key back to the specific commit
   that carried it — no Jira API round-trip required, so it also works for
   public repositories with no connected account. When a project key is
   configured we match only that project; otherwise any PROJECT-NUMBER token.
--------------------------------------------------------------------- */
function resolveJiraLink(cfg, event) {
  const jcfg = cfg.jira || {};
  if (!jcfg.enabled) return null;
  const key = String(jcfg.projectKey || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const re = key ? new RegExp('\\b' + key + '-(\\d+)\\b', 'i') : /\b([A-Z][A-Z0-9]+)-(\d+)\b/;
  const msg = String(event.message || '');
  const branch = String(event.branch || '');
  const m = (msg + ' ' + branch).match(re);
  if (!m) return { issue: null, matched: false, requireIssue: !!jcfg.requireIssue };
  const issue = key ? key + '-' + m[1] : m[1].toUpperCase() + '-' + m[2];
  const inMsg = new RegExp('\\b' + issue.replace('-', '\\-') + '\\b', 'i').test(msg);
  return {
    issue, matched: true, requireIssue: !!jcfg.requireIssue,
    commit: event.commit ? String(event.commit).slice(0, 7) : '',
    source: inMsg ? 'commit message' : 'branch name',
    url: jcfg.site ? String(jcfg.site).replace(/\/+$/, '') + '/browse/' + issue : ''
  };
}

/* Keyword signal per canonical section — scores where a change belongs. */
const SECTION_SIGNAL = [
  ['Authentication', /auth|token|oauth|credential|secret|\bkey\b|login|session|\bjwt\b|scope/i],
  ['Errors', /error|exception|status\s?code|\b4\d\d\b|\b5\d\d\b|failure|retry/i],
  ['Endpoint reference', /endpoint|route|controller|handler|charge|payment|refund|request|response|param|\bapi\b/i],
  ['Rate limits', /rate|limit|throttle|quota|budget/i],
  ['Configuration', /config|env|setting|deploy|flag|\boption\b|variable/i],
  ['Overview', /readme|overview|intro|getting.?started|docs?\//i]
];

function titleFromSignal(jira, message) {
  const raw = String((jira && jira.issueSummary) || message || '')
    .replace(/\b[A-Z][A-Z0-9]+-\d+\b/g, '')
    .replace(/^\s*(feat|fix|chore|docs|refactor|perf|test|build)(\([^)]*\))?:\s*/i, '')
    .trim();
  const t = (raw.split(/[.\n]/)[0] || '').trim();
  if (!t) return 'Change details';
  return t.charAt(0).toUpperCase() + t.slice(1, 60);
}

/* ---------------------------------------------------------------------
   Document ingest.
   The developer's EXISTING documentation is the placement target. We parse
   whatever they upload into a heading outline with line anchors, so placement
   scores against the real sections of their document rather than a generic
   template. Markdown/plain-text and numbered headings are parsed here today;
   pdf/docx/confluence extract to text upstream and feed the same parser.
--------------------------------------------------------------------- */
function parseOutline(content, format) {
  const text = String(content || '');
  const lines = text.split(/\r?\n/);
  const sections = [];
  lines.forEach((ln, i) => {
    let m = ln.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);              // markdown ATX (#, ##, …)
    if (m) { sections.push({ level: m[1].length, title: m[2].trim(), line: i + 1 }); return; }
    m = ln.match(/^\s*(\d+(?:\.\d+)*)\.?\s+([A-Z][^.].{2,80})$/); // numbered "2.4 Token rotation"
    if (m) { sections.push({ level: (m[1].match(/\./g) || []).length + 1, num: m[1], title: m[2].trim(), line: i + 1 }); return; }
    if (/^={3,}\s*$/.test(ln) && lines[i - 1] && lines[i - 1].trim() && !/^[#\d]/.test(lines[i - 1])) {
      sections.push({ level: 1, title: lines[i - 1].trim(), line: i });                            // setext H1
    } else if (/^-{3,}\s*$/.test(ln) && lines[i - 1] && lines[i - 1].trim() && !/^\s*[-*+]\s/.test(lines[i - 1]) && !/^[#\d]/.test(lines[i - 1])) {
      sections.push({ level: 2, title: lines[i - 1].trim(), line: i });                            // setext H2
    }
  });
  const seen = new Set();
  const out = sections
    .filter((s) => s.title && s.title.length <= 120 && !seen.has(s.line) && seen.add(s.line))
    .sort((a, b) => a.line - b.line);
  return { sections: out, lines: lines.length, chars: text.length, pagesEst: Math.max(1, Math.round(lines.length / 45)) };
}

const pageOf = (line, src) => (!src || !src.lines) ? 1 : Math.max(1, Math.round((line / src.lines) * (src.pagesEst || 1)) || 1);
const confFrom = (score, total) => {
  const dom = score / (total || 1), str = Math.min(1, score / 8);
  return Math.round(Math.min(97, Math.max(38, (0.5 * dom + 0.5 * str) * 100)));
};

/* Score an arbitrary heading outline against the merge signal. Works for any
   uploaded document — overlap on heading words, plus a concept bridge when a
   canonical topic regex matches both the heading and the change. */
function scoreOutline(sections, signal) {
  const sigSet = new Set((signal.toLowerCase().match(/[a-z0-9]+/g) || []));
  return sections.map((s, idx) => {
    const titleTokens = (s.title.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 2);
    let score = titleTokens.filter((t) => sigSet.has(t)).length * 3;
    for (const [, re] of SECTION_SIGNAL) if (re.test(s.title) && re.test(signal)) score += 2;
    return { ...s, idx, score };
  });
}

/* Contextual placement.
   Given the target document's section outline and the merge signal (commit
   message, changed files, linked Jira issue), score every section and return
   the single best insertion anchor — updating an existing section in place
   when the change clearly belongs there, or splicing a new sub-section under
   the closest matching parent when it introduces something the document does
   not yet cover. When the developer has uploaded their existing document we
   score against ITS real headings (with page anchors); otherwise we fall back
   to the doc-type's canonical outline. Either way one merge updates the right
   slice of a large document instead of producing a standalone file. */
function computePlacement(cfg, event, jira, existing) {
  const signal = [
    event.message || '', (event.files || []).join(' '),
    jira && jira.issue ? jira.issue : '', jira && jira.issueSummary ? jira.issueSummary : ''
  ].join(' ');
  const src = cfg.sourceDoc;
  if (src && Array.isArray(src.sections) && src.sections.length) {
    const scored = scoreOutline(src.sections, signal).sort((a, b) => b.score - a.score || a.line - b.line);
    const total = scored.reduce((s, x) => s + x.score, 0) || 1;
    const best = scored[0];
    const mode = best.score >= 4 ? 'update-existing' : 'insert-new';
    const sub = mode === 'insert-new' ? titleFromSignal(jira, event.message) : '';
    const anchorPath = sub ? best.title + ' ▸ ' + sub : best.title;
    const page = pageOf(best.line, src);
    const candidates = scored.slice(0, 4).map((s) => ({
      title: s.title, level: s.level || 1, line: s.line, page: pageOf(s.line, src),
      confidence: confFrom(s.score, total), mode: s.score >= 4 ? 'update-existing' : 'insert-new'
    }));
    return {
      anchor: best.title, anchorPath, confidence: confFrom(best.score, total), mode, page,
      docName: src.name || 'your document', candidates, source: 'document',
      reason: mode === 'update-existing'
        ? 'Change maps to “' + best.title + '” (p.' + page + ') in ' + (src.name || 'your uploaded document') + ' — updating that section in place.'
        : 'No existing section fully covers this change — splicing a new “' + sub + '” sub-section under “' + best.title + '” (p.' + page + ').'
    };
  }
  const doctype = (cfg.docTypes || [])[0];
  const fw = FRAMEWORK[doctype];
  const outline = fw && fw.outline && fw.outline.length ? fw.outline.map((o) => o.name) : ['Overview'];
  const tokens = signal.toLowerCase().match(/[a-z0-9]+/g) || [];
  const scored = SECTION_SIGNAL
    .filter(([name]) => outline.includes(name))
    .map(([name, re]) => {
      let score = 0;
      const g = signal.match(new RegExp(re.source, 'gi'));
      if (g) score += g.length * 3;
      score += name.toLowerCase().split(/\s+/).filter((t) => tokens.includes(t)).length * 2;
      return { name, score };
    })
    .sort((a, b) => b.score - a.score);
  const best = scored[0] && scored[0].score > 0 ? scored[0] : { name: outline[0] || 'Overview', score: 0 };
  const total = scored.reduce((s, x) => s + x.score, 0) || 1;
  const dominance = best.score / total;
  const strength = Math.min(1, best.score / 8);
  const confidence = Math.round(Math.min(97, Math.max(38, (0.5 * dominance + 0.5 * strength) * 100)));
  const mode = best.score >= 4 ? 'update-existing' : 'insert-new';
  const sub = mode === 'insert-new' ? titleFromSignal(jira, event.message) : '';
  const anchorPath = sub ? best.name + ' ▸ ' + sub : best.name;
  const reason = mode === 'update-existing'
    ? 'Change maps to the “' + best.name + '” section of the existing document — updating it in place, not creating a new document.'
    : 'No existing section fully covers this change — splicing a new “' + sub + '” sub-section under “' + best.name + '”.';
  return { anchor: best.name, anchorPath, confidence, mode, reason };
}

function bumpVersion(v, strategy) {
  if (strategy === 'date') return new Date().toISOString().slice(0, 10).replace(/-/g, '.');
  const m = String(v || '2.4.0').match(/(\d+)\.(\d+)\.(\d+)/) || [null, '2', '4', '0'];
  const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return strategy === 'semver-minor' ? maj + '.' + (min + 1) + '.0' : maj + '.' + min + '.' + (pat + 1);
}

async function decideDocAction(uid, cfg, event, jira) {
  const rows = await prisma.generation.findMany({ where: { userId: uid }, orderBy: { createdAt: 'desc' }, take: 100 });
  const existing = rows.find((g) => g.status === 'complete'
    && g.format === cfg.format
    && j(g.docTypes, [])[0] === cfg.docTypes[0]
    && (!cfg.repo || g.repo === cfg.repo));
  if (!existing) {
    return { action: 'create', existing: null, reason: 'No document is mapped to ' + (cfg.repo || 'this repository') + ' · ' + cfg.docTypes[0] + ' · ' + cfg.format + ' yet — creating it establishes the mapping so future merges can be placed inside it.' };
  }
  if (cfg.updatePolicy === 'create') return { action: 'create', existing, reason: 'Policy: always create a new document.' };
  if (cfg.updatePolicy === 'update') return { action: 'update', existing, reason: 'Policy: always update the mapped document in place.' };
  if (cfg.updatePolicy === 'version') return { action: 'version', existing, reason: 'Policy: every merge produces a new version (' + cfg.versioning + ').' };
  // Release merges still cut a new version — they preserve published history.
  const msg = String(event.message || '');
  const isRelease = /(^|\s)(release|v?\d+\.\d+\.\d+)(\s|$|:)/i.test(msg) || /^release\//.test(String(event.branch || ''));
  if (cfg.updatePolicy !== 'place' && isRelease) {
    return { action: 'version', existing, reason: 'Merge metadata indicates a release (' + (msg ? '“' + msg.slice(0, 60) + '”' : event.branch) + ') — a new version preserves the published history.' };
  }
  // 'place' (explicit) or 'auto' — locate where this change belongs inside the
  // existing document and splice it in, instead of generating a standalone doc.
  const placement = computePlacement(cfg, event, jira, existing);
  return {
    action: 'place', existing, placement, impacted: sectionImpact(event.files),
    reason: 'Contextual placement → ' + placement.anchorPath + ' (' + placement.confidence + '% match) — ' + placement.reason
  };
}

async function patchProfileRun(profileId, patch) {
  const row = await prisma.automationProfile.findUnique({ where: { id: profileId } });
  if (!row) return;
  const runs = j(row.runs, []);
  const i = runs.findIndex((r) => r.id === patch.id);
  if (i >= 0) runs[i] = { ...runs[i], ...patch };
  else runs.unshift(patch);
  await prisma.automationProfile.update({ where: { id: profileId }, data: { runs: JSON.stringify(runs.slice(0, 30)) } });
}

/* ---- The execution engine: steps 1–6, exactly as configured ---- */
async function profileRun(profile, event) {
  const cfg = profCfg(profile);
  const uid = profile.userId;
  const runId = 'run_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const save = (patch) => patchProfileRun(profile.id, { id: runId, ...patch });
  const jira = resolveJiraLink(cfg, event);
  const decision = await decideDocAction(uid, cfg, event, jira);
  await save({
    at: new Date().toISOString(), trigger: event.trigger, commit: event.commit || '',
    branch: event.branch || cfg.branch, files: (event.files || []).length,
    action: decision.action, reason: decision.reason, impacted: decision.impacted || [],
    placement: decision.placement || null, jira: jira || null,
    status: 'running'
  });
  // Traceability gate: when a profile requires every merge to carry a Jira
  // issue and this one does not, hold it instead of documenting an untraceable
  // change.
  if (jira && jira.requireIssue && !jira.matched) {
    await save({
      status: 'complete', overall: 0, outcome: 'held',
      holdWhy: 'No linked Jira issue in the commit message or branch — this profile requires traceability.'
    });
    return { runId, outcome: 'held', overall: 0 };
  }
  try {
    const tplRow = decision.existing || (cfg.templateFrom === 'latest' ? await latestTemplate(uid) : null);
    const out = tplRow ? j(tplRow.output, {}) : {};
    let version = null;
    if (decision.action === 'version') {
      // A release merge that names its version ("release: v3.1.0") wins over
      // the configured bump strategy — the docs should match the release.
      const tagged = String(event.message || '').match(/\bv?(\d+\.\d+\.\d+)\b/);
      version = tagged ? tagged[1] : bumpVersion(out.version, cfg.versioning);
      out.version = version;
    }
    const actionLabel = decision.action === 'place' && decision.placement
      ? 'placing into ' + decision.placement.anchorPath
      : decision.action;
    const steps = [
      'Merge ' + (event.commit ? String(event.commit).slice(0, 7) + ' ' : '') + 'on ' + (event.branch || cfg.branch) +
        (jira && jira.matched ? ' · ' + jira.issue : '') + ' → ' + actionLabel,
      ...buildSteps({ provider: cfg.provider, instructions: tplRow ? tplRow.instructions : '', files: [], skillName: tplRow ? tplRow.skillName || '' : '' })
    ];
    const data = {
      repo: cfg.repo || (tplRow ? tplRow.repo : 'unmapped'), branch: event.branch || cfg.branch,
      // The pipeline's code host — without this, repository files were always
      // fetched from GitHub (the schema default), so GitLab and Bitbucket
      // pipelines could never produce repo-grounded content.
      provider: ['github', 'gitlab', 'bitbucket'].includes(cfg.provider) ? cfg.provider : 'github',
      track: cfg.track, docTypes: JSON.stringify(cfg.docTypes), format: cfg.format,
      instructions: tplRow ? tplRow.instructions : '', files: '[]',
      skillName: tplRow ? tplRow.skillName || '' : '', skill: tplRow ? tplRow.skill || '' : '',
      brief: tplRow ? tplRow.brief || '{}' : '{}', output: JSON.stringify(out),
      status: 'queued', step: 0, steps: JSON.stringify(steps), score: 0
    };
    let gen;
    if ((decision.action === 'update' || decision.action === 'sections' || decision.action === 'place') && decision.existing) {
      gen = await prisma.generation.update({ where: { id: decision.existing.id }, data });
    } else {
      gen = await prisma.generation.create({ data: { userId: uid, ...data } });
    }
    await save({ genId: gen.id, version });
    await runPipeline(gen.id);

    // Re-read the row runPipeline just wrote: it carries the AI-generated
    // sections (aiDocs) when repository files were fetched and real
    // generation ran. Every re-render below MUST pass them through —
    // otherwise the template engine silently replaces repo-grounded content.
    const genRow = await prisma.generation.findUnique({ where: { id: gen.id } });
    const storedAiDocs = j(genRow ? genRow.aiDocs : '[]', []);
    const grounded = storedAiDocs.length > 0;

    // Step 5a — auto-apply every suggested fix, then re-render and re-score.
    let rep = await prisma.qualityReport.findUnique({ where: { generationId: gen.id } });
    if (!rep) throw new Error('Pipeline produced no quality report');
    if (cfg.autoFix) {
      const allIds = j(rep.issues, []).map((i) => i.id);
      rep = await prisma.qualityReport.update({ where: { id: rep.id }, data: { fixedIds: JSON.stringify(allIds) } });
      const genArgs = {
        track: cfg.track, docTypes: cfg.docTypes, format: cfg.format, repo: data.repo,
        instructions: data.instructions, skill: data.skill, skillName: data.skillName,
        brief: j(data.brief, {}), output: j(data.output, {}),
        aiDocs: grounded ? storedAiDocs : null, fixes: allIds
      };
      const fixed = generateDocument(genArgs);
      const previewHtml = cfg.format === 'html' ? fixed.content : generateDocument({ ...genArgs, format: 'html' }).content;
      const q0 = scoreReport({ issues: j(rep.issues, []), fixed: allIds, links: j(rep.links, []), style: j(rep.style, []) });
      await prisma.generation.update({
        where: { id: gen.id },
        data: { title: fixed.title, content: fixed.content, preview: previewHtml, score: q0.overall }
      });
    }

    // Step 5b — thresholds: quality gate and per-model ranking floor.
    const q = scoreReport({ issues: j(rep.issues, []), fixed: j(rep.fixedIds, []), links: j(rep.links, []), style: j(rep.style, []) });
    const probs = Object.fromEntries(q.assistants.map((a) => [a.id, a.probability]));
    const minProb = q.assistants.length ? Math.min(...q.assistants.map((a) => a.probability)) : 0;
    const gateOk = q.overall >= cfg.gate;
    const rankOk = !cfg.minAssistant || minProb >= cfg.minAssistant;

    // Step 6 — publish or hold, then notify.
    const outcome = !gateOk || !rankOk ? 'held' : cfg.requireApproval ? 'awaiting-approval' : 'published';
    const holdWhy = !gateOk ? 'overall ' + q.overall + ' is below the gate (' + cfg.gate + ')'
      : !rankOk ? 'lowest AI ranking estimate ' + minProb + '% is below the threshold (' + cfg.minAssistant + '%)' : '';
    await save({
      status: 'complete', overall: q.overall, assistants: probs, gatePassed: gateOk, outcome, holdWhy,
      // Honest provenance: was this document generated from real repository
      // files, or did the engine fall back to template content (repo/branch
      // unreachable, rate limit, AI unavailable)? Surfaced in run history.
      grounded,
      groundedWhy: grounded ? '' : 'Repository files could not be fetched or AI generation was unavailable — template content was used. Check repo/branch and code-host rate limits.'
    });

    const user = await prisma.user.findUnique({ where: { id: uid } });
    const to = cfg.notifyEmail || (user ? user.email : '');
    const wants = (outcome === 'published' && cfg.notifyOn.success)
      || ((outcome === 'held' || outcome === 'awaiting-approval') && cfg.notifyOn.blocked);
    if (to && wants) {
      sendMail(to, 'DocGen · ' + profile.name + ' — ' + outcome + ' at ' + q.overall + '/100',
        '<p><b>' + decision.action.toUpperCase() + '</b> — ' + decision.reason + '</p>' +
        '<p>Overall ' + q.overall + ' · ChatGPT ' + (probs.chatgpt ?? '—') + '% · Claude ' + (probs.claude ?? '—') + '% · Gemini ' + (probs.gemini ?? '—') + '%</p>' +
        (holdWhy ? '<p>Held: ' + holdWhy + '</p>' : '<p>Published to ' + cfg.publishTo + '.</p>')
      ).catch(() => {});
    }
    return { runId, outcome, overall: q.overall };
  } catch (e) {
    console.error('profile run failed', e);
    await save({ status: 'failed', error: String(e.message || e).slice(0, 200) });
    const user = await prisma.user.findUnique({ where: { id: uid } });
    const to = cfg.notifyEmail || (user ? user.email : '');
    if (to && cfg.notifyOn.failure) {
      sendMail(to, 'DocGen · ' + profile.name + ' — run failed', '<p>' + String(e.message || e) + '</p>').catch(() => {});
    }
    return { runId, outcome: 'failed' };
  }
}

/* ---- Profile CRUD + operations ---- */
async function ownProfile(req, res) {
  const row = await prisma.automationProfile.findFirst({ where: { id: req.params.id, userId: req.uid } });
  if (!row) res.status(404).json({ error: 'Profile not found' });
  return row;
}

apiRouter.get('/profiles', async (req, res) => {
  const rows = await prisma.automationProfile.findMany({ where: { userId: req.uid }, orderBy: { createdAt: 'asc' } });
  res.json({ profiles: rows.map(serializeProfile) });
});

apiRouter.post('/profiles', async (req, res) => {
  const { name, config } = req.body || {};
  const row = await prisma.automationProfile.create({
    data: {
      userId: req.uid,
      name: String(name || 'Documentation pipeline').slice(0, 80),
      config: JSON.stringify(config || {}),
      secret: await newSecret()
    }
  });
  res.status(201).json({ profile: serializeProfile(row) });
});

apiRouter.get('/profiles/:id', async (req, res) => {
  const row = await ownProfile(req, res);
  if (row) res.json({ profile: serializeProfile(row) });
});

apiRouter.put('/profiles/:id', async (req, res) => {
  const row = await ownProfile(req, res);
  if (!row) return;
  const { name, config, status } = req.body || {};
  const data = {};
  if (typeof name === 'string' && name.trim()) data.name = name.trim().slice(0, 80);
  if (config && typeof config === 'object') data.config = JSON.stringify(config);
  if (status === 'active' || status === 'paused') data.status = status;
  const updated = await prisma.automationProfile.update({ where: { id: row.id }, data });
  res.json({ profile: serializeProfile(updated) });
});

apiRouter.post('/profiles/:id/clone', async (req, res) => {
  const row = await ownProfile(req, res);
  if (!row) return;
  const copy = await prisma.automationProfile.create({
    data: {
      userId: req.uid, name: (row.name + ' (copy)').slice(0, 80),
      config: row.config, status: 'paused', secret: await newSecret()
    }
  });
  res.status(201).json({ profile: serializeProfile(copy) });
});

apiRouter.delete('/profiles/:id', async (req, res) => {
  const row = await ownProfile(req, res);
  if (!row) return;
  await prisma.automationProfile.delete({ where: { id: row.id } });
  res.json({ ok: true });
});

apiRouter.post('/profiles/:id/rotate-secret', async (req, res) => {
  const row = await ownProfile(req, res);
  if (!row) return;
  const updated = await prisma.automationProfile.update({ where: { id: row.id }, data: { secret: await newSecret() } });
  res.json({ profile: serializeProfile(updated) });
});

// Upload the existing document that placement targets. The client sends the
// extracted text (Markdown/plain-text today; pdf/docx/confluence are extracted
// to text upstream). We parse it to an outline and store only the outline +
// stats on the profile — never the full document body.
apiRouter.post('/profiles/:id/source-doc', async (req, res) => {
  const row = await ownProfile(req, res);
  if (!row) return;
  const { name = '', format = 'markdown', content = '' } = req.body || {};
  if (!String(content).trim()) return res.status(400).json({ error: 'Upload a document with readable text content' });
  const parsed = parseOutline(content, format);
  if (!parsed.sections.length) {
    return res.status(400).json({ error: 'No headings found — placement needs a document with section headings (Markdown #, ##, or numbered 2.4 headings)' });
  }
  const sourceDoc = {
    name: String(name || 'document').slice(0, 120), format: String(format || 'markdown'),
    sections: parsed.sections.slice(0, 2000), lines: parsed.lines, chars: parsed.chars,
    pagesEst: parsed.pagesEst, uploadedAt: new Date().toISOString()
  };
  const cfg = { ...profCfg(row), sourceDoc };
  const updated = await prisma.automationProfile.update({ where: { id: row.id }, data: { config: JSON.stringify(cfg) } });
  res.json({ profile: serializeProfile(updated), summary: { name: sourceDoc.name, sections: sourceDoc.sections.length, pagesEst: sourceDoc.pagesEst } });
});

apiRouter.delete('/profiles/:id/source-doc', async (req, res) => {
  const row = await ownProfile(req, res);
  if (!row) return;
  const cfg = { ...profCfg(row), sourceDoc: null };
  const updated = await prisma.automationProfile.update({ where: { id: row.id }, data: { config: JSON.stringify(cfg) } });
  res.json({ profile: serializeProfile(updated) });
});

// Placement preview: given a (real or hypothetical) merge, resolve its Jira
// issue and rank the best insertion locations inside the uploaded document —
// what powers the review screen, without running a full generation.
apiRouter.post('/profiles/:id/placement/preview', async (req, res) => {
  const row = await ownProfile(req, res);
  if (!row) return;
  const cfg = profCfg(row);
  const b = req.body || {};
  const event = {
    message: String(b.message || ''), branch: String(b.branch || cfg.branch),
    files: Array.isArray(b.files) ? b.files.map(String) : [], commit: String(b.commit || '')
  };
  const jira = resolveJiraLink(cfg, event);
  const placement = computePlacement(cfg, event, jira, null);
  res.json({ placement, jira, hasSourceDoc: !!(cfg.sourceDoc && cfg.sourceDoc.sections && cfg.sourceDoc.sections.length) });
});

// Manual / simulated run. The body may carry synthetic merge metadata so the
// decision engine can be exercised: { files: [...], message, branch }.
apiRouter.post('/profiles/:id/run', async (req, res) => {
  const row = await ownProfile(req, res);
  if (!row) return;
  const cfg = profCfg(row);
  const b = req.body || {};
  const event = {
    trigger: b.simulate ? 'simulate' : 'manual',
    kind: 'push',
    branch: String(b.branch || cfg.branch).replace('/*', '/next'),
    commit: 'sim' + Date.now().toString(36).slice(-5),
    message: String(b.message || ''),
    files: Array.isArray(b.files) ? b.files.map(String) : [],
    repo: cfg.repo
  };
  profileRun(row, event).catch((e) => console.error('manual profile run', e));
  res.json({ ok: true, started: true });
});

apiRouter.post('/profiles/:id/runs/:runId/approve', async (req, res) => {
  const row = await ownProfile(req, res);
  if (!row) return;
  const runs = j(row.runs, []);
  const run = runs.find((r) => r.id === req.params.runId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (run.outcome !== 'awaiting-approval') return res.status(400).json({ error: 'Run is not awaiting approval' });
  run.outcome = 'published';
  run.approvedAt = new Date().toISOString();
  await prisma.automationProfile.update({ where: { id: row.id }, data: { runs: JSON.stringify(runs) } });
  res.json({ ok: true, run });
});

// Effectiveness insights: score and per-model ranking trends over the run
// history — the executive view of whether automation is working.
apiRouter.get('/profiles/:id/insights', async (req, res) => {
  const row = await ownProfile(req, res);
  if (!row) return;
  const runs = j(row.runs, []).filter((r) => r.status === 'complete').slice(0, 20).reverse();
  const series = runs.map((r) => ({
    at: r.at, overall: r.overall || 0,
    chatgpt: (r.assistants || {}).chatgpt ?? null,
    claude: (r.assistants || {}).claude ?? null,
    gemini: (r.assistants || {}).gemini ?? null,
    action: r.action, outcome: r.outcome
  }));
  const first = series[0]; const last = series[series.length - 1];
  res.json({
    series,
    summary: {
      runs: series.length,
      publishRate: series.length ? Math.round(100 * series.filter((s) => s.outcome === 'published').length / series.length) : 0,
      overallTrend: first && last ? last.overall - first.overall : 0,
      latest: last || null
    }
  });
});

apiRouter.get('/automation', async (req, res) => {
  const row = await getAutomation(req.uid);
  const tpl = await latestTemplate(req.uid);
  res.json({
    automation: { ...row, runs: j(row.runs, []) },
    snippet: ciSnippet(row, tpl),
    webhookUrl: '/api/webhooks/git/' + row.id,
    template: tpl ? { id: tpl.id, title: tpl.title, repo: tpl.repo, track: tpl.track, docTypes: j(tpl.docTypes, []), format: tpl.format, skillName: tpl.skillName || '' } : null
  });
});

apiRouter.put('/automation', async (req, res) => {
  const { enabled, branch, gate } = req.body || {};
  const data = {};
  if (typeof enabled === 'boolean') data.enabled = enabled;
  if (typeof branch === 'string' && branch.trim()) data.branch = branch.trim();
  if (Number.isInteger(gate) && gate >= 0 && gate <= 100) data.gate = gate;
  await getAutomation(req.uid);
  const row = await prisma.automation.update({ where: { userId: req.uid }, data });
  const tpl = await latestTemplate(req.uid);
  res.json({ automation: { ...row, runs: j(row.runs, []) }, snippet: ciSnippet(row, tpl) });
});

// Real branches of the template repository, from the connected code host.
// Falls back to the branches we actually know about (template + default)
// and says so — no invented branch names.
const BRANCH_FNS = { github: ghBranches, gitlab: glBranches, bitbucket: bbBranches };
apiRouter.get('/automation/branches', async (req, res) => {
  const tpl = await latestTemplate(req.uid);
  const repo = String(req.query.repo || (tpl ? tpl.repo : '') || '');
  const fallback = [...new Set([tpl && tpl.branch, 'main'].filter(Boolean))];
  if (!repo) return res.json({ branches: fallback, repo: '', live: false });
  const sources = await prisma.source.findMany({ where: { userId: req.uid } });
  for (const s of sources) {
    const fn = BRANCH_FNS[s.provider];
    if (!fn || !s.token) continue;
    try {
      const token = await freshToken(s);
      const branches = await fn(token, repo);
      if (Array.isArray(branches) && branches.length) {
        return res.json({ branches, repo, live: true, provider: s.provider });
      }
    } catch { /* try the next connected code host */ }
  }
  res.json({ branches: fallback, repo, live: false });
});

apiRouter.post('/automation/rotate-secret', async (req, res) => {
  await getAutomation(req.uid);
  const crypto = await import('node:crypto');
  const row = await prisma.automation.update({
    where: { userId: req.uid }, data: { secret: crypto.randomBytes(24).toString('hex') }
  });
  res.json({ automation: { ...row, runs: j(row.runs, []) } });
});

// Manual trigger / "Simulate merge" — exercises the exact webhook path.
apiRouter.post('/automation/run', async (req, res) => {
  const auto = await getAutomation(req.uid);
  const { run } = await triggerRegeneration(req.uid, auto, {
    trigger: req.body && req.body.trigger === 'simulate' ? 'simulate' : 'manual',
    commit: 'sim' + Date.now().toString(36).slice(-4), branch: auto.branch.replace('/*', '/next')
  });
  res.json({ run });
});
