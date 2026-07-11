// Bitbucket adapter. Lists ONLY repositories the connected account can really
// access. No token → empty list (never sample or cached data).

export async function listRepos(token) {
  if (!token) return [];
  const r = await fetch('https://api.bitbucket.org/2.0/repositories?role=member&sort=-updated_on&pagelen=50', {
    headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'DocGen' }
  });
  if (!r.ok) throw new Error('Bitbucket: HTTP ' + r.status + (r.status === 401 ? ' — token expired or revoked' : ''));
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
  const headers = { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'User-Agent': 'DocGen' };
  const r = await fetch('https://api.bitbucket.org/2.0/repositories/' + encodeURIComponent(org) + '?pagelen=50&sort=-updated_on', { headers });
  if (r.status === 404) throw new Error('“' + org + '” was not found on Bitbucket');
  if (!r.ok) throw new Error('Bitbucket: HTTP ' + r.status);
  const d = await r.json();
  return ((d && d.values) || []).map((x) => ({
    name: x.full_name,
    branch: x.mainbranch ? x.mainbranch.name : 'main',
    lang: x.language || '—',
    private: x.is_private !== false,
    updated: x.updated_on ? new Date(x.updated_on).toLocaleDateString() : ''
  }));
}

// Real branches for a repository ("workspace/slug"). Throws on failure.
export async function listBranches(token, repo) {
  const r = await fetch('https://api.bitbucket.org/2.0/repositories/' + repo + '/refs/branches?pagelen=100', {
    headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'DocGen' }
  });
  if (!r.ok) throw new Error('Bitbucket branches: HTTP ' + r.status);
  const d = await r.json();
  return (d.values || []).map((b) => b.name);
}
