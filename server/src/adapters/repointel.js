/* ===================== Repository intelligence =====================
   Reads a repository's file tree and its dependency manifests, and returns a
   profile in which EVERY field is traceable to a file that actually exists.

   The rule this module lives by: nothing is reported that a real file did not
   produce. Frameworks come from parsed manifest dependencies, never from a
   folder name; "no API specification" is only claimed when the whole tree was
   listed; every signal carries the evidence that produced it. When a check
   cannot be substantiated it is omitted rather than guessed — a plausible
   invention is worse than a missing field.

   Reads only. Nothing here writes to a customer repository. */
import crypto from 'node:crypto';
import { fetchRepoFile, defaultBranchFor } from './repofiles.js';

/* Provider-call budget. This runs behind a typeahead-ish UI, so the analysis
   is cached per (provider, repo, branch, credential) and concurrent callers
   share one in-flight run. A cold analysis costs at most:
   tree listing (1–8 calls) + MAX_MANIFEST_READS + MAX_SPEC_SNIFFS. */
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 200;
const MAX_PATHS = 12000;
const MAX_MANIFEST_READS = 8;
const MAX_SPEC_SNIFFS = 4;
const LARGE_REPO_FILES = 150;
const BITBUCKET_MAX_DEPTH = 5;

const cache = new Map();    // key -> { at, profile }
const inflight = new Map(); // key -> Promise<profile>

// Vendored, generated and build output. Counting these would describe the
// customer's dependencies rather than the customer's code.
const SKIP_DIR = /(^|\/)(node_modules|bower_components|vendor|third_party|dist|build|out|target|\.git|\.next|\.nuxt|\.svelte-kit|coverage|__pycache__|\.venv|venv|site-packages|Pods|\.terraform|\.gradle|obj)\//i;
const SKIP_FILE = /(\.min\.(js|css)|\.map|\.lock)$/i;

const LANG_BY_EXT = {
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript', cts: 'TypeScript',
  py: 'Python', go: 'Go', rb: 'Ruby', java: 'Java', kt: 'Kotlin', kts: 'Kotlin',
  rs: 'Rust', php: 'PHP', cs: 'C#', swift: 'Swift', m: 'Objective-C', mm: 'Objective-C',
  c: 'C', h: 'C', cpp: 'C++', cc: 'C++', cxx: 'C++', hpp: 'C++', hh: 'C++',
  scala: 'Scala', sh: 'Shell', bash: 'Shell', zsh: 'Shell', ps1: 'PowerShell',
  sql: 'SQL', dart: 'Dart', ex: 'Elixir', exs: 'Elixir', erl: 'Erlang',
  hs: 'Haskell', lua: 'Lua', r: 'R', pl: 'Perl', groovy: 'Groovy', clj: 'Clojure',
  zig: 'Zig', vue: 'Vue', svelte: 'Svelte', html: 'HTML', css: 'CSS',
  scss: 'SCSS', less: 'Less', tf: 'HCL'
};

// [display name, dependency-name pattern, serves HTTP]. Matched against the
// dependency names parsed out of a manifest — nothing else.
const FRAMEWORKS = [
  ['Next.js', /^next$/, true],
  ['Nuxt', /^nuxt3?$/, true],
  ['Remix', /^@remix-run\/(node|react|server-runtime)$/, true],
  ['Astro', /^astro$/, false],
  ['React', /^react$/, false],
  ['React Native', /^react-native$/, false],
  ['Vue', /^vue$/, false],
  ['SvelteKit', /^@sveltejs\/kit$/, true],
  ['Svelte', /^svelte$/, false],
  ['Angular', /^@angular\/core$/, false],
  ['Electron', /^electron$/, false],
  ['Express', /^express$/, true],
  ['Fastify', /^fastify$/, true],
  ['Koa', /^koa$/, true],
  ['NestJS', /^@nestjs\/core$/, true],
  ['hapi', /^@hapi\/hapi$/, true],
  ['Apollo GraphQL', /^(@apollo\/server|apollo-server(-express|-fastify|-koa)?)$/, true],
  ['tRPC', /^@trpc\/server$/, true],
  ['Prisma', /^(prisma|@prisma\/client)$/, false],
  ['Django', /^django$/, true],
  ['Django REST framework', /^djangorestframework$/, true],
  ['Flask', /^flask$/, true],
  ['FastAPI', /^fastapi$/, true],
  ['Starlette', /^starlette$/, true],
  ['Tornado', /^tornado$/, true],
  ['aiohttp', /^aiohttp$/, true],
  ['Sanic', /^sanic$/, true],
  ['Scrapy', /^scrapy$/, false],
  ['Streamlit', /^streamlit$/, false],
  ['Celery', /^celery$/, false],
  ['SQLAlchemy', /^sqlalchemy$/, false],
  ['PyTorch', /^torch$/, false],
  ['TensorFlow', /^tensorflow$/, false],
  ['Gin', /^github\.com\/gin-gonic\/gin$/, true],
  ['Echo', /^github\.com\/labstack\/echo(\/v\d+)?$/, true],
  ['Fiber', /^github\.com\/gofiber\/fiber(\/v\d+)?$/, true],
  ['Chi', /^github\.com\/go-chi\/chi(\/v\d+)?$/, true],
  ['Gorilla Mux', /^github\.com\/gorilla\/mux$/, true],
  ['gRPC', /^(google\.golang\.org\/grpc|@grpc\/grpc-js|grpcio)$/, true],
  ['Cobra', /^github\.com\/spf13\/cobra$/, false],
  ['Spring Boot', /^spring-boot(-starter[\w-]*)?$/, true],
  ['Quarkus', /^quarkus[\w-]*$/, true],
  ['Micronaut', /^micronaut[\w-]*$/, true],
  ['Actix Web', /^actix-web$/, true],
  ['Axum', /^axum$/, true],
  ['Rocket', /^rocket$/, true],
  ['Warp', /^warp$/, true],
  ['Tokio', /^tokio$/, false],
  ['Ruby on Rails', /^rails$/, true],
  ['Sinatra', /^sinatra$/, true],
  ['Grape', /^grape$/, true],
  ['Laravel', /^laravel\/framework$/, true],
  ['Symfony', /^symfony\/[\w-]+$/, true],
  ['Slim', /^slim\/slim$/, true],
  ['ASP.NET Core', /^microsoft\.aspnetcore[\w.]*$/, true]
];

