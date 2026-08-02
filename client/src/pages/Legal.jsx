import React from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { NavBar } from '../ui.jsx';
import { usePageMeta } from '../seo.js';
import { SUPPORT_EMAIL } from '../config.js';

/* =====================================================================
   Legal & trust documents. One registry, one renderer — served in-app at
   /legal/<slug> so every version ships with the product. Replace the
   placeholder contact addresses and company identity before launch, and
   have counsel review: this is a solid starting point, not legal advice.
   ===================================================================== */

// Bump this whenever the policy text changes materially — §13 promises it.
const UPDATED = '2026-08-01';
// Legal, privacy, and security enquiries all route to the single support
// mailbox (see client/src/config.js — override with VITE_SUPPORT_EMAIL).
const CONTACT = SUPPORT_EMAIL;
const SECURITY_CONTACT = SUPPORT_EMAIL;
const COMPANY = 'Docify'; // ← replace with your legal entity name

export const LEGAL = {
  privacy: {
    title: 'Privacy Policy',
    summary: 'What we collect, why, where it lives, and the rights you keep.',
    sections: [
      { h: 'The short version', p: 'Docify reads your repositories to generate documentation. We store your account details, your connection credentials, and the documents Docify produces — we do not keep copies of your source files. To write a document, a limited selection of your files is sent to Anthropic (our AI subprocessor); your credentials never are. Because the document is written from your code, it can quote short excerpts, and it is stored with your account. We do not sell data. Deleting your account erases it and everything in it.' },
      { h: '1. Who we are', p: COMPANY + ' provides an AI documentation intelligence platform: generation of documentation from connected sources, AI quality evaluation, ranking estimates, and merge-driven automation ("the Service"). This policy covers the Service and our websites. Contact: ' + CONTACT + '.' },
      { h: '2. Information we collect', ul: [
        'Account data — email address, name (optional), hashed password (bcrypt; we cannot read it), email-verification state.',
        'Connection credentials — OAuth access/refresh tokens for code hosts (GitHub, GitLab, Bitbucket) and API tokens for Jira, Confluence, and Notion. Requested with read-only scopes wherever the provider supports them.',
        'Generated content — the documents Docify produces, their configuration (types, formats, output options, uploaded SKILL.md files), quality reports, and automation run history.',
        'Merge metadata — when you enable automation: branch names, commit identifiers, commit messages, and changed file paths delivered by your repository webhooks.',
        'Billing data — plan, seats, billing cycle, and optional tax ID. We do not collect card details at all: online payment is not enabled, no payment processor is connected, and the checkout page\'s card fields are disabled placeholders that cannot be filled in or submitted.',
        'Operational logs — timestamps, IP addresses, and request metadata used for security, rate limiting, and abuse prevention.',
        'Product analytics — page views and feature-usage events (which buttons and workflows are used, and when), collected through PostHog, Google Analytics, and, on our public marketing pages only, Microsoft Clarity. Autocapture and session recording are switched off, on-screen text and form inputs are masked, and identifiers such as email addresses, tokens, and verification codes are stripped from event properties and URLs before they are sent.'
      ] },
      { h: '3. What we deliberately do not collect', ul: [
        'We do not keep copies of your source files. At generation time Docify reads a limited selection of files (currently up to twelve, capped at roughly 6,000 characters each) plus any docify.yaml, .docifyignore, or .docify instructions in the repository. Those contents are never written to our database, to disk, or to our logs.',
        'What you hand us directly IS stored in full, because the Service cannot work otherwise: files you upload (such as SKILL.md), specifications you paste, and documents you add to Doc sync.',
        'The document Docify writes is stored with your account and can quote short excerpts of your code, since it is written from your code.',
        'Docify never writes to your repositories — no commits, no branches, no pull requests. On GitHub the OAuth scope that grants private-repository reading also technically permits writing; Docify contains no code that writes, and we are moving to a GitHub App to make that limit technical rather than a promise.',
        'We do not use advertising trackers or sell personal data to anyone.'
      ] },
      { h: '4. How we use information', ul: [
        'To provide the Service: generate documents, score them, run your automation pipelines, and send the notifications you configure.',
        'To secure the Service: verify webhook signatures, rate-limit abuse, investigate incidents.',
        'To bill you and to communicate service changes. Product emails are transactional; marketing email, if any, is opt-in.'
      ] },
      { h: '5. AI processing', p: 'To generate a document, Docify sends the source material for that document to Anthropic\'s Claude API — our only AI subprocessor, and the only third party that receives your content. That material is whatever you selected for the run: the repository files described in section 3, and, where you connect them, the Jira issues, Confluence pages, Notion pages, and OpenAPI specifications you choose, along with any SKILL.md or specification you upload or paste. Automation runs additionally send commit messages and changed file paths so Docify can judge whether a change is worth documenting. Doc sync sends the text of the document you asked it to work on when you use Standardize or request a rewrite. Under Anthropic\'s commercial terms, API inputs and outputs are not used to train their models. Your credentials are never sent. Separately, the quality score and the AI-search-readiness estimate are computed by the Service itself from the finished document and send nothing to any external AI platform; they are modeled signals, not guarantees of how any AI system will rank your content.' },
      { h: '6. Sharing and subprocessors', p: 'We share data only with subprocessors needed to run the Service: Anthropic (AI generation — receives the source material described in section 5), our hosting provider, the email delivery provider, our analytics providers (PostHog, Google Analytics, and Microsoft Clarity on marketing pages — they receive the usage events described in section 2, not your documents or source material), and, when payments are enabled, the payment processor. Each is bound by data-protection terms. We disclose data if the law genuinely compels it, and we will tell you unless legally forbidden. A current subprocessor list is available on request at ' + CONTACT + '.' },
      { h: '7. Retention', ul: [
        'Account and generated content: for the life of your account.',
        'OAuth and API tokens: until you disconnect the source, rotate them, or delete your account — whichever comes first.',
        'Automation run history: the most recent runs per pipeline (older entries roll off automatically).',
        'Operational logs: up to 90 days.',
        'Deleting your account (Settings → Sign-in & security → Delete account) removes it and its documents, versions, connections, pipelines, and settings from production immediately. Backups age out on their own schedule (up to 90 days).'
      ] },
      { h: '8. Security', p: 'Passwords and verification codes are stored as bcrypt hashes. Webhooks are authenticated with per-pipeline HMAC secrets you can rotate at any time. Transport is TLS in production deployments. Access to production data is restricted and logged. No system is perfectly secure; report concerns to ' + SECURITY_CONTACT + ' (see the Security policy).' },
      { h: '9. Your rights', p: 'Depending on your jurisdiction (GDPR, UK GDPR, CCPA, and similar), you may have rights to access, correct, export, restrict, or delete your personal data, and to object to processing. Exercise them by emailing ' + CONTACT + '. We respond within 30 days and never discriminate against you for exercising a right. EU/UK users may also lodge a complaint with their supervisory authority.' },
      { h: '10. Cookies and local storage', p: 'We use no advertising cookies and run no ad networks. Browser local storage keeps you signed in (a session token) and holds your in-progress generation settings per tab; clearing it signs you out. Our analytics providers (section 2) set their own first-party cookies and storage to count a returning visitor — Google Analytics and, on marketing pages only, Microsoft Clarity and PostHog. They are configured not to capture on-screen text, form inputs, or session recordings, and identifiers are stripped from event data before it leaves your browser. Browser-level "do not track" and cookie-blocking settings are respected by these providers where they support them.' },
      { h: '11. International transfers', p: 'If data is transferred across borders, we rely on appropriate safeguards such as Standard Contractual Clauses with our subprocessors.' },
      { h: '12. Children', p: 'The Service is for business use and not directed to anyone under 16. We do not knowingly collect data from children.' },
      { h: '13. Changes', p: 'We will post any changes here and update the date above. Material changes are announced by email or in-product notice before they take effect.' }
    ]
  },

  terms: {
    title: 'Terms of Service',
    summary: 'The agreement between you and ' + COMPANY + ' when you use the Service.',
    sections: [
      { h: '1. The agreement', p: 'By creating an account or using the Service you agree to these Terms and the Privacy Policy. If you use the Service for an organization, you confirm you have authority to bind it, and "you" means that organization.' },
      { h: '2. The Service', p: COMPANY + ' generates documentation from your connected sources, scores it with an automated, deterministic quality rubric, estimates its readiness for retrieval by third-party AI platforms, and can regenerate it automatically when your repositories change. Features may evolve; we will not materially reduce the core Service during a paid term.' },
      { h: '3. Your account', ul: [
        'Provide accurate information and keep your credentials confidential.',
        'You are responsible for activity under your account and for your team members\' use.',
        'Corporate email verification, where enabled, must be completed with an address you control.'
      ] },
      { h: '4. Your content', p: 'You retain all rights to your repositories, source material, and the documentation the Service generates for you ("Customer Content"). You grant us a limited license to process Customer Content solely to provide the Service. We claim no ownership of generated documentation and do not use Customer Content to train models.' },
      { h: '5. Acceptable use', ul: [
        'No unlawful content or use, and no infringement of others\' rights.',
        'Only connect repositories and sources you are authorized to access.',
        'No attempts to breach, probe, or overload the Service (rate limits exist and are enforced).',
        'No reselling or white-labeling the Service without a written agreement.'
      ] },
      { h: '6. AI outputs and estimates', p: 'Generated documentation and quality scores are produced by automated systems and can be wrong. Ranking figures for ChatGPT, Claude, Gemini, and similar platforms are modeled estimates — deliberately capped below certainty — not guarantees of placement, retrieval, or citation. Review outputs before publishing; you are responsible for what you publish.' },
      { h: '7. Plans, billing, and cancellation', ul: [
        'Online payment is not enabled today. No payment processor is connected, the checkout page cannot take a card, and paid plans are arranged with us directly by email. Until that changes, nothing in this section can result in a charge.',
        'Free plan limits are described on the Pricing page and may change with notice. There is no free trial of a paid plan — the free plan is permanent instead.',
        'When online payment is enabled, paid plans will bill per seat, monthly or annually, and renew automatically until cancelled.',
        'Fees are non-refundable except where the law requires otherwise; taxes are your responsibility.',
        'We may suspend the Service for non-payment after reasonable notice.'
      ] },
      { h: '8. Termination', p: 'You may delete your account at any time. We may suspend or terminate accounts that materially breach these Terms, with notice where practicable. On termination, your right to use the Service ends and data is deleted per the Privacy Policy retention terms. Sections that by nature survive (IP, disclaimers, liability limits) survive.' },
      { h: '9. Disclaimers', p: 'The Service is provided "as is" and "as available". To the maximum extent permitted by law, we disclaim all implied warranties, including merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that generated documentation is accurate, complete, or fit for regulatory use without review.' },
      { h: '10. Limitation of liability', p: 'To the maximum extent permitted by law, neither party is liable for indirect, incidental, special, consequential, or punitive damages, or lost profits or revenues. Our total liability under these Terms is limited to the amounts you paid for the Service in the 12 months before the claim. Nothing limits liability that cannot be limited by law.' },
      { h: '11. Indemnity', p: 'You will defend and indemnify ' + COMPANY + ' against claims arising from Customer Content or your breach of these Terms; we will defend and indemnify you against claims that the Service itself infringes third-party intellectual property rights.' },
      { h: '12. Changes to these Terms', p: 'We may update these Terms. Material changes take effect no sooner than 30 days after notice (email or in-product). Continued use after the effective date is acceptance.' },
      { h: '13. Governing law', p: 'These Terms are governed by the laws of the jurisdiction where ' + COMPANY + ' is established, excluding conflict-of-law rules. Replace this clause with your chosen law and venue before launch.' }
    ]
  },

  security: {
    title: 'Security & Responsible Disclosure',
    summary: 'How the Service is protected, and how to report a vulnerability.',
    sections: [
      { h: 'Our security posture', ul: [
        'Credentials: passwords and one-time codes stored as bcrypt hashes; OAuth tokens held server-side only, never exposed to the browser or returned by the API.',
        'Read-only in practice: Docify contains no code that writes to a repository — no commits, branches, or pull requests. On GitHub the scope that permits reading private repositories also technically permits writing; we are migrating to a GitHub App so the limit is enforced by the platform rather than by our word.',
        'Sign-in: Google sign-in uses OpenID Connect with PKCE, a nonce, and cryptographic verification of the identity token, and requires a provider-verified email address. Session tokens are typed so that no other token the Service issues can be replayed as one.',
        'Webhooks: every automation pipeline has its own HMAC secret; signatures are verified over the raw payload with constant-time comparison, and secrets rotate with one click.',
        'Isolation: every API query is scoped to the authenticated account. An automated test suite (server/test/isolation.test.js) stands up two real accounts against a live server and asserts that one cannot read, download, modify, or delete the other\'s documents, versions, quality reports, sources, team, or account, and that a session for a deleted account stops working immediately.',
        'Hardening: per-IP rate limiting (stricter on credential endpoints), request timeouts, security headers, size-limited request bodies.',
        'Availability: multi-process clustering with automatic worker restart and graceful shutdown.',
        'What we do not have yet, stated plainly: multi-factor authentication, SSO/SAML, customer-visible audit logs, session revocation before a session expires, and self-service password reset. None of these are built today — where the pricing page offers SSO or audit logs "on request", that means we will scope and build them with an Enterprise customer, not that they are waiting to be switched on. We are not SOC 2 or ISO 27001 audited and do not claim to be.'
      ] },
      { h: 'Reporting a vulnerability', p: 'If you believe you have found a security issue, email ' + SECURITY_CONTACT + ' with steps to reproduce. Please do not access data that is not yours, do not degrade the Service for others, and give us reasonable time to fix before public disclosure. We acknowledge reports within 72 hours, and we will not pursue good-faith research conducted under these rules.' },
      { h: 'Scope', ul: [
        'In scope: the web application, its API, webhook endpoints, and authentication flows.',
        'Out of scope: denial-of-service volumetric testing, social engineering, physical attacks, and third-party services we do not operate (code hosts, email providers, payment processors).'
      ] },
      { h: 'Data incidents', p: 'If a breach affects your data, we will notify you without undue delay — within 72 hours of confirmation where GDPR applies — with what we know, what we are doing, and what you should do.' }
    ]
  }
};

