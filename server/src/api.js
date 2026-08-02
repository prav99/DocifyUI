import { Router } from 'express';
import cluster from 'node:cluster';
import { isSingletonWorker } from './cluster.js';
import { prisma } from './db.js';
import { requireAuth, freshToken } from './auth.js';
import { SOURCES, DOCTYPES, FORMATS, PLANS, PLAN_LIMITS, planLimits, formatAllowed, docTypeName, formatDef } from './catalog.js';
import { rateLimiter } from './ratelimit.js';
import { documentsUsedThisMonth, quotaError, reserveDocumentQuota, releaseDocumentQuota } from './quota.js';
import { listRepos, listOrgRepos as ghOrgRepos, listBranches as ghBranches } from './adapters/github.js';
import { listProjects as listGitlab, listGroupProjects as glOrgRepos, listBranches as glBranches } from './adapters/gitlab.js';
import { listRepos as listBitbucket, listWorkspaceRepos as bbOrgRepos, listBranches as bbBranches } from './adapters/bitbucket.js';
import {
  verifyJira, listJiraProjects, verifyConfluence, listConfluenceSpaces, verifyJiraIssues, verifyConfluencePage,
  jiraSearch, jiraSearchJql, validateJiraIssuesDetailed, resolveJiraScope, listJiraVersions, listJiraEpics, fetchJiraIssuesContent,
  confluenceSearch, fetchConfluenceContent
} from './adapters/atlassian.js';
import { parseSpecText, analyzeSpec, loadSpecText, digestSpec } from './adapters/openapi.js';
import { resolveWritingPolicy, compileStylePrompt, styleAudit, autofixText, STYLE_GUIDES } from './adapters/styleguide.js';
import { notionSearch, fetchNotionContent } from './adapters/notion.js';
import { fetchRepoFile } from './adapters/repofiles.js';
import { verifyNotion, listNotion, verifyNotionItem } from './adapters/notion.js';
import { inspectSpec } from './adapters/openapi.js';
import { generateDocument, generateDocumentSmart, judge, aiScore, scoreReport, FIX_DIFFS, renderQualityReport, renderMarkdownPreview, FRAMEWORK } from './adapters/llm.js';
import { buildReportModel, renderReportHtml, renderReportPdf, renderReportPptx, traceableReportName } from './adapters/report.js';
import { fetchRepoFilesResolved } from './adapters/repofiles.js';
import { buildDocx, buildPdf } from './adapters/exporters.js';
import { charge, paymentsLive } from './adapters/stripe.js';
import { sendMail, mailEnabled } from './adapters/mailer.js';
import { SUPPORT_EMAIL } from './config.js';
import { syncRouter } from './docsync.js';
import { hubRouter, resolveEffectiveConfig, invalidateCatalogue } from './repohub.js';
import { evaluateCommit, passesScan } from './adapters/relevance.js';
import { adminRouter } from './admin.js';

export const apiRouter = Router();

// Escape user-supplied text before embedding it in the notification HTML so a
// message body can never inject markup into the email we send ourselves.
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Where the app is served from — used for links inside outgoing mail.
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

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
  // planLimits travels with the catalog so the client can show a locked format
  // as locked, instead of letting someone pick it and hit a 402 afterwards.
  res.json({ sources: SOURCES, doctypes, formats: FORMATS, plans: PLANS, planLimits: PLAN_LIMITS });
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
   adapter only logs to the console, so this route refuses rather than telling a
   customer their enquiry was sent when it went nowhere.
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

  // Without SMTP the adapter prints a line to the console and returns
  // successfully — which used to surface as "Message sent" while the enquiry
  // was lost. Say so instead, and log it where an operator will see it.
  if (!mailEnabled()) {
    console.error('[contact] SMTP is not configured — enquiry from ' + cleanEmail +
      ' (' + (cleanTopic || 'no topic') + ') could NOT be delivered and was not stored.');
    return res.status(503).json({
      error: 'Message delivery is not configured on this server, so we could not send your message. Please email ' + SUPPORT_EMAIL + ' directly.',
      delivered: false, contact: true
    });
  }

  try {
    // replyTo lets the support team reply straight to the customer.
    await sendMail(SUPPORT_EMAIL, subject, html, { replyTo: cleanEmail });
    res.json({ ok: true, delivered: true });
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
// `filesKnown` records whether the payload actually carried a changed-file
// list. GitHub's merged-PR payload and Bitbucket's push payload do not, and an
// empty list there means "unknown", not "nothing changed" — the difference
// decides whether the path filter can be applied at all.
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
      files, filesKnown: commits.length > 0
    };
  }
  if (b.pull_request && b.action === 'closed' && b.pull_request.merged) { // GitHub merged PR
    return {
      kind: 'mergedPr',
      branch: b.pull_request.base && b.pull_request.base.ref,
      commit: b.pull_request.merge_commit_sha || '',
      message: b.pull_request.title || '',
      repo: (b.repository && b.repository.full_name) || '',
      // GitHub sends no file list on a pull_request event — reading it needs an
      // authenticated call to /pulls/:n/files, which this public receiver has no
      // credentials for.
      files: [], filesKnown: false, filesWhy: 'GitHub pull-request payloads carry no changed-file list'
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
      files: [], filesKnown: false, filesWhy: 'Bitbucket push payloads carry no changed-file list'
    };
  }
  if (b.branch) { // generic (custom CI)
    return {
      kind: b.kind === 'mergedPr' ? 'mergedPr' : 'push',
      branch: String(b.branch), commit: String(b.commit || ''),
      message: String(b.message || ''), repo: String(b.repo || ''),
      files: Array.isArray(b.files) ? b.files.map(String) : [],
      filesKnown: Array.isArray(b.files)
    };
  }
  return null;
}

// Jira Cloud webhook payloads → a normalized pipeline event. Jira cannot sign
// requests, so these authenticate with ?token=<secret> (already supported).
function normalizeJiraEvent(b = {}) {
  const we = String(b.webhookEvent || '');
  if (!we.startsWith('jira:') && we !== 'comment_created') return null;
  const issue = b.issue || {};
  const f = issue.fields || {};
  const key = issue.key || '';
  if (!key) return null;
  let kind = we === 'jira:issue_created' ? 'created'
    : we === 'comment_created' ? 'comment'
    : we === 'jira:issue_updated' ? 'updated' : '';
  if (!kind) return null;
  // A status transition into a done-category state is its own trigger.
  if (kind === 'updated') {
    const items = (b.changelog && b.changelog.items) || [];
    const st = items.find((i) => String(i.field).toLowerCase() === 'status');
    if (st && /done|closed|resolved/i.test(String(st.toString || ''))) kind = 'statusDone';
  }
  return {
    jiraKind: kind,
    issue: key,
    summary: f.summary || '',
    status: (f.status && f.status.name) || '',
    type: (f.issuetype && f.issuetype.name) || ''
  };
}

async function verifyHookSecret(req, secret) {
  const crypto = await import('node:crypto');
  const sig = req.get('X-Hub-Signature-256');
  if (sig && req.rawBody) {
    const want = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
    try { if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return true; } catch { /* length mismatch */ }
  }
  // Constant-time comparison everywhere: a plain === leaks the secret one
  // byte at a time through response timing.
  const sameSecret = (given) => {
    if (typeof given !== 'string' || given.length !== String(secret).length) return false;
    try { return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(String(secret))); } catch { return false; }
  };
  if (sameSecret(req.get('X-Gitlab-Token'))) return true;
  // ?token= is deprecated: URLs land in access logs, proxies, and Referer
  // headers. Kept for existing hooks; prefer the header form.
  if (sameSecret(req.query.token)) return true;
  return false;
}

/* Replay protection. A valid signed delivery stays valid forever, so a
   captured request could be replayed in a loop — each replay re-running the
   full generate → judge → publish pipeline (model spend plus duplicate
   document versions). Every provider stamps a unique delivery id; remember
   the ones seen recently and reject repeats. In-memory per worker, which
   covers the practical attack; move to Redis when running multiple nodes. */
const seenDeliveries = new Map();
const DELIVERY_TTL_MS = 6 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of seenDeliveries) if (exp < now) seenDeliveries.delete(k);
}, 15 * 60 * 1000).unref();

function replayedDelivery(req) {
  const id = req.get('X-GitHub-Delivery')
    || req.get('X-Gitlab-Event-UUID')
    || req.get('X-Request-UUID')          // Bitbucket
    || req.get('X-Hook-UUID')
    || req.get('X-Atlassian-Webhook-Identifier');
  if (!id) return false;                   // provider sent none: cannot dedup
  const key = req.params.hookId + ':' + id;
  if (seenDeliveries.has(key)) return true;
  if (seenDeliveries.size > 5000) seenDeliveries.clear(); // bounded memory
  seenDeliveries.set(key, Date.now() + DELIVERY_TTL_MS);
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
    if (replayedDelivery(req)) return res.json({ ok: true, action: 'ignored', reason: 'Duplicate delivery' });
    if (profile.status !== 'active') return res.json({ ok: true, action: 'ignored', reason: 'Profile is paused' });
    const cfg = profCfg(profile);
    // Jira issue events run the SAME pipeline as merges — the issue key rides
    // in the message so traceability, placement, and run history all show it.
    const jev = normalizeJiraEvent(req.body);
    if (jev) {
      const triggers = (cfg.jira && cfg.jira.triggers) || {};
      if (!cfg.jira || !cfg.jira.enabled) return res.json({ ok: true, action: 'ignored', reason: 'Jira is not enabled for this profile' });
      if (!triggers[jev.jiraKind]) return res.json({ ok: true, action: 'ignored', reason: 'Jira event "' + jev.jiraKind + '" is not enabled for this profile' });
      const ev = {
        kind: 'push', branch: cfg.branch, commit: '',
        message: '[' + jev.issue + '] ' + (jev.summary || 'Jira ' + jev.jiraKind) +
          ' (Jira ' + jev.jiraKind + (jev.status ? ' · ' + jev.status : '') + ')',
        repo: cfg.repo, files: [], trigger: 'jira'
      };
      profileRun(profile, ev).catch((e) => console.error('jira profile run', e));
      return res.json({ ok: true, action: 'regenerating', profile: profile.name, trigger: 'jira:' + jev.jiraKind, issue: jev.issue });
    }
    const ev = normalizeGitEvent(req.body);
    if (!ev || !ev.branch) return res.json({ ok: true, action: 'ignored', reason: 'No branch in payload (event type not handled)' });
    if (!branchMatches(cfg.branch, ev.branch)) {
      return res.json({ ok: true, action: 'ignored', reason: 'Branch ' + ev.branch + ' does not match watched ' + cfg.branch });
    }
    if ((ev.kind === 'push' && !cfg.events.push) || (ev.kind === 'mergedPr' && !cfg.events.mergedPr)) {
      return res.json({ ok: true, action: 'ignored', reason: 'Event type ' + ev.kind + ' is not enabled for this profile' });
    }
    // Path filter. When the payload carries no file list the filter CANNOT be
    // evaluated, so the event fails open — but loudly: silently treating
    // "unknown" as "matches everything" is what made the filter look applied
    // when it never ran. The note rides into the run record.
    let pathFilterNote = '';
    const pats = String(cfg.pathFilter || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (pats.length) {
      if (!ev.filesKnown) {
        pathFilterNote = 'Path filter (' + cfg.pathFilter + ') could not be applied: ' +
          (ev.filesWhy || 'this event carried no changed-file list') + ', so the event was allowed through.';
        console.warn('[automation] ' + profile.name + ': ' + pathFilterNote);
      } else if (!ev.files.some((f) => pats.some((p) => f.includes(p)))) {
        return res.json({ ok: true, action: 'ignored', reason: 'No changed file matches the path filter (' + cfg.pathFilter + ')' });
      }
    }
    // Respond immediately; the pipeline runs in the background (webhook
    // senders time out fast). Progress is visible in the run history.
    profileRun(profile, { ...ev, trigger: 'webhook', pathFilterNote }).catch((e) => console.error('profile run', e));
    return res.json({ ok: true, action: 'regenerating', profile: profile.name, ...(pathFilterNote ? { warning: pathFilterNote } : {}) });
  }

  const auto = await prisma.automation.findUnique({ where: { id: req.params.hookId } });
  if (!auto || !auto.secret) return res.status(404).json({ error: 'Unknown webhook' });
  if (!(await verifyHookSecret(req, auto.secret))) return res.status(401).json({ error: 'Signature verification failed' });
  if (replayedDelivery(req)) return res.json({ ok: true, action: 'ignored', reason: 'Duplicate delivery' });
  if (!auto.enabled) return res.json({ ok: true, action: 'ignored', reason: 'Automation is disabled' });
  const ev = normalizeGitEvent(req.body);
  if (!ev || !ev.branch) return res.json({ ok: true, action: 'ignored', reason: 'No branch in payload (event type not handled)' });
  if (!branchMatches(auto.branch, ev.branch)) {
    return res.json({ ok: true, action: 'ignored', reason: 'Branch ' + ev.branch + ' does not match watched ' + auto.branch });
  }
  const { run } = await triggerRegeneration(auto.userId, auto, { trigger: 'webhook', commit: ev.commit, branch: ev.branch, repo: ev.repo });
  res.json({ ok: true, action: run.status === 'skipped' ? 'skipped' : 'regenerating', run });
});

/* ---------------- Public status page (self-monitoring) ----------------
   A health sample is recorded every 5 minutes. If the service is down,
   nothing is recorded — so gaps count as downtime, which keeps the page
   honest. GET /health also runs a LIVE check for external monitors. */
async function liveHealth() {
  const out = { ok: true, components: {} };
  const t0 = Date.now();
  try {
    await prisma.user.count();
    out.components.database = { ok: true, latencyMs: Date.now() - t0 };
  } catch (e) {
    out.ok = false;
    out.components.database = { ok: false, error: 'unreachable' };
  }
  // `probe` says how each line was established. Only the database and the API
  // itself are measured; the other two report CONFIGURATION state, so they are
  // labelled as configuration and never as a health check we did not run.
  out.components.database.probe = 'live';
  out.components.database.label = out.components.database.ok ? 'Operational' : 'Down';
  const aiKey = !!process.env.ANTHROPIC_API_KEY;
  out.components.aiGeneration = {
    ok: aiKey, probe: 'config', label: aiKey ? 'Configured' : 'Not configured',
    note: aiKey
      ? 'API key configured — configuration state, not a live model call'
      : 'not configured — template fallback active'
  };
  out.components.webhooks = {
    ok: true, probe: 'config', label: 'Configured',
    note: 'receiver mounted in this process — individual deliveries are not probed'
  };
  out.components.api = { ok: true, probe: 'live', label: 'Operational' };
  return out;
}

apiRouter.get('/health', async (req, res) => {
  const h = await liveHealth();
  res.status(h.ok ? 200 : 503).json(h);
});

