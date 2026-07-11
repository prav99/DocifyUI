import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SUPPORT_EMAIL, supportMailto } from './config.js';

/* =========================================================================
   Site assistant — floating chat, bottom right, on every page.
   Answers from the site's own documentation: each reply deep-links to the
   matching /docs or /help article. When a question falls outside the
   knowledge base, it hands off to the support mailbox with the user's
   question prefilled. Styled with the app's design tokens.
   ========================================================================= */

/* ---------- Knowledge base: keywords → answer + destination ---------- */
const KB = [
  {
    k: 'price pricing cost plan plans free paid subscription billing money charge upgrade team enterprise',
    a: 'Docify has a free plan to start, plus paid plans for teams — the pricing page compares every plan and feature side by side.',
    link: '/pricing', label: 'View pricing'
  },
  {
    k: 'doc sync existing documentation upload baseline maintain update insert place splice section confluence notion word pdf import old docs',
    a: 'Doc sync keeps documentation you already have up to date: upload your document once, and every repository change is placed into the best-matching section — you review a diff and approve.',
    link: '/sync', label: 'Open Doc sync'
  },
  {
    k: 'automation pipeline merge webhook regenerate auto automatic trigger ci push pull request pr branch',
    a: 'Automation pipelines regenerate, re-judge, and re-publish documentation on every merge. Configure one in the six-step wizard: repository, branch, triggers, documents, quality gates, publishing.',
    link: '/automation', label: 'Set up automation'
  },
  {
    k: 'start begin generate create first document how work getting started quickstart tutorial demo try',
    a: 'Generating your first document takes about three minutes: connect a repository, pick a document type and format, and Docify drafts it from your actual code.',
    link: '/signup', label: 'Start free'
  },
  {
    k: 'quality score judge verdict rubric gate dimension finding fix issue review assessment',
    a: 'Every document is cross-examined by an LLM judge across six weighted dimensions, and every finding comes with a one-click fix and projected score gain.',
    link: '/docs/content-quality-assessment', label: 'How quality scoring works'
  },
  {
    k: 'ranking chatgpt claude gemini cite citation retrieval probability ai assistant rank seo discover',
    a: 'Docify predicts how likely ChatGPT, Claude, and Gemini are to retrieve and cite your documentation — before you publish — and shows exactly what to fix to climb.',
    link: '/docs/chatgpt-ranking-analysis', label: 'AI ranking analysis'
  },
  {
    k: 'github gitlab bitbucket integration connect repository repo source oauth code host',
    a: 'Docify connects to GitHub, GitLab, and Bitbucket with one read-only OAuth grant — repositories, READMEs, and commit history become source material. Your code is never stored.',
    link: '/docs/github-integration', label: 'Integration details'
  },
  {
    k: 'format formats dita markdown html docbook epub pdf word docx export output download',
    a: 'Documents export to DITA, Markdown, HTML, DocBook, ePub, PDF, and Word — every source works with every format, no partial support.',
    link: '/docs/technical-doc-generation', label: 'Formats & outputs'
  },
  {
    k: 'security secure privacy private data stored store code safe compliance legal terms gdpr',
    a: 'Access is read-only and your source code is never stored — Docify reads structure, comments, and commit history at generation time only.',
    link: '/legal/security', label: 'Security policy'
  },
  {
    k: 'jira issue traceability trace commit link ticket atlassian',
    a: 'Pipelines can trace every merge back to the Jira issue it delivered — the issue key is read from the commit message or branch, so each documentation change is auditable.',
    link: '/docs/change-impact-analysis', label: 'Change traceability'
  },
  {
    k: 'login sign in signup account password cannot access forgot email verify otp',
    a: 'You can sign in with email or with your GitHub / GitLab / Bitbucket account — one authorization signs you in and connects your source in the same step.',
    link: '/help/login', label: 'Login help'
  },
  {
    k: 'docs documentation help article guide learn read more knowledge',
    a: 'The documentation hub covers everything: AI quality scoring, ranking analysis, integrations, automation, and governance.',
    link: '/docs', label: 'Browse documentation'
  },
  {
    k: 'contact support human email talk person reach message help me problem bug error broken issue not working fail',
    a: 'You can reach a human any time — send a message through the contact page or email ' + SUPPORT_EMAIL + ' and we reply quickly.',
    link: '/contact', label: 'Contact support'
  }
];

const SUGGESTIONS = ['What is Doc sync?', 'How does pricing work?', 'How do quality scores work?'];

/* Score a question against the knowledge base (same prefix-match idea the
   placement engine uses server-side). */
