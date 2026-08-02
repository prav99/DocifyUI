# Docify — Production-Readiness Audit

**Date:** 2 Aug 2026 · **Method:** every interactive element traced from click handler → API route → database/provider call, plus live exercise of each workflow in the browser and read-only probes of production.
**Scope:** **394 features/elements** classified across 9 product areas, plus live exercise of every major workflow.

| Classification | Count |
|---|---|
| ✅ Fully functional | **272** (69%) |
| 🟡 Partial | 54 |
| 🟣 Simulated **by design and disclosed** | 16 |
| 🔴 Hardcoded | 13 |
| 🔴 Broken | 8 |
| 🟠 Missing error handling | 8 |
| 🔴 Mocked but **not disclosed** | 7 |
| ⚫ Dead code | 5 |
| 🟠 Missing validation | 4 |
| ⚪ Display-only (no backend) | 4 |
| 🟠 Missing persistence | 3 |
**Verdict:** the engine is real. The packaging around it is not — **one critical live security exposure**, several places where fabricated content is written into customer deliverables, and marketing claims the product cannot honor.

> This is an audit, not a fix. Nothing in the code was changed. Priority order for fixing is at the end.

---

## 🚨 Fix today — before anything else

### C1 · A working Team-plan account is publicly advertised on your live site
- **`railway.json` runs `node src/seed.js` on every deploy** (`deploy.startCommand`), which creates `demo@acme.dev` / `demo1234` with plan `team`, email pre-verified, seeded history.
- **Your production JavaScript bundle displays those credentials.** Confirmed live: `https://docifydocai.com/assets/index-BYrlQPwV.js` contains `demo@acme.dev / demo1234 (seeded with history)` — the hint at `Auth.jsx:319` renders unconditionally, with no `IS_PROD` gate.
- **Impact:** any visitor can sign in to a paid account on docifydocai.com, generate documents (each one a real Anthropic charge on your card), connect sources, and read seeded data. It also defeats the "no paid plan can be self-granted" guarantee your test suite proves.
- **Fix (two lines):** remove `(node src/seed.js || true) &&` from `railway.json`, and gate the hint on `import.meta.env.DEV`. Then delete or rotate the account in the production database.

### C2 · Your public status page shows impossible uptime
- Live right now: `GET /api/status` returns `uptime {"24h": 599.3, "7d": 256.7, "30d": 157}` — rendered as **599% uptime**.
- **Root cause (traced):** production starts a **cluster** — `npm start` runs `cluster.js`, which forks one worker per CPU (`cluster.js:10-15`). The status sampler is a module-level `setInterval` in `api.js:324`, so **every worker writes its own sample every 5 minutes**. The uptime formula (`api.js:348-356`) counts every OK sample in the numerator but caps the denominator at `expected = window / 5min`, so *N* workers produce roughly *N* × 100%. The ~6× reading matches a 6-worker box.
- **Fix:** sample only in one process (`cluster.isPrimary`, or a `WORKER_INDEX === 0` guard), and clamp the result to 100% as a belt-and-braces guard. The same duplication also means the 90-day bar strip and incident detection are counting each interval N times.
- **Impact:** the one page whose entire purpose is to prove you are trustworthy is visibly broken, on a page that promises *"these numbers cannot flatter us."*

---

## 🔴 Fabricated content inside customer deliverables

These are worse than UI bugs: the invented text lands in files the customer downloads, and may publish.

| # | What happens | Evidence |
|---|---|---|
| **H1** | **DITA export discards the document.** Every section body is reduced to its first sentence (`firstPlainLine`), and every DITA file gets the hardcoded `<shortdesc>Create, capture, and refund charges programmatically.</shortdesc>` plus hardcoded keywords `payments-api, REST authentication, refunds, webhook events`. DITA is your **Team-tier differentiator** — and it ships gutted, one-sentence sections describing a payments API the customer does not have. | `llm.js:1060-1084` |
| **H2** | **"Revision history" invents version history.** Turning it on appends fabricated rows — `2.3.1 · 2026-05-18 · Fix release`, `2.3.0 · 2026-04-02 · Initial publication` — into the customer's real document. | `llm.js:959-966` |
| **H3** | **"Glossary" injects payment-API terms** (API key, Charge, Idempotency key, Webhook) into any document, whatever the repository is about. | `llm.js:967-975` |
| **H4** | **Cover pages can show a fabricated version.** When the user leaves Version blank, the cover falls back to `2.4.0`. | `llm.js:912, 998` |
| **H5** | **"Broken links" tab says "N of 47 links failed verification."** The 47 is fiction — no link verification runs. | `Quality.jsx:483` |
| **H6** | **"Annotated preview"** on the quality page is a fixed payments snippet with a canned "404 — broken link" marker, shown identically for every document. | `Quality.jsx:462-477` |

