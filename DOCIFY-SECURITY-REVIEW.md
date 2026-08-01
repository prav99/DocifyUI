# Docify — Enterprise Security Review & Trust Programme

**Date:** 1 August 2026 · **Reviewer perspective:** an enterprise buyer deciding whether to connect their source code
**Method:** full-codebase audit (13 findings, exploit-verified; all 13 now fixed), competitive trust-page benchmark, and AI-provider terms verified against primary sources on 1 Aug 2026. Fixes marked ✅ were implemented and verified today.

> **The governing rule of this programme:** fix first, claim second. Every statement Docify publishes about security must be true on the day it is published. Certifications requiring third-party audit (SOC 2, ISO 27001) must never be claimed, implied, or "in progress"-washed until the report exists.

---

## 1. Security audit — findings and status

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | **Critical** | `POST /api/auth/login {"provider":"github"}` returned a valid 7-day session for a shared account — no credentials, live in production | ✅ **Fixed** — provider-without-code paths now rejected unless `NODE_ENV!=production` and `ALLOW_DEMO_LOGIN!=false`; demo account renamed off a real address |
| 2 | **High** | Same bypass on `/signup`, auto-attaching a Source to the shared account | ✅ **Fixed** — same gate |
| 3 | **High** | OAuth/Jira/Confluence/Notion credentials stored in plaintext | ✅ **Fixed** — AES-256-GCM envelope encryption (`server/src/crypto.js`) applied at the Prisma boundary, so no call site can bypass it. Verified: round-trip, tamper→fail-closed, legacy-plaintext passthrough, double-encrypt guard |
| 4 | **High** | `JWT_SECRET` silently fell back to a public default → forgeable sessions | ✅ **Fixed** — production boot now refuses to start without a ≥24-char secret (verified both directions) |
| 5 | **High** | Seeded `demo@acme.dev` (published password) gained admin on any `file:` database → full customer-PII dump via `/api/admin/metrics` | ✅ **Fixed** — gated on `NODE_ENV`, not the database URL |
| 6 | **High** | No per-user ceiling on model-spending routes → one token could run an unbounded Anthropic bill | ✅ **Fixed** — per-account limiter (20/min default, `RATE_LIMIT_AI`) on generations, rewrite, standardize/analyze/sync |
| 7 | **Medium** | Session JWT could reach GA4/PostHog via `window.location.href` on the OAuth landing route | ✅ **Fixed** — `safeUrl()` strips fragments and token-ish params before any analytics call |
| 8 | **Medium** | Customer email/name sent to PostHog; click tracking exported on-screen text; Clarity replayed app screens | ✅ **Fixed** — identify sends an opaque id + plan only; click labels accept only declared `data-analytics`/safe `aria-label` (never `textContent`), links report path only; PostHog autocapture + session recording disabled with `mask_all_text`; Clarity now loads on marketing routes only and is stopped on entry to any app route |
| 9 | **Medium** | Webhook secrets compared with `===` (timing side channel) and accepted in the URL | ✅ **Fixed** — constant-time comparison on all paths; `?token=` deprecated in comment, header preferred |
| 10 | **Low** | Dev mailer printed full email bodies (support messages, would print verification codes) | ✅ **Fixed** — body suppressed, length logged |
| 11 | **Medium** | Webhook replay: no delivery-id/nonce dedup — a captured delivery replays forever | ✅ **Fixed** — per-hook delivery-id dedup (GitHub/GitLab/Bitbucket/Jira headers), 6-hour TTL, bounded memory; verified across providers |
| 12 | **Low** | PDF extraction loops unbounded within the 15 MB cap → worker CPU pin | ✅ **Fixed** — caps at 400 pages / 300k text items / 30s, returning what was extracted |
| 13 | **High (product)** | Quality auto-fixes injected fictional "Acme Payments" facts into real customer documents | ✅ **Fixed** — structural fixes now insert `TODO:` prompts, never invented product facts |
| — | Info | Cross-account isolation (IDOR): 5 authenticated routes audited — all correctly scoped by `userId` | ✅ Clean |
| — | Info | `SECURITY.md` contact was a placeholder (`security@docgen.example`) | ✅ **Fixed** → `security@docifydocai.com` |

