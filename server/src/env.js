// Environment loader. Imported FIRST by index.js (and cluster.js) so every
// other module sees the variables at import time. Loads server/.env relative
// to this file — NOT the process CWD — so starting the server from any
// directory still picks up the API keys instead of silently degrading every
// generation to template content.
import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[env] ANTHROPIC_API_KEY is not set — document generation will use template content only.');
}
