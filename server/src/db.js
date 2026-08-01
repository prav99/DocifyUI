import { PrismaClient } from '@prisma/client';
import { installCredentialEncryption } from './crypto.js';

export const prisma = new PrismaClient();

// Provider credentials (OAuth tokens, Jira/Confluence/Notion API keys) are
// encrypted with AES-256-GCM at the database boundary — see crypto.js.
installCredentialEncryption(prisma);

// SQLite concurrency tuning for development / single-node deployments:
// WAL lets readers proceed during writes; busy_timeout queues writers briefly
// instead of failing under load. For production scale, switch DATABASE_URL to
// Postgres (see README) — the Prisma schema needs no code changes.
(async () => {
  try {
    if ((process.env.DATABASE_URL || '').startsWith('file:')) {
      await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL');
      await prisma.$queryRawUnsafe('PRAGMA busy_timeout=5000');
      await prisma.$queryRawUnsafe('PRAGMA synchronous=NORMAL');
    }
  } catch { /* pragmas are best-effort; Postgres ignores this path entirely */ }
})();
