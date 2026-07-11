# Docify — Customer-Facing Change Filtering Architecture

**Status:** Proposed · **Author:** Docify engineering · **Date:** 2026-07-10

The problem this design solves: *not every merged change deserves customer documentation.*
Refactors, renames, logging, test code, and dependency bumps are noise to end users. Docify's
promise is documentation customers can trust — which means the pipeline must decide, for every
change, "does a customer need to know this?" and be able to explain that decision.

The guiding principle: **document behavior, not code.** A change matters if and only if it
alters something a user can see, call, configure, or be broken by.

---

## 1 · The five-stage funnel (overview)

Changes flow through progressively more expensive stages. Most noise dies cheaply in stages
1–2 before any AI runs; the LLM only reasons about survivors. Every elimination is logged
with the rule or rationale that killed it — nothing silently disappears.

```
merge event
   │
   ▼
[0] Repo configuration load        docify.yaml · .docifyignore · .docify/instructions.md
   │
   ▼
[1] Deterministic filters          paths, file types, commit type, diff shape     (~70% eliminated, $0)
   │
   ▼
[2] Surface extraction             what USER-VISIBLE surface did this touch?      (static analysis, $0)
   │
   ▼
[3] LLM impact classification      customer_impact score + category + rationale   (one focused AI call)
   │
   ▼
[4] Doc-impact mapping             which existing sections change; what's new     (existing Doc sync engine)
   │
   ▼
[5] Review & feedback loop         approve/reject in the review queue → improves stage 3
```

---

## 2 · Stage 0 — Repository configuration (`docify.yaml`)

**Yes, this is industry best practice.** Every serious developer tool ships repo-level config:
`renovate.json`, `.github/release.yml`, `netlify.toml`, `mkdocs.yml`, `.golangci.yml`.
Configuration-as-code in the repo means rules are versioned, reviewed in PRs, and travel with
the code. Docify should read (in priority order): `docify.yaml` → `.docify/config.yaml` →
organization defaults → sensible built-ins. Zero-config must still work well; config makes it precise.

```yaml
# docify.yaml — full example
version: 1

product:
  name: Acme Payments
  audience: "developers integrating the payments API"   # steers tone + relevance judgment
  terminology:
    - use: "payment intent"     never: "charge object"
    - use: "workspace"          never: "tenant"

scan:
  include:
    - "src/api/**"
    - "src/cli/**"
    - "openapi/**"
  exclude:
    - "**/*_test.*"
    - "**/testdata/**"
    - "internal/**"
    - "scripts/**"
    - "**/*.lock"

rules:                       # declarative relevance rules (stage 1)
  ignore_commit_types: [chore, refactor, test, style, ci, build]   # conventional commits
  ignore_dependency_updates: true
  ignore_comment_only_changes: true
  ignore_formatting_only_changes: true
  document_only:             # if set, ONLY these surfaces produce docs
    - public_api
    - cli
    - configuration
    - error_messages
  always_document_paths:     # overrides — these always reach the AI stage
    - "openapi/**"
    - "src/config/schema.*"

thresholds:
  auto_document: 80          # impact score ≥ 80 → generate + queue normally
  review_below: 80           # 40–79 → generate, but flag "low confidence" in review queue
  discard_below: 40          # < 40 → skip, log the rationale

docs:
  types: [userguide, api]
  formats: [markdown, html]
```

`.docifyignore` (gitignore syntax) is supported as a lighter alternative for teams that only
want path exclusion — the same parser, familiar semantics, zero learning curve.

## 3 · Stage 1 — Deterministic filters (cheap, explainable, fast)

Run before any AI. Each filter is a named rule; when it eliminates a change, the audit log
records `eliminated_by: rule_name`. Expected to remove ~60–80% of merge noise at zero cost.

| Filter | Signal | Example |
|---|---|---|
| Path rules | config include/exclude globs | `internal/**`, `**/*_test.go` |
| Commit type | Conventional Commits prefix | `chore:`, `refactor:`, `test:`, `style:` skipped |
| Dependency bumps | lockfile-only or manifest-version-only diffs | `package-lock.json`, `go.sum` |
| Formatting-only | AST-equal or whitespace-only diff | prettier/gofmt runs |
| Comment-only | diff touches only comment tokens | internal dev notes |
| Rename/move | git rename detection with no content delta | file reorganization |
| Generated code | linguist-generated / config markers | `*.pb.go`, `dist/**` |
| Merge mechanics | merge commits with no novel diff vs parents | back-merges |

