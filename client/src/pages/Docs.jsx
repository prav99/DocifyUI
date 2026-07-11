import React, { useMemo, useState } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { NavBar } from '../ui.jsx';
import { usePageMeta } from '../seo.js';

/* =====================================================================
   Documentation portal — content registry.
   Three strategic pillars lead; supporting guides follow. Every topic is
   a real article at /docs/<slug>. Add a topic here and the home page,
   search, navigation, and related-articles links all pick it up.
   ===================================================================== */

const PILLARS = [
  {
    id: 'visibility',
    num: '01',
    name: 'AI visibility & ranking intelligence',
    desc: 'Measure whether AI systems can find, trust, cite, and rank your content — with evidence, before you publish.',
    topics: [
      { slug: 'ai-compatibility-checker', name: 'AI compatibility checker', sum: 'Evaluate whether generated content is optimized for AI-powered discovery, retrieval, and citation.', body: [
        { p: 'Every generated document is scored across six weighted quality dimensions — style & editorial, consistency, completeness, readability, LLM readiness, and link integrity. The weighted blend produces one overall score against a configurable publish gate (default ≥ 85).' },
        { h: 'What the checker looks for' },
        { ul: ['A short description under the title that AI systems can quote as a summary', 'Search-optimized titles that match how people actually ask questions', 'Self-contained sections that survive being retrieved out of context', 'Consistent terminology — one term, one meaning, no duplicated content', 'Working links: broken references directly reduce retrieval trust'] },
        { p: 'Each open finding shows its projected impact ("+N overall when fixed") and a one-click Apply fix that genuinely rewrites the content, re-renders every export format, and re-scores the document.' }
      ]},
      { slug: 'llm-as-a-judge', name: 'LLM-as-a-Judge framework', sum: 'An LLM judge cross-examines every document against an enterprise documentation rubric.', body: [
        { p: 'Instead of shallow lint rules, the judge evaluates the document the way an AI assistant will consume it: can a section answer a question on its own, does the title match a real query, is there metadata to summarize from.' },
        { h: 'How scoring stays trustworthy' },
        { p: 'All scores derive from a single server-side model — dimensions, weights, penalties, verdicts, and per-assistant estimates are computed from one configuration, so the dashboard, the MOAT panel, and the downloadable report can never contradict each other.' },
        { ul: ['Verdicts: Publish-ready (≥ 85) · Review recommended (≥ 70) · Needs work', 'Findings carry the exact suggested rewrite and a before/after diff once applied', 'Re-check at any time — the judge re-confirms the live state of the document'] }
      ]},
      { slug: 'ai-readiness-dashboard', name: 'AI readiness dashboard', sum: 'One screen: overall gauge, six dimension scores, assistant estimates, and the path to the publish gate.', body: [
        { p: 'The quality dashboard shows your overall score as a gauge with a ghost arc marking your potential score if every open finding is fixed. Each dimension card is clickable and drills straight into its findings.' },
        { ul: ['Dimension bars with weight, open findings, and live re-scoring after each fix', '"Will this land in AI assistants?" cards with per-model readiness and retrieval probability', 'A four-stage pipeline view: input → analysis → scoring → human in the loop', 'Fix all remaining — applies every fix sequentially while the dashboard re-scores'] }
      ]},
      { slug: 'chatgpt-ranking-analysis', name: 'ChatGPT ranking analysis', sum: 'Predicted retrieval and citation probability for ChatGPT, from its retrieval profile.', body: [
        { p: 'ChatGPT\'s profile weighs LLM readiness heaviest (45%), then link integrity, readability, completeness, and consistency. Your dimension scores are blended through that profile into a readiness score, then mapped to a probability estimate — capped below 100% because certainty would be a false claim.' },
        { p: 'The estimate is recomputed the moment a fix lands, and the MOAT panel shows the ceiling: the probability you reach once all open findings are fixed. Expand the assistant card to see the full profile next to your current score on each dimension.' }
      ]},
      { slug: 'gemini-ranking-analysis', name: 'Gemini ranking analysis', sum: 'Predicted performance on Google Gemini, weighted toward grounding signals.', body: [
        { p: 'Google Gemini\'s retrieval profile emphasizes LLM-readiness metadata (38%) and link integrity (27%) — reflecting grounding behavior where broken references and missing metadata sharply reduce citation likelihood — plus readability, completeness, and style.' },
        { p: 'Assistant profiles are fully configurable server-side: set QUALITY_ASSISTANTS in the server environment to redefine the model list and blends without a code change.' }
      ]},
      { slug: 'claude-ranking-analysis', name: 'Claude ranking analysis', sum: 'Predicted performance on Claude, weighted toward self-contained, readable sections.', body: [
        { p: 'Claude\'s profile weighs LLM readiness (40%) and readability (25%) most, plus completeness and consistency. Documents with clear section boundaries and prerequisite context score highest.' },
        { p: 'When a document is held back, the dashboard names the weakest dimension in that assistant\'s blend ("Held back by: Completeness") so you know exactly which fixes move this model\'s estimate.' }
      ]},
      { slug: 'ai-citation-readiness', name: 'AI citation readiness', sum: 'Make every section quotable: short descriptions, anchors, and self-contained chunks.', body: [
        { p: 'AI assistants cite what they can extract cleanly. The generator writes every heading with a stable anchor id, keeps sections self-contained, and — once the metadata fixes are applied — adds a short description and keyword set that retrieval systems quote directly.' },
        { ul: ['Annotated preview marks retrieval-ready chunks, consistent terms, and broken links inline', 'The AI consumability report exports the full audit as plain HTML for reviews', 'Citation-hostile patterns (ambiguous pronouns, run-on sentences, duplicated passages) are flagged with one-click rewrites'] }
      ]},
      { slug: 'content-quality-assessment', name: 'Content quality assessment', sum: 'Six dimensions, transparent weights, and penalties you can tune.', body: [
        { p: 'Scoring is deliberately explainable: each dimension starts at 100 and loses a fixed penalty per open finding, broken link, or failed style check, with a floor of 40. The overall score is the weight-blended sum — no black box.' },
        { ul: ['Style & editorial 15% · Consistency 13% · Completeness 15% · Readability 15% · LLM readiness 27% · Link integrity 15%', 'Structure checks validate every document against its type blueprint', 'Weights, gates, and penalties are configuration, not code'] }
      ]}
    ]
  },
  {
    id: 'automation',
    num: '02',
    name: 'Automated documentation platform',
    desc: 'High-quality technical and business documentation generated from commits, pull requests, and repository activity.',
    topics: [
      { slug: 'docs-from-commits', name: 'Documentation from code commits', sum: 'Turn development activity into standards-aligned documentation automatically.', body: [
        { p: 'Connect a repository and DocGen\'s pipeline parses the repo structure, extracts code comments, drafts sections against an open documentation standard, and runs quality checks — producing a publish-ready draft in minutes instead of sprint-ends.' },
        { h: 'The unified generation framework' },
        { p: 'Every document type — technical and marketing — is driven by a declarative blueprint: purpose, audience, tone, a standardized section outline, and content rules. One composition engine renders them all, so tone and structure stay uniform across your entire library.' },
        { ul: ['11 document types across two tracks, each tied to an open standard (Diátaxis, OpenAPI 3.1, Keep a Changelog, Google dev-docs)', 'Structure validation against the blueprint appears in every quality report', 'New types are added by configuration — no pipeline changes'] }
      ]},
      { slug: 'github-integration', name: 'GitHub integration', sum: 'OAuth in one click; repositories, READMEs, and commit history as source material.', body: [
        { p: 'Sign up with GitHub and DocGen requests read-only repository access via OAuth. Your repositories appear in a picker immediately — select one and generate. Tokens are stored server-side and never exposed to the browser.' },
        { p: 'GitLab, Jira, Confluence, Notion, and OpenAPI specs connect the same way, and you can attach multiple sources to a single generation with one primary source.' }
      ]},
      { slug: 'bitbucket-integration', name: 'Bitbucket integration', sum: 'Full OAuth flow with automatic token renewal.', body: [
        { p: 'Bitbucket access tokens expire after roughly two hours; DocGen stores the refresh token and silently renews access on every request, so customers never see an expired-session failure mid-generation.' },
        { p: 'Configuration mirrors GitHub: an OAuth consumer in your workspace with a callback to the DocGen API, and read-only repository scope.' }
      ]},
      { slug: 'pull-request-analysis', name: 'Pull request analysis', sum: 'Regenerate exactly the documents a change affects, on every merge.', body: [
        { p: 'With automation enabled, every merge to main triggers regeneration: the pipeline re-reads the changed sources, re-drafts affected sections, and re-runs the quality gate before anything publishes.' },
        { p: 'The included CI workflow uploads the quality report as a build artifact and fails the job if the score drops below your gate — documentation drift becomes a failed check, not a surprise.' }
      ]},
      { slug: 'change-impact-analysis', name: 'Change impact analysis', sum: 'Know which documents a commit touches before you publish.', body: [
        { p: 'Because every document records its sources and repository, DocGen maps development activity to the documents built from it. A change to your authentication module flags the API reference, the quick start, and the troubleshooting guide that cite it.' },
        { p: 'Combined with the quality gate, this gives a safe default: regenerate what changed, re-judge it, and hold anything that no longer clears the bar for human review.' }
      ]},
      { slug: 'technical-doc-generation', name: 'Technical documentation generation', sum: 'API references, guides, runbooks — in DITA, Markdown, HTML, DocBook, ePub, PDF, and Word.', body: [
        { p: 'Seven technical document types cover the reference-to-tutorial spectrum, and every one exports to seven formats including real binary .docx and .pdf with your page setup, headers, footers, page numbers, and watermark applied.' },
        { ul: ['~25 output options: cover and identity, structure, page & branding, legal', 'Type-specific previews: changelogs render as timelines, troubleshooting as symptom cards', 'SKILL.md support: your own outline, tone, and terminology rules reshape any type'] }
      ]},
      { slug: 'lifecycle-automation', name: 'Documentation lifecycle automation', sum: 'Generate → judge → fix → export → regenerate on merge. The loop runs itself.', body: [
        { p: 'The lifecycle is a closed loop: generation produces a draft, the judge scores it, fixes repair it with full diffs, export ships it, and CI regenerates it when code changes. Humans stay in the loop where it matters — approving fixes and gating publishes.' },
        { p: 'Nothing publishes itself: the quality gate and the human review step are enforced product-wide.' }
      ]}
    ]
  },
  {
    id: 'intelligence',
    num: '03',
    name: 'Executive intelligence & governance',
    desc: 'Quality scores, ranking trends, and audit-ready reporting for the people accountable for content performance.',
    topics: [
      { slug: 'ai-performance-analytics', name: 'AI performance analytics', sum: 'Per-model readiness and probability, tracked as scores change.', body: [
        { p: 'Every document carries per-assistant readiness scores and retrieval probabilities for ChatGPT, Claude, and Google Gemini. Each applied fix records the movement — the dashboard shows "+N pts" deltas as estimates rise.' },
        { p: 'The assistant list and blends are configuration, so analytics extend to any model your organization cares about.' }
      ]},
      { slug: 'content-quality-monitoring', name: 'Content quality monitoring', sum: 'Continuous scoring across the library, not one-off audits.', body: [
        { p: 'Every generation is scored at creation and re-scored after every fix and re-check. With CI automation on, every merge produces a fresh report — so quality is a monitored signal, not an annual project.' },
        { ul: ['Dashboard lists every document with its live score and verdict', 'Re-check with the AI judge at any time for a signed re-confirmation', 'Quality reports are exportable per document for review workflows'] }
      ]},
      { slug: 'ranking-trends', name: 'Ranking trends', sum: 'Watch probability move from draft to publish-ready.', body: [
        { p: 'The MOAT panel animates each model\'s retrieval probability as fixes land, with a ghost bar marking the ceiling once all findings are resolved. A typical API reference moves from ~50% to the mid-90s across the three models after the full fix set.' },
        { p: 'Deltas are computed from the same scoring model as everything else, so trend claims always reconcile with the report.' }
      ]},
      { slug: 'optimization-recommendations', name: 'Optimization recommendations', sum: 'Every finding is an action with a projected gain.', body: [
        { p: 'Recommendations are never vague: each finding names the exact location, shows the suggested rewrite, and carries a projected overall gain ("+4 overall"). Apply fix executes the rewrite for real and shows the before/after diff.' },
        { p: '"Fix all remaining" applies the complete set sequentially — the fastest path from Needs work to Publish-ready.' }
      ]},
      { slug: 'compliance-governance', name: 'Compliance & governance', sum: 'Classification, watermarks, legal blocks, and verified corporate identity.', body: [
        { p: 'Output options cover the governance surface: classification labels, DRAFT banners, watermarks on every page, disclaimer and copyright blocks, and a document identity table (version, date, author, ID) on every output.' },
        { ul: ['Corporate email verification with domain allow-lists and free-email blocking', 'OAuth tokens held server-side; role-based access on team plans', 'Structure validation proves each document conforms to its declared standard'] }
      ]},
      { slug: 'executive-reporting', name: 'Executive reporting dashboard', sum: 'The AI consumability report: a complete audit record in plain HTML.', body: [
        { p: 'One download captures everything a stakeholder needs: overall score and verdict, all six dimension scores with weights, per-model readiness estimates, every finding with its status, and the exact before/after of each applied fix.' },
        { p: 'It ships as dependency-free HTML — attach it to a release review, an audit, or a customer security questionnaire as-is. A JSON variant serves CI and BI pipelines.' }
      ]}
    ]
  }
];

