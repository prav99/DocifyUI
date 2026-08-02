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

const IS_PROD = process.env.NODE_ENV === 'production';
// Rate limits key on req.ip, so behind a load balancer every request looks
// like one client until the proxy hop is trusted — one visitor could then
// throttle everyone. Hosted platforms always front the app, so default to
// trusting them; local development keeps req.ip = the socket address.
// Trust exactly ONE hop, never `true`: with `true` any client can prepend its
// own X-Forwarded-For and choose which rate-limit bucket it lands in.
const BEHIND_PLATFORM_PROXY = Boolean(IS_PROD || process.env.RAILWAY_ENVIRONMENT || process.env.RENDER || process.env.DYNO || process.env.FLY_APP_NAME);
const TRUST_HOPS = process.env.TRUST_PROXY != null && process.env.TRUST_PROXY !== ''
  ? Math.max(0, Number(process.env.TRUST_PROXY) || 0)
  : (BEHIND_PLATFORM_PROXY ? 1 : 0);
if (TRUST_HOPS > 0) app.set('trust proxy', TRUST_HOPS);
app.disable('x-powered-by');

/* ---------------- Security headers ---------------- */
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
  // Never let a browser or intermediary cache an authenticated API response,
  // and never let another site embed one as a subresource.
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  }
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

// Unmatched API routes must answer JSON: Express's default 404 is an HTML
// page, which a fetch() caller reports as a parse failure rather than a 404.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

/* ---------------- Final error handler ----------------
   Client mistakes (malformed JSON, an oversized body) carry a 4xx status from
   body-parser; answering them with 500 blames the server and hides the fix.
   Only messages authored here are returned — err.message can carry file
   paths, driver internals, or a slice of the offending payload. */
const CLIENT_ERROR_BY_TYPE = {
  'entity.parse.failed': 'Malformed JSON in request body.',
  'entity.too.large': 'Request body is too large.',
  'entity.verify.failed': 'Request body could not be verified.',
  'encoding.unsupported': 'Unsupported content encoding.',
  'parameters.too.many': 'Too many parameters in request body.',
  'request.aborted': 'Request aborted before it completed.',
  'request.size.invalid': 'Request body size did not match Content-Length.'
};
const CLIENT_ERROR_BY_STATUS = {
  400: 'Bad request.', 401: 'Authentication required.', 403: 'Not permitted.',
  404: 'Not found.', 405: 'Method not allowed.', 408: 'Request timed out.',
  409: 'Conflict.', 413: 'Request body is too large.', 415: 'Unsupported media type.',
  422: 'Request could not be processed.', 429: 'Too many requests — please retry in a moment.'
};
app.use((err, req, res, next) => {
  const raw = Number(err && (err.status || err.statusCode));
  const status = raw >= 400 && raw <= 599 ? raw : 500;
  const isClient = status < 500;
  if (isClient) console.warn('[http ' + status + '] ' + req.method + ' ' + req.path + ' — ' + (err.type || err.message));
  else console.error(err);
  // Headers already flushed (a streamed download, say): only the socket can be
  // closed now; Express's default handler does that correctly.
  if (res.headersSent) return next(err);
  res.status(status).json({
    error: isClient
      ? (CLIENT_ERROR_BY_TYPE[err.type] || CLIENT_ERROR_BY_STATUS[status] || 'Bad request.')
      : 'Internal server error'
  });
});

const server = app.listen(PORT, () => {
  console.log('Docify API listening on http://localhost:' + PORT +
    (fs.existsSync(dist) ? ' (serving built client)' : '') + ' · pid ' + process.pid +
    (TRUST_HOPS ? ' · trusting ' + TRUST_HOPS + ' proxy hop' + (TRUST_HOPS > 1 ? 's' : '') : ''));
});

// A listen failure (port taken, permission denied) would otherwise reach the
// uncaughtException handler above and be logged while the process lingers
// forever without a listener. Exit so the supervisor can restart or report it.
server.on('error', (e) => {
  console.error('server error: cannot listen on port ' + PORT, e);
  process.exit(1);
});

/* ---------------- Connection hygiene under load ---------------- */
server.keepAliveTimeout = 65000;   // outlive typical LB idle timeouts (60s)
server.headersTimeout = 66000;
server.requestTimeout = 30000;     // no request may hold a socket forever

/* ---------------- Graceful shutdown: finish in-flight work, then exit ------ */
let draining = false;
function shutdown() {
  // A second SIGTERM (or SIGINT after SIGTERM) must not restart the timer or
  // re-close the server — the platform sends both during a redeploy.
  if (draining) return;
  draining = true;
  console.log('pid ' + process.pid + ': draining connections…');
  server.close(() => process.exit(0));
  // keepAliveTimeout is 65s, so idle sockets alone would hold the server open
  // past the hard deadline; drop them now and let in-flight requests finish.
  server.closeIdleConnections?.();
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