**Common fix:** never emit content the source did not provide. Omit the section, or render it empty with a "no data" note. For DITA, render full section bodies (paragraphs, lists, code) rather than one line.

---

## 🟠 Claims the product cannot honor

| # | Claim | Reality |
|---|---|---|
| **H7** | **"14-day free trial"** on Team — stated in `Pricing.jsx:35, 94, 113`, `Landing.jsx:451, 912`, and `seo-meta.js:21, 98, 157`, including a **"Start 14-day trial"** button | No trial mechanism exists anywhere in the codebase. The button leads to a checkout that returns **503 "Online payment is not available yet."** A visitor cannot start a trial by any path. |
| **H8** | **"30-day money-back guarantee on annual plans"** (`Pricing.jsx:114`) | No payment system exists to take or refund money. |
| **M1** | **"Plus DocBook, ePub, XHTML, and MDX outputs"** (`Landing.jsx:959`) | MDX is an accepted *input* extension only; there is no MDX output format. |
| **M2** | Landing's Doc-sync CTA says Doc sync **"watches your repo"** per merge (`Generate.jsx:223-236`) | Doc Sync's commit feed is a canned demo list (`docsync.js:6, 149-279`); no webhook creates `SyncUpdate` rows. Labeled `SAMPLE` **inside** the queue (good) but not where it is sold. |

Per your own product rule — *every public claim must be true on the day it ships* — H7 and H8 should come down or be built before launch.

---

## 🟡 Missing / broken functionality

| # | Feature | Status | Evidence |
|---|---|---|---|
| **H9** | **Password reset does not exist.** No forgot-password route, no reset token, no UI link | missing | grep across `auth.js`, `identity.js`, `Auth.jsx` returns nothing. A customer who forgets their password is permanently locked out — with no support tooling to help them. |
| **H10** | **Doc Sync bills before it validates.** `aiQuotaBlocked` reserves a document as the first act of sync/simulate/standardize/rewrite, before the ownership 404 and the "still parsing" 400 | broken | `docsync.js:719-731, 762, 808, 1063` — a not-found document, a not-ready document, or a no-op "nothing to update" sync each cost the customer a document. |
| **H11** | **Team management is invite-only.** No remove-member, no role change, no way to free a seat | missing | Only `GET /team` and `POST /team/invite` exist (`api.js:1817-1847`). Once 5 seats are used they can never be reclaimed — I hit this live: the 6th invite correctly returned *"all of them are in use"*, with no way to undo. |
| **H12** | **Team invites are rows, not invitations.** The row is created and the toast says *"will receive an email shortly"* | partial | `api.js:1823-1847` sends no email and creates no acceptance flow. Verified live — the member appears as "Invited" and nothing else happens. |
| **H13** | **Sessions cannot be revoked.** 7-day stateless JWT; changing your password does not invalidate existing sessions | missing | `auth.js:185-227` — no token version/jti. A leaked token stays valid for 7 days even after a password change. |
| **M3** | **Standardize proposals can't be edited in the review queue** | broken | `docsync.js:864, 977-983` — restructure proposals appear in the queue with content truncated to 4,000 chars; the edit path targets a different shape. |
| **M4** | Automation **publish destination** select is stored and never read | display-only | `api.js:1982` — the only references are the default and a label. |
| **M5** | Automation **path filter** ("only these folders") silently no-ops for GitHub merged-PR and Bitbucket events | partial | `api.js:136, 271-276` — `normalizeGitEvent` returns `files: []` for those providers, so the filter has nothing to match. |
| **M6** | **"Add reference files"** (DocType) uploads nothing — only filenames are captured, and a pipeline stage *"Applying your instructions"* appears as if they were used | mocked-undisclosed | `DocType.jsx:52-56` → `api.js:1441` (stored, never read); stage added at `api.js:960-962`. |
| **M7** | **Billing tab misreads paid plans** — a Starter customer is shown Free-plan copy ("5 watermarked generations") | broken | `Settings.jsx:267` treats every non-Team plan as Free. |
| **M8** | **"Reset to defaults"** on Format doesn't clear typed text | partial | `Format.jsx:199` resets state, but the text inputs are uncontrolled (`defaultValue`), so typed values remain. |
| **M9** | Marketing brief's **"one thing to emphasize"** never reaches the AI prompt (template-only) | partial | `llm.js:226-273`; `aiSections` sends audience/tone only. |