// One sampler per SERVICE — not per process. Production forks one worker per
// CPU (cluster.js), and every worker runs this module: an unguarded sampler
// wrote N rows per interval while the uptime denominator stayed at one row per
// interval, which is what produced 599% uptime on a 6-core box. Worker 1 is the
// designated sampler; any worker may take over once the last sample is older
// than two intervals, so a respawned cluster does not stop recording.
const SAMPLE_EVERY_MS = 5 * 60 * 1000;
async function shouldSample() {
  const last = await prisma.statusSample.findFirst({ orderBy: { at: 'desc' } });
  const age = last ? Date.now() - new Date(last.at).getTime() : Infinity;
  if (age < SAMPLE_EVERY_MS * 0.9) return false; // this interval is already recorded
  if (!cluster.isWorker) return true;            // single process (dev, or no cluster)
  // WORKER_INDEX is assigned by the primary and reused when a worker is
  // respawned; cluster.worker.id is not — it increments forever, so after the
  // first crash NO worker would satisfy `id === 1` and sampling would stop.
  return isSingletonWorker() || age > SAMPLE_EVERY_MS * 2;
}
setInterval(async () => {
  try {
    if (!(await shouldSample())) return;
    const h = await liveHealth();
    await prisma.statusSample.create({
      data: {
        ok: h.ok, dbMs: (h.components.database && h.components.database.latencyMs) || 0,
        aiOk: !!(h.components.aiGeneration && h.components.aiGeneration.ok),
        note: h.ok ? '' : 'degraded'
      }
    });
    await prisma.statusSample.deleteMany({ where: { at: { lt: new Date(Date.now() - 95 * 864e5) } } });
  } catch { /* if the DB is down there is nothing to record — the gap tells the story */ }
}, SAMPLE_EVERY_MS).unref?.();

apiRouter.get('/status', async (req, res) => {
  const now = Date.now();
  const [live, samples] = await Promise.all([
    liveHealth(),
    prisma.statusSample.findMany({ where: { at: { gte: new Date(now - 90 * 864e5) } }, orderBy: { at: 'asc' } })
      .catch(() => [])
  ]);
  // One interval, one data point. Historic rows were written by every worker in
  // the cluster, so the stored history still contains duplicates — collapsing
  // them here keeps uptime, the bar strip, and the incident log counting each
  // five-minute interval exactly once. A failed sample wins its interval: a
  // degraded reading must never be hidden by a healthy duplicate.
  const byInterval = new Map();
  for (const s of samples) {
    const slot = Math.floor(new Date(s.at).getTime() / SAMPLE_EVERY_MS);
    const prev = byInterval.get(slot);
    if (!prev || (prev.ok && !s.ok)) byInterval.set(slot, s);
  }
  const points = [...byInterval.values()].sort((a, b) => new Date(a.at) - new Date(b.at));
  // Uptime per window: expected one sample per 5 minutes; missing or failed
  // samples both count against uptime.
  const uptime = {};
  for (const [label, ms] of [['24h', 864e5], ['7d', 7 * 864e5], ['30d', 30 * 864e5]]) {
    const inWin = points.filter((s) => now - new Date(s.at).getTime() <= ms);
    const expected = Math.max(1, Math.floor(ms / SAMPLE_EVERY_MS));
    const okCount = inWin.filter((s) => s.ok).length;
    // A young deployment has fewer samples than the window expects — measure
    // against observed history, never claim more than we can prove. Clamped at
    // 100 so no counting error can ever publish an impossible number.
    uptime[label] = inWin.length
      ? Math.min(100, Math.round((okCount / Math.min(expected, Math.max(inWin.length, 1))) * 1000) / 10)
      : null;
  }
  // Daily buckets for the 90-day bar strip.
  const days = [];
  for (let i = 89; i >= 0; i--) {
    const dayStart = new Date(new Date(now - i * 864e5).toISOString().slice(0, 10));
    const dayEnd = new Date(dayStart.getTime() + 864e5);
    const inDay = points.filter((s) => new Date(s.at) >= dayStart && new Date(s.at) < dayEnd);
    const okc = inDay.filter((s) => s.ok).length;
    days.push({
      date: dayStart.toISOString().slice(0, 10),
      state: !inDay.length ? 'none' : okc === inDay.length ? 'ok' : okc / inDay.length > 0.5 ? 'partial' : 'down'
    });
  }
  // Incidents: consecutive failed samples in the last 30 days.
  const incidents = [];
  let run = null;
  for (const s of points.filter((x) => now - new Date(x.at).getTime() <= 30 * 864e5)) {
    if (!s.ok) {
      if (!run) run = { start: s.at, end: s.at, samples: 0 };
      run.end = s.at; run.samples++;
    } else if (run) { incidents.push(run); run = null; }
  }
  if (run) incidents.push(run);
  res.json({
    ok: live.ok,
    components: live.components,
    uptime,
    days,
    incidents: incidents.slice(-10).reverse().map((i) => ({
      start: i.start, end: i.end,
      // Measured from the incident's own timestamps. Multiplying the sample
      // COUNT by five assumes a sampling cadence that a respawned cluster does
      // not keep, and would under-report a real outage on the one page whose
      // job is to be trusted.
      approxMinutes: Math.max(5, Math.round((new Date(i.end) - new Date(i.start)) / 60000) || 5)
    })),
    monitoringSince: points.length ? points[0].at : null,
    generatedAt: new Date().toISOString()
  });
});

/* ---------- everything below requires auth ---------- */
apiRouter.use(requireAuth);

// Model-spending routes: a much lower ceiling, keyed by ACCOUNT so a single
// token cannot fan out into an unbounded Anthropic bill. It is mounted here,
// after requireAuth, because keyBy:'user' reads req.uid — at the app level it
// would fall back to the client IP, which behind a load balancer is one bucket
// shared by every customer (one noisy account would lock everyone out).
const aiLimit = rateLimiter({ windowMs: 60000, max: Number(process.env.RATE_LIMIT_AI || 20), keyBy: 'user' });
// Only requests that can SPEND are limited. The client polls GET
// /generations/:id every second or so while a document is building, and
// counting those against a 20/min model budget would 429 the user in the
// middle of the run they just paid for.
const aiSpendLimit = (req, res, next) => (req.method === 'GET' ? next() : aiLimit(req, res, next));
// The pre-generation check spends nothing on the model, but it does fan out to
// the code host, so it gets its own budget instead of eating the AI one:
// counting an advisory check against the model allowance would 429 the customer
// out of the very generation the check exists to protect.
const preflightLimit = rateLimiter({ windowMs: 60000, max: Number(process.env.RATE_LIMIT_PREFLIGHT || 30), keyBy: 'user' });
apiRouter.use('/generations', (req, res, next) => (
  /^\/preflight\/?$/i.test(req.path) ? preflightLimit(req, res, next) : aiSpendLimit(req, res, next)
));
apiRouter.use('/sync/rewrite', aiSpendLimit);
apiRouter.use('/sync/documents', (req, res, next) => (
  // Trailing slashes and case are normalised first: Express runs with strict
  // routing off, so `/standardize/` reaches the same handler and would
  // otherwise slip past this gate.
  /\/(standardize|analyze|sync|simulate)\/?$/i.test(req.path) ? aiSpendLimit(req, res, next) : next()
));

/* Doc sync: AI-maintained existing documentation (upload → parse → commit-driven
   updates → review diff → approve/version). Implemented in docsync.js. */
apiRouter.use('/sync', syncRouter);

/* Repository hub: central repository registry + reusable rule sets. One
   configuration surface consumed by generation, automation, and Doc sync. */
apiRouter.use('/hub', hubRouter);

/* Founder metrics — restricted to ADMIN_EMAILS (see admin.js). */
apiRouter.use('/admin', adminRouter);

/* Sources */
// SECURITY: credentials never leave the server. API responses carry only
// non-secret connection metadata — no token, no refreshToken.
const publicSource = (s) => ({
  id: s.id, provider: s.provider, detail: s.detail,
  connected: !!s.token, createdAt: s.createdAt
});

apiRouter.get('/sources', async (req, res) => {
  const rows = await prisma.source.findMany({ where: { userId: req.uid }, orderBy: { createdAt: 'asc' } });
  res.json({ sources: rows.map(publicSource) });
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
  // The pricing table sells "1 source" on Free and "All sources" above it.
  // Reconnecting or updating an existing source is always allowed — only
  // adding a NEW one beyond the plan's ceiling is refused.
  //
  // Deliberately NOT enforced on the OAuth callback (auth.js), which writes its
  // own Source row: there the provider is the account's sign-in identity, and
  // refusing it would lock the customer out of their own account. A paywall
  // must never become an authentication failure.
  const sourceCap = planLimits(req.user.plan).sources;
  if (!existing && sourceCap != null) {
    const held = await prisma.source.findMany({ where: { userId: req.uid }, select: { provider: true } });
    if (held.length >= sourceCap) {
      // Name what is already connected: "you have one source" is not
      // actionable, and the row is often one the user never explicitly added
      // (signing in with a code host connects it).
      const names = held.map((s) => (SOURCES.find((x) => x.id === s.provider) || {}).name || s.provider);
      return res.status(402).json({
        error: 'The ' + (PLANS[req.user.plan] || PLANS.free).name + ' plan includes ' + sourceCap +
          ' connected source' + (sourceCap === 1 ? '' : 's') + ', and you have ' + names.join(', ') +
          ' connected. Disconnect it first, or upgrade to connect more at once.',
        connected: names, upgrade: true
      });
    }
  }
  const data = {
    userId: req.uid, provider,
    detail: storedDetail || 'OAuth read-only (contents + commit history)',
    token: storedToken || (existing ? existing.token : '')
  };
  // Credential encryption can refuse the write (CREDENTIAL_KEY unset in
  // production). That message is written for the user, so surface it instead
  // of letting it become an opaque 500.
  let row;
  try {
    row = existing
      ? await prisma.source.update({ where: { id: existing.id }, data })
      : await prisma.source.create({ data });
  } catch (e) {
    if (/CREDENTIAL_KEY/.test(e.message || '')) return res.status(503).json({ error: e.message });
    throw e;
  }
  invalidateCatalogue(req.uid);
  res.json({ source: publicSource(row), info });
});

/* ---------------- Writing style: the tenant profile ----------------
   One profile per user (org). Merged into every generation's resolved
   writing policy; version bumps on every save so historical generations
   record which profile version shaped them. */
apiRouter.get('/style-profile', async (req, res) => {
  let p = await prisma.writingProfile.findUnique({ where: { userId: req.uid } });
  if (!p) p = await prisma.writingProfile.create({ data: { userId: req.uid } });
  res.json({ profile: { ...p, config: undefined, ...JSON.parse(p.config || '{}') }, guides: STYLE_GUIDES });
});

apiRouter.put('/style-profile', async (req, res) => {
  const b = req.body || {};
  const guide = ['docify', 'microsoft', 'google', 'custom'].includes(b.guide) ? b.guide : 'docify';
  const terms = (Array.isArray(b.terms) ? b.terms : []).slice(0, 60)
    .map((t) => ({ use: String(t.use || '').slice(0, 60).trim(), not: String(Array.isArray(t.not) ? t.not.join(', ') : t.not || '').slice(0, 200) }))
    .filter((t) => t.use);
  const prohibited = (Array.isArray(b.prohibited) ? b.prohibited : String(b.prohibited || '').split(','))
    .map((w) => String(w).trim()).filter(Boolean).slice(0, 50);
  const config = JSON.stringify({ terms, prohibited, notes: String(b.notes || '').slice(0, 4000) });
  const existing = await prisma.writingProfile.findUnique({ where: { userId: req.uid } });
  const data = { guide, voice: String(b.voice || '').slice(0, 40), config, version: (existing ? existing.version : 0) + 1 };
  const p = existing
    ? await prisma.writingProfile.update({ where: { userId: req.uid }, data })
    : await prisma.writingProfile.create({ data: { userId: req.uid, ...data } });
  res.json({ profile: { ...p, config: undefined, ...JSON.parse(p.config || '{}') } });
});

/* ---------------- Jira as a first-class source (issues, not repos) ----------------
   Selected issues are the source material. Every route resolves through the
   user's own Jira connection — multi-tenant by construction. */
async function jiraSrc(uid) {
  const src = await prisma.source.findFirst({ where: { userId: uid, provider: 'jira' } });
  if (!src || !src.token) { const e = new Error('Connect Jira first — site URL, account email, and API token'); e.code = 400; throw e; }
  return src;
}

// Per-key validation with clear success / invalid / inaccessible / duplicate states.
apiRouter.post('/jira/validate', async (req, res) => {
  try {
    const src = await jiraSrc(req.uid);
    const b = req.body || {};
    const keys = Array.isArray(b.keys) ? b.keys : String(b.keys || '').split(/[\s,;]+/);
    const results = await validateJiraIssuesDetailed(src.detail, src.token, keys);
    res.json({ results });
  } catch (e) { res.status(e.code || 400).json({ error: e.message }); }
});

// Search by key, text, or full JQL (issue key input is detected automatically).
apiRouter.get('/jira/search', async (req, res) => {
  try {
    const src = await jiraSrc(req.uid);
    const issues = req.query.jql
      ? await jiraSearchJql(src.detail, src.token, String(req.query.jql), 50)
      : await jiraSearch(src.detail, src.token, { text: String(req.query.q || ''), project: String(req.query.project || '').split(' ')[0] });
    res.json({ issues });
  } catch (e) { res.status(e.code || 400).json({ error: e.message }); }
});

// Scope modes (epic | sprint | release | project | jql) → concrete issues.
apiRouter.post('/jira/resolve', async (req, res) => {
  try {
    const src = await jiraSrc(req.uid);
    const { mode, value = '', project = '' } = req.body || {};
    const out = await resolveJiraScope(src.detail, src.token, { mode, value, project: String(project).split(' ')[0] });
    res.json(out);
  } catch (e) { res.status(e.code || 400).json({ error: e.message }); }
});

apiRouter.get('/jira/epics', async (req, res) => {
  try {
    const src = await jiraSrc(req.uid);
    res.json({ epics: await listJiraEpics(src.detail, src.token, String(req.query.project || '').split(' ')[0]) });
  } catch (e) { res.status(e.code || 400).json({ error: e.message }); }
});

apiRouter.get('/jira/versions', async (req, res) => {
  try {
    const src = await jiraSrc(req.uid);
    res.json({ versions: await listJiraVersions(src.detail, src.token, String(req.query.project || '')) });
  } catch (e) { res.status(e.code || 400).json({ error: e.message }); }
});

/* ---------------- OpenAPI / Swagger as a first-class source ----------------
   Inspect a spec from ANY input method — URL, pasted text, or a file inside
   a connected repository — and return the full analysis: operation tree,
   tags, schemas, and validation findings. */
