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

export async function api(path, opts = {}) {
  let res;
  const sentWith = token;
  try {
    res = await fetch('/api' + path, {
      method: opts.method || 'GET',
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
}

// Authenticated file download (fetch → blob → anchor click).
export async function download(path, nameOverride) {
  let res;
  try {
    res = await fetch('/api' + path, {
      headers: token ? { Authorization: 'Bearer ' + token } : {}
    });
  } catch {
    throw new Error('Network error — check your connection and try again');
  }
  if (!res.ok) {
    if (res.status === 401 && handleUnauthorized(path, {})) {
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