---

## 🟣 "AI" labels over deterministic engines (a recurring pattern)

You fixed this for the quality judge earlier today. The same pattern appears in three more places — each is *good, real, useful* logic, just not AI:

| Feature | What it says | What it is |
|---|---|---|
| Doc Sync **"Structure & understanding"** modal | *"What the AI understood"*, *"SEMANTIC PROFILE"* | Term-frequency + regex heuristics, no model call (`docsync.js:71-89`) |
| Review queue **"AI REASONING"** panel with confidence % | *"AI reasoning"*, per-placement confidence | Deterministic lexical scorer (`docsync.js:102-135, 302-394`) |
| Automation **contextual placement** | *"the AI understands each commit"* | Deterministic outline scoring (`api.js:2168-2220`) — real and effective, but not a model |

**Fix:** rename to "Placement reasoning" / "Parsed structure", or add the same one-line disclosure you used on the quality page. The engines work; only the labels overclaim.

## 🔵 Security, privacy, and infrastructure

| # | Finding | Severity |
|---|---|---|
| **H14** | **Customer email and name are sent to PostHog** on every login/signup (`posthog.identify(..., { email, name })` at `Auth.jsx:162, 187, 201, 224, 509`), and `posthog.reset()` is never called on logout — so a second user on a shared browser inherits the first user's analytics identity. Your privacy policy should either cover this or the PII should be dropped. | High |
| **H15** | **Server cold-start is fragile.** `report.js:14` imports `pptxgenjs`, which fails on Node 20 without `--experimental-detect-module`; the production start script relies on ambient config. A restart on a host without that flag takes the whole API down. | High |
| **M10** | **Rate limiting behind Railway's proxy** keys on `req.ip` and only trusts the proxy when `TRUST_PROXY` is set (`index.js:27`). If unset in production, every request looks like one IP — one visitor can rate-limit everyone. | Medium |
| **M11** | **Error handler flattens everything to 500** (`index.js:135-138`), ignoring `err.status`. Malformed JSON returns 500 instead of 400 (reproduced). | Medium |
| **M12** | **Contact form reports success when SMTP is unset** — `mailer.js:16-23` logs to console and `api.js:99` returns `ok:true`, so a real customer enquiry can vanish silently. | Medium |
| **M13** | **Signup auto-verifies email when SMTP is unset** (`auth.js:335`) — an unverified-address account becomes fully trusted. | Medium |
| **M14** | `GET /api/status` component health is partly nominal — `aiGeneration` is just `!!ANTHROPIC_API_KEY`, `webhooks` is a constant string, not a probe (`api.js:301-315`). | Medium |
| **M15** | **401s are not handled specially client-side** (`api.js:22`) — an expired token surfaces as a generic error mid-workflow instead of a clean re-login. | Medium |
| **M16** | **`Generate.jsx` polling retries forever on error with no unmount check** (`147-149`) — a failing endpoint leaves a permanent 1.5s loop after navigation. | Medium |

---

## ⚫ Low-severity items (fix opportunistically)

- **Password strength meter is display-only** — the server enforces only length ≥ 8, so an all-lowercase password the meter calls "Weak" is accepted (`Auth.jsx:106-110`, `auth.js:318-320`).
- **Dead code**: `pages/Marketing.jsx` (stub Docs page, imported nowhere); the legacy single-automation API (`GET/PUT /automation`, `/automation/run`, `/automation/rotate-secret`) superseded by profiles; an unused `fname` in ExportPage.
- **Automation Step 3 Jira "site URL"** builds `run.jira.url` that is never rendered — either link it or drop the field.
- **Quality header says "generated just now"** regardless of the document's real age.
- **History search is case-sensitive on Postgres** (works case-insensitively on local SQLite) — a classic dev/prod divergence.
- **Doc Sync upload** rejects PDF/docx with "extraction coming next" in one path while `extract.js` fully supports them elsewhere.
- **Wizard step headers are clickable** without validating that earlier steps are complete.
- **GitHub OAuth still requests the classic `repo` scope** — reads as write access for a read-only product (known item; GitHub App migration fixes it).

## ⚪ Performance

