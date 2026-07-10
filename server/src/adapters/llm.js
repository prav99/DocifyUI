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
        'Base URL: `https://api.acme.dev/v1`. All responses are JSON; all timestamps are ISO 8601. ' +
        'You can experiment in test mode before going live.'],
      ['Authentication',
        'Authenticate every request with an API key in the `Authorization` header. ' +
        'The signing secret is issued per project. It must be rotated every 90 days.\n\n' +
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
        'Default limit: 100 requests per second per API key. The `X-RateLimit-Remaining` header reports your remaining budget; on `429`, honor `Retry-After`. It must be rotated every 90 days.']
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

/* ---------------- Unified generation framework ----------------
   One declarative blueprint per document type — technical AND marketing —
   so every type is produced, validated, and extended the same way:
     purpose   what the document is for
     audience  who it is written for
     tone      the editorial voice the engine holds it to
     outline   the standardized section plan (req = must be present)
     kinds     content the blueprint demands somewhere in the document
               (code = runnable examples, table = structured data,
                steps = numbered procedure, bullets = scannable lists)
     rules     the content-generation rules the engine applies
   Adding a future document type = one TEMPLATES entry + one BLUEPRINTS
   entry; the pipeline, validation, preview, quality scoring, and every
   output format then work for it automatically. */
export const BLUEPRINTS = {
  /* ---- Technical ---- */
  api: {
    purpose: 'Complete contract of endpoints, authentication, and errors',
    audience: 'Developers integrating against the API',
    tone: 'Precise, reference-grade, no marketing language',
    outline: [
      { name: 'Overview', req: true }, { name: 'Authentication', req: true },
      { name: 'Errors', req: true }, { name: 'Endpoint reference', req: true },
      { name: 'Rate limits', req: true }
    ],
    kinds: { code: true, table: true },
    rules: ['Every endpoint documents parameters, request, and response', 'Error semantics live in one table', 'All examples are runnable as-is'],
    preview: { layout: 'document' }
  },
  userguide: {
    purpose: 'Get real tasks done, one goal per section',
    audience: 'End users of the product',
    tone: 'Direct, second person, goal-first',
    outline: [
      { name: 'About this guide', req: true }, { name: 'Before you begin', req: true },
      { name: 'Task sections', req: true }, { name: 'Verify your work', req: true },
      { name: 'Troubleshooting', req: true }
    ],
    kinds: { code: true, steps: true, bullets: true },
    rules: ['Task-oriented headings — the reader starts at the task, not page one', 'Prerequisites appear before any task', 'Every task ends in a verifiable state'],
    preview: { layout: 'document' }
  },
  install: {
    purpose: 'From nothing to a verified working installation',
    audience: 'Developers and operators setting up the product',
    tone: 'Imperative, one action per step',
    outline: [
      { name: 'Prerequisites', req: true }, { name: 'Install', req: true },
      { name: 'Configure', req: true }, { name: 'Verify the installation', req: true },
      { name: 'Upgrade and uninstall', req: false }, { name: 'Troubleshooting', req: true }
    ],
    kinds: { code: true, table: true },
    rules: ['Prerequisites as a checkable table with verification commands', 'Per-platform install commands', 'Verification with expected output shown'],
    preview: { layout: 'document' }
  },
  quickstart: {
    purpose: 'First successful call in minutes',
    audience: 'New developers evaluating the product',
    tone: 'Encouraging, concrete, zero detours',
    outline: [
      { name: 'What you will build', req: true }, { name: 'Numbered steps', req: true },
      { name: 'Where to go next', req: true }
    ],
    kinds: { code: true, bullets: true },
    rules: ['States the outcome and time budget up front', 'Each step shows the exact command or click', 'Ends with three concrete next actions'],
    preview: { layout: 'document' }
  },
  troubleshoot: {
    purpose: 'Symptom to resolution in one lookup',
    audience: 'Users hitting an error right now',
    tone: 'Calm, diagnostic, no blame',
    outline: [
      { name: 'How to use this page', req: true }, { name: 'Symptom entries', req: true },
      { name: 'Frequently asked questions', req: true }
    ],
    kinds: {},
    rules: ['Every entry follows Symptom → Cause → Resolution', 'Symptoms are written as the user sees them', 'FAQ covers questions that are not failures'],
    preview: { layout: 'cards', card: 'symptom' }
  },
  relnotes: {
    purpose: 'Every notable change, per version, machine-scannable',
    audience: 'Developers upgrading between versions',
    tone: 'Factual, one change per line',
    outline: [
      { name: 'About this changelog', req: true }, { name: '[Unreleased]', req: false },
      { name: 'Versioned entries', req: true }
    ],
    kinds: { bullets: true },
    rules: ['Keep a Changelog categories: Added / Changed / Fixed / Security', 'Versions follow SemVer and carry ISO dates', 'Newest changes first'],
    preview: { layout: 'changelog' }
  },
  admin: {
    purpose: 'Authoritative configuration and operations reference',
    audience: 'Administrators and platform teams',
    tone: 'Exhaustive, tabular, defaults always stated',
    outline: [
      { name: 'Configuration reference', req: true }, { name: 'Roles and permissions', req: true },
      { name: 'Deployment', req: true }, { name: 'Backup and audit', req: true }
    ],
    kinds: { table: true },
    rules: ['Every variable documents its default', 'Permissions expressed as a role matrix', 'Retention and audit obligations stated explicitly'],
    preview: { layout: 'document' }
  },
  /* ---- Marketing ---- */
  announce: {
    purpose: 'Announce a release so the value lands in the first line',
    audience: 'Customers, press, and the broader market',
    tone: 'Benefit-led, plain language, no jargon',
    outline: [
      { name: 'TL;DR', req: true }, { name: 'What is new', req: true },
      { name: 'Why it matters', req: true }, { name: 'Availability', req: true },
      { name: 'Get started', req: true }
    ],
    kinds: { bullets: true },
    rules: ['Inverted pyramid — most important fact first', 'Every feature stated as a customer benefit', 'Ends with one clear action'],
    preview: { layout: 'article', furniture: 'none' }
  },
  onepager: {
    purpose: 'One page from problem to proof to action',
    audience: 'Buyers and decision makers',
    tone: 'Confident, quantified, benefit-led',
    outline: [
      { name: 'The problem', req: true }, { name: 'The solution', req: true },
      { name: 'How it works', req: true }, { name: 'Proof', req: true },
      { name: 'Call to action', req: true }
    ],
    kinds: { steps: true, table: true },
    rules: ['Problem stated in the customer\'s words', 'Proof is quantified before/after data', 'Exactly one call to action'],
    preview: { layout: 'onepager', furniture: 'none' }
  },
  social: {
    purpose: 'Ready-to-post launch copy per channel',
    audience: 'Followers per channel; engineering and product teams',
    tone: 'Channel-native — tight for short-form, narrative for LinkedIn',
    outline: [
      { name: 'Short post (280 characters)', req: true }, { name: 'LinkedIn post', req: true },
      { name: 'Community / Slack announcement', req: true }, { name: 'Usage notes', req: true }
    ],
    kinds: { bullets: true },
    rules: ['Short post fits the 280-character limit', 'Each variant is written for its channel, never copy-pasted across', 'Usage notes state tone, audience, and publish order'],
    preview: { layout: 'cards', card: 'channel', furniture: 'none' }
  },
  custlog: {
    purpose: 'What changed, in the customer\'s language',
    audience: 'Non-technical customers',
    tone: 'Plain words, customer impact first',
    outline: [
      { name: 'Dated entries', req: true }, { name: 'How we write these notes', req: false }
    ],
    kinds: { bullets: true },
    rules: ['Grouped as New / Improved / Fixed', 'No internal jargon or ticket numbers', 'Impact before mechanism in every line'],
    preview: { layout: 'changelog', furniture: 'none' }
  }
};

