# Doc sync vs Automation — what each page does, and how the flows differ

Both features react to code changes and keep documentation current, and they share the
same underlying engine (relevance rules, section placement, quality judging, and the
review queue). The difference is **what they operate on** and **how much is automatic**.

- **Doc sync** maintains *one specific existing document* at a time, section by section,
  and is **review-first** — you approve every change.
- **Automation** is a *continuous, hands-off pipeline* tied to a repo + triggers that
  regenerates/updates whole documents on every merge, with **quality gates and optional
  approval** deciding what publishes.

Put simply: **Doc sync is a surgeon** (precise, one document, every cut reviewed);
**Automation is a factory line** (continuous, many documents, policy-governed).

---

## Doc sync (`/sync`)

### Purpose
Keep a document you already have — one you uploaded, pasted, or imported — accurate over
time. When code changes, Doc sync updates only the affected **section** of that document,
never the whole file and never a duplicate.

### What the page shows
A card per document under sync, each with its parsed profile (sections, pages, lines,
heading style) and an **"Indexed"** badge — meaning its outline has been indexed so the
placement engine can match changes to the right section. Per-card actions:

- **Check for new commits** — pull the latest commits from the watched repo and evaluate
  whether any need a documentation update.
- **Structure & understanding** — show how the AI parsed the document (its section outline).
- **Simulate a commit** — a test tool: fake a code change to see how a proposal would be
  generated, without waiting for a real merge.
- **Remove** — take the document out of Doc sync.

### Flow (step by step)
1. **Add a document** — upload / paste / import, or "Try with a sample". It's parsed into a
   structured outline + semantic profile (terminology, style) and marked **Indexed**.
2. **A change is detected** — you click *Check for new commits* / *Simulate a commit*, or a
   watched commit arrives.
3. **Relevance check** — the change is scored by the shared rules engine; internal or
   irrelevant changes are skipped (nothing is documented for them).
4. **Section matching (placement)** — every section of *this document* is scored against the
   change; the best-matching section wins as the anchor, with ranked alternates.
5. **Proposal queued** — a section-level splice (insert or rewrite) is queued in the
   **review queue** as a side-by-side diff with AI reasoning (why this section, confidence,
   files, commit). **Nothing changes yet.**
6. **You review** — Approve applies the splice to the document body (heading hierarchy
   preserved) and cuts an immutable version; Reject discards; Edit-then-approve applies your
   edited text.
7. **Versions** — every version is comparable and restorable.

### Human role
Maximum control. Every change is a proposal you see and approve. There is no automatic
quality gate — *you* are the gate.

### Best for
A hand-authored, high-value document (a flagship guide, an API reference) that must stay
correct and where every edit deserves a human look.

---

## Automation (`/automation`)

### Purpose
Set up a **pipeline** once and let documentation regenerate, re-judge, re-rank, and publish
itself on every code change — across whole document *types*, at scale, with governance.

### What the page shows
A management dashboard of **pipelines (profiles)**, a **6-step wizard** to create/edit one,
and a **profile detail** view (webhook URL + secret, run history, simulations, effectiveness
trends).

The 6-step wizard configures:
1. **Repository** — the code host + repo the pipeline watches.
2. **Branch** — which branch's merges trigger it (patterns like `release/*` supported).
3. **Triggers** — pushes, merged PRs, and/or **Jira events** (issue moved to Done, created,
   updated, commented).
4. **Documents** — which doc types to maintain, and the update policy: **place** the change
   into an existing document vs **re-issue** a new version.
5. **Quality checks** — the **quality gate** (min overall score to publish), minimum AI
   assistant ranking, **auto-fix**, and an optional **approval gate**.
6. **Publish & notify** — where it publishes (workspace / export center) and email
   notifications on success / blocked / failure.

### Flow (per run, automatic)
A run fires from a **webhook** (merge/PR), a **Jira event**, a **manual "Run now"**, or a
**simulated merge**. Then, in the background:

1. **Decide the action** — skip, *place* into a matching section, or cut a new *version*
   (release merges that name a version win over the configured bump strategy).
2. **Relevance gate** — merges classified as internal/irrelevant are logged and **skipped**
   (never documented). *(Same rules engine as Doc sync.)*
3. **Traceability gate** — if the profile requires a Jira issue and the merge has none, the
   run is **held**.
4. **Generate / update** — the document is (re)generated through the full pipeline
   (parse → generate sections → apply style → judge quality → AI-readiness → render).
5. **Quality gate** — the run's overall score is compared to your threshold. Below the bar →
   **Gate blocked** (held, not published).
6. **Approval gate (optional)** — if on, the new version enters **"Under review"**
   (*Awaiting approval*) instead of auto-publishing — an enterprise checkpoint.
7. **Publish** — if it passes and no approval gate is set, it publishes to the configured
   target and bumps the version.
8. **Notify** — email on success / blocked / failure per your settings.
9. **Record the run** — outcome (Published / Gate blocked / Awaiting approval / Filtered out),
   score, placement, reasoning, and any Jira link land in the run history.

### Human role
Minimal by default — the quality gate decides what ships. You can add an approval gate to
require a human sign-off before publishing (which routes through the same review model as
Doc sync).

### Best for
Keeping a whole documentation set continuously fresh with little manual effort, with quality
gates, versioning, publishing, and notifications — "build the pipeline once, never do this
again."

---

## Side-by-side

| | **Doc sync** | **Automation** |
|---|---|---|
| **Unit of work** | One specific existing document | A pipeline/profile (repo + branch + triggers) |
| **Scope** | That document, section by section | Whole document types, regenerated/updated |
| **Trigger** | On-demand (Check / Simulate) or watch | Automatic on every merge / PR / Jira event (webhook), plus manual/simulate |
| **What it produces** | A section-level splice into that doc | A regenerated/updated document that publishes |
| **Change granularity** | One best-matched section per change | Whole-document generate, or placed into a section |
| **Quality gate** | None — you review everything | Yes — score threshold decides publish vs hold |
| **Human role** | Review-first: approve every diff | Policy-driven: auto-publish; optional approval gate |
| **Publishing** | Applied to the document on approval | Publishes to workspace/export + email notifications |
| **Versioning** | Immutable version on each approval | Version bump per strategy (semver / release tag) |
| **Governance extras** | — | Relevance skip, Jira traceability gate, run history, effectiveness trends |
| **Best for** | Babysitting one critical hand-written doc | Continuous, at-scale, governed doc maintenance |

---

## How they relate (shared foundations)

They are two front-ends over the same core:

- **Same relevance engine** — both use the rule sets + `docify.yaml` + thresholds to decide
  whether a change is worth documenting (and both skip internal noise).
- **Same "nothing publishes without approval" guarantee** — Doc sync enforces it always;
  Automation enforces it when the approval gate is on (routing to the same review queue).
- **Same section-placement logic** — matching a change to the right section of an existing
  document.
- **Same quality judge and versioning** — the judge that scores Automation runs is the same
  one used across generation, and both cut restorable versions.

## Which should I use?

- **Use Doc sync** when you have a specific, important document and you want to see and
  approve every change — tight, manual, surgical.
- **Use Automation** when you want documentation to maintain itself across a repo with quality
  gates and publishing, and you're comfortable letting the gate (or an approval step) decide —
  hands-off and continuous.
- **Use both together** — Automation to keep the broad doc set continuously fresh, and Doc
  sync (or Automation's approval gate) to keep a hand on your most critical documents.
