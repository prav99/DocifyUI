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
│       ├── styles.css  # IBM Carbon design tokens + components (White theme)
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

## Configuration

`server/.env` — `DATABASE_URL`, `JWT_SECRET`, `PORT`. Defaults work out of the box
for local development; set a strong `JWT_SECRET` for anything shared.
