// Mock LLM adapter: document generation + LLM-as-judge quality evaluation.
// Production swap: call the Anthropic API here, keeping the same return shapes.

import { docTypeName } from '../catalog.js';

// ---- Skill engine: parse a SKILL.md into applied directives ----
// Recognized: `tone: ...`, `audience: ...`, bullet lists under a "## Sections"
// heading (become the document outline), and all other bullets (become rules).
export function parseSkill(md) {
  const out = { tone: null, audience: null, sections: [], rules: [] };
  if (!md) return out;
  let inSections = false;
  for (const raw of String(md).split(/\r?\n/)) {
    const line = raw.trim();
    if (/^#{1,6}\s*sections\b/i.test(line)) { inSections = true; continue; }
    if (/^#{1,6}\s/.test(line)) { inSections = false; continue; }
    const b = line.match(/^[-*]\s+(.+)$/);
    if (b) { (inSections ? out.sections : out.rules).push(b[1].trim()); continue; }
    const t = line.match(/^tone\s*[:=]\s*(.+)$/i);
    if (t) { out.tone = t[1].trim(); continue; }
    const a = line.match(/^audience\s*[:=]\s*(.+)$/i);
    if (a) out.audience = a[1].trim();
  }
  return out;
}

const CANON = {
  authentication: 'All requests require a bearer token issued from the developer console. Tokens scope to a single project and expire after 12 hours. See the token rotation guide for rotation policy.',
  'create a charge': 'Send a POST request to `/v1/charges` with amount, currency, and source. The response returns a charge object with a status of pending, succeeded, or failed.',
  refunds: 'Refunds are issued against a charge ID, never against raw card details. It must be rotated every 90 days.',
  overview: 'The Payments API lets you create, capture, and refund charges programmatically.'
};

function sectionBody(name, sk) {
  const canned = CANON[name.toLowerCase()];
  if (canned) return canned;
  let body = 'Drafted from repository analysis for "' + name + '".';
  if (sk.rules.length) body += ' Written to comply with ' + sk.rules.length + ' skill rule' + (sk.rules.length > 1 ? 's' : '') + '.';
  return body;
}

export function generateDocument({ track, docTypes, format, repo, instructions, skill = '', skillName = '' }) {
  const title = docTypeName(track, docTypes[0]);
  const sk = parseSkill(skill);
  const sections = sk.sections.length ? sk.sections : ['Overview', 'Authentication', 'Create a charge', 'Refunds'];

  const head = ['# ' + title, '', 'The Payments API lets you create, capture, and refund charges programmatically.', 'Generated from ' + repo + ' by DocGen.'];
  if (skillName) {
    head.push('', '> Skill applied: ' + skillName +
      (sk.rules.length ? ' — ' + sk.rules.length + ' rule' + (sk.rules.length > 1 ? 's' : '') : '') +
      (sk.sections.length ? ' · custom outline (' + sk.sections.length + ' sections)' : ''));
  }
  if (sk.audience) head.push('', 'Audience: ' + sk.audience + '.');
  if (sk.tone) head.push('Tone: ' + sk.tone + '.');
  if (instructions && instructions.trim()) {
    head.push('', '> Customization applied: ' + instructions.trim().slice(0, 140));
  }

  const parts = [...head];
  for (const s of sections) {
    parts.push('', '## ' + s, '', sectionBody(s, sk));
  }
  const md = parts.join('\n');

  let content = md;
  if (format === 'dita') {
    const dita = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<topic id="' + slug(title) + '">',
      '  <title>' + title + '</title>',
      '  <shortdesc>Create, capture, and refund charges programmatically.</shortdesc>',
      '  <body>'
    ];
    for (const s of sections) {
      dita.push(
        '    <section id="' + slug(s) + '">',
        '      <title>' + s + '</title>',
        '      <p>' + sectionBody(s, sk).replace(/`/g, '') + '</p>',
        '    </section>'
      );
    }
    dita.push('  </body>', '</topic>');
    content = dita.join('\n');
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
