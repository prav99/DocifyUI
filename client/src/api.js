let token = localStorage.getItem('docgen_token') || null;

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('docgen_token', t);
  else localStorage.removeItem('docgen_token');
}
export function getToken() {
  return token;
}

export async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
  return data;
}

// Authenticated file download (fetch → blob → anchor click).
export async function download(path) {
  const res = await fetch('/api' + path, {
    headers: token ? { Authorization: 'Bearer ' + token } : {}
  });
  if (!res.ok) throw new Error('Download failed (' + res.status + ')');
  const cd = res.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename="([^"]+)"/);
  const name = m ? m[1] : 'download.txt';
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return name;
}

let catalogCache = null;
export async function getCatalog() {
  if (!catalogCache) catalogCache = api('/catalog');
  return catalogCache;
}
