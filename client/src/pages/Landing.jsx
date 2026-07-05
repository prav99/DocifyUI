import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NavBar, LogoMark } from '../ui.jsx';

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

/* ---------- Narration audio: curated voice + soft ambient score ---------- */
let musicCtx = null, musicNodes = null;

function musicStart() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!musicCtx) musicCtx = new AC();
    if (musicCtx.state === 'suspended') musicCtx.resume();
    if (musicNodes) return;
    const ctx = musicCtx;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.032, ctx.currentTime + 4);
    master.connect(ctx.destination);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.3;
    lp.connect(master);
    // Sustained ambient pad: two soft chords morphing into each other, very low in the mix.
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 120;
    lfo.connect(lfoGain); lfoGain.connect(lp.frequency); lfo.start();
    const chords = [
      [130.81, 196.0, 329.63, 493.88], // Cmaj7, widely spread
      [110.0, 164.81, 261.63, 392.0],  // Am7, widely spread
      [87.31, 174.61, 261.63, 440.0]   // Fmaj7, widely spread
    ];
    const oscs = chords[0].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i < 2 ? 'sine' : 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i < 2 ? 0.5 : 0.2;
      o.connect(g); g.connect(lp); o.start();
      return o;
    });
    let step = 0;
    const iv = setInterval(() => {
      step++;
      const ch = chords[step % chords.length];
      const t = ctx.currentTime;
      oscs.forEach((o, i) => o.frequency.setTargetAtTime(ch[i], t, 2.5));
    }, 9000);
    musicNodes = { master, oscs, lfo, iv };
  } catch { /* audio unavailable */ }
}

function musicStop() {
  try {
    if (!musicNodes || !musicCtx) return;
    clearInterval(musicNodes.iv);
    const t = musicCtx.currentTime;
    musicNodes.master.gain.cancelScheduledValues(t);
    musicNodes.master.gain.setTargetAtTime(0.0001, t, 0.4);
    const n = musicNodes;
    musicNodes = null;
    setTimeout(() => { try { n.oscs.forEach((o) => o.stop()); n.lfo.stop(); n.master.disconnect(); } catch { /* ignore */ } }, 1600);
  } catch { /* ignore */ }
}

let cachedVoice = null;
function pickVoice() {
  try {
    const vs = window.speechSynthesis.getVoices();
    if (!vs || !vs.length) return null;
    // Prefer the most natural, humanoid voices each platform offers.
    const prefs = [
      /Google UK English Female/i, /Google US English/i,
      /(Aria|Jenny|Sonia|Libby|Emma).*(Natural|Online)/i,
      /Samantha/i, /Serena/i, /Karen/i, /Moira/i, /Tessa/i, /Daniel/i
    ];
    for (const rx of prefs) { const v = vs.find((x) => rx.test(x.name)); if (v) return v; }
    return vs.find((x) => x.lang && x.lang.indexOf('en') === 0) || vs[0];
  } catch { return null; }
}
try {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => { cachedVoice = pickVoice(); };
  }
} catch { /* ignore */ }

// Speak a line and report when it truly finishes — playback sync is driven by this.
function narrate(text, onEnd) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (!cachedVoice) cachedVoice = pickVoice();
    if (cachedVoice) u.voice = cachedVoice;
    u.rate = 0.9;  // unhurried, documentary pacing
    u.pitch = 1;   // natural human register
    u.volume = 1;
    let done = false;
    const finish = () => { if (!done) { done = true; if (onEnd) onEnd(); } };
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.speak(u);
  } catch { if (onEnd) onEnd(); }
}

function stopAllAudio() {
  try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  musicStop();
}

/* Opening title slate — tells the viewer what the demo is about before it plays */
function TitleSlate({ kicker, title, sub }) {
  return (
    <div className="slate">
      <div className="slate-mark"><LogoMark size={32} /></div>
      <p className="slate-kicker">{kicker}</p>
      <h3 className="slate-title">{title}</h3>
      <p className="slate-sub">{sub}</p>
      <p className="slate-note">Sound recommended — turn on the voiceover</p>
    </div>
  );
}