export default function Legal() {
  const { slug } = useParams();
  const doc = LEGAL[slug];
  usePageMeta({
    title: doc ? doc.title : 'Legal',
    description: doc ? 'Docify ' + doc.title + '.' : '',
    path: doc ? '/legal/' + slug : '/legal/privacy'
  });
  if (!doc) return <Navigate to="/legal/privacy" replace />;
  return (
    <>
      <div className="page" style={{ maxWidth: 880 }}>
        <p className="artcrumb">
          <Link to="/">Home</Link> <span>/</span> Legal
        </p>
        <h1 className="h04 mt3">{doc.title}</h1>
        <p className="body01 t2 mt3">{doc.summary}</p>
        <p className="helper mt2">Last updated {UPDATED}</p>
        <div className="row mt5" style={{ flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(LEGAL).map(([s, d]) => (
            <Link key={s} to={'/legal/' + s}
              className={'fchip' + (s === slug ? ' on' : '')} style={{ textDecoration: 'none' }}>
              {d.title}
            </Link>
          ))}
        </div>
        <div className="divider" style={{ margin: '24px 0' }} />
        {doc.sections.map((s, i) => (
          <div key={i}>
            <h2 className="h02 mt6 mb3">{s.h}</h2>
            {s.p && <p className="body01 mt3" style={{ maxWidth: 760 }}>{s.p}</p>}
            {s.ul && (
              <ul className="artlist mt3">
                {s.ul.map((li) => <li key={li} className="body01">{li}</li>)}
              </ul>
            )}
          </div>
        ))}
        <div className="tile mt7" style={{ padding: 20, maxWidth: 760 }}>
          <p className="helper">
            These documents are a launch-ready starting point written for how this product actually
            works. Before commercial launch, replace the placeholder contact addresses and company
            identity, and have them reviewed by qualified counsel for your jurisdiction.
          </p>
        </div>
      </div>
      <NavBar back="/" />
    </>
  );
}
