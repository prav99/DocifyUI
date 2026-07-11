import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePageMeta } from '../seo.js';
import { api } from '../api.js';
import { toast, useAuth } from '../store.jsx';
import { SUPPORT_EMAIL, supportMailto } from '../config.js';

// Public contact / support form. Submits to POST /api/contact, which emails
// SUPPORT_EMAIL server-side. No credentials or SMTP details are ever handled
// in the browser — the form only sends the customer's own message.
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
  const [sent, setSent] = React.useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return toast('error', 'Enter a valid email', 'So we can reply to you');
    }
    if (message.trim().length < 10) {
      return toast('error', 'Add a bit more detail', 'At least 10 characters, please');
    }
    setSending(true);
    try {
      await api('/contact', { method: 'POST', body: { name, email, topic, message } });
      setSent(true);
      toast('success', 'Message sent', 'We’ll reply to ' + email.trim() + ' soon');
    } catch (err) {
      toast('error', 'Could not send', err.message + ' — you can email ' + SUPPORT_EMAIL + ' directly');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page page--narrow">
      <h1 className="h04">Contact support</h1>
      <p className="body01 t2 mt3">
        Questions, bugs, billing, or Enterprise — send us a note and we’ll get back to you.
        You can also email us directly at{' '}
        <a href={supportMailto()}>{SUPPORT_EMAIL}</a>.
      </p>

      {sent ? (
        <div className="paper mt6">
          <p className="h02">Thanks — your message is on its way.</p>
          <p className="body01 t2 mt3">
            We’ve sent it to our support team and will reply to {email.trim()}. For anything
            urgent, email <a href={supportMailto()}>{SUPPORT_EMAIL}</a>.
          </p>
        </div>
      ) : (
        <form className="paper mt6" onSubmit={submit}>
          <label className="label01" htmlFor="ctName">Your name</label>
          <input id="ctName" className="input mt2" type="text" value={name}
            onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" autoComplete="name" />

          <label className="label01 mt5" htmlFor="ctEmail">Email <span className="t2">(required)</span></label>
          <input id="ctEmail" className="input mt2" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
            autoComplete="email" required />

          <label className="label01 mt5" htmlFor="ctTopic">Topic</label>
          <input id="ctTopic" className="input mt2" type="text" value={topic}
            onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Billing, Bug report, Enterprise" />

          <label className="label01 mt5" htmlFor="ctMsg">Message <span className="t2">(required)</span></label>
          <textarea id="ctMsg" className="input mt2" rows={6} value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="How can we help?" required />

          <button className="btn btn--primary btn--field mt5" type="submit" disabled={sending}
            style={{ width: '100%' }}>
            {sending ? 'Sending…' : 'Send message'}<span className="ico">→</span>
          </button>
        </form>
      )}
    </div>
  );
}
