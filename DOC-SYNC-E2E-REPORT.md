# Doc Sync — E2E Test Report

Feature: AI-Powered Intelligent Documentation Synchronization & Auto-Insertion
Tested: 8 Jul 2026, live in Chrome at localhost:5173 (demo@acme.dev), plus 20+ unit assertions on the placement/apply engine.

## What was built

- **Server** (`server/src/docsync.js`, mounted at `/api/sync` behind auth): document ingest with async parsing/indexing pipeline, semantic profile (terminology, glossary, style, tone), commit feed adapter (mock — swap for the GitHub webhook), semantic section scoring (title tokens + prefix stemming + concept bridges + file-path signals, document-title damping), diff builder (append / replace / insert-new with correct numbered-heading children like `2.1.1`), approve/reject/edit, immutable versions with restore, commit timeline, overview stats.
- **Data** (`prisma/schema.prisma` + `schema.postgres.prisma`): `SyncDoc`, `SyncUpdate`, `SyncVersion`. Local dev = SQLite (zero setup); Railway uses the Postgres schema via `railway.json`.
- **Client** (`client/src/pages/DocSync.jsx`, route `/sync`): stat cards, Documents tab (drag-drop upload, HTML→text conversion, sample doc, live parsing progress, structure & semantic-understanding modal, simulate commit, delete with confirm), Review queue (master–detail, AI reasoning panel with ranked candidates + confidence meters, side-by-side diff, approve / edit / reject), Commit timeline, Version history (compare modal, restore). Wired into TopBar, user menu, and Dashboard (stat card + pending-review banner).

## E2E results (all pass)

| # | Flow | Result |
|---|------|--------|
| 1 | Login → Dashboard shows Doc sync card + nav | ✅ |
| 2 | Upload sample doc → parsing progress → Indexed (10 sections, profile) | ✅ |
| 3 | Auto-sync on first index → 2 updates queued, toasts | ✅ |
| 4 | Review queue: reasoning, candidates, insert-new diff | ✅ |
| 5 | Approve → applied, version v2 cut | ✅ |
| 6 | Edit content → diff re-renders → approve → v3 | ✅ |
| 7 | Version history: compare modal (v1 vs current), restore v1 → v4 | ✅ |
| 8 | Check for new commits → 2 more queued | ✅ |
| 9 | Reject → nothing changed in document | ✅ |
| 10 | Approve replace-mode update (rate limits) | ✅ |
| 11 | Simulate commit (SAML) → Authentication @ 93% confidence | ✅ |
| 12 | Commit timeline: files, +/− counts, statuses, version tags | ✅ |
| 13 | Structure & understanding modal: outline + semantic profile | ✅ |
| 14 | Console: no app errors (only third-party extension noise) | ✅ |
| 15 | Narrow viewport (733px): queue stacks, diff stacks consistently | ✅ |

## Engine accuracy (unit-tested)

All 8 feed commits placed at the semantically correct section (Authentication, Rate limits, Errors, Webhooks, Configuration, Charges ×2, Endpoints) at 77–86% confidence; numbered documents get correctly numbered child headings; sequential approvals re-locate anchors after line drift; edited content is applied verbatim.

## Fixes applied during testing

1. Prisma schemas: block comments → line comments (Prisma only supports `//`).
2. Placement scoring upgraded (document-title damping, prefix stemming, file-path signal) after the H1 initially captured anchors.
3. Edit-content prefills the full merged section body so original prose is never dropped by default.
4. Diff viewer stacks via container queries — header and panes always agree.
5. Terminology extraction: stopword list extended ("per" etc.).

## Notes

- Local dev now runs on SQLite via `server/.env` (`file:./dev.db`). Production Railway deploy uses `prisma/schema.postgres.prisma` (updated `railway.json`). Keep the two schemas' model blocks identical when editing.
- `server` dev script now uses `node --watch` — server code changes hot-restart.
- `SYNC-TEST.txt` in the project root was a sync diagnostic — safe to delete.
