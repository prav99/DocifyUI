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
import { identityRouter } from './identity.js';
import { apiRouter } from './api.js';
import { injectMeta, SITE_URL } from './seo-meta.js';
import { rateLimiter } from './ratelimit.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);

/* ---------------- Resilience: a bad request must never kill the process ---- */
process.on('uncaughtException', (e) => console.error('uncaughtException', e));
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));

if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
app.disable('x-powered-by');

/* ---------------- Security headers ---------------- */
const IS_PROD = process.env.NODE_ENV === 'production';
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // HSTS: browsers refuse plain-http for a year once seen. Production only —
  // it would break local http development.
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Never let a browser or intermediary cache an authenticated API response.
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});

// SEO: exactly one canonical host. Requests to the *.up.railway.app domain
// or to www.docifydocai.com are 301-redirected to the bare custom domain so
// Google, Bing, and AI crawlers never see duplicate hosts.
app.use((req, res, next) => {
  const host = String(req.headers.host || '');
  if (host.endsWith('.up.railway.app') || host === 'www.docifydocai.com') {
    return res.redirect(301, SITE_URL + req.originalUrl);
  }
  next();
});

// CORS: the SPA is served from the same origin in production, so a wildcard
// is unnecessary attack surface. Allow the configured client origin (and
// localhost during development) instead of every site on the internet.
const ALLOWED_ORIGINS = [process.env.CLIENT_ORIGIN, SITE_URL, 'https://www.docifydocai.com']
  .filter(Boolean)
  .concat(IS_PROD ? [] : ['http://localhost:5173', 'http://localhost:4000']);
app.use(cors({
  origin(origin, cb) {
    // Same-origin and server-to-server requests send no Origin header.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: false
}));
app.use(compression());
// Keep the raw body so webhook HMAC signatures (X-Hub-Signature-256) can be
// verified over the exact bytes the sender signed.
app.use(express.json({ limit: '2mb', verify: (req, res, buf) => { req.rawBody = buf; } }));

// General API budget, plus a much stricter budget on credential endpoints.
app.use('/api', rateLimiter({ windowMs: 60000, max: Number(process.env.RATE_LIMIT_API || 600) }));
app.use('/api/auth/signup', rateLimiter({ windowMs: 60000, max: Number(process.env.RATE_LIMIT_AUTH || 30) }));
app.use('/api/auth/login', rateLimiter({ windowMs: 60000, max: Number(process.env.RATE_LIMIT_AUTH || 30) }));
app.use('/api/auth/verify-otp', rateLimiter({ windowMs: 60000, max: Number(process.env.RATE_LIMIT_AUTH || 30) }));
// /resend sends an email on every call — without a strict budget it is a
// mail-bombing vector aimed at any address the caller knows.
app.use('/api/auth/resend', rateLimiter({ windowMs: 60000, max: Number(process.env.RATE_LIMIT_AUTH || 30) }));
// Identity-provider (Google) sign-in and password management get the same
// strict budget as the other credential endpoints. The limit belongs on the
// flow's ENTRY point, not the callback: a 429 there would answer an
// already-consented user with raw JSON instead of a friendly redirect, and
// the callback is already gated by a signed, single-use state.
app.use('/api/auth/oauth/google', rateLimiter({ windowMs: 60000, max: Number(process.env.RATE_LIMIT_AUTH || 30) }));
app.use('/api/auth/link/google', rateLimiter({ windowMs: 60000, max: Number(process.env.RATE_LIMIT_AUTH || 30) }));
app.use('/api/auth/set-password', rateLimiter({ windowMs: 60000, max: Number(process.env.RATE_LIMIT_AUTH || 30) }));
// The per-ACCOUNT model-spending limiter lives in api.js, mounted after
// requireAuth — here it would run before req.uid exists and silently become a
// per-IP limit shared by every customer behind the load balancer.
// This coarser per-IP ceiling stays at the app level so an unauthenticated
// flood at the AI routes is still bounded before it reaches the database.
const aiFlood = rateLimiter({ windowMs: 60000, max: Number(process.env.RATE_LIMIT_AI_IP || 120) });
app.use('/api/generations', aiFlood);
app.use('/api/sync', aiFlood);

// /api/health now lives in apiRouter (component-level checks, 200 or 503 for
// external monitors); this minimal liveness ping moved to /api/ping.
app.get('/api/ping', (req, res) => res.json({ ok: true, service: 'docgen-api', pid: process.pid }));
app.use('/api/auth', authRouter);
app.use('/api/auth', identityRouter); // Google (and future IdP) sign-in — disjoint routes, same prefix
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
