// GitHub adapter. Lists ONLY repositories the connected account can really
// access. No token → empty list (never sample or cached data): the UI must
// show an honest "not connected" state instead of fake repositories.

export async function listRepos(token) {
  if (!token) return [];
  const r = await fetch('https://api.github.com/user/repos?per_page=50&sort=pushed', {
    headers: {
      Authorization: 'Bearer ' + token,
      'User-Agent': 'DocGen',
      Accept: 'application/vnd.github+json'
    }
  });
  if (!r.ok) throw new Error('GitHub: HTTP ' + r.status + (r.status === 401 ? ' — token expired or revoked' : ''));
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
// caller can fall back honestly instead of inventing branches.
export async function listBranches(token, repo) {
  const r = await fetch('https://api.github.com/repos/' + repo + '/branches?per_page=100', {
    headers: {
      Authorization: 'Bearer ' + token,
      'User-Agent': 'DocGen',
      Accept: 'application/vnd.github+json'
    }
  });
  if (!r.ok) throw new Error('GitHub branches: HTTP ' + r.status);
  const rows = await r.json();
  return rows.map((b) => b.name);
}
