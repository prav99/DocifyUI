import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePageMeta } from '../seo.js';
import { api } from '../api.js';
import { toast, useAuth } from '../store.jsx';
import { SUPPORT_EMAIL, supportMailto } from '../config.js';

// Public contact / support form. Submits to POST /api/contact, which emails
// SUPPORT_EMAIL server-side. No credentials or SMTP details are ever handled
// in the browser — the form only sends the customer's own message.
//
// This page never asserts that a message reached a human. It reports what the
// API reported: mail delivery can only be confirmed by the server, and telling
// a customer their enquiry was delivered when it was written to a log file is
// exactly how a real enquiry disappears.
const LIMITS = { name: 200, email: 320, topic: 120, message: 5000 };
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function Contact() {
  usePageMeta({
    title: 'Contact support',
    description: 'Get in touch with the Docify team. Send us a question, report an issue, or ask about Enterprise.',
    path: '/contact'
  });

  const { user } = useAuth();
  const [params] = useSearchParams();
  const presetTopic = params.get('topic') || '';

  const [name, setName] = React.useState(user?.name || '');
  const [email, setEmail] = React.useState(user?.email || '');
  const [topic, setTopic] = React.useState(
    presetTopic === 'enterprise' ? 'Enterprise / sales' : ''
  );
  const [message, setMessage] = React.useState(
    presetTopic === 'enterprise' ? 'I’d like to talk about the Enterprise plan for my team.\n\n' : ''
  );
  const [sending, setSending] = React.useState(false);
  const [fieldErr, setFieldErr] = React.useState({});
  const [formErr, setFormErr] = React.useState('');
  // null until submitted; then { delivered: boolean|null } as reported by the API.
  const [result, setResult] = React.useState(null);

  function validate() {
    const e = {};
    const em = email.trim();
    if (!em) e.email = 'Enter the email address we should reply to.';
    else if (!EMAIL_RE.test(em)) e.email = 'That does not look like an email address.';
    else if (em.length > LIMITS.email) e.email = 'That address is too long (max ' + LIMITS.email + ' characters).';
    if (name.trim().length > LIMITS.name) e.name = 'Please keep your name under ' + LIMITS.name + ' characters.';
    if (topic.trim().length > LIMITS.topic) e.topic = 'Please keep the topic under ' + LIMITS.topic + ' characters.';
    const msg = message.trim();
    if (!msg) e.message = 'Tell us what you need — the message cannot be empty.';
    else if (msg.length < 10) e.message = 'Please add a little more detail (at least 10 characters).';
    else if (msg.length > LIMITS.message) e.message = 'That is longer than we can accept (max ' + LIMITS.message.toLocaleString() + ' characters).';
    return e;
  }

  async function submit(e) {
    e.preventDefault();
    setFormErr('');
    const errs = validate();
    setFieldErr(errs);
    if (Object.keys(errs).length) {
      const first = document.getElementById('ct' + Object.keys(errs)[0].replace(/^./, (c) => c.toUpperCase()));
      if (first) first.focus();
      return;
    }
    setSending(true);
    try {
      const res = await api('/contact', {
        method: 'POST',
        body: { name: name.trim(), email: email.trim(), topic: topic.trim(), message: message.trim() }
      });
      // `delivered` is the server's own statement about the mail transport. If
      // the API does not say, we do not claim either way.
      const delivered = res && typeof res.delivered === 'boolean' ? res.delivered : null;
      setResult({ delivered, note: (res && res.message) || '' });
      toast(delivered === false ? 'info' : 'success',
        delivered === false ? 'Message recorded, but not emailed' : 'Message sent',
        delivered === false
          ? 'Please email ' + SUPPORT_EMAIL + ' directly so it reaches us.'
          : 'We’ll reply to ' + email.trim() + '.');
    } catch (err) {
      const m = err.message || 'Request failed';
      setFormErr(m);
      toast('error', 'Could not send', m + ' — you can email ' + SUPPORT_EMAIL + ' directly');
    } finally {
      setSending(false);
    }
  }

  const errText = (k) => (fieldErr[k] ? <p className="helper mt2" style={{ color: 'var(--support-error)' }} id={'ct' + k + 'Err'}>{fieldErr[k]}</p> : null);

  return (
    <div className="page page--narrow">
      <h1 className="h04">Contact support</h1>
      <p className="body01 t2 mt3">
        Questions, bugs, billing, or Enterprise — send us a note and we’ll get back to you.
        You can also email us directly at{' '}
        <a href={supportMailto()}>{SUPPORT_EMAIL}</a>.
      </p>

      {result ? (
        <div className="paper mt6">
          {result.delivered === false ? (
            <>
              <p className="h02">Your message was recorded — but not emailed.</p>
              <p className="body01 t2 mt3">
                Our mail delivery is not configured right now, so we cannot promise this reached anyone.
                {result.note ? ' ' + result.note : ''} Please send it to{' '}
                <a href={supportMailto(topic.trim() || 'Support')}>{SUPPORT_EMAIL}</a> so it definitely gets to us.
              </p>
            </>
          ) : (
            <>
              <p className="h02">Thanks — your message is on its way.</p>
              <p className="body01 t2 mt3">
                It has been sent to our support mailbox and we’ll reply to {email.trim()}. For anything
                urgent, email <a href={supportMailto()}>{SUPPORT_EMAIL}</a>.
              </p>
            </>
          )}
          <button className="btn btn--tertiary mt5" onClick={() => { setResult(null); setMessage(''); }}>
            Send another message
          </button>
        </div>
      ) : (
        <form className="paper mt6" onSubmit={submit} noValidate>
          {formErr && (
            <div className="notconn mb5" style={{ borderLeftColor: 'var(--support-error)' }} role="alert">
              <div>
                <p className="body01"><b>Your message was not sent</b></p>
                <p className="helper mt2">{formErr} — nothing was lost, you can retry below or email{' '}
                  <a href={supportMailto(topic.trim() || 'Support')}>{SUPPORT_EMAIL}</a>.</p>
              </div>
            </div>
          )}

          <label className="label01" htmlFor="ctName">Your name</label>
          <input id="ctName" className="input mt2" type="text" value={name} maxLength={LIMITS.name}
            aria-invalid={!!fieldErr.name} aria-describedby={fieldErr.name ? 'ctnameErr' : undefined}
            onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" autoComplete="name" />
          {errText('name')}

          <label className="label01 mt5" htmlFor="ctEmail">Email <span className="t2">(required)</span></label>
          <input id="ctEmail" className="input mt2" type="email" value={email} maxLength={LIMITS.email}
            aria-invalid={!!fieldErr.email} aria-describedby={fieldErr.email ? 'ctemailErr' : undefined}
            onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
            autoComplete="email" required />
          {errText('email')}

          <label className="label01 mt5" htmlFor="ctTopic">Topic</label>
          <input id="ctTopic" className="input mt2" type="text" value={topic} maxLength={LIMITS.topic}
            aria-invalid={!!fieldErr.topic} aria-describedby={fieldErr.topic ? 'cttopicErr' : undefined}
            onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Billing, Bug report, Enterprise" />
          {errText('topic')}

          <label className="label01 mt5" htmlFor="ctMessage">Message <span className="t2">(required)</span></label>
          <textarea id="ctMessage" className="input mt2" rows={6} value={message} maxLength={LIMITS.message}
            aria-invalid={!!fieldErr.message} aria-describedby={fieldErr.message ? 'ctmessageErr' : 'ctMsgCount'}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="How can we help?" required />
          {errText('message')}
          <p className="helper mt2" id="ctMsgCount">{message.trim().length} / {LIMITS.message.toLocaleString()} characters</p>

          <button className="btn btn--primary btn--field mt5" type="submit" disabled={sending}
            style={{ width: '100%' }}>
            {sending ? 'Sending…' : 'Send message'}<span className="ico">→</span>
          </button>
        </form>
      )}
    </div>
  );
}
