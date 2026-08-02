# Docify — Autonomous Production Fix Pass

**Date:** 2 Aug 2026 · **Scope:** every finding from `DOCIFY-PRODUCTION-AUDIT.md`, plus everything found while fixing.
**Result:** 66 files changed (+4,412 / −1,381). **44/44 unit tests · 15/15 final live checks · client build clean.**
**Committed locally in 5 commits. Nothing pushed** — pushing auto-deploys to Railway, so that call is yours.

---

## How this was done

Three waves, each verified before the next:

1. **18 parallel agents** fixed the codebase, each owning an exclusive set of files so concurrent edits could not collide.
2. **Central verification** — Prisma migration, syntax, build, full test suite, and a live browser pass.
3. **An adversarial review** of the fixes themselves: 8 reviewers hunting for defects the fix pass introduced, every claim re-checked by an independent verifier. **31 claims → 11 confirmed, 20 refuted.** All 11 were fixed and re-verified.

That third wave mattered: it caught 11 real regressions in work that had already passed the full test suite.

---

## 1 · Critical and high issues

### The production demo account
**Root cause:** `railway.json` ran `node src/seed.js` on every deploy, creating `demo@acme.dev` / `demo1234` (Team plan) in production, while `Auth.jsx` printed those credentials into the production bundle.
**Fix:** seeding removed from the deploy command; the hint is now behind `import.meta.env.DEV`; and `seed.js` itself refuses to run in production unless `SEED_DEMO=true`.
**Deliberately not deleted:** verification showed this was an intentional feature with bounded risk (no admin — `admin.js` gates that in production — no cross-account data, generation capped by plan). It is now an explicit choice rather than an accident.
**You must still:** delete or rotate that account in the production database. Code cannot reach it.
*Files:* `railway.json`, `client/src/pages/Auth.jsx`, `server/src/seed.js`

### Status page reported 599% uptime
**Root cause:** production forks one worker per CPU and **every worker wrote its own status sample**, while the uptime denominator assumed one sample per five minutes.
**Fix:** exactly one worker samples, using the stable `WORKER_INDEX` that survives respawns (`cluster.worker.id` keeps climbing, so after the first crash *no* worker would have qualified — the review caught that). Uptime is clamped to 100, and incident durations are now measured from timestamps instead of multiplying a sample count.
*Files:* `server/src/api.js`, `server/src/cluster.js`

### DITA export was shipping gutted documents
**Root cause:** every section body was reduced to its first sentence, plus a hardcoded payments description and keywords — in the format sold as the Team-tier differentiator.
**Fix:** full section bodies render as valid DITA (paragraphs, lists, code blocks); the short description is derived from the document or omitted.
**Verified:** 4,462 bytes, 8 sections, 11 paragraphs, balanced tags, no hardcoded strings.
*File:* `server/src/adapters/llm.js`

### No password reset existed
**Root cause:** never built — a customer who forgot their password was permanently locked out.
**Fix:** `POST /auth/forgot` + `POST /auth/reset`. Single-use token, only its SHA-256 hash stored, 60-minute expiry, prior links invalidated, rate-limited, and an identical response whether or not the address exists. Full UI at `/reset`.
**Verified live:** valid token works, old password stops working, token cannot be reused, invalid token refused.
*Files:* `server/src/auth.js`, both Prisma schemas, `client/src/pages/Auth.jsx`, `client/src/main.jsx`

### Sessions could not be revoked
**Root cause:** a stateless 7-day JWT stayed valid after a password change, so a leaked token could not be withdrawn.
**Fix:** `tokenVersion` on the user, carried in the token and checked on every request; incremented on password change and reset. Tokens minted before the change are rejected; old tokens without the claim are treated as version 0, so nobody currently signed in was logged out.
**Verified live:** the pre-reset session 401s while the new one works — and the tab that performed the change stays signed in (the endpoint returns a fresh token; the client adopts it).
*Files:* `server/src/auth.js`, `server/src/identity.js`, `client/src/pages/Settings.jsx`

### Claims the product could not honor
Removed everywhere, including crawler-visible copy: the **14-day free trial** (advertised in 7 places with a "Start 14-day trial" button that led to a 503), the **30-day money-back guarantee**, the **MDX output** format, and every remaining **"LLM judge"** reference. `llms.txt` — which feeds AI crawlers — also carried **stale pricing** ($26/user vs the real $79/month).
*Files:* `Pricing.jsx`, `Landing.jsx`, `seo-meta.js`, `index.html`, `llms.txt`, `Assistant.jsx`, `Docs.jsx`, `Help.jsx`, `manifest.webmanifest`

### Fabricated content in customer deliverables
Invented revision-history rows, an unrelated payments glossary, a fictional version number on covers, "N of 47 links failed verification", and a canned "annotated preview" shown as the customer's own document. All removed or derived from real data.
*Files:* `server/src/adapters/llm.js`, `client/src/pages/Quality.jsx`

### Doc Sync billed before it validated
A not-found or not-ready document, or a no-op sync, each cost a document. Validation now precedes reservation on all four AI routes. **Verified live:** a 404 sync costs 0.
*File:* `server/src/docsync.js`

### Team management was a dead end
Invites created a row, sent no email, and seats could never be reclaimed. Added `DELETE /team/:id`, real invitation emails (with honest wording when mail is unconfigured), and a Remove action in Settings. **Verified live:** a seat can be freed.
*Files:* `server/src/api.js`, `client/src/pages/Settings.jsx`

---

## 2 · Defects the adversarial review caught in my own fixes

