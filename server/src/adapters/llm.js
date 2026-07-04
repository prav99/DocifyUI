// Mock LLM adapter: document generation + LLM-as-judge quality evaluation.
// Every document type is generated against a recognized open documentation
// standard (Diátaxis, Keep a Changelog, OpenAPI-aligned reference, Google
// developer-docs troubleshooting) — defined here, centrally, in the backend.
// Production swap: call the Anthropic API here with the same template as the
// prompt scaffold, keeping the same return shapes.

import { docTypeName } from '../catalog.js';

/* ---------------- Skill engine ---------------- */
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

/* ---------------- Markdown helpers ---------------- */
const F = '```';

function table(headers, rows) {
  const line = (cells) => '| ' + cells.join(' | ') + ' |';
  return [line(headers), line(headers.map(() => '---'))].concat(rows.map(line)).join('\n');
}

function steps(items) {
  return items.map((s, i) => (i + 1) + '. ' + s).join('\n');
}

function bullets(items) {
  return items.map((s) => '- ' + s).join('\n');
}

/* ---------------- Templates: one open standard per document type ---------------- */
const TEMPLATES = {
  /* ---- Technical (Diátaxis / OpenAPI / Keep a Changelog / Google style) ---- */
  api: {
    standard: 'OpenAPI 3.1-aligned reference',
    sections: (c) => [
      ['Overview',
        'The ' + c.product + ' lets you create, capture, and refund charges programmatically. ' +
        'Base URL: `https://api.acme.dev/v1`. All responses are JSON; all timestamps are ISO 8601.'],
      ['Authentication',
        'Authenticate every request with an API key in the `Authorization` header.\n\n' +
        F + 'bash\ncurl https://api.acme.dev/v1/charges \\\n  -H "Authorization: Bearer $API_KEY"\n' + F],
      ['Errors',
        'The API uses conventional HTTP status codes.\n\n' +
        table(['Code', 'Meaning', 'Retry?'], [
          ['`400`', 'Malformed request body', 'No'],
          ['`401`', 'Missing or invalid API key', 'No'],
          ['`402`', 'Charge failed', 'Yes, with a new source'],
          ['`429`', 'Rate limit exceeded', 'Yes, with backoff'],
          ['`5xx`', 'Server error', 'Yes, idempotently']
        ])],
      ['POST /v1/charges',
        'Creates a charge.\n\n**Parameters**\n\n' +
        table(['Field', 'Type', 'Required', 'Description'], [
          ['`amount`', 'integer', 'Yes', 'Amount in minor units (cents)'],
          ['`currency`', 'string', 'Yes', 'Three-letter ISO 4217 code'],
          ['`source`', 'string', 'Yes', 'Payment source identifier'],
          ['`idempotency_key`', 'string', 'No', 'Guards against duplicate charges']
        ]) +
        '\n\n**Request**\n\n' +
        F + 'bash\ncurl -X POST https://api.acme.dev/v1/charges \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -d amount=2000 -d currency=usd -d source=src_123\n' + F +
        '\n\n**Response** `201 Created`\n\n' +
        F + 'json\n{ "id": "ch_9f2", "status": "succeeded", "amount": 2000 }\n' + F],
      ['GET /v1/charges/{id}',
        'Retrieves an existing charge by identifier. Returns `404` if the charge does not exist.'],
      ['Rate limits',
        'Default limit: 100 requests per second per API key. The `X-RateLimit-Remaining` header reports your remaining budget; on `429`, honor `Retry-After`.']
    ]
  },

  userguide: {
    standard: 'Diátaxis how-to guide',
    sections: (c) => [
      ['About this guide',
        'This guide shows you how to accomplish real tasks with the ' + c.product + '. Each section is goal-oriented: start at the task you need, not at the beginning.'],
      ['Before you begin',
        bullets([
          'An active account with an API key from the developer console.',
          'The base URL for your environment (`https://api.acme.dev/v1`).',
          'curl 8+ or an HTTP client of your choice.'
        ])],
      ['Charge a customer',
        steps([
          'Collect a payment source from your checkout and note its `src_...` identifier.',
          'Send `POST /v1/charges` with `amount`, `currency`, and `source`.',
          'Store the returned charge `id` with your order record.'
        ]) + '\n\n' + F + 'bash\ncurl -X POST https://api.acme.dev/v1/charges \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -d amount=2000 -d currency=usd -d source=src_123\n' + F],
      ['Refund a charge',
        steps([
          'Find the charge `id` you want to refund.',
          'Send `POST /v1/refunds` with the charge identifier.',
          'Confirm the refund status is `succeeded` before notifying the customer.'
        ])],
      ['Verify your work',
        'List recent charges with `GET /v1/charges?limit=5` and confirm your test charge appears with the expected status.'],
      ['Troubleshooting',
        'If a request fails, check the error table in the API reference first. The three most common causes: a missing `Authorization` header, an amount in major units instead of cents, and reusing a consumed payment source.']
    ]
  },

  install: {
    standard: 'Diátaxis how-to (installation)',
    sections: (c) => [
      ['Prerequisites',
        table(['Requirement', 'Minimum', 'Check with'], [
          ['Node.js', '18.0', '`node --version`'],
          ['Operating system', 'macOS 12, Windows 10, Ubuntu 20.04', '—'],
          ['Network', 'Outbound HTTPS to api.acme.dev', '`curl -I https://api.acme.dev`']
        ])],
      ['Install',
        '**macOS / Linux**\n\n' + F + 'bash\nnpm install -g @acme/payments-cli\n' + F +
        '\n\n**Windows (PowerShell)**\n\n' + F + 'powershell\nnpm install -g @acme/payments-cli\n' + F],
      ['Configure',
        'Create a configuration file with your API key. Never commit this file.\n\n' +
        F + 'bash\nacme configure --api-key $API_KEY --env production\n' + F],
      ['Verify the installation',
        F + 'bash\nacme status\n# expected: connected · account acct_1a2b · mode production\n' + F],
      ['Upgrade and uninstall',
        'Upgrade with `npm update -g @acme/payments-cli`. Uninstall with `npm uninstall -g @acme/payments-cli`; your remote configuration is unaffected.'],
      ['Troubleshooting',
        'If `acme status` reports `unauthorized`, regenerate the API key in the console and run `acme configure` again.']
    ]
  },

  quickstart: {
    standard: 'Diátaxis tutorial',
    sections: (c) => [
      ['What you will build',
        'In about five minutes you will create your first successful charge against the ' + c.product + ' sandbox and see it in the dashboard.'],
      ['Step 1 — Get your sandbox key',
        'In the developer console, open **Keys** and copy the key that begins with `sk_test_`.'],
      ['Step 2 — Make your first call',
        F + 'bash\ncurl -X POST https://sandbox.acme.dev/v1/charges \\\n  -H "Authorization: Bearer $SANDBOX_KEY" \\\n  -d amount=100 -d currency=usd -d source=src_test_visa\n' + F],
      ['Step 3 — Read the response',
        'A `201` response with `"status": "succeeded"` means the sandbox accepted the charge:\n\n' +
        F + 'json\n{ "id": "ch_test_1", "status": "succeeded", "amount": 100 }\n' + F],
      ['Step 4 — See it in the dashboard',
        'Open **Payments → Sandbox** in the console. Your 1.00 USD charge appears at the top of the list.'],
      ['Where to go next',
        bullets([
          'Charge real cards: switch to a live key and the production base URL.',
          'Handle failures: read the Errors section of the API reference.',
          'Automate reconciliation: subscribe to `charge.succeeded` webhooks.'
        ])]
    ]
  },

  troubleshoot: {
    standard: 'Google developer-docs troubleshooting pattern',
    sections: (c) => [
      ['How to use this page',
        'Each entry follows the same pattern: the symptom you observe, the likely cause, and the resolution. Match your symptom and apply the fix.'],
      ['Charge returns 401 Unauthorized',
        '**Symptom** — Every request fails with `401` and `"invalid_key"`.\n\n**Cause** — The API key is missing, revoked, or sent without the `Bearer` prefix.\n\n**Resolution** — Regenerate the key in the console, and send it as `Authorization: Bearer sk_live_...`.'],
      ['Charge succeeds in sandbox but fails in production',
        '**Symptom** — Identical request works with `sk_test_` and fails with `sk_live_`.\n\n**Cause** — Live mode enforces card verification that the sandbox skips.\n\n**Resolution** — Collect and forward the verification fields (`cvc`, `postal_code`) with the payment source.'],
      ['Duplicate charges appear',
        '**Symptom** — One checkout produces two charges.\n\n**Cause** — The client retried a timed-out request without an idempotency key.\n\n**Resolution** — Send `idempotency_key` on every `POST /v1/charges`; retries then return the original charge.'],
      ['Frequently asked questions',
        '**Can I charge in multiple currencies?** Yes — any ISO 4217 currency your account is approved for.\n\n**How long do refunds take?** Refunds settle in 5–10 business days depending on the card network.\n\n**Is there a test card?** Use source `src_test_visa` in the sandbox.']
    ]
  },

  relnotes: {
    standard: 'Keep a Changelog 1.1 + SemVer 2.0',
    sections: (c) => [
      ['About this changelog',
        'All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).'],
      ['[Unreleased]',
        '### Added\n- Webhook signing key rotation from the console.'],
      ['[' + c.version + '] — ' + c.date,
        '### Added\n' + bullets(['Idempotency keys on `POST /v1/charges`.', 'Charge search by metadata (`GET /v1/charges?metadata[order]=...`).']) +
        '\n\n### Changed\n' + bullets(['Refund settlement window reduced from 10 to 7 business days.']) +
        '\n\n### Fixed\n' + bullets(['`429` responses now include a correct `Retry-After` header.']) +
        '\n\n### Security\n' + bullets(['API keys are validated with constant-time comparison.'])],
      ['[2.3.1] — 2026-05-18',
        '### Fixed\n' + bullets(['Sandbox charges no longer appear in production exports.'])]
    ]
  },

  admin: {
    standard: 'Diátaxis reference (configuration)',
    sections: (c) => [
      ['Configuration reference',
        'All configuration is supplied through environment variables, following twelve-factor conventions.\n\n' +
        table(['Variable', 'Default', 'Description'], [
          ['`ACME_API_KEY`', '—', 'Required. Key from the developer console'],
          ['`ACME_ENV`', '`production`', '`production` or `sandbox`'],
          ['`ACME_TIMEOUT_MS`', '`10000`', 'Per-request timeout'],
          ['`ACME_LOG_LEVEL`', '`info`', '`debug`, `info`, `warn`, `error`']
        ])],
      ['Roles and permissions',
        table(['Role', 'Can view', 'Can charge', 'Can refund', 'Can configure'], [
          ['Viewer', 'Yes', 'No', 'No', 'No'],
          ['Operator', 'Yes', 'Yes', 'Yes', 'No'],
          ['Admin', 'Yes', 'Yes', 'Yes', 'Yes']
        ])],
      ['Deployment',
        'Run at least two instances behind a load balancer. Instances are stateless; session affinity is not required.'],
      ['Backup and audit',
        'Transaction data is retained for seven years. Export audit logs with `GET /v1/audit-events` — every configuration change and refund records the acting user.']
    ]
  },

  /* ---- Marketing ---- */
  announce: {
    standard: 'Inverted-pyramid announcement',
    sections: (c) => [
      ['TL;DR',
        c.product + ' ' + c.version + ' is available today' +
        (c.brief.emphasis ? ' — headlined by ' + c.brief.emphasis + '.' : ', with idempotent retries built in, faster refunds, and metadata search.')],
      ['What is new',
        bullets([
          (c.brief.emphasis ? c.brief.emphasis.charAt(0).toUpperCase() + c.brief.emphasis.slice(1) : 'Idempotent retries built in') + ' — no more duplicate charges from network flakiness.',
          'Refunds settle up to three days faster.',
          'Search charges by your own order metadata.'
        ])],
      ['Why it matters',
        (c.brief.audience ? 'For ' + c.brief.audience + ', this' : 'This') +
        ' removes the most common integration failure mode and shortens month-end reconciliation from hours to minutes.'],
      ['Availability',
        'Rolling out to all accounts today. No code changes required for existing integrations; new capabilities are opt-in per request.'],
      ['Get started',
        'Read the changelog, then try it in the sandbox: one curl command and you will see the difference.']
    ]
  },

  onepager: {
    standard: 'Problem-Solution one-pager',
    sections: (c) => [
      ['The problem',
        'Payment retries are dangerous by default: a timeout followed by a retry can charge a customer twice, and every duplicate is a support ticket, a refund, and lost trust.'],
      ['The solution',
        (c.brief.emphasis ? c.brief.emphasis.charAt(0).toUpperCase() + c.brief.emphasis.slice(1) : 'Idempotent retries, built into every charge call') +
        '. Send an idempotency key with each request; retries return the original result instead of creating a duplicate.'],
      ['How it works',
        steps([
          'Your client generates a key per checkout.',
          'The API stores the first outcome under that key.',
          'Any retry with the same key replays the stored outcome — never a second charge.'
        ])],
      ['Proof',
        table(['Metric', 'Before', 'After'], [
          ['Duplicate charges / 10k', '14', '0'],
          ['Refund-related tickets', '9 per week', '1 per week'],
          ['Integration time', '2 days', '2 hours']
        ])],
      ['Call to action',
        'Available on every plan today' + (c.brief.audience ? ' — built for ' + c.brief.audience : '') + '. Start in the sandbox; ship to production with one header.']
    ]
  },

  social: {
    standard: 'Multi-channel launch pack',
    sections: (c) => [
      ['Short post (280 characters)',
        '> ' + c.product + ' ' + c.version + ': ' + (c.brief.emphasis || 'idempotent retries built in') + '. Timeouts happen — duplicate charges should not. One header, zero double-billing. Live today.'],
      ['LinkedIn post',
        '> Every payments team has the same 2 a.m. story: a network blip, a retry, a customer charged twice.\n>\n> Today we shipped ' + (c.brief.emphasis || 'built-in idempotent retries') + ' in ' + c.product + ' ' + c.version + '. Send one idempotency key per checkout and retries become safe — the API replays the original result instead of charging again.\n>\n> Live for all accounts today. Details in the changelog.'],
      ['Community / Slack announcement',
        '> :rocket: ' + c.product + ' ' + c.version + ' is out — ' + (c.brief.emphasis || 'idempotent retries') + ', faster refunds, and metadata search. Sandbox first if you want to poke at it; happy to answer questions in the thread.'],
      ['Usage notes',
        bullets([
          'Tone: ' + (c.brief.tone || 'plain and direct') + '.',
          'Audience: ' + (c.brief.audience || 'engineering and product teams') + '.',
          'Publish the LinkedIn variant after the changelog is live; link it in the first comment.'
        ])]
    ]
  },

  custlog: {
    standard: 'Keep a Changelog (customer edition)',
    sections: (c) => [
      ['' + c.date,
        '### New\n' + bullets([
          'Safe retries: checkout can now retry a failed network call without ever double-charging your customer.',
          'Find any payment by your own order number.'
        ]) +
        '\n\n### Improved\n' + bullets(['Refunds now reach customers up to three days sooner.']) +
        '\n\n### Fixed\n' + bullets(['Rate-limit responses now tell you exactly when to try again.'])],
      ['2026-05-18',
        '### Fixed\n' + bullets(['Test payments no longer show up in your production exports.'])],
      ['How we write these notes',
        'Plain language, customer impact first, grouped as New / Improved / Fixed — following the Keep a Changelog convention.']
    ]
  }
};