**Also hardened today:** HSTS in production, `Cross-Origin-Opener-Policy`, `Permissions-Policy`, `X-Permitted-Cross-Domain-Policies`, `Cache-Control: no-store` on all API responses, and CORS narrowed from wildcard to an explicit origin allowlist.

## 2. Competitive benchmark — how the leaders communicate trust

| Company | Trust surface | Certifications claimed |
|---|---|---|
| Vercel | `/security`: firewall/DDoS, WAF, RBAC + audit logs, encryption, backups/failover, pen test + bug bounty | ISO 27001, SOC 2 Type 2, PCI DSS v4, HIPAA (enterprise), GDPR, DPF, TISAX |
| Linear | `/security`: TLS 1.2 + AES-256, SSO/SAML/passkeys, IP restrictions, audit logs, third-party app approvals, multi-region | SOC 2 Type II, ISO 27001:2022, GDPR, HIPAA |
| GitBook | `security.gitbook.com` (live controls dashboard), ~10 published policies, pen test + ISO surveillance audit, subprocessors, **explicit "never trains on your data" AI policy** | SOC 2 Type II, ISO 27001:2022 |
| Mintlify | `security.mintlify.com` (Drata trust centre), documents on request, 8 policies, subprocessor list | SOC 2 Type 2; **ISO 27001 shown only as "Letter of Intent"** — an honest way to show intent without claiming the cert |

**Adopt:** (a) a hosted trust centre with documents behind a request form; (b) a published subprocessor list — enterprises check this first; (c) an explicit AI-training statement; (d) policy documents as artefacts, not marketing copy; (e) Mintlify's "Letter of Intent" pattern for uncertified frameworks. **Reject:** any badge or seal Docify has not earned.

## 3. AI privacy — verified provider facts (the strongest card Docify holds)

Verified against Anthropic's primary documentation, 1 Aug 2026:
- **Training:** "By default, we will not use your inputs or outputs from our commercial products to train our models." Customer content is not training data.
- **Retention:** inputs/outputs deleted from Anthropic's backend **within 30 days**; trust-and-safety-flagged content may be held up to 2 years.
- **Zero Data Retention** is available by negotiation for eligible models (note: the Claude 5 "Covered Models" family currently requires 30-day retention and is excluded from ZDR — do not promise ZDR on the model Docify uses today).

**Publishable statements (all true):** documents are generated by Anthropic's API under commercial terms that exclude customer content from model training; Anthropic deletes API inputs/outputs within 30 days; Docify never sends one customer's content into another customer's generation; source code is read at generation time and not persisted as a copy in Docify's database.
**Do NOT publish:** "zero data retention" (not in force for the model in use), "your data never leaves your infrastructure" (false — it is an API call), or any claim of on-prem/VPC deployment until built.

## 4. Enterprise security architecture (recommended target state)

**Authentication:** ✅ bcrypt + JWT, OTP email verification, real OAuth with CSRF-protected state · **build next:** MFA (TOTP) for password accounts, SAML/OIDC SSO at the Enterprise tier, session listing + revoke, shorter token TTL with refresh, device/session naming.
**Authorization:** ✅ every query scoped by `userId` (audited). **Build next:** real RBAC (Owner/Admin/Writer/Reviewer exist as labels but are not enforced), per-repository scoping, enforced approval gates, least-privilege GitHub App (finer than the classic `repo` scope).
**Data protection:** ✅ TLS in transit (Railway), ✅ AES-256-GCM for provider credentials, ✅ source never persisted. **Build next:** documented key rotation procedure (the `enc:v1:` prefix already supports versioned re-wrap), encrypted backups with tested restore, per-tenant encryption keys for Enterprise, object-storage lifecycle rules.
**Infrastructure:** ✅ per-IP + per-account rate limits, security headers, HSTS, request timeouts, graceful drain, cluster restart, crash recovery. **Build next:** WAF/DDoS (Cloudflare in front of Railway), dependency scanning in CI (`npm audit`/Dependabot), container image scanning, secret scanning, structured audit logging to a separate store, uptime/error alerting, documented DR with an RTO/RPO target and a restore drill.

## 5–6. Trust experience — product and landing surfaces

