// Server-side SEO meta injection for the SPA. Crawlers (and link unfurlers)
// read the raw HTML long before React runs, so the catch-all route in
// index.js rewrites <title>/<meta description> and appends canonical +
// Open Graph + JSON-LD tags per public route. Client-side navigation is
// handled by the matching hook in client/src/seo.js.

export const SITE_URL = 'https://docifydocai.com';
const SITE_NAME = 'Docify';

const DEFAULT_DESC = 'Manual documentation drains engineering hours every release and delays shipping. Docify connects GitHub, GitLab, or Bitbucket read-only, updates the affected docs on merge, gates quality before publish, keeps a human approving every change, and exports to Markdown, PDF, Word, HTML, and DITA.';

// Public, indexable routes. Anything not listed falls back to the default
// tags (in-app routes are noindexed via robots.txt anyway).
export const PAGE_META = {
  '/': {
    title: 'Docify — Automated Technical Documentation from GitHub, GitLab & Bitbucket',
    desc: DEFAULT_DESC
  },
  '/pricing': {
    title: 'Pricing — Free, Starter, Team & Enterprise | ' + SITE_NAME,
    desc: 'Start free with 5 generations a month — no credit card. Starter $29/mo for small teams; Team $99/mo ($79 billed annually) with five seats, 10 automation pipelines, and a 14-day free trial. Enterprise adds custom style-guide rules and a DPA, with SSO and audit logs on request.'
  },
  '/signup': {
    title: 'Start Free — Create Your Account | ' + SITE_NAME,
    desc: 'Sign up with Google in one click, or with GitHub, GitLab, or Bitbucket in one step. Your first verified document is about three minutes away. Free plan, no credit card required.'
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
  '/legal/privacy': { title: 'Privacy Policy | ' + SITE_NAME, desc: 'What Docify collects, what it keeps no copy of (your source files), which subprocessors receive what, and how to delete your account.' },
  '/legal/security': { title: 'Security | ' + SITE_NAME, desc: 'How Docify protects your data: read-only repository access, no copies of your source files, account isolation covered by automated tests, and an honest list of what we do not have yet.' }
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
        { '@type': 'Offer', name: 'Starter', price: '24', priceCurrency: 'USD', description: 'Per month, billed annually' },
        { '@type': 'Offer', name: 'Team', price: '79', priceCurrency: 'USD', description: 'Per month, five seats included, billed annually' }
      ],
      featureList: 'AI documentation generation, LLM-as-a-Judge quality scoring, AI-search readiness evaluation, human review and approval, GitHub/GitLab/Bitbucket integration, Markdown/PDF/Word/HTML/DITA export, release notes and CI/CD documentation automation, AI Quality Report exports (PDF/HTML/PowerPoint)'
    },
    { '@type': 'Organization', name: SITE_NAME, url: SITE_URL, logo: SITE_URL + '/icon.svg' },
    { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL, description: DEFAULT_DESC }
  ]
});

// FAQPage structured data for the landing page. Mirrors the visible FAQ
// section in client/src/pages/Landing.jsx — keep the two in sync.
const FAQ_ITEMS = [
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
      'We keep no copy of your source files. Docify reads a limited selection of files at generation time and sends them to Anthropic, our AI subprocessor, to write the document; the files themselves are never written to our database. The finished document is stored with your account and can quote short excerpts, because it is written from your code. You can revoke access at any time.'],
    ['How quickly does Docify pay for itself?',
      'We do not yet publish measured customer savings, so we will not quote one. What we can give you is the arithmetic. The Team plan is $79 per month billed annually ($99 monthly) and includes five seats — roughly $16 per person. At a typical loaded engineering cost of $75–120 per hour, the whole subscription is covered by about 40–60 minutes of saved documentation work per month across the entire team. The cost estimator on this page runs the calculation with your own figures, and the honest way to check it is the 14-day free trial — run it against a real release and compare the result with what that release usually costs you.']
];

const FAQ_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map(([q, a]) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a }
  }))
});

const OG_IMAGE = SITE_URL + '/og-image.png';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------
// Crawler-visible prerender. The SPA ships an empty <div id="root"></div>, so
// crawlers that do not execute JavaScript (Bing/ChatGPT's OAI-SearchBot,
// most AI assistants) index nothing but the meta tags. For the public
// marketing routes we inject real, readable HTML into #root; React replaces
// it on hydration. Copy mirrors client/src/pages/Landing.jsx — keep in sync.
// ---------------------------------------------------------------------------
const faqHtml = () => FAQ_ITEMS.map(([q, a]) =>
  '<h3>' + esc(q) + '</h3><p>' + esc(a) + '</p>').join('');

