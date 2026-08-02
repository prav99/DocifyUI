// Identity-provider sign-in (OpenID Connect). Google today; the PROVIDERS
// registry is the extension point for Microsoft / Apple / Okta later.
//
// These flows differ from the code-host OAuth in auth.js on purpose:
//   - They only authenticate the person. No Source row is created, the repo
//     catalogue is untouched, User.oauthProvider (which means "code host
//     authorized at signup") is never written, and NO provider tokens are
//     persisted — the ID token is verified, its claims are read, discarded.
//   - The ID token's signature is verified against the provider's published
//     JWKS, and the flow carries a nonce and a mandatory PKCE verifier in
//     addition to the signed `state`.
// Account linking is by provider-verified email only, with the provider's
// stable `sub` recorded in Identity so later sign-ins survive an email change
// on the provider side.
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { prisma } from './db.js';
import {
  sign, signState, verifyState, requireAuth, bootstrapUser, publicUser, domainPolicyError
} from './auth.js';

const IS_PROD = process.env.NODE_ENV === 'production';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const OAUTH_BASE = process.env.OAUTH_REDIRECT_BASE || 'http://localhost:4000';

const PROVIDERS = {
  google: {
    label: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    scope: 'openid email profile',
    clientId: () => process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET || '',
    // Always show the account chooser: evaluators often have several Google
    // accounts, and silent reuse of the wrong one is confusing.
    extraAuthParams: { prompt: 'select_account' }
  }
};
// Route pattern for every registered identity provider — extend PROVIDERS and
// this stays correct automatically.
const IDP_PATTERN = ':idp(' + Object.keys(PROVIDERS).join('|') + ')';

export const configuredIdp = (p) => Boolean(PROVIDERS[p] && PROVIDERS[p].clientId() && PROVIDERS[p].clientSecret());
const cbUrl = (p) => OAUTH_BASE + '/api/auth/' + p + '/callback';
const label = (p) => (PROVIDERS[p] ? PROVIDERS[p].label : p);

/* ---------------- Round-trip cookies ----------------
   Two short-lived httpOnly cookies survive the redirect to the provider
   without server memory (workers are clustered, so a Map would not be shared):

   - PKCE verifier, named per flow so two concurrent sign-ins in the same
     browser cannot clobber each other's verifier.
   - Link intent, which binds "connect Google to THIS account" to the browser
     that was authenticated. It is deliberately NOT a URL parameter: a link
     token in a query string leaks through history and access logs, and an
     attacker who could hand a victim such a URL would be able to graft the
     victim's Google identity onto an account the attacker controls. */
const PKCE_PREFIX = 'docify_pkce_';
const LINK_COOKIE = 'docify_link';

function cookieAttrs(path, maxAge) {
  const a = ['Path=' + path, 'HttpOnly', 'SameSite=Lax', 'Max-Age=' + maxAge];
  if (IS_PROD) a.push('Secure');
  return a.join('; ');
}
function appendCookie(res, value) {
  const prev = res.getHeader('Set-Cookie');
  const list = prev ? (Array.isArray(prev) ? prev.slice() : [prev]) : [];
  list.push(value);
  res.setHeader('Set-Cookie', list);
}
function readCookie(req, name) {
  const m = String(req.headers.cookie || '')
    .match(new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  if (!m) return '';
  // A malformed percent-escape must not become a 500: a hostile or corrupted
  // cookie is simply treated as absent.
  try { return decodeURIComponent(m[1]); } catch { return ''; }
}
const clearCookie = (res, name, path) =>
  appendCookie(res, name + '=; Path=' + path + '; HttpOnly; SameSite=Lax; Max-Age=0' + (IS_PROD ? '; Secure' : ''));

/* ---------------- ID token verification ---------------- */
// JWKS cache: refreshed hourly or when an unknown kid appears (key rotation).
const jwksCache = new Map(); // url -> { keys, at }
async function getJwk(url, kid) {
  let c = jwksCache.get(url);
  if (!c || Date.now() - c.at > 3600 * 1000 || !c.keys.some((k) => k.kid === kid)) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('Could not fetch the provider signing keys');
    const j = await r.json();
    const keys = Array.isArray(j.keys) ? j.keys : [];
    // Never cache an empty/garbage key set over a good one.
    if (!keys.length) throw new Error('Provider returned no signing keys');
    c = { keys, at: Date.now() };
    jwksCache.set(url, c);
  }
  const jwk = c.keys.find((k) => k.kid === kid);
  if (!jwk) throw new Error('Unknown token signing key');
  return jwk;
}

