// analytics.js — sends SPA pageviews + button/link click events to Google Analytics 4.
// The gtag() function itself is bootstrapped in index.html.
// Microsoft Clarity needs nothing here: it auto-captures every click, heatmap,
// and session recording once its snippet loads in index.html.

function gtag() {
  // Guard: if the GA snippet hasn't loaded (or was blocked), do nothing.
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag.apply(window, arguments);
}

// A URL safe to send to third-party analytics: the OAuth completion route
// carries the session token in the fragment, and query strings can carry
// invite/verification tokens. Never let either reach an analytics vendor.
export function safeUrl() {
  try {
    const u = new URL(window.location.href);
    u.hash = '';
    ['token', 'code', 'state', 'key', 'secret'].forEach((p) => u.searchParams.delete(p));
    return u.toString();
  } catch { return window.location.origin; }
}

// Fire a GA4 page_view for the current route. Call this on every route change.
export function trackPageview(path) {
  gtag('event', 'page_view', {
    page_path: path,
    page_location: safeUrl(),
    page_title: document.title,
  });
}

// Build a label for a clicked element. Customer content — document titles,
// repository names, section headings — is rendered inside buttons and links
// throughout the app, so raw textContent must never be sent to analytics.
// Only labels the app deliberately declares (data-analytics / aria-label) are
// treated as safe; everything else degrades to a structural descriptor.
const SAFE_LABEL = /^[\w .,'&/+-]{1,60}$/;

function labelFor(el) {
  const declared = el.getAttribute('data-analytics');
  if (declared) return declared.slice(0, 60);
  // Chrome/marketing pages are static copy, so an aria-label there is safe;
  // in-app screens can carry customer strings, so accept only conservative
  // short labels that look like UI chrome rather than content.
  const aria = (el.getAttribute('aria-label') || '').trim();
  if (aria && SAFE_LABEL.test(aria)) return aria;
  const id = el.id && SAFE_LABEL.test(el.id) ? el.id : '';
  return (id || el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '')).slice(0, 60);
}

// Only the path is ever reported for links — a full href can carry document
// ids, share tokens, or query parameters.
function safeHref(el) {
  try { return new URL(el.href, window.location.origin).pathname; } catch { return undefined; }
}

// Install a single document-level listener that reports clicks on any
// <button>, <a>, or element with role="button". One listener covers the
// whole app, including elements added later.
export function installClickTracking() {
  if (typeof document === 'undefined') return;
  document.addEventListener(
    'click',
    (e) => {
      const el = e.target.closest('button, a, [role="button"]');
      if (!el) return;
      const isLink = el.tagName === 'A';
      gtag('event', isLink ? 'link_click' : 'button_click', {
        label: labelFor(el),
        element: el.tagName.toLowerCase(),
        href: isLink ? safeHref(el) : undefined,
        page_path: window.location.pathname,
      });
    },
    true // capture phase, so clicks are caught even if handlers stop propagation
  );
}
