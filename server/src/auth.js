import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { prisma } from './db.js';
import { sendMail, mailEnabled } from './adapters/mailer.js';

const SECRET = process.env.JWT_SECRET || 'docgen-dev-secret';
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
  await prisma.source.update({
    where: { id: src.id },
    data: {
      token: tok.access_token,
      refreshToken: tok.refresh_token || src.refreshToken, // GitLab rotates; keep old if absent
      expiresAt: expiryDate(tok)
    }
  });
  return tok.access_token;
}

async function fetchProfile(provider, token) {
  const H = { Authorization: 'Bearer ' + token, 'User-Agent': 'DocGen' };
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

export function sign(userId) {
  return jwt.sign({ uid: userId }, SECRET, { expiresIn: '7d' });
}

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  try {
    req.uid = jwt.verify(token, SECRET).uid;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

async function bootstrapUser(user) {
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

function publicUser(u) {
  return {
    id: u.id, email: u.email, name: u.name, oauthProvider: u.oauthProvider,
    emailVerified: !!u.emailVerified,
    plan: u.plan, billingCycle: u.billingCycle, seats: u.seats,
    isAdmin: isAdminEmail(u.email)
  };
}

/* ---- Corporate signup policy (configurable via .env) ---- */
const FREE_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com'];

function domainPolicyError(email) {
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
  await sendMail(user.email, 'Your DocGen verification code',
    '<p>Welcome to DocGen. Your verification code:</p>' +
    '<p style="font-size:28px;letter-spacing:6px;font-weight:bold;font-family:monospace">' + code + '</p>' +
    '<p>It expires in 10 minutes. You can also <a href="' + link + '">verify with one click</a>.</p>');
}

export const authRouter = Router();

// POST /api/auth/signup  { email, password? , provider? , name? }
// provider = mock OAuth (github|gitlab|bitbucket); doubles as source authorization.
authRouter.post('/signup', async (req, res) => {
  const { email, password, provider, name } = req.body || {};
  const providerEmail = provider ? 'praveen@acme.dev' : null;
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
    await prisma.user.update({ where: { email: String(v) }, data: { emailVerified: true } });
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
  if (!user) return res.status(400).json({ error: 'Unknown email — sign up first' });
  if (user.emailVerified) {
    await bootstrapUser(user);
    return res.json({ token: sign(user.id), user: publicUser(user) });
  }
  if (!user.otpHash || !user.otpExpires || new Date(user.otpExpires) < new Date()) {
    return res.status(400).json({ error: 'Code expired — request a new one' });
  }
  if (user.otpAttempts >= 5) {
    return res.status(429).json({ error: 'Too many attempts — request a new code' });
  }
  const ok = /^\d{6}$/.test(code) && await bcrypt.compare(code, user.otpHash);
  if (!ok) {
    await prisma.user.update({ where: { id: user.id }, data: { otpAttempts: user.otpAttempts + 1 } });
    return res.status(400).json({ error: 'Incorrect code — ' + Math.max(0, 4 - user.otpAttempts) + ' attempt' + (4 - user.otpAttempts === 1 ? '' : 's') + ' left' });
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, otpHash: '', otpExpires: null, otpAttempts: 0 }
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
    let user = await prisma.user.findFirst({ where: { oauthProvider: provider } });
    if (!user) {
      user = await prisma.user.create({ data: { email: 'praveen@acme.dev', oauthProvider: provider } });
      await bootstrapUser(user);
    }
    return res.json({ token: sign(user.id), user: publicUser(user) });
  }
  const finalEmail = String(email || '').trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: finalEmail } });
  if (!user || !user.passwordHash || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (mailEnabled() && !user.emailVerified) {
    return res.status(403).json({ error: 'Verify your email first — check your inbox for the link', unverified: true });
  }
  await bootstrapUser(user);
  res.json({ token: sign(user.id), user: publicUser(user) });
});

// Which providers have REAL OAuth configured (vs the simulated flow).
authRouter.get('/providers', (req, res) => {
  res.json({ github: realProv('github'), gitlab: realProv('gitlab'), bitbucket: realProv('bitbucket') });
});

// Step 1 of real OAuth: send the user to the provider's consent screen.
authRouter.get('/oauth/:provider(github|gitlab|bitbucket)', (req, res) => {
  const provider = req.params.provider;
  if (!realProv(provider)) return res.status(404).json({ error: provider + ' OAuth is not configured — see README' });
  const state = jwt.sign({ t: 'oauth', p: provider }, SECRET, { expiresIn: '10m' });
  res.redirect(authorizeUrl(provider, state));
});

// Step 2: the provider redirects back with a one-time code; exchange it server-side.
authRouter.get('/:provider(github|gitlab|bitbucket)/callback', async (req, res) => {
  const provider = req.params.provider;
  try {
    const { code, state } = req.query;
    const st = jwt.verify(String(state || ''), SECRET); // CSRF protection
    if (st.p !== provider) throw new Error('State mismatch');
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
