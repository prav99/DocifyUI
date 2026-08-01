# Docify — QA fixes applied

**Date:** 1 Aug 2026 · Follow-up to `DOCIFY-QA-REPORT.md`
**Verification:** server suite **44/44 passing** (10 new regression tests), client builds clean, every fix exercised live against the running app, and the fixes themselves put through an adversarial review (§8).

Nothing here is committed or deployed — the working tree is ready for you to review and push.

---

## 1. The wrong-branch bug (Critical) — fixed

**What was wrong:** generation always asked for `main`. A repo whose trunk is `master` returned zero files, and Docify quietly produced sample documentation while charging a document.

**Fixed in three layers, so it cannot recur:**
1. The wizard now carries each repository's **real** branch from the catalogue (`Source.jsx` → `Format.jsx`), including every extra repository — previously all of them were hardcoded to `main`.
2. The server resolves the branch itself: if the requested branch yields nothing, it asks the provider for the repository's default branch and retries once (`repofiles.js: defaultBranchFor`, `fetchRepoFilesResolved`).
3. Everything downstream uses the branch that actually worked — scope rules, the `docify.yaml` lookup, and the stored record — and the customer is **told** when a fallback happened.

**Proof (live, the exact failing case):** requested `main` on `inkscape/inkscape` (default `master`).
```
[branch] inkscape/inkscape: "main" yielded no files; used default branch "master" (12 files)
stored branch: master
message shown: Branch "main" had no readable source, so Docify documented "master" — this repository's default branch.
```
**12 files** where the old code read zero. A full wizard run afterwards sent `master` from the start and needed no fallback.

**Also fixed:** a repository that yields no files on *any* branch now says so plainly instead of silently shipping a confident-looking sample.

## 2. Production sign-in (Critical) — verified working

You set `CREDENTIAL_KEY` and deployed. I verified the credential **write path** on production (the exact step that was failing) using a throwaway account on your own `+alias`, with a deliberately invalid token so no real secret was involved:

```
credential write -> 400 "Notion rejected the token — check the integration token…"
```
A 400 from the provider means the credential store accepted the write. Had the key still been missing it would have been `503 Credential storage is not configured`. **GitHub/GitLab/Bitbucket sign-in now works.** All four OAuth providers initiate correctly (302, signed state, PKCE on Google); health is green. The temporary account was deleted (verified: login now fails).

## 3. Honesty fixes

| Was | Now |
|---|---|
| "Share report with team" toasted *"link sent to your team workspace"* and sent nothing | **Copies a real link** to the report (`/quality/:id`), with honest copy about who can open it. Verified the link opens the report. If the clipboard is blocked it shows the URL to copy instead of faking success. |
| "Re-check with AI judge" slept 600 ms and returned the same report | **Genuinely re-runs the review** over the current document text, rewrites the findings, and keeps already-applied fixes. Proven: after changing a document, score went **82 → 91** and open findings **5 → 0**. When nothing changed it now says so honestly ("the score is unchanged at 82/100"). |
| Quality page sold an "LLM judge" that is actually deterministic rules | The page now says exactly what runs: *"Scored by deterministic rule-based checks that read the document text — not by a language model. The same document always produces the same score."* Corrected **product-wide** — Quality, Docs, Help, Assistant, Marketing, and the crawler-facing SEO metadata. |
| Pricing promised tier limits nothing enforced | **Enforced server-side** (below). |
| One page still said "DOCGEN" | Now "THE DOCIFY DIFFERENCE". |

## 4. Plan entitlements — now real

`PLAN_LIMITS` in `catalog.js` now carries `formats`, `sources`, and `watermark` alongside the document caps, and the server enforces all three. The client shows locked formats as **Upgrade** instead of letting you pick one and fail at the last step, and a free account now lands on a format it can actually export.

Verified live:
- DITA and Markdown on Free → **402** with an upgrade message; PDF → **201**. Team → **201** for DITA.
- **Downgrade path:** a DITA document generated on Team stops downloading after a downgrade to Free (200 → 402). Paid formats can't leak through old documents.
- Second source on Free → **402**; reconnecting the existing one still works; Team can add more.
- Free-plan output is watermarked server-side (visible in the render, persisted so downloads inherit it); paid output is not.

**Deliberately not enforced on OAuth sign-in** — that provider row *is* the account's sign-in identity, and a paywall must never become an authentication failure. Documented in the code.

## 5. Quota integrity

- **Unknown document types are refused** (`400`) *before* any quota is reserved. Previously `docTypes: ["nonsense"]` ran the whole pipeline and billed a document. A marketing type on the technical track is rejected too. Verified: usage unchanged after rejection, and a valid type still works.
- **Failed runs hand the documents back.** The reservation is now keyed to the generation, and the pipeline's failure path releases it. Verified with a genuinely induced failure (row deleted mid-run): usage `2 → 0`, reservation row gone.
- Note: this is why the old test suite needed updating — it used a document type that does not exist (`apiref`) and passed, which was exactly the bug.

## 6. UI and accessibility

- **Progress bar** snaps to 100% when a run completes (was showing "Generation complete 4%").
- **Quality score sync** — the real cause turned out to be deeper than reported: `requestAnimationFrame` pauses in a background tab, so the number froze on its old value **permanently**, even after the fix landed. Now the value always arrives, animated or not. Verified: screen and server both read 82 after a fix.
- **Cross-provider empty state** — selecting GitHub when your repos are under GitLab/Bitbucket no longer claims "no repositories available". It says *"Your catalogue has 101 repositories under Bitbucket and GitLab"* and offers a one-click **Add Bitbucket + GitLab** button. Verified working.
- **Keyboard access** — every wizard tile (source, document type, format) is now a real checkbox: focusable, Enter/Space activates, `aria-checked` announced, with a visible focus ring. Verified by keyboard event. Modals gained `role="dialog"`, `aria-modal`, and Escape-to-close.

