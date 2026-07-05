# DocGen Automation Wizard — End-to-End Live Test Report

| | |
|---|---|
| **Date** | 2026-07-05 |
| **Tester** | Praveen Jha (praveen.jha004@gmail.com), signed in as `praveen@acme.dev` |
| **App under test** | DocGen — `http://localhost:5173/automation` (API on `:4000`) |
| **Scope** | Automation Wizard: merge-to-main → automatic documentation generation, across GitHub, GitLab, Bitbucket; all output formats; all document types; update-vs-duplicate behavior; AI quality checks |
| **Overall verdict** | **PARTIAL PASS** — orchestration, triggering, security, dedup/update logic and format outputs all work; **two code defects and one robustness gap prevent AI-grounded content from reaching published automation output** (details in Findings) |

---

## 1. Test objective

Validate, as a real customer, that a user can connect a source repository, work on a secondary branch, merge to `main`, and have the system automatically generate (or correctly update) documentation — across all supported source platforms, output formats and document types — and that AI quality checks run on the result.

## 2. Environment constraints (disclosed)

The local install has no OAuth apps registered, so the three code-host Sources are "connected" **without tokens**, and `localhost` is not reachable by cloud webhooks. The test therefore used the **live-equivalent path**: real open-source codebases, real git branch/commit/merge operations performed locally, and the *exact* webhook payloads each platform sends on merge, delivered to the app's real webhook endpoint with its real per-pipeline authentication (HMAC-SHA256 for GitHub, `X-Gitlab-Token` for GitLab, `?token=` for Bitbucket). This exercises 100 % of the product's automation code path; only the HTTP caller differs from production.

Because the wizard's repository dropdown only lists sample repos without OAuth (Finding F1), the pipeline's repository was set to the real public repo via the app's own `PUT /api/profiles/:id` API after creating the pipeline in the UI.

## 3. Test repositories

| Platform | Repository | Why | Branch merged |
|---|---|---|---|
| GitHub | `expressjs/express` (first attempt), **`fastify/fastify`** (primary) | Large, real OSS codebases; express exposed a silent-fallback defect because its upstream default branch is `master`, not `main` | `feature/reply-trailer-docs` → `main` |
| GitLab | `gitlab-org/cli` | Real public GitLab project, default branch `main`; used a **genuinely merged MR** (!3483, merged 2026-07-03) | `uc/update-stage-for-docs` → `main` |
| Bitbucket | `atlassian/aui` | Real public Bitbucket repo (default branch `master` — no suitable public `main`-based repo found) | latest real commit `94f54d9b83d3` on `master` |

## 4. Branch & merge details (GitHub leg — real git operations)

```
Repo:    fastify/fastify (cloned, real code)
Branch:  feature/reply-trailer-docs (created from main)
Change:  lib/reply.js  — trailer-validation comment hardening
         README.md     — new "Trailer header validation" section
Commit:  db609df  feat(reply): document hardened trailer validation
Merge:   baaa118b34b1e03e4b67ccce2eb67adf78793627 (--no-ff, "Merge pull request #5902 …") into main
Files:   README.md, lib/reply.js
```
The express run used the same flow (merge commit `6410fe30d49e…`, files `Readme.md`, `lib/response.js`).

## 5. Wizard walkthrough (UI)

All six steps completed as a customer would: **1 Repository** (GitHub/GitLab/Bitbucket chips work; repo dropdown — see F1) → **2 Branch** (`main`; patterns like `release/*` supported; "showing known branches" fallback without OAuth) → **3 Merge triggers** (pushes + merged PRs toggles, optional path filter) → **4 Documents** (technical/marketing tracks, 7 + 4 doc types, format, update policy, versioning strategy) → **5 AI quality & ranking** (gate 85, min AI ranking, auto-fix, approval) → **6 Publish & notify** (destination, email, event toggles, name). Pipeline created Active with webhook URL + secret + "Simulate a merge" buttons. Live preview panel updates correctly at every step. **PASS**