async function verifyIdToken(provider, idToken, expectedNonce) {
  const cfg = PROVIDERS[provider];
  const audience = cfg.clientId();
  // An empty audience makes jsonwebtoken skip the aud check entirely, which
  // would accept an ID token minted for a different OAuth client.
  if (!audience) throw new Error('Provider client id is not configured');
  let kid;
  try {
    kid = JSON.parse(Buffer.from(String(idToken).split('.')[0], 'base64url').toString('utf8')).kid;
  } catch {
    throw new Error('Malformed ID token');
  }
  const jwk = await getJwk(cfg.jwksUrl, kid);
  const pem = crypto.createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
  // Verifies signature, expiry, audience, and issuer in one call.
  const claims = jwt.verify(idToken, pem, { algorithms: ['RS256'], audience, issuer: cfg.issuers });
  if (!expectedNonce || claims.nonce !== expectedNonce) {
    throw new Error('Sign-in session mismatch — please start again');
  }
  return claims;
}

async function exchangeIdpCode(provider, code, verifier) {
  const cfg = PROVIDERS[provider];
  const form = new URLSearchParams({
    code: String(code || ''),
    client_id: cfg.clientId(),
    client_secret: cfg.clientSecret(),
    redirect_uri: cbUrl(provider),
    grant_type: 'authorization_code',
    code_verifier: verifier
  });
  const r = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });
  return r.json();
}

export const identityRouter = Router();

// Step 1: send the user to the provider's consent screen.
identityRouter.get('/oauth/' + IDP_PATTERN, (req, res) => {
  const p = req.params.idp;
  if (!configuredIdp(p)) {
    return res.status(404).json({ error: label(p) + ' sign-in is not configured — see docs/OAUTH-SETUP.md' });
  }
  const cfg = PROVIDERS[p];
  const nonce = crypto.randomBytes(16).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const flowId = crypto.randomBytes(8).toString('hex'); // names this flow's PKCE cookie
  appendCookie(res, PKCE_PREFIX + flowId + '=' + verifier + '; ' + cookieAttrs('/api/auth', 600));

  // "Connect Google to my account" is proven by a cookie set on an
  // authenticated same-origin POST — never by a token in the URL. The cookie
  // is cleared on EVERY pass through here, and is honoured only when this
  // request also carries the matching ?lk correlator that POST /link handed
  // back. Without that pairing a leftover cookie (abandoned tab, rate-limited
  // redirect) would silently turn a later, unrelated "Continue with Google"
  // into a link — grafting that person's identity onto the earlier account.
  // `lk` is not a credential: the account id lives only in the httpOnly cookie.
  let linkUid = null;
  const linkCookie = readCookie(req, LINK_COOKIE);
  if (linkCookie) {
    clearCookie(res, LINK_COOKIE, '/api/auth');
    try {
      const lk = verifyState(linkCookie);
      const correlator = String(req.query.lk || '');
      if (lk.t === 'idp-link' && lk.p === p && correlator && lk.c === correlator) linkUid = lk.uid;
    } catch { /* expired: fall through to a normal sign-in */ }
  }

  const state = signState({ t: 'idp', p, n: nonce, f: flowId, ...(linkUid ? { link: linkUid } : {}) });
  const url = cfg.authUrl + '?' + new URLSearchParams({
    client_id: cfg.clientId(),
    redirect_uri: cbUrl(p),
    response_type: 'code',
    scope: cfg.scope,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...cfg.extraAuthParams
  }).toString();
  res.redirect(url);
});

// Authenticated preamble for "connect Google to my existing account": sets the
// link-intent cookie. The redirect itself is a top-level navigation that
// carries no Bearer header, which is why the intent has to be stored first.
identityRouter.post('/link/' + IDP_PATTERN, requireAuth, (req, res) => {
  const p = req.params.idp;
  if (!configuredIdp(p)) return res.status(404).json({ error: label(p) + ' sign-in is not configured' });
  const correlator = crypto.randomBytes(12).toString('hex');
  appendCookie(res, LINK_COOKIE + '=' +
    encodeURIComponent(signState({ t: 'idp-link', p, uid: req.uid, c: correlator }, '10m')) +
    '; ' + cookieAttrs('/api/auth', 600));
  res.json({ url: '/api/auth/oauth/' + p + '?lk=' + correlator });
});

