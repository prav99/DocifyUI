// Seeds a demo account with realistic history so the dashboard is not empty.
// Login: demo@acme.dev / demo1234
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { judge } from './adapters/llm.js';
import { parseOutline, semanticProfile, buildUpdate, COMMIT_FEED } from './docsync.js';

const prisma = new PrismaClient();

async function main() {
  const email = 'demo@acme.dev';
  let user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    console.log('Seed: demo user already exists, skipping.');
    return;
  }
  user = await prisma.user.create({
    data: {
      email, name: 'Demo User',
      emailVerified: true,
      passwordHash: await bcrypt.hash('demo1234', 10),
      plan: 'team', billingCycle: 'annual'
    }
  });
  await prisma.source.create({ data: { userId: user.id, provider: 'github', detail: 'acme/payments-api' } });
  await prisma.automation.create({ data: { userId: user.id } });
  await prisma.teamMember.createMany({
    data: [
      { ownerId: user.id, name: 'Demo User', email, role: 'Owner' },
      { ownerId: user.id, name: 'Meera Krishnan', email: 'meera@acme.dev', role: 'Admin' },
      { ownerId: user.id, name: 'Daniel Osei', email: 'daniel@acme.dev', role: 'Writer' },
      { ownerId: user.id, name: 'Sofia Marques', email: 'sofia@acme.dev', role: 'Reviewer' }
    ]
  });

  const seedGens = [
    { repo: 'acme/payments-api', branch: 'main', docTypes: ['api'], format: 'dita', title: 'API reference', score: 96, fixedAll: true },
    { repo: 'acme/payments-api', branch: 'main', docTypes: ['quickstart'], format: 'markdown', title: 'Quick start guide', score: 91, fixedAll: true },
    { repo: 'acme/ledger-service', branch: 'main', docTypes: ['install'], format: 'pdf', title: 'Installation & setup guide', score: 70, fixedAll: false },
    { repo: 'acme/sdk-python', branch: 'develop', docTypes: ['userguide'], format: 'word', title: 'User guide', score: 88, fixedAll: true }
  ];

  for (const sg of seedGens) {
    const steps = ['Parsing repo structure', 'Extracting code comments', 'Drafting sections', 'Running quality checks'];
    const gen = await prisma.generation.create({
      data: {
        userId: user.id, repo: sg.repo, branch: sg.branch, track: 'technical',
        docTypes: JSON.stringify(sg.docTypes), format: sg.format,
        status: 'complete', step: steps.length, steps: JSON.stringify(steps),
        title: sg.title, score: sg.score,
        content: '# ' + sg.title + '\n\nSeeded document content for ' + sg.repo + '.'
      }
    });
    const rep = judge();
    await prisma.qualityReport.create({
      data: {
        generationId: gen.id,
        issues: JSON.stringify(rep.issues),
        links: JSON.stringify(rep.links),
        style: JSON.stringify(rep.style),
        fixedIds: JSON.stringify(sg.fixedAll ? rep.issues.map((i) => i.id) : [])
      }
    });
  }
  /* ---- Doc sync: baseline document + queued AI updates ---- */
  const baseline = [
    '# Payments Platform — Developer Guide', '',
    'This guide covers integrating the Acme payments API: authentication, core', 'endpoints, error handling, and operational limits.', '',
    '## Getting started', '',
    'Create a workspace, generate an API key from **Settings → API keys**, and make', 'your first request against the sandbox environment at `https://sandbox.acme.dev`.', '',
    '## Authentication', '',
    'Every request carries a bearer token in the `Authorization` header. API keys are', 'created per environment; sandbox keys never work against production.', '',
    '```http', 'GET /v1/charges', 'Authorization: Bearer sk_live_…', '```', '',
    '## Endpoints', '',
    '### Charges', '',
    'Create and retrieve charges with `POST /v1/charges` and `GET /v1/charges/:id`.', 'Amounts are integer minor units (cents).', '',
    '### Customers', '',
    'Customers group charges and payment methods. Create with `POST /v1/customers`.', '',
    '## Errors', '',
    'The API uses conventional HTTP status codes: `4xx` for request problems and', '`5xx` for platform faults. Retry only idempotent requests.', '',
    '## Rate limits', '',
    'Requests are rate-limited per API key. When throttled you receive', '`429 Too Many Requests` — respect the `Retry-After` header before retrying.', '',
    '## Webhooks', '',
    'Subscribe to events from **Settings → Webhooks**. Deliveries are retried with', 'exponential backoff for 24 hours.', '',
    '## Configuration', '',
    'Runtime behaviour is tuned through environment variables documented in', '`.env.example`. Restart workers after changing them.'
  ].join('\n');
  const parsed = parseOutline(baseline);
  const prof = semanticProfile(baseline, parsed.sections);
  const doc = await prisma.syncDoc.create({
    data: {
      userId: user.id, name: 'payments-developer-guide.md', format: 'markdown',
      repo: 'acme/payments-api', branch: 'main', content: baseline,
      sections: JSON.stringify(parsed.sections),
      profile: JSON.stringify({ ...prof, lines: parsed.lines, chars: parsed.chars, pagesEst: parsed.pagesEst }),
      status: 'ready', progress: 100, cursor: 2
    }
  });
  await prisma.syncVersion.create({
    data: { docId: doc.id, number: 1, source: 'upload', summary: 'Baseline uploaded — ' + parsed.sections.length + ' sections, ~' + parsed.pagesEst + ' pages', content: baseline }
  });
  for (const commit of COMMIT_FEED.slice(0, 2)) {
    const built = buildUpdate(doc, commit);
    if (built) await prisma.syncUpdate.create({ data: { userId: user.id, docId: doc.id, ...built } });
  }

  console.log('Seed complete. Demo login: demo@acme.dev / demo1234');
}

main().finally(() => prisma.$disconnect());