## 7. New regression tests (6, permanent)

Added to `server/test/isolation.test.js` so none of this can silently regress:
export-format entitlement (with positive controls) · paid-format download after downgrade · Free source cap incl. reconnect · free-plan watermarking (and no watermark on paid) · unknown document type refused before quota · failed run refunds its reservation.

---

## 8. Second pass: an adversarial review of these fixes

I then had the fixes reviewed adversarially — four independent reviewers hunting for defects **in the new code**, each finding re-verified by a separate agent instructed to refute it. 25 claims, **21 confirmed**. Seven were defects I had just introduced, and they are now fixed and re-verified:

| Defect in my own fix | Now |
|---|---|
| **Re-check dropped fixes that worked.** It kept only findings the fresh rubric still reported — but a fix that succeeds stops being reported, so it was forgotten, and the next fix re-rendered the document *without* the accepted sections. Silent data loss. | Accepted fixes are kept verbatim. Verified live: apply a fix → re-check → the fix survives. |
| **Re-check invented style violations.** It read the writing policy back from storage, where JSON had turned its terminology patterns into `{}` — and `String.match({})` matches almost any prose, fabricating violations and dropping the score. | The policy is re-resolved live, never read back from JSON. Verified: 0 phantom rows. |
| **Re-check wrote blank style rows** (wrong field names), each counting as a failure. | Uses the same mapping as the pipeline. Verified: every row labelled. |
| **The free-plan watermark could be switched off** by sending `watermark: "   "` — truthy enough to pass my check, blank enough for the exporter to skip. | Forced unconditionally; a blank value cannot disable it. Test added. |
| **Paid formats leaked as text.** The download route refused them, but the generation detail endpoint returned the full content of every format. | Locked formats return an empty, `locked: true` cell. Test added. |
| **The branch fallback fired on *any* error** — a rate limit or a 502 on the right branch would silently document a *different* branch, and then assert that the requested branch "had no readable source". | Only a genuine 404 triggers the fallback; a fallback that reads nothing no longer overwrites the branch. Verified against all three cases. |
| **"No readable source files" warned on spec-only documents.** A Jira- or OpenAPI-grounded document legitimately has no repository files, and my new warning called it broken. | The warning only appears when the repository really was the intended source. |
| **"Switch to GitLab" left the empty host selected**, so Continue stayed disabled and the button appeared to do nothing. | It now swaps hosts instead of adding. |
| **Modal had no focus trap** — Tab walked out of the dialog into the page behind it. | Focus moves in, stays in, and returns to the opener. |
| **"JUDGE NOTES" claimed "all rubric criteria satisfied"** whenever the issue list was empty — even with failing style checks or broken links. | Renamed, and the summary is computed from the real counts. |
| Four more "LLM judge" claims in the docs (including *"a signed re-confirmation"*, which nothing signs). | Corrected. |

The remaining 10 confirmed findings are **pre-existing** issues on the automation and Doc Sync paths, not introduced here — they are listed below.

## Still open

**Pre-existing, surfaced by the review (worth fixing next):**

- **Doc Sync bills before it validates.** `aiQuotaBlocked` reserves a document as the first act of four routes, before the 404/400 checks — so a not-found, a not-ready document, or a no-op sync still costs the customer a document.
- **Only manual runs get refunded.** Automation and Doc Sync reserve without a generation id, so their reservations can never be handed back. Wiring the same id through those three call sites would close it.
- **A document type whose model calls fail is still billed** — `generateDocumentSmart` drops that type and completes, so the customer pays for a document that silently fell back to template content.
- **The crash-recovery sweep can double-run a live generation** (it fires 8s after boot and re-runs anything `queued`/`running`, with no in-process guard).
- **Automation `profileRun`/`triggerRegeneration` still bypass the format entitlement** — profile *creation* and *update* are now gated, which closes the practical door, but the run paths themselves are not.
- **OAuth can exceed the source cap.** Sign-in creates its Source row directly (deliberately — a paywall must never break authentication), so a determined free user can hold several code hosts. The cap only binds self-service connects, and the error now names what to disconnect.

**From the original QA report:**

1. **GitHub rate limits** — public/org reads are unauthenticated (60/hr per IP). On Railway's shared IPs customers will hit `GitHub: HTTP 403`. Fix: a server-side GitHub App token plus a friendlier message. Not attempted here because it needs a new GitHub App registration.
2. **GitHub OAuth still requests the `repo` scope** — reads as write access to a security reviewer. The GitHub App migration solves both this and item 1.
3. **The 12-file / 6 KB grounding cap** — see the architecture analysis; the highest-leverage next step is showing users which files were used, then content-aware file selection.
4. **Automation-path format gating** — automation creates generations directly rather than through `POST /generations`, so the format entitlement is not applied there. Low impact today (pipelines require a paid plan), but worth closing when you touch that code.

## To ship

```bash
cd /Users/alkaraj/Desktop/DocifyUI && git add -A && git commit -m "Fix wrong-branch generation, enforce plan entitlements, and remove unsupported product claims" && git push
```

Pushing auto-deploys to Railway. I have not committed or pushed anything.
