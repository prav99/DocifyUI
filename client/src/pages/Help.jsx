import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePageMeta } from '../seo.js';
import { SUPPORT_EMAIL, supportMailto } from '../config.js';

/* ---------------- Help content: one topic per screen ----------------
 * Each topic mirrors a page of the app. Pages link here via <HelpLink/>
 * (ui.jsx), so a customer stuck anywhere lands on the matching article.
 */
const TOPICS = {
  login: {
    title: 'Signing up & logging in',
    page: '/signup',
    intro: 'Create an account with a code host (GitHub, GitLab, Bitbucket) in one click, or with your work email and a password.',
    steps: [
      'Fastest path: click "Continue with GitHub / GitLab / Bitbucket". This signs you in AND authorizes that host as a documentation source in one step.',
      'Email path: switch to "With email", enter your work address and a password of at least 8 characters. The strength meter must not show "Weak".',
      'If email verification is enabled for your workspace, check your inbox for a 6-digit code and enter it to activate the account.',
      'Returning users: click "Log in" at the bottom of the page (or the Login button in the top bar).'
    ],
    issues: [
      ['"Password must be at least 8 characters"', 'Use 8+ characters. Mixing upper/lower case, digits, and symbols moves the meter to "Strong".'],
      ['"An account with this email already exists"', 'Switch to Log in — the address is already registered.'],
      ['"Invalid email or password"', 'Check for typos and caps lock. Passwords are case-sensitive.'],
      ['Verification code expired', 'Codes last 10 minutes. Click "Resend code" for a fresh one.'],
      ['"Use your corporate email" message', 'Your workspace restricts signups to company domains — personal providers (gmail, yahoo, …) are not accepted.']
    ]
  },
  source: {
    title: 'Step 1 — Connecting sources',
    page: '/source',
    intro: 'Pick where your source of truth lives. Repositories come from your unified catalogue; Jira, Confluence, Notion, and OpenAPI specs each have their own selection panel and can be combined freely.',
    steps: [
      'Tick every source you want DocGen to read. The first code source becomes the primary input.',
      'Repositories: one panel lists everything from your Repository Connections catalogue in a dropdown grouped by organisation. Pick one, then "＋ Add another repository" for more — each extra repository runs as its own generation with the same settings. "Use a public repository" accepts any owner/name (for example expressjs/express) with no connection.',
      'Jira: connect with site URL, email, and API token, then select ISSUES six ways — paste keys (validated live), search, an epic, a sprint, a release, or a JQL query. Selected issues become chips; their full content (description, comments, links) grounds the document.',
      'OpenAPI / Swagger: add specs from a URL, pasted text, or a repository file. Inspect shows title, version, endpoints, and validation findings; a checkbox tree picks exactly which endpoints to document. Multiple specs can be combined.',
      'Notion: paste your integration token, search shared pages, multi-select, and optionally include child pages.',
      'Confluence: connect, pick a space, then Browse / Search / CQL to multi-select pages from any mix of spaces, with optional child pages.',
      'When every selected source shows "Ready ✓", click Continue.'
    ],
    issues: [
      ['"No repositories available"', 'Nothing is connected yet — click "Go to Repository Connections", connect an account or organisation, and use "Return to workflow"; your progress is saved and the new repository is auto-selected.'],
      ['A repository selection disappeared', 'The trust guard cleared it: the provider was disconnected, its token expired, or you lost access. Reconnect on the Repository Connections page.'],
      ['Jira keys show in red', 'Those keys were not found or your account cannot view them — the reason is listed next to each key. Valid keys from the same paste were still added.'],
      ['Spec inspection fails', 'The URL must return raw JSON or YAML (not a web page), and private/internal network addresses are blocked by design.'],
      ['Continue button stays gray', 'Every selected source needs at least one selection. The footer lists which ones still need setup.']
    ]
  },
  repos: {
    title: 'Repository Connections',
    page: '/repos',
    intro: 'The single place for every code-host integration: accounts, organisations, GitLab groups, Bitbucket workspaces, individually managed repositories, and documentation rule sets. Everything connected here flows into one catalogue used by generation, automation, and Doc sync.',
    steps: [
      'Connections tab: each provider card shows your account status with Connect / Reauthenticate / Disconnect. Below it, add organisations, groups (nested subgroups like my-group/backend work), or workspaces by name — each shows its repository count with Sync and Remove.',
      'Managed repositories tab: bulk-paste up to 200 repositories (owner/name or full URLs), verify access, assign rule sets, enable/disable, and health-check individual rows.',
      'Rule sets tab: reusable documentation-control configurations (what gets documented, for whom) assignable to any number of repositories.',
      'Came here from a workflow? The blue bar at the top returns you exactly where you left off — with anything you just connected auto-selected.'
    ],
    issues: [
      ['Organisation will not connect', 'The name is validated against the provider first — check the exact slug (for GitLab groups, use the full path, e.g. parent/subgroup).'],
      ['Session expired on a provider', 'Click "Reconnect account" on that provider’s card — a fresh OAuth pass restores access without losing your organisations or repositories.'],
      ['Repository counts look stale', 'Click Sync on the organisation row; the catalogue refreshes immediately.']
    ]
  },
  doctype: {
    title: 'Step 2 — Choosing document types',
    page: '/doctype',
    intro: 'Decide what DocGen should produce. Technical documentation and marketing material are separate tracks with different formats.',
    steps: [
      'Pick a track: "Technical documentation" or "Marketing material".',
      'Select one or more document types — each is generated against a recognized open standard (shown on the card).',
      'Selections generate together as a set; every type you tick becomes its own document section.',
      'Click "Standard framework →" on any card to see the outline that type follows.'
    ],
    issues: [
      ['Continue disabled', 'Select at least one document type.'],
      ['Types reset after switching tracks', 'Technical and marketing selections are independent — switching tracks shows that track’s own selection.']
    ]
  },
  format: {
    title: 'Step 3 — Output format & options',
    page: '/format',
    intro: 'Choose the file format for this run and fine-tune the document furniture (cover, table of contents, watermark, branding, page setup).',
    steps: [
      'Pick a format card. Technical: DITA, PDF, Word, Markdown, HTML, DocBook, ePub. Marketing: PDF, Word, Markdown, HTML snippet, Email.',
      'Open the Output options accordions to set title, subtitle, company name, author, version, classification, TOC depth, watermark, headers/footers, and page size.',
      '"Reset to defaults" restores the standard configuration.',
      'Click "Generate document" to start the pipeline.'
    ],
    issues: [
      ['Format marked "coming soon"', 'Social post packs and PPTX decks are on the roadmap — selecting them shows a notice instead of generating.'],
      ['Options not visible in the preview', 'Options apply at generation time. Re-generate after changing them; the preview always reflects the latest run.']
    ]
  },
  generate: {
    title: 'Step 4 — Generation pipeline',
    page: '/generate',
    intro: 'DocGen parses the repository, extracts code context, drafts every selected document type, and runs quality checks — usually under a minute.',
    steps: [
      'Watch the pipeline steps complete on the left; the rendered preview appears on the right when drafting finishes.',
      'Toggle between "Rendered" and "Source" to inspect the raw output.',
      'When the footer shows "Generation complete", continue to the quality report.'
    ],
    issues: [
      ['Generation failed', 'Rare — usually a connectivity hiccup. Start a new run from the dashboard; failed runs are never billed.'],
      ['Preview looks generic / wrong product', 'If AI generation is unavailable the pipeline falls back to a template draft. Check that the repository is public or its source connection is authorized, then re-run.'],
      ['Stuck on a step', 'Refresh the page — the pipeline keeps running server-side and the page re-attaches to it.']
    ]
  },
  quality: {
    title: 'Step 5 — AI quality review',
    page: '/quality',
    intro: 'An LLM judge scores the document against an enterprise documentation rubric: structure, titles, metadata, clarity, and examples.',
    steps: [
      'The overall score (0–100) and verdict sit at the top. 85+ passes the publish gate.',
      'The "AI judge review" tab lists open findings — click "Apply fix" on one, or "Fix all remaining" to repair everything at once. Fixes are real content edits.',
      'The "Scores" tab breaks the result into weighted dimensions; "Broken links" lists link-check failures; "Style guide" shows editorial checks plus your writing-consistency scores (Voice, Terminology, Structure, Formatting) with concrete findings like “Preferred term: sign in · Detected: log in · 4 occurrences”.',
      '"Re-check with AI judge" re-runs the evaluation to verify the score after fixes.',
      'The dark panel estimates how likely the document is to be retrieved and cited by ChatGPT, Claude, and Gemini — it recomputes after every fix.'
    ],
    issues: [
      ['Score below the gate', 'Apply the suggested fixes — each one shows its point value. The gate (default 85) is configurable in Automation.'],
      ['Broken links reported', 'Fix the targets at the source, or let auto-regenerate re-link them on the next merge.']
    ]
  },
  export: {
    title: 'Step 6 — Export & download',
    page: '/export',
    intro: 'Download the finished document in your chosen format, plus the AI consumability report. Every download is built from the latest corrected content.',
    steps: [
      'Click "Download <format>" for the document. Binary formats (PDF, Word) are assembled at download time with your page setup applied.',
      '"AI consumability report" downloads the full quality report as reviewer-friendly HTML.',
      '"Show final preview" renders exactly what the file will contain.',
      'Use "Set up auto-regenerate on merge" to keep the document current automatically — see the Automation help topic.'
    ],
    issues: [
      ['Download does nothing', 'Allow downloads for this site in your browser settings, then retry.'],
      ['File shows fixes are missing', 'Downloads always include applied fixes. If content looks stale, re-open the export page — it fetches the latest state.']
    ]
  },
  dashboard: {
    title: 'Dashboard',
    page: '/dashboard',
    intro: 'Your home base: document totals, average quality score, automation pipelines, and every recent generation across connected sources.',
    steps: [
      'Click any recent generation to reopen its quality report and downloads.',
      '"New generation" starts the 6-step wizard from Step 1.',
      '"Automation" and "Team & settings" jump to their pages.'
    ],
    issues: [
      ['A generation shows "failed"', 'Open it and re-run, or start a new generation — failures are safe to retry.'],
      ['Dashboard is empty', 'No documents yet under this account. Data is per-account, so a new login starts clean.']
    ]
  },
  automation: {
    title: 'Automation & CI',
    page: '/automation',
    intro: 'Documents drift the moment code merges. Automation regenerates them on every merge to your chosen branch and gates publishing on the quality score.',
    steps: [
      'Enable automation and pick the branch to watch (default: main).',
      'Set the quality gate — regenerated documents below this score are held for review instead of published.',
      'Copy the CI snippet into your repository’s workflow to trigger regeneration from your pipeline.',
      'Automation profiles let you run several pipelines (different repos, document sets, formats) side by side; each has its own webhook secret and run history.',
      'Jira event triggers: in the wizard’s Triggers step, open Advanced, enable Jira, and pick events (issue Done/Closed, created, updated, comment added). Point a Jira webhook at the profile’s endpoint with ?token=<secret> — issue events then run the pipeline directly, no merge required.'
    ],
    issues: [
      ['Webhook not firing', 'Verify the webhook URL and secret in your repo settings match the profile, and that the push was to the watched branch.'],
      ['Jira events ignored', 'Check that Jira is enabled in the profile’s Advanced section AND the specific event type is toggled on — the webhook response says exactly why an event was skipped.'],
      ['Runs held at the gate', 'That is the gate working — open the run, apply fixes, and re-check to pass it.']
    ]
  },
  sync: {
    title: 'Doc sync',
    page: '/sync',
    intro: 'Bring your EXISTING documentation and keep it current automatically: every relevant merge is rewritten into the right section of your document — no duplicates — and waits for your approval as a side-by-side diff.',
    steps: [
      'Add a document two ways: upload a file, or import directly from a docs repository (owner/name + file path). Markdown, Word, and plain text are parsed into a section outline.',
      'Connect the repository whose changes should drive updates. Each merge runs through the relevance engine first — refactors, test-only changes, and dependency bumps are filtered out (see the "Filtered out" tab for every skip, with the reason and a one-click "Document anyway" override).',
      'Relevant changes produce an update proposal: the AI picks the best-matching section (the reasoning panel explains why, with candidate sections and confidence), rewrites it in place or splices a new sub-section under the right parent, and conforms the insert to your document’s own conventions — bullet style, heading case — so it reads like the same author.',
      'Review each proposal as a side-by-side diff and approve or dismiss. Nothing touches your document without approval; approved versions are kept, so you can roll back.',
      'Tune what counts as documentation-worthy with docify.yaml and .docify/instructions.md in your repository, or a rule set from Repository Connections.'
    ],
    issues: [
      ['Entries marked SAMPLE', 'Rows tagged “Sample data” with fictional authors are built-in demo material so the page is understandable before your first sync — they disappear as your real activity arrives.'],
      ['An update landed in the wrong section', 'Open the proposal’s reasoning panel and pick one of the alternative candidate sections, or dismiss it — reviewer decisions feed the classifier.'],
      ['A change I expected was filtered out', 'Check the Filtered out tab — every skip shows its rationale (commit type, internal-only surface, below threshold) and can be documented anyway with one click.']
    ]
  },
  settings: {
    title: 'Team & settings',
    page: '/settings',
    intro: 'Manage connected sources, your organization writing style, team members, roles, and your plan.',
    steps: [
      'Writing style tab: set your organization voice once and every future document follows it — pick a style-guide bias (Docify, Microsoft, or Google conventions), define preferred terminology one pair per line (sign in => log in, login), list prohibited words, and add free-form policy notes. Saving bumps the profile version; "Reset to default profile" clears customizations.',
      'Connected sources tab shows each provider connection and whether credentials are on file.',
      'Invite teammates by email — they receive Writer access by default; owners can change roles.',
      'Your current plan, billing cycle, and seat count are shown under Plan.'
    ],
    issues: [
      ['Invite not received', 'Ask the teammate to check spam, or re-send the invite.'],
      ['Need more seats', 'Change the seat count during checkout, or contact sales on the Enterprise plan.']
    ]
  },
  pricing: {
    title: 'Plans & pricing',
    page: '/pricing',
    intro: 'Free covers evaluation (5 watermarked generations per month, 1 source, PDF and Word only). Team unlocks every format, source, and automation. Enterprise adds custom volume and controls.',
    steps: [
      'Toggle monthly vs annual billing — annual is discounted.',
      'Pick a plan to go to checkout; Enterprise routes to a sales conversation.'
    ],
    issues: [
      ['Hit the free-plan limit', 'The counter resets monthly, or upgrade to Team for unmetered generation.'],
      ['Watermark on documents', 'Free-plan output is watermarked; paid plans remove it.']
    ]
  },
  checkout: {
    title: 'Checkout & billing',
    page: '/checkout',
    intro: 'Secure card checkout for the Team plan. You are billed per seat, monthly or annually.',
    steps: [
      'Review plan, cycle, and seats, then confirm payment.',
      'A receipt is emailed after every successful charge; plan changes apply immediately.'
    ],
    issues: [
      ['Payment declined', 'Verify the card details and available balance, or try another card. Nothing is charged on a failed attempt.'],
      ['Wrong seat count billed', 'Seats can be adjusted any time from Team & settings — changes are prorated.']
    ]
  },
  docs: {
    title: 'Product docs & guides',
    page: '/docs',
    intro: 'Long-form product documentation: concepts, integration guides, and the full API surface of DocGen itself.',
    steps: [
      'Browse the article list, or open a guide directly from links in the app.',
      'For hands-on help with a specific screen, use the Help link on that screen instead.'
    ],
    issues: []
  }
};