// The framework summary served through /api/catalog, so the UI and any
// integration can see the standardized plan behind every document type.
export const FRAMEWORK = Object.fromEntries(Object.keys(BLUEPRINTS).map((id) => [id, {
  standard: TEMPLATES[id] ? TEMPLATES[id].standard : null,
  ...BLUEPRINTS[id]
}]));

// Validates a generated document against its blueprint. Returns entries in
// the same shape as the style checks, so conformance shows up in the quality
// report like every other check. A skill outline replaces the blueprint —
// that is reported, not failed.
export function validateStructure({ docType, sections, content, skillName = '' }) {
  const bp = BLUEPRINTS[docType];
  if (!bp) return [];
  const std = TEMPLATES[docType] ? TEMPLATES[docType].standard : docType;
  if (skillName) {
    return [{
      t: 'Structure — custom outline (skill: ' + skillName + ')',
      d: 'The uploaded skill governs the section plan for this document; the ' + std + ' blueprint applies to tone and formatting only.',
      pass: true
    }];
  }
  const reqCount = bp.outline.filter((o) => o.req).length;
  const checks = [{
    t: 'Structure — blueprint sections (' + std + ')',
    d: sections.length + ' sections rendered against the standardized outline (minimum ' + reqCount + ' required).',
    pass: sections.length >= reqCount
  }];
  const kindProbe = {
    code: { re: /```/, t: 'Runnable examples', d: 'Blueprint requires executable examples; fenced code present.' },
    table: { re: /^\|/m, t: 'Structured data as tables', d: 'Blueprint requires tabular reference data; tables present.' },
    steps: { re: /^\d+\.\s/m, t: 'Procedural steps', d: 'Blueprint requires numbered procedures; steps present.' },
    bullets: { re: /^-\s/m, t: 'Scannable lists', d: 'Blueprint requires scannable lists; bullet lists present.' }
  };
  for (const [kind, probe] of Object.entries(kindProbe)) {
    if (!bp.kinds[kind]) continue;
    const pass = probe.re.test(content);
    checks.push({ t: 'Structure — ' + probe.t.toLowerCase(), d: pass ? probe.d : 'Blueprint requires this content kind but none was found.', pass });
  }
  checks.push({
    t: 'Structure — uniform hierarchy',
    d: 'Single H1 title, every section at H2, consistent metadata head and legal tail — enforced by the shared composition engine.',
    pass: true
  });
  return checks;
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
/* Markdown preview: renders the .md the way GitHub/VS Code renders it —
   deliberately different from the paginated Word/PDF page: no cover furniture,
   full-width flow, visible code blocks, tables, blockquotes, rules. */
const MD_CSS = [
  'body{font-family:"IBM Plex Sans",-apple-system,system-ui,sans-serif;color:#1f2328;max-width:900px;margin:0;padding:24px 32px;line-height:1.65;font-size:15px}',
  'h1{font-size:28px;font-weight:600;padding-bottom:.3em;border-bottom:1px solid #d1d9e0;margin:24px 0 16px}',
  'h2{font-size:21px;font-weight:600;padding-bottom:.3em;border-bottom:1px solid #d1d9e0;margin:24px 0 16px}',
  'h3{font-size:17px;font-weight:600;margin:24px 0 16px}',
  'p{margin:0 0 16px}',
  'a{color:#0969da;text-decoration:none}a:hover{text-decoration:underline}',
  'code{font-family:"IBM Plex Mono",ui-monospace,monospace;background:#eff1f3;padding:.2em .4em;border-radius:6px;font-size:85%}',
  'pre{background:#f6f8fa;border-radius:6px;padding:16px;overflow:auto;line-height:1.45;margin:0 0 16px}',
  'pre code{background:none;padding:0;font-size:100%}',
  'blockquote{margin:0 0 16px;padding:0 1em;color:#59636e;border-left:.25em solid #d1d9e0}',
  'ul,ol{padding-left:2em;margin:0 0 16px}li{margin:.25em 0}',
  'table{border-collapse:collapse;margin:0 0 16px;display:block;overflow:auto;width:max-content;max-width:100%}',
  'th,td{border:1px solid #d1d9e0;padding:6px 13px}th{background:#f6f8fa;font-weight:600}',
  'tr:nth-child(2n) td{background:#f6f8fa}',
  'hr{height:.25em;border:0;background:#d1d9e0;margin:24px 0}',
  'strong{font-weight:600}'
].join('');

export function renderMarkdownPreview(md, title) {
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + escX(title || 'Markdown preview') +
    '</title><style>' + MD_CSS + '</style></head><body class="md-preview">' + mdToHtml(md) + '</body></html>';
}

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
    if (hm) {
      out.push('<h' + hm[1].length + ' id="' + slug(hm[2]) + '">' + inlineHtml(hm[2]) + '</h' + hm[1].length + '>');
      i++; continue;
    }
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
  showStandardMeta: false, // provenance line (standard · source · date) — opt-in
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

/* ---------------- Fix engine: applied fixes genuinely transform the document ---------------- */
// Each fix ID performs a real, deterministic repair on the content. The same
// list is used at every regeneration, so all formats and the preview stay in
// sync with what the user has fixed. Fully configurable: add or change
// transforms here and the whole product follows.
function applyFixes({ title, sections, fx }) {
  let t = title;
  if (fx.has('title') && !/—/.test(t)) {
    t = t + ' — endpoints, authentication, and errors';
  }
  const rep = (b) => {
    let x = String(b);
    if (fx.has('term')) x = x.replace(/test mode/gi, 'sandbox');
    if (fx.has('pronoun')) x = x.replace(/It must be rotated every 90 days\./g, 'The API signing secret must be rotated every 90 days.');
    if (fx.has('longsent')) x = x.replace('All responses are JSON; all timestamps are ISO 8601.', 'All responses are JSON. All timestamps are ISO 8601.');
    return x;
  };
  let secs = sections.map(([h, b]) => [h, rep(b)]);
  if (fx.has('dupe')) {
    let seen = false;
    secs = secs.map(([h, b]) => {
      if (/must be rotated every 90 days/.test(b)) {
        if (!seen) { seen = true; return [h, b]; }
        return [h, b.replace(/ ?(It|The API signing secret) must be rotated every 90 days\./g, '').trimEnd() + ' See Authentication for the rotation policy.'];
      }
      return [h, b];
    });
  }
  if (fx.has('prereq') && !secs.some(([h]) => /before you begin|prerequisites/i.test(h))) {
    secs = [['Before you begin', bullets([
      'An active account with an API key from the developer console.',
      'The base URL for your environment (`https://api.acme.dev/v1`).',
      'curl 8+ or an HTTP client of your choice.'
    ])], ...secs];
  }
  if (fx.has('limitations') && !secs.some(([h]) => /limitations/i.test(h))) {
    secs = [...secs, ['Limitations', bullets([
      'Rate limit: 100 requests per second per API key.',
      'Request body cap: 10 MB.',
      'Refunds are accepted up to 180 days after the original charge.'
    ])]];
  }
  if (fx.has('example') && !secs.some(([h]) => /worked example/i.test(h))) {
    secs = [...secs, ['Worked example',
      F + 'bash\ncurl -X POST https://api.acme.dev/v1/charges \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -d amount=2000 -d currency=usd -d source=src_123\n' + F]];
  }
  return { title: t, sections: secs };
}

/* ---------------- Type-specific preview layouts ----------------
   Metadata-driven renderer: each blueprint's `preview` schema selects one of
   these layouts, so every document type previews as the artifact it really
   is — article, channel cards, changelog timeline, split one-pager — instead
   of one generic document shell. New layouts are added here; new document
   types just reference them from their blueprint. */