function answerFor(q) {
  const tokens = [...new Set((q.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 2))];
  let best = null, bestScore = 0;
  for (const item of KB) {
    const kws = item.k.split(' ');
    let score = 0;
    for (const t of tokens) {
      if (kws.includes(t)) score += 3;
      else if (t.length >= 4 && kws.some((k) => k.length >= 4 && (k.startsWith(t) || t.startsWith(k)))) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = item; }
  }
  return bestScore >= 3 ? best : null;
}

const IcAiBot = () => (
  <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <line x1="14" y1="5" x2="14" y2="9" stroke="#ffffff" strokeWidth="2" />
    <circle cx="14" cy="4" r="2" fill="#ffffff" />
    <rect x="5" y="9" width="18" height="13" rx="3" fill="#ffffff" />
    <circle cx="10.5" cy="14.5" r="1.7" fill="#0f62fe" />
    <circle cx="17.5" cy="14.5" r="1.7" fill="#0f62fe" />
    <path d="M10.5 18.4c1 .9 2.2 1.3 3.5 1.3s2.5-.4 3.5-1.3" stroke="#0f62fe" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M9 22v3.4L12.4 22z" fill="#ffffff" />
    <path d="M26 3.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill="#ffffff" />
    <path d="M27.5 13l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6z" fill="#ffffff" opacity="0.85" />
  </svg>
);

export default function Assistant() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]); // {who:'bot'|'user', text, link?, label?, email?}
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && msgs.length === 0) {
      setMsgs([{ who: 'bot', text: 'Hi! I can point you to the right documentation — ask me anything about Docify. For anything specific I can’t answer, I’ll connect you to our team by email.' }]);
    }
    if (open) setTimeout(() => inputRef.current && inputRef.current.focus(), 100);
  }, [open]); // eslint-disable-line

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [msgs, typing]);

  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  function ask(q) {
    const question = q.trim();
    if (!question) return;
    setMsgs((m) => [...m, { who: 'user', text: question }]);
    setInput('');
    setTyping(true);
    setTimeout(() => {
      const hit = answerFor(question);
      setTyping(false);
      if (hit) {
        setMsgs((m) => [...m, { who: 'bot', text: hit.a, link: hit.link, label: hit.label, q: question }]);
      } else {
        setMsgs((m) => [...m, {
          who: 'bot',
          text: 'I don’t have a good answer for that one — but our team does. Send it to ' + SUPPORT_EMAIL + ' and we’ll get back to you quickly.',
          email: true, q: question
        }]);
      }
    }, 450);
  }

  return (
    <>
      {open && (
        <div className="asst-panel" role="dialog" aria-label="Docify assistant">
          <div className="asst-head">
            <div>
              <p className="asst-title">Assistant</p>
              <p className="asst-sub">Answers from the documentation · humans one click away</p>
            </div>
            <button className="asst-close" aria-label="Close assistant" onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className="asst-msgs" ref={listRef}>
            {msgs.map((m, i) => (
              <div key={i} className={'asst-msg ' + (m.who === 'user' ? 'asst-msg--user' : 'asst-msg--bot')}>
                <p>{m.text}</p>
                {m.link && (
                  <button className="asst-action" onClick={() => { nav(m.link); }}>
                    {m.label}<span aria-hidden="true"> →</span>
                  </button>
                )}
                {m.email && (
                  <a className="asst-action" href={supportMailto('Question from website chat', 'Hi Docify team,\n\n' + (m.q || '') + '\n\n')}>
                    Email {SUPPORT_EMAIL}<span aria-hidden="true"> →</span>
                  </a>
                )}
              </div>
            ))}
            {typing && <div className="asst-msg asst-msg--bot"><span className="asst-typing"><i /><i /><i /></span></div>}
            {msgs.length <= 1 && !typing && (
              <div className="asst-chips">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="asst-chip" onClick={() => ask(s)}>{s}</button>
                ))}
              </div>
            )}
          </div>

          <p className="asst-foot">
            Need a human? <a href={supportMailto('Question from website chat')}>Email {SUPPORT_EMAIL}</a>
          </p>
          <form className="asst-inputrow" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
            <input
              ref={inputRef}
              className="asst-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about Docify…"
              aria-label="Ask the assistant a question"
              maxLength={300}
            />
            <button type="submit" className="asst-send" aria-label="Send" disabled={!input.trim()}>
              <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M1 8l14-6-4.5 6L15 14 1 8z" /></svg>
            </button>
          </form>
        </div>
      )}

      <button
        className={'asst-launcher' + (open ? ' open' : '')}
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant — ask about Docify'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <span style={{ fontSize: 20, color: '#fff' }}>✕</span> : <IcAiBot />}
      </button>
    </>
  );
}