// [manifest basename, package manager it implies, parser id].
const MANIFESTS = [
  ['package.json', '', 'packagejson'],
  ['requirements.txt', 'pip', 'requirements'],
  ['pyproject.toml', '', 'toml'],
  ['Pipfile', 'pipenv', 'toml'],
  ['go.mod', 'Go modules', 'gomod'],
  ['Cargo.toml', 'Cargo', 'toml'],
  ['pom.xml', 'Maven', 'pom'],
  ['build.gradle', 'Gradle', 'gradle'],
  ['build.gradle.kts', 'Gradle', 'gradle'],
  ['Gemfile', 'Bundler', 'gemfile'],
  ['composer.json', 'Composer', 'composerjson']
];

const LOCK_TO_MANAGER = [
  [/(^|\/)package-lock\.json$/, 'npm'],
  [/(^|\/)yarn\.lock$/, 'Yarn'],
  [/(^|\/)pnpm-lock\.yaml$/, 'pnpm'],
  [/(^|\/)bun\.lockb?$/, 'Bun'],
  [/(^|\/)poetry\.lock$/, 'Poetry'],
  [/(^|\/)Pipfile\.lock$/, 'pipenv'],
  [/(^|\/)Cargo\.lock$/, 'Cargo'],
  [/(^|\/)Gemfile\.lock$/, 'Bundler'],
  [/(^|\/)composer\.lock$/, 'Composer']
];

const CI_FILES = [
  [/^\.github\/workflows\/[^/]+\.ya?ml$/i, 'GitHub Actions'],
  [/^\.gitlab-ci\.ya?ml$/i, 'GitLab CI'],
  [/^\.circleci\/config\.ya?ml$/i, 'CircleCI'],
  [/^bitbucket-pipelines\.ya?ml$/i, 'Bitbucket Pipelines'],
  [/^azure-pipelines\.ya?ml$/i, 'Azure Pipelines'],
  [/^\.travis\.ya?ml$/i, 'Travis CI'],
  [/^Jenkinsfile$/i, 'Jenkins'],
  [/^\.drone\.ya?ml$/i, 'Drone']
];

const DEPLOY_FILES = [
  [/(^|\/)Dockerfile(\.[\w-]+)?$/i, 'docker'],
  [/(^|\/)docker-compose(\.[\w-]+)?\.ya?ml$/i, 'docker'],
  [/(^|\/)(k8s|kubernetes|deploy\/k8s)\/.+\.ya?ml$/i, 'k8s'],
  [/(^|\/)kustomization\.ya?ml$/i, 'k8s'],
  [/(^|\/)Chart\.ya?ml$/i, 'helm'],
  [/(^|\/)serverless\.ya?ml$/i, 'serverless'],
  [/(^|\/)template\.ya?ml$/i, 'serverless'],
  [/(^|\/)vercel\.json$/i, 'vercel'],
  [/(^|\/)netlify\.toml$/i, 'netlify'],
  [/(^|\/)fly\.toml$/i, 'fly.io'],
  [/(^|\/)railway\.(json|toml)$/i, 'railway'],
  [/(^|\/)Procfile$/i, 'heroku'],
  [/(^|\/)[^/]+\.tf$/i, 'terraform'],
  [/(^|\/)ansible\.cfg$/i, 'ansible']
];

