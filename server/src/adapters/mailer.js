// Mail adapter. With SMTP configured in .env it sends real email via
// nodemailer; without it, it runs in dev mode and prints the message to the
// server console so the flow stays fully testable with zero keys.

const cfg = {
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT || 587),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || 'Docify Support <support@docifydocai.com>'
};

export const mailEnabled = () => Boolean(cfg.host);

// Every result carries `delivered`. Callers must branch on it rather than on
// "sendMail resolved": without SMTP the dev path resolves too, and a resolved
// promise used to be read as proof an email went out.
export async function sendMail(to, subject, html, opts = {}) {
  if (!mailEnabled()) {
    // Never log the body: it can carry verification links, one-time codes,
    // and customer support messages.
    const line = '[mail:dev] NOT SENT (SMTP not configured) to=' + to + ' subject=' + subject +
      (opts.replyTo ? ' replyTo=' + opts.replyTo : '') +
      ' (body suppressed, ' + String(html || '').length + ' chars)';
    // In production an undelivered email is an incident, not a dev convenience.
    if (process.env.NODE_ENV === 'production') console.warn(line);
    else console.log(line);
    return { delivered: false, dev: true, reason: 'smtp-not-configured' };
  }
  const { default: nodemailer } = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined
  });
  const info = await transport.sendMail({
    from: cfg.from,
    to,
    subject,
    html,
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {})
  });
  // A transport failure still rejects — reaching here means the server accepted it.
  return { delivered: true, dev: false, info };
}