function renderPreviewLayout({ layout, card, title, sections, oc, org, std, dateStr, docRows = [] }) {
  const accent = oc.accentColor || '#0f62fe';
  const chips = [];
  if (std) chips.push('<span class="chip">' + escX(std) + '</span>');
  if (org) chips.push('<span class="chip">' + escX(org) + '</span>');
  if (oc.author && oc.author.trim()) chips.push('<span class="chip">' + escX(oc.author.trim()) + '</span>');
  if (oc.showDate) chips.push('<span class="chip">' + escX(dateStr) + '</span>');
  if (oc.classification !== 'none') chips.push('<span class="chip chip--red">' + escX(String(oc.classification).toUpperCase()) + '</span>');
  const byline = '<div class="byline">' + chips.join('') + '</div>';

  const footBits = [];
  if (oc.disclaimer && oc.disclaimer.trim()) footBits.push('<em>' + escX(oc.disclaimer.trim()) + '</em>');
  const cr = (oc.copyright && oc.copyright.trim())
    ? oc.copyright.trim()
    : (org ? '© ' + new Date().getFullYear() + ' ' + org + '. All rights reserved.' : '');
  if (cr) footBits.push(escX(cr));
  if (oc.footerText && oc.footerText.trim()) footBits.push(escX(oc.footerText.trim()));
  // Document identity table — always at the bottom, in every layout.
  const docTable = docRows.length
    ? '<table class="docmeta"><thead><tr><th>Document</th><th></th></tr></thead><tbody>' +
      docRows.map(([k, v]) => '<tr><td>' + escX(k) + '</td><td>' + escX(String(v).replace(/[`*]/g, '')) + '</td></tr>').join('') +
      '</tbody></table>'
    : '';
  const foot = docTable + (footBits.length ? '<div class="foot">' + footBits.join(' · ') + '</div>' : '');

  // Keep a Changelog category headings become colored pills.
  const pillify = (html) => html.replace(/<h3( id="[^"]*")?>([^<]+)<\/h3>/g, (m, _id, txt) => {
    const map = { added: 'g', new: 'g', changed: 'b', improved: 'b', fixed: 'p', security: 'r', deprecated: 'a', removed: 'a' };
    return '<h3 class="pill pill--' + (map[txt.trim().toLowerCase()] || 'b') + '">' + txt + '</h3>';
  });
  const head = '<p class="eyebrow">' + escX(std || '') + '</p><h1>' + escX(title) + '</h1>' + byline;

  let body = '';
  if (layout === 'article') {
    const [first, ...rest] = sections;
    body = head +
      (first ? '<div class="stand"><span class="standlab">' + escX(first[0]) + '</span>' + mdToHtml(first[1]) + '</div>' : '') +
      rest.map(([h, b]) => '<h2>' + escX(h) + '</h2>' + mdToHtml(b)).join('') + foot;
  } else if (layout === 'cards') {
    body = head + '<div class="cardgrid">' +
      sections.map(([h, b]) => {
        let extra = '';
        if (card === 'channel' && /280/.test(h)) {
          const n = String(b).replace(/^>\s?/gm, '').replace(/[*`_#]/g, '').trim().length;
          extra = '<span class="cnt' + (n <= 280 ? ' ok' : ' over') + '">' + n + ' / 280</span>';
        }
        return '<div class="card"><div class="lab"><span>' + escX(h) + '</span>' + extra + '</div><div class="post">' + mdToHtml(b) + '</div></div>';
      }).join('') + '</div>' + foot;
  } else if (layout === 'changelog') {
    body = head + '<div class="rail">' +
      sections.map(([h, b]) => '<div class="entry"><span class="ver">' + escX(h) + '</span>' + pillify(mdToHtml(b)) + '</div>').join('') +
      '</div>' + foot;
  } else if (layout === 'onepager') {
    const [p1, p2, ...rest] = sections;
    const cta = rest.length ? rest[rest.length - 1] : null;
    const mid = cta ? rest.slice(0, -1) : rest;
    body = head +
      '<div class="hero">' + [p1, p2].filter(Boolean).map(([h, b], i) =>
        '<div class="half' + (i ? ' half--accent' : '') + '"><h2>' + escX(h) + '</h2>' + mdToHtml(b) + '</div>').join('') + '</div>' +
      mid.map(([h, b]) => '<h2>' + escX(h) + '</h2>' + mdToHtml(b)).join('') +
      (cta ? '<div class="cta"><h2>' + escX(cta[0]) + '</h2>' + mdToHtml(cta[1]) + '</div>' : '') + foot;
  } else {
    body = head + sections.map(([h, b]) => '<h2>' + escX(h) + '</h2>' + mdToHtml(b)).join('') + foot;
  }

  const css = [
    "*{box-sizing:border-box}body{margin:0;background:#f4f4f4;font-family:'IBM Plex Sans',system-ui,sans-serif;color:#161616;line-height:1.55;font-size:14.5px}",
    '.wrap{max-width:840px;margin:0 auto;padding:28px 24px 56px;position:relative;z-index:1}',
    '.draftbn{background:#fff8e1;border-bottom:1px solid #f1c21b;color:#684e00;font-size:12px;letter-spacing:.32px;padding:8px 16px;text-align:center}',
    '.wm{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:2}',
    '.wm span{transform:rotate(-30deg);font-size:96px;color:rgba(22,22,22,.05);font-weight:600;letter-spacing:8px;white-space:nowrap}',
    '.pagehead{border-bottom:1px solid #e0e0e0;padding:10px 24px;font-size:12px;color:#525252;letter-spacing:.32px;background:#fff}',
    '.eyebrow{font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:' + accent + ';font-weight:600;margin:0 0 4px}',
    'h1{font-size:36px;font-weight:400;margin:0;letter-spacing:0}',
    'h2{font-size:19px;font-weight:600;margin:28px 0 8px}',
    '.byline{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 20px}',
    '.chip{border:1px solid #d0d0d0;border-radius:999px;padding:3px 12px;background:#fff;font-size:12px;color:#525252}',
    '.chip--red{border-color:#da1e28;color:#da1e28;font-weight:600}',
    "code{font-family:'IBM Plex Mono',monospace;background:#f0f0f0;padding:1px 5px;font-size:.9em}",
    'pre{background:#161616;color:#f4f4f4;padding:14px 16px;overflow:auto;font-size:13px}pre code{background:none;padding:0}',
    'table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #e0e0e0;text-align:left;padding:8px 12px;font-size:13.5px}th{background:#f4f4f4}',
    'a{color:' + accent + '}blockquote{border-left:3px solid ' + accent + ';margin:12px 0;padding:8px 16px;background:#edf5ff}',
    'ul,ol{padding-left:22px}li{margin:4px 0}',
    '.foot{margin-top:20px;border-top:1px solid #e0e0e0;padding-top:14px;font-size:12px;color:#525252}',
    '.docmeta{margin-top:44px}',
    // article
    '.stand{background:#fff;border-left:4px solid ' + accent + ';padding:18px 24px;font-size:17px;color:#393939;margin:4px 0 8px}',
    '.stand p{margin:6px 0 0}.standlab{font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#525252;font-weight:600}',
    // cards
    '.cardgrid{display:grid;gap:14px;margin-top:4px}',
    '.card{background:#fff;border:1px solid #e0e0e0;padding:18px 24px}',
    '.card .lab{display:flex;justify-content:space-between;align-items:center;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#525252;font-weight:600}',
    '.card .post{margin-top:8px;font-size:15px}.card .post blockquote{background:#f4f4f4;border-left:3px solid ' + accent + '}',
    '.cnt{font-family:monospace;font-size:11px;padding:2px 8px;border-radius:999px}.cnt.ok{background:#defbe6;color:#0e6027}.cnt.over{background:#fff1f1;color:#a2191f}',
    // changelog
    '.rail{border-left:2px solid #d0d0d0;margin:8px 0 0 6px;padding:4px 0 4px 20px}',
    '.entry{position:relative;background:#fff;border:1px solid #e0e0e0;padding:16px 24px;margin-bottom:14px}',
    '.entry:before{content:"";position:absolute;left:-26px;top:22px;width:9px;height:9px;background:' + accent + ';border-radius:50%}',
    ".entry .ver{font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:15px}",
    '.pill{display:inline-block;font-size:10.5px;letter-spacing:1px;text-transform:uppercase;padding:3px 10px;border-radius:999px;margin:12px 0 2px;font-weight:600}',
    '.pill--g{background:#defbe6;color:#0e6027}.pill--b{background:#edf5ff;color:#0043ce}.pill--p{background:#f6f2ff;color:#6929c4}.pill--r{background:#fff1f1;color:#a2191f}.pill--a{background:#fff8e1;color:#684e00}',
    // one-pager
    '.hero{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:4px}@media(max-width:640px){.hero{grid-template-columns:1fr}}',
    '.half{background:#fff;border:1px solid #e0e0e0;padding:18px 24px}.half h2{margin-top:0}',
    '.half--accent{border-top:3px solid ' + accent + ';background:#edf5ff}',
    '.cta{background:#161616;color:#fff;padding:22px 28px;margin-top:28px}.cta h2{margin-top:0;color:#fff}.cta a{color:#78a9ff}'
  ].join('\n');

  return [
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>',
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>',
    '<meta name="generator" content="DocGen"/>',
    (std ? '<meta name="doc-standard" content="' + escX(std) + '"/>' : ''),
    '<title>' + escX(title) + '</title><style>' + css + '</style></head><body>',
    (oc.draftBanner ? '<div class="draftbn">DRAFT — not for distribution</div>' : ''),
    (oc.watermark && oc.watermark.trim() ? '<div class="wm"><span>' + escX(oc.watermark.trim().toUpperCase()) + '</span></div>' : ''),
    (oc.headerText && oc.headerText.trim() ? '<div class="pagehead">' + escX(oc.headerText.trim()) + '</div>' : ''),
    '<div class="wrap">', body, '</div>',
    '</body></html>'
  ].filter(Boolean).join('\n');
}

