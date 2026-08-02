# Security Policy

## Reporting a vulnerability

If you believe you have found a security issue in Docify, email **security@docifydocai.com**
(replace with your monitored address before launch) with steps to reproduce.

Please: do not access data that is not yours, do not degrade the service for others, and give
us reasonable time to fix before public disclosure. Reports are acknowledged within 72 hours.
Good-faith research under these rules will not be pursued.

**In scope:** the web application, its API, webhook endpoints, and authentication flows.
**Out of scope:** volumetric denial-of-service, social engineering, physical attacks, and
third-party services we do not operate (code hosts, email providers, payment processors).

## Security posture (summary)

- Passwords and one-time codes stored as bcrypt hashes; OAuth tokens held server-side only and
  never returned by the API.
- Read-only in practice: no code path writes to a customer repository. Note that GitHub's
  classic `repo` scope, which Docify needs to read private repositories, also *permits* writing
  — migrating to a GitHub App is tracked as an open item so the limit is enforced by the
  platform rather than by our word.
- Per-pipeline HMAC webhook secrets, verified over the raw payload with constant-time
  comparison, rotatable at any time.
- Every API query is scoped to the authenticated account. Cross-account access is covered by
  `server/test/isolation.test.js` (`npm test` in `server/`), which runs two real accounts
  against a live server and asserts neither can reach the other's data, plus token-integrity
  tests proving no non-session token can be replayed as a session.
- Per-IP rate limiting (stricter on credential endpoints), request timeouts, security headers,
  size-limited bodies, multi-process clustering with automatic worker restart.
- Not yet implemented, stated plainly: MFA, SSO/SAML, customer-visible audit logs.
  Docify is not SOC 2 or ISO 27001 audited.
- Implemented: self-service password reset (single-use hashed token, 60-minute expiry) and
  session revocation — changing or resetting a password invalidates every session issued before it.

The full customer-facing policy is served in-app at `/legal/security`.
