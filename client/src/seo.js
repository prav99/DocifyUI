// Lightweight per-page SEO: sets document title, meta description, canonical
// URL, and Open Graph/Twitter tags on route change. The server injects the
// same values into the raw HTML for crawlers (server/src/seo-meta.js) — this
// hook keeps the tags correct during client-side navigation.
import { useEffect } from 'react';

export const SITE_URL = 'https://docifydocai.com';
export const SITE_NAME = 'DocGen';

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(url) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', url);
}

export function usePageMeta({ title, description, path }) {
  useEffect(() => {
    const fullTitle = title.includes(SITE_NAME) ? title : title + ' — ' + SITE_NAME;
    const url = SITE_URL + (path || window.location.pathname);
    document.title = fullTitle;
    if (description) setMeta('name', 'description', description);
    setCanonical(url);
    setMeta('property', 'og:title', fullTitle);
    if (description) setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:site_name', SITE_NAME);
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', fullTitle);
    if (description) setMeta('name', 'twitter:description', description);
  }, [title, description, path]);
}
