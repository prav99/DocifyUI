# Docify — project guide for Claude

Documentation-automation SaaS, live at https://docifydocai.com. Solo founder (Praveen). Pre-revenue, launch stage.

## Stack & commands

React 18 + Vite client (`client/`), Express ESM API (`server/`), Prisma — SQLite locally, Postgres in production via `schema.postgres.prisma`. Deployed on Railway (project **sincere-insight**) from GitHub `prav99/DocifyUI` main; every push auto-deploys.

```bash
npm run dev                 # both, from repo root
cd client && npx vite build # verify client changes compile
cd server && node --check src/<file>.js   # verify server changes parse
```

There is no test suite. Verify client changes by building and checking in the browser preview; verify server changes with `node --check` plus a targeted script.

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

Free $0 (5 docs) · Starter $29/$24 annual (2 seats, 60 docs) · **Team $99/$79 annual (5 seats incl., +$12/seat, 250 docs)** · Enterprise custom. Caps are **display-only — not enforced server-side yet**. See `DOCIFY-PRICING-STRATEGY.md`.

## Keep in sync

- Landing FAQ ⇄ `server/src/seo-meta.js` FAQ_LD (duplicated on purpose for crawlers).
- Prices appear in: `catalog.js`, `Pricing.jsx`, `Checkout.jsx`, `Landing.jsx` (calculator + metrics + CTA + FAQ), `seo-meta.js` (meta, prerender, JSON-LD).
- `seo-meta.js` injects crawler-visible HTML into the empty SPA root — update it when landing copy changes, or crawlers see stale text.

## Reference documents in this repo

`DOCIFY-BUSINESS-ANALYSIS.md` (product/market/ROI) · `DOCIFY-PRICING-STRATEGY.md` · `DOCIFY-SECURITY-REVIEW.md` (13 findings, all fixed) · `DOCIFY-PAYMENTS-OPTIONS.md` (India-based payment rails) · `DOCIFY-FILM-PLAN.md` (the 9 landing-page films).

## Open items

1. Railway plan upgrade (trial) and `CREDENTIAL_KEY` / `NODE_ENV` variables.
2. Real payments (Stripe unavailable in India — see payments doc; Dodo/Polar recommended).
3. GitHub OAuth requests the classic `repo` scope, which reads as *write* access to a security reviewer even though Docify never writes. Migrate to a GitHub App for true read-only.
4. Enforce plan limits server-side.
