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
  const headers = { 'User-Agent': 'Docify' };
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

// The repository's own default branch, straight from the provider. A caller
// that guessed "main" on a repo whose trunk is "master" (or "develop", or
// "trunk") otherwise reads an empty tree and silently documents nothing.
export async function defaultBranchFor(provider, repo, token = '') {
  try {
    if (!repo || !repo.includes('/')) return '';
    if (provider === 'gitlab') {
      const d = await (await jfetch('https://gitlab.com/api/v4/projects/' + encodeURIComponent(repo), token)).json();
      return String(d.default_branch || '');
    }
    if (provider === 'bitbucket') {
      const d = await (await jfetch('https://api.bitbucket.org/2.0/repositories/' + repo, token)).json();
      return String((d.mainbranch && d.mainbranch.name) || '');
    }
    const d = await (await jfetch('https://api.github.com/repos/' + repo, token)).json();
    return String(d.default_branch || '');
  } catch {
    return '';
  }
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

// Fetch ONE raw text file from a repository (used for docify.yaml,
// .docifyignore, .docify/instructions.md). Returns null when absent/unreadable.
export async function fetchRepoFile(provider, repo, branch = 'main', path = '', token = '') {
  try {
    if (!repo || !repo.includes('/') || !path) return null;
    return await readFile(provider, repo, branch, path, token);
  } catch {
    return null;
  }
}

async function listAndRead(provider, repo, branch, token) {
  const all = await listPaths(provider, repo, branch, token);
  const paths = all
    .filter((p) => CODE_EXT.test(p) && !SKIP.test(p))
    .sort((a, b) => rank(a) - rank(b) || a.length - b.length)
    .slice(0, MAX_FILES);
  const files = [];
  for (const p of paths) {
    try { files.push({ path: p, content: await readFile(provider, repo, branch, p, token) }); }
    catch { /* skip unreadable file */ }
  }
  return { files, listed: all.length };
}

// Returns { files, branch, requestedBranch, usedFallback, listed } so callers
// know WHICH branch actually produced content.
//
// A wrong branch is indistinguishable from an empty repository at the API
// level: both return no files. Silently documenting nothing is the worst
// outcome — the customer is billed for a document generated from zero source.
// So when the requested branch yields nothing, ask the provider for the real
// default branch and retry once before giving up.
export async function fetchRepoFilesResolved(provider, repo, branch = 'main', token = '') {
  const requestedBranch = branch || 'main';
  const empty = { files: [], branch: requestedBranch, requestedBranch, usedFallback: false, listed: 0 };
  try {
    if (!repo || !repo.includes('/')) return empty;
    let listed = 0;
    try {
      const first = await listAndRead(provider, repo, requestedBranch, token);
      if (first.files.length) return { ...first, branch: requestedBranch, requestedBranch, usedFallback: false };
      listed = first.listed;
    } catch (e) {
      // Only a MISSING ref justifies trying another branch. A 403/429/5xx means
      // the repository is fine and we were throttled or refused — retrying on a
      // different branch would document the wrong code and add load to an
      // already-exhausted rate limit.
      if (!/HTTP 404/.test(e.message || '')) {
        console.error('fetchRepoFiles(' + provider + ', ' + repo + '@' + requestedBranch + '):', e.message);
        return empty;
      }
      console.error('fetchRepoFiles(' + provider + ', ' + repo + '@' + requestedBranch + '): branch not found, resolving the default');
    }
    const fallback = await defaultBranchFor(provider, repo, token);
    if (!fallback || fallback === requestedBranch) return { ...empty, listed };
    let retry;
    try { retry = await listAndRead(provider, repo, fallback, token); }
    catch (e) {
      console.error('fetchRepoFiles(' + provider + ', ' + repo + '@' + fallback + '):', e.message);
      return { ...empty, listed };
    }
    // Only adopt the fallback if it actually produced source. Recording a
    // branch that read nothing would be a second, quieter lie.
    if (!retry.files.length) return { ...empty, listed: retry.listed || listed };
    console.warn('[branch] ' + repo + ': "' + requestedBranch + '" yielded no files; used default branch "' + fallback + '" (' + retry.files.length + ' files)');
    return { ...retry, branch: fallback, requestedBranch, usedFallback: true };
  } catch (e) {
    console.error('fetchRepoFiles(' + provider + ', ' + repo + '):', e.message);
    return empty;
  }
}

// Returns [{ path, content }] — capped, code-first, README always included.
// Never throws: on any failure it returns [] so callers can fall back.
export async function fetchRepoFiles(provider, repo, branch = 'main', token = '') {
  return (await fetchRepoFilesResolved(provider, repo, branch, token)).files;
}
