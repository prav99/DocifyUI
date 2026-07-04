// Mail adapter. With SMTP configured in .env it sends real email via
// nodemailer; without it, it runs in dev mode and prints the message to the
// server console so the flow stays fully testable with zero keys.

const cfg = {
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT || 587),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || 'DocGen <no-reply@docgen.local>'
};

export const mailEnabled = () => Boolean(cfg.host);

export async function sendMail(to, subject, html) {
  if (!mailEnabled()) {
    console.log('[mail:dev] to=' + to + ' subject=' + subject + '\n' + html);
    return { dev: true };
  }
  const { default: nodemailer } = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined
  });
  return transport.sendMail({ from: cfg.from, to, subject, html });
}
