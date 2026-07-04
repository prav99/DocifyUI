// Bitbucket adapter: real API with an OAuth token, sample data without.

const SAMPLE = [
  { name: 'acme/mobile-gateway', branch: 'main', lang: 'Kotlin', updated: '5 hours ago' },
  { name: 'acme/billing-jobs', branch: 'main', lang: 'Java', updated: '2 days ago' },
  { name: 'acme/design-tokens', branch: 'main', lang: 'CSS', updated: 'last month' }
];

export async function listRepos(token) {
  if (token) {
    try {
      const r = await fetch('https://api.bitbucket.org/2.0/repositories?role=member&sort=-updated_on&pagelen=20', {
        headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'DocGen' }
      });
      if (r.ok) {
        const d = await r.json();
        if (d && Array.isArray(d.values) && d.values.length) {
          return d.values.map((x) => ({
            name: x.full_name,
            branch: x.mainbranch ? x.mainbranch.name : 'main',
            lang: x.language || '—',
            updated: x.updated_on ? new Date(x.updated_on).toLocaleDateString() : ''
          }));
        }
      }
    } catch { /* fall back */ }
  }
  return SAMPLE;
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