const PRERENDER = {
  '/': () => `
<h1>Your code already knows what the docs should say. Let it do the writing.</h1>
<p>Documentation is usually paid for in engineering hours: tracking changes, rewriting pages, chasing reviews, at loaded rates of roughly $75–120 an hour. Docify connects your repositories, generates and updates documentation automatically when the product changes, holds it to a quality gate, and keeps a human on every approval. The hours go down; the standard doesn’t.</p>
<p>Read-only access · your source code is never stored · free plan includes 5 generations · no credit card required.</p>
<h2>What does your current documentation process cost?</h2>
<p>Nobody signs an invoice for manual documentation, which is why it rarely comes up in a cost review. The spend is real all the same: engineers re-reading code they understood at merge time, releases queued behind writing, questions routed to the busiest people on the team, new hires ramping on pages that describe last quarter’s product. The interactive estimator on this page compares your current process cost with Docify Team at $79 per month billed annually ($99 monthly) with five seats included, using your own numbers.</p>
<h2>Connect your ecosystem</h2>
<p>Connect GitHub, GitLab, and Bitbucket — multiple accounts, organisations, groups, and workspaces, public or private — into one central catalogue, reusable across generation, automation, and standardization. Access is read-only and your source is never stored.</p>
<h2>Generate on demand</h2>
<p>Docify writes first drafts from your real code. Select sources — repositories, Jira issues, Confluence pages, Notion pages, or OpenAPI specs — choose a document type (API reference, user guide, quickstart, release notes, and more), pick output formats, and generate. Preview each format, run the AI quality review, edit inline, and export to Markdown, PDF, Word, HTML, DITA, DocBook, and ePub.</p>
<h2>Automate meaningful changes</h2>
<p>A webhook fires on merge. A relevance filter decides whether customers are affected and skips internal-only changes. The affected section of the existing document is updated in place, never duplicated. A quality gate scores the result, then it either auto-publishes or waits for a human.</p>
<h2>Human control</h2>
<p>AI proposes; your team decides. Every automatic change arrives as a proposal with inline and side-by-side diffs. Edit any span, ask AI to rewrite it, apply a style guide, accept, reject, comment, request changes, or approve and publish — every decision versioned in a full audit trail.</p>
<h2>Standardize at scale</h2>
<p>Rebuild documentation written by anyone, in any state, to one house standard using reusable style guides, terminology rules, and your own instruction files.</p>
<h2>Quality and AI search readiness</h2>
<p>Docify scores every document across weighted dimensions and holds anything below the publish gate. It also models AI search readiness — an estimate of how well assistants such as ChatGPT, Claude, and Gemini can find and cite the content. It is a signal you can improve, deliberately capped below 100% — never a ranking promise.</p>
<h2>Documents, versions, and reporting</h2>
<p>Every document carries approval status, full version history, side-by-side comparison, one-click restore, and an audit trail. Export the AI Quality Report as PDF, HTML, or PowerPoint.</p>
<h2>Frequently asked questions</h2>
${faqHtml()}
<p><a href="/pricing">Pricing</a> · <a href="/docs">Documentation</a> · <a href="/help">Help center</a> · <a href="/contact">Contact</a> · <a href="/legal/security">Security</a> · <a href="/status">System status</a></p>`,
  '/pricing': () => `
<h1>Docify pricing</h1>
<p>Start free. Upgrade when the whole team wants their docs to write themselves.</p>
<h2>Free — $0</h2>
<p>1 source, 5 generations per month (watermarked), PDF and Word export, quality overview. No credit card required.</p>
<h2>Starter — $29/month ($24 billed annually)</h2>
<p>Two seats, one automation pipeline, 60 documents a month, every export format except DITA, and the full AI quality pipeline.</p>
<h2>Team — $99/month ($79 billed annually) · 5 seats included · most popular</h2>
<p>Five seats included (extra seats $12), 10 automation pipelines, 250 pooled documents a month, every output format including DITA, the full AI quality pipeline with AI-search-readiness estimates, usage analytics, priority support, and a 14-day free trial — no credit card.</p>
<h2>Enterprise — custom, annual contract</h2>
<p>Everything in Team plus custom style-guide rules, a DPA, and dedicated support with SLA. SSO (SAML/OIDC) and audit logs are available on request. <a href="/contact">Contact us</a>.</p>`,
  '/docs': () => `
<h1>Docify documentation</h1>
<p>How Docify works: connecting GitHub, GitLab, and Bitbucket; generating and auto-updating documentation from code; the AI quality review and AI-search readiness; human review and approval; automation pipelines; and every output format. Popular guides: <a href="/docs/llm-as-a-judge">LLM-as-a-Judge scoring</a>, <a href="/docs/ai-compatibility-checker">AI compatibility checker</a>, <a href="/docs/docs-from-commits">Documentation from code commits</a>, <a href="/docs/ci-pipeline-setup">CI pipeline setup</a>.</p>`,
};

export function prerenderFor(path) {
  const make = PRERENDER[path];
  return make ? make() : '';
}

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
  const prerender = prerenderFor(clean);
  return html
    .replace(/<title>[^<]*<\/title>/, '<title>' + esc(meta.title) + '</title>')
    .replace(/(<meta name="description" content=")[^"]*(")/, '$1' + esc(meta.desc) + '$2')
    .replace('</head>', '    ' + tags + '\n  </head>')
    .replace('<div id="root"></div>', '<div id="root">' + prerender + '</div>');
}