const SUPPORTING = [
  { t: 'Getting started', items: [
    { slug: 'connect-first-source', name: 'Connect your first source', sum: 'One place for connections; every workflow reuses them.', body: [
      { p: 'All provider connections live on ONE page: Repository Connections (the Repositories item in the top navigation). Connect your GitHub, GitLab, or Bitbucket account there once — plus any organisations, groups, or workspaces — and every workflow in the product reuses that configuration automatically. You never reconnect the same provider twice.' },
      { p: 'On the Source step you simply pick from your unified repository catalogue. Jira, Confluence, and Notion connect directly on the Source step with their own dedicated panels — site URL, account email, and an API token for the Atlassian products (verified live before you continue), an internal integration token for Notion. OpenAPI and Swagger specs are added from a URL, pasted text, or a file inside a connected repository.' },
      { p: 'You can combine several sources in one generation — a repository plus Jira issues plus an API spec, for example. Each source contributes its real content; the first code source becomes the primary.' }
    ]},
    { slug: 'generate-api-reference', name: 'Generate an API reference', sum: 'Source → doc type → format → generate: four steps to a scored draft.', body: [
      { p: 'Choose the API reference type (OpenAPI 3.1-aligned), pick a format, optionally set output options, and generate. The pipeline drafts endpoint tables, auth, errors, and rate limits, then scores the result. The preview honors every option you set — toggle Rendered/Source to inspect the exact markup.' }
    ]},
    { slug: 'read-quality-report', name: 'Read a quality report', sum: 'Overall gauge, six dimensions, assistants, findings — and what to do about each.', body: [
      { p: 'Start at the overall gauge and verdict. Click any dimension card to filter its findings. Each finding explains the problem, the suggested fix, and the projected gain. Apply fixes one at a time or all at once; the export step always ships the corrected content.' }
    ]}
  ]},
  { t: 'Formats & output', items: [
    { slug: 'output-formats', name: 'Output formats', sum: 'DITA, Markdown, HTML, DocBook, ePub, PDF, Word — plus marketing formats.', body: [
      { p: 'Technical documents export to DITA topics, Markdown, standalone HTML, DocBook 5.0, EPUB3 XHTML, and real binary PDF and Word (.docx). Marketing tracks add landing-page snippets and email-safe HTML. Every format is rendered from one master, so content never diverges between formats.' }
    ]},
    { slug: 'output-options', name: 'Output options', sum: '~25 controls across cover & identity, structure, page & branding, and legal.', body: [
      { p: 'Configure title, subtitle, organization, author, version, document ID, classification, cover and contents behavior, numbered headings, glossary, revision history, accent color, watermark, header/footer text, page size and numbers, disclaimer, and copyright. Options apply genuinely per format — the PDF page setup is real page setup.' }
    ]},
    { slug: 'skills-skill-md', name: 'Skills (SKILL.md)', sum: 'Your outline, tone, audience, and terminology rules — applied at generation time.', body: [
      { p: 'Attach a SKILL.md on the doc-type step. Its Sections list replaces the blueprint outline; tone, audience, and Rules reshape the writing. The pipeline shows "Applying skill" as a step, and the quality report notes that the skill governs structure. A downloadable template gets you started.' }
    ]}
  ]},
  { t: 'Sources & connections', items: [
    { slug: 'repository-connections', name: 'Repository Connections hub', sum: 'Accounts, organisations, groups, and workspaces — configured once, used everywhere.', body: [
      { p: 'Repository Connections (Repositories in the top navigation) is the single source of truth for every code-host integration. It has three tabs: Connections, Managed repositories, and Rule sets.' },
      { h: 'Connections' },
      { p: 'Each provider — GitHub, GitLab, Bitbucket — has a card showing your account status (Connected as <you>, Session expired, or Not connected) with Connect, Reauthenticate, and Disconnect actions. Below the account, connect any number of organisations, GitLab groups (nested subgroups like my-group/backend work), or Bitbucket workspaces by name. Each one is validated against the provider before saving and shows its repository count, last sync time, and Sync / Remove actions. Public organisations need no account at all; with a member account connected, organisation-private repositories you can access are included too.' },
      { h: 'The unified catalogue' },
      { p: 'Everything connected here aggregates into one repository catalogue: your account’s repositories, every connected organisation’s repositories, and individually added repositories — deduplicated, grouped by organisation, with assigned rule sets attached. The Source step, the Automation wizard, and Doc sync all read this same catalogue, so a repository connected once is available everywhere instantly.' },
      { ul: ['Managed repositories: bulk-paste up to 200 owner/name lines or URLs, verify access, assign documentation rule sets, enable/disable, health-check', 'Removing an organisation removes its repositories from every workflow immediately', 'Arriving from a workflow? A blue return bar keeps your place — connect what you need, click “Return to workflow”, and your progress (and the new repository, auto-selected) is waiting'] }
    ]},
    { slug: 'multi-repo-selection', name: 'Selecting repositories', sum: 'Organisation-grouped dropdowns, add-another, and public repositories.', body: [
      { p: 'On the Source step, each connected code host shows one compact row: a dropdown grouped by organisation. Pick a repository and the row collapses to a confirmation — name, branch, visibility — with Change to swap it.' },
      { h: 'More than one repository' },
      { p: 'After the first pick, “＋ Add another repository” lets you select more. Every additional repository gets its OWN generation with identical settings (document types, formats, instructions) — they run in parallel and land on your Dashboard side by side. Selecting repositories on two different hosts works the same way: each host’s pick is documented separately.' },
      { h: 'Public repositories' },
      { p: '“Use a public repository” accepts any owner/name (for example expressjs/express) with no connection required — DocGen reads public repositories anonymously. This is also the fastest way to try the product.' },
      { p: 'Selections are guarded for trust: if a provider is disconnected, a token expires, or you lose access to a repository, the stale selection is cleared automatically with a notice — you can never generate from a repository you no longer have.' }
    ]},
    { slug: 'jira-source', name: 'Jira as a source', sum: 'Issues — not repositories. Six ways to select them; full content grounds the document.', body: [
      { p: 'Jira is issue-based, not repository-based. Connect it on the Source step with your site URL (yourteam.atlassian.net), account email, and an API token from id.atlassian.com → Security → API tokens. Optionally pick a project to scope everything below.' },
      { h: 'Six selection modes' },
      { ul: ['Issue keys — type or paste keys (DOC-101, DOC-102), comma- or line-separated; each key is validated live, and invalid or inaccessible keys are listed in red with the exact reason', 'Search — by key, title, label, or assignee; multi-select from the results', 'Epic — pick an epic from the dropdown and pull in its child issues', 'Sprint — a sprint by name, or leave empty for the active sprint', 'Release — pick a fix version and select its issues', 'JQL — any query, e.g. project = DOC AND status = Done AND updated >= -14d'] },
      { p: 'Selected issues appear as removable chips with their summaries. Duplicates are detected and skipped automatically.' },
      { h: 'What DocGen reads' },
      { p: 'At generation time the FULL content of every selected issue is fetched: summary, description, type, status, priority, assignee and reporter, labels, components, fix versions, parent and linked issues, and recent comments. That content becomes real source material — you can generate release notes from an epic with no repository involved at all.' }
    ]},
    { slug: 'openapi-swagger-source', name: 'OpenAPI & Swagger sources', sum: 'Multiple specs, an endpoint tree, real validation — and generation grounded in the spec.', body: [
      { p: 'API specifications are first-class sources with their own panel. Add a spec three ways: From URL (any public JSON or YAML spec address), Paste spec (drop the raw document in), or From repository (host + owner/name + file path + branch — private repositories use your connected account).' },
      { h: 'Inspect before you commit' },
      { p: 'Every spec is parsed and analysed on the spot: title, version, OpenAPI/Swagger version (3.x and 2.0 both supported), endpoint count, schemas, and authentication schemes. Validation findings are listed — broken $ref references, duplicate operationIds, operations without responses or descriptions, missing authentication — with errors and warnings separated.' },
      { h: 'Choose exactly what to document' },
      { p: 'A checkbox tree groups every operation by tag. Select all, none, all-except-deprecated, whole tag groups, or individual operations. Add several specs — from different URLs, repositories, and folders — to one documentation project; each shows as a labelled card with its endpoint selection and validation badge.' },
      { p: 'Generation is grounded in a digest of exactly the selected operations: parameters, request bodies, response codes with resolved schemas, and auth requirements. The API reference documents your real API, never a template.' }
    ]},
    { slug: 'notion-source', name: 'Notion as a source', sum: 'Pages and databases, searched and multi-selected; child pages optional.', body: [
      { p: 'Create an internal integration at notion.so/profile/integrations, share the pages it should read (Page → ⋯ → Connections), and paste the token on the Source step. Only shared pages are ever visible.' },
      { p: 'Search by title — or browse recent pages with an empty search — and multi-select from the results. Selected pages and databases appear as chips; tick “Include child pages” to pull entire hierarchies in at generation time.' },
      { h: 'What DocGen reads' },
      { ul: ['Headings, paragraphs, lists, to-dos, quotes, callouts, and code blocks — flattened to clean markdown', 'Tables row by row', 'Databases: each row’s title and properties (status, select, dates, numbers) as a compact table', 'Nested content follows list items and toggles; unreadable or unshared pages are skipped without failing the run'] }
    ]},
    { slug: 'confluence-source', name: 'Confluence as a source', sum: 'Spaces, page trees, and CQL — combine pages from multiple spaces.', body: [
      { p: 'Connect with your site URL, account email, and API token. Pick a space to scope browsing, then select pages three ways: Browse space (latest pages), Search (title or full text), or CQL for anything advanced — space = ENG AND label = "api" order by lastmodified desc.' },
      { p: 'Multi-select from any mix of spaces; selections show as chips with their space keys. “Include child pages” pulls each selected page’s descendants at generation time. Pages you cannot access are never listed, and restricted pages encountered during fetching are skipped silently — the rest of the run continues.' },
      { h: 'What DocGen reads' },
      { p: 'The full page body — headings, paragraphs, tables, and code macros — plus labels, space, and last-updated metadata. Content is normalized before generation, so a Confluence architecture page and a repository can ground the same document together.' }
    ]}
  ]},
  { t: 'Writing style & governance', items: [
    { slug: 'writing-profiles', name: 'Writing profiles', sum: 'Why every document sounds like the same careful writer — and how to make it sound like yours.', body: [
      { p: 'Documents generated on different days by different prompts usually read like different people wrote them. DocGen prevents that with layered writing profiles that resolve into ONE policy before any content is generated.' },
      { h: 'The layers, in order' },
      { ul: ['Docify Professional Style — the base: active voice, short sentences, second person, sentence-case headings, global readability, no marketing fluff (a separate marketing base applies on the marketing track)', 'A document-type profile — a User guide is instructional with mandatory Prerequisites and Troubleshooting; Release notes are one-line, past-tense, factual; an API reference is precise with mandatory Authentication and Errors sections', 'Your organization profile — Settings → Writing style: pick a style-guide bias (Docify, Microsoft, or Google conventions), set your voice, preferred terminology, prohibited words, and free-form policy notes', 'Your customization per generation — a SKILL.md file or manual instructions'] },
      { p: 'Custom instructions refine the defaults — your tone wins where it conflicts with a stylistic preference — but they can never remove mandatory sections, invent facts, or disable safety rules. Uploaded skill files are treated as untrusted input: prompt-injection attempts are stripped before anything reaches the model.' },
      { p: 'The resolved policy is stored with every generation, including which version of your organization profile shaped it — auditable and reproducible.' }
    ]},
    { slug: 'terminology-consistency', name: 'Terminology & consistency scores', sum: '“Sign in” or “log in” — pick one, and the whole library follows.', body: [
      { p: 'In Settings → Writing style, define preferred terms one per line: sign in => log in, login. The chosen term is used everywhere — headings, steps, tables, notes — across every document you generate from then on. Prohibited words (simply, obviously, leverage…) are flagged wherever they appear.' },
      { h: 'Checked after generation, not just requested' },
      { p: 'Every finished document runs through a deterministic writing audit. The Quality page’s Style tab shows consistency scores — Voice, Terminology, Structure, Formatting, and an overall Writing consistency number — plus concrete findings: “Preferred term: sign in · Detected: log in · 4 occurrences · Replace”. Unambiguous violations (e-mail → email, utilize → use) are corrected automatically before you ever see the document; everything else stays a finding for you to decide.' },
      { ul: ['Structure findings flag missing mandatory sections and skipped heading levels', 'Voice findings flag passive-voice density and over-long sentences', 'Safe auto-corrections never touch code blocks'] }
    ]},
    { slug: 'doc-sync-style-matching', name: 'Doc sync style matching', sum: 'Updates spliced into your document dress like their neighbours.', body: [
      { p: 'When Doc sync updates a section of YOUR existing document, the new content is conformed to the conventions of the section it lands in: the surrounding text is sampled for its list markers (- versus *), heading capitalization, and bold-lead bullet patterns, and the insert is adjusted to match before you review it.' },
      { p: 'The review queue’s reasoning panel notes exactly this — so “one paragraph suddenly reads like a different person wrote it” is the failure mode the pipeline is built to avoid, and the diff you approve shows the already-conformed text.' }
    ]}
  ]},
  { t: 'Automation & CI', items: [
    { slug: 'jira-automation-triggers', name: 'Jira event triggers', sum: 'Run a pipeline when an issue closes — no merge required.', body: [
      { p: 'Automation pipelines can be triggered directly from Jira. In the pipeline wizard’s Triggers step, open Advanced, enable Jira, and pick the events: issue moves to Done/Closed/Resolved (the most common trigger), issue created, issue updated, or comment added.' },
      { p: 'Point a Jira webhook (Jira Settings → System → Webhooks) at your pipeline’s endpoint with ?token=<secret> appended — the URL and secret are shown after the pipeline is created. The issue key rides through the whole run, so traceability, placement, and run history all show which issue caused which documentation change.' },
      { p: 'Jira-triggered runs skip the merge-relevance gate — your choice of events IS the intent filter, and there is no code diff to classify.' }
    ]},
    { slug: 'relevance-filtering', name: 'Relevance filtering & docify.yaml', sum: 'Why refactors, test changes, and dependency bumps never pollute your docs — and how to tune it.', body: [
      { p: 'Not every merge deserves customer documentation. Docify runs every change through a relevance funnel: deterministic rules first (commit types like chore/refactor/test, dependency-only diffs, test-only changes, excluded paths), then surface detection (did the change touch a public API, CLI, configuration, error messages, webhooks, or UI?), then an AI impact score from 0–100. Changes at or above the documentation threshold are queued; borderline ones are flagged "low confidence" for review; internal-only ones are skipped — and every skip is logged in Doc sync’s Filtered out tab with the exact reason and a one-click "Document anyway" override.' },
      { p: 'Control it from your repository with two optional files. docify.yaml holds machine-enforceable rules: scan.include/exclude path globs, rules.ignore_commit_types, ignore_dependency_updates, document_only surfaces, always_document_paths, and the thresholds (auto_document, discard_below). A .docifyignore file with gitignore syntax works too. Both are versioned with your code and picked up automatically on the next sync — no Docify settings to change. Starter files are one click away under Doc sync → Relevance rules.' },
      { p: '.docify/instructions.md is the judgment layer — free-form Markdown the AI reads before scoring, the same pattern as CLAUDE.md or .cursorrules. Use it for what rules can’t express: "never document the labs/ directory", "our customers are backend developers", "say workspace, never tenant". Every reviewer decision on filtered changes also feeds back into the classifier, so the engine converges on your team’s definition of customer-facing.' }
    ]},
    { slug: 'ci-pipeline-setup', name: 'CI pipeline setup', sum: 'A ready-made workflow: regenerate on merge, upload the report, gate on quality.', body: [
      { p: 'The Automation page provides a copy-paste workflow that runs on pushes to main: it regenerates your configured documents, uploads the quality report as an artifact, and enforces a quality gate (default 85) so regressions fail the build.' }
    ]},
    { slug: 'quality-gates-ci', name: 'Quality gates in CI', sum: 'Treat documentation quality like test coverage: a number the build enforces.', body: [
      { p: 'Set the gate to match your risk tolerance. The JSON report variant exposes overall score, verdict, dimensions, and open findings — pipe it into dashboards or block deploys when the score drops.' }
    ]}
  ]},
  { t: 'Account & security', items: [
    { slug: 'roles-permissions', name: 'Roles and permissions', sum: 'Viewer, Operator, and Admin roles on team plans.', body: [
      { p: 'Viewers read documents and reports; Operators generate and apply fixes; Admins manage sources, automation, and billing. Enterprise adds SSO and custom roles.' }
    ]},
    { slug: 'oauth-connections', name: 'OAuth connections & tokens', sum: 'How DocGen stores and renews source credentials.', body: [
      { p: 'OAuth tokens are stored server-side, never in the browser. Providers with expiring tokens (Bitbucket, GitLab) include refresh tokens, and DocGen renews access silently. Revoking access at the provider immediately invalidates the stored credentials.' }
    ]},
    { slug: 'corporate-email-verification', name: 'Corporate email verification', sum: 'Six-digit OTP codes, domain allow-lists, and free-email blocking.', body: [
      { p: 'Email signups receive a hashed six-digit code valid for ten minutes (five attempts). Administrators can restrict signups to corporate domains with ALLOWED_EMAIL_DOMAINS or block free providers entirely — configured server-side, no code changes.' }
    ]},
    { slug: 'status-page', name: 'System status & uptime', sum: 'Live component health at /status — with uptime numbers that cannot flatter us.', body: [
      { p: 'The public status page at /status (also linked in the site footer) shows live health for the API, database, AI generation engine, and webhook receiver, plus uptime for the last 24 hours, 7 days, and 30 days and a 90-day daily history strip.' },
      { p: 'The numbers are honest by construction: the service records a health sample every five minutes, and if it is down it cannot record — so gaps count as downtime. Uptime is only ever measured against observed history; a young deployment shows dashes, never an invented 99.99%.' },
      { p: 'External monitors can poll GET /api/health — it returns HTTP 200 while healthy and 503 during a disruption, with per-component detail in the body.' }
    ]}
  ]}
];