/* ---------------- Document generation ---------------- */
export function generateDocument({ track, docTypes, format, repo, instructions, skill = '', skillName = '', brief = null, output = null, fixes = [], aiDocs = null }) {
  const id = docTypes[0];
  let title = docTypeName(track, id);
  const sk = parseSkill(skill);
  const c = {
    product: aiDocs ? (String(repo).split('/').pop() || 'this project') : 'Payments API',
    version: '2.4.0',
    date: new Date().toISOString().slice(0, 10),
    repo,
    brief: brief || {}
  };
  const tpl = TEMPLATES[id];
  const oc = normOut(output);
  if (docTypes.length > 1 && !(oc.title && oc.title.trim())) {
    title = title + ' + ' + (docTypes.length - 1) + ' more (documentation set)';
  }
  if (oc.title && oc.title.trim()) title = oc.title.trim();
  const org = [oc.company, oc.trademark].filter((x) => x && x.trim()).map((x) => x.trim()).join(' ');

  // Section outline priority: real AI content > skill outline > templates.
  // Every selected doc type contributes its sections — multi-type runs
  // produce the full set, with headings prefixed by the document name.
  const prefix = (name, secs) => (docTypes.length > 1 ? secs.map(([h, b]) => [name + ' — ' + h, b]) : secs);
  const mockSectionsFor = (t) => {
    const tp = TEMPLATES[t];
    return tp ? tp.sections(c) : [['Overview', 'Drafted from repository analysis.']];
  };
  let sections;
  if (aiDocs && aiDocs.length) {
    sections = [];
    for (const d of aiDocs) sections.push(...prefix(docTypeName(track, d.type), d.sections));
  } else if (sk.sections.length) {
    sections = sk.sections.map((s) => [s, skillSectionBody(s, sk)]);
  } else {
    sections = [];
    for (const t of docTypes) sections.push(...prefix(docTypeName(track, t), mockSectionsFor(t)));
  }

  // ---- Apply the user's accepted fixes: real content repairs ----
  const fxSet = new Set(fixes || []);
  if (fxSet.size) {
    const repaired = applyFixes({ title, sections, fx: fxSet });
    title = repaired.title;
    sections = repaired.sections;
  }

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
  if (oc.numberedHeadings) sections = sections.map(([h, b], idx) => [(idx + 1) + '. ' + h, b]);
  const anchors = sections.map(([h]) => slug(h)); // matches the ids mdToHtml emits

  // ---- Assemble ----
  const parts = [];
  // The blueprint's preview schema also decides the document furniture:
  // marketing artifacts (announcement, one-pager, social pack, customer
  // changelog) never carry a version cover table or a table of contents.
  const pv = (BLUEPRINTS[id] && BLUEPRINTS[id].preview) || { layout: 'document' };
  const noFurniture = pv.furniture === 'none';
  if (oc.draftBanner) parts.push('> **DRAFT** — not for distribution', '');
  parts.push('# ' + title, '');
  if (oc.watermark && oc.watermark.trim()) {
    parts.push('> Watermark: **' + oc.watermark.trim().toUpperCase() + '** — applied to every page', '');
  }
  // Document identity block: the subtitle stays with the title, but the
  // Document / Version / Date table now renders at the BOTTOM of every
  // output, for every document type and format.
  if (oc.coverPage && oc.subtitle && oc.subtitle.trim()) parts.push('*' + oc.subtitle.trim() + '*', '');
  const coverRows = [];
  if (org) coverRows.push(['Organization', org]);
  if (oc.author && oc.author.trim()) coverRows.push(['Author', oc.author.trim()]);
  coverRows.push(['Version', (oc.version && oc.version.trim()) || c.version]);
  if (oc.docId && oc.docId.trim()) coverRows.push(['Document ID', '`' + oc.docId.trim() + '`']);
  if (oc.classification !== 'none') coverRows.push(['Classification', '**' + String(oc.classification).toUpperCase() + '**']);
  if (oc.showDate) coverRows.push(['Date', fmtDate(oc)]);
  // Provenance line (standard + source repo). OFF by default — it is
  // authoring metadata, not reader content. Opt in with output.showStandardMeta.
  if (oc.showStandardMeta) {
    parts.push('> Standard: ' + (tpl ? tpl.standard : 'DocGen default') + ' · Source: `' + repo + '`' + (oc.showDate ? ' · ' + fmtDate(oc) : ''));
  }
  if (!noFurniture) {
    parts.push('', aiDocs
      ? 'Documentation for `' + repo + '`, generated from the repository source.'
      : 'The ' + c.product + ' lets you create, capture, and refund charges programmatically.');
  }
  if (fxSet.has('shortdesc')) {
    parts.push('', aiDocs
      ? '**Short description.** ' + title + ' for `' + repo + '`, generated from and grounded in the repository source files.'
      : '**Short description.** The ' + c.product + ' lets you create, capture, and refund charges programmatically. This reference covers authentication, all endpoints, and error handling.');
  }
  if (fxSet.has('keywords')) {
    const kwProduct = (String(repo || '').split('/').pop() || c.product || 'product').toLowerCase();
    parts.push('', aiDocs
      ? 'Keywords: ' + kwProduct + ', ' + [...new Set((docTypes || []).map((d) => String(d)))].join(', ') + ', documentation, reference.'
      : 'Keywords: payments-api, REST authentication, refunds, webhook events.');
  }
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
  if (oc.toc && !noFurniture) {
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
  // Document identity table — always at the end of the document.
  if (oc.coverPage && coverRows.length) tail.push('', '---', '', table(['Document', ' '], coverRows));
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
        (fxSet.has('keywords') ? '<othermeta name="keywords" content="payments-api, REST authentication, refunds, webhook events"/>' : '') +
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
  } else if (format === 'html' && pv.layout && pv.layout !== 'document') {
    // Type-specific layout from the blueprint's preview schema: the document
    // renders as the artifact it really is (article, channel cards, changelog
    // timeline, split one-pager) — driven entirely by configuration.
    content = renderPreviewLayout({
      layout: pv.layout, card: pv.card, title, sections, oc, org,
      std: tpl ? tpl.standard : null, dateStr: fmtDate(oc),
      docRows: oc.coverPage ? coverRows : []
    });
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
      ...(oc.showStandardMeta ? ['    <subtitle>Standard: ' + escX(tpl ? tpl.standard : 'DocGen default') + ' · Source: ' + escX(repo) + '</subtitle>'] : []),
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
      mdToHtml(md).replace(/<h1 /g, '<h1 style="font-size:30px;font-weight:400" ').replace(/<h2 /g, '<h2 style="font-size:20px;font-weight:600;margin-top:32px" '),
      '</section>'
    ].join('\n');
  } else if (format === 'email') {
    // Email-safe HTML: single column, inline styles, 600px, no external CSS.
    const inner = mdToHtml(md)
      .replace(/<h1 /g, '<h1 style="font-size:26px;font-weight:400;margin:0 0 16px" ')
      .replace(/<h2 /g, '<h2 style="font-size:18px;font-weight:600;margin:28px 0 8px" ')
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
    // The Markdown master is stored; the real binary (.pdf / .docx) is built
    // from it at download time by server/src/adapters/exporters.js, applying
    // paper size, header/footer, page numbers, and watermark for real.
    content = md;
  }
  // Blueprint conformance for the quality report — same framework for every
  // technical and marketing document type.
  const structure = validateStructure({ docType: id, sections, content: md, skillName });
  return { title, content, structure };
}

