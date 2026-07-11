import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogoMark } from '../ui.jsx';
import { usePageMeta } from '../seo.js';
import { SUPPORT_EMAIL, supportMailto } from '../config.js';
import { AutomationDemo, AICompatDemo, GenerateDemo } from './demos.jsx';

/* ---------- Scroll-reveal wrapper ---------- */
/* Thin series meter: which of the three product videos this section is —
   quiet, professional, no numbering shouted in text. */
function SeriesMeter({ step }) {
  return (
    <div className="filmmeter" aria-label={'Video ' + step + ' of 3'}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={'filmmeter-seg' + (i === step ? ' on' : i < step ? ' done' : '')} />
      ))}
      <span className="filmmeter-label mono">{step} / 3</span>
    </div>
  );
}

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

/* ---------- Page data ---------- */

const FEATURES = [
  {
    eyebrow: 'CONNECT YOUR TOOLS', title: 'It starts where your truth already lives',
    body: 'One authorization — the same grant that signs you in. Docify reads your repository the way your best writer would: structure, comments, commit history, API annotations. Read-only, never stored, nothing to configure.',
    illu: <IlluSource />
  },
  {
    eyebrow: 'GENERATE', title: 'Every commit becomes a draft',
    body: 'Not a template with blanks — a real document, drafted from what the code actually says and rebuilt when it changes. Eleven document types, each held to an open standard — Diátaxis, OpenAPI 3.1, Keep a Changelog — in DITA, PDF, Word, HTML, or Markdown.',
    illu: <IlluGenerate />
  },
  {
    eyebrow: 'VALIDATE QUALITY', title: 'Then comes the cross-examination',
    body: 'Before anything ships, an AI judge reads every section the way a machine will. Does the title match real queries? Does each passage stand alone? Is there an example where a reader expects one? Every finding arrives with a one-click fix — and a projected score gain.',
    illu: <IlluVerify />
  },
  {
    eyebrow: 'AI DISCOVERY', title: 'Know where you will rank — before you publish',
    body: 'This is the part nobody else shows you. Docify models how ChatGPT, Claude, and Google Gemini each weigh your content — metadata, links, readability, completeness — and puts a number on your chance of being retrieved and cited. Apply the fixes and watch the number climb.',
    illu: <IlluRank />
  },
  {
    eyebrow: 'ALWAYS CURRENT', title: 'And then you never do this again',
    body: 'Build a pipeline once: repository, branch, triggers, documents, AI thresholds, publishing. Every push, merged pull request, feature change, bug fix, and configuration update then flows into the documentation automatically — placed into your existing documents at the best-matching section, never as a duplicate. The release and its documentation ship together.',
    illu: <IlluAutomate />,
    cta: ['Build your pipeline', '/automation']
  }
];

const SRCS = ['GitHub', 'GitLab', 'Bitbucket', 'Jira', 'Confluence', 'Notion', 'OpenAPI'];
const FMTS = ['DITA', 'PDF', 'Word', 'Markdown'];

/* FAQ content — mirrored in server/src/seo-meta.js as FAQPage JSON-LD.
   Keep the two in sync when editing. */
export const FAQS = [
  {
    q: 'What is Docify?',
    a: 'Docify is an AI documentation generator that turns your GitHub, GitLab, or Bitbucket repository into standards-grade technical documentation — API references, user guides, release notes, and more — exported to DITA, PDF, Word, HTML, or Markdown. Every document is scored by an AI quality judge before you publish.'
  },
  {
    q: 'How does the AI quality scoring work?',
    a: 'Every generated document is reviewed by an LLM judge across six weighted dimensions: style, consistency, completeness, readability, LLM readiness, and link integrity. Each finding ships with a one-click fix and a declared score gain, and a quality gate (85 by default) blocks anything below your bar.'
  },
  {
    q: 'What is AI ranking prediction?',
    a: 'Before you publish, Docify models how ChatGPT, Claude, and Google Gemini each weigh your content — metadata, structure, readability, completeness — and estimates the probability that each platform will retrieve and cite your page. The estimate is recomputed live as you apply fixes.'
  },
  {
    q: 'Is my source code stored?',
    a: 'No. Docify reads your repository through a read-only grant, generates documentation from code structure, comments, and commit history, and never stores your source code. You can revoke access at any time.'
  },
  {
    q: 'Can documentation update automatically on every merge?',
    a: 'Yes. Automation pipelines regenerate documentation on every merge via webhook, re-score it with the AI judge, update the AI ranking outlook, and hold anything below the quality gate for review — so the release and its documentation ship together.'
  },
  {
    q: 'Who is Docify built for?',
    a: 'Developer platform teams, technical writers, product managers, and documentation teams at startups and enterprises — anyone who needs accurate, AI-ready developer documentation without the manual upkeep.'
  }
];

