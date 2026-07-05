# DocGen — Consolidated E2E Testing Report

**Date:** 2026-07-05 · **Tester:** Claude (automated browser + API testing) · **App version:** local `main`

## 1. Test objective

Validate the complete DocGen workflow end-to-end: authentication via code hosts (GitHub / GitLab / Bitbucket), source configuration, documentation generation for every supported document type, export in every supported format, download integrity, AI quality/compatibility review, and the fix → re-check loop.

## 2. Source repository details

The app currently runs with **simulated source adapters** (no OAuth keys configured), so testing used the built-in sample repositories: `acme/checkout-web` (GitLab, primary), `acme/mobile-gateway` (Bitbucket), `acme/payments-api` (GitHub). Real external test repositories were **not** created — see Issue #2: the generation engine does not read repository content yet, so identical output would result from any real repo.

## 3. Test environment

Client: React 18 + Vite dev server, http://localhost:5173 (Chrome). API: Express + Prisma/SQLite, http://localhost:4000, Node 18+, macOS. Account: simulated OAuth identity `praveen@acme.dev`.

## 4. Results — authentication & source platforms

| Test | GitHub | GitLab | Bitbucket |
|---|---|---|---|
| "Continue with …" signup/login | ✅ Pass | ✅ Pass | ✅ Pass |
| Provider auto-connected as source | ✅ Pass | ✅ Pass | ✅ Pass |
| Repo/project picker lists repos | ✅ Pass (sample) | ✅ Pass (sample) | ✅ Pass (sample) |
| Source marked Ready after repo pick | ✅ Pass | ✅ Pass | ✅ Pass |

All three flows are **simulated** (no OAuth apps registered). Real OAuth code paths (authorize → callback → token exchange → refresh) exist for all three providers and were verified by code review; they activate when client IDs/secrets are added to `server/.env`.

## 5. Results — document types (11 of 11 pass)

Each type generated individually to completion (`status: complete`, valid title, H1 + 4–7 H2 sections):

| Track | Type | Status | Sections |
|---|---|---|---|
| Technical | API reference | ✅ | 7 |
| Technical | User guide | ✅ | 7 |
| Technical | Installation & setup guide | ✅ | 7 |
| Technical | Quick start guide | ✅ | 7 |
| Technical | Troubleshooting & FAQ | ✅ | 6 |
| Technical | Release notes / changelog | ✅ | 5 |
| Technical | Admin & configuration guide | ✅ | 5 |
| Marketing | Release announcement | ✅ | 5 |
| Marketing | Feature one-pager | ✅ | 5 |
| Marketing | Social / launch copy | ✅ | 4 |
| Marketing | Customer-facing changelog | ✅ | 5 |

## 6. Results — export formats (12 of 12 supported pass; 2 correctly rejected)

Every download returned HTTP 200 with the correct MIME type, filename, and verified internal structure:

| Format | MIME | Integrity check | Result |
|---|---|---|---|
| PDF (tech + mktg) | application/pdf | `%PDF-` magic + `%%EOF` | ✅ |
| Word .docx (tech + mktg) | …wordprocessingml.document | Valid ZIP (PK) container | ✅ |
| Markdown (tech + mktg) | text/plain | H1/H2, tables, code fences, links | ✅ |
| HTML / Web Help | text/html | DOCTYPE, h1, table, code blocks | ✅ |
| HTML landing snippet | text/html | — | ✅ |
| Email/newsletter HTML | text/html | — | ✅ |
| DITA | application/xml | Parses as XML, `<topic>` root | ✅ |
| DocBook 5.0 | application/xml | Parses as XML, `<article>` root | ✅ |
| ePub (XHTML) | application/xhtml+xml | Parses as valid XHTML | ✅ |
| Social post pack | — | Rejected with clean error | ✅ (by design) |
| PPTX deck | — | Rejected with clean error | ✅ (by design) |

Content formatting inside documents verified: headings hierarchy, tables (with separator rows), fenced code blocks, and inline links all present and well-formed. Link integrity checker also ran (2 of 47 links flagged: one 404, one timeout — intentional demo findings).

## 7. Results — AI compatibility review

| Check | Result |
|---|---|
| AI readiness / overall score | ✅ Initial 70/100 ("Review recommended") |
| Score dimensions (weighted) | ✅ Style 76 · Consistency 100 · Completeness 100 · Readability 100 · LLM readiness 100 · Link integrity 72 |
| Issue detection | ✅ 10 findings across categories |
| Fix workflow ("Fix all") | ✅ Applied 10/10 → score 92/100, "Publish-ready", LLM readiness 100 |
| Re-check with AI judge | ✅ Re-confirmed 92/100 via toast |
| AI discoverability / citation potential | ✅ Per-model landing estimates: ChatGPT 94%, Claude 97%, Gemini 84% ("Likely to land") |
| Judge notes / recommendations | ✅ Narrative guidance rendered |
| AI consumability report download | ✅ HTTP 200, 9.3 KB HTML |

## 8. Issues found

1. **[High] Multi-document sets generate only the first document.** Selecting several doc types shows "7 documents in this set", but `generateDocument()` in `server/src/adapters/llm.js` uses `docTypes[0]` only — content, preview, and download cover just the first type. Workaround: generate one type per run. Fix: loop over `docTypes` and concatenate/zip the set.
2. **[Blocker for real-world use — known design state] Generation does not read source code.** Content is templated ("Payments API 2.4.0") regardless of the selected repo — e.g. `acme/checkout-web` produced Payments API docs. Real accuracy testing against a live GitHub/GitLab/Bitbucket repo is impossible until the mock LLM adapter is replaced with a real code-reading pipeline.
3. **[Medium] Transient logged-out flash / redirect to landing page.** During quality review, the app briefly rendered a logged-out "Loading…" state and once navigated to `/`. State recovered on re-navigation (wizard data survived). Likely an auth-guard race on `/auth/me`; worth investigating.
4. **[Low] Simulated OAuth uses one hardcoded identity** (`praveen@acme.dev`) for all three providers — fine for demos, confusing if mistaken for real auth.
5. **[Low] Quality review is deterministic** — every generation starts at 70/100 with the same 10 findings (mock judge).

## 9. Recommendations

1. Fix the `docTypes[0]` defect so multi-type sets actually produce a set (highest impact, small change).
2. Replace `adapters/llm.js` with a real Anthropic API integration that ingests repository files, and register OAuth apps for the three providers — then repeat this test with a real open-source repo (e.g. a mid-size Express or FastAPI project) pushed to `test_repo` on each platform.
3. Investigate the auth-guard flash/redirect (Issue #3).
4. Distinguish simulated vs real login visually so demo mode is obvious.
5. After real integration, re-run this exact matrix — the test harness (API calls) is reproducible from this report.

## 10. Conclusion

**The product's full workflow passes end-to-end in its current (simulated-source) state: 3/3 login platforms, 11/11 document types, 12/12 supported export formats with verified file integrity, and a complete, functioning AI-compatibility loop (score → findings → fixes → re-check → per-model citation outlook).** One functional defect was found (multi-doc sets, Issue #1). Testing against real GitHub/Bitbucket/GitLab repositories is not yet meaningful because generation is mocked; Issues #1–2 are the gate to a true production-readiness test.
