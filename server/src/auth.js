import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { prisma } from './db.js';
import { sendMail, mailEnabled } from './adapters/mailer.js';

// Session signing key. In production a weak/absent secret would let anyone
// forge a session for any account, so refuse to boot instead of running
// insecurely; local development still gets a convenience default.
const IS_PROD = process.env.NODE_ENV === 'production';
const DEV_SECRET = 'docgen-dev-secret';
if (IS_PROD && (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEV_SECRET)) {
  // Fail closed on the real vulnerability: no secret, or the public default
  // that anyone reading this repository could use to forge a session.
  throw new Error('JWT_SECRET must be set to a private random string in production');
}
if (IS_PROD && String(process.env.JWT_SECRET).length < 24) {
  // Weak but private: warn loudly rather than take a running service down.
  console.warn('[security] JWT_SECRET is shorter than 24 characters — rotate it to a longer random value.');
}
const SECRET = process.env.JWT_SECRET || DEV_SECRET;

// Simulated OAuth ("log in as a provider with no authorization code") exists
// so the product can be demoed without OAuth apps configured. It logs into a
// single shared demo account, so it must never be reachable in production.
const DEMO_LOGIN_ENABLED = !IS_PROD && process.env.ALLOW_DEMO_LOGIN !== 'false';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const OAUTH_BASE = process.env.OAUTH_REDIRECT_BASE || 'http://localhost:4000';

const OAUTH = {
  github: { id: process.env.GITHUB_CLIENT_ID || '', secret: process.env.GITHUB_CLIENT_SECRET || '' },
  gitlab: { id: process.env.GITLAB_CLIENT_ID || '', secret: process.env.GITLAB_CLIENT_SECRET || '' },
  bitbucket: { id: process.env.BITBUCKET_CLIENT_ID || '', secret: process.env.BITBUCKET_CLIENT_SECRET || '' }
};
const realProv = (p) => Boolean(OAUTH[p] && OAUTH[p].id && OAUTH[p].secret);
const cbUrl = (p) => OAUTH_BASE + '/api/auth/' + p + '/callback';

function authorizeUrl(provider, state) {
  const cfg = OAUTH[provider];
  if (provider === 'github') {
    return 'https://github.com/login/oauth/authorize?client_id=' + encodeURIComponent(cfg.id) +
      '&redirect_uri=' + encodeURIComponent(cbUrl(provider)) +
      '&scope=' + encodeURIComponent('read:user user:email repo') +
      '&state=' + encodeURIComponent(state);
  }
  if (provider === 'gitlab') {
    return 'https://gitlab.com/oauth/authorize?client_id=' + encodeURIComponent(cfg.id) +
      '&redirect_uri=' + encodeURIComponent(cbUrl(provider)) +
      '&response_type=code&scope=' + encodeURIComponent('read_user read_api read_repository') +
      '&state=' + encodeURIComponent(state);
  }
  return 'https://bitbucket.org/site/oauth2/authorize?client_id=' + encodeURIComponent(cfg.id) +
    '&response_type=code&state=' + encodeURIComponent(state);
}

async function exchangeCode(provider, code) {
  const cfg = OAUTH[provider];
  if (provider === 'github') {
    const r = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: cfg.id, client_secret: cfg.secret, code })
    });
    return r.json();
  }
  if (provider === 'gitlab') {
    // Form-encoded: the safest content type for GitLab's token endpoint.
    const form = new URLSearchParams({
      client_id: cfg.id, client_secret: cfg.secret, code,
      grant_type: 'authorization_code', redirect_uri: cbUrl(provider)
    });
    const r = await fetch('https://gitlab.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    return r.json();
  }
  const r = await fetch('https://bitbucket.org/site/oauth2/access_token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(cfg.id + ':' + cfg.secret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=authorization_code&code=' + encodeURIComponent(code)
  });
  return r.json();
}

// Exchange a refresh token for a fresh access token (GitLab / Bitbucket / expiring GitHub).
async function refreshExchange(provider, refreshToken) {
  const cfg = OAUTH[provider];
  if (provider === 'gitlab') {
    const form = new URLSearchParams({
      client_id: cfg.id, client_secret: cfg.secret,
      refresh_token: refreshToken, grant_type: 'refresh_token', redirect_uri: cbUrl(provider)
    });
    const r = await fetch('https://gitlab.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    return r.json();
  }
  if (provider === 'bitbucket') {
    const r = await fetch('https://bitbucket.org/site/oauth2/access_token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(cfg.id + ':' + cfg.secret).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken)
    });
    return r.json();
  }
  const r = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: cfg.id, client_secret: cfg.secret, refresh_token: refreshToken, grant_type: 'refresh_token' })
  });
  return r.json();
}

