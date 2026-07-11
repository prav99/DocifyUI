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

/* ================= Jira as a first-class documentation source =================
   Not a repository: users select ISSUES (directly, or via epic / sprint /
   release / project / JQL), and those issues become the source material for
   generation. Jira Cloud REST v3; Data Center can slot in later by swapping
   the base path. */

const ISSUE_RE = /^[A-Z][A-Z0-9_]*-\d+$/;
const ISSUE_FIELDS = 'summary,issuetype,status,priority,assignee,labels,updated';

// Atlassian Document Format → readable plain text (best effort, never throws).
export function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  const kids = Array.isArray(node.content) ? node.content.map(adfToText).join('') : '';
  switch (node.type) {
    case 'text': return node.text || '';
    case 'hardBreak': return '\n';
    case 'paragraph': return kids + '\n';
    case 'heading': return '\n' + kids + '\n';
    case 'bulletList': case 'orderedList': return kids;
    case 'listItem': return '- ' + kids.replace(/\n+$/, '') + '\n';
    case 'codeBlock': return '\n```\n' + kids + '\n```\n';
    case 'blockquote': return '> ' + kids;
    case 'mention': return (node.attrs && node.attrs.text) || '';
    case 'inlineCard': return (node.attrs && node.attrs.url) || '';
    default: return kids;
  }
}

const briefIssue = (i) => ({
  key: i.key,
  summary: (i.fields && i.fields.summary) || '',
  type: (i.fields && i.fields.issuetype && i.fields.issuetype.name) || '',
  status: (i.fields && i.fields.status && i.fields.status.name) || '',
  priority: (i.fields && i.fields.priority && i.fields.priority.name) || '',
  assignee: (i.fields && i.fields.assignee && i.fields.assignee.displayName) || '',
  labels: (i.fields && i.fields.labels) || [],
  updated: (i.fields && i.fields.updated) ? String(i.fields.updated).slice(0, 10) : ''
});

// Run a JQL query. Uses the current /search/jql endpoint with a fallback to
// the classic /search for older deployments.
export async function jiraSearchJql(siteUrl, cred, jql, max = 50) {
  const site = normalizeSite(siteUrl);
  const q = 'jql=' + encodeURIComponent(jql) + '&maxResults=' + Math.min(Number(max) || 50, 100) + '&fields=' + ISSUE_FIELDS;
  let r;
  try {
    r = await fetch(site + '/rest/api/3/search/jql?' + q, { headers: { Authorization: basic(cred), Accept: 'application/json' } });
    if (r.status === 404 || r.status === 410) {
      r = await fetch(site + '/rest/api/3/search?' + q, { headers: { Authorization: basic(cred), Accept: 'application/json' } });
    }
  } catch { throw new Error('Could not reach ' + site); }
  if (r.status === 400) {
    const d = await r.json().catch(() => ({}));
    throw new Error('Jira rejected the query: ' + ((d.errorMessages || [])[0] || 'invalid JQL'));
  }
  if (r.status === 401) throw new Error('Jira authentication failed — reconnect your account');
  if (!r.ok) throw new Error('Jira search failed (' + r.status + ')');
  const d = await r.json();
  return (d.issues || []).map(briefIssue);
}