const TEST_PATTERNS = [
  /(^|\/)(tests?|spec|__tests__)\//i,
  /\.(test|spec)\.[a-z]+$/i,
  /(^|\/)test_[^/]+\.py$/i,
  /_test\.(go|py|rb|js|ts)$/i,
  /(^|\/)[^/]+Test\.java$/
];

const DOC_DIR = /^(docs?|documentation|website|guides|handbook|manual|wiki)$/i;
const DOC_EXT = /\.(md|mdx|rst|adoc|txt)$/i;
const SPEC_NAME = /(^|\/)[\w.-]*(openapi|swagger)[\w.-]*\.(ya?ml|json)$/i;
const SPEC_CANDIDATE = /(^|\/)(api|apis|spec|specs|schema|contract|docs?)[\w.-]*\.(ya?ml|json)$/i;
const SPEC_KEY = /^\s*["']?(openapi|swagger)["']?\s*:\s*["']?\d/im;
const README = /(^|\/)readme(\.(md|mdx|rst|adoc|txt))?$/i;

const ext = (p) => (p.split('/').pop().match(/\.([A-Za-z0-9]+)$/) || [, ''])[1].toLowerCase();
const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const depth = (p) => p.split('/').length;
const uniq = (a) => [...new Set(a.filter(Boolean))];

/* ------------------------------ Tree listing ------------------------------
   repofiles.js keeps its own tree walk private and caps it for the generation
   path (12 files, ranked). Intelligence needs the WHOLE list of paths, and no
   file contents, so it lists separately — see the note in the module report
   about exporting that helper once repofiles.js is free to change. */
async function hfetch(url, token, retried = false) {
  const headers = { 'User-Agent': 'Docify' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(url, { headers });
  if (r.ok) return r;
  // One retry, only for conditions that clear by themselves. A 401/403/404 is
  // an answer, not a hiccup; sleeping over it just delays the real message.
  if (!retried && (r.status === 429 || r.status >= 500)) {
    await new Promise((res) => setTimeout(res, 700));
    return hfetch(url, token, true);
  }
  const err = new Error(providerMessage(r.status, url));
  err.status = r.status;
  throw err;
}

function providerMessage(status, url) {
  const where = ' (' + String(url).replace(/\?.*$/, '') + ')';
  if (status === 401) return 'HTTP 401 — the connected account is no longer authorized; reconnect the source' + where;
  if (status === 403) return 'HTTP 403 — access denied or rate limit exhausted; connect the source to raise the limit' + where;
  if (status === 404) return 'HTTP 404 — repository or branch not found' + where;
  if (status === 429) return 'HTTP 429 — the provider is rate limiting Docify; retry shortly' + where;
  if (status >= 500) return 'HTTP ' + status + ' — the provider is failing; this is not a problem with your repository' + where;
  return 'HTTP ' + status + where;
}

// { paths, complete } — `complete` is false when the provider truncated the
// listing or pagination was cut short. Absence checks ("no API spec") are
// suppressed when it is false, because absence cannot be proven from a
// partial tree.
async function listTree(provider, repo, branch, token) {
  if (provider === 'gitlab') {
    const proj = encodeURIComponent(repo);
    const paths = [];
    let complete = true;
    for (let page = 1; page <= 10; page++) {
      const r = await hfetch('https://gitlab.com/api/v4/projects/' + proj + '/repository/tree?recursive=true&per_page=100&page=' + page + '&ref=' + encodeURIComponent(branch), token);
      const rows = await r.json();
      if (!Array.isArray(rows) || !rows.length) break;
      for (const n of rows) if (n.type === 'blob') paths.push(n.path);
      const next = Number(r.headers.get('x-next-page'));
      if (!Number.isFinite(next) || next <= page) break;
      if (page === 10) complete = false;
    }
    return { paths: paths.slice(0, MAX_PATHS), complete: complete && paths.length <= MAX_PATHS };
  }
  if (provider === 'bitbucket') {
    const paths = [];
    let complete = true;
    let url = 'https://api.bitbucket.org/2.0/repositories/' + repo + '/src/' + encodeURIComponent(branch) +
      '/?max_depth=' + BITBUCKET_MAX_DEPTH + '&pagelen=100&q=' + encodeURIComponent('type="commit_file"');
    for (let i = 0; i < 8; i++) {
      const d = await (await hfetch(url, token)).json();
      for (const v of d.values || []) paths.push(v.path);
      url = d.next;
      if (!url) break;
      if (i === 7) complete = false;
    }
    // Bitbucket's src listing is depth-limited by the API, so the tree can only
    // be called complete when nothing came back AT the depth limit — a file
    // sitting on the boundary means deeper files may exist unlisted.
    if (paths.some((p) => depth(p) >= BITBUCKET_MAX_DEPTH)) complete = false;
    return { paths: paths.slice(0, MAX_PATHS), complete: complete && paths.length <= MAX_PATHS };
  }
  const d = await (await hfetch('https://api.github.com/repos/' + repo + '/git/trees/' + encodeURIComponent(branch) + '?recursive=1', token)).json();
  const paths = (d.tree || []).filter((n) => n.type === 'blob').map((n) => n.path);
  return { paths: paths.slice(0, MAX_PATHS), complete: !d.truncated && paths.length <= MAX_PATHS };
}

/* --------------------------- Manifest parsing ----------------------------- */
const jsonOr = (text, fb) => { try { return JSON.parse(text); } catch { return fb; } };

function depsFromPackageJson(text) {
  const d = jsonOr(text, null);
  if (!d || typeof d !== 'object') return null;
  const names = [];
  for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    if (d[k] && typeof d[k] === 'object') names.push(...Object.keys(d[k]));
  }
  return { names: names.map((n) => n.toLowerCase()), doc: d };
}