Two industry conventions worth first-class support because they encode **human intent**:
- **Conventional Commits** (`feat:` / `fix:` / `chore:`…) — the same signal semantic-release
  uses to build changelogs. A `feat:` is a strong positive prior; a `chore:` a strong negative.
- **PR labels** — respect `skip-docs` / `docs-required` labels, mirroring
  `.github/release.yml`'s exclude-labels pattern that GitHub uses for release notes.

Important: except for explicit config (`exclude` paths, `skip-docs` label), stage-1 filters are
*demotions, not vetoes* — a `refactor:` commit that also changes a public function signature
must still survive, which is why stage 2 exists.

## 4 · Stage 2 — Surface extraction (what could a user even see?)

Static analysis of the diff to detect touches to **user-visible surfaces**. This is the
strongest objective signal — far more reliable than commit messages, which lie.

Surfaces detected, in rough order of documentation value:

1. **Public API** — exported/public symbols added, removed, or with changed signatures
   (the approach behind Microsoft's API Extractor and Go's `apidiff`; per-language extractors,
   start with TS/JS + Python + Go, expand by demand)
2. **HTTP surface** — OpenAPI spec diffs; route/handler tables; request/response types
3. **CLI surface** — flags, subcommands, help text (argparse/cobra/commander patterns)
4. **Configuration surface** — config schemas, env-var reads, default values
5. **Error surface** — user-facing error strings/codes added or changed
6. **UI surface** — routes, visible strings, component props in front-end repos
7. **Behavioral markers** — feature flags flipped, deprecation annotations, version constants

Output per change: `{surfaces_touched: [public_api, config], evidence: [...]}` — evidence being
the concrete symbols/routes/flags, which later becomes both LLM context and human-readable
explanation. If `document_only` is configured and no listed surface was touched → eliminated here.

## 5 · Stage 3 — LLM impact classification

**Yes, an LLM can make this judgment well — but only as the final referee, not the whole
system.** By this stage it receives a pre-filtered change plus rich, structured context, and
answers one narrow question with a structured verdict:

Input bundle: PR title/description/labels · commit messages · linked issue title · trimmed diff ·
stage-2 surface evidence · relevant existing doc sections · `.docify/instructions.md` ·
repo terminology/audience · few-shot examples from this repo's past review decisions.

Output (strict JSON, temperature 0):

```json
{
  "customer_impact": 87,
  "category": "public_api_change",
  "audience_relevance": "developers calling the refunds endpoint",
  "summary": "Refunds now accept partial amounts via the `amount` parameter.",
  "rationale": "New optional public parameter changes caller-visible behavior; PR links issue #482 requesting partial refunds.",
  "doc_action": "update",
  "affected_sections": ["API reference > Refunds"],
  "confidence": "high"
}
```

Design rules that keep this consistent and explainable:
- **Score + category + rationale always** — the rationale is shown verbatim in the review queue
  (this extends the per-change reasoning Doc sync already shows).
- **Thresholds from config** route the outcome: auto-document / flag-for-review / discard-with-log.
- **Determinism measures**: temperature 0, versioned prompts, rubric-anchored scoring bands
  (90+: breaking or new capability · 70–89: visible behavior/parameter change · 40–69: edge-case
  visible · <40: internal), golden test set per prompt release.
- **Cost control**: the funnel means the model sees only ~20–40% of changes, each with a
  trimmed diff (surfaces + hunks, not whole files).

### The AI instruction file — `.docify/instructions.md`

**Yes — adopt it.** This is now an established pattern: Claude Code's `CLAUDE.md`, Cursor's
`.cursorrules`, Copilot's `.github/copilot-instructions.md`. Free-form Markdown is the right
format because relevance judgment is fuzzy — prose captures what YAML can't:

```markdown
# Docify instructions for this repository

## Document
- Anything that changes what an API caller sends or receives
- New webhooks, new config options, changed defaults, changed limits
- Error codes a customer could encounter and act on

## Never document
- The `labs/` directory (experimental, unannounced)
- Internal rate-limiter tuning, cache sizes, retry internals
- Anything behind the `internal_beta` feature flag until it is removed

## Voice
- Second person, present tense. Say "workspace", never "tenant".
- Our customers are backend developers; skip UI hand-holding.
```

Division of labor: **`docify.yaml` = machine-enforceable rules** (paths, thresholds, types);
**`instructions.md` = judgment guidance** injected into the stage-3 prompt. Both versioned in
the repo, both changeable via normal PR review.

## 6 · Stage 4–5 — Doc mapping, human review, and the feedback loop

Stage 4 reuses the existing Doc sync engine: map the surviving change to the exact sections it
affects; propose a new section only when impact is high and no section matches.

Stage 5 is the existing review queue, extended:
- Borderline scores (40–79) are badged **"low confidence — review recommended."**
- A **"Filtered out" tab** lists discarded changes with their elimination rule/rationale —
  trust requires seeing what the system chose *not* to document, and one click ("document this
  anyway") overrides it.
- **Every human decision becomes training signal**: approvals/rejections/overrides are stored
  per-repo and fed back as few-shot examples in stage 3. After ~20 decisions the classifier is
  measurably tuned to that team's taste without any model fine-tuning. This feedback loop is
  the moat: generic tools guess; Docify learns each repo's definition of "customer-facing."

Optional enterprise add-on, inspired by `changesets`: teams that want explicit control can
require a `.changeset/*.md` entry or PR-description `docs:` block — human-declared intent
becomes the strongest stage-3 signal of all.

## 7 · Cross-provider scaling

All of the above operates on a normalized `ChangeEvent` produced by the existing
GitHub/GitLab/Bitbucket adapters:

```
ChangeEvent { provider, repo, base, head, commits[{message, type}],
              pr {title, body, labels}, files[{path, status, patch, renamed_from}] }
```

Stages 1–5 never see provider-specific shapes — one filtering brain, three (later N) providers.
Webhook payload differences, PR-vs-MR naming, and label APIs stay confined to adapters.

## 8 · Answers to the five questions, in one line each

1. **AI filtering?** Yes — as the *final referee* over pre-filtered changes with structured
   evidence (surfaces, PR metadata, instructions), never as a raw diff-to-docs firehose.
2. **Repo configuration?** Yes — `docify.yaml` (+ `.docifyignore`), versioned in the repo;
   this is the established pattern of every credible dev tool; zero-config defaults still work.
3. **Documentation rules?** Yes — declarative, named, cheap, and logged; they kill the bulk of
   noise before AI cost and give enterprises the governance story they demand.
4. **AI instruction file?** Yes — `.docify/instructions.md`, mirroring CLAUDE.md/.cursorrules;
   it is the highest-leverage quality input because it encodes business judgment no heuristic can.
5. **Hybrid?** Emphatically — rules for the obvious, static surface analysis for the objective,
   LLM for the judgment call, humans for the borderline, and a feedback loop so the borderline
   keeps shrinking. That layering *is* the enterprise-grade answer.

## 9 · Phased implementation plan

| Phase | Scope | Effort |
|---|---|---|
| 1 | `docify.yaml` + `.docifyignore` loader; path/commit-type/lockfile/comment-only filters; audit log; "Filtered out" tab | small — highest ROI |
| 2 | Stage-3 LLM classifier with structured verdict; thresholds; rationale surfaced in review queue | medium |
| 3 | Surface extraction for TS/JS + OpenAPI diff (then Python, Go); `document_only` enforcement | medium |
| 4 | Feedback loop (decisions → few-shot memory); `.docify/instructions.md` injection | small |
| 5 | Changesets-style explicit declarations; org-level config inheritance; per-surface analytics | later |

Phase 1 alone eliminates most of the noise problem visibly and cheaply — ship it first, market
it honestly ("Docify decides what *not* to document, and shows you why"), and let phases 2–4
turn the differentiator into the moat.