/* ---------- Self-playing product demo ---------- */
const DEMO_STEPS = ['Intro', 'Connect source', 'Configure', 'Generate', 'Quality review', 'AI ranking', 'Automate'];
const DEMO_DUR = [7000, 9000, 9500, 10500, 10500, 10500, 9500];
const DEMO_VO = [
  'Welcome. Over the next ninety seconds, watch DocGen turn a live code repository into a verified API reference — judged by AI, and ranked against the AI platforms your customers actually use.',
  'Meet DocGen. It starts with the repository you already have — connected once, read gently, never stored.',
  'Choose what you need: an API reference, held to the OpenAPI standard — in DITA, PDF, Word, HTML, or Markdown.',
  'Now DocGen reads your code — its structure, its comments, its history — and writes every section against a standardized blueprint.',
  'Before anything ships, an AI judge scores six quality dimensions. Every finding carries a one-click fix — with its gain declared up front.',
  'Then, the part nobody else shows you: the estimated chance that ChatGPT, Claude, and Gemini retrieve and cite this document. Watch it climb as fixes land.',
  'From now on, a webhook does this on every merge — regenerated, re-judged, and gated at eighty-five. Your documentation, always current, always ranking.'
];

function DemoScore() {
  const [v, setV] = useState(70);
  useEffect(() => {
    let raf;
    const d = setTimeout(() => {
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / 3600);
        setV(Math.round(70 + 22 * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, 2800);
    return () => { clearTimeout(d); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return <>{v}</>;
}

/* Mini replica of the live /quality ranking panel — shared by both demos */
function RankPanel({ dark = true }) {
  const rows = [['ChatGPT', 49, 94], ['Claude', 51, 97], ['Gemini', 52, 84]];
  return (
    <div className={'demo-moat' + (dark ? '' : ' demo-moat--frame')}>
      <p className="demo-moatkick mono">RANKING OUTLOOK · RECOMPUTED ON EVERY FIX</p>
      {rows.map(([n, from, to], i) => (
        <div key={n} className="demo-mrow" style={{ animationDelay: (0.4 + i * 0.9) + 's' }}>
          <span className="demo-mname">{n}</span>
          <span className="demo-mbar"><span className="demo-mfill" style={{ width: to + '%', animationDelay: (1.1 + i * 0.9) + 's' }} /></span>
          <span className="demo-mpct mono">{to}%</span>
          <span className="demo-mdelta" style={{ animationDelay: (2.2 + i * 0.9) + 's' }}>+{to - from} pts</span>
        </div>
      ))}
      <p className="demo-mnote">was 49–52% before fixes · capped below 100% — certainty would be a false claim</p>
    </div>
  );
}

function ProductDemo() {
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [sound, setSound] = useState(true);
  const [runId, setRunId] = useState(0);
  const ref = useRef(null);

  // A scene ends only when BOTH its visuals have had their minimum time AND
  // its narration has finished — audio and video stay in step, like a real film.
  useEffect(() => {
    if (!playing) return;
    let alive = true;
    let advanced = false;
    let speechDone = !sound;
    let minDone = false;
    const tryAdvance = () => {
      if (!alive || advanced || !speechDone || !minDone) return;
      advanced = true;
      setTimeout(() => { if (alive) setScene((s) => (s + 1) % DEMO_STEPS.length); }, 900);
    };
    const tMin = setTimeout(() => { minDone = true; tryAdvance(); }, DEMO_DUR[scene]);
    if (sound) narrate(DEMO_VO[scene], () => { speechDone = true; tryAdvance(); });
    const tGuard = setTimeout(() => { speechDone = true; minDone = true; tryAdvance(); }, DEMO_DUR[scene] + 20000);
    return () => { alive = false; clearTimeout(tMin); clearTimeout(tGuard); };
  }, [scene, playing, sound, runId]);

  useEffect(() => () => { stopAllAudio(); }, []);

  const play = () => {
    setStarted(true);
    setPlaying(true);
    if (sound) musicStart();
    setRunId((n) => n + 1); // replay the current scene from its start
  };
  const pause = () => {
    setPlaying(false);
    stopAllAudio();
  };
  const jump = (i) => {
    setStarted(true);
    setPlaying(true);
    if (sound) musicStart();
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    setScene(i);
    setRunId((n) => n + 1);
  };
  const toggleSound = () => {
    setSound((v) => {
      const nv = !v;
      if (!nv) { stopAllAudio(); }
      else if (playing) { musicStart(); setRunId((n) => n + 1); }
      return nv;
    });
  };
  const pipeline = ['Parsing repo structure', 'Extracting code comments', 'Drafting sections', 'Running quality checks'];

  return (
    <div className="demo-window" ref={ref}>
      {!started && (
        <button className="vid-poster" onClick={play} aria-label="Play demo with sound">
          <span className="vid-playbtn">▶</span>
          <span className="vid-postertxt">Play demo · sound on</span>
        </button>
      )}
      <div className="demo-chrome">
        <span className="demo-shellname">DocGen</span>
        <span className="crumb">docgen / generate / api-reference</span>
        <span className="spacer" style={{ flex: 1 }} />
      </div>
      <div className="demo-body">
        <aside className="demo-rail">
          {DEMO_STEPS.map((s, i) => (
            <button key={s} className={'demo-step' + (i === scene ? ' on' : i < scene ? ' done' : '')} onClick={() => jump(i)}>
              <span className="mono">{'0' + (i + 1)}</span> {s}
            </button>
          ))}
        </aside>
        <div className={'demo-stage' + (scene === 0 ? ' demo-stage--slate' : '')} key={scene + '-' + runId}>
          {scene === 0 && (
            <TitleSlate kicker="PRODUCT DEMO" title="From code commit to AI-ranked documentation"
              sub="A connected repository becomes a verified, export-ready document — scored by an AI judge and ranked against ChatGPT, Claude, and Gemini. The complete flow, as it runs today." />
          )}
          {scene === 1 && (
            <div>
              <p className="h01 mb5">Select a repository</p>
              {['acme/webhooks-gateway', 'acme/payments-api', 'acme/sdk-python'].map((r, i) => (
                <div key={r} className={'demo-row' + (i === 1 ? ' demo-pick' : '')}>
                  <span className="rdot" />
                  <span className="mono" style={{ fontSize: 13 }}>{r}</span>
                  <span className="demo-branch mono">main</span>
                  {i === 1 && <span className="demo-pickcheck check">✓ selected</span>}
                </div>
              ))}
              <p className="helper mt5 demo-late">Read-only grant from signup — no extra authorization needed.</p>
            </div>
          )}
          {scene === 2 && (
            <div>
              <p className="h01 mb5">Document type &amp; output format</p>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                {['API reference', 'User guide', 'Quick start'].map((c, i) => (
                  <span key={c} className={'demo-chip' + (i === 0 ? ' demo-chipon' : '')}>{c}</span>
                ))}
                <span className="demo-branch mono demo-late" style={{ alignSelf: 'center' }}>Standard: OpenAPI 3.1-aligned</span>
              </div>
              <div className="row mt5" style={{ flexWrap: 'wrap' }}>
                {['DITA', 'PDF', 'Word', 'HTML', 'Markdown'].map((c, i) => (
                  <span key={c} className={'demo-chip demo-fmt' + (i === 0 ? ' demo-chipon' : '')}
                    style={{ animationDelay: (2.6 + i * 0.45) + 's' }}>{c}</span>
                ))}
              </div>
              <p className="helper mt5 demo-late">DITA selected — plus cover, contents, watermark, and 25 more output options, honored in every format.</p>
            </div>
          )}
          {scene === 3 && (
            <div>
              <p className="h01 mb5">Generating from acme/payments-api</p>
              {pipeline.map((s, i) => (
                <div key={s} className="demo-pipe" style={{ animationDelay: (i * 1.8) + 's' }}>
                  <span className="sicon">
                    <span className="demo-spinhold" style={{ animationDelay: (i * 1.8 + 1.45) + 's' }}><span className="spin" /></span>
                    <span className="check demo-pipecheck" style={{ animationDelay: (i * 1.8 + 1.55) + 's' }}>✓</span>
                  </span>
                  {s}
                </div>
              ))}
              <p className="helper mt5 demo-late">Draft ready — every section traced back to source.</p>
            </div>
          )}
          {scene === 4 && (
            <div>
              <div className="row" style={{ alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
                <div className="score score--good" style={{ minWidth: 170 }}>
                  <span className="label01 t2">Overall score</span>
                  <span className="num"><DemoScore /></span>
                  <span className="helper">6 weighted dimensions · gate ≥ 85</span>
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div className="demo-issue">
                    <div className="row row--between">
                      <p className="h01">Missing short description</p>
                      <span className="tag tag--blue">+4 overall</span>
                    </div>
                    <p className="helper mt2">AI systems rely on it to summarize and cite the page.</p>
                    <span className="demo-fixbtn">Apply fix · +4</span>
                    <span className="tag tag--green demo-fixedtag">Fixed ✓ · before/after diff recorded</span>
                  </div>
                </div>
              </div>
              <p className="helper mt5 demo-late">Style · Consistency · Completeness · Readability · LLM readiness · Link integrity — every fix re-renders content, preview, and all export formats.</p>
            </div>
          )}
          {scene === 5 && (
            <div>
              <p className="h01 mb5">Will AI platforms cite this document?</p>
              <RankPanel />
              <p className="helper mt5 demo-late">Modeled from each platform&apos;s retrieval profile — expand any card in the product to see exactly what it weighs.</p>
            </div>
          )}
          {scene === 6 && (
            <div>
              <p className="h01 mb5">Automate: regenerate on every merge</p>
              <div className="row" style={{ alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
                <div className="demo-yaml mono">
                  {['webhook: /api/webhooks/git/…', 'trigger: merge → main', 'template: latest configuration', 'quality-gate: 85'].map((l, i) => (
                    <div key={l} className="demo-yline" style={{ animationDelay: (i * 0.5) + 's' }}>{l}</div>
                  ))}
                </div>
                <div className="demo-loop">
                  <span className="mono">merge</span>
                  <span className="demo-looparrow">→</span>
                  <span className="demo-loopbox">regenerate + judge</span>
                  <span className="demo-looparrow">→</span>
                  <span className="check demo-loopcheck">92 · gate ✓</span>
                </div>
              </div>
              <p className="helper mt5 demo-late">Every run recorded: trigger, commit, score, gate result — anything under 85 is held for review, never auto-published.</p>
            </div>
          )}
        </div>
      </div>
      <div className="demo-bar">
        <button className="demo-ctl" onClick={() => (playing ? pause() : play())} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <button className="demo-ctl" onClick={() => { pause(); setScene(0); setStarted(false); }} aria-label="Stop">■</button>
        <button className="demo-ctl demo-ctl--wide" onClick={toggleSound}>{sound ? 'Sound on' : 'Muted'}</button>
        <div className="demo-track">
          {DEMO_STEPS.map((s, i) => (
            <button key={s} className="demo-seg" onClick={() => jump(i)} aria-label={s}>
              {i === scene && started
                ? <span className="demo-segfill" style={{ animationDuration: Math.round(DEMO_DUR[i] * 1.4) + 'ms', animationPlayState: playing ? 'running' : 'paused' }} />
                : i < scene ? <span className="demo-segdone" /> : null}
            </button>
          ))}
        </div>
        <span className="helper">{'0' + (scene + 1)} / {'0' + DEMO_STEPS.length} · {DEMO_STEPS[scene]}</span>
      </div>
    </div>
  );
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
      <rect x="24" y="40" width="150" height="180" fill="#262626" />
      <rect className="shim" x="40" y="60" width="60" height="6" fill="#3ddbd9" />
      <rect x="40" y="76" width="100" height="6" fill="#525252" />
      <rect x="52" y="92" width="88" height="6" fill="#525252" />
      <rect className="shim sd2" x="52" y="108" width="64" height="6" fill="#be95ff" />
      <rect x="40" y="124" width="90" height="6" fill="#525252" />
      <rect className="shim sd3" x="40" y="152" width="72" height="6" fill="#3ddbd9" />
      <rect x="52" y="168" width="96" height="6" fill="#525252" />
      <rect x="40" y="184" width="80" height="6" fill="#525252" />
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
      <rect x="24" y="28" width="352" height="204" fill="#161616" />
      <text x="48" y="60" fill="#78a9ff" fontFamily="IBM Plex Mono, monospace" fontSize="11" letterSpacing="2">RANKING OUTLOOK</text>
      <text x="48" y="80" fill="#8d8d8d" fontFamily="IBM Plex Sans, sans-serif" fontSize="10">chance to be retrieved &amp; cited · recomputed on every fix</text>
      {rows.map(([n, p, c], i) => (
        <g key={n}>
          <text x="48" y={116 + i * 38} fill="#f4f4f4" fontFamily="IBM Plex Sans, sans-serif" fontSize="13">{n}</text>
          <rect x="130" y={106 + i * 38} width="180" height="8" fill="#393939" />
          <rect className="hv-line" style={{ animationDelay: (0.4 + i * 0.35) + 's' }}
            x="130" y={106 + i * 38} width={180 * p / 100} height="8" fill={c} />
          <text x="322" y={116 + i * 38} fill="#f4f4f4" fontFamily="IBM Plex Mono, monospace" fontSize="14">{p}%</text>
        </g>
      ))}
      <rect x="48" y="196" width="150" height="22" fill="#262626" />
      <text x="58" y="211" fill="#42be65" fontFamily="IBM Plex Mono, monospace" fontSize="10">▲ +46 pts after fixes</text>
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

/* ---------- AI judge demo with voiceover ---------- */
const JUDGE_SCENES = [
  { label: 'Intro', vo: 'This is the heart of DocGen: an AI judge that scores every document across six weighted dimensions — then predicts where it will rank. Here is one verdict, from start to finish.' },
  { label: 'Submit', vo: 'Every document DocGen writes is first submitted to an AI judge.' },
  { label: 'Rubric', vo: 'Six dimensions, each with a declared weight — style, consistency, completeness, readability, LLM readiness, and link integrity. No black box.' },
  { label: 'Fixes', vo: 'Where it finds a gap, it offers a fix — with the gain declared before you click. Apply them one by one, or fix all remaining at once.' },
  { label: 'Ranking', vo: 'And then, the number that matters commercially: a ninety-four percent chance ChatGPT cites this page. Ninety-seven for Claude. Eighty-four for Gemini.' },
  { label: 'Verdict', vo: 'The verdict: publish-ready. Cleared for export — for people, for machines, and for every AI platform in between.' }
];
const JUDGE_DUR = [7000, 9000, 11500, 10500, 10500, 9000];

function JudgeScore() {
  const [v, setV] = useState(70);
  useEffect(() => {
    let raf;
    const d = setTimeout(() => {
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / 3800);
        setV(Math.round(70 + 22 * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, 2200);
    return () => { clearTimeout(d); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return <>{v}/100</>;
}

function AIJudgeDemo() {
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [sound, setSound] = useState(true);
  const [runId, setRunId] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    if (!playing) return;
    let alive = true;
    let advanced = false;
    let speechDone = !sound;
    let minDone = false;
    const tryAdvance = () => {
      if (!alive || advanced || !speechDone || !minDone) return;
      advanced = true;
      setTimeout(() => { if (alive) setScene((s) => (s + 1) % JUDGE_SCENES.length); }, 900);
    };
    const tMin = setTimeout(() => { minDone = true; tryAdvance(); }, JUDGE_DUR[scene]);
    if (sound) narrate(JUDGE_SCENES[scene].vo, () => { speechDone = true; tryAdvance(); });
    const tGuard = setTimeout(() => { speechDone = true; minDone = true; tryAdvance(); }, JUDGE_DUR[scene] + 20000);
    return () => { alive = false; clearTimeout(tMin); clearTimeout(tGuard); };
  }, [scene, playing, sound, runId]);

  useEffect(() => () => { stopAllAudio(); }, []);

  const play = () => {
    setStarted(true);
    setPlaying(true);
    if (sound) musicStart();
    setRunId((n) => n + 1);
  };
  const pause = () => {
    setPlaying(false);
    stopAllAudio();
  };
  const jump = (i) => {
    setStarted(true);
    setPlaying(true);
    if (sound) musicStart();
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    setScene(i);
    setRunId((n) => n + 1);
  };
  const toggleSound = () => {
    setSound((v) => {
      const nv = !v;
      if (!nv) { stopAllAudio(); }
      else if (playing) { musicStart(); setRunId((n) => n + 1); }
      return nv;
    });
  };

  const CRITERIA = [
    ['Style & editorial · weight 15%', 'ok'], ['Consistency · weight 13%', 'miss'],
    ['Completeness · weight 15%', 'miss'], ['Readability · weight 15%', 'ok'],
    ['LLM readiness · weight 27%', 'miss'], ['Link integrity · weight 15%', 'ok']
  ];

  return (
    <div className="jd-window" ref={ref}>
      {!started && (
        <button className="vid-poster" onClick={play} aria-label="Play demo with sound">
          <span className="vid-playbtn">▶</span>
          <span className="vid-postertxt">Play demo · sound on</span>
        </button>
      )}
      <div className="jd-head">
        <span className="jd-badge">AI JUDGE</span>
        <span className="helper">rubric: enterprise documentation guidelines · gate ≥ 85</span>
        <span className="spacer" style={{ flex: 1 }} />
      </div>
      <div className={'jd-stage' + (scene === 0 ? ' jd-stage--slate' : '')} key={scene + '-' + runId}>
        {scene === 0 && (
          <TitleSlate kicker="THE AI JUDGE" title="Inside an AI quality verdict"
            sub="Watch a generated document be scored across six weighted dimensions, repaired with one-click fixes, and ranked against ChatGPT, Claude, and Gemini — exactly as it runs in the product." />
        )}
        {scene === 1 && (
          <div className="jd-scene0">
            <div className="jd-doc">
              <p className="label01 t2">API-REFERENCE.DITA</p>
              <div className="jd-line w90" /><div className="jd-line" /><div className="jd-line w60" /><div className="jd-line w80" />
            </div>
            <span className="demo-looparrow" style={{ fontSize: 24 }}>→</span>
            <div className="jd-judgebox"><span>LLM</span><span>JUDGE</span></div>
          </div>
        )}
        {scene === 2 && (
          <div>
            {CRITERIA.map((c, i) => (
              <div key={c[0]} className="jd-crit" style={{ animationDelay: (i * 1.8) + 's' }}>
                <span>{c[0]}</span>
                <span className={'jd-mark ' + c[1]} style={{ animationDelay: (i * 1.8 + 1.1) + 's' }}>
                  {c[1] === 'ok' ? '✓ pass' : '! fix suggested'}
                </span>
              </div>
            ))}
          </div>
        )}
        {scene === 3 && (
          <div className="jd-scene2">
            <div className="jd-scorebig">
              <span className="label01 t2">OVERALL SCORE</span>
              <span className="mono"><JudgeScore /></span>
              <span className="helper">potential 92 shown on the gauge</span>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              {['Short description added · +4 overall', 'Title rewritten for search · +4 overall', 'Duplicate content removed · +2 overall'].map((f, i) => (
                <div key={f} className="jd-fix" style={{ animationDelay: (1.6 + i * 1.6) + 's' }}>✓ {f}</div>
              ))}
              <div className="jd-fix" style={{ animationDelay: '6.4s', color: 'var(--button-primary)' }}>▸ Fix all remaining · +22 pts</div>
            </div>
          </div>
        )}
        {scene === 4 && (
          <div>
            <p className="h01 mb5">Ranking outlook across AI models</p>
            <RankPanel />
          </div>
        )}
        {scene === 5 && (
          <div className="jd-scene3">
            <span className="jd-verdict">Publish-ready</span>
            <p className="body01 mt3 t2">Quality gate passed at 92 / 100 — cleared for export, cited across ChatGPT, Claude, and Gemini estimates. Below the gate, nothing publishes itself.</p>
          </div>
        )}
      </div>
      <div className="demo-bar jd-bar">
        <button className="demo-ctl" onClick={() => (playing ? pause() : play())} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <button className="demo-ctl" onClick={() => { pause(); setScene(0); setStarted(false); }} aria-label="Stop">■</button>
        <button className="demo-ctl demo-ctl--wide" onClick={toggleSound}>{sound ? 'Sound on' : 'Muted'}</button>
        <div className="demo-track">
          {JUDGE_SCENES.map((s, i) => (
            <button key={s.label} className="demo-seg" onClick={() => jump(i)} aria-label={s.label}>
              {i === scene && started
                ? <span className="demo-segfill" style={{ animationDuration: Math.round(JUDGE_DUR[i] * 1.4) + 'ms', animationPlayState: playing ? 'running' : 'paused' }} />
                : i < scene ? <span className="demo-segdone" /> : null}
            </button>
          ))}
        </div>
        <span className="helper">{JUDGE_SCENES[scene].label}</span>
      </div>
    </div>
  );
}

/* ---------- Page data ---------- */

const FEATURES = [
  {
    eyebrow: 'CHAPTER 01 · CONNECT', title: 'It starts where your truth already lives',
    body: 'One authorization — the same grant that signs you in. DocGen reads your repository the way your best writer would: structure, comments, commit history, API annotations. Read-only, never stored, nothing to configure.',
    illu: <IlluSource />
  },
  {
    eyebrow: 'CHAPTER 02 · GENERATE', title: 'Every commit becomes a draft',
    body: 'Not a template with blanks — a real document, drafted from what the code actually says and rebuilt when it changes. Eleven document types, each held to an open standard — Diátaxis, OpenAPI 3.1, Keep a Changelog — in DITA, PDF, Word, HTML, or Markdown.',
    illu: <IlluGenerate />
  },
  {
    eyebrow: 'CHAPTER 03 · VERIFY', title: 'Then comes the cross-examination',
    body: 'Before anything ships, an AI judge reads every section the way a machine will. Does the title match real queries? Does each passage stand alone? Is there an example where a reader expects one? Every finding arrives with a one-click fix — and a projected score gain.',
    illu: <IlluVerify />
  },
  {
    eyebrow: 'CHAPTER 04 · PREDICT', title: 'Know where you will rank — before you publish',
    body: 'This is the part nobody else shows you. DocGen models how ChatGPT, Claude, and Google Gemini each weigh your content — metadata, links, readability, completeness — and puts a number on your chance of being retrieved and cited. Apply the fixes and watch the number climb.',
    illu: <IlluRank />
  },
  {
    eyebrow: 'CHAPTER 05 · AUTOMATE', title: 'And then you never do this again',
    body: 'Build a pipeline once in the six-step wizard: repository, branch, triggers, documents, AI thresholds, publishing. Every merge then regenerates the documentation, the judge re-scores it, the ranking updates, and the gate blocks anything below your bar. The release and its documentation ship together — and keep ranking.',
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

export default function Landing() {
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
          <p className="lead mt5" style={{ maxWidth: 680 }}>DocGen ends that story. Here is the new one, in five chapters.</p>
        </Reveal>
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

      {/* Chapters 1–2 */}
      <div className="page featlist" style={{ paddingTop: 8, paddingBottom: 0 }}>
        {chapter(0)}
        {chapter(1)}
      </div>

      {/* Demo: chapters 1–2 in motion */}
      <div className="page" style={{ paddingTop: 24, paddingBottom: 32 }}>
        <Reveal>
          <p className="eyebrow eyebrow--blue mb3">SEE IT HAPPEN</p>
          <h2 className="feathead">Chapters one and two, in motion</h2>
          <p className="lead t2 mt3" style={{ maxWidth: 640 }}>
            A repository goes in. A verified API reference comes out. This is the actual flow, replayed —
            press play, or click any step to skip ahead.
          </p>
        </Reveal>
        <Reveal delay={120}><div className="vidwrap"><ProductDemo /></div></Reveal>
      </div>

      {/* Chapter 3 */}
      <div className="page featlist" style={{ paddingTop: 0, paddingBottom: 0 }}>
        {chapter(2)}
      </div>

      {/* Judge demo: the verdict, live */}
      <div className="page" style={{ paddingTop: 24, paddingBottom: 32 }}>
        <Reveal>
          <p className="eyebrow eyebrow--blue mb3">THE VERDICT, LIVE</p>
          <h2 className="feathead">Sit in on an AI judgment</h2>
          <p className="lead t2 mt3" style={{ maxWidth: 640 }}>
            Chapter three, playing out in real time — rubric, findings, fixes, verdict. Turn on the
            voiceover and let the judge narrate its own ruling.
          </p>
        </Reveal>
        <Reveal delay={120}><div className="vidwrap"><AIJudgeDemo /></div></Reveal>
      </div>

      {/* Chapter 4: ranking intelligence — THE MOAT */}
      <div className="page featlist" style={{ paddingTop: 0, paddingBottom: 0 }}>
        {chapter(3)}
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
          <h2 className="feathead">Every source, every format</h2>
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

      {/* Final CTA */}
      <section className="ctaband">
        <div style={{ maxWidth: 1056, margin: '0 auto', padding: '0 24px' }}>
          <Reveal>
            <h2 className="h04" style={{ color: '#fff', maxWidth: 620 }}>The next time someone asks an AI about your product, make sure your documentation is the answer.</h2>
            <div className="row mt6">
              <button className="btn btn--primary" onClick={() => nav('/signup')}>Start free<span className="ico">→</span></button>
              <button className="btn btn--ghostdark" onClick={() => nav('/docs')}>Read the docs</button>
            </div>
          </Reveal>
        </div>
      </section>
      {/* Footer */}
      <footer className="sitefoot">
        <div className="sitefoot-inner">
          <div className="row" style={{ gap: 8 }}>
            <LogoMark size={18} />
            <span className="helper">© {new Date().getFullYear()} DocGen · AI documentation intelligence</span>
          </div>
          <nav className="sitefoot-links">
            <a onClick={() => nav('/docs')}>Docs</a>
            <a onClick={() => nav('/pricing')}>Pricing</a>
            <a onClick={() => nav('/legal/privacy')}>Privacy</a>
            <a onClick={() => nav('/legal/terms')}>Terms</a>
            <a onClick={() => nav('/legal/security')}>Security</a>
          </nav>
        </div>
      </footer>
      <div style={{ height: 80 }} />

      <NavBar next="/signup" nextLabel="Start free" note="No credit card required" />
    </>
  );
}
