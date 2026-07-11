// GitLab adapter. Lists ONLY projects the connected account can really
// access. No token → empty list (never sample or cached data).

export async function listProjects(token) {
  if (!token) return [];
  const r = await fetch('https://gitlab.com/api/v4/projects?membership=true&order_by=last_activity_at&per_page=50', {
    headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'DocGen' }
  });
  if (!r.ok) throw new Error('GitLab: HTTP ' + r.status + (r.status === 401 ? ' — token expired or revoked' : ''));
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
  const headers = { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'User-Agent': 'DocGen' };
  let r = await fetch('https://gitlab.com/api/v4/groups/' + encodeURIComponent(org) + '/projects?per_page=50&order_by=last_activity_at', { headers });
  if (r.status === 404) {
    r = await fetch('https://gitlab.com/api/v4/users/' + encodeURIComponent(org) + '/projects?per_page=50&order_by=last_activity_at', { headers });
  }
  if (r.status === 404) throw new Error('“' + org + '” was not found on GitLab');
  if (!r.ok) throw new Error('GitLab: HTTP ' + r.status);
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).map((x) => ({
    name: x.path_with_namespace,
    branch: x.default_branch || 'main',
    lang: '—',
    private: x.visibility ? x.visibility !== 'public' : false,
    updated: x.last_activity_at ? new Date(x.last_activity_at).toLocaleDateString() : ''
  }));
}

// Real branches for a project path ("group/name"). Throws on failure.
export async function listBranches(token, repo) {
  const r = await fetch('https://gitlab.com/api/v4/projects/' + encodeURIComponent(repo) + '/repository/branches?per_page=100', {
    headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'DocGen' }
  });
  if (!r.ok) throw new Error('GitLab branches: HTTP ' + r.status);
  const rows = await r.json();
  return rows.map((b) => b.name);
}
