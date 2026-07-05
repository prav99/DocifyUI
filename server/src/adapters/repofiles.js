// Public-repository file fetcher. Reads real source files from GitHub,
// GitLab, or Bitbucket public repos WITHOUT OAuth (unauthenticated API),
// so real-content generation works before OAuth apps are registered.
// With a token (from a connected Source) it authenticates the same calls.

const MAX_FILES = 12;
const MAX_BYTES_PER_FILE = 6000;
const CODE_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|py|go|rb|java|rs|php|c|h|cpp|cs|swift|kt|scala|sql|sh|yml|yaml|json|toml|md)$/i;
const SKIP = /(^|\/)(node_modules|dist|build|vendor|\.git|coverage|__pycache__)\//;

function rank(path) {
  if (/^readme\.md$/i.test(path)) return 0;
  if (/\.(md)$/i.test(path)) return 3;
  if (/(^|\/)(index|main|app|server|api)\.[a-z]+$/i.test(path)) return 1;
  return 2;
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Rate-limit-aware fetch. Unauthenticated code-host APIs throttle hard
// (GitHub: 60 req/h per IP), and several pipelines can fire on one merge —
// so 403/429/5xx are retried with backoff (honoring Retry-After /
// X-RateLimit-Reset when short) instead of instantly degrading the whole
// generation to template content.
async function jfetch(url, token, attempt = 0) {
  const MAX_RETRIES = 3;
  const headers = { 'User-Agent': 'DocGen' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(url, { headers });
  if (r.ok) return r;
  const retryable = r.status === 403 || r.status === 429 || r.status >= 500;
  if (retryable && attempt < MAX_RETRIES) {
    const after = Number(r.headers.get('retry-after'));
    const reset = Number(r.headers.get('x-ratelimit-reset'));
    const untilReset = Number.isFinite(reset) ? reset * 1000 - Date.now() : NaN;
    const wait = Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 15000)
      : Number.isFinite(untilReset) && untilReset > 0 && untilReset <= 15000 ? untilReset
      : Math.min(8000, 500 * Math.pow(2, attempt)) + Math.floor(Math.random() * 300);
    await sleep(wait);
    return jfetch(url, token, attempt + 1);
  }
  throw new Error('HTTP ' + r.status + ' for ' + url);
}

async function listPaths(provider, repo, branch, token) {
  if (provider === 'gitlab') {
    const proj = encodeURIComponent(repo);
    // GitLab lists directories before files in recursive trees, so page 1 of
    // a sizable repo can be 100% directories. Follow pagination until we have
    // real files (blobs), not just the first page.
    const out = [];
    for (let page = 1; page <= 6; page++) {
      const r = await jfetch('https://gitlab.com/api/v4/projects/' + proj + '/repository/tree?recursive=true&per_page=100&page=' + page + '&ref=' + encodeURIComponent(branch), token);
      const rows = await r.json();
      if (!Array.isArray(rows) || !rows.length) break;
      out.push(...rows.filter((n) => n.type === 'blob').map((n) => n.path));
      const next = Number(r.headers.get('x-next-page'));
      if (!Number.isFinite(next) || next <= page) break;
      if (out.length >= 60) break; // plenty for ranking + MAX_FILES cap
    }
    return out;
  }
  if (provider === 'bitbucket') {
    const out = [];
    let url = 'https://api.bitbucket.org/2.0/repositories/' + repo + '/src/' + encodeURIComponent(branch) + '/?max_depth=3&pagelen=100&q=' + encodeURIComponent('type="commit_file"');
    for (let i = 0; i < 3 && url; i++) {
      const d = await (await jfetch(url, token)).json();
      out.push(...(d.values || []).map((v) => v.path));
      url = d.next;
    }
    return out;
  }
  // github (default)
  const r = await jfetch('https://api.github.com/repos/' + repo + '/git/trees/' + encodeURIComponent(branch) + '?recursive=1', token);
  const d = await r.json();
  return (d.tree || []).filter((n) => n.type === 'blob').map((n) => n.path);
}

async function readFile(provider, repo, branch, path, token) {
  let url;
  if (provider === 'gitlab') {
    url = 'https://gitlab.com/api/v4/projects/' + encodeURIComponent(repo) + '/repository/files/' + encodeURIComponent(path) + '/raw?ref=' + encodeURIComponent(branch);
  } else if (provider === 'bitbucket') {
    url = 'https://api.bitbucket.org/2.0/repositories/' + repo + '/src/' + encodeURIComponent(branch) + '/' + path.split('/').map(encodeURIComponent).join('/');
  } else {
    url = 'https://raw.githubusercontent.com/' + repo + '/' + encodeURIComponent(branch) + '/' + path.split('/').map(encodeURIComponent).join('/');
  }
  const text = await (await jfetch(url, token)).text();
  return text.slice(0, MAX_BYTES_PER_FILE);
}

// Returns [{ path, content }] — capped, code-first, README always included.
// Never throws: on any failure it returns [] so callers can fall back.
export async function fetchRepoFiles(provider, repo, branch = 'main', token = '') {
  try {
    if (!repo || !repo.includes('/')) return [];
    const paths = (await listPaths(provider, repo, branch, token))
      .filter((p) => CODE_EXT.test(p) && !SKIP.test(p))
      .sort((a, b) => rank(a) - rank(b) || a.length - b.length)
      .slice(0, MAX_FILES);
    const files = [];
    for (const p of paths) {
      try { files.push({ path: p, content: await readFile(provider, repo, branch, p, token) }); }
      catch { /* skip unreadable file */ }
    }
    return files;
  } catch (e) {
    console.error('fetchRepoFiles(' + provider + ', ' + repo + '):', e.message);
    return [];
  }
}