/* ---------------- Quality model: dimensions, weights, assistants ----------------
   One configurable source of truth. Every score in the product is DERIVED from
   this config plus the open/fixed issue state — nothing is hardcoded twice, so
   the report can never contradict itself. Adjust weights, gates, and assistant
   blends here. */
export const QUALITY_CONFIG = {
  gate: 85,          // publish gate for the overall score
  assistantGate: 85, // "ready to land in AI assistants" threshold
  dimensions: [
    { id: 'style', name: 'Style & editorial', weight: 0.15, desc: 'Tone, grammar, and formatting against the enterprise style profile' },
    { id: 'consistency', name: 'Consistency', weight: 0.13, desc: 'Terminology mismatches and duplicated content' },
    { id: 'completeness', name: 'Completeness', weight: 0.15, desc: 'Prerequisites, limitations, examples, and workflows present' },
    { id: 'readability', name: 'Readability', weight: 0.15, desc: 'Clarity and structure, section by section' },
    { id: 'llm', name: 'LLM readiness', weight: 0.27, desc: 'Short descriptions, search-optimized titles, metadata' },
    { id: 'links', name: 'Link integrity', weight: 0.15, desc: 'Broken links, redirects, and internal references' }
  ],
  // How each assistant weighs the dimensions when retrieving and citing content.
  // Override at runtime without a code change by setting QUALITY_ASSISTANTS in
  // server/.env to a JSON array of { id, name, blend } entries (blend weights
  // should sum to 1; keys are the dimension ids above).
  assistants: [
    { id: 'chatgpt', name: 'ChatGPT', blend: { llm: 0.45, links: 0.15, readability: 0.15, completeness: 0.15, consistency: 0.10 } },
    { id: 'claude', name: 'Claude', blend: { llm: 0.40, readability: 0.25, completeness: 0.20, consistency: 0.15 } },
    { id: 'gemini', name: 'Google Gemini', blend: { llm: 0.38, links: 0.27, readability: 0.15, completeness: 0.10, style: 0.10 } }
  ],
  penalties: { perOpenIssue: 12, perBrokenLink: 14, perStyleFail: 12, floor: 40 },
  // Maps an assistant readiness score to an estimated retrieval/citation
  // probability. Capped below 100 on purpose — we never claim certainty.
  ranking: { minScore: 40, maxScore: 98, minProb: 4, maxProb: 97 }
};

// Optional runtime override: QUALITY_ASSISTANTS='[{"id":"gemini","name":"Google Gemini","blend":{"llm":0.4,"links":0.3,"readability":0.3}}]'
if (process.env.QUALITY_ASSISTANTS) {
  try {
    const list = JSON.parse(process.env.QUALITY_ASSISTANTS);
    if (Array.isArray(list) && list.length && list.every((a) => a && a.id && a.name && a.blend)) {
      QUALITY_CONFIG.assistants = list;
    } else {
      console.warn('QUALITY_ASSISTANTS ignored: expected a non-empty array of { id, name, blend }');
    }
  } catch (e) {
    console.warn('QUALITY_ASSISTANTS ignored: invalid JSON —', e.message);
  }
}

const LEGACY_DIM = { 'LLM readiness': 'llm', 'Consumability': 'readability' };

// Derive every dimension score, the weighted overall, the verdict, and the
// per-assistant landing estimates from the raw report state.
export function scoreReport({ issues, fixed, links, style }) {
  const P = QUALITY_CONFIG.penalties;
  const openByDim = {};
  const totalByDim = {};
  for (const i of issues) {
    const dim = i.dim || LEGACY_DIM[i.cat] || 'llm';
    totalByDim[dim] = (totalByDim[dim] || 0) + 1;
    if (!fixed.includes(i.id)) openByDim[dim] = (openByDim[dim] || 0) + 1;
  }
  const styleFails = style.filter((s) => !s.pass).length;
  const dimScore = (id) => {
    if (id === 'links') return Math.max(P.floor, 100 - P.perBrokenLink * links.length);
    if (id === 'style') return Math.max(P.floor, 100 - P.perStyleFail * styleFails);
    return Math.max(P.floor, 100 - P.perOpenIssue * (openByDim[id] || 0));
  };
  const dimensions = QUALITY_CONFIG.dimensions.map((d) => ({
    id: d.id, name: d.name, weight: d.weight, desc: d.desc,
    score: Math.round(dimScore(d.id)),
    open: d.id === 'links' ? links.length : d.id === 'style' ? styleFails : (openByDim[d.id] || 0),
    total: d.id === 'links' ? links.length : d.id === 'style' ? style.length : (totalByDim[d.id] || 0)
  }));
  const wSum = dimensions.reduce((a, d) => a + d.weight, 0);
  const overall = Math.round(dimensions.reduce((a, d) => a + d.weight * d.score, 0) / wSum);
  const gatePassed = overall >= QUALITY_CONFIG.gate;
  const verdict = gatePassed ? 'Publish-ready' : overall >= 70 ? 'Review recommended' : 'Needs work';
  const byId = Object.fromEntries(dimensions.map((d) => [d.id, d]));
  const assistants = QUALITY_CONFIG.assistants.map((a) => {
    const entries = Object.entries(a.blend);
    const bSum = entries.reduce((s, [, w]) => s + w, 0);
    const score = Math.round(entries.reduce((s, [dim, w]) => s + w * (byId[dim] ? byId[dim].score : overall), 0) / bSum);
    let weakest = null;
    for (const [dim, w] of entries) {
      const d = byId[dim];
      if (d && (!weakest || d.score * w < weakest.score * a.blend[weakest.id])) weakest = d;
    }
    const R = QUALITY_CONFIG.ranking;
    const clamped = Math.max(R.minScore, Math.min(R.maxScore, score));
    const probability = Math.round(R.minProb + ((clamped - R.minScore) / (R.maxScore - R.minScore)) * (R.maxProb - R.minProb));
    return {
      id: a.id, name: a.name, score, probability,
      ready: score >= QUALITY_CONFIG.assistantGate,
      heldBackBy: score >= QUALITY_CONFIG.assistantGate ? null : (weakest ? weakest.name : null),
      // Retrieval profile as percentages, for the expandable breakdown in the UI.
      blend: entries.map(([dim, w]) => ({
        dim, name: byId[dim] ? byId[dim].name : dim,
        pct: Math.round((w / bSum) * 100),
        score: byId[dim] ? byId[dim].score : overall
      }))
    };
  });
  return { dimensions, overall, gatePassed, verdict, assistants, gate: QUALITY_CONFIG.gate, assistantGate: QUALITY_CONFIG.assistantGate };
}

