import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogoMark } from '../ui.jsx';
import { usePageMeta } from '../seo.js';
import { SUPPORT_EMAIL, supportMailto } from '../config.js';
import { AutomationDemo, AICompatDemo, GenerateDemo } from './demos.jsx';

/* ---------- Series meter: which of the three product demo films this is ---------- */
function SeriesMeter({ step }) {
  return (
    <div className="filmmeter" aria-label={'Product film ' + step + ' of 3'}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={'filmmeter-seg' + (i === step ? ' on' : i < step ? ' done' : '')} />
      ))}
      <span className="filmmeter-label mono">{step} / 3</span>
    </div>
  );
}

/* ---------- Scroll-reveal wrapper (respects reduced-motion via CSS) ---------- */
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

/* ===================================================================
   Illustrations — geometric, enterprise, drawn from the real product UI
   =================================================================== */

function HeroVisual() {
  return (
    <svg className="illus herovis" viewBox="0 0 480 360" fill="none" aria-hidden="true">
      <line className="hv-rail" x1="40" y1="60" x2="40" y2="300" stroke="#393939" strokeWidth="2" />
      <circle className="pulse" cx="40" cy="70" r="7" fill="#0f62fe" />
      <circle className="pulse pd2" cx="40" cy="180" r="7" fill="#4589ff" />
      <circle className="pulse pd3" cx="40" cy="290" r="7" fill="#42be65" />
      <line className="flowline" x1="47" y1="70" x2="96" y2="70" stroke="#393939" strokeWidth="2" strokeDasharray="4 4" />
      <line className="flowline" x1="47" y1="180" x2="96" y2="180" stroke="#393939" strokeWidth="2" strokeDasharray="4 4" />
      <line className="flowline" x1="47" y1="290" x2="96" y2="290" stroke="#393939" strokeWidth="2" strokeDasharray="4 4" />
      <g className="hv-card">
        <rect x="96" y="42" width="150" height="56" fill="#262626" stroke="#393939" strokeWidth="1.5" />
        <rect x="112" y="58" width="16" height="16" fill="#0f62fe" />
        <rect x="138" y="58" width="92" height="6" fill="#525252" />
        <rect x="138" y="72" width="60" height="6" fill="#393939" />
      </g>
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
      <g className="pop">
        <g className="floaty">
          <rect x="296" y="106" width="128" height="64" fill="#161616" stroke="#42be65" strokeWidth="2" />
          <text x="312" y="134" fill="#42be65" fontFamily="IBM Plex Mono, monospace" fontSize="22">98/100</text>
          <text x="312" y="154" fill="#8d8d8d" fontFamily="IBM Plex Sans, sans-serif" fontSize="11">quality gate passed</text>
        </g>
      </g>
      {/* AI search-readiness card — honest signal, not a ranking guarantee */}
      <g className="pop">
        <rect x="344" y="192" width="128" height="96" fill="#161616" stroke="#0f62fe" strokeWidth="2" />
        <text x="356" y="210" fill="#78a9ff" fontFamily="IBM Plex Mono, monospace" fontSize="8" letterSpacing="1">SEARCH READINESS</text>
        {[['ChatGPT', 94, 224], ['Claude', 97, 248], ['Gemini', 84, 272]].map(([n, p, y], i) => (
          <g key={n}>
            <text x="356" y={y} fill="#c6c6c6" fontFamily="IBM Plex Sans, sans-serif" fontSize="10">{n}</text>
            <rect x="404" y={y - 8} width="40" height="5" fill="#393939" />
            <rect className="hv-line" style={{ animationDelay: (1.2 + i * 0.25) + 's' }} x="404" y={y - 8} width={40 * p / 100} height="5" fill={p >= 90 ? '#42be65' : '#4589ff'} />
            <text x="450" y={y} fill="#f4f4f4" fontFamily="IBM Plex Mono, monospace" fontSize="9">{p}%</text>
          </g>
        ))}
      </g>
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
    <svg className="illus" viewBox="0 0 400 260" fill="none" aria-hidden="true" role="img" aria-label="Central repository connections across GitHub, GitLab, and Bitbucket, read-only">
      <rect x="24" y="26" width="168" height="46" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1.5" />
      <rect x="40" y="40" width="18" height="18" fill="#161616" />
      <rect className="hgrow" x="66" y="42" width="96" height="6" fill="#c6c6c6" />
      <rect className="hgrow" x="66" y="56" width="60" height="6" fill="#e0e0e0" />
      <rect x="24" y="82" width="168" height="46" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1.5" />
      <rect x="40" y="96" width="18" height="18" fill="#fc6d26" />
      <rect className="hgrow" x="66" y="98" width="96" height="6" fill="#c6c6c6" />
      <rect className="hgrow" x="66" y="112" width="72" height="6" fill="#e0e0e0" />
      <rect x="24" y="138" width="168" height="46" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1.5" />
      <rect x="40" y="152" width="18" height="18" fill="#0052cc" />
      <rect className="hgrow" x="66" y="154" width="96" height="6" fill="#c6c6c6" />
      <rect className="hgrow" x="66" y="168" width="54" height="6" fill="#e0e0e0" />
      <rect x="24" y="196" width="168" height="40" fill="#f4f4f4" />
      <text x="40" y="221" fill="#525252" fontFamily="IBM Plex Mono, monospace" fontSize="11">7 sources · read-only</text>
      <path className="flowline" d="M192 105 h40 v0 h48" stroke="#0f62fe" strokeWidth="2" strokeDasharray="6 4" />
      <circle className="pulse" cx="280" cy="105" r="5" fill="#0f62fe" />
      <rect className="lockpulse" x="288" y="60" width="88" height="64" fill="#ffffff" stroke="#0f62fe" strokeWidth="2" />
      <rect x="316" y="84" width="32" height="26" fill="#edf5ff" stroke="#0f62fe" strokeWidth="2" />
      <path d="M322 84v-8a10 10 0 0 1 20 0v8" stroke="#0f62fe" strokeWidth="2" fill="none" />
      <text x="286" y="150" fill="#525252" fontFamily="IBM Plex Mono, monospace" fontSize="11">central catalogue</text>
      <rect x="288" y="166" width="88" height="40" fill="#f4f4f4" />
      <rect className="hgrow" x="300" y="180" width="64" height="6" fill="#c6c6c6" />
      <rect className="hgrow" x="300" y="192" width="44" height="6" fill="#e0e0e0" />
    </svg>
  );
}

