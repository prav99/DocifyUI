// ---------------------------------------------------------------------------
// Single source of truth for the public support address.
//
// This value is PUBLIC by design — it is rendered to users as a mailto: link
// and shown in help/error text — so exposing it in the client bundle is fine.
// Override at build time with VITE_SUPPORT_EMAIL (see client/.env.example);
// otherwise the production default below is used.
//
// Do NOT put SMTP passwords, API keys, or any secret here. Those live only in
// the server's environment (see server/.env.example) and never reach the browser.
// ---------------------------------------------------------------------------

export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@docifydocai.com';

// Build a mailto: link with an optional prefilled subject/body.
export function supportMailto(subject = '', body = '') {
  const params = [];
  if (subject) params.push('subject=' + encodeURIComponent(subject));
  if (body) params.push('body=' + encodeURIComponent(body));
  return 'mailto:' + SUPPORT_EMAIL + (params.length ? '?' + params.join('&') : '');
}
