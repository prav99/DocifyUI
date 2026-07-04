// Mock LLM adapter: document generation + LLM-as-judge quality evaluation.
// Production swap: call the Anthropic API here, keeping the same return shapes.

import { docTypeName } from '../catalog.js';

export function generateDocument({ track, docTypes, format, repo, instructions }) {
  const title = docTypeName(track, docTypes[0]);
  const custom = instructions && instructions.trim()
    ? '\n> Customization applied: ' + instructions.trim().slice(0, 140) + '\n'
    : '';

  const md = [
    '# ' + title,
    '',
    'The Payments API lets you create, capture, and refund charges programmatically.',
    'Generated from ' + repo + ' by DocGen.',
    custom,
    '## Authentication',
    '',
    'All requests require a bearer token issued from the developer console.',
    'Tokens scope to a single project and expire after 12 hours.',
    'See the token rotation guide for rotation policy.',
    '',
    '## Create a charge',
    '',
    'Send a POST request to `/v1/charges` with amount, currency, and source.',
    'The response returns a charge object with a status of pending, succeeded, or failed.',
    '',
    '## Refunds',
    '',
    'Refunds are issued against a charge ID, never against raw card details.',
    'It must be rotated every 90 days.'
  ].join('\n');

  let content = md;
  if (format === 'dita') {
    content = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<topic id="' + slug(title) + '">',
      '  <title>' + title + '</title>',
      '  <shortdesc>Create, capture, and refund charges programmatically.</shortdesc>',
      '  <body>',
      '    <section id="authentication">',
      '      <title>Authentication</title>',
      '      <p>All requests require a bearer token issued from the developer console.</p>',
      '    </section>',
      '    <section id="endpoints">',
      '      <title>Endpoints</title>',
      '      <p>POST /v1/charges creates a charge.</p>',
      '    </section>',
      '  </body>',
      '</topic>'
    ].join('\n');
  } else if (format === 'pdf' || format === 'word') {
    content = '[' + format.toUpperCase() + ' EXPORT — rendered by the format adapter in production]\n\n' + md;
  }
  return { title, content };
}

export function judge() {
  return {
    issues: [
      {
        id: 'shortdesc', cat: 'LLM readiness', title: 'Missing short description',
        body: 'No short description was found at the top of the document. AI systems and search results rely on it to summarize the page — without one, retrieval quality drops and snippets are generated from arbitrary body text.',
        fix: 'Add under the title: "The Payments API lets you create, capture, and refund charges programmatically. This reference covers authentication, all endpoints, and error handling."'
      },
      {
        id: 'title', cat: 'LLM readiness', title: 'Title is not search-optimized',
        body: 'The current title "Reference" is too generic to match real queries. Users and LLMs search with product and task terms, not document-type labels.',
        fix: 'Rename to "Payments API reference — endpoints, authentication, and errors".'
      },
      {
        id: 'keywords', cat: 'LLM readiness', title: 'Missing metadata keywords',
        body: 'No keywords or tags are attached to the document, reducing discoverability in both site search and vector retrieval.',
        fix: 'Add keywords: payments-api, REST authentication, refunds, webhook events.'
      },
      {
        id: 'pronoun', cat: 'Consumability', title: 'Ambiguous pronoun reference',
        body: 'In the Refunds section, the sentence "It must be rotated every 90 days" follows mentions of both the API key and the signing secret. Retrieved out of context, "It" does not resolve.',
        fix: 'Replace with "The API signing secret must be rotated every 90 days."'
      },
      {
        id: 'example', cat: 'Consumability', title: 'Missing example',
        body: 'The "Create a charge" section describes the request body but includes no code example. Sections without examples are retrieved less often and answered less accurately by LLMs.',
        fix: 'Add a curl example showing a minimal POST /v1/charges request with amount, currency, and source fields.'
      }
    ],
    links: [
      { file: 'authentication.md, line 24', url: '/docs/token-rotation-guide', why: 'Target page was removed in v2.3 docs restructure. Returns 404.', status: '404' },
      { file: 'webhooks.md, line 108', url: 'https://status.acme.dev/webhooks', why: 'Host resolves but path redirects 3 times, then times out.', status: 'Timeout' }
    ],
    style: [
      { t: 'Passive voice above threshold', d: 'Sections 2 and 4 use passive voice in 31% of sentences; the style guide caps it at 20%. Example: "Tokens are issued by the console" — prefer "The console issues tokens."', pass: false },
      { t: 'Inconsistent terminology: "API key" vs "token"', d: 'Both terms refer to the same credential. The glossary prefers "API key". 6 occurrences of "token" flagged outside code samples.', pass: false },
      { t: 'Sentence case in headings', d: 'All headings comply with sentence-case convention.', pass: true },
      { t: 'Oxford comma usage', d: 'Consistent across all list constructions.', pass: true },
      { t: 'Latin abbreviations', d: 'No "e.g." or "i.e." in body text; expanded forms used throughout.', pass: true }
    ]
  };
}

export const AI_BASE_SCORE = 70;
export const AI_PER_FIX = 6;

export function aiScore(issueCount, fixedCount) {
  return Math.min(100, AI_BASE_SCORE + AI_PER_FIX * fixedCount);
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