const ORDER = ['login', 'source', 'repos', 'doctype', 'format', 'generate', 'quality', 'export', 'dashboard', 'automation', 'sync', 'settings', 'pricing', 'checkout', 'docs'];

export default function Help() {
  const { topic } = useParams();
  const nav = useNavigate();
  usePageMeta({
    title: 'Help Center',
    description: 'Guides for every screen of DocGen — connecting sources, choosing document types, output formats, the AI quality review, exporting, and automation.',
    path: topic ? '/help/' + topic : '/help'
  });
  const t = TOPICS[topic];

  if (!t) {
    return (
      <div className="page">
        <p className="eyebrow mb3" style={{ color: '#0f62fe' }}>HELP CENTER</p>
        <h1 className="h04">How can we help?</h1>
        <p className="body01 t2 mt3">Every screen of DocGen has its own guide — pick the one you need. You can also open these from the “Help” link on any page.</p>
        <div className="grid4 mt7">
          {ORDER.map((id) => (
            <div key={id} className="tile tile--click" onClick={() => nav('/help/' + id)}>
              <p className="h01">{TOPICS[id].title}</p>
              <p className="helper mt2">{TOPICS[id].intro.slice(0, 90)}…</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page page--narrow">
      <p className="eyebrow mb3" style={{ color: '#0f62fe' }}>HELP CENTER</p>
      <h1 className="h04">{t.title}</h1>
      <p className="body01 t2 mt3">{t.intro}</p>

      <h2 className="h02 mt7 mb3">How it works</h2>
      <ol className="body01" style={{ paddingLeft: 20, lineHeight: 1.9 }}>
        {t.steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>

      {t.issues.length > 0 && (
        <>
          <h2 className="h02 mt7 mb3">Troubleshooting</h2>
          <div className="stack">
            {t.issues.map(([q, a], i) => (
              <div key={i} className="tile" style={{ padding: 16 }}>
                <p className="h01">{q}</p>
                <p className="body01 t2 mt2">{a}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="divider" style={{ margin: '32px 0 16px' }} />
      <p className="body01">
        <a onClick={() => nav(t.page)}>← Back to {t.title.replace(/^Step \d+ — /, '')}</a>
        {' · '}
        <Link to="/help">All help topics</Link>
        {' · '}
        <Link to="/docs">Product docs</Link>
      </p>
      <p className="helper mt3">
        Still stuck? <Link to="/contact">Send us a message</Link> or email{' '}
        <a href={supportMailto('Help — ' + t.title)}>{SUPPORT_EMAIL}</a> — include the page you were on and what you clicked.
      </p>
    </div>
  );
}
