/* ================= Founder metrics (admin-only) =================
   One endpoint the /founder dashboard reads. Access is restricted to the
   emails in ADMIN_EMAILS (comma-separated, case-insensitive). Locally
   (SQLite dev database) the seeded demo account is also allowed so the
   dashboard can be tested without a production login. */
import { Router } from 'express';
import { prisma } from './db.js';

export const adminRouter = Router();

const j = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };

function adminEmails() {
  const configured = String(process.env.ADMIN_EMAILS || 'praveen.jha004@gmail.com')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  // The seeded demo account has a published password, so it may only hold admin
  // rights on a developer machine. Both halves must hold: NODE_ENV is the real
  // gate (a production deployment could legitimately run on SQLite, so the file:
  // check alone would not be safe), and the file: check keeps a stray unset
  // NODE_ENV from handing the demo password admin rights over a real database.
  const isLocalDev = process.env.NODE_ENV !== 'production'
    && String(process.env.DATABASE_URL || '').startsWith('file:');
  return isLocalDev ? [...configured, 'demo@acme.dev'] : configured;
}

async function requireAdmin(req, res, next) {
  try {
    // requireAuth runs before this router and leaves the loaded account on the
    // request. If it somehow did not, fail closed instead of asking Prisma for
    // `id: undefined` (which throws and would hang the request under Express 4).
    const user = req.user && req.user.id === req.uid
      ? req.user
      : (req.uid ? await prisma.user.findUnique({ where: { id: req.uid } }) : null);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const email = String(user.email || '').trim().toLowerCase();
    if (!email || !adminEmails().includes(email)) {
      return res.status(403).json({ error: 'This page is available to the account owner only' });
    }
    // An unverified account proves no control of the mailbox. Without this,
    // anyone could sign up as an ADMIN_EMAILS address that has no account yet
    // and inherit the founder dashboard — which lists every customer's email.
    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Verify your email address before opening this page' });
    }
    req.adminUser = user;
    next();
  } catch (e) {
    next(e);
  }
}

adminRouter.use(requireAdmin);

/* Bucket timestamps into the last N days (oldest → newest). Buckets are UTC
   days because the row keys below come from toISOString(): building them from
   local midnight instead shifted the whole window by a day east of Greenwich,
   which silently dropped everything created after 00:00 UTC today. */
function byDay(rows, days) {
  const out = [];
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(todayUtc - i * 86400000).toISOString().slice(0, 10);
    out.push({ day: key, count: 0 });
  }
  const idx = new Map(out.map((o, k) => [o.day, k]));
  for (const r of rows) {
    const at = new Date(r.createdAt);
    if (Number.isNaN(at.getTime())) continue; // a null/garbage timestamp must not throw
    const key = at.toISOString().slice(0, 10);
    if (idx.has(key)) out[idx.get(key)].count += 1;
  }
  return out;
}

/* Express 4 never catches a rejected promise from a handler, so the body lives
   in its own function and failures are forwarded to the error middleware — a
   single failed query would otherwise hang the request until the socket times
   out, with the dashboard stuck on "Loading…". */
adminRouter.get('/metrics', (req, res, next) => metrics(req, res).catch(next));

async function metrics(req, res) {
  const since14 = new Date(Date.now() - 14 * 86400000);
  const since7 = new Date(Date.now() - 7 * 86400000);

  const [users, recentUsers, generations, profiles, syncDocs, syncUpdates, sources, waitlistTotal, waitlistRecent] = await Promise.all([
    prisma.user.findMany({ select: { id: true, emailVerified: true, plan: true, oauthProvider: true, createdAt: true } }),
    prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 12, select: { email: true, plan: true, emailVerified: true, oauthProvider: true, createdAt: true } }),
    prisma.generation.findMany({ select: { status: true, score: true, createdAt: true, userId: true } }),
    prisma.automationProfile.findMany({ select: { status: true, runs: true, userId: true } }),
    prisma.syncDoc.findMany({ select: { status: true, userId: true, createdAt: true } }),
    prisma.syncUpdate.findMany({ select: { status: true, confidence: true, createdAt: true } }),
    prisma.source.findMany({ select: { provider: true } }),
    // Counted, not measured off the page of rows below — `take` would have
    // capped the headline number at the page size once the list grew.
    prisma.waitlist.count(),
    prisma.waitlist.findMany({ orderBy: { createdAt: 'desc' }, take: 8 })
  ]);

  const complete = generations.filter((g) => g.status === 'complete');
  const runs = profiles.flatMap((p) => { const r = j(p.runs, []); return Array.isArray(r) ? r : []; });
  // "Tried the product" = accounts that actually did something, not just signed
  // up. Rows left behind by a deleted account are excluded, so this can never
  // read higher than the number of accounts that exist.
  const liveIds = new Set(users.map((u) => u.id));
  const activeUserIds = new Set([
    ...generations.map((g) => g.userId),
    ...profiles.map((p) => p.userId),
    ...syncDocs.map((d) => d.userId)
  ].filter((id) => liveIds.has(id)));

  // Every customer's email address is in this payload; keep it out of browser
  // and intermediary caches.
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    generatedAt: new Date().toISOString(),
    customers: {
      total: users.length,
      verified: users.filter((u) => u.emailVerified).length,
      new7d: users.filter((u) => u.createdAt >= since7).length,
      activated: activeUserIds.size, // created a doc, pipeline, or sync doc
      paying: users.filter((u) => u.plan && u.plan !== 'free').length,
      viaOauth: users.filter((u) => u.oauthProvider).length,
      signupsByDay: byDay(users.filter((u) => u.createdAt >= since14), 14),
      recent: recentUsers
    },
    product: {
      generationsTotal: generations.length,
      generationsComplete: complete.length,
      generations7d: generations.filter((g) => g.createdAt >= since7).length,
      avgScore: complete.length ? Math.round(complete.reduce((a, g) => a + (g.score || 0), 0) / complete.length) : 0,
      pipelines: profiles.length,
      pipelinesActive: profiles.filter((p) => p.status === 'active').length,
      pipelineRuns: runs.length,
      syncDocs: syncDocs.length,
      syncUpdates: syncUpdates.length,
      syncPending: syncUpdates.filter((u) => u.status === 'pending').length,
      syncApproved: syncUpdates.filter((u) => u.status === 'approved').length,
      connectedSources: sources.length,
      sourcesByProvider: sources.reduce((m, s) => ({ ...m, [s.provider]: (m[s.provider] || 0) + 1 }), {})
    },
    waitlist: { total: waitlistTotal, recent: waitlistRecent }
  });
}
