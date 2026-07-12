# Hybrid inline review editor — implementation report

Adds a **hybrid inline editing experience** to **Standardize › Review & export**, so a
reviewer is no longer limited to accepting or rejecting a whole-document rebuild. Any span —
a word, phrase, sentence, paragraph, table row, section, or several sections — can be
accepted, rejected, edited by hand, or AI-rewritten, all against one unified diff, version
history and audit trail. Nothing publishes until Save + Approve.

This directly answers the Product Hunt question about Standardize being a single atomic
approval: it now routes through the same review queue **and** supports true sub-document,
per-change control.

## What was built

| Area | File | Notes |
|------|------|-------|
| Rewrite/diff engine | `client/src/review/engine.js` | Pure, framework-free. Block/diff model, deterministic local transforms (concise, simplify, active voice, grammar, professional, customer-focused, technical, remove-repetition…), style-guide pipelines, audit helpers, config. Protects code blocks / inline code / links / markdown from prose rewrites. |
| The editor | `client/src/review/InlineReviewEditor.jsx` | Selection → floating toolbar + right-click menu → rewrite popover → inline live preview → accept/reject/try-again/edit/compare → manual editing → per-block & bulk actions → inline & side-by-side modes → undo/redo → change/audit/comment side panels → keyboard + a11y. |
| Styling | `client/src/styles.css` (appended `rvx-*`) | Carbon-aligned: reuses existing tokens, tags, buttons. Non-colour cues (`+ / − / =` markers via CSS) so additions/deletions are distinguishable without colour. |
| Server: AI rewrite | `server/src/adapters/rewrite.js` + `POST /api/sync/rewrite` | Uses your Anthropic key when `ANTHROPIC_API_KEY` is set; otherwise a deterministic local fallback that mirrors the client engine. Never auto-applies. |
| Server: save reviewed content | `PUT /api/sync/updates/:id/content` | Persists the reviewer's assembled document + audit into the existing `diff`/`reasoning` JSON columns — **no schema change/migration**. Approve then publishes exactly what was reviewed and cuts a version. |
| Integration | `client/src/pages/Governance.jsx` | Each pending proposal gets **Review & edit** (opens the editor) alongside **Approve all** / **Dismiss**. |

## How it maps to the spec

- **Text selection** — native mouse/keyboard selection anywhere in the document; no "edit mode" to enter. Word/phrase/sentence/paragraph/section all supported; sub-block selections edit precisely in place, multi-block selections apply per block.
- **Contextual toolbar** — appears on selection with Rewrite, Improve clarity, Make concise, Fix grammar, Simplify, Change tone, Apply style guide, Edit manually, Accept, Reject, Add comment, and a **More** menu.
- **Right-click menu** — Rewrite, Rewrite with a style guide (submenu), custom instruction, replace terminology, make customer-friendly / more technical / more concise, explain, restore, history, comment.
- **Rewrite options** — quick actions + style guides (active / org / preset, plus custom instruction) + **Tell AI how to rewrite this** free-text. Style-guide names describe an influence, with an on-screen disclaimer (no endorsement claimed).
- **Live inline preview** — original vs proposed shown in place; Accept / Reject / Try again / Edit result / Compare styles (2–3 alternatives). Simulated (no-key) results are tagged.
- **Manual editing** — tracked in the same diff/audit as AI edits, tagged `Manual`.
- **Unified diff** — inline edits and the side-by-side view share one block model; every change updates the diff, the change list, and the audit trail immediately.
- **Change-level + bulk actions** — per change: accept, reject, edit, rewrite again, restore, comment; bulk: accept all proposed, reject all AI, accept section, apply style guide to unresolved (with a confirm above a configurable size).
- **Audit trail** — original/updated text, change type, style guide, instruction, author, AI-vs-human, timestamp — in a side panel, out of the way.
- **Safeguards** — no silent overwrite, preserved original version, undo/redo, AI content clearly tagged, overlapping-rewrite lock, large-selection warning, code/formatting protection.
- **Accessibility** — keyboard shortcuts (⌘/Ctrl-Z / ⌘⇧Z), focusable controls, `aria-live` announcements for proposed changes, non-colour add/remove cues, labelled menus, responsive down to tablet.

## Configurable end to end

`DEFAULT_CONFIG` in `engine.js` drives the whole surface and can be overridden per mount via
the `config` prop on `<InlineReviewEditor>`: which toolbar / More / context-menu / quick
actions appear, which style guides are offered, side-by-side on/off, audit on/off, comments
on/off, bulk-confirm threshold, large-rewrite warning threshold, and the default decision
state for proposed blocks.

## Testing (all green)

1. **Engine unit tests** — `client/src/review/engine.test.mjs`, **36/36**. Word/sentence/paragraph transforms, code/link/heading protection, style guides, custom-instruction routing, block model, accept/reject/edit assembly, audit shape, config integrity, large-doc guard, stability.
2. **Headless interactive tests** — `_review_harness/editor.jsdom.test.mjs`, **18/18**. Mounts the real component in jsdom and drives it: render without errors, block reject, bulk accept-all, selection → toolbar, local rewrite preview, accept → clean added text with struck-through original, audit entry, undo, side-by-side, right-click menu.
3. **Full client bundle** — the entire app (with the editor wired into Governance) bundles with no syntax/JSX/import errors.
4. **Server** — endpoints syntax-checked; rewrite adapter verified for simplify / code-protection / style-guide / custom-instruction paths.

Scenarios 1–20 in the brief are covered by (1)+(2), except those needing a live browser/API
(multi-reviewer, applying an approved version to the automation pipeline) — see below.

## Try it without running the app

`_review_harness/index.html` is a self-contained offline demo (double-click to open in a
browser). Server rewrites fall back to local transforms there, so selection, toolbar,
right-click, quick rewrites, style guides, custom instructions, manual edits, accept/reject,
diff, undo/redo and audit all work with no server. To run inside the real app: `npm run dev`
then Standardize → run a correction → **Review & edit**.

## Honest scope notes (deep MVP)

Per our agreed plan this is a deep, working MVP focused on the Review & export tab. Fully
wired: selection editing, AI + manual rewrites, per-block/section/bulk review, unified
diff + audit, version-on-approve, config, a11y, tests. **Deferred / stubbed** (hooks in
place, not finished): reviewer assignment & multi-user presence; surfacing the same editor in
Import History / Doc Sync / Automation / generation preview (the component is reusable — it
takes a `proposal` and `config`); persisting the audit trail into a dedicated table (currently
rides in the proposal's `reasoning` JSON); and per-cell table editing beyond line/section
granularity. The automation pipeline already consumes the approved version, since Approve
publishes the reviewed content and cuts a normal version.