## 6. Did automation trigger on merge? — YES (all platforms)

| Platform | Auth mechanism | Webhook response | Run result |
|---|---|---|---|
| GitHub (fastify, merge `baaa118b`) | `X-Hub-Signature-256` HMAC verified | `{ok:true, action:"regenerating"}` | complete · **create** · 92/100 · **published** |
| GitLab (cli, merge `53a036e0`) | `X-Gitlab-Token` verified | `{ok:true, action:"regenerating"}` | complete · **create** · 92/100 · **published** |
| Bitbucket (aui, commit `94f54d9b83d3`) | `?token=` verified | `{ok:true, action:"regenerating"}` | complete · **create** · 92/100 · **published** |

Negative / security tests — all behaved correctly:

* Bad HMAC signature → **401** `Signature verification failed`
* Push to the secondary branch (`feature/reply-trailer-docs`) → ignored: *"Branch … does not match watched main"* (confirms only merges to `main` trigger)
* Unknown webhook id → **404**
* Paused profile and disabled event types are also ignored by design (code-verified)

## 7. Output formats

| Format | Automation run | Downloaded file validated |
|---|---|---|
| Markdown | ✅ published | `.md` text, correct structure |
| PDF | ✅ published | real PDF (`%PDF-1.3`, 8.3 KB, built by pdfkit) |
| Word | ✅ published | real OOXML (`PK…` zip, `.docx`, 10.8 KB) |
| HTML | ✅ published | `<!DOCTYPE html>` standalone page |
| DITA | ✅ published | `<?xml…><topic id=…><title><body>` — genuine DITA topic |
| Marketing PDF | ✅ published | real PDF |
| DocBook, ePub | listed & enabled in catalog (not individually run) | — |
| PPTX / social pack | correctly rejected: HTTP 400 *"not currently supported…future release"* | — |

**PASS** — every requested format generates and downloads as a genuine file of that type.

## 8. Document types

Technical: **API reference, User guide, Installation & setup, Quick start, Troubleshooting & FAQ, Release notes/changelog, Admin & configuration** — all generate (API+User guide via automation; all seven via generation engine). Marketing: **Feature one-pager, Release announcement, Social/launch copy, Customer-facing changelog** — all generate; marketing run produced genuinely AI-grounded fastify content (15.6 KB of grounded sections). Note: there is no doc type literally named "README" or "Product overview" — closest equivalents are Quick start/Overview sections and the marketing one-pager. **PASS (with naming note)**

## 9. Existing-document update behavior (no duplicates)

Mapping key = (repository, primary doc type, format). Observed decisions, all correct and each with a human-readable reason in run history:

| Merge | Decision | Evidence |
|---|---|---|
| 1st merge (no mapping) | **create** — "No document is mapped to fastify/fastify · api · markdown yet" | new generation created |
| 2nd merge, same mapping | **sections** — "2 changed file(s) map to: Overview — regenerating the mapped document with those sections refreshed" | **same** generation id updated; total generation count unchanged (50 → 50) — **no duplicate** |
| Release-style merge ("release: v3.1.0") | **version** — "Merge metadata indicates a release — a new version preserves the published history"; version bumped 2.4.0 → 2.4.1 (semver-patch as configured) | versioned copy |
| Policies | `auto` (intelligent), `update`, `version`, `create` all selectable in wizard | code-verified |

**PASS** for decision logic and dedup. **FAIL** for content fidelity of the update — see F2: the in-place update overwrote a real AI-generated document with template boilerplate.

## 10. AI checks

The AI quality review runs automatically inside every pipeline execution and is visible per-document (Quality page) and per-run (run history + downloadable HTML/JSON report):

