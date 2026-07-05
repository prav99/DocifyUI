// OpenAPI / Swagger adapter: fetch the spec and verify it is a real API
// definition. Accepts JSON and YAML (OpenAPI 3.x and Swagger 2.0), and is
// forgiving about what the user pastes (missing scheme, trailing spaces).

export function normalizeSpecUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) throw new Error('Enter the URL of your OpenAPI / Swagger spec');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { new URL(s); } catch { throw new Error('That does not look like a valid URL'); }
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