// Step 2: the provider redirects back; exchange the code, verify the ID
// token, then sign in / create / link the account.
identityRouter.get('/' + IDP_PATTERN + '/callback', async (req, res) => {
  const p = req.params.idp;
  const fail = (msg) => res.redirect(
    CLIENT_ORIGIN + '/oauth/complete#error=' + encodeURIComponent(msg) + '&provider=' + p + '&kind=identity'
  );
  try {
    if (!configuredIdp(p)) return fail(label(p) + ' sign-in is not configured on this server');
    const { code, state, error } = req.query;
    if (error) {
      return fail(error === 'access_denied'
        ? label(p) + ' sign-in was cancelled — nothing was changed'
        : label(p) + ' sign-in did not complete — please try again');
    }

    let st;
    try {
      st = verifyState(String(state || '')); // CSRF protection
    } catch {
      // Covers both a forged state and the 10-minute expiry, which is easy to
      // hit by leaving the consent screen open.
      return fail('This sign-in link expired — please click "Continue with ' + label(p) + '" again');
    }
    if (st.t !== 'idp' || st.p !== p) return fail('Sign-in could not be verified — please start again');

    // PKCE is mandatory: without the verifier an intercepted authorization
    // code could be redeemed by someone else.
    const verifier = readCookie(req, PKCE_PREFIX + String(st.f || ''));
    clearCookie(res, PKCE_PREFIX + String(st.f || ''), '/api/auth');
    if (!verifier) {
      return fail('Your browser did not return the sign-in security token — please try again in this browser (cookies must be enabled)');
    }

    const tok = await exchangeIdpCode(p, code, verifier);
    if (!tok || !tok.id_token) {
      console.error('[identity] %s token exchange failed: %s', p, (tok && (tok.error_description || tok.error)) || 'no id_token');
      return fail('Could not complete ' + label(p) + ' sign-in — please try again');
    }
    const claims = await verifyIdToken(p, tok.id_token, st.n);

    // Only a provider-verified email may match or create a Docify account —
    // an unverified claim would let anyone squat on someone else's address.
    const email = String(claims.email || '').trim().toLowerCase();
    const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
    if (!email || !emailVerified) {
      return fail('Your ' + label(p) + ' account has no verified email address, so it cannot be used to sign in.');
    }
    const subject = String(claims.sub);
    const profileName = String(claims.name || '');

    const existingIdentity = await prisma.identity.findUnique({
      where: { provider_subject: { provider: p, subject } },
      include: { user: true }
    });

    let user = existingIdentity ? existingIdentity.user : null;
    let isNew = false;
    let passwordCleared = false; // tells the client to explain the reset

    if (st.link) {
      // Explicit link to the account that started the flow (from Settings).
      if (existingIdentity && existingIdentity.userId !== st.link) {
        return fail('This ' + label(p) + ' account is already linked to a different Docify account.');
      }
      user = await prisma.user.findUnique({ where: { id: st.link } });
      if (!user) return fail('Your session expired — please sign in again');
      const already = await prisma.identity.findFirst({ where: { userId: user.id, provider: p } });
      if (already && already.subject !== subject) {
        return fail('A different ' + label(p) + ' account is already connected. Disconnect it first in Settings → Sign-in & security.');
      }
      if (!existingIdentity) {
        await prisma.identity.create({ data: { userId: user.id, provider: p, subject, email, name: profileName } });
      }
    } else if (!user) {
      user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        // Same provider-verified email as an existing account: link rather
        // than duplicate.
        const already = await prisma.identity.findFirst({ where: { userId: user.id, provider: p } });
        if (already && already.subject !== subject) {
          return fail('A different ' + label(p) + ' account is already connected to the Docify account for this address.');
        }
        // A password on an account whose address was never PROVEN (no
        // emailVerifiedAt — either never verified, or auto-verified because
        // SMTP is unconfigured) may have been set by someone who does not own
        // the mailbox: classic account pre-hijacking. The provider has now
        // proven ownership, so that unproven password is discarded and the
        // real owner is told to set a fresh one.
        const proven = !!user.emailVerifiedAt;
        const patch = {};
        if (!proven && user.passwordHash) patch.passwordHash = null;
        if (!user.emailVerified) patch.emailVerified = true;
        // The provider proved the mailbox, so a pending signup OTP is moot —
        // leaving it would keep the /verify-otp path alive for the squatter.
        if (user.otpHash) { patch.otpHash = ''; patch.otpExpires = null; patch.otpAttempts = 0; }
        if (!user.emailVerifiedAt) patch.emailVerifiedAt = new Date();
        await prisma.identity.create({ data: { userId: user.id, provider: p, subject, email, name: profileName } });
        if (Object.keys(patch).length) {
          user = await prisma.user.update({ where: { id: user.id }, data: patch });
        }
        passwordCleared = patch.passwordHash === null;
      } else {
        // New account. Honor the same corporate-domain policy as email signup.
        const policyError = domainPolicyError(email);
        if (policyError) return fail(policyError);
        isNew = true;
        user = await prisma.user.create({
          data: { email, name: profileName, emailVerified: true, emailVerifiedAt: new Date() }
        });
        await prisma.identity.create({ data: { userId: user.id, provider: p, subject, email, name: profileName } });
      }
    } else if (existingIdentity.email !== email || existingIdentity.name !== profileName) {
      // Returning user whose provider profile changed: keep our copy fresh
      // (the Docify account email is intentionally NOT auto-changed).
      await prisma.identity.update({ where: { id: existingIdentity.id }, data: { email, name: profileName } });
    }

    await bootstrapUser(user);
    // Token travels in the URL FRAGMENT (never a query param): fragments are
    // not sent to the server, not logged, and analytics scrubbing relies on it.
    res.redirect(
      CLIENT_ORIGIN + '/oauth/complete#token=' + encodeURIComponent(sign(user)) +
      '&provider=' + p + '&kind=identity&new=' + (isNew ? '1' : '0') +
      (st.link ? '&linked=1' : '') + (passwordCleared ? '&pwreset=1' : '')
    );
  } catch (e) {
    // Internal detail stays in the server log; the user gets a plain message.
    console.error('[identity] %s callback failed:', p, e);
    fail('Could not complete ' + label(p) + ' sign-in — please try again');
  }
});