export function templateStandard(id) {
  return TEMPLATES[id] ? TEMPLATES[id].standard : null;
}

function skillSectionBody(name, sk) {
  let body = 'Drafted from repository analysis for "' + name + '".';
  if (sk.rules.length) body += ' Written to comply with ' + sk.rules.length + ' skill rule' + (sk.rules.length > 1 ? 's' : '') + '.';
  return body;
}

/* ---------------- Format renderers: Markdown → HTML / DocBook / EPUB ---------------- */
function escX(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineHtml(t) {
  return escX(t)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

// Converts the Markdown this engine itself produces (a known subset) to HTML.
export function mdToHtml(md) {
  const out = [];
  const lines = String(md).split('\n');
  let i = 0;
  const cells = (r) => r.split('|').slice(1, -1).map((c) => c.trim());
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith('```')) {
      const buf = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++; }
      i++;
      out.push('<pre><code>' + escX(buf.join('\n')) + '</code></pre>');
      continue;
    }
    if (/^\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push('<table><thead><tr>' + head.map((h) => '<th>' + inlineHtml(h) + '</th>').join('') + '</tr></thead><tbody>' +
        body.map((r) => '<tr>' + r.map((c) => '<td>' + inlineHtml(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    const hm = l.match(/^(#{1,6})\s+(.*)$/);
    if (hm) { out.push('<h' + hm[1].length + '>' + inlineHtml(hm[2]) + '</h' + hm[1].length + '>'); i++; continue; }
    if (/^>\s?/.test(l)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push('<blockquote><p>' + buf.map(inlineHtml).join('<br/>') + '</p></blockquote>');
      continue;
    }
    if (/^[-*]\s+/.test(l)) {
      const buf = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { buf.push(lines[i].replace(/^[-*]\s+/, '')); i++; }
      out.push('<ul>' + buf.map((x) => '<li>' + inlineHtml(x) + '</li>').join('') + '</ul>');
      continue;
    }
    if (/^\d+\.\s+/.test(l)) {
      const buf = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\d+\.\s+/, '')); i++; }
      out.push('<ol>' + buf.map((x) => '<li>' + inlineHtml(x) + '</li>').join('') + '</ol>');
      continue;
    }
    if (l.trim() === '') { i++; continue; }
    const buf = [l]; i++;
    while (i < lines.length && lines[i].trim() !== '' && !/^(#|\||>|[-*]\s|\d+\.\s|```)/.test(lines[i])) { buf.push(lines[i]); i++; }
    out.push('<p>' + inlineHtml(buf.join(' ')) + '</p>');
  }
  return out.join('\n');
}

const PAGE_CSS = [
  'body{font-family:"IBM Plex Sans",system-ui,sans-serif;color:#161616;max-width:760px;margin:0 auto;padding:48px 24px;line-height:1.55}',
  'h1{font-size:32px;font-weight:400}h2{font-size:22px;font-weight:600;margin-top:40px;border-bottom:1px solid #e0e0e0;padding-bottom:8px}',
  'code{font-family:"IBM Plex Mono",monospace;background:#f4f4f4;padding:1px 5px;font-size:.9em}',
  'pre{background:#161616;color:#f4f4f4;padding:16px;overflow-x:auto}pre code{background:none;color:inherit;padding:0}',
  'table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #e0e0e0;padding:8px 12px;text-align:left;font-size:14px}th{background:#f4f4f4}',
  'blockquote{border-left:3px solid #0f62fe;margin:16px 0;padding:8px 16px;background:#edf5ff}',
  'a{color:#0f62fe}'
].join('\n');

function inlineDocbook(t) {
  return escX(t)
    .replace(/\*\*([^*]+)\*\*/g, '<emphasis role="strong">$1</emphasis>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<link xlink:href="$2">$1</link>');
}

// Converts a section body (our Markdown subset) to DocBook 5 block content.
function mdToDocbook(md) {
  const out = [];
  const lines = String(md).split('\n');
  let i = 0;
  const cells = (r) => r.split('|').slice(1, -1).map((c) => c.trim());
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith('```')) {
      const buf = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++; }
      i++;
      out.push('<programlisting>' + escX(buf.join('\n')) + '</programlisting>');
      continue;
    }
    if (/^\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push('<informaltable><tgroup cols="' + head.length + '"><thead><row>' +
        head.map((h) => '<entry>' + inlineDocbook(h) + '</entry>').join('') + '</row></thead><tbody>' +
        body.map((r) => '<row>' + r.map((c) => '<entry>' + inlineDocbook(c) + '</entry>').join('') + '</row>').join('') +
        '</tbody></tgroup></informaltable>');
      continue;
    }
    if (/^[-*]\s+/.test(l)) {
      const buf = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { buf.push(lines[i].replace(/^[-*]\s+/, '')); i++; }
      out.push('<itemizedlist>' + buf.map((x) => '<listitem><para>' + inlineDocbook(x) + '</para></listitem>').join('') + '</itemizedlist>');
      continue;
    }
    if (/^\d+\.\s+/.test(l)) {
      const buf = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\d+\.\s+/, '')); i++; }
      out.push('<orderedlist>' + buf.map((x) => '<listitem><para>' + inlineDocbook(x) + '</para></listitem>').join('') + '</orderedlist>');
      continue;
    }
    if (/^>\s?/.test(l)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push('<note><para>' + inlineDocbook(buf.join(' ')) + '</para></note>');
      continue;
    }
    if (/^#{1,6}\s/.test(l)) { i++; continue; } // headings come from the section structure
    if (l.trim() === '') { i++; continue; }
    const buf = [l]; i++;
    while (i < lines.length && lines[i].trim() !== '' && !/^(#|\||>|[-*]\s|\d+\.\s|```)/.test(lines[i])) { buf.push(lines[i]); i++; }
    out.push('<para>' + inlineDocbook(buf.join(' ')) + '</para>');
  }
  return out.join('\n      ');
}

function firstPlainLine(md) {
  for (const raw of String(md).split('\n')) {
    const line = raw.replace(/[`*_>#|[\]]/g, '').trim();
    if (line && !/^-{3,}$/.test(line) && !/^\d+\.\s*$/.test(line)) return line.slice(0, 220);
  }
  return 'Drafted from source analysis.';
}

/* ---------------- Output options ---------------- */
// Everything a customer can configure about the rendered output.
export const DEFAULT_OUTPUT = {
  // Cover & identity
  coverPage: true, title: '', subtitle: '', company: '', trademark: '',
  author: '', version: '', docId: '', classification: 'none',
  showDate: true, dateFormat: 'iso',
  // Structure
  toc: true, tocDepth: 2, numberedHeadings: false,
  aboutSection: false, revisionHistory: false, glossary: false, includeExamples: true,
  // Page & branding (page setup applies to paginated formats)
  watermark: '', draftBanner: false, headerText: '', footerText: '',
  pageNumbers: true, paperSize: 'A4', accentColor: '#0f62fe',
  // Legal
  copyright: '', disclaimer: ''
};

function normOut(o) {
  return { ...DEFAULT_OUTPUT, ...(o && typeof o === 'object' ? o : {}) };
}

function fmtDate(oc) {
  const d = new Date();
  if (oc.dateFormat === 'long') {
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  return d.toISOString().slice(0, 10);
}

function stripExamples(body) {
  return String(body).replace(/```[\s\S]*?```/g, '*Example omitted by output settings.*');
}

/* ---------------- Document generation ---------------- */
export function generateDocument({ track, docTypes, format, repo, instructions, skill = '', skillName = '', brief = null, output = null }) {
  const id = docTypes[0];
  let title = docTypeName(track, id);
  const sk = parseSkill(skill);
  const c = {
    product: 'Payments API',
    version: '2.4.0',
    date: new Date().toISOString().slice(0, 10),
    repo,
    brief: brief || {}
  };
  const tpl = TEMPLATES[id];
  const oc = normOut(output);
  if (oc.title && oc.title.trim()) title = oc.title.trim();
  const org = [oc.company, oc.trademark].filter((x) => x && x.trim()).map((x) => x.trim()).join(' ');

  // Skill outline overrides the template outline; the standard is still noted.
  let sections;
  if (sk.sections.length) sections = sk.sections.map((s) => [s, skillSectionBody(s, sk)]);
  else if (tpl) sections = tpl.sections(c);
  else sections = [['Overview', 'Drafted from repository analysis.']];

  // ---- Apply output options to the outline ----
  if (!oc.includeExamples) sections = sections.map(([h, b]) => [h, stripExamples(b)]);
  if (oc.aboutSection) {
    sections = [['About this document',
      'Purpose: ' + title + ' for `' + repo + '`, structured to the "' + (tpl ? tpl.standard : 'DocGen default') + '" convention.' +
      (oc.classification !== 'none' ? ' Classification: **' + String(oc.classification).toUpperCase() + '**.' : '')], ...sections];
  }
  if (oc.revisionHistory) {
    sections = [...sections, ['Revision history',
      table(['Version', 'Date', 'Author', 'Change'], [
        [oc.version || c.version, fmtDate(oc), oc.author || 'DocGen', 'Generated from `' + repo + '`'],
        ['2.3.1', '2026-05-18', oc.author || 'DocGen', 'Fix release'],
        ['2.3.0', '2026-04-02', oc.author || 'DocGen', 'Initial publication']
      ])]];
  }
  if (oc.glossary) {
    sections = [...sections, ['Glossary',
      table(['Term', 'Definition'], [
        ['API key', 'Secret credential that authenticates every request'],
        ['Charge', 'A single attempt to collect payment from a source'],
        ['Idempotency key', 'Client-supplied key that makes retries safe'],
        ['Webhook', 'HTTPS callback the platform sends on events']
      ])]];
  }
  const anchors = sections.map(([h]) => slug(h));
  if (oc.numberedHeadings) sections = sections.map(([h, b], idx) => [(idx + 1) + '. ' + h, b]);

  // ---- Assemble ----
  const parts = [];
  if (oc.draftBanner) parts.push('> **DRAFT** — not for distribution', '');
  parts.push('# ' + title, '');
  if (oc.watermark && oc.watermark.trim()) {
    parts.push('> Watermark: **' + oc.watermark.trim().toUpperCase() + '** — applied to every page', '');
  }
  if (oc.coverPage) {
    if (oc.subtitle && oc.subtitle.trim()) parts.push('*' + oc.subtitle.trim() + '*', '');
    const rows = [];
    if (org) rows.push(['Organization', org]);
    if (oc.author && oc.author.trim()) rows.push(['Author', oc.author.trim()]);
    rows.push(['Version', (oc.version && oc.version.trim()) || c.version]);
    if (oc.docId && oc.docId.trim()) rows.push(['Document ID', '`' + oc.docId.trim() + '`']);
    if (oc.classification !== 'none') rows.push(['Classification', '**' + String(oc.classification).toUpperCase() + '**']);
    if (oc.showDate) rows.push(['Date', fmtDate(oc)]);
    parts.push(table(['Document', ' '], rows), '');
  }
  parts.push('> Standard: ' + (tpl ? tpl.standard : 'DocGen default') + ' · Source: `' + repo + '`' + (oc.showDate ? ' · ' + fmtDate(oc) : ''));
  parts.push('', 'The ' + c.product + ' lets you create, capture, and refund charges programmatically.');
  if (skillName) {
    parts.push('', '> Skill applied: ' + skillName +
      (sk.rules.length ? ' — ' + sk.rules.length + ' rule' + (sk.rules.length > 1 ? 's' : '') : '') +
      (sk.sections.length ? ' · custom outline (' + sk.sections.length + ' sections)' : ''));
  }
  const audience = sk.audience || c.brief.audience;
  const tone = sk.tone || c.brief.tone;
  if (audience) parts.push('', 'Audience: ' + audience + '.');
  if (tone) parts.push('Tone: ' + tone + '.');
  if (instructions && instructions.trim()) {
    parts.push('', '> Customization applied: ' + instructions.trim().slice(0, 140));
  }
  if (oc.toc) {
    parts.push('', '## Contents', '');
    sections.forEach(([h, body], idx) => {
      parts.push('- [' + h + '](#' + anchors[idx] + ')');
      if (Number(oc.tocDepth) >= 2) {
        for (const m of String(body).matchAll(/^###\s+(.+)$/gm)) parts.push('  - ' + m[1]);
      }
    });
  }
  for (const [h, body] of sections) {
    parts.push('', '## ' + h, '', body);
  }
  const tail = [];
  if (oc.disclaimer && oc.disclaimer.trim()) tail.push('', '---', '', '*' + oc.disclaimer.trim() + '*');
  const copyrightLine = (oc.copyright && oc.copyright.trim())
    ? oc.copyright.trim()
    : (org ? '© ' + new Date().getFullYear() + ' ' + org + '. All rights reserved.' : '');
  if (copyrightLine) tail.push('', (oc.disclaimer && oc.disclaimer.trim()) ? copyrightLine : '---\n\n' + copyrightLine);
  parts.push(...tail);
  const md = parts.join('\n');
  const pageCss = PAGE_CSS.replace(/#0f62fe/g, oc.accentColor || '#0f62fe');

  let content = md;
  if (format === 'dita') {
    const dita = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<topic id="' + slug(title) + '">',
      '  <title>' + title + '</title>',
      '  <shortdesc>Create, capture, and refund charges programmatically.</shortdesc>',
      '  <prolog><metadata>' +
        '<othermeta name="standard" content="' + (tpl ? tpl.standard : 'DocGen default') + '"/>' +
        '<othermeta name="version" content="' + escX((oc.version && oc.version.trim()) || c.version) + '"/>' +
        (org ? '<othermeta name="organization" content="' + escX(org) + '"/>' : '') +
        (oc.classification !== 'none' ? '<othermeta name="classification" content="' + escX(oc.classification) + '"/>' : '') +
        '</metadata></prolog>',
      '  <body>'
    ];
    for (const [h, body] of sections) {
      dita.push(
        '    <section id="' + slug(h) + '">',
        '      <title>' + h + '</title>',
        '      <p>' + firstPlainLine(body) + '</p>',
        '    </section>'
      );
    }
    dita.push('  </body>', '</topic>');
    content = dita.join('\n');
  } else if (format === 'html') {
    // Standalone Web Help page — semantic HTML5, self-contained styling,
    // honoring branding, watermark, header, and footer output options.
    const wmCss = '.wm{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0}' +
      '.wm span{transform:rotate(-30deg);font-size:96px;color:rgba(22,22,22,.06);font-weight:600;letter-spacing:8px;white-space:nowrap}' +
      'main{position:relative;z-index:1}' +
      '.pagehead{border-bottom:1px solid #e0e0e0;padding:12px 0;font-size:12px;color:#525252;letter-spacing:.32px}' +
      '.pagefoot{border-top:1px solid #e0e0e0;margin-top:48px;padding:16px 0;font-size:12px;color:#525252}';
    content = [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8"/>',
      '<meta name="viewport" content="width=device-width, initial-scale=1"/>',
      '<meta name="generator" content="DocGen"/>',
      '<meta name="doc-standard" content="' + escX(tpl ? tpl.standard : 'DocGen default') + '"/>',
      (oc.classification !== 'none' ? '<meta name="classification" content="' + escX(oc.classification) + '"/>' : ''),
      '<title>' + escX(title) + '</title>',
      '<style>', pageCss, wmCss, '</style>',
      '</head>',
      '<body>',
      (oc.watermark && oc.watermark.trim() ? '<div class="wm"><span>' + escX(oc.watermark.trim().toUpperCase()) + '</span></div>' : ''),
      (oc.headerText && oc.headerText.trim() ? '<div class="pagehead">' + escX(oc.headerText.trim()) + '</div>' : ''),
      '<main>',
      mdToHtml(md),
      '</main>',
      (oc.footerText || org ? '<div class="pagefoot">' + escX([oc.footerText, org].filter(Boolean).join(' · ')) + '</div>' : ''),
      '</body>',
      '</html>'
    ].filter(Boolean).join('\n');
  } else if (format === 'epub') {
    // EPUB3 content document (XHTML) — drop into any EPUB packager.
    content = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE html>',
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">',
      '<head>',
      '<title>' + escX(title) + '</title>',
      '<style>', pageCss, '</style>',
      '</head>',
      '<body>',
      '<section epub:type="chapter">',
      mdToHtml(md),
      '</section>',
      '</body>',
      '</html>'
    ].join('\n');
  } else if (format === 'docbook') {
    // DocBook 5.0 article.
    const db = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<article xmlns="http://docbook.org/ns/docbook" xmlns:xlink="http://www.w3.org/1999/xlink" version="5.0">',
      '  <info>',
      '    <title>' + escX(title) + '</title>',
      '    <subtitle>Standard: ' + escX(tpl ? tpl.standard : 'DocGen default') + ' · Source: ' + escX(repo) + '</subtitle>',
      '  </info>'
    ];
    for (const [h, body] of sections) {
      db.push(
        '  <section xml:id="' + slug(h) + '">',
        '    <title>' + escX(h) + '</title>',
        '      ' + mdToDocbook(body),
        '  </section>'
      );
    }
    db.push('</article>');
    content = db.join('\n');
  } else if (format === 'htmlsnip') {
    // Self-contained landing-page section, safe to paste into any CMS.
    content = [
      '<!-- DocGen landing snippet · ' + escX(title) + ' -->',
      '<section style="font-family:\'IBM Plex Sans\',system-ui,sans-serif;color:#161616;max-width:720px;margin:0 auto;padding:32px 16px;line-height:1.55">',
      mdToHtml(md).replace(/<h1>/g, '<h1 style="font-size:30px;font-weight:400">').replace(/<h2>/g, '<h2 style="font-size:20px;font-weight:600;margin-top:32px">'),
      '</section>'
    ].join('\n');
  } else if (format === 'email') {
    // Email-safe HTML: single column, inline styles, 600px, no external CSS.
    const inner = mdToHtml(md)
      .replace(/<h1>/g, '<h1 style="font-size:26px;font-weight:400;margin:0 0 16px">')
      .replace(/<h2>/g, '<h2 style="font-size:18px;font-weight:600;margin:28px 0 8px">')
      .replace(/<p>/g, '<p style="margin:0 0 14px;line-height:1.55">')
      .replace(/<blockquote>/g, '<blockquote style="border-left:3px solid #0f62fe;margin:0 0 14px;padding:8px 16px;background:#edf5ff">');
    content = [
      '<!DOCTYPE html>',
      '<html><head><meta charset="utf-8"/><title>' + escX(title) + '</title></head>',
      '<body style="margin:0;padding:0;background:#f4f4f4">',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 8px">',
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;max-width:600px;width:100%"><tr><td style="padding:32px;font-family:Arial,Helvetica,sans-serif;color:#161616;font-size:15px">',
      inner,
      '</td></tr></table>',
      '</td></tr></table>',
      '</body></html>'
    ].join('\n');
  } else if (format === 'pdf' || format === 'word') {
    const setup = [
      'Page setup: ' + oc.paperSize,
      'page numbers ' + (oc.pageNumbers ? 'on' : 'off'),
      oc.headerText && oc.headerText.trim() ? 'header: "' + oc.headerText.trim() + '"' : '',
      oc.footerText && oc.footerText.trim() ? 'footer: "' + oc.footerText.trim() + '"' : '',
      oc.watermark && oc.watermark.trim() ? 'watermark: ' + oc.watermark.trim().toUpperCase() : ''
    ].filter(Boolean).join(' · ');
    content = '[' + format.toUpperCase() + ' EXPORT — rendered by the format adapter in production]\n[' + setup + ']\n\n' + md;
  }
  return { title, content };
}

/* ---------------- LLM-as-judge ---------------- */
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
