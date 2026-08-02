# Docify — project guide for Claude

Documentation-automation SaaS, live at https://docifydocai.com. Solo founder (Praveen). Pre-revenue, launch stage.

## Stack & commands

React 18 + Vite client (`client/`), Express ESM API (`server/`), Prisma — SQLite locally, Postgres in production via `schema.postgres.prisma`. Deployed on Railway (project **sincere-insight**) from GitHub `prav99/DocifyUI` main; every push auto-deploys.

```bash
npm run dev                 # both, from repo root
cd client && npx vite build # verify client changes compile
cd server && node --check src/<file>.js   # verify server changes parse
```

```bash
cd server && npm test      # cross-account isolation, token integrity, plan caps, deletion
```

`server/test/isolation.test.js` stands up a real server against a throwaway SQLite database. `server/test/intel-honesty.test.js` does the same for repository-intelligence/preflight honesty: every "the analyzer must not claim X" suppression is paired with a positive control proving the claim still fires when the facts are known. The security policy and privacy policy both cite it by name, so keep it honest: assert exact status codes (never `!== 200`), pair every "stranger is denied" assertion with a positive control proving the owner succeeds, and mutation-test it after changes — remove the guard you think it covers and confirm it fails. Also verify client changes in the browser preview and server changes with `node --check`.

## Non-negotiable product rules

**Honesty is the brand.** Every public claim must be true on the day it ships.
- Never invent customer counts, testimonials, logos, or measured outcomes — there are no customers yet.
- ROI/cost numbers are the visitor's own inputs or clearly-labelled assumptions, never claimed results.
- Never claim SOC 2 / ISO 27001 (not audited).
- AI-search readiness is a *modeled signal*, never a ranking guarantee. Never promise Zero Data Retention (Claude 5 models are excluded from it).
- Docify is **read-only**: it never writes to customer repos and never opens PRs. Do not write copy or code implying otherwise.

**Security gates.** `NODE_ENV=production` switches on HSTS, blocks the demo-login path, and restricts the demo admin grant. `CREDENTIAL_KEY` (64 hex chars) enables AES-256-GCM encryption of provider tokens via Prisma middleware in `server/src/crypto.js`. Keep the `IS_PROD` gates intact when touching auth.

**Cost discipline.** Every generation is a real Anthropic bill (~$0.12/document on Sonnet 4.5). In `adapters/llm.js`, the repo files + style policy form a **cached prefix** — they must stay FIRST in the prompt with `cache_control`, and only the per-document ask varies after it. Reordering that breaks caching silently. `[ai]` log lines report tokens and cost per call; `cacheRead=0` across one run means caching stopped working.

## What is real vs simulated

**Real:** Anthropic generation (`claude-sonnet-4-5` default), GitHub/GitLab/Bitbucket OAuth + repo reading, Jira/Confluence/Notion/OpenAPI, webhook automation with HMAC, all exporters (PDF/DOCX/PPTX/DITA), SMTP, PostHog/GA4.

**Simulated:** payments (`adapters/stripe.js` fabricates receipts — no Stripe), the quality "LLM judge" (deterministic heuristics in `llm.js` `judge()`, disclosed in-product), AI-assistant citation probability (linear remap), Doc Sync's commit feed (canned, labeled demo).

## Pricing (deployed Aug 2026)

Free $0 (5 docs) · Starter $29/$24 annual (2 seats, 60 docs) · **Team $99/$79 annual (5 seats incl., +$12/seat, 250 docs)** · Enterprise custom. See `DOCIFY-PRICING-STRATEGY.md`.

Caps **are enforced server-side**: `PLAN_LIMITS` in `catalog.js` is the single source of truth and must match the pricing table in `Pricing.jsx`. Usage is a ledger (`UsageEvent`, one row per document produced, written before the pipeline runs) rather than a count of `Generation` rows — automation updates an existing row on every merge, so counting rows would miss the one path that repeats. Enforcement points: `POST /generations`, `triggerRegeneration`, `profileRun`, and `POST /profiles`; live usage is returned by `GET /billing`.

## Keep in sync

- Landing FAQ ⇄ `server/src/seo-meta.js` FAQ_LD (duplicated on purpose for crawlers).
- Prices appear in: `catalog.js`, `Pricing.jsx`, `Checkout.jsx`, `Landing.jsx` (calculator + metrics + CTA + FAQ), `seo-meta.js` (meta, prerender, JSON-LD).
- `seo-meta.js` injects crawler-visible HTML into the empty SPA root — update it when landing copy changes, or crawlers see stale text.

## Reference documents in this repo

`DOCIFY-BUSINESS-ANALYSIS.md` (product/market/ROI) · `DOCIFY-PRICING-STRATEGY.md` · `DOCIFY-SECURITY-REVIEW.md` (13 findings, all fixed) · `DOCIFY-PAYMENTS-OPTIONS.md` (India-based payment rails) · `DOCIFY-FILM-PLAN.md` (the 9 landing-page films).

## Open items

1. `CREDENTIAL_KEY` is still unset on Railway. `NODE_ENV=production` is set (verified: HSTS live, cookies `Secure`). Since the credential store now fails closed in production, connecting a source will error until the key is set — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Real payments (Stripe unavailable in India — see payments doc; Dodo/Polar recommended).
3. GitHub OAuth requests the classic `repo` scope, which reads as *write* access to a security reviewer even though Docify never writes. Migrate to a GitHub App for true read-only.