apiRouter.post('/openapi/inspect', async (req, res) => {
  const b = req.body || {};
  try {
    const text = await loadSpecText(
      { url: b.url, text: b.text, provider: b.provider, repo: b.repo, branch: b.branch, path: b.path },
      {
        repoFileFetcher: async (provider, repo, branch, path) => {
          let token = '';
          try {
            const src = await prisma.source.findFirst({ where: { userId: req.uid, provider } });
            token = await freshToken(src);
          } catch { /* public repos work unauthenticated */ }
          return fetchRepoFile(provider, repo, branch, path, token);
        }
      });
    const spec = parseSpecText(text);
    res.json({ summary: analyzeSpec(spec) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ---------------- Notion as a first-class source ---------------- */
apiRouter.get('/notion/search', async (req, res) => {
  const src = await prisma.source.findFirst({ where: { userId: req.uid, provider: 'notion' } });
  if (!src || !src.token) return res.status(400).json({ error: 'Connect Notion first — an internal integration token' });
  try {
    res.json({ items: await notionSearch(src.token, String(req.query.q || '')) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ---------------- Confluence as a first-class source ---------------- */
apiRouter.get('/confluence/search', async (req, res) => {
  const src = await prisma.source.findFirst({ where: { userId: req.uid, provider: 'confluence' } });
  if (!src || !src.token) return res.status(400).json({ error: 'Connect Confluence first — site URL, account email, and API token' });
  try {
    res.json({
      pages: await confluenceSearch(src.detail, src.token, {
        text: String(req.query.q || ''), space: String(req.query.space || ''), cql: String(req.query.cql || '')
      })
    });
  } catch (e) { res.status(400).json({ error: e.message }); }
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
  invalidateCatalogue(req.uid);
  res.json({ ok: true });
});

// Connection summary for the code hosts. "Connected" means a verified OAuth
// token is on file — the pickers use this to show honest provider states and
// to never offer repositories from an unconnected provider.
apiRouter.get('/connections', async (req, res) => {
  const hosts = ['github', 'gitlab', 'bitbucket'];
  const rows = await prisma.source.findMany({ where: { userId: req.uid, provider: { in: hosts } } });
  const connections = {};
  for (const p of hosts) {
    const src = rows.find((r) => r.provider === p);
    const expired = !!(src && src.expiresAt && new Date(src.expiresAt) <= new Date() && !src.refreshToken);
    const m = src && src.detail ? String(src.detail).match(/\(as ([^)]+)\)/) : null;
    connections[p] = {
      connected: !!(src && src.token) && !expired,
      expired,
      account: m ? m[1] : null
    };
  }
  res.json({ connections });
});

apiRouter.get('/repos', async (req, res) => {
  const provider = String(req.query.provider || 'github');
  const src = await prisma.source.findFirst({ where: { userId: req.uid, provider } });
  const isHost = ['github', 'gitlab', 'bitbucket'].includes(provider);
  try {
    if (isHost) {
      // Browse any organisation / group / workspace by name — public data,
      // so this works even without a connection (a member token additionally
      // surfaces org-private repositories the account can access).
      const org = String(req.query.org || '').trim();
      if (org) {
        let token = '';
        try { token = await freshToken(src); } catch { token = ''; }
        const repos = provider === 'gitlab' ? await glOrgRepos(token, org)
          : provider === 'bitbucket' ? await bbOrgRepos(token, org)
          : await ghOrgRepos(token, org);
        return res.json({ repos, org });
      }
      // A code host only ever lists repositories the connected account can
      // truly access. No valid token → connected:false and an EMPTY list;
      // the UI shows a "connect" state instead of stale or sample data.
      let token = '';
      try { token = await freshToken(src); }
      catch (e) { return res.json({ repos: [], connected: false, reason: e.message }); }
      if (!token) return res.json({ repos: [], connected: false });
      try {
        const repos = provider === 'gitlab' ? await listGitlab(token)
          : provider === 'bitbucket' ? await listBitbucket(token)
          : await listRepos(token);
        return res.json({ repos, connected: true });
      } catch (e) {
        // Token on file but the provider rejected it (revoked / lost scope).
        return res.json({ repos: [], connected: false, reason: e.message + ' — reconnect ' + provider + ' to continue' });
      }
    }
    const token = src ? src.token : '';
    if (provider === 'jira') return res.json({ repos: src ? await listJiraProjects(src.detail, token) : [] });
    if (provider === 'confluence') return res.json({ repos: src ? await listConfluenceSpaces(src.detail, token) : [] });
    if (provider === 'notion') return res.json({ repos: token ? await listNotion(token) : [] });
    return res.status(400).json({ error: 'Unknown provider' });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

/* ================= Import History: document lifecycle management =================
   The single source of truth for every generated document: searchable list,
   full version history, compare/restore, and an approval workflow
   (draft → under review → approved → published) that the automation
   pipeline's approval gate respects. */

const APPROVALS = ['draft', 'review', 'approved', 'published'];

apiRouter.get('/history', async (req, res) => {
  const where = { userId: req.uid, status: 'complete' };
  if (req.query.provider && ['github', 'gitlab', 'bitbucket'].includes(String(req.query.provider))) where.provider = String(req.query.provider);
  if (req.query.approval && APPROVALS.includes(String(req.query.approval))) where.approval = String(req.query.approval);
  if (req.query.format) where.format = String(req.query.format);
  const q = String(req.query.q || '').trim();
  if (q) where.OR = [{ title: { contains: q } }, { repo: { contains: q } }];
  const rows = await prisma.generation.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
  const counts = await prisma.docVersion.groupBy({
    by: ['generationId'], _count: { generationId: true },
    where: { generationId: { in: rows.map((r) => r.id) } }
  }).catch(() => []);
  const vmap = Object.fromEntries(counts.map((c) => [c.generationId, c._count.generationId]));
  res.json({
    documents: rows.map((g) => {
      const oc = j(g.output, {});
      return {
        id: g.id, title: g.title || j(g.docTypes, [])[0] || 'Untitled',
        repo: g.repo, provider: g.provider, branch: g.branch,
        docTypes: j(g.docTypes, []), format: g.format, formats: (j(g.output, {}).formats) || [g.format],
        score: g.score, approval: g.approval || 'draft', approvedAt: g.approvedAt,
        source: oc.source === 'automation' ? 'Automation' : 'Manual',
        versions: (vmap[g.id] || 0) + 1, // history + current
        approvalLog: (oc.approvalLog || []).slice(-8),
        createdAt: g.createdAt
      };
    })
  });
});

apiRouter.get('/history/:id/versions', async (req, res) => {
  const g = await prisma.generation.findFirst({ where: { id: req.params.id, userId: req.uid } });
  if (!g) return res.status(404).json({ error: 'Document not found' });
  const rows = await prisma.docVersion.findMany({ where: { generationId: g.id }, orderBy: { version: 'asc' } });
  res.json({
    current: { version: rows.length + 1, title: g.title, score: g.score, approval: g.approval, content: g.content, createdAt: g.createdAt, current: true },
    versions: rows.map((v) => ({ id: v.id, version: v.version, title: v.title, score: v.score, note: v.note, createdAt: v.createdAt, content: v.content }))
  });
});

apiRouter.get('/history/:id/versions/:vid/download', async (req, res) => {
  const v = await prisma.docVersion.findFirst({ where: { id: req.params.vid, generationId: req.params.id, userId: req.uid } });
  if (!v) return res.status(404).json({ error: 'Version not found' });
  const safe = (v.title || 'document').replace(/[^\w.-]+/g, '_').slice(0, 60);
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + safe + '_v' + v.version + '.md"');
  res.send(v.content || '');
});

// Approval workflow: draft → review → approved → published (any direction,
// with an audit log entry per transition).
apiRouter.post('/history/:id/status', async (req, res) => {
  const g = await prisma.generation.findFirst({ where: { id: req.params.id, userId: req.uid } });
  if (!g) return res.status(404).json({ error: 'Document not found' });
  const to = String((req.body || {}).to || '');
  if (!APPROVALS.includes(to)) return res.status(400).json({ error: 'Unknown status' });
  const me = await prisma.user.findUnique({ where: { id: req.uid } }).catch(() => null);
  const oc = j(g.output, {});
  oc.approvalLog = [...(oc.approvalLog || []), {
    from: g.approval || 'draft', to,
    by: (me && me.email) || 'user',
    note: String((req.body || {}).note || '').slice(0, 300),
    at: new Date().toISOString()
  }].slice(-30);
  const upd = await prisma.generation.update({
    where: { id: g.id },
    data: {
      approval: to,
      approvedAt: to === 'approved' || to === 'published' ? new Date() : null,
      output: JSON.stringify(oc)
    }
  });
  res.json({ approval: upd.approval, approvedAt: upd.approvedAt, approvalLog: oc.approvalLog });
});

// Restore: snapshot the current state first (nothing lost), then bring the
// selected version back as the live document — as a fresh draft.
apiRouter.post('/history/:id/restore', async (req, res) => {
  const g = await prisma.generation.findFirst({ where: { id: req.params.id, userId: req.uid } });
  if (!g) return res.status(404).json({ error: 'Document not found' });
  const v = await prisma.docVersion.findFirst({ where: { id: String((req.body || {}).versionId || ''), generationId: g.id, userId: req.uid } });
  if (!v) return res.status(404).json({ error: 'Version not found' });
  const n = await prisma.docVersion.count({ where: { generationId: g.id } });
  await prisma.docVersion.create({
    data: {
      userId: req.uid, generationId: g.id, version: n + 1,
      title: g.title || '', content: g.content, aiDocs: g.aiDocs || '[]',
      score: g.score || 0, note: 'Replaced by restore of v' + v.version
    }
  });
  const restored = await prisma.generation.update({
    where: { id: g.id },
    data: { title: v.title, content: v.content, aiDocs: v.aiDocs, score: v.score, approval: 'draft', approvedAt: null }
  });
  // Re-render the preview from the restored sections so every format matches.
  try {
    const previewHtml = renderPreviewFor(restored, j(restored.docTypes, [])[0], restored.format);
    await prisma.generation.update({ where: { id: g.id }, data: { preview: previewHtml } });
  } catch { /* preview refresh is best-effort */ }
  res.json({ ok: true, restored: v.version });
});

/* Generations */
// Formats requested for this generation. The primary format lives in the
// `format` column (back-compat); any additional formats ride in the output
// options JSON so no schema change is needed.
function genFormats(g) {
  const oc = j(g.output, {});
  const list = Array.isArray(oc.formats) && oc.formats.length ? oc.formats.map(String) : [];
  // The generation's primary format is always renderable, so never drop it —
  // otherwise a stale output.formats can 400 a perfectly valid download.
  return [...new Set([g.format, ...list].filter(Boolean))];
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
  const oc = j(g.output, {});
  const base = {
    grounded: j(g.aiDocs, []).length > 0, // real AI content vs template structure
    // What actually grounded the run (file counts, real branch), written by the
    // pipeline. Null for rows generated before this was recorded — the UI must
    // show nothing rather than invent a count.
    grounding: (oc.grounding && typeof oc.grounding === 'object') ? oc.grounding : null,
    // The pipeline's own explanation when a document came out thin.
    scopeWarning: oc.scopeWarning || '',
    id: g.id, repo: g.repo, branch: g.branch, track: g.track,
    docTypes: j(g.docTypes, []), format: g.format, formats, instructions: g.instructions,
    files: j(g.files, []), skillName: g.skillName || '',
    status: g.status, step: g.step, steps: j(g.steps, []),
    progress: g.status === 'complete' ? 100 : (g.progress || 0),
    stage: g.stage || '', stageDetail: g.stageDetail || '',
    title: g.title, content: g.content, preview: g.preview || '',
    output: j(g.output, {}), brief: j(g.brief, {}),
    // The blueprint-selected preview layout, so the UI can label the preview
    // truthfully for any current or future document type.
    previewLayout: (() => {
      const fw = FRAMEWORK[j(g.docTypes, [])[0]];
      return fw && fw.preview ? fw.preview.layout : 'document';
    })(),
    score: g.score, approval: g.approval || 'draft', createdAt: g.createdAt
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
        // A format the plan does not include is listed but not rendered:
        // shipping its full text here would hand over exactly what the
        // download gate refuses. The cell stays visible so the UI can show
        // it as locked rather than pretending it does not exist.
        if (opts.plan && !formatAllowed(opts.plan, f)) {
          base.outputs[key] = { ...cell, title: '', content: '', preview: '', locked: true, error: null };
          continue;
        }
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

// Ordered pipeline stages with live-progress targets. runPipeline advances
// through these at REAL work boundaries (not a timer): the % shown while a
// stage is running is its `progress`, and the client eases toward the next.
// Reference-file NAMES are stored with a generation, but nothing reads their
// contents — so no stage claims them. Only instructions and an uploaded skill,
// which the prompt genuinely carries, earn a stage here.
function pipelineStages({ provider = 'github', skillName = '', instructions = '' } = {}) {
  const jira = provider === 'jira';
  const stages = [
    { key: 'parse', label: jira ? 'Reading Jira projects' : 'Parsing repository structure', progress: 8 },
    { key: 'extract', label: jira ? 'Collecting issues & versions' : 'Extracting code comments', progress: 20 },
    { key: 'analyse', label: 'Analysing sources & scope', progress: 32 }
  ];
  if (skillName) stages.push({ key: 'skill', label: 'Applying skill: ' + skillName, progress: 40 });
  if (instructions && instructions.trim()) {
    stages.push({ key: 'custom', label: 'Applying your instructions', progress: 44 });
  }
  stages.push(
    { key: 'generate', label: 'Generating document sections', progress: 48 },
    { key: 'style', label: 'Applying style guide', progress: 72 },
    { key: 'quality', label: 'Running quality checks', progress: 82 },
    { key: 'ai', label: 'AI compatibility analysis', progress: 89 },
    { key: 'preview', label: 'Preparing preview', progress: 95 },
    { key: 'finalize', label: 'Finalizing output', progress: 99 }
  );
  return stages;
}
function buildSteps(opts) { return pipelineStages(opts).map((s) => s.label); }

// Progressive preview fragments written to gen.preview as work completes, so
// the preview panel fills in (metadata → outline → full render) instead of
// staying blank until the end.
const previewShell = (inner) => '<div style="font-family:\'IBM Plex Sans\',system-ui,sans-serif;color:#161616;line-height:1.5">' + inner + '</div>';
function metaPreviewHtml(gen, fileCount) {
  const dt = docTypeName(gen.track, (j(gen.docTypes, [])[0]) || '');
  return previewShell(
    '<div style="font-size:11px;letter-spacing:.04em;color:#6f6f6f;text-transform:uppercase;margin-bottom:6px">Drafting</div>' +
    '<h1 style="font-size:22px;margin:0 0 8px">' + esc(dt || gen.title || 'Your document') + '</h1>' +
    '<p style="color:#525252;margin:0 0 4px">From <code>' + esc(gen.repo) + '</code> · ' + fileCount + ' files in scope</p>' +
    '<p style="color:#8d8d8d;margin:0">Writing sections from your source…</p>'
  );
}
function outlinePreviewHtml(title, content) {
  const heads = String(content || '').split('\n').filter((l) => /^#{1,3}\s/.test(l)).slice(0, 40);
  const rows = heads.map((h) => {
    const lvl = (h.match(/^#+/) || ['#'])[0].length;
    const txt = esc(h.replace(/^#+\s*/, ''));
    return '<div style="margin:6px 0 6px ' + ((lvl - 1) * 18) + 'px;font-size:' + (lvl === 1 ? 18 : lvl === 2 ? 15 : 13) + 'px;font-weight:' + (lvl <= 2 ? 600 : 400) + ';color:' + (lvl === 1 ? '#161616' : '#393939') + '">' + txt + '</div>';
  }).join('');
  return previewShell('<h1 style="font-size:22px;margin:0 0 12px">' + esc(title || 'Document') + '</h1>' + (rows || '<p style="color:#8d8d8d">Structuring sections…</p>'));
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Generations executing in THIS process. The crash-recovery sweep resumes
// anything left queued/running, and without this a run that is still mid-flight
// here would be started a second time — two pipelines writing one row, and two
// model bills for one document.
const activeRuns = new Set();

/* ONE resolution path for "what would the AI actually see".
   The pipeline runs it for real; POST /generations/preflight runs it to warn
   the customer BEFORE a document is spent. Sharing it is the only way the
   warning and the finished document can be guaranteed to agree.

   Never throws — every failure is reported in the returned shape, because both
   callers must degrade rather than abort. */
async function resolveGenerationScope({ userId, provider, repo, branch, ruleSetId = '' }) {
  const requested = branch || 'main';
  const out = {
    repo: String(repo || ''), requestedBranch: requested, branch: requested, usedFallback: false,
    // readCount is what the provider returned BEFORE the customer's scope rules;
    // files is what survives them. The difference is the whole point of the check.
    files: [], readCount: 0, listed: 0, coverage: null, note: '', error: '',
    scopeApplied: false, scopeFailed: false, userScoped: false,
    instructions: '', audience: ''
  };
  if (!repo || !String(repo).includes('/')) return out;
  // Authenticated via a connected Source token when possible, unauthenticated
  // for public repositories otherwise.
  let token = '';
  try {
    const src = await prisma.source.findFirst({ where: { userId, provider } });
    if (src && src.token) token = await freshToken(src);
  } catch { /* public-repo fallback */ }
  let got;
  try {
    got = await fetchRepoFilesResolved(provider, repo, requested, token);
  } catch (e) {
    out.error = (e && e.message) || 'source could not be read';
    return out;
  }
  out.branch = got.branch || requested;
  out.usedFallback = !!got.usedFallback;
  out.listed = got.listed || 0;
  out.coverage = got.coverage || null;
  out.note = got.note || '';
  out.error = got.error || '';
  out.files = got.files || [];
  out.readCount = out.files.length;
  if (!out.readCount) return out;
  // An exclusion the customer wrote is a security boundary, not a hint — so
  // scoping only ever REMOVES files. If the rules cannot be resolved at all the
  // safe answer is to send nothing rather than guess.
  try {
    const eff = await resolveEffectiveConfig(userId, provider, repo, out.branch, { ruleSetId: String(ruleSetId || '') });
    out.files = out.files.filter((f) => passesScan(f.path, eff.config));
    out.scopeApplied = true;
    out.instructions = eff.instructions || '';
    out.audience = (eff.config.product && eff.config.product.audience) || '';
    // Whether the customer actually WROTE a scope. Docify's own default
    // excludes (lockfiles, node_modules, dist, vendor) can empty the list
    // unaided, and telling someone to widen rules they never wrote sends them
    // hunting for a file that does not exist.
    out.userScoped = Boolean(eff.ruleSet) || Boolean(eff.sources && (eff.sources.yaml || eff.sources.ignoreFile));
  } catch (e) {
    console.error('effective-config resolution failed, scoping to no files:', e.message);
    out.files = [];
    out.scopeFailed = true;
  }
  return out;
}

// Why a scope filter emptied the file list. One explanation, worded for when it
// is said — preflight warns before the run, the pipeline records it after — but
// both are built from the same resolved facts, so they cannot disagree.
function scopeEmptyReason(scope, tense = 'past') {
  const reach = tense === 'future' ? 'none would be sent to the AI' : 'none were sent to the AI';
  return scope.userScoped
    ? 'All ' + scope.readCount + ' files read from ' + scope.repo +
      ' are excluded by your documentation scope — ' + reach +
      '. Widen docify.yaml, .docifyignore, or the assigned rule set to include source files.'
    : 'All ' + scope.readCount + ' files read from ' + scope.repo +
      ' are lockfiles, dependencies, or build output, which Docify never sends to the AI. Point it at a branch containing source code.';
}

// The requested branch held no readable source. Same two facts either way.
function branchFallbackReason(scope, tense = 'past') {
  return 'Branch "' + scope.requestedBranch + '" had no readable source, so Docify ' +
    (tense === 'future' ? 'would document' : 'documented') + ' "' + scope.branch +
    '" — this repository\'s default branch.';
}

// Non-repository source material selected in the wizard, read from the SAME
// output keys the pipeline reads. Counting them is what separates "this
// document would be template-only" from "this document is grounded in Jira".
function connectorSelection(output = {}) {
  const list = (k) => (Array.isArray(output[k]) ? output[k] : []);
  const sel = {
    jiraIssues: list('jiraIssues').length,
    openapiSpecs: list('openapiSpecs').length,
    notionPages: list('notionPages').length,
    confluencePages: list('confluencePages').length
  };
  sel.total = sel.jiraIssues + sel.openapiSpecs + sel.notionPages + sel.confluencePages;
  return sel;
}

async function runPipeline(genId) {
  if (activeRuns.has(genId)) return;
  activeRuns.add(genId);
  try {
    await runPipelineOnce(genId);
  } finally {
    activeRuns.delete(genId);
  }
}

async function runPipelineOnce(genId) {
  // Captured up front so the failure path can refund the reservation even when
  // the row itself is unreadable — that is exactly when a customer is most
  // likely to be charged for nothing.
  let ownerId = '';
  // A row that ALREADY holds a delivered document must never be refunded: an
  // automation run updates the mapped document in place, and a crash-recovery
  // resume can re-enter this function long after the original run succeeded.
  // Refunding then would hand back documents the customer actually received.
  let alreadyDelivered = false;
  try {
    const gen = await prisma.generation.findUnique({ where: { id: genId } });
    if (!gen) return;
    ownerId = gen.userId;
    alreadyDelivered = Boolean(gen.content);
    // Real stage tracking: each `mark` fires when actual work reaches that
    // boundary, writing step + stage label + detail + % (never a timer).
    const stages = pipelineStages({ provider: gen.provider, skillName: gen.skillName, instructions: gen.instructions });
    const idxOf = (key) => stages.findIndex((s) => s.key === key);
    const mark = async (key, detail = '') => {
      const s = stages.find((x) => x.key === key);
      if (!s) return;
      await prisma.generation.update({ where: { id: genId }, data: { status: 'running', step: idxOf(key), stage: s.label, stageDetail: String(detail || '').slice(0, 200), progress: s.progress } });
    };
    const setPreview = async (html) => { try { await prisma.generation.update({ where: { id: genId }, data: { preview: String(html).slice(0, 400000) } }); } catch { /* ignore */ } };
    await mark('parse');
    // Real repository content when available, resolved through the SAME helper
    // POST /generations/preflight uses: branch → file list → the customer's
    // scope rules. Jira-only generations have no repository — an empty file set
    // is valid as long as the connector bundles (below) provide source material.
    //
    // The branch that actually produced files is not necessarily the one asked
    // for. Everything downstream (scope rules, docify.yaml lookup, the stored
    // record) must use the REAL branch, or a repo whose trunk is "master"
    // silently documents nothing while still consuming quota.
    const scope = await resolveGenerationScope({
      userId: gen.userId, provider: gen.provider, repo: gen.repo, branch: gen.branch,
      ruleSetId: String(j(gen.output, {}).ruleSetId || '')
    });
    const usedBranch = scope.branch;
    let branchNote = '';
    if (scope.usedFallback) {
      branchNote = branchFallbackReason(scope, 'past');
      console.warn('[branch] ' + gen.repo + ': ' + branchNote);
    }
    if (scope.error) console.error('repo fetch skipped (' + gen.repo + '): ' + scope.error);
    if (usedBranch !== gen.branch) {
      await prisma.generation.update({ where: { id: genId }, data: { branch: usedBranch } }).catch(() => {});
    }
    await mark('extract', scope.readCount ? scope.readCount + ' files read from ' + usedBranch : 'reading source');
    // Unified rules engine: the same rule sets + docify.yaml that govern
    // automation and Doc sync also scope NORMAL generation — files outside the
    // configured scan scope never reach the AI, and rule-set instructions /
    // audience travel with the prompt. Ending up with no files is the same
    // situation as a repository that could not be fetched, which the pipeline
    // already handles, so this degrades rather than hard-failing a run that
    // would otherwise succeed.
    const effInstructions = scope.instructions;
    const effAudience = scope.audience;
    let scopedFiles = scope.files;
    let scopeNote = '';
    if (scope.readCount) {
      if (scope.scopeFailed) {
        scopeNote = 'Your documentation rules could not be read, so no repository files were sent to the AI. Please retry.';
      } else if (!scopedFiles.length) {
        scopeNote = scopeEmptyReason(scope, 'past');
      }
      if (scopeNote) {
        console.warn('[scope] ' + gen.repo + ': ' + scopeNote);
        await mark('extract', 'no files in scope');
      }
    } else if (gen.repo && gen.repo.includes('/')) {
      // No files at all, on the requested branch OR the repository's default.
      // Say so plainly — but ONLY when the repository was the intended source.
      // A Jira-, spec-, Notion- or Confluence-based generation legitimately has
      // no repository files, and warning there would call a perfectly grounded
      // document broken.
      const oc = j(gen.output, {});
      const hasOtherSource = ['jiraIssues', 'openapiSpecs', 'notionPages', 'confluencePages']
        .some((k) => Array.isArray(oc[k]) && oc[k].length);
      if (!hasOtherSource) {
        scopeNote = 'No readable source files were found in ' + gen.repo + ' on "' + usedBranch +
          '". Check the repository and branch, and that Docify has access to it — this document was built from its structure only, not your code.';
        console.warn('[scope] ' + gen.repo + ': ' + scopeNote);
      }
    }
    // A silent branch switch would be its own honesty problem: tell the user
    // which branch was actually read.
    if (branchNote) scopeNote = scopeNote ? branchNote + ' ' + scopeNote : branchNote;
    // Repository files that survived scoping, captured BEFORE the connector
    // bundles are prepended — the stored provenance has to distinguish "12
    // files from your repo" from "12 Jira issues".
    const scopedRepoCount = scopedFiles.length;
    // NON-REPOSITORY sources become real source material: every selected
    // Jira issue, OpenAPI spec, Notion page, and Confluence page is fetched
    // and normalized to markdown the AI reads alongside — or instead of —
    // repository files. Each connector fails independently; one unreachable
    // source never blocks the others.
    const oc0 = j(gen.output, {});
    try {
      const jkeys = [...new Set((oc0.jiraIssues || []).map((k) => String(k).toUpperCase()))].slice(0, 20);
      if (jkeys.length) {
        const jsrc = await prisma.source.findFirst({ where: { userId: gen.userId, provider: 'jira' } });
        if (jsrc && jsrc.token) {
          const bundles = await fetchJiraIssuesContent(jsrc.detail, jsrc.token, jkeys);
          scopedFiles = [...bundles.map((b) => ({ path: 'jira/' + b.key + '.md', content: b.md })), ...scopedFiles];
        }
      }
    } catch (e) { console.error('jira grounding skipped:', e.message); }
    try {
      const specs = Array.isArray(oc0.openapiSpecs) ? oc0.openapiSpecs.slice(0, 5) : [];
      for (const s of specs) {
        try {
          const text = await loadSpecText(s.source || {}, {
            repoFileFetcher: async (provider, repo, branch, path) => {
              let token = '';
              try {
                const src = await prisma.source.findFirst({ where: { userId: gen.userId, provider } });
                token = await freshToken(src);
              } catch { /* public */ }
              return fetchRepoFile(provider, repo, branch, path, token);
            }
          });
          const spec = parseSpecText(text);
          const analysis = analyzeSpec(spec);
          scopedFiles = [{
            path: 'openapi/' + (analysis.title || 'spec').replace(/[^\w.-]+/g, '-').toLowerCase() + '.md',
            content: digestSpec(spec, analysis, Array.isArray(s.ops) ? s.ops : null)
          }, ...scopedFiles];
        } catch (e) { console.error('openapi spec skipped:', e.message); }
      }
    } catch (e) { console.error('openapi grounding skipped:', e.message); }
    try {
      const pages = Array.isArray(oc0.notionPages) ? oc0.notionPages.slice(0, 15) : [];
      if (pages.length) {
        const nsrc = await prisma.source.findFirst({ where: { userId: gen.userId, provider: 'notion' } });
        if (nsrc && nsrc.token) {
          const bundles = await fetchNotionContent(nsrc.token, pages, { includeChildren: !!oc0.notionChildren });
          scopedFiles = [...bundles.map((b) => ({ path: 'notion/' + b.title.replace(/[^\w.-]+/g, '-').toLowerCase().slice(0, 60) + '.md', content: b.md })), ...scopedFiles];
        }
      }
    } catch (e) { console.error('notion grounding skipped:', e.message); }
    try {
      const pages = Array.isArray(oc0.confluencePages) ? oc0.confluencePages.slice(0, 15) : [];
      if (pages.length) {
        const csrc = await prisma.source.findFirst({ where: { userId: gen.userId, provider: 'confluence' } });
        if (csrc && csrc.token) {
          const bundles = await fetchConfluenceContent(csrc.detail, csrc.token, pages.map((p) => p.id || p), { includeChildren: !!oc0.confluenceChildren });
          scopedFiles = [...bundles.map((b) => ({ path: 'confluence/' + b.title.replace(/[^\w.-]+/g, '-').toLowerCase().slice(0, 60) + '.md', content: b.md })), ...scopedFiles];
        }
      }
    } catch (e) { console.error('confluence grounding skipped:', e.message); }
    await mark('analyse', scopedFiles.length + ' files in scope');
    const baseBrief = j(gen.brief, {});
    // CONTENT GOVERNANCE: resolve one writing policy from the layered
    // profiles (platform → track base → document type → tenant profile →
    // skill.md → manual instructions), compile it into a deterministic
    // style block, and keep the resolved policy with the generation for
    // audit and reproducibility.
    let stylePolicy = null;
    try {
      const tenant = await prisma.writingProfile.findUnique({ where: { userId: gen.userId } });
      stylePolicy = resolveWritingPolicy({
        track: gen.track, docType: (j(gen.docTypes, []))[0] || '', format: gen.format,
        brief: { ...baseBrief, audience: baseBrief.audience || effAudience },
        tenant, skillText: gen.skill || '', instructions: gen.instructions || '',
        guide: oc0.styleGuide || '' // per-pipeline style guide (falls back to tenant/default when '')
      });
    } catch (e) { console.error('writing policy skipped:', e.message); }
    // The pricing page says free-plan documents are watermarked, so they are —
    // applied server-side where the customer cannot switch it off.
    const genOutput = j(gen.output, {});
    let planForGen = 'free';
    try {
      const owner = await prisma.user.findUnique({ where: { id: gen.userId }, select: { plan: true } });
      planForGen = (owner && owner.plan) || 'free';
    } catch { /* default to the most restrictive */ }
    // Unconditional: a user-supplied blank-but-truthy value (" ") would
    // otherwise pass the || check and silently disable the watermark, since
    // the exporters trim before deciding whether to stamp.
    if (planLimits(planForGen).watermark) {
      const own = String(genOutput.watermark || '').trim();
      genOutput.watermark = own || 'Free plan';
    }
    const genArgs = {
      track: gen.track, docTypes: j(gen.docTypes, []), format: gen.format,
      repo: gen.repo,
      instructions: [gen.instructions, effInstructions ? 'Documentation rules for this repository:\n' + effInstructions : '']
        .filter(Boolean).join('\n\n'),
      skill: gen.skill || '', skillName: gen.skillName || '',
      style: stylePolicy ? compileStylePrompt(stylePolicy) : '',
      brief: { ...baseBrief, audience: baseBrief.audience || effAudience },
      output: genOutput, files: scopedFiles
    };
    if (idxOf('skill') >= 0) await mark('skill');
    if (idxOf('custom') >= 0) await mark('custom');
    await setPreview(metaPreviewHtml(gen, scopedFiles.length));
    await mark('generate', (j(gen.docTypes, []).length > 1) ? j(gen.docTypes, []).length + ' documents' : 'Drafting sections');
    let { title, content, structure, aiDocs } = await generateDocumentSmart(genArgs);
    // Deterministic post-generation pass: safe terminology corrections are
    // applied to the AI sections, then the document re-renders once so every
    // format inherits the corrected wording.
    if (stylePolicy && aiDocs && aiDocs.length) {
      let totalFixes = 0;
      aiDocs = aiDocs.map((d) => ({
        ...d,
        sections: (d.sections || []).map(([h, b]) => {
          const fh = autofixText(h, stylePolicy);
          const fb = autofixText(b, stylePolicy);
          totalFixes += fh.fixes + fb.fixes;
          return [fh.text, fb.text];
        })
      }));
      if (totalFixes > 0) {
        const rr = generateDocument({ ...genArgs, aiDocs });
        title = rr.title; content = rr.content; structure = rr.structure;
      }
    }
    // NEVER replace a previously grounded document with template fallback:
    // if this regeneration could not ground (repo fetch or AI failure) but
    // the existing row carries real AI sections from an earlier run, keep
    // them and re-render from those sections instead of degrading.
    const prevAiDocs = j(gen.aiDocs, []);
    let keptPreviousSections = false;
    if (!(aiDocs && aiDocs.length) && prevAiDocs.length) {
      aiDocs = prevAiDocs;
      keptPreviousSections = true;
      const kept = generateDocument({ ...genArgs, aiDocs });
      title = kept.title;
      content = kept.content;
      structure = kept.structure;
    }
    await mark('style');
    await setPreview(outlinePreviewHtml(title, content));
    // Rendered preview for the UI: same engine, HTML target, same options —
    // so the preview shows exactly what the user configured, for every format.
    // aiDocs (when real generation ran) are reused — no second API call.
    const previewHtml = gen.format === 'html'
      ? content
      : generateDocument({ ...genArgs, format: 'html', aiDocs }).content;
    await mark('quality');
    // Judge the ACTUAL document (content-aware checks), not a canned sample.
    const report = judge({ content, title, repo: gen.repo, track: gen.track });
    // Writing-consistency audit: scores + concrete findings ("Preferred term:
    // sign in · Detected: log in · 4 occurrences"). Findings join the style
    // checks; scores travel in the generation's output for the quality panel.
    let styleReport = null;
    if (stylePolicy) {
      try {
        styleReport = styleAudit(content, stylePolicy);
        report.style = [
          ...styleReport.findings.map((f) => ({
            t: (f.kind === 'terminology' ? 'Terminology: “' + f.detected + '” → “' + f.preferred + '”'
              : f.kind === 'prohibited' ? 'Prohibited term: “' + f.detected + '”'
              : f.kind === 'structure' ? 'Structure: ' + f.preferred
              : 'Voice: ' + f.detected),
            d: f.occurrences + ' occurrence' + (f.occurrences === 1 ? '' : 's') + ' — ' + f.action,
            pass: /Auto-corrected/.test(f.action)
          })),
          ...report.style
        ];
      } catch (e) { console.error('style audit skipped:', e.message); }
    }
    await mark('ai', 'Scoring ChatGPT · Claude · Gemini');
    await mark('preview');
    await setPreview(previewHtml);
    await mark('finalize');
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
    // Audit trail: the resolved policy (without raw custom text) + the
    // consistency scores ride in the generation's output JSON.
    // genOutput (not gen.output) so the free-plan watermark persists onto the
    // row — every later download re-renders from here.
    const outWithPolicy = { ...genOutput };
    if (stylePolicy) {
      const { _skillText, _manualText, ...auditPolicy } = stylePolicy;
      outWithPolicy.resolvedPolicy = auditPolicy;
    }
    if (styleReport) outWithPolicy.styleReport = styleReport;
    // PROVENANCE: exactly what grounded THIS run, so the UI can describe the
    // finished document truthfully instead of implying the whole repository
    // was read. Every number here is counted, not estimated.
    outWithPolicy.grounding = {
      branch: usedBranch,
      requestedBranch: gen.branch,
      usedFallbackBranch: usedBranch !== gen.branch,
      // Source items actually handed to the model, split by where they came from.
      files: scopedFiles.length,
      repoFiles: scopedRepoCount,
      connectorFiles: Math.max(0, scopedFiles.length - scopedRepoCount),
      // What the caps left behind: the fetcher reads at most 12 files, so
      // "read 12 of 168 eligible" is the honest way to say it.
      filesRead: (scope.coverage && scope.coverage.read) || 0,
      filesEligible: (scope.coverage && scope.coverage.eligible) || 0,
      coverageNote: scope.note || '',
      // True when this run produced no AI sections and the previous run's were
      // re-rendered instead — the counts above then describe an attempt, not
      // the source of the text on the page.
      keptPreviousSections,
      at: new Date().toISOString()
    };
    // IMPORT HISTORY: when regeneration replaces existing content, the
    // outgoing document is snapshotted as a version first — nothing is ever
    // silently lost — and the approval state resets: a changed document is a
    // new draft (or goes straight to Under review when the automation
    // profile's approval gate is on).
    const approvalPatch = {};
    try {
      if (gen.content && content && gen.content !== content) {
        // `gen` was read when the run started, minutes ago. DocVersion has no
        // foreign key to User or Generation, so if the account was deleted
        // mid-run this snapshot would persist document text belonging to an
        // account that no longer exists — unreachable, and missed by the
        // deletion handler that already ran. Confirm the owner is still there.
        const ownerStillExists = await prisma.user.count({ where: { id: gen.userId } });
        if (!ownerStillExists) {
          console.warn('[pipeline] skipping version snapshot for ' + genId + ': account was deleted mid-run');
          throw new Error('account deleted during generation');
        }
        const n = await prisma.docVersion.count({ where: { generationId: genId } });
        await prisma.docVersion.create({
          data: {
            userId: gen.userId, generationId: genId, version: n + 1,
            title: gen.title || '', content: gen.content,
            aiDocs: gen.aiDocs || '[]', score: gen.score || 0,
            note: 'Replaced by regeneration'
          }
        });
        approvalPatch.approval = outWithPolicy.approvalGate ? 'review' : 'draft';
        approvalPatch.approvedAt = null;
      } else if (!gen.content && content && outWithPolicy.approvalGate) {
        approvalPatch.approval = 'review';
      }
    } catch (e) { console.error('version snapshot skipped:', e.message); }
    await prisma.generation.update({
      where: { id: genId },
      data: {
        status: 'complete', title, content, preview: previewHtml,
        // A scope warning is persisted (not just logged) so the user can see
        // why a document came out thin instead of assuming Docify is broken.
        progress: 100, stage: 'Complete', stageDetail: scopeNote.slice(0, 200),
        aiDocs: JSON.stringify(aiDocs || []),
        output: JSON.stringify(scopeNote ? { ...outWithPolicy, scopeWarning: scopeNote } : outWithPolicy),
        score: aiScore(report.issues.length, 0),
        ...approvalPatch
      }
    });
  } catch (e) {
    console.error('generation pipeline failed:', e && e.message);
    await prisma.generation.update({ where: { id: genId }, data: { status: 'failed', stage: 'Failed', stageDetail: String((e && e.message) || '').slice(0, 200) } }).catch(() => {});
    // A failed run delivered nothing, so it must not consume the customer's
    // monthly allowance. The reservation is keyed to this generation, so the
    // refund is exact — and re-running the same id cannot double-refund,
    // because a completed run never reaches this branch.
    if (ownerId && !alreadyDelivered) {
      try { await releaseDocumentQuota(ownerId, genId); }
      catch (releaseErr) { console.error('quota refund skipped:', releaseErr.message); }
    }
  }
}

/* ---------------- Crash/deploy recovery ----------------
   A deploy restarts the process and kills in-flight pipelines, leaving
   generations frozen at "running" forever. On boot, every orphaned run is
   resumed automatically — the kept-aiDocs guard inside runPipeline ensures a
   resume can only improve a row, never degrade grounded content. */
async function recoverStuckGenerations() {
  // Every worker in the cluster runs this module, so the sweep is confined to
  // one process — otherwise each worker resumes the same rows in parallel.
  // Same stable designation as the sampler: cluster.worker.id keeps climbing
  // across respawns, which would leave every worker declining the sweep and
  // interrupted generations stranded forever.
  if (cluster.isWorker && !isSingletonWorker()) return;
  try {
    const stuck = await prisma.generation.findMany({
      where: {
        status: { in: ['queued', 'running'] },
        // A row minted seconds ago belongs to a request that is still running
        // (possibly in another worker) — resuming it would double-start a live
        // pipeline. Generation has no updatedAt column, so creation time is the
        // recency signal available here.
        createdAt: { lt: new Date(Date.now() - 60000) }
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      // Only the id is used. Without this the sweep pulls ten full documents
      // (content + preview + aiDocs) out of the database every five minutes.
      select: { id: true }
    });
    const resumable = stuck.filter((g) => !activeRuns.has(g.id));
    if (resumable.length) {
      console.log('recovery: resuming ' + resumable.length + ' interrupted generation(s)');
      resumable.forEach((g, i) => setTimeout(() => runPipeline(g.id).catch((e) => console.error('recovery run failed:', e.message)), i * 4000));
    }
  } catch (e) { console.error('recovery scan skipped:', e.message); }
}
// Running this only at boot recovers a deploy, but not a crash: when a worker
// dies mid-pipeline its rows stay "running" until the NEXT restart, and the
// customer keeps watching a spinner for a document they were already charged
// for. Sweeping on an interval closes that window without a scheduler.
setTimeout(recoverStuckGenerations, 8000).unref?.();
setInterval(recoverStuckGenerations, 5 * 60 * 1000).unref?.();

/* ---------------- Pre-generation check ----------------
   Same request body as POST /generations, but it spends nothing: no model
   call, no quota reservation, no rows written. It runs the SAME resolution the
   pipeline runs — real branch, real file list, the customer's own scope rules
   — and reports what generation would actually see, so a thin result is
   predicted BEFORE a document is spent rather than explained afterwards.

   Every warning is emitted only when the underlying fact is true of THIS
   request; nothing here is a fixed list, a guess, or a model opinion. And it is
   advisory only: it never writes, never blocks, and any internal failure is
   reported as "could not check" rather than as a reason not to generate. */

// A spec among the sources is what makes an API reference a reference rather
// than a description of the code that implements it. Detected from the real
// resolved files — path first, then a content sniff — never assumed.
const SPEC_PATH_RE = /(^|\/)(openapi|swagger)[^/]*\.(ya?ml|json)$/i;
const SPEC_YAML_RE = /^\s*(openapi|swagger)\s*:\s*["']?\d/im;
const SPEC_JSON_RE = /"(openapi|swagger)"\s*:\s*"\d/;
function looksLikeSpec(f) {
  if (SPEC_PATH_RE.test(String(f.path || ''))) return true;
  const head = String(f.content || '').slice(0, 4000);
  return SPEC_YAML_RE.test(head) || SPEC_JSON_RE.test(head);
}

apiRouter.post('/generations/preflight', async (req, res) => {
  const b = req.body || {};
  const warnings = [];
  const warn = (id, level, title, detail) => warnings.push({ id, level, title, detail });
  const provider = ['github', 'gitlab', 'bitbucket'].includes(b.provider) ? b.provider : 'github';
  const repo = String(b.repo || '');
  const track = b.track === 'marketing' ? 'marketing' : 'technical';
  const docTypes = (Array.isArray(b.docTypes) ? b.docTypes : []).map(String).slice(0, 20);
  const output = b.output && typeof b.output === 'object' ? b.output : {};
  const requestedFormats = [...new Set((Array.isArray(b.formats) && b.formats.length ? b.formats : [b.format])
    .filter(Boolean).map(String))];
  const connectors = connectorSelection(output);

  // 1 — Allowance. No network, always answerable, and the one refusal that
  // stops the run outright at POST /generations.
  const limit = planLimits(req.user.plan).docsPerMonth;
  let used = null;
  try { used = await documentsUsedThisMonth(req.uid); } catch (e) { console.error('preflight usage read failed:', e.message); }
  const wanted = Math.max(1, docTypes.length);
  const remaining = (limit == null || used == null) ? null : Math.max(0, limit - used);
  if (remaining != null && wanted > remaining) {
    warn('quota', 'error',
      remaining === 0 ? 'No documents left this month' : 'Not enough documents left this month',
      quotaError(req.user.plan, limit, used, wanted).error);
  }

  // 2 — Catalog and entitlement, using the same helpers POST /generations
  // enforces with, so "ok" here can never mean "refused there".
  const known = new Set((DOCTYPES[track] || []).map((d) => d.id));
  const badType = docTypes.find((d) => !known.has(d));
  if (!docTypes.length) warn('doc-type', 'error', 'No document type selected', 'Choose at least one document type to generate.');
  else if (badType) warn('doc-type', 'error', 'Unknown document type', 'This plan\'s catalog has no document type "' + badType + '" on the ' + track + ' track.');
  for (const f of requestedFormats) {
    const def = formatDef(track, f);
    if (!def) { warn('format', 'error', 'Unknown format', 'No output format called "' + f + '" exists on the ' + track + ' track.'); continue; }
    if (!def.ok) { warn('format', 'error', def.name + ' is not supported yet', def.name + ' cannot be produced today, so this run would be refused.'); continue; }
    if (!formatAllowed(req.user.plan, f)) {
      warn('plan-format', 'error', def.name + ' is not in your plan',
        def.name + ' is not included in the ' + (PLANS[req.user.plan] || PLANS.free).name + ' plan, so this run would be refused. Upgrade, or choose an included format.');
    }
  }

  // 3 — The real source resolution: exactly what the pipeline will do.
  let scope = null;
  let checked = false;
  try {
    scope = await resolveGenerationScope({
      userId: req.uid, provider, repo, branch: String(b.branch || 'main'),
      ruleSetId: String(output.ruleSetId || '')
    });
    checked = true;
  } catch (e) {
    // The helper is written not to throw; if it ever does, say the check did
    // not run instead of reporting a repository as empty.
    console.error('preflight scope resolution failed:', e && e.message);
    warn('precheck-unavailable', 'info', 'Source check could not run',
      'Docify could not inspect the repository just now, so this check says nothing about it. Generation is unaffected.');
  }

  const fileCount = scope ? scope.files.length : 0;
  const branchUsed = scope ? scope.branch : String(b.branch || 'main');
  const hasRepo = Boolean(repo && repo.includes('/'));

  if (scope && hasRepo) {
    if (scope.error) {
      warn('source-unreadable', 'error', 'The repository could not be read', scope.error);
    } else if (scope.usedFallback) {
      warn('branch-fallback', 'warning', 'Branch "' + scope.requestedBranch + '" has no readable source',
        branchFallbackReason(scope, 'future'));
    }
    if (scope.scopeFailed) {
      warn('scope-unreadable', 'error', 'Your documentation rules could not be read',
        'Docify never guesses at exclusions, so no repository files would be sent to the AI. Retry, or check the rule set assigned to this repository.');
    } else if (scope.readCount && !fileCount) {
      warn('scope-excludes-all', 'warning', 'Every file is excluded by your scope rules',
        scopeEmptyReason(scope, 'future'));
    }
    // What the per-run caps leave behind, straight from the fetcher's own count.
    if (scope.note && scope.coverage && scope.coverage.omittedFiles > 0) {
      warn('coverage', 'info', 'Not every file fits in one run', scope.note +
        ' Docify reads the highest-ranked files first; the rest do not reach the AI.');
    }
  }

  // 4 — Nothing to write from: no repository files AND no connector sources.
  // This is the case that produces a template-shaped document, which is the
  // outcome a customer most resents paying for.
  const willGround = fileCount > 0 || connectors.total > 0;
  if (!willGround) {
    warn('no-grounding', 'error', 'Nothing to write from',
      (hasRepo
        ? 'No source files from ' + repo + ' on "' + branchUsed + '" would reach the AI, and no Jira issues, OpenAPI specs, Notion or Confluence pages are selected. '
        : 'No repository is selected and no Jira issues, OpenAPI specs, Notion or Confluence pages are selected. ') +
      'The document would be built from its template structure only — headings and standard guidance, not your product.');
  }

  // 5 — An API reference with no spec anywhere among the sources. Checked
  // against the real resolved files, not assumed from the document type.
  if (docTypes.includes('api') && !connectors.openapiSpecs) {
    const specInRepo = scope ? scope.files.some(looksLikeSpec) : false;
    if (!specInRepo) {
      warn('no-spec', 'warning', 'No API spec among the sources',
        'An API reference is strongest when it is generated from an OpenAPI or Swagger spec. None was selected and none was found in the files in scope, so the endpoints, parameters, and status codes would be inferred from source code' +
        (willGround ? '' : ' — and there is no source code in scope either') + '.');
    }
  }

  res.json({
    // ok is false only when something would actually refuse the run or leave it
    // with nothing to say. Warnings alone never mean "do not generate".
    ok: !warnings.some((w) => w.level === 'error'),
    willGround,
    // Repository files that would reach the AI. Connector items are counted
    // separately below, because a Jira-only run has 0 files and is still grounded.
    fileCount,
    branchUsed,
    checked,
    sources: {
      repositoryFiles: fileCount,
      repositoryFilesRead: scope ? scope.readCount : 0,
      repositoryFilesEligible: (scope && scope.coverage && scope.coverage.eligible) || 0,
      jiraIssues: connectors.jiraIssues,
      openApiSpecs: connectors.openapiSpecs,
      notionPages: connectors.notionPages,
      confluencePages: connectors.confluencePages
    },
    documentsRequested: wanted,
    quota: { used, limit, remaining },
    warnings
  });
});

apiRouter.post('/generations', async (req, res) => {
  const { repo, branch = 'main', track, docTypes, format, formats, instructions = '', files = [], provider = 'github', skillName = '', skill = '', brief = null, output = null } = req.body || {};
  if (String(skill).length > 60000) return res.status(400).json({ error: 'SKILL.md is too large (60 KB max)' });
  if (track !== 'technical' && track !== 'marketing') return res.status(400).json({ error: 'Invalid track' });
  if (!Array.isArray(docTypes) || docTypes.length === 0) return res.status(400).json({ error: 'Select at least one document type' });
  // Validate BEFORE reserving quota: an unknown document type used to run the
  // whole pipeline and bill the customer a document for output nobody asked for.
  const knownTypes = new Set((DOCTYPES[track] || []).map((d) => d.id));
  const badType = docTypes.map(String).find((d) => !knownTypes.has(d));
  if (badType) return res.status(400).json({ error: 'Unknown document type: ' + badType });
  // One or many output formats: `formats` (ordered, deduped) wins when sent;
  // the single `format` field keeps every existing client working unchanged.
  const requested = [...new Set((Array.isArray(formats) && formats.length ? formats : [format]).map(String))];
  if (!requested.length || !requested[0]) return res.status(400).json({ error: 'Select at least one output format' });
  for (const f of requested) {
    const def = formatDef(track, f);
    if (!def) return res.status(400).json({ error: 'Unknown format: ' + f });
    if (!def.ok) return res.status(400).json({ error: def.name + ' is not currently supported. We will add support for it in a future release.' });
    // The pricing table sells export formats by tier; enforce that here, or
    // the paid tiers advertise a difference the product does not deliver.
    if (!formatAllowed(req.user.plan, f)) {
      return res.status(402).json({
        error: def.name + ' is not included in the ' + (PLANS[req.user.plan] || PLANS.free).name + ' plan. Upgrade to export it.',
        format: f, upgrade: true
      });
    }
  }
  const primaryFormat = requested[0];
  const fmt = formatDef(track, primaryFormat);
  // Enforce the advertised monthly document cap before spending on the model.
  // The generation id is minted here so the reservation carries it: a run that
  // fails outright can then hand the documents back (see runPipeline).
  const genId = 'gen_' + (await import('node:crypto')).randomBytes(12).toString('hex');
  const wanted = Math.max(1, docTypes.length);
  const over = await reserveDocumentQuota(req.uid, req.user.plan, wanted, { generationId: genId, trigger: 'manual' });
  if (over) return res.status(402).json({ ...over, upgrade: true });
  const steps = buildSteps({ provider, instructions, skillName });
  let gen;
  try {
    gen = await prisma.generation.create({
      data: {
        id: genId,
        userId: req.uid, repo: repo || provider, branch, track,
        provider: ['github', 'gitlab', 'bitbucket'].includes(provider) ? provider : 'github',
        docTypes: JSON.stringify(docTypes), format: primaryFormat, instructions,
        files: JSON.stringify(files), skillName: String(skillName), skill: String(skill),
        brief: JSON.stringify(brief || {}),
        output: JSON.stringify({ ...(output || {}), formats: requested }),
        status: 'queued', steps: JSON.stringify(steps)
      }
    });
  } catch (e) {
    // The reservation is taken before this row exists, and runPipeline (which
    // owns the failure refund) never starts if the row was never written — so
    // the documents would stay consumed for a run that produced nothing. Hand
    // them back here, then let the error surface.
    await releaseDocumentQuota(req.uid, genId);
    throw e;
  }
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
  res.json({ generation: serializeGen(g, { withOutputs: true, plan: req.user.plan }) });
});

apiRouter.get('/generations/:id/download', async (req, res) => {
  const g = await prisma.generation.findFirst({ where: { id: req.params.id, userId: req.uid } });
  if (!g || g.status !== 'complete') return res.status(404).json({ error: 'Not ready' });
  // ?fmt= downloads any format that was requested for this generation;
  // without it the primary format keeps the old behavior exactly.
  let wanted = req.query.kind === 'report' ? g.format : String(req.query.fmt || g.format);
  // Never 400 a valid generation over a format quirk — fall back to its primary.
  if (!genFormats(g).includes(wanted)) wanted = g.format;
  // A downgrade after generating must not keep handing out paid formats.
  if (req.query.kind !== 'report' && !formatAllowed(req.user.plan, wanted)) {
    const def = formatDef(g.track, wanted);
    return res.status(402).json({
      error: ((def && def.name) || wanted) + ' downloads are not included in the ' +
        (PLANS[req.user.plan] || PLANS.free).name + ' plan. Upgrade to export it.',
      upgrade: true
    });
  }
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
    const reqFmt = String(req.query.fmt || 'html').toLowerCase();
    const preset = ['executive', 'full', 'technical'].includes(String(req.query.preset)) ? String(req.query.preset) : 'full';
    // One model → HTML, PDF, and PowerPoint all render the SAME numbers.
    const meta = {
      title: g.title, repo: g.repo, branch: g.branch, format: g.format,
      docType: docTypeName(g.track, j(g.docTypes, [])[0]),
      commit: req.query.commit ? String(req.query.commit) : '',
      pr: req.query.pr ? String(req.query.pr) : '',
      version: req.query.version ? String(req.query.version) : null,
      reviewStatus: g.approval === 'approved' ? 'Approved · Published' : g.approval === 'review' ? 'In review' : (ser.gatePassed ? 'Publish-ready' : 'Review recommended')
    };
    if (reqFmt === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename="' + traceableReportName(meta, 'json', preset) + '"');
      res.setHeader('Content-Type', 'application/json');
      return res.send(JSON.stringify({
        generatedAt: new Date().toISOString(),
        document: { title: g.title, repo: g.repo, format: g.format, track: g.track },
        scores: { overall: ser.overall, verdict: ser.verdict, gate: ser.gate, gatePassed: ser.gatePassed },
        dimensions: ser.dimensions, assistants: ser.assistants, issues: ser.issues, links: ser.links, style: ser.style
      }, null, 2));
    }
    const model = buildReportModel(ser, meta);
    const fname = traceableReportName(meta, reqFmt, preset);
    try {
      if (reqFmt === 'pdf') {
        const buf = await renderReportPdf(model, { preset });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="' + fname + '"');
        return res.send(buf);
      }
      if (reqFmt === 'pptx') {
        const buf = await renderReportPptx(model, { preset });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', 'attachment; filename="' + fname + '"');
        return res.send(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="' + fname + '"');
      return res.send(renderReportHtml(model, { preset }));
    } catch (e) {
      return res.status(500).json({ error: 'Report generation failed: ' + (e.message || 'unknown') });
    }
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
    title: gen ? gen.title || docTypeName(gen.track, j(gen.docTypes, [])[0]) : '',
    // The document's real age, so nothing downstream has to guess at it.
    generatedAt: gen ? gen.createdAt : null
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

/* Re-runs the quality review against the CURRENT document text and rewrites
   the stored findings. It used to sleep and return the same report while the
   UI announced a re-verification, which was a claim the server never made
   good on — after applying fixes the document really has changed, so the
   review has to actually run again for the answer to mean anything. */
apiRouter.post('/quality/:id/recheck', async (req, res) => {
  const rep = await prisma.qualityReport.findUnique({ where: { id: req.params.id }, include: { generation: true } });
  if (!rep || rep.generation.userId !== req.uid) return res.status(404).json({ error: 'Not found' });
  const gen = rep.generation;
  if (!gen.content) {
    // Nothing to re-examine yet: say so rather than implying a fresh pass.
    return res.status(409).json({ error: 'This document has not finished generating yet — re-check once it completes.' });
  }
  const report = judge({ content: gen.content, title: gen.title, repo: gen.repo, track: gen.track });
  let structure = [];
  try {
    const s = generateDocument({
      track: gen.track, docTypes: j(gen.docTypes, []), format: gen.format,
      repo: gen.repo, instructions: gen.instructions, skill: gen.skill || '',
      skillName: gen.skillName || '', brief: j(gen.brief, {}), output: j(gen.output, {}),
      fixes: j(rep.fixedIds, []), aiDocs: j(gen.aiDocs, []).length ? j(gen.aiDocs, []) : null
    });
    structure = s.structure || [];
  } catch (e) { console.error('recheck structure pass skipped:', e.message); }
  let styleReport = null;
  try {
    // The policy must be RE-RESOLVED, not read back from gen.output: that copy
    // went through JSON, which turns its terminology RegExps into {} — and
    // String.match({}) matches almost any prose, so the stored copy invents
    // terminology violations that were never in the document.
    const tenant = await prisma.writingProfile.findUnique({ where: { userId: gen.userId } });
    const oc = j(gen.output, {});
    const policy = resolveWritingPolicy({
      track: gen.track, docType: j(gen.docTypes, [])[0] || '', format: gen.format,
      brief: j(gen.brief, {}), tenant, skillText: gen.skill || '',
      instructions: gen.instructions || '', guide: oc.styleGuide || ''
    });
    if (policy) styleReport = styleAudit(gen.content, policy);
  } catch (e) { console.error('recheck style audit skipped:', e.message); }
  const styleRows = [
    ...structure,
    // Same shape the pipeline writes — styleAudit emits kind/preferred/
    // detected/occurrences/action, so mapping label/detail produced blank rows
    // that every one of them counted as a failure.
    ...(styleReport ? styleReport.findings.map((f) => ({
      t: (f.kind === 'terminology' ? 'Terminology: “' + f.detected + '” → “' + f.preferred + '”'
        : f.kind === 'prohibited' ? 'Prohibited term: “' + f.detected + '”'
        : f.kind === 'structure' ? 'Structure: ' + f.preferred
        : 'Voice: ' + f.detected),
      d: f.occurrences + ' occurrence' + (f.occurrences === 1 ? '' : 's') + ' — ' + f.action,
      pass: /Auto-corrected/.test(f.action)
    })) : []),
    ...report.style
  ];
  // Accepted fixes are kept verbatim. Filtering them to what the fresh rubric
  // still reports looks sensible and is exactly backwards: a fix that WORKED
  // stops being reported, so it would be forgotten — and the next fix would
  // re-render the document without it, silently deleting sections the customer
  // had already accepted.
  const updated = await prisma.qualityReport.update({
    where: { id: rep.id },
    data: {
      issues: JSON.stringify(report.issues),
      links: JSON.stringify(report.links),
      style: JSON.stringify(styleRows),
      fixedIds: rep.fixedIds
    }
  });
  const ser = serializeReport(updated, gen);
  await prisma.generation.update({ where: { id: gen.id }, data: { score: ser.overall } }).catch(() => {});
  res.json({ report: ser, verified: true, rechecked: true });
});

/* Billing */
apiRouter.get('/billing', async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.uid } });
  const p = PLANS[u.plan] || PLANS.free;
  const per = u.plan === 'team' ? (u.billingCycle === 'annual' ? p.annual : p.monthly) : 0;
  // No processor is connected (adapters/stripe.js simulates), so there is no
  // subscription and no invoice date to report. Publishing today+1 month would
  // be inventing a billing event that will never happen.
  const next = new Date();
  if (u.billingCycle === 'annual') next.setFullYear(next.getFullYear() + 1); else next.setMonth(next.getMonth() + 1);
  const billed = u.plan === 'team' && paymentsLive();
  const limits = planLimits(u.plan);
  const usedDocs = await documentsUsedThisMonth(req.uid);
  const pipelines = await prisma.automationProfile.count({ where: { userId: req.uid } });
  res.json({
    plan: u.plan, cycle: u.billingCycle, seats: u.seats, perSeat: per,
    nextInvoice: billed ? next.toISOString().slice(0, 10) : null,
    amount: u.plan === 'team' ? (u.billingCycle === 'annual' ? per * u.seats * 12 : per * u.seats) : 0,
    // Live usage against the advertised caps (null limit = unlimited).
    usage: {
      documents: { used: usedDocs, limit: limits.docsPerMonth },
      pipelines: { used: pipelines, limit: limits.pipelines },
      seats: {
        used: await prisma.teamMember.count({ where: { ownerId: req.uid } }),
        limit: limits.seats === 'purchased' ? Math.max(1, u.seats || 5) : limits.seats
      },
      resetsOn: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
    }
  });
});

/* Account deletion — the privacy policy promises "delete your account and your
   data goes with it", so this must actually erase everything.

   Six models carry a userId but no cascading relation to User (DocVersion,
   Repository, WritingProfile, OrgConnection, RuleSet, RelevanceDecision), so
   deleting the User alone would silently orphan their rows. They are removed
   explicitly here, in one transaction with the user, and this list must grow
   whenever a new user-scoped model is added without an onDelete: Cascade
   relation. Everything else (Identity, Source, Generation, Automation,
   AutomationProfile, SyncDoc + its versions/updates, TeamMember, QualityReport)
   cascades from the User row. */
apiRouter.delete('/account', async (req, res) => {
  const { confirm } = req.body || {};
  const user = await prisma.user.findUnique({ where: { id: req.uid } });
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  // Typing the address is the guard against a misdirected click; the account
  // and every document in it are unrecoverable after this.
  if (String(confirm || '').trim().toLowerCase() !== user.email.toLowerCase()) {
    return res.status(400).json({ error: 'Type your email address exactly to confirm deletion' });
  }
  const uid = req.uid;
  await prisma.$transaction([
    prisma.docVersion.deleteMany({ where: { userId: uid } }),
    prisma.repository.deleteMany({ where: { userId: uid } }),
    prisma.writingProfile.deleteMany({ where: { userId: uid } }),
    prisma.orgConnection.deleteMany({ where: { userId: uid } }),
    prisma.ruleSet.deleteMany({ where: { userId: uid } }),
    prisma.relevanceDecision.deleteMany({ where: { userId: uid } }),
    // Waitlist rows are keyed by email, not userId — they would otherwise
    // keep the address on file after the account is gone.
    prisma.waitlist.deleteMany({ where: { email: user.email } }),
    prisma.user.delete({ where: { id: uid } })
  ]);
  // Drop any cached repository catalogue held for this account.
  try {
    const { invalidateCatalogue } = await import('./repohub.js');
    invalidateCatalogue(uid);
  } catch { /* cache only */ }
  console.log('[account] deleted account ' + uid);
  res.json({ ok: true });
});

apiRouter.post('/billing/checkout', async (req, res) => {
  const { plan = 'team', cycle = 'annual', seats = 5, taxId = '' } = req.body || {};
  if (plan === 'enterprise') return res.json({ ok: true, contact: true });
  if (plan === 'free') {
    await prisma.user.update({ where: { id: req.uid }, data: { plan: 'free' } });
    return res.json({ ok: true, plan: 'free' });
  }
  // The payment adapter is a simulation (see adapters/stripe.js) — it takes no
  // money. Granting a paid plan on its say-so would let anyone raise their own
  // limits with one request, which makes every cap on this server decorative.
  // Until a real processor is wired up, upgrades are a conversation, not a
  // self-service write.
  if (!paymentsLive()) {
    return res.status(503).json({
      error: 'Online payment is not available yet. Email ' + SUPPORT_EMAIL + ' and we will set your plan up directly.',
      contact: true
    });
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

// Docify has no shared-workspace or accept-invite flow yet, so the mail must
// not imply one: it tells the recipient a seat was recorded and what that does
// and does not give them. Claiming "click here to join" would be a promise the
// product cannot keep.
function inviteEmailHtml(owner, recipient) {
  const who = escapeHtml(owner.name || owner.email);
  return [
    '<p>' + who + ' (' + escapeHtml(owner.email) + ') added <b>' + escapeHtml(recipient) + '</b> to their team on Docify.</p>',
    '<p>Docify does not have shared workspaces yet, so this reserves a seat on their account — it does not give you access to their documents, and there is nothing to accept.</p>',
    '<p>You can create your own account at <a href="' + CLIENT_ORIGIN + '/signup">' + CLIENT_ORIGIN + '/signup</a>.</p>',
    '<p>Not expecting this? Reply to ' + escapeHtml(owner.email) + ', or contact ' + SUPPORT_EMAIL + '.</p>'
  ].join('\n');
}

apiRouter.post('/team/invite', async (req, res) => {
  const { email } = req.body || {};
  if (!email || !String(email).includes('@')) return res.status(400).json({ error: 'A valid email is required' });
  const clean = String(email).trim();
  // Seats are advertised per plan, so they are enforced. The owner occupies a
  // seat (bootstrapUser creates their TeamMember row), and on Team the ceiling
  // is the number of seats the account actually pays for.
  const seatRule = planLimits(req.user.plan).seats;
  const seatLimit = seatRule === 'purchased' ? Math.max(1, req.user.seats || 5) : seatRule;
  const existing = await prisma.teamMember.findMany({ where: { ownerId: req.uid } });
  // Two rows for one address would burn a seat that can only be freed by
  // guessing which duplicate to remove.
  if (existing.some((m) => m.email.toLowerCase() === clean.toLowerCase())) {
    return res.status(400).json({ error: clean + ' is already on your team.' });
  }
  if (seatLimit != null && existing.length >= seatLimit) {
    return res.status(402).json({
      upgrade: true,
      error: seatLimit === 1
        ? 'The Free plan is a single seat. Upgrade to invite teammates.'
        : 'Your plan includes ' + seatLimit + ' seats and all of them are in use. ' +
          (req.user.plan === 'team' ? 'Add seats from Billing to invite more people.' : 'Upgrade to add more teammates.')
    });
  }
  const row = await prisma.teamMember.create({
    data: { ownerId: req.uid, email: clean, status: 'invited', role: 'Writer' }
  });
  // The seat is recorded either way; whether an email actually went out is
  // reported, never assumed — the UI must not say "we emailed them" when no
  // mail transport exists or the send failed.
  let emailed = false;
  let note = '';
  if (!mailEnabled()) {
    note = 'The seat is reserved, but no email could be sent — mail delivery is not configured on this server.';
    console.warn('[team] invite recorded for ' + clean + ' but SMTP is not configured — no email sent');
  } else {
    try {
      await sendMail(clean, 'You were added to a Docify team', inviteEmailHtml(req.user, clean), { replyTo: req.user.email });
      emailed = true;
    } catch (e) {
      note = 'The seat is reserved, but the invitation email could not be delivered (' + (e.message || 'send failed') + ').';
      console.error('[team] invite email failed for ' + clean + ':', e && e.message);
    }
  }
  res.json({ member: row, emailed, note });
});

// Removing a member frees the seat. Owner-scoped by ownerId, and the owner's
// own row is protected: deleting it would leave an account whose seat count no
// longer includes the person paying for it.
apiRouter.delete('/team/:id', async (req, res) => {
  const row = await prisma.teamMember.findFirst({ where: { id: req.params.id, ownerId: req.uid } });
  if (!row) return res.status(404).json({ error: 'Team member not found' });
  if (row.role === 'Owner' || row.email.toLowerCase() === String(req.user.email || '').toLowerCase()) {
    return res.status(400).json({ error: 'You cannot remove yourself from your own team.' });
  }
  await prisma.teamMember.delete({ where: { id: row.id } });
  res.json({ ok: true, removed: row.id });
});

/* ---------------- Automation: auto-regenerate on merge ----------------
   Automation profiles (below) are the product surface. What remains here is
   the single-automation engine that still serves webhooks registered before
   profiles existed: a delivery to an Automation row's endpoint clones the
   user's latest generation as the template, runs the full pipeline
   (generate → judge → score), enforces the quality gate, and records the run.
   No route creates Automation rows any more — the CRUD endpoints the old UI
   used were removed once nothing called them. */

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
  const owner = await prisma.user.findUnique({ where: { id: uid } });
  const ownerPlan = owner ? owner.plan : 'free';
  // The template was generated under whatever plan applied then. A downgrade
  // since must not keep producing a paid format on every merge — the same gate
  // POST /generations applies, enforced here too.
  if (!formatAllowed(ownerPlan, tpl.format)) {
    const def = formatDef(tpl.track, tpl.format) || {};
    const note = (def.name || tpl.format) + ' is not included in the ' + (PLANS[ownerPlan] || PLANS.free).name +
      ' plan, so this run was skipped instead of generating it. Upgrade, or regenerate your template in an included format.';
    await recordRun(auto.id, { ...base, status: 'skipped', note });
    return { run: { ...base, status: 'skipped', note } };
  }
  // Automation fires on every merge, so the cap has to hold here too — this
  // is the path that can run up a bill without anyone watching. The generation
  // id is minted first so the reservation carries it: without one, a failed run
  // could never hand the documents back.
  const genId = 'gen_' + (await import('node:crypto')).randomBytes(12).toString('hex');
  const wantedDocs = Math.max(1, j(tpl.docTypes, []).length);
  const overQuota = await reserveDocumentQuota(uid, ownerPlan, wantedDocs, { generationId: genId, trigger: 'automation' });
  if (overQuota) {
    await recordRun(auto.id, { ...base, status: 'skipped', note: overQuota.error });
    return { run: { ...base, status: 'skipped', note: overQuota.error } };
  }
  const steps = ['Merge ' + (commit ? String(commit).slice(0, 7) + ' ' : '') + 'detected on ' + base.branch,
    ...buildSteps({ provider: 'github', instructions: tpl.instructions, skillName: tpl.skillName || '' })];
  let gen;
  try {
    gen = await prisma.generation.create({
      data: {
        id: genId,
        userId: uid, repo: base.repo || tpl.repo, branch: base.branch, track: tpl.track,
        docTypes: tpl.docTypes, format: tpl.format, instructions: tpl.instructions,
        files: tpl.files, skillName: tpl.skillName || '', skill: tpl.skill || '',
        brief: tpl.brief || '{}', output: tpl.output || '{}',
        status: 'queued', steps: JSON.stringify(steps)
      }
    });
  } catch (e) {
    // Reservation taken above; runPipeline never starts without a row, so the
    // merge would silently burn a document. Refund before failing out.
    await releaseDocumentQuota(uid, genId);
    throw e;
  }
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
  notifyEmail: '',                                                  // step 6
  // Import History approval gate: regenerated documents enter "Under review"
  // and only versions approved there count as publishable.
  approvalGate: false,
  notifyOn: { success: true, blocked: true, failure: true },
  // Traceability: link each merge to a Jira issue so the change can be placed
  // and audited — plus Jira EVENT triggers: point a Jira webhook at this
  // profile's endpoint (?token=<secret>) and enabled issue events run the
  // pipeline directly, no merge required.
  jira: {
    enabled: false, site: '', projectKey: '', requireIssue: false,
    triggers: { created: false, updated: false, statusDone: true, comment: false }
  },
  // The developer's existing documentation — the placement target. Parsed into
  // { name, format, sections:[{level,title,line}], lines, pagesEst } on upload.
  sourceDoc: null,
  targetGenId: null, // pinned Import History document to update (Step 4 picker)
  targetRef: null,   // display metadata for the pinned target { kind, genId, title, repo, docType, format, approval }
  styleGuide: '',    // per-pipeline writing style guide ('' = let Docify decide → tenant/default)
  // Documentation rule set (repository hub). '' = the repo's assigned rule set
  // (or the user default); an id here is a workflow-specific override.
  ruleSetId: ''
};

// Wizard fields that nothing in the engine reads. A published document always
// lands in the workspace and the export centre, so a stored "publish
// destination" only ever described a choice that did not exist. Dropped on read
// and on write, so no stored value can imply behaviour the engine lacks.
const UNUSED_PROFILE_KEYS = ['publishTo'];
function stripUnusedProfileKeys(config) {
  const c = { ...(config && typeof config === 'object' ? config : {}) };
  for (const k of UNUSED_PROFILE_KEYS) delete c[k];
  return c;
}

function profCfg(p) {
  const c = stripUnusedProfileKeys(j(p.config, {}));
  return {
    ...PROFILE_DEFAULTS, ...c,
    events: { ...PROFILE_DEFAULTS.events, ...(c.events || {}) },
    notifyOn: { ...PROFILE_DEFAULTS.notifyOn, ...(c.notifyOn || {}) },
    jira: {
      ...PROFILE_DEFAULTS.jira, ...(c.jira || {}),
      triggers: { ...PROFILE_DEFAULTS.jira.triggers, ...((c.jira || {}).triggers || {}) }
    },
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
  const m = String(v || '').match(/(\d+)\.(\d+)\.(\d+)/);
  // A document with no recorded version is AT its first version — bumping from
  // an assumed 2.4.0 would stamp it with a release history it never had.
  if (!m) return '1.0.0';
  const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return strategy === 'semver-minor' ? maj + '.' + (min + 1) + '.0' : maj + '.' + min + '.' + (pat + 1);
}

async function decideDocAction(uid, cfg, event, jira) {
  const rows = await prisma.generation.findMany({ where: { userId: uid }, orderBy: { createdAt: 'desc' }, take: 100 });
  // When the pipeline pins a specific Import History document (chosen in the
  // Step 4 picker), that exact document is the update target. Otherwise fall
  // back to the most recent generation matching repo · doc type · format.
  const pinned = cfg.targetGenId ? rows.find((g) => g.id === cfg.targetGenId && g.status === 'complete') : null;
  const existing = pinned || rows.find((g) => g.status === 'complete'
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
  // Check the allowance BEFORE anything that spends: the relevance classifier
  // below is itself a model call, so gating only at generation time still let
  // an out-of-allowance account bill on every merge. This is a read-only
  // check; the reservation is taken later, once the run is going to produce.
  const runOwner = await prisma.user.findUnique({ where: { id: uid } });
  const runPlan = runOwner ? runOwner.plan : 'free';
  const runLimit = planLimits(runPlan).docsPerMonth;
  if (runLimit != null && (await documentsUsedThisMonth(uid)) >= runLimit) {
    const note = quotaError(runPlan, runLimit, runLimit, 1).error;
    await save({ at: new Date().toISOString(), trigger: event.trigger, commit: event.commit || '', status: 'skipped', outcome: 'skipped', note });
    return { status: 'skipped', note };
  }
  // Same format entitlement the one-off wizard enforces. A pipeline created on
  // a paid plan keeps firing after a downgrade, and generating a format the
  // plan no longer includes would produce a document its owner cannot download.
  if (!formatAllowed(runPlan, cfg.format)) {
    const def = formatDef(cfg.track, cfg.format) || {};
    const note = (def.name || cfg.format) + ' is not included in the ' + (PLANS[runPlan] || PLANS.free).name +
      ' plan, so this run was skipped instead of generating it. Upgrade, or change this pipeline to an included format.';
    await save({ at: new Date().toISOString(), trigger: event.trigger, commit: event.commit || '', status: 'skipped', outcome: 'skipped', note });
    return { status: 'skipped', note };
  }
  const jira = resolveJiraLink(cfg, event);
  const decision = await decideDocAction(uid, cfg, event, jira);
  await save({
    at: new Date().toISOString(), trigger: event.trigger, commit: event.commit || '',
    branch: event.branch || cfg.branch, files: (event.files || []).length,
    action: decision.action, reason: decision.reason, impacted: decision.impacted || [],
    placement: decision.placement || null, jira: jira || null,
    // Why the configured path filter did not narrow this event, when it could
    // not be evaluated — visible in the run record instead of silently ignored.
    ...(event.pathFilterNote ? { pathFilterNote: event.pathFilterNote } : {}),
    status: 'running'
  });
  // Relevance gate: merges classified as internal are logged and skipped —
  // never documented. Uses the SAME unified rules engine as generation and
  // Doc sync (rule set → docify.yaml → thresholds). Manual "Run now" clicks
  // without merge metadata bypass the gate: there is nothing to classify.
  // Jira-triggered runs skip the merge-relevance gate: the user's enabled
  // Jira triggers ARE the intent filter, and there is no diff to classify.
  if ((event.message || (event.files || []).length) && event.trigger !== 'manual' && event.trigger !== 'jira') {
    try {
      const eff = await resolveEffectiveConfig(uid, cfg.provider, cfg.repo, event.branch || cfg.branch,
        { ruleSetId: String(cfg.ruleSetId || '') });
      const rel = await evaluateCommit(
        { sha: event.commit || '', message: event.message || '', files: event.files || [] }, eff);
      await prisma.relevanceDecision.create({
        data: {
          userId: uid, docId: '', provider: cfg.provider || 'github', repo: cfg.repo || '',
          sha: String(event.commit || ''), message: String(event.message || '').slice(0, 300),
          author: 'automation:' + profile.name, files: JSON.stringify(event.files || []),
          payload: JSON.stringify({ profileId: profile.id, runId, event: { message: event.message, files: event.files } }).slice(0, 20000),
          verdict: rel.verdict, score: rel.score, category: rel.category,
          rationale: String(rel.rationale || '').slice(0, 500), stage: rel.stage,
          eliminatedBy: rel.eliminatedBy || '', surfaces: JSON.stringify(rel.surfaces || [])
        }
      }).catch(() => {});
      if (rel.verdict === 'skip') {
        await save({
          status: 'complete', overall: 0, outcome: 'skipped',
          holdWhy: 'Relevance engine: ' + rel.rationale,
          relevance: { verdict: 'skip', score: rel.score, rationale: rel.rationale, eliminatedBy: rel.eliminatedBy }
        });
        return { runId, outcome: 'skipped', overall: 0 };
      }
      await save({ relevance: { verdict: rel.verdict, score: rel.score, rationale: rel.rationale } });
    } catch (e) {
      console.error('automation relevance gate skipped:', e.message);
    }
  }
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
    // Import History integration: with the approval gate on, regenerated
    // documents land in "Under review" instead of quietly replacing the
    // approved state — an enterprise approval gate before distribution.
    out.approvalGate = !!cfg.approvalGate;
    out.source = 'automation';
    out.styleGuide = cfg.styleGuide || ''; // per-pipeline writing style guide carried to generation
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
      ...buildSteps({ provider: cfg.provider, instructions: tplRow ? tplRow.instructions : '', skillName: tplRow ? tplRow.skillName || '' : '' })
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
    // An in-place update costs exactly as much model time as a new document,
    // so it consumes quota too — counting Generation rows would let this path
    // run free on every merge. The reservation carries the generation id (the
    // row being updated, or the id the new row is about to be created with) so
    // a run that fails outright can hand the documents back.
    const inPlace = (decision.action === 'update' || decision.action === 'sections' || decision.action === 'place') && decision.existing;
    const genId = inPlace ? decision.existing.id : 'gen_' + (await import('node:crypto')).randomBytes(12).toString('hex');
    const pipelineDocs = Math.max(1, (cfg.docTypes || []).length);
    const pipelineOver = await reserveDocumentQuota(uid, runPlan, pipelineDocs, { generationId: genId, trigger: 'automation' });
    if (pipelineOver) {
      await save({ status: 'skipped', outcome: 'skipped', note: pipelineOver.error });
      return { status: 'skipped', note: pipelineOver.error };
    }
    let gen;
    try {
      if (inPlace) {
        gen = await prisma.generation.update({ where: { id: genId }, data });
      } else {
        gen = await prisma.generation.create({ data: { id: genId, userId: uid, ...data } });
      }
    } catch (writeErr) {
      // The reservation is already taken, but runPipeline (which owns the
      // failure refund) has not started — a write failure here would leave the
      // merge charged for a document it never produced. Refund, then let the
      // outer catch record the run as failed.
      await releaseDocumentQuota(uid, genId);
      throw writeErr;
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
      sendMail(to, 'Docify · ' + profile.name + ' — ' + outcome + ' at ' + q.overall + '/100',
        '<p><b>' + decision.action.toUpperCase() + '</b> — ' + decision.reason + '</p>' +
        '<p>Overall ' + q.overall + ' · ChatGPT ' + (probs.chatgpt ?? '—') + '% · Claude ' + (probs.claude ?? '—') + '% · Gemini ' + (probs.gemini ?? '—') + '%</p>' +
        (holdWhy ? '<p>Held: ' + holdWhy + '</p>' : '<p>Published to your Docify workspace.</p>')
      ).catch(() => {});
    }
    return { runId, outcome, overall: q.overall };
  } catch (e) {
    console.error('profile run failed', e);
    await save({ status: 'failed', error: String(e.message || e).slice(0, 200) });
    const user = await prisma.user.findUnique({ where: { id: uid } });
    const to = cfg.notifyEmail || (user ? user.email : '');
    if (to && cfg.notifyOn.failure) {
      sendMail(to, 'Docify · ' + profile.name + ' — run failed', '<p>' + String(e.message || e) + '</p>').catch(() => {});
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

// Pipelines are capped per plan on the pricing page. Every path that creates
// one must go through this — the clone endpoint originally did not, which let
// a Starter account hold as many pipelines as it liked.
async function pipelineCapReached(req, res) {
  const maxPipelines = planLimits(req.user.plan).pipelines;
  if (maxPipelines == null) return false;
  const existing = await prisma.automationProfile.count({ where: { userId: req.uid } });
  if (existing < maxPipelines) return false;
  res.status(402).json({
    upgrade: true,
    error: maxPipelines === 0
      ? 'Automation pipelines are not included in the Free plan. Upgrade to Starter or Team to automate documentation on merge.'
      : 'Your ' + (PLANS[req.user.plan] || PLANS.free).name + ' plan includes ' + maxPipelines +
        ' automation pipeline' + (maxPipelines === 1 ? '' : 's') + '. Delete one or upgrade to add another.'
  });
  return true;
}

/* An automation profile runs on every merge, forever, reserving quota each
   time — so an invalid document type here is more expensive than the same
   mistake on the one-off wizard, where it is already rejected. Validated on
   the way in, against the same catalog. */
function invalidProfileConfig(config, plan = '') {
  const cfg = config && typeof config === 'object' ? config : {};
  const track = cfg.track === undefined ? 'technical' : cfg.track;
  if (track !== 'technical' && track !== 'marketing') return 'Invalid track';
  if (cfg.docTypes !== undefined) {
    if (!Array.isArray(cfg.docTypes)) return 'docTypes must be a list';
    const known = new Set((DOCTYPES[track] || []).map((d) => d.id));
    const bad = cfg.docTypes.map(String).find((d) => !known.has(d));
    if (bad) return 'Unknown document type: ' + bad;
  }
  for (const f of [].concat(cfg.formats || [], cfg.format ? [cfg.format] : [])) {
    const def = formatDef(track, String(f));
    if (!def) return 'Unknown format: ' + f;
    if (!def.ok) return def.name + ' is not currently supported.';
    // The same entitlement the wizard enforces — otherwise a pipeline becomes
    // a standing loophole that emits a paid format on every merge.
    if (plan && !formatAllowed(plan, String(f))) {
      return def.name + ' is not included in the ' + (PLANS[plan] || PLANS.free).name + ' plan. Upgrade to automate it.';
    }
  }
  return '';
}

apiRouter.post('/profiles', async (req, res) => {
  const { name, config } = req.body || {};
  const bad = invalidProfileConfig(config, req.user.plan);
  if (bad) return res.status(400).json({ error: bad });
  if (await pipelineCapReached(req, res)) return;
  const row = await prisma.automationProfile.create({
    data: {
      userId: req.uid,
      name: String(name || 'Documentation pipeline').slice(0, 80),
      config: JSON.stringify(stripUnusedProfileKeys(config)),
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
  const badCfg = config === undefined ? '' : invalidProfileConfig(config, req.user.plan);
  if (badCfg) return res.status(400).json({ error: badCfg });
  const data = {};
  if (typeof name === 'string' && name.trim()) data.name = name.trim().slice(0, 80);
  if (config && typeof config === 'object') data.config = JSON.stringify(stripUnusedProfileKeys(config));
  if (status === 'active' || status === 'paused') data.status = status;
  const updated = await prisma.automationProfile.update({ where: { id: row.id }, data });
  res.json({ profile: serializeProfile(updated) });
});

apiRouter.post('/profiles/:id/clone', async (req, res) => {
  const row = await ownProfile(req, res);
  if (!row) return;
  if (await pipelineCapReached(req, res)) return;
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

/* -------- Automation human review (reuses the Standardize inline editor) -----
   When "Require human approval" is on, the auto-fixes must be treated as
   PROPOSED changes, not pre-accepted "Fixed" ones. generateDocument is
   deterministic from the stored aiDocs/args, so we rebuild both sides of the
   diff on demand — the raw generated output (before) vs. the same output with
   the quality fixes applied (after) — and hand it to the same review engine
   Standardize uses. Nothing is a schema change; nothing touches the pipeline. */
function reviewGenArgs(gen) {
  return {
    track: gen.track, docTypes: j(gen.docTypes, []), format: gen.format, repo: gen.repo,
    instructions: gen.instructions || '', skill: gen.skill || '', skillName: gen.skillName || '',
    brief: j(gen.brief, {}), output: j(gen.output, {}),
    aiDocs: (j(gen.aiDocs, []).length ? j(gen.aiDocs, []) : null)
  };
}
function findRun(row, runId) { return j(row.runs, []).find((r) => r.id === runId); }

apiRouter.get('/profiles/:id/runs/:runId/review', async (req, res) => {
  const row = await ownProfile(req, res);
  if (!row) return;
  const run = findRun(row, req.params.runId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (!run.genId) return res.status(400).json({ error: 'This run has no generated document to review' });
  const gen = await prisma.generation.findFirst({ where: { id: run.genId, userId: req.uid } });
  if (!gen) return res.status(404).json({ error: 'Generated document not found' });
  const rep = await prisma.qualityReport.findUnique({ where: { generationId: gen.id } });
  const allIds = rep ? j(rep.issues, []).map((i) => i.id) : [];
  const genArgs = reviewGenArgs(gen);
  let raw, fixed;
  try {
    raw = generateDocument({ ...genArgs, fixes: [] });
    fixed = generateDocument({ ...genArgs, fixes: allIds });
  } catch (e) { return res.status(500).json({ error: 'Could not rebuild the document for review: ' + (e.message || 'unknown') }); }
  const cfg = j(row.config, {});
  const docType = docTypeName(gen.track, j(gen.docTypes, [])[0]);
  // A saved draft (reviewer returning later) wins as the working "after".
  const after = Array.isArray(run.reviewDraft) && run.reviewDraft.length ? run.reviewDraft : String(fixed.content || '').split('\n');
  const proposal = {
    id: 'arev-' + run.id,
    docName: gen.title || docType || 'Document',
    kind: 'restructure',
    status: 'pending',
    diff: { startLine: 1, before: String(raw.content || '').split('\n'), after },
    reasoning: {
      why: allIds.length
        ? 'Automation proposed ' + allIds.length + ' quality ' + (allIds.length === 1 ? 'fix' : 'fixes') + ' on the generated ' + docType + '. Each is a proposed change — accept, reject, edit, or rewrite it before publishing. Nothing publishes until you approve.'
        : 'Review the generated ' + docType + ' before publishing. Edit or rewrite any section, then approve.',
      automation: { runId: run.id, profileId: row.id, genId: gen.id }
    },
    snippet: String(fixed.content || '').slice(0, 4000)
  };
  const context = {
    profileName: row.name, repo: gen.repo, branch: gen.branch, docType, format: gen.format,
    score: run.overall != null ? run.overall : gen.score, findings: allIds.length,
    pr: run.jira && run.jira.issue ? run.jira.issue : '', commit: run.commit || '', version: run.version || null,
    trigger: run.trigger || '', requireApproval: !!cfg.requireApproval, outcome: run.outcome,
    gate: cfg.gate, gatePassed: run.gatePassed !== false,
    hasDraft: Array.isArray(run.reviewDraft) && run.reviewDraft.length > 0,
    reviewReason: run.reviewReason || ''
  };
  res.json({ proposal, context });
});

apiRouter.post('/profiles/:id/runs/:runId/review/draft', async (req, res) => {
  const row = await ownProfile(req, res);
  if (!row) return;
  const runs = j(row.runs, []);
  const run = runs.find((r) => r.id === req.params.runId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  const after = Array.isArray((req.body || {}).after) ? req.body.after.map((l) => String(l).slice(0, 20000)).slice(0, 20000) : null;
  if (!after) return res.status(400).json({ error: 'Provide the draft content (after: string[])' });
  run.reviewDraft = after;
  if (run.outcome === 'awaiting-approval' || run.outcome === 'changes-requested') run.outcome = run.outcome; // unchanged
  await prisma.automationProfile.update({ where: { id: row.id }, data: { runs: JSON.stringify(runs) } });
  res.json({ ok: true });
});

apiRouter.post('/profiles/:id/runs/:runId/review/request-changes', async (req, res) => {
  const row = await ownProfile(req, res);
  if (!row) return;
  const runs = j(row.runs, []);
  const run = runs.find((r) => r.id === req.params.runId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (!['awaiting-approval', 'changes-requested'].includes(run.outcome)) return res.status(400).json({ error: 'Run is not open for review' });
  run.outcome = 'changes-requested';
  run.reviewReason = String((req.body || {}).reason || '').slice(0, 2000);
  run.reviewedAt = new Date().toISOString();
  if (Array.isArray((req.body || {}).after)) run.reviewDraft = req.body.after.map((l) => String(l).slice(0, 20000)).slice(0, 20000);
  await prisma.automationProfile.update({ where: { id: row.id }, data: { runs: JSON.stringify(runs) } });
  res.json({ ok: true, run });
});

apiRouter.post('/profiles/:id/runs/:runId/review/approve', async (req, res) => {
  const row = await ownProfile(req, res);
  if (!row) return;
  const runs = j(row.runs, []);
  const run = runs.find((r) => r.id === req.params.runId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (!['awaiting-approval', 'changes-requested'].includes(run.outcome)) return res.status(400).json({ error: 'Run is not open for review' });
  const after = Array.isArray((req.body || {}).after) ? req.body.after.map((l) => String(l)) : null;
  if (!after) return res.status(400).json({ error: 'Provide the reviewed content (after: string[])' });
  const content = after.join('\n');
  // Persist the reviewed content as the generation's approved output, so every
  // download, the Documents list, and Import History reflect exactly what the
  // reviewer approved — never the unreviewed original.
  if (run.genId) {
    const gen = await prisma.generation.findFirst({ where: { id: run.genId, userId: req.uid } });
    if (gen) {
      await prisma.generation.update({ where: { id: gen.id }, data: { content, approval: 'approved', approvedAt: new Date().toISOString() } });
      const rep = await prisma.qualityReport.findUnique({ where: { generationId: gen.id } });
      if (rep) await prisma.qualityReport.update({ where: { id: rep.id }, data: { fixedIds: JSON.stringify(j(rep.issues, []).map((i) => i.id)) } });
    }
  }
  run.outcome = 'published';
  run.approvedAt = new Date().toISOString();
  run.reviewDraft = null;
  run.reviewReason = '';
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
