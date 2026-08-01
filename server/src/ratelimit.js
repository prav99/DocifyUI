/* Rate limiting (in-memory; per worker).
   Protects each node from request floods and brute force. Behind a load
   balancer set TRUST_PROXY=1 so limits key on the real client IP. For a
   multi-node fleet move the counters to Redis — the middleware shape is the
   same.

   Lives in its own module because the model-spending limiter has to be
   mounted INSIDE the authenticated router (see api.js): keyBy:'user' reads
   req.uid, which only exists after requireAuth has run. Mounted at the app
   level it silently degrades to a per-IP limit, which behind a proxy means
   every customer shares one bucket. */
export function rateLimiter({ windowMs, max, keyBy }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    // Model-spending routes are keyed by account, not IP: one authenticated
    // user behind one IP must not be able to run up an unbounded AI bill,
    // and one noisy user must not lock everyone else out.
    if (keyBy === 'user' && !req.uid) {
      // A misconfiguration, not a request problem: fall back to per-IP rather
      // than silently applying an account budget to a whole office.
      console.warn('[ratelimit] per-account limiter ran before authentication on ' + req.originalUrl);
    }
    const key = keyBy === 'user'
      ? 'u:' + (req.uid || req.ip || '?')
      : (req.ip || req.socket.remoteAddress || '?');
    const now = Date.now();
    let e = hits.get(key);
    if (!e || e.reset < now) { e = { count: 0, reset: now + windowMs }; hits.set(key, e); }
    e.count += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - e.count)));
    if (e.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((e.reset - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests — please retry in a moment.' });
    }
    next();
  };
}
