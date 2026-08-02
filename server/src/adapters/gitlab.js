// GitLab adapter. Lists ONLY projects the connected account can really
// access. No token → empty list (never sample or cached data).

// Failures are thrown, never swallowed into an empty list: a throttled or
// refused request must never read as "this account has no projects".
// Interactive calls, so they fail fast with an explanation instead of
// retrying silently. Tokens travel in the Authorization header only.
function glFail(status, what) {
  if (status === 401) return new Error('GitLab rejected the connected account — the token expired or was revoked. Reconnect GitLab under Sources.');
  if (status === 403) return new Error('GitLab denied the request for ' + what + ' — the connected account lacks permission, or the API rate limit is exhausted.');
  if (status === 429) return new Error('GitLab is rate limiting Docify — retry in a few minutes.');
  if (status >= 500) return new Error('GitLab is having problems (HTTP ' + status + ') — nothing is wrong on your side; retry shortly.');
  return new Error('GitLab returned HTTP ' + status + ' for ' + what + '.');
}

const H = (token) => ({ ...(token ? { Authorization: 'Bearer ' + token } : {}), 'User-Agent': 'Docify' });

export async function listProjects(token) {
  if (!token) return [];
  const r = await fetch('https://gitlab.com/api/v4/projects?membership=true&order_by=last_activity_at&per_page=50', { headers: H(token) });
  if (!r.ok) throw glFail(r.status, 'your projects');
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).map((x) => ({
    name: x.path_with_namespace,
    branch: x.default_branch || 'main',
    lang: '—',
    private: x.visibility ? x.visibility !== 'public' : false,
    updated: x.last_activity_at ? new Date(x.last_activity_at).toLocaleDateString() : ''
  }));
}

// Public projects of any group or user — powers "browse another
// organisation" in the pickers. Works without a token (public data only).
export async function listGroupProjects(token, org) {
  const headers = H(token);
  let r = await fetch('https://gitlab.com/api/v4/groups/' + encodeURIComponent(org) + '/projects?per_page=50&order_by=last_activity_at', { headers });
  if (r.status === 404) {
    r = await fetch('https://gitlab.com/api/v4/users/' + encodeURIComponent(org) + '/projects?per_page=50&order_by=last_activity_at', { headers });
  }
  if (r.status === 404) {
    throw new Error('“' + org + '” was not found on GitLab' +
      (token ? '' : ' — if it is private, connect GitLab under Sources so Docify can see it'));
  }
  if (!r.ok) throw glFail(r.status, '“' + org + '”');
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).map((x) => ({
    name: x.path_with_namespace,
    branch: x.default_branch || 'main',
    lang: '—',
    private: x.visibility ? x.visibility !== 'public' : false,
    updated: x.last_activity_at ? new Date(x.last_activity_at).toLocaleDateString() : ''
  }));
}

// Real branches for a project path ("group/name"). Throws on failure. The
// token is optional — public projects list branches unauthenticated, and an
// empty "Bearer " header would get the request rejected outright.
export async function listBranches(token, repo) {
  const r = await fetch('https://gitlab.com/api/v4/projects/' + encodeURIComponent(repo) + '/repository/branches?per_page=100', { headers: H(token) });
  if (r.status === 404) throw new Error('“' + repo + '” was not found on GitLab, or the connected account cannot see it.');
  if (!r.ok) throw glFail(r.status, 'the branches of “' + repo + '”');
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).map((b) => b.name);
}