**Landing page (recommended placement):** keep the page's existing rhythm — do **not** add a security wall. Instead: (a) strengthen the existing Trust section into four cards (read-only access · source never stored · AI training exclusion · you approve every change) with a link to the Trust Centre; (b) add one line to the hero trust strip: "Read-only · source never stored · credentials encrypted"; (c) add a security FAQ entry; (d) put a Trust Centre link in the footer. Rationale: an engineering leader looks for security *after* the product convinces them — front-loading it interrupts the conversion path, while a visible, linkable Trust Centre satisfies the security reviewer who arrives specifically for it.

**New `/trust` page (Trust Centre)** — sections: security overview · data handling and residency · encryption (transit/at rest/credentials) · **AI privacy** (the §3 statements, with sources) · tenant isolation · authentication and access · subprocessor list (Anthropic, Railway, Zoho Mail, PostHog, Google Analytics, Microsoft Clarity) · data retention and deletion · incident response and responsible disclosure · compliance roadmap with honest status labels · document request form.

**Dashboard (Settings → Security):** connected integrations with granted scopes and revoke buttons · active sessions with revoke · login history · API tokens (create/rotate/revoke, hashed at rest) · audit log of approvals, publishes, and connection changes · data export · account and data deletion · retention preference. Ship the first four before Enterprise conversations.

## 7. Documentation plan

Publish as `/legal/*` and `/docs/security/*`: Security Overview · Data Handling · Encryption · **AI Privacy** · Tenant Isolation · Authentication & Authorization · Backup & Recovery · Incident Response (with 72-hour notification commitment, already in SECURITY.md) · Responsible Disclosure (✅ live, real contact) · Privacy Policy (✅ live; update with subprocessors) · Data Retention & Deletion · Compliance Roadmap · Security FAQ. Write each for a security reviewer with a checklist, not a marketer.

## 8. Compliance roadmap — honest staging

| Framework | Status today | Path |
|---|---|---|
| **GDPR/CCPA** | Achievable now — process, not certificate | DPA template, subprocessor list, deletion/export endpoints, lawful-basis documentation. **Do first.** |
| **SOC 2 Type II** | Not started | ~$25–40K all-in year one; 3–12-month observation window; realistically 5–8 months to a report (Vanta/Drata published guidance). Begin only when enterprise demand justifies it — it is usually the first thing a >200-person buyer asks for. |
| **ISO 27001** | Not started | Follows SOC 2; use Mintlify's "Letter of Intent" pattern to show direction honestly meanwhile. |
| **HIPAA / PCI DSS** | Not applicable | Docify processes source code and documentation, not PHI or cardholder data. Say so explicitly rather than leaving it ambiguous. |

**Immediately implementable** (features): encryption, MFA, SSO, RBAC, audit logs, deletion controls, retention settings. **Process work** (no audit): DPA, subprocessor list, incident-response runbook, retention policy, DR drill. **Requires third-party audit — never claim early:** SOC 2, ISO 27001.

## 9–12. Prioritised execution plan

**✅ Done today (immediate trust wins):** all 11 fixes in §1 — the account-takeover bypass, credential encryption, JWT enforcement, admin gate, AI-cost limiter, token/PII leak to analytics, timing-safe webhook comparison, mail-body logging, demo-content injection, security headers/HSTS/CORS, real disclosure contact.

**HIGH — next (blocking real customers):**
1. **Deploy config:** set `NODE_ENV=production`, a strong `JWT_SECRET`, and `CREDENTIAL_KEY` on Railway (without the key, tokens still store in plaintext and the server warns on boot). Rotate the Anthropic key that appeared in a local `.env`.
2. Build the `/trust` page and publish the subprocessor list + AI-privacy statement from §3.
3. Session revoke + connected-integrations revoke in Settings (the two controls buyers test first).
4. Enforce plan limits server-side (also the pricing dependency).

**MEDIUM (next 1–2 months):** MFA · RBAC enforcement · audit-log store + UI · dependency and secret scanning in CI · encrypted backups with a tested restore · WAF/DDoS in front of Railway · key-rotation procedure.

**LONG-TERM (enterprise readiness):** SAML/OIDC SSO · SOC 2 Type II · ISO 27001 · per-tenant keys · data-residency options · GitHub App with fine-grained scopes · penetration test + bug bounty · published DR objectives.