/* ---------------- Quality report export (HTML, human-readable) ---------------- */
export function renderQualityReport(ser, meta) {
  const tr = (cells, tag) => '<tr>' + cells.map((c) => '<' + (tag || 'td') + '>' + c + '</' + (tag || 'td') + '>').join('') + '</tr>';
  const verdictColor = ser.gatePassed ? '#24a148' : ser.overall >= 70 ? '#8e6a00' : '#da1e28';
  const css = PAGE_CSS +
    '\n.band{display:flex;gap:24px;align-items:center;background:#f4f4f4;padding:20px 24px;margin:24px 0}' +
    '.big{font-size:44px;font-family:"IBM Plex Mono",monospace}' +
    '.v{font-weight:600;color:' + verdictColor + '}' +
    '.del{color:#a2191f;background:#fff1f1;padding:2px 6px;text-decoration:line-through;display:inline-block;margin-top:4px}' +
    '.ins{color:#0e6027;background:#defbe6;padding:2px 6px;display:inline-block;margin-top:2px}' +
    '.st-ok{color:#0e6027;font-weight:600}.st-open{color:#8e6a00;font-weight:600}' +
    '.muted{color:#525252;font-size:13px}';
  const out = [
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>',
    '<title>AI consumability report — ' + escX(meta.title) + '</title><style>' + css + '</style></head><body>',
    '<h1>AI consumability report — ' + escX(meta.title) + '</h1>',
    '<p class="muted">Source: <code>' + escX(meta.repo) + '</code> · format: ' + escX(String(meta.format).toUpperCase()) +
      ' · generated ' + new Date().toISOString().slice(0, 10) + ' · publish gate ≥ ' + ser.gate + '</p>',
    '<div class="band"><span class="big">' + ser.overall + '</span><span><span class="v">' + escX(ser.verdict) + '</span><br/>' +
      ser.fixedCount + ' fix' + (ser.fixedCount === 1 ? '' : 'es') + ' applied · ' + ser.remaining + ' finding' + (ser.remaining === 1 ? '' : 's') + ' open</span></div>',
    '<h2>Quality dimensions</h2>',
    '<table><thead>' + tr(['Dimension', 'Score', 'Weight', 'Open findings'], 'th') + '</thead><tbody>',
    ...ser.dimensions.map((d) => tr([escX(d.name), String(d.score), Math.round(d.weight * 100) + '%', String(d.open)])),
    '</tbody></table>',
    '<h2>AI assistant readiness</h2>',
    '<p class="muted">Modeled from the dimension scores and each assistant’s retrieval profile (threshold ≥ ' + ser.assistantGate + '). No live calls are made to third-party assistants.</p>',
    '<table><thead>' + tr(['Assistant', 'Score', 'Status', 'Held back by'], 'th') + '</thead><tbody>',
    ...ser.assistants.map((a) => tr([escX(a.name), String(a.score), a.ready ? 'Likely to land' : 'At risk', escX(a.heldBackBy || '—')])),
    '</tbody></table>',
    '<h2>Findings</h2>',
    ...ser.issues.map((i) =>
      '<h3>' + (i.fixed ? '<span class="st-ok">✓ Fixed</span> ' : '<span class="st-open">● Open</span> ') + escX(i.title) + '</h3>' +
      '<p class="muted">' + escX(i.cat) + (i.target ? ' · ' + escX(i.target) : '') + '</p>' +
      '<p>' + escX(i.body) + '</p>' +
      (i.fixed && (i.before || i.after)
        ? (i.before ? '<div class="del">− ' + escX(i.before) + '</div><br/>' : '') + (i.after ? '<div class="ins">+ ' + escX(i.after) + '</div>' : '')
        : '<p class="muted">Suggested fix: ' + escX(i.fix) + '</p>')
    ),
    '<h2>Link integrity</h2>',
    '<table><thead>' + tr(['URL', 'Location', 'Status', 'Detail'], 'th') + '</thead><tbody>',
    ...ser.links.map((l) => tr(['<code>' + escX(l.url) + '</code>', escX(l.file), escX(l.status), escX(l.why)])),
    '</tbody></table>',
    '<h2>Style checks</h2>',
    '<table><thead>' + tr(['Check', 'Status', 'Detail'], 'th') + '</thead><tbody>',
    ...ser.style.map((s2) => tr([escX(s2.t), s2.pass ? 'Pass' : 'Review', escX(s2.d)])),
    '</tbody></table>',
    '<p class="muted">Produced by the DocGen quality auditor — human-in-the-loop: every applied fix above was reviewed and accepted by the author.</p>',
    '</body></html>'
  ];
  return out.join('\n');
}

/* ---------------- Fix diffs: exact before → after shown to the user ----------------
   These mirror applyFixes() one-to-one, so the diff the user sees is precisely
   the change made to the document. Configurable alongside the transforms. */
export const FIX_DIFFS = {
  shortdesc: { target: 'Document head', before: '(no short description present)', after: 'Short description. The Payments API lets you create, capture, and refund charges programmatically. This reference covers authentication, all endpoints, and error handling.' },
  title: { target: 'Document title', before: 'API reference', after: 'API reference — endpoints, authentication, and errors' },
  keywords: { target: 'Document head + metadata', before: '(none)', after: 'Keywords: payments-api, REST authentication, refunds, webhook events.' },
  pronoun: { target: 'Authentication / Rate limits', before: 'It must be rotated every 90 days.', after: 'The API signing secret must be rotated every 90 days.' },
  longsent: { target: 'Overview', before: 'All responses are JSON; all timestamps are ISO 8601.', after: 'All responses are JSON. All timestamps are ISO 8601.' },
  example: { target: 'New section (end)', before: '(no runnable example)', after: 'Worked example — curl POST /v1/charges with amount, currency, and source.' },
  prereq: { target: 'New section (top)', before: '(missing)', after: '"Before you begin" — active account, API key, base URL, curl 8+.' },
  limitations: { target: 'New section (end)', before: '(missing)', after: '"Limitations" — 100 req/s per key, 10 MB request cap, 180-day refund window.' },
  term: { target: 'Whole document', before: '…experiment in test mode…', after: '…experiment in sandbox…' },
  dupe: { target: 'Rate limits', before: 'Duplicated rotation sentence', after: 'Removed duplicate; cross-reference: "See Authentication for the rotation policy."' }
};

/* ---------------- LLM-as-judge ---------------- */
/* Content-aware judge. Every check runs against the ACTUAL generated
 * document, so scores and recommendations vary with the content instead of
 * being demo constants. Issue IDs stay within the fix-engine vocabulary
 * (applyFixes / FIX_DIFFS), so auto-fix keeps working unchanged.
 * Called without content (legacy callers, seeds), it degrades to the full
 * checklist so nothing downstream breaks. */