const expiryDate = (tok) => (tok.expires_in ? new Date(Date.now() + (Number(tok.expires_in) - 60) * 1000) : null);

// Return a valid access token for a Source, silently renewing it if expired.
// Throws with a reconnect message when renewal is impossible.
export async function freshToken(src) {
  if (!src) return '';
  if (!src.expiresAt || new Date(src.expiresAt) > new Date()) return src.token;
  if (!src.refreshToken) {
    throw new Error(src.provider + ' session expired — reconnect it from the source page');
  }
  const tok = await refreshExchange(src.provider, src.refreshToken);
  if (!tok || !tok.access_token) {
    throw new Error(src.provider + ' session expired — reconnect it from the source page');
  }
  try {
    await prisma.source.update({
      where: { id: src.id },
      data: {
        token: tok.access_token,
        refreshToken: tok.refresh_token || src.refreshToken, // GitLab rotates; keep old if absent
        expiresAt: expiryDate(tok)
      }
    });
  } catch (e) {
    // Credential storage can refuse the write (CREDENTIAL_KEY unset in
    // production). The token we just obtained is valid, so use it for THIS
    // request rather than failing an operation that would otherwise succeed —
    // it simply is not persisted, and the next call refreshes again.
    if (!/CREDENTIAL_KEY/.test(e.message || '')) throw e;
    console.error('[security] token refresh not persisted for source ' + src.id + ': ' + e.message);
  }
  return tok.access_token;
}

async function fetchProfile(provider, token) {
  const H = { Authorization: 'Bearer ' + token, 'User-Agent': 'Docify' };
  if (provider === 'github') {
    const u = await (await fetch('https://api.github.com/user', { headers: H })).json();
    let email = u.email;
    if (!email) {
      const es = await (await fetch('https://api.github.com/user/emails', { headers: H })).json();
      const p = Array.isArray(es) ? (es.find((e) => e.primary) || es[0]) : null;
      email = p ? p.email : u.login + '@users.noreply.github.com';
    }
    return { email, name: u.name || u.login || '', handle: u.login || 'github' };
  }
  if (provider === 'gitlab') {
    const u = await (await fetch('https://gitlab.com/api/v4/user', { headers: H })).json();
    return { email: u.email || u.username + '@users.noreply.gitlab.com', name: u.name || u.username || '', handle: u.username || 'gitlab' };
  }
  const u = await (await fetch('https://api.bitbucket.org/2.0/user', { headers: H })).json();
  let email = null;
  try {
    const es = await (await fetch('https://api.bitbucket.org/2.0/user/emails', { headers: H })).json();
    const p = es && es.values ? (es.values.find((e) => e.is_primary) || es.values[0]) : null;
    email = p ? p.email : null;
  } catch { /* endpoint may need extra scope */ }
  return { email: email || (u.username || 'user') + '@users.noreply.bitbucket.org', name: u.display_name || u.username || '', handle: u.username || 'bitbucket' };
}

// Sessions are stateless for 7 days, so the only way to revoke one is to make
// it carry something the server can invalidate: `tv` is the account's
// tokenVersion at signing time, checked against the column on every request.
// A bare id signs version 0 — correct only for an account that has never
// changed its password.
export function sign(user) {
  const uid = typeof user === 'string' ? user : user.id;
  const tv = typeof user === 'string' ? 0 : Number(user.tokenVersion || 0);
  return jwt.sign({ uid, typ: 'session', tv }, SECRET, { expiresIn: '7d' });
}

// OAuth round-trip state is signed with a SEPARATE key derived from the
// session secret. A state token must never be usable as a session token:
// same-secret signing would make every anonymously-obtainable state a valid
// bearer credential.
const STATE_SECRET = crypto.createHmac('sha256', SECRET).update('docify-oauth-state-v1').digest('hex');
export function signState(payload, expiresIn = '10m') {
  return jwt.sign(payload, STATE_SECRET, { expiresIn });
}
export function verifyState(token) {
  return jwt.verify(token, STATE_SECRET);
}

