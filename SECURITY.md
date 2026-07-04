# Security Policy

## Reporting a vulnerability

If you believe you have found a security issue in DocGen, email **security@docgen.example**
(replace with your monitored address before launch) with steps to reproduce.

Please: do not access data that is not yours, do not degrade the service for others, and give
us reasonable time to fix before public disclosure. Reports are acknowledged within 72 hours.
Good-faith research under these rules will not be pursued.

**In scope:** the web application, its API, webhook endpoints, and authentication flows.
**Out of scope:** volumetric denial-of-service, social engineering, physical attacks, and
third-party services we do not operate (code hosts, email providers, payment processors).

## Security posture (summary)

- Passwords and one-time codes stored as bcrypt hashes; OAuth tokens held server-side only.
- Read-only repository scopes — the service cannot write to customer code.
- Per-pipeline HMAC webhook secrets, verified over the raw payload with constant-time
  comparison, rotatable at any time.
- Every API query is scoped to the authenticated account; cross-account access is denied by
  design and covered by automated tests.
- Per-IP rate limiting (stricter on credential endpoints), request timeouts, security headers,
  size-limited bodies, multi-process clustering with automatic worker restart.

The full customer-facing policy is served in-app at `/legal/security`.