/* ---- Sticky page-journey navigation (IBM-style table of contents) ----
   Desktop ≥1400px: dot + label rail pinned left. 1080–1399px: dot rail,
   labels on hover. <1080px: sticky horizontal chip bar under the topbar.
   Active section is computed from scroll position (deterministic, cheap). */
const NAV_SECTIONS = [
  ['overview', 'Overview'],
  ['how-it-works', 'How it works'],
  ['connect', 'Connect sources'],
  ['generate', 'Generate docs'],
  ['quality', 'Quality gate'],
  ['ai-readiness', 'AI readiness'],
  ['teams', 'For your team'],
  ['trust', 'Trust & security'],
  ['faq', 'FAQ'],
  ['start', 'Get started']
];

function PageNav() {
  const [active, setActive] = useState('overview');
  const barRef = useRef(null);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const mark = window.scrollY + window.innerHeight * 0.35;
        let cur = NAV_SECTIONS[0][0];
        for (const [id] of NAV_SECTIONS) {
          const el = document.getElementById(id);
          if (el && el.offsetTop <= mark) cur = id;
        }
        // Bottom of page: force the last section active.
        if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 8) {
          cur = NAV_SECTIONS[NAV_SECTIONS.length - 1][0];
        }
        setActive(cur);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);
  // Keep the active chip visible in the mobile bar without moving the page.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const chip = bar.querySelector('.pagenav-mchip.on');
    if (chip) bar.scrollTo({ left: chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2, behavior: 'smooth' });
  }, [active]);
  const go = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <nav className="pagenav-m" aria-label="Page sections" ref={barRef}>
      {NAV_SECTIONS.map(([id, label]) => (
        <button key={id} type="button" className={'pagenav-mchip' + (active === id ? ' on' : '')}
          aria-current={active === id ? 'true' : undefined} onClick={() => go(id)}>{label}</button>
      ))}
    </nav>
  );
}

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
    title: 'Docify — Automated AI Documentation Generator with Quality & AI Search Readiness Scores',
    description: 'Docify automates technical documentation end to end: connect GitHub, GitLab, or Bitbucket and every merge updates your docs automatically, validated by an AI quality judge and scored for AI search readiness across ChatGPT, Claude, Gemini, and Copilot.',
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
      <PageNav />
      {/* Hero */}
      <section className="heroband">
        <div className="gridlines" />
        <div className="heroinner">
          <div>
            <p className="eyebrow mb3">DOCIFY · AI DOCUMENTATION INTELLIGENCE</p>
            <h1 className="display">Documentation that AI understands, trusts, and ranks.</h1>
            <p className="lead t2 mt5" style={{ maxWidth: 560 }}>
              Docify turns your code commits into standards-grade documentation, cross-examines every
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
      <div className="page" id="overview" style={{ paddingTop: 72, paddingBottom: 0 }}>
        <Reveal>
          <p className="eyebrow eyebrow--blue mb3">THE STORY EVERY TEAM KNOWS</p>
          <h2 className="feathead" style={{ maxWidth: 720 }}>Your next customer will never read your docs. Their AI assistant will.</h2>
          <p className="lead t2 mt5" style={{ maxWidth: 640 }}>
            Right now, a developer is asking ChatGPT how to integrate a payments API. The
            assistant answers — and recommends — whichever product&rsquo;s docs it can find and trust.
            Meanwhile your quick start still 404s, and your guide shows a screen you redesigned
            two sprints ago.
          </p>
          <div className="relief mt6">
            <p className="relief-main">Docify closes that gap — <span className="relief-blue">permanently.</span></p>
            <p className="relief-sub">See the complete workflow, in thirty seconds <span className="relief-arrow" aria-hidden="true">↓</span></p>
          </div>
        </Reveal>
        {/* What is Docify — one crisp, quotable definition */}
        <Reveal delay={100}>
          <div className="defblock mt7">
            <p className="label01 t2 mb3">WHAT IS DOCIFY?</p>
            <p className="deftext">
              Docify is an AI documentation platform. Connect GitHub, GitLab, Bitbucket, Jira, or an
              OpenAPI spec — it writes standards-grade documentation from your real source, updates the
              affected sections on every merge, blocks anything that fails its quality gate, and scores
              how likely ChatGPT, Claude, and Gemini are to find and cite every page.
            </p>
          </div>
        </Reveal>
      </div>


      {/* SECTION 2 · Meet Docify — Film 1: complete automation */}
      <div className="page" id="how-it-works" style={{ paddingTop: 40, paddingBottom: 32 }}>
        <div id="film-automation" />
        <Reveal>
          <SeriesMeter step={1} />
          <p className="eyebrow eyebrow--blue mb3">HOW IT WORKS</p>
          <h2 className="feathead">Your code changes. Your documentation updates automatically.</h2>
          <p className="lead t2 mt3" style={{ maxWidth: 640 }}>
            Docify closes the loop between your code and your published docs — generate, validate,
            optimise for AI, publish. Thirty seconds: a pull request merges, verified documentation
            ships. Press play.
          </p>
          <ol className="flowsteps" aria-label="Workflow after a merge">
            {[['1', 'Merge lands', 'Webhook fires on push or merged PR'],
              ['2', 'Sections rewritten', 'Only the affected sections — never a duplicate file'],
              ['3', 'Judge gates it', 'An LLM judge scores quality; failures are held, not shipped'],
              ['4', 'Published & scored', 'Live docs plus an AI-readiness score per page']].map(([n, t, d]) => (
              <li key={n} className="flowstep">
                <span className="flowstep-n mono">{n}</span>
                <span><strong>{t}</strong><br /><span className="t2">{d}</span></span>
              </li>
            ))}
          </ol>
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
      <div className="page featlist" id="connect" style={{ paddingTop: 8, paddingBottom: 0 }}>
        {chapter(0)}
      </div>

      {/* SECTION 4 · Generate + Film 3: standard workflow */}
      <div className="page featlist" id="generate" style={{ paddingTop: 0, paddingBottom: 0 }}>
        {chapter(1)}
      </div>
      <div className="page" id="film-generate" style={{ paddingTop: 24, paddingBottom: 32 }}>
        <Reveal>
          <SeriesMeter step={2} />
          <p className="eyebrow eyebrow--blue mb3">GENERATE ON DEMAND</p>
          <h2 className="feathead">Complex technical input → professional documentation, in minutes</h2>
          <p className="lead t2 mt3" style={{ maxWidth: 640 }}>
            Pick a source, a document type, and a format — Docify writes it, verifies it, and
            exports it. Thirty seconds, start to finish.
          </p>
        </Reveal>
        <Reveal delay={120}><div className="vidwrap"><GenerateDemo /></div></Reveal>
      </div>

      {/* SECTION 6 · Validate quality */}
      <div className="page featlist" id="quality" style={{ paddingTop: 0, paddingBottom: 0 }}>
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
      <div className="page featlist" id="ai-readiness" style={{ paddingTop: 0, paddingBottom: 0 }}>
        {chapter(3)}
      </div>
      <div className="page" id="film-ai" style={{ paddingTop: 24, paddingBottom: 32 }}>
        <Reveal>
          <SeriesMeter step={3} />
          <p className="eyebrow eyebrow--blue mb3">AI READINESS</p>
          <h2 className="feathead">Documentation people understand — and AI systems trust</h2>
          <p className="lead t2 mt3" style={{ maxWidth: 640 }}>
            Your docs were written for people. This film shows the AI Readiness Score — what
            machines actually weigh, and the exact fixes that take one document from 62 to 91.
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

      {/* Chapter 5 · Always current — the automation payoff */}
      <div className="page featlist" style={{ paddingTop: 0, paddingBottom: 56 }}>
        {chapter(4)}
      </div>

      {/* SECTION 8 · Value for every team */}
      <div className="page" id="teams" style={{ paddingTop: 24, paddingBottom: 56 }}>
        <Reveal>
          <p className="eyebrow eyebrow--blue mb3">WHAT EACH TEAM GETS</p>
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
              <div><p className="metricnum"><CountUp to={30} suffix=" sec" /></p><p className="body01 t2 mt3">From merged pull request to an updated, quality-gated document — the whole loop, shown in the film above.</p></div>
              <div><p className="metricnum"><CountUp to={5} suffix=" formats" /></p><p className="body01 t2 mt3">DITA, PDF, Word, HTML, and Markdown from one generation — every format previewed and exported separately.</p></div>
              <div><p className="metricnum">0</p><p className="body01 t2 mt3">Broken links shipped with the quality gate on — documents below the bar are blocked, not published.</p></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Integrations */}
      <div className="page" id="integrations" style={{ paddingTop: 88, paddingBottom: 88 }}>
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

      {/* Trust & security — why it's safe to connect your source */}
      <div className="page" id="trust" style={{ paddingTop: 0, paddingBottom: 80 }}>
        <Reveal>
          <p className="eyebrow eyebrow--blue mb3">TRUST &amp; SECURITY</p>
          <h2 className="feathead mb5">Built to be trusted with your source</h2>
          <div className="trustgrid">
            {[['Read-only access', 'OAuth scopes limited to reading repository contents and commit history — Docify can never write to your code.'],
              ['Code never stored', 'Files are read at generation time, used to write the document, and discarded. Your source is not our database.'],
              ['You approve every change', 'Doc sync queues each AI rewrite as a side-by-side diff with reasoning — nothing publishes until you approve, and every approval is versioned.'],
              ['Broken docs are blocked', 'The quality gate holds any document that fails its checks. Below the bar means not published — automatically.']].map(([t, d], i) => (
              <Reveal key={t} delay={i * 80}>
                <div className="trusttile">
                  <p className="h01">{t}</p>
                  <p className="body01 t2 mt3">{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Reveal>
      </div>

      {/* FAQ — answers the questions buyers and search engines ask */}
      <div className="page" id="faq" style={{ paddingTop: 0, paddingBottom: 96 }}>
        <Reveal>
          <p className="eyebrow eyebrow--blue mb3">FREQUENTLY ASKED QUESTIONS</p>
          <h2 className="feathead mb6">AI documentation, automated — common questions</h2>
          <div className="faqlist">
            {FAQS.map((f) => <FaqItem key={f.q} q={f.q} a={f.a} />)}
          </div>
        </Reveal>
      </div>

      {/* Final CTA */}
      <section className="ctaband" id="start">
        <div style={{ maxWidth: 1056, margin: '0 auto', padding: '0 24px' }}>
          <Reveal>
            <p className="eyebrow mb3">START TODAY</p>
            <h2 className="h04" style={{ color: '#fff', maxWidth: 640 }}>Your code already tells the story. Let Docify turn it into documentation.</h2>
            <div className="row mt6" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn--primary" onClick={() => nav('/signup')}>Start generating documentation<span className="ico">→</span></button>
              <button className="btn btn--ghostdark" onClick={() => { const el = document.getElementById('film-automation'); if (el) el.scrollIntoView(); }}>Watch product demo</button>
              <button className="btn btn--ghostdark" onClick={() => { const el = document.getElementById('film-ai'); if (el) el.scrollIntoView(); }}>Explore AI compatibility</button>
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
            <a onClick={() => nav('/status')}>System status</a>
          </nav>
        </div>
        <div className="sitefoot-inner">
          <span className="helper">© {new Date().getFullYear()} Docify · AI documentation intelligence</span>
          <nav className="sitefoot-links" aria-label="Footer shortcuts">
            <a onClick={() => nav('/docs')}>Docs</a>
            <a onClick={() => nav('/pricing')}>Pricing</a>
            <a onClick={() => nav('/legal/security')}>Security</a>
            <a onClick={() => nav('/status')}>Status</a>
          </nav>
        </div>
      </footer>
    </>
  );
}
