// Bitbucket adapter. Lists ONLY repositories the connected account can really
// access. No token → empty list (never sample or cached data).

// Failures are thrown, never swallowed into an empty list: a throttled or
// refused request must never read as "this account has no repositories".
// Interactive calls, so they fail fast with an explanation instead of
// retrying silently. Tokens travel in the Authorization header only.
function bbFail(status, what) {
  if (status === 401) return new Error('Bitbucket rejected the connected account — the token expired or was revoked. Reconnect Bitbucket under Sources.');
  if (status === 403) return new Error('Bitbucket denied the request for ' + what + ' — the connected account lacks permission, or the API rate limit is exhausted.');
  if (status === 429) return new Error('Bitbucket is rate limiting Docify — retry in a few minutes.');
  if (status >= 500) return new Error('Bitbucket is having problems (HTTP ' + status + ') — nothing is wrong on your side; retry shortly.');
  return new Error('Bitbucket returned HTTP ' + status + ' for ' + what + '.');
}

const H = (token) => ({ ...(token ? { Authorization: 'Bearer ' + token } : {}), 'User-Agent': 'Docify' });

export async function listRepos(token) {
  if (!token) return [];
  const r = await fetch('https://api.bitbucket.org/2.0/repositories?role=member&sort=-updated_on&pagelen=50', { headers: H(token) });
  if (!r.ok) throw bbFail(r.status, 'your repositories');
  const d = await r.json();
  return ((d && d.values) || []).map((x) => ({
    name: x.full_name,
    branch: x.mainbranch ? x.mainbranch.name : 'main',
    lang: x.language || '—',
    private: x.is_private !== false,
    updated: x.updated_on ? new Date(x.updated_on).toLocaleDateString() : ''
  }));
}

// Public repositories of any workspace — powers "browse another
// organisation" in the pickers. Works without a token (public data only).
export async function listWorkspaceRepos(token, org) {
  const r = await fetch('https://api.bitbucket.org/2.0/repositories/' + encodeURIComponent(org) + '?pagelen=50&sort=-updated_on', { headers: H(token) });
  if (r.status === 404) {
    throw new Error('“' + org + '” was not found on Bitbucket' +
      (token ? '' : ' — if it is private, connect Bitbucket under Sources so Docify can see it'));
  }
  if (!r.ok) throw bbFail(r.status, '“' + org + '”');
  const d = await r.json();
  return ((d && d.values) || []).map((x) => ({
    name: x.full_name,
    branch: x.mainbranch ? x.mainbranch.name : 'main',
    lang: x.language || '—',
    private: x.is_private !== false,
    updated: x.updated_on ? new Date(x.updated_on).toLocaleDateString() : ''
  }));
}

// Real branches for a repository ("workspace/slug"). Throws on failure. The
// token is optional — public repositories list branches unauthenticated, and
// an empty "Bearer " header would get the request rejected outright.
export async function listBranches(token, repo) {
  const r = await fetch('https://api.bitbucket.org/2.0/repositories/' + repo + '/refs/branches?pagelen=100', { headers: H(token) });
  if (r.status === 404) throw new Error('“' + repo + '” was not found on Bitbucket, or the connected account cannot see it.');
  if (!r.ok) throw bbFail(r.status, 'the branches of “' + repo + '”');
  const d = await r.json();
  return ((d && d.values) || []).map((b) => b.name);
}
