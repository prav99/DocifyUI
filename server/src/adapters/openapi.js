// OpenAPI / Swagger adapter: fetch the spec and verify it is a real API definition.

export async function inspectSpec(url) {
  let r;
  try {
    r = await fetch(String(url).trim(), { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('Could not reach the spec URL — check the address');
  }
  if (!r.ok) throw new Error('Could not fetch the spec (' + r.status + ')');
  const text = await r.text();
  let spec;
  try {
    spec = JSON.parse(text);
  } catch {
    throw new Error('The spec must be JSON (YAML support is on the roadmap)');
  }
  if (!spec.openapi && !spec.swagger) throw new Error('That URL is not an OpenAPI or Swagger document');
  const endpoints = spec.paths ? Object.keys(spec.paths).length : 0;
  return {
    title: (spec.info && spec.info.title) || 'API',
    version: (spec.info && spec.info.version) || '',
    endpoints
  };
}