function IlluGenerate() {
  return (
    <svg className="illus" viewBox="0 0 400 260" fill="none" aria-hidden="true" role="img" aria-label="Source content generated into a formatted document">
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
    <svg className="illus" viewBox="0 0 400 260" fill="none" aria-hidden="true" role="img" aria-label="AI quality review with an overall score and one-click fixes">
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

/* AI search-readiness — modeled signal per assistant, not a ranking promise */
function IlluReadiness() {
  const rows = [['ChatGPT', 94, '#24a148'], ['Claude', 97, '#24a148'], ['Gemini', 84, '#0f62fe']];
  return (
    <svg className="illus" viewBox="0 0 400 260" fill="none" aria-hidden="true" role="img" aria-label="Modeled AI search-readiness per assistant, recomputed on every fix">
      <rect x="24" y="28" width="352" height="204" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1.5" />
      <text x="48" y="60" fill="#0043ce" fontFamily="IBM Plex Mono, monospace" fontSize="11" letterSpacing="2">AI SEARCH READINESS</text>
      <text x="48" y="80" fill="#525252" fontFamily="IBM Plex Sans, sans-serif" fontSize="10">modeled from structure, metadata, clarity &amp; completeness · recomputed on every fix</text>
      {rows.map(([n, p, c], i) => (
        <g key={n}>
          <text x="48" y={116 + i * 38} fill="#161616" fontFamily="IBM Plex Sans, sans-serif" fontSize="13">{n}</text>
          <rect x="130" y={106 + i * 38} width="180" height="8" fill="#e0e0e0" />
          <rect className="hv-line" style={{ animationDelay: (0.4 + i * 0.35) + 's' }}
            x="130" y={106 + i * 38} width={180 * p / 100} height="8" fill={c} />
          <text x="322" y={116 + i * 38} fill="#161616" fontFamily="IBM Plex Mono, monospace" fontSize="14">{p}%</text>
        </g>
      ))}
      <rect x="48" y="196" width="176" height="22" fill="#defbe6" />
      <text x="58" y="211" fill="#0e6027" fontFamily="IBM Plex Mono, monospace" fontSize="10">readiness improves after fixes</text>
    </svg>
  );
}

function IlluAutomate() {
  return (
    <svg className="illus" viewBox="0 0 400 260" fill="none" aria-hidden="true" role="img" aria-label="A merge triggers a documentation run held by a quality gate">
      <circle className="pulse" cx="60" cy="70" r="10" fill="#0f62fe" />
      <circle cx="60" cy="190" r="10" fill="#8d8d8d" />
      <path d="M60 80v40a40 40 0 0 0 40 40h20" stroke="#8d8d8d" strokeWidth="2.5" fill="none" />
      <path d="M60 180v-20" stroke="#8d8d8d" strokeWidth="2.5" />
      <text x="82" y="66" fill="#525252" fontFamily="IBM Plex Mono, monospace" fontSize="11">merge → main</text>
      <rect x="130" y="140" width="120" height="44" fill="#161616" />
      <text x="146" y="166" fill="#ffffff" fontFamily="IBM Plex Mono, monospace" fontSize="11">docify run</text>
      <path className="slidearrow" d="M250 162h44" stroke="#0f62fe" strokeWidth="2.5" />
      <rect x="294" y="134" width="82" height="56" fill="#ffffff" stroke="#24a148" strokeWidth="2" />
      <path className="gatecheck" d="M312 162l10 10 20-20" stroke="#24a148" strokeWidth="3" fill="none" />
      <text x="298" y="206" fill="#525252" fontFamily="IBM Plex Mono, monospace" fontSize="10">quality gate</text>
      <path className="flowline" d="M335 134V96a26 26 0 0 0-26-26H92" stroke="#c6c6c6" strokeWidth="2" strokeDasharray="6 4" fill="none" />
      <path d="M100 62l-10 8 10 8" stroke="#c6c6c6" strokeWidth="2" fill="none" />
    </svg>
  );
}

/* Human review — proposed change with accept / reject, inline diff */
function IlluReview() {
  return (
    <svg className="illus" viewBox="0 0 400 260" fill="none" aria-hidden="true" role="img" aria-label="A proposed change shown as an inline diff with accept and reject">
      <rect x="24" y="28" width="352" height="204" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1.5" />
      <rect x="24" y="28" width="352" height="30" fill="#f4f4f4" />
      <rect x="42" y="38" width="66" height="12" rx="6" fill="#fcf4d6" stroke="#8e6a00" />
      <text x="52" y="47" fill="#8e6a00" fontFamily="IBM Plex Sans, sans-serif" fontSize="8">Proposed</text>
      <rect x="118" y="38" width="120" height="10" fill="#c6c6c6" />
      <rect x="42" y="78" width="316" height="24" fill="#fff1f1" />
      <text x="52" y="94" fill="#a2191f" fontFamily="IBM Plex Mono, monospace" fontSize="11">- API reference</text>
      <rect x="42" y="108" width="316" height="24" fill="#defbe6" />
      <text x="52" y="124" fill="#0e6027" fontFamily="IBM Plex Mono, monospace" fontSize="11">+ API reference — endpoints &amp; auth</text>
      <rect className="fixchip" x="42" y="150" width="70" height="26" fill="#24a148" />
      <text x="58" y="167" fill="#ffffff" fontFamily="IBM Plex Sans, sans-serif" fontSize="11">Accept</text>
      <rect x="120" y="150" width="66" height="26" fill="#ffffff" stroke="#e0e0e0" />
      <text x="134" y="167" fill="#161616" fontFamily="IBM Plex Sans, sans-serif" fontSize="11">Reject</text>
      <rect x="194" y="150" width="70" height="26" fill="#ffffff" stroke="#e0e0e0" />
      <text x="208" y="167" fill="#161616" fontFamily="IBM Plex Sans, sans-serif" fontSize="11">Rewrite</text>
      <rect x="272" y="150" width="60" height="26" fill="#ffffff" stroke="#e0e0e0" />
      <text x="284" y="167" fill="#161616" fontFamily="IBM Plex Sans, sans-serif" fontSize="11">Edit</text>
      <text x="42" y="204" fill="#525252" fontFamily="IBM Plex Sans, sans-serif" fontSize="11">Inline &amp; side-by-side · comments · request changes · approve</text>
    </svg>
  );
}

/* Standardize — select any span, rewrite to one house style */
function IlluStandardize() {
  return (
    <svg className="illus" viewBox="0 0 400 260" fill="none" aria-hidden="true" role="img" aria-label="Selecting text and rewriting it to a chosen style guide">
      <rect x="24" y="28" width="220" height="204" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1.5" />
      <rect x="44" y="52" width="120" height="9" fill="#161616" />
      <rect x="44" y="76" width="176" height="6" fill="#c6c6c6" />
      <rect x="44" y="90" width="150" height="6" fill="#c6c6c6" />
      <rect x="44" y="112" width="176" height="18" fill="#d0e2ff" />
      <rect x="44" y="116" width="140" height="10" fill="#0f62fe" opacity="0.35" />
      <rect x="44" y="144" width="160" height="6" fill="#c6c6c6" />
      <rect x="44" y="158" width="176" height="6" fill="#c6c6c6" />
      <rect x="44" y="180" width="120" height="6" fill="#c6c6c6" />
      <rect className="floaty" x="150" y="126" width="128" height="70" fill="#161616" />
      <text x="164" y="148" fill="#78a9ff" fontFamily="IBM Plex Mono, monospace" fontSize="8">REWRITE</text>
      <text x="164" y="166" fill="#f4f4f4" fontFamily="IBM Plex Sans, sans-serif" fontSize="10">Improve clarity</text>
      <text x="164" y="182" fill="#f4f4f4" fontFamily="IBM Plex Sans, sans-serif" fontSize="10">Apply style guide</text>
      <rect x="284" y="40" width="92" height="26" fill="#f4f4f4" />
      <text x="296" y="57" fill="#525252" fontFamily="IBM Plex Mono, monospace" fontSize="10">Microsoft</text>
      <rect x="284" y="74" width="92" height="26" fill="#f4f4f4" />
      <text x="296" y="91" fill="#525252" fontFamily="IBM Plex Mono, monospace" fontSize="10">Google</text>
      <rect x="284" y="108" width="92" height="26" fill="#edf5ff" stroke="#0f62fe" />
      <text x="296" y="125" fill="#0f62fe" fontFamily="IBM Plex Mono, monospace" fontSize="10">Docify</text>
      <rect x="284" y="142" width="92" height="26" fill="#f4f4f4" />
      <text x="296" y="159" fill="#525252" fontFamily="IBM Plex Mono, monospace" fontSize="10">Custom</text>
    </svg>
  );
}

/* Management reporting — AI Quality Report exported to PDF / HTML / PPTX */
function IlluReport() {
  return (
    <svg className="illus" viewBox="0 0 400 260" fill="none" aria-hidden="true" role="img" aria-label="AI Quality Report exported to PDF, HTML, and PowerPoint">
      <rect x="70" y="24" width="180" height="212" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1.5" />
      <rect x="70" y="24" width="180" height="8" fill="#0f62fe" />
      <text x="90" y="60" fill="#0f62fe" fontFamily="IBM Plex Sans, sans-serif" fontSize="13" fontWeight="700">Docify</text>
      <text x="90" y="76" fill="#525252" fontFamily="IBM Plex Mono, monospace" fontSize="8" letterSpacing="1">AI QUALITY REPORT</text>
      <rect x="90" y="92" width="140" height="9" fill="#161616" />
      <rect x="90" y="106" width="96" height="6" fill="#c6c6c6" />
      <rect x="90" y="128" width="140" height="30" fill="#f4f4f4" />
      <circle cx="112" cy="143" r="13" stroke="#24a148" strokeWidth="4" fill="none" />
      <text x="105" y="147" fill="#24a148" fontFamily="IBM Plex Mono, monospace" fontSize="10">92</text>
      <text x="134" y="141" fill="#24a148" fontFamily="IBM Plex Sans, sans-serif" fontSize="10" fontWeight="700">Publish-ready</text>
      <rect x="90" y="170" width="60" height="7" fill="#24a148" />
      <rect x="90" y="182" width="140" height="5" fill="#e0e0e0" />
      <rect x="90" y="192" width="120" height="5" fill="#e0e0e0" />
      <rect x="90" y="202" width="132" height="5" fill="#e0e0e0" />
      <rect className="pop" x="276" y="60" width="96" height="30" fill="#ffffff" stroke="#e0e0e0" />
      <rect x="288" y="70" width="12" height="10" fill="#da1e28" /><text x="306" y="79" fill="#161616" fontFamily="IBM Plex Sans, sans-serif" fontSize="11">PDF</text>
      <rect className="pop" x="276" y="102" width="96" height="30" fill="#ffffff" stroke="#e0e0e0" />
      <rect x="288" y="112" width="12" height="10" fill="#0f62fe" /><text x="306" y="121" fill="#161616" fontFamily="IBM Plex Sans, sans-serif" fontSize="11">HTML</text>
      <rect className="pop" x="276" y="144" width="96" height="30" fill="#ffffff" stroke="#e0e0e0" />
      <rect x="288" y="154" width="12" height="10" fill="#d24726" /><text x="306" y="163" fill="#161616" fontFamily="IBM Plex Sans, sans-serif" fontSize="10">PPTX</text>
    </svg>
  );
}

/* ===================================================================
   Sticky page-journey navigation
   =================================================================== */
const NAV_SECTIONS = [
  ['overview', 'Overview'],
  ['connect', 'Connect'],
  ['generate', 'Generate'],
  ['automate', 'Automate'],
  ['review', 'Review'],
  ['standardize', 'Standardize'],
  ['quality', 'AI quality'],
  ['lifecycle', 'Documents'],
  ['reporting', 'Reporting'],
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

/* ---------- FAQ (mirror server/src/seo-meta.js FAQPage JSON-LD when editing) ---------- */
export const FAQS = [
  {
    q: 'What is Docify?',
    a: 'Docify keeps technical documentation aligned with your product. Connect your GitHub, GitLab, or Bitbucket repositories, and Docify generates or updates documentation from your real source, validates its quality, style, links, and AI-search readiness, lets your team review and approve every change, and exports the result to Markdown, PDF, Word, HTML, DITA, and more.'
  },
  {
    q: 'How does documentation stay up to date automatically?',
    a: 'Automation pipelines run on every merge or push via webhook. Docify decides whether a change is meaningful to customers, updates the affected section of the existing document (never a duplicate), re-scores it, and either auto-publishes or holds it for human approval — so the release and its documentation ship together.'
  },
  {
    q: 'Does Docify document every code change?',
    a: 'No. Docify filters changes for customer relevance using repository rules, include/exclude patterns, metadata, style guides, and AI reasoning, and routes low-confidence decisions to a human. Internal refactors and implementation details do not become customer documentation.'
  },
  {
    q: 'What does the AI quality review check?',
    a: 'Each document is scored across weighted dimensions — LLM readiness, structure, clarity, completeness, terminology consistency, readability, style-guide compliance, and link integrity — with an overall score, a publish-readiness verdict, and a one-click or reviewer-approved fix for each finding.'
  },
  {
    q: 'What is AI search readiness?',
    a: 'Docify evaluates the signals that help machines find, understand, and cite your content — titles, metadata, structure, clarity, and completeness — and estimates how ready each major assistant is to retrieve it. It is a readiness signal you can improve, not a guarantee of ranking on any platform.'
  },
  {
    q: 'Is my source code stored?',
    a: 'No. Docify reads your repository through a read-only grant, generates documentation from code structure, comments, and history, and does not store your source. You can revoke access at any time.'
  }
];

const PROVIDERS = ['GitHub', 'GitLab', 'Bitbucket'];
const FMTS = ['Markdown', 'PDF', 'Word', 'HTML', 'DITA', 'DocBook', 'ePub'];
const PROBLEMS = [
  ['Code outruns the docs', 'Every merge can change behaviour customers depend on. Manual updates never keep pace.'],
  ['Internal details leak out', 'Not every commit belongs in customer documentation — refactors and internals should stay internal.'],
  ['Releases wait on writing', 'Manual source analysis and drafting delay the release, or the docs ship late and wrong.'],
  ['Quality varies by author', 'Tone, terminology, and structure drift between writers, teams, and quarters.'],
  ['Stale content erodes trust', 'A 404 quick start or an old screenshot tells customers your product is unreliable.'],
  ['Machines can’t use it', 'Poorly structured content is hard for site search and AI assistants to retrieve and cite.']
];

export default function Landing() {
  usePageMeta({
    title: 'Docify — Automated Technical Documentation from GitHub, GitLab & Bitbucket',
    description: 'Docify keeps documentation aligned with every meaningful product change: connect GitHub, GitLab, or Bitbucket, generate or auto-update docs from your code, validate quality, style, links, and AI-search readiness, review and approve changes, and export to Markdown, PDF, Word, HTML, and DITA.',
    path: '/'
  });
  const nav = useNavigate();

  // Structured data — SoftwareApplication — injected for the homepage only.
  useEffect(() => {
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.id = 'ld-softwareapp';
    ld.text = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'SoftwareApplication',
      name: 'Docify', applicationCategory: 'DeveloperApplication', operatingSystem: 'Web',
      description: 'Automated technical documentation from GitHub, GitLab, and Bitbucket — generate, auto-update, validate quality and AI-search readiness, review and approve, and export.',
      url: 'https://docifydocai.com/', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
    });
    document.head.appendChild(ld);
    return () => { const e = document.getElementById('ld-softwareapp'); if (e) e.remove(); };
  }, []);

  return (
    <>
      <PageNav />

      {/* 1 · Hero */}
      <section className="heroband">
        <div className="gridlines" />
        <div className="heroinner">
          <div>
            <p className="eyebrow mb3">DOCIFY · DOCUMENTATION THAT KEEPS UP</p>
            <h1 className="display">Documentation that stays aligned with every meaningful product change.</h1>
            <p className="lead t2 mt5" style={{ maxWidth: 560 }}>
              Docify connects the repositories your team already uses, generates or updates the right
              documentation when your product changes, validates its quality and AI-search readiness,
              and keeps approved content current — with a human in control at every step.
            </p>
            <div className="row mt7" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn--primary" onClick={() => nav('/signup')}>Start generating<span className="ico">→</span></button>
              <button className="btn btn--ghostdark" onClick={() => nav('/automation')}>Explore automation</button>
              <button className="btn btn--ghostdark" onClick={() => { const el = document.getElementById('automate'); if (el) el.scrollIntoView(); }}>Watch the workflow</button>
            </div>
            <p className="helper mt5" style={{ color: '#8d8d8d' }}>
              Read-only access · your source code is never stored · no credit card required
            </p>
          </div>
          <HeroVisual />
        </div>
      </section>

      {/* 2 · The problem */}
      <div className="page" id="overview" style={{ paddingTop: 72, paddingBottom: 0 }}>
        <Reveal>
          <p className="eyebrow eyebrow--blue mb3">THE PROBLEM</p>
          <h2 className="feathead" style={{ maxWidth: 720 }}>Software changes continuously. Documentation can’t keep up by hand.</h2>
          <p className="lead t2 mt5" style={{ maxWidth: 640 }}>
            Teams can’t manually track every change, decide what customers need to know, rewrite the
            affected pages, and hold the quality bar — on every release. So docs fall behind, and both
            people and AI assistants lose trust in them.
          </p>
        </Reveal>
        <div className="grid3 mt7" style={{ alignItems: 'stretch' }}>
          {PROBLEMS.map(([t, d], i) => (
            <Reveal key={t} delay={i * 70}>
              <div className="tile valtile" style={{ padding: 22, height: '100%' }}>
                <p className="h02">{t}</p>
                <p className="body01 t2 mt3">{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={100}>
          <div className="defblock mt7">
            <p className="label01 t2 mb3">WHAT DOCIFY DOES</p>
            <p className="deftext">
              Docify connects your repositories, identifies the changes that matter to customers,
              generates or updates the correct documentation, validates quality, style, links, and
              AI readiness, and lets your team review, rewrite, compare, and approve — then exports,
              publishes, and keeps it current.
            </p>
          </div>
        </Reveal>
      </div>

      {/* 3 · Connect the ecosystem */}
      <div className="page featlist" id="connect" style={{ paddingTop: 48, paddingBottom: 0 }}>
        <Reveal>
          <div className="featrow">
            <div className="illuwrap"><IlluSource /></div>
            <div>
              <p className="eyebrow eyebrow--blue mb3">CONNECT YOUR ECOSYSTEM</p>
              <h2 className="feathead">One place for every repository you document</h2>
              <p className="lead t2 mt5" style={{ maxWidth: 480 }}>
                Connect GitHub, GitLab, and Bitbucket — multiple accounts, organisations, groups, and
                workspaces, public or private — and manage them from one central catalogue. Connection
                health is visible at a glance, and the same repository selection is reusable across
                generation, automation, and standardization. Access is read-only, and your source is
                never stored.
              </p>
              <div className="row mt5" style={{ flexWrap: 'wrap', gap: 8 }}>
                {PROVIDERS.map((p) => <span key={p} className="tag tag--outline">{p}</span>)}
                <span className="tag tag--outline">Multiple accounts</span>
                <span className="tag tag--outline">Orgs · groups · workspaces</span>
                <span className="tag tag--outline">Read-only</span>
              </div>
              <button className="btn btn--tertiary mt5" onClick={() => nav('/repos')}>Manage repositories<span className="ico">→</span></button>
            </div>
          </div>
        </Reveal>
      </div>

      {/* 4 · Generate normally (Film — Generate) */}
      <div className="page featlist" id="generate" style={{ paddingTop: 8, paddingBottom: 0 }}>
        <Reveal>
          <div className="featrow">
            <div>
              <p className="eyebrow eyebrow--blue mb3">GENERATE ON DEMAND</p>
              <h2 className="feathead">Guided generation, from source to export</h2>
              <p className="lead t2 mt5" style={{ maxWidth: 480 }}>
                Select your sources, choose a document type, pick one or several output formats, and
                generate. Preview each format separately, run the AI quality review, edit inline, and
                export — every document written in one governed voice, held to an open standard.
              </p>
              <ol className="flowsteps mt5" aria-label="Generation workflow">
                {[['1', 'Select sources', 'Repositories, endpoints, and issues from your catalogue'],
                  ['2', 'Choose type & formats', 'API reference, user guide, release notes — in one or many formats'],
                  ['3', 'Generate & preview', 'A real document per format, previewed separately'],
                  ['4', 'Review, edit, export', 'Quality-checked, edited, and exported']].map(([n, t, d]) => (
                  <li key={n} className="flowstep"><span className="flowstep-n mono">{n}</span>
                    <span><strong>{t}</strong><br /><span className="t2">{d}</span></span></li>
                ))}
              </ol>
            </div>
            <div className="illuwrap"><IlluGenerate /></div>
          </div>
        </Reveal>
        <div id="film-generate" />
        <Reveal delay={80}>
          <SeriesMeter step={1} />
          <div className="vidwrap mt3"><GenerateDemo /></div>
        </Reveal>
      </div>

      {/* Works-with strip */}
      <div className="page" style={{ paddingBottom: 0, paddingTop: 40 }}>
        <div className="divider" style={{ marginTop: 0, marginBottom: 24 }} />
        <Reveal>
          <div className="row row--between" style={{ flexWrap: 'wrap', gap: 16 }}>
            <p className="label01 t2">WORKS WITH</p>
            <div className="logorow">
              {PROVIDERS.map((s) => <span key={s}>{s}</span>)}<span>·</span>{FMTS.map((f) => <span key={f}>{f}</span>)}
            </div>
          </div>
        </Reveal>
        <div className="divider" style={{ marginBottom: 0, marginTop: 24 }} />
      </div>

      {/* 5 · Automate after meaningful changes (Film — Automation) */}
      <div className="page" id="automate" style={{ paddingTop: 40, paddingBottom: 32 }}>
        <Reveal>
          <SeriesMeter step={2} />
          <p className="eyebrow eyebrow--blue mb3">AUTOMATE MEANINGFUL CHANGES</p>
          <h2 className="feathead">A merge lands — the right documentation follows</h2>
          <p className="lead t2 mt3" style={{ maxWidth: 660 }}>
            Docify does not blindly turn every code line into documentation. It decides what’s meaningful
            to customers using repository rules, include/exclude patterns, metadata, and AI reasoning —
            then updates the existing document at the best-matching section, validates it in the
            background, and either auto-publishes or holds it for approval.
          </p>
          <ol className="flowsteps" aria-label="Workflow after a merge">
            {[['1', 'Change lands', 'Webhook fires on a push or merged pull request'],
              ['2', 'Relevance filtered', 'Rules, metadata, and AI decide what customers need'],
              ['3', 'Doc updated & scored', 'The affected section is rewritten and quality-gated'],
              ['4', 'Auto-approve or review', 'Passing runs publish; the rest wait for a human']].map(([n, t, d]) => (
              <li key={n} className="flowstep"><span className="flowstep-n mono">{n}</span>
                <span><strong>{t}</strong><br /><span className="t2">{d}</span></span></li>
            ))}
          </ol>
        </Reveal>
        <Reveal delay={120}><div className="vidwrap"><AutomationDemo /></div></Reveal>
        <Reveal delay={60}>
          <div className="row mt6" style={{ flexWrap: 'wrap', gap: 8 }}>
            {['Update existing docs', 'Versioned or standalone outputs', 'PR- and commit-linked versions', 'Direct downloads from the run', 'Background quality gate', 'Auto-approve or human approval', 'Run history & quality reports'].map((c) => (
              <span key={c} className="tag tag--outline">{c}</span>
            ))}
          </div>
          <button className="btn btn--tertiary mt5" onClick={() => nav('/automation')}>Build a pipeline<span className="ico">→</span></button>
        </Reveal>
      </div>

      {/* 6 · Human control where it matters */}
      <div className="page featlist" id="review" style={{ paddingTop: 8, paddingBottom: 0 }}>
        <Reveal>
          <div className="featrow">
            <div className="illuwrap"><IlluReview /></div>
            <div>
              <p className="eyebrow eyebrow--blue mb3">HUMAN CONTROL</p>
              <h2 className="feathead">AI proposes. Your team decides.</h2>
              <p className="lead t2 mt5" style={{ maxWidth: 480 }}>
                Automatic fixes arrive as proposed changes, never silent overwrites. Select any word,
                sentence, paragraph, or section and edit it manually, ask AI to rewrite it, apply a
                different style guide, or compare alternatives. Accept or reject each change, add
                comments, request changes, or approve and publish — with inline and side-by-side diffs,
                undo/redo, and a full audit trail. It’s governance, not just generation.
              </p>
              <div className="row mt5" style={{ flexWrap: 'wrap', gap: 8 }}>
                {['Accept / reject', 'Manual edit', 'AI rewrite', 'Apply a style guide', 'Compare versions', 'Comments', 'Request changes', 'Approve & publish'].map((c) => (
                  <span key={c} className="tag tag--outline">{c}</span>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      {/* 7 · Standardize at scale */}
      <div className="page featlist" id="standardize" style={{ paddingTop: 8, paddingBottom: 0 }}>
        <Reveal>
          <div className="featrow">
            <div>
              <p className="eyebrow eyebrow--blue mb3">STANDARDIZE AT SCALE</p>
              <h2 className="feathead">One house style across every project and author</h2>
              <p className="lead t2 mt5" style={{ maxWidth: 480 }}>
                Take documentation written by anyone, in any state, and rebuild it to one consistent
                standard. Apply reusable style guides and terminology, organisation and repository
                rules, and your own custom instruction files. In the hybrid editor you can select any
                span and improve clarity, change tone, shorten or expand, or apply a chosen style guide —
                and every edit, manual or AI, tracks in a single unified diff.
              </p>
              <div className="row mt5" style={{ flexWrap: 'wrap', gap: 8 }}>
                {['Reusable style guides', 'Terminology rules', 'Org & repo rules', 'Custom instruction files', 'Unified diff'].map((c) => (
                  <span key={c} className="tag tag--outline">{c}</span>
                ))}
              </div>
              <button className="btn btn--tertiary mt5" onClick={() => nav('/standardize')}>Open Standardize<span className="ico">→</span></button>
            </div>
            <div className="illuwrap"><IlluStandardize /></div>
          </div>
        </Reveal>
      </div>

      {/* 8 · Quality & AI readiness (Film — AI quality) */}
      <div className="page featlist" id="quality" style={{ paddingTop: 8, paddingBottom: 0 }}>
        <Reveal>
          <div className="featrow">
            <div className="illuwrap"><IlluVerify /></div>
            <div>
              <p className="eyebrow eyebrow--blue mb3">QUALITY & AI READINESS</p>
              <h2 className="feathead">Validated before it ships — and readable by machines</h2>
              <p className="lead t2 mt5" style={{ maxWidth: 480 }}>
                Every document is scored by an AI judge across weighted dimensions, each finding paired
                with a fix and a projected gain, and blocked by a quality gate if it falls short. Docify
                also evaluates AI-search readiness — the structure, metadata, clarity, and completeness
                that help assistants find and cite your content. It’s a readiness signal you can improve,
                not a guarantee of ranking on any platform.
              </p>
            </div>
          </div>
        </Reveal>
        <Reveal>
          <div className="row mt2 mb6" style={{ flexWrap: 'wrap', gap: 8 }}>
            {['Overall score', 'LLM readiness', 'AI search readiness', 'Structure', 'Titles', 'Metadata', 'Clarity', 'Completeness', 'Readability', 'Terminology', 'Style compliance', 'Broken links', 'Applied fixes', 'Publish readiness'].map((c) => (
              <span key={c} className="tag tag--outline">✓ {c}</span>
            ))}
          </div>
        </Reveal>
        <div id="film-ai" />
        <Reveal delay={80}>
          <SeriesMeter step={3} />
          <div className="vidwrap mt3"><AICompatDemo /></div>
        </Reveal>
      </div>

      {/* AI search-readiness band (honest, no ranking guarantee) */}
      <div className="page" style={{ paddingTop: 32, paddingBottom: 32 }}>
        <Reveal>
          <div className="moat">
            <p className="eyebrow" style={{ color: '#78a9ff' }}>AI SEARCH READINESS</p>
            <h2 className="h03 mt2" style={{ color: '#ffffff', maxWidth: 640 }}>
              See how ready your docs are for AI search — and improve it.
            </h2>
            <p className="helper mt3" style={{ color: '#c6c6c6', maxWidth: 620 }}>
              One document before and after its fixes — a modeled readiness score per assistant, based on
              structure, metadata, clarity, and completeness. Recomputed as you apply fixes, and capped
              below 100% because certainty would be a false claim. A signal you can act on, not a ranking
              guarantee.
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

      {/* 9 · Documents, versions, lifecycle */}
      <div className="page featlist" id="lifecycle" style={{ paddingTop: 8, paddingBottom: 0 }}>
        <Reveal>
          <div className="featrow">
            <div>
              <p className="eyebrow eyebrow--blue mb3">DOCUMENTS & HISTORY</p>
              <h2 className="feathead">The complete documentation lifecycle, not a one-off</h2>
              <p className="lead t2 mt5" style={{ maxWidth: 480 }}>
                Every generated and corrected document lives in one Documents dashboard. See approval
                status and the audit trail, browse previous versions, compare old and new side by side,
                and restore any version. Approved content flows back into automation — so the pipeline
                always builds on the version your team signed off.
              </p>
              <div className="row mt5" style={{ flexWrap: 'wrap', gap: 8 }}>
                {['Version history', 'Compare versions', 'Restore', 'Approval status', 'Audit trail', 'Reuse in automation'].map((c) => (
                  <span key={c} className="tag tag--outline">{c}</span>
                ))}
              </div>
            </div>
            <div className="illuwrap"><IlluReadiness /></div>
          </div>
        </Reveal>
      </div>

      {/* 10 · Management reporting */}
      <div className="page featlist" id="reporting" style={{ paddingTop: 8, paddingBottom: 0 }}>
        <Reveal>
          <div className="featrow">
            <div className="illuwrap"><IlluReport /></div>
            <div>
              <p className="eyebrow eyebrow--blue mb3">MANAGEMENT REPORTING</p>
              <h2 className="feathead">A management-ready quality report, in one click</h2>
              <p className="lead t2 mt5" style={{ maxWidth: 480 }}>
                Export the full AI Quality Report as PDF, HTML, or PowerPoint — one data source, three
                formats. Each includes an executive summary, score breakdown, quality findings,
                broken-link analysis, style compliance, applied fixes, remaining risks, and a
                publish-readiness decision. Built for technical teams and senior management alike.
              </p>
              <div className="row mt5" style={{ flexWrap: 'wrap', gap: 8 }}>
                <span className="tag tag--outline">PDF</span>
                <span className="tag tag--outline">HTML</span>
                <span className="tag tag--outline">PowerPoint</span>
                <span className="tag tag--outline">Executive summary</span>
                <span className="tag tag--outline">Publish-readiness decision</span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      {/* Metrics band */}
      <section className="metricband">
        <div className="page" style={{ padding: '0 24px' }}>
          <Reveal>
            <div className="grid3">
              <div><p className="metricnum"><CountUp to={3} suffix=" providers" /></p><p className="body01 t2 mt3">GitHub, GitLab, and Bitbucket — multiple accounts, orgs, groups, and workspaces from one catalogue.</p></div>
              <div><p className="metricnum"><CountUp to={7} suffix=" formats" /></p><p className="body01 t2 mt3">Markdown, PDF, Word, HTML, DITA, DocBook, and ePub — previewed and exported separately.</p></div>
              <div><p className="metricnum">0</p><p className="body01 t2 mt3">Documents below the quality gate reach customers — they’re held for review, not published.</p></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 11 · Output formats matrix */}
      <div className="page" id="integrations" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <Reveal>
          <h2 className="feathead">Every source, every supported format</h2>
          <p className="lead t2 mt3">Only what the product actually produces today. Supported means fully supported.</p>
          <table className="matrix mt6">
            <thead><tr><th>SOURCE</th>{FMTS.slice(0, 5).map((f) => <th key={f}>{f}</th>)}</tr></thead>
            <tbody>
              {PROVIDERS.map((s, r) => (
                <tr key={s}><td>{s}</td>
                  {FMTS.slice(0, 5).map((f, c) => (
                    <td key={f}><span className="check checkpop" style={{ animationDelay: ((r * 5 + c) * 70) + 'ms' }}>✓</span></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row mt5" style={{ flexWrap: 'wrap' }}>
            <span className="helper">Plus DocBook, ePub, XHTML, and MDX outputs · Jira, OpenAPI, and more sources supported in generation.</span>
          </div>
        </Reveal>
      </div>

      {/* 12 · Role-based value */}
      <div className="page" id="teams" style={{ paddingTop: 0, paddingBottom: 56 }}>
        <Reveal>
          <p className="eyebrow eyebrow--blue mb3">VALUE, ROLE BY ROLE</p>
          <h2 className="feathead mb6">Built for the whole documentation lifecycle</h2>
        </Reveal>
        <div className="grid3" style={{ alignItems: 'stretch' }}>
          {[['Developers', 'Merge code — the affected docs update automatically. No manual writing tax.'],
            ['Technical writers', 'Source is gathered and drafted for you; you review, rewrite, and refine — not excavate.'],
            ['Documentation managers', 'Scores, gates, approvals, and run history: visibility and governance across every team.'],
            ['Product teams', 'Releases and their documentation ship together, filtered to what customers actually need.'],
            ['Engineering leaders', 'A consistent quality bar and audit trail across every repo and author.'],
            ['Governance & compliance', 'Read-only access, versioned approvals, and management-ready quality reports.']].map(([t, d], i) => (
            <Reveal key={t} delay={i * 80}>
              <div className="tile valtile" style={{ padding: 24, height: '100%' }}>
                <p className="h02">{t}</p>
                <p className="body01 t2 mt3">{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Trust & security */}
      <div className="page" id="trust" style={{ paddingTop: 0, paddingBottom: 80 }}>
        <Reveal>
          <p className="eyebrow eyebrow--blue mb3">TRUST & SECURITY</p>
          <h2 className="feathead mb5">Safe to connect to your source</h2>
          <div className="trustgrid">
            {[['Read-only access', 'OAuth scopes limited to reading repository contents and history — Docify can never write to your code.'],
              ['Code never stored', 'Files are read at generation time, used to write the document, and discarded. Your source is not our database.'],
              ['You approve every change', 'Automatic fixes are proposed, not applied. Nothing publishes until a human approves, and every approval is versioned.'],
              ['Below the bar is blocked', 'The quality gate holds any document that fails its checks — automatically, before it reaches customers.']].map(([t, d], i) => (
              <Reveal key={t} delay={i * 80}>
                <div className="trusttile"><p className="h01">{t}</p><p className="body01 t2 mt3">{d}</p></div>
              </Reveal>
            ))}
          </div>
        </Reveal>
      </div>

      {/* FAQ */}
      <div className="page" id="faq" style={{ paddingTop: 0, paddingBottom: 96 }}>
        <Reveal>
          <p className="eyebrow eyebrow--blue mb3">FREQUENTLY ASKED QUESTIONS</p>
          <h2 className="feathead mb6">Automated documentation — common questions</h2>
          <div className="faqlist">{FAQS.map((f) => <FaqItem key={f.q} q={f.q} a={f.a} />)}</div>
        </Reveal>
      </div>

      {/* 13 · Final CTA */}
      <section className="ctaband" id="start">
        <div style={{ maxWidth: 1056, margin: '0 auto', padding: '0 24px' }}>
          <Reveal>
            <p className="eyebrow mb3">GET STARTED</p>
            <h2 className="h04" style={{ color: '#fff', maxWidth: 640 }}>Your product keeps changing. Your documentation can keep up.</h2>
            <div className="row mt6" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn--primary" onClick={() => nav('/signup')}>Start generating<span className="ico">→</span></button>
              <button className="btn btn--ghostdark" onClick={() => nav('/automation')}>Explore automation</button>
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
              <span className="logotext">Doc<span className="logogen">ify</span></span>
            </div>
            <p className="helper mt3" style={{ lineHeight: 1.6 }}>
              Documentation that stays aligned with your product: generate and auto-update docs from your
              code, validate quality and AI readiness, review and approve changes, and export in every
              major format.
            </p>
            <p className="helper mt3">Support: <a href={supportMailto()}>{SUPPORT_EMAIL}</a></p>
          </div>
          <nav className="sitefoot-col" aria-label="Product">
            <h3>Product</h3>
            <a onClick={() => nav('/automation')}>Automation</a>
            <a onClick={() => nav('/standardize')}>Standardize</a>
            <a onClick={() => nav('/repos')}>Repositories</a>
            <a onClick={() => nav('/pricing')}>Pricing</a>
            <a onClick={() => nav('/signup')}>Start free</a>
          </nav>
          <nav className="sitefoot-col" aria-label="Resources">
            <h3>Resources</h3>
            <a onClick={() => nav('/docs')}>Documentation</a>
            <a onClick={() => nav('/docs/llm-as-a-judge')}>AI quality scoring</a>
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
          <span className="helper">© {new Date().getFullYear()} Docify · Documentation that keeps up</span>
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
