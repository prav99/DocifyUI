# DocGen — Source Integrations (Jira · Confluence · Notion · OpenAPI/Swagger) — Live E2E Report

**Date:** 2026-07-05 · **Tester:** Claude (live browser + API testing, real provider endpoints) · **Page under test:** `http://localhost:5173/source`

## 1. Scope

Make the four non-code sources fully configurable with a seamless customer experience, then verify end to end **live** (real Notion workspace, real Atlassian cloud, real public OpenAPI specs) through both the UI and the API (`POST /api/sources`, `GET /api/repos`, `DELETE /api/sources/:provider`).

## 2. Changes made

### Server
- **`adapters/atlassian.js`** — `normalizeSite()` accepts anything a user pastes (`yourteam.atlassian.net`, full page URLs with paths/query, trailing slashes) and normalizes to the site origin; per-status error messages (401 auth / 403 permission / 404 wrong site / non-JSON response / unreachable host) that say exactly what to fix, including where to create an API token; `verifyJira`/`verifyConfluence` now return `{ site, account }` so the UI can show who connected; project/space lists raised to 50 items.
- **`adapters/openapi.js`** — YAML support (OpenAPI 3.x and Swagger 2.0) via a dependency-free YAML probe; scheme-less URLs auto-fixed (`petstore3.swagger.io/…` works); distinct errors for HTML pages, non-spec JSON, auth-protected specs, 404s, unreachable hosts; returns `{ title, version, specVersion, format, endpoints }`.
- **`adapters/notion.js`** — token format pre-check (`ntn_`/`secret_` prefix) with a pointer to notion.so/profile/integrations; per-status errors (401 bad token, 403 missing capability); returns the integration name; search page size raised to 50; guidance about sharing pages with the integration in the empty-list error.
- **`api.js`** — `POST /sources` stores the **normalized** site/spec URL and returns verification `info` to the client; **new** `DELETE /sources/:provider` so users can change credentials.

### Client (`pages/Source.jsx`)
- Connected state shows **who** connected ("Connected as DocGen") plus a **Change credentials** action (disconnect → re-enter).
- Pick-list reloads automatically after (re)connect; empty lists get a contextual hint (e.g. "Share a page with your integration…") and a **Reload list** button.
- Per-provider help text under the forms (where to create Atlassian API tokens / Notion integrations).
- Spec URL field accepts JSON or YAML, tolerates a missing `https://`, validates on Enter; success toast shows title, version, endpoint count, and format.
- Buttons show busy state ("Verifying…", "Validating…").

## 3. Live test results

### OpenAPI / Swagger — full success paths (live internet)
| Test | Input | Result |
|---|---|---|
| JSON spec, scheme-less URL | `petstore3.swagger.io/api/v3/openapi.json` | ✅ "Swagger Petstore – OpenAPI 3.0 v1.0.27 · 13 endpoints" → Ready ✓ |
| YAML spec | `petstore3.swagger.io/api/v3/openapi.yaml` | ✅ "…13 endpoints · YAML" → Ready ✓ |
| Change spec flow | Change → new URL → validate | ✅ |
| Dead URL (real 404) | raw.githubusercontent.com (moved file) | ✅ "Could not fetch the spec (HTTP 404) — check the URL" |
| HTML page, not a spec | `https://www.google.com` | ✅ "That URL returned a web page, not a spec…" |
| JSON but not a spec | `https://api.github.com/` | ✅ "…no 'openapi' or 'swagger' field" |

### Notion — full success paths (live, real workspace)
| Test | Result |
|---|---|
| Created internal integration "DocGen" in Praveen's workspace, shared with the "Notes" page | ✅ |
| Connect with real token | ✅ Toast "Notion connected — Verified as DocGen"; card shows "Connected as DocGen" |
| Live pick-list | ✅ Real content listed: "Notes (database)", "Remember to follow up on these (page)", "Q2 planning — rough thoughts (page)" with last-edited dates |
| Select database → Ready | ✅ |
| **Change credentials** (disconnect) | ✅ Source deleted server-side, form returns |
| Reconnect + re-select | ✅ list reloads automatically |
| Invalid token (real 401 from api.notion.com) | ✅ "Notion rejected the token — check the integration token…" |
| Malformed token (caught before network) | ✅ "…should start with 'ntn_' or 'secret_'…" |

### Jira & Confluence — live against real Atlassian cloud
| Test | Result |
|---|---|
| Wrong creds vs real site (`monkeytype.atlassian.net`) → real 401 | ✅ "Authentication failed — check the account email and API token (create one at id.atlassian.com → Security → API tokens)" |
| Pasted full page URL (`…atlassian.net/wiki/home`) | ✅ path stripped, request hit the right endpoint |
| Garbage URL (`not a url`) | ✅ "That does not look like a valid URL — expected something like https://yourteam.atlassian.net" |
| Missing fields | ✅ "Jira needs the site URL, your Atlassian account email, and an API token" |
| Unreachable site | ✅ "Could not reach https://… — check the site URL and your network" |
| Success path (real site + API token) | ⏳ pending Atlassian one-time passcode (identity step-up) |

### Parser/unit checks (sandbox, local fixtures)
JSON OpenAPI 3 / YAML OpenAPI 3 / YAML Swagger 2 / HTML page / non-spec JSON / 404 — **6/6 pass**. `node --check` on `api.js` and Babel JSX parse of `Source.jsx` — clean.

## 4. Notes

- Tokens are verified server-side against the provider **before** being saved; the browser never keeps the token in state after connect.
- The Notion integration "DocGen" and any Atlassian API token created for this test can be revoked at notion.so/profile/integrations and id.atlassian.com → Security → API tokens.
- Atlassian Basic credentials are stored as `email:token` in the local SQLite DB — encrypt at rest before production.
