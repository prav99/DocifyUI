# Docify Landing Page — Product Film Plan

**Date:** 1 August 2026 · **Status:** implemented and verified in the browser.
All films run on the site's DemoShell engine (`client/src/demoKit.jsx`): code-rendered scenes in IBM Carbon styling, synchronized narration with captions, ambient score, per-scene sound design, scene rail, and full transport controls. Films are poster-first (premium thumbnail, click to play — never autoplay), so reading flow is preserved.

## The 8-chapter film series (page order)

| # | Film | Section | Placement | Status |
|---|------|---------|-----------|--------|
| 1 | Connect | #connect | left media column (poster) | NEW |
| 2 | Generate on demand | #generate | full-width band | existing |
| 3 | Complete automation | #automate | full-width band | existing |
| 4 | Human review | #review | left media column (poster) | NEW |
| 5 | Standardize | #standardize | right media column (poster) | NEW |
| 6 | AI readiness | #quality | full-width band | existing |
| 7 | Documents & versions | #lifecycle | right media column (poster) | NEW |
| 8 | Reporting | #reporting | left media column (poster) | NEW |

Every film ends with an "Up next" card that deep-links to the next chapter, forming a continuous guided tour; chapter 8 loops back to chapter 1. A shared chapter meter (`n / 8`) sits above every film.

## Sections deliberately WITHOUT a film (and why)

