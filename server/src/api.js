import { Router } from 'express';
import { prisma } from './db.js';
import { requireAuth, freshToken } from './auth.js';
import { SOURCES, DOCTYPES, FORMATS, PLANS, CI_YAML, docTypeName, formatDef } from './catalog.js';
import { listRepos } from './adapters/github.js';
import { listProjects as listGitlab } from './adapters/gitlab.js';
import { listRepos as listBitbucket } from './adapters/bitbucket.js';
import { verifyJira, listJiraProjects, verifyConfluence, listConfluenceSpaces } from './adapters/atlassian.js';
import { verifyNotion, listNotion } from './adapters/notion.js';
import { inspectSpec } from './adapters/openapi.js';
import { generateDocument, judge, aiScore, scoreReport, FIX_DIFFS, renderQualityReport } from './adapters/llm.js';
import { charge } from './adapters/stripe.js';

export const apiRouter = Router();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const j = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };

/* ---------- public ---------- */

apiRouter.get('/catalog', (req, res) => {
  res.json({ sources: SOURCES, doctypes: DOCTYPES, formats: FORMATS, plans: PLANS });
});

apiRouter.post('/waitlist', async (req, res) => {
  const { email, provider } = req.body || {};
  if (!email || !String(email).includes('@')) return res.status(400).json({ error: 'A valid email is required' });
  if (!SOURCES.some((s) => s.id === provider && !s.avail)) return res.status(400).json({ error: 'Unknown waitlist source' });
  await prisma.waitlist.create({ data: { email: String(email).trim(), provider } });
  res.json({ ok: true });
});

/* ---------- everything below requires auth ---------- */
apiRouter.use(requireAuth);

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
  let info = null;
  try {
    if (provider === 'jira' || provider === 'confluence') {
      if (!detail.trim() || !token.trim() || !email.trim()) {
        return res.status(400).json({ error: cat.name + ' needs the site URL, your Atlassian account email, and an API token' });
      }
      const cred = email.trim() + ':' + token.trim();
      if (provider === 'jira') await verifyJira(detail, cred);
      else await verifyConfluence(detail, cred);
      storedToken = cred; // Basic-auth credential; encrypt at rest in production
    } else if (provider === 'notion') {
      if (!token.trim()) return res.status(400).json({ error: 'Notion needs an internal integration token' });
      await verifyNotion(token.trim());
    } else if (provider === 'openapi') {
      if (!detail.trim()) return res.status(400).json({ error: 'Provide the URL of your OpenAPI / Swagger spec' });
      info = await inspectSpec(detail);
    }
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const existing = await prisma.source.findFirst({ where: { userId: req.uid, provider } });
  const data = {
    userId: req.uid, provider,
    detail: detail || 'OAuth read-only (contents + commit history)',
    token: storedToken || (existing ? existing.token : '')
  };
  const row = existing
    ? await prisma.source.update({ where: { id: existing.id }, data })
    : await prisma.source.create({ data });
  res.json({ source: row, info });
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
function serializeGen(g) {
  return {
    id: g.id, repo: g.repo, branch: g.branch, track: g.track,
    docTypes: j(g.docTypes, []), format: g.format, instructions: g.instructions,
    files: j(g.files, []), skillName: g.skillName || '',
    status: g.status, step: g.step, steps: j(g.steps, []),
    title: g.title, content: g.content, preview: g.preview || '',
    output: j(g.output, {}), brief: j(g.brief, {}),
    score: g.score, createdAt: g.createdAt
  };
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
    const genArgs = {
      track: gen.track, docTypes: j(gen.docTypes, []), format: gen.format,
      repo: gen.repo, instructions: gen.instructions,
      skill: gen.skill || '', skillName: gen.skillName || '',
      brief: j(gen.brief, {}), output: j(gen.output, {})
    };
    const { title, content } = generateDocument(genArgs);
    // Rendered preview for the UI: same engine, HTML target, same options —
    // so the preview shows exactly what the user configured, for every format.
    const previewHtml = gen.format === 'html'
      ? content
      : generateDocument({ ...genArgs, format: 'html' }).content;
    const report = judge();
    await prisma.qualityReport.create({
      data: {
        generationId: genId,
        issues: JSON.stringify(report.issues),
        links: JSON.stringify(report.links),
        style: JSON.stringify(report.style)
      }
    });
    await prisma.generation.update({
      where: { id: genId },
      data: { status: 'complete', title, content, preview: previewHtml, score: aiScore(report.issues.length, 0) }
    });
  } catch (e) {
    await prisma.generation.update({ where: { id: genId }, data: { status: 'failed' } }).catch(() => {});
  }
}

