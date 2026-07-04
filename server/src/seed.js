// Seeds a demo account with realistic history so the dashboard is not empty.
// Login: demo@acme.dev / demo1234
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { judge } from './adapters/llm.js';

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
  console.log('Seed complete. Demo login: demo@acme.dev / demo1234');
}

main().finally(() => prisma.$disconnect());
