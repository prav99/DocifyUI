// analytics.js — sends SPA pageviews + button/link click events to Google Analytics 4.
// The gtag() function itself is bootstrapped in index.html.
// Microsoft Clarity needs nothing here: it auto-captures every click, heatmap,
// and session recording once its snippet loads in index.html.

function gtag() {
  // Guard: if the GA snippet hasn't loaded (or was blocked), do nothing.
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag.apply(window, arguments);
}

// Fire a GA4 page_view for the current route. Call this on every route change.
export function trackPageview(path) {
  gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

// Build a human-readable label for a clicked element so button clicks are easy
// to read in GA4 (e.g. "Generate docs", "Pricing", "Sign up").
function labelFor(el) {
  const explicit =
    el.getAttribute('data-analytics') ||
    el.getAttribute('aria-label') ||
    (el.textContent || '').trim();
  const label = explicit || el.getAttribute('title') || el.id || el.className;
  return (label || 'unlabeled').slice(0, 100);
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
        href: isLink ? el.href : undefined,
        page_path: window.location.pathname,
      });
    },
    true // capture phase, so clicks are caught even if handlers stop propagation
  );
}
