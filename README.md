# DocGen — documentation automation SaaS

A full-stack web application: React client, Node.js REST API, and a SQLite database via Prisma.
Runs identically on **Windows, macOS, and Linux** — the only requirement is Node.js 18+.

The standalone clickable prototype from the design phase is preserved as `index.html`
(open it directly in a browser — it needs no server).

## Quick start

```bash
# 1. Install root tooling (concurrently)
npm install

# 2. Install server + client deps, create the database, seed demo data
npm run setup

# 3. Run API (port 4000) and client (port 5173) together
npm run dev
```

Open **http://localhost:5173**.

Demo account (seeded with generation history): **demo@acme.dev / demo1234** —
or click "Start free" and create your own account.

### Production mode

```bash
npm run build   # builds client into client/dist
npm start       # API serves both the API and the built client on http://localhost:4000
```

### Compatibility

- **Desktop — Windows, macOS, Linux**: runs in any modern browser; the dev/build
  scripts are cross-platform (Node 18+, no bash-isms, no native modules).
- **Mobile — Android and iPhone**: the client is fully responsive (stacked layouts,
  scrollable tables, touch-sized controls). It also ships a PWA manifest, so from
  Chrome (Android) or Safari (iOS) users can "Add to Home Screen" and run it like
  an installed app. To test from a phone on the same network, run
  `npm run dev -- --host` in `client/` and open the printed LAN URL.

### Windows notes

All scripts use `npm --prefix` and cross-platform Node APIs — no bash-isms.
Run the same three commands in PowerShell or cmd. If port 4000 or 5173 is taken,
change `PORT` in `server/.env` and the proxy target in `client/vite.config.js`.

## Architecture

```
DocifyUI/
├── index.html          # phase-1 standalone prototype (no server needed)
├── package.json        # root scripts (setup / dev / build / start)
├── client/             # React 18 + Vite SPA
│   └── src/
│       ├── main.jsx    # router; auth-guarded routes
│       ├── api.js      # fetch wrapper, JWT header, authenticated downloads
│       ├── store.jsx   # auth context, flow state, toast system
│       ├── ui.jsx      # Carbon-styled shared components (TopBar, NavBar, Modal…)
│       ├── styles.css  # enterprise design tokens + components (white theme)
│       └── pages/      # one file per screen
└── server/             # Express REST API (ESM)
    ├── prisma/schema.prisma   # User, Source, Generation, QualityReport, TeamMember, Automation, Waitlist
    └── src/
        ├── index.js    # app entry; serves client/dist in production
        ├── auth.js     # signup/login (bcrypt + JWT), auth middleware
        ├── api.js      # all resource routes
        ├── catalog.js  # sources / doc types / formats / plans / CI snippet
        ├── seed.js     # demo account + history
        └── adapters/   # pluggable integration boundary
            ├── github.js   # mock repo listing  → swap for GitHub REST API
            ├── llm.js      # mock generation + LLM judge → swap for Anthropic API
            └── stripe.js   # mock payments → swap for Stripe Checkout
```

### How it scales

- **Stateless API + JWT** — no server-side sessions, so you can run N API instances
  behind a load balancer without sticky sessions.
- **SQLite → PostgreSQL in one change** — the data layer is 100% Prisma. Point
  `DATABASE_URL` at Postgres and set `provider = "postgresql"` in `schema.prisma`;
  no application code changes.
- **Adapter boundary** — every external dependency (source hosts, LLM, payments)
  sits behind `server/src/adapters/` with a stable interface. Swapping the mock for
  the real service touches one file each.
- **Async generation pipeline** — generations are created immediately and processed
  asynchronously while the client polls. To scale beyond one node, move
  `runPipeline` onto a queue (BullMQ/SQS) without changing the API contract.
- **Client/server split** — the SPA is static output (`client/dist`) servable from
  any CDN; the API deploys independently.

## API surface

