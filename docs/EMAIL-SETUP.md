# Support email setup — support@docifydocai.com

The website code is already wired to use `support@docifydocai.com` everywhere and
to send the contact form to it. What remains is **infrastructure you must set up
manually**: a real mailbox (via an email provider), the DNS records that make it
work, and the SMTP variables in Railway so the contact form can actually send.

Recommended provider: **Zoho Mail** — it has a genuinely free tier for a custom
domain (up to 5 mailboxes) and is the cheapest solid option for a small SaaS.
Google Workspace / Microsoft 365 work identically; only the record values differ.

---

## 1. Why Railway isn't enough

Railway hosts the **app**, not email. It does not create mailboxes, and you do
**not** add MX records in Railway. Two different systems are involved:

| What | Where it's configured |
|------|----------------------|
| The web app (docifydocai.com → your server) | Railway custom domain (CNAME) — already done |
| The **mailbox** for support@ | Your email provider (Zoho) |
| Email **DNS records** (MX, SPF, DKIM, verification TXT) | Your **domain's DNS host** — the registrar or Cloudflare where docifydocai.com's nameservers point |
| The contact form's **SMTP credentials** | Railway → your service → **Variables** |

To find your DNS host: run `whois docifydocai.com` (or check your registrar) and
look at the nameservers. That's where the records below go.

---

## 2. Create the mailbox (Zoho Mail)

1. Go to zoho.com/mail → sign up → **Add your existing domain** `docifydocai.com`.
2. Choose the **Forever Free** plan.
3. Create the mailbox **`support@docifydocai.com`**.
   (Legal/privacy/security pages all point to this one address, so no extra
   aliases are required. If you later want `privacy@` or `security@` to look
   distinct, add them as free aliases on the same mailbox.)

## 3. DNS records (add these at your domain's DNS host)

**a. Verify ownership** — Zoho shows you a unique `TXT` (or CNAME) record during
setup. Add it exactly as shown, then click Verify in Zoho.

**b. MX records** (so the domain can receive mail):

| Type | Host/Name | Value | Priority |
|------|-----------|-------|----------|
| MX | @ | `mx.zoho.com` | 10 |
| MX | @ | `mx2.zoho.com` | 20 |
| MX | @ | `mx3.zoho.com` | 50 |

Remove any old/placeholder MX records for the domain.

**c. SPF** (TXT) — authorises Zoho to send for you:

```
Type: TXT   Host: @   Value: v=spf1 include:zoho.com ~all
```

**d. DKIM** (TXT) — signs your mail so it isn't marked spam. In Zoho admin go to
**Email Authentication → DKIM**, generate a selector, and Zoho gives you a
`selector._domainkey` host + a long public-key value. Add that TXT record, then
enable DKIM in Zoho.

**e. DMARC** (optional but recommended):

```
Type: TXT   Host: _dmarc   Value: v=DMARC1; p=none; rua=mailto:support@docifydocai.com
```

DNS changes can take from minutes up to ~24h to propagate.

---

## 4. Wire the contact form to send (Railway Variables)

The contact form (`POST /api/contact`) sends through the existing mailer. Until
SMTP is set it runs in **dev mode** (logs the message to the server console
instead of sending) — so the site never errors, but nothing is delivered until
you add these. In Railway → your service → **Variables**, add:

```
SUPPORT_EMAIL = support@docifydocai.com
SMTP_HOST     = smtp.zoho.com
SMTP_PORT     = 587
SMTP_USER     = support@docifydocai.com
SMTP_PASS     = <app-specific password from Zoho>
SMTP_FROM     = DocGen Support <support@docifydocai.com>
```

Notes:
- In Zoho, if 2FA is on, generate an **app-specific password** (Zoho → Security →
  App Passwords) and use that for `SMTP_PASS`. Also make sure **IMAP/SMTP access**
  is enabled for the mailbox.
- `SMTP_FROM` must be your verified Zoho address (it is), or Zoho will reject the send.
- Port 587 = TLS (recommended). Port 465 = SSL also works.
- These are **backend-only**. They are never exposed to the browser. Do not put
  SMTP passwords in any `VITE_` variable or client file.

The only client-side value is the public address itself, overridable at build
with `VITE_SUPPORT_EMAIL` (defaults to support@docifydocai.com).

---

## 5. Verify it works

1. **Receiving:** send an email to support@docifydocai.com from another account —
   it should arrive in Zoho. Check MX/SPF/DKIM with mxtoolbox.com if not.
2. **Sending (contact form):** after the Railway variables are live, submit the
   form at `/contact` — the message should land in the support@ inbox, with the
   customer's address as **Reply-To** so you can reply directly.
