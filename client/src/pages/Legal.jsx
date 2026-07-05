import React from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { NavBar } from '../ui.jsx';

/* =====================================================================
   Legal & trust documents. One registry, one renderer — served in-app at
   /legal/<slug> so every version ships with the product. Replace the
   placeholder contact addresses and company identity before launch, and
   have counsel review: this is a solid starting point, not legal advice.
   ===================================================================== */

const UPDATED = '2026-07-04';
const CONTACT = 'privacy@docgen.example'; // ← replace with your real address
const SECURITY_CONTACT = 'security@docgen.example';
const COMPANY = 'DocGen'; // ← replace with your legal entity name

export const LEGAL = {
  privacy: {
    title: 'Privacy Policy',
    summary: 'What we collect, why, where it lives, and the rights you keep.',
    sections: [
      { h: 'The short version', p: 'DocGen reads your repositories to generate documentation. We store your account details, your connection credentials (encrypted), and the documents DocGen produces. We never store your source code, we do not sell data, and Anthropic-style model providers are not sent your credentials. Delete your account and your data goes with it.' },
      { h: '1. Who we are', p: COMPANY + ' provides an AI documentation intelligence platform: generation of documentation from connected sources, AI quality evaluation, ranking estimates, and merge-driven automation ("the Service"). This policy covers the Service and our websites. Contact: ' + CONTACT + '.' },
      { h: '2. Information we collect', ul: [
        'Account data — email address, name (optional), hashed password (bcrypt; we cannot read it), email-verification state.',
        'Connection credentials — OAuth access/refresh tokens for code hosts (GitHub, GitLab, Bitbucket) and API tokens for Jira, Confluence, and Notion. Requested with read-only scopes wherever the provider supports them.',
        'Generated content — the documents DocGen produces, their configuration (types, formats, output options, uploaded SKILL.md files), quality reports, and automation run history.',
        'Merge metadata — when you enable automation: branch names, commit identifiers, commit messages, and changed file paths delivered by your repository webhooks.',
        'Billing data — plan, seats, billing cycle, and optional tax ID. Card details are processed by our payment provider and never touch our servers.',
        'Operational logs — timestamps, IP addresses, and request metadata used for security, rate limiting, and abuse prevention.'
      ] },
      { h: '3. What we deliberately do not collect', ul: [
        'Your source code is read transiently to generate documentation and is never persisted.',
        'We request read-only repository scopes; we cannot push to your repositories.',
        'We do not use advertising trackers or sell personal data to anyone.'
      ] },
      { h: '4. How we use information', ul: [
        'To provide the Service: generate documents, score them, run your automation pipelines, and send the notifications you configure.',
        'To secure the Service: verify webhook signatures, rate-limit abuse, investigate incidents.',
        'To bill you and to communicate service changes. Product emails are transactional; marketing email, if any, is opt-in.'
      ] },
      { h: '5. AI processing', p: 'Documents are evaluated by automated quality models ("LLM-as-a-Judge") and scored for retrieval likelihood across third-party AI platforms. These are estimates computed by the Service; your credentials and repository contents are not shared with ChatGPT, Claude, Gemini, or any external AI platform to produce them. Your content is not used to train models.' },
      { h: '6. Sharing and subprocessors', p: 'We share data only with subprocessors needed to run the Service — hosting infrastructure, the email delivery provider you configure or we operate, and the payment processor. Each is bound by data-protection terms. We disclose data if the law genuinely compels it, and we will tell you unless legally forbidden. A current subprocessor list is available on request at ' + CONTACT + '.' },
      { h: '7. Retention', ul: [
        'Account and generated content: for the life of your account.',
        'OAuth and API tokens: until you disconnect the source, rotate them, or delete your account — whichever comes first.',
        'Automation run history: the most recent runs per pipeline (older entries roll off automatically).',
        'Operational logs: up to 90 days.',
        'Deleting your account deletes your data from production systems within 30 days; encrypted backups age out on their own schedule (up to 90 days).'
      ] },
      { h: '8. Security', p: 'Passwords and verification codes are stored as bcrypt hashes. Webhooks are authenticated with per-pipeline HMAC secrets you can rotate at any time. Transport is TLS in production deployments. Access to production data is restricted and logged. No system is perfectly secure; report concerns to ' + SECURITY_CONTACT + ' (see the Security policy).' },
      { h: '9. Your rights', p: 'Depending on your jurisdiction (GDPR, UK GDPR, CCPA, and similar), you may have rights to access, correct, export, restrict, or delete your personal data, and to object to processing. Exercise them by emailing ' + CONTACT + '. We respond within 30 days and never discriminate against you for exercising a right. EU/UK users may also lodge a complaint with their supervisory authority.' },
      { h: '10. Cookies and local storage', p: 'The Service uses no advertising cookies. We use browser local storage for one purpose: keeping you signed in (a session token) and, per browser tab, your in-progress generation settings. Clearing browser storage signs you out.' },
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
      { h: '2. The Service', p: COMPANY + ' generates documentation from your connected sources, evaluates it with automated AI quality models, estimates its performance across third-party AI platforms, and can regenerate it automatically when your repositories change. Features may evolve; we will not materially reduce the core Service during a paid term.' },
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
        'Free plan limits are described on the Pricing page and may change with notice.',
        'Paid plans bill per seat, monthly or annually, and renew automatically until cancelled from Billing.',
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
        'Credentials: passwords and one-time codes stored as bcrypt hashes; OAuth tokens held server-side only, never exposed to the browser.',
        'Read-only by design: repository scopes are read-only; the Service cannot write to your code.',
        'Webhooks: every automation pipeline has its own HMAC secret; signatures are verified over the raw payload with constant-time comparison, and secrets rotate with one click.',
        'Isolation: every API query is scoped to the authenticated account; cross-account access is denied by design and covered by tests.',
        'Hardening: per-IP rate limiting (stricter on credential endpoints), request timeouts, security headers, size-limited request bodies.',
        'Availability: multi-process clustering with automatic worker restart and graceful shutdown.'
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
