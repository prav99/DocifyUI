// Atlassian adapter (Jira + Confluence).
// Auth model: account email + API token via HTTP Basic — cred is "email:token".
// Tokens: https://id.atlassian.com/manage-profile/security/api-tokens

const basic = (cred) => 'Basic ' + Buffer.from(cred).toString('base64');

// Accept anything a user might paste — "yourteam.atlassian.net", a full page
// URL like "https://yourteam.atlassian.net/jira/projects", with or without a
// trailing slash — and normalize it to the site origin.
export function normalizeSite(raw) {
  let s = String(raw || '').trim();
  if (!s) throw new Error('Enter your Atlassian site URL (e.g. https://yourteam.atlassian.net)');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch { throw new Error('That does not look like a valid URL — expected something like https://yourteam.atlassian.net'); }
  if (!u.hostname.includes('.')) throw new Error('That does not look like a valid site host — expected something like yourteam.atlassian.net');
  return u.origin; // strip any path/query the user pasted along
}

async function get(url, cred, what) {
  let r;
  try {
    r = await fetch(url, { headers: { Authorization: basic(cred), Accept: 'application/json' } });
  } catch {
    throw new Error('Could not reach ' + new URL(url).origin + ' — check the site URL and your network');
  }
  if (r.status === 401) throw new Error('Authentication failed — check the account email and API token (create one at id.atlassian.com → Security → API tokens)');
  if (r.status === 403) throw new Error('Access denied — the account does not have permission on this ' + what + ' site');
  if (r.status === 404) throw new Error('No ' + what + ' found at this site URL — check the address (e.g. https://yourteam.atlassian.net)');
  if (!r.ok) throw new Error('Atlassian API error (' + r.status + ') — is the site URL correct?');
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('json')) throw new Error('That URL did not return an API response — check that it is your Atlassian site root (e.g. https://yourteam.atlassian.net)');
  return r.json();
}

export async function verifyJira(siteUrl, cred) {
  const site = normalizeSite(siteUrl);
  const me = await get(site + '/rest/api/3/myself', cred, 'Jira');
  return { site, account: me.displayName || me.emailAddress || 'Jira user' };
}

export async function listJiraProjects(siteUrl, cred) {
  const site = normalizeSite(siteUrl);
  const d = await get(site + '/rest/api/3/project/search?maxResults=50', cred, 'Jira');
  return (d.values || []).map((p) => ({
    name: p.key + ' — ' + p.name, branch: '', lang: '', updated: ''
  }));
}

export async function verifyConfluence(siteUrl, cred) {
  const site = normalizeSite(siteUrl);
  const d = await get(site + '/wiki/rest/api/space?limit=1', cred, 'Confluence');
  // Confluence-native identity endpoint (works on Confluence-only sites too).
  const me = await get(site + '/wiki/rest/api/user/current', cred, 'Confluence').catch(() => null);
  return { site, account: me ? (me.displayName || me.publicName || '') : '', spaces: d.size };
}

/* ---- Optional generation scope: a specific issue / page ---- */

// "KAN-1, KAN-7" → validated against the real site; returns [{key, summary}].
export async function verifyJiraIssues(siteUrl, cred, value) {
  const site = normalizeSite(siteUrl);
  const keys = String(value || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!keys.length) throw new Error('Enter at least one issue ID (e.g. KAN-1)');
  if (keys.some((k) => !/^[A-Z][A-Z0-9]*-\d+$/.test(k))) {
    throw new Error('Issue IDs look like PROJECT-NUMBER (e.g. KAN-1) — separate several with commas');
  }
  const out = [];
  for (const key of keys.slice(0, 10)) {
    let r;
    try {
      r = await fetch(site + '/rest/api/3/issue/' + key + '?fields=summary,issuetype',
        { headers: { Authorization: basic(cred), Accept: 'application/json' } });
    } catch { throw new Error('Could not reach ' + site); }
    if (r.status === 404) throw new Error('Issue ' + key + ' was not found on ' + site.replace('https://', ''));
    if (!r.ok) throw new Error('Could not look up ' + key + ' (' + r.status + ')');
    const d = await r.json();
    out.push({ key: d.key, summary: (d.fields && d.fields.summary) || '' });
  }
  return out;
}

// Page URL ("…/pages/123456/Title") or bare numeric ID → { id, title }.
export async function verifyConfluencePage(siteUrl, cred, value) {
  const site = normalizeSite(siteUrl);
  const v = String(value || '').trim();
  const m = v.match(/\/pages\/(\d+)/) || v.match(/pageId=(\d+)/) || v.match(/^(\d+)$/);
  if (!m) throw new Error('Paste a Confluence page URL (…/pages/<id>/…) or a numeric page ID');
  const d = await get(site + '/wiki/rest/api/content/' + m[1], cred, 'Confluence');
  return { id: m[1], title: d.title || 'Untitled page' };
}

export async function listConfluenceSpaces(siteUrl, cred) {
  const site = normalizeSite(siteUrl);
  const d = await get(site + '/wiki/rest/api/space?limit=50', cred, 'Confluence');
  return (d.results || []).map((s) => ({
    name: s.key + ' — ' + s.name, branch: '', lang: '', updated: ''
  }));
}
