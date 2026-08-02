export const TOKEN_KEY = 'docgen_token';

let token = localStorage.getItem(TOKEN_KEY) || null;

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}
export function getToken() {
  return token;
}

// A 401 from these means "those credentials are wrong", not "your session
// ended" — a failed login attempt must never sign out the account already in
// this tab.
const CREDENTIAL_PATHS = /^\/auth\/(login|signup|verify|resend|otp|forgot|reset)/;

// The auth store subscribes here. When the server rejects the token we drop it
// once, centrally, and let the route guard send the user to sign-in with the
// page they were on — an expired session should never surface as a generic
// mid-workflow error.
let sessionExpiredHandler = null;
export function onSessionExpired(fn) {
  sessionExpiredHandler = fn;
  return () => { if (sessionExpiredHandler === fn) sessionExpiredHandler = null; };
}

// Returns true when this 401 ended the session (so callers can say so).
//
// `sentWith` is the token the failed request actually carried. A long-lived
// poll started before a password change would otherwise come back 401 and
// clear the NEW token this tab was just issued, signing the user out of a
// session that is perfectly valid.
function handleUnauthorized(path, opts, sentWith) {
  if (opts.ignore401 || !token || CREDENTIAL_PATHS.test(path)) return false;
  if (sentWith && sentWith !== token) return false; // stale reply, current session is fine
  setToken(null);
  if (sessionExpiredHandler) sessionExpiredHandler();
  return true;
}

// Identical GETs fired within the same tick — several panels each asking for
// /billing or /auth/me as a route mounts — should reach the network once. We
// share the in-flight promise and drop it the instant it settles. This
// deduplicates concurrent requests only; it is NOT a response cache, so the
// next call after settle re-fetches and data is never served stale.
const inflight = new Map();

export async function api(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const sentWith = token;
  // Only side-effect-free GETs are safe to share, and the key carries the token
  // and ignore401 flag so requests that would be handled differently never
  // collapse into one.
  const key = (method === 'GET' && opts.body === undefined)
    ? method + ' ' + path + '|' + (sentWith || '') + '|' + (opts.ignore401 ? '1' : '0')
    : null;
  if (key && inflight.has(key)) return inflight.get(key);

  const run = (async () => {
    let res;
    try {
      res = await fetch('/api' + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(sentWith ? { Authorization: 'Bearer ' + sentWith } : {})
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
      });
    } catch {
      // fetch only rejects on a transport failure — offline, DNS, a dropped
      // connection. Without this the caller sees "Failed to fetch".
      throw new Error('Network error — check your connection and try again');
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && handleUnauthorized(path, opts, sentWith)) {
      throw new Error('Your session has expired — please sign in again');
    }
    if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
    return data;
  })();

  if (key) {
    inflight.set(key, run);
    // Settle handler catches its own rejection so the cleanup chain never
    // surfaces as an unhandled rejection; the caller still owns `run`.
    const clear = () => { if (inflight.get(key) === run) inflight.delete(key); };
    run.then(clear, clear);
  }
  return run;
}

// Authenticated file download (fetch → blob → anchor click).
export async function download(path, nameOverride) {
  let res;
  const sentWith = token;
  try {
    res = await fetch('/api' + path, {
      headers: sentWith ? { Authorization: 'Bearer ' + sentWith } : {}
    });
  } catch {
    throw new Error('Network error — check your connection and try again');
  }
  if (!res.ok) {
    // Pass the token this request actually carried so a slow download that
    // 401s after a fresh sign-in cannot clear the new session's token.
    if (res.status === 401 && handleUnauthorized(path, {}, sentWith)) {
      throw new Error('Your session has expired — please sign in again');
    }
    throw new Error('Download failed (' + res.status + ')');
  }
  const cd = res.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename="([^"]+)"/);
  // A caller-supplied traceable name (e.g. repo-doctype-commit-vN.ext) wins over
  // the server's default filename.
  const name = nameOverride || (m ? m[1] : 'download.txt');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return name;
}

let catalogCache = null;
export async function getCatalog() {
  if (!catalogCache) {
    // Don't cache a failure — one flaky request must not brick the catalog
    // for the rest of the session.
    catalogCache = api('/catalog').catch((e) => { catalogCache = null; throw e; });
  }
  return catalogCache;
}