* **Overall content-quality score & verdict**: 92/100, "Publish-ready", gate ≥ 85 passed
* **Six dimensions**: LLM readiness 100 (w 27 %), Completeness 100, Readability 100, Consistency 100 (accuracy proxy), Style & editorial 76, Link integrity 72
* **AI discoverability / assistant ranking**: ChatGPT 96 (≈94 % retrieval likelihood), Claude 100 (≈97 %), Gemini 90 (≈84 %) — UI honestly labels these as modeled estimates, no live third-party calls
* **Recommendations**: 10 issues with concrete fixes (short description, search-optimized title, metadata keywords, heading hierarchy, alt text, …); auto-fix applied all 10 and re-scored
* Report exports as reviewer HTML and CI-friendly JSON — both verified

**PASS on presence and plumbing** — but see F6: the issue list is hard-coded demo data, not derived from the actual document.

## 11. Findings

| # | Severity | Finding | Evidence | Recommended fix |
|---|---|---|---|---|
| **F1** | High (UX/config) | Wizard Step 1 repo dropdown only lists sample repos when no OAuth token exists; no manual `owner/name` entry, although the Source page has one and the backend fully supports public repos unauthenticated | dropdown showed only `acme/*`; profile repo had to be set via the app's own API | Add "or any public repository (owner/name)" input to wizard Step 1 (parity with Source page) |
| **F2** | **Critical (bug)** | Automation's auto-fix step (`profileRun`, `server/src/api.js` ≈ line 808) re-renders with `generateDocument(genArgs)` **without the `aiDocs`** that `runPipeline` just produced → every auto-fix-enabled pipeline **overwrites real AI-grounded content with "Payments API" template boilerplate** | DB: gen `cmr7db9ys…` has `aiDocs` = 18,718 B (real fastify content) but `content` = 5,047 B boilerplate after the automation update | After `runPipeline`, re-read the generation and pass `aiDocs: j(genRow.aiDocs, [])` into the fix re-render genArgs (both content and preview calls) |
| **F3** | **Critical (bug)** | `profileRun` omits `provider` when creating/updating the Generation row → Prisma default `'github'` → **GitLab and Bitbucket pipelines fetch repo files from the wrong host** and always fall back to template content | DB: GitLab run gen has `provider='github'`, repo `gitlab-org/cli`; same for `atlassian/aui` | Add `provider: cfg.provider` to the `data` object in `profileRun` |
| **F4** | High (robustness) | Repo-file fetching is unauthenticated (GitHub 60 req/h limit; ~13 requests per run). Under parallel runs (4 simultaneous pipelines) fetches fail and the engine **silently** publishes template output — the run history shows "published 92/100" with no hint that content wasn't repo-grounded | 4 concurrent GitHub format runs: `aiDocs='[]'`; single sequential runs succeeded | Use the connected Source token (or a server token) for API calls; add retry/backoff; record "generated from N repository files" vs "template fallback" on each run and warn |
| **F5** | Medium | If the watched branch doesn't exist upstream (e.g., `expressjs/express` has `master`, wizard assumed `main`), generation silently falls back to boilerplate; no validation or warning at pipeline save time | express run published boilerplate at 92/100 | Validate repo/branch reachability when saving the pipeline; surface fetch failures in run history |
| **F6** | High (product honesty) | `judge()` (`server/src/adapters/llm.js:1330`) returns a **hard-coded** issue list; scores are static (every run: 92 overall, ChatGPT 94/Claude 97/Gemini 84) and recommendations reference "Payments API" regardless of the actual document | identical scores across express/fastify/cli/aui runs; issue fix-texts mention Payments API | Drive the judge from the actual document (heuristics on real content, or LLM-as-judge using the already-configured Anthropic key) |
| F7 | Low | Release-merge versioning uses the configured strategy base (2.4.0 → 2.4.1) rather than the version in the merge message ("v3.1.0") | run `cmr7e101c…` | Consider parsing the release version from merge metadata |
| F8 | Low | A generation left a renderer-freezing poll loop on the Generate page during testing (tab became unresponsive; recovered in a fresh tab) | observed once | Investigate Generate-page polling |

