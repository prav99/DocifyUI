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

// What went wrong, in words a customer can act on. The token never appears in
// a URL (it travels in the Authorization header), so echoing the endpoint is
// safe — but the message is what surfaces in logs and run notes, so it says
// what to DO, not just which number came back.
function httpMessage(status, url) {
  const where = ' (' + String(url).replace(/\?.*$/, '') + ')';
  if (status === 401) return 'HTTP 401 — the connected account is no longer authorized; reconnect the source' + where;
  if (status === 403) return 'HTTP 403 — access denied or rate limit exhausted; connect the source to raise the limit, or check the account can read this repository' + where;
  if (status === 404) return 'HTTP 404 — repository, branch, or path not found' + where;
  if (status === 429) return 'HTTP 429 — the provider is rate limiting Docify; retry shortly' + where;
  if (status >= 500) return 'HTTP ' + status + ' — the provider is failing; this is not a problem with your repository' + where;
  return 'HTTP ' + status + where;
}

// Rate-limit-aware fetch. Unauthenticated code-host APIs throttle hard
// (GitHub: 60 req/h per IP), and several pipelines can fire on one merge —
// so throttling and 5xx are retried with backoff (honoring Retry-After /
// X-RateLimit-Reset when short) instead of instantly degrading the whole
// generation to template content.
async function jfetch(url, token, attempt = 0) {
  const MAX_RETRIES = 3;
  const headers = { 'User-Agent': 'Docify' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(url, { headers });
  if (r.ok) return r;
  // GitHub answers BOTH "rate limited" and "your token cannot see this repo"
  // with 403. Only the first is worth retrying: sleeping three times over a
  // permissions failure just delays the error the customer needs to see.
  const throttled = r.status === 429 ||
    (r.status === 403 && (r.headers.get('retry-after') != null || r.headers.get('x-ratelimit-remaining') === '0'));
  const retryable = throttled || r.status >= 500;
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
  const err = new Error(httpMessage(r.status, url));
  err.status = r.status;
  throw err;
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

// Returns { paths, bounded }. `bounded` is true when the listing stopped at a
// cap (pages, blob count, tree depth, provider truncation) — meaning counts
// derived from `paths` are floors, not totals. Callers wording coverage as
// "X of N eligible files" must say "at least N" when this is set, or the cap
// masquerades as the size of the repository.
async function listPaths(provider, repo, branch, token) {
  if (provider === 'gitlab') {
    const proj = encodeURIComponent(repo);
    // GitLab lists directories before files in recursive trees, so page 1 of
    // a sizable repo can be 100% directories. Follow pagination until we have
    // real files (blobs), not just the first page.
    const out = [];
    let bounded = false;
    for (let page = 1; page <= 6; page++) {
      const r = await jfetch('https://gitlab.com/api/v4/projects/' + proj + '/repository/tree?recursive=true&per_page=100&page=' + page + '&ref=' + encodeURIComponent(branch), token);
      const rows = await r.json();
      if (!Array.isArray(rows) || !rows.length) break;
      out.push(...rows.filter((n) => n.type === 'blob').map((n) => n.path));
      const next = Number(r.headers.get('x-next-page'));
      if (!Number.isFinite(next) || next <= page) break;
      if (page === 6 || out.length >= 60) { bounded = true; break; } // plenty for ranking + MAX_FILES cap
    }
    return { paths: out, bounded };
  }
  if (provider === 'bitbucket') {
    const out = [];
    let bounded = false;
    let url = 'https://api.bitbucket.org/2.0/repositories/' + repo + '/src/' + encodeURIComponent(branch) + '/?max_depth=3&pagelen=100';
    for (let i = 0; i < 3 && url; i++) {
      const d = await (await jfetch(url, token)).json();
      for (const v of d.values || []) {
        if (v.type === 'commit_file') out.push(v.path);
        // A directory at the depth limit proves unlisted files below it.
        else if (v.type === 'commit_directory' && v.path.split('/').length >= 3) bounded = true;
      }
      url = d.next;
      if (url && i === 2) bounded = true;
    }
    return { paths: out, bounded };
  }
  // github (default)
  const r = await jfetch('https://api.github.com/repos/' + repo + '/git/trees/' + encodeURIComponent(branch) + '?recursive=1', token);
  const d = await r.json();
  return { paths: (d.tree || []).filter((n) => n.type === 'blob').map((n) => n.path), bounded: Boolean(d.truncated) };
}

async function readFileRaw(provider, repo, branch, path, token) {
  let url;
  if (provider === 'gitlab') {
    url = 'https://gitlab.com/api/v4/projects/' + encodeURIComponent(repo) + '/repository/files/' + encodeURIComponent(path) + '/raw?ref=' + encodeURIComponent(branch);
  } else if (provider === 'bitbucket') {
    url = 'https://api.bitbucket.org/2.0/repositories/' + repo + '/src/' + encodeURIComponent(branch) + '/' + path.split('/').map(encodeURIComponent).join('/');
  } else {
    url = 'https://raw.githubusercontent.com/' + repo + '/' + encodeURIComponent(branch) + '/' + path.split('/').map(encodeURIComponent).join('/');
  }
  return (await (await jfetch(url, token)).text());
}

async function readFile(provider, repo, branch, path, token) {
  return (await readFileRaw(provider, repo, branch, path, token)).slice(0, MAX_BYTES_PER_FILE);
}

// Fetch ONE raw text file from a repository (used for docify.yaml,
// .docifyignore, .docify/instructions.md). Returns null when absent/unreadable.
export async function fetchRepoFile(provider, repo, branch = 'main', path = '', token = '') {
  try {
    if (!repo || !repo.includes('/') || !path) return null;
    return await readFile(provider, repo, branch, path, token);
  } catch (e) {
    // 404 is the normal answer for "this repository has no docify.yaml".
    // Anything else means we were refused or throttled, and treating that as
    // "no configuration" would silently ignore the customer's rules.
    if (e.status && e.status !== 404) console.warn('[repofiles] ' + repo + ' ' + path + ': ' + e.message);
    return null;
  }
}

/* What the caps left behind.
   The selection reads at most MAX_FILES files and at most MAX_BYTES_PER_FILE
   of each. On a repository of any size that silently discards most of the
   source, and the document is then written as if the whole repository had been
   read. Callers get the counts so they can say so: "read 12 of 168 source
   files" is honest; showing nothing is not. The caps themselves are a cost and
   prompt-size decision and are unchanged. */
export function coverageNote(cov) {
  if (!cov || !cov.read) return '';
  // "at least N" when the listing itself was cut short — the eligible count is
  // then a floor set by the listing caps, not the size of the repository.
  const bits = ['Read ' + cov.read + ' of ' + (cov.listingBounded ? 'at least ' : '') + cov.eligible + ' eligible source file' + (cov.eligible === 1 && !cov.listingBounded ? '' : 's')];
  if (cov.omittedFiles > 0) bits.push(cov.omittedFiles + ' not read (limit ' + cov.maxFiles + ' files per run)');
  if (cov.truncatedFiles > 0) bits.push(cov.truncatedFiles + ' truncated at ' + cov.maxBytesPerFile.toLocaleString('en-US') + ' characters');
  if (cov.unreadableFiles > 0) bits.push(cov.unreadableFiles + ' could not be downloaded');
  return bits.join(' · ') + '.';
}

function emptyCoverage(extra = {}) {
  return {
    listed: 0, eligible: 0, read: 0, omittedFiles: 0, truncatedFiles: 0, unreadableFiles: 0,
    listingBounded: false, maxFiles: MAX_FILES, maxBytesPerFile: MAX_BYTES_PER_FILE, ...extra
  };
}

async function listAndRead(provider, repo, branch, token) {
  const { paths: all, bounded } = await listPaths(provider, repo, branch, token);
  const eligible = all.filter((p) => CODE_EXT.test(p) && !SKIP.test(p));
  const paths = eligible
    .slice()
    .sort((a, b) => rank(a) - rank(b) || a.length - b.length)
    .slice(0, MAX_FILES);
  const files = [];
  let truncatedFiles = 0;
  let unreadableFiles = 0;
  for (const p of paths) {
    try {
      const full = await readFileRaw(provider, repo, branch, p, token);
      const content = full.slice(0, MAX_BYTES_PER_FILE);
      if (full.length > content.length) truncatedFiles++;
      files.push({ path: p, content });
    } catch { unreadableFiles++; }
  }
  const coverage = emptyCoverage({
    listed: all.length,
    eligible: eligible.length,
    read: files.length,
    omittedFiles: Math.max(0, eligible.length - files.length),
    truncatedFiles,
    unreadableFiles,
    listingBounded: bounded
  });
  if (coverage.omittedFiles || coverage.truncatedFiles || coverage.unreadableFiles) {
    console.warn('[repofiles] ' + repo + '@' + branch + ': ' + coverageNote(coverage));
  }
  return { files, listed: all.length, coverage };
}

// Returns { files, branch, requestedBranch, usedFallback, listed, coverage,
// note, error } so callers know WHICH branch produced content, HOW MUCH of the
// repository was actually read, and — when nothing came back — WHETHER that
// was an empty repository or a provider failure. Those two are the same shape
// on the wire and must never read the same to a customer.
//
// A wrong branch is indistinguishable from an empty repository at the API
// level: both return no files. Silently documenting nothing is the worst
// outcome — the customer is billed for a document generated from zero source.
// So when the requested branch yields nothing, ask the provider for the real
// default branch and retry once before giving up.
export async function fetchRepoFilesResolved(provider, repo, branch = 'main', token = '') {
  const requestedBranch = branch || 'main';
  const empty = {
    files: [], branch: requestedBranch, requestedBranch, usedFallback: false,
    listed: 0, coverage: emptyCoverage(), note: '', error: ''
  };
  const failed = (e) => ({ ...empty, error: e.message || 'source could not be read' });
  try {
    if (!repo || !repo.includes('/')) return { ...empty, error: 'No repository selected.' };
    let listed = 0;
    try {
      const first = await listAndRead(provider, repo, requestedBranch, token);
      if (first.files.length) {
        return { ...first, branch: requestedBranch, requestedBranch, usedFallback: false, note: coverageNote(first.coverage), error: '' };
      }
      listed = first.listed;
    } catch (e) {
      // Only a MISSING ref justifies trying another branch. A 403/429/5xx means
      // the repository is fine and we were throttled or refused — retrying on a
      // different branch would document the wrong code and add load to an
      // already-exhausted rate limit.
      if (e.status !== 404 && !/HTTP 404/.test(e.message || '')) {
        console.error('fetchRepoFiles(' + provider + ', ' + repo + '@' + requestedBranch + '):', e.message);
        return failed(e);
      }
      console.error('fetchRepoFiles(' + provider + ', ' + repo + '@' + requestedBranch + '): branch not found, resolving the default');
    }
    const fallback = await defaultBranchFor(provider, repo, token);
    if (!fallback || fallback === requestedBranch) return { ...empty, listed };
    let retry;
    try { retry = await listAndRead(provider, repo, fallback, token); }
    catch (e) {
      console.error('fetchRepoFiles(' + provider + ', ' + repo + '@' + fallback + '):', e.message);
      return { ...failed(e), listed };
    }
    // Only adopt the fallback if it actually produced source. Recording a
    // branch that read nothing would be a second, quieter lie.
    if (!retry.files.length) return { ...empty, listed: retry.listed || listed };
    console.warn('[branch] ' + repo + ': "' + requestedBranch + '" yielded no files; used default branch "' + fallback + '" (' + retry.files.length + ' files)');
    return { ...retry, branch: fallback, requestedBranch, usedFallback: true, note: coverageNote(retry.coverage), error: '' };
  } catch (e) {
    console.error('fetchRepoFiles(' + provider + ', ' + repo + '):', e.message);
    return failed(e);
  }
}

// Returns [{ path, content }] — capped, code-first, README always included.
// Never throws: on any failure it returns [] so callers can fall back.
export async function fetchRepoFiles(provider, repo, branch = 'main', token = '') {
  return (await fetchRepoFilesResolved(provider, repo, branch, token)).files;
}