/* Flat index for search + article lookup */
const ALL_TOPICS = [
  ...PILLARS.flatMap((p) => p.topics.map((t) => ({ ...t, cat: p.name, catId: p.id }))),
  ...SUPPORTING.flatMap((g) => g.items.map((t) => ({ ...t, cat: g.t, catId: 'support' })))
];
const BY_SLUG = Object.fromEntries(ALL_TOPICS.map((t) => [t.slug, t]));

/* ---------------- Docs home ---------------- */
export function Docs() {
  usePageMeta({
    title: 'Product Docs & Guides',
    description: 'How DocGen works: AI compatibility checking, LLM-as-a-Judge scoring, ChatGPT/Claude/Gemini ranking analysis, CI/CD automation, and every output format.',
    path: '/docs'
  });
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return null;
    return ALL_TOPICS.filter((t) =>
      t.name.toLowerCase().includes(s) || t.sum.toLowerCase().includes(s) || t.cat.toLowerCase().includes(s));
  }, [q]);

  return (
    <>
      <div className="page">
        <div className="docshero">
          <p className="eyebrow eyebrow--blue mb3">AI DOCUMENTATION INTELLIGENCE PLATFORM</p>
          <h1 className="h05" style={{ maxWidth: 760 }}>Create documentation that AI understands, trusts, and ranks.</h1>
          <p className="body02 t2 mt5" style={{ maxWidth: 720 }}>
            DocGen helps organizations automatically generate documentation from code commits, evaluate
            AI compatibility with an LLM-as-a-Judge framework, and predict content performance across
            ChatGPT, Google Gemini, Claude, and other AI-powered platforms.
          </p>
          <div className="field mt7" style={{ maxWidth: 480 }}>
            <label htmlFor="docSearch">Search the docs</label>
            <input id="docSearch" className="input" placeholder="e.g. ranking, SKILL.md, quality gate"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {results ? (
          <div className="mt6">
            <p className="helper mb5">{results.length} article{results.length === 1 ? '' : 's'} for “{q.trim()}”</p>
            {results.map((t) => (
              <Link key={t.slug} to={'/docs/' + t.slug} className="docresult">
                <div>
                  <p className="h01">{t.name}</p>
                  <p className="helper mt2">{t.sum}</p>
                </div>
                <span className="tag tag--outline">{t.cat}</span>
              </Link>
            ))}
            {results.length === 0 && <p className="body01 t2">Nothing matched — try “ranking”, “commit”, or “report”.</p>}
          </div>
        ) : (
          <>
            {/* -------- The three strategic pillars -------- */}
            <h2 className="h03 mt9 mb3">Three capabilities. One platform.</h2>
            <p className="body01 t2 mb5" style={{ maxWidth: 680 }}>
              Measure AI compatibility, generate documentation from development activity, and predict
              performance across the AI platforms your customers actually use.
            </p>
            <div className="pillargrid">
              {PILLARS.map((p) => (
                <div key={p.id} className="pillarcard">
                  <span className="pillarnum mono">{p.num}</span>
                  <h3 className="h02 mt3">{p.name}</h3>
                  <p className="helper mt3">{p.desc}</p>
                  <div className="pillartopics mt5">
                    {p.topics.map((t) => (
                      <Link key={t.slug} to={'/docs/' + t.slug} className="topiclink">
                        {t.name}<span className="tarrow">→</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* -------- Supporting guides -------- */}
            <h2 className="h02 mt9 mb3">Supporting guides</h2>
            <p className="helper mb5">Setup, formats, automation, and account administration.</p>
            <div className="grid4">
              {SUPPORTING.map((g) => (
                <div key={g.t} className="tile">
                  <p className="h01 mb3">{g.t}</p>
                  {g.items.map((t) => (
                    <p key={t.slug} className="body01 mt3">
                      <Link to={'/docs/' + t.slug} className="doclink">{t.name}</Link>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <NavBar back="/" />
    </>
  );
}

/* ---------------- Article page ---------------- */
export function DocArticle() {
  const { slug } = useParams();
  const t = BY_SLUG[slug];
  usePageMeta({
    title: t ? t.name + ' | DocGen Docs' : 'Product Docs & Guides',
    description: t ? t.sum : '',
    path: t ? '/docs/' + t.slug : '/docs'
  });
  if (!t) return <Navigate to="/docs" replace />;
  const related = ALL_TOPICS.filter((x) => x.catId === t.catId && x.slug !== t.slug).slice(0, 4);
  return (
    <>
      <div className="page" style={{ maxWidth: 880 }}>
        <p className="artcrumb">
          <Link to="/docs">Docs</Link> <span>/</span> {t.cat}
        </p>
        <h1 className="h04 mt3">{t.name}</h1>
        <p className="body02 t2 mt3">{t.sum}</p>
        <div className="divider" style={{ margin: '24px 0' }} />
        {t.body.map((b, i) => (
          b.h ? <h2 key={i} className="h02 mt6 mb3">{b.h}</h2>
            : b.ul ? (
              <ul key={i} className="artlist mt3">
                {b.ul.map((li) => <li key={li} className="body01">{li}</li>)}
              </ul>
            ) : <p key={i} className="body01 mt3" style={{ maxWidth: 720 }}>{b.p}</p>
        ))}

        <div className="tile tile--white mt9" style={{ padding: 24 }}>
          <p className="h01">See it on your own repository</p>
          <p className="helper mt2">Connect a source and generate a scored document in under five minutes.</p>
          <Link to="/signup" className="btn btn--primary mt5" style={{ display: 'inline-flex' }}>
            Start free<span className="ico">→</span>
          </Link>
        </div>

        {related.length > 0 && (
          <>
            <h2 className="h02 mt9 mb3">Related in {t.cat}</h2>
            <div className="grid2">
              {related.map((r) => (
                <Link key={r.slug} to={'/docs/' + r.slug} className="docresult">
                  <div>
                    <p className="h01">{r.name}</p>
                    <p className="helper mt2">{r.sum}</p>
                  </div>
                  <span className="tarrow">→</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
      <NavBar back="/docs" />
    </>
  );
}