/* ---------------- Account security (sign-in methods) ---------------- */

// What can this account sign in with? Powers Settings → Sign-in & security.
identityRouter.get('/identities', requireAuth, async (req, res) => {
  const [user, identities] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.uid } }),
    prisma.identity.findMany({ where: { userId: req.uid }, orderBy: { createdAt: 'asc' } })
  ]);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({
    hasPassword: !!user.passwordHash,
    identities: identities.map((i) => ({ id: i.id, provider: i.provider, email: i.email, createdAt: i.createdAt })),
    available: Object.fromEntries(Object.keys(PROVIDERS).map((p) => [p, configuredIdp(p)]))
  });
});

// Set (passwordless account) or change (has a password) the account password.
// Lets Google-created accounts add email+password as a second sign-in method.
identityRouter.post('/set-password', requireAuth, async (req, res) => {
  const { password, currentPassword } = req.body || {};
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const user = await prisma.user.findUnique({ where: { id: req.uid } });
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.passwordHash) {
    const ok = await bcrypt.compare(String(currentPassword || ''), user.passwordHash);
    if (!ok) return res.status(403).json({ error: 'Current password is incorrect' });
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    // Changing the password revokes every session signed before it — otherwise
    // the token someone changed their password to invalidate keeps working for
    // up to seven days. The caller gets a replacement below so the browser it
    // was done from stays signed in.
    data: { passwordHash: await bcrypt.hash(String(password), 10), tokenVersion: { increment: 1 } }
  });
  res.json({ ok: true, user: publicUser(updated), token: sign(updated) });
});

// Unlink an identity — allowed only while another sign-in method remains,
// so an account can never lock itself out.
identityRouter.delete('/identities/:id', requireAuth, async (req, res) => {
  const identity = await prisma.identity.findFirst({ where: { id: String(req.params.id), userId: req.uid } });
  if (!identity) return res.status(404).json({ error: 'Identity not found' });
  const [user, count] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.uid } }),
    prisma.identity.count({ where: { userId: req.uid } })
  ]);
  if (!user.passwordHash && count <= 1) {
    return res.status(400).json({ error: 'Set a password first — this is currently your only way to sign in' });
  }
  await prisma.identity.delete({ where: { id: identity.id } });
  res.json({ ok: true });
});
