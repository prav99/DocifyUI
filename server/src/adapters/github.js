// GitHub adapter. Lists ONLY repositories the connected account can really
// access. No token → empty list (never sample or cached data): the UI must
// show an honest "not connected" state instead of fake repositories.

// Failures are thrown, never swallowed into an empty list: "GitHub is rate
// limiting us" and "you have no repositories" must never look the same.
//
// GitHub answers 403 for BOTH an exhausted rate limit and a token without the
// right scope, so the message covers the two — "HTTP 403" alone sends people
// to the wrong fix. Tokens travel in the Authorization header and never appear
// in a message. These calls are interactive (someone is waiting on a picker),
// so they fail fast with an explanation rather than retrying silently; the
// background repository reader (adapters/repofiles.js) is the one that backs
// off and retries.
function ghFail(status, what) {
  if (status === 401) return new Error('GitHub rejected the connected account — the token expired or was revoked. Reconnect GitHub under Sources.');
  if (status === 403) return new Error('GitHub denied the request for ' + what + ' — the API rate limit may be exhausted (retry in a few minutes), or the connected account lacks access.');
  if (status === 429) return new Error('GitHub is rate limiting Docify — retry in a few minutes.');
  if (status >= 500) return new Error('GitHub is having problems (HTTP ' + status + ') — nothing is wrong on your side; retry shortly.');
  return new Error('GitHub returned HTTP ' + status + ' for ' + what + '.');
}

const H = (token) => ({
  ...(token ? { Authorization: 'Bearer ' + token } : {}),
  'User-Agent': 'Docify',
  Accept: 'application/vnd.github+json'
});

export async function listRepos(token) {
  if (!token) return [];
  const r = await fetch('https://api.github.com/user/repos?per_page=50&sort=pushed', { headers: H(token) });
  if (!r.ok) throw ghFail(r.status, 'your repositories');
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).map((x) => ({
    name: x.full_name,
    branch: x.default_branch || 'main',
    lang: x.language || '—',
    private: !!x.private,
    updated: x.pushed_at ? new Date(x.pushed_at).toLocaleDateString() : ''
  }));
}

// Public repositories of any organisation or user — powers "browse another
// organisation" in the pickers. Works without a token (public data only);
// with a member token, org-private repositories the account can access
// are included too.
export async function listOrgRepos(token, org) {
  const headers = H(token);
  let r = await fetch('https://api.github.com/orgs/' + encodeURIComponent(org) + '/repos?per_page=50&sort=pushed', { headers });
  if (r.status === 404) {
    r = await fetch('https://api.github.com/users/' + encodeURIComponent(org) + '/repos?per_page=50&sort=pushed', { headers });
  }
  if (r.status === 404) {
    throw new Error('“' + org + '” was not found on GitHub' +
      (token ? '' : ' — if it is private, connect GitHub under Sources so Docify can see it'));
  }
  if (!r.ok) throw ghFail(r.status, '“' + org + '”');
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).map((x) => ({
    name: x.full_name,
    branch: x.default_branch || 'main',
    lang: x.language || '—',
    private: !!x.private,
    updated: x.pushed_at ? new Date(x.pushed_at).toLocaleDateString() : ''
  }));
}

// Real branches for a repository ("owner/name"). Throws on failure so the
// caller can fall back honestly instead of inventing branches. The token is
// optional — public repositories list their branches unauthenticated, and
// sending "Bearer " with an empty token gets the request rejected outright.
export async function listBranches(token, repo) {
  const r = await fetch('https://api.github.com/repos/' + repo + '/branches?per_page=100', { headers: H(token) });
  if (r.status === 404) throw new Error('“' + repo + '” was not found on GitHub, or the connected account cannot see it.');
  if (!r.ok) throw ghFail(r.status, 'the branches of “' + repo + '”');
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).map((b) => b.name);
}
