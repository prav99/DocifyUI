# Docify — End-to-End QA & Functional Validation Report

> **Status update (1 Aug 2026, later the same day):** every Critical and High finding below, plus the Medium/Low items the founder flagged, has been **fixed and verified**. See `DOCIFY-FIXES.md` for what changed, how each fix was proven, and what remains open. The findings below are kept as the original record.

**Date:** 1 Aug 2026 · **Tester:** Claude (automated customer-perspective QA)
**Environments:** Local dev (`npm run dev`, SQLite, no `ANTHROPIC_API_KEY` → template fallback, no OAuth client IDs, no `CREDENTIAL_KEY`) · Production `docifydocai.com` (read-only probes + OAuth initiation only — no real sign-ins, no billed generations)
**Method:** Live browser walkthrough of the full customer journey (signup → source → doc types → format → generate → quality → export), direct API probes with negative cases, server log inspection, code-level verification of every integration path, plus the existing server test suite.

**Server test suite: 34/34 pass** (cross-account isolation, token integrity, plan caps, deletion).

---

## Executive summary

The core product works. The wizard flows end-to-end without a single blocking error; state survives detours and hard reloads; all 28 technical output cells (7 doc types × 4 formats) and all 12 marketing cells downloaded correctly; quality reports export in PDF/HTML/PPTX with working presets; connection error handling for Jira/Confluence/Notion/OpenAPI is genuinely excellent — live provider verification with specific, actionable messages.

But there is **one critical functional bug** — generation hardcodes `branch: "main"`, so any repository whose default branch is `master` (or anything else) silently produces **ungrounded template documentation while consuming quota** — and a cluster of **honesty-brand violations** (a Share button that claims it sent a link but sends nothing; a fake "AI judge re-check"; an undisclosed simulated judge) that contradict the product's own #1 rule and should be fixed before real customers arrive.

**Counts:** 2 Critical (one code, one configuration) · 6 High · 8 Medium · 7 Low. Production infrastructure posture (HSTS, OAuth state signing, PKCE, demo-login block) is solid.

---

## Critical

### C1. Generation always requests branch `main` — repos with any other default branch generate ungrounded template docs
- **Evidence:**
  - `client/src/pages/Format.jsx:95` sends `branch: 'main'` unconditionally.
  - Selected `inkscape/inkscape` (UI itself showed "master · Public"); stored generation record: `"branch": "main"`.
  - Server log: `fetchRepoFiles(gitlab, inkscape/inkscape): HTTP 404 … ?ref=main` → zero files fetched → template fallback.
