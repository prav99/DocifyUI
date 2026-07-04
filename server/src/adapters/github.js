// GitHub adapter. With a real OAuth token (from /api/auth/oauth/github) it calls
// the GitHub REST API; without one it falls back to sample data so the app
// always runs.

const SAMPLE = [
  { name: 'acme/payments-api', branch: 'main', lang: 'TypeScript', updated: '2 hours ago' },
  { name: 'acme/ledger-service', branch: 'main', lang: 'Go', updated: 'yesterday' },
  { name: 'acme/sdk-python', branch: 'develop', lang: 'Python', updated: '3 days ago' },
  { name: 'acme/webhooks-gateway', branch: 'main', lang: 'TypeScript', updated: 'last week' }
];

export async function listRepos(token) {
  if (token) {
    try {
      const r = await fetch('https://api.github.com/user/repos?per_page=20&sort=pushed', {
        headers: {
          Authorization: 'Bearer ' + token,
          'User-Agent': 'DocGen',
          Accept: 'application/vnd.github+json'
        }
      });
      if (r.ok) {
        const rows = await r.json();
        if (Array.isArray(rows) && rows.length) {
          return rows.map((x) => ({
            name: x.full_name,
            branch: x.default_branch || 'main',
            lang: x.language || '—',
            updated: x.pushed_at ? new Date(x.pushed_at).toLocaleDateString() : ''
          }));
        }
      }
    } catch { /* network issue — fall back to sample data */ }
  }
  return SAMPLE;
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