export async function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  let p;
  try {
    p = jwt.verify(token, SECRET);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Only session tokens authenticate. Sessions issued before `typ` existed
  // carry just {uid} and stay valid; anything with a non-session type, or
  // without a subject, is rejected — a missing uid would otherwise reach
  // Prisma as `where: { userId: undefined }`, which matches every row.
  if (!p || !p.uid || (p.typ && p.typ !== 'session') || p.t || p.v) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // The account must still exist. A JWT stays cryptographically valid for its
  // full 7 days, so without this a deleted account could keep working — and
  // because several user-scoped tables have no foreign key to User, ordinary
  // requests would recreate rows under a dead id that nothing can ever clean
  // up. Loading the user here also spares handlers a second lookup.
  const user = await prisma.user.findUnique({ where: { id: p.uid } });
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  // Revocation check. A session signed before the last password change carries
  // a stale `tv` and stops working immediately. Tokens issued before this claim
  // existed have no `tv` and count as version 0, so sessions already in flight
  // survive the deploy.
  if (Number(p.tv || 0) !== Number(user.tokenVersion || 0)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.uid = user.id;
  req.user = user;
  next();
}

export async function bootstrapUser(user) {
  await prisma.automation.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id }
  });
  const owner = await prisma.teamMember.findFirst({ where: { ownerId: user.id, role: 'Owner' } });
  if (!owner) {
    await prisma.teamMember.create({
      data: { ownerId: user.id, name: user.name || user.email.split('@')[0], email: user.email, role: 'Owner' }
    });
  }
}

// Admin flag mirrors the server-side ADMIN_EMAILS gate in admin.js — the
// client uses it only to show/hide the Founder metrics menu item; the data
// endpoint enforces the same list independently.
function isAdminEmail(email) {
  const configured = String(process.env.ADMIN_EMAILS || 'praveen.jha004@gmail.com')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return configured.includes(String(email || '').toLowerCase());
}

export function publicUser(u) {
  return {
    id: u.id, email: u.email, name: u.name, oauthProvider: u.oauthProvider,
    emailVerified: !!u.emailVerified,
    hasPassword: !!u.passwordHash,
    plan: u.plan, billingCycle: u.billingCycle, seats: u.seats,
    isAdmin: isAdminEmail(u.email)
  };
}

// Compared against when an account has no password, so every login attempt
// costs the same bcrypt work regardless of which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('docify-timing-equalizer', 10);

/* ---- Corporate signup policy (configurable via .env) ---- */
const FREE_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com'];

export function domainPolicyError(email) {
  const domain = String(email).split('@')[1] || '';
  const allowed = (process.env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(domain)) {
    return 'Signups are restricted to: ' + allowed.join(', ');
  }
  if (String(process.env.BLOCK_FREE_EMAIL).toLowerCase() === 'true' && FREE_DOMAINS.includes(domain)) {
    return 'Please use your corporate email address — personal mail providers are not accepted';
  }
  return null;
}

// Issue a 6-digit OTP: hash stored server-side, 10-minute expiry, 5 attempts.
// The email also carries a one-click fallback link.
async function issueOtp(user) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await prisma.user.update({
    where: { id: user.id },
    data: {
      otpHash: await bcrypt.hash(code, 8),
      otpExpires: new Date(Date.now() + 10 * 60 * 1000),
      otpAttempts: 0
    }
  });
  const token = jwt.sign({ v: user.email }, SECRET, { expiresIn: '2d' });
  const link = OAUTH_BASE + '/api/auth/verify?token=' + encodeURIComponent(token);
  await sendMail(user.email, 'Your Docify verification code',
    '<p>Welcome to Docify. Your verification code:</p>' +
    '<p style="font-size:28px;letter-spacing:6px;font-weight:bold;font-family:monospace">' + code + '</p>' +
    '<p>It expires in 10 minutes. You can also <a href="' + link + '">verify with one click</a>.</p>');
}

export const authRouter = Router();