- **Hero** — carries its own animated SVG pipeline; a video above the fold competes with the two CTAs and slows LCP. Top-tier pages (Stripe, Linear) keep the hero for message + one visual, not media players.
- **Cost estimator (#cost)** — the interactive calculator IS the demo; a video about a calculator the visitor can already touch would be weaker than the real thing.
- **Problem (#overview)** — six diagnosis tiles; a film here would delay the visitor's arrival at the product proof. The section's job is recognition, not demonstration.
- **Formats matrix / Metrics band / Roles / Trust / FAQ / CTA** — reference and reassurance content; films here would inflate page weight and dilute the 8-chapter narrative. The roles section instead benefits from visitors having just watched chapters 1–8.

## Page-wide optimization applied

- Rhythm: full-width film bands alternate with poster-in-column films, so no two adjacent sections present media the same way.
- Chapter numbering follows scroll order; the meter communicates a finite, watchable series (a premium-course feel) rather than scattered clips.
- Posters never autoplay and never play sound unmuted without a click; captions are always on for muted viewers.
- Mobile: featrows stack media above copy; verified no horizontal overflow at 375px.
- Weight: all 8 films together add ~35 KB of JSX — no video files, no CDN, no loading spinners; scenes render at device resolution (sharper than any MP4).

---


# Chapter 1 — Connect

## 1 Objective
After watching, the viewer must believe that connecting GitHub, GitLab, and Bitbucket to Docify is a one-time, zero-risk act that permanently removes the "where does the source live?" overhead: every account, org, group, and workspace lands in one searchable catalogue with visible connection health. They must also believe it is safe — access is read-only, source is never stored — and that this single catalogue feeds everything downstream: generation, automation, and Standardize.

## 2 Storyboard

| # | Scene | Duration | On-screen | VO |
|---|-------|----------|-----------|-----|
| 1 | Hook | 4500ms · whoosh | TitleSlate — kicker CONNECT YOUR ECOSYSTEM, title "One place for every repository you document.", sub on one catalogue / health / read-only | Documentation starts with finding the source... |
| 2 | Connect providers | 6500ms · click | Three provider rows (GitHub · org acme-corp, GitLab · group platform-eng, Bitbucket · workspace acme-mobile) each resolving to a green health dot + "healthy · connected", helper line about read-only OAuth | Connect GitHub, GitLab, and Bitbucket... |
| 3 | Sync organisations | 6500ms · click | Pipe: three sync steps pulling repo counts (24 / 11 / 8), beside a score card where CountTo climbs 0→43 "Repositories in catalogue" | Docify syncs each organisation... |
| 4 | One catalogue | 7000ms · success | Search chip "⌕ payments" → "3 of 43 repositories", three filtered repo rows (acme/payments-api, platform-eng/payments-gateway, acme-mobile/payments-sdk) each wearing a green read-only tag; helper: source never stored, reused by generation/automation/Standardize | Search one catalogue and reuse it everywhere... |
| 5 | Up next | 6000ms · chime | jd-verdict "One catalogue. Every repository. Read-only." + NextPointer → #film-generate | One place for every repository you document. Next... |

## 3 Voiceover script
1. **0:00–4.5** — "Documentation starts with finding the source. Connect your providers once — and every repository you document lives in one place." (19 w)
2. **4.5–11.0** — "Connect GitHub, GitLab, and Bitbucket — accounts, organisations, groups, and workspaces — with connection health visible at a glance." (17 w)
3. **11.0–17.5** — "Docify syncs each organisation and pulls every repository, public or private, into the catalogue — forty-three in this workspace." (18 w)
4. **17.5–24.5** — "Search one catalogue and reuse it everywhere — generation, automation, and Standardize — while access stays read-only and source is never stored." (20 w)
5. **24.5–30.5** — "One place for every repository you document. Next — watch source content become professional documentation." (14 w)

## 4 UI interactions demonstrated
- Three provider connect rows (GitHub / GitLab / Bitbucket) resolving one-by-one to a live green health dot and a "healthy · connected" check
- An org/group/workspace sync run (Pipe spinners → checks) pulling per-org repository counts: 24 + 11 + 8
- A live counter (CountTo 0→43) filling the "Repositories in catalogue" score card
- Typing-style search filter ("⌕ payments") narrowing 43 repos to 3 across all three providers
- A read-only badge on every catalogue row plus the "source is never stored" assurance line
- Cross-film navigation via the NextPointer card to #film-generate

## 5 Duration
Total **30.5s** — Hook 4.5s · Connect providers 6.5s · Sync organisations 6.5s · One catalogue 7.0s · Up next 6.0s.

## 6 Thumbnail
`posterMeta = { kicker: 'CONNECT YOUR ECOSYSTEM', title: 'One place for every repository you document.', sub: 'GitHub, GitLab, and Bitbucket — every account, org, and workspace in one searchable, read-only catalogue, with health at a glance. In 30 seconds.', mins: '30 sec' }`
Rationale: kicker mirrors the section eyebrow and the title is the section headline verbatim, so the poster reads as the animated proof of the exact promise beside it.

## 7 Placement
Section `#connect` ("One place for every repository you document"). In current Landing.jsx the featrow renders `<div className="illuwrap"><IlluSource /></div>` as the **first** grid child — the **left** column, copy on the right. The film replaces that left `illuwrap`/`IlluSource` side: `<div className="vidwrap"><ConnectDemo /></div>` in place of the illuwrap (add `<div id="film-connect" />` above it if a chain anchor into this film is wanted).

## 8 Responsive notes
- **≤900px** — `.featrow` collapses to one column; the film stacks above the section copy, full width.
- **≤800px** — `.demo-body` goes single-column: the scene rail becomes a horizontal scroll-snap strip above the stage; caption bar stays below.
- Inside scenes, everything wraps: the score card + Pipe pair is a `row` with `flexWrap:'wrap'` and `minWidth` (170/240px), so the counter drops above the pipe; the search chip row and provider rows are flex with `demo-branch` metadata shrinking naturally; `.slate` padding tightens at ≤600px. No fixed widths anywhere.

## 9 Animation notes
- Scene 2: `.demo-row` fadeup with inline `animationDelay` 0.15s/0.5s/0.85s; each connection check reuses `.demo-pickcheck.check` (lgin) at 1.1s/1.7s/2.3s with an inline green health dot; closing helper is `.demo-late` (lgin at 2.3s built-in, overridden to 3.2s).
- Scene 3: local `Pipe` copy at `gap={1.1}` (spinner → `.demo-pipecheck` popin at ×0.85 per step); `CountTo from 0 to 43, delay 1400, dur 2600` inside `score score--good`.
- Scene 4: `.demo-chip.demo-chipon` (fadeup + chipon) at 0.1s; result-count helper `.demo-late` at 1.1s; catalogue rows `.demo-row` at 0.5s/0.8s/1.1s each carrying `tag tag--green` read-only; assurance line `.demo-late` at 2.6s.
- Scene 5: `.jd-verdict` popscale (built-in 0.3s delay) + `nextcard` hover arrow.
- All keyframes (`fadeup`, `lgin`, `popin`, `chipon`, `popscale`, `rot`) already exist in styles.css — no new CSS.

## 10 Code
Implemented in `client/src/pages/films/ConnectFilm.jsx` (verified building and playing).


---


# Chapter 4 — Human Review

## 1 Objective
After watching, the viewer must believe that Docify's automation never publishes behind their back: every AI change arrives as a small, scoped diff their team explicitly accepts, rejects, or rewrites. They should also believe review is cheap — minutes of reading two-line diffs, not afternoons re-reading whole documents — and that every decision is versioned in an audit trail.

## 2 Storyboard

| # | Scene | Duration | On-screen | VO |
|---|-------|----------|-----------|-----|
| 1 | Hook | 4500 ms · whoosh | TitleSlate — kicker HUMAN CONTROL, title "AI proposes. Your team decides." | Unreviewed automation is risk. Re-reading whole documents is waste. Here is review that costs minutes, not afternoons. |
| 2 | Proposed diff | 6500 ms · click | Loop strip `PR #221 merged → docs run · 41s → 3 proposed changes`; proposal card for `payments-developer-guide.md → § Webhooks` with a red deletion line and a green addition line appearing in sequence; late helper "scoped to two lines"; review action chips Accept / Reject / Rewrite / Edit / Comment fade in | Every automatic change arrives as a proposal — a scoped diff, so reviewers read what changed, not the whole document. |
| 3 | Accept & reject | 6500 ms · click | Card 1 (§ Webhooks, green border) gets a `✓ accepted · 96% match` tag (CountTo); card 2 (§ Rate limits, red border) slides in later and gets a red `✕ rejected` chip | One click per decision: accept the accurate change, reject the noisy one — nothing lands without your judgement. |
| 4 | Rewrite & publish | 7000 ms · success | Card § Error handling, "selected span → Rewrite with AI", before-line (red) then after-line (green); loop strip `Approve & publish → v8 created → audit · 2 accepted (1 rewritten) · 1 rejected · s.chen` with popping check | Not quite right? Ask AI to rewrite the span, then approve and publish — version eight, fully audited. |
| 5 | Up next | 6000 ms · chime | jd-verdict "AI proposes. Your team decides." + NextPointer to film-standardize | AI proposes. Your team decides. Next — rebuilding any document to one house standard. |

## 3 Voiceover script
1. **0:00–0:04.5** — "Unreviewed automation is risk. Re-reading whole documents is waste. Here is review that costs minutes, not afternoons." (17 words)
2. **0:04.5–0:11.0** — "Every automatic change arrives as a proposal — a scoped diff, so reviewers read what changed, not the whole document." (19 words)
3. **0:11.0–0:17.5** — "One click per decision: accept the accurate change, reject the noisy one — nothing lands without your judgement." (17 words)
4. **0:17.5–0:24.5** — "Not quite right? Ask AI to rewrite the span, then approve and publish — version eight, fully audited." (17 words)
5. **0:24.5–0:30.5** — "AI proposes. Your team decides. Next — rebuilding any document to one house standard." (13 words)

## 4 UI interactions demonstrated
- A merge event producing a queue of proposed changes (`PR #221 merged → docs run · 41s → 3 proposed changes`)
- A proposed-change card with a real inline diff: one red deletion line, one green addition line, in `§ Webhooks` of `payments-developer-guide.md`
- The reviewer action bar (Accept / Reject / Rewrite / Edit / Comment) — mirroring the section's tag list and the current static SVG's buttons
- Accept taking effect: green `✓ accepted · 96% match` tag landing on the accurate change
- Reject taking effect: red `✕ rejected` chip on a wording-only change, with the reason shown
- The rewrite popover moment: a selected span rewritten by AI, before/after snippet under a `style: plain & direct` label
- Approve & publish creating **v8** with an audit-log line (2 accepted, 1 rewritten, 1 rejected, named reviewer)

## 5 Duration
Total ≈ **30.5 s** (min scene time; engine also waits for narration). Per scene: Hook 4.5 s · Proposed diff 6.5 s · Accept & reject 6.5 s · Rewrite & publish 7.0 s · Up next 6.0 s.

## 6 Thumbnail
`posterMeta = { kicker: 'HUMAN CONTROL', title: 'AI proposes. Your team decides.', sub: 'A scoped diff, one accept, one reject, one AI rewrite — then Approve & publish creates v8 with a full audit trail. In 30 seconds.', mins: '30 sec' }`
Rationale: kicker and title are verbatim the section's eyebrow and headline, so poster and prose make one promise; the sub previews the exact five beats the film delivers.

## 7 Placement
Section `#review` ("6 · Human control where it matters") in `/Users/alkaraj/Desktop/DocifyUI/client/src/pages/Landing.jsx` (~line 790). The illustration cell `<div className="illuwrap"><IlluReview /></div>` is the **first** child of the featrow, i.e. the **left** side on desktop — replace it with `<div id="film-review" className="vidwrap"><ReviewDemo /></div>` (the id gives other films a chain target). Import `ReviewDemo` from `./demos.jsx`, and add the `export` keyword to `NextPointer` in demos.jsx so this film can import it.

## 8 Responsive notes
- ≤ 900 px: `.featrow` collapses to one column; the film (first grid child) stacks above the copy at full width.
- ≤ 800 px: `.demo-body` goes single-column; the scene rail becomes a horizontal scroll-snap strip; the chrome crumb is hidden.
- ≤ 600 px: `.demo-stage` padding drops to 16 px, `.demo-bar` wraps; diff lines are block divs at 12.5 px mono so they wrap instead of overflowing; `.demo-loop` and all `.row` groups have `flex-wrap: wrap`, so the audit strip and chips reflow. `.demo-mrow` is unused here, so nothing else needs a grid override. All of this is existing CSS — the film adds none.

## 9 Animation notes
- Scene 2: `demo-loopbox`/`demo-looparrow` strip (arrow loops via `slidearrowx`); `demo-issue` fade-up at its baked 0.3 s; diff rows are `demo-yline` (opacity-in) at inline `animationDelay` 0.7 s (red) and 1.3 s (green); `helper demo-late` fades at its baked 2.3 s; local `Chips` atom staggers `demo-chip` at 2.6 s + i × 0.35 s.
- Scene 3: card 1 `demo-issue` at default delay, `tag tag--green demo-late` overridden to 1.6 s with `CountTo` (delay 1900, dur 900) counting to 96; card 2 `demo-issue` with inline `animationDelay: 2.4s`, red rejected chip via `demo-late` overridden to 4.1 s.
- Scene 4: `demo-yline` before/after at 0.6 s / 1.8 s; `check demo-loopcheck` pops at its baked 2 s.
- Scene 5: `jd-verdict` pop-scale (baked 0.3 s) and `nextcard` fade-up.
- Diff colors are the same literals the existing `IlluReview` SVG and `jd-verdict` use (`#fff1f1/#a2191f`, `#defbe6/#0e6027`, `#ffd7d9` reject) — inline styles only, no new CSS.

## 10 Code
Implemented in `client/src/pages/films/ReviewFilm.jsx` (verified building and playing).


---


# Chapter 5 — Standardize

## 1 Objective

After watching, the viewer must believe that Docify can take documentation written by different authors over years and rebuild all of it to a single house standard — measurably, with consistency scores climbing from the 50s–70s into the 90s. They must equally believe this is safe for the enterprise: every change arrives as a reviewable unified diff in a queue, and nothing is ever published without human approval.

## 2 Storyboard

| # | Scene | Duration | On-screen | VO |
|---|-------|----------|-----------|-----|
| 1 | Hook | 4500 ms | TitleSlate — kicker STANDARDIZE AT SCALE, title "Written by anyone, in any state — rebuilt to one house standard." | Documentation written by many authors drifts apart. Here is how it becomes one house standard — every change reviewed. |
| 2 | Docs & standard | 6500 ms | Three legacy doc rows fade in staggered (`payments-integration-guide.md · 2019`, `webhooks-reference.md · 2021`, `merchant-onboarding.md · 2023`) each with an amber before-score (58 / 63 / 71); style-guide chips appear, "Docify house style" pops selected; late helper: guides + terminology + org/repo rules apply together. | Select the legacy documents, then choose the standard — your house style guide, Microsoft, or Google. |
| 3 | Rebuild & rescore | 7000 ms | Three per-doc meter rows: green bars grow while CountTo climbs 58→89, 63→91, 71→93; late helper "14 terminology fixes · tone: plain & direct · structure aligned to template." | Docify rebuilds each document against the chosen standard — and every consistency score climbs into the nineties. |
| 4 | Diff & approve | 6500 ms | Dark unified-diff block, lines typing in: `@@ … § Error handling`, red `-` line, green `+` rewrite, green `+ terminology: "merchant ID"` rule; then loop strip `3 proposals → review queue → ✓ approved · v4 published · 0 unapproved`. | Every change lands as a reviewable diff in the queue — nothing publishes until a person approves. |
| 5 | Up next | 6000 ms | jd-verdict "One standard. Every page. Nothing unreviewed." + NextPointer to `film-ai`. | One house standard across every page, and nothing ships unreviewed. Next — AI readiness. |

## 3 Voiceover script

1. **0:00–0:04.5** — "Documentation written by many authors drifts apart. Here is how it becomes one house standard — every change reviewed." (18 words)
2. **0:04.5–0:11** — "Select the legacy documents, then choose the standard — your house style guide, Microsoft, or Google." (15 words)
3. **0:11–0:18** — "Docify rebuilds each document against the chosen standard — and every consistency score climbs into the nineties." (16 words)
4. **0:18–0:24.5** — "Every change lands as a reviewable diff in the queue — nothing publishes until a person approves." (16 words)
5. **0:24.5–0:30.5** — "One house standard across every page, and nothing ships unreviewed. Next — AI readiness." (13 words)

## 4 UI interactions demonstrated

- Selecting three legacy documents from a repo doc list, each showing author-era metadata and an amber before-consistency score (58 / 63 / 71)
- Choosing a reusable style guide from chips — "Docify house style" selected over Microsoft / Google / Custom rules
- Batch rebuild with live per-document consistency rescoring (58→89, 63→91, 71→93 via animated counters and growing meter bars)
- Terminology unification surfaced as a diff rule (`"merchant ID"` replaces `MID`, `merchant-id`) inside a real unified diff (− legacy phrasing / + house-style rewrite)
- Handoff to the review queue: 3 proposals → review queue → approved · v4 published · 0 unapproved — the human-approval gate

## 5 Duration

Total: **30 500 ms (~30.5 s)** — Hook 4500 + Docs & standard 6500 + Rebuild & rescore 7000 + Diff & approve 6500 + Up next 6000. (Actual playback runs a touch longer since DemoShell waits for narration to finish; identical behavior to the other three films.)

## 6 Thumbnail

- `kicker`: `'STANDARDIZE AT SCALE'`
- `title`: `'Inconsistency is rework on an instalment plan — retire it.'`
- `sub`: `'Three legacy docs rebuilt to one house style — 58→89, 63→91, 71→93 — every change a reviewable diff. In 30 seconds.'`
- `mins`: `'30 sec'`

Rationale: the kicker matches the section eyebrow and the title repeats the section headline's exact promise ("Inconsistency is rework on an instalment plan… Standardize retires that debt") so poster and copy read as one voice, while the sub proves it with the film's honest numbers.

## 7 Placement

Section `#standardize` (block 7 in `/Users/alkaraj/Desktop/DocifyUI/client/src/pages/Landing.jsx`, lines 812–837). In the current featrow the text column is first (left) and `<div className="illuwrap"><IlluStandardize /></div>` is second (**right**) — the film replaces the **right** side. Swap line 834's illuwrap for `<div className="vidwrap"><StandardizeDemo /></div>`, add `StandardizeDemo` to the import on line 6, and export `NextPointer` from `demos.jsx`.

## 8 Responsive notes

- **≤900px** — `.featrow` collapses to one column, so the film stacks below the section copy at full width.
- **≤800px** — `.demo-body` goes single-column: the 5-step scene rail becomes a horizontal, scroll-snapping strip above the stage; stage min-height relaxes.
- **≤760px** — the premium poster (`.vid-poster2`) stacks vertically with the play button centered.
- **≤600px** — `.slate` padding tightens for the hook; `.demo-mrow` grid narrows (the inline `gridTemplateColumns` on the rescore rows keeps the 218px name column, same accepted behavior as AICompatDemo's meter rows — filenames may wrap but nothing clips because bars are fluid `1fr`).
- Reduced-motion media rules in styles.css already neutralize spin/pulse animations; CountTo still animates via rAF as in all films.

## 9 Animation notes

- **Scene 2**: three `.demo-row` siblings use the built-in cinematic nth-child stagger (0 / 0.4s / 0.9s fadeup); before-scores ride each row (inline `color: var(--support-warning)`). `Chips` (local copy) at `delayBase={1.6}` → chips at 1.6 / 1.95 / 2.3 / 2.65s, first chip `demo-chipon` pop. `.demo-late` helper lands at 5.6s (stock CSS timing).
- **Scene 3**: `.demo-mrow demo-mrow--light` rows at `animationDelay 0.4 + i*0.55`s; `.demo-mfill` (green `growx`, width = after-score %) at `0.8 + i*0.55`s; `CountTo from={before} to={after} delay={900 + i*550} dur={2000}` so numbers climb as bars grow; `.demo-late` summary at 5.6s.
- **Scene 4**: `.demo-yaml` diff with `.demo-yline` line reveals at `0.3 + i*0.55`s (colors inline: `#ff8389` removed, `#42be65` added — matching the dark `--code-bg`); `.demo-loop` with pulsing `.demo-looparrow`s and `.demo-loopcheck` popping at its stock 2s delay.
- **Scene 5**: `.jd-verdict` popscale at 0.8s (stock), `.nextcard` fadeup.
- SFX: whoosh → click → click → success → chime; only existing classes + inline styles, zero new CSS.

## 10 Code
Implemented in `client/src/pages/films/StandardizeFilm.jsx` (verified building and playing).


---


# Chapter 7 — Documents & Versions

## 1 Objective
After watching, the viewer must believe that Docify makes "which version is live, and who approved it?" a 30-second lookup instead of an engineering-archaeology exercise — every document carries its score, approval state, full version history, side-by-side compare, safe one-click restore, and a named, time-stamped audit trail. They must also believe this governance is not a dead-end record: the approved version is what the automation pipeline builds on.

## 2 Storyboard

| # | Scene | Duration | On-screen | VO |
|---|-------|----------|-----------|-----|
| 1 | Hook | 4500ms · whoosh | TitleSlate — kicker DOCUMENTS & HISTORY, title mirrors the section headline, sub lists the five capabilities | "Which version is live, and who approved it? In Docify, that answer is a lookup — not archaeology." |
| 2 | Documents at a glance | 6500ms · click | Score card counts 0→24 tracked documents; three realistic table rows fade up (payments-developer-guide.md v7·live·92·✓approved gets picked with rdot fill + pickcheck; checkout-api-reference.md v12·88; webhooks-integration-guide.md v3·in review·74); late helper line | "The Documents dashboard shows every document with its quality score, live version, and approval state — at a glance." |
| 3 | History & compare | 6500ms · click | Dark code block: timeline entries v7/v6/v5 with authors + dates type in one by one (v7 ties back to PR #214 from the automation film); then a compare card "v6 → v7 · § Authentication" reveals a red removed line and a green added line | "Expand one document: the full version history — then a side-by-side compare showing exactly which line changed." |
| 4 | Restore & approvals | 6500ms · success | Approval trail as a 4-step checked pipeline (Draft — M. Chen · Jul 02, 09:41 → Review — A. Osei → Approved — S. Winters → Published — pipeline), each spinner resolving to ✓; below, restore loop: Restore v6 → v7 snapshotted → "v8 live · nothing lost"; late helper: approved content feeds automation | "The audit trail names who drafted, reviewed, and approved — and restore snapshots the current version before reverting." |
| 5 | Up next | 6000ms · chime | jd-verdict payoff line pops in; NextPointer card to film-reporting (MANAGEMENT REPORTING) | "Versions, approvals, restore — one lookup, and automation always builds on the approved version. Next — management reporting." |

## 3 Voiceover script
1. **0:00–0:04.5** — "Which version is live, and who approved it? In Docify, that answer is a lookup — not archaeology." (17 words)
2. **0:04.5–0:11** — "The Documents dashboard shows every document with its quality score, live version, and approval state — at a glance." (18 words)
3. **0:11–0:17.5** — "Expand one document: the full version history — then a side-by-side compare showing exactly which line changed." (16 words)
4. **0:17.5–0:24** — "The audit trail names who drafted, reviewed, and approved — and restore snapshots the current version before reverting." (17 words)
5. **0:24–0:30** — "Versions, approvals, restore — one lookup, and automation always builds on the approved version. Next — management reporting." (16 words)

## 4 UI interactions demonstrated
- Documents dashboard table: three document rows with real file names, version numbers, quality scores (92 / 88 / 74) and approval states; the first row is selected (radio-dot fill, row highlight, "✓ approved" confirmation)
- Document count animating 0→24 in a score card (CountTo)
- Version timeline expanding: v7 / v6 / v5 entries appearing with author, date, and change summary — v7 traceably created by PR #214 (continuity with the automation film)
- Side-by-side compare: one removed line (red) and one replacement line (green) in § Authentication
- Four-stage approval audit trail with names and timestamps, each stage resolving spinner→checkmark
- One-click restore flow that snapshots v7 before reverting to v6, producing v8 ("nothing lost")
- Up-next card cross-navigating to the reporting film

## 5 Duration
Total minimum runtime **30.0s** (engine also waits for narration): Hook 4.5s · Documents at a glance 6.5s · History & compare 6.5s · Restore & approvals 6.5s · Up next 6.0s.

## 6 Thumbnail
posterMeta: kicker `DOCUMENTS & HISTORY` · title `"Which version is live, and who approved it?" becomes a lookup.` · sub `Version history, side-by-side compare, one-click restore, and the full approval audit trail — in 30 seconds.` · mins `30 sec`.
Rationale: kicker and title repeat the section's eyebrow and headline verbatim, so the poster reads as the playable proof of the exact promise beside it.

## 7 Placement
Section #lifecycle ("9 · Documents, versions, lifecycle", /Users/alkaraj/Desktop/DocifyUI/client/src/pages/Landing.jsx line 904). In the current featrow the copy column is first and `<div className="illuwrap"><IlluReadiness /></div>` is second — so the film replaces the **right** side. Swap that illuwrap for `<div className="vidwrap" style={{ marginTop: 0 }}><DocumentsDemo /></div>` (poster shows immediately; nothing autoplays), and add a `<div id="film-lifecycle" />` anchor above the featrow if other films later chain to it. The NextPointer targets `film-reporting`, which must be an anchor div added beside the #reporting section when that film lands.

## 8 Responsive notes
- ≤900px: `.featrow` collapses to one column, so the film stacks below the section copy at full width.
- ≤800px: `.demo-body` goes single-column; the scene rail becomes a horizontal, scroll-snapping strip above the stage.
- In-scene: every multi-column group uses `row` + `flexWrap:'wrap'` with `minWidth` (score card 150px, row list 260px), so the count card stacks above the table on narrow screens; `demo-loop` wraps by design; long mono strings (file names, diff lines) wrap inside the stage.
- ≤600px: stage padding drops to 16px, `demo-bar` wraps to two lines, the caption track remains visible for muted viewers — all inherited from the shell, no film-specific CSS needed.

## 9 Animation notes
- Scene 2: `CountTo 0→24 (delay 400, dur 1600)`; rows stagger via built-in `.demo-row:nth-child` delays (.1s/.2s); the pick row uses `demo-pick` (highlight at 1.1s, rdot fill 1.35s, `demo-pickcheck` at 1.6s); helper uses `demo-late` (2.3s).
- Scene 3: timeline entries are `demo-yline` at `0.3 + i*0.5`s (0.3/0.8/1.3); compare card is `demo-issue` with inline `animationDelay:'1.9s'` and `borderLeftColor: var(--support-info)`; diff lines are `demo-yline` at 2.5s (error color) and 2.9s (success color).
- Scene 4: local `Pipe` copy with `gap 0.85` — spinners hold then `demo-pipecheck` pops per step (last ✓ ≈3.3s); restore loop uses `demo-looparrow` (infinite slide) and `demo-loopcheck` (popin at 2s); `demo-late` helper at 2.3s.
- Scene 5: `jd-verdict` popscale (built-in .3s delay); `nextcard` static.

## 10 Code
Implemented in `client/src/pages/films/DocumentsFilm.jsx` (verified building and playing).


---


# Chapter 8 — Reporting

## 1 Objective (2 sentences: what the viewer must believe after watching)
After watching, the viewer believes the documentation status deck is no longer a manager's afternoon: Docify generates the full AI Quality Report from one data source and exports it as PDF, HTML, and PowerPoint in one click. They believe the report is genuinely management-ready — preset-shaped for the audience, headline scores (92 / 88 / 90) backed by real checks, findings and applied fixes rolled into a publish-readiness decision, with traceable, dated filenames.

## 2 Storyboard (table: scene | duration | on-screen | VO)

| # | Scene | Dur | On-screen | VO |
|---|-------|-----|-----------|-----|
| 1 | Hook | 4500ms · whoosh | TitleSlate — kicker MANAGEMENT REPORTING, title "A management-ready quality report, in one click.", sub on one source → PDF/HTML/PowerPoint | Status decks about documentation are documentation work too. Here is the quality report that writes itself. |
| 2 | Pick a preset | 6500ms · click | Picked source row `AI Quality Report · acme/payments-api · run #87 ✓ latest run`; preset chips Executive summary (selected) / Full audit / Technical; late helper: same data source underneath | Choose a preset — executive summary, full audit, or technical — from the same data source every time. |
| 3 | Headline scores | 6500ms · click | Three `score score--good` cards counting up: Overall quality 92, AI readiness 88, LLM readiness 90, each with a one-line helper | The headline scores managers ask for — overall ninety-two, AI readiness eighty-eight, LLM readiness ninety — counted from real checks. |
| 4 | Findings & export | 7000ms · success | Green-bordered findings block "7 findings · 5 fixes applied · 2 remaining risks" + tag `✓ publish-ready`; then three download chips `⬇ payments-api-quality-2026-08-01.pdf / .html / .pptx` | Findings, applied fixes, and remaining risks roll up to one publish-readiness decision — then export as PDF, HTML, or PowerPoint. |
| 5 | Up next | 6000ms · chime | jd-verdict "A management-ready quality report, in one click." + NextPointer → film-connect, kicker CONNECT | A management-ready quality report, in one click. Next — one catalogue for every repository you document. |

## 3 Voiceover script (numbered, timed)
1. **0.0–4.5s** — "Status decks about documentation are documentation work too. Here is the quality report that writes itself." (16 words)
2. **4.5–11.0s** — "Choose a preset — executive summary, full audit, or technical — from the same data source every time." (16 words)
3. **11.0–17.5s** — "The headline scores managers ask for — overall ninety-two, AI readiness eighty-eight, LLM readiness ninety — counted from real checks." (18 words)
4. **17.5–24.5s** — "Findings, applied fixes, and remaining risks roll up to one publish-readiness decision — then export as PDF, HTML, or PowerPoint." (19 words)
5. **24.5–30.5s** — "A management-ready quality report, in one click. Next — one catalogue for every repository you document." (15 words)

## 4 UI interactions demonstrated (bullets)
- Selecting the latest quality run of a real repository (`acme/payments-api · run #87`) as the report's single data source — radio-row pick animation with confirmation check.
- Choosing a report preset via chips (Executive summary highlighted from three options), mirroring the section's "executive summary … full audit" copy.
- Three headline score cards counting up live (Overall 92, AI readiness 88, LLM readiness 90) — the numbers a manager screenshots.
- A findings-and-fixes rollup (7 findings, 5 fixes applied, 2 remaining risks) resolving to a `✓ publish-ready` verdict tag.
- One-click export producing three traceable, dated downloads: `payments-api-quality-2026-08-01.pdf`, `.html`, `.pptx` — "one data source, three formats, zero assembly" made literal.

## 5 Duration (total + per scene)
**Total minimum: 30,500ms (~30.5s)** — Hook 4500 + Preset 6500 + Scores 6500 + Findings & export 7000 + Up next 6000. (DemoShell extends any scene until narration completes, matching the other three films.)

## 6 Thumbnail (posterMeta values + one-line rationale)
- kicker: `MANAGEMENT REPORTING`
- title: `A management-ready quality report, in one click.`
- sub: `Overall 92, findings, applied fixes, and a publish-readiness decision — exported as PDF, HTML, and PowerPoint. In 30 seconds.`
- mins: `30 sec`

Rationale: kicker and title repeat the section's eyebrow and headline verbatim, so the poster reads as the headline's proof — and the sub front-loads the concrete numbers and three formats that the film delivers.

## 7 Placement
Section `#reporting` (Landing.jsx line ~929, "10 · Management reporting"). In the current layout the featrow puts `<div className="illuwrap"><IlluReport /></div>` **first — the LEFT column** — with the copy on the right. The film replaces that left `illuwrap`: swap it for `<div className="vidwrap"><ReportingDemo /></div>` (keeping the film on the left, text on the right, matching the section's existing visual balance).

## 8 Responsive notes (what happens under 800px)
- The featrow itself collapses to one column at 900px; since the film is first in the DOM, it stacks **above** the section copy on mobile.
- At 800px, `demo-body` goes single-column and the scene rail becomes a horizontal scroll-snap strip above the stage (existing `@media(max-width:800px)` rule) — no film-specific handling needed.
- All scene layouts are `row` + `flexWrap:'wrap'` with `minWidth` floors: the three score cards (minWidth 150) wrap to a vertical stack, the download chips wrap to two lines, and the preset chips already wrap via the shared `Chips` atom. No horizontal overflow; long mono filenames sit in their own chips so they wrap as units.

## 9 Animation notes (the specific delays/classes used)
- **Scene 2**: `demo-row demo-pick` (built-in pickrow at 1.1s, `rdot` dot fill at 1.35s, `demo-pickcheck check` at 1.6s); preset chips via local `Chips` copy with `delayBase={0.9}` → inline `animationDelay` 0.9 / 1.25 / 1.6s, selected chip gets `demo-chipon` (chipon pulse at 0.9s into its own timeline); closing helper uses `demo-late` (fades at 2.3s).
- **Scene 3**: three `score score--good` cards; `CountTo` staggered `delay` 400 / 900 / 1400ms, `dur` 2000ms — cards land left-to-right like a deck building itself.
- **Scene 4**: `demo-issue` with inline `borderLeftColor: var(--support-success)` (fadeup at 0.3s via class); `tag tag--green` verdict rides the block; three `demo-chip` download chips with inline `animationDelay` 1.6 / 2.05 / 2.5s and IBM Plex Mono inline font — downloads appear only after the verdict has registered.
- **Scene 5**: `jd-verdict` (popscale at 0.3s) then the shared `nextcard` NextPointer.

## 10 Code
Implemented in `client/src/pages/films/ReportingFilm.jsx` (verified building and playing).


---
