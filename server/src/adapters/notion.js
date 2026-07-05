// Notion adapter. Auth: internal integration token (Bearer).
// Create one at https://www.notion.so/profile/integrations — then share the
// pages/databases it should read with that integration (Connections menu).

const HEADERS = (token) => ({
  Authorization: 'Bearer ' + String(token || '').trim(),
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json'
});

export async function verifyNotion(token) {
  const t = String(token || '').trim();
  if (!t) throw new Error('Notion needs an internal integration token');
  if (!/^(secret_|ntn_)/.test(t)) {
    throw new Error('That does not look like a Notion integration token — it should start with "ntn_" or "secret_" (create one at notion.so/profile/integrations)');
  }
  let r;
  try {
    r = await fetch('https://api.notion.com/v1/users/me', { headers: HEADERS(t) });
  } catch {
    throw new Error('Could not reach the Notion API — check your network');
  }
  if (r.status === 401) throw new Error('Notion rejected the token — check the integration token (and that the integration has not been deleted)');
  if (r.status === 403) throw new Error('The Notion integration lacks the required capabilities — enable "Read content" in the integration settings');
  if (!r.ok) throw new Error('Notion API error (' + r.status + ')');
  const me = await r.json();
  return { account: me.name || (me.bot && me.bot.owner && me.bot.owner.user && me.bot.owner.user.name) || 'Notion integration' };
}

function titleOf(x) {
  try {
    if (x.object === 'database' && Array.isArray(x.title) && x.title.length) return x.title.map((t) => t.plain_text).join('');
    if (x.properties) {
      const tp = Object.values(x.properties).find((p) => p.type === 'title');
      if (tp && Array.isArray(tp.title) && tp.title.length) return tp.title.map((t) => t.plain_text).join('');
    }
  } catch { /* best effort */ }
  return 'Untitled';
}

// Optional generation scope: a specific page/database URL or ID → { id, title }.
export async function verifyNotionItem(token, value) {
  const v = String(value || '').trim();
  const m = v.replace(/-/g, '').match(/([0-9a-f]{32})(?:[^0-9a-f]|$)/i);
  if (!m) throw new Error('Paste a Notion page or database link (or its 32-character ID)');
  const id = m[1].replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  for (const kind of ['pages', 'databases']) {
    const r = await fetch('https://api.notion.com/v1/' + kind + '/' + id, { headers: HEADERS(token) });
    if (r.ok) {
      const d = await r.json();
      return { id, title: titleOf(d) || 'Untitled', kind: kind.slice(0, -1) };
    }
    if (r.status !== 404 && r.status !== 400) {
      throw new Error('Notion lookup failed (' + r.status + ') — is the item shared with your integration?');
    }
  }
  throw new Error('Notion could not find that item — make sure the page is shared with your integration (Page → ⋯ → Connections)');
}

export async function listNotion(token) {
  const r = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: HEADERS(token),
    body: JSON.stringify({ page_size: 50, sort: { direction: 'descending', timestamp: 'last_edited_time' } })
  });
  if (!r.ok) throw new Error('Notion search failed (' + r.status + ') — has the integration been shared with any pages? (Page → ⋯ → Connections → your integration)');
  const d = await r.json();
  return (d.results || []).map((x) => ({
    name: titleOf(x) + (x.object === 'database' ? ' (database)' : ' (page)'),
    branch: '', lang: '',
    updated: x.last_edited_time ? new Date(x.last_edited_time).toLocaleDateString() : ''
  }));
}