// POST /api/auth/signup  { email, password? , provider? , name? }
// provider = mock OAuth (github|gitlab|bitbucket); doubles as source authorization.
authRouter.post('/signup', async (req, res) => {
  const { email, password, provider, name } = req.body || {};
  if (provider && !DEMO_LOGIN_ENABLED) {
    return res.status(400).json({
      error: realProv(provider)
        ? 'Use the ' + provider + ' authorization flow to sign up'
        : 'This provider is not configured for sign-up'
    });
  }
  const providerEmail = provider ? 'demo@docify.local' : null;
  const finalEmail = String(email || providerEmail || '').trim().toLowerCase();
  if (!finalEmail || !finalEmail.includes('@')) return res.status(400).json({ error: 'A valid email is required' });
  if (!provider && (!password || String(password).length < 8)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (!provider) {
    const policyError = domainPolicyError(finalEmail);
    if (policyError) return res.status(400).json({ error: policyError });
  }
  let user = await prisma.user.findUnique({ where: { email: finalEmail } });
  if (user && !provider) return res.status(409).json({ error: 'An account with this email already exists — log in instead' });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: finalEmail,
        name: name || '',
        oauthProvider: provider || null,
        // OAuth identities are verified by the provider; email accounts are
        // verified by link when SMTP is configured, auto-verified in dev mode.
        emailVerified: provider ? true : !mailEnabled(),
        passwordHash: provider ? null : await bcrypt.hash(String(password), 10)
      }
    });
  } else if (provider && user.oauthProvider !== provider) {
    // Re-signup through a different code host: follow the latest choice.
    user = await prisma.user.update({ where: { id: user.id }, data: { oauthProvider: provider } });
  }
  if (provider) {
    const existing = await prisma.source.findFirst({ where: { userId: user.id, provider } });
    if (!existing) {
      await prisma.source.create({ data: { userId: user.id, provider, detail: 'OAuth read-only (contents + commit history)' } });
    }
  }
  await bootstrapUser(user);
  if (!provider && mailEnabled() && !user.emailVerified) {
    try {
      await issueOtp(user);
    } catch (e) {
      console.error('SMTP send failed:', e.message);
      return res.status(502).json({ error: 'Could not send the verification email — contact your administrator (SMTP settings)' });
    }
    return res.json({ pendingVerification: true, email: finalEmail, method: 'otp' });
  }
  res.json({ token: sign(user.id), user: publicUser(user) });
});

// GET /api/auth/verify?token=...  — from the verification email.
authRouter.get('/verify', async (req, res) => {
  try {
    const { v } = jwt.verify(String(req.query.token || ''), SECRET);
    await prisma.user.update({
      where: { email: String(v) },
      data: { emailVerified: true, emailVerifiedAt: new Date(), otpHash: '', otpExpires: null }
    });
    res.redirect(CLIENT_ORIGIN + '/login#verified=1');
  } catch {
    res.redirect(CLIENT_ORIGIN + '/login#verified=0');
  }
});

// POST /api/auth/verify-otp  { email, code } — activates the account and logs in.
authRouter.post('/verify-otp', async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const code = String((req.body || {}).code || '').trim();
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  // One response for every "this did not work" case. Distinct messages here
  // (no such account / already verified / no pending code) would let anyone
  // discover which addresses are registered, with no credential at all — and
  // this endpoint issues a session, so it is a sign-in path.
  const NO = 'That code is not valid — request a new one';
  if (!user) return res.status(400).json({ error: NO });
  // An already-verified account must NOT be handed a session just for knowing
  // the address: that would make every passwordless account (Google sign-in,
  // code-host sign-in) takeoverable by anyone who knows the email. A pending
  // code is still honoured below, because entering it proves mailbox access.
  if (user.emailVerified && !user.otpHash) return res.status(400).json({ error: NO });
  if (!user.otpHash || !user.otpExpires || new Date(user.otpExpires) < new Date()) {
    return res.status(400).json({ error: NO });
  }
  // Same 400 + same text as every other failure: a distinguishable 429 here
  // would still reveal that this address has an unverified account. The
  // attempt counter keeps doing its job server-side.
  if (user.otpAttempts >= 5) return res.status(400).json({ error: NO });
  const ok = /^\d{6}$/.test(code) && await bcrypt.compare(code, user.otpHash);
  if (!ok) {
    await prisma.user.update({ where: { id: user.id }, data: { otpAttempts: user.otpAttempts + 1 } });
    return res.status(400).json({ error: NO });
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    // emailVerifiedAt records a REAL proof of mailbox access (see schema).
    data: { emailVerified: true, emailVerifiedAt: new Date(), otpHash: '', otpExpires: null, otpAttempts: 0 }
  });
  await bootstrapUser(updated);
  res.json({ token: sign(updated.id), user: publicUser(updated) });
});

// POST /api/auth/resend  { email }
authRouter.post('/resend', async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (user && !user.emailVerified && mailEnabled()) {
    try { await issueOtp(user); } catch (e) { console.error('SMTP send failed:', e.message); }
  }
  res.json({ ok: true }); // same response either way — no account enumeration
});

