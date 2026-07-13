// Server-side SEO meta injection for the SPA. Crawlers (and link unfurlers)
// read the raw HTML long before React runs, so the catch-all route in
// index.js rewrites <title>/<meta description> and appends canonical +
// Open Graph + JSON-LD tags per public route. Client-side navigation is
// handled by the matching hook in client/src/seo.js.

export const SITE_URL = 'https://docifydocai.com';
const SITE_NAME = 'Docify';

const DEFAULT_DESC = 'Docify keeps technical documentation aligned with every meaningful product change: connect GitHub, GitLab, or Bitbucket, generate or auto-update docs from your code, validate quality, style, links, and AI-search readiness, review and approve changes, and export to Markdown, PDF, Word, HTML, and DITA.';

// Public, indexable routes. Anything not listed falls back to the default
// tags (in-app routes are noindexed via robots.txt anyway).
export const PAGE_META = {
  '/': {
    title: 'Docify — Automated Technical Documentation from GitHub, GitLab & Bitbucket',
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
    desc: 'How Docify works: connecting GitHub, GitLab, and Bitbucket, generating and auto-updating documentation, the AI quality review and AI-search readiness, human review and approval, and every output format.'
  },
  '/help': {
    title: 'Help Center | ' + SITE_NAME,
    desc: 'Guides for every screen of Docify — connecting sources, choosing document types, output formats, the AI quality review, exporting, and automation.'
  },
  '/contact': {
    title: 'Contact Support | ' + SITE_NAME,
    desc: 'Get in touch with the Docify team — questions, bug reports, billing, or Enterprise enquiries.'
  },
  '/legal/terms': { title: 'Terms of Service | ' + SITE_NAME, desc: 'The terms that govern your use of Docify.' },
  '/legal/privacy': { title: 'Privacy Policy | ' + SITE_NAME, desc: 'What Docify collects, what it never stores (your source code), and how data is handled.' },
  '/legal/security': { title: 'Security | ' + SITE_NAME, desc: 'How Docify protects your data: read-only source access, no source code storage, encryption in transit.' }
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
    desc: name + ' — how it works in Docify, the AI documentation platform. ' + DEFAULT_DESC
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
      featureList: 'AI documentation generation, LLM-as-a-Judge quality scoring, AI-search readiness evaluation, human review and approval, GitHub/GitLab/Bitbucket integration, Markdown/PDF/Word/HTML/DITA export, release notes and CI/CD documentation automation, AI Quality Report exports (PDF/HTML/PowerPoint)'
    },
    { '@type': 'Organization', name: SITE_NAME, url: SITE_URL, logo: SITE_URL + '/icon.svg' },
    { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL, description: DEFAULT_DESC }
  ]
});

// FAQPage structured data for the landing page. Mirrors the visible FAQ
// section in client/src/pages/Landing.jsx — keep the two in sync.
const FAQ_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    ['What is Docify?',
      'Docify keeps technical documentation aligned with your product. Connect your GitHub, GitLab, or Bitbucket repositories, and Docify generates or updates documentation from your real source, validates its quality, style, links, and AI-search readiness, lets your team review and approve every change, and exports the result to Markdown, PDF, Word, HTML, DITA, and more.'],
    ['How does documentation stay up to date automatically?',
      'Automation pipelines run on every merge or push via webhook. Docify decides whether a change is meaningful to customers, updates the affected section of the existing document (never a duplicate), re-scores it, and either auto-publishes or holds it for human approval — so the release and its documentation ship together.'],
    ['Does Docify document every code change?',
      'No. Docify filters changes for customer relevance using repository rules, include/exclude patterns, metadata, style guides, and AI reasoning, and routes low-confidence decisions to a human. Internal refactors and implementation details do not become customer documentation.'],
    ['What does the AI quality review check?',
      'Each document is scored across weighted dimensions — LLM readiness, structure, clarity, completeness, terminology consistency, readability, style-guide compliance, and link integrity — with an overall score, a publish-readiness verdict, and a one-click or reviewer-approved fix for each finding.'],
    ['What is AI search readiness?',
      'Docify evaluates the signals that help machines find, understand, and cite your content — titles, metadata, structure, clarity, and completeness — and estimates how ready each major assistant is to retrieve it. It is a readiness signal you can improve, not a guarantee of ranking on any platform.'],
    ['Is my source code stored?',
      'No. Docify reads your repository through a read-only grant, generates documentation from code structure, comments, and history, and does not store your source. You can revoke access at any time.']
  ].map(([q, a]) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a }
  }))
});

const OG_IMAGE = SITE_URL + '/og-image.png';

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
    '<meta property="og:locale" content="en_US" />',
    '<meta property="og:image" content="' + OG_IMAGE + '" />',
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta property="og:image:alt" content="Docify — documentation that stays aligned with every meaningful product change" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="' + esc(meta.title) + '" />',
    '<meta name="twitter:description" content="' + esc(meta.desc) + '" />',
    '<meta name="twitter:image" content="' + OG_IMAGE + '" />',
    '<script type="application/ld+json">' + JSON_LD + '</script>',
    clean === '/' ? '<script type="application/ld+json">' + FAQ_LD + '</script>' : ''
  ].filter(Boolean).join('\n    ');
  return html
    .replace(/<title>[^<]*<\/title>/, '<title>' + esc(meta.title) + '</title>')
    .replace(/(<meta name="description" content=")[^"]*(")/, '$1' + esc(meta.desc) + '$2')
    .replace('</head>', '    ' + tags + '\n  </head>');
}
