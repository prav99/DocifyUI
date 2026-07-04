// Atlassian adapter (Jira + Confluence).
// Auth model: account email + API token via HTTP Basic — cred is "email:token".

const basic = (cred) => 'Basic ' + Buffer.from(cred).toString('base64');
const base = (url) => String(url).trim().replace(/\/+$/, '');

async function get(url, cred) {
  const r = await fetch(url, { headers: { Authorization: basic(cred), Accept: 'application/json' } });
  if (r.status === 401 || r.status === 403) throw new Error('Authentication failed — check the site URL, account email, and API token');
  if (!r.ok) throw new Error('Atlassian API error (' + r.status + ') — is the site URL correct?');
  return r.json();
}

export async function verifyJira(siteUrl, cred) {
  return get(base(siteUrl) + '/rest/api/3/myself', cred);
}

export async function listJiraProjects(siteUrl, cred) {
  const d = await get(base(siteUrl) + '/rest/api/3/project/search?maxResults=25', cred);
  return (d.values || []).map((p) => ({
    name: p.key + ' — ' + p.name, branch: '', lang: '', updated: ''
  }));
}

export async function verifyConfluence(siteUrl, cred) {
  return get(base(siteUrl) + '/wiki/rest/api/space?limit=1', cred);
}

export async function listConfluenceSpaces(siteUrl, cred) {
  const d = await get(base(siteUrl) + '/wiki/rest/api/space?limit=25', cred);
  return (d.results || []).map((s) => ({
    name: s.key + ' — ' + s.name, branch: '', lang: '', updated: ''
  }));
}