- **Impact:** In production (AI enabled), every customer repo defaulting to `master`, `develop`, `trunk`, etc. gets fabricated sample content ("Payments API") instead of their code — while the run consumes document quota and Anthropic spend for nothing grounded. The catalogue **already knows** the right branch (`GET /hub/catalogue` returns `branch: "master"` for this repo).
- **Fix:** Pass the catalogue's `branch` for the selected repo in `Format.jsx` (and for `extraRepos`); server-side, on a 404 tree fetch, retry with the provider's reported default branch. Add a pipeline hard-fail (or at minimum a loud warning) when zero files are fetched for a repo the catalogue says exists.
- **Related:** There is **no primary/secondary branch selection anywhere in the generation wizard** (the only branch UI is the Automation wizard's watch-branch). If branch choice is an intended feature, it doesn't exist; the Source step should at least display and let users override the branch being documented.

### C2. Production code-host sign-in is broken until `CREDENTIAL_KEY` is set (configuration, code-verified)
Production fails closed on credential storage: with `CREDENTIAL_KEY` unset on Railway, `encryptSecret` throws on **any** `Source` write containing a token (`server/src/crypto.js:43-51`, Prisma middleware). The OAuth callback writes the access token to `Source` before issuing the session (`server/src/auth.js:502-511`), and its catch-all redirects to `/oauth/complete#error=Credential storage is not configured…` — **so "Continue with GitHub/GitLab/Bitbucket" fails for every user on production right now**, as does connecting Jira/Confluence/Notion (503 from `POST /api/sources`). Google sign-in (identity-only, no token write) is unaffected. Not live-tested (requires a real sign-in) but the code path is unambiguous. **Action:** set `CREDENTIAL_KEY` (64 hex) on Railway, then do one manual sign-in per provider to confirm.

## High

### H1. "Share quality report with team" fabricates success
Export page → toast: *"Report shared — Read-only link sent to your team workspace."* **No API call fires; nothing is sent to anyone** (`ExportPage.jsx:188-191` is toast-only). A customer will believe their team was notified. Remove the button or implement it; an honest "Copy link" would be fine.

### H2. "Re-check with AI judge" is a 600 ms sleep presented as verification
`POST /api/quality/:id/recheck` does `await sleep(600)` and returns the unchanged report (`server/src/api.js:1506-1511`), while the UI toasts *"AI judge re-confirmed — Overall score verified at 77/100 against the enterprise guideline set."* Doubly wrong: the on-page score still displayed 74 (see M6). Either make it re-run the judge or remove the button.

### H3. Deterministic judge marketed as "LLM-AS-A-JUDGE" with no disclosure on the page
The Quality page headlines "LLM-AS-A-JUDGE", "An LLM judge cross-examines this document…", "Evaluated by LLM judge". Per `CLAUDE.md`, `judge()` is deterministic heuristics and the simulation must be **disclosed in-product** — no disclosure appears anywhere on the Quality page (the ranking-outlook section, by contrast, discloses properly: "Modeled from your quality dimensions… capped below 100%"). Add the disclosure or wire a real LLM judge.

### H4. `docTypes` not validated → junk generations that consume quota
`POST /api/generations` with `docTypes: ["nonsense"]` returns **201**, runs the pipeline, produces an output cell `nonsense::dita`, and **consumes 1 document of quota**. Track and formats *are* validated (`Invalid track` / `Unknown format: bogus` → 400); doc types are not. Validate against the track's catalog list before reserving quota.

### H5. Reserved quota is never released
`releaseDocumentQuota` exists (`server/src/quota.js:79-83`) and is imported in `api.js`, but has **zero call sites**. Any failed, invalid (H4), or wrong-branch (C1) run permanently burns the month's document allowance. Release the reservation when a run ends `failed`, or when it completes with zero grounded input if you consider that a product failure.

### H6. GitHub public/org reads depend on unauthenticated API — 60 req/hr per IP
"Connect organisation" for GitHub failed with raw toast **"GitHub: HTTP 403"** because the machine's unauthenticated GitHub quota was exhausted. On Railway (shared egress IPs) this will hit real customers regularly, and the message gives no clue. GitLab/Bitbucket equivalents worked (separate, more generous limits). Fix: use a server-side app/installation token for public GitHub reads; on 403 with `x-ratelimit-remaining: 0`, show "GitHub rate limit reached — try again after HH:MM or connect a GitHub account."
*(Happy path retested after the window reset: org connect `prav99` → 201 with 5 live repos; `prav99/DocifyUI` added with live verify → connected/public/`main`. The GitHub path works — the finding stands as a rate-limit resilience + error-messaging issue.)*

### H7. Pricing-table entitlements are not enforced (verified live)
The pricing page promises tier differentiation that the backend never checks:
- **Free = "PDF + Word" exports, "All except DITA" for Starter** → a fresh free-plan account generated a **DITA** document successfully (`POST /api/generations`, 201). No plan gate exists on formats anywhere in `api.js`/`catalog.js`.
- **Free = "1 source"** → no source-count limit exists in `PLAN_LIMITS` or `POST /api/sources`.
- **Free = "5 documents, watermarked"** → watermarking is only a user-configurable output option (`exporters.js`); nothing forces it for free-plan output.
Only documents/month, pipelines, and seats are enforced (and those are enforced well). Either enforce the tiers or align the pricing table with reality — as written it both leaks paid value and, under the product's own honesty rule, overstates the differences between plans.

## Medium

### M1. Malformed JSON → 500
`POST /api/generations` with body `{broken` returns **500 "Internal server error"** (`entity.parse.failed` unhandled). Map body-parser errors to 400.

### M2. Code-host tokens stored unverified — false "Connected"
`POST /api/sources {provider:'github', token:'ghp_totally_fake'}` → 200, `connected: true`, and `/api/connections` reports GitHub connected. The lie surfaces only later in `/repos` ("token expired or revoked — reconnect"). Jira/Confluence/Notion verify at connect time; do the same for code hosts.

### M3. Source step: "No repositories available" while the catalogue holds 101 repos
With the GitHub tile selected and repos existing only under GitLab/Bitbucket, the panel claims there's nothing to connect (`Source.jsx:1023-1035` filters by selected provider; chips render only for selected hosts). The empty state should say "Your catalogue has 101 repositories under GitLab/Bitbucket — select those sources, or connect GitHub repos."

### M4. "Managed repositories" tab: "No repositories connected yet" right after syncing 100 org repos
Org-synced repos live only in the catalogue; the manual-registry tab doesn't say so. Confusing minutes after a successful org connect. Mention org-synced repos in the empty state.

### M5. Automation branch picker presents the fallback as real
With no account token, `GET /api/automation/branches` honestly returns `{branches:['main'], live:false}` — but the UI shows "main" under "Showing known branches" with no fallback indication, and ignores the catalogue's known default (`master`). A pipeline watching `main` on such a repo never triggers. Surface `live:false` ("Couldn't list branches — type yours") and seed the list with the catalogue's branch.

### M6. Quality page state desync after Apply fix
Server: 74 → 77, `fixed: true`, `regenerated: true`. UI: "Issues remaining" and "Fixes applied" update, but **Overall score stays 74**; the re-check toast then announces 77 while the page shows 74. Refresh the score tile from the fix response.

### M7. Judge false positives from raw markup + self-contradictory style checks
- "12 sentence(s) exceed 28 words (e.g., `<?xml version="1.0"…`)" — the judge measures raw DITA/XML as prose.
- Style list: "Structure: Overview — 1 occurrence — Add the mandatory 'Overview' section — **fail**" (the section exists; pass logic or copy inverted) — same for Authentication/Endpoints/Errors.
- Passive voice reported as both "41%" and "32%" in one report.

### M8. Completed generations show a crawling progress bar
Instant (template) completions render "Generation complete **4%**" → 66% → … while "All stages finished". Snap progress to 100 when status is `complete` (`Generate.jsx` smoothing).

## Low

- **L1.** "THE **DOCGEN** DIFFERENCE" on the Quality page — stale pre-rename brand.
- **L2.** Stale `<title>` on several routes: Dashboard and Source keep the previous page's title (e.g. "Start Free — Create Your Account" while on the dashboard); Landing/Repos/Quality set theirs correctly.
- **L3.** Accessibility: source/doc-type/format tiles are `<div>`s — no `role`, no `tabindex`, no keyboard path through the wizard. The Azure DevOps waitlist modal lacks `role="dialog"`/`aria-modal` (the Connect-repositories modal has them). The AI-assistant bubble can overlap the Continue button at ~660 px widths.
- **L4.** Login view's `<title>` says "Start Free — Create Your Account".
- **L5.** Template content nits: dangling duplicated sentence "It must be rotated every 90 days." in the rate-limits section; sample "Payments API" copy could name the selected repo (the honesty banner does disclose the sample nature — good).
- **L6.** Markdown downloads served as `text/plain` (prefer `text/markdown`).
- **L7.** Dead code: `client/src/pages/Marketing.jsx` (stub component named `Docs`, imported nowhere).

---

## What passed (condensed matrix)

| # | Scenario | Result |
|---|----------|--------|
| 1 | Email login (seeded demo account), session persistence, logout-free reload | ✅ |
| 2 | Source page: all 8 tiles render from `/api/catalog`; Azure DevOps gated to waitlist (invalid email rejected, valid email accepted) | ✅ |
| 3 | GitHub OAuth unconfigured (local) → honest toast with alternative path | ✅ |
| 4 | Production OAuth initiation ×4 (GitHub/GitLab/Bitbucket/Google): 302 to correct provider, signed 10-min state, Google PKCE S256 | ✅ |
| 5 | GitLab group connect (`gitlab-org`, 50 live repos) · Bitbucket workspace connect (`atlassian`, 50 live repos) | ✅ |
| 6 | Invalid GitLab group → `"…" was not found on GitLab` (400) | ✅ |
| 7 | Bulk repo add with live verify: `gitlab-org/gitlab-runner` → connected/public/`main`; `inkscape/inkscape` → connected/public/**`master`** (branch data is real, not hardcoded) | ✅ |
| 8 | Catalogue: 101 repos aggregated, deduped (org repo vs manual add), 60s cache + `?fresh=1` consistent | ✅ |
| 9 | Repo picker: org-grouped dropdown, real branches shown, stale-selection guard, `sel`/`extra` model | ✅ |
| 10 | Jira: empty-submit validation; fake site → "No Jira found at this site URL…" (live Atlassian call) | ✅ |
| 11 | Confluence: fake site → "No Confluence found at this site URL…" | ✅ |
| 12 | Notion: bad prefix → format hint; well-formed fake → "Notion rejected the token…" (live API) | ✅ |
| 13 | OpenAPI: Petstore URL inspected live — 19 endpoints, 6 schemas, auth schemes, tag tree, All/None/no-deprecated selection, "Valid ✓" | ✅ |
| 14 | OpenAPI negatives: HTML page → clear message; localhost URL → SSRF block | ✅ |
| 15 | Wizard transitions Source→DocType→Format→Generate with state intact; detour to /repos and back preserves everything; hard reload mid-wizard preserves everything | ✅ |
| 16 | All 7 technical doc types + all 4 marketing types selectable; track switch resets appropriately; "Select at least one" gate | ✅ |
| 17 | Custom instructions + auto scope note transported to backend verbatim | ✅ |
| 18 | Marketing brief (audience/emphasis/tone) stored on the generation record | ✅ |
| 19 | Formats: ordered multi-select; coming-soon tiles toast instead of selecting | ✅ |
| 20 | POST /generations correct payloads; 28/28 technical + 12/12 marketing output cells download with correct content types | ✅ |
| 21 | Template fallback honestly disclosed in-product ("AI grounding was not active for this run…"), `grounded:false` in API | ✅ |
| 22 | Quality report: content-aware findings, Apply fix persists (`fixed:true`, regenerated draft, score 74→77 server-side) | ✅ |
| 23 | Export: report PDF (3 presets, distinct sizes) / HTML / PPTX + main document download | ✅ |
| 24 | Quota ledger: 11 docs recorded for 2 runs (7+4), `GET /billing` live usage, resets monthly; 400-rejected requests don't consume quota | ✅ |
| 25 | Auth: no token → 401; nonexistent generation → 404; disconnect idempotent | ✅ |
| 26 | Prod: health OK (AI configured), HSTS + nosniff + frame-deny, demo-provider login blocked, SEO/JSON-LD injection present | ✅ |
| 27 | Mobile (375px): no horizontal overflow on landing/wizard; wide tables scroll in-container | ✅ |
| 28 | Server test suite | ✅ 34/34 |

---

## Security observations

1. **Set `CREDENTIAL_KEY` on Railway now** — see **C2**: code-host OAuth sign-in and all token-source connects are broken in production until it's set.
2. GitHub OAuth still requests classic `repo` scope (write-capable grant for a read-only product) — known open item; GitHub App migration remains the right fix.
3. Local dev stores provider tokens in plaintext with a clear `[security]` boot warning — good warning hygiene.
4. SSRF guards verified working (OpenAPI URL, localhost blocked). OAuth `state` is a signed short-lived JWT. JWT in `localStorage` is an accepted XSS trade-off worth revisiting later (httpOnly cookie).
5. Rate limits present: 600/min API, 30/min auth, 120/min generations, 20/min per-account AI ops.

---

## UX recommendations (beyond the bugs above)

1. **Show the branch everywhere a repo is shown** in the wizard ("From inkscape/inkscape (master)") — it's the single most trust-building fix after C1.
2. Humanize provider errors: map `GitHub: HTTP 403` → rate-limit explanation with retry time; keep the raw code in a details line.
3. Keyboard/AT support for the tile pattern (role="checkbox"/"radio", tabindex, Enter/Space, `aria-selected`) — currently the wizard cannot be completed without a mouse.
4. Snap the progress bar on completion and drop the ETA once done (M8).
5. Consolidate the two "repositories" mental models (Connections vs Managed vs catalogue) — two different empty states claimed "nothing connected" moments after a successful 100-repo sync (M3/M4).
6. Set per-route `<title>`s (helps history/bookmarks/tabs and analytics too).
7. ~~Seed data leaking to new users~~ — verified fine: a fresh signup gets free plan, 0/5 documents, zero generations; the seeded history belongs only to the demo account.

---

## Coverage gaps (what this QA could not exercise, and how to close each)

| Gap | Why | How to close |
|---|---|---|
| OAuth completion (all 4 providers) | Requires real account credentials; only initiation was verified (local + prod) | Founder: one manual sign-in per provider on prod **after setting `CREDENTIAL_KEY`** |
| Jira/Confluence/Notion happy-path listing (projects/spaces/pages) | Requires real tokens; negative paths verified live, adapters are real REST calls | Founder: connect own Atlassian/Notion accounts once |
| Grounded (AI) generation quality | No `ANTHROPIC_API_KEY` locally by design; prod generation would bill | After C1 fix: one prod smoke run on a `master`-default repo; check `[ai]` logs for `cacheRead>0` |
| Webhook delivery (HMAC, replay) | Covered by unit tests + code review only | Fire a test webhook from a real GitHub repo |
| Payments | Simulated by design (`adapters/stripe.js`) | N/A until a real PSP lands |
| ~~GitHub public-repo happy path~~ | ~~Blocked by unauthenticated rate limit~~ — **closed**: retested after reset, org + repo connect both pass with live data | Done |

---

*Generated during a live QA session; local dev server, demo account `demo@acme.dev`. Two QA artifacts remain in the local dev DB: generations `cmsahuere…` (7×4 technical) and `cmsai0gva…` (4×3 marketing), plus junk-validation run `cmsai1uqc…`, GitLab/Bitbucket org connections, and 2 managed repos — safe to keep or clear with `npm run db:reset`.*
