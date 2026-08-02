/* Rate limiting (in-memory; per worker).
   Protects each node from request floods and brute force. Behind a load
   balancer set TRUST_PROXY=1 so limits key on the real client IP. For a
   multi-node fleet move the counters to Redis — the middleware shape is the
   same.

   Per worker is literal: production runs a cluster (src/cluster.js forks one
   worker per CPU) and requests land on whichever worker is free, so the
   effective ceiling for a caller is roughly max × workers. Size the limits
   with that in mind — they are a flood guard, not a billing control. Spend is
   metered separately and exactly, in the usage ledger (src/quota.js).

   Lives in its own module because the model-spending limiter has to be
   mounted INSIDE the authenticated router (see api.js): keyBy:'user' reads
   req.uid, which only exists after requireAuth has run. Mounted at the app
   level it silently degrades to a per-IP limit, which behind a proxy means
   every customer shares one bucket. */

// One flood must not be able to grow the map without bound (spoofed
// X-Forwarded-For values behind a trusting proxy would do exactly that). Well
// past any realistic number of distinct callers in a one-minute window.
const MAX_KEYS = 50000;

export function rateLimiter({ windowMs, max, keyBy }) {
  const hits = new Map();
  let warnedUnauthenticated = false;
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    // Model-spending routes are keyed by account, not IP: one authenticated
    // user behind one IP must not be able to run up an unbounded AI bill,
    // and one noisy user must not lock everyone else out.
    if (keyBy === 'user' && !req.uid && !warnedUnauthenticated) {
      // A misconfiguration, not a request problem: fall back to per-IP rather
      // than silently applying an account budget to a whole office. Logged
      // once — it is the same deployment mistake on every request, and a line
      // per request would bury everything else in the log.
      warnedUnauthenticated = true;
      console.warn('[ratelimit] per-account limiter ran before authentication on ' + req.originalUrl + ' — falling back to per-IP keys (logged once).');
    }
    const key = keyBy === 'user'
      ? 'u:' + (req.uid || req.ip || '?')
      : (req.ip || req.socket.remoteAddress || '?');
    const now = Date.now();
    let e = hits.get(key);
    if (!e || e.reset < now) {
      // Sweeping happens on a timer; a burst of unique keys can arrive between
      // sweeps. Drop the expired entries first, and only then refuse to track
      // anything new — refusing means letting the request THROUGH unlimited,
      // so it has to be the last resort, never the normal path.
      if (hits.size >= MAX_KEYS) {
        for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
        if (hits.size >= MAX_KEYS) {
          console.warn('[ratelimit] tracking ' + hits.size + ' keys — new callers are unlimited until the window rolls over.');
          return next();
        }
      }
      e = { count: 0, reset: now + windowMs };
      hits.set(key, e);
    }
    e.count += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - e.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(e.reset / 1000)));
    if (e.count > max) {
      const retryAfter = Math.max(1, Math.ceil((e.reset - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Too many requests — please retry in ' + retryAfter + ' second' + (retryAfter === 1 ? '' : 's') + '.',
        retryAfter
      });
    }
    next();
  };
}