export function judge(doc = {}) {
  const raw = String(doc.content || '');
  const repo = String(doc.repo || '');
  const product = (repo.split('/').pop() || 'the product').replace(/[-_]/g, ' ');
  const h1 = (raw.match(/^#\s+(.+)$/m) || [])[1] || String(doc.title || '');

  // Text views: body without code fences (for prose checks).
  const noCode = raw.replace(/```[\s\S]*?```/g, '');
  const prose = noCode
    .replace(/^#{1,6}\s.+$/gm, '')                     // headings
    .replace(/^\s*[->|*]\s?.*$/gm, '')                 // bullets, quotes, tables
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');          // link targets
  const sentences = prose.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length > 2);
  const words = (s) => s.split(/\s+/).filter(Boolean).length;

  const issues = [];
  const push = (id, cat, dim, title, body, fix) => issues.push({ id, cat, dim, title, body, fix });

  // If there is no content to inspect (legacy call), report the full
  // checklist exactly as before.
  const inspect = raw.length > 0;

  // --- LLM readiness ---
  const afterTitle = raw.split(/^#\s.+$/m)[1] || '';
  const firstProse = afterTitle.split('\n').map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('>') && !l.startsWith('-') && !l.startsWith('!'))[0] || '';
  if (!inspect || firstProse.length < 40) {
    push('shortdesc', 'LLM readiness', 'llm', 'Missing short description',
      'No short description was found at the top of the document. AI systems and search results rely on it to summarize the page — without one, retrieval quality drops and snippets are generated from arbitrary body text.',
      'Add a 1–2 sentence summary of ' + product + ' directly under the title, stating what it does and what this document covers.');
  }
  if (!inspect || words(h1) < 3) {
    push('title', 'LLM readiness', 'llm', 'Title is not search-optimized',
      'The current title "' + (h1 || 'Untitled') + '" is too generic to match real queries. Users and LLMs search with product and task terms, not document-type labels.',
      'Rename to "' + product + ' — <primary tasks this document answers>".');
  }
  if (!inspect || !/^\s*keywords\s*:/im.test(noCode)) {
    push('keywords', 'LLM readiness', 'llm', 'Missing metadata keywords',
      'No keywords or tags are attached to the document, reducing discoverability in both site search and vector retrieval.',
      'Add a "Keywords:" line naming ' + product + ' and its main tasks and synonyms.');
  }

  // --- Readability ---
  if (!inspect || /\bIt must be rotated every 90 days\b/.test(noCode)) {
    push('pronoun', 'Readability', 'readability', 'Ambiguous pronoun reference',
      'The sentence "It must be rotated every 90 days" follows mentions of more than one noun. Retrieved out of context, "It" does not resolve.',
      'Replace with "The API signing secret must be rotated every 90 days."');
  }
  const longOnes = sentences.filter((s) => words(s) > 28);
  if (!inspect || longOnes.length > 0) {
    push('longsent', 'Readability', 'readability', 'Sentence length above threshold',
      (inspect ? longOnes.length : 'Several') + ' sentence(s) exceed 28 words' + (inspect && longOnes[0] ? ' (e.g., "' + longOnes[0].slice(0, 90) + '…")' : '') + '. Long sentences reduce comprehension and degrade chunk quality for retrieval.',
      'Split each flagged sentence at the conjunction; target a mean of 18 words per sentence.');
  }

  // --- Completeness ---
  if (!inspect || !/```/.test(raw)) {
    push('example', 'Completeness', 'completeness', 'Missing code example',
      'The document includes no fenced code example. Sections without examples are retrieved less often and answered less accurately by LLMs.',
      'Add at least one runnable example (install command, minimal request, or config snippet) for ' + product + '.');
  }
  if (doc.track !== 'marketing' && (!inspect || !/^#{1,3}\s+.*(before you begin|prerequisit)/im.test(raw))) {
    push('prereq', 'Completeness', 'completeness', 'Missing prerequisites section',
      'No prerequisites are stated before the first task. Readers discover missing requirements mid-procedure, and assistants cannot answer "what do I need first".',
      'Add a "Before you begin" list with the runtime, account, and tooling requirements.');
  }
  if (doc.track !== 'marketing' && (!inspect || !/^#{1,3}\s+.*(limitation|rate limit|constraint)/im.test(raw))) {
    push('limitations', 'Completeness', 'completeness', 'Missing limitations section',
      'The document never states rate limits, size caps, or unsupported scenarios, leaving readers to find the edges by trial and error.',
      'Add a "Limitations" section listing rate limits, size caps, and unsupported scenarios.');
  }

  // --- Consistency ---
  if (!inspect || (/\bsandbox\b/i.test(noCode) && /\btest mode\b/i.test(noCode))) {
    push('term', 'Consistency', 'consistency', 'Terminology mismatch: "sandbox" vs "test mode"',
      'Both terms are used for the same environment. Mixed terminology fragments search results and confuses retrieval.',
      'Standardize on "sandbox" everywhere; reserve "test mode" only for the dashboard toggle label.');
  }
  const paras = noCode.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 80);
  const dupePara = paras.find((p, i) => paras.indexOf(p) !== i);
  if (!inspect || dupePara) {
    push('dupe', 'Consistency', 'consistency', 'Duplicated paragraph across sections',
      'The same paragraph appears in more than one section' + (inspect && dupePara ? ' ("' + dupePara.slice(0, 70) + '…")' : '') + '. Duplicates compete against each other in retrieval and drift out of sync over time.',
      'Keep the paragraph in its primary section and replace the copies with a cross-reference link.');
  }

  // --- Link integrity: derived from the document's real links ---
  const links = [];
  if (inspect) {
    const seen = new Set();
    let m;
    const linkRe = /\[[^\]]*\]\((\/[^)#\s]+|https?:\/\/[^)\s]+)\)/g;
    while ((m = linkRe.exec(noCode)) && links.length < 5) {
      const url = m[1];
      if (seen.has(url)) continue;
      seen.add(url);
      if (url.startsWith('http://')) {
        links.push({ file: 'document body', url, why: 'Insecure http:// link — browsers and crawlers may block or downgrade it.', status: 'Insecure' });
      } else if (url.startsWith('/')) {
        links.push({ file: 'document body', url, why: 'Relative link — cannot be resolved outside the publishing site; verify the target exists.', status: 'Unverified' });
      }
    }
  } else {
    links.push(
      { file: 'authentication.md, line 24', url: '/docs/token-rotation-guide', why: 'Target page was removed in v2.3 docs restructure. Returns 404.', status: '404' },
      { file: 'webhooks.md, line 108', url: 'https://status.acme.dev/webhooks', why: 'Host resolves but path redirects 3 times, then times out.', status: 'Timeout' }
    );
  }

  // --- Style guide: measured on the real prose ---
  let style;
  if (inspect) {
    const passiveHits = sentences.filter((s) => /\b(is|are|was|were|be|been|being)\s+\w+(ed|en)\b/i.test(s)).length;
    const passivePct = sentences.length ? Math.round((100 * passiveHits) / sentences.length) : 0;
    const latin = /\b(e\.g\.|i\.e\.)/.test(prose);
    const headings = [...raw.matchAll(/^#{2,4}\s+(.+)$/gm)].map((x) => x[1]);
    const titleCased = headings.filter((h) => {
      const ws = h.replace(/[`*_]/g, '').split(/\s+/);
      return ws.length > 1 && ws.slice(1).filter((w) => /^[A-Z][a-z]/.test(w)).length > ws.length / 2;
    });
    style = [
      { t: 'Passive voice', d: passivePct + '% of sentences use passive constructions; the style guide caps it at 20%.', pass: passivePct <= 20 },
      { t: 'Latin abbreviations', d: latin ? '"e.g." or "i.e." found in body text; the style guide prefers expanded forms.' : 'No "e.g." or "i.e." in body text; expanded forms used throughout.', pass: !latin },
      { t: 'Sentence case in headings', d: titleCased.length ? titleCased.length + ' heading(s) use Title Case (e.g., "' + titleCased[0] + '"); the convention is sentence case.' : 'All headings comply with sentence-case convention.', pass: titleCased.length === 0 },
      { t: 'Average sentence length', d: (sentences.length ? Math.round(sentences.reduce((a, s) => a + words(s), 0) / sentences.length) : 0) + ' words per sentence (target ≤ 22).', pass: !sentences.length || sentences.reduce((a, s) => a + words(s), 0) / sentences.length <= 22 }
    ];
  } else {
    style = [
      { t: 'Passive voice above threshold', d: 'Sections 2 and 4 use passive voice in 31% of sentences; the style guide caps it at 20%.', pass: false },
      { t: 'Inconsistent terminology: "API key" vs "token"', d: 'Both terms refer to the same credential. The glossary prefers "API key".', pass: false },
      { t: 'Sentence case in headings', d: 'All headings comply with sentence-case convention.', pass: true },
      { t: 'Oxford comma usage', d: 'Consistent across all list constructions.', pass: true },
      { t: 'Latin abbreviations', d: 'No "e.g." or "i.e." in body text; expanded forms used throughout.', pass: true }
    ];
  }

  return { issues, links, style };
}