Positives worth calling out: webhook security is properly implemented (timing-safe HMAC, per-pipeline rotatable secrets, three provider auth styles); event normalization handles GitHub push & merged-PR, GitLab push, Bitbucket push, and a generic CI payload; branch patterns, event toggles and path filters all enforce correctly; the create/update/sections/version decision engine is genuinely intelligent and always explains *why*; every export is a real file of its declared type; run history, insights, notifications and approval flow all function.

## 12. Pass/fail summary

| Requirement | Status |
|---|---|
| Wizard completes 6 steps; pipeline created & active | ✅ PASS |
| Real OSS codebase, 3–4+ pages of documentation | ✅ PASS (fastify docs sets: 13–17 KB ≈ 6–10 pages) |
| Secondary branch → real changes → commit → merge to main | ✅ PASS (real git, real SHAs) |
| Automation triggers automatically after merge | ✅ PASS (all 3 platforms; secondary-branch pushes correctly ignored) |
| Formats: PDF / Word / Markdown / HTML / DITA | ✅ PASS (genuine files) |
| Technical + marketing document types | ✅ PASS (all 11 types generate) |
| Existing doc detected & updated, no duplicates | ✅ PASS (mechanics) / ❌ FAIL (content fidelity — F2) |
| GitHub / GitLab / Bitbucket end-to-end | ✅ PASS (trigger & publish) / ❌ FAIL (repo-grounded content on GitLab & Bitbucket — F3) |
| AI checks (compatibility, quality, accuracy, completeness, structure, discoverability, recommendations) | ⚠️ PARTIAL (all present & wired; scores are static demo data — F6) |

## 13. Conclusion

The Automation Wizard's **orchestration layer is production-shaped and works**: a merge to `main` on any of the three platforms reliably and securely triggers the configured pipeline, the intelligent update engine prevents duplicate documents and explains every decision, all five requested output formats emerge as genuine files, and the AI-review/publish-gate/notify chain executes end to end.

However, **the product's core promise — documentation generated from the merged code — is currently broken in the automation path**: F2 overwrites AI-grounded content with boilerplate whenever auto-fix is on, F3 makes GitLab/Bitbucket pipelines fetch from the wrong host entirely, and F4/F5 silently degrade to boilerplate under rate limits or branch mismatches while still reporting "published 92/100". The same engine demonstrably produces excellent repo-grounded content in the direct Generate flow, so the fixes are small and well-localized (two one-line-class changes for F2/F3).

**Recommendation: fix F2 and F3 before any release; add the F4/F5 transparency warnings; replace the static judge (F6) next.** With F2/F3 patched, this flow would merit a full PASS.

---
*Method note: all webhook deliveries used the app's real endpoint and real per-pipeline secrets; GitHub merge events came from actual local git merges of the real repository, and the GitLab event reproduced an actually-merged upstream MR (!3483). Screenshots were captured throughout the session (wizard steps 1–6, pipeline page with webhook config, run history with commit SHA, dashboard, AI quality review with dimension scores and assistant rankings). Raw evidence (run JSON, DB extracts, file signatures) is embedded in the tables above.*

---

# ADDENDUM — Fixes applied and re-verified (same session)

All findings were fixed in code and re-verified live. Two additional defects surfaced during fixing (F9, F10).

