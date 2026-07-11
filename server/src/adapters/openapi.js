// OpenAPI / Swagger adapter: fetch the spec and verify it is a real API
// definition. Accepts JSON and YAML (OpenAPI 3.x and Swagger 2.0), and is
// forgiving about what the user pastes (missing scheme, trailing spaces).

// SSRF guard: user-supplied URLs are fetched SERVER-side, so private and
// loopback destinations must be rejected outright.
export function assertPublicHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  const priv =
    h === 'localhost' || h === '0.0.0.0' || h === '::1' || h.endsWith('.local') || h.endsWith('.internal') ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^fd[0-9a-f]{2}:/i.test(h) || /^fe80:/i.test(h);
  if (priv) throw new Error('URLs pointing to private or internal networks are not allowed');
}

export function normalizeSpecUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) throw new Error('Enter the URL of your OpenAPI / Swagger spec');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch { throw new Error('That does not look like a valid URL'); }
  assertPublicHost(u.hostname);
  return s;
}

/* Minimal YAML reader — just enough to validate a spec without a dependency:
   top-level keys, the info block (title/version), and the number of keys
   under paths. Standard machine-generated specs are indentation-clean. */
function yamlProbe(text) {
  const lines = String(text).split(/\r?\n/);
  const keyRe = /^(\s*)((?:"[^"]*")|(?:'[^']*')|(?:[^\s#][^:]*?))\s*:(?:\s|$)/;
  const unq = (k) => k.replace(/^["']|["']$/g, '');
  const top = {};                 // top-level scalar values
  let block = null;               // 'info' | 'paths' | null
  let blockIndent = -1;           // indent of the block key
  let childIndent = -1;           // indent of the block's children
  const info = {};
  let paths = 0;
  let sawKey = false;
  for (const line of lines) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const m = line.match(keyRe);
    if (!m) continue;
    sawKey = true;
    const indent = m[1].length;
    const key = unq(m[2].trim());
    const val = line.slice(line.indexOf(':', m[1].length + m[2].length) + 1).trim();
    if (indent === 0) {
      top[key] = val.replace(/^["']|["']$/g, '');
      block = key === 'info' || key === 'paths' ? key : null;
      blockIndent = 0;
      childIndent = -1;
      continue;
    }
    if (block && indent > blockIndent) {
      if (childIndent === -1) childIndent = indent;
      if (indent === childIndent) {
        if (block === 'info') info[key] = val.replace(/^["']|["']$/g, '');
        if (block === 'paths' && key.startsWith('/')) paths++;
      }
    }
  }
  if (!sawKey) return null;
  return { top, info, paths };
}

/* ================= OpenAPI / Swagger as a first-class source =================
   Specs are API-definition sources, not repositories: users add one or many
   specs (URL, pasted text, or a file inside a connected repository), pick
   endpoints from a tree, see validation findings, and generation grounds on
   a digest of exactly the selected operations. */

import yaml from 'js-yaml';

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'];

export function parseSpecText(text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('The specification is empty');
  if (/^\s*</.test(t)) throw new Error('That looks like a web page or XML, not an OpenAPI/Swagger document — provide raw JSON or YAML');
  let spec = null;
  try { spec = JSON.parse(t); } catch { /* try YAML */ }
  if (!spec) {
    try { spec = yaml.load(t); } catch (e) { throw new Error('Could not parse the document: ' + String(e.message || '').split('\n')[0]); }
  }
  if (!spec || typeof spec !== 'object') throw new Error('The document is not a JSON or YAML object');
  if (!spec.openapi && !spec.swagger) throw new Error('Not an OpenAPI or Swagger document — the "openapi" or "swagger" field is missing');
  return spec;
}

// Resolve a LOCAL $ref ("#/components/schemas/User") one hop; returns null
// for external or broken references.
function deref(spec, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
  let cur = spec;
  for (const part of ref.slice(2).split('/')) {
    cur = cur && typeof cur === 'object' ? cur[part.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined;
  }
  return cur === undefined ? null : cur;
}

function collectRefs(node, out) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.$ref === 'string') out.push(node.$ref);
  for (const v of Object.values(node)) collectRefs(v, out);
}

// Full structural analysis: operation tree + validation findings.
export function analyzeSpec(spec) {
  const info = spec.info || {};
  const issues = [];
  const push = (level, msg) => issues.push({ level, msg });
  if (!info.title) push('warn', 'The spec has no info.title');
  if (!info.version) push('warn', 'The spec has no info.version');
  const operations = [];
  const opIds = new Map();
  const paths = spec.paths || {};
  for (const [p, item] of Object.entries(paths)) {
    if (!item || typeof item !== 'object') continue;
    for (const m of METHODS) {
      const op = item[m];
      if (!op || typeof op !== 'object') continue;
      const key = m.toUpperCase() + ' ' + p;
      operations.push({
        key, path: p, method: m.toUpperCase(),
        opId: op.operationId || '',
        summary: op.summary || op.description && String(op.description).slice(0, 80) || '',
        tags: Array.isArray(op.tags) && op.tags.length ? op.tags : ['untagged'],
        deprecated: !!op.deprecated,
        secured: Array.isArray(op.security) ? op.security.length > 0 : (Array.isArray(spec.security) && spec.security.length > 0)
      });
      if (op.operationId) {
        if (opIds.has(op.operationId)) push('error', 'Duplicate operationId "' + op.operationId + '" (' + key + ' and ' + opIds.get(op.operationId) + ')');
        else opIds.set(op.operationId, key);
      }
      if (!op.summary && !op.description) push('info', key + ' has no summary or description');
      if (!op.responses || !Object.keys(op.responses).length) push('error', key + ' defines no responses');
    }
  }
  // Broken local $refs anywhere in the document.
  const refs = [];
  collectRefs(spec, refs);
  [...new Set(refs)].forEach((r) => {
    if (r.startsWith('#/') && deref(spec, r) === null) push('error', 'Broken $ref: ' + r);
  });
  const schemas = Object.keys((spec.components && spec.components.schemas) || spec.definitions || {});
  const securitySchemes = Object.keys((spec.components && spec.components.securitySchemes) || spec.securityDefinitions || {});
  if (!securitySchemes.length && operations.length) push('info', 'No authentication schemes are defined');
  const tags = [...new Set(operations.flatMap((o) => o.tags))];
  return {
    title: info.title || 'API',
    version: info.version || '',
    specVersion: spec.openapi || spec.swagger || '',
    description: String(info.description || '').slice(0, 300),
    servers: (spec.servers || []).map((s) => s.url).filter(Boolean),
    tags, operations, schemas, securitySchemes,
    endpoints: operations.length,
    issues: issues.slice(0, 40)
  };
}

// Load spec text from any supported source. repoRef = {provider, repo, branch, path}.
export async function loadSpecText(source, { repoFileFetcher } = {}) {
  if (source.text) return String(source.text);
  if (source.url) {
    const specUrl = normalizeSpecUrl(source.url);
    let r;
    try { r = await fetch(specUrl, { headers: { Accept: 'application/json, application/yaml, text/yaml, text/plain' } }); }
    catch { throw new Error('Could not reach ' + specUrl); }
    if (!r.ok) throw new Error('Could not fetch the spec (HTTP ' + r.status + ')' + (r.status === 401 || r.status === 403 ? ' — it appears to require authentication' : ''));
    return r.text();
  }
  if (source.repo && source.path) {
    if (!repoFileFetcher) throw new Error('Repository fetching is not available here');
    const content = await repoFileFetcher(source.provider || 'github', source.repo, source.branch || 'main', source.path);
    if (!content) throw new Error('Could not read ' + source.path + ' from ' + source.repo);
    return content;
  }
  throw new Error('Provide a spec URL, pasted content, or a repository file path');
}

// Markdown digest of SELECTED operations — the grounding document the AI
// reads. Resolves request/response schemas one level for real substance.
export function digestSpec(spec, analysis, selectedKeys) {
  const wanted = Array.isArray(selectedKeys) && selectedKeys.length ? new Set(selectedKeys) : null;
  const ops = analysis.operations.filter((o) => !wanted || wanted.has(o.key));
  const schemaLine = (schema, depth = 0) => {
    if (!schema || depth > 1) return '';
    if (schema.$ref) {
      const name = schema.$ref.split('/').pop();
      const resolved = deref(spec, schema.$ref);
      return name + (resolved && resolved.properties && depth === 0
        ? ' { ' + Object.entries(resolved.properties).slice(0, 15).map(([k, v]) => k + ': ' + (v.type || (v.$ref ? v.$ref.split('/').pop() : 'object'))).join(', ') + ' }'
        : '');
    }
    if (schema.type === 'array') return 'array of ' + schemaLine(schema.items || {}, depth + 1);
    if (schema.properties) return '{ ' + Object.entries(schema.properties).slice(0, 15).map(([k, v]) => k + ': ' + (v.type || 'object')).join(', ') + ' }';
    return schema.type || 'object';
  };
  const lines = [
    '# ' + analysis.title + (analysis.version ? ' v' + analysis.version : '') + ' — API specification (' + (analysis.specVersion || 'OpenAPI') + ')',
    analysis.description ? '\n' + analysis.description : '',
    analysis.servers.length ? '\nServers: ' + analysis.servers.join(', ') : '',
    analysis.securitySchemes.length ? 'Authentication: ' + analysis.securitySchemes.join(', ') : '',
    '\nDocumented operations: ' + ops.length + (wanted ? ' (selected subset of ' + analysis.operations.length + ')' : '')
  ];
  for (const o of ops.slice(0, 120)) {
    const raw = ((spec.paths || {})[o.path] || {})[o.method.toLowerCase()] || {};
    lines.push('\n## ' + o.key + (o.deprecated ? ' (DEPRECATED)' : ''));
    if (o.summary || raw.description) lines.push(String(raw.summary || o.summary || '') + (raw.description && raw.description !== raw.summary ? '\n' + String(raw.description).slice(0, 400) : ''));
    const params = (raw.parameters || []).map((p) => (p.$ref ? deref(spec, p.$ref) : p)).filter(Boolean);
    if (params.length) {
      lines.push('Parameters: ' + params.slice(0, 12).map((p) => p.name + ' (' + (p.in || '?') + (p.required ? ', required' : '') + (p.schema && p.schema.type ? ', ' + p.schema.type : '') + ')').join('; '));
    }
    const body = raw.requestBody && (raw.requestBody.$ref ? deref(spec, raw.requestBody.$ref) : raw.requestBody);
    const bodySchema = body && body.content && Object.values(body.content)[0] && Object.values(body.content)[0].schema;
    if (bodySchema) lines.push('Request body: ' + schemaLine(bodySchema));
    const responses = raw.responses || {};
    const rl = Object.entries(responses).slice(0, 8).map(([code, r0]) => {
      const r1 = r0 && r0.$ref ? deref(spec, r0.$ref) : r0;
      const sch = r1 && r1.content && Object.values(r1.content)[0] && Object.values(r1.content)[0].schema;
      return code + (r1 && r1.description ? ' — ' + r1.description : '') + (sch ? ' → ' + schemaLine(sch) : '');
    });
    if (rl.length) lines.push('Responses: ' + rl.join(' | '));
    if (o.secured) lines.push('Requires authentication.');
  }
  return lines.filter(Boolean).join('\n').slice(0, 90000);
}

export async function inspectSpec(url) {
  const specUrl = normalizeSpecUrl(url);
  let r;
  try {
    r = await fetch(specUrl, { headers: { Accept: 'application/json, application/yaml, text/yaml, text/plain' } });
  } catch {
    throw new Error('Could not reach the spec URL — check the address and that it is publicly accessible');
  }
  if (!r.ok) throw new Error('Could not fetch the spec (HTTP ' + r.status + ') — check the URL' + (r.status === 401 || r.status === 403 ? '; it appears to require authentication' : ''));
  const text = await r.text();

  // 1) JSON spec
  let spec = null;
  try { spec = JSON.parse(text); } catch { /* fall through to YAML */ }
  if (spec && typeof spec === 'object') {
    if (!spec.openapi && !spec.swagger) throw new Error('That URL returned JSON, but not an OpenAPI or Swagger document (no "openapi" or "swagger" field)');
    return {
      title: (spec.info && spec.info.title) || 'API',
      version: (spec.info && spec.info.version) || '',
      specVersion: spec.openapi || spec.swagger,
      format: 'json',
      endpoints: spec.paths ? Object.keys(spec.paths).length : 0
    };
  }

  // 2) YAML spec
  if (/^\s*</.test(text)) throw new Error('That URL returned a web page, not a spec — point to the raw JSON or YAML file (e.g. .../openapi.json)');
  const y = yamlProbe(text);
  if (y && (y.top.openapi || y.top.swagger)) {
    return {
      title: y.info.title || 'API',
      version: y.info.version || '',
      specVersion: y.top.openapi || y.top.swagger,
      format: 'yaml',
      endpoints: y.paths
    };
  }
  throw new Error('That URL is not an OpenAPI or Swagger document (JSON and YAML are both supported)');
}
