// Server-side SEO meta injection for the SPA. Crawlers (and link unfurlers)
// read the raw HTML long before React runs, so the catch-all route in
// index.js rewrites <title>/<meta description> and appends canonical +
// Open Graph + JSON-LD tags per public route. Client-side navigation is
// handled by the matching hook in client/src/seo.js.

export const SITE_URL = 'https://docifydocai.com';
const SITE_NAME = 'DocGen';

const DEFAULT_DESC = 'DocGen turns code commits into standards-grade documentation, scores every page with an LLM judge, and predicts how ChatGPT, Claude, and Gemini will rank it — before you publish.';

// Public, indexable routes. Anything not listed falls back to the default
// tags (in-app routes are noindexed via robots.txt anyway).
export const PAGE_META = {
  '/': {
    title: 'DocGen — AI Documentation Generator with Built-In Quality & AI Ranking Scores',
    desc: DEFAULT_DESC
  },
  '/pricing': {
    title: 'Pricing — Free & Team Plans | ' + SITE_NAME,
    desc: 'Start free: 5 generations per month, no credit card. Team plan adds unlimited generations, all output formats, CI/CD automation, and the full AI quality pipeline.'
  },
  '/signup': {
    title: 'Start Free — Create Your Account | ' + SITE_NAME,
    desc: 'Sign up with GitHub, GitLab, or Bitbucket in one step. Your first verified document is about three minutes away. Free plan, no credit card required.'
  },
  '/docs': {
    title: 'Product Docs & Guides | ' + SITE_NAME,
    desc: 'How DocGen works: AI compatibility checking, LLM-as-a-Judge scoring, ChatGPT/Claude/Gemini ranking analysis, CI/CD automation, and every output format.'
  },
  '/help': {
    title: 'Help Center | ' + SITE_NAME,
    desc: 'Guides for every screen of DocGen — connecting sources, choosing document types, output formats, the AI quality review, exporting, and automation.'
  },
  '/legal/terms': { title: 'Terms of Service | ' + SITE_NAME, desc: 'The terms that govern your use of DocGen.' },
  '/legal/privacy': { title: 'Privacy Policy | ' + SITE_NAME, desc: 'What DocGen collects, what it never stores (your source code), and how data is handled.' },
  '/legal/security': { title: 'Security | ' + SITE_NAME, desc: 'How DocGen protects your data: read-only source access, no source code storage, encryption in transit.' }
};

// /docs/<slug> articles get a readable title derived from the slug.
function docArticleMeta(path) {
  const slug = path.slice('/docs/'.length).replace(/[^a-z0-9-]/g, '');
  if (!slug) return null;
  const name = slug.split('-').map((w) => (
    ['ai', 'llm', 'ci', 'api', 'md'].includes(w) ? w.toUpperCase()
      : ['chatgpt'].includes(w) ? 'ChatGPT'
        : ['github'].includes(w) ? 'GitHub'
          : w.charAt(0).toUpperCase() + w.slice(1)
  )).join(' ');
  return {
    title: name + ' | ' + SITE_NAME + ' Docs',
    desc: name + ' — how it works in DocGen, the AI documentation platform. ' + DEFAULT_DESC
  };
}

const JSON_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web',
      description: DEFAULT_DESC,
      offers: [
        { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' },
        { '@type': 'Offer', name: 'Team', price: '26', priceCurrency: 'USD', description: 'Per user / month, billed annually' }
      ],
      featureList: 'AI documentation generation, LLM-as-a-Judge quality scoring, ChatGPT/Claude/Gemini ranking prediction, GitHub/GitLab/Bitbucket integration, DITA/Markdown/PDF/Word export, CI/CD automation'
    },
    { '@type': 'Organization', name: SITE_NAME, url: SITE_URL, logo: SITE_URL + '/icon.svg' }
  ]
});

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// Rewrite the built index.html for a given request path.
export function injectMeta(html, path) {
  const clean = String(path).replace(/\/+$/, '') || '/';
  const meta = PAGE_META[clean] || (clean.startsWith('/docs/') ? docArticleMeta(clean) : null) || PAGE_META['/'];
  const url = SITE_URL + (clean === '/' ? '' : clean) + (clean === '/' ? '/' : '');
  const tags = [
    '<link rel="canonical" href="' + esc(url) + '" />',
    '<meta property="og:title" content="' + esc(meta.title) + '" />',
    '<meta property="og:description" content="' + esc(meta.desc) + '" />',
    '<meta property="og:url" content="' + esc(url) + '" />',
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="' + SITE_NAME + '" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="' + esc(meta.title) + '" />',
    '<meta name="twitter:description" content="' + esc(meta.desc) + '" />',
    '<script type="application/ld+json">' + JSON_LD + '</script>'
  ].join('\n    ');
  return html
    .replace(/<title>[^<]*<\/title>/, '<title>' + esc(meta.title) + '</title>')
    .replace(/(<meta name="description" content=")[^"]*(")/, '$1' + esc(meta.desc) + '$2')
    .replace('</head>', '    ' + tags + '\n  </head>');
}