| # | Fix | File(s) | Verified |
|---|---|---|---|
| F1 | Wizard Step 1 now accepts any public repository (`owner/name` input, parity with Source page) | `client/src/pages/Automation.jsx` | ✅ visible in wizard (hot-reload) |
| F2 | Auto-fix re-render now passes the stored `aiDocs` through, so AI-grounded content survives publishing | `server/src/api.js` (`profileRun`) | ✅ Bitbucket run published 8.5 KB of real AUI content (53 domain refs, no boilerplate); GitHub run published 21.4 KB of real fastify content |
| F3 | `profileRun` now stores the pipeline's `provider` on the Generation | `server/src/api.js` | ✅ DB rows show `gitlab` / `bitbucket`; both platforms fetched from the correct host |
| F4 | Repo-file fetches retry with exponential backoff on 403/429/5xx, honoring `Retry-After` / `X-RateLimit-Reset` | `server/src/adapters/repofiles.js` | ✅ code-reviewed; GitHub run grounded on the next window after quota exhaustion |
| F4/F5 | Every run records `grounded` provenance; run history shows a red **“Template fallback”** tag + explanation instead of silently publishing boilerplate | `server/src/api.js`, `client/src/pages/Automation.jsx` | ✅ rate-limited GitHub run displayed `grounded:false` honestly; grounded runs show `grounded:true` |
| F6 | `judge()` is now content-aware: short description, title quality, keywords, sentence length, code examples, prerequisites, limitations, duplicate paragraphs, terminology, real link extraction, and measured style checks run against the actual document | `server/src/adapters/llm.js` | ✅ scores now vary (98 for grounded fastify docs, 93 real marketing doc, 85 sparse doc — no more constant 92); recommendations reference the real repo |
| F7 | Release merges naming a version (“release: v3.1.0”) version the doc as 3.1.0 instead of blind semver bump | `server/src/api.js` | ✅ code-verified |
| **F9 (new)** | GitLab recursive tree API lists directories first; only page 1 was read, so sizable GitLab repos (460+ dirs in `gitlab-org/cli`) never yielded files → paginated up to 6 pages / 60 files | `server/src/adapters/repofiles.js` | ✅ GitLab run now grounded: 9 KB of real `glab` CLI content, 145 domain refs |
| **F10 (new)** | `.env` was loaded from the process CWD — restarting the server from any other directory silently dropped `ANTHROPIC_API_KEY` and degraded ALL generations to templates. Now loaded relative to the server package (`src/env.js`, first import in `index.js` and `cluster.js`), with a startup warning when the key is missing | `server/src/env.js` (new), `server/src/index.js`, `server/src/cluster.js` | ✅ reproduced the failure after restart #2, fixed, re-verified after restart #3 |
| — | Auto-applied “keywords” fix no longer inserts canned payments keywords on AI-grounded docs; derives them from the repo + doc types | `server/src/adapters/llm.js` | ✅ unit-verified (“Keywords: aui, api, documentation, reference.”) |
| **F11 (new)** | AI output was truncated at `max_tokens: 4096` on verbose repos, producing unparseable JSON (server logs: “Unterminated string in JSON at position 13010”) → silent template fallback. Fixed: 8192-token budget, salvage of all complete sections from truncated output, per-doc-type isolation with one retry | `server/src/adapters/llm.js` | ✅ Flask pipeline (previously failed twice) now publishes grounded content: 98/100, 9.2 KB, 55 Flask refs |
| **F12 (new)** | A regeneration that failed to ground would overwrite a previously grounded document AND wipe its stored `aiDocs` (data loss). Now an update keeps the existing grounded sections and re-renders from them instead of degrading | `server/src/api.js` (`runPipeline`) | ✅ code-verified; guard exercised in Flask re-test |

**Final post-fix verification (merge-to-main webhooks, one per platform):**

| Platform | Run | Content |
|---|---|---|
| GitHub (`fastify/fastify`) | sections-update · **98/100** · published · `grounded: true` | 21.4 KB, 200 fastify/reply/plugin refs, no boilerplate |
| GitLab (`gitlab-org/cli`) | sections-update · published · `grounded: true` | 9.1 KB, 145 glab/CLI refs, no boilerplate |
| Bitbucket (`atlassian/aui`) | update · published · `grounded: true` | 8.5 KB, 53 AUI/Atlassian refs, no boilerplate |

**Post-fix verdict: PASS.** Merge-to-main documentation automation now publishes genuinely repo-grounded, content-scored documentation across GitHub, GitLab, and Bitbucket, and reports honestly when it cannot.

Remaining known limitations (acceptable, documented): unauthenticated GitHub API allows ~4 pipeline runs/hour per IP (connect OAuth or add a server token to lift); DocBook/ePub formats exist but were not individually exercised; F8 (one-off renderer freeze on the Generate page) was not reproducible and no code defect was found.