| Defect | Why it mattered |
|---|---|
| **Malformed XML** when a code span met bold — `` `**kwargs` `` plus `**always**` produced `<codeph><b>x</codeph></b>` | Broke DITA/DocBook toolchains outright. All three inline converters now protect code spans first. |
| **Crash recovery silently disabled** — guarded on `cluster.worker.id === 1`, which no worker satisfies after a respawn | Orphaned generations would never resume; the customer watches a spinner for a document they were charged for. Now uses the stable index, **and runs periodically** rather than only at boot. |
| **Doc Sync refunded requests that had already paid for a model call** | The relevance gate calls Claude; a blanket refund on "skip" let anyone loop `/simulate` for unmetered model spend. Refunds now only when nothing was spent. |
| **Google pre-hijack left the squatter's session alive** | Taking the password away isn't enough if their token still works. Now revokes sessions too. |
| **A stale 401 signed you out of every tab** | A poll started before a password change would clear the *new* token. The handler now ignores replies carrying a superseded token. |
| **No error boundary on lazy routes** | After a deploy, a tab open on an old chunk went to a white screen. Now an explanation and a reload button. |
| **TODO scaffolding used as a DITA topic summary**; **cover/revision-history version contradiction**; **unescaped pipes splitting table rows** | Each put visibly wrong content in a downloaded file. |
| **Docs, Help, Legal and SECURITY.md still said password reset and member removal "are not built"** | The fix pass shipped both — the documentation contradicted the product in the *other* direction. |

---

## 3 · Also fixed (found by agents, beyond the audit)

- **Rule-set saves silently destroyed every config key the editor doesn't display** (`product.terminology`, `always_document_paths`, …) — real data loss.
- A **threshold of 0** could never be saved; emptying the exclude list never persisted.
- **`scan.include` is now editable in the UI** — the single most useful control for a monorepo, previously reachable only by committing a `docify.yaml`.
- Admin rights could be inherited by an **unverified account** registered at an admin address; `requireAdmin` could hang instead of denying; the admin payload of customer emails was cacheable.
- The assistant claimed a **"read-only OAuth grant"** (the GitHub scope is write-capable), that automation **"re-publishes"** documentation (it cannot write to your repo), and that **every format works on every plan**.
- Automation: dead "publish destination" control removed, Jira links now render, step headers validate before jumping, polling no longer runs forever after unmount.
- Contact form no longer reports success when mail is unconfigured; signup no longer silently auto-verifies addresses in production.
- `pptxgenjs` is now imported lazily, so a missing Node flag can no longer take the whole API down on restart.

---

## 4 · Performance

- **Initial bundle 1,001 kB → 570 kB** (300 → 175 kB gzipped) via route-level code splitting; heavy pages (Automation, DocSync, Docs, Source, the review editor) load on demand. The landing page no longer carries the authenticated app.
- Polling loops bounded with backoff and unmount guards (previously an unreachable endpoint left a 1.5 s loop running for the session).
- Admin metrics stopped selecting columns it never used; the response is no longer cacheable.

## 5 · Security

Password reset with hashed single-use tokens · session revocation · pre-hijack session invalidation · PII (email, name) removed from analytics and `posthog.reset()` on logout · demo credentials out of the production bundle · admin gate hardened · error handler returns correct codes without leaking internals · proxy trusted for exactly one hop so client IPs cannot be spoofed for rate limiting · card data confirmed never transmitted or stored.

## 6 · Regression testing performed

44/44 unit tests (incl. cross-account isolation, plan caps, deletion) · 18 live API checks after wave 1 · 11 DITA integrity checks · 15 final end-to-end checks · full browser pass (landing, wizard end-to-end, Quality, Doc Sync, Settings, Automation, Standardize, Status, Checkout, Docs) · client build after every phase.

Two test fixtures were corrected: they used a document type that does not exist (`apiref`) and a stub too short to validate — both were passing *because* of bugs this pass fixed.

## 7 · Known limitations

1. **The seeded demo account still exists in your production database.** Code stops it being recreated; deleting it is a manual step.
2. **Real payments are still not implemented** (simulated by design, disclosed in-product; paid plans route to contact).
3. **Doc Sync's commit feed is still sample data** — now labelled as such everywhere it appears.
4. **The quality rubric is deterministic, not an LLM** — now disclosed rather than fixed, since the rubric works.
5. **GitHub OAuth still requests the classic `repo` scope**; a GitHub App migration would make the grant genuinely read-only and also fix unauthenticated rate limits.
6. **Grounding is still capped at 12 files / 6 KB each.** Unchanged deliberately — it is the cost model. The architecture analysis recommends a map-then-read selection pass.
7. **No trial mechanism** — the claims were removed rather than the feature built.
8. Automation `profileRun` still has paths where a partially-delivered run keeps its quota; noted, not restructured.

## 8 · Production readiness

The product is **substantially readier than it was this morning**: no false public claims, no fabricated content in deliverables, real account recovery, revocable sessions, enforced entitlements, and honest billing. The remaining blockers are business decisions (payments, GitHub App) rather than defects.

**Before deploying:** push, then (a) delete the demo account in production, (b) confirm `SMTP_HOST` is set — password reset and invitations depend on it, and (c) watch `/api/status` for a few cycles to confirm uptime reads sanely.

```bash
cd /Users/alkaraj/Desktop/DocifyUI && git push
```

## 9 · Recommended next

1. Set up SMTP if it isn't — password reset is now the recovery path and needs mail.
2. GitHub App migration (read-only grant + higher rate limits).
3. Payments (Dodo/Polar per your payments doc) to make paid plans self-serve.
4. Show customers which files grounded their document, then move to content-aware file selection.
5. Add a `/reset` route entry to `seo-meta.js` marked `noindex`.