- **No code splitting.** All 25+ pages are statically imported (`main.jsx:7-30`); the bundle is **~1.0 MB / 300 KB gzipped**, shipped to every landing-page visitor. `React.lazy` appears nowhere. First-visit cost is the single biggest performance item.
- Polling at 700 ms during generation is reasonable, and the catalogue promise-cache and Status interval cleanup are correct.
- No memory-leak patterns found beyond M16.

---

## ✅ What is genuinely production-ready

This is the majority of the product, and it is well built:

- **Authentication** — bcrypt with timing equalization, OTP with hashed codes/expiry/attempt caps and enumeration-proof errors, real Google OIDC with PKCE + nonce + JWKS verification, real code-host OAuth with signed CSRF state, honest "not configured" states, per-IP limits. Route guards verified live (`/dashboard` → login when signed out).
- **All 7 integrations** — GitHub, GitLab, Bitbucket, Jira, Confluence, Notion, OpenAPI all make real provider calls with real error handling and SSRF guards. Verified live earlier this session.
- **Generation pipeline** — real repo reads, real scope rules (`docify.yaml`/`.docifyignore`/rule sets), real Anthropic calls with a correct prompt-cache prefix, honest template fallback with in-product disclosure.
- **Automation** — real webhook HMAC/token verification with constant-time compare and replay dedup, real Jira triggers, real relevance gate (Claude with a disclosed heuristic fallback), quota reserved before spend, human-approval flow. Verified live: created a pipeline, ran it, got a published run with a downloadable document.
- **Doc Sync** — real Prisma-backed documents, versions, approve/reject/edit/restore. Verified live: approving an update created v2 and updated the counters.
- **Standardize** — real analysis and correction with an honest *"Structured without AI"* label when the model is unavailable, and an explicit, correct statement that Docify will not push to your repo.
- **Documents/History** — real version history, approval workflow, downloads, filters (14 documents, statuses persisted).
- **Quality fixes and re-check** — real content transforms, real re-judging (fixed earlier today).
- **Landing page** — the cost calculator is real arithmetic on the visitor's own inputs (verified: changing releases/month moved $4,180 → $12,540) and every assumption is labeled as an assumption. The pricing table matches server-side `PLAN_LIMITS` exactly.
- **Checkout** — simulated by design and **honestly disclosed** at the point of action ("Demo build — the payments adapter simulates the charge"), and the server fails closed with a 503 rather than granting a plan.
- **Account deletion** — genuinely deletes across all models in one transaction, with email confirmation.

---

## Recommended priority order

1. **C1** — strip `seed.js` from the deploy command, gate the demo hint, delete the prod account. *(30 minutes, stops an open door on your live site.)*
2. **C2** — fix the uptime maths. *(1 hour, public credibility.)*
3. **H7/H8** — remove the trial and money-back claims, or build them. *(1 hour to remove.)*
4. **H1** — make DITA render real content. *(Half a day; it is your paid differentiator.)*
5. **H2/H3/H4/H5/H6** — stop fabricating content and metrics. *(Half a day.)*
6. **H9** — password reset. *(A day; today, a locked-out customer is unrecoverable.)*
7. **H10** — validate before billing in Doc Sync. *(1 hour.)*
8. **H11/H12** — team removal + real invitation emails. *(A day.)*
9. **H14** — drop PII from analytics and call `posthog.reset()` on logout. *(1 hour.)*
10. **H13, H15, M10-M16** — session revocation, cold-start hardening, proxy trust, error codes, SMTP-unset behavior.
11. **Performance** — route-level code splitting.

---

## How to close C1 right now (the only item that cannot wait)

```bash
# 1. Stop seeding production on every deploy — edit railway.json:
#    remove:  (node src/seed.js || true) &&
# 2. Gate the credential hint in client/src/pages/Auth.jsx:319 behind import.meta.env.DEV
# 3. Delete the seeded account from the production database, then redeploy.
```

Until step 3 runs, the account remains reachable on docifydocai.com even after the code change.

## Coverage note

Classified by reading code and by driving the app live: landing/marketing, auth, dashboard, documents/history, status, help/docs, the full 6-step generation wizard, quality and export, the 6-step automation wizard (pipeline created and run end-to-end), Doc Sync (sync, review queue approve, versions), Standardize (4-step run), settings (all five tabs, including live invite/seat-cap and password-change checks), checkout, and production read-only probes.

Not exercised: real OAuth sign-ins (needs your credentials), live Jira/Confluence/Notion happy paths (needs real tokens), and paid-provider webhook deliveries. Their code paths were read and are real; the earlier QA report lists how to close those gaps.
