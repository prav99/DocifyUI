// './env.js' must stay the FIRST import: ES module imports execute in order,
// and it loads server/.env (CWD-independent) before any module reads
// process.env at import time.
import './env.js';
// Must come before any Router is created: converts rejected async handlers
// into proper 500 responses instead of silently hung requests.
import './async-errors.js';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRouter } from './auth.js';
import { apiRouter } from './api.js';
import { injectMeta, SITE_URL } from './seo-meta.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);

/* ---------------- Resilience: a bad request must never kill the process ---- */
process.on('uncaughtException', (e) => console.error('uncaughtException', e));
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));

/* ---------------- Per-IP rate limiting (in-memory; per worker) -------------
   Protects each node from request floods and brute force. Behind a load
   balancer set TRUST_PROXY=1 so limits key on the real client IP. For a
   multi-node fleet move the counters to Redis — the middleware shape is the
   same. */
function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || '?';
    const now = Date.now();
    let e = hits.get(ip);
    if (!e || e.reset < now) { e = { count: 0, reset: now + windowMs }; hits.set(ip, e); }
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

if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
app.disable('x-powered-by');

/* ---------------- Security headers ---------------- */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// SEO: exactly one canonical host. Requests to the *.up.railway.app domain
// are 301-redirected to the custom domain so Google never sees duplicates.
app.use((req, res, next) => {
  const host = String(req.headers.host || '');
  if (host.endsWith('.up.railway.app')) {
    return res.redirect(301, SITE_URL + req.originalUrl);
  }
  next();
});

app.use(cors());
app.use(compression());
// Keep the raw body so webhook HMAC signatures (X-Hub-Signature-256) can be
// verified over the exact bytes the sender signed.
app.use(express.json({ limit: '2mb', verify: (req, res, buf) => { req.rawBody = buf; } }));

// General API budget, plus a much stricter budget on credential endpoints.
app.use('/api', rateLimiter({ windowMs: 60000, max: Number(process.env.RATE_LIMIT_API || 600) }));
app.use('/api/auth/signup', rateLimiter({ windowMs: 60000, max: Number(process.env.RATE_LIMIT_AUTH || 30) }));
app.use('/api/auth/login', rateLimiter({ windowMs: 60000, max: Number(process.env.RATE_LIMIT_AUTH || 30) }));
app.use('/api/auth/verify-otp', rateLimiter({ windowMs: 60000, max: Number(process.env.RATE_LIMIT_AUTH || 30) }));

// /api/health now lives in apiRouter (component-level checks, 200 or 503 for
// external monitors); this minimal liveness ping moved to /api/ping.
app.get('/api/ping', (req, res) => res.json({ ok: true, service: 'docgen-api', pid: process.pid }));
app.use('/api/auth', authRouter);
app.use('/api', apiRouter);

// Serve the built client in production (npm run build at repo root, then npm start).
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../../client/dist');
if (fs.existsSync(dist)) {
  // Hashed assets are immutable — browsers and CDNs cache them for a year.
  app.use(express.static(dist, {
    index: false, // "/" must reach the SEO-injecting catch-all below
    setHeaders(res, filePath) {
      if (/\.(js|css|svg|woff2?|png|jpg)$/.test(filePath) && filePath.includes('assets')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));
  // Serve the SPA shell with per-route SEO meta (title, description,
  // canonical, Open Graph, JSON-LD) injected into the raw HTML — crawlers
  // and link unfurlers never execute React, so this is what they index.
  const shell = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  app.get(/^(?!\/api).*/, (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(injectMeta(shell, req.path));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log('Docify API listening on http://localhost:' + PORT +
    (fs.existsSync(dist) ? ' (serving built client)' : '') + ' · pid ' + process.pid);
});

/* ---------------- Connection hygiene under load ---------------- */
server.keepAliveTimeout = 65000;   // outlive typical LB idle timeouts (60s)
server.headersTimeout = 66000;
server.requestTimeout = 30000;     // no request may hold a socket forever

/* ---------------- Graceful shutdown: finish in-flight work, then exit ------ */
function shutdown() {
  console.log('pid ' + process.pid + ': draining connections…');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
