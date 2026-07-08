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
  const isLocalDev = String(process.env.DATABASE_URL || '').startsWith('file:');
  return isLocalDev ? [...configured, 'demo@acme.dev'] : configured;
}

async function requireAdmin(req, res, next) {
  const user = await prisma.user.findUnique({ where: { id: req.uid } });
  if (!user || !adminEmails().includes(user.email.toLowerCase())) {
    return res.status(403).json({ error: 'This page is available to the account owner only' });
  }
  req.adminUser = user;
  next();
}

adminRouter.use(requireAdmin);

/* Bucket timestamps into the last N days (oldest → newest). */
function byDay(rows, days) {
  const out = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, count: 0 });
  }
  const idx = new Map(out.map((o, k) => [o.day, k]));
  for (const r of rows) {
    const key = new Date(r.createdAt).toISOString().slice(0, 10);
    if (idx.has(key)) out[idx.get(key)].count += 1;
  }
  return out;
}

adminRouter.get('/metrics', async (req, res) => {
  const since14 = new Date(Date.now() - 14 * 86400000);
  const since7 = new Date(Date.now() - 7 * 86400000);

  const [users, recentUsers, generations, profiles, syncDocs, syncUpdates, sources, waitlist] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true, emailVerified: true, plan: true, oauthProvider: true, createdAt: true } }),
    prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 12, select: { email: true, plan: true, emailVerified: true, oauthProvider: true, createdAt: true } }),
    prisma.generation.findMany({ select: { status: true, score: true, repo: true, format: true, createdAt: true, userId: true } }),
    prisma.automationProfile.findMany({ select: { status: true, runs: true, userId: true } }),
    prisma.syncDoc.findMany({ select: { status: true, userId: true, createdAt: true } }),
    prisma.syncUpdate.findMany({ select: { status: true, confidence: true, createdAt: true } }),
    prisma.source.findMany({ select: { provider: true } }),
    prisma.waitlist.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })
  ]);

  const complete = generations.filter((g) => g.status === 'complete');
  const runs = profiles.flatMap((p) => j(p.runs, []));
  // "Tried the product" = accounts that actually did something, not just signed up.
  const activeUserIds = new Set([
    ...generations.map((g) => g.userId),
    ...profiles.map((p) => p.userId),
    ...syncDocs.map((d) => d.userId)
  ]);

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
    waitlist: { total: waitlist.length, recent: waitlist.slice(0, 8) }
  });
});
