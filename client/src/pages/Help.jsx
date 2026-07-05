import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

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
    intro: 'Pick where your source of truth lives. Code hosts provide repositories; Jira, Confluence, Notion, and OpenAPI specs can be combined with them.',
    steps: [
      'Tick every source you want DocGen to read. The first code source becomes the primary input.',
      'For code hosts: choose a repository from the dropdown, or type any public repository as owner/name (for example expressjs/express) in the second field.',
      'For Jira/Confluence: enter your site URL, account email, and an API token, then pick a project or space after the connection is verified.',
      'For OpenAPI: paste the full https:// URL of your spec and click "Validate spec".',
      'When every selected source shows "Ready ✓", click Continue.'
    ],
    issues: [
      ['Dropdown stuck on "Loading…"', 'The source list could not be fetched — check your connection, then re-select the source card to retry.'],
      ['"Nothing found — check permissions"', 'The token connected but sees no projects. Verify the token scopes on the provider side.'],
      ['Continue button stays gray', 'Every selected source needs one detail (repository, project, or spec URL). The footer lists which ones still need setup.']
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
      'The "Scores" tab breaks the result into weighted dimensions; "Broken links" lists link-check failures; "Style guide" shows editorial checks.',
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
      'Automation profiles let you run several pipelines (different repos, document sets, formats) side by side; each has its own webhook secret and run history.'
    ],
    issues: [
      ['Webhook not firing', 'Verify the webhook URL and secret in your repo settings match the profile, and that the push was to the watched branch.'],
      ['Runs held at the gate', 'That is the gate working — open the run, apply fixes, and re-check to pass it.']
    ]
  },
  settings: {
    title: 'Team & settings',
    page: '/settings',
    intro: 'Manage team members, roles, invites, your plan, and account details.',
    steps: [
      'Invite teammates by email — they receive Writer access by default; owners can change roles.',
      'Your current plan, billing cycle, and seat count are shown under Plan.',
      'Upgrade or change plans from the Pricing page.'
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

const ORDER = ['login', 'source', 'doctype', 'format', 'generate', 'quality', 'export', 'dashboard', 'automation', 'settings', 'pricing', 'checkout', 'docs'];

export default function Help() {
  const { topic } = useParams();
  const nav = useNavigate();
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
      <p className="helper mt3">Still stuck? Email support@docgen.dev — include the page you were on and what you clicked.</p>
    </div>
  );
}