function depsFromRequirements(text) {
  const names = text.split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('-'))
    .map((l) => l.split(/[<>=!~;[\s]/)[0].trim().toLowerCase())
    .filter(Boolean);
  return { names };
}

// Section-style TOML: collects `key = ...` inside any [..dependencies..] table
// plus PEP 621 / Poetry `dependencies = [...]` arrays.
function depsFromToml(text) {
  const names = [];
  let inDeps = false;
  for (const line of text.split(/\r?\n/)) {
    const sec = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (sec) { inDeps = /dependencies/i.test(sec[1]); continue; }
    if (!inDeps) continue;
    const kv = line.match(/^\s*["']?([A-Za-z0-9._-]+)["']?\s*=/);
    if (kv) names.push(kv[1].toLowerCase());
  }
  for (const arr of text.match(/dependencies\s*=\s*\[[^\]]*\]/gs) || []) {
    for (const m of arr.matchAll(/["']\s*([A-Za-z0-9._-]+)/g)) names.push(m[1].toLowerCase());
  }
  return { names: names.filter((n) => n !== 'python' && n !== 'version') };
}

function depsFromGoMod(text) {
  const names = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:require\s+)?([\w.~-]+(?:\.[\w.~-]+)+\/[^\s]+)\s+v/);
    if (m) names.push(m[1].toLowerCase());
  }
  return { names };
}

function depsFromPom(text) {
  return { names: [...text.matchAll(/<artifactId>\s*([^<\s]+)\s*<\/artifactId>/g)].map((m) => m[1].toLowerCase()) };
}

function depsFromGradle(text) {
  const names = [];
  for (const m of text.matchAll(/["']([\w.-]+):([\w.-]+)(?::[^"']*)?["']/g)) names.push(m[2].toLowerCase());
  for (const m of text.matchAll(/id\s*\(?\s*["']([\w.-]+)["']/g)) names.push(m[1].toLowerCase());
  return { names };
}

function depsFromGemfile(text) {
  return { names: [...text.matchAll(/^\s*gem\s+["']([^"']+)["']/gm)].map((m) => m[1].toLowerCase()) };
}

function depsFromComposer(text) {
  const d = jsonOr(text, null);
  if (!d || typeof d !== 'object') return null;
  const names = [];
  for (const k of ['require', 'require-dev']) if (d[k] && typeof d[k] === 'object') names.push(...Object.keys(d[k]));
  return { names: names.map((n) => n.toLowerCase()), doc: d };
}

const PARSERS = {
  packagejson: depsFromPackageJson,
  requirements: depsFromRequirements,
  toml: depsFromToml,
  gomod: depsFromGoMod,
  pom: depsFromPom,
  gradle: depsFromGradle,
  gemfile: depsFromGemfile,
  composerjson: depsFromComposer
};

/* ------------------------------ Small helpers ----------------------------- */
// Only `*` and `**` — the two wildcards workspace globs actually use.
function globToRe(g) {
  const esc = String(g).replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + esc.replace(/\*\*/g, ' ').replace(/\*/g, '[^/]*').replace(/ /g, '.*').replace(/\/$/, '') + '$');
}

// Top-level keys of the `services:` block of a docker-compose file.
function composeServiceNames(text) {
  const out = [];
  let inServices = false;
  let indent = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^services:\s*(#.*)?$/.test(line)) { inServices = true; continue; }
    if (!inServices) continue;
    if (/^\S/.test(line)) break;
    const m = line.match(/^(\s+)([A-Za-z0-9._-]+):\s*(#.*)?$/);
    if (!m) continue;
    if (indent === null) indent = m[1].length;
    if (m[1].length === indent) out.push(m[2]);
  }
  return out;
}

// `packages:` list of a pnpm-workspace.yaml.
function pnpmPackages(text) {
  const out = [];
  let inPkgs = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^packages:\s*(#.*)?$/.test(line)) { inPkgs = true; continue; }
    if (!inPkgs) continue;
    if (/^\S/.test(line)) break;
    const m = line.match(/^\s*-\s*["']?([^"'#\s]+)["']?/);
    if (m) out.push(m[1]);
  }
  return out;
}

export function emptyProfile({ provider = 'github', repo = '', branch = '', reason = '' } = {}) {
  return {
    ok: false, reason,
    provider, repo, branch, requestedBranch: branch, usedFallback: false,
    fileCount: 0, codeFileCount: 0, treeComplete: false,
    languages: [], frameworks: [], packageManagers: [],
    hasReadme: false, readmePath: '', apiSpecs: [],
    hasTests: false, hasCi: false, ci: [], isMonorepo: false,
    workspaces: [], services: [], deployment: [], docsFolders: [],
    entryPoints: [], manifests: [],
    signals: reason ? [{
      id: 'analysis_unavailable', level: 'warn',
      title: 'This repository could not be analysed',
      detail: 'Docify could not read the file list, so nothing below is based on your repository. Generation can still run — it reads files at run time.',
      evidence: reason
    }] : [],
    analyzedAt: new Date().toISOString(), cached: false
  };
}

/* ------------------------------- The analysis ----------------------------- */
async function analyze(provider, repo, branch, token) {
  let requestedBranch = branch;
  let usedFallback = false;
  let tree;
  try {
    tree = await listTree(provider, repo, branch, token);
    if (!tree.paths.length) {
      const fb = await defaultBranchFor(provider, repo, token);
      if (fb && fb !== branch) {
        const retry = await listTree(provider, repo, fb, token);
        if (retry.paths.length) { tree = retry; branch = fb; usedFallback = true; }
      }
    }
  } catch (e) {
    // A missing ref is the one failure worth a second attempt on the real
    // default branch; a 403/429/5xx means the branch was never the problem.
    if (e.status === 404) {
      const fb = await defaultBranchFor(provider, repo, token);
      if (fb && fb !== branch) {
        try {
          tree = await listTree(provider, repo, fb, token);
          if (tree.paths.length) { branch = fb; usedFallback = true; }
        } catch (e2) { return emptyProfile({ provider, repo, branch: requestedBranch, reason: e2.message }); }
      }
    }
    if (!tree) return emptyProfile({ provider, repo, branch: requestedBranch, reason: e.message });
  }

  const all = tree.paths;
  const paths = all.filter((p) => !SKIP_DIR.test(p) && !SKIP_FILE.test(p));
  const set = new Set(paths);
  const signals = [];
  const add = (id, level, title, detail, evidence) => signals.push({ id, level, title, detail, evidence });

  if (!all.length) {
    const p = emptyProfile({ provider, repo, branch: requestedBranch });
    p.signals = [{
      id: 'empty_tree', level: 'warn',
      title: 'No files were found on this branch',
      detail: 'The provider listed zero files for branch "' + requestedBranch + '". Check the branch name, or that the connected account can read this repository.',
      evidence: 'Tree listing for ' + repo + '@' + requestedBranch + ' returned 0 files'
    }];
    p.branch = branch;
    p.usedFallback = usedFallback;
    return p;
  }

  /* Languages — extension counts over real files, vendored and build output
     excluded so the profile describes the customer's code, not their deps. */
  const langCount = new Map();
  let codeFileCount = 0;
  for (const p of paths) {
    const name = LANG_BY_EXT[ext(p)];
    if (!name) continue;
    codeFileCount++;
    langCount.set(name, (langCount.get(name) || 0) + 1);
  }
  const languages = [...langCount.entries()]
    .map(([name, files]) => ({ name, files }))
    .sort((a, b) => b.files - a.files || a.name.localeCompare(b.name))
    .slice(0, 10);

  /* README */
  const readmes = paths.filter((p) => README.test(p)).sort((a, b) => depth(a) - depth(b) || a.length - b.length);
  const readmePath = readmes[0] || '';

  /* Package managers — lockfiles and manifests that exist. */
  const managers = [];
  for (const [re, name] of LOCK_TO_MANAGER) if (all.some((p) => re.test(p) && !SKIP_DIR.test(p))) managers.push(name);
  const manifestPaths = [];
  for (const p of paths) {
    const base = p.split('/').pop();
    const hit = MANIFESTS.find((m) => m[0] === base);
    if (!hit) continue;
    manifestPaths.push(p);
    if (hit[1]) managers.push(hit[1]);
  }
  // A package.json without a lockfile proves the ecosystem but not the tool —
  // naming npm specifically would be a guess, so it stays unnamed.
  const namedJsManager = ['npm', 'Yarn', 'pnpm', 'Bun'].some((m) => managers.includes(m));
  if (!namedJsManager && manifestPaths.some((p) => p.split('/').pop() === 'package.json')) managers.push('npm-compatible');
  const packageManagers = uniq(managers);

  /* CI / tests / deployment / docs — file existence only. */
  const ci = uniq(CI_FILES.filter(([re]) => paths.some((p) => re.test(p))).map(([, n]) => n));
  const testFiles = paths.filter((p) => TEST_PATTERNS.some((re) => re.test(p)));
  const deployEvidence = new Map();
  for (const [re, name] of DEPLOY_FILES) {
    const hit = paths.find((p) => re.test(p));
    if (hit && !deployEvidence.has(name)) deployEvidence.set(name, hit);
  }
  const deployment = [...deployEvidence.keys()];

  const docDirCount = new Map();
  for (const p of paths) {
    if (!DOC_EXT.test(p)) continue;
    const parts = p.split('/');
    for (let i = 0; i < Math.min(parts.length - 1, 2); i++) {
      if (!DOC_DIR.test(parts[i])) continue;
      const dir = parts.slice(0, i + 1).join('/');
      docDirCount.set(dir, (docDirCount.get(dir) || 0) + 1);
    }
  }
  const docsFolders = [...docDirCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d]) => d);

  /* Manifests — fetched and parsed. Frameworks come from here and nowhere
     else: a folder called "django" is not evidence of Django. */
  const rootManifests = manifestPaths.filter((p) => !p.includes('/'));
  const subManifests = manifestPaths.filter((p) => p.includes('/')).sort((a, b) => depth(a) - depth(b) || a.length - b.length);
  const toRead = [...rootManifests, ...subManifests].slice(0, MAX_MANIFEST_READS);
  const parsed = [];
  for (const p of toRead) {
    const base = p.split('/').pop();
    const spec = MANIFESTS.find((m) => m[0] === base);
    if (!spec) continue;
    const text = await fetchRepoFile(provider, repo, branch, p, token);
    if (!text) continue;
    const out = PARSERS[spec[2]](text);
    if (!out) continue;
    parsed.push({ path: p, names: uniq(out.names), doc: out.doc || null, text });
  }

  const frameworkHits = new Map(); // name -> { web, from }
  for (const m of parsed) {
    for (const dep of m.names) {
      for (const [name, re, web] of FRAMEWORKS) {
        if (re.test(dep) && !frameworkHits.has(name)) frameworkHits.set(name, { web, from: m.path, dep });
      }
    }
  }
  const frameworks = [...frameworkHits.keys()];
  const webFrameworks = [...frameworkHits.entries()].filter(([, v]) => v.web);

  /* Monorepo + workspaces. A workspace is only named when a directory that
     really contains a manifest matches a declared glob. */
  const manifestDirs = uniq(manifestPaths.map(dirOf).filter(Boolean));
  const workspaceGlobs = [];
  const monorepoMarkers = [];
  const rootPkg = parsed.find((m) => m.path === 'package.json');
  if (rootPkg && rootPkg.doc) {
    const ws = rootPkg.doc.workspaces;
    const globs = Array.isArray(ws) ? ws : (ws && Array.isArray(ws.packages) ? ws.packages : []);
    if (globs.length) { workspaceGlobs.push(...globs); monorepoMarkers.push('package.json workspaces'); }
  }
  for (const [file, label] of [['pnpm-workspace.yaml', 'pnpm-workspace.yaml'], ['lerna.json', 'lerna.json'], ['nx.json', 'nx.json'], ['turbo.json', 'turbo.json']]) {
    if (!set.has(file)) continue;
    monorepoMarkers.push(label);
    if (file === 'pnpm-workspace.yaml') {
      const text = await fetchRepoFile(provider, repo, branch, file, token);
      if (text) workspaceGlobs.push(...pnpmPackages(text));
    } else if (file === 'lerna.json') {
      const text = await fetchRepoFile(provider, repo, branch, file, token);
      const d = text ? jsonOr(text, null) : null;
      if (d && Array.isArray(d.packages)) workspaceGlobs.push(...d.packages);
    }
  }
  let workspaces = [];
  if (workspaceGlobs.length) {
    const res = uniq(workspaceGlobs).map(globToRe);
    workspaces = manifestDirs.filter((d) => res.some((re) => re.test(d)));
  }
  if (!workspaces.length && manifestDirs.length >= 2) workspaces = manifestDirs.slice(0, 40);
  workspaces = uniq(workspaces).sort().slice(0, 40);
  const isMonorepo = workspaces.length >= 2;

  /* Services — directories under a service root that carry their own manifest
     or Dockerfile, plus the service names declared in docker-compose. */
  const SERVICE_ROOT = /^(services|apps|packages|cmd|modules|projects)\/[^/]+$/;
  const serviceDirs = uniq(paths
    .filter((p) => /(^|\/)(Dockerfile|package\.json|go\.mod|pyproject\.toml|requirements\.txt|Cargo\.toml|pom\.xml|composer\.json|Gemfile)$/i.test(p))
    .map(dirOf)
    .filter((d) => SERVICE_ROOT.test(d)));
  let composeServices = [];
  const composePath = paths.find((p) => /(^|\/)docker-compose(\.[\w-]+)?\.ya?ml$/i.test(p) && depth(p) <= 2);
  if (composePath) {
    const text = await fetchRepoFile(provider, repo, branch, composePath, token);
    if (text) composeServices = composeServiceNames(text);
  }
  const services = uniq([...serviceDirs, ...composeServices]).slice(0, 40);

  /* API specifications — by filename, then by sniffing a bounded number of
     plausible files for an actual openapi/swagger key. */
  const apiSpecs = paths.filter((p) => SPEC_NAME.test(p));
  const sniffEvidence = new Map();
  if (apiSpecs.length < 3) {
    const candidates = paths
      .filter((p) => !apiSpecs.includes(p) && SPEC_CANDIDATE.test(p) && /\.(ya?ml|json)$/i.test(p))
      .sort((a, b) => depth(a) - depth(b) || a.length - b.length)
      .slice(0, MAX_SPEC_SNIFFS);
    for (const p of candidates) {
      const text = await fetchRepoFile(provider, repo, branch, p, token);
      if (text && SPEC_KEY.test(text.slice(0, 4000))) {
        apiSpecs.push(p);
        sniffEvidence.set(p, 'contains an "openapi"/"swagger" version key');
      }
    }
  }

  /* Entry points — files that exist, plus package.json main/bin when the file
     they point at is really in the tree. */
  const ENTRY = [
    /^(src\/)?(index|main|app|server|cli|bot|worker)\.(js|jsx|ts|tsx|mjs|cjs|py|go|rb|rs|php)$/i,
    /^cmd\/[^/]+\/main\.go$/i,
    /^(manage|wsgi|asgi|main|app|__main__)\.py$/i,
    /^src\/main\.(rs|go|py|ts|js)$/i,
    /^(Program|Startup)\.cs$/i,
    /^src\/main\/java\/.+\/(Application|Main)\.java$/,
    /^(public\/)?index\.php$/i
  ];
  const entrySet = new Set(paths.filter((p) => ENTRY.some((re) => re.test(p))));
  if (rootPkg && rootPkg.doc) {
    const rel = (v) => String(v).replace(/^\.\//, '');
    if (typeof rootPkg.doc.main === 'string' && set.has(rel(rootPkg.doc.main))) entrySet.add(rel(rootPkg.doc.main));
    const bin = rootPkg.doc.bin;
    if (typeof bin === 'string' && set.has(rel(bin))) entrySet.add(rel(bin));
    else if (bin && typeof bin === 'object') for (const v of Object.values(bin)) if (typeof v === 'string' && set.has(rel(v))) entrySet.add(rel(v));
  }
  const entryPoints = [...entrySet].sort((a, b) => depth(a) - depth(b) || a.length - b.length).slice(0, 10);

  /* ------------------------------- Signals -------------------------------
     Each one states something the files above prove, and says what to do
     about it. Nothing is emitted that the evidence string cannot back up. */
  if (usedFallback) {
    add('branch_fallback', 'info', 'Analysed the default branch instead',
      'Branch "' + requestedBranch + '" listed no files, so Docify analysed "' + branch + '" — the repository\'s default branch.',
      'Tree listing for ' + requestedBranch + ' returned 0 files; ' + branch + ' returned ' + all.length);
  }
  if (!readmePath) {
    add('no_readme', 'warn', 'No README in this repository',
      'There is no README, so there is less prose for Docify to ground a guide in. Output will be derived from source files alone, which usually means fewer product-level explanations.',
      'No file matching README.* among ' + all.length + ' listed files');
  }
  for (const p of apiSpecs.slice(0, 3)) {
    add('api_spec_found', 'info', 'An OpenAPI specification was found',
      'An OpenAPI spec was found at ' + p + ' — an API reference will be much richer if you add it as a source.',
      sniffEvidence.get(p) ? p + ' ' + sniffEvidence.get(p) : 'File present in the tree: ' + p);
  }
  if (!apiSpecs.length && webFrameworks.length && tree.complete) {
    const [name, meta] = webFrameworks[0];
    add('no_api_spec', 'warn', 'No API specification found',
      'No OpenAPI or Swagger file is in this repository, so an API reference would be generated from source files only. Adding a spec as a source makes endpoint, parameter and error documentation far more accurate.',
      name + ' detected from "' + meta.dep + '" in ' + meta.from + '; no openapi/swagger file in ' + all.length + ' listed files');
  }
  if (isMonorepo) {
    add('monorepo', 'info', 'This looks like a monorepo',
      'This repository contains ' + workspaces.length + ' packages. Documenting one package at a time gives sharper results than pointing Docify at the whole repository.',
      (monorepoMarkers.length ? monorepoMarkers.join(', ') + '; ' : '') + workspaces.slice(0, 6).join(', ') + (workspaces.length > 6 ? ', …' : ''));
  } else if (services.length >= 2) {
    add('multiple_services', 'info', 'Several services live in this repository',
      'Docify found ' + services.length + ' services here. Generating per service, rather than for the repository as a whole, keeps each document focused.',
      services.slice(0, 6).join(', ') + (services.length > 6 ? ', …' : ''));
  }
  if (codeFileCount >= LARGE_REPO_FILES) {
    add('large_repository', 'info', 'Docify reads a bounded sample of this repository',
      'This repository has ' + codeFileCount.toLocaleString('en-US') + ' code files. Docify grounds each document in a capped, ranked sample of files rather than the whole tree, so most of this repository will not be read in a single run. Narrowing the scope — one package, one folder, or scan rules — puts the files you care about inside that sample.',
      codeFileCount.toLocaleString('en-US') + ' code files (' + all.length.toLocaleString('en-US') + ' files listed, vendored and build directories excluded)');
  }
  if (!tree.complete) {
    add('tree_truncated', 'warn', 'The file list is partial',
      'The provider returned only part of the file tree, so anything reported as absent below may simply not have been listed. Everything reported as found is real.',
      provider === 'bitbucket'
        ? 'Bitbucket lists source to a bounded depth; ' + all.length.toLocaleString('en-US') + ' files listed'
        : 'Provider truncated the tree after ' + all.length.toLocaleString('en-US') + ' files');
  }
  if (!manifestPaths.length) {
    add('no_manifest', 'info', 'No dependency manifest found',
      'Docify could not find a package.json, requirements.txt, go.mod, Cargo.toml, pom.xml or Gemfile, so frameworks were not detected. Detection is based on parsed dependencies only — Docify does not guess a framework from folder names.',
      'No known manifest among ' + all.length + ' listed files');
  }
  if (docsFolders.length) {
    add('existing_docs', 'info', 'This repository already has documentation',
      'Existing documentation lives in ' + docsFolders[0] + '. Docify never writes to your repository — generated documents stay in Docify and in the formats you export — so treat the output as a complement to what is already there.',
      docDirCount.get(docsFolders[0]) + ' documentation file' + (docDirCount.get(docsFolders[0]) === 1 ? '' : 's') + ' under ' + docsFolders[0]);
  }
  if (deployment.length) {
    const first = deployment[0];
    add('deployment_config', 'info', 'Deployment configuration is present',
      'Deployment configuration was found (' + deployment.join(', ') + '). Operational documents — runbooks, deployment guides — have real configuration to ground in here.',
      [...deployEvidence.entries()].slice(0, 3).map(([k, v]) => k + ': ' + v).join(' · ') || first);
  }

  return {
    ok: true, reason: '',
    provider, repo, branch, requestedBranch, usedFallback,
    fileCount: all.length, codeFileCount, treeComplete: tree.complete,
    languages, frameworks, packageManagers,
    hasReadme: Boolean(readmePath), readmePath,
    apiSpecs: apiSpecs.slice(0, 10),
    hasTests: testFiles.length > 0, hasCi: ci.length > 0, ci,
    isMonorepo, workspaces, services, deployment, docsFolders, entryPoints,
    manifests: manifestPaths.slice(0, 40),
    signals,
    analyzedAt: new Date().toISOString(), cached: false
  };
}

/* --------------------------------- Public --------------------------------- */
// The credential is part of the cache key: two accounts can see different
// trees for the same private repository, and one must never be served the
// other's analysis.
function cacheKey(provider, repo, branch, token) {
  const cred = token ? crypto.createHash('sha256').update(token).digest('hex').slice(0, 16) : 'anon';
  return provider + '|' + repo + '|' + branch + '|' + cred;
}

function remember(key, profile) {
  cache.set(key, { at: Date.now(), profile });
  if (cache.size > CACHE_MAX) {
    for (const k of cache.keys()) { cache.delete(k); if (cache.size <= CACHE_MAX) break; }
  }
}

export function clearIntelCache() { cache.clear(); }

// Never throws: callers get a profile with ok:false and a reason instead, so a
// failed analysis degrades a panel rather than a page.
export async function analyzeRepository({ provider = 'github', repo = '', branch = 'main', token = '' } = {}) {
  const p = ['github', 'gitlab', 'bitbucket'].includes(provider) ? provider : 'github';
  const r = String(repo || '').trim();
  const b = String(branch || '').trim() || 'main';
  if (!r || !/^[\w.-]+\/[\w.-]+$/.test(r)) {
    return emptyProfile({ provider: p, repo: r, branch: b, reason: 'Enter a repository as owner/name.' });
  }

  const key = cacheKey(p, r, b, token);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.profile, cached: true };
  // Coalesce concurrent callers — a UI that analyses as the customer picks a
  // repository must not multiply provider calls.
  const running = inflight.get(key);
  if (running) return { ...(await running), cached: true };

  const run = analyze(p, r, b, token)
    .catch((e) => emptyProfile({ provider: p, repo: r, branch: b, reason: e.message || 'Repository could not be analysed.' }))
    .then((profile) => { remember(key, profile); return profile; })
    .finally(() => inflight.delete(key));
  inflight.set(key, run);
  return await run;
}
