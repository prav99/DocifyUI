import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogoMark } from '../ui.jsx';
import { usePageMeta } from '../seo.js';
import { SUPPORT_EMAIL, supportMailto } from '../config.js';
import { AutomationDemo, AICompatDemo, GenerateDemo } from './demos.jsx';

/* ---------- Scroll-reveal wrapper ---------- */
function Reveal({ children, delay = 0, className = '' }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setOn(true); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={'reveal ' + (on ? 'reveal--on ' : '') + className}
      style={{ transitionDelay: delay + 'ms' }}>
      {children}
    </div>
  );
}

/* ---------- Count-up number ---------- */
function CountUp({ to, decimals = 0, suffix = '' }) {
  const ref = useRef(null);
  const [val, setVal] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now(), dur = 1400;
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        setVal(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={ref}>{val.toFixed(decimals)}{suffix}</span>;
}

/* ---------- Illustrations (geometric, enterprise design language) ---------- */

function HeroVisual() {
  return (
    <svg className="illus herovis" viewBox="0 0 480 360" fill="none" aria-hidden="true">
      {/* pipeline rail */}
      <line className="hv-rail" x1="40" y1="60" x2="40" y2="300" stroke="#393939" strokeWidth="2" />
      <circle className="pulse" cx="40" cy="70" r="7" fill="#0f62fe" />
      <circle className="pulse pd2" cx="40" cy="180" r="7" fill="#4589ff" />
      <circle className="pulse pd3" cx="40" cy="290" r="7" fill="#42be65" />
      <line className="flowline" x1="47" y1="70" x2="96" y2="70" stroke="#393939" strokeWidth="2" strokeDasharray="4 4" />
      <line className="flowline" x1="47" y1="180" x2="96" y2="180" stroke="#393939" strokeWidth="2" strokeDasharray="4 4" />
      <line className="flowline" x1="47" y1="290" x2="96" y2="290" stroke="#393939" strokeWidth="2" strokeDasharray="4 4" />
      {/* source card */}
      <g className="hv-card">
        <rect x="96" y="42" width="150" height="56" fill="#262626" stroke="#393939" strokeWidth="1.5" />
        <rect x="112" y="58" width="16" height="16" fill="#0f62fe" />
        <rect x="138" y="58" width="92" height="6" fill="#525252" />
        <rect x="138" y="72" width="60" height="6" fill="#393939" />
      </g>
      {/* document */}
      <g className="hv-doc">
        <rect x="96" y="122" width="230" height="180" fill="#1f1f1f" stroke="#393939" strokeWidth="1.5" />
        <rect className="hv-line" style={{ animationDelay: '.55s' }} x="118" y="146" width="120" height="10" fill="#f4f4f4" />
        <rect className="hv-line" style={{ animationDelay: '.65s' }} x="118" y="168" width="186" height="5" fill="#525252" />
        <rect className="hv-line" style={{ animationDelay: '.72s' }} x="118" y="180" width="160" height="5" fill="#525252" />
        <rect className="hv-line" style={{ animationDelay: '.8s' }} x="118" y="200" width="70" height="7" fill="#4589ff" />
        <rect className="hv-line" style={{ animationDelay: '.86s' }} x="118" y="214" width="186" height="5" fill="#393939" />
        <rect className="hv-line" style={{ animationDelay: '.92s' }} x="118" y="226" width="150" height="5" fill="#393939" />
        <rect className="hv-line" style={{ animationDelay: '.98s' }} x="118" y="246" width="70" height="7" fill="#4589ff" />
        <rect className="hv-line" style={{ animationDelay: '1.04s' }} x="118" y="260" width="170" height="5" fill="#393939" />
        <rect className="hv-line" style={{ animationDelay: '1.1s' }} x="118" y="272" width="130" height="5" fill="#393939" />
      </g>
      {/* score chip */}
      <g className="pop">
        <g className="floaty">
          <rect x="296" y="106" width="128" height="64" fill="#161616" stroke="#42be65" strokeWidth="2" />
          <text x="312" y="134" fill="#42be65" fontFamily="IBM Plex Mono, monospace" fontSize="22">98/100</text>
          <text x="312" y="154" fill="#8d8d8d" fontFamily="IBM Plex Sans, sans-serif" fontSize="11">quality gate passed</text>
        </g>
      </g>
      {/* ranking outlook card — the MOAT, right in the hero */}
      <g className="pop">
        <rect x="344" y="192" width="128" height="96" fill="#161616" stroke="#0f62fe" strokeWidth="2" />
        <text x="356" y="210" fill="#78a9ff" fontFamily="IBM Plex Mono, monospace" fontSize="9" letterSpacing="1">AI RANKING</text>
        {[['ChatGPT', 94, 224], ['Claude', 97, 248], ['Gemini', 84, 272]].map(([n, p, y], i) => (
          <g key={n}>
            <text x="356" y={y} fill="#c6c6c6" fontFamily="IBM Plex Sans, sans-serif" fontSize="10">{n}</text>
            <rect x="404" y={y - 8} width="40" height="5" fill="#393939" />
            <rect className="hv-line" style={{ animationDelay: (1.2 + i * 0.25) + 's' }} x="404" y={y - 8} width={40 * p / 100} height="5" fill={p >= 90 ? '#42be65' : '#4589ff'} />
            <text x="450" y={y} fill="#f4f4f4" fontFamily="IBM Plex Mono, monospace" fontSize="9">{p}%</text>
          </g>
        ))}
      </g>
      {/* format chips */}
      <g className="hv-chips">
        <rect x="344" y="300" width="44" height="20" fill="#262626" stroke="#393939" />
        <text x="352" y="314" fill="#c6c6c6" fontFamily="IBM Plex Mono, monospace" fontSize="10">DITA</text>
        <rect x="394" y="300" width="36" height="20" fill="#262626" stroke="#393939" />
        <text x="402" y="314" fill="#c6c6c6" fontFamily="IBM Plex Mono, monospace" fontSize="10">PDF</text>
        <rect x="436" y="300" width="32" height="20" fill="#262626" stroke="#393939" />
        <text x="443" y="314" fill="#c6c6c6" fontFamily="IBM Plex Mono, monospace" fontSize="10">MD</text>
      </g>
    </svg>
  );
}

function IlluSource() {
  return (
    <svg className="illus" viewBox="0 0 400 260" fill="none" aria-hidden="true">
      <rect x="24" y="32" width="168" height="64" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1.5" />
      <rect x="40" y="50" width="20" height="20" fill="#0f62fe" />
      <rect className="hgrow" x="70" y="50" width="100" height="7" fill="#c6c6c6" />
      <rect className="hgrow" x="70" y="66" width="70" height="7" fill="#e0e0e0" />
      <rect x="24" y="112" width="168" height="64" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1.5" />
      <rect x="40" y="130" width="20" height="20" fill="#4589ff" />
      <rect className="hgrow" x="70" y="130" width="100" height="7" fill="#c6c6c6" />
      <rect className="hgrow" x="70" y="146" width="84" height="7" fill="#e0e0e0" />
      <rect x="24" y="192" width="168" height="48" fill="#f4f4f4" />
      <rect className="hgrow" x="40" y="208" width="120" height="7" fill="#c6c6c6" />
      <path className="flowline" d="M192 104 h56 v40 h48" stroke="#0f62fe" strokeWidth="2" strokeDasharray="6 4" />
      <circle className="pulse" cx="296" cy="144" r="5" fill="#0f62fe" />
      <rect className="lockpulse" x="288" y="60" width="88" height="64" fill="#ffffff" stroke="#0f62fe" strokeWidth="2" />
      <rect x="316" y="84" width="32" height="26" fill="#edf5ff" stroke="#0f62fe" strokeWidth="2" />
      <path d="M322 84v-8a10 10 0 0 1 20 0v8" stroke="#0f62fe" strokeWidth="2" fill="none" />
      <text x="288" y="150" fill="#525252" fontFamily="IBM Plex Mono, monospace" fontSize="11">read-only</text>
      <rect x="288" y="168" width="88" height="40" fill="#f4f4f4" />
      <rect className="hgrow" x="300" y="182" width="64" height="6" fill="#c6c6c6" />
      <rect className="hgrow" x="300" y="194" width="44" height="6" fill="#e0e0e0" />
    </svg>
  );
}

function IlluGenerate() {
  return (
    <svg className="illus" viewBox="0 0 400 260" fill="none" aria-hidden="true">
      <rect x="24" y="40" width="150" height="180" fill="#f4f4f4" stroke="#e0e0e0" strokeWidth="1.5" />
      <rect className="shim" x="40" y="60" width="60" height="6" fill="#007d79" />
      <rect x="40" y="76" width="100" height="6" fill="#c6c6c6" />
      <rect x="52" y="92" width="88" height="6" fill="#c6c6c6" />
      <rect className="shim sd2" x="52" y="108" width="64" height="6" fill="#6929c4" />
      <rect x="40" y="124" width="90" height="6" fill="#c6c6c6" />
      <rect className="shim sd3" x="40" y="152" width="72" height="6" fill="#007d79" />
      <rect x="52" y="168" width="96" height="6" fill="#c6c6c6" />
      <rect x="40" y="184" width="80" height="6" fill="#c6c6c6" />
      <path className="slidearrow" d="M174 130h44m0 0-10-10m10 10-10 10" stroke="#0f62fe" strokeWidth="2.5" />
      <rect x="230" y="36" width="146" height="188" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1.5" />
      <rect className="hgrow" x="248" y="56" width="84" height="10" fill="#161616" />
      <rect className="hgrow" x="248" y="78" width="110" height="5" fill="#c6c6c6" />
      <rect className="hgrow" x="248" y="89" width="94" height="5" fill="#c6c6c6" />
      <rect x="248" y="108" width="48" height="7" fill="#0f62fe" />
      <rect className="hgrow" x="248" y="122" width="110" height="5" fill="#e0e0e0" />
      <rect className="hgrow" x="248" y="133" width="102" height="5" fill="#e0e0e0" />
      <rect x="248" y="152" width="48" height="7" fill="#0f62fe" />
      <rect className="hgrow" x="248" y="166" width="106" height="5" fill="#e0e0e0" />
      <rect className="hgrow" x="248" y="177" width="88" height="5" fill="#e0e0e0" />
      <rect x="248" y="196" width="110" height="16" fill="#f4f4f4" />
      <rect className="hgrow" x="256" y="201" width="64" height="6" fill="#8d8d8d" />
    </svg>
  );
}

function IlluVerify() {
  return (
    <svg className="illus" viewBox="0 0 400 260" fill="none" aria-hidden="true">
      <rect x="24" y="32" width="220" height="196" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1.5" />
      <rect x="24" y="32" width="220" height="36" fill="#f4f4f4" />
      <rect x="40" y="46" width="96" height="8" fill="#161616" />
      <rect className="hgrow" x="40" y="88" width="150" height="6" fill="#c6c6c6" />
      <rect className="shim" x="40" y="104" width="170" height="6" fill="#defbe6" stroke="#24a148" strokeWidth="1" />
      <rect className="hgrow" x="40" y="120" width="130" height="6" fill="#c6c6c6" />
      <rect className="shim sd2" x="40" y="136" width="160" height="6" fill="#fdf0c0" stroke="#f1c21b" strokeWidth="1" />
      <rect className="hgrow" x="40" y="152" width="145" height="6" fill="#c6c6c6" />
      <rect className="shim sd3" x="40" y="168" width="170" height="6" fill="#d0e2ff" stroke="#0043ce" strokeWidth="1" />
      <rect className="hgrow" x="40" y="184" width="120" height="6" fill="#c6c6c6" />
      <rect className="hgrow" x="40" y="200" width="150" height="6" fill="#c6c6c6" />
      <circle cx="322" cy="106" r="54" stroke="#e0e0e0" strokeWidth="10" fill="none" />
      <path className="gaugearc" d="M322 52a54 54 0 0 1 51 71" stroke="#24a148" strokeWidth="10" fill="none" />
      <text x="300" y="112" fill="#161616" fontFamily="IBM Plex Mono, monospace" fontSize="20">96</text>
      <text x="292" y="130" fill="#525252" fontFamily="IBM Plex Sans, sans-serif" fontSize="10">AI-ready</text>
      <rect className="fixchip" x="270" y="180" width="104" height="32" fill="#0f62fe" />
      <text x="284" y="200" fill="#ffffff" fontFamily="IBM Plex Sans, sans-serif" fontSize="12">Apply fix</text>
    </svg>
  );
}

function IlluRank() {
  const rows = [['ChatGPT', 94, '#24a148'], ['Claude', 97, '#24a148'], ['Gemini', 84, '#0f62fe']];
  return (
    <svg className="illus" viewBox="0 0 400 260" fill="none" aria-hidden="true">
      <rect x="24" y="28" width="352" height="204" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1.5" />
      <text x="48" y="60" fill="#0043ce" fontFamily="IBM Plex Mono, monospace" fontSize="11" letterSpacing="2">RANKING OUTLOOK</text>
      <text x="48" y="80" fill="#525252" fontFamily="IBM Plex Sans, sans-serif" fontSize="10">chance to be retrieved &amp; cited · recomputed on every fix</text>
      {rows.map(([n, p, c], i) => (
        <g key={n}>
          <text x="48" y={116 + i * 38} fill="#161616" fontFamily="IBM Plex Sans, sans-serif" fontSize="13">{n}</text>
          <rect x="130" y={106 + i * 38} width="180" height="8" fill="#e0e0e0" />
          <rect className="hv-line" style={{ animationDelay: (0.4 + i * 0.35) + 's' }}
            x="130" y={106 + i * 38} width={180 * p / 100} height="8" fill={c} />
          <text x="322" y={116 + i * 38} fill="#161616" fontFamily="IBM Plex Mono, monospace" fontSize="14">{p}%</text>
        </g>
      ))}
      <rect x="48" y="196" width="150" height="22" fill="#defbe6" />
      <text x="58" y="211" fill="#0e6027" fontFamily="IBM Plex Mono, monospace" fontSize="10">▲ +46 pts after fixes</text>
    </svg>
  );
}

function IlluAutomate() {
  return (
    <svg className="illus" viewBox="0 0 400 260" fill="none" aria-hidden="true">
      <circle className="pulse" cx="60" cy="70" r="10" fill="#0f62fe" />
      <circle cx="60" cy="190" r="10" fill="#8d8d8d" />
      <path d="M60 80v40a40 40 0 0 0 40 40h20" stroke="#8d8d8d" strokeWidth="2.5" fill="none" />
      <path d="M60 180v-20" stroke="#8d8d8d" strokeWidth="2.5" />
      <text x="82" y="66" fill="#525252" fontFamily="IBM Plex Mono, monospace" fontSize="11">merge → main</text>
      <rect x="130" y="140" width="120" height="44" fill="#161616" />
      <text x="146" y="166" fill="#ffffff" fontFamily="IBM Plex Mono, monospace" fontSize="11">docgen run</text>
      <path className="slidearrow" d="M250 162h44" stroke="#0f62fe" strokeWidth="2.5" />
      <rect x="294" y="134" width="82" height="56" fill="#ffffff" stroke="#24a148" strokeWidth="2" />
      <path className="gatecheck" d="M312 162l10 10 20-20" stroke="#24a148" strokeWidth="3" fill="none" />
      <text x="300" y="206" fill="#525252" fontFamily="IBM Plex Mono, monospace" fontSize="10">gate ≥ 85</text>
      <path className="flowline" d="M335 134V96a26 26 0 0 0-26-26H92" stroke="#c6c6c6" strokeWidth="2" strokeDasharray="6 4" fill="none" />
      <path d="M100 62l-10 8 10 8" stroke="#c6c6c6" strokeWidth="2" fill="none" />
    </svg>
  );
}

/* ---------- Animated problem vignettes ---------- */
function ProbIcon({ kind }) {
  if (kind === 'stale') {
    return (
      <svg className="probicon" viewBox="0 0 96 56" fill="none" aria-hidden="true">
        <line x1="6" y1="16" x2="90" y2="16" stroke="#393939" strokeWidth="2" />
        {[16, 34, 52, 70].map((x, i) => (
          <circle key={x} className="pulse" style={{ animationDelay: (i * 0.35) + 's' }} cx={x} cy="16" r="4.5" fill="#4589ff" />
        ))}
        <circle cx="88" cy="16" r="4.5" fill="#42be65" />
        <rect x="6" y="36" width="52" height="8" fill="#262626" stroke="#393939" />
        <rect x="6" y="36" width="18" height="8" fill="#fa4d56" opacity="0.85" />
        <text x="64" y="44" fill="#8d8d8d" fontFamily="IBM Plex Mono, monospace" fontSize="9">v0.9</text>
      </svg>
    );
  }
  if (kind === 'buried') {
    return (
      <svg className="probicon" viewBox="0 0 96 56" fill="none" aria-hidden="true">
        {[42, 30, 18].map((y, i) => (
          <rect key={y} className="shim" style={{ animationDelay: (i * 0.4) + 's' }}
            x={14 + i * 7} y={y} width={64 - i * 14} height="9" fill="#262626" stroke="#393939" />
        ))}
        <circle className="pulse" cx="76" cy="12" r="7" fill="none" stroke="#f1c21b" strokeWidth="2" />
        <line x1="81" y1="17" x2="88" y2="24" stroke="#f1c21b" strokeWidth="2.5" />
      </svg>
    );
  }
  return (
    <svg className="probicon" viewBox="0 0 96 56" fill="none" aria-hidden="true">
      <rect x="8" y="10" width="44" height="30" fill="#262626" stroke="#393939" />
      <rect x="16" y="18" width="28" height="4" fill="#525252" />
      <rect x="16" y="27" width="20" height="4" fill="#393939" />
      <circle className="pulse" cx="74" cy="25" r="12" fill="none" stroke="#4589ff" strokeWidth="2" />
      <text x="70" y="30" fill="#4589ff" fontFamily="IBM Plex Mono, monospace" fontSize="13">?</text>
      <line className="flowline" x1="52" y1="25" x2="60" y2="25" stroke="#fa4d56" strokeWidth="2" strokeDasharray="3 3" />
      <line x1="66" y1="17" x2="82" y2="33" stroke="#fa4d56" strokeWidth="2" opacity="0.9" />
    </svg>
  );
}

/* ---------- Page data ---------- */

const FEATURES = [
  {
    eyebrow: 'SECTION 03 · CONNECT YOUR TOOLS', title: 'It starts where your truth already lives',
    body: 'One authorization — the same grant that signs you in. DocGen reads your repository the way your best writer would: structure, comments, commit history, API annotations. Read-only, never stored, nothing to configure.',
    illu: <IlluSource />
  },
  {
    eyebrow: 'SECTION 04 · GENERATE', title: 'Every commit becomes a draft',
    body: 'Not a template with blanks — a real document, drafted from what the code actually says and rebuilt when it changes. Eleven document types, each held to an open standard — Diátaxis, OpenAPI 3.1, Keep a Changelog — in DITA, PDF, Word, HTML, or Markdown.',
    illu: <IlluGenerate />
  },
  {
    eyebrow: 'SECTION 06 · VALIDATE QUALITY', title: 'Then comes the cross-examination',
    body: 'Before anything ships, an AI judge reads every section the way a machine will. Does the title match real queries? Does each passage stand alone? Is there an example where a reader expects one? Every finding arrives with a one-click fix — and a projected score gain.',
    illu: <IlluVerify />
  },
  {
    eyebrow: 'SECTION 07 · AI DISCOVERY', title: 'Know where you will rank — before you publish',
    body: 'This is the part nobody else shows you. DocGen models how ChatGPT, Claude, and Google Gemini each weigh your content — metadata, links, readability, completeness — and puts a number on your chance of being retrieved and cited. Apply the fixes and watch the number climb.',
    illu: <IlluRank />
  },
  {
    eyebrow: 'SECTION 05 · ALWAYS CURRENT', title: 'And then you never do this again',
    body: 'Build a pipeline once: repository, branch, triggers, documents, AI thresholds, publishing. Every push, merged pull request, feature change, bug fix, and configuration update then flows into the documentation automatically — placed into your existing documents at the best-matching section, never as a duplicate. The release and its documentation ship together.',
    illu: <IlluAutomate />,
    cta: ['Build your pipeline', '/automation']
  }
];

const QUOTES = [
  { q: 'We regenerate the API reference on every merge now. What used to be a 3-day post-release scramble is a 4-minute pipeline step, and the quality gate catches broken links before customers do.', n: 'Head of Documentation', c: 'Series C fintech, 40-person eng team', s: '11 hours saved per release' },
  { q: 'The ranking prediction changed how we prioritize. We watched our citation probability climb from 51% to 97% as we applied fixes — and two weeks later, ChatGPT and Gemini were actually citing our reference in integration answers.', n: 'Platform Engineering Lead', c: 'Developer tools company', s: 'Citation probability 51% → 97%' },
  { q: 'Two writers support nine product teams. DocGen drafts, we edit. The style-guide findings alone replaced our entire manual review checklist.', n: 'Technical Writing Manager', c: 'Enterprise SaaS, 300 employees', s: '2.3 hours saved per document' }
];

const SRCS = ['GitHub', 'GitLab', 'Bitbucket', 'Jira', 'Confluence', 'Notion', 'OpenAPI'];
const FMTS = ['DITA', 'PDF', 'Word', 'Markdown'];

/* FAQ content — mirrored in server/src/seo-meta.js as FAQPage JSON-LD.
   Keep the two in sync when editing. */
export const FAQS = [
  {
    q: 'What is DocGen?',
    a: 'DocGen is an AI documentation generator that turns your GitHub, GitLab, or Bitbucket repository into standards-grade technical documentation — API references, user guides, release notes, and more — exported to DITA, PDF, Word, HTML, or Markdown. Every document is scored by an AI quality judge before you publish.'
  },
  {
    q: 'How does the AI quality scoring work?',
    a: 'Every generated document is reviewed by an LLM judge across six weighted dimensions: style, consistency, completeness, readability, LLM readiness, and link integrity. Each finding ships with a one-click fix and a declared score gain, and a quality gate (85 by default) blocks anything below your bar.'
  },
  {
    q: 'What is AI ranking prediction?',
    a: 'Before you publish, DocGen models how ChatGPT, Claude, and Google Gemini each weigh your content — metadata, structure, readability, completeness — and estimates the probability that each platform will retrieve and cite your page. The estimate is recomputed live as you apply fixes.'
  },
  {
    q: 'Is my source code stored?',
    a: 'No. DocGen reads your repository through a read-only grant, generates documentation from code structure, comments, and commit history, and never stores your source code. You can revoke access at any time.'
  },
  {
    q: 'Can documentation update automatically on every merge?',
    a: 'Yes. Automation pipelines regenerate documentation on every merge via webhook, re-score it with the AI judge, update the AI ranking outlook, and hold anything below the quality gate for review — so the release and its documentation ship together.'
  },
  {
    q: 'Who is DocGen built for?',
    a: 'Developer platform teams, technical writers, product managers, and documentation teams at startups and enterprises — anyone who needs accurate, AI-ready developer documentation without the manual upkeep.'
  }
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={'faqitem' + (open ? ' open' : '')}>
      <button className="faq-q" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {q}<span className="faq-chev" aria-hidden="true">▾</span>
      </button>
      {open && <p className="faq-a">{a}</p>}
    </div>
  );
}

