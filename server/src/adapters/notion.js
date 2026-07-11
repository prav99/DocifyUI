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

/* ================= Notion as a first-class source =================
   Users select PAGES and DATABASES (search + multi-select); generation
   grounds on their real content — blocks are flattened to markdown,
   optionally including child pages. */

// Search shared pages/databases; empty query returns the most recent items.
export async function notionSearch(token, q = '') {
  const r = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: HEADERS(token),
    body: JSON.stringify({
      ...(String(q).trim() ? { query: String(q).trim() } : {}),
      page_size: 30,
      sort: { direction: 'descending', timestamp: 'last_edited_time' }
    })
  });
  if (r.status === 401) throw new Error('Notion rejected the token — reconnect the integration');
  if (!r.ok) throw new Error('Notion search failed (' + r.status + ') — is the integration shared with any pages?');
  const d = await r.json();
  return (d.results || []).map((x) => ({
    id: x.id,
    title: titleOf(x),
    kind: x.object, // page | database
    updated: x.last_edited_time ? String(x.last_edited_time).slice(0, 10) : ''
  }));
}

const rt = (arr) => (Array.isArray(arr) ? arr.map((t) => t.plain_text || '').join('') : '');

// One block → markdown line(s). Children are followed for structural blocks.
function blockToMd(b) {
  const t = b.type;
  const d = b[t] || {};
  switch (t) {
    case 'heading_1': return '# ' + rt(d.rich_text);
    case 'heading_2': return '## ' + rt(d.rich_text);
    case 'heading_3': return '### ' + rt(d.rich_text);
    case 'paragraph': return rt(d.rich_text);
    case 'bulleted_list_item': return '- ' + rt(d.rich_text);
    case 'numbered_list_item': return '1. ' + rt(d.rich_text);
    case 'to_do': return '- [' + (d.checked ? 'x' : ' ') + '] ' + rt(d.rich_text);
    case 'quote': return '> ' + rt(d.rich_text);
    case 'callout': return '> ' + rt(d.rich_text);
    case 'code': return '```' + (d.language || '') + '\n' + rt(d.rich_text) + '\n```';
    case 'toggle': return rt(d.rich_text);
    case 'divider': return '---';
    case 'table_row': return '| ' + (d.cells || []).map((c) => rt(c)).join(' | ') + ' |';
    case 'child_page': return '';
    case 'image': return d.caption && rt(d.caption) ? '(image: ' + rt(d.caption) + ')' : '';
    case 'bookmark': case 'embed': case 'link_preview': return d.url ? '(' + d.url + ')' : '';
    default: return d.rich_text ? rt(d.rich_text) : '';
  }
}

async function listChildren(token, blockId, cursor) {
  const url = 'https://api.notion.com/v1/blocks/' + blockId + '/children?page_size=100' + (cursor ? '&start_cursor=' + cursor : '');
  const r = await fetch(url, { headers: HEADERS(token) });
  if (!r.ok) return { results: [], has_more: false };
  return r.json();
}

async function pageBlocksMd(token, pageId, depth, budget, childPages) {
  const out = [];
  let cursor;
  do {
    const d = await listChildren(token, pageId, cursor);
    for (const b of d.results || []) {
      if (budget.blocks-- <= 0) return out;
      if (b.type === 'child_page') {
        if (childPages) childPages.push({ id: b.id, title: (b.child_page && b.child_page.title) || 'Untitled' });
        continue;
      }
      const line = blockToMd(b);
      if (line) out.push('  '.repeat(Math.min(depth, 2)) + line);
      // Nested content (list items, toggles, tables) one level down.
      if (b.has_children && depth < 2 && b.type !== 'child_database') {
        out.push(...await pageBlocksMd(token, b.id, depth + 1, budget, childPages));
      }
    }
    cursor = d.has_more ? d.next_cursor : null;
  } while (cursor);
  return out;
}

// Database → its rows' titles + properties as a compact table.
async function databaseMd(token, dbId, budget) {
  const r = await fetch('https://api.notion.com/v1/databases/' + dbId + '/query', {
    method: 'POST', headers: HEADERS(token), body: JSON.stringify({ page_size: 50 })
  });
  if (!r.ok) return [];
  const d = await r.json();
  const rows = [];
  for (const pg of d.results || []) {
    if (budget.blocks-- <= 0) break;
    const props = pg.properties || {};
    const cells = Object.entries(props).slice(0, 6).map(([k, v]) => {
      const val = v.type === 'title' ? rt(v.title)
        : v.type === 'rich_text' ? rt(v.rich_text)
        : v.type === 'select' ? (v.select && v.select.name) || ''
        : v.type === 'multi_select' ? (v.multi_select || []).map((s) => s.name).join(', ')
        : v.type === 'status' ? (v.status && v.status.name) || ''
        : v.type === 'date' ? (v.date && v.date.start) || ''
        : v.type === 'number' ? String(v.number ?? '')
        : v.type === 'checkbox' ? (v.checkbox ? 'yes' : 'no') : '';
      return k + ': ' + val;
    }).filter((c) => !c.endsWith(': '));
    if (cells.length) rows.push('- ' + cells.join(' · '));
  }
  return rows;
}

// Full content bundles for GENERATION.
export async function fetchNotionContent(token, items, { includeChildren = false, maxPages = 15 } = {}) {
  const out = [];
  const queue = items.slice(0, maxPages).map((i) => ({ ...i }));
  const seen = new Set();
  const budget = { blocks: 1200 };
  while (queue.length && out.length < maxPages && budget.blocks > 0) {
    const item = queue.shift();
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    try {
      const childPages = [];
      const body = item.kind === 'database'
        ? await databaseMd(token, item.id, budget)
        : await pageBlocksMd(token, item.id, 0, budget, childPages);
      out.push({
        id: item.id,
        title: item.title || 'Untitled',
        md: '# ' + (item.title || 'Untitled') + (item.kind === 'database' ? ' (database)' : '') + '\n\n' + body.join('\n')
      });
      if (includeChildren) queue.push(...childPages.map((c) => ({ ...c, kind: 'page' })));
    } catch { /* skip unreadable items; the rest still ground generation */ }
  }
  return out;
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
