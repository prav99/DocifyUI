// Plan-limit accounting. Lives in its own module so both the main API and
// the Doc Sync router can meter model spend without importing each other.
import { prisma } from './db.js';
import { PLANS, planLimits } from './catalog.js';

/* ---------------- Plan enforcement ----------------
   The pricing page advertises a monthly document cap per plan. Enforcing it
   here is both an honesty matter (an advertised cap the server ignores is a
   false claim) and a cost control: every document is a real Anthropic call,
   so an unenforced cap is an unbounded bill on a free account. */

// Calendar month in UTC — the same boundary the billing copy implies.
export function monthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function documentsUsedThisMonth(userId) {
  const rows = await prisma.usageEvent.aggregate({
    where: { userId, kind: 'document', createdAt: { gte: monthStart() } },
    _sum: { count: true }
  });
  return rows._sum.count || 0;
}

// SQLite rejects an explicit isolation level; Postgres needs one.
const IS_SQLITE = String(process.env.DATABASE_URL || '').startsWith('file:');

export function quotaError(plan, limit, used, wanted) {
  return {
    error: used >= limit
      ? 'You have used all ' + limit + ' documents included in your ' + (PLANS[plan] || PLANS.free).name +
        ' plan this month. Upgrade for a higher limit, or wait for the next billing month.'
      : 'This run needs ' + wanted + ' documents but only ' + Math.max(0, limit - used) +
        ' of your ' + limit + ' monthly documents remain on the ' + (PLANS[plan] || PLANS.free).name + ' plan.',
    used, limit, remaining: Math.max(0, limit - used)
  };
}

// Reserves quota and records usage in ONE transaction, returning null when the
// run may proceed or a { error, used, limit } object when it may not.
//
// Checking and recording separately is a time-of-check/time-of-use race:
// concurrent requests all read the same total and every one of them passes,
// which measurably produced 15 documents against a cap of 5. The reservation
// is taken BEFORE the model runs, so a crash mid-run cannot hand back capacity
// that has already been paid for.
export async function reserveDocumentQuota(userId, plan, wanted, { generationId = '', trigger = 'manual' } = {}) {
  const limit = planLimits(plan).docsPerMonth;
  if (limit == null) { // enterprise: uncapped, but still metered for billing
    await prisma.usageEvent.create({ data: { userId, kind: 'document', count: wanted, generationId, trigger } });
    return null;
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const agg = await tx.usageEvent.aggregate({
        where: { userId, kind: 'document', createdAt: { gte: monthStart() } },
        _sum: { count: true }
      });
      const used = agg._sum.count || 0;
      if (used + wanted > limit) return quotaError(plan, limit, used, wanted);
      await tx.usageEvent.create({ data: { userId, kind: 'document', count: wanted, generationId, trigger } });
      return null;
      // Serializable matters on Postgres (production), where the default
      // read-committed isolation would still let both readers pass. SQLite
      // serializes writers anyway.
    }, IS_SQLITE ? undefined : { isolationLevel: 'Serializable' });
  } catch (e) {
    // A serialization conflict means another request won the race; treat it as
    // "no capacity right now" rather than letting the run through unmetered.
    // Any other failure to record usage must also block: the ledger IS the
    // enforcement, so a silent write failure would grant unlimited free runs.
    console.error('quota reservation failed:', e.message);
    return { error: 'Could not confirm your remaining document allowance — please try again in a moment.', used: null, limit };
  }
}

// Releases a reservation when the run is abandoned before any model spend.
export async function releaseDocumentQuota(userId, generationId) {
  if (!generationId) return;
  await prisma.usageEvent.deleteMany({ where: { userId, generationId, kind: 'document' } })
    .catch((e) => console.error('quota release failed:', e.message));
}