export default function Landing() {
  usePageMeta({
    title: 'DocGen — Automated AI Documentation Generator with Quality & AI Search Readiness Scores',
    description: 'DocGen automates technical documentation end to end: connect GitHub, GitLab, or Bitbucket and every merge updates your docs automatically, validated by an AI quality judge and scored for AI search readiness across ChatGPT, Claude, Gemini, and Copilot.',
    path: '/'
  });
  const nav = useNavigate();
  const chapter = (i) => (
    <Reveal>
      <div className="featrow">
        {i % 2 === 0 ? <div className="illuwrap">{FEATURES[i].illu}</div> : null}
        <div>
          <p className="eyebrow eyebrow--blue mb3">{FEATURES[i].eyebrow}</p>
          <h2 className="feathead">{FEATURES[i].title}</h2>
          <p className="lead t2 mt5" style={{ maxWidth: 480 }}>{FEATURES[i].body}</p>
          {FEATURES[i].cta && (
            <button className="btn btn--tertiary mt5" onClick={() => nav(FEATURES[i].cta[1])}>
              {FEATURES[i].cta[0]}<span className="ico">→</span>
            </button>
          )}
        </div>
        {i % 2 === 1 ? <div className="illuwrap">{FEATURES[i].illu}</div> : null}
      </div>
    </Reveal>
  );
  return (
    <>
      {/* Hero */}
      <section className="heroband">
        <div className="gridlines" />
        <div className="heroinner">
          <div>
            <p className="eyebrow mb3">AI DOCUMENTATION INTELLIGENCE PLATFORM</p>
            <h1 className="display">Documentation that AI understands, trusts, and ranks.</h1>
            <p className="lead t2 mt5" style={{ maxWidth: 560 }}>
              DocGen turns your code commits into standards-grade documentation, cross-examines every
              page with an LLM judge, and tells you — in numbers — how likely ChatGPT, Claude, and
              Google Gemini are to retrieve and cite it. Before you publish, not after.
            </p>
            <div className="row mt7" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn--primary" onClick={() => nav('/signup')}>Start free<span className="ico">→</span></button>
              <button className="btn btn--ghostdark" onClick={() => nav('/pricing')}>View pricing</button>
            </div>
            <button className="herofeat mt6" onClick={() => nav('/automation')}>
              <span className="herofeat-new mono">NEW</span>
              <span>Automation pipelines — documentation that regenerates, re-judges, and re-ranks itself on every merge</span>
              <span className="herofeat-arrow">→</span>
            </button>
            <p className="helper mt5" style={{ color: '#8d8d8d' }}>
              Read-only access · your source code is never stored · no credit card required
            </p>
          </div>
          <HeroVisual />
        </div>
      </section>

      {/* The problem — story opening */}
      <div className="page" style={{ paddingTop: 72, paddingBottom: 0 }}>
        <Reveal>
          <p className="eyebrow eyebrow--blue mb3">THE STORY EVERY TEAM KNOWS</p>
          <h2 className="feathead" style={{ maxWidth: 720 }}>Your next customer will never read your docs. Their AI assistant will.</h2>
          <p className="lead t2 mt5" style={{ maxWidth: 680 }}>
            Somewhere right now, a developer is asking ChatGPT how to integrate a payments API.
            The assistant answers from whichever documentation it can find, parse, and trust —
            and recommends that product. Meanwhile the code shipped on Friday, the quick start
            still 404s, and the guide describes a screen redesigned two sprints ago. Nobody chose
            this. It is simply what happens when documentation is a manual step in an automated
            world — read by machines that were never considered when it was written.
          </p>
        </Reveal>
      </div>

      {/* The problem, staged — three acts, animated */}
      <div className="page" style={{ paddingTop: 40, paddingBottom: 0 }}>
        <div className="probband">
          <div className="gridlines" />
          <div className="probgrid">
            {[
              ['stale', 'Stale.', 'Code merges every day. Documentation updates once a quarter — if someone remembers.'],
              ['buried', 'Buried.', 'Writers excavate commits, tickets, and chat threads for every page. Releases wait.'],
              ['invisible', 'Invisible.', 'AI assistants answer from content they can parse and trust. Unstructured docs never make the shortlist.']
            ].map(([icon, big, sub], i) => (
              <Reveal key={big} delay={i * 150}>
                <div className="probcard">
                  <ProbIcon kind={icon} />
                  <p className="probword">{big}</p>
                  <p className="probsub">{sub}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={480}>
            <p className="probbridge">DocGen ends that story. <span>Watch it happen.</span></p>
          </Reveal>
        </div>
      </div>

      {/* SECTION 2 · Meet DocGen — Film 1: complete automation */}
      <div className="page" id="film-automation" style={{ paddingTop: 40, paddingBottom: 32 }}>
        <Reveal>
          <p className="eyebrow eyebrow--blue mb3">SECTION 02 · MEET DOCGEN — FILM 01</p>
          <h2 className="feathead">Your code changes. Your documentation updates automatically.</h2>
          <p className="lead t2 mt3" style={{ maxWidth: 660 }}>
            DocGen is the intelligent automation layer between your development work and your published
            documentation — generation, validation, AI optimisation, and publishing in one loop.
            This film is the whole story in ninety seconds: a pull request merges, and verified
            documentation ships. Press play.
          </p>
        </Reveal>
        <Reveal delay={120}><div className="vidwrap"><AutomationDemo /></div></Reveal>
      </div>

      {/* Logos strip */}
      <div className="page" style={{ paddingBottom: 0, paddingTop: 40 }}>
        <div className="divider" style={{ marginTop: 0, marginBottom: 24 }} />
        <Reveal>
          <div className="row row--between" style={{ flexWrap: 'wrap', gap: 16 }}>
            <p className="label01 t2">WORKS WITH</p>
            <div className="logorow">
              {SRCS.map((s) => <span key={s}>{s}</span>)}
              <span>·</span>
              {FMTS.map((f) => <span key={f}>{f}</span>)}
            </div>
          </div>
        </Reveal>
        <div className="divider" style={{ marginBottom: 0, marginTop: 24 }} />
      </div>

      {/* SECTION 3 · Connect existing tools */}
      <div className="page featlist" style={{ paddingTop: 8, paddingBottom: 0 }}>
        {chapter(0)}
      </div>

      {/* SECTION 4 · Generate + Film 3: standard workflow */}
      <div className="page featlist" style={{ paddingTop: 0, paddingBottom: 0 }}>
        {chapter(1)}
      </div>
      <div className="page" id="film-generate" style={{ paddingTop: 24, paddingBottom: 32 }}>
        <Reveal>
          <p className="eyebrow eyebrow--blue mb3">FILM 02 · GENERATE ON DEMAND</p>
          <h2 className="feathead">Complex technical input → professional documentation, in minutes</h2>
          <p className="lead t2 mt3" style={{ maxWidth: 640 }}>
            The standard workflow, end to end: pick a source, a document type, a format, and an
            audience — then watch DocGen collect the source information, write the document,
            verify it, and export it. Press play, or click any step to skip ahead.
          </p>
        </Reveal>
        <Reveal delay={120}><div className="vidwrap"><GenerateDemo /></div></Reveal>
      </div>

      {/* SECTION 5 · Continuously updated */}
      <div className="page featlist" style={{ paddingTop: 0, paddingBottom: 0 }}>
        {chapter(4)}
      </div>

      {/* SECTION 6 · Validate quality */}
      <div className="page featlist" style={{ paddingTop: 0, paddingBottom: 0 }}>
        {chapter(2)}
        <Reveal>
          <div className="row mt2 mb6" style={{ flexWrap: 'wrap', gap: 8 }}>
            {['Completeness', 'Accuracy', 'Grammar', 'Terminology', 'Style compliance', 'Readability', 'Broken links', 'Missing prerequisites', 'Missing limitations', 'Duplicate content', 'Outdated content'].map((c) => (
              <span key={c} className="tag tag--outline">✓ {c}</span>
            ))}
          </div>
        </Reveal>
      </div>

      {/* SECTION 7 · Optimise for AI discovery + Film 2 */}
      <div className="page featlist" style={{ paddingTop: 0, paddingBottom: 0 }}>
        {chapter(3)}
      </div>
      <div className="page" id="film-ai" style={{ paddingTop: 24, paddingBottom: 32 }}>
        <Reveal>
          <p className="eyebrow eyebrow--blue mb3">FILM 03 · AI COMPATIBILITY</p>
          <h2 className="feathead">Documentation people understand — and AI systems trust</h2>
          <p className="lead t2 mt3" style={{ maxWidth: 660 }}>
            Traditional documentation was written for human readers only. This film opens the AI
            Compatibility dashboard: an AI Search Readiness Score, nine dimensions machines actually
            weigh, and the exact fixes that take one document from 62 to 91.
          </p>
        </Reveal>
        <Reveal delay={120}><div className="vidwrap"><AICompatDemo /></div></Reveal>
      </div>

      {/* MOAT band: live ranking numbers */}
      <div className="page" style={{ paddingTop: 24, paddingBottom: 32 }}>
        <Reveal>
          <div className="moat">
            <p className="eyebrow" style={{ color: '#78a9ff' }}>THE DOCGEN DIFFERENCE</p>
            <h2 className="h03 mt2" style={{ color: '#ffffff', maxWidth: 640 }}>
              Will ChatGPT cite you? Stop guessing.
            </h2>
            <p className="helper mt3" style={{ color: '#c6c6c6', maxWidth: 620 }}>
              One pilot document, before and after applying the suggested fixes — each model&apos;s
              estimated chance of retrieving and citing it. Recomputed live, capped below 100%,
              because certainty would be a false claim.
            </p>
            <div className="moatgrid mt5">
              {[['ChatGPT', 49, 94], ['Claude', 51, 97], ['Google Gemini', 52, 84]].map(([n, from, to]) => (
                <div key={n} className="moatcard">
                  <div className="row row--between">
                    <span className="h01" style={{ color: '#ffffff' }}>{n}</span>
                    <span className="tag tag--green">+{to - from} pts</span>
                  </div>
                  <p className="moatpct mono"><CountUp to={to} /><span className="moatpctsign">%</span></p>
                  <div className="moatbar"><div className={to >= 90 ? 'ok' : ''} style={{ width: to + '%' }} /></div>
                  <span className="helper" style={{ color: '#8d8d8d' }}>was {from}% before fixes</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>

      {/* Chapter 5 */}
      <div className="page featlist" style={{ paddingTop: 0, paddingBottom: 56 }}>
        {chapter(4)}
      </div>

      {/* SECTION 8 · Value for every team */}
      <div className="page" style={{ paddingTop: 24, paddingBottom: 56 }}>
        <Reveal>
          <p className="eyebrow eyebrow--blue mb3">SECTION 08 · WHAT EACH TEAM GETS</p>
          <h2 className="feathead mb6">Measurable value, role by role</h2>
        </Reveal>
        <div className="grid3" style={{ alignItems: 'stretch' }}>
          {[['Developers', 'Stop writing documentation. Merge code — the docs follow.'],
            ['Technical writers', 'Source information collected automatically; you edit, not excavate.'],
            ['Documentation managers', 'Scores, gates, run history — visibility and governance at last.'],
            ['Product teams', 'Releases stop waiting on documentation. They ship together.'],
            ['Enterprises', 'Consistent, standards-grade quality across every team and repo.'],
            ['Your customers', 'Accurate answers — from your docs, your site, and their AI assistant.']].map(([t, d], i) => (
            <Reveal key={t} delay={i * 90}>
              <div className="tile valtile" style={{ padding: 24, height: '100%' }}>
                <p className="h02">{t}</p>
                <p className="body01 t2 mt3">{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Metrics band */}
      <section className="metricband">
        <div className="page" style={{ padding: '0 24px' }}>
          <Reveal>
            <div className="grid3">
              <div><p className="metricnum"><CountUp to={2.1} decimals={1} suffix=" hrs" /></p><p className="body01 t2 mt3">Average writer time saved per generated document, measured across pilot teams.</p></div>
              <div><p className="metricnum"><CountUp to={46} suffix=" pts" /></p><p className="body01 t2 mt3">Median AI citation-probability lift after applying the judge&apos;s fixes — measured across ChatGPT, Claude, and Gemini estimates.</p></div>
              <div><p className="metricnum">0</p><p className="body01 t2 mt3">Broken links shipped by teams using the quality gate on merge. The pipeline blocks them.</p></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Integrations */}
      <div className="page" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <Reveal>
          <h2 className="feathead">Every documentation source, every output format</h2>
          <p className="lead t2 mt3">No partial matrices, no asterisks. Supported means fully supported.</p>
          <table className="matrix mt6">
            <thead>
              <tr><th>SOURCE</th>{FMTS.map((f) => <th key={f}>{f}</th>)}</tr>
            </thead>
            <tbody>
              {SRCS.map((s, r) => (
                <tr key={s}>
                  <td>{s}</td>
                  {FMTS.map((f, c) => (
                    <td key={f}>
                      <span className="check checkpop" style={{ animationDelay: ((r * FMTS.length + c) * 70) + 'ms' }}>✓</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row mt5" style={{ flexWrap: 'wrap' }}>
            <span className="helper">Plus HTML, DocBook, and ePub outputs · Coming soon:</span>
            <div className="soonchips">
              <span className="tag tag--gray">Azure DevOps</span>
            </div>
          </div>
        </Reveal>
      </div>

      {/* Testimonials */}
      <div className="page" style={{ paddingTop: 0, paddingBottom: 96 }}>
        <Reveal>
          <h2 className="feathead mb6">Measured in hours returned to writing teams</h2>
        </Reveal>
        <div className="grid3" style={{ alignItems: 'stretch' }}>
          {QUOTES.map((x, i) => (
            <Reveal key={x.s} delay={i * 140}>
              <div className="tile tile--white quotecard" style={{ padding: 24, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <span className="tag tag--teal">{x.s}</span>
                <p className="body01 mt5" style={{ flex: 1 }}>&ldquo;{x.q}&rdquo;</p>
                <p className="h01 mt6">{x.n}</p>
                <p className="helper mt2">{x.c}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* FAQ — answers the questions buyers and search engines ask */}
      <div className="page" style={{ paddingTop: 0, paddingBottom: 96 }}>
        <Reveal>
          <p className="eyebrow eyebrow--blue mb3">FREQUENTLY ASKED QUESTIONS</p>
          <h2 className="feathead mb6">AI documentation, automated — common questions</h2>
          <div className="faqlist">
            {FAQS.map((f) => <FaqItem key={f.q} q={f.q} a={f.a} />)}
          </div>
        </Reveal>
      </div>

      {/* Final CTA */}
      <section className="ctaband">
        <div style={{ maxWidth: 1056, margin: '0 auto', padding: '0 24px' }}>
          <Reveal>
            <p className="eyebrow mb3">SECTION 09 · START</p>
            <h2 className="h04" style={{ color: '#fff', maxWidth: 640 }}>Your code already tells the story. Let DocGen turn it into documentation.</h2>
            <div className="row mt6" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn--primary" onClick={() => nav('/signup')}>Start generating documentation<span className="ico">→</span></button>
              <button className="btn btn--ghostdark" onClick={() => { const el = document.getElementById('film-automation'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }}>Watch product demo</button>
              <button className="btn btn--ghostdark" onClick={() => { const el = document.getElementById('film-ai'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }}>Explore AI compatibility</button>
              <button className="btn btn--ghostdark" onClick={() => nav('/source')}>Connect your repository</button>
            </div>
          </Reveal>
        </div>
      </section>
      {/* Footer */}
      <footer className="sitefoot">
        <div className="sitefoot-grid">
          <div className="sitefoot-brand">
            <div className="row" style={{ gap: 8 }}>
              <LogoMark size={22} />
              <span className="logotext">Doc<span className="logogen">Gen</span></span>
            </div>
            <p className="helper mt3" style={{ lineHeight: 1.6 }}>
              AI documentation intelligence: generate standards-grade docs from your code,
              verify them with an LLM judge, and know how ChatGPT, Claude, and Gemini
              will rank them — before you publish.
            </p>
            <p className="helper mt3">
              Support: <a href={supportMailto()}>{SUPPORT_EMAIL}</a>
            </p>
          </div>
          <nav className="sitefoot-col" aria-label="Product">
            <h3>Product</h3>
            <a onClick={() => nav('/pricing')}>Pricing</a>
            <a onClick={() => nav('/automation')}>Automation pipelines</a>
            <a onClick={() => nav('/docs/output-formats')}>Output formats</a>
            <a onClick={() => nav('/signup')}>Start free</a>
          </nav>
          <nav className="sitefoot-col" aria-label="Resources">
            <h3>Resources</h3>
            <a onClick={() => nav('/docs')}>Documentation</a>
            <a onClick={() => nav('/docs/llm-as-a-judge')}>LLM-as-a-Judge scoring</a>
            <a onClick={() => nav('/docs/chatgpt-ranking-analysis')}>ChatGPT ranking analysis</a>
            <a onClick={() => nav('/help')}>Help center</a>
            <a onClick={() => nav('/contact')}>Contact us</a>
          </nav>
          <nav className="sitefoot-col" aria-label="Legal">
            <h3>Legal</h3>
            <a onClick={() => nav('/legal/privacy')}>Privacy policy</a>
            <a onClick={() => nav('/legal/terms')}>Terms of service</a>
            <a onClick={() => nav('/legal/security')}>Security</a>
          </nav>
        </div>
        <div className="sitefoot-inner">
          <span className="helper">© {new Date().getFullYear()} DocGen · AI documentation intelligence</span>
          <nav className="sitefoot-links" aria-label="Footer shortcuts">
            <a onClick={() => nav('/docs')}>Docs</a>
            <a onClick={() => nav('/pricing')}>Pricing</a>
            <a onClick={() => nav('/legal/security')}>Security</a>
          </nav>
        </div>
      </footer>
    </>
  );
}