export const AI_BASE_SCORE = 70;
export const AI_PER_FIX = 6;

export function aiScore(issueCount, fixedCount) {
  return Math.min(100, AI_BASE_SCORE + AI_PER_FIX * fixedCount);
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/* ---------------- Real LLM generation (Anthropic API) ----------------
 * Active when ANTHROPIC_API_KEY is set in server/.env AND repository files
 * were fetched. Produces the same { title, content, structure } shape as the
 * template engine, so every downstream format/preview/quality path is reused.
 * On ANY failure it falls back to the template engine — the app never breaks.
 */
const AI_MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

// ---- Concurrency limiter ----------------------------------------------
// The API rate-limits bursts. Cap simultaneous in-flight requests (override
// with AI_CONCURRENCY) so a batch of generations queues instead of stampeding
// and getting 429s. This is what caused template fallbacks under load.
const AI_MAX_INFLIGHT = Math.max(1, Number(process.env.AI_CONCURRENCY) || 2);
let aiInFlight = 0;
const aiWaiters = [];
function acquireSlot () {
  if (aiInFlight < AI_MAX_INFLIGHT) { aiInFlight++; return Promise.resolve(); }
  return new Promise((resolve) => aiWaiters.push(resolve));
}
function releaseSlot () {
  const next = aiWaiters.shift();
  if (next) next(); // hand the slot to the next waiter (count stays the same)
  else aiInFlight = Math.max(0, aiInFlight - 1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Anthropic call with retry + exponential backoff on transient failures
// (429 rate limit, 529 overloaded, 5xx). Honors Retry-After when present.
async function anthropicRequest (key, body, attempt = 0) {
  const MAX_RETRIES = 4;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (r.ok) return r.json();
  const retryable = r.status === 429 || r.status === 529 || r.status >= 500;
  if (retryable && attempt < MAX_RETRIES) {
    const hdr = Number(r.headers.get('retry-after'));
    const backoff = Number.isFinite(hdr) && hdr > 0
      ? hdr * 1000
      : Math.min(16000, 500 * Math.pow(2, attempt)) + Math.floor(Math.random() * 400);
    await sleep(backoff);
    return anthropicRequest(key, body, attempt + 1);
  }
  throw new Error('Anthropic API: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

async function aiSections({ docType, track, repo, files, brief, instructions, key }) {
  const tpl = TEMPLATES[docType];
  const outline = tpl ? tpl.sections({ product: 'X', version: '', date: '', repo, brief: {} }).map(([h]) => h) : ['Overview'];
  const fileBlock = files.map((f) => '### FILE: ' + f.path + '\n```\n' + f.content + '\n```').join('\n\n');
  const b = brief || {};
  const sys = 'You are a senior technical writer. Write documentation grounded ONLY in the provided repository files. ' +
    'Never invent endpoints, functions, options, or version numbers that are not visible in the files. ' +
    'Respond with ONLY a JSON array of [heading, markdownBody] pairs — no prose around it.';
  const user = 'Repository: ' + repo + '\nDocument type: ' + docTypeName(track, docType) +
    (tpl ? ' (standard: ' + tpl.standard + ')' : '') +
    '\nSuggested outline (adapt as the code warrants): ' + outline.join(' · ') +
    (b.audience ? '\nAudience: ' + b.audience : '') + (b.tone ? '\nTone: ' + b.tone : '') +
    (instructions ? '\nInstructions: ' + String(instructions).slice(0, 500) : '') +
    '\nUse markdown: ## is NOT needed in bodies (headings come from the pairs); tables, fenced code blocks, and lists are encouraged.' +
    '\n\nRepository files:\n\n' + fileBlock;
  await acquireSlot();
  let d;
  try {
    // 4096 tokens truncated verbose documents mid-JSON ("Unterminated string
    // at position ~13000"), which threw and silently degraded the whole run
    // to template content. 8192 covers real documents comfortably.
    d = await anthropicRequest(key, { model: AI_MODEL(), max_tokens: 8192, system: sys, messages: [{ role: 'user', content: user }] });
  } finally {
    releaseSlot();
  }
  const text = (d.content || []).map((c) => c.text || '').join('');
  const m = text.match(/\[[\s\S]*\]?/);
  if (!m) throw new Error('No JSON array in model response');
  const arr = parseSectionsArray(m[0]);
  if (!Array.isArray(arr) || !arr.length) throw new Error('Empty sections from model');
  return arr.filter((p) => Array.isArray(p) && p.length >= 2).map((p) => [String(p[0]), String(p[1])]);
}

// Parse the model's [[heading, body], …] array; if the output was cut off
// mid-stream (max_tokens), salvage every COMPLETE pair instead of throwing
// the whole document away. A doc missing its last section beats boilerplate.
function parseSectionsArray(raw) {
  try { return JSON.parse(raw); } catch { /* fall through to salvage */ }
  for (let i = raw.length; i > 2; ) {
    const cut = raw.lastIndexOf(']', i - 1);
    if (cut <= 1) break;
    try {
      const arr = JSON.parse(raw.slice(0, cut + 1) + ']');
      if (Array.isArray(arr) && arr.length) {
        console.warn('aiSections: salvaged ' + arr.length + ' complete section(s) from truncated model output');
        return arr;
      }
    } catch { /* keep walking back */ }
    i = cut;
  }
  throw new Error('Unparseable sections array from model');
}

// Drop-in async wrapper: real AI when possible, template engine otherwise.
// Also returns aiDocs so callers can persist them for fix-regeneration and
// HTML preview rendering without re-calling the API.
export async function generateDocumentSmart(args) {
  const key = process.env.ANTHROPIC_API_KEY;
  const files = args.files || [];
  if (args.aiDocs && args.aiDocs.length) {
    return { ...generateDocument(args), aiDocs: args.aiDocs };
  }
  if (!key || !files.length) {
    return { ...generateDocument(args), aiDocs: null };
  }
  // Generate each document type independently: one failed call must not
  // degrade the whole set to template content. A type that fails is retried
  // once; only if EVERY type fails does the template fallback kick in.
  const aiDocs = [];
  for (const t of args.docTypes) {
    const attempt = () => aiSections({ docType: t, track: args.track, repo: args.repo, files, brief: args.brief, instructions: args.instructions, key });
    try {
      aiDocs.push({ type: t, sections: await attempt() });
    } catch (e1) {
      try {
        aiDocs.push({ type: t, sections: await attempt() });
      } catch (e2) {
        console.error('AI generation failed for "' + t + '" (kept remaining types):', e2.message);
      }
    }
  }
  if (!aiDocs.length) {
    console.error('AI generation failed — template fallback: all document types failed');
    return { ...generateDocument(args), aiDocs: null };
  }
  return { ...generateDocument({ ...args, aiDocs }), aiDocs };
}