// POST /api/auth/login  { email, password }  (or { provider } for mock OAuth login)
authRouter.post('/login', async (req, res) => {
  const { email, password, provider } = req.body || {};
  if (provider) {
    if (!DEMO_LOGIN_ENABLED) {
      return res.status(400).json({
        error: realProv(provider)
          ? 'Use the ' + provider + ' authorization flow to sign in'
          : 'This provider is not configured for sign-in'
      });
    }
    let user = await prisma.user.findFirst({ where: { oauthProvider: provider } });
    if (!user) {
      user = await prisma.user.create({ data: { email: 'demo@docify.local', oauthProvider: provider } });
      await bootstrapUser(user);
    }
    return res.json({ token: sign(user.id), user: publicUser(user) });
  }
  const finalEmail = String(email || '').trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: finalEmail } });
  // Always spend one bcrypt comparison, even when there is no hash to check.
  // Returning early would make "no such account" and "Google-only account"
  // measurably faster than a wrong password — a timing oracle that undoes the
  // uniform error message below.
  const hashToCheck = (user && user.passwordHash) || DUMMY_HASH;
  const passwordOk = await bcrypt.compare(String(password || ''), hashToCheck);
  if (!user || !user.passwordHash || !passwordOk) {
    // Deliberately identical for "no such account", "wrong password", and
    // "this account has no password" — naming the provider here would turn
    // the login form into an account- and identity-provider oracle. The UI
    // shows an unconditional "signed up with Google? use that button" hint
    // instead, which tells the honest user the same thing without confirming
    // anything to an attacker.
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (mailEnabled() && !user.emailVerified) {
    return res.status(403).json({ error: 'Verify your email first — check your inbox for the link', unverified: true });
  }
  await bootstrapUser(user);
  res.json({ token: sign(user.id), user: publicUser(user) });
});

// Which providers have REAL OAuth configured (vs the simulated flow).
// `google` is an identity provider handled in identity.js; its availability
// is reported here so the client has one place to ask.
authRouter.get('/providers', (req, res) => {
  res.json({
    github: realProv('github'), gitlab: realProv('gitlab'), bitbucket: realProv('bitbucket'),
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  });
});

// Step 1 of real OAuth: send the user to the provider's consent screen.
authRouter.get('/oauth/:provider(github|gitlab|bitbucket)', (req, res) => {
  const provider = req.params.provider;
  if (!realProv(provider)) return res.status(404).json({ error: provider + ' OAuth is not configured — see README' });
  const state = signState({ t: 'oauth', p: provider });
  res.redirect(authorizeUrl(provider, state));
});

// Step 2: the provider redirects back with a one-time code; exchange it server-side.
authRouter.get('/:provider(github|gitlab|bitbucket)/callback', async (req, res) => {
  const provider = req.params.provider;
  try {
    const { code, state } = req.query;
    const st = verifyState(String(state || '')); // CSRF protection
    if (st.t !== 'oauth' || st.p !== provider) throw new Error('State mismatch');
    const tok = await exchangeCode(provider, code);
    const accessToken = tok && tok.access_token;
    if (!accessToken) throw new Error((tok && tok.error_description) || 'Token exchange failed');
    const prof = await fetchProfile(provider, accessToken);
    const email = String(prof.email).toLowerCase();
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({ data: { email, name: prof.name, oauthProvider: provider, emailVerified: true } });
    } else if (!user.oauthProvider) {
      user = await prisma.user.update({ where: { id: user.id }, data: { oauthProvider: provider, emailVerified: true } });
    }
    const data = {
      userId: user.id, provider,
      detail: 'OAuth read-only (as ' + prof.handle + ')',
      token: accessToken,
      refreshToken: tok.refresh_token || '',
      expiresAt: expiryDate(tok)
    };
    const existing = await prisma.source.findFirst({ where: { userId: user.id, provider } });
    if (existing) await prisma.source.update({ where: { id: existing.id }, data });
    else await prisma.source.create({ data });
    // The unified catalogue must see the new credentials immediately.
    // (dynamic import avoids a static auth ⇄ repohub cycle)
    const { invalidateCatalogue } = await import('./repohub.js');
    invalidateCatalogue(user.id);
    await bootstrapUser(user);
    res.redirect(CLIENT_ORIGIN + '/oauth/complete#token=' + encodeURIComponent(sign(user.id)) + '&provider=' + provider);
  } catch (e) {
    res.redirect(CLIENT_ORIGIN + '/oauth/complete#error=' + encodeURIComponent(e.message || 'OAuth failed'));
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.uid } });
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ user: publicUser(u) });
});