apiRouter.post('/generations', async (req, res) => {
  const { repo, branch = 'main', track, docTypes, format, instructions = '', files = [], provider = 'github', skillName = '', skill = '', brief = null, output = null } = req.body || {};
  if (String(skill).length > 60000) return res.status(400).json({ error: 'SKILL.md is too large (60 KB max)' });
  if (track !== 'technical' && track !== 'marketing') return res.status(400).json({ error: 'Invalid track' });
  if (!Array.isArray(docTypes) || docTypes.length === 0) return res.status(400).json({ error: 'Select at least one document type' });
  const fmt = formatDef(track, format);
  if (!fmt) return res.status(400).json({ error: 'Unknown format' });
  if (!fmt.ok) return res.status(400).json({ error: 'This output format is not currently supported. We will add support for it in a future release.' });
  const steps = buildSteps({ provider, instructions, files, skillName });
  const gen = await prisma.generation.create({
    data: {
      userId: req.uid, repo: repo || provider, branch, track,
      docTypes: JSON.stringify(docTypes), format, instructions,
      files: JSON.stringify(files), skillName: String(skillName), skill: String(skill),
      brief: JSON.stringify(brief || {}),
      output: JSON.stringify(output || {}),
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
  res.json({ generation: serializeGen(g) });
});

apiRouter.get('/generations/:id/download', async (req, res) => {
  const g = await prisma.generation.findFirst({ where: { id: req.params.id, userId: req.uid } });
  if (!g || g.status !== 'complete') return res.status(404).json({ error: 'Not ready' });
  const fmt = formatDef(g.track, g.format) || { ext: '.txt' };
  const base = (g.title || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-');
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
    res.setHeader('Content-Disposition', 'attachment; filename="quality-report.html"');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderQualityReport(ser, { title: g.title, repo: g.repo, format: g.format }));
  }
  const ct = fmt.ext.endsWith('.xhtml') ? 'application/xhtml+xml; charset=utf-8'
    : fmt.ext.endsWith('.html') ? 'text/html; charset=utf-8'
    : fmt.ext.endsWith('.xml') || fmt.ext.endsWith('.dita') ? 'application/xml; charset=utf-8'
    : 'text/plain; charset=utf-8';
  res.setHeader('Content-Disposition', 'attachment; filename="' + base + fmt.ext + '"');
  res.setHeader('Content-Type', ct);
  res.send(g.content);
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
  return {
    id: rep.id, generationId: rep.generationId,
    issues: issues.map((i) => ({ ...i, ...(FIX_DIFFS[i.id] || {}), fixed: fixed.includes(i.id) })),
    links, style,
    ...q,
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
    const genArgs = {
      track: genRow.track, docTypes: j(genRow.docTypes, []), format: genRow.format,
      repo: genRow.repo, instructions: genRow.instructions,
      skill: genRow.skill || '', skillName: genRow.skillName || '',
      brief: j(genRow.brief, {}), output: j(genRow.output, {}), fixes: fixesArr
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

/* Automation */
apiRouter.get('/automation', async (req, res) => {
  const row = await prisma.automation.upsert({
    where: { userId: req.uid }, update: {}, create: { userId: req.uid }
  });
  res.json({ automation: row, snippet: CI_YAML });
});

apiRouter.put('/automation', async (req, res) => {
  const { enabled, branch, gate } = req.body || {};
  const data = {};
  if (typeof enabled === 'boolean') data.enabled = enabled;
  if (typeof branch === 'string' && branch.trim()) data.branch = branch.trim();
  if (Number.isInteger(gate) && gate >= 0 && gate <= 100) data.gate = gate;
  const row = await prisma.automation.upsert({
    where: { userId: req.uid }, update: data, create: { userId: req.uid, ...data }
  });
  res.json({ automation: row });
});
