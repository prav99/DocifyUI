// Notion adapter. Auth: internal integration token (Bearer).
// The integration must be shared with the pages/databases it should read.

const HEADERS = (token) => ({
  Authorization: 'Bearer ' + token,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json'
});

export async function verifyNotion(token) {
  const r = await fetch('https://api.notion.com/v1/users/me', { headers: HEADERS(token) });
  if (r.status === 401) throw new Error('Notion rejected the token — check the integration token');
  if (!r.ok) throw new Error('Notion API error (' + r.status + ')');
  return r.json();
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

export async function listNotion(token) {
  const r = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: HEADERS(token),
    body: JSON.stringify({ page_size: 25, sort: { direction: 'descending', timestamp: 'last_edited_time' } })
  });
  if (!r.ok) throw new Error('Notion search failed (' + r.status + ') — has the integration been shared with any pages?');
  const d = await r.json();
  return (d.results || []).map((x) => ({
    name: titleOf(x) + (x.object === 'database' ? ' (database)' : ' (page)'),
    branch: '', lang: '',
    updated: x.last_edited_time ? new Date(x.last_edited_time).toLocaleDateString() : ''
  }));
}