| Method | Path | Purpose |
|---|---|---|
| POST | /api/auth/signup, /api/auth/login | Accounts (email+password or mock OAuth) |
| GET | /api/auth/me | Current user |
| GET | /api/catalog | Sources, doc types, formats, plans |
| POST | /api/waitlist | Coming-soon source waitlist |
| GET/POST | /api/sources | Connected sources (Jira requires URL + token) |
| GET | /api/repos | Repo list from the source adapter |
| POST/GET | /api/generations | Start / list generations |
| GET | /api/generations/:id | Poll pipeline progress + content |
| GET | /api/generations/:id/download | Document or quality-report download |
| GET | /api/generations/:id/quality | Quality report |
| POST | /api/quality/:id/fix, /recheck | Apply an AI-judge fix / re-evaluate |
| GET/POST | /api/billing, /api/billing/checkout | Plan + simulated checkout |
| GET/POST | /api/team, /api/team/invite | Members and invites |
| GET/PUT | /api/automation | CI regeneration settings + snippet |

## Enabling real GitHub OAuth

Out of the box the OAuth buttons use a simulated flow (no keys needed). To make
"Continue with GitHub" perform the real handshake:

1. On GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App**
   - Application name: `DocGen (dev)`
   - Homepage URL: `http://localhost:5173`
   - Authorization callback URL: `http://localhost:4000/api/auth/github/callback`
2. Copy the **Client ID**, generate a **Client secret**, and paste both into
   `server/.env` (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`).
3. Apply the schema update and restart: `npm run db:push --prefix server`, then `npm run dev`.

The client auto-detects the configuration (`GET /api/auth/providers`) and switches
the GitHub buttons from simulated to real. After the user clicks Authorize on
GitHub's consent screen, the callback exchanges the one-time code for an access
token server-side, stores it on the Source record, signs the user in, and the
repository picker starts listing their actual repositories. The user never types
credentials into DocGen.

Notes for production: request finer scopes via a GitHub App instead of the classic
`repo` scope for true read-only access to private repos, encrypt stored tokens at
rest, and serve everything over HTTPS. GitLab/Bitbucket follow the same pattern —
add a matching authorize/callback pair in `server/src/auth.js` and a real adapter.

## Corporate email signup

Email signup works out of the box (bcrypt + JWT). Two optional layers in `server/.env`:

- **Verification emails** — set `SMTP_HOST/PORT/USER/PASS/FROM` and new accounts
  must click an emailed link (48 h expiry) before they can log in; resend and
  invalid-link handling included. With `SMTP_HOST` empty (dev mode), accounts are
  auto-verified and the mail is printed to the server console.
- **Domain policy** — `ALLOWED_EMAIL_DOMAINS="acme.com,acme.dev"` restricts signup
  to those domains; `BLOCK_FREE_EMAIL="true"` rejects personal providers
  (gmail, yahoo, outlook, …) with a "use your corporate email" message.

OAuth accounts are treated as verified by their provider. After changing these,
run `npm install --prefix server` once (adds nodemailer) and restart.

## Configuration

`server/.env` — `DATABASE_URL`, `JWT_SECRET`, `PORT`. Defaults work out of the box
for local development; set a strong `JWT_SECRET` for anything shared.

## Scaling to high traffic

The API is stateless (JWT auth, all state in the database), so it scales in three stages:

**Stage 1 — one machine, all cores (built in).** `npm start` runs `server/src/cluster.js`: one worker per CPU core (override with `WEB_CONCURRENCY`), automatic respawn on crash with crash-loop backoff, graceful drain on shutdown. Works identically on macOS, Windows, and Linux. Each worker ships with per-IP rate limiting (`RATE_LIMIT_API`, `RATE_LIMIT_AUTH`), gzip compression, security headers, request timeouts, and immutable caching for hashed assets. SQLite runs in WAL mode with a busy timeout for concurrent reads.

**Stage 2 — real database.** Point `DATABASE_URL` at Postgres and run `npm run db:push` — the Prisma schema needs no code changes. This removes the single-file write bottleneck and enables many app nodes to share one database.

**Stage 3 — many machines.** Run N instances behind any load balancer (set `TRUST_PROXY=1`), serve `client/dist` from a CDN, move rate-limit counters and webhook run queues to Redis, and add read replicas as reporting traffic grows. 100k concurrent users is a fleet-and-database problem — the application code here is already stateless, cacheable, and horizontally scalable, so nothing in it needs rewriting to get there.
