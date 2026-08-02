# Docify — Product Intelligence & Polish Pass

**Date:** 2 Aug 2026 · **Scope:** repository intelligence, pre-generation guidance, and an enterprise-polish sweep.
**Result:** 19 files changed (+2,610 / −331), 2 new files. **44/44 tests · full wizard verified end-to-end · intelligence verified live against real repositories.**
**Committed locally in 4 commits (baseline `e6c6ac6` → `d1daeb1`). Nothing pushed.**

---

## What was built

### 1 · Repository intelligence (new)
`server/src/adapters/repointel.js` + `GET /api/hub/intel`. Reads a repository's file tree and returns an **evidence-backed** profile: languages (by file counts), frameworks (parsed from real manifests — `package.json`, `go.mod`, `requirements.txt`, `Cargo.toml`, `pom.xml`, `Gemfile`, never guessed from folder names), package managers, API specs, monorepo/workspaces, services, deployment type, docs folders, and a set of plain-language **signals**.

Verified live:
- `gitlab-org/cli` → Go, **Cobra** (detected from the actual `go.mod`), Go modules, existing `docs/` folder.
- `gitlab-org/gitlab-runner` → Go, 240 files, honest "file list is partial" note.
- `inkscape/inkscape` requested on `main` → correctly resolved to the real default `master` and analyzed it.

It resolves the real default branch (the same bug we fixed in generation), caps its provider calls, caches per repo, coalesces concurrent callers, and **always returns 200** — a failed analysis degrades a panel, never a page.

### 2 · The insights panel (new)
`client/src/RepoInsights.jsx`, shown in the Source step under the chosen repository. Detected languages/frameworks as chips, at most four signals, evidence on demand. It loads only *after* a repo is picked, is debounced, cancels stale responses, and never blocks Continue. If a spec is detected, a one-click **"add this spec as a source"** genuinely wires it into the existing OpenAPI flow.

### 3 · Pre-generation warnings (new)
`POST /api/generations/preflight` — no quota cost, no model call. It runs the *same* resolution the real pipeline uses and warns before you spend a document: wrong branch (and the real one it would use), everything excluded by scope, no grounding sources, an API reference requested with no spec, or quota that can't cover the run. Verified live: it caught the wrong branch, reported the real one, and warned about the missing spec.

### 4 · Context-aware doc-type guidance
`DocType.jsx` suggests document types for *this* repository with the reason attached ("because an OpenAPI spec was found", "deployment config present → Installation & Admin guide"), offered as one-click apply, never pre-ticked. `Format.jsx` explains each format's practical use and what unlocks a plan-locked one.

---

## Bugs fixed along the way

**In existing code (found while building):**
- **Monthly-quota leak** — when a generation's row write failed *after* quota was reserved, the document was never handed back.
- **Bulk repo actions hid partial failures** — they now report the server's real change count and flag repos that didn't update.
- **Restore / revert-to-draft** now confirm and state exactly what will happen before doing anything destructive.
- Keyboard access for the automation update-policy radio group and the Doc Sync reject button; several responsive overflow guards.

**The top-bar bug from your screenshot** — the account button sat up to 93px off-screen and every page scrolled sideways at any window between 600–910px wide. Root cause: responsive rules started at 600px but the bar needs ~910px. The nav now scrolls within itself; tables scroll in their own box at any width.

---

## Defects the adversarial review caught in the NEW work

The review ran with **honesty as the top priority** — a false signal is the worst thing this feature could ship. It found **6 real defects, 4 of them honesty violations**, all now fixed and (for the honesty ones) verified live:

| Defect | Why it mattered |
|---|---|
| **"No README" / "No dependency manifest" fired on a truncated tree** | On a large repo the provider lists only part of the tree — claiming a README is *absent* when it simply wasn't in the returned pages is a false statement. Now gated on a complete listing, matching the sibling "no API spec" check. **Verified**: `gitlab-runner` (partial tree) makes neither claim now. |
| **An ordinary client+server repo was labelled "a monorepo" with N "packages"** | Two folders of one app are not a monorepo. Now requires a real workspace marker (lerna/nx/turbo/pnpm/workspaces) or `packages/apps/services/` roots. **Verified**: `gitlab-runner` is no longer flagged. |
| **Failed analyses were cached for 5 minutes** | A transient rate-limit kept showing "could not be analysed" long after the provider recovered. Only real results are cached now. |
| **The insights panel rendered a soft-failure as an error card** under a "Detected automatically" footer — a self-contradiction. Now renders nothing, like the doc-type panel. |
| **"Add this spec" used the requested branch, not the analysed one** — a 404 on any `master`-default repo. Now uses the branch the analysis actually read. |
| **Preflight blamed "your documentation scope"** when Docify's own built-in excludes emptied the file list — but every account auto-gets a seeded rule set, so this fired for people who never wrote a rule. Now says "your scope" only when the scan config actually differs from the default. |

---

## Performance
- Client bundle stayed split (570 kB initial); the new panel and analyzer add no eager weight — insights load on demand, after a repo is chosen.
- The analyzer caps provider calls, caches per repo, and coalesces concurrent callers, so a typeahead-style UI can't storm the provider.

## Security / honesty
No new PII, no new external calls beyond the providers already used, read-only toward customer repos throughout. Every signal is computed from real evidence and every absence claim is now gated on a complete listing — the review's central concern, closed.

## Regression testing
44/44 unit tests · client build clean after every commit · full wizard (Source → DocType → Format → Generate at 100%) driven live · intelligence and preflight verified against three real public repositories including the branch-fallback case · adversarial review of the new work with every finding re-verified.

