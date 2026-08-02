import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SUPPORT_EMAIL, supportMailto } from './config.js';

/* =========================================================================
   Docs assistant — floating documentation search, bottom right, every page.

   This is a keyword match over the fixed knowledge base below; no model is
   called and nothing is generated. It must never be labelled or animated as
   if one were — no "AI assistant" wording, no simulated typing delay — or the
   UI would be claiming a capability the code does not have. Each reply
   deep-links to the matching /docs or /help article; anything the keyword
   match misses is handed to the support mailbox with the question prefilled.
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
    a: 'Automation pipelines regenerate documentation on every merge, re-score it against your quality gate, and publish the result to your Docify workspace and export centre — never back into your repository. Configure one in the six-step wizard: repository, branch, triggers, documents, quality gates, publishing.',
    link: '/automation', label: 'Set up automation'
  },
  {
    k: 'start begin generate create first document how work getting started quickstart tutorial demo try',
    a: 'Generating your first document takes about three minutes: connect a repository, pick a document type and format, and Docify drafts it from your actual code.',
    link: '/signup', label: 'Start free'
  },
  {
    k: 'quality score judge verdict rubric gate dimension finding fix issue review assessment',
    a: 'Every document is scored across six weighted dimensions by a deterministic rubric — not a language-model opinion — and every finding comes with a one-click fix and projected score gain.',
    link: '/docs/content-quality-assessment', label: 'How quality scoring works'
  },
  {
    k: 'ranking chatgpt claude gemini cite citation retrieval probability ai assistant rank seo discover readiness',
    a: 'Docify models AI-search readiness: how well assistants such as ChatGPT, Claude, and Gemini can find, parse, and cite a page, scored from the signals in the document itself. It is a modeled signal you can improve — not a ranking guarantee on any platform.',
    link: '/docs/chatgpt-ranking-analysis', label: 'AI-search readiness'
  },
  {
    k: 'github gitlab bitbucket integration connect repository repo source oauth code host',
    a: 'Docify connects to GitHub, GitLab, and Bitbucket over OAuth and only ever reads — it never writes to your repositories and never opens pull requests. Repositories, READMEs, and commit history become source material, and no copy of your source files is kept.',
    link: '/docs/github-integration', label: 'Integration details'
  },
  {
    k: 'format formats dita markdown html docbook epub pdf word docx export output download',
    a: 'Documents export to DITA, Markdown, HTML, DocBook, ePub, PDF, and Word. Which of them you can export depends on your plan — the pricing page lists the formats included with each.',
    link: '/docs/technical-doc-generation', label: 'Formats & outputs'
  },
  {
    k: 'security secure privacy private data stored store code safe compliance legal terms gdpr',
    a: 'Docify only reads — it never writes to your repositories — and keeps no copy of your source files: structure, comments, and commit history are read at generation time only. The security page also lists what Docify does not have yet.',
    link: '/legal/security', label: 'Security policy'
  },
  {
    k: 'jira issue traceability trace commit link ticket atlassian',
    a: 'Pipelines can trace every merge back to the Jira issue it delivered — the issue key is read from the commit message or branch, so each documentation change is auditable.',
    link: '/docs/change-impact-analysis', label: 'Change traceability'
  },
  {
    k: 'login sign in signup account password cannot access forgot email verify otp',
    a: 'You can sign in with email or with Google, or with your GitHub / GitLab / Bitbucket account — those three also connect your source in the same authorization. Google signs you in only; you still connect a repository afterwards.',
    link: '/help/login', label: 'Login help'
  },
  {
    k: 'docs documentation help article guide learn read more knowledge',
    a: 'The documentation hub covers everything: quality scoring, AI-search readiness, integrations, automation, and governance.',
    link: '/docs', label: 'Browse documentation'
  },
  {
    k: 'contact support human email talk person reach message help me problem bug error broken issue not working fail',
    a: 'You can reach a human any time — send a message through the contact page or email ' + SUPPORT_EMAIL + ' and we’ll get back to you.',
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

/* A page under a magnifier, not a robot: the launcher searches documentation,
   so the glyph must not read as a model you are talking to. */
const IcDocsSearch = () => (
  <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M7 3h11l6 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="#ffffff" />
    <path d="M18 3l6 6h-5a1 1 0 0 1-1-1V3z" fill="#0f62fe" opacity="0.35" />
    <rect x="8.5" y="12" width="11" height="1.8" rx="0.9" fill="#0f62fe" />
    <rect x="8.5" y="16" width="8" height="1.8" rx="0.9" fill="#0f62fe" />
    <circle cx="21" cy="22" r="5" fill="#ffffff" stroke="#0f62fe" strokeWidth="2" />
    <path d="M24.8 25.8L28 29" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

export default function Assistant() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]); // {who:'bot'|'user', text, link?, label?, email?}
  const [input, setInput] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && msgs.length === 0) {
      setMsgs([{ who: 'bot', text: 'Hi! Ask about Docify and I’ll match your question to the right documentation page. I’m a search over our docs, not a chatbot — anything I can’t match, I’ll hand to our team by email.' }]);
    }
    if (open) setTimeout(() => inputRef.current && inputRef.current.focus(), 100);
  }, [open]); // eslint-disable-line

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [msgs]);

  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  function ask(q) {
    const question = q.trim();
    if (!question) return;
    setInput('');
    // The lookup is synchronous and instant. Deliberately no delay or typing
    // animation: there is no model to wait for, and pretending otherwise
    // would misrepresent what this does.
    const hit = answerFor(question);
    setMsgs((m) => [...m, { who: 'user', text: question }, hit
      ? { who: 'bot', text: hit.a, link: hit.link, label: hit.label, q: question }
      : {
        who: 'bot',
        text: 'That doesn’t match anything in the documentation I cover, and I won’t guess. Our team can answer it — send it to ' + SUPPORT_EMAIL + ' and we’ll get back to you.',
        email: true, q: question
      }]);
  }

  return (
    <>
      {open && (
        <div className="asst-panel" role="dialog" aria-label="Docify documentation search">
          <div className="asst-head">
            <div>
              <p className="asst-title">Docs assistant</p>
              <p className="asst-sub">Answers from the documentation · humans one click away</p>
            </div>
            <button className="asst-close" aria-label="Close docs assistant" onClick={() => setOpen(false)}>✕</button>
          </div>

          {/* Replies now land in the same tick as the question, so there is no
              pending state to announce — the region carries the announcement. */}
          <div className="asst-msgs" ref={listRef} aria-live="polite">
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
            {msgs.length <= 1 && (
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
              placeholder="Search the documentation…"
              aria-label="Search the documentation"
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
        aria-label={open ? 'Close docs assistant' : 'Open docs assistant — search the documentation'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <span style={{ fontSize: 20, color: '#fff' }}>✕</span> : <IcDocsSearch />}
      </button>
    </>
  );
}
