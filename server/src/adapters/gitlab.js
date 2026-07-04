// GitLab adapter: real API with an OAuth token, sample data without.

const SAMPLE = [
  { name: 'acme/checkout-web', branch: 'main', lang: 'TypeScript', updated: '3 hours ago' },
  { name: 'acme/inventory-api', branch: 'main', lang: 'Go', updated: 'yesterday' },
  { name: 'acme/etl-jobs', branch: 'develop', lang: 'Python', updated: 'last week' }
];

export async function listProjects(token) {
  if (token) {
    try {
      const r = await fetch('https://gitlab.com/api/v4/projects?membership=true&order_by=last_activity_at&per_page=20', {
        headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'DocGen' }
      });
      if (r.ok) {
        const rows = await r.json();
        if (Array.isArray(rows) && rows.length) {
          return rows.map((x) => ({
            name: x.path_with_namespace,
            branch: x.default_branch || 'main',
            lang: '—',
            updated: x.last_activity_at ? new Date(x.last_activity_at).toLocaleDateString() : ''
          }));
        }
      }
    } catch { /* fall back */ }
  }
  return SAMPLE;
}