## Known limitations
1. **CLI/library detection under-fires** — the profile reports web/app frameworks; a pure CLI tool (commander, cobra, clap) won't trigger the "quick start" suggestion. It never *falsely* suggests; it just occasionally stays quiet. A fuller fix needs the server to expose a CLI/library signal.
2. Insights are shown for the primary repository per host, not for extra repositories added below it.
3. GitHub's unauthenticated rate limit (60/hr) still applies to public-repo analysis on shared IPs — it fails soft (the panel simply doesn't appear), but a connected GitHub account or a GitHub App would remove the ceiling.
4. Everything from the earlier fix report's "known limitations" still stands (payments simulated, SMTP must be set for password reset/invites, etc.).

## Production readiness
The product is meaningfully smarter and more polished than at the start of this session, and — critically — it got smarter **without** compromising the honesty that is its brand: every new signal is substantiated, and the review confirmed the absence-claim discipline holds. The layout bug you spotted is fixed across the whole 600–910px range, not just the one screen.

**Before deploying:** the same two items as before — set `SMTP_HOST` (password reset and invites depend on it) and delete the seeded demo account from the production database — plus, if you want repository analysis to work reliably on public GitHub repos at scale, a connected GitHub account or App to lift the 60/hr limit.

```bash
cd /Users/alkaraj/Desktop/DocifyUI && git push
```

---

# Second pass — 2 Aug 2026: "if it can't fully see it, it stays quiet"

A dedicated end-to-end hardening pass over the same feature, run with a fresh
adversarial review. **18 further defects fixed** — every one of them a place
where the product could state something its evidence did not support — plus
the one genuine end-to-end gap: **preflight had no UI**.

## The end-to-end gap
`POST /generations/preflight` existed and worked, but no client code called
it. It is now wired into the Format step (`client/src/PreflightCheck.jsx`):
before Generate, the customer sees the same source resolution the run will
use — files that would reach the AI, branch actually used, quota spent vs
remaining, and every warning. Advisory only; it never blocks Generate, and a
transport failure renders nothing. Verified live against `gitlab-org/cli`.

## Confidently-wrong claims removed
- **"OpenAPI specification was found" from a filename** — `openapitools.json`
  (a generator config) was claimed as a spec, with an "add as source" button.
  Every candidate is now opened and confirmed to contain a real
  `openapi:`/`swagger:` version key before anything is claimed; the absence
  warning is suppressed if any candidate went unexamined.
- **Frameworks from other people's dependencies** — `go.mod // indirect`
  modules (the whole transitive graph since Go 1.17) and `[dev-dependencies]`
  tables produced "gRPC / Gorilla Mux / Tokio" claims on repos that never
  import them. Both filtered.
- **"No README" from the suggestion engine on a truncated tree** — the same
  lie fixed in pass one had survived in a second place (`DocType.jsx`). Gated
  on `treeComplete`, matching the server signal.
- **"Nothing to write from" when the check never ran** — preflight predicted
  a template-only document when the repository was merely unreadable at that
  moment. Both `no-grounding` and `no-spec` now fire only when the source
  check actually completed (`repoChecked`), with positive-control tests
  proving they still fire when the facts are known.
- **compose `image:` services counted as repo code** — a repo with
  `db`/`redis` containers was told "3 services live in this repository". Only
  services with a `build:` key count now.
- **`template.yaml` anywhere → "serverless"**, **any `symfony/*` component →
  "Symfony"**, **`.m` → Objective-C (MATLAB), lone `.h` → C** — all replaced
  with unambiguous markers or omitted.
- **"your documentation scope" blamed for Docify's own defaults** — any
  `docify.yaml`, even one that only set product metadata, flipped the blame
  wording. Now only an actually-narrowed scan does. Related: the "all files
  are lockfiles/build output" message no longer asserts a category nothing
  inspected.
- **The "file list is partial" caveat could be sliced off** — it was emitted
  7th while the panel shows 4 signals. It is now emitted first, so no count
  or absence renders without it.
- **Counts that were caps presented as totals** — "contains 40 packages" (cap
  40), "93 eligible files" (GitLab listing stops at 60 blobs), Bitbucket depth
  boundary marked complete. All now say "at least N", and the Bitbucket
  listing detects directories at the depth limit.
- **404 branch reported as "listed no files"** — a missing ref and an empty
  branch now produce different sentences, attributed to the branch that was
  actually listed.
- Smaller: README recognized with any extension (`README.org` no longer "has
  no README"), framework chips carry their evidence as tooltips
  (`"cobra" in go.mod`), cached scans disclose staleness in the panel footer,
  "already has documentation" needs ≥2 doc files, absence evidence counts the
  files actually examined, CLI detection added (Commander/yargs/oclif/clap/
  Typer — closes pass one's known limitation 1) and stays quiet whenever a
  web framework is present (frozen `pip freeze` lists).

## Regression proof
`server/test/intel-honesty.test.js` (new): 15 tests — pure detection-table
tests plus a real-server preflight suite in the isolation-test style (exact
status codes, every suppression paired with a positive control). Full suite
**59/59**. The preflight gate was mutation-tested: removing it makes the
suite fail. Client built clean; full wizard driven live (Source → insights →
DocType suggestions → Format → pre-run check) against `gitlab-org/cli`.

Also fixed in passing: a raw NUL byte shipped inside `repointel.js` (made the
file read as binary to grep/tooling) — now the `\u0000` escape sequence.