// Text or key search scoped to an optional project. "DOC-1" style input is
// looked up as a key; anything else becomes a text match.
export async function jiraSearch(siteUrl, cred, { text = '', project = '' } = {}) {
  const parts = [];
  const t = String(text).trim();
  if (project) parts.push('project = "' + project.replace(/"/g, '') + '"');
  if (ISSUE_RE.test(t.toUpperCase())) parts.push('key = ' + t.toUpperCase());
  else if (t) parts.push('text ~ "' + t.replace(/"/g, '') + '"');
  const jql = (parts.length ? parts.join(' AND ') + ' ' : '') + 'order by updated desc';
  return jiraSearchJql(siteUrl, cred, jql, 25);
}

// Per-key validation that NEVER throws per key: [{key, ok, summary, …, reason}].
export async function validateJiraIssuesDetailed(siteUrl, cred, keys) {
  const site = normalizeSite(siteUrl);
  const list = [...new Set(keys.map((k) => String(k).trim().toUpperCase()).filter(Boolean))].slice(0, 50);
  const out = [];
  for (const key of list) {
    if (!ISSUE_RE.test(key)) { out.push({ key, ok: false, reason: 'Not an issue key — expected PROJECT-NUMBER (e.g. DOC-101)' }); continue; }
    try {
      const r = await fetch(site + '/rest/api/3/issue/' + key + '?fields=' + ISSUE_FIELDS,
        { headers: { Authorization: basic(cred), Accept: 'application/json' } });
      if (r.status === 404) { out.push({ key, ok: false, reason: 'Not found, or no permission to view it' }); continue; }
      if (r.status === 401) { out.push({ key, ok: false, reason: 'Authentication failed — reconnect Jira' }); continue; }
      if (!r.ok) { out.push({ key, ok: false, reason: 'Lookup failed (' + r.status + ')' }); continue; }
      out.push({ ok: true, ...briefIssue(await r.json()) });
    } catch { out.push({ key, ok: false, reason: 'Could not reach ' + site }); }
  }
  return out;
}

// Selection modes → concrete issues. Every mode is JQL under the hood, so new
// modes are one line each.
export async function resolveJiraScope(siteUrl, cred, { mode, value = '', project = '' } = {}) {
  const v = String(value).trim();
  const proj = project ? 'project = "' + project.replace(/"/g, '') + '"' : '';
  const and = (a, b) => [a, b].filter(Boolean).join(' AND ');
  let jql;
  if (mode === 'epic') {
    if (!ISSUE_RE.test(v.toUpperCase())) throw new Error('Enter the epic’s issue key (e.g. DOC-100)');
    jql = 'parent = ' + v.toUpperCase() + ' order by rank';
  } else if (mode === 'sprint') {
    jql = and(proj, v ? 'sprint = "' + v.replace(/"/g, '') + '"' : 'sprint in openSprints()') + ' order by rank';
  } else if (mode === 'release') {
    if (!v) throw new Error('Pick or enter a release / fix version');
    jql = and(proj, 'fixVersion = "' + v.replace(/"/g, '') + '"') + ' order by updated desc';
  } else if (mode === 'project') {
    if (!proj) throw new Error('Pick a project first');
    jql = proj + ' order by updated desc';
  } else if (mode === 'jql') {
    if (!v) throw new Error('Enter a JQL query');
    jql = v;
  } else {
    throw new Error('Unknown selection mode: ' + mode);
  }
  let issues;
  try {
    issues = await jiraSearchJql(siteUrl, cred, jql, 50);
  } catch (e) {
    // Team-managed vs company-managed epics differ; fall back once.
    if (mode === 'epic') issues = await jiraSearchJql(siteUrl, cred, '"Epic Link" = ' + v.toUpperCase() + ' order by rank', 50);
    else throw e;
  }
  return { jql, issues };
}

export async function listJiraVersions(siteUrl, cred, projectKey) {
  const site = normalizeSite(siteUrl);
  const key = String(projectKey || '').split(' ')[0];
  if (!key) return [];
  const d = await get(site + '/rest/api/3/project/' + encodeURIComponent(key) + '/versions', cred, 'Jira');
  return (Array.isArray(d) ? d : []).map((x) => ({ name: x.name, released: !!x.released }));
}

export async function listJiraEpics(siteUrl, cred, project) {
  const jql = (project ? 'project = "' + String(project).replace(/"/g, '') + '" AND ' : '') + 'issuetype = Epic order by updated desc';
  return jiraSearchJql(siteUrl, cred, jql, 25);
}

// Full issue bundles for GENERATION: everything the account may read becomes
// a markdown source document (summary, description, relationships, comments).
export async function fetchJiraIssuesContent(siteUrl, cred, keys, { maxIssues = 20, maxComments = 10 } = {}) {
  const site = normalizeSite(siteUrl);
  const out = [];
  for (const key of keys.slice(0, maxIssues)) {
    try {
      const r = await fetch(site + '/rest/api/3/issue/' + encodeURIComponent(key) +
        '?fields=summary,description,issuetype,status,priority,assignee,reporter,labels,components,fixVersions,parent,issuelinks,created,updated&expand=renderedFields',
        { headers: { Authorization: basic(cred), Accept: 'application/json' } });
      if (!r.ok) continue;
      const d = await r.json();
      const f = d.fields || {};
      const lines = [
        '# ' + d.key + ' — ' + (f.summary || ''),
        '',
        '- Type: ' + ((f.issuetype && f.issuetype.name) || '—') + ' · Status: ' + ((f.status && f.status.name) || '—') + ' · Priority: ' + ((f.priority && f.priority.name) || '—'),
        '- Assignee: ' + ((f.assignee && f.assignee.displayName) || 'Unassigned') + ' · Reporter: ' + ((f.reporter && f.reporter.displayName) || '—'),
        f.labels && f.labels.length ? '- Labels: ' + f.labels.join(', ') : null,
        f.components && f.components.length ? '- Components: ' + f.components.map((c) => c.name).join(', ') : null,
        f.fixVersions && f.fixVersions.length ? '- Fix versions: ' + f.fixVersions.map((v) => v.name).join(', ') : null,
        f.parent ? '- Parent: ' + f.parent.key + ' — ' + ((f.parent.fields && f.parent.fields.summary) || '') : null,
        '- Created: ' + String(f.created || '').slice(0, 10) + ' · Updated: ' + String(f.updated || '').slice(0, 10),
        '',
        '## Description',
        adfToText(f.description).trim() || '(no description)'
      ];
      const links = (f.issuelinks || []).map((l) => {
        const other = l.outwardIssue || l.inwardIssue;
        const rel = l.outwardIssue ? (l.type && l.type.outward) : (l.type && l.type.inward);
        return other ? '- ' + (rel || 'relates to') + ' ' + other.key + ' — ' + ((other.fields && other.fields.summary) || '') : '';
      }).filter(Boolean);
      if (links.length) lines.push('', '## Linked issues', ...links);
      try {
        const cr = await fetch(site + '/rest/api/3/issue/' + encodeURIComponent(key) + '/comment?maxResults=' + maxComments + '&orderBy=-created',
          { headers: { Authorization: basic(cred), Accept: 'application/json' } });
        if (cr.ok) {
          const cd = await cr.json();
          const comments = (cd.comments || []).map((c) =>
            '- ' + ((c.author && c.author.displayName) || 'Someone') + ' (' + String(c.created || '').slice(0, 10) + '): ' + adfToText(c.body).trim());
          if (comments.length) lines.push('', '## Recent comments', ...comments);
        }
      } catch { /* comments are optional */ }
      out.push({ key: d.key, summary: f.summary || '', md: lines.filter((l) => l !== null && l !== undefined).join('\n') });
    } catch { /* skip unreachable issues; the rest still ground generation */ }
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

/* ================= Confluence as a first-class source =================
   Users select PAGES — browse a space, search, or run CQL — and generation
   grounds on the pages' real content (storage format flattened to text). */

const briefPage = (c) => ({
  id: c.id,
  title: c.title || 'Untitled',
  space: (c.space && (c.space.key || c.space.name)) || (c.resultGlobalContainer && c.resultGlobalContainer.title) || '',
  type: c.type || 'page',
  updated: (c.version && c.version.when) ? String(c.version.when).slice(0, 10)
    : (c.lastModified ? String(c.lastModified).slice(0, 10) : '')
});

// Search pages by text, space, or raw CQL.
export async function confluenceSearch(siteUrl, cred, { text = '', space = '', cql = '' } = {}) {
  const site = normalizeSite(siteUrl);
  let query = String(cql || '').trim();
  if (!query) {
    const parts = ['type = page'];
    if (space) parts.push('space = "' + String(space).split(' ')[0].replace(/"/g, '') + '"');
    if (String(text).trim()) parts.push('(title ~ "' + String(text).trim().replace(/"/g, '') + '*" OR text ~ "' + String(text).trim().replace(/"/g, '') + '")');
    query = parts.join(' AND ') + ' order by lastmodified desc';
  }
  const d = await get(site + '/wiki/rest/api/content/search?limit=30&expand=space,version&cql=' + encodeURIComponent(query), cred, 'Confluence');
  return (d.results || []).map(briefPage);
}

// Confluence storage format (XHTML) → readable text. Best effort, no deps.
export function storageToText(html) {
  let s = String(html || '');
  s = s.replace(/<ac:structured-macro[^>]*ac:name="(code|noformat)"[^>]*>[\s\S]*?<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>[\s\S]*?<\/ac:structured-macro>/gi,
    (_, __, code) => '\n```\n' + code + '\n```\n');
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => '\n' + '#'.repeat(Number(n)) + ' ' + t.replace(/<[^>]+>/g, '') + '\n');
  s = s.replace(/<li[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '');
  s = s.replace(/<tr[^>]*>/gi, '\n| ').replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ' | ').replace(/<\/tr>/gi, ' |');
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/div>/gi, '\n');
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

// Full page bundles for GENERATION — optionally including child pages.
export async function fetchConfluenceContent(siteUrl, cred, ids, { includeChildren = false, maxPages = 15 } = {}) {
  const site = normalizeSite(siteUrl);
  const queue = ids.slice(0, maxPages).map(String);
  const seen = new Set();
  const out = [];
  while (queue.length && out.length < maxPages) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    try {
      const d = await get(site + '/wiki/rest/api/content/' + encodeURIComponent(id) + '?expand=body.storage,space,version,metadata.labels', cred, 'Confluence');
      const labels = (((d.metadata || {}).labels || {}).results || []).map((l) => l.name);
      const body = storageToText(d.body && d.body.storage && d.body.storage.value);
      out.push({
        id, title: d.title || 'Untitled',
        md: '# ' + (d.title || 'Untitled') +
          '\n\n- Space: ' + ((d.space && d.space.key) || '—') +
          (labels.length ? ' · Labels: ' + labels.join(', ') : '') +
          (d.version && d.version.when ? ' · Updated: ' + String(d.version.when).slice(0, 10) : '') +
          '\n\n' + (body || '(empty page)')
      });
      if (includeChildren) {
        const kids = await get(site + '/wiki/rest/api/content/' + encodeURIComponent(id) + '/child/page?limit=25', cred, 'Confluence').catch(() => null);
        if (kids && kids.results) queue.push(...kids.results.map((k) => String(k.id)));
      }
    } catch { /* skip restricted pages; the rest still ground generation */ }
  }
  return out;
}

export async function listConfluenceSpaces(siteUrl, cred) {
  const site = normalizeSite(siteUrl);
  const d = await get(site + '/wiki/rest/api/space?limit=50', cred, 'Confluence');
  return (d.results || []).map((s) => ({
    name: s.key + ' — ' + s.name, branch: '', lang: '', updated: ''
  }));
}
